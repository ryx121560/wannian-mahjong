# P0 AI 非法暗杠候选验收报告（2026-08-20）

## 候选

- 基线：`9507e2a1045fa92905bc613f121888faad40a511`
- 分支：`codex/p0-ai-illegal-concealed-kong-20260820`
- 工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-p0-ai-illegal-concealed-kong-20260820`

## 根因与修复

AI 摸牌后将合法声明 `kongInfo.tile` 延迟传入 `aiSelfKong`，但旧执行代码错误使用 `GS.newDrawnTile` 作为移牌、建副露和日志牌。声明牌与本次摸牌不同时，单张摸牌可被伪造为暗杠。

候选在 mutation 前重新确认当前玩家、`discarding` 阶段和现行合法声明；普通暗杠必须恰好四张、加杠必须真实三张副露加手中一张。执行与评估、日志和副露均绑定确认后的声明牌。校验失败只安排合法 AI 出牌，不修改手牌、牌墙、积分、日志或副露。

## 范围

- `public/game/wannian-mahjong.html`
- `package.json`
- `scripts/p0-ai-self-kong-atomicity-regression.mjs`
- 本报告

未修改 `src/game/rules`、用户玩家杠入口、计分规则、Stage8/训练、用户导出或 Storage。

## RED/GREEN

- RED（修复前内存复现）：手中四张 `wan1` 加本次单张 `tong9`，若声明牌/执行牌脱节，旧代码移除唯一 `tong9`、建立 `tong9` 四张副露并记录“暗杠 tong9”。
- GREEN：动态回归覆盖错牌声明零副作用、合法 `wan1` 暗杠只移除四张 `wan1`、陈旧回调零副作用和真实加杠；所有日志与副露牌均为声明牌。

## 门禁

- `npm run test:p0-ai-self-kong-atomicity`：通过。
- `npm run test:normal-concealed-kong`：通过。
- `npm run test:stage8-v2-normal-concealed-kong`：通过。
- `npm run test:stage8-v2-kong-execution`：通过。
- `npm run test:p0-kong-page-persistence`：通过。
- `npm run test:p0-post-pong-kong-reachability`：通过。

候选未提交、推送或部署，等待产品复验。
