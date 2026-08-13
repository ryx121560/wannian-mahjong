# P1 杠开补牌结束态独立显示候选验收报告

## 状态

- 候选待产品验收。
- 未合并、未推送、未部署。
- 基线：`origin/main=c95efbd9de0954dbd593807cf2e1bb93d73b342a`。
- 未访问 `18768`、用户浏览器 Storage 或用户对局。

## 变更范围

- `package.json`：新增专项回归命令 `test:p1-kong-settlement-draw`。
- `public/game/wannian-mahjong.html`：在杠开结算前冻结结构化补牌信息；结束态从 `_lastResult.kongSupplement` 独立绘制补牌与“杠开补牌”标识；非杠开结算不展示。
- `scripts/p1-kong-settlement-draw-regression.mjs`：覆盖结构化数据、结束态渲染、快照恢复、非杠开反例和继续弃牌路径。
- `scripts/stage8-v2-added-kong-page-adapter-regression.mjs`：测试沙箱补入新增纯页面 helper，保持既有 addedKong 页面桥接回归可执行。
- 本报告。

## TDD 证据

- RED：新增专项首次运行因 `captureSettledKongSupplement` 不存在而失败。
- GREEN：实现后 `npm.cmd run test:p1-kong-settlement-draw` 通过。
- 立即结算统一由 `completePageKongSettlement` 在清理 live `newDrawnTile/newDrawnIdx` 前冻结补牌；结束态渲染只消费结构化字段，不读取日志、墙顶或导出文本。
- 进行中的杠后失败弃牌仍沿用 live `newDrawnTile/newDrawnIdx`，不会重复显示结束态补牌。
- `_lastResult` 继续由既有快照深拷贝持久化；旧快照无 `kongSupplement` 时安全降级为不显示。

## 回归结果

- `test:p1-kong-settlement-draw`：通过。
- `test:p0-kong-page-persistence`：通过。
- `test:p0-special-kong-page-phase2`：通过。
- `test:normal-concealed-kong`：通过。
- `test:stage8-v2-added-kong-page`：通过。
- `test:stage8-v2-kong-execution`：通过。
- `test:response-real-meld-context`：通过。
- `test:response-restore-revalidation`：通过。
- `test:p1-statusbar`：通过。
- `test:rules`：472/472。
- `test:recommendation`：100/100。
- `test:stage7-recommendation`：320/320。
- `npx tsc --noEmit --incremental false`：通过。
- `verify:browser-rules`、`verify:recommendation`：通过。
- `npm.cmd run build`：通过；构建产生的范围外浏览器包已恢复到基线。
- `git diff --check`：无错误。

## 未触碰项

- 不改杠规则、牌墙消费、手牌逻辑、合法动作、计分、积分 API、AI、推荐、Stage8 生产语义或导出协议。
- 不改普通点炮、自摸、流局的结束态展示。
- 不合并、不推送、不部署，不访问 `18768` 或用户 Storage。
