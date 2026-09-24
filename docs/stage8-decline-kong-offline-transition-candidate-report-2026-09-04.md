# Stage8 拒绝杠离线状态转移候选报告

日期：2026-09-04
状态：candidate / 未提交 / 未推送 / 未部署
候选：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-decline-kong-offline-transition-20260904`
分支：`codex/stage8-decline-kong-offline-transition-20260904`
基线、候选 HEAD、核验时 `origin/main`：`67b988989bf3f4843022113c55c1870a1e4d2661`

## 结论

本候选补齐 Stage8 纯离线 `declineKong` 状态转移，并保持默认拒绝和失败关闭：响应窗口不生成 `declineKong`；自摸后出牌、碰后出牌和连杠窗口可明确拒绝杠；拒绝后牌局状态完全不变，只有带身份哈希的一次性 episode context 标记发生变化；下一步只能从规则真源导出的弃牌动作中选择。成功弃牌清除标记，重复拒绝、伪造/陈旧标记、错座位、错窗口、错状态、错完整合法集和终局后动作均失败且不改变输入状态。

这不是正式 Smoke、训练、自弈或样本生成授权。本轮正式 Smoke 为 0 局，正式样本写入为 0，训练和模型加载均为 0。

## 精确 13 文件范围

1. `src/game/stage8/round-engine-v2.ts`
2. `src/game/stage8/rule-semantics-adapter-v2.ts`
3. `src/game/stage8/page-semantics-adapter-v2.ts`
4. `src/game/stage8/offline-episode-context.ts`
5. `src/game/stage8/offline-round-adapter.ts`
6. `src/game/stage8/offline-trajectory-executor.ts`
7. `src/game/stage8/offline-selfplay-engine.ts`
8. `src/game/stage8/offline-bc-sample-probe-runner.ts`
9. `scripts/stage8-v2-action-space-gate-regression.mjs`
10. `scripts/stage8-offline-trajectory-executor-regression.mjs`
11. `scripts/stage8-offline-selfplay-smoke-regression.mjs`
12. `scripts/stage8-offline-smoke-runner-regression.mjs`
13. `docs/stage8-decline-kong-offline-transition-candidate-report-2026-09-04.md`

第 8 个生产文件是产品明确批准的一文件范围扩展：BC 样本探针必须在派生与预演 canonical 动作时透传同一个 episode context，否则教师链可能在拒绝杠后重新看见杠动作。

## 真源与状态契约

- 三个 Stage8 v2 动作派生入口统一限定：只有非 `discard-response` 的出牌窗口在存在杠候选时生成 `declineKong`。响应态仍由既有 `pass` 表达放弃全部响应权，不合成拒杠动作。
- `offline-round-adapter` 仍从已发布 `round-engine-v2` 派生完整 canonical 合法集。拒绝杠成功返回规则兼容的公开元事件 `specialKong/kongDeclined/committed=false`，`GameState` 对象身份内容不变，不修改手牌、副露、牌墙、积分或结算。
- episode context 升级为 v2，新增一次性 `pendingKongDecline`，绑定 actor、声明窗口、拒绝前 GameState SHA-256 和拒绝前完整 canonical 合法集 SHA-256；整体 context 继续有自身身份哈希。
- marker 存在时，适配器先从同一规则真源重新派生未过滤的完整动作集并核对上述身份，再只暴露其中的真实 `discard` 动作。不会自动弃牌，也不会暴露第二次拒绝杠、任意杠或自摸。
- 轨迹记录新增拒绝前后 context 身份；成功真实弃牌后 marker 一次性清除。所有 context 校验和推进异常均转为 fused 结果，输入初始状态与输入 context 保持不变。

## RED / GREEN

RED（生产实现前）：

- canonical 轨迹、离线 selfplay 和正式 runner 内存夹具选择 `declineKong` 时均返回 `stage8-offline-canonical-action-unmapped`。
- 响应窗口动作派生没有明确的“存在合法杠声明时仍不得出现 declineKong”定向证据。
- BC 样本探针派生与预演动作未携带 episode context，无法遵守拒杠后的弃牌唯一窗口。

GREEN（本候选）：

- `stage8-v2-action-space-gate-regression.mjs`：PASS；直铲响应窗口有 `pass/pong/directChisel` 等真源动作但无 `declineKong`，自摸后杠窗口仍有拒杠。
- `stage8-offline-trajectory-executor-regression.mjs`：PASS；覆盖状态不变、context-only 转移、弃牌唯一后继、固定重放哈希、重复拒绝失败、actor/window/pre-state/legal-set 篡改失败、BC probe context 透传。
- `stage8-offline-selfplay-smoke-regression.mjs`：PASS；内存决策先拒杠、再从真实弃牌集合选择，marker 清除；正式 Smoke 0。
- `stage8-offline-smoke-runner-regression.mjs`：PASS；3 局内存真源回归包含拒杠后真实弃牌，正式 Smoke 0。
- `stage8-bc-sample-probe-runner-regression.mjs`：PASS，exit 0；4 局、四座、677 个内存样本，转移数 `[304,273,130,124]`，四局均真实胡牌终局，确定性重放、Node 分片读回、分片哈希稳定和批次原子隔离通过；正式样本/E 盘写入/正式 Smoke/训练/模型加载均为 0。该专项约 4.6 分钟，原因是每步冷加载教师以隔离缓存，不能将其误称为正式 Smoke。

## 完整门禁

- `node scripts/stage8-v2-action-space-gate-regression.mjs`：PASS。
- `node scripts/stage8-offline-trajectory-executor-regression.mjs`：PASS。
- `node scripts/stage8-offline-selfplay-smoke-regression.mjs`：PASS。
- `node scripts/stage8-offline-smoke-runner-regression.mjs`：PASS。
- `node scripts/stage8-bc-sample-probe-runner-regression.mjs`：PASS，exit 0。
- `npm run test:stage8-fixed-curriculum-smoke-readiness`：PASS；计划槽位 1000，执行 0；内存真源回归 3；正式 Smoke 0；外置写入 0。
- `npm run test:stage8-offline-round-integrity`：PASS。
- `npm run test:stage8-offline-four-player-batch`：PASS；既有 8 局规则完整性遍历，仅覆盖实际随机出现的 discard/pass，不是行为分布或稀有动作 Smoke。
- `npm run test:stage8-offline-coverage-matrix`：PASS；定向特殊动作矩阵与信息泄露审计通过。
- `npm run test:stage8-sample-replay-model-protocol`：PASS。
- `npm run test:stage8-training-control-protocol`：PASS。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS。
- `npm run build`：普通沙箱因 Next 子进程 `spawn EPERM` 失败；失败恢复后规则包与三项冻结包身份正确且无临时快照残留。允许子进程的同一候选重跑 PASS，Next 8/8，exit 0，`BUILD_ID=nLVkbm2exbkh27cG08-e7`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS；`public/game/rule_engine.js` SHA-256 `A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB`。
- 构建后 `node scripts/assert-browser-build-artifacts-clean.mjs`：PASS；三项冻结非规则浏览器包内容身份保持。
- `git diff --check`：PASS；无新增依赖，无 `public/game` 差异，无 `tsconfig.tsbuildinfo`。

## 风险与边界

- `declineKong` 只属于 Stage8 纯离线动作/上下文协议，不修改页面产品行为、麻将规则、计分、牌墙、存档协议或生产 AI 策略。
- 136 张 8 固定种子遍历仍是规则完整性证据，不是策略强度、动作分布、正式 Smoke 或训练证据。
- BC 样本探针只使用内存和虚拟文件系统；它没有生成正式样本。较长运行时间是验收性能观察项，不构成功能绿灯以外的运行授权。
- 未访问浏览器 Storage、用户页面、用户对局或用户导出；未操作 18768；未创建或写入 E 盘训练目录、模型、ONNX、checkpoint、replay 或训练产物。
- Vault 根目录不在当前文件写权限内；读取 Vault `AGENTS.md` 的权限申请被安全审查拒绝，因此本轮未写 2026-09-04 candidate 来源或 Daily，避免绕过权限。产品验收时应将知识库沉淀视为待授权的独立外部写入，不影响项目候选 13 文件范围。

## 发布前条件

本报告只申请独立技术验收。只有产品明确通过并另行授权后，才可提交和普通 non-force 推送；本候选不需要部署，也不得据此启动正式 Smoke、自弈、样本生成或训练。
