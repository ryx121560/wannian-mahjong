# P1 积分基线、手动重置与顶部局号候选验收报告

## 状态

- 候选状态：产品复验补正完成，等待重新验收。
- 基线：`origin/main=f0fb91de4d241710c52961fe2e9464a0602e61fb`。
- 分支：`codex/p1-score-baseline-reset-game-number-20260813`。
- 工作树：`.worktrees/codex-p1-score-baseline-reset-game-number-20260813`。
- 未合并、未提交、未推送、未部署。

## 实现范围

1. 页面使用单一 `SCORE_BASELINE=50`：新用户或无效持久化数据回退为四席50；有效持久化积分原样加载，不做运行时迁移。
2. 结算后的统一破产检查将四席重置为50，并保留结算前冻结的结构化 `scoreDeltas`；既有 `bankrupt` 元数据和下一局seat0庄家规则继续生效。
3. “导出记录”旁新增“重置积分”：用户确认后先通过既有受控积分API持久化50；保存失败则不清快照、不启动新局；保存成功后清当前快照并以seat0庄家开始下一局。取消操作零写入。
4. 手动重置不清理最近结算摘要，不改变 `totalGames`、既有 `gameSequence` 计数器或历史导出；开始的新局仍通过既有原子局号分配推进序号。
5. 顶部第一行以 `第N局 | 四席积分` 展示当前持久化局号，idle或旧数据无当前局号时显示“未开始”；第二行最近结算摘要保持原结构和来源。
6. 新增独立一次性迁移工具。工具强制 `RL_WEIGHTS_FILE` 与 `APPROVED_RL_WEIGHTS_FILE` 为相同绝对路径，验证四席分数，先以不可覆盖方式创建原文件备份和脱敏SHA256见证，再原子替换仅 `scores` 字段。见证存在时按哈希幂等退出或恢复已准备迁移；任何路径、结构或哈希不一致均失败关闭。该工具未接入生产启动器，因此服务重启不会重复清零。
7. 控制区允许换行；320/375等小屏使用受视口约束的宽度、间距和按钮尺寸，不恢复短积分条或状态文案。

## TDD证据

- 页面专项红灯：旧页面缺少 `SCORE_BASELINE=50`，首个断言失败。
- 迁移专项红灯：`score-baseline-50-migration.mjs` 尚不存在，模块加载失败。
- 绿灯：`test:p1-score-baseline-reset` 与 `test:p1-score-baseline-migration` 均通过。
- 手动重置行为覆盖：取消、API保存失败、成功持久化、清快照、seat0庄家和单次新局。
- 迁移行为覆盖：只改分数、保留 `totalGames`/模型字段/局号、不可覆盖备份、脱敏见证、重复执行幂等、未批准路径拒绝、无效结构零写入。

## 产品复验补正：旧快照积分来源隔离

- 红测先证明旧实现会在服务端权威积分成功加载后，被进行中快照内的旧 `player.score` 覆盖。
- 页面新增显式 `_authoritativeScoresLoaded` 状态；仅当 `/api/rl/load_rl` 成功返回四席有限数时标记为权威。
- `restoreGameSession()` 保留快照的手牌、副露、墙、phase、庄家、当前座位、局号和可信最近结算摘要，但以已加载权威积分覆盖四席快照分数；恢复过程不调用保存接口。
- 一次性迁移后的权威 `[50,50,50,50]` 覆盖旧快照 `[103,95,90,108]`，顶栏保持“第41局”并显示四席50。
- 有效非50权威夹具 `[71,62,53,44]` 原样覆盖快照，证明恢复不会暗中执行运行时迁移。
- 权威加载失败时不把fallback 50冒充权威；继续使用已通过快照校验的分数，且不调用保存，避免覆盖未知权威数据。
## 验证结果

- P1积分/重置/局号专项：通过。
- P1一次性迁移专项：通过。
- 顶部状态栏、最近结算持久化、庄家继承、P2局号导出、积分绝对路径、生产启动门禁：通过。
- 点炮/抢杠终局手牌、响应三专项、P0资源/特殊杠/页面/可见声明、普通暗杠：通过。
- rules：472/472。
- recommendation：100/100。
- MCTS：154/154。
- strong AI：391/391。
- Stage7 recommendation：320/320。
- Stage7 unified：58/58。
- TypeScript `--noEmit --incremental false`：通过。
- browser rules/recommendation verify：通过。
- production build：通过；仅出现已知多lockfile工作区根目录提示。
- `git diff --check`：通过。

## 候选文件

- `package.json`
- `public/game/wannian-mahjong.html`
- `scripts/dealer-continuity-regression.mjs`
- `scripts/p1-statusbar-regression.mjs`
- `scripts/p1-score-baseline-reset-regression.mjs`
- `scripts/p1-score-baseline-migration-regression.mjs`
- `scripts/score-baseline-50-migration.mjs`
- `docs/p1-score-baseline-reset-game-number-candidate-report-2026-08-13.md`

## 明确未触碰

- 未读取、备份、修改或迁移真实 `rl_weights.json`；候选迁移测试仅使用系统临时目录中的合成数据。
- 未访问、刷新或写入18768及任何用户浏览器Storage。
- 未访问或写入用户导出目录，未改变导出协议、文件名或服务端导出路由。
- 未修改Stage8、特殊杠/普通规则、AI/MCTS/推荐策略、模型、训练、replay、checkpoint或Arena。

## 发布前独立门禁

产品验收后若授权发布，必须在停止会产生积分写入的生产路径后执行：对权威文件做只读哈希核对，运行一次迁移工具，复核备份/见证/目标哈希与保留字段，再从干净运行树部署。不得把迁移命令加入每次启动流程；任何失败均停止发布，不得覆盖权威文件或反复执行清零。
