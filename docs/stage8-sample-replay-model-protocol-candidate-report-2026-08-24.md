# 阶段八离线样本、回放与模型身份协议：候选报告

## 身份与边界

- 候选：`codex/stage8-sample-replay-model-protocol-20260824`
- 基线：`origin/main` `b6a5905f7e082831587d1c50d5dfe9938c626d43`
- PRD：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`
- PRD SHA-256：`26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`

本候选只验证内存 sample/replay envelope：不启动或模拟 selfplay、训练、回放、模型/ONNX、Smoke、Pilot、Arena、Champion 或 runtime；不加载模型、不执行重放、不写样本/文件/目录/训练资产，也不访问用户数据。

## 协议口径

- sample 验证接口显式接收 `Stage8ArtifactRootPreflightInput`，并复用已发布 `validateStage8TrainingControlManifest`；控制层的 root、授权、bootstrap、315 步与下游拒绝任一失败都会转为纯 fused 隔离决定。sample 同时绑定规则、动作空间、合法动作掩码、特征、可见信息、样本 schema、manifest、batch 和运行域身份。
- 模型身份强制模型文件 SHA、ONNX 二进制 SHA、模型 manifest 内容 SHA 与版本化外部 URI；模型文件 SHA 必须与训练 manifest 的模型身份一致，batch 必须属于同一 run；只验证声明。
- action evidence 必须携带规则当步完整、规范排序的 `legalActionIds` 与其 SHA；candidate 集合必须逐项精确相等。MCTS 和最终行为分布各覆盖完整集合、均为有限非负数且和为 1；选中动作与实际采样概率必须来自最终行为分布，来源和探索标记不可缺失。
- 可见状态采用递归结构白名单：只接受自身暗手、公开副露/弃牌、积分、座位/轮次、阶段和墙余量等允许字段；任何额外/隐藏字段拒绝。
- replay envelope 绑定固定 seed、规范 action ID、前/后状态哈希、公开事件哈希、执行域、可见状态哈希及终局奖励。终局必须是四家有限且严格零和 delta；非终局必须引用同 episode 的终局奖励身份，不能用中间分数代替。
- 任一失败输出纯 `fused` 隔离决定，零副作用。

## RED/GREEN

- RED：候选不等于完整合法集合、任一分布缺动作/NaN/非 1、选中概率不一致、未版本化 URI、可见状态额外隐藏字段、非法终局 delta、replay/执行域不匹配，均失败关闭。
- GREEN：完整内存 envelope 可稳定重算 sample 指纹；未启动 selfplay、未写 assets。

## 验证与范围

- `npm run test:stage8-sample-replay-model-protocol` 通过：完整合法动作集合精确相等、双分布、选中概率、可见 schema、模型/ONNX/模型 manifest 身份、终局奖励/非终局引用、replay envelope 与纯熔断均有 RED/GREEN；另验证 `allowSmoke=true`、授权 false、phase 篡改和 315 篡改即使重新计算 manifest 哈希仍由已发布训练控制协议拒绝。输出确认 `selfplayStarted=false`、`artifactsWritten=false`。
- `npm run test:stage8-training-control-protocol`、`npx tsc --noEmit --incremental false`、`node scripts/build-browser-rule-engine.mjs --check`、`git diff --check` 通过。
- `npm run test:stage8-offline-integrity` 在候选树通过，包含既有离线完整性、Stage8 v2、Next build 8/8；构建后规则包和三项冻结浏览器包身份复核通过，OS 临时快照已清理。
- 精确 4 个项目文件：`package.json`、`src/game/stage8/sample-replay-model-protocol.ts`、`scripts/stage8-sample-replay-model-protocol-regression.mjs`、本报告。不含训练产物、页面、服务、规则或现有控制协议改动。
