# P0 延迟强行跑杠误分类为普通加杠 — 候选验收报告

## 候选身份

- 候选树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-p0-delayed-forced-run-routing-20260820`
- 分支：`codex/p0-delayed-forced-run-routing-20260820`
- 基线：`origin/main` `a12e219340a2be9e5d27a56cc9b3c8aad39fcb07`
- 状态：未提交、未推送、未部署。

## 根因与修复

`canUseDeferredForcedRun` 仅验证了碰后资源牌仍在手中，未验证它就是本次新摸牌；页面声明状态也未携带 `newDrawnTile`。因此，保留第四张碰牌、摸到无关牌后执行普通加杠时，会被声明收集器优先误分流到延迟强行跑杠。

现在延迟强行跑杠额外要求 `state.newDrawnTile === resource.tile`，且页面使用已有 `GS.newDrawnTile` 传递同一事实。无关摸牌后的保留第四张只产生 `addedKong`；当前摸到资源牌时仍保留 `forcedRunDeferred` 声明及其优先级。

未改动宝牌解析、普通加杠资源假胡结算（平胡三家各 -2、赢家 +6）、付款、牌墙、物理手牌、直铲、抢杠、连杠、AI 策略、快照协议、Storage 或 Stage8 训练。

## 精确候选范围

1. `src/game/rules/kong-resource.ts`
2. `public/game/wannian-mahjong.html`
3. `public/game/rule_engine.js`（由现有规则包构建器受控生成）
4. `scripts/p0-post-pong-kong-reachability-regression.mjs`
5. `scripts/p0-kong-resource-regression.mjs`
6. `scripts/stage8-v2-action-space-gate-regression.mjs`
7. 本报告

## RED / GREEN 证据

- 同构夹具：碰后保留第四张 4 万、摸无关 6 万、加杠并补 8 筒；修复前会声明延迟强跑，修复后只有 `addedKong`，补牌结果为 `addedKongFakeWin`、`mustDiscard=false`、积分 `[+6,-2,-2,-2]`。
- 真实延迟强跑：当前新摸牌就是活跃资源牌时，仍同时声明 `forcedRunDeferred` 与 `addedKong`，点击按既有优先级执行一次延迟强跑。
- 延迟强跑失败夹具仍断言必须弃牌；普通加杠真/资源假胡、抢杠、快照往返均继续覆盖。
- Stage8 动作空间夹具改为真实“当前摸到资源牌”的延迟条件，仍覆盖全部 V2 动作类型；未改 Stage8 生产逻辑。

## 已复验门禁

- `npm run test:p0-post-pong-kong-reachability`
- `npm run test:p0-kong-resource`
- `npm run test:p0-kong-page-persistence`
- `npm run test:p0-added-kong-wildcard-browser-parity`
- `npm run test:p0-direct-chisel-settlement`
- `npm run test:response-restore-revalidation`
- `npm run test:stage8-v2-added-kong-resolution`
- `npm run test:stage8-v2-added-kong-page`
- `npm run test:stage8-v2-action-space`
- `npm run test:stage8-v2-kong-execution`
- `npm run build`（Next 8/8）
- `npm run verify:browser-rules`
- `npx tsc --noEmit`
- `git diff --check`

构建前置仅允许本候选的受控 `rule_engine.js` 覆盖；完整构建后规则包再次通过验证，其他三项浏览器生成包没有差异。

## 交接结论

候选可供产品复验；当前没有提交、推送或 18768 部署授权。
