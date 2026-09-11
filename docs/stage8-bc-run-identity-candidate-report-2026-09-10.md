# Stage8 正式 BC 运行身份材料候选报告（2026-09-10）

## 结论

本候选提供默认拒绝、可复算的正式 BC 语料 Pilot 运行身份材料生成与运行前验证能力。候选未生成正式控制文件，未运行 64 局，未写 E 盘，未启动训练、模型、Smoke、自弈或服务。

候选只能在发布后的干净 checkout 上签发材料。`cb2b794e48fad81d3621690af4018eb73598153b` 是本候选创建基线，不会被硬编码为发布后运行身份；正式授权文件必须填写届时实际发布提交，CLI 会将其与 `git rev-parse HEAD` 精确比较。这样避免“提交签发能力后仍伪称运行旧提交”的循环矛盾。

## 基线与精确范围

- 基线：`origin/main=cb2b794e48fad81d3621690af4018eb73598153b`
- 分支：`codex/stage8-bc-run-identity-20260910`
- 工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-bc-run-identity-20260910`
- 精确 7 个项目文件：
  1. `package.json`
  2. `src/game/stage8/offline-bc-run-identity.ts`
  3. `scripts/stage8-bc-run-identity.mjs`
  4. `scripts/stage8-bc-run-identity-regression.mjs`
  5. `scripts/stage8-bc-corpus-runner.mjs`
  6. `scripts/stage8-bc-corpus-cli-regression.mjs`
  7. `docs/stage8-bc-run-identity-candidate-report-2026-09-10.md`

未修改 `src/game/rules`、`public`、页面、AI、服务、计分、Storage 或任何训练执行代码；无新依赖。

## 身份与授权设计

### 真实源身份

- 版本：`stage8-bc-run-identity-v1`。
- 使用 76 个明确列举、运行时排序的仓库相对路径；只读取原始文件字节。
- 覆盖规则真源、浏览器规则包、Stage7 教师/MCTS、Stage8 动作与可见投影、BC 教师/样本/writer、trajectory、corpus runner、Python dataset/verifier及模型生命周期定义。
- 聚合仅包含规范相对路径、每文件 SHA-256、版本和 Git commit；不包含绝对 worktree 路径、mtime 或输入 JSON 键序。
- 身份模块自身不做递归自哈希；Git commit 绑定整棵受控树，CLI/runner 又要求 checkout 无 tracked/untracked 差异，从而覆盖签发工具本身。
- 同 commit、同文件字节的不同干净 worktree 生成逐字一致材料；任何 76 项源文件的单字节变化都会导致验证失败。

### 三层 control

- BC control：保持所有副作用为 `false`，scope 固定为 `bc-teacher-protocol-preflight`。
- Artifact control：只允许本次 sample generation/artifact write；训练、Python runtime、模型、checkpoint、ONNX、Smoke和runtime均为 `false`。
- Corpus control：固定 `runId=formal-bc-corpus-pilot-20260910`、64局、`baseSeed=2026090800`、单 worker、四座轮换、每局最多600次成功转移、48/8/8、5 GiB；训练/selfplay/Smoke/模型/runtime均为 `false`。
- 三层对象复用既有 hash/validator，并交叉绑定 manifest、source、规则、动作/mask、特征/可见信息、tensor、teacher、sample、writer、trajectory、Python dataset、corpus manifest、capacity及model/training/checkpoint/ONNX/parity定义身份。

### 授权与输出

- CLI 必须读取显式 `STAGE8_BC_RUN_AUTHORIZATION` 绝对文件；其中 BC、artifact、corpus、emit 四个 approval 均要求合法 ID、`granted=true`、固定 scope和自哈希。
- 代码不生成 approval、不内置 `granted=true`、不提供默认 approvalId。
- 默认 `--check` 只输出身份摘要，文件写入为 0。
- `--emit` 还要求 `STAGE8_BC_RUN_IDENTITY_EMIT=1`，并只接受批准 artifact root 的现有、空、非链接直接子目录 `<runId>-control`。
- emit 使用两份 `.partial` 文件，逐字回读并执行三层 validator/交叉绑定后才改名为 `artifact-control.json` 和 `corpus-control.json`；失败清理，重复 emit 拒绝。
- 不创建正式 final、staging、quarantine 或任何训练目录，不调用 corpus runner。

### 正式 runner 防漂移

- `stage8-bc-corpus-runner.mjs` 在 capacity、OS临时编译目录和staging首次写入前，检查 Git commit/checkout clean，并用当前文件字节复算身份。
- 材料属于其他 commit、假哈希、自洽重签但与当前源码不一致时均熔断，临时目录与staging写入为0。
- staging 建立后的未预期异常会尝试写入隔离证据并转为 `.partial.quarantine`；不自动重试或改种子。

## RED / GREEN

- RED：基线 runner 只验证 control 自身和部分交叉字段，测试假哈希可自洽；没有当前 checkout 真实字节/commit绑定，也没有正式材料签发入口。
- GREEN：76项源文件逐项单字节篡改全部拒绝。
- GREEN：三层 manifest 自洽重签为外来 sourceBundle 仍被当前源码身份拒绝。
- GREEN：缺授权、`granted=false`、错 scope、错 runId、错 commit、dirty checkout、路径越界、非空目录、重复 emit全部拒绝。
- GREEN：相同 commit/字节、不同 worktree 绝对路径与不同授权 JSON 键序生成逐字相同。
- GREEN：runner 身份漂移时 temporaryDirectories=0、stagingDirectories=0、artifact写入=0。
- GREEN：测试仅在 OS 临时目录生成两份夹具控制文件并自动删除；E盘与正式控制文件写入为0。

## 实跑门禁

- `npm run test:stage8-bc-run-identity`：PASS；76项源身份；正式Pilot=0；正式控制文件=0。
- `npm run test:stage8-bc-corpus-runner`：PASS。
- `npm run test:stage8-bc-corpus-cli`：PASS；包含运行身份漂移零写入。
- `npm run test:stage8-bc-corpus`：PASS；64槽位计划，正式Pilot=0。
- `npm run test:stage8-bc-artifact-control`：PASS。
- `npm run test:stage8-bc-sample-writer`：PASS。
- `npm run test:stage8-bc-teacher`：PASS。
- `npm run test:stage8-bc-sample-protocol`：PASS。
- `npm run test:stage8-bc-model-lifecycle`：PASS。
- `npm run test:stage8-bc-python-code`：PASS；torch/onnx均未导入。
- `npm run test:stage8-bc-corpus-preflight`：PASS；正式Pilot=0、训练=0、产物写入=false。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS。
- `npm run build`：PASS；Next 8/8；`BUILD_ID=GeQqIHVLlkKJzKve9bjOd`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS。
- 构建后生成包身份：四项 `public/game` blob与HEAD逐项相等。
- `git diff --check`：PASS；`tsconfig.tsbuildinfo=0`；OS浏览器构建快照残留=0。

## 风险与后续授权节点

- 本候选未提交时 checkout 必然不干净，正式 CLI 默认拒绝是预期行为；候选回归使用注入的干净 checkout 夹具，不等于正式材料签发。
- 发布后必须由产品针对实际发布 commit 单独签发授权输入；然后只允许在新的空 control 目录执行一次 `--check`，经独立复核后再另行授权 `--emit`。
- 控制材料生成仍不等于64局运行授权。正式 Pilot 必须再次明确 runId、commit、两个控制文件路径/SHA、Python路径、artifact root/final目录、5 GiB/80%容量边界和单进程无重试窗口。
- 64局不是PRD的1000局Smoke，也不是模型强度或训练授权证据。

## 零运行声明

正式64局=0；正式控制文件=0；E盘写入=0；训练/selfplay/Smoke/model/ONNX/checkpoint=0；服务/18768操作=0；Storage/用户页面/对局/导出访问=0。
