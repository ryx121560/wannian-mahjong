# P0 直铲动作分类与付款责任候选验收报告

- 候选工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-p0-direct-chisel-settlement-20260820`
- 候选分支：`codex/p0-direct-chisel-settlement-20260820`
- 基线：`e78465200db541f5ba0b6e0e7329d21698e93763`
- 状态：未提交、未推送、未部署；不含用户导出、Storage、Stage8 或训练资产改动。

## 根因与修复

第20局的“用户暗手三张 1万 + AI对家弃 1万”已满足直铲条件，但页面 `doPong` 先无条件落碰，使该动作转为“碰后资源”并可能走“延迟强行跑杠”。这样结算没有传递点铲责任人，记录为三家各付4分，用户仅加12分。

`doPong` 现在只在实际初始杠声明为 `directChisel` 时转交既有 `doKong` 入口。该入口继续执行既有抢杠检查、声明预检、补牌和原子提交；非直铲仍保留原碰牌及碰后资源路径。

专项 fixture 使用脱敏第20局同构牌面，经真实浏览器规则引擎断言：

- 动作：`directChiselFakeWin`，而非 `forcedRunGangKaiFakeWin`；
- 牌型：`碰碰胡`；
- 付款数组：`[0,4,8,4]`；
- 分差：`[16,-4,-8,-4]`。

即 AI对家（玩家2）付8分，其余两家各付4分，用户净加16分。

## 已复跑门禁

- `npm run test:p0-direct-chisel-settlement`
- `npm run test:p1-kong-settlement-draw`
- `npm run test:stage8-v2-action-space`
- `npm run test:stage8-v2-kong-execution`
- `npm run test:p0-kong-page-persistence`
- `npm run test:p0-ai-self-kong-atomicity`
- `npm run build`
- `git diff --check`

全部通过。构建使用候选树自身输出；构建后 Git 跟踪差异仅限本候选所列文件。

## 最终候选范围

1. `package.json`
2. `public/game/wannian-mahjong.html`
3. `scripts/p0-direct-chisel-settlement-regression.mjs`
4. `docs/p0-direct-chisel-settlement-candidate-report-2026-08-20.md`

待产品复验明确通过后，才可申请提交、推送和部署。
