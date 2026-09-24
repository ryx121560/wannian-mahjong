# P1 结束态统一禁用响应按钮候选验收报告

## 状态

- 候选待产品验收。
- 未合并、未推送、未部署。
- 基线：`origin/main=c95efbd9de0954dbd593807cf2e1bb93d73b342a`。
- 未访问 `18768`、用户浏览器 Storage 或用户对局。

## 变更范围

- `package.json`：新增专项回归命令 `test:p1-ended-action-buttons`。
- `public/game/wannian-mahjong.html`：结束态与 idle 统一禁用碰、杠、胡、过；四个入口增加明确 phase 守卫；结束路径刷新按钮状态。
- `scripts/p1-ended-action-buttons-regression.mjs`：覆盖 ended/idle 深比较零副作用、合法 responding/discarding 路径和恢复/结束刷新。
- 本报告。

## TDD 证据

- RED：新增专项首次运行因命名 handler 不存在而失败。
- GREEN：实现后 `npm.cmd run test:p1-ended-action-buttons` 通过。
- `updateBtns()` 对 `idle/ended` 先统一设置四个按钮 `disabled=true` 并返回，复用既有 disabled 灰色样式。
- 碰、响应杠、点炮胡、过只允许 `responding`；自摸胡、自杠只允许 `discarding`。
- 对 ended/idle 强制调用每个 handler，专项深比较 GS、墙、手牌、副露、积分、日志、快照调用和计时器均不变。
- 非对局控制按钮及顶部积分栏未改动。

## 回归结果

- `test:p1-ended-action-buttons`：通过。
- `test:response-phase`：通过。
- `test:response-real-meld-context`：通过。
- `test:response-restore-revalidation`：通过。
- `test:p0-kong-page-persistence`：通过。
- `test:p0-special-kong-page-phase2`：通过。
- `test:normal-concealed-kong`：通过。
- `test:p1-statusbar`：通过。
- `test:rules`：472/472。
- `test:recommendation`：100/100。
- `test:stage7-recommendation`：320/320。
- `npx tsc --noEmit --incremental false`：通过。
- `verify:browser-rules`、`verify:recommendation`：通过。
- `npm.cmd run build`：通过；构建产生的范围外浏览器包已恢复到基线。
- `git diff --check`：无错误。

## 未触碰项

- 不改规则、计分、AI、推荐、Stage8、导出、积分机制或非对局控制。
- 不恢复短积分条，不混入杠开补牌结束态显示候选。
- 不合并、不推送、不部署，不访问 `18768` 或用户 Storage。
