# Stage 8 Windows Task materials-emit 阶段授权原子签发候选报告

日期：2026-09-20
状态：未提交、未推送、未部署、未执行正式签发

## 结论

本候选在已发布 check-only 能力上增加一个最小原子入口，仅支持：

- `--check`：重复构造并验证同一 `materials-emit` authorization，字节级零写入。
- `--emit-and-verify`：在独立产品 gate 下，向 control 已绑定的 `materials-emit` authorizationPath 写入一份 JSON，并立即按同一正式输入重建、重读和验证。

没有 emit-only 或 verify-only 模式，不调用 `stage8-windows-task-host-materials --emit`，不生成 Task XML 或材料 JSON。

## 基线与精确范围

- 基线：`origin/main=c3fff6f44a2fd83755c177dccc0b76e5b6c0cac3`
- 分支：`codex/stage8-windows-task-materials-emit-authorization-orchestrator-20260920`
- 工作树：独立候选工作树
- 新依赖：无
- 数据库变更：无
- 精确项目文件：4 个

1. `package.json`
2. `scripts/stage8-windows-task-materials-emit-authorization-orchestrator.mjs`
3. `scripts/stage8-windows-task-materials-emit-authorization-orchestrator-regression.mjs`
4. `docs/stage8-windows-task-materials-emit-authorization-orchestrator-candidate-report-2026-09-20.md`

已发布的 check-only core/CLI、Host PhaseAuthorization schema/hash/validator 和材料生成器均未修改。

## 发布绑定与权限边界

原子入口默认要求并验证 c3 post-commit 正式 check 的以下已发布身份：

- Signer release：`c3fff6f44a2fd83755c177dccc0b76e5b6c0cac3`
- Signer source bundle：`558fd581f489d8da44fc82196e2296e2e0013735adfa2151243c8c8eb53d9ce1`
- Product decision：`57c33fbc1f541b69edb6f69a2a8c5d296b78ffc686b6a012358ccda9d48b7267`
- Approval ID：`stage8-windows-task-materials-emit-9579b37f38bdadfc10132efccc5c2b71b07c63a9`
- Authorization input：`01147ce15fed8e8d4f7b6f5344c419faf7a956806c2ddedb37a3d97f5713ef97`
- Candidate authorization：`c9c328380beee30e7cbd2954f95c6573aad4925f1dce7869f0f16673bf32dca2`
- Check identity：`781e5a8fccac422835d950adaecc741407a06a96d96f346a6f4c2ac2af612ed0`
- Target identity：`a260273b77b3fba67f46ea3065c4545d21fec176c5b5bac72264b2a9a22c2a09`

唯一 scope/action 为 `stage8-windows-task-host:materials-emit` / `materials-emit`。`register/run/verify/delete` 始终为 `null`，control approval 不继承为阶段权限。

本报告不回填候选未来提交或发布工作树的 commit-bound 身份；如候选未来发布，其源码身份在最终提交后作为外部发布证据记录。

## 原子写入协议

1. 重新执行已发布 builder，验证正式 host control、control approval evidence、c3 signer、产品决策、authorization input 与精确目标路径。
2. 拒绝已存在的正式目标或 `.partial`，不覆盖、不续写、不删除既有文件。
3. 仅在目标同目录以 `wx` 创建精确 `.partial`，完整写入后执行 `fsync` 和 `close`。
4. 在 rename 前按 Host PhaseAuthorization validator 验证临时字节。
5. 同卷原子 rename 到正式 authorizationPath。
6. 以原始正式输入重新构造 authorization，重读正式目标并再次执行 exact byte、schema、scope/action、identity 与 hash 验证。
7. 成功时 `.partial` 不存在；只产生一份阶段授权 JSON。

失败清理只操作本次创建的精确目标、临时文件和父目录。rename 后验证失败时，先把本次创建的正式目标回滚为同一 `.partial`，再删除临时文件；若 authorization 父目录也由本次调用创建，则只在其已为空时执行精确、非递归 `rmdir`。预存目录绝不清理；任何回滚、临时文件清理或父目录清理失败都显式报告真实残留，不伪报零副作用。

## RED / GREEN

RED 覆盖：

- 缺少 check/emit 产品 gate、非法模式。
- control/evidence/input hash 漂移、错误 scope/action、其他阶段权限。
- signer release/source bundle 或已发布 binding 漂移。
- 跨盘、OS 临时根外或 signer 项目内目标路径。
- 正式目标已存在、`.partial` 已存在。
- create/open/write/fsync/close/rename/staging-read/final-read/final-verify 故障。
- 临时清理失败、rename 后回滚失败、精确父目录清理失败及真实残留证据。

GREEN 覆盖：

- `--check` 两次结果逐字一致，`filesWritten=0`、`phaseAuthorizationsIssued=0`。
- 临时夹具成功原子 emit+verify：`filesWritten=1`、`filesVerified=1`、`phaseAuthorizationsIssued=1`、`.partial` 不存在。
- 成功 authorization 通过既有 Host PhaseAuthorization validator，且 register/run/verify/delete 均为 `null`。

## TypeScript 与环境证据

直接运行 `npx tsc --noEmit --incremental false` 时，候选工作树和根 `node_modules` 均缺少项目既有依赖 `onnxruntime-node`，因此准确失败为 `offline-onnx-inference-adapter.ts` module-not-found 及 3 个派生 implicit-any；该次结果不记为通过，也没有安装或复制依赖。

随后复用已验工作树 `codex-stage8-bc-sample-probe-20260901/node_modules/onnxruntime-node@1.27.0`：在项目外创建临时 tsconfig，继承候选 `tsconfig.json`，保留 `@/* -> 候选/src/*`，并把 `onnxruntime-node` 映射到该现有共享包；执行 `npx tsc --noEmit --incremental false --pretty false -p <临时配置>` 通过。临时配置随后删除，候选项目文件、`node_modules` 和依赖清单均未改变。

## 副作用边界

专项 emit 只在新建 OS 临时 fixture 中执行并在 `finally` 清理。正式 authorizationPath 写入为 0。

- `materialsGenerated=0`
- `scheduledTasksRead=0`
- `scheduledTasksMutated=0`
- `servicesRead=0`
- `servicesMutated=0`
- `diagnosticsRun=0`
- `formalPilotGamesCredited=0`

未访问用户 Storage、对局或导出；未运行 diagnostic、Pilot、训练、部署或 18768；未提交、未推送。

## 后续门禁

候选完成后只报验。正式 `--emit-and-verify` 必须在候选先发布、signer identity 干净且获得新的精确产品授权后才能执行；签发完成也不自动授权材料生成、register、run、verify 或 delete。
