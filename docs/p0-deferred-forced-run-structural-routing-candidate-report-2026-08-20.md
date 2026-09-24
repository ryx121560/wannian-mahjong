# P0 延迟强行跑杠结构分流 — 候选验收报告

## 候选身份

- 候选树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-p0-deferred-forced-run-structural-routing-20260820`
- 分支：`codex/p0-deferred-forced-run-structural-routing-20260820`
- 基线：`origin/main` `0733cf1fe93b29ec09375d2b5074ff182c6b7b8b`
- 状态：未提交、未推送、未部署。

## 产品最终语义与根因

延迟强行跑杠与普通加杠的唯一分流依据不是“新摸牌是否与资源牌同值”，而是当前摸牌后、加杠前，将碰后保留的第四张资源牌作为宝牌时，当前碰副露与手牌能否凑齐四面子一将：

- 能完成：只走普通 `addedKong`；
- 不能完成：走 `forcedRunDeferred`，杠后补牌成功则结算，仍不能完成则必须弃牌。

已发布 `0733cf1` 仅以 `newDrawnTile === resource.tile` 分流，无法处理“摸无关牌但资源已完成”与“摸无关牌且资源未完成”的不同结构，因此范围不足。

本候选复用规则核心 `evaluateConditionalKongResource`，以 `consumeSourceTileFromHand=true` 将保留第四张作为资源牌，对现有碰副露和当前手牌做无副作用结构评估。延迟强跑仅在存在当前摸牌、活跃资源合法且该结构不能完成时出现。

## 未改动边界

未改动宝牌替换定义、普通加杠资源假胡的结算（平胡三家各 -2、赢家 +6）、付款、牌墙、物理手牌、直铲、立即强跑、抢杠、连杠、AI 策略、Storage、快照协议或 Stage8 生产逻辑。

## 精确候选范围

1. `src/game/rules/kong-resource.ts`
2. `public/game/rule_engine.js`（使用既有构建器受控生成）
3. `scripts/p0-post-pong-kong-reachability-regression.mjs`
4. `scripts/p0-kong-resource-regression.mjs`
5. 本报告

## RED / GREEN

- 第61局同构：碰后留 4 万、摸 6 万时，资源替换已完成结构；只有 `addedKong`，补牌后为 `addedKongFakeWin`、`mustDiscard=false`、积分 `[+6,-2,-2,-2]`。
- 同构替换为摸东风：资源替换仍不能完成；同时声明 `forcedRunDeferred` 与 `addedKong`，默认优先走延迟强跑。
- 延迟强跑补牌成功仍按既有真/假胡结算；补牌不能完成时结果为 `forcedRunFailureDiscard` 且 `mustDiscard=true`。
- 即使 `newDrawnTile` 的牌面值等于资源牌，资源结构已完成时仍不会走延迟强跑，防止恢复为值相等分流。
- 源码和浏览器规则包对上述三种状态均做断言。

## 已复验门禁

- `npm run test:p0-kong-resource`
- `npm run test:p0-post-pong-kong-reachability`
- `npm run test:p0-kong-page-persistence`
- `npm run test:p0-special-kong-rules`
- `npm run test:p0-direct-chisel-settlement`
- `npm run test:response-restore-revalidation`
- `npm run test:p0-added-kong-wildcard-browser-parity`
- `npm run test:stage8-v2-added-kong-resolution`
- `npm run test:stage8-v2-added-kong-page`
- `npm run test:stage8-v2-action-space`
- `npm run test:stage8-v2-kong-execution`
- `node scripts/build-browser-rule-engine.mjs --check`

完整构建、TypeScript 与差异检查将在候选最终状态继续复验后再报送。
