# Stage8 BC 教师与样本协议候选报告（未发布）

- 日期：2026-08-27
- 状态：`candidate`
- 候选工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-bc-teacher-sample-protocol-20260827`
- 分支：`codex/stage8-bc-teacher-sample-protocol-20260827`
- 基线/HEAD/origin-main：`2b76922eb9ecb6503ce1deb48d807e437b627552`
- 正式 PRD：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`
- 规则真源：`docs/rules.md` 与 `src/game/rules`
- Vault candidate 来源：`E:\Obsidian\PersonalKnowledgeVault\PersonalKnowledgeVault\00-Inbox\2026-08-27-万年麻将-阶段八BC教师与样本协议来源.md`
- Vault 来源 SHA-256：`A5D7A40A8B44AA9AA3583390B8D188B255B3576A7C832446DFE478825A69F69B`

## 结论

候选建立了默认拒绝、纯内存、无模型融合的行为克隆教师与样本 envelope 验证协议。教师只接收严格 Stage8 可见状态和调用方提供的完整 canonical 合法动作集合，复用阶段七强规则决策与既有 MCTS 确定性评分面，输出固定温度 `1` 的全候选分布。候选没有生成正式样本、没有启动 Python、训练、模型、ONNX 导出、Smoke 或服务。

该结论仅表示“BC 教师/样本协议前置能力可交验”，不表示行为克隆数据已生成、模型已训练或阶段八训练已获授权。

## 精确 9 文件范围

1. `package.json`
2. `src/game/stage8/offline-bc-control.ts`
3. `src/game/stage8/offline-bc-teacher.ts`
4. `src/game/stage8/offline-bc-sample-protocol.ts`
5. `src/game/stage8/offline-canonical-mcts-provider.ts`
6. `scripts/stage8-bc-teacher-regression.mjs`
7. `scripts/stage8-bc-sample-protocol-regression.mjs`
8. `scripts/stage8-bc-preflight-gate.mjs`
9. `docs/stage8-bc-teacher-sample-protocol-candidate-report-2026-08-27.md`

无 `package-lock.json` 变化，无新依赖，无页面、规则、服务、生产 AI、Storage 或训练运行代码变化。

## 真源与实现映射

| PRD/真源要求 | 实现位置 | 证据 |
|---|---|---|
| 行为克隆教师来自阶段七统一决策与 MCTS | `offline-bc-teacher.ts`、`offline-canonical-mcts-provider.ts` | 教师调用 `strong-rule-ai.makeDecision` 并向既有 `scoreMctsCandidateValues` 提供可审计候选信号；未调用页面 `aiChooseDiscard`/`aiRespond` |
| 训练/线上同一可见信息边界 | `offline-bc-teacher.ts`、已发布 ONNX tensor allowlist | 只包含本人暗手、公开副露/弃牌、分数、座位、轮次、阶段、墙余量；递归额外字段拒绝 |
| 完整合法动作概率分布 | `offline-bc-teacher.ts` | canonical 排序、完整集合 SHA、每个候选有限分值和正概率、总和为 1 |
| 冷启动不伪装 RL 奖励 | `offline-bc-sample-protocol.ts` | 教师分布单独记录；终局奖励仅接受真实四家有限零和 delta，非终局只接受同 episode 的终局引用 |
| 版本/身份可审计 | `offline-bc-control.ts`、教师 evidence、sample envelope | 绑定源码、规则、浏览器规则、动作、合法 mask、特征、可见信息、tensor、教师定义、样本 schema 与逐步 replay 哈希 |
| 默认拒绝且无副作用 | 三个 BC 模块 | 缺授权、身份不符、隐私字段、候选缺失、NaN、概率异常、非法选择或 replay 篡改均返回 `fused`；所有运行开关必须严格为 `false` |

## 实现摘要

### 控制协议

- 授权 scope 固定为 `bc-teacher-protocol-preflight`，缺失或非严格布尔 `true` 拒绝。
- 样本生成、Python、训练、模型创建、ONNX 导出、产物写入、Smoke 和 runtime 八项开关必须严格为 `false`。
- manifest 逐字段规范哈希；未知字段、非法 ID、非 SHA-256 身份失败关闭。

### 教师

- 丢牌阶段使用 Stage7 强规则为每个合法丢牌补齐结构、向听、路线、防守等候选信号。
- 所有 canonical 动作进入既有 MCTS 评分面，固定温度 softmax 覆盖完整候选；最大概率后以 canonical key 稳定破同分。
- `modelFusion=false`；不调用冻结模型、ONNX 推理或正式 canonical 模型融合 provider。
- evidence 绑定可见状态、完整合法集、原始分值、分布、选中动作、决策 actor、可见 currentPlayer、phase、Stage7 决策理由与自身哈希，并严格拒绝额外字段。
- `discarding` 必须满足 `actor===currentPlayer`；`responding` 明确保留响应 actor 与出牌方 currentPlayer 不同的合法语义，禁止教师静默改写座位上下文。

### 样本 envelope

- 重新执行教师并逐字比对 evidence，而不是只相信调用方提供的自洽哈希。
- replay 绑定固定 seed、episode、trace step、选中 canonical 动作、前后状态、公开事件、episode context、可见状态、完整合法集和教师证据。
- 终局 delta 必须为四个有限数且严格零和；非终局奖励引用必须与 replay 属于同一 episode。
- 这是内存验证协议；当前不提供 sample writer，也不包含模型/ONNX/manifest 字段。

## RED / GREEN

### RED（基线能力缺口）

- 基线没有 `offline-bc-control.ts`、`offline-bc-teacher.ts` 或 `offline-bc-sample-protocol.ts`。
- 基线 canonical MCTS provider 只有模型融合 provider，没有可供 BC 教师独立调用的完整纯评分面。
- 基线没有 BC 教师、BC 样本或单一 BC preflight 命令，因此无法证明严格可见投影、全候选教师分布和重算证据。
- 首轮候选独立验收 RED：`discarding` 的 actor/currentPlayer 不一致未熔断，且专项只有弃牌候选，未定向证明响应态动作分布。
- 修订后独立复核再次发现原响应 fixture 手工放入的 `win` 未由规则真源证明，实际 `canWin=false`；规则同时规定胡优先，合法胡出现时响应集合收敛为 `win/pass`，不能与碰/杠伪装成同一时刻完整合法集。

### GREEN（候选实跑）

- `npm run test:stage8-bc-teacher`：PASS；14 个 canonical 丢牌候选，以及两组由 `src/game/rules` 实际推导的完整响应集合均全覆盖：非胡牌声明态为 `pong/directChisel/pass`，合法点炮胡态按真源优先级为 `win/pass`。两组共同覆盖 `pass/pong/win/directChisel`，每组概率均有限且为正、总和为 1；`discarding` 错座位及自洽篡改证据熔断，`responding` 不同座位合法通过；隐藏字段、候选缺失、NaN、非法选择、授权/开关/证据篡改拒绝；模型融合为 false。
- `npm run test:stage8-bc-sample-protocol`：PASS；13 类内存 envelope 场景；教师证据重算、完整合法集、canonical 顺序、终局零和、同 episode 引用和 replay/sample 哈希均验证。
- `npm run test:stage8-bc-preflight`：PASS；同进程运行两项专项与 TypeScript API；正式样本、Python、训练、模型、ONNX、产物、Smoke、服务均为 0。

## 既有门禁

- `npm run test:strong-ai`：PASS，`391/391`。
- `npm run test:stage7-ai-unified`：PASS，`58/58`。
- `npm run test:stage8-canonical-mcts-provider`：PASS；模型推理实际调用 2 次，模型分布仍影响输出，生产决策语义未变。
- `npm run test:stage8-sample-replay-model-protocol`：PASS。
- `npm run test:stage8-offline-selfplay-preflight`：PASS；只执行既有内存回归，正式 Smoke 0 局、无产物。
- `npm run test:stage8-v2-action-space`：PASS。
- `npm run test:stage8-v2-kong-execution`：PASS。
- `node node_modules/typescript/lib/tsc.js --noEmit --incremental false`：PASS，无 `tsconfig.tsbuildinfo`。

## 构建与生成包卫生

- 普通沙箱首次 `npm run build` 在 Next 子进程处因 Windows `spawn EPERM` 失败；包装器成功恢复生成包并清理 OS 临时快照，未留下额外项目差异。
- 允许 Next 子进程的同一隔离候选重跑 `npm run build`：PASS，静态页 `8/8`，退出码 0。
- 规则真源夹具补正后最终 `.next/BUILD_ID`：`f_8niehGyrJyqkbW0QGmv`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS。
- 构建后 `node scripts/assert-browser-build-artifacts-clean.mjs`：PASS。
- `public/game/rule_engine.js` SHA-256：`A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB`。
- 四项 `public/game` 跟踪生成包均无 Git 差异；OS 浏览器快照残留 0。
- 构建后 `npm run test:stage8-bc-preflight` 与 TypeScript 再次 PASS。

## 可见信息、确定性与失败关闭边界

- 教师不接收完整 `GameState`，因此不能看到对手暗手或真实墙序；递归 schema allowlist 拒绝额外字段。
- 弃牌态座位身份必须一致并写入 evidence；响应态以 actor 表示当前响应者、currentPlayer 表示触发响应的出牌方，两者可不同且共同进入可见状态哈希。
- 响应 fixture 的动作集合由规则真源复算：`canWin/getLegalActions` 证明合法胡与胡优先，禁止把结构上可碰/杠但因胡优先当前不可选的动作伪装进同一完整合法集。
- 完整合法动作集合必须由后续调用方从已发布规则/round executor 派生并同时提供该步完整集合哈希；本候选不自行选择、删减或补造合法动作。
- 同一 control、可见投影和 canonical 集合产生相同原始分值、概率、选择与 evidence 哈希。
- 任一失败只返回内存 `fused` 决策，不修改输入，不创建目录或文件。

## 未覆盖与后续硬门槛

- 当前没有正式 BC 样本生成器、外置样本 writer、Python/PyTorch 数据加载、双头模型训练、ONNX 导出或模型 manifest。
- 当前 fixture 身份为确定性测试身份，不是真实训练运行身份。
- Stage7 教师用于冷启动下限，不是最终策略强度证据；PRD 明确进入 RL 后不得继续奖励模仿 Stage7。
- 正式样本生成、BC 训练、模型/ONNX 资产创建、Smoke、Pilot、Arena、Champion 和 runtime 均需后续独立授权。

## 零运行与零数据声明

- 正式 BC 样本生成：0。
- Python/PyTorch 进程：0。
- 训练步数：0。
- 新模型、ONNX、manifest、checkpoint：0。
- 正式 Smoke、自弈、replay、Pilot、Arena、Champion：0。
- E 盘训练资产写入：0。
- 服务/18768 操作：0。
- 浏览器 Storage、用户页面、对局、导出访问：0。
- 提交、推送、部署：0。
