# Stage8 固定课程 Smoke 证据与批次卫生前置候选报告

## 结论

候选已完成代码与离线回归，建议进入独立复验。本候选只补齐正式 Smoke 之前的确定性课程、证据账本、容量熔断与批次原子写能力；没有运行正式 1000 局 Smoke，也没有授权或启动 selfplay、训练、模型生成、ONNX 导出、Pilot、Arena、Champion 或生产 runtime。

## 候选身份

- 候选工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-fixed-curriculum-smoke-readiness-20260903`
- 分支：`codex/stage8-fixed-curriculum-smoke-readiness-20260903`
- 基线 / HEAD / 建立候选时 `origin/main`：`801543a71b753dcaa8a53c7cea7c24b212c9e6d0`
- 规则真源：`docs/rules.md` 指向 `src/game/rules`；本候选未修改规则真源。
- Stage8 PRD 真源：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`

## 精确 10 文件范围

1. `package.json`
2. `src/game/stage8/offline-selfplay-control.ts`
3. `src/game/stage8/offline-curriculum-kong-zhichan-chain.ts`
4. `src/game/stage8/offline-smoke-runtime-preflight.ts`
5. `src/game/stage8/offline-smoke-runner.ts`
6. `scripts/stage8-offline-smoke-runner.mjs`
7. `scripts/stage8-fixed-curriculum-smoke-regression.mjs`
8. `scripts/stage8-offline-smoke-runner-regression.mjs`
9. `scripts/stage8-fixed-curriculum-smoke-readiness-gate.mjs`
10. `docs/stage8-fixed-curriculum-smoke-readiness-candidate-report-2026-09-04.md`

未修改页面、规则、计分、生产 AI、模型结构、训练代码、服务或部署配置；未新增依赖。

## RED 与根因

基线存在四个可审计缺口：

1. 固定课程只有 `scenario` 标签和固定 seed，正式初态仍来自普通洗牌，标签未绑定完整 136 张课程牌墙配方。
2. 正式 runner 回归以 `fakeGames()` 合成 1000 份账本，不能证明 canonical 真源局、worker 等价或真实机会统计。
3. runner 只在全部完成后写最终 ledger，缺少按批不可变、可续接的哈希链账本。
4. 正式运行前和批次提交前没有 64 GiB 运行上限与卷使用率 80% 熔断证据。

## GREEN 实现

### 完整课程牌墙与规则机会

- 固定课程版本升级为 v2；每个计划槽位绑定 dealer、首弃牌、完整 136 张牌墙配方 SHA-256。
- 每份牌墙严格覆盖 34 种牌各 4 张；固定 seed 只置换牌墙，规则执行仍委托已发布 canonical action 与 rules transition。
- 强行跑与直铲模板分别在真实 dealer discard 后，由完整 canonical 合法集产生 `forcedRunImmediate` 与 `directChisel`；机会、正概率和选择统计只从记录的合法集与行为分布重算。
- 课程仍为强行跑:直铲:连杠 = 2:2:1，共 1000 计划槽位，四座各 250；连杠按产品口径只报告，不作为硬阻断。

### 批次身份、原子写与容量熔断

- 每批账本显式绑定 control/runtime manifest、provider/runtime source bundle、model id、model/ONNX/manifest SHA、模型身份 SHA、计划/课程、温度、worker、连续局号、固定 seed 列表、前批 SHA、游戏语义哈希和完整游戏证据。
- 批次文件只允许 `smoke-batch-NNNN.json`；使用同目录唯一临时文件、`wx` 排他创建和 rename 提交，重复目标或越界文件名失败关闭，finally 清理临时文件。
- 运行前、每批提交前和最终 ledger 提交前均检查容量：单次 run 最大 64 GiB；预计卷使用率达到或超过 80% 即熔断；空间不足即熔断。
- 任一局、身份、容量或写入失败时不写最终 ledger；已完成批次保持不可变，并在容量允许时写隔离记录。

### worker 等价真实证据

- 删除 `fakeGames()` 证明路径。
- 同一完整 136 张直铲课程局分别按 1/2/4 worker 布局，经真实 canonical 合法集、行为证据、rules transition 和终局执行；全局局号为 2，实际 worker slot 为 0/0/2。
- 三次逐局语义 SHA 完全一致；终局四家 delta 有限且严格零和。
- 这些 3 次仅为内存/OS 临时编译树回归，不是正式 Smoke、行为分布或策略强度证据。

## PRD 映射

| PRD 约束 | 候选证据 | 状态 |
| --- | --- | --- |
| 全规则、canonical 动作真源 | 初态后动作由 `deriveStage8OfflineActions` 派生，推进由既有 trajectory/rules transition 完成 | 已覆盖候选前置 |
| 固定课程 2:2:1、四座均衡 | 1000 计划槽位：400/400/200；每座 100/100/50 | 已覆盖计划身份 |
| 强行跑/直铲机会来自规则 | 真实响应 canonical 集分别出现 forcedRunImmediate/directChisel | 已覆盖 |
| 模型、规则、动作、可见信息身份 | 每批显式绑定 control/runtime/provider/model/ONNX/manifest/source bundle | 已覆盖 |
| 固定 seed 与 worker 可复现 | 1/2/4 worker 的同局真实 canonical 语义哈希一致 | 小规模前置证据 |
| 异常熔断隔离、无最终提交 | 局/账本/容量/写入失败关闭；partial batch 不能组装最终 ledger | 已覆盖协议 |
| 64 GiB 与 80% 容量边界 | 运行前、批次前、最终前检查 | 已覆盖 |
| 正式 1000 局覆盖阈值 | 本候选未运行正式 Smoke | 未授权、未产生证据 |

## 实跑门禁

- `npm run test:stage8-fixed-curriculum-smoke-readiness`：PASS。计划 1000，执行 0；真实内存真源局 3；正式 Smoke 0；外置产物 0。
- `npm run test:stage8-offline-selfplay-preflight`：PASS。正式 Smoke 0。
- `npm run test:stage8-offline-round-integrity`：PASS。
- `npm run test:stage8-offline-four-player-batch`：PASS，既有 8 局规则完整性遍历，不是稀有动作 Smoke。
- `npm run test:stage8-offline-coverage-matrix`：PASS。
- `npm run test:stage8-training-control-protocol`：PASS。
- `npm run test:stage8-sample-replay-model-protocol`：PASS。
- `npm run test:stage8-canonical-mcts-provider`：PASS。
- `npm run test:stage8-onnx-inference-adapter`：PASS，只有既有 OS 临时 CPU fixture。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS。
- `npm run build`：普通沙箱首次在 Next 子进程处 `spawn EPERM`，失败恢复后生成包无差异、快照残留 0；最终修正后允许子进程的同一隔离候选重跑 PASS，Next 8/8，`BUILD_ID=zj0V6rgHATf-jeKi49knh`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS。
- 构建后 `node scripts/assert-browser-build-artifacts-clean.mjs`：PASS，冻结非规则生成包内容身份一致；`public/game` 差异为 0。
- 构建后再次运行聚合门禁与 `tsc --noEmit --incremental false`：PASS；`tsconfig.tsbuildinfo` 为 0；OS 浏览器快照残留为 0。

## 已知边界与风险

1. 正式 1000 局仍为 0，强行跑/直铲各至少 20 次合法机会、正概率与实际选择阈值尚无正式运行证据。
2. 连杠只报告，不阻断，符合本阶段产品口径；不能据此主张连杠覆盖达标。
3. 已发布 canonical 动作空间含 `declineKong`，但离线 round adapter 尚无对应执行映射。本候选的 3 局小规模回归 provider 只从完整合法集中选择已支持的 canonical 动作，没有删除或隐藏 `declineKong`；正式 Smoke 前需产品裁定是否另开真源适配候选。
4. 本候选不提供真实模型质量、策略强度、行为分布、GPU 性能或训练可用性证据。
5. 任何正式 Smoke、外置写入、selfplay、训练、模型、Pilot、Arena、Champion、runtime 均需单独授权。

## 零运行与零用户数据声明

- 正式 Smoke：0 局；正式 selfplay/训练/replay/model/ONNX/checkpoint：0。
- E 盘或其他外置 artifact 写入：0；仅测试进程使用并清理 OS 临时目录。
- 未启动或操作 18768/其他服务；未部署、提交或推送。
- 未访问浏览器 Storage、用户页面、用户对局、用户导出或旧 dirty Stage8 训练资产。
