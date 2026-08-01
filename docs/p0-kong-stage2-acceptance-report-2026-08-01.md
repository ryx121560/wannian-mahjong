# P0 阶段 2 页面与快照接入验收报告

状态：产品验收通过，未合并、未提交、未发布。

## 范围

本候选将已发布的规则核心接入网页对局和快照兼容字段：

- 页面只通过 `RULE_ENGINE` 判定弃牌响应、抢杠、直铲、立即/延迟强行跑杠、连杠、补牌结果和结算。
- 碰后资源保存真实拥有者、真实碰副露及状态；不再以全局 `_hasWild` 参与胡牌判定。
- 快照保存真实资源、杠动作窗口和副露来源；旧快照缺少这些字段时安全默认为空。
- 正常弃牌会消费或失效资源并放弃待执行的连杠窗口；新局、流局、胡牌和最终审计阻止都会使资源失效。
- 日志保留动作类别、规则结果、分解签名、结算摘要，以及既有强行跑杠兼容字段。

## 页面隔离证据

- 仅启动独立工作树的临时 `127.0.0.1:18771` 服务并验证 HTTP 200。
- 在独立 Codex 内置浏览器会话中完成：新局、真人弃牌、刷新恢复；刷新后页面仍处于进行中回合，未进入 idle。
- 页面控制台 error 日志为 0。
- 临时服务和隔离标签页均已关闭；未导航、读取、刷新或写入 `127.0.0.1:18768`。

## 自动回归

| 命令 | 结果 |
| --- | --- |
| `npm.cmd run test:p0-kong-resource` | 通过 |
| `npm.cmd run test:p0-kong-page-persistence` | 通过 |
| `npm.cmd run test:response-real-meld-context` | 通过 |
| `npm.cmd run test:response-restore-revalidation` | 通过 |
| `npm.cmd run test:rules` | 472/472 通过 |
| `npm.cmd run test:recommendation` | 100/100 通过 |
| `npm.cmd run test:mcts` | 154/154 通过 |
| `npm.cmd run test:strong-ai` | 391/391 通过 |
| `npm.cmd run test:stage7-recommendation` | 320/320 通过 |
| `npm.cmd run test:stage7-ai-unified` | 58/58 通过 |
| `npx.cmd tsc --noEmit` | 通过 |
| `npm.cmd run verify:browser-rules` | 通过 |
| `npm.cmd run verify:recommendation` | 通过 |
| `npm.cmd run verify:mcts` | 通过 |
| `npm.cmd run verify:strong-ai` | 通过 |
| `npm.cmd run build` | 通过 |
| `git diff --check` | 通过 |

## 专项覆盖

- 直铲真胡、直铲假胡，以及直铲付款责任。
- 立即强行跑杠成功与失败弃牌。
- 延迟强行跑杠入口和资源所有者限制。
- 连杠 9 万假胡的 `16/8/8` 付款、赢家净得 `+32`。
- 每名付款方独立 16 分封顶。
- 弃牌响应按真实副露和顺时针最近合法胡处理。
- 旧 responding 快照重校验、新资源快照恢复、过期资源失效与连杠窗口恢复。

## 明确排除

- 未实施 P0 存档耐久性高级方案。
- 未修改积分展示或积分持久化路径。
- 未修改 AI/MCTS/推荐策略或其源码。
- 未修改 Stage8 simulation、action space、训练、replay、checkpoint 或服务。
- 未访问用户浏览器数据或 18768 服务。

## 复验修正：初始杠原子状态迁移

- 根因：初始直铲/立即强行跑杠此前会先写入手牌、副露和点杠者弃牌，再检查牌墙；空牌墙或补牌不可用时会返回失败，但已留下半完成状态。
- 修正：`applyInitialPageKongAction` 先校验玩家、真实弃牌行、三张资源牌、牌墙末张补牌与规则核心预演结果；通过后才一次性提交手牌、副露、弃牌行、牌墙、资源和补牌标记。
- 失败路径：空牌墙、无有效补牌、规则核心拒绝均不写入页面状态、积分、日志、快照或结算。
- 专项回归：直铲与立即强行跑杠分别覆盖空牌墙及补牌不可用；另覆盖规则核心拒绝。每个失败分支深比较手牌、副露、弃牌、牌墙、资源、动作窗口、积分和日志长度，均保持不变。
- 成功路径：既有阶段1规则资源、页面、响应恢复与共享回归均重新通过。

## 范围审计

### 候选文件

- `package.json`
- `public/game/rule_engine.js`
- `public/game/session_snapshot.js`
- `public/game/wannian-mahjong.html`
- `scripts/p0-kong-page-persistence-regression.mjs`
- `scripts/response-real-meld-context-regression.mjs`
- `scripts/response-restore-revalidation-regression.mjs`
- `docs/superpowers/plans/2026-08-01-p0-kong-stage2-page-persistence.md`
- 本验收报告 `docs/p0-kong-stage2-acceptance-report-2026-08-01.md`

### 明确排除

- `public/game/mcts_enhancement_engine.js`、`public/game/recommendation_engine.js` 虽在工作树状态中显示修改，但 `git diff --ignore-space-at-eol` 无输出，确认仅为生成过程的行尾差异，不纳入候选或未来提交。
- `public/game/strong_rule_ai.js` 的构建生成内容已恢复至候选基线，不纳入本阶段页面/持久化范围。
- `tsconfig.tsbuildinfo` 是类型检查生成的未跟踪临时文件，不纳入候选或未来提交。

## 第二次复验修正：三类特殊杠统一原子预演

- 范围：仅阶段2接入的初始直铲/立即强行跑杠、延迟强行跑杠和连杠；未扩展普通暗杠或加杠。
- 根因：延迟强跑与连杠原先会在 `resolvePageKongAction` 前扣手牌、修改副露或消耗牌墙。补牌无效、规则核心拒绝或结果缺失时可能保留半完成状态。
- 修正：新增无副作用的 `preflightPageKongResolution`。三类特殊杠均先完成页面前置校验和规则核心预演；仅预演成功后才提交手牌、副露、弃牌行、牌墙、资源、动作窗口与补牌标识。
- 失败路径回归：延迟强跑与连杠分别覆盖空牌墙、补牌不可用和规则核心拒绝；连杠额外断言原已消费的第一资源和动作窗口保持原值、第二杠副露不写入。所有失败分支深比较状态，并由副作用替身保证不保存快照、不结算、不渲染、不写日志、不安排 AI 定时器。
- 初始直铲/立即强跑失败回归继续保留；抢杠优先和既有成功核心结算回归继续通过。

## 第三次复验修正：连杠结算契约预演

- 连杠按规则必须结算，因此除 `resolution` 外，页面还必须在写入前取得完整 `scoreKongSettlement` 契约。
- 新增 `hasPageKongSettlementContract`，验证 `before`、`after`、`delta`、`payments`、`handTypes`、赢家和事件字段的玩家数、数值与基本类型。
- 连杠预演结果缺少结算或结算字段不完整时直接返回 `false`；不扣第二杠牌、不写第二副露、不移动牌墙、不清第一资源动作窗口，也不写日志、快照、渲染、结算或 AI 定时器。
- 专项测试使用只返回 `resolution` 的规则核心替身复现该条件，并深比较完整状态与副作用计数。
- 初始直铲/立即强跑、延迟强跑未加入该守卫：它们的 `forcedRunFailureDiscard` 是规则规定的合法无结算弃牌分支，保持原有行为。

## 第四次复验修正：动作与结果语义提交门禁

- 新增 `isPageKongCommitResultValid(action, result)`，以动作类型、规则核心 outcome 和完整结算契约共同决定是否允许页面提交，不能只判断 `settlement` 真值。
- `directChisel` 仅接受 `directChiselTrueWin` 或 `directChiselFakeWin` 且必须有完整结算；`chainKong` 同理，只接受两种连杠 outcome 且必须有完整结算。
- `forcedRunImmediate`/`forcedRunDeferred` 仅允许两类结果：`forcedRunFailureDiscard` 必须无结算并进入正常弃牌；`forcedRunGangKaiFakeWin` 必须有完整结算。未知 outcome、失败携带结算、成功缺失或结算不完整全部在写入前拒绝。
- 新增规则核心替身回归：直铲缺结算、立即强跑成功缺结算、延迟强跑成功缺结算、强跑失败却携带结算，均断言零页面写入和零副作用；同时断言真实强跑失败仍保留合法无结算弃牌资格。

## 后续门禁

本阶段通过后，页面/规则/Stage8 v2 动作空间同源审计仍需单独授权；在该审计完成前，任何新的 Stage8 训练、Smoke、Arena、Champion 或 runtime 发布继续阻断。
