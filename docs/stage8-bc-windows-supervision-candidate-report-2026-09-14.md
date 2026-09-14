# Stage8 BC Pilot Windows 后台托管与监督协议候选报告

- 状态：`candidate`（未提交、未推送、未部署）
- 日期：2026-09-14
- 基线：`origin/main=82791f46e634eec6e49237eab30dcf30b1a2970f`
- 工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-bc-pilot-supervision-20260914`
- 分支：`codex/stage8-bc-pilot-supervision-20260914`
- 真源：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`

## 结论

候选将正式 BC corpus worker 从 Codex/启动器的短生命周期中解耦：短生命周期 launcher 只负责完整预检、原子占位监督目录、隐藏式启动 detached supervisor 并等待首个有效状态；supervisor 独立持有唯一 worker、心跳、进度、日志、退出码、隔离和终态证据。Codex 仅使用只读 status 模式监控。

单命令 Windows OS 临时夹具已证明：launcher 子进程先退出后，detached supervisor 仍存活，worker 继续运行并产生单一 `committed` 终态；但该结果不足以证明整个 Codex/exec 命令会话结束后仍能存活。候选现提供两个必须由产品在两个独立 exec 调用中执行的跨命令模式：第一条命令直接作为 launcher，第二条命令必须证明第一条命令 PID 已结束，并在自身启动后观察到同一 supervisor 发布的新心跳，随后验证唯一 `committed` 终态、完整状态哈希链、无残留进程并清理 OS 临时夹具。在产品实际执行这两个独立命令前，本报告不声称跨 Codex 命令会话已通过；即使通过，也不将其夸大为任意 Windows Job Object 的 `breakaway` 保证。Node 未显式暴露 `CREATE_BREAKAWAY_FROM_JOB`，若正式宿主环境另有 kill-on-close Job，必须停止并单独评审 Task Scheduler/Windows Service，本候选没有创建任何计划任务或服务。

## 精确 12 文件

1. `package.json`
2. `src/game/stage8/offline-bc-supervision-control.ts`（新增）
3. `src/game/stage8/offline-bc-run-identity.ts`
4. `src/game/stage8/offline-bc-corpus-control.ts`
5. `scripts/stage8-bc-corpus-supervised-launch.mjs`（新增）
6. `scripts/stage8-bc-corpus-supervisor.mjs`（新增）
7. `scripts/stage8-bc-corpus-runner.mjs`
8. `scripts/stage8-bc-supervision-regression.mjs`（新增）
9. `scripts/stage8-bc-run-identity.mjs`
10. `scripts/stage8-bc-run-identity-regression.mjs`
11. `scripts/stage8-bc-corpus-cli-regression.mjs`
12. `docs/stage8-bc-windows-supervision-candidate-report-2026-09-14.md`

未改麻将规则、页面、AI 策略、训练算法、依赖、服务或用户数据。

## 真源映射

- PRD 14.1：使用独立后台命令，不依赖浏览器或 Codex 会话存活。
- PRD 11.1：将外部宿主中断与数据/规则/训练失败分类；未完成分片不复用、不续写、不计入有效语料。
- PRD 15.1：`operationalInterruption` 最多一次。当前前件已有一次，因此本次若再中断，终态固定为 `operational-interruption-limit-reached`，隔离未完成目录，不得自动第三次启动。
- 既有 64 局 BC corpus 计划仍为单进程、单 worker、固定 seed 派生；本候选不改数据或策略语义。

## 协议与失败关闭

- run authorization 和 run identity 升级至 v3，新增独立 supervision approval；source bundle 纳入 launcher、supervisor、runner 和纯协议定义。
- corpus control v3 固定 `supervisedExecutionRequired=true`、`workers=1`、`priorOperationalInterruptions=1`、`maxOperationalInterruptions=1`、`automaticRetries=0`、`seedOverrides=0`。
- supervision control 绑定 runId、source commit/bundle、run authorization、artifact/corpus control、前件中断证据、三个运行脚本 SHA 和协议定义 SHA。
- launcher 在任何监督目录或进程创建前完成五域身份、仓库、前件隔离事实、路径、64 GiB/80% 容量熔断验证。
- 监督目录使用非递归 `mkdir` 作为原子独占锁；既存即拒绝，不删锁、不自动重试。
- launcher 使用绝对 Node 可执行文件、数组参数、`shell:false`、`windowsHide:true`、`detached:true`，无 shell 字符串拼接；只传递明确环境白名单。
- supervisor 只启动一个非 detached worker，由 IPC 接收每局/分片进度；worker 在任何 staging/分片写入前再校验 supervisor PID、nonce、初始状态、命令身份和全套既有 run identity/control/evidence。
- 状态文件按序号不可变新建，绑定前序 SHA；记录 launcher/supervisor/worker PID，实际进程启动时间，Node/argv/env/cwd 身份，心跳、进度、退出码/signal 和终态。
- 日志不写授权正文或环境秘密；worker 日志上限 4 MiB，监督证据上限 16 MiB，每次状态写入重新检查 80% 磁盘熔断。
- monitor `--status` 仅读：复核状态链、PID 存活、进程启动时间、Node 字节身份和心跳，返回 `running/completed/failed/stale/tampered`；不杀进程、不改状态。

## RED / GREEN

新增 `npm run test:stage8-bc-supervision`，全部使用 OS 临时目录：

- GREEN（单命令边界）：launcher 子进程退出后 supervisor 仍存活，假 worker 继续并以 `committed` 唯一终态完成。
- GREEN：重复启动同 runId 被原子目录锁拒绝。
- RED/GREEN：旧 v2 corpus control、缺失监督身份和正式 runner 直连 CLI 均失败关闭。
- RED/GREEN：状态自哈希、前链、command/env/cwd 身份漂移或伪造均拒绝。
- RED/GREEN：无 PID 进程返回 `stale`；PID 启动时间不一致返回 `tampered`，避免 PID 重用误判。
- RED/GREEN：容量熔断在监督目录和子进程创建前发生。
- GREEN：假 worker 退出码 17 且没有正式 result 时，`.partial` 被原子隔离，终态为 `operational-interruption-limit-reached`，`automaticRetries=0`、`seedOverrides=0`，不存在第三次自动启动。
- `npm run test:stage8-bc-run-identity`：PASS，81 项 source identity，监督 control/source 绑定通过，真实 control emit=0。
- `npm run test:stage8-bc-corpus-cli`：PASS，正式直连 CLI 默认拒绝，旧 v2 仅保留为内存/临时回归。
- `npm run test:stage8-bc-corpus-runner`：PASS。
- `npm run test:stage8-bc-corpus`：PASS。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS。

跨 Codex/exec 命令会话的独立复验必须严格拆成以下两次调用，不能再包进同一个 Node、PowerShell 或外层 exec 进程：

1. `node scripts/stage8-bc-supervision-regression.mjs --cross-session-launch "$env:TEMP\stage8-bc-supervision-cross-session-20260914.json"`
2. 待第一条命令完整返回后，另起一次 exec：`node scripts/stage8-bc-supervision-regression.mjs --cross-session-verify "$env:TEMP\stage8-bc-supervision-cross-session-20260914.json"`

第一阶段的假 worker 必须先亲自观察第一条命令 PID 已不存在，再等待约 3.5 秒、发送受哈希状态链绑定的进度并终局；第一阶段本身只写 OS 临时夹具并立即返回。第二阶段先独立确认第一命令 PID 已不存在，再观察同一 supervisor 的后续状态或读取已完成终态；终态必须包含仅在 launcher 命令退出后才会发送的 64 局进度，然后验证逐项哈希链、单一 committed 状态及 supervisor 已退出，最后清理整个 OS 临时根和配置文件。当前候选尚未自行执行或声称该两阶段跨命令证据通过，等待产品独立复验。

## 最终门禁

- `npm run test:stage8-bc-corpus-preflight`：PASS，`pilotGamesExecuted=0`、`trainingStarted=false`、`artifactsWritten=false`。
- `npm run test:stage1-runtime-hygiene`：PASS。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS。
- `npm run build`：最终代码状态重跑 PASS，Next 8/8，`BUILD_ID=DLAA72hQdmRAsh6qWlnQm`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS。
- 构建后 `node scripts/assert-browser-build-artifacts-clean.mjs`：PASS，3 项非 rule 生成包继续精确匹配冻结内容身份。
- `git diff --check`：PASS；工作树差异精确 12 项；`tsconfig.tsbuildinfo=0`；OS 浏览器包快照残留=0。

## 运行与数据边界

- 正式 BC Pilot：0 局。
- E 盘正式新目录、control、分片、manifest、ledger、证据：0。
- 训练/selfplay/Smoke/model/ONNX/checkpoint：0。
- 部署/18768/服务操作：0。
- Storage、用户页面、对局、导出：0 访问。
- 本候选只允许 OS 临时夹具的短生命周期进程，不产生训练语料或策略强度证据。
