# P0 人类独立新摸牌正面显示热修候选验收报告

## 状态

- 候选待产品复验。
- 未合并、未推送、未部署。
- 基线：`origin/main=29c9f8c1e34812112e409b5f0cc625bb4a9970d1`。
- 未访问、刷新或操作 `18768` 页面、用户浏览器 Storage 或用户对局。

## 根因与修复

- A提交将普通 live draw 与 ended kong supplement 合并为同一独立牌绘制分支时，使用了 `face:!!endedKongSupplement`。
- 普通自摸和杠后继续弃牌没有 ended supplement，因此确定性传入 `face:false` 并绘制为内置牌背。
- 热修仅把seat0独立牌绘制参数固定为 `face:true`。不改变牌墙、手牌、marker、点击热区、合法动作、结算或快照结构。
- ended杠开补牌继续正面高亮、显示“杠开补牌”且不注册点击热区；无杠开ended状态不生成独立牌。

## TDD证据

- RED：在未改生产代码时新增动态render专项，首个断言失败：
  - 期望：普通人类新摸牌 `face=true`。
  - 实际：`face=false`。
- GREEN：单行修复后同一专项通过。
- 专项直接执行生产 `render()` 并捕获 `drawTile` 参数，覆盖：
  - 普通自摸正面显示和可点击热区；
  - 杠后失败继续弃牌正面显示和可点击热区；
  - repeat render、selected render；
  - 进行中新摸牌快照恢复；
  - 点击独立牌后实际弃出、清marker并进入一次响应解析；
  - ended杠开补牌正面、高亮、标签、不可点击；
  - 普通自摸/点炮/流局类ended无结构化杠开补牌时不生成独立牌。

## 精确候选范围

- `package.json`：新增 `test:p0-live-drawn-tile-face`。
- `public/game/wannian-mahjong.html`：仅将seat0独立牌的 `face` 固定为 `true`。
- `scripts/p0-live-drawn-tile-face-regression.mjs`：动态render与点击/恢复专项。
- 本报告。

## 验证结果

- `test:p0-live-drawn-tile-face`：通过。
- `test:p1-kong-settlement-draw`：通过。
- `test:p1-ended-action-buttons`：通过。
- `test:p0-kong-page-persistence`：通过。
- `test:p0-special-kong-page-phase2`：通过。
- `test:p0-special-kong-rules`：通过。
- `test:normal-concealed-kong`：通过。
- `test:stage8-v2-added-kong-page`：通过。
- `test:response-restore-revalidation`：通过。
- `test:p1-statusbar`：通过。
- `test:rules`：472/472。
- `test:recommendation`：100/100。
- `npx tsc --noEmit --incremental false`：通过。
- `verify:browser-rules`、`verify:recommendation`：通过。
- `npm run build`：通过；范围外生成包已恢复到基线。

## 未触碰项

- 不改牌墙消费、手牌排序与对象、newDrawn marker、点击热区、规则、结算、积分、AI、推荐、Stage8、静态图片或服务配置。
- 不改A的结构化 ended kong supplement，也不改B的按钮phase守卫。
- 不合并、不推送、不部署。
