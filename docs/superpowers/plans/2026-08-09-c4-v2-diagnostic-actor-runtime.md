# C4 v2 Diagnostic Actor Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在产品另行授权后，实现一个只消费可见 observation 与 v2 canonical 合法动作的确定性诊断 actor，并证明 C3 value observer 开关不改变主对局。

**Architecture:** 可信规则控制器拥有完整状态并完成合法动作、胡/抢杠优先和动作执行；actor 只接收脱敏 observation 与已授权 canonical actions。actor 使用独立 SHA256 seed 域确定性选择，C3 step150 仅作为 value observer，不能读取其 v1 policy logits。

**Tech Stack:** TypeScript、Node.js、现有 Stage8 v2 registry/rule/round-engine；不新增依赖。

## Global Constraints

- 本计划未获实现授权时不得执行。
- 不读取墙顶、未来墙或对手暗手，不访问 HTML/GS/DOM/Storage。
- 不使用 v1 action/replay/checkpoint/model/manifest 作为 actor 输入。
- 不创建 selfplay、replay、model、ONNX、Candidate-4、训练或 Arena 产物。
- 所有输出只能进入独立临时 fixture 根；诊断语料根仍需后续单独授权。

---

### Task 1: 可见 observation 与协议拒绝边界

**Files:**
- Create: `src/game/stage8/diagnostic-actor-v2.ts`
- Create: `scripts/stage8-c4-diagnostic-actor-runtime-regression.mjs`

**Interfaces:**
- Consumes: `CanonicalStage8V2Action[]`
- Produces: `Stage8C4DiagnosticActorObservation`、`assertStage8C4DiagnosticActorInput()`

- [ ] **Step 1: 写失败回归**

构造只含可见字段的 observation，应通过；分别注入 `wallTiles`、`wallTop`、`opponentHands`、`policyLogits`、`replay`、`checkpoint`、`model`、`manifest`、`workRoot` 和 `v1ActionId`，应抛出稳定原因码。

- [ ] **Step 2: 运行红测**

Run: `node scripts/stage8-c4-diagnostic-actor-runtime-regression.mjs`

Expected: FAIL，提示 `diagnostic-actor-v2` 导出不存在。

- [ ] **Step 3: 实现最小输入类型与递归拒绝器**

接口只包含 actor 自己可见手牌、公开副露/弃牌、积分、轮次/阶段、公开最后弃牌、actor 自己资源摘要、墙剩余张数和 canonical legal actions。禁止接收 `GameState`。

- [ ] **Step 4: 运行绿测**

Run: `node scripts/stage8-c4-diagnostic-actor-runtime-regression.mjs`

Expected: PASS，所有禁止字段均失败关闭。

### Task 2: 确定性 canonical sampler

**Files:**
- Modify: `src/game/stage8/diagnostic-actor-v2.ts`
- Modify: `scripts/stage8-c4-diagnostic-actor-runtime-regression.mjs`

**Interfaces:**
- Produces: `selectStage8C4DiagnosticAction(input): Stage8C4DiagnosticActorDecision`

- [ ] **Step 1: 写失败回归**

同一 `gameId/decisionIndex/actorSeat/rootSeed/actions` 重复选择必须完全一致；输入动作重排不能改变结果；不同 observer 开关不能改变结果；空动作、重复 actionId、非 v2 action 和未按规则授权的 action 必须拒绝。

- [ ] **Step 2: 实现 seed 派生与选择**

固定：`rootSeed=2026080901`，domain=`stage8-c4-diagnostic-v2-actor-v1`。按 actionId 升序，SHA256 输入为 `domain\0rootSeed\0gameId\0decisionIndex\0actorSeat`，取无符号计数对候选数取模。

- [ ] **Step 3: 验证 14 类动作覆盖**

每类动作至少构造一个被选 fixture；有竞争候选时再构造一个未被选 fixture。`declineKong` 必须与对应杠候选同时出现，不能作为规则层自动替代。

- [ ] **Step 4: 运行绿测**

Run: `node scripts/stage8-c4-diagnostic-actor-runtime-regression.mjs`

Expected: PASS，输出固定 seed/config fingerprint。

### Task 3: 可信规则控制器与 actor 分层门禁

**Files:**
- Create: `src/game/stage8/diagnostic-actor-controller-v2.ts`
- Create: `scripts/stage8-c4-diagnostic-actor-controller-regression.mjs`

**Interfaces:**
- Consumes: 完整状态仅限 controller 内部
- Produces: 脱敏 observation、rule-authorized actions、selected canonical action、round-engine result

- [ ] **Step 1: 写失败回归**

同一可见状态、不同墙顶时，actor observation、合法 action IDs 和选择必须相同；执行 outcome 可因补牌不同。胡与抢杠由规则层优先，actor 不得看到被压制动作。

- [ ] **Step 2: 实现 controller 边界**

controller 调用 `deriveStage8V2RoundEngineActions` 和既有优先级解析，生成 observation 后调用 sampler；选择完成后才允许 round-engine 消费墙顶。actor 模块不得 import rules、HTML 或页面状态。

- [ ] **Step 3: 运行三层 fixture**

覆盖基础动作、所有特殊杠、普通暗杠、addedKong、chain 与 decline；逐项核对 actionId、资源、墙消耗、outcome、付款、分解签名和公开摘要。

- [ ] **Step 4: 运行绿测**

Run: `node scripts/stage8-c4-diagnostic-actor-controller-regression.mjs`

Expected: PASS，声明层对未来墙不敏感。

### Task 4: Observer on/off 等价与隐私 dry-run

**Files:**
- Create: `scripts/stage8-c4-diagnostic-observer-equivalence-regression.mjs`
- Create: `docs/stage8/candidate-4-v2-actor-runtime-preflight.json`

**Interfaces:**
- Consumes: frozen actor/controller identity、C3 step150 value observer identity
- Produces: 不可覆盖 dry-run 证据；不产生语料 shard

- [ ] **Step 1: 写 off/on 完整等价回归**

observer off/on 比较 canonical legal action IDs、selected actionId、terminal hash、actual actions hash、behavior distribution hash 和 public summary hash。observer 只读取可见 features/value，不读取 policy logits，不消费 actor seed。

- [ ] **Step 2: 加入隐私扫描**

对 actor 输入、决策、公开日志和 preflight JSON 做 allowlist 与 forbidden-key/content 双重扫描，发现墙牌、对手暗手、用户记录或 v1 artifact 即失败。

- [ ] **Step 3: 加入不可覆盖与无下游写入门禁**

已有输出、目标位于 replay/training/checkpoint/model 根、发现任何模型或语料写入时拒绝。dry-run 只允许临时 fixture 输出，结束后保留脱敏哈希报告。

- [ ] **Step 4: 运行完整门禁**

Run: `node scripts/stage8-c4-diagnostic-observer-equivalence-regression.mjs`

Expected: PASS；`corpusCreated=false`、`scaleFitted=false`、`finalTestOpened=false`、`trainingAuthorized=false`。

### Task 5: 身份冻结与产品验收包

**Files:**
- Create: `docs/stage8/candidate-4-v2-actor-runtime-lock.json`
- Create: `docs/stage8/candidate-4-v2-actor-runtime-acceptance-index.json`

**Interfaces:**
- Produces: actor source SHA、registry/rules SHA、config/seed fingerprint、fixture hashes 和 observer equivalence hashes

- [ ] **Step 1: 计算源码与配置指纹**

runtime fingerprint 必须绑定 actor/controller source SHA、commit、v2 registry Git blob SHA、规则依赖指纹、root seed、seed derivation、动作排序和输入 allowlist。任何字段缺失不得标记 ready。

- [ ] **Step 2: 运行完整共享回归**

Run: `npm run test:stage8-v2-action-space && npm run test:stage8-v2-kong-execution && npm run test:rules && npm run test:recommendation && npx tsc --noEmit --incremental false`

Expected: 全部通过；`git diff --check` 无错误；无构建生成物进入范围。

- [ ] **Step 3: 提交产品验收**

报告状态只能是 `actor-preflight-passed-corpus-collection-not-authorized`。不得自动创建诊断根、采集语料或启动训练。
