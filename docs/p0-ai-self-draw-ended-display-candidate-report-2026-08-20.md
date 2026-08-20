# P0 AI 自摸终局独立牌候选验收报告

日期：2026-08-20

候选：`codex/p0-ai-self-draw-ended-display-20260820`

基线：`origin/main` / `921f886f57a6aabd812b248f4ce5f867570569dc`

## 问题与真源确认

普通自摸走页面 `applyWin(winner, '自摸')`。该函数在生成终局结果前清除 `GS.newDrawnTile` 和 `GS.newDrawnIdx`，因此结束态及刷新恢复不能安全依赖实时摸牌标记。杠开另有既有的 `kongSupplement` 结构化引用，不能混用。

本候选只在 AI 自摸、赢家正处于弃牌态、`GS.cur` 等于赢家且 `GS.newDrawnTile/newDrawnIdx` 与赢家手牌中的同一牌对象完全一致时，捕获 `{ owner, tileKey, handIndex }` 到现有 `_lastResult`。现有会话快照已整体克隆 `_lastResult`，无需修改快照协议；旧快照缺字段会安全回退为普通终局手牌。

## 精确范围

1. `public/game/wannian-mahjong.html`
   - 结算前捕获并在结束态解析 AI 自摸的精确牌引用；不信任陈旧实时摸牌状态。
- AI 自摸赢家将该牌从普通手牌拆出，以现有独立新摸牌位置和分隔线显示一次；不增加黄色文案，不复用“杠开补牌”。
- 所有正常终局（任一玩家的“自摸/点炮/杠开”或“流局”）自动开启既有 AI 手牌可见状态；展示函数使用严格白名单，未知类型（即使有赢家索引）、中途局面和没有有效结算结果的异常结束态均不改变该状态。刷新恢复按已存在结算结果派生同一可见状态。
- 点炮、杠开、流局和无有效精确引用的自摸均安全保持既有布局；真人自摸不新增独立牌。
2. `scripts/p0-live-drawn-tile-face-regression.mjs`
   - 增加三座 AI 自摸的独立牌、分隔线、唯一牌面、无杠开黄标、自动亮牌、点炮/真人/恢复回归。
3. `scripts/p1-kong-settlement-draw-regression.mjs`
   - 增加结构化自摸引用的捕获、解析、失败关闭、结束可见性及恢复调用断言。
4. 本报告。

## RED/GREEN

- RED：终局先清空实时摸牌标记，AI 自摸牌无法可靠定位；手牌可见状态不会因 AI 获胜自动打开。
- GREEN：AI 三座自摸均显示面朝上的独立牌与一条分隔线，赢家普通手牌精确少该一张、全局只显示一次，且无“杠开补牌”黄标；AI/真人的自摸、点炮、杠开及流局均自动亮出全部 AI 手牌；流局不生成独立牌或分隔线，未知结束类型、无结果和非终局隐藏 AI 行为不被误套用。
- 失败关闭：赢家/座位、牌键、手牌索引、牌对象或结束类型任一不匹配即不拆牌；旧快照保持可恢复。

## 已执行门禁

- `npm run test:p0-live-drawn-tile-face`：通过。
- `npm run test:p1-kong-settlement-draw`：通过。
- `npm run test:p0-kong-page-persistence`：通过。
- `npm run test:p0-ai-self-kong-atomicity`：通过。
- `npm run test:normal-concealed-kong`：通过。
- `npm run test:stage8-v2-action-space`：通过。
- `npm run test:stage8-v2-kong-execution`：通过。
- `npm run build`：通过，退出码 `0`，候选 `.next/BUILD_ID=jZo3_M0vGQs1-sA7rSB3L`；构建后仅候选预期 4 文件差异。
- `git diff --check`：通过。

## 已隔离的基线门禁问题

`npm run test:p0-special-kong-page-phase2` 在候选和已发布独立运行树（同为 `921f886`）均失败：其 VM 夹具未注入 `currentAiSelfKongDeclaration`，在 `aiSelfKong` 的既有 added-chain 分支抛出 `ReferenceError`。本候选未触及该函数或该测试，故该问题不能作为本候选回归归因；已单独列为产品复验时需裁决的既有门禁问题。

## 边界

候选未提交、未推送、未部署。未访问浏览器 Storage、用户页面或用户导出；未启动服务、Stage8、训练、自弈、回放或其他空间清理流程。未改变麻将规则、计分、牌墙、AI 决策或 Stage8 资产。
