# P0 碰后旧资源杠声明可达性候选验收报告

- 日期：2026-08-13
- 基线：`origin/main=3a4dcbbc97111eadfbf9b2ae6cd2401be19e93b8`
- 隔离分支：`codex/p0-post-pong-kong-reachability-20260813`
- 状态：候选待产品验收，未合并、未提交、未推送、未部署

## 根因

碰牌提交后页面只用 `collectPageSpecialKongChoices()` 刷新 `GS.canK`。该收集器不包含此前已存在的 active `KongResource` 所对应的延迟强跑和物理加杠声明；同时旧 `canSelfKong()` 又要求存在 `newDrawnTile`。因此，碰后进入 `discarding` 时规则核心可返回合法杠动作，但页面按钮仍被置灰。

## 修复

1. 新增无副作用的 `collectPageKongDeclarations(playerIdx)`，统一枚举页面当前可见状态下的特殊杠、连杠、延迟强跑、物理加杠和普通暗杠声明。
2. `doPong`、`canSelfKong`、`doSelfKong`、`updateBtns` 及杠失败后重新进入弃牌的资格刷新均复用该收集器。
3. 延迟强跑声明资格使用最小可见状态，不经 `pageRuleState()`，声明阶段不读取墙顶。
4. 同一物理升级可同时被规则描述为 `forcedRunDeferred` 与 `addedKong`；执行继续保持已发布优先级，先走延迟强跑并仅提交一次，未新增自动猜测或新选择 UI。
5. 未改变规则核心、补牌与结算、牌墙消费、积分、AI/推荐或 Stage8 实现。

## TDD 证据

红测：

- `npm.cmd run test:p0-post-pong-kong-reachability`
- 旧基线失败关闭：`missing production function collectPageKongDeclarations`。

绿测覆盖：

- 碰后新同名牌无保留牌时不产生候选；此前 active 资源且手中保留同名牌时，按钮启用。
- 同一可见状态切换不同墙顶，候选与 canonical action mask 完全一致；声明路径访问墙时测试直接失败。
- 查询、`canK` 刷新均不写 GS、日志、快照、计时器或积分。
- 通用“杠”点击保留抢杠优先和原子提交，同一物理升级只执行一次。
- 纯规则、实际 HTML 收集器、Stage8 v2 round-engine 对同例 `forcedRunDeferred` / `addedKong` canonical 集合一致。
- 无 active 资源且无其他杠时按钮置灰。

## 验证结果

以下均通过：

- `test:p0-post-pong-kong-reachability`
- `test:p0-special-kong-page-phase2`
- `test:p0-kong-page-persistence`
- `test:p0-special-kong-visible-declarations`
- `test:p0-special-kong-rules`
- `test:stage8-v2-action-space`
- `test:stage8-v2-kong-execution`
- `test:normal-concealed-kong`
- `test:stage8-v2-added-kong-page`
- `test:response-phase`
- `test:response-real-meld-context`
- `test:response-restore-revalidation`
- `test:rules`：472/472
- `test:recommendation`：100/100
- `test:stage7-recommendation`：320/320
- `npx.cmd tsc --noEmit --incremental false`
- `verify:browser-rules`
- `verify:recommendation`
- `npm.cmd run build`
- `git diff --check`

构建产生的浏览器生成包和 `.next` 已恢复/清理，不在候选范围。

## 候选范围

- `package.json`
- `public/game/wannian-mahjong.html`
- `scripts/p0-post-pong-kong-reachability-regression.mjs`
- `scripts/p0-special-kong-page-phase2-regression.mjs`（测试沙箱适配）
- `scripts/p0-kong-page-persistence-regression.mjs`（统一收集器契约）
- 本报告

明确排除：规则/计分核心改动、AI/推荐策略、Stage8 源码、训练与 C4 产物、服务、用户数据、浏览器 Storage、18768 操作。

## 门禁状态

页面、规则和 Stage8 v2 round-engine 的本例 canonical 一致性在候选中已通过；在产品验收与后续授权前，C4/训练仍保持停止。
