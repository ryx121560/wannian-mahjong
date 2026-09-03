# Stage8 首批 BC 样本管线验收探针候选报告

状态：`candidate`（未提交、未推送、未部署、未获真实样本写入授权）  
首次建立日期：2026-09-01  
最终复核日期：2026-09-03  
候选：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-bc-sample-probe-20260901`  
分支：`codex/stage8-bc-sample-probe-20260901`  
基线：`origin/main=eeb5747aaa001fec4e133ee88bccce8c7a9529f2`

## 真源与边界

- 规则真源：`docs/rules.md`，SHA-256 `C6C053334FBADC4582C0B42E606B489E0774181AA12EF0148244D5BFE6AD935C`；实际转移继续委托 `src/game/rules`、canonical action registry 与已发布 trajectory executor。
- Stage8 产品真源：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`，SHA-256 `26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`。
- 本候选只是“首批 BC 样本管线验收探针”能力，不是训练生产、策略强度、罕见动作覆盖或 1000 局 Smoke 证据。
- 本轮没有真实样本、E 盘 run/batch/shard、训练、selfplay、Smoke、模型、ONNX、checkpoint、服务、Storage 或用户数据访问。

## 精确 12 文件范围

1. `package.json`
2. `src/game/stage8/offline-bc-sample-writer.ts`
3. `src/game/stage8/offline-bc-sample-probe-control.ts`
4. `src/game/stage8/offline-bc-sample-probe-runner.ts`
5. `scripts/stage8-bc-sample-probe-runner.mjs`
6. `scripts/stage8-bc-sample-probe-verify.py`
7. `scripts/stage8-bc-sample-probe-control-regression.mjs`
8. `scripts/stage8-bc-sample-probe-runner-regression.mjs`
9. `scripts/stage8-bc-sample-probe-cli-regression.mjs`
10. `scripts/stage8-bc-sample-writer-regression.mjs`
11. `scripts/stage8-bc-sample-probe-preflight-gate.mjs`
12. `docs/stage8-bc-sample-probe-candidate-report-2026-09-01.md`

未修改 `src/game/rules`、页面、服务、生产 AI 或训练代码；没有新增依赖。由于规则真源与规则导出均未改变，`public/game/rule_engine.js` 不应重生成，也不得进入候选范围。

## 冻结运行计划

- 完整 136 张、每种 4 张，从真源状态机开始并只在真实 `ended` 停止。
- 固定 4 个游戏槽，`candidateSeat=[0,1,2,3]`，单 worker；基础种子为显式 manifest 输入，派生规则固定为 `baseSeed + gameIndex`。
- 普通完整规则课程，探索关闭，模型加载关闭；四座所有真实决策都由 `stage8-bc-stage7-search-teacher-v1`、温度 1、最大概率后 canonical key 决胜产生。
- 每局最多 600 个成功外部转移；非法动作、无合法集、NaN、非零和、牌数不守恒、超限、非唯一终局均整批熔断。
- 运行容量上限固定为 320 MiB；外部容量预检在运行前和每个 batch 提交前执行。

## 实现与证据契约

### 内存优先与整批原子性

四局必须先在内存中完成，并再次按同一身份执行。每步绑定完整 canonical 合法集、可见投影、教师 evidence、前后状态、公开事件、完整 settlement、episode context 与单调 transition/decision 序号。只有四局及重放全部通过后，事务端口才允许进入四个 batch 的 staged commit；任一批失败，整个 staging run 进入 quarantine，最终目录不出现、可训练产物数按 0 处理。

### 教师缓存隔离

RED 证明：旧的同进程共享 Stage7/规则缓存域会令相同可见状态的部分未选动作 raw score 漂移，虽然 selected action 与真实轨迹相同，但完整 teacher evidence/sample 哈希不一致。此差异不能作为可接受噪声。

GREEN 方案：正式 CLI 为每个教师决策与每个写前样本重验重建同一冷缓存依赖域；完整 raw score、温度分布、selected probability、teacher evidence、sample 与 shard 都必须逐字一致。写入器新增可注入的严格 sample validator，但默认仍使用原验证器；任何隔离验证失败都发生在 partial 文件创建前。

### 重放与终局

- `transitionIndex` 从 1 连续递增，任意前一步 `postStateSha256` 必须等于下一步 `preStateSha256`。
- canonical 动作先由真实执行入口不可变预演，随后由 trajectory executor 执行；状态、公开事件必须一致，settlement 使用真源完整对象绑定。
- 每局记录唯一终局、终局状态 SHA、终局事件 SHA、终局 settlement SHA、四座有限且严格零和 delta 与全局 trace SHA。
- 终局奖励只在 episode 最后一个真实决策样本承载一次；若墙尽发生于系统 draw，运行 ledger 仍以真实 wall-exhaust transition 证明终局，禁止把中间分数冒充奖励。

### 写入与双语言回读

- Node 写入器继续采用 exclusive partial、读回哈希、atomic rename；同一规范样本重排后 gzip shard 文件哈希必须一致。
- Python 3.12 验收器只使用标准库 `gzip/json/hashlib/pathlib` 读取真实 OS 临时 shard；断言协议、样本数、连续 decision trace、唯一终局奖励与零和。脚本不导入 torch。
- 正式 CLI 在控制、artifact root、未来 run path、Python 路径和运行前容量全部通过前，不创建 OS 临时编译目录或 artifact 目录。

## RED/GREEN 与已完成实跑

- RED：共享教师缓存域的完整 `semanticSha256` 不一致；真实 trace 保持一致。候选拒绝把该差异降级为“可接受”。
- GREEN：冷缓存教师域下四局完整 `semanticSha256` 重放一致；4 个 deterministic shard 哈希一致。
- `node scripts/stage8-bc-sample-probe-control-regression.mjs`：PASS。
- `node scripts/stage8-bc-sample-probe-runner-regression.mjs`：PASS；4 局、677 个决策样本，成功转移 `[304,273,130,124]`，四局均真实 win 终局；Node shard readback、整批 quarantine、容量合同通过。
- `node scripts/stage8-bc-sample-probe-cli-regression.mjs`：普通沙箱因 Python 子进程 `spawnSync ... EPERM` 失败；同一候选提升子进程权限后 PASS。4 个 OS 临时 batch、Python 标准库回读、最终目录原子改名通过，finally 清理临时树。
- TypeScript：`node node_modules/typescript/lib/tsc.js --noEmit --incremental false` PASS。
- `npm run test:stage8-bc-sample-probe-preflight`：构建前与构建后各 PASS 一次；每次均复跑控制、4 局完整 runner、CLI/Python 回读和 writer。构建后结果仍为 677 个样本、成功转移 `[304,273,130,124]`、四局真实 win，完整语义重放与 deterministic shard hash 一致；未授权预检临时写入 0，正式样本/E 盘写入/Smoke/训练/模型/服务均为 0。
- `npm run test:stage8-bc-artifact-training-preflight`：普通沙箱因 Python 子进程不可发现而失败关闭；在允许子进程但仍处于同一隔离候选的环境中 PASS。Python 标准库跨语言契约、分片篡改拒绝、artifact root 边界、延迟 torch/onnx 导入均通过；依赖安装、正式资产与 E 盘写入均为 0。
- `npm run test:stage8-bc-preflight`、`npm run test:stage8-offline-trajectory-executor`、`npm run test:stage8-offline-round-integrity`、`npm run test:stage8-offline-four-player-batch`、`npm run test:stage8-v2-action-space`、`npm run test:stage8-v2-kong-execution`：全部 PASS。8 种子四家遍历明确只覆盖规则完整性，实际 canonical 动作为 discard/pass，不作为策略强度或罕见动作 Smoke 证据。
- `npm run build`：PASS，Next 静态页 8/8，`BUILD_ID=67l3HwVuqNHKueDnFtfmT`。构建后 `node scripts/build-browser-rule-engine.mjs --check` PASS，`rule_engine.js` SHA-256 为 `A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB`；三项冻结浏览器生成包内容身份门禁 PASS，四项 `public/game` 生成包均无候选差异。
- 构建后再次执行 TypeScript 与聚合门禁均 PASS；`git diff --check` PASS，最终 `git status --short` 严格为上述 12 个候选文件，`tsconfig.tsbuildinfo` 为 0，OS 浏览器快照及 BC probe 临时目录残留为 0。

## 仍需单独授权

即使本候选全绿，也不得据此写入首批真实 4 局。真实运行至少仍需产品单独批准并提供/冻结：

1. 真实 runId、approvalId、baseSeed 与完整 manifest 哈希；
2. 已预检的外置 artifact root、全新最终 run path 与环境 manifest；
3. 容量预检 provider 身份及运行时可用空间证据；
4. 仅本次 4 局的明确写入授权和运行后独立验收；
5. 后续训练、模型、ONNX、Smoke、Pilot、Arena、Champion、runtime 仍各自独立授权。

## 风险与限制

- 冷缓存域是为消除既有教师缓存状态对数值 evidence 的污染，带来明显验收耗时；不能以性能优化为由恢复共享缓存或弱化完整哈希门禁。
- 四局只能验证首批管线闭环，不代表动作分布、罕见杠覆盖或策略质量。
- OS 临时夹具只证明协议与提交机制；本轮没有验证真实 E 盘路径写入，因为该动作未获授权。
