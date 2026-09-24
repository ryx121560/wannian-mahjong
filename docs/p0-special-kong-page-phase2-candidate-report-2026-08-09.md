# P0 特殊杠页面与快照阶段 2 候选验收报告

- 日期：2026-08-09
- 候选路径：`C:\Users\Administrator\Documents\NEW\.candidates\codex-p0-special-kong-stage1-shell-20260809-r2`
- 分支：`codex/p0-special-kong-stage1-shell-20260809-r2`
- 基线：`32114ce9f0cef537289bfd4f295a09e047d7dd7c`
- 状态：产品验收通过；未合并、未提交、未推送、未发布、未部署。

## 授权范围

本阶段仅将已验收的阶段 1 纯规则接入网页对局状态机与快照持久化：

- 碰后候选普通暗杠、暗杠强跑和双碰选择性强跑的显式选择与取消；
- 放弃零消费，候选资源在打出同牌、实际声明或局终时按规则转移；
- 普通 addedKong 首补命中另一真实碰副露第 4 张时创建可选连杠窗口；第二杠必须再次通过通用“杠”声明，先进行抢杠胡检查；
- 直铲、即时/延迟强跑、连杠的预演先行和原子提交；即时结算结果必须在页面写入前具备完整结算契约；
- 新增资源、动作窗口和选择窗口的快照序列化、恢复校验与旧快照安全降级。

未包含：Stage8 v2、任何 selfplay/replay/checkpoint/ONNX/模型/训练/Smoke/Pilot/Arena/Champion/runtime、AI/MCTS/推荐策略、服务、18768、用户浏览器 Storage 或用户数据。

## TDD 与专项证据

新增 `scripts/p0-special-kong-page-phase2-regression.mjs`，先以缺失链杠动作与快照字段的失败断言建立红测，再最小实现至通过。专项覆盖：

- 候选普通暗杠、暗杠强跑、双碰强跑选择后的物理副露、资源消费与结算；
- 双碰中已选资源 consumed、未选资源继续 active；
- 普通 addedKong 首补仅在匹配另一真实碰副露时建立连杠窗口，首资源只作为链最终分解上下文使用一次；
- 手动第二杠的规则核心结算：已确认链式 9 万例最终付款 16/8/8、赢家 +32；
- 选择取消不消费资源或牌，且保存已清除的选择窗口；
- 新资源、选择窗口、addedKong 连杠窗口可经快照恢复；旧快照缺少阶段 2 字段时安全默认；
- 资源/窗口恢复重校验拒绝无效状态；
- 动作分类标签可审计，且不写对手暗手、未来牌墙或模型内部信息。

页面专项通过独立 VM 加载页面脚本和已发布浏览器规则包，验证页面状态写入/快照边界；本候选未启动页面服务、未访问任何浏览器 Profile。因此这不是人工视觉验收，也不宣称已验证用户浏览器页面。

## 独立审查修正

独立审查识别并已修正真实 addedKong 连杠的物理语义：另一真实碰副露在首补命中第 4 张时，玩家手中只应有该 1 张补牌，第二次手动杠将其加入既有 3 张碰副露；不得要求手中另有 4 张，也不得消费不存在的四张牌。

对应修正已覆盖：

- 纯规则 `resolveAddedKongChain` 以一张真实第 4 张验证和消费；
- 页面第二杠的预演、原子提交和恢复重校验都要求恰好一张；
- `doSelfKong` 在普通链杠/延迟强跑之前分派 addedKong 连杠，并在第二杠写入前执行抢杠胡检查；
- 回归夹具改为真实碰副露加一张补牌，并新增“第二杠被抢则不提交”的断言。
## 查询纯度修正

产品复验发现 `canSelfKong()` 曾在资格查询中直接执行 addedKongChain 的抢杠检查和页面提交，导致摸牌、刷新或按钮状态计算可能自动结算。现已改为严格纯查询：当存在 addedKongChain 窗口时仅返回 `{ type, tile, action }` 描述，不写入 `GS`、牌墙、手牌、副露、积分、日志、快照、计时器或 UI。实际抢杠检查与连杠提交仅保留在 `doSelfKong()` 的显式点击路径。

专项新增并通过：

- 直接调用 `canSelfKong()` 的深状态不变断言；
- `completeHumanDraw()` 刷新 `canK` 后，只发生正常摸牌和一次正常快照保存，不调用抢杠解析、结算或连杠提交；
- 仅显式调用 `doSelfKong()` 才进入 addedKongChain 抢杠或提交分派。
## 第二次复验修正：查询纯度与 AI 分派

复验发现 `canSelfKong()` 在 addedKongChain 窗口中曾执行抢杠解析和页面提交。现已改为严格资格描述：只返回 `{ type, tile, action }`，不直接调用抢杠、结算、提交、快照、渲染或计时器。

实际 addedKongChain 的抢杠解析和提交只在 `doSelfKong()` 的动作执行路径中发生。AI 识别该资格时同样只委派至 `doSelfKong()`，不再落入旧普通暗杠分支，也不会按错误的四张暗手模型修改手牌或副露。

新增并通过的回归：

- 直接调用 `canSelfKong()` 后完整状态、资源窗口和副作用计数均不变；
- `completeHumanDraw()` 刷新 `canK` 只完成正常摸牌/一次正常快照，不会解析抢杠、结算或提交连杠；
- 使用实际 `preparePageAddedKongChainAction()` 辅助链的资格查询仍为无副作用；
- AI 的 `addedKongChain` 决策必须委派至 `doSelfKong()`，不得进入旧暗杠变异分支；
- 只有 `doSelfKong()` 的执行路径可进入 addedKongChain 抢杠或提交。
## 回归结果

以下命令均通过：

- `npm.cmd run test:p0-special-kong-page-phase2`
- `npm.cmd run test:p0-special-kong-rules`
- `npm.cmd run test:p0-kong-page-persistence`
- `npm.cmd run test:normal-concealed-kong`
- `npm.cmd run test:response-phase`
- `npm.cmd run test:response-real-meld-context`
- `npm.cmd run test:response-restore-revalidation`
- `npm.cmd run test:rules`：472/472
- `npm.cmd run test:recommendation`：100/100
- `npm.cmd run test:mcts`：154/154
- `npm.cmd run test:strong-ai`：391/391
- `npm.cmd run test:stage7-recommendation`：320/320
- `npm.cmd run test:stage7-ai-unified`：58/58
- `npx.cmd tsc --noEmit`
- `npm.cmd run verify:browser-rules`
- 页面内联脚本语法检查：`new Function(inlineScript)`
- `npm.cmd run build`

构建产生的 `mcts_enhancement_engine.js`、`recommendation_engine.js`、`strong_rule_ai.js` 和 `tsconfig.tsbuildinfo` 已恢复/清理，不属于候选范围。

## 候选范围审计

语义变更仅为：

- `package.json`
- `public/game/rule_engine.js`
- `public/game/session_snapshot.js`
- `public/game/wannian-mahjong.html`
- `src/game/rules/index.ts`
- `src/game/rules/kong-resource.ts`
- `src/game/rules/score-calculator.ts`
- `src/game/rules/types.ts`
- `src/game/rules/special-kong.ts`
- `scripts/p0-special-kong-rules-stage1-regression.mjs`
- `scripts/p0-special-kong-page-phase2-regression.mjs`
- 本阶段报告及阶段 1 报告。

`docs/superpowers/plans/` 是实施计划，不属于未来发布候选文件。阶段 1 规则源文件与回归仅作为阶段 2 的前置依赖，后续集成时应与页面阶段单独审计范围。

## 下一步

等待产品验收。未经单独授权，不得合并、提交、推送、部署，或继续 Stage8 v2 / 训练。
## 产品复验通过

产品已独立复跑阶段2页面专项、阶段1规则专项、	sc --noEmit --incremental false 与 git diff --check，均通过。验收报告哈希：686FB0CBD882BB4BB156A0AF251D072D499E3029484D10B5EDF18198BE8C7828。本候选仍需经干净集成、共享门禁、普通非强制推送和独立运行树部署后才可视为已发布。
