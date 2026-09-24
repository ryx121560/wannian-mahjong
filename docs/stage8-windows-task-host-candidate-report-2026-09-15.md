# Stage8 Windows 系统级后台托管协议候选报告（2026-09-15）

## 结论

本候选采用 Windows Task Scheduler 的一次性任务作为 Codex Windows Job 生命周期之外的系统宿主，不采用 Windows Service。当前交付仅包含协议、确定性任务 XML 材料生成器、宿主 runner、一次性诊断载荷和回归；没有注册、启动、停止、禁用或删除任何计划任务或服务。

候选严格限定为一次 12 分钟的可丢弃诊断，不能运行正式 BC Pilot、训练、smoke、自弈、回放或读取模型。未来正式 Pilot 必须使用新的 `runId` 从 0 开始，并另行设计/授权正式 workload schema；本候选 schema 即使获得任意阶段授权也不能把诊断转换为正式 Pilot。

## 基线与影响范围

- 基线提交：`3049696d8cf37efd64f40819d421b8a9b23d482f`
- 候选分支：`codex/stage8-windows-task-host-20260915`
- 代码状态：未提交、未推送、未部署
- 新依赖：无
- 数据库变更：无
- 正式 E 盘路径读取：0
- 已隔离 16 局读取/复用：0
- 正式 Pilot 局数计入：0
- Windows 计划任务变更：0
- Windows 服务变更：0

## 架构与故障域

未来获批后的进程关系为：

`Task Scheduler Service -> node.exe -> stage8-windows-task-host-runner.mjs -> 一个附着的诊断子进程`

计划任务服务负责越过 Codex Windows Job 生命周期。runner 不使用 detached 子进程；它只启动一个附着子进程，统一承担锁、容量预检、日志限额、心跳、终态和超时。Task Scheduler 与 runner 均为零自动重试；重复触发使用 `IgnoreNew`，补跑与按需启动均关闭。

## 默认拒绝协议

控制清单使用 exact-schema，并绑定以下不可变身份：

- `hostRunId` 与诊断专用 `targetRunId`
- 发布 commit 与 source bundle SHA-256
- Node 可执行文件、runner、诊断脚本 SHA-256
- 参数、工作目录、环境白名单 SHA-256
- 控制授权 scope、approvalId 与授权 SHA-256
- 控制清单 SHA-256

任何缺字段、多字段、相对路径、环境变量路径、shell、detached、身份漂移、dirty checkout、提交漂移、敏感环境变量、证据目录已存在、容量不足或未知状态均失败关闭。

## Task Scheduler 材料策略

- 单次 `TimeTrigger`，无 repetition。
- `S4U` 登录、`LeastPrivilege`，不存储密码、不要求交互会话。
- `MultipleInstancesPolicy=IgnoreNew`。
- `StartWhenAvailable=false`、`AllowStartOnDemand=false`。
- 无网络/idle/wake 条件，无 `RestartOnFailure`。
- Task 硬上限 15 分钟；诊断载荷 12 分钟并自终止。
- Exec 使用绝对 Node、runner、控制清单与授权路径；`shell=false`。
- 材料生成器只写 UTF-16LE XML 与 JSON，不包含或执行注册命令。
- 已授权材料记录并校验 `materials-emit` 授权哈希；注册与验证阶段会重新验证该授权和材料哈希，未授权草稿不能用于注册证据。

## 分阶段授权

每个动作必须有独立、精确 action/scope 的授权，且授权绑定同一个 `hostRunId` 与控制清单哈希：

1. `materials-emit`：只允许输出确定性 XML/JSON。
2. `register`：只供未来外部注册步骤及注册证据校验使用。
3. `run`：只允许 Task action 启动诊断宿主。
4. `verify`：只允许校验跨已知 10 分钟 Job 租约、Task 结果与进程残留。
5. `delete`：只允许未来执行显式“先禁用、后删除”。

控制授权本身不替代任何阶段授权。候选不提供自签授权或扩大 scope 的入口。

## 证据与资源控制

- OS 临时目录中的全新排他证据目录与 `LOCK.json`。
- stdout/stderr 各 4 MiB 上限；证据总量 16 MiB；单 run 预留 5 GiB；根上限 64 GiB；磁盘 80% 熔断。
- stdout/stderr 使用 `wx` 在 spawn 前完成双句柄准备；任一路径已存在或第二句柄打开失败时，spawn 次数为 0，已打开句柄关闭且既有文件不覆盖，状态链落为唯一 `failed` 终态。
- 状态为 `starting -> running* -> completed|failed|timed-out`，序号递增、前序哈希相连且只有一个终态。
- spawn 失败会关闭两个预开日志句柄后生成唯一失败终态；所有退出路径通过幂等关闭器保证每个句柄最多关闭一次。
- data 回调中的日志写入、短写或容量异常不会逃逸事件循环；它们记录首个熔断原因、只请求一次子进程终止，并等待统一 `failed|timed-out` 收尾。重复 error/close 事件不会生成第二终态。
- 日志超限、证据超限、超时、子进程错误或非零退出均失败关闭，自动重试为 0。
- 验证证据要求存活时间大于 10 分钟、终态完成、`LastTaskResult=0`、实例数 0、自终止、宿主/子进程残留均为 0。
- 清理不自动发生。成功证据必须同时证明已禁用、已删除且任务不存在；失败证据必须保留明确原因，不能伪装为完成。

## 验证记录

- `npm run test:stage8-windows-task-host`：通过；使用内存假子进程与 OS 临时目录，实际等待 0 ms，计划任务/服务变更 0。
- 产品复验补正门禁通过：预置 stdout 时 `spawnCalls=0` 且文件内容不覆盖；第二 stderr 句柄失败时 `spawnCalls=0`、首句柄恰好关闭一次并保留空审计文件；spawn 同步失败时两个句柄各关闭一次；日志写入异常时子进程只终止一次、结果为 failed、句柄各关闭一次、状态链和 terminal 均唯一。
- 新增协议文件的 strict TypeScript 定向检查：通过。
- `test:stage8-training-control-protocol`、`test:stage8-artifact-root-preflight`、`test:stage8-bc-corpus-runner`、`test:stage8-bc-second-interruption`：通过。
- `test:stage8-bc-supervision`：当前 Node 环境中可复现为旧 detached launcher 等待超时，未修改回归文件第 290 行得到 `spawnSync.status=null` 而非 0；失败发生在本候选文件之外。
- 全仓 `npx tsc --noEmit --pretty false`：被基线的 `onnxruntime-node` 类型模块缺失及 `offline-onnx-inference-adapter.ts` 三处连带隐式 `any` 阻断；未发现本候选新增文件错误。

## 尚未授权且未执行的外部动作

以下动作均需产品逐阶段另行精确授权，且不属于本候选代码执行结果：

- 生成某个真实诊断 run 的控制清单和五份外部授权。
- 注册一次性 Windows 计划任务并导出回读 XML。
- 启动并观察 12 分钟诊断。
- 在 Codex 已知 Job 租约之外核验终态、Task 结果与残留进程。
- 先禁用、再删除任务，并生成成功或失败清理证据。
- 设计任何正式 Pilot workload；正式 Pilot 必须用全新 `runId` 从 0 开始。
