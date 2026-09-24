# P0 AI 新摸牌可视化候选报告

日期：2026-08-20
候选分支：`codex/p0-ai-drawn-tile-render-20260820`
候选基线：`d0e5dddedb5ca8960e3880ee6812002d422bc1bc`

## 目标

三名 AI 在其当前摸牌后的可见手牌中，与真人一致地把新摸牌从普通手牌中独立置于末端，并以分隔线区分。对家保持横向布局；上家和下家保持各自的纵向布局。

## 实现与边界

- 页面只在 `GS.phase === 'discarding'`、`GS.cur` 为对应 AI，且 `GS.newDrawnTile`/`GS.newDrawnIdx` 与该 AI 已有前台手牌严格一致时，才拆出独立新牌。
- AI 普通加杠补牌入手后也写入同一份 `GS.newDrawnTile`/`GS.newDrawnIdx`；普通摸牌、普通暗杠及直铲、强跑、链杠等既有页面统一补牌路径继续使用同一状态。
- 普通 AI 手牌从同一既有数组移除该索引的一张后再绘制，独立新牌只绘制一次；不复制状态，也不读取额外隐藏信息。
- 独立牌沿用既有 `showAI` 可见性策略：未显示 AI 牌面时仍只显示牌背，不扩大信息可见范围。
- 响应态、非当前 AI、弃牌后的下一摸牌态、终局和不一致标记均不会绘制独立牌或分隔线。
- 不修改牌局规则、AI 决策、计分、快照协议、Stage8 或训练资产。

## 变更范围

1. `public/game/wannian-mahjong.html`
2. `scripts/p0-live-drawn-tile-face-regression.mjs`
3. 本报告

## 验证

- `npm run test:p0-live-drawn-tile-face` 通过：真人显示保持；AI 下家、对家、上家各覆盖一次普通手牌、分隔线和独立新牌；验证方向、弃牌后、响应态、终局和快照恢复不遗留或重复。
- RED：在 `npm run test:p0-ai-self-kong-atomicity` 为普通 AI 加杠补牌新增共享新摸牌标记断言，旧实现得到 `newDrawnTile=null`、`newDrawnIdx=-1` 并失败。
- GREEN：普通加杠补牌入手后更新共享标记；`npm run test:p0-ai-self-kong-atomicity` 通过，画布专项同时验证加杠补牌在弃牌阶段恰一张独立牌和一条分隔线，弃牌后与结算终局无残留。
- `npm run test:p0-kong-page-persistence` 通过。
- `npm run test:normal-concealed-kong`、`npm run test:p0-kong-resource`、`npm run test:response-restore-revalidation` 通过。
- `npm run test:response-restore-revalidation` 通过。
- `git diff --check`：通过。

## 发布状态

未提交、未推送、未部署；等待产品验收。
