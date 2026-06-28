# AI 规则引擎阶段一实现状态

## 已完成

- 已按 v1.0 PRD 将 `src/game/rules` 拆分为 7 个职责模块：
  - `tile-utils`
  - `meld-validator`
  - `hand-evaluator`
  - `score-calculator`
  - `wildcard-resolver`
  - `rule-config`
  - `benchmark-runner` 对应 `scripts/benchmark-runner.mjs`
- 规则入口通过 `src/game/rules/index.ts` 汇总导出，当前覆盖：
  - `canWin(hand, context)`
  - `getShanten(hand, context)`
  - `getLegalActions(state, playerId)`
  - `scoreSettlement(input)`
  - `classifyHand(hand, melds, winTile, winMethod)`
  - `calculateScore(params)`
  - `resolveWildcard(hand, melds, drawTile)`
  - `canWinAfterPass(input)`
- `classifyHand` 已按 PRD 返回 `handTypes`、`primaryType`、`baseScore`、`route` 和 `isDalan`，支持清一色、混一色、碰碰胡、七对等牌型叠加。
- 已生成 `docs/rule-standard-cases.json`，当前包含 451 条 L1 标准用例，超过 PRD 要求的 300 条验收线。
- 已新增 `scripts/build-browser-rule-engine.mjs`，把同一份 `src/game/rules` TypeScript 规则源码构建为 `public/game/rule_engine.js`，浏览器侧通过 `window.WannianRuleEngine` 使用规则引擎。
- `public/game/wannian-mahjong.html` 已接入浏览器规则包，运行时核心入口已委托给规则引擎：
  - 胡牌判定：`canHuNormal`
  - 牌型展示：`classifyWin`
  - 胡牌计分：`calcScore`
  - 碰/杠合法性：`canPongChk`、`canKongChk`、`canSelfKong`
  - AI 向听路线：`calcShanten`、`calcShanten7Pairs`、`calcShantenDalan`、`calcShantenZhengzong`、`calcShantenBanzhengzong`
- `scripts/benchmark-runner.mjs` 已支持：
  - `--level`
  - `--category`
  - `--report json`
- `npm.cmd run dev` 和 `npm.cmd run build` 会自动生成浏览器规则包。

## 当前验证结果

```powershell
npm.cmd run verify:browser-rules
# Browser rule engine verified

npm.cmd run test:rules -- --level L1
# Passed: 451
# Failed: 0

npm.cmd run test:rules -- --report json
# totalCases: 451
# passed: 451
# failed: 0
# passRate: 100%

npm.cmd run build
# Next.js production build passed
```

已用 Chrome + Playwright 打开 `http://127.0.0.1:18765/game/wannian-mahjong.html` 验证：

- `window.WannianRuleEngine` 存在。
- 页面内 `canHuNormal` 返回规则引擎结果。
- 页面内 `calcScore` 对平胡自摸返回单家支付 1 分。
- 规则引擎结算 delta 为 `[-1, -1, -1, 3]`。
- 页面加载无 `pageerror` 或 `console.error`。

## 当前边界

- 阶段一规则引擎已经可以在 Node.js 环境独立回归验证，零浏览器 API 和零 DOM 依赖。
- HTML 对局运行时的胡牌、牌型、计分、碰/杠合法性、AI 向听路线已接入同源规则引擎。
- HTML 中 AI 候选排序、防守评分和日志复盘仍保留历史启发式逻辑；这部分属于 AI 决策层，不再作为规则判定真源。
- `getShanten` 当前是阶段一基础版，用于规则回归和路线对照，不作为完整强 AI 评分模型。
- 万能牌真假胡、直铲、连杠、过水和没走色已有基础接口与 L1 用例，后续仍应随着真实牌局问题继续补充边界样例。
- 本阶段没有引入新依赖；回归脚本和浏览器包构建脚本复用项目已有 TypeScript 依赖。

## 后续建议

1. 后续 AI 强化阶段只读取 `src/game/rules` 的结果，不再复制规则判断。
2. 每次规则或 AI 修改后同时运行 `npm.cmd run verify:browser-rules`、`npm.cmd run test:rules -- --level L1` 和 `npm.cmd run build`。
3. 新发现的真实牌局问题必须先补入 `docs/rule-standard-cases.json` 或生成器，再修规则实现。
