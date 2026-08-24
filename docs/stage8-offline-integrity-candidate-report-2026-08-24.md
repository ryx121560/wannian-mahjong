# 阶段八离线环境完整性与训练产物外置前置：候选缺口报告

## 身份与边界

- 候选分支：`codex/stage8-offline-integrity-20260824`
- 基线：`origin/main` 的 `435d03f86e55595dc845a3734f61701a816c2378`
- 正式 PRD：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`
- PRD SHA-256：`26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`
- 规则真源：`docs/rules.md`，实现真源为 `src/game/rules`

本报告只读审计后新增；没有启动训练、自弈、replay、模型、Smoke、Pilot、Arena、Champion、runtime 或服务，也没有读取浏览器 Storage、用户页面或用户导出。

## 已可复用的真源能力

| 需求 | 现有真源/执行器 | 结论 |
| --- | --- | --- |
| 合法动作派生 | `src/game/rules/index.ts#getLegalActions` | 可复用，但只返回动作类别 |
| 胡牌复核 | `src/game/rules/hand-evaluator.ts#canWin` | 可复用 |
| 普通胡牌计分 | `src/game/rules/score-calculator.ts#scoreSettlement` | 可复用，零和由结果断言 |
| 直铲、强跑、连杠 | `src/game/stage8/round-engine-v2.ts#executeStage8V2RoundKongAction` | 可复用真实杠解析与结算 |
| 普通加杠 | `resolveAddedKongDraw` 及 v2 round executor | 可复用 |
| 普通暗杠 | `src/game/stage8/action-space-v2.ts#simulateStage8V2NormalConcealedKong` | 可复用 |

## 原始缺口与产品裁定

PRD 第 3、5、11、15 节要求离线环境执行完整状态转移、使用真实终局积分、可重放、墙尽正确结束，并在规则/状态异常时熔断。

当前 `src/game/rules` 没有下列纯函数；`round-engine-v2` 也没有通用等价执行器：

1. 普通摸牌提交（含墙尽前后状态）。
2. 普通弃牌提交和响应窗口建立。
3. 碰与过的提交、响应窗口收束及下一位摸牌。
4. 点炮/自摸的原子终局提交。
5. 墙尽流局的规则终局与结算接口。

页面 `public/game/wannian-mahjong.html` 具有这些流程，但它还包含计时器、渲染、Storage、AI 调度和产品 UI 状态；把页面逻辑复制到离线训练环境会形成第二套规则，违反 `docs/rules.md` 的“页面委托 `src/game/rules`”约束。

特别地，页面 `drawGame()` 当前将流局积分变更为零，但规则真源并没有可调用、可测试的 `resolveDrawSettlement`。产品已于本候选明确裁定墙尽流局固定为四家分差 `[0,0,0,0]`，因此该口径现由新增纯规则转移真源显式返回，而非由 Stage8 测试猜测。

## 已实施的最小真源扩展

新增无副作用的 `src/game/rules/round-transition.ts`，并从 `src/game/rules/index.ts` 导出：

- 输入为完整 `GameState`、显式 actor 与规范动作；输出不可变的下一状态、公开事件、可选 `SettlementResult` 或结构化熔断原因。
- 普通胡牌必须复用 `canWin` 与 `scoreSettlement`；杠动作必须委托现有 `resolve* KongDraw` 与对应结算器。
- 墙尽在真源中显式返回 `[0,0,0,0]` 的零和终局契约。
- 任一非法动作、状态不一致、无牌可摸、NaN/非零和、重复终局或不可重放必须返回 fail-closed，不写任何训练产物。

同时新增：

- `src/game/stage8/offline-round-adapter.ts`：只暴露当前行动者可见的手牌、公开副露/弃牌、分数、轮次、墙剩余数量；不暴露对手暗手或墙顺序。状态提交始终委托规则真源。
- `src/game/stage8/artifact-root-preflight.ts`：默认拒绝；仅接受显式、已存在的 Windows 绝对目录，拒绝项目根、任一 worktree 及其子目录；仅校验，不创建、不写入。
- `scripts/stage8-offline-round-integrity-regression.mjs` 与 `scripts/stage8-artifact-root-preflight-regression.mjs`，由 `npm run test:stage8-offline-integrity` 聚合。

后续补正：

- 玩家镜像积分在所有终局通过 `normalEnd` 与 `scores` 同步，并以零和断言保护。
- 弃牌响应使用 `responseQueue`，依弃牌后的座位顺序逐人处理；前位“过”不会跳过后位。`resolveDiscardWinner` 同时尊重同轮、同牌的过牌记录，因此后续响应仍可按现有点炮优先规则重算。
- 普通加杠若可抢杠，建立 `pendingKong` 响应窗口；`robKongWin` 使用既有 `canWin + scoreSettlement(抢杠)`，全部响应者过后才重新执行原加杠。
- 规则包白名单仅为 `public/game/rule_engine.js`；生成命令为 `node scripts/build-browser-rule-engine.mjs`，其后 `--check` 通过，SHA-256 为 `45618A919BA9D144138AFAE44CF9A792A8CF0FDBA28BAFFADBD4AD29DEF85620`。其他生成包、`tsconfig.tsbuildinfo` 与额外文件不在白名单。

## RED/GREEN 与门禁

- RED：新增前没有 `transitionRound` 或外置产物根预检；此前 Stage8 预检仅能做受控弃牌 smoke，不能提交普通回合。
- GREEN：新回归覆盖抽牌、弃牌、碰、过、点炮、自摸、暗杠、普通加杠、直铲、强行跑成功/失败、墙尽零分、非法动作零副作用、可见信息投影、牌数守恒及四个固定种子重放哈希。
- `npm run test:stage8-offline-integrity` 通过：新离线回归、产物根预检、既有 Stage8 v2 action-space 与 kong-execution 门禁均通过。
- `npx tsc --noEmit --incremental false` 通过；`git diff --check` 通过。
- 本轮复验（2026-08-24）：`npm run test:stage8-offline-integrity` 在隔离候选树通过，包含 Next `build` 8/8、构建后直接 `node scripts/build-browser-rule-engine.mjs --check` 和三项冻结包身份复验；`npm run test:stage8-offline-coverage-matrix`、`npx tsc --noEmit --incremental false` 也通过。构建后未发现该工作树专属 OS 临时快照；三项冻结包 SHA-256 仍分别为 `35c1bcece0bb579687bf91056bd541dcc283a79879bd580aa1044ad729864b01`、`ddc570b481d53e226e3405a54340a08ecf1b4ac09ef0c74e4de5618992975fc9`、`126ee7a472f5c7cfb8b37a8bcf7e91be29fa0f46acba028c64a3aaffcd3d58f5`。
- 运行时卫生补验（2026-08-24）：`npm run test:stage1-runtime-hygiene`、`npm run test:runtime-build-isolation`、`npm run test:production-launch` 均通过。前者同步验证新的冻结内容身份/临时快照/finally 清理契约，未放宽到其他生成包；本轮未部署、未启动或替换 18768。

## 本次候选精确范围

共 18 个文件：`package.json`、`public/game/rule_engine.js`、`src/game/rules/{index.ts,kong-resource.ts,types.ts,round-transition.ts}`、`src/game/stage8/{artifact-root-preflight.ts,offline-round-adapter.ts}`、`scripts/{assert-browser-build-artifacts-clean.mjs,build-production-game.mjs,prepare-browser-build-artifacts.mjs,stage1-runtime-hygiene-regression.mjs,stage8-artifact-root-preflight-regression.mjs,stage8-offline-coverage-matrix.mjs,stage8-offline-four-player-batch-regression.mjs,stage8-offline-integrity-gate.mjs,stage8-offline-round-integrity-regression.mjs}` 与本报告。除有意可再生的 `public/game/rule_engine.js` 外，未包含其他浏览器生成包差异、`tsconfig.tsbuildinfo`、训练产物或页面/服务改动。

## 完整性矩阵补充

- `npm run test:stage8-offline-coverage-matrix` 将普通 136 张四家固定种子局与定向规则矩阵分开报告。普通域有 8 个固定种子，逐局从 136 张/每种 4 张牌池发牌，并验证牌守恒、唯一终局、积分零和、有限数值和同种子重放。
- 定向域逐项记录 `concealedKong`、`addedKong`、`directChisel`、立即/延迟强跑、暗强跑、候选暗杠、双碰强跑、连杠、碰、过、点炮、自摸、墙尽的合法机会、实际执行和结果，并输出每个 fixture 独立 SHA-256 身份及汇总重放哈希。
- 信息泄露审计递归扫描策略投影，拒绝对手暗手、未来墙、墙序、完整状态及同义字段；本次 findings 为 0。策略投影只包含自己暗手、公开副露/弃牌、分数、座位/轮次、阶段及墙剩余数量。
- 该矩阵明确不是 PRD 的 1000 局训练 Smoke：不写训练样本、不输出行为分布或行为概率、不作为策略强度、罕见动作 Smoke、Pilot、Arena 或训练授权证据。

## 当前边界（离线环境完成，不等同训练流水线）

本候选已完成链杠、碰后候选暗杠、双碰强跑、延迟强跑的 canonical 声明、规则解析、原子状态提交与定向回放，并完成四家 136 张固定种子完整性批量及泄漏审计。这里的“完整离线环境”只指规则执行和完整性验证环境；它不包含、更不授权启动 PRD 的训练流水线。

## 当前准入结论

**不可启动。**

训练仍不可启动的原因是 PRD 的训练控制、样本版本与隔离、模型/行为分布、1000 局 Smoke、Pilot、Arena、Champion、runtime 与独立授权均不在本候选内。PRD 历史 Candidate-2/3、历史工作树及其资产仅作历史说明，不能作为本轮运行、恢复或复用授权。

## 不可跨越的边界

- 不在页面训练，也不复用用户导出作为训练数据。
- 本轮不创建目录、样本、模型、checkpoint、replay 或任何训练产物。
- `STAGE8_ARTIFACT_ROOT` 预检已实现，但本轮没有设置、创建或写入任何外置路径。
- 构建卫生不依赖 Git 子进程：三个非 `rule_engine.js` 生成包分别以候选基线 SHA-256 验证；`prebuild` 在重新生成前将这三项已验证的精确字节保存到按工作树路径隔离、拒绝覆盖既有快照的 OS 临时目录。预生成失败时立即清理快照；生产构建在 `finally` 中无论成功或失败均只从该快照逐项写回这三项、再次验证 SHA-256，随后删除快照。快照创建、恢复、校验或清理任一失败均失败关闭，项目树中不写临时快照或恢复文件。`rule_engine.js` 绝不进入快照或恢复流程，只允许当前 `src/game/rules` 的 `--check`。报告中的状态表述为“生成包内容身份验证”，不声称 Git clean；release/部署构建同样不再依赖 `git restore`。
- `npm run test:stage8-offline-integrity` 的外层发布门禁固定顺序为：离线规则/路径/既有 Stage8 门禁通过，随后 `npm run build` 成功，再直接执行 `node scripts/build-browser-rule-engine.mjs --check`，最后重新验证三项冻结生成包的精确 SHA-256 身份。后两项不是 build 的内嵌结论，而是 build 成功后的必经外层门禁。
- 本报告不构成 Smoke、Pilot、Arena、Champion、runtime 或部署授权。
