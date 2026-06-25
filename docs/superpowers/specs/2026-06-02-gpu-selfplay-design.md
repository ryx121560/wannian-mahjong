# 万年麻将 GPU 加速自弈 — 设计文档

**日期**：2026-06-02  
**状态**：待审阅  

---

## 1. 概述

### 1.1 目标

用 WebGPU 将万年麻将自弈的 MCTS 搜索、RL 神经网络训练和对手建模全部迁移到 GPU，同时提升自弈吞吐量和单局搜索深度。

### 1.2 当前瓶颈

| 组件 | 当前实现 | 瓶颈 |
|---|---|---|
| MCTS rollout | CPU JS `for` 循环逐条模拟 | 每条涉及向听计算、对手建模、危险评估，O(候选×轮次) |
| MLP 推理/训练 | 纯 JS 三层嵌套循环 `matMul` | 74→128→128→34，单样本 ~1ms，64 batch ~100ms |
| 对手建模 | 启发式概率公式 | 粗糙，无精确贝叶斯推断 |

### 1.3 方案

全量方案（三个模块全 GPU 化），GPU 占用目标 50-70%：

- WebGPU Compute Shaders 替代 JS 循环
- CPU 实现保留作为 WebGPU 不可用时的 fallback
- 不引入后端服务，纯浏览器端
- 4 局自弈并行推进，GPU 持续满载

---

## 2. 架构

```
wannian-mahjong.html
├── ai/
│   ├── gpu.js              ★ 新增：GPU 初始化、buffer 管理、shader 编译
│   ├── gpu_mlp.js          ★ 新增：MLP 的 GPU 前向/反向/Adam
│   ├── gpu_mcts.js         ★ 新增：MCTS batch rollout kernel
│   ├── gpu_opponent.js     ★ 新增：贝叶斯对手分布 + 听牌采样
│   ├── trainer.js          △ 修改：MLP → GPUMlp，batch 改为 512 累积
│   ├── mcts.js             △ 修改：rollout → gpuRollout，保留 fallback
│   └── opponent_model.js   △ 修改：概率函数 → GPU 版本
```

**GPU 能力探测**：`gpu.js` 在加载时检测 `navigator.gpu`。不可用时所有 `gpu_*.js` 模块不加载，回退到现有 CPU 代码。

---

## 3. 数据流

```
自弈管理器维护 4 局并行游戏实例 (Game[0..3])

帧循环（requestAnimationFrame 或 while(true) 驱动）：
  对 4 局游戏同时执行：
    → gpu_opponent.js: 更新 4×4=16 个对手的分布表 + 听牌采样      (<2ms)
    → gpu_mcts.js: 4×14 候选 × 5000 轮 = 28 万条 rollout 一次 dispatch  (15-25ms)
    → gpu_mlp.js: 4 局 × 4 玩家 forward 推理，batch=16                (<0.5ms)
  → 4 局同时推进到下一状态

某局结束：
  → gpu_mlp.js: backward + Adam 更新（1024 条经验累积触发）             (<10ms)
  → serialize 权重写回 CPU → fetch POST 到 /api/rl/save_rl
  → 该局销毁，新建替换局，保持 4 局持续跑

GPU 在这 ~25ms 帧窗口内持续满载，利用率 50-70%。
```

---

## 4. 模块设计

### 4.1 gpu.js — GPU 基础设施

**职责**：WebGPU 初始化、buffer 创建、shader 编译、通用工具。

```js
class GPUContext {
  constructor()
    // 获取 adapter（偏好高性能）、device
    // 检查 WebGPU 可用性

  createBuffer(data, usage, label)
    // usage: STORAGE | UNIFORM | MAP_READ | COPY_DST | COPY_SRC

  createComputePipeline(wgslCode, entryPoint)
    // 编译 WGSL shader

  dispatch(pipeline, bindGroups, workgroupCounts)
    // 设置 bind groups → dispatch → 返回

  readBuffer(buffer, size)
    // 异步读取 GPU buffer 到 CPU（用于 serialize 权重）

  destroy()
}
```

### 4.2 gpu_mlp.js — GPU 加速神经网络

**网络结构**：74 → 1024 → 1024 → 1024 → 1024 → 34（约 2.1M 参数，4 层隐藏）

**类接口**（与 `MLP` 兼容）：

```js
class GPUMlp {
  constructor(layers)
    // 在 GPU 上分配权重/偏置 buffers
    // 初始化 Adam 动量 buffers (mW, vW, mb, vb)

  forward(x)   // → { output, acts }
    // 三次 matmul dispatch: input×W1, z1×W2, z2×W3
    // ReLU 融合进 matmul kernel（output 写入前做 max(0, x)）
    // 保留 acts（z1, a1, z2, a2）在 GPU buffer 中供 backward 使用

  backward(input, target, lr)
    // 8 个 kernel: output_grad → δ3 → dW3/db3 → δ2 → dW2/db2 → δ1 → dW1/db1 → Adam update
    // 纯 GPU 端运算，无 CPU→GPU 中途传输

  serialize()   // → JSON string
    // mapRead 所有权重 buffer 到 CPU → JSON.stringify
    // 格式与 MLP.serialize() 兼容，MLP.deserialize() 可直接还原

  static deserialize(json)
    // JSON.parse → 创建 GPUMlp → writeBuffer 权重到 GPU
}
```

**batch 训练优化**：

- `trainer.js` 改为累积 1024 条经验后一次性调用 `backward`
- 1024 个样本的前向结果（acts）暂存 GPU buffer，反向时批处理
- kernel launch 次数从 N 次降到 1×8

### 4.3 gpu_mcts.js — MCTS Batch Rollout

**Kernel 输入**（per-instance struct，总 instances = 4局 × 14候选 × 5000轮 = 280,000）：

```wgsl
struct RolloutInput {
  hand_bitmap: array<f32, 34>,    // 手牌 one-hot
  discard_idx: u32,                // 本轮弃哪张牌（hand 中的索引）
  global_state: array<f32, 128>,   // 牌池剩余、场况编码
}
```

**Kernel 内部逻辑**（WGSL compute shader，每个 workgroup 一条独立 rollout）：

```
1. 从 hand_bitmap 中移除 discard_idx
2. 用 global_invocation_id 初始化 Xorshift32 RNG 种子
3. 循环 depth=0..maxDepth (通常 10-15):
   a. RNG 抽一张牌（Xorshift → 模牌池大小 → 索引查表）
   b. 查 ShantenLUT 获取当前向听数
   c. 遍历手牌找最优弃牌（逐张查 ShantenLUT + 简单启发式）
   d. 对手放铳检查：从 opponent_distribution buffer 查表
   e. 如果向听数降到 0，跳出并给高分
4. 累计总分写入 output buffer（atomicAdd 到对应候选牌的 slot）
```

**GPU 内存布局**：

| Buffer | 类型 | 大小 (4局×14候选×5000轮) |
|---|---|---|
| input_instances | Storage RO | ~45 MB |
| shanten_lut | Storage RO | ~2 MB |
| rng_states | Storage RW | ~4.5 MB |
| opponent_dists | Storage RO | ~8 KB |
| output_scores | Storage RW | ~1 KB |

**向听查表（ShantenLUT）**：预计算脚本生成 14 张手牌的所有合法组合 → 向听数映射。约 50 万条记录，每条 `{hand_hash: u32, shanten: u8}`，~2 MB。GPU kernel 通过哈希查表。

**JS 接口**：

```js
class GPUMctsRollout {
  constructor(gpuCtx)
  async run(hand, candidates, GS, options)
    // { numRollouts: 2000, maxDepth: 12 }
    // → [{candidateKey, avgScore}, ...]
}
```

### 4.4 gpu_opponent.js — 贝叶斯对手建模

**数据结构**：每个对手维护一个 34 维的 float 向量 `P(持有牌_i)`。

**更新 kernel**（每次对手有动作时触发）：

| 事件 | GPU 操作 |
|---|---|
| 对手弃牌 X | 原子置零 P(X)，沿面子逻辑衰减相关搭子 P |
| 对手吃 X,Y 出 Z | 锁定 X,Y 为确持，P(Z) 置零，搭子概率重算 |
| 对手碰 X | 锁定三张 X 为确持 |
| 对手杠 X | 锁定四张 X 为确持 |
| 对手摸牌 | 从剩余分布采样更新 |
| 对手立直 | 标记听牌状态位 |

**听牌采样 kernel**：每个对手从分布中采样 10000 组手牌，检查听牌状态和等待张。统计得到 `P(听牌)` 和待牌分布。

**JS 接口**：

```js
class GPUOpponentModel {
  constructor(gpuCtx)
  update(playerIdx, event, tile)
    // 更新指定对手的分布表

  sampleTenpai(playerIdx)
    // → { tenpaiProb: f32, waits: Map<tileKey, prob> }

  getDistribution(playerIdx)
    // → 34 维概率向量（用于 MCTS kernel 引用）
}
```

---

## 5. 修改清单

### 5.1 新增文件

| 文件 | 预估行数 | 说明 |
|---|---|---|
| `ai/gpu.js` | ~120 | WebGPU 上下文、buffer 管理、shader 编译 |
| `ai/gpu_mlp.js` | ~250 | GPUMlp 类，forward/backward/Adam shaders |
| `ai/gpu_mcts.js` | ~350 | MCTS rollout kernel + JS 封装 |
| `ai/gpu_opponent.js` | ~200 | 对手分布更新 + 听牌采样 kernel |
| `scripts/gen_shanten_lut.py` | ~80 | 离线生成向听查表 JSON |

### 5.2 修改文件

| 文件 | 改动 | 影响范围 |
|---|---|---|
| `ai/trainer.js` | MLP→GPUMlp，batch 512 累积 | 替换纯 JS matmul |
| `ai/mcts.js` | rollout→gpuRollout | 添加 GPU 路径，保留 fallback |
| `ai/opponent_model.js` | 函数改为调用 GPU 版本 | 接口不变，实现替换 |
| `wannian-mahjong.html` | 加载 gpu_*.js | 新增 `<script>` 标签 |

### 5.3 不修改的文件

| 文件 | 原因 |
|---|---|
| `ai/ai_engine.js` | 接口不变，底层加速对其透明 |
| `ai/constants.js` | 数据层不变 |
| `ai/eval.js` | 手牌评估逻辑不变（GPU 仅调用查表结果） |
| `ai/defense_engine.js` | 防御决策逻辑不变 |
| `constants.js` | 牌定义不变 |

---

## 6. 兼容性与降级

### 6.1 WebGPU 探测

```js
// gpu.js
export function isWebGPUAvailable() {
  return !!navigator.gpu;
}
```

### 6.2 降级策略

| 场景 | 行为 |
|---|---|
| 浏览器不支持 WebGPU | `gpu*.js` 不加载，全部走 CPU 原路径 |
| GPU 内存不足 | 降级参数：候选数 8→3，rollout 轮 2000→500 |
| Shader 编译失败 | 该模块降级到 CPU 版本，其他模块继续用 GPU |

### 6.3 浏览器要求

- Chrome 113+ / Edge 113+
- `chrome://gpu` → WebGPU: "Hardware accelerated"
- 需要独立显卡或支持 WebGPU 的集显（Intel Gen12+ / AMD RDNA2+）

---

## 7. 测试策略

### 7.1 单元测试

| 测试项 | 方法 |
|---|---|
| GPUMlp forward 与 CPU MLP forward 输出一致 | 相同输入，比较 34 维输出（误差 < 1e-5） |
| GPU rollout 与 CPU rollout 结果相关性 | 同一局面各跑 2000 轮，Pearson r > 0.85 |
| 对手分布更新合理性 | 手动构造事件序列，检查分布变化方向正确 |

### 7.2 集成测试

| 测试项 | 通过标准 |
|---|---|
| 500 局自弈无报错 | 所有局正常完成，GPU 无 OOM |
| GPU 占用 30-40% | `chrome://gpu` 或任务管理器可见 |
| 自弈局速不低于 CPU 1/3 | 深搜索下局速可接受 |
| RL loss 正常收敛 | 500 局后 loss 下降趋势明显 |

### 7.3 对比验证

跑 500 局 GPU 自弈后，与 GPU 加速前的 AI 对弈 100 局，胜率目标 > 60%。

---

## 8. 实现阶段

| 阶段 | 内容 | 预估工时 | 确认点 |
|---|---|---|---|
| 零 | WebGPU 环境探测页 | 0.5 天 | WebGPU 可用 |
| 一 | gpu.js + gpu_mlp.js + trainer 修改 | 1-2 天 | MLP 训练正常，loss 收敛 |
| 二 | gpu_mcts.js + ShantenLUT 生成 + mcts 修改 | 2-3 天 | 决策结果与 CPU 一致且 < 10ms |
| 三 | gpu_opponent.js + opponent_model 修改 | 1-2 天 | 放铳率下降，AI 行为更智能 |
| 总计 | | 4-7 天 | |

每个阶段独立可测试、独立有价值，不依赖后续阶段。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| WGSL 调试困难 | 开发效率低 | 先写 CPU 验证逻辑，再逐 kernel 迁移；WebGPU 错误消息逐行对照 |
| ShantenLUT 不完整 | rollouts 偏差 | Python 生成脚本覆盖所有 14 牌合法组合，单元测试 100% 覆盖 |
| 对手分布漂移 | 模型不准确 | 每局结束重置分布，避免累积误差 |
| GPU OOM | 自弈崩溃 | 动态降级：候选数/轮次自适应缩减 |
