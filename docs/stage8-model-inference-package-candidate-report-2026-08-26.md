# Stage8 首个候选模型身份包与推理接入候选报告

## 结论

本候选完成的是“默认拒绝、纯离线、可审计”的首个模型身份包与推理接入能力：formal canonical MCTS provider 必须调用一个显式注入的冻结模型推理端口，端口输入只包含当前座位可见投影和完整 canonical 合法动作集合；返回的完整 policy logits 经验证后，与现有 MCTS 分数面按固定权重融合为完整 canonical 分布。四座 value 输出必须为有限且严格近零和，并作为审计证据记录。

本候选没有提供或生成真实模型、ONNX、manifest，也没有引入 ONNX runtime 依赖。直接 CLI 未注入推理端口时，在任何临时编译目录或产物写入前失败关闭。因此，本候选不是正式 Smoke 或训练授权，当前仍不可运行正式 1000 局 Smoke。

## 候选身份

- 候选工作树：`C:\Users\Administrator\Documents\NEW\.worktrees\codex-stage8-model-inference-package-20260826`
- 分支：`codex/stage8-model-inference-package-20260826`
- 基线 HEAD：`da6ed3838a224e338f6a6790b0ce6fdbf6cd8ba6`
- 审计时 `origin/main`：`da6ed3838a224e338f6a6790b0ce6fdbf6cd8ba6`
- 状态：未提交、未推送、未部署

## 真源与约束映射

### 已读取真源

- 规则真源：`docs/rules.md`
  - SHA-256：`C6C053334FBADC4582C0B42E606B489E0774181AA12EF0148244D5BFE6AD935C`
- Stage8 PRD：`C:\Users\Administrator\Desktop\workspace\迭代规划\万年麻将阶段八PRD-自弈强化学习-codex.md`
  - SHA-256：`26535AA0D5EEE6C87EA2B5021FAFFAA561A0453C14166F78098D37C1F1139098`

### PRD 对应关系

| PRD要求 | 候选实现 | 证据/边界 |
| --- | --- | --- |
| policy head 覆盖完整合法动作 | 推理请求携带规范排序后的完整 canonical actions/keys；返回 logits 必须精确同集 | 漏动作、多动作、NaN 均失败关闭 |
| value head 为四家终局分差 | 固定四元素有限数组，和值容差 `1e-9` | 非零和/NaN 拒绝；本轮只审计，不伪装成叶节点搜索 |
| 只使用可见信息 | provider 继续使用严格 `Stage8OfflineVisibleState` 白名单；推理请求递归冻结 | 对手暗手、真实墙序字段仍被拒绝；端口不能修改嵌套输入 |
| 模型/ONNX/manifest 身份绑定 | 模型文件 SHA、ONNX SHA、manifest SHA、版本 URI、规则/动作/mask/特征/可见信息 SHA 与推理契约 SHA 全绑定 | 模型包协议升为 `stage8-model-package-v2` |
| MCTS 与模型作用可审计 | 现有 MCTS 分数与 model policy logits 分别 z-score，按 manifest 固定权重融合，再 stable softmax | 账本保存原分数、模型输出、融合分数、权重、公式与证据哈希，并锚定 control provider/preflight model identity |
| 异常熔断隔离 | 缺端口、调用异常、身份不符、非法 logits/value、哈希不符均拒绝 | 不产生状态提交；CLI 缺端口时零临时写入、零产物写入 |
| 正式 Smoke 逐段授权 | 沿用已发布 control/runtime/artifact-root 全量预检 | 完整预检成功后才允许初始化端口；本轮未提供真实授权和资产 |

## 实现设计

### 冻结模型推理边界

新增 `offline-frozen-model-inference.ts`：

- 规定模型包 v2 和 input/policy/value 三个版本字段。
- 绑定模型、ONNX、manifest、规则、动作空间、合法 mask、特征、可见信息和版本 URI。
- 推理输入包含可见投影、完整 canonical 合法动作及规范动作 key。
- 推理输入/输出 evidence 显式绑定当步 `visibleStateSha256` 与 `legalActionSetSha256`，最终账本逐字段复核。
- 推理请求递归冻结；调用后重新核对输入身份，防止嵌套数据篡改。
- 输出必须覆盖精确合法动作集合，policy logits 全部有限。
- value 必须为四座有限、近零和数组。
- 输出和完整 evidence 各自 SHA-256 绑定。

### canonical MCTS 融合

- 保留现有 `scoreMctsCandidateValues` 作为已有 MCTS 分数面，不改生产 MCTS 或页面 AI。
- formal provider 每次决策必须实际 `await` 注入推理端口。
- MCTS 分数与 policy logits 独立标准化；按 `modelPolicyWeight` 线性融合后再按 `behaviorTemperature` 归一化。
- `modelPolicyWeight` 只接受 `(0,1]`，并纳入 provider definition、runtime manifest 和完整运行指纹。
- value 输出本轮只做身份与零和审计；由于尚无真实模型叶节点搜索接口，不把一个 state value 伪造成逐动作价值。

### 账本与正式入口

- raw provider 由同步裸分布升级为异步 `{distribution,evidence}` 契约。
- selfplay decision 与 formal game executor 对应升级为异步，规则/轨迹执行真源不变。
- 每步账本保存 raw provider evidence，并重新校验模型推理 evidence；provider 必须等于 control `mctsProviderSha256`，model/ONNX/manifest/modelId/inferenceContract 必须等于本次 preflight model identity；无对应模型证据不能组装成有效 formal ledger。
- 完整预检只读取并验证一次 model/ONNX/manifest，成功值返回冻结的 Base64 字符串快照；formal CLI 只从这批已验快照恢复字节，不再次从路径读取，消除预检与加载之间的 TOCTOU。
- formal CLI 顺序固定为：读取显式路径 → 完整 control/runtime/artifact/model/source identity 预检并冻结已验字节 → 要求显式 `createModelInferencePort` → 用该批已验字节初始化端口 → 才可创建 OS 临时编译树与 writer。
- 直接命令没有内置 ONNX loader，默认返回 `formal-smoke-model-inference-port-required`，且临时写入次数为 0。

## 精确 16 文件范围

1. `package.json`
2. `src/game/stage8/offline-frozen-model-inference.ts`（新增）
3. `src/game/stage8/offline-behavior-distribution.ts`
4. `src/game/stage8/offline-canonical-mcts-provider.ts`
5. `src/game/stage8/offline-selfplay-engine.ts`
6. `src/game/stage8/offline-smoke-runtime-preflight.ts`
7. `src/game/stage8/offline-smoke-runner.ts`
8. `scripts/stage8-offline-smoke-runner.mjs`
9. `scripts/stage8-frozen-model-inference-regression.mjs`（新增）
10. `scripts/stage8-canonical-mcts-provider-regression.mjs`
11. `scripts/stage8-offline-selfplay-smoke-regression.mjs`
12. `scripts/stage8-offline-smoke-runtime-preflight-regression.mjs`
13. `scripts/stage8-offline-smoke-runner-regression.mjs`
14. `scripts/stage8-offline-selfplay-preflight-gate.mjs`
15. `scripts/stage8-sample-replay-model-protocol-regression.mjs`
16. `docs/stage8-model-inference-package-candidate-report-2026-08-26.md`（本报告）

没有修改页面、生产 AI、规则/计分、服务、部署脚本或浏览器生成包；没有新增依赖。

## RED / GREEN

### RED

- 基线不存在 `src/game/stage8/offline-frozen-model-inference.ts`。
- 基线 canonical MCTS provider 不含 `modelInference`，只把现有启发式 MCTS 分数直接 softmax。
- 基线 provider 返回同步裸分布，没有模型输出、融合公式或证据哈希进入正式 ledger。
- 基线 runtime 模型包为 v1，没有 input/policy/value schema 和 inference contract，也没有 `modelPolicyWeight`。

### GREEN

- 冻结模型专项：完整 policy、四座零和 value、身份绑定、递归冻结、漏动作/NaN/非零和/错身份拒绝均通过。
- canonical provider 专项：10 个完整 canonical 候选全部有概率；冻结模型端口实际调用 2 次；model policy 确认改变融合分布；同输入可重复。
- runtime preflight 专项：模型包 v2、推理契约、权重、source bundle、运行指纹、授权和下游关闭全部通过；三份资产只读一次并使用不可变已验快照，第二次读取返回篡改内容的模拟仍不会被读取；授权/manifest/hash/缺端口失败均在 `mkdtemp` 前，临时写入计数为 0。
- formal runner 专项：2 局仅内存真源执行重放一致；1000 个账本槽位结构验证；外来 provider、外来 model、错可见状态哈希、错合法集哈希和错 preflight model identity 均拒绝；正式 Smoke 执行 0 局。
- 样本协议专项：样本与 Smoke 的模型、ONNX、manifest、版本 URI 身份一致性与篡改拒绝通过。

## 实际运行结果

### 新增与聚合门禁

- `npm run test:stage8-frozen-model-inference`：PASS。
- `npm run test:stage8-canonical-mcts-provider`：PASS；`canonicalCandidates=10`，`frozenModelInferenceCalls=2`。
- `npm run test:stage8-offline-selfplay-smoke`：PASS；仅 2 次既有内存决策回归。
- `npm run test:stage8-offline-smoke-runtime-preflight`：PASS；失败路径临时写入 0。
- `npm run test:stage8-offline-smoke-runner`：PASS；仅 2 局内存真源回归，正式 Smoke 0 局。
- `npm run test:stage8-sample-replay-model-protocol`：PASS。
- `npm run test:stage8-offline-selfplay-preflight`：PASS；其中计划 1000、执行 0，正式 Smoke 0。
- `npx tsc --noEmit --incremental false`：PASS，未生成 `tsconfig.tsbuildinfo`。

### 规则与 Stage8 关联门禁

- `npm run test:stage8-offline-round-integrity`：PASS。
- `npm run test:stage8-offline-four-player-batch`：PASS；8 个固定种子规则完整性遍历，不是 selfplay/Smoke。
- `npm run test:stage8-offline-coverage-matrix`：PASS。
- `npm run test:stage8-training-control-protocol`：PASS。
- `npm run test:stage8-offline-trajectory-executor`：PASS。
- 聚合门禁内的 Stage8 v2 action-space、kong-execution：PASS。

### 构建与生成包卫生

- 普通沙箱首次 `npm run build`：Next 子进程 `spawn EPERM`；失败清理后精确范围未扩大、三项冻结包已恢复、OS 临时快照残留 0。
- 补正后同一候选允许子进程环境重跑 `npm run build`：PASS，Next 静态页 `8/8`，`BUILD_ID=Tt35ZZV6dGCVPjwJJ3UyR`。
- 构建后 `node scripts/build-browser-rule-engine.mjs --check`：PASS。
- 构建后 `node scripts/assert-browser-build-artifacts-clean.mjs`：PASS。
- 四项浏览器生成包当前 blob 与 HEAD 全部精确一致：
  - `rule_engine.js` SHA-256 `A79683A32AC207FD2C7E64EF833F7CBDD19C392E93489FACD35E8797E95874AB`
  - `strong_rule_ai.js` SHA-256 `35C1BCECE0BB579687BF91056BD541DCC283A79879BD580AA1044AD729864B01`
  - `recommendation_engine.js` SHA-256 `DDC570B481D53E226E3405A54340A08ECF1B4AC09EF0C74E4DE5618992975FC9`
  - `mcts_enhancement_engine.js` SHA-256 `126EE7A472F5C7CFB8B37A8BCF7E91BE29FA0F46ACBA028C64A3AAFFCD3D58F5`
- `git diff --check`：PASS。
- `tsconfig.tsbuildinfo`：0。
- 浏览器生成包 OS 临时快照残留：0。

## 风险与剩余硬门槛

1. 尚无经过产品批准的真实 model/ONNX/manifest 身份包，不能完成真实推理初始化。
2. 尚无具体 ONNX runtime adapter；本候选提供受控异步端口与严格输入/输出契约，不引入依赖、不伪装已加载 ONNX。
3. value head 当前只作为四座零和审计证据，没有接入真正的 MCTS 叶节点求值；后续接入必须单独候选与验收。
4. formal CLI 直接运行会因缺少显式推理端口默认拒绝；不得把该默认拒绝解除为静默启发式回退。
5. 正式 1000 局 Smoke、外置根写入、模型加载、训练、Pilot、Arena、Champion、runtime 和部署均仍需独立资产与产品授权。

## 零运行/零数据接触声明

- 正式 1000 局 Smoke：0 局。
- 训练/selfplay/replay/model/ONNX/checkpoint/Pilot/Arena/Champion/runtime：均未启动。
- 真实模型、ONNX、manifest、E 盘根或子目录、训练产物：均未创建或写入。
- 18768 服务：未启动、未停止、未重启、未替换。
- 浏览器 Storage、用户页面、用户对局、用户导出、旧 dirty Stage8 资产：均未访问。
- 测试仅使用内存和 OS 临时目录夹具；临时目录均在 `finally` 清理，不属于训练产物。

## 验收建议

建议产品重点独立复验：

1. 模型包 v2 任一身份字段或 inference contract 篡改均拒绝。
2. 推理输出漏 canonical action、额外 action、NaN、非零和 value、错身份、错哈希均拒绝且状态零副作用。
3. model policy 在完整合法集上确实改变分布，同时保留现有 MCTS 分数证据。
4. formal ledger 无有效模型 evidence 时不可组装。
5. 完整 preflight 未通过或未注入端口时，`mkdtemp`、临时编译、writer 调用均为 0。
6. 不把本候选、2 局内存回归或 1000 个计划槽位解释为正式 Smoke/训练证据。
