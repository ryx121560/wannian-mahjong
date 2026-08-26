# Stage8 真实 canonical MCTS provider 与正式 Smoke runner 候选报告

- 日期：2026-08-24
- 状态：未提交、未推送、未部署、未运行正式 Smoke；功能门禁与提升隔离环境 Next 完整构建均已通过，等待产品独立验收
- 候选：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-real-mcts-smoke-runner-20260824`
- 分支：`codex/stage8-real-mcts-smoke-runner-20260824`
- 基线：`origin/main=d4bf2f954dd87514d524bc75e3a16337a76a454c`
- PRD 真源：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`
- PRD SHA-256：`26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`

## 1. 精确范围（12文件）

1. `package.json`
2. `src/game/mcts/mcts-enhancement-engine.ts`
3. `src/game/stage8/offline-selfplay-control.ts`
4. `src/game/stage8/offline-canonical-mcts-provider.ts`
5. `src/game/stage8/offline-smoke-runtime-preflight.ts`
6. `src/game/stage8/offline-smoke-runner.ts`
7. `scripts/stage8-canonical-mcts-provider-regression.mjs`
8. `scripts/stage8-offline-smoke-runtime-preflight-regression.mjs`
9. `scripts/stage8-offline-smoke-runner-regression.mjs`
10. `scripts/stage8-offline-smoke-runner.mjs`
11. `scripts/stage8-offline-selfplay-preflight-gate.mjs`
12. `docs/stage8-real-mcts-smoke-runner-candidate-report-2026-08-24.md`

未修改页面、规则真源、计分、生产 AI 决策调用、服务 API、部署脚本、Storage 或训练资产。

## 2. 实现映射与关键设计

### 2.1 完整 canonical MCTS 原始分布

- `mcts-enhancement-engine.ts` 仅新增 `scoreMctsCandidateValues` 纯导出，复用原 `scoreCandidate`；现有 `decideWithMcts` 未改。
- 新 adapter 将完整 canonical 合法动作逐项映射为现有 MCTS 的 `discard/pong/kong/win/pass` 评分输入。
- adapter 从严格白名单可见投影构造上下文，不接受对手暗手、真实墙序或额外递归字段。
- 对全部合法候选的现有 MCTS 分值执行稳定 softmax，输出逐 canonical key、有限、非负、和为1的原始分布。
- 缺失候选、重复 canonical 身份、身份不符、非法温度、NaN/Inf、非完整分布均失败关闭。

本候选适配的是项目当前真实 MCTS 评分面；它不创建或加载候选 ONNX，也不宣称模型推理已经具备。正式 runner 会在执行前核验候选模型、ONNX 和模型 manifest 的存在与内容身份，但实际模型推理/ONNX 加载仍须由后续独立能力和授权提供。

### 2.2 分段授权与默认拒绝

- 保留既有 `fixed-course-smoke-preflight`：`allowSelfplayRuntime=false`。
- 新增 `fixed-course-smoke-run`：必须显式 `granted=true` 且 `allowSelfplayRuntime=true`。
- 两种授权都继续强制训练、replay runtime、模型 runtime、ONNX runtime、checkpoint、Pilot、Arena、Champion、生产 runtime 为 false。
- 预检授权不能运行；运行授权不能自动进入任何下游阶段。

### 2.3 所有写入前的真实运行预检

`offline-smoke-runtime-preflight.ts` 是纯只读接口，不接收 writer。它在 runner 调用 writer 之前验证：

- 显式存在且位于项目/worktree外的 `STAGE8_ARTIFACT_ROOT`；
- 运行目录已由外部单独授权预建、严格位于外置根下且为空；runner 不创建目录；
- 模型文件、ONNX、模型 manifest 均为外置根内的绝对现存文件；
- 三项文件内容 SHA-256 与 Smoke control 完全一致；
- 模型 manifest 内容绑定规则、动作、合法 mask、特征、可见信息、模型/ONNX SHA 和版本化 URI；
- provider/runtime 源码文件逐项 SHA 与规范 source bundle SHA；
- baseSeed、batchSize、workers、行为温度、课程覆盖、provider 定义、模型和源码身份共同绑定 `fixedCurriculumSelfplayFingerprint`；
- runtime manifest 内容 SHA 和运行授权；
- 所有下游阶段继续关闭。

外置根、运行目录、模型、ONNX、manifest、源码或授权任一缺失时，runner 在任何 writer 调用之前返回 fused，artifact 写入数为0。

正式 CLI 通过只读内存 TypeScript 加载器直接复用上述完整预检，不创建编译文件，也不复制授权、路径或哈希规则。只有完整预检成功后才允许调用 `mkdtempSync`、遍历编译树并构造 artifact writer；授权失败、runtime manifest 哈希失败或模型/ONNX内容哈希失败时，这三类临时写入计数均为0。

### 2.4 正式1000局 runner 与账本

- 从136张、每种4张的牌池按全局 game index 固定 seed 洗牌发牌。
- 每步通过已发布 `executeStage8OfflineSelfplayDecision` 和 canonical trajectory executor 推进规则状态。
- 单局最多600个转移；墙尽或真实胡牌才算结束，超限熔断。
- 每步检查牌总数/每牌4张、四家有限积分、严格零和、玩家积分镜像。
- 固定课程仍为1000槽位、四座各250、强行跑:直铲:连杠=2:2:1；强行跑/直铲执行硬门槛，连杠 report-only。
- batch/worker 只决定确定性的逻辑调度槽；每局 seed 与结果按 global game index 绑定，最终账本按 game index 排序。当前回归证明 1/4 worker 布局的语义等价，不把它表述为 OS worker-thread 并行吞吐或性能证据。
- 每局账本保存完整 canonical 合法动作、原始 MCTS 分布、最终行为分布、选中动作、实际概率、来源、探索标记、公开转移记录、终局 delta、trace/state/replay 身份。
- 成功时仅写一个不可变 `smoke-ledger.json`；预检后运行异常或覆盖不足时仅写 `smoke-quarantine.json`；目标已存在或写入失败均失败关闭。
- 正式 CLI 仅接受显式绝对 control/runtime manifest 与 artifact root；缺件在创建临时编译树和 artifact writer 前拒绝。

## 3. RED / GREEN

### RED 基线

- `offline-behavior-distribution.ts` 只有注入 provider 类型，无主线真实实现。
- 现有 MCTS 摘要只暴露最多6项候选，不能形成完整 canonical 分布。
- 主线只有1000槽位计划和单步纯内存决策，没有实际运行身份/模型文件内容预检、运行目录预检、worker调度、完整账本或正式入口。

### GREEN

1. `npm run test:stage8-canonical-mcts-provider`
   - 10个 canonical 候选逐项存在；分布和 `0.9999999999999999`；隐藏字段/错误身份拒绝；正式 Smoke 0局。
2. `npm run test:stage8-offline-smoke-runtime-preflight`
   - 根目录、空运行目录、模型/ONNX/manifest、源码包、运行授权、指纹和下游拒绝全部通过；
   - CLI故意输入授权拒绝、runtime manifest哈希错误、ONNX内容哈希错误时，`mkdtempSync=0`、`compileTree=0`、`writeFileSync=0`；
   - 正式 Smoke 0局、零写入。
3. `npm run test:stage8-offline-smoke-runner`
   - 2次同种子纯内存真实规则执行（1/4 worker布局）语义哈希一致；1000槽位账本在内存完成身份/覆盖验证；正式 Smoke 0局、零训练产物。
4. `npm run test:stage8-offline-selfplay-preflight`
   - 新三项、固定课程、原自弈、样本协议、轨迹、action-space、kong-execution、TS API检查全部通过。
5. `npx tsc --noEmit --incremental false`
   - 通过，无 `tsconfig.tsbuildinfo`。
6. `npm run test:mcts`
   - 154/154通过，证明新增纯导出未改变现有生产决策回归。
7. `npm run test:stage8-offline-round-integrity`
   - 通过。
8. `npm run test:stage8-offline-four-player-batch`
   - 8个既有规则完整性遍历通过；不是正式 Smoke 或策略强度证据。
9. `npm run test:stage8-offline-coverage-matrix`
   - 普通136局遍历与定向规则矩阵通过，信息泄漏审计通过。
10. `npm run test:stage8-training-control-protocol`
    - 通过。
11. `node --check scripts/stage8-offline-smoke-runner.mjs`
    - 通过；未执行该入口。
12. `git diff --check`
    - 通过（仅行尾转换提示）。
13. `node scripts/build-browser-rule-engine.mjs --check`
    - 通过；`public/game` 无候选差异。
14. 最终候选卫生核对
    - `git status --short` 精确12项；无 `tsconfig.tsbuildinfo`，无浏览器构建临时快照残留。

## 4. 构建与构建后门禁

补正后的 `npm run build` 在受控提升隔离环境成功退出：Next 编译、类型检查、静态页面 8/8、页面优化和构建追踪全部完成，`BUILD_ID=r3Ij6wvMsgsVH-5RN3vfS`。此前普通沙箱稳定复现的 `spawn EPERM` 已确认属于子进程权限边界。

构建后按固定顺序复验：

1. `node scripts/build-browser-rule-engine.mjs --check`：通过；
2. `node scripts/assert-browser-build-artifacts-clean.mjs`：三项冻结非规则生成包 SHA-256 身份通过；
3. `npx tsc --noEmit --incremental false`：通过，无 `tsconfig.tsbuildinfo`；
4. `npm run test:stage8-offline-selfplay-preflight`：通过，正式 Smoke 0局、训练未启动、产物写入 false；
5. `git diff --check`：通过（仅行尾转换提示）；
6. `git status --short`：仍精确12项，`public/game` 无差异；
7. 浏览器构建临时快照及 `stage8-formal-smoke-runtime-*` 目录：无残留。

普通沙箱失败路径同样安全恢复了三个冻结生成包并清理临时快照；未扩大候选范围。当前候选已具备提交产品独立验收的构建证据，但本报告不构成提交、发布或正式 Smoke 授权。

## 5. 本轮零运行/零数据边界

- 正式1000局 Smoke：0局。
- 新 runner CLI：未执行。
- 测试仅有2次同种子纯内存真实规则回放和1000个内存假账本槽位；二者都不是正式 Smoke、行为分布、策略强度或训练样本证据。
- 未启动 selfplay、训练、replay、模型、ONNX、checkpoint、Pilot、Arena、Champion、runtime或服务。
- 未创建真实模型、ONNX、manifest、E盘外置根/子目录或训练产物。
- 未访问浏览器 Storage、用户页面、用户对局或用户导出。
- 未修改 Vault。

## 6. 仍需产品提供的真实运行输入

即使候选独立构建通过，也不得自动运行。首次真实 Smoke 仍需逐项提供和单独审批：

1. 专用且预建为空的外置运行目录；
2. 候选模型、ONNX、模型 manifest 的绝对路径和真实内容哈希；
3. provider/runtime 源码 bundle 身份；
4. baseSeed、batchSize、workers、行为温度及不可变运行 manifest；
5. scope 为 `fixed-course-smoke-run` 的新审批 ID；
6. 运行前完整只读 preflight 报告。

Smoke 完成后必须停止并回产品验收，不得自动进入训练、Pilot、Arena、Champion或生产 runtime。
