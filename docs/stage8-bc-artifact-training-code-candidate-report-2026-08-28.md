# Stage8 BC 样本产物与训练代码候选报告（未发布）

- 日期：2026-08-28
- 状态：candidate（未提交、未推送、未部署）
- 候选：`codex-stage8-bc-artifact-training-code-20260828`
- 基线：`origin/main=ed8c0b7698931cf8b12b271165d9880e078bea48`
- 正式真源：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`
- 真源 SHA-256：`26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`

## 候选目标与边界

本候选只提供默认拒绝、可审计的纯代码能力：BC 样本外置写入协议、Python dataset、轻量双头模型、确定性训练、最后完整 checkpoint、动态合法动作维度 ONNX 导出、Python↔Node 身份与数值一致性协议。它不授权也不执行正式样本生成、训练、模型/ONNX/checkpoint 生成、Smoke、自弈、部署或服务。

本轮没有安装 Python、PyTorch、ONNX 或其他依赖；Python 回归只使用宿主已有解释器和标准库，不导入 torch/onnx。测试写入仅发生在 OS 临时目录并在退出前清理，不创建 E 盘目录或正式产物。

## 精确 17 文件范围

1. `package.json`
2. `src/game/stage8/offline-bc-artifact-control.ts`
3. `src/game/stage8/offline-bc-sample-writer.ts`
4. `src/game/stage8/offline-bc-model-lifecycle-protocol.ts`
5. `src/game/stage8/python/stage8_bc/__init__.py`
6. `src/game/stage8/python/stage8_bc/contracts.py`
7. `src/game/stage8/python/stage8_bc/dataset.py`
8. `src/game/stage8/python/stage8_bc/model.py`
9. `src/game/stage8/python/stage8_bc/training.py`
10. `src/game/stage8/python/stage8_bc/export_onnx.py`
11. `scripts/stage8-bc-artifact-control-regression.mjs`
12. `scripts/stage8-bc-sample-writer-regression.mjs`
13. `scripts/stage8-bc-model-lifecycle-regression.mjs`
14. `scripts/stage8-bc-python-code-regression.py`
15. `scripts/stage8-bc-python-code-regression.mjs`
16. `scripts/stage8-bc-artifact-training-preflight-gate.mjs`
17. `docs/stage8-bc-artifact-training-code-candidate-report-2026-08-28.md`

## 真源映射与实现

| PRD/产品要求 | 实现与证据 |
| --- | --- |
| 外置产物、默认拒绝、逐段授权 | `offline-bc-artifact-control.ts` 复用已发布 `preflightStage8ArtifactRoot`；样本、训练、导出、校验拆分授权，缺失、相对、项目/worktree 内路径均拒绝 |
| 样本真实身份与终局奖励 | `offline-bc-sample-writer.ts` 逐条复验已发布 BC 样本协议，要求同 episode 唯一且最后一步为真实四家有限零和终局；中间步骤只绑定该终局引用 |
| 原子分片与失败隔离 | 分片采用 exclusive `.partial`、读回 SHA-256、原子 rename；失败清理 partial，无法清理时使用隔离身份失败关闭；不创建目录 |
| Python/Node 统一数据契约 | 数值张量以 little-endian Base64 保存；样本、可见状态、完整 canonical 合法集、教师分布、选择动作、终局奖励及 tensor record 均哈希绑定 |
| 轻量双头模型 | 5577 维可见状态经 256/128 编码，181 维 canonical 动作经 64 维编码；动态 N 动作策略头和四座零和 value 头；约 147 万 float32 参数，模型与 ONNX 各小于 10 MiB |
| 训练与熔断 | 完整教师分布交叉熵 + 真实终局四家 delta SmoothL1；固定 seed、确定性算法、315 步硬上限；NaN/Inf/梯度异常/无完整步骤均拒绝 |
| checkpoint 与恢复 | 仅成功序列化后 exclusive partial + readback + atomic rename；恢复必须为同运行、同数据、同模型/优化器身份的最后完整 checkpoint，并以 `weights_only=True` 声明加载 |
| ONNX 导出 | 只接受已授权 artifact root 内的已验证 checkpoint；内存导出、动态合法动作维度、`onnx.checker` 后一次性原子提交 model/ONNX/manifest；禁止 ZIP/下载/路径二次读取 |
| Python↔Node 一致性 | 五项定义哈希和 canonical JSON 跨语言一致；parity evidence 绑定同一输入、完整合法集、模型/manifest/ONNX 和有限数值容差 |

## RED / GREEN

- RED：候选基线没有 BC artifact write 控制、原子 shard writer、Python dataset/模型/训练/export 代码或跨语言生命周期协议。
- RED：初次 TypeScript 检查发现字面量扩宽、泛型失败返回、tuple 推断与 gzip 选项契约问题；已最小修正。
- RED：普通沙箱禁止 Node 启动 Python 子进程，回归按设计零安装失败关闭；在允许子进程的同一隔离候选中使用宿主 Python 标准库执行通过。
- RED：首次 Node→Python 分片夹具使用了未绑定真实 sample schema 的占位身份，Python dataset 正确拒绝；改为已发布 schema 真哈希后通过。
- RED：静态审计发现 rename 后最终分片读回失败的清理路径和 Python checkpoint/shard 内容身份复核不足；已补成最终文件删除/隔离、样本内容重算、checkpoint/model/optimizer 完整身份与外置根边界验证。
- GREEN：`test:stage8-bc-artifact-control`、`test:stage8-bc-sample-writer`、`test:stage8-bc-model-lifecycle` 均通过。
- GREEN：`test:stage8-bc-python-code` 通过；五项跨语言定义哈希、canonical hash、Node 写入的 2 条 shard 记录实际 Python 读取、内容篡改拒绝、artifact root 文件边界、ASCII ID、checkpoint 身份、CPU/缺依赖导入前拒绝均受控验证；Python torch/onnx 导入为 0。
- GREEN：既有 BC teacher/sample、artifact-root、training-control、sample/replay/model、Node CPU ONNX adapter 临时夹具、trajectory、Stage8 action-space/kong-execution、offline-selfplay preflight 均通过；正式 Smoke 仍为 0。

## 明确未覆盖与后续授权节点

- 当前不存在获准使用的正式 BC shard、PyTorch/CUDA 训练环境、冻结 checkpoint、真实 model/ONNX/manifest 或外置运行目录；不得运行训练或导出。
- Python 模型前向、CUDA 训练、真实 checkpoint 恢复、`torch.onnx` 导出、Python↔Node 真实 ONNX 数值 parity 尚未实际运行，必须在依赖安装、外置根、正式数据、运行身份和逐段授权全部明确后单独执行。
- 本候选不等同于 BC 样本生成授权、训练授权、Smoke/Pilot/Arena/Champion/runtime 或发布授权。

## 最终验收（已冻结）

- `npm run test:stage8-bc-artifact-training-preflight`：PASS；17 文件、3 个 Node 协议回归、1 个宿主 Python 标准库回归；`pythonSourceBundleSha256=7f4cee0c79654364cbcb31a17c5f2fd1b50879b4cd4a44541e1b4e02c3166af4`。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS，无 `tsconfig.tsbuildinfo`。
- `npm run build`：PASS，Next 8/8，`BUILD_ID=vA_iM-XygpyfmEKmD0z6R`；构建只使用候选自身 `.next`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS；`rule_engine.js SHA256=A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB`。
- 构建后冻结生成包身份：`strong_rule_ai.js=35C1BCECE0BB579687BF91056BD541DCC283A79879BD580AA1044AD729864B01`、`recommendation_engine.js=DDC570B481D53E226E3405A54340A08ECF1B4AC09EF0C74E4DE5618992975FC9`、`mcts_enhancement_engine.js=126EE7A472F5C7CFB8B37A8BCF7E91BE29FA0F46ACBA028C64A3AAFFCD3D58F5`；`public/game` Git 差异为 0。
- `git diff --check`：PASS；`git status --porcelain=v1 -uall` 精确 17 项；候选基线与本地 `origin/main` 均为 `ed8c0b7698931cf8b12b271165d9880e078bea48`。
- 构建浏览器快照、`stage8-bc-*` OS 临时目录、Python `__pycache__`/`.pyc`、`tsconfig.tsbuildinfo` 残留均为 0。
- 零运行声明：正式样本 0、训练 0、模型/ONNX/checkpoint 0、E 盘写入 0、Smoke 0、服务/18768 0、Storage/用户数据 0。
