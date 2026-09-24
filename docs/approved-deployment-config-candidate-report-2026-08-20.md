# 已批准部署路径配置候选验收报告

## 状态

- 候选待产品复验。
- 未提交、未推送、未部署。
- 基线：`origin/main=b2b41f4d68aaf4d6d84ac86430464e376c0b4dab`。

## 目的与范围

本候选只解除已发布 P0 修复的安全部署配置阻断，不改变麻将规则、页面对局、计分、快照、AI 决策或任何 Stage8/训练链路。

变更文件：

- `src/lib/rl-weights-file.ts`
- `src/lib/game-record-export.ts`
- `scripts/start-production-game.mjs`
- `scripts/approved-deployment-paths-regression.mjs`
- `scripts/rl-weights-path-regression.mjs`
- `scripts/p2-game-export-regression.mjs`
- `package.json`
- 本报告。

## 配置语义

- `APPROVED_RL_WEIGHTS_FILE` 是唯一权威权重来源，必须为已存在的绝对文件路径。
- `APPROVED_GAME_EXPORT_DIR` 是唯一权威导出目录来源，必须为已存在且可写的绝对目录。
- 遗留 `RL_WEIGHTS_FILE` 与 `GAME_EXPORT_DIR` 可选；若设置，必须为绝对路径且规范化后与对应 `APPROVED_*` 完全一致。
- 缺失、相对、目标不存在、类型错误或不一致均失败关闭；不回退到 `process.cwd()`，不创建目录，也不由路径校验写入用户数据。
- `load_rl`、`save_rl` 与 `save_rl_full` 都在任何读取或写入前通过 `requireExistingRlWeightsFile()` 校验权威文件；路由自身无 cwd 回退，也不会在目标不存在时创建权重文件。
- 生产启动器在启动子进程前校验端口、权重和导出目录，并将同一经过校验的绝对路径显式传递给运行环境。

## RED/GREEN 证据

RED：只提供 `APPROVED_RL_WEIGHTS_FILE` 时，旧实现报 `RL_WEIGHTS_FILE is required`，证明旧代码不满足“APPROVED 优先”。

GREEN：新增 `test:approved-deployment-paths`，覆盖：

- 仅 `APPROVED_*` 的权重和导出路径生效；
- 缺失、相对、不存在路径拒绝；
- 显式遗留路径与批准路径不一致拒绝；
- 三条权重 API 静态确认均要求已存在的权威文件且无 cwd 回退。

## 验证结果

- `test:approved-deployment-paths`：通过。
- `test:rl-weights-path`：通过。
- `test:p2-game-export`：通过。
- `test:production-launch`：通过。
- `test:p0-post-pong-kong-reachability`：通过。
- `test:p0-kong-page-persistence`：通过。
- `test:stage8-v2-action-space`：通过。
- `test:stage8-v2-kong-execution`：通过。
- `test:response-restore-revalidation`：通过。
- `npx tsc --noEmit --incremental false`：通过。
- `git diff --check`：通过。

## 预部署条件

已实际确认以下产品指定路径存在：

- `C:\Users\Administrator\Documents\NEW\rl_weights.json`
- `C:\Users\Administrator\Desktop\workspace\json`

当前仍未启动 18768，未访问用户浏览器 Storage 或用户对局，未启动或创建 selfplay、replay、训练、模型、Smoke、Pilot、Arena、Champion 或 runtime 产物。
