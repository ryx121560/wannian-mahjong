---
type: candidate-report
status: pending-product-acceptance
date: 2026-08-20
candidate: codex/p0-added-kong-fake-win-clean-20260820
base: e6550563b2c93a3eb38133ba983c923f28e3d4b6
---

# P0：普通加杠补牌资源假胡候选验收包

## 范围

仅修复普通 `addedKong` 杠后补牌的资源假胡，以及浏览器规则包与规则源码不一致的问题。为使包含受控规则包差异的候选可在最终状态直接构建，额外最小修改构建卫生脚本：它只允许唯一且可由当前源码逐字复现的 `public/game/rule_engine.js` 差异，并在构建后保留该文件；其余三个浏览器生成包仍必须干净并恢复基线。未改 `src/game/rules/score-calculator.ts`、加杠资格、抢杠、连杠、牌墙、物理手牌、用户存档、Storage、AI 策略、Stage8 训练或服务。

候选树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-p0-added-kong-fake-win-clean-20260820`

## 结果契约

- 真实标准完成仍为 `addedKongImmediateWin`。
- 补牌资源替换后完成新增 `addedKongFakeWin`。
- 不能真实或资源完成仍为 `addedKongContinueDiscard`，必须出牌。
- 假胡只用替换后的副本分类和计分；`handAfterDraw`、页面手牌和事件继续保留真实补牌，绝不伪造替换牌。
- 普通加杠假胡复用 `scoreSettlement(winType='杠开')`：平胡赢家 `+6`，三名对手各 `-2`。未触及暗杠假胡的独立倍率。
- 加杠前第四张牌没有新增自摸、胡牌入口、日志或付款路径。

## RED/GREEN 证据

RED：候选基线浏览器 `public/game/rule_engine.js` 缺少源码 `wildcard-resolver.ts` 已有的反向替换循环；新增一致性回归在生成前断言失败。

GREEN：受控生成后，`test:p0-added-kong-wildcard-browser-parity` 同时验证源码与浏览器：

- 正向替换：`bai -> dong`；
- 反向替换：普通加杠后真实补牌 `tiao5 -> tong6`；
- 同构普通加杠结果为 `addedKongFakeWin`、`平胡`、`[+6,-2,-2,-2]`，且物理手牌保留 `tiao5`。

浏览器规则包 SHA-256：`aec5d210d7c297249df319fc0aa487f9d3ddbd91ce069295559680d16b009313`。

## 已通过门禁

- `npm run build`（候选最终脏状态；构建前输出 `Verified intentional browser rule engine override before build`，构建后规则包 SHA-256 不变；候选自身 `.next/BUILD_ID=xLGQoWegpzZ1MuD0aRdoy`）
- `node scripts/build-browser-rule-engine.mjs --check`
- `npm run test:p0-added-kong-wildcard-browser-parity`
- `npm run test:stage8-v2-added-kong-resolution`
- `npm run test:stage8-v2-added-kong-page`
- `npm run test:stage8-v2-action-space`
- `npm run test:stage8-v2-kong-execution`
- `npm run test:normal-concealed-kong`
- `npm run test:p0-ai-self-kong-atomicity`
- `npm run test:p0-direct-chisel-settlement`
- `npm run test:p0-kong-page-persistence`
- `npm run test:p0-special-kong-rules`
- `npm run test:p0-special-kong-page-phase2`
- `npm run test:p0-special-kong-visible-declarations`
- `npm run test:response-restore-revalidation`
- `npx tsc --noEmit`
- `git diff --check`

构建环境只为该进程传入精确候选路径的 `safe.directory`，没有写入全局 Git 配置；Next 的多 lockfile 根目录警告仍出现，但构建成功且候选自身产生上述 BUILD_ID。

## 精确候选差异

- `package.json`
- `public/game/rule_engine.js`
- `public/game/wannian-mahjong.html`
- `scripts/assert-browser-build-artifacts-clean.mjs`（仅允许且验证受控规则包差异）
- `scripts/build-browser-rule-engine.mjs`（新增无写入的 `--check`）
- `scripts/build-production-game.mjs`（只在已验证受控差异时保留规则包）
- `scripts/p0-added-kong-wildcard-browser-parity-regression.mjs`
- `scripts/p0-special-kong-page-phase2-regression.mjs`
- `scripts/response-restore-revalidation-regression.mjs`
- `scripts/stage1-runtime-hygiene-regression.mjs`
- `scripts/stage8-v2-added-kong-page-adapter-regression.mjs`
- `scripts/stage8-v2-added-kong-resolution-regression.mjs`
- `src/game/rules/added-kong.ts`
- `docs/p0-added-kong-resource-fake-win-candidate-report-2026-08-20.md`

候选未提交、未推送、未部署；没有启动服务或访问浏览器 Storage、用户页面或用户导出。

## 发布前 EOL 可复现性补正

发布树复验发现 Windows checkout 的 `CRLF` 与生成器固定输出的 `LF` 会导致无语义差异的规则包被标记为脏，并使按字节比较的 `--check` 失败。补正后生成器会保留现有规则包的换行风格，并在 `--check` 时按规范化换行符验证内容；规则模块和运行时语义不变。Stage1 卫生回归锁定该边界。此补正不改写此前提交，作为后续普通提交发布。
