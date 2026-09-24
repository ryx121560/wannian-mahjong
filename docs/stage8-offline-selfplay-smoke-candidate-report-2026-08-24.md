# Stage8 离线自弈与固定课程 Smoke 前置候选报告（2026-08-24）

## 结论

候选完成了“默认拒绝、纯内存、无产物”的离线决策与固定课程前置能力，可以提交独立技术验收；它**不是正式 1000 局 Smoke 的运行结果，也不是训练授权**。

- 候选：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-offline-selfplay-smoke-20260824`
- 分支：`codex/stage8-offline-selfplay-smoke-20260824`
- 基线：`origin/main=b1fe0344d8d0d44594b52adfede1c1a96227b49e`
- 状态：未提交、未推送、未部署
- 正式 Smoke：执行 0 局
- 训练/自弈进程：未启动
- 训练样本、模型、ONNX、checkpoint、replay：创建 0 项、写入 0 字节

## 真源与边界

- 规则真源：`docs/rules.md` 与 `src/game/rules`；状态推进委托 `transitionRound`、已发布 canonical adapter 和轨迹执行器，没有复制页面规则或付款逻辑。
- Stage8 产品真源：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`，SHA-256 `26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`。
- 授权边界：只验证未来固定课程 Smoke 所需的内存协议。没有调用旧 `selfplay:smoke`，没有运行 1000 局，没有加载 MCTS/模型/ONNX，没有建立输出目录，没有访问页面、Storage、用户导出或用户数据。
- 外置产物路径继续复用已发布 `preflightStage8ArtifactRoot`：必须显式、绝对、已存在且位于项目/worktree 外；验证不创建目录。

## 精确 14 文件

1. `package.json`
2. `src/game/stage8/offline-action-identity.ts`
3. `src/game/stage8/offline-selfplay-control.ts`
4. `src/game/stage8/offline-behavior-distribution.ts`
5. `src/game/stage8/offline-curriculum-kong-zhichan-chain.ts`
6. `src/game/stage8/offline-episode-context.ts`
7. `src/game/stage8/offline-selfplay-engine.ts`
8. `src/game/stage8/sample-replay-model-protocol.ts`
9. `src/game/stage8/offline-trajectory-executor.ts`
10. `scripts/stage8-sample-replay-model-protocol-regression.mjs`
11. `scripts/stage8-offline-selfplay-smoke-regression.mjs`
12. `scripts/stage8-fixed-curriculum-smoke-regression.mjs`
13. `scripts/stage8-offline-selfplay-preflight-gate.mjs`
14. `docs/stage8-offline-selfplay-smoke-candidate-report-2026-08-24.md`

未修改麻将规则、页面、服务、生产 AI/MCTS、计分或训练运行代码；未修改浏览器生成包。

## 实现与 PRD 映射

### 默认拒绝与身份绑定

`offline-selfplay-control.ts` 要求未来调用方同时提供：

- 显式 `granted=true`、固定授权 scope 和可审计 approvalId；
- 合格的外置 `STAGE8_ARTIFACT_ROOT`；
- 规则、动作空间、合法 mask、特征、可见信息、样本协议、轨迹执行器、自弈运行域、原始分布提供者、模型文件、ONNX、模型 manifest、课程、探索和种子计划 SHA-256；
- 固定课程参数与所有下游开关。训练、运行态 selfplay/replay、模型/ONNX/checkpoint、Pilot、Arena、Champion、production runtime 必须全部为 false。

缺失授权、相对/不存在/项目内路径、字段或哈希不一致、计划被篡改均返回纯 `fused/isolation` 决策，不写文件、不启动流程。

### 固定课程

`offline-curriculum-kong-zhichan-chain.ts` 只生成内存计划：

- 总计划槽位 1000；实际执行 0；
- 强行跑 : 直铲 : 连杠 = `2:2:1`，即 `400:400:200`；
- 候选座位 0/1/2/3 各 250；每座分别 `100/100/50`；
- 固定 seed 派生、1000 个稳定 gameId/seed、整份计划 SHA-256；同 seed 逐字一致，篡改失败关闭。

### 原始分布与行为分布

`offline-behavior-distribution.ts` 不实现或假冒 MCTS。它只接受身份已绑定的外部完整原始分布提供者，并要求原始分布覆盖完整 canonical 合法动作集合、有限、非负且和为 1。

- 仅固定课程、仅候选座位、且目标动作合法时，对强行跑或直铲应用 20% 定向混合；
- 原始 MCTS 分布原样保留，最终行为分布单独记录；实际采样概率来自最终行为分布；
- 连杠不注入定向探索，只报告机会、正概率和选择次数，不阻断；
- 强行跑和直铲未来正式 1000 局结果各要求：合法机会至少 20、正行为概率至少 1、实际选择至少 1；不满足即门禁失败。

回归中的均匀分布只是冻结的测试桩，不是生产 MCTS、策略强度或行为分布证据。

### canonical 身份、可见信息与重放

- 每个动作身份绑定完整 canonical action、上下文与 resourceSignature，不再只依赖数值 actionId。
- 轨迹、可见状态、完整合法动作集合、公开事件、episode context 和 trace 使用规范 SHA-256 链。
- 提供给原始分布提供者的输入只有本人暗手及公开 meld/discard/score/seat/turn/phase/wallRemainingCount 和 canonical 合法动作；不包含对手暗手或真实墙序。
- `offline-episode-context.ts` 以纯函数维护碰后候选暗杠和加杠后连杠窗口；弃牌、声明提交和终局按真源生命周期清理。
- 状态动作仍由已发布规则真源/轨迹执行器原子推进；非法动作、空候选、无效概率、NaN、身份不兼容、非零和或输入不一致均熔断且输入状态零副作用。
- 样本协议 v2 同时绑定训练控制 manifest 与独立 Smoke 控制 manifest，并绑定完整 canonical 集、两份分布、选中动作、模型/ONNX/manifest/URI、终局四家零和奖励或同 episode 终局引用。

## RED → GREEN

1. RED：课程 payload 的 TypeScript 常量发生字面量扩宽，`tsc` 报 `TS2322/TS2345`。GREEN：为 payload 使用精确 `Omit<Stage8FixedCurriculumPlan, 'planSha256'>` 类型；`tsc --noEmit --incremental false` 通过。
2. RED：样本专项临时编译树遗漏新增身份/控制依赖，先报 `Cannot find module './offline-action-identity'`；补依赖后旧 v1 fixture 报 `sample-smoke-control-version-invalid`。GREEN：临时树只补齐所需模块，fixture 升级为双控制 manifest、完整 canonical 动作与新重放字段；专项通过。
3. RED：聚合器在受限 Windows 环境使用子进程执行首项即失败。GREEN：聚合器改用同一 Node 进程动态导入确定性专项，并用 TypeScript API 执行 `noEmit/incremental=false` 类型检查；不放宽任何断言。
4. RED：普通权限 `npm run build` 的 Next 子进程被沙箱以 `spawn EPERM` 拒绝。GREEN：同一候选以允许子进程的隔离权限重跑，Next `8/8`、exit 0；这是执行权限差异，不是代码或门禁放宽。

## 实际门禁与输出摘要

- `npm run test:stage8-offline-selfplay-preflight`：PASS；计划 1000、执行 0；四座各 250；场景 400/400/200；明确 `selfplayStarted=false`、`trainingStarted=false`、`artifactsWritten=false`。
- `npm run test:stage8-fixed-curriculum-smoke`：PASS；固定 seed、比例、座位、篡改拒绝、默认拒绝。
- `npm run test:stage8-offline-selfplay-smoke`：PASS；只执行 2 次定向内存决策用于回归，正式 Smoke 0 局；可见信息隔离、完整原始分布、20% 混合、硬阈值/连杠报告、重放和熔断通过。
- `npm run test:stage8-sample-replay-model-protocol`：PASS。
- `npm run test:stage8-offline-trajectory-executor`：PASS。
- `npm run test:stage8-v2-action-space`：PASS。
- `npm run test:stage8-v2-kong-execution`：PASS。
- `npx tsc --noEmit --incremental false`：PASS；没有 `tsconfig.tsbuildinfo`。
- `npm run test:stage8-offline-round-integrity`：PASS。
- `npm run test:stage8-offline-four-player-batch`：PASS；8 个既有规则完整性遍历，仍明确不是行为分布或 rare-action Smoke 证据。
- `npm run test:stage8-offline-coverage-matrix`：PASS；普通 136 局域与定向规则矩阵继续分开报告。
- `npm run test:stage8-training-control-protocol`：PASS。
- `npm run build`：PASS；Next 静态页 `8/8`，最终 BUILD_ID `MWnQIieyW0KnhoHPkDWjC`。
- `node scripts/build-browser-rule-engine.mjs --check`：PASS；`public/game/rule_engine.js` SHA-256 `A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB`，与当前规则源码一致。
- `git diff --check`：PASS；无额外 `tsconfig.tsbuildinfo`，测试临时目录由 `finally` 清理。

## 剩余硬阻断

以下事项仍阻断正式 Smoke/训练，不能由本候选的全绿替代：

1. 未取得正式 1000 局 Smoke 运行授权；本轮只生成计划并执行 2 次定向内存决策回归。
2. 未提供并核验真实外置 artifact root、真实 MCTS 完整分布提供者、模型文件/ONNX/manifest/URI 身份；回归均为内存声明和测试桩。
3. 未创建任何样本写入器、产物滚动池、checkpoint 或恢复流程；这些也未获运行授权。
4. 正式 1000 局必须产出逐局重放与覆盖 ledger，届时才能核验强行跑/直铲硬阈值；连杠只报告，不作为阻断条件。
5. Smoke、Pilot、训练、Arena、Champion、runtime、服务部署仍须分别获得产品明确授权；自动化全绿不构成授权。

## 验收建议

结论建议：**进入独立技术复验，但继续禁止提交、推送、部署和任何 Smoke/训练运行**。复验应从候选最终状态直接执行聚合门禁、构建、构建后 rule-engine `--check`、精确 14 文件状态和 `git diff --check`。
