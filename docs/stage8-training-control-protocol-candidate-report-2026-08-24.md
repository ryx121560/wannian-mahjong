# 阶段八训练控制、样本版本与熔断隔离：候选报告

## 身份与严格边界

- 候选：`codex/stage8-training-control-protocol-20260824`
- 基线：`origin/main` `95aafbc9c20fb638d3149499b4c67b17627a37ac`
- PRD：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`
- PRD SHA-256：`26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`

本候选只新增纯内存控制决策与离线回归。它不创建目录、manifest、样本、模型、ONNX、checkpoint、replay 或报告；不启动或模拟训练、自弈、Smoke、Pilot、Arena、Champion、runtime 或服务；不读取浏览器 Storage、用户页面、用户对局或导出。

## 真源映射与缺口

- `docs/rules.md` 明定规则真源为 `src/game/rules`；本候选不复制或修改规则、计分或动作执行。
- 已发布 `src/game/stage8/artifact-root-preflight.ts` 是唯一外置根规则：显式、绝对、已存在、目录，且不得在项目/worktree 内。本候选直接复用它，未另造路径语义。
- 已发布 `offline-round-adapter.ts` 提供可见信息投影与动作来源；本候选不改变其内容，而是在 manifest 中强制绑定可见信息、特征、动作空间和合法动作掩码身份。
- 现有工程不存在训练控制身份、批次状态机、315 步、熔断隔离或恢复声明验证的纯协议；这正是本候选填补的前置缺口。

## 实现契约

`src/game/stage8/training-control-protocol.ts` 仅输出普通对象：

- manifest 强制固定控制协议版本，并要求显式 `authorization.approvalId` 且 `authorization.granted === true`；缺失或 false 一律拒绝，代码不会生成授权。
- 强制哈希绑定：运行域、规则、动作空间、合法动作掩码、特征、可见信息、课程、探索、模型、样本协议、训练控制域、自弈运行域与 Arena 域。manifest 自身也须由稳定排序的 SHA-256 重新计算匹配。
- `visibleInformationSha256 === featureSha256`、`legalActionMaskSha256 === actionSpaceSha256` 是不可省略的同版本绑定。
- 只允许 `bootstrap` 计划；`allowSmoke`、`allowPilot`、`allowArena`、`allowChampion`、`allowRuntime` 必须全部为 false。
- batch ID 绑定 run ID 并防重复；纯状态机只允许 `planned → prepared → fused`，`endStep` 严格不得超过 315；任一已准备 batch 请求超过自身 `endStep` 时输出 `batch-step-boundary-exceeded` 的 `fused` 隔离决策，请求第 316 步或以后输出 `step-limit-exceeded` 的 `fused` 隔离决策。
- hard failure 只产生 `fused` + isolation decision；不会创建隔离目录或写入样本。
- 恢复只验证内存 batch ledger 与 checkpoint 声明：两者的最后完整 checkpoint ID/step 必须严格相等，且 batch、隔离 ID、模型、manifest、运行域和完整身份哈希均须与当前 manifest 完全一致；不读取、创建或写入实际 checkpoint。

## RED/GREEN

- RED：缺授权/授权 false、缺/相对/项目内 artifact root、缺失或错配的任一身份哈希、可见信息/特征或合法掩码/动作空间未绑定、重复 batch ID、`endStep=50` 请求 51、316 步、下游流程标志、ledger/恢复声明非最后完整 checkpoint、隔离或任一身份错配恢复，均失败关闭；每个身份字段均有 manifest 哈希篡改断言。
- GREEN：同一冻结身份下只可规划 bootstrap batch；检测 hard failure 后输出纯隔离决定；满足隔离、身份和 checkpoint 声明时才允许纯恢复决策。

自动化通过不是训练或任一后续流程授权。训练仍不可启动：实际训练编排、样本写入、模型/检查点、Smoke/Pilot/Arena/Champion/runtime 以及独立产品授权都不在本候选中。

## 验证与范围

- `npm run test:stage8-training-control-protocol` 通过：验证外置根复验、授权默认拒绝、每个 manifest 身份字段哈希篡改、可见信息/合法掩码绑定、唯一 batch ID、`end=50` 时 50 放行/51 熔断、`end=315` 时 316 熔断、硬异常隔离、ledger 最后完整 checkpoint 恢复证明及下游流程拒绝。输出确认 `trainingStarted=false`、`artifactsWritten=false`。
- `npm run test:stage8-artifact-root-preflight` 通过；`npx tsc --noEmit --incremental false`、`node scripts/build-browser-rule-engine.mjs --check`、`git diff --check` 通过。
- 既有 `npm run test:stage8-offline-integrity`（含 Next build 8/8、构建后规则包校验、冻结包身份和快照清理）在本候选中通过；本轮协议后续修改不涉及其构建路径或浏览器规则包。
- 精确 4 个项目文件：`package.json`、`src/game/stage8/training-control-protocol.ts`、`scripts/stage8-training-control-protocol-regression.mjs`、本报告。Vault 脱敏来源单独维护在知识库，不属于项目提交范围。
