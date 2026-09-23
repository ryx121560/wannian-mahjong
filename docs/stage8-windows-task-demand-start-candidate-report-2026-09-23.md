# Stage8 一次性后台诊断任务按需启动候选报告（2026-09-23）

## 结论与范围

候选基于 `origin/main=7c587b44ad85d301e0c60210beb2f1068a41e150` 的独立工作树。精确改动为：

1. `src/game/stage8/offline-windows-task-host-control.ts`
2. `src/game/stage8/offline-windows-task-diagnostic-identity.ts`
3. `scripts/stage8-windows-task-host-materials.mjs`
4. `src/game/stage8/offline-windows-task-demand-start.ts`
5. `scripts/stage8-windows-task-demand-start-regression.mjs`
6. 本报告

本候选未提交、推送或部署；未注册或运行计划任务，未签发正式授权，未修改或删除旧正式 Control、材料、授权或中断证据。没有引入新依赖。

## 问题与设计

旧正式 XML 的一次性触发窗口是 2026-09-17 02:00–02:30 UTC，已过期；`StartWhenAvailable=false` 不补跑，`AllowStartOnDemand=false` 阻止手动 Run。仅改 XML 会违反旧 Control manifest、材料 SHA、授权和注册验收的绑定。

新方案使用独立 v2 Control 身份和含 `-demand-` 的新 hostRunId。任务保持 Enabled，完全没有 `Triggers`，明确 `AllowStartOnDemand=true`、`StartWhenAvailable=false`、`IgnoreNew`、零自动重试、S4U、LeastPrivilege 和 PT15M。新诊断身份生成器只输出未签名 Control 模板与模板哈希；它从提供的源码和 Node 字节计算源身份，不生成正式授权或文件。Control manifest、材料 SHA 和各阶段授权需在新的发布提交上重新绑定。

注册验收 v2 要求新 Control、materials-emit 授权、register 授权、材料哈希、UTF-16LE XML、渲染字节、TaskPath/TaskName、Ready、零运行实例和未运行结果一致。它拒绝 v1 Control、过期旧正式 XML、任何自动触发器、附带 run 授权和 XML 身份漂移。现有注册后 Windows 默认节点白名单仍复用原校验器，未知节点、值或位置变化继续熔断。

宿主 runner 在写入 LOCK/status、创建 evidence 目录或启动诊断子进程之前验证独立 run 授权及新 Control 身份。没有 run 授权、错阶段授权或错 manifest 授权时，均在下游启动前失败关闭。允许按需启动本身不是 run 阶段授权。

## Windows 语义证据

- [Microsoft TaskSettings.AllowDemandStart](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-allowdemandstart) 说明 true 时可独立于触发器的开始时间按需启动。
- [Microsoft IRegisteredTask::Run](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/nf-taskschd-iregisteredtask-run) 说明 false 时 Run 可能无错误返回但任务不执行；禁用整个任务会使 Run 报错，因此本候选保持任务 Enabled。
- [Microsoft taskType schema](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-tasktype-complextype) 将 `Triggers` 定义为可缺省；[Task Scheduler 状态码](https://learn.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-error-and-success-constants) 明确“无有效触发器”状态。

本机使用 `Schedule.Service.NewTask(0)` 做两次纯内存验证，没有调用 RegisterTask 或 Run：

| 内存输入 | 结果 |
| --- | --- |
| 空白任务定义，零触发器、Enabled、AllowDemandStart=true | COM 返回 triggerCount=0、allowDemandStart=true、taskEnabled=true、startWhenAvailable=false；导出 XML 无 Triggers |
| 只读旧正式 XML，在内存中删除过期触发器并将 AllowStartOnDemand 设为 true | COM 成功解析，规范化后 triggerCount=0、allowDemandStart=true、taskEnabled=true、startWhenAvailable=false；XML 无 Triggers |

文档与内存探针支持定义可解析及按需启动策略；它们不替代经单独授权后的实际注册、Ready 状态和手动 Run 端到端验证。未来实机验收必须在未运行前确认任务无自动触发、无额外注册触发器、没有任何诊断进程或 evidence，然后另行签发 run 授权并受控启动。

## RED/GREEN 与相邻门禁

专项命令：`node scripts/stage8-windows-task-demand-start-regression.mjs`，22 项通过；真实 Task Scheduler 注册、运行、正式文件写入、诊断子进程、Pilot 与训练均为 0。

关键 RED：

- 旧 v1 过期 Control 或旧正式 XML 被 v2 注册验收拒绝。
- 未来 TimeTrigger、自动标志、即使哈希自洽的带触发器材料均被拒绝。
- 无 run 授权、错阶段授权、错 manifest 授权均在容量读取、evidence 创建和子进程启动前失败。
- 错材料哈希、错注册授权、导出 XML 中的触发器、禁止按需启动、补跑或自动重试、非 Ready/运行实例均被拒绝。

关键 GREEN：新 v2 Control 身份、新材料哈希、两阶段合成授权与零触发器 XML 一致；原始导出 XML 及只增加三个已确认 Windows 安全默认节点的导出 XML 均通过。测试授权仅为内存合成 fixture，不是正式签发。

相邻门禁：旧 Host 回归、旧诊断身份回归、现有注册执行 82 项回归均通过；定向 strict TypeScript、Node 语法检查通过。旧正式 v1 校验语义保持不变。

## 正式外部重签与逐阶段授权顺序

1. 发布并固定候选源码提交，确认工作树干净；在该提交与真实 Node 路径上重新计算源字节、source bundle 和新 v2 诊断身份。候选测试的基线提交与脏工作树哈希不能作为正式签名输入。
2. 产品单独批准新 Control；用新 hostRunId、release commit、Control 模板哈希生成新 Control 授权，原子生成并验证新 Control manifest 和 Control approval evidence，放在新的运行根目录。
3. 单独批准并签发新的 materials-emit 授权；生成新 XML 和材料清单，验证新 Control manifest、XML SHA、材料 SHA 与授权绑定。旧正式文件原样保留。
4. 单独执行新 register check-only，验证材料、零触发器、按需设置、目标任务和文件夹状态；再由产品单独批准并签发新的 register 授权。旧 `register.json` 只绑定旧 Control，不能继承。
5. 再获实际注册授权后，用支持 v2 动态身份的注册执行器注册并验证导出 XML、任务 Ready/未运行、零残留与新 registration evidence。当前已发布 v1 注册 CLI 使用旧固定文件 SHA，不能直接用于新材料；此适配与正式签名包需独立验收。
6. 需要启动时单独批准并签发新 Control manifest 绑定的 run 授权；host runner 验证授权后才允许诊断子进程。verify 和 delete 仍需各自阶段授权；Pilot、训练或部署不因此获得授权。

本候选只完成 v2 定义、材料渲染和注册验收契约；没有生成或签发外部正式材料，也没有声称真实注册或手动 Run 已验证。

## 正式链路可达性审计与剩余阻断

**状态：仅协议前置候选；现有正式 Control approval → materials-emit → register 授权与执行 CLI 尚不可达，不能重新注册。** 当前新增 v2 注册验收模块尚未接入正式签发及执行编排器；回归中的授权是内存合成数据，不是可被现有 CLI 消费的正式文件。

- `offline-windows-task-diagnostic-identity.ts` 的旧身份常量仍是 `stage8-disposable-diagnostic-20260916` 和 2026-09-17 的触发窗口。新增生成器没有替换旧正式签发入口。
- `offline-windows-task-control-approval-input.ts` 和 `offline-windows-task-control-approval.ts` 要求旧 hostRunId，旧签发输入还绑定固定源码 SHA；v2 Control 模板不能通过现有 Control approval 全链。
- `offline-windows-task-materials-emit-approval.ts` 固定旧 Control 文件 SHA，并要求旧 hostRunId；新 Control 即使独立获批也不能通过现有 materials-emit 正式签发链。
- `offline-windows-task-register-approval.ts` 固定旧 XML、材料和 materials 授权文件 SHA，并要求旧 hostRunId；新零触发器材料不能通过现有 register approval。
- `offline-windows-task-register-execution.ts` 固定旧 `register.json` 文件 SHA 与授权内容 SHA；现有 `stage8-windows-task-register-execution.mjs` 的 check/register 执行路径仍调用这套 v1 验证，而非新增 v2 验收模块。

后续需在新发布提交上，为上述审批输入、Control/materials/register 签发与注册执行路径建立独立 v2 身份分支和签名输入，保持 v1 不变；分别完成只读 check-only、外部产品批准、正式重签、阶段授权和执行器回归。只有新的执行 CLI 能对新材料完成 check-only、并经单独注册授权后，才可声明“可重新注册”。本次推送仅发布候选代码与阻断证据，不隐含任何阶段授权。
