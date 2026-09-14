# Stage8 BC Pilot 运行中断证据与新运行身份候选报告

- 状态：`candidate`（未提交、未推送、未部署）
- 日期：2026-09-13
- 候选工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-bc-operational-interruption-evidence-20260913`
- 分支：`codex/stage8-bc-operational-interruption-evidence-20260913`
- 基线：`d5356b80895904d80663ab77eafdbbb63e35419d`
- 产品边界：本候选只增加运行中断证据、新运行身份和零写入前置校验；不是新 Pilot 运行授权。

## 结论

候选已将 2026-09-10 Pilot 的已隔离部分运行结果固化为可验证证据，并将新运行 `formal-bc-corpus-pilot-20260913` 的授权、artifact/corpus control、run identity 和 runner 统一绑定到该前件证据。任一前件、路径、哈希、旧授权或旧分片漂移都在任何 staging/分片写入前失败关闭。

当前仍不具备安全运行第二次正式 Pilot 的全部运维条件：独立 Windows 后台托管、PID/启动身份、心跳、退出码和最终状态证据尚未纳入默认拒绝的正式启动协议。Codex 后续只能作监控者，不应作为运行宿主。该能力需独立候选与授权。

## 精确 10 文件范围

1. `src/game/stage8/offline-bc-operational-interruption.ts`（新增）
2. `src/game/stage8/offline-bc-run-identity.ts`
3. `src/game/stage8/offline-bc-artifact-control.ts`
4. `src/game/stage8/offline-bc-corpus-control.ts`
5. `scripts/stage8-bc-operational-interruption-evidence.mjs`（新增）
6. `scripts/stage8-bc-run-identity.mjs`
7. `scripts/stage8-bc-run-identity-regression.mjs`
8. `scripts/stage8-bc-corpus-runner.mjs`
9. `scripts/stage8-bc-corpus-cli-regression.mjs`
10. `docs/stage8-bc-operational-interruption-evidence-candidate-report-2026-09-13.md`

未改 `package.json`、规则真源、页面、AI 策略、训练算法、服务或构建脚本；无新依赖。

## 旧运行中断证据契约

只读 `--check` 对精确隔离目录执行了实际校验，没有产生证据文件：

- 旧 runId：`formal-bc-corpus-pilot-20260910`
- 隔离目录：`E:\WannianMahjongStage8\artifacts\formal-bc-corpus-pilot-20260910.partial.quarantine`
- 已完整分片：32
- gzip 分片：32
- 记录数：5,179
- 字节数：13,344,052
- 分片聚合 SHA-256：`b970f3e31146c04979a84d247c1a420beac7c3e1e0280a48be636990ae3f8660`
- 隔离 marker SHA-256：`da53bc0fd81f8b1b99d08cfefbbf0c02cca9d4abf1a95851c4242a01a63027a0`
- 证据身份 SHA-256：`ed737d3a167ae8b5c6ce09628363c86e512416e3ff49332ec6ffc2e2563f1a8b`
- 事实：`automaticRetries=0`、`seedOverrides=0`，最终目录不存在，无 manifest/ledger。

证据包绑定每个分片的规范相对路径、字节、记录数和 SHA-256，并绑定旧提交、source bundle、artifact/corpus control 及授权文件身份。默认命令为只读 `--check`；`--emit` 需独立审计授权，且仅允许原子写入预定的单个证据文件。本轮没有对真实 E 盘执行 `--emit`。

## 新运行身份与失败关闭

- 新 runId：`formal-bc-corpus-pilot-20260913`
- run identity/auth 升级为 v2。
- artifact/corpus control v2 同时绑定新授权 SHA 和 predecessor evidence SHA；v1 仍可单独验证历史内容，但绝不能作为新运行输入。
- runner 在容量检查、临时编译、staging 目录和分片写入之前，先校验新授权、双 control、source bundle、前件证据与实际隔离目录。
- 旧授权、旧 v1 control、前件证据漂移、新 `.partial` 中夹带旧分片均被零写入拒绝。
- 若未来第二次正式 Pilot 再次运行中断，必须隔离当次部分运行，不得自动第三次重试；该运维行为仍需独立授权。

## RED / GREEN

RED 覆盖：

- 旧运行授权或 v1 control 尝试启动新 runId。
- 证据字段篡改后重签自洽哈希。
- 运行根跨工作树、source bundle 漂移、predecessor evidence 漂移。
- 将旧分片复制到新 `.partial`。
- 缺少/错误独立 emit 授权、错误输出路径、非空目标。

GREEN 实跑：

- `npm run test:stage8-bc-run-identity`：PASS，78 个 source identity，真实 E 盘只读证据写入 0。
- `npm run test:stage8-bc-corpus`：PASS。
- `npm run test:stage8-bc-corpus-runner`：PASS（回归夹具，非正式 Pilot）。
- `npm run test:stage8-bc-corpus-cli`：PASS，旧授权/control/分片与前件漂移均零写入拒绝。
- `npm run test:stage8-bc-corpus-preflight`：PASS，`pilotGamesExecuted=0`、`trainingStarted=false`、`artifactsWritten=false`。
- `npm run test:stage8-bc-artifact-control`：PASS。
- `npm run test:stage8-bc-sample-writer`：PASS（仅 OS 临时夹具）。
- `npm run test:stage8-bc-preflight`：PASS。
- `npm run test:stage8-bc-sample-protocol`：PASS。
- `npm run test:stage8-bc-python-code`：PASS，未导入 torch/onnx。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS。
- `npm run test:stage1-runtime-hygiene`：PASS。
- `npm run build`：PASS，Next 8/8，`BUILD_ID=_WZvNTep1n_xHFjcgODRm`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS。
- 构建后 `node scripts/assert-browser-build-artifacts-clean.mjs`：PASS，3 项非 rule 生成包内容身份不变。
- `git diff --check`：PASS。

Windows 普通沙箱对个别 Node/Next 子进程返回 `spawn EPERM/status=null`；在同一候选、允许子进程的受控执行中重跑全部通过。这是宿主执行权限差异，未放宽任何产品断言。

## 未解锁的后续授权

1. 独立 Windows 后台托管/监督协议候选：需绑定 PID、启动身份、心跳、退出码、最终状态，并默认拒绝未受监督运行。
2. 独立证据 `--emit` 授权（若产品要求在 E 盘持久化本次中断证据）。
3. 新 run identity/control 正式 emit 授权。
4. 第二次正式 Pilot 启动授权。

本候选不授权上述任何一项。

## 零运行/零产物声明

- 正式 Pilot 新增执行：0 局。
- 训练/selfplay/Smoke/model/ONNX/checkpoint：0。
- E 盘新证据、control、manifest、ledger、分片或训练产物：0。
- 服务/18768/部署操作：0。
- Storage、用户页面、对局、导出：0 访问。

