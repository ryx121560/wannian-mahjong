# Stage8 BC 正式语料准入与数据集切分候选报告

状态：candidate（未提交、未推送、未部署、未运行正式语料 Pilot 或训练）
日期：2026-09-09
候选：`codex-stage8-bc-corpus-admission-20260908`
基线：`d109047ec2ae162570f0f686bbeb7970e08b5887`

## 结论

本候选只建立正式 BC 语料的默认拒绝控制、单次运行清单、48/8/8 episode 级切分、训练票据绑定，以及 Node/Python 双端校验能力。它不生成正式样本，不运行 64 局 Pilot，不启动训练，也不授权将历史探针数据用于训练。

既有 `bc-probe-20260908-rerun-a` 的 677 条样本及此前中断运行继续永久仅作诊断证据。本候选要求未来正式语料来自一个全新的、身份完整的单次运行；旧探针不能复制、混入或作为训练输入。

## 精确文件范围（8）

1. `package.json`
2. `src/game/stage8/offline-bc-corpus-control.ts`
3. `src/game/stage8/offline-bc-corpus-manifest.ts`
4. `src/game/stage8/python/stage8_bc/dataset.py`
5. `scripts/stage8-bc-corpus-regression.mjs`
6. `scripts/stage8-bc-corpus-preflight-gate.mjs`
7. `scripts/stage8-bc-corpus-verify.py`
8. `docs/stage8-bc-corpus-candidate-report-2026-09-09.md`

没有修改页面、游戏规则、计分、生产 AI、服务、部署或 Stage8 训练执行器；没有新增依赖。

## 冻结产品契约

- 未来正式 Pilot：64 局，`baseSeed=2026090800`，种子按 gameIndex 连续派生，单 worker。
- 候选座位：`gameIndex % 4`，四座各 16 局。
- 课程：`normal-full-rules`；无探索、无模型加载；每局最多 600 个成功转移。
- 容量：本次运行 5 GiB 上限；复用外置根 64 GiB/80% 熔断身份，并要求运行前及每批原子提交前重验。
- 切分单位：episode/seed；固定为 train 48、validation 8、final-test 8，不允许 episode 跨切分。
- 单次运行：`sourceRunPolicy=single-run-only`；默认拒绝跨运行合并。
- 强制记录所有 canonical 动作的合法机会、正概率次数和实际选择次数；Pilot 不设置稀有动作硬阈值。
- 非法动作、隐藏信息泄漏、NaN/非有限值、非零和、不可重放、重复 sample/episode、split 泄漏、身份不兼容任一非零即熔断隔离。

## 身份和训练边界

控制清单逐项绑定 source bundle、artifact control、BC control、rules/browser rules、action/mask、feature/visible information、tensor、teacher、sample、writer、trajectory、Python dataset、corpus manifest definition 和容量预检哈希。

语料清单为 64 个分片逐项绑定文件 SHA-256、payload SHA-256、run/batch/shard、gameIndex/seed/seat/split、episode/sample、真实终局四家有限零和 delta 和全动作覆盖计数。全局拒绝重复文件路径、文件哈希、payload、episode 和 sample。

训练绑定是独立授权对象，只允许 train split，并把 corpus manifest、corpus run、training lifecycle、training run、train payload set、train split 和 train shard set 全部交叉绑定。validation/final-test 明确禁止作为训练输入。

Python 新增 `Stage8BcFormalCorpusDataset`：先完成清单和训练票据校验，再只打开清单绑定的 48 个 train 分片，逐文件校验 SHA-256，并把 source run 身份传给既有 shard 记录验证器。既有 `Stage8BcShardDataset(ticket, paths)` 调用保持兼容；正式语料训练必须在后续独立授权中显式切换到新类，当前训练调用方未被本候选改动。

## RED / GREEN

RED 覆盖：

- 缺失明确授权或 64 局计划被篡改。
- 跨运行来源、重复 sample、重复 episode、切分泄漏、任一硬异常。
- 训练绑定允许 validation、训练票据 payload set 指向非 train。
- Python/Node 清单定义或规范哈希不一致。
- train 分片路径越界、文件 SHA 被篡改、source run 不一致。

GREEN 结果：

- `npm run test:stage8-bc-corpus`：PASS；64 个内存描述符、48/8/8、四座均衡、单运行和全动作报告契约通过；正式 Pilot 0 局。
- `python scripts/stage8-bc-corpus-verify.py --self-test`（Python 3.12 环境）：PASS；Node/Python 规范哈希一致，只选择 48 个 train 分片，validation/final-test 未进入训练输入，分片篡改被拒绝；`torchImported=false`。
- `npm run test:stage8-bc-corpus-preflight`：PASS；同时复跑 artifact control、sample writer、model lifecycle、Python code 与 TypeScript；`pilotGamesExecuted=0`、`trainingStarted=false`、`artifactsWritten=false`。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS。
- `npm run build`：PASS，Next 静态页 8/8，`BUILD_ID=Rq8eENcS0-IfENh-dn4cq`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS。
- 构建后 `node scripts/assert-browser-build-artifacts-clean.mjs`：PASS。
- 四个 `public/game` 生成包构建前后 SHA-256 完全一致；`git diff --check`：PASS。

浏览器生成包 SHA-256：

- `rule_engine.js`: `A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB`
- `strong_rule_ai.js`: `35C1BCECE0BB579687BF91056BD541DCC283A79879BD580AA1044AD729864B01`
- `recommendation_engine.js`: `DDC570B481D53E226E3405A54340A08ECF1B4AC09EF0C74E4DE5618992975FC9`
- `mcts_enhancement_engine.js`: `126EE7A472F5C7CFB8B37A8BCF7E91BE29FA0F46ACBA028C64A3AAFFCD3D58F5`

## 未覆盖和后续独立授权节点

1. 本候选没有运行 64 局，因而没有正式 corpus manifest、分片或动作覆盖实测值。
2. 没有读取、复制或重新签名既有 677 条诊断探针样本。
3. 没有把现有训练入口切换到 `Stage8BcFormalCorpusDataset`，更没有训练模型。
4. 正式 Pilot 运行、外置根写入、语料验收、训练调用方接入、训练、checkpoint、ONNX、Smoke/Pilot/Arena/Champion/runtime 均须分别获得产品明确授权。
5. 外置 artifact root 的真实路径/容量/空目录等运行前条件由已发布 preflight 在正式授权时重验；本候选只绑定其清单身份，没有访问 E 盘探针内容。

因此，候选通过仅表示“正式语料准入与切分协议具备复验条件”，绝不等于已生成可训练语料，更不等于训练授权。
