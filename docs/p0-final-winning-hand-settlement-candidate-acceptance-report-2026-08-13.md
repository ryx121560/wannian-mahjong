# P0 终局胡牌结算手牌一致性候选验收报告

- 日期：2026-08-13
- 候选基线：`origin/main=3d8e55cfe849bdb34ab6e364973286532cf62682`
- 隔离分支：`codex/p0-final-winning-hand-settlement-20260813`
- 状态：候选实现与回归完成，未合并、未推送、未部署

## 问题与根因

点炮和抢杠的最终审计会把当前胡牌加入暗手后调用规则引擎，因此能够确认完整终局牌型；审计通过后，页面结算却重新从玩家当前手牌构造 `effectiveHand`，遗漏尚未写入暗手的点炮或抢杠牌。后续计分、牌型、日志和 `_lastResult` 使用了不完整输入，特殊牌型可退化为平胡。

## 最小修复

1. `auditFinalWinBeforeSettlement` 在成功或失败结果中返回本次实际审计的完整暗手及真实副露上下文。
2. `applyWin` 以审计手牌构造结算手牌；点炮/抢杠牌只加入一次，已有副露展开行为保持不变。
3. 牌型、计分、导出日志、`_lastResult`、顶部最近结算摘要和弹窗复用同一审计结果，不再重新读取缺牌的玩家手牌。
4. 支付规则不变：本固定特殊牌型在当前规则中点炮支付8分，抢杠支付6分。

## TDD 证据

红测（实现前）：

- 命令：`npm.cmd run test:p0-final-winning-hand-settlement`
- 点炮实际积分为 `[102,98,100,100]`，期望为 `[108,92,100,100]`，断言失败。
- 失败证明旧结算按平胡2分处理，而最终审计已识别七字半正宗、`baseScore=4`。

绿测（实现后）：

- 点炮：七字半正宗，责任方支付8，赢家增加8。
- 抢杠：七字半正宗，按现有抢杠支付规则责任方支付6，赢家增加6。
- 两条路径的审计手牌、结算日志均为14张，胡牌只出现一次；日志、`_lastResult`、`scoreDeltas` 与实际积分一致。
- 结果：`P0 final winning-hand settlement regression passed (2/2).`

## 变更范围

1. `package.json`
2. `public/game/wannian-mahjong.html`
3. `scripts/p0-final-winning-hand-settlement-regression.mjs`
4. `docs/p0-final-winning-hand-settlement-candidate-acceptance-report-2026-08-13.md`

## 验证结果

- P0专项：2/2
- Rules：472/472
- Response phase：通过
- Response real meld context：通过
- Response restore revalidation：通过
- P0 kong resource：通过
- P0 special kong rules：通过
- P0 kong page/persistence：通过
- P0 special kong page phase2：通过
- Normal concealed kong：通过
- Recommendation：100/100
- MCTS：154/154
- Strong AI：391/391
- Stage7 recommendation：320/320
- Stage7 AI unified：58/58
- Browser rules verify：通过
- Browser recommendation verify：通过
- TypeScript：`npx.cmd tsc --noEmit --incremental false` 通过
- Production build：通过
- `git diff --check`：通过

构建产生的 `rule_engine.js`、`strong_rule_ai.js`、`mcts_enhancement_engine.js`、`recommendation_engine.js` 改写及 `.next`/`tsconfig.tsbuildinfo` 已恢复或清理，不进入候选。

## 明确排除

- 不回写历史积分、历史导出或服务器积分文件。
- 不修改支付公式、积分API、特殊杠、AI策略、Stage8、训练或导出目录。
- 未访问或操作18768、浏览器Storage或用户数据。
- 未合并、未提交、未推送、未部署。

## 验收请求

请产品复核：点炮与抢杠最终结算是否应统一消费最终审计确认的完整终局手牌，并确认本候选可进入后续干净集成发布流程。
