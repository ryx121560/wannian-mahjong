# P0 刷新后杠按钮点击无效候选验收报告

## 状态

待产品验收；未合并、未推送、未部署。

## 基线与范围

- 基线：`origin/main=dddde0819a1421febb4752753e683ab757c07265`
- 候选分支：`codex/p0-restored-kong-click-20260813`
- 生产代码仅修改 `public/game/wannian-mahjong.html`
- 回归仅修改 `scripts/p0-post-pong-kong-reachability-regression.mjs`
- 本报告为第三个候选文件
- 未修改规则、计分、牌墙、快照协议、AI、推荐、Stage8、训练、服务或用户数据

## 根因

`updateBtns()` 已按实时 `collectPageKongDeclarations()` 置亮自杠按钮，但 `handleKongButton()` 的 `discarding` 分支仍额外依赖快照持久化的 `GS.canK`。旧快照可保存 `canK=false`，恢复后实时声明存在、按钮可见可用，点击却在进入 `doSelfKong()` 前返回 `false`。

## TDD 证据

### 红灯

新增测试经真实 `handleKongButton()` 调用，构造实时存在 `forcedRunDeferred` 声明但快照标记 `canK=false` 的状态。旧实现失败：

- 期望 handler 返回 `true`
- 实际返回 `false`
- `doSelfKong` 未被调用

### 绿灯

最小修复使 `discarding` 点击入口和按钮刷新共用 `collectPageKongDeclarations()`：

- 陈旧 `canK=false` + 当前合法声明：进入 deferred 抢杠/提交链一次
- 陈旧 `canK=true` + 当前无声明：拒绝执行，零误触发
- `responding` 分支继续使用既有响应标记，不变

## 快照兼容回归

专项实际调用 `GameSessionSnapshot.create()`、JSON 往返和 `restore()`：

- `canK=false` 按旧值恢复
- active 杠资源和真实副露恢复
- `updateBtns()` 仍置亮按钮
- `handleKongButton()` 进入 `doSelfKong()`
- deferred 优先于同一物理升级的 addedKong，抢杠仅检查一次，提交仅执行一次

## 验证结果

- `test:p0-post-pong-kong-reachability`：通过
- `test:p0-kong-page-persistence`：通过
- `test:p0-special-kong-page-phase2`：通过
- `test:p0-special-kong-visible-declarations`：通过
- `test:p0-special-kong-rules`：通过
- `test:stage8-v2-action-space`：通过
- `test:stage8-v2-kong-execution`：通过
- `test:response-restore-revalidation`：通过
- `test:rules`：472/472
- `test:recommendation`：100/100
- `npx tsc --noEmit --incremental false`：通过
- `verify:browser-rules`：通过
- `verify:recommendation`：通过
- `npm run build`：通过
- `git diff --check`：通过

构建生成的 `rule_engine.js`、`strong_rule_ai.js`、`recommendation_engine.js`、`mcts_enhancement_engine.js` 已恢复到基线，不纳入候选。

## 影响判断

该缺陷是页面 P0 可达性问题：刷新后合法杠动作可能无法执行。规则与 Stage8 canonical 动作本身不变；修复恢复页面执行入口与规则/Stage8 声明集合的一致性，不创建或修改任何训练产物。