# Stage8 BC 正式语料 Pilot 运行器候选报告（未发布）

## 结论

本候选在 `origin/main=9aa558e6ff6f34f7accf994c1890ff0d192f3a51` 上新增默认拒绝的正式 BC 语料 Pilot 运行器。它把已发布的规则真源、canonical BC 教师、样本协议、原子分片写入器、artifact root 预检、容量上限和 corpus manifest 串成一个可审计事务，但本次只运行 OS 临时夹具和一局真实规则链，正式 64 局 Pilot 实际执行数为 0，未生成正式语料，也不构成训练授权。

## 精确范围（11 文件）

1. `package.json`
2. `src/game/stage8/offline-bc-sample-probe-runner.ts`
3. `src/game/stage8/offline-bc-corpus-manifest.ts`
4. `src/game/stage8/offline-bc-corpus-runner.ts`（新增）
5. `scripts/stage8-bc-corpus-runner.mjs`（新增）
6. `scripts/stage8-bc-corpus-regression.mjs`
7. `scripts/stage8-bc-corpus-runner-regression.mjs`（新增）
8. `scripts/stage8-bc-corpus-cli-regression.mjs`（新增）
9. `scripts/stage8-bc-corpus-verify.py`
10. `scripts/stage8-bc-corpus-preflight-gate.mjs`
11. `docs/stage8-bc-corpus-runner-candidate-report-2026-09-09.md`（新增）

未修改页面、常规游戏规则、计分、生产 AI、服务、部署脚本或训练实现；未新增依赖。

## 实现与真源映射

- `executeStage8BcTeacherGame` 从既有 4 局 probe 中抽成通用单局执行入口；原 `executeStage8BcSampleProbeGame` 仍按原控制、种子和返回契约委托它，既有 API 与语义保留。
- formal control 固定 64 局、`baseSeed + gameIndex`、单 worker、四座各 16 局、每局最多 600 次成功转移，拆分固定为 48/8/8；run id 必须是 `formal-bc-corpus-*`，包含 probe/diagnostic/rerun 的身份拒绝。
- 每局调用真实规则/轨迹链；同输入执行两次并比较 semantic hash。测试矩阵用 128 次轻量 fixture 验证事务，不把它表述成真实 64 局。
- 每个样本从实际 canonical 合法集和教师分布汇总 legal opportunity、正概率和实际选择；全局 sample/episode 去重，终局四家 delta 必须有限且严格零和。
- 容量预检固定执行 66 次：运行前、每个分片前和最终提交前；同时约束单次运行 5 GiB、artifact root 64 GiB 硬上限、卷使用率投影必须低于 80%。
- writer 每局一个原子 gzip shard；全部先写 `.partial` staging。Python 对 64 个分片、三个 split、文件/payload/样本/张量/终局奖励/动作覆盖逐项验证后，才允许写 ledger 并把 staging 原子改名为最终目录。
- 失败不改 seed、不自动重试；最终目录永不出现，已产生的 staging 写入结构化 `QUARANTINED.json` 后隔离。
- Python `--verify-directory MANIFEST ROOT [STAGED_RUN]` 只校验 corpus，不返回训练输入，也不导入 torch；staging 映射保持最终 `runId/...` 相对路径身份不变。
- CLI 在任何 OS 临时编译或 artifact 写入之前完成 control/artifact/BC 交叉身份、外置根、最终目录、现存目标和完整容量预检。

## RED / GREEN

- RED：原主线只有 corpus 准入/拆分协议，没有正式 64 局事务、分片循环、Python 全 split 读取、容量逐批检查或原子最终发布。
- GREEN：纯事务 fixture 固定 64 槽位、128 次确定性执行、64 shard commit、66 次容量检查、48/8/8、重演 hash 一致。
- GREEN：重演漂移、全局重复 sample/episode、容量失败、Python 证据失败和 probe 命名身份均 fused；最终提交次数为 0。
- GREEN：CLI 授权篡改在临时目录创建前拒绝，写入计数为 0；成功夹具仅在 Python 通过后原子改名；中途失败只生成隔离目录和结构化原因。
- GREEN：Python 在 OS 临时目录读取 64 个最小协议分片，覆盖 train/validation/final-test，并验证直接最终路径及 staging→最终相对身份映射；篡改分片拒绝；`torchImported=false`。
- GREEN：一局真实 `executeStage8BcTeacherGame` 从规则状态推进到唯一胡/墙尽，转移不超过 600，样本非空，四家 delta 零和。该证据不是正式 64 局 Pilot。

## 已运行门禁

- `npm run test:stage8-bc-corpus-preflight`：PASS；聚合包含 corpus 协议、runner、CLI、Python 全分片、artifact control、writer、模型生命周期、Python 代码和 TypeScript；`pilotGamesExecuted=0`、`trainingStarted=false`、`artifactsWritten=false`。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS。
- `npm run test:stage8-offline-round-integrity`：PASS。
- `npm run test:stage8-offline-trajectory-executor`：PASS。
- `npm run build`：PASS，Next 8/8，`BUILD_ID=alexC6whEl_LXv3KZFnJG`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS。
- 构建后 `node scripts/assert-browser-build-artifacts-clean.mjs`：PASS。
- `git diff --check`：PASS；构建后四个 `public/game` 生成包与 HEAD 内容身份一致；无 `tsconfig.tsbuildinfo`、无浏览器快照残留。

补充说明：既有 `stage8-bc-sample-probe-runner-regression.mjs` 在当前 Windows 主机输出全部 PASS 后，其历史 OS 临时编译目录清理长时间未返回，因此没有把该进程状态伪报为成功；已只终止该测试进程。候选聚合直接复用相同已发布 probe 执行器完成一局真实链且正常退出，原 4 局 probe API/控制/返回语义未删除或改名。独立验收如要求该历史脚本本身必须正常退出，应将其视为主机/旧脚本清理卫生的独立关注项，而非正式 Pilot 运行授权。

## 风险与不得跨越的边界

- 本候选未在真实外置根运行，也没有真实 64 局行为分布、语料规模、稀有动作覆盖率、磁盘占用或吞吐证据；这些只能在新的明确运行授权下取得。
- 正式运行仍必须提供并逐项通过 corpus control、artifact control、BC control、外置 root、Python 和全新最终目录；任何缺件默认拒绝。
- 64 GiB 是 artifact root 累计硬上限（含保留/隔离内容），5 GiB 是本次 run 上限；容量不足或投影达到 80% 即熔断。
- 本候选不允许训练、模型加载、探索、Smoke、自弈、ONNX 导出或 runtime；语料生成完成也不自动进入任何下游阶段。
- 本轮正式 Pilot=0、正式语料=0、E 盘写入=0、训练=0、部署/18768=0、Storage/用户页面/对局/导出访问=0。

## 下一授权节点

只有候选经独立复验并发布后，产品才可另行审批一次真实 64 局 corpus Pilot。该运行授权必须指定正式 control manifests、外置 root、最终 run directory、Python 身份和磁盘预算；完成后仍需独立验收 corpus manifest/ledger/隔离与覆盖证据，不能自动进入 BC 训练。
