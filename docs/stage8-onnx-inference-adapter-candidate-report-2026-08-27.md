# Stage8 ONNX CPU 推理适配器候选报告（未发布）

日期：2026-08-27
候选：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-onnx-adapter-20260827`
分支：`codex/stage8-onnx-adapter-20260827`
基线/候选 HEAD/origin-main：`cd0a7d0821ee3a8eb68329c22a3c2b6d1a30c189`
状态：未提交、未推送、未部署；正式 Smoke、训练与服务均未启动。

## 1. 结论

本候选已完成产品授权范围内的真实 Node ONNX CPU 推理适配、版本化张量契约、正式入口不可变字节接入、artifact root 项目树隔离和确定性回归。功能门禁、TypeScript、完整 Next 构建和构建后生成包身份均通过。

本候选仍不是正式 Smoke 或训练授权，也不包含任何真实模型、ONNX、manifest、样本、checkpoint 或外置训练目录。另有一项必须由产品/安全验收明确接受的依赖风险：`npm audit --omit=dev` 报告 `onnxruntime-node@1.27.0 -> adm-zip@0.5.18` 存在高危拒绝服务公告且当前无可用修复；详见第 8 节。

## 2. 真源与边界

- 规则真源：`docs/rules.md`、`src/game/rules`；本候选未修改规则、计分或状态转移。
- Stage8 PRD 真源：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`。
- PRD 文件 SHA-256：`26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`。
- 沿用已发布的默认拒绝控制、运行时预检、canonical MCTS provider、轨迹执行器与样本身份协议。
- 没有读取或复用旧 dirty `stage8-offline-rl` 资产；没有访问浏览器 Storage、用户页面、用户对局或导出。
- 没有创建 E 盘根、子目录或任何训练产物；没有运行正式 Smoke/selfplay/training/replay/model/checkpoint/Pilot/Arena/Champion/runtime；没有启动或操作 18768。

## 3. 精确 15 文件范围

1. `package.json`
2. `package-lock.json`
3. `src/game/stage8/artifact-root-preflight.ts`
4. `src/game/stage8/offline-frozen-model-inference.ts`
5. `src/game/stage8/offline-smoke-runtime-preflight.ts`
6. `src/game/stage8/offline-onnx-tensor-contract.ts`（新增）
7. `src/game/stage8/offline-onnx-inference-adapter.ts`（新增）
8. `scripts/stage8-offline-smoke-runner.mjs`
9. `scripts/stage8-artifact-root-preflight-regression.mjs`
10. `scripts/stage8-frozen-model-inference-regression.mjs`
11. `scripts/stage8-offline-smoke-runtime-preflight-regression.mjs`
12. `scripts/stage8-offline-smoke-runner-regression.mjs`
13. `scripts/stage8-onnx-inference-adapter-regression.mjs`（新增）
14. `scripts/stage8-offline-selfplay-preflight-gate.mjs`
15. `docs/stage8-onnx-inference-adapter-candidate-report-2026-08-27.md`（新增）

没有修改页面、服务 API、生产 AI 策略、游戏规则、牌墙、计分、Storage 协议或 Stage8 训练运行代码。

## 4. 唯一新增生产依赖

- 直接依赖：`onnxruntime-node@1.27.0`，`package.json` 使用精确版本，不使用范围。
- lock 身份：版本 `1.27.0`，integrity `sha512-QEzGwrvNBgv4uPVdnbHsOGG4G6T96mdlcFI8aAKPjMU8wOPpVocPXb6k3QGkaZagVTv2G9Bnnbo6Z3JdXr1fQw==`。
- `npm ls onnxruntime-node --depth=0`：通过，唯一直接 ONNX runtime 为 `1.27.0`。
- 执行 provider 固定为 `cpu`；不接受 DML/GPU 配置；不引入 Python、PyTorch、导出器或其他直接依赖。
- `package-lock.json` 的其他新增条目均为该依赖的传递依赖；没有顺带升级现有 Next/React 版本。

## 5. 张量与推理契约

协议升级：

- frozen inference：`stage8-frozen-model-inference-v2`
- model package：`stage8-model-package-v3`
- input schema：`stage8-visible-canonical-onnx-tensors-v1`
- tensor contract：`stage8-onnx-tensor-contract-v1`

固定张量：

| 名称 | dtype | shape | 含义 |
|---|---|---|---|
| `visible_state` | float32 | `[1,5577]` | 严格 allowlist 的版本化可见状态；公开副露保留类型/来源/槽位，公开弃牌保留座位内顺序 |
| `canonical_actions` | float32 | `[1,N,181]` | 完整 canonical 合法动作，按 canonical key 排序；资源 owner 与有序资源牌显式编码 |
| `legal_action_mask` | float32 | `[1,N]` | 与完整合法集合一一对应，全部为 1 |
| `policy_logits` | float32 | `[1,N]` | 每个完整 canonical 合法动作的原始策略 logit |
| `value_delta` | float32 | `[1,4]` | 四座有限、近零和价值输出 |

可见状态只允许：当前行动者暗手、公开副露/弃牌、四家分数、庄家、业务 turn、phase、当前玩家、最后公开弃牌/弃牌者、墙余量；递归拒绝额外字段，对手暗手和真实墙序没有编码入口。canonical 动作张量绑定动作类型、动作 ID、牌、座位、声明窗口、自己的牌数、抢杠窗口及资源签名身份。

身份：

- tensor contract SHA-256：`7f3748664f1376a309c81a2db14cde79cad500736c26a86be65d15af62ad1557`
- CPU session options SHA-256：`ffdc18964e0d27dcf2c5cf2b92a031fc04d271741ec6acbefa769e7539f6ae36`
- frozen inference contract SHA-256：`70a23f1c657798e91d36a8c8f29bf09a68f32beac6ae274e5f92f3dba3349942`

模型 manifest 必须逐字段绑定 tensor contract、`onnxruntime-node@1.27.0`、`cpu` provider、session options，以及既有规则/动作/mask/特征/可见信息/模型/ONNX/manifest 身份。输入输出名称、dtype、动态合法动作维度和四座价值维度不一致时 session 初始化失败关闭。

## 6. 不可变字节、零写入与 artifact root

- runtime preflight 仍只读取 model/ONNX/manifest 一次，验证 SHA 后返回冻结 Base64 字节快照。
- 正式 CLI 的默认适配器仅接收该次 preflight 的 `onnxBytes`；不接受路径、不二次读取文件，并在创建 session 前再次计算 ONNX SHA 与预检身份比对。
- 每次推理重新计算 visible-state SHA、完整 canonical 合法集 SHA 和规范排序，必须与请求身份精确一致。
- 授权、artifact root、空 run directory、三资产、manifest、source bundle、runtime identity、下游关闭和模型契约全部预检成功后，才允许创建 ONNX session；session 初始化成功后，才允许 `mkdtemp`、临时编译和 writer 构造。
- 任何预检、session 初始化、shape/type、NaN、漏动作、非零和、身份不一致均失败关闭。
- artifact root 通过 linked-worktree `.git` 元数据无 Git 子进程地推导主仓库根；拒绝主仓库、当前/兄弟 worktree 及其全部子树。可选 realpath 检查同时拒绝指向项目树的 junction/symlink，并在解析失败时关闭。

## 7. RED/GREEN 与实跑证据

### RED

1. 基线无 `onnxruntime-node`、无张量契约、无真实 ONNX session adapter；正式 CLI 缺外部注入端口时默认拒绝。
2. 首次真实 CPU 夹具运行在 ORT 参数代理处失败：冻结的 `executionProviders` 数组触发 Proxy invariant 错误。修正为“身份定义保持冻结，传给 runtime 的会话参数使用内容等价的私有副本”，未放宽 CPU-only 身份。
3. 首次 TypeScript 检查发现 output protocolVersion 被扩宽为 `string`；修为精确字面量类型。
4. 首次 CLI root 复验发现 `Array.map(resolvePath)` 将多余参数传给 native realpath，导致安全解析误熔断；改为显式单参数闭包后 GREEN。
5. 普通沙箱完整构建因 Next 子进程 `spawn EPERM` 失败；构建脚本成功恢复冻结生成包。允许子进程的同一隔离候选重跑后 `Next 8/8`、exit 0。

### GREEN

| 命令 | 结果 |
|---|---|
| `npm run test:stage8-onnx-inference-adapter` | PASS；真实 CPU ONNX 推理 1 次，完整动作 logits 与四座零和 value |
| `npm run test:stage8-artifact-root-preflight` | PASS；主仓库、当前/兄弟 worktree、子树、alias、解析失败均覆盖 |
| `npm run test:stage8-frozen-model-inference` | PASS |
| `npm run test:stage8-offline-smoke-runtime-preflight` | PASS；session init 前临时写入 0 |
| `npm run test:stage8-offline-smoke-runner` | PASS；仅 2 局既有内存真源回归，正式 Smoke 0 局 |
| `npm run test:stage8-offline-selfplay-preflight` | PASS；含 ONNX adapter、轨迹、action-space、kong-execution、sample protocol、tsc |
| `npm run test:stage8-offline-round-integrity` | PASS |
| `npm run test:stage8-offline-four-player-batch` | PASS；既有 8 局规则完整性遍历，不是 Smoke/训练 |
| `npm run test:stage8-training-control-protocol` | PASS |
| `npm run test:stage8-v2-action-space` | PASS |
| `npm run test:stage8-v2-kong-execution` | PASS |
| `npx tsc --noEmit --incremental false` | PASS |
| `npm run build` | PASS（允许 Next 子进程的同一隔离树），Next 8/8，BUILD_ID=`p7_INF4hc-FPXwQd7S62p` |
| `node scripts/build-browser-rule-engine.mjs --check` | PASS |
| `node scripts/assert-browser-build-artifacts-clean.mjs` | PASS；三项冻结非规则包内容身份通过 |
| `git diff --check` | PASS |

构建后四项 `public/game` 跟踪生成包均无差异；无 `tsconfig.tsbuildinfo`，无浏览器构建临时快照残留。

## 8. 依赖审计风险

`npm audit --omit=dev --json` 返回 exit 1，共报告 6 个 high 条目。其中本候选新引入的链为：

- `onnxruntime-node@1.27.0` -> `adm-zip@0.5.18`
- 公告：`GHSA-xcpc-8h2w-3j85`，恶意 ZIP 可触发大内存分配/拒绝服务
- npm 当前标记 `fixAvailable=false`

其余 Next/postcss/nanoid/sharp 条目来自既有依赖树，不由本候选新增。当前推理运行时只接收 preflight 已哈希验证的本地不可变 ONNX 字节，不处理外部 ZIP；这降低正式推理时的直接暴露面，但不能消除安装阶段/供应链风险。发布前应由产品明确接受该已知风险，后续监控 ORT 或 `adm-zip` 的可用修复版本；本候选未擅自使用 override、`npm audit fix` 或升级其他框架。

## 9. 未覆盖与后续授权节点

- 没有首个真实冻结候选模型、真实 ONNX、真实 manifest 或模型来源证明；因此不能启动正式 Smoke。
- 内存最小 ONNX fixture 只验证 CPU session、动态 N、三输入/两输出、身份和失败关闭；不证明未来真实网络的算子全集、性能、内存上限或 1000 局稳定性。
- 未验证 Linux/macOS 运行；本轮证据为 Windows x64、Node `v24.14.0`。
- 没有运行正式 1000 局 Smoke，没有行为分布/策略强度/训练收益证据。
- 正式资产创建、外置根准备、模型包冻结、首次 Smoke、训练、Pilot、Arena、Champion、runtime 仍分别需要新的明确授权。

## 10. 零运行/零数据声明

本候选实际正式 Smoke 0 局、训练 0 步、正式 selfplay 0 局；未生成 model/ONNX/manifest/sample/replay/checkpoint；未写 E 盘；未启动服务或改动 18768；未读取 Storage、用户对局、用户导出或旧 dirty Stage8 资产。测试中的 1 次 CPU 推理仅使用脚本内存生成的最小 ONNX fixture，不写入项目树或外置资产根，也不构成正式 Smoke/模型质量证据。
