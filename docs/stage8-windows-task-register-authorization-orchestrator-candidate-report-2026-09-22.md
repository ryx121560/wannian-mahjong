# Stage 8 Windows Task register 阶段授权原子签发候选报告

日期：2026-09-22
状态：未提交、未推送、未部署、未执行正式 register 授权签发、未操作计划任务

## 结论

本候选在已发布 register check-only 能力上增加最小原子编排入口，仅支持：

- `--check`：连续执行两次已发布 register builder，验证固定发布绑定与候选 PhaseAuthorization，零写入。
- `--emit-and-verify`：在独立环境门控与产品 flag 下，仅原子写入一份 `register.json` 并立即重读验证。

唯一 scope/action 为 `stage8-windows-task-host:register` / `register`。没有 emit-only 或 verify-only 模式，不包含计划任务注册、运行、验证或删除命令。

## 基线与精确范围

- 基线：`origin/main=b42f95346652e3027ba3a17e1ce7c576308760b3`
- 分支：`codex/stage8-windows-task-register-authorization-orchestrator-candidate-20260922`
- 工作树：独立干净候选工作树
- 新依赖：无
- 数据库变更：无
- 精确项目文件：4 个

1. `package.json`
2. `scripts/stage8-windows-task-register-authorization-orchestrator.mjs`
3. `scripts/stage8-windows-task-register-authorization-orchestrator-regression.mjs`
4. `docs/stage8-windows-task-register-authorization-orchestrator-candidate-report-2026-09-22.md`

已发布 register approval core/CLI、Host PhaseAuthorization schema/hash/validator、materials-emit authorization 与材料文件均未修改。

## 发布绑定

编排器固定并验证 `b42f953` 正式 check 的以下身份：

- Signer release：`b42f95346652e3027ba3a17e1ce7c576308760b3`
- Signer source bundle：`fba33f7ed8c447f6fa36fe214cf6416f3138792527d0a574b63764a4cc3c45e8`
- Product decision：`a9a9436e56303d061758bc1260088f1070f775568707e505e497f9f5c4832aac`
- Approval ID：`stage8-windows-task-register-57177c6b7ca6b8097d2ee688bba2d26d9343bcfb`
- Authorization input：`1604b445246c020c49a963677109c7924be013f913327b16ada933028c24afe9`
- Candidate authorization：`8200af1cc16cfa280c12bdf446591b3efd72e6fbaf879c3e6fac8964f41672b9`
- Check identity：`96d82fdac038b2a1953066ce0c8d9558b8df656ed4f2bc2e22ef84ee229693f5`
- Target identity：`79302b148793f8f65c334a62c49e6f908805d6b6fa23ac3c34261175f9a2c7e3`

同时继续绑定 Control/evidence、materials-emit authorization、Task XML、task materials、精确 TaskPath/TaskName、scheduler 缺席证明与 register authorizationPath。本报告不回填候选未来提交产生的 commit-bound 身份。

## 门控与原子协议

`--check` 必须同时满足：

- 环境门控：`STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_CHECK=1`
- 产品 flag：`--product-approved-register-only`

`--emit-and-verify` 必须同时满足：

- 独立环境门控：`STAGE8_WINDOWS_TASK_REGISTER_AUTHORIZATION_EMIT=1`
- 同一产品 flag：`--product-approved-register-only`

写入流程：

1. 在任何写入前连续构建两次已发布 register check；两次均只读确认精确任务不存在，并验证候选授权完全一致。
2. 拒绝已存在的正式目标或 `.partial`，不覆盖、不续写、不删除既有对象。
3. 仅以 `wx` 在目标同目录创建 `register.json.partial`，完整写入后执行 `fsync` 与 `close`。
4. rename 前按既有 Host PhaseAuthorization validator 验证临时字节。
5. 同卷原子 rename 为 `register.json`。
6. 立即重读正式目标，执行 exact byte、JSON、schema、scope/action、identity 与 hash 验证。
7. 后验要求授权目录恰有 `materials-emit.json` 与 `register.json` 两个普通文件；`.partial`、run/verify/delete 或额外文件均失败关闭。
8. 重读并验证既有 `materials-emit.json` 文件 SHA 未变化。

失败清理只处理本次创建的 register 目标、临时文件及必要时本次创建的空父目录。rename 后验证失败时先把目标回滚为 `.partial` 再删除。任何 unlink、rmdir 或 rollback 失败都报告真实残留；预存的 `materials-emit.json` 永不删除。

## RED / GREEN

专项回归共 35 项，包含 15 类故障注入。RED 覆盖：

- 缺少 check/emit 环境门控、非法模式或错误产品 flag。
- Control/evidence/input、scope/action、Control manifest、scheduler 缺席状态或其他阶段权限漂移。
- signer release/source bundle 及 8 项固定发布绑定漂移。
- register 目标为 OS temp 外、signer 项目内或错误文件名。
- 正式目标已存在、`.partial` 已存在。
- open、write、fsync、close、rename、staging read、final read、final validator、materials authorization readback、授权目录后验失败。
- staging unlink、父目录 rmdir 与 rename 后 rollback 清理失败及真实残留。
- 两次 check 输出漂移。

GREEN 覆盖：

- `--check` 两轮结果逐字一致，`filesWritten=0`、`phaseAuthorizationsIssued=0`。
- 临时夹具 `--emit-and-verify` 成功：`filesWritten=1`、`filesVerified=1`、`phaseAuthorizationsIssued=1`。
- 成功授权通过既有 Host PhaseAuthorization validator，scope/action 精确为 register。
- 既有 materials authorization 字节未变，run/verify/delete 文件不存在，`.partial` 不存在。
- 失败可清理时 register 目标与临时文件均无残留；无法清理时证据不伪报成功。

## 正式零写检查

仅执行了正式 `--check`，没有设置 emit 门控：

- 固定 8 项绑定全部与 `b42f953` 正式 check 一致。
- 两次结果逐字一致。
- `formalFilesRead=10`、`formalDirectoriesRead=4`。
- `scheduledTasksRead=2`、`scheduledTasksMutated=0`，两次均确认精确任务不存在。
- `filesWritten=0`、`phaseAuthorizationsIssued=0`、`materialsGenerated=0`。
- 后验 `register.json` 与 `.partial` 均不存在。
- 授权目录仍只有 `materials-emit.json`，文件 SHA-256 仍为 `21261a79224b296f27d43f9cacc8d7c8721781f2f6a748db218f4506f76f849d`。

## 验证门禁

- register authorization orchestrator：35 项、15 类故障注入通过。
- register approval：43 项通过。
- materials-emit authorization orchestrator：31 项、12 类故障注入通过。
- materials-emit original approval：17 项通过。
- Control orchestrator 与 Host 回归通过。
- 两个新脚本 `node --check` 通过。
- 生产编排文件无 Task Scheduler 或 Service mutation 命令。
- 直接 `npx tsc --noEmit --incremental false` 仅因候选树缺少既有 `onnxruntime-node` 及 3 个派生 implicit-any 准确失败；未安装或复制依赖。
- 复用已验共享 `onnxruntime-node@1.27.0`，通过项目外临时 tsconfig 映射后完整 TypeScript 检查通过；临时配置已删除。

## 副作用与后续门禁

所有 emit 测试只发生在新建 OS 临时夹具并在 `finally` 清理。正式 register authorization 写入为 0。

- `materialsGenerated=0`
- `scheduledTasksMutated=0`
- `servicesRead=0`、`servicesMutated=0`
- `diagnosticsRun=0`
- `formalPilotGamesCredited=0`
- `trainingRuns=0`
- `deployments=0`
- `port18768Operations=0`

本候选未提交、未推送、未部署，未签发正式 register 授权，未注册、运行、验证或删除任务，未执行诊断、第三次 Pilot、训练或任何服务操作。

后续若发布，正式 `--emit-and-verify` 仍需新的精确产品授权。register authorization 签发成功也不等于允许注册任务；实际 Task Scheduler mutation 必须再次取得独立授权。
