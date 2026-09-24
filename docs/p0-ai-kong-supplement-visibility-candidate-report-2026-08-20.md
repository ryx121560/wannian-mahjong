# P0 AI 终局补牌标签布局与可见性候选验收报告

日期：2026-08-20
候选：`codex/p0-ai-kong-supplement-visibility-20260820`
基线：`origin/main` / `2406ec5d357a07c4f06cbfb898020143232ed8ce`

## 问题与根因

左右 AI 座位的结束态补牌标签沿用旋转牌的原点，却使用牌内文字偏移，造成文字与竖排牌重叠。AI 独立牌固定使用高亮，结束态黄色标签也没有受 `GS.showAI` 约束；隐藏 AI 手牌时仍会泄漏补牌信息。

本候选仅修复页面渲染和对应动态回归；不修改规则、结算、积分、牌墙、快照协议、AI 策略、Stage8 或用户数据。

## 精确范围

1. `public/game/wannian-mahjong.html`
   - 扩展终局补牌标签的局部坐标偏移，左右 AI 标签沿牌方向移到牌外。
   - AI 实时/终局独立牌的 `hl` 与结束态标签均遵从 `GS.showAI`；隐藏时保留牌背与分隔线。
2. `scripts/p0-live-drawn-tile-face-regression.mjs`
   - 覆盖左右 AI 可见终局标签的旋转和牌外偏移。
   - 覆盖左右 AI 在 `showAI=false` 时的实时/终局牌背、无绿框、无标签、分隔线保留。
3. `scripts/p1-kong-settlement-draw-regression.mjs`
   - 静态断言左右标签的牌外偏移和 `showAI` 门控。
4. 本报告。

## RED/GREEN

- RED：左右标签旋转锚点使用牌内偏移，且隐藏 AI 时仍有高亮与黄色标签。
- GREEN：AI 上家标签使用局部偏移 `TW/2,-TH-12`，AI 下家使用 `TW/2,TH+20`，均位于旋转牌外；隐藏 AI 时不绘制高亮或黄色标签。
- 保留：`showAI=true` 时实际 owner 的终局补牌仍独立显示一次、带黄色标签和分隔线；真人显示不受影响。

## 已执行门禁

- `npm run test:p0-live-drawn-tile-face`：通过。
- `npm run test:p1-kong-settlement-draw`：通过。
- `npm run test:p0-direct-chisel-settlement`：通过。
- `npm run test:normal-concealed-kong`：通过。
- `npm run test:p0-kong-resource`：通过。
- `npm run test:stage8-v2-action-space`：通过。
- `npm run build`：通过，退出码 `0`，候选 `.next/BUILD_ID=DavBH822aOnvm46W9RbuK`。
- `git diff --check`：通过。

## 发布边界

候选未提交、未推送、未部署。未读取浏览器 Storage、用户页面或用户导出；未启动服务、Stage8、训练、自弈或回放。
