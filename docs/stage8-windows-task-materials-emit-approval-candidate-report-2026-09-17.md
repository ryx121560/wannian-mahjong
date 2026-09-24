# Stage 8 Windows Task materials-emit 单阶段授权候选报告

日期：2026-09-17
状态：候选协议与 check-only 回归已完成；最终单一提交形成后执行 post-commit 正式零写 `--check`

## 结论

本候选只允许 `stage8-windows-task-host:materials-emit`。它读取并验证已经正式 emit/verify 的 host control 与 control approval evidence，在内存构造唯一的 `materials-emit` 产品决策和授权输入，再把同一输入两次交给 signer `--check`。两个结果逐字一致，未持久化 identity、input 或 phase authorization。

生产入口只有 `--check`。不存在 `--emit`、材料生成、Task Scheduler、Service、诊断、Pilot、训练、Smoke、自弈、回放、模型或 18768 操作入口。

## 固定绑定

- Scope：`stage8-windows-task-host:materials-emit`
- Action：`materials-emit`
- Request ID：`stage8-disposable-diagnostic-20260916-materials-emit-signing-request`
- Host：`stage8-disposable-diagnostic-20260916`
- Diagnostic identity：`d4166d519f323f289faec84ff53b87a24aa5798af5e16fd16bc3a765997075fd`
- Control manifest：`6649c4ae0fa36a0acfccd70aec514e6f2624ea8fe5dbf6760f48fcdc25b788f9`
- Control approval evidence：`a9ed4714d6c4f2f1de08be72cbedf5c5221d984227fecd1bdc248e0cd3f702b9`
- Runtime release：`fae72b67b297672960d49361e6252c7e022d9040`
- Runtime source bundle：`b3c46af312bbb1ef966db49daaef6217effa8e08910a63d5377bfbf231a16ce3`
- Control signer source bundle：`22c326b4dae937f851aba374815996d1db59f1509b3f8a213174f33fc914d5c3`
- Material target identity：`a260273b77b3fba67f46ea3065c4545d21fec176c5b5bac72264b2a9a22c2a09`

目标身份由已发布 diagnostic path builder 和正式 control 派生，绑定 authorization、材料目录、Task XML 与材料 JSON 四个目标；报告不记录 SID、完整授权 JSON、control 内容或敏感绝对根路径。

## 单一提交与正式零写检查

Materials signer release/source bundle、product decision、approval ID、authorization input、candidate authorization 与 check identity 都绑定最终提交或发布工作树身份。把这些动态值回填到包含 signer 源码和本报告的同一提交会再次改变提交身份，因此本报告不固定开发链临时值，也不把它们伪装成最终发布证据。

最终单一提交形成后，必须在干净发布树执行一次 post-commit 正式零写 `--check`。该检查必须证明 repeated check byte-identical、formal control files read 为 `2`，并将最终动态身份记录到脱敏 Vault 发布证据和用户回报；不得再修改仓库文件或回填本报告。

`materials-emit/register/run/verify/delete` 的持久化 approval 均为 `null`。check 只在内存计算并验证候选 authorization hash，因此 `phaseAuthorizationsIssued=0`。

全部副作用计数：

- `filesWritten=0`
- `identityBundlesPersisted=0`
- `approvalInputsPersisted=0`
- `phaseAuthorizationsIssued=0`
- `materialsGenerated=0`
- `scheduledTasksRead=0`
- `scheduledTasksMutated=0`
- `servicesRead=0`
- `servicesMutated=0`
- `diagnosticsRun=0`
- `formalPilotGamesCredited=0`

首次默认沙箱执行因 Node 内部只读 Git 检查受限而失败关闭，所有副作用计数仍为 0。允许只读 Git 子进程后，同一命令通过。

## 默认拒绝覆盖

回归覆盖缺失授权、错误 scope/request/action、control/evidence/file hash 漂移、错误 runtime/source、目标逃逸、缺失/额外字段、尝试授权 register/run/verify/delete、缺少产品 gate 及尝试 `--emit`。所有场景失败关闭。

实现直接复用现有 canonical identity hash、host control validator、control evidence canonical hash、diagnostic path builder、phase authorization hash 与 validator；没有手写 JSON 文件，也没有复制第二套路径或身份规则。

## 文件与边界

1. `src/game/stage8/offline-windows-task-materials-emit-approval.ts`
2. `scripts/stage8-windows-task-materials-emit-approval.mjs`
3. `scripts/stage8-windows-task-materials-emit-approval-regression.mjs`
4. `package.json`
5. `docs/stage8-windows-task-materials-emit-approval-candidate-report-2026-09-17.md`

无新依赖、无数据库变更。未生成 XML/JSON 诊断材料，未读取或修改 Task Scheduler/Service，未执行 diagnostic/Pilot/training/deployment/18768。

## 后续门禁

本次产品 gate 只批准 check，不批准正式 phase authorization emit，也不批准材料生成。后续若要签发 `materials-emit`，必须针对 post-commit 正式零写检查记录的最终 input/hash 取得独立精确授权；生成材料仍需再执行独立动作。`register/run/verify/delete` 不因本候选获得任何权限。
