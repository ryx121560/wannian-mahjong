# P0 同局终局补牌错误归属/重复渲染候选验收报告

日期：2026-08-20
候选：`codex/p0-ended-kong-supplement-render-20260820`
基线：`origin/main` / `5f34ac03e83a08d748c7a4831bf01f38ac49dec6`

## 问题与根因

实时新摸牌仅应在当前座位的弃牌阶段独立显示。结束态“杠开补牌”也应保留独立牌、黄色标签和分隔线，但此前只在玩家 0 的底部手牌处理结构化补牌；AI 在结束态不会走实时独立牌分支，导致 AI 的补牌仍在其普通手牌中显示，而旧结束态分支可能在底部错误显示。

该问题仅是页面渲染问题；不修改杠动作资格、规则判定、付款、积分、牌墙、快照协议、AI 策略、Stage8 或用户数据。

## 精确范围

1. `public/game/wannian-mahjong.html`
   - 复用 `kongSupplement.owner/tile/handIndex`，让结束态补牌只从实际 owner 的手牌中拆出，并在该座位独立显示黄色标签和同方向分隔线。
   - 保留 `discarding` 阶段现有的人类/AI 独立新摸牌和分隔线逻辑。
2. `scripts/p0-live-drawn-tile-face-regression.mjs`
   - 更新为结束态仅实际 owner 有恰一张独立牌、黄标和分隔线；其他三座均不受影响。
   - 覆盖玩家 0、AI 下家、AI 对家、AI 上家直铲假胡、结束态 JSON 恢复和四座实时弃牌态。
3. `scripts/p1-kong-settlement-draw-regression.mjs`
   - 保留结算补牌结构化字段与快照往返断言，并验证四座位渲染都受 owner 约束。
   - 补回结束态补牌的 fail-closed 断言：非杠开、owner 与 winner 不一致、手牌索引或牌键不匹配均不得显示。
4. 本报告。

## RED/GREEN

- RED：旧实现的结束态只会在玩家 0 底部拆出结构化补牌；AI owner 的补牌仍作为普通手牌，可能与底部错误独立牌并存。
- GREEN：候选保留结束态补牌通道，但只根据结构化 `owner/tile/handIndex` 从实际 owner 手中拆出；该 owner 独立牌、黄色“杠开补牌”和分隔线各恰一次，其他三座没有该标签或独立牌。
- 保留：弃牌态当前人类或 AI 的新摸牌仍为“普通手牌 + 一条分隔线 + 一张独立牌”。

## 已执行门禁

- `npm run test:p0-live-drawn-tile-face`：通过。
- `npm run test:p1-kong-settlement-draw`：通过。
- `npm run test:p0-direct-chisel-settlement`：通过。
- `npm run test:normal-concealed-kong`：通过。
- `npm run test:p0-kong-resource`：通过。
- `npm run test:stage8-v2-action-space`：通过。
- `npm run build`：通过，退出码 `0`，候选 `.next/BUILD_ID=IpdnUG1Gw4_Jy-GT68gYK`。
- `git diff --check`：通过。

## 发布边界

候选未提交、未推送、未部署。未读取浏览器 Storage、用户页面或用户导出；未启动 Stage8、训练、自弈或回放。
