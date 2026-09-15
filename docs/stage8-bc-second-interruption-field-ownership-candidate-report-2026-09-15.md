# 阶段八 BC 第二次中断恢复协议字段归属修正候选报告（2026-09-15）

## 候选状态

- 状态：未发布、未提交、未推送。
- 基线：`origin/main`，提交 `a21399e83d9f61471e7e5d2b661245ad2a08c37c`。
- 分支：`codex/stage8-bc-field-ownership-20260915`。
- 隔离工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-bc-field-ownership-20260915`。

## 根因与修正

权威 `stage8-bc-corpus-control-v3` 的 `plan` schema 不包含 `allowThirdAttempt`；该字段归属于 supervision control 的 `policy`。恢复协议此前同时要求 corpus 与 supervision 两处均为 `false`，导致通过权威 corpus 校验的合法 v3 控制在恢复检查中被误拒。

本候选仅删除恢复脚本对 `corpusControl.plan.allowThirdAttempt !== false` 的检查。以下边界保持不变：

- supervision control 仍强制 `policy.allowThirdAttempt === false`；
- workers、中断次数、自动重试、seed override、容量阈值及全部身份/哈希/跨绑定检查保持不变；
- corpus 权威 exact-schema 校验继续拒绝任何多余字段。

## 精确变更范围

1. `scripts/stage8-bc-second-interruption-recovery.mjs`
2. `scripts/stage8-bc-second-interruption-regression.mjs`
3. `docs/stage8-bc-second-interruption-field-ownership-candidate-report-2026-09-15.md`

未引入依赖，未修改正式 authorization、corpus、artifact、supervision、partial 或其他控制/证据文件。

## 回归证据

专项 fixture 改为权威 corpus v3 完整 schema，并直接调用现有 corpus/supervision 校验器。所有 fixture 位于操作系统临时目录，`formalPathsRead=0`。

- RED：在实现修正前，权威校验通过且不含 corpus `plan.allowThirdAttempt` 的合法 v3 fixture 被恢复检查误拒，`checkResult.ok` 为 `false`。
- GREEN：删除错误的 corpus 层条件后，`npm.cmd run test:stage8-bc-second-interruption` 通过。
- corpus 多余 `plan.allowThirdAttempt` 字段即使重新计算 manifest hash，仍由权威 exact-schema 校验以 `bc-corpus-control-nested-schema-invalid` 拒绝。
- supervision `policy.allowThirdAttempt` 缺失、`null`、`true` 均熔断；仅 `false` 可通过。
- 原有进程探测、链路篡改、容量、分片、授权、写前重检、原子隔离与隔离后校验用例继续通过。

## 门禁结果

通过：

- `npm.cmd run test:stage8-bc-second-interruption`
- `node --check scripts/stage8-bc-second-interruption-recovery.mjs`
- `node --check scripts/stage8-bc-second-interruption-regression.mjs`
- 目标 TypeScript `--noEmit` 校验：`src/game/stage8/offline-bc-operational-interruption.ts`
- `npm.cmd run test:stage8-bc-corpus`
- `npm.cmd run test:stage8-bc-supervision`
- `npm.cmd run test:stage8-bc-run-identity`
- `npm.cmd run test:stage8-bc-artifact-control`
- `node scripts/build-browser-rule-engine.mjs --check`
- `node scripts/assert-browser-build-artifacts-clean.mjs`
- `git diff --check`

独立产品复验：

- 产品在同一候选、允许真实子进程的执行环境中运行 `npm.cmd run test:stage8-bc-supervision`，退出码为 `0`。
- 输出确认 `passed=true`、`secondInterruptionQuarantined=true`、`automaticRetries=0`、`thirdAutomaticAttempt=false`、`formalPilotGamesExecuted=0`、`eDriveWrites=0`、`temporaryFixturesOnly=true`。
- 独立复验未修改生产实现或测试脚本，原环境阻塞结论已排除。

## 执行边界确认

- 未运行任何正式 `--check`、`--quarantine` 或 `--verify` 命令；
- 未读取正式路径，专项输出为 `formalPathsRead=0`；
- 未重启 Pilot，未启动训练、Smoke、自弈、回放、模型加载或推理；
- 未访问 18768 或用户数据；
- 未提交、未推送、未部署。
