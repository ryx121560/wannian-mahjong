# 正式 Smoke 启动包预检候选

状态：candidate，未提交、未推送、未部署。实际完成日期：2026-09-07；文件名保留已批准范围。

基线/HEAD/local origin/main：365e0167a97c941da6defc8e62f64909bcf5fac6。
候选：C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-formal-smoke-readiness-20260904。

## 精确四文件

- package.json：新增 test:stage8-formal-smoke-readiness。
- scripts/stage8-formal-smoke-readiness.mjs：只读、默认拒绝启动包预检入口。
- scripts/stage8-formal-smoke-readiness-regression.mjs：OS 临时夹具、失败注入、默认 CLI 验证。
- 本报告。

## 契约与真源

复用 artifact-root-preflight、offline-smoke-runtime-preflight、offline-onnx-inference-adapter；不修改规则、runner、模型接口或页面。正式 PRD 为迭代规划目录的《万年麻将阶段八PRD-自弈强化学习-codex.md》，前序只读冻结 SHA256：26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098。

显式要求 STAGE8_SMOKE_CONTROL_MANIFEST、STAGE8_SMOKE_RUNTIME_MANIFEST、STAGE8_ARTIFACT_ROOT。manifest 与资产必须在外置根内；复用仓库/worktree 排除，额外拒绝路径解析后不一致的链接或短路径。运行目录必须预先存在且为空。预检不创建运行目录、不引入 writer、不调用正式 runner。

复用控制/运行 manifest 完整身份、授权、模型三资产哈希、source bundle、下游禁用检查。baseSeed、batchSize、workers、behaviorTemperature、modelPolicyWeight、runId、approvalId 不设默认值。依赖绑定 onnxruntime-node@1.27.0 的已安装 package.json、lock entry 哈希与 integrity；不安装依赖。该检查记录包元数据身份，并不等价于重新验证全部 native 二进制。

容量使用现有 64 GiB / 80% 拒绝函数，pendingBytes=0；这是本次预检快照，不保证未来运行时容量，亦非文件系统配额。CPU session 仅使用预检返回的已验证 ONNX 字节创建，立即释放，不执行推理；适配器校验失败后已创建 session 也执行释放，释放失败则拒绝。

## RED / GREEN 与真实执行

1. 初始 RED：生产脚本未存在，专项 exit 1 / ERR_MODULE_NOT_FOUND。
2. GREEN：npm run test:stage8-formal-smoke-readiness，exit 0。含授权拒绝、模型哈希篡改、非空目录、路径链接、80% 容量线、依赖身份错配、畸形 manifest。
3. 五个运行参数分别删除后，均由既有 validator 返回 smoke-runtime-orchestration-config-invalid。
4. 真实默认 CLI 缺输入：结构化 fused / formal-smoke-readiness-explicit-inputs-required，exit 1。
5. 默认 CLI 复制到无依赖 OS 临时目录后：结构化 fused / formal-smoke-readiness-module-load-failed，exit 1。TypeScript 已改按需加载，未在顶层 import 崩溃。
6. session 夹具：一次成功创建并释放，一次初始化抛错；另一次释放失败尝试清理后仍拒绝。输出 cpuSessionsInitialized=2 表示前两次工厂调用次数，并不代表两个真实 ONNX session。没有执行真实模型推理。
7. 写入证据：预检调用期间拦截 fs 的 mkdtempSync/mkdirSync/writeFileSync/appendFileSync/renameSync，attemptedWrites=0；静态确认无正式 runner 导入、目录创建或写文件调用。测试自身仅在 OS 临时目录创建夹具并 finally 清理。
8. tsc --noEmit --incremental false：exit 0。
9. npm run build：普通沙箱 Next spawn EPERM；获准同一候选子进程重跑 exit 0，Next 8/8。最终生产脚本构建 BUILD_ID=ljXa_ZO8YR_BwyQrppKCR；其后只补充测试和报告。
10. 构建后直接 node scripts/build-browser-rule-engine.mjs --check 与 node scripts/assert-browser-build-artifacts-clean.mjs：均通过。规则包 SHA256=A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB；public/game 无差异，tsconfig.tsbuildinfo 不存在。

## 边界与交付

本轮正式 Smoke、训练、自弈、正式样本、外置模型/ONNX/manifest、E 盘资产写入、服务/18768 操作均为零。未访问 Storage、用户页面/对局/导出或旧 dirty Stage8 资产。只读取 Vault 根规则、长期偏好及最近七天相关日记；没有写 Vault。

node_modules 仅临时 Junction 到已存在的 codex-stage8-bc-sample-probe-20260901 依赖目录，验收后移除链接，不删除其目标。无新依赖或 lockfile 改动。

仍需独立产品复验。本候选通过只证明预检能力；真实冻结模型包、正式运行身份及逐段运行授权仍需另行提供。成功链当前使用注入 session 夹具，实际 CPU 模型 session 的可用性须待合法真实模型包提供后验证。不得据本报告运行 1000 局或开始训练。
