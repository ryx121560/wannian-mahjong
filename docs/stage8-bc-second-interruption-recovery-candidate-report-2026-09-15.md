# Stage8 BC Pilot 第二次中断恢复与证据协议候选报告

- 状态：`candidate`（未提交、未推送、未部署、未执行正式隔离）
- 日期：2026-09-15
- 基线提交：`dbfb6203bd565667755c97ff44769e8a546c8c9f`
- 分支：`codex/stage8-bc-second-interruption-recovery-20260915`
- 正式 PRD SHA-256：`26535aa0d5eee6c87ea2b5021faffaa561a0453c14166f78098d37c1f1139098`

## 结论

候选新增默认拒绝的 v2 第二次运维中断证据协议，以及唯一明确的 `stale -> quarantine` 恢复入口。v2 不绑定旧 runId、旧源码提交或 32 分片常量；运行身份、文件身份、状态链头和实际分片身份全部由受控输入与现场只读检查派生。已发布的 v1 前序证据验证继续只作为不可变历史兼容入口，不被重签或重解释。

`--check` 永远零写；`--quarantine` 还必须显式设置 `STAGE8_BC_SECOND_INTERRUPTION_QUARANTINE=1`。入口在任何写入前完成全部验证，并在写入前立即再次完整读取和比较 authorization/control、LOCK、完整状态链、进程三态与分片身份；随后使用 `wx` 独占创建可复算 evidence/marker，再对 `.partial` 执行一次同卷原子目录 rename。既有 `.partial.quarantine`、正式 final、已存在恢复文件、任一身份/状态/分片漂移、活进程或进程探测不确定都会失败关闭；不覆盖、不续跑、不自动重试，也不允许第三次尝试。

## 精确候选文件范围

1. `package.json`
2. `src/game/stage8/offline-bc-operational-interruption.ts`
3. `scripts/stage8-bc-second-interruption-recovery.mjs`
4. `scripts/stage8-bc-second-interruption-regression.mjs`
5. `docs/stage8-bc-second-interruption-recovery-candidate-report-2026-09-15.md`

未修改规则、页面、AI 策略、corpus runner、监督器、训练、模型、服务、数据库或依赖定义。

## v2 绑定与门禁

- v3 run authorization：校验协议/授权哈希，并记录逻辑身份与原文件 SHA-256。
- predecessor evidence：复用已发布 v1 validator，绑定 predecessor runId、证据身份与原文件 SHA-256。
- 三份 control：分别调用 artifact、corpus、supervision validator；绑定各自 manifest 身份和原文件 SHA-256，并复核 run/source/authorization/predecessor 交叉引用。
- policy/capacity：要求 artifact v2、corpus v3、单 worker、既有中断数 1、最大中断数 1、自动重试 0、seed override 0、`allowThirdAttempt=false`；corpus validator 同时复核 5 GiB、64 GiB 与 80% 容量定义。
- supervision：`LOCK.json` 必须逐字段绑定首个状态；所有 `status-NNNNNN.json` 必须从 0 连续、逐项通过自哈希和前序哈希验证，运行命令身份不得漂移。
- stale：末状态必须仍为 `running` 且无 terminal/exit/signal，心跳超过 control 的 stale 阈值；launcher、supervisor、worker 三个 PID 均必须被可靠探测为不存在。PowerShell 探测采用严格三态，要求 `error` 为空、`signal=null`、`status=0`、stderr 为空，并逐字段验证 JSON schema、查询 PID 与返回 PID；`status=null`、spawn error/EPERM、非零退出、signal、stderr、空输出、畸形 JSON 或 PID 不一致全部熔断。
- partial corpus：正式 final/既有 quarantine/committed manifest/ledger 均不得存在；只接受连续 `batch-000001` 至 `batch-000016`，每批一个可解析 gzip shard；记录逐分片路径、字节数、records、SHA-256、聚合 SHA-256、总 records、总 bytes 与末次写入时间。
- 证据结论固定为第二次外部运维中断、原基准失效、diagnostic-only、有效 Pilot 局数 0、禁止 resume/第三次尝试；不把 16 个分片计入正式语料。
- `--verify` 会重新读取并验证授权/control、完整 supervision 链、stale/无活进程事实、quarantine 分片、evidence 与 marker，不依赖首次内存结果。
- 原子 rename 后若后验验证失败，返回 `quarantined-but-verification-failed`、`filesWritten=2`、`atomicRenameCompleted=true` 以及 staging/quarantine 实际存在性；不自动回滚、不自动重试，也不把已发生隔离误报为零副作用。

## RED / GREEN

RED（实现前）：

- `npm.cmd run test:stage8-bc-second-interruption`
- 结果：`ERR_MODULE_NOT_FOUND`，缺少 `scripts/stage8-bc-second-interruption-recovery.mjs`，退出码 1。

GREEN（实现后，全部使用 OS 临时目录）：

- `npm.cmd run test:stage8-bc-second-interruption`：PASS。
- 覆盖：零写 check、16 分片、完整状态链、stale、三 PID 缺失、control/authorization/predecessor 绑定、活进程拒绝、新鲜心跳拒绝、状态篡改拒绝、control 漂移拒绝、分片篡改拒绝、既有 quarantine 拒绝、缺少隔离授权拒绝、单次原子 rename、二次调用拒绝、独立 `--verify`、marker 篡改拒绝。
- 进程探测专项：正常退出且明确不存在为 GREEN、明确存在为 RED；`status=null`、spawn error、非零、signal、stderr、畸形 JSON、查询 PID 不一致、返回 PID 不一致以及注入探测器抛错/非法返回全部拒绝。当前受限宿主实际 PowerShell `spawn EPERM` 也按失败关闭处理。
- TOCTOU/失败记账专项：首次检查与写入前完整复查之间修改第 16 分片会以 `pre-write-recheck-drift` 零写拒绝；原子 rename 后模拟活进程导致后验失败时，精确返回 `quarantined-but-verification-failed`、写入 2、quarantine 存在且 staging 不存在。
- 输出固定声明：`temporaryFixtureOnly=true`、`formalPathsRead=0`、`automaticRetries=0`、`allowThirdAttempt=false`。

## 验证结果

- 新专项回归：PASS。
- 新增脚本 `node --check`：PASS（2/2）。
- 目标 TypeScript 类型检查：PASS。
- 既有 `test:stage8-bc-run-identity`：PASS，81 项 source identity，正式证据/control 写入 0。
- 既有 `test:stage8-bc-corpus`：PASS，64 局计划协议夹具，实际 Pilot 0 局、产物写入 0。
- 既有 `test:stage8-bc-artifact-control`：PASS，artifact 写入 0、Python/训练/Smoke 0。
- `test:stage1-runtime-hygiene`：PASS。
- 浏览器规则包 `--check`：PASS。
- 冻结非规则浏览器生成包身份：PASS。
- `git diff --check`：PASS。

当前环境中的非候选阻断：

- 全量 TypeScript 检查因当前安装缺少 package.json 已声明的 `onnxruntime-node` 而失败，错误位于未修改的 `offline-onnx-inference-adapter.ts`；目标文件独立类型检查通过。
- `test:stage8-bc-corpus-preflight` 缺少必需的 `STAGE8_PYTHON` 环境变量，未进入聚合执行。
- 既有 supervision 与 corpus-cli 回归在当前 Node 24 环境的嵌套 `spawnSync` 返回 `status=null`；独立 runner 回归可直接通过，本候选未修改这些脚本。
- `npm.cmd run build` 在 Next 编译阶段以 `spawn EPERM` 失败；构建前生成包随后已复核，无额外工作树差异。

## 正式路径零接触与副作用边界

- 未读取、列举、哈希、移动或修改 `E:\WannianMahjongStage8\artifacts\formal-bc-corpus-pilot-20260913.partial`。
- 未读取、列举、哈希或修改正式 `.supervision`、三份 control、`run-authorization-v3.json` 或 `predecessor-evidence.json`。
- 正式 Pilot 新增执行 0 局；正式隔离执行 0 次；正式文件写入 0。
- 训练、Smoke、selfplay、replay、模型、ONNX、checkpoint、服务、18768、部署和用户数据访问均为 0。
- 未提交、未推送；正式执行必须在本候选通过产品验收并另行授权后进行。
