# Stage 8 注册后 XML 安全白名单语义补正候选报告（2026-09-22）

## 结论

候选已在 `origin/main=3730c5641b060632a840149bdb198a7d65642215` 的干净隔离工作树完成。变更仅涉及 XML 身份 validator、其专项回归和本报告三个文件；未引入依赖，未改变任务注册执行器、Host 协议、RegistrationEvidence schema 或版本。

本轮没有执行 `--register-and-verify`，没有真实注册或运行任务，没有写入 registration evidence，也没有提交、推送或部署。

## 首次正式尝试的失败关闭

在本候选之前，唯一一次正式 `--register-and-verify` 临时注册已完成以下闭环：

1. Task Scheduler 成功接受正式 XML；
2. `Export-ScheduledTask` 的输出与正式 XML 全文规范化比较不相等；
3. 协议以 `windows-task-register-execution-exported-task-xml-drift` 熔断；
4. 本轮创建的任务被撤销；
5. 本轮创建的 `\WannianMahjong\Stage8\` 与 `\WannianMahjong\` 按逆序删除；
6. registration evidence 未落盘；
7. 任务、两级文件夹、证据与 partial 均为零残留。

本候选开发完成后没有重试真实注册。

## 根因证据

使用 `Schedule.Service.NewTask(0)` 的内存零写规范化复现确认，Windows 在 `<Settings>` 中精确补入三个系统默认项：

```xml
<IdleSettings><StopOnIdleEnd>true</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
<DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
<UseUnifiedSchedulingEngine>false</UseUnifiedSchedulingEngine>
```

旧 validator 要求正式 XML 与导出 XML 在通用空白规范化后全文相等。把上述实测默认项按真实插槽加入脱敏同构 fixture 后，旧实现稳定 RED：

```text
oldImplementation=RED
error=windows-task-register-execution-exported-task-xml-drift
```

## 精确白名单边界

补正没有采用通用 XML 删除或宽松语义比较，只允许以下精确差异：

- 正式 XML 缺少 `IdleSettings` 时，导出 XML 可在 `RunOnlyIfNetworkAvailable=false` 后出现一次完整固定节点；
- 正式 XML 缺少 `DisallowStartOnRemoteAppSession` 时，导出 XML可在 `RunOnlyIfIdle=false` 后出现一次且值只能为 `false`；
- 正式 XML 缺少 `UseUnifiedSchedulingEngine` 时，导出 XML 可在前一默认项之后出现一次；前一默认项缺失时可直接位于 `RunOnlyIfIdle=false` 后，值只能为 `false`；
- 三项可以分别出现或缺失，但出现时必须保持 `DisallowStartOnRemoteAppSession` 在 `UseUnifiedSchedulingEngine` 之前；
- 每个允许项被精确移除后，导出 XML 仍须与正式 XML 全文相等。

以下情况继续熔断：

- 默认值改变、Idle 子项改值、缺项或调序；
- 重复节点、额外属性、Settings 外出现、Settings 内错误插槽；
- 未知 Settings 节点或删除正式节点；
- 增加 trigger、action 或 principal；
- TaskPath/TaskName、Command、Arguments、WorkingDirectory、唯一触发器、开始/结束边界发生变化；
- UserId、S4U、LeastPrivilege、IgnoreNew、StartWhenAvailable=false 或 PT15M 发生变化；
- 出现 Repetition 或 RestartOnFailure。

因此三个系统默认项之外的任何新增、删除或替换仍会触发 `exported-task-xml-drift` 或 `exported-task-policy-drift`。

## RED/GREEN 与门禁

专项命令通过，共 82 项：

```text
node --experimental-loader <existing-typescript-resolution-loader> scripts/stage8-windows-task-register-execution-regression.mjs
```

覆盖结果：

- 原始精确 XML：GREEN；
- 三个默认项分别出现/缺失及七种非空组合：GREEN；
- 三个实测默认项完整同构输出：GREEN；
- 值、Idle 子项、顺序、重复、属性、位置漂移：RED；
- trigger/action/principal、命令、参数、工作目录、时间边界、核心 Settings 漂移：RED；
- `productionSchedulerCalls=0`；
- `actualScheduledTasksMutated=0`；
- `realFilesWritten=0`。

相邻门禁：

- Host 协议回归通过，`scheduledTasksMutated=0`；
- register approval/authorization-input 回归 43 项通过，`scheduledTasksMutated=0`、`filesWritten=0`、`phaseAuthorizationsIssued=0`；
- `node --check scripts/stage8-windows-task-register-execution-regression.mjs` 通过；
- 目标 TypeScript strict TSC 通过。

正式沙箱外 `--check` 同样通过：目标任务、`\WannianMahjong\`、`\WannianMahjong\Stage8\`、registration evidence 与 partial 均不存在；重复检查字节一致，`filesWritten=0`、`directoriesCreated=0`、`scheduledTasksMutated=0`。mutation 门禁未设置，也没有调用 `--register-and-verify`。

## RegistrationEvidence 后续协议风险

现有 `RegistrationEvidence.exportedTaskXmlSha256` 被 Host v1 validator 约束为正式材料 XML SHA-256，并不表示 Windows 原始导出字节的 SHA-256。当前候选没有伪称其为原始导出字节哈希，也没有越界修改 Host schema 或版本。

如果后续需要同时证明“正式语义身份”和“原始导出字节留痕”，应单独设计下一版证据字段与迁移方案；不能在本候选中回填或改变现有字段语义。

## 范围与状态

精确项目文件范围：

1. `src/game/stage8/offline-windows-task-register-execution.ts`
2. `scripts/stage8-windows-task-register-execution-regression.mjs`
3. `docs/stage8-windows-task-register-execution-xml-canonicalization-candidate-report-2026-09-22.md`

候选保持未提交、未推送、未部署，且未重试真实注册或诊断运行。
