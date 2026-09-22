# Stage 8 Windows Task register 单阶段授权检查候选报告

日期：2026-09-22
状态：未提交、未推送、未部署、未签发正式 register 授权、未注册或运行任务

## 结论

本候选为 `register` 阶段增加默认拒绝、check-only 的产品决策与授权输入。生产入口只支持：

```text
--check --signer-root <clean-published-root> --product-approved-register-only
```

唯一 scope/action 为 `stage8-windows-task-host:register` / `register`。检查只在内存中构造候选 PhaseAuthorization 并复用现有 Host schema/hash/validator 验证；不写授权文件，`materials-emit/register/run/verify/delete` 的 `phaseApprovals` 均保持 `null`。

## 基线与精确范围

- 基线：`origin/main=86dedb7a44270d634364a1a43d95315b1bef7e95`
- 分支：`codex/stage8-windows-task-register-approval-candidate-20260922`
- 工作树：独立干净候选工作树
- 新依赖：无
- 数据库变更：无
- 精确项目文件：5 个

1. `package.json`
2. `src/game/stage8/offline-windows-task-register-approval.ts`
3. `scripts/stage8-windows-task-register-approval.mjs`
4. `scripts/stage8-windows-task-register-approval-regression.mjs`
5. `docs/stage8-windows-task-register-approval-candidate-report-2026-09-22.md`

现有 Host PhaseAuthorization、Control、materials-emit approval/orchestrator、材料 validator 与 XML renderer 均直接复用且未修改。

## 固定前件与身份绑定

检查严格绑定下列已验正式事实：

- Control manifest：`6649c4ae0fa36a0acfccd70aec514e6f2624ea8fe5dbf6760f48fcdc25b788f9`
- Control evidence：`a9ed4714d6c4f2f1de08be72cbedf5c5221d984227fecd1bdc248e0cd3f702b9`
- Control 文件：`d852b69ed7c087ed9ecbe640f6a4b2113215db8110e47ed09cdc331166854a8c`
- Evidence 文件：`e7cdb65cf6461727c6e4769aa24b77b9f9150946f8f0de04c76f0a9ac66c6c36`
- materials-emit authorization：`c9c328380beee30e7cbd2954f95c6573aad4925f1dce7869f0f16673bf32dca2`
- materials-emit authorization 文件：`21261a79224b296f27d43f9cacc8d7c8721781f2f6a748db218f4506f76f849d`
- Task XML 文件：`d39998594b98998a78d8e0b9547f374d898568a54bf1daefcb362e03fba21eb5`
- Task materials 文件：`ea19a8711a9866a712e8ec67d977f5b83de2e38f8ee493e3972cf72bea5e7aeb`
- Material identity：`b712fa4ac5a8779ea5c8aae8ac4f420d54f40c69b1dedb1e10d8f3e53bb0b4c7`

同时绑定精确 TaskPath/TaskName、register authorizationPath、干净发布 signer 的 release/source bundle，以及一次只读 scheduler 缺席证明。本报告不回填候选未来提交、signer source bundle、产品决策、authorization input、候选 authorization 或 check identity；这些 commit-bound 身份只能在未来发布提交产生后记录为外部发布证据。

## 文件与材料验证

生产 check 只允许读取 5 份正式文件和 2 个目录清单：

- Control 与 evidence 先通过既有正式 pair validator。
- materials-emit authorization 通过既有 PhaseAuthorization validator，action/scope 必须仍为 `materials-emit`。
- authorization 目录必须恰有 `materials-emit.json`；register/run/verify/delete、`.partial` 或任何额外项均失败关闭。
- materials 目录必须恰有 `task-definition.xml` 与 `task-materials.json` 两个普通文件；目录、符号链接、`.partial` 或额外项均失败关闭。
- Task XML 必须为 UTF-16LE BOM、单一 `Task` 根且标签闭合，并与现有 renderer 重建字节完全一致；文件 SHA 必须等于 material 中的 `taskXmlSha256`。
- Task materials 必须通过既有 exact-schema/hash/material validator，并满足 `mutationCommandsIncluded=false`、`scheduledTasksMutated=0`、`formalPilotGamesCredited=0`。

## Scheduler 只读检查

生产 inspector 使用 Windows Task Scheduler CIM provider，对精确 TaskPath/TaskName 发起一次带 WQL filter 的只读查询。成功结果必须回显相同查询身份并返回 `exists=false`、`taskPath=null`、`taskName=null`；查询错误、输出 schema 漂移、身份不精确、重复对象或任务已存在均失败关闭。

开发期真实只读验证发现并修正 WQL TaskPath 反斜杠转义错误：修正前安全熔断为 `scheduler-query-failed`，修正后生产 inspector 返回精确身份且任务不存在。该过程未执行任何 Task Scheduler mutation。

## RED / GREEN

专项回归共 43 项，RED 覆盖：

- 缺少 product gate、非法模式。
- Control/evidence/materials authorization/XML/material 任一缺失或字节哈希漂移。
- authorization/materials 目录额外文件、`.partial`、符号链接或其他非普通文件。
- XML 编码、结构或 renderer 字节漂移；material exact schema 漂移。
- 错误 scope/action、Control/materials authorization/material identity、TaskPath/TaskName。
- signer 非干净发布身份、register 目标相对路径、OS temp 外或 signer 项目内。
- scheduler 查询失败、结果 schema/查询身份漂移、任务已存在。
- 其他阶段权限非空、重复检查结果漂移。

GREEN 结果：

- scope/action：`stage8-windows-task-host:register` / `register`
- 重复检查逐字一致。
- `formalFilesRead=5`、`formalDirectoriesRead=2`。
- 单次成功 check 中 `scheduledTasksRead=1`、`scheduledTasksMutated=0`。
- `filesWritten=0`、`phaseAuthorizationsIssued=0`、`materialsGenerated=0`。
- `trainingRuns=0`、`deployments=0`、`port18768Operations=0`；Task Scheduler、Service、diagnostic 与 Pilot mutation 也均为 0。

候选尚未提交，因此干净发布 signer 的最终 commit/source bundle 身份尚不存在；生产 CLI 的完整正式 `--check` 未在本候选树伪造执行。专项回归使用注入式 signer 身份验证完整决策链，实际 scheduler adapter 则独立完成一次最终成功的只读缺席查询。

## 验证门禁

- register approval 专项：43 项通过。
- materials-emit authorization orchestrator：31 项与 12 类故障注入通过。
- materials-emit original approval：17 项通过。
- Control orchestrator、Control approval、Control approval input、Host 回归通过。
- 两个新脚本 `node --check` 通过。
- 直接 `npx tsc --noEmit --incremental false` 仅因候选树缺少既有 `onnxruntime-node` 及 3 个派生 implicit-any 准确失败；未安装或复制依赖。
- 复用已验共享 `onnxruntime-node@1.27.0`，通过项目外临时 tsconfig 映射后完整 TypeScript 检查通过；临时配置已删除。

## 副作用与后续门禁

本候选未提交、未推送、未部署；未写正式 register authorization，未注册、运行、验证或删除计划任务；未操作服务，未运行 diagnostic、第三次 Pilot、训练、Smoke、Arena、部署或 18768，未访问用户数据。

后续若发布，必须先形成干净 signer 身份并重新执行正式 `--check`。check 通过仍不等于允许签发 register authorization；原子签发需要新的精确产品授权。授权签发成功也不等于允许注册任务，实际 register mutation 仍需再次独立授权。
