# Stage 8 Windows 一次性后台诊断任务注册执行候选报告（2026-09-22）

## 结论

候选已完成开发与只读验证。生产入口提供 `--check` 与 `--register-and-verify` 两种明确模式；本轮只执行了 `--check`，没有运行真实注册模式，没有创建计划任务或计划任务文件夹，没有写入 registration evidence，也没有启动诊断任务。

候选基线为 `07c5391bb30e26241baf8f34d4404c8156a147bc`，独立分支为 `codex/stage8-windows-task-register-execution-candidate-20260922`。本轮未提交、未推送、未部署。

## 变更范围

候选严格限制为以下 5 个文件：

1. `package.json`
2. `src/game/stage8/offline-windows-task-register-execution.ts`
3. `scripts/stage8-windows-task-register-execution.mjs`
4. `scripts/stage8-windows-task-register-execution-regression.mjs`
5. `docs/stage8-windows-task-register-execution-candidate-report-2026-09-22.md`

未引入新依赖。

## 安全边界

- check-only 要求 `STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_CHECK=1` 与产品旗标 `--product-approved-register-execution-only`。
- 实际模式要求独立门禁 `STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_MUTATE=1` 与同一产品旗标；check 门禁不能替代 mutation 门禁。
- 实际模式名称为 `--register-and-verify`，没有隐式注册路径。
- 注册使用 Task Scheduler COM 的 `TASK_CREATE=2`，没有 create-or-update、`-Force` 或覆盖逻辑。
- 生产源不包含 `Start-ScheduledTask`，不运行任务，也不接受 run、verify 或 delete 授权。
- 只允许创建 `\WannianMahjong\` 与 `\WannianMahjong\Stage8\` 两级链，并记录本轮实际创建项。
- 失败回滚按 registration evidence、任务、子文件夹、父文件夹的逆序执行；只删除本轮创建项，不删除预先存在的文件夹。
- registration evidence 使用 `open(wx) → write → fsync → close → staging readback → rename → final readback`，每次读回均复用已发布的 `validateStage8WindowsTaskHostRegistrationEvidence`。
- 如果正式 evidence root 尚不存在，实际模式仅在任务注册与只读验证完成后非递归创建；失败时只删除本轮创建且为空的目录。
- 回滚失败会报告任务、文件、文件夹残留和具体 cleanup errors，不伪报清理成功。

## 复用的正式协议

候选复用并重新验证以下已发布能力：

- Host Control 与 Control approval evidence；
- materials-emit phase authorization；
- register phase authorization；
- task materials 与 UTF-16LE task XML；
- Host RegistrationEvidence schema、哈希函数和 validator；
- register approval 中的正式路径、固定文件哈希、材料身份和 XML 重建逻辑。

授权目录必须恰好包含 `materials-emit.json` 与 `register.json` 两个普通文件；材料目录必须恰好包含 `task-definition.xml` 与 `task-materials.json` 两个普通文件。任何 `.partial`、额外条目、目录或符号链接都会熔断。

## 正式只读检查结果

执行命令：

```powershell
$env:STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_CHECK='1'
node scripts/stage8-windows-task-register-execution.mjs --check --product-approved-register-execution-only
```

检查通过，关键事实如下：

- Control manifest SHA-256：`6649c4ae0fa36a0acfccd70aec514e6f2624ea8fe5dbf6760f48fcdc25b788f9`
- material SHA-256：`b712fa4ac5a8779ea5c8aae8ac4f420d54f40c69b1dedb1e10d8f3e53bb0b4c7`
- task XML SHA-256：`d39998594b98998a78d8e0b9547f374d898568a54bf1daefcb362e03fba21eb5`
- register authorization SHA-256：`8200af1cc16cfa280c12bdf446591b3efd72e6fbaf879c3e6fac8964f41672b9`
- register authorization 文件 SHA-256：`fc26aa3ab8796b6ef77a6566d9f2e81ac07a2995567265a618aa403b1ca66744`
- execution check identity SHA-256：`59a7aa66a0250b4545ffed957b9fae8663bd005213716f3f81917e927eb61c7f`
- `\WannianMahjong\`：不存在
- `\WannianMahjong\Stage8\`：不存在
- 目标任务：不存在
- registration evidence：不存在
- evidence root：不存在，可由实际模式按需创建
- 重复 check 输出：字节一致
- `scheduledTasksRead=2`
- `scheduledTasksMutated=0`
- `filesWritten=0`
- `directoriesCreated=0`
- `diagnosticsRun=0`
- `formalPilotGamesCredited=0`
- `trainingRuns=0`
- `deployments=0`

## 注册后验证策略

实际模式注册后必须同时满足：

- TaskPath 与 TaskName 精确匹配 Control；
- S4U；
- LeastPrivilege；
- IgnoreNew；
- 自动重试次数为 0（XML 不允许 `RestartOnFailure`）；
- StartWhenAvailable 为 false；
- ExecutionTimeLimit 为 PT15M；
- 导出的 XML 与正式 XML 归一化后完全一致；
- 任务状态为 Ready；
- runningInstances 为 0；
- lastTaskResult 为 null，证明尚未运行。

仅在上述条件全部通过后，才原子写入 `evidenceRoot/registration.json`。

## 回归与静态验证

`npm run test:stage8-windows-task-register-execution` 通过，共 36 项注入式检查，覆盖：

- 正式文件、授权目录与材料目录校验；
- 两级文件夹和目标任务不存在检查；
- 独立 check/mutation 门禁；
- 两级文件夹顺序创建；
- 注册、导出、注册后查询；
- XML 身份与策略漂移；
- Ready、runningInstances、lastTaskResult 状态漂移；
- evidence root 按需创建与失败回滚；
- evidence open、write、short-write、fsync、close、staging readback、rename、final readback 故障；
- 注册返回不确定后的状态恢复；
- unregister 失败与 delete-folder 失败的残留报告；
- 重复运行和 already-exists 拒绝；
- 生产源禁止启动任务、强制覆盖和 create-or-update。

回归全部使用依赖注入和内存状态：`productionSchedulerCalls=0`、`actualScheduledTasksMutated=0`、`realFilesWritten=0`。

相邻门禁同时通过：

- `npm run test:stage8-windows-task-host`：Host 协议回归通过，`scheduledTasksMutated=0`；
- `npm run test:stage8-windows-task-register-approval`：43 项通过，`scheduledTasksMutated=0`、`filesWritten=0`、`phaseAuthorizationsIssued=0`。

新增 TypeScript 文件的隔离严格类型检查通过：

```text
npx tsc --noEmit --pretty false --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --strict src/game/stage8/offline-windows-task-register-execution.ts
```

仓库全量 `npx tsc --noEmit --pretty false` 仍被既有 `onnxruntime-node` 缺失与其连带隐式 any 报错阻断；新增文件没有出现在剩余报错中。

## 未执行项与剩余风险

- 按任务边界未运行 `--register-and-verify`，因此候选只证明协议、门禁、注入行为和正式只读前置，不声称已完成真实注册。
- Windows Task Scheduler 的实际 XML 导出只有在授权执行真实注册后才能完成端到端验证；候选会对任何归一化差异熔断并回滚。
- 本报告未进入授权、Control、材料、check identity 或 RegistrationEvidence 的任何哈希输入，不构成自引用。
