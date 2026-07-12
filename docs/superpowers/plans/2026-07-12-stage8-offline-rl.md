# 万年麻将阶段八离线强化学习 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可重复运行的完整规则离线强化学习闭环，连续产生三个达到 PRD EV 门槛的冠军模型，并将冠军 3 通过 ONNX 接入 AI 玩家与真人推荐共用的正式决策链。

**Architecture:** Node.js 复用现有规则模块并承载完整回合模拟、自弈、信念 MCTS、异常熔断和竞技场；Python/PyTorch 承载行为克隆、共享主干双头模型、纯终局奖励训练、经验池和 checkpoint；浏览器只加载人工发布的 ONNX 模型，并在失败时回退阶段七统一决策。训练、Node 和浏览器共用版本化状态编码与动作注册表，玩家导出记录永不进入训练集。

**Tech Stack:** TypeScript、Node.js ESM、Next.js 15、Python 3.12、PyTorch 2.7.0 CUDA 12.6、NumPy 2.2.6、ONNX 1.18.0、ONNX Runtime GPU 1.27.0、onnxruntime-web 1.27.0、PowerShell/npm.cmd。

## Global Constraints

- 需求基线：`docs/万年麻将阶段八PRD-自弈强化学习-codex.md`。
- 设计基线：`docs/superpowers/specs/2026-07-12-stage8-offline-rl-design.md`。
- 所有训练阶段始终启用完整万年麻将规则，不关闭打烂、杠、直铲或过水。
- RL 只使用真实终局四家积分变化，不增加任何人工过程奖励。
- 第一版动作空间必须覆盖 `discard`、`pass`、`peng`、`win`、`concealedKong`、`exposedKong`、`forcedRunKong`、`zhichan`、`chainKong`。
- 模型和 MCTS 禁止读取对手真实暗手、真实牌墙顺序或其他模拟器秘密字段。
- 浏览器正式决策硬预算不超过 10 秒，模型失败必须回退阶段七统一决策。
- ONNX 模型文件必须小于 10MB。
- 候选不得自动发布；产品侧 10 局体验后才能人工确认发布。
- 每次冠军竞技至少 50,000 场，固定种子、相同牌墙、四座轮换并报告 95% 置信区间。
- 工作区已有未提交报告和 `rl_weights.json` 改动不得被顺带提交或回退。
- 新代码注释使用英文，不新增与阶段八无关的依赖。

---

### Task 1: 建立 Python/CUDA 环境与版本清单

**Files:**
- Create: `training/stage8/requirements.txt`
- Create: `training/__init__.py`
- Create: `training/stage8/__init__.py`
- Create: `training/stage8/config.py`
- Create: `training/stage8/tests/test_environment.py`
- Create: `docs/stage8/training-config-v1.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Stage8Config`, `load_config(path: Path) -> Stage8Config`。
- Produces: 项目内 `.venv-stage8`，仅作为本地环境，不提交。

- [ ] **Step 1: 安装 Python 3.12 并创建项目虚拟环境**

Run:

```powershell
winget install --exact --id Python.Python.3.12 --scope user
py -3.12 -m venv .venv-stage8
.\.venv-stage8\Scripts\python.exe -m pip install --upgrade pip
```

Expected: `.venv-stage8\Scripts\python.exe --version` 输出 `Python 3.12.x`。

- [ ] **Step 2: 写入锁定依赖和训练配置**

```text
--extra-index-url https://download.pytorch.org/whl/cu126
torch==2.7.0+cu126
numpy==2.2.6
onnx==1.18.0
onnxruntime-gpu==1.27.0
pytest==8.4.1
psutil==7.0.0
```

`training-config-v1.json` 必须包含：

```json
{
  "schemaVersion": "stage8-training-config-v1",
  "seed": 20260712,
  "device": "cuda",
  "hiddenSizes": [256, 256, 128],
  "batchSize": 512,
  "learningRate": 0.0003,
  "replayCapacity": 2000000,
  "opponentMix": {"current": 0.4, "stage7": 0.25, "champion": 0.25, "variant": 0.1},
  "reward": "terminal-score-delta-only"
}
```

- [ ] **Step 3: 写环境失败测试**

```python
def test_cuda_environment_and_config():
    import torch
    from training.stage8.config import load_config
    config = load_config(Path("docs/stage8/training-config-v1.json"))
    assert config.reward == "terminal-score-delta-only"
    assert config.hidden_sizes == (256, 256, 128)
    assert torch.cuda.is_available()
    assert "3060 Ti" in torch.cuda.get_device_name(0)
```

- [ ] **Step 4: 安装依赖并验证测试通过**

Run:

```powershell
.\.venv-stage8\Scripts\python.exe -m pip install -r training\stage8\requirements.txt
.\.venv-stage8\Scripts\python.exe -m pytest training\stage8\tests\test_environment.py -q
```

Expected: `1 passed`，CUDA 设备为 RTX 3060 Ti。

- [ ] **Step 5: 提交环境清单**

```powershell
git add .gitignore training/__init__.py training/stage8/__init__.py training/stage8/requirements.txt training/stage8/config.py training/stage8/tests/test_environment.py docs/stage8/training-config-v1.json
git commit -m "build: 建立阶段八训练环境清单"
```

### Task 2: 固定版本协议与完整动作注册表

**Files:**
- Create: `src/game/stage8/versions.ts`
- Create: `src/game/simulation/action-space.ts`
- Create: `scripts/stage8/action-space-regression.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ActionType`, `Stage8Action`, `ACTION_REGISTRY`, `ACTION_SPACE_SIZE`。
- Produces: `encodeAction(action: Stage8Action): number`、`decodeAction(id: number): Stage8Action`。
- Produces: `STAGE8_VERSIONS`，字段为 `rulesVersion`、`featureVersion`、`actionSpaceVersion`、`trainingVersion`、`protocolVersion`。

- [ ] **Step 1: 写失败回归，要求九类动作稳定往返**

```javascript
const required = ['discard','pass','peng','win','concealedKong','exposedKong','forcedRunKong','zhichan','chainKong'];
assert.deepEqual([...new Set(ACTION_REGISTRY.map(item => item.type))], required);
for (const item of ACTION_REGISTRY) {
  assert.deepEqual(decodeAction(encodeAction(item)), item);
}
assert.equal(new Set(ACTION_REGISTRY.map(item => item.id)).size, ACTION_SPACE_SIZE);
```

Run: `node scripts/stage8/action-space-regression.mjs`

Expected: FAIL，因为模块不存在。

- [ ] **Step 2: 实现规范注册表**

```typescript
export type ActionType = 'discard'|'pass'|'peng'|'win'|'concealedKong'|'exposedKong'|'forcedRunKong'|'zhichan'|'chainKong';
export interface Stage8Action {
  id: number;
  type: ActionType;
  tile: TileKey | null;
  method: 'selfDraw'|'discardWin'|'robKong'|'exposed'|'added'|'concealed'|'forcedRun'|'zhichan'|null;
}
```

动作 ID 由固定牌序 `wan1..bai` 和固定方法序生成，禁止对象遍历顺序决定 ID。

- [ ] **Step 3: 运行动作回归**

Run: `npm.cmd run test:stage8-actions`

Expected: 九类动作全部存在，所有 ID 唯一且往返一致。

- [ ] **Step 4: 提交动作协议**

```powershell
git add package.json src/game/stage8/versions.ts src/game/simulation/action-space.ts scripts/stage8/action-space-regression.mjs
git commit -m "feat: 固定阶段八动作与版本协议"
```

### Task 3: 建立完整状态类型、可见状态和特征编码

**Files:**
- Create: `src/game/simulation/types.ts`
- Create: `src/game/stage8/visible-state.ts`
- Create: `src/game/stage8/feature-encoder.ts`
- Create: `scripts/stage8/visible-state-regression.mjs`

**Interfaces:**
- Consumes: `Stage8Action`、`STAGE8_VERSIONS`。
- Produces: `SimulationState`、`VisibleState`、`FeatureTensor`。
- Produces: `projectVisibleState(state, seat): VisibleState`、`encodeVisibleState(state): FeatureTensor`。

- [ ] **Step 1: 写隐藏信息扰动失败测试**

```javascript
const original = fixtureState();
const perturbed = swapOpponentHandsAndUnknownWall(original, 0);
assert.deepEqual(projectVisibleState(original, 0), projectVisibleState(perturbed, 0));
assert.deepEqual([...encodeVisibleState(projectVisibleState(original, 0))], [...encodeVisibleState(projectVisibleState(perturbed, 0))]);
assert.equal(JSON.stringify(projectVisibleState(original, 0)).includes('wallOrder'), false);
assert.equal(JSON.stringify(projectVisibleState(original, 0)).includes('opponentHands'), false);
```

Run: `node scripts/stage8/visible-state-regression.mjs`

Expected: FAIL，因为投影和编码器不存在。

- [ ] **Step 2: 实现秘密状态与公开状态分型**

`SimulationState` 持有完整牌墙和四家暗手；`VisibleState` 只含当前手牌、弃牌、副露、庄家、座位、轮次、分数、公开事件、牌墙剩余数和公开推测。秘密字段不得使用结构展开传给 `VisibleState`。

- [ ] **Step 3: 实现固定长度特征编码**

```typescript
export interface FeatureTensor {
  version: typeof STAGE8_VERSIONS.featureVersion;
  values: Float32Array;
}

export function encodeVisibleState(state: VisibleState): FeatureTensor {
  const values = new Float32Array(FEATURE_SIZE);
  // Encode hand counts, public counts, melds, positions, scores, turn and wall count.
  return { version: STAGE8_VERSIONS.featureVersion, values };
}
```

- [ ] **Step 4: 验证公开输入不变性**

Run: `npm.cmd run test:stage8-visible-state`

Expected: 扰动对手暗手与未知牌墙后，公开状态和特征逐元素一致。

- [ ] **Step 5: 提交状态编码**

```powershell
git add src/game/simulation/types.ts src/game/stage8/visible-state.ts src/game/stage8/feature-encoder.ts scripts/stage8/visible-state-regression.mjs package.json
git commit -m "feat: 建立阶段八公开状态编码"
```

### Task 4: 抽取合法动作生成和完整回合状态机

**Files:**
- Create: `src/game/simulation/legal-actions.ts`
- Create: `src/game/simulation/round-engine.ts`
- Create: `src/game/simulation/settlement-audit.ts`
- Create: `scripts/stage8/simulator-regression.mjs`
- Modify: `src/game/rules/index.ts`

**Interfaces:**
- Consumes: 现有 `canWin`、`canPeng`、`canAnGang`、`canMingGang`、`canQiangXingPaoGang`、`canZhiChan`、`calculateScore` 和过水规则。
- Produces: `getLegalActions(state, seat): Stage8Action[]`。
- Produces: `createGame(seed, options): SimulationState`、`stepGame(state, action): StepResult`。

- [ ] **Step 1: 写九类动作与完整规则失败牌例**

```javascript
for (const fixture of fixtures) {
  const legal = getLegalActions(fixture.state, fixture.seat);
  assert.equal(legal.some(action => action.type === fixture.expectedType), true, fixture.id);
  for (const forbidden of fixture.forbidden) assert.equal(legal.some(action => sameAction(action, forbidden)), false, fixture.id);
}
assert.equal(fixtures.some(item => item.expectedType === 'chainKong'), true);
assert.equal(fixtures.some(item => item.rule === 'overwater'), true);
```

牌例必须分别覆盖弃牌、过、碰、胡、暗杠、明/加杠、强行跑杠、直铲、连杠、抢杠、杠后补牌、打烂、正宗、七对、混一色和清一色。

Run: `node scripts/stage8/simulator-regression.mjs`

Expected: FAIL，因为正式模拟器不存在。

- [ ] **Step 2: 实现合法动作生成**

只调用规则模块决定合法性。`getLegalActions` 返回确定顺序的动作列表；存在可胡动作时仍按规则保留允许的过，过水状态由状态机记录并供后续规则调用。

- [ ] **Step 3: 实现状态机**

```typescript
export interface StepResult {
  state: SimulationState;
  publicEvents: PublicGameEvent[];
  terminal: boolean;
  scoreDelta: [number, number, number, number] | null;
}

export function stepGame(state: SimulationState, action: Stage8Action): StepResult {
  if (!containsAction(getLegalActions(state, state.actor), action)) throw new IllegalActionError(action);
  return applyLegalAction(cloneState(state), action);
}
```

状态推进包含响应优先级、碰后弃牌、杠后摸牌、连杠、抢杠、过水、流局和终局。

- [ ] **Step 4: 实现结算二次复核和纯终局积分**

`settlement-audit.ts` 在写入终局前调用规则引擎复核胡牌，计算四家积分变化并要求总和为 0；非终局 `scoreDelta` 必须为 `null`。

- [ ] **Step 5: 运行正式模拟器回归**

Run:

```powershell
npm.cmd run test:stage8-simulator
npm.cmd run test:rules
```

Expected: 阶段八模拟牌例全部通过，现有规则回归无退化。

- [ ] **Step 6: 提交正式模拟器**

```powershell
git add src/game/simulation src/game/rules/index.ts scripts/stage8/simulator-regression.mjs package.json
git commit -m "feat: 建立完整规则自弈模拟器"
```

### Task 5: 固定种子、状态哈希和重放熔断

**Files:**
- Create: `src/game/simulation/seeded-rng.ts`
- Create: `src/game/simulation/replay.ts`
- Create: `src/game/stage8/batch-audit.ts`
- Create: `scripts/stage8/replay-regression.mjs`

**Interfaces:**
- Produces: `createSeededRng(seed)`、`stateHash(state)`、`replayGame(record)`。
- Produces: `BatchAudit.record(event)`、`BatchAudit.abort(reason, snapshot)`。

- [ ] **Step 1: 写重放和熔断失败测试**

```javascript
const first = playRecordedGame(20260712);
const replayed = replayGame(first.record);
assert.deepEqual(replayed.stateHashes, first.record.stateHashes);
assert.deepEqual(replayed.finalScores, first.record.finalScores);
assert.throws(() => replayGame({...first.record, actions: corrupt(first.record.actions)}), ReproducibilityError);
```

- [ ] **Step 2: 实现确定性 RNG 和状态哈希**

哈希输入包含规范化游戏状态、动作序列索引和版本，不包含系统时间或对象键遍历顺序。

- [ ] **Step 3: 实现零容忍批次审计**

```typescript
export type FuseReason = 'invalidWin'|'illegalAction'|'hiddenInfoLeak'|'scoreNotConserved'|'notReproducible'|'invalidModelOutput'|'noCandidate'|'versionMismatch'|'missingField';
```

任一原因触发后，批次状态为 `quarantined`，经验分片不得提交，训练更新不得执行。

- [ ] **Step 4: 验证并提交**

Run: `npm.cmd run test:stage8-replay`

Expected: 同种子逐步哈希一致；故意篡改时熔断且分片未提交。

```powershell
git add src/game/simulation/seeded-rng.ts src/game/simulation/replay.ts src/game/stage8/batch-audit.ts scripts/stage8/replay-regression.mjs package.json
git commit -m "feat: 增加自弈重放与异常熔断"
```

### Task 6: 正式自弈生成器、对手池和课程

**Files:**
- Create: `src/game/stage8/policy.ts`
- Create: `src/game/stage8/opponent-pool.ts`
- Create: `src/game/stage8/curriculum.ts`
- Create: `scripts/stage8/selfplay-worker.mjs`
- Create: `scripts/stage8/selfplay-generate.mjs`
- Create: `scripts/stage8/selfplay-regression.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `Policy.decide(request): Promise<PolicyResponse>`。
- Produces: `sampleOpponentPool(rng, manifest)` 和 `sampleCurriculum(rng, config)`。
- Produces CLI: `npm.cmd run stage8:selfplay -- --games N --batchSize N --seed N --output PATH`。

- [ ] **Step 1: 写比例、座位轮换和完整动作失败测试**

```javascript
const report = runSelfplay({games: 4000, seed: 20260712, dryPolicy: true});
assertMixNear(report.opponentMix, {current:.4, stage7:.25, champion:.25, variant:.1}, .025);
assert.deepEqual(report.seatCounts, [1000,1000,1000,1000]);
for (const type of REQUIRED_ACTION_TYPES) assert.equal(report.legalActionCoverage[type] > 0, true, type);
assert.equal(report.playerExportsIncluded, false);
```

- [ ] **Step 2: 实现统一策略接口和阶段七基线适配**

策略请求只接收 `VisibleState`、合法动作和版本。阶段七适配器复用现有强规则 AI/MCTS，不读取模拟器秘密状态。

- [ ] **Step 3: 实现对手池和六类课程采样**

课程只影响初始局面占比；所有课程都调用同一个完整状态机和规则引擎。

- [ ] **Step 4: 实现后台自弈 CLI**

每 1,000 局输出批次指标，每 10,000 局输出汇总；每条样本包含版本、种子、局号、回合、座位、公开特征、合法动作掩码、MCTS 分布和待终局回填的样本 ID。

- [ ] **Step 5: 验证并提交**

Run: `npm.cmd run test:stage8-selfplay`

Expected: 比例、座位、课程、动作覆盖和导出隔离全部通过。

```powershell
git add src/game/stage8/policy.ts src/game/stage8/opponent-pool.ts src/game/stage8/curriculum.ts scripts/stage8/selfplay-worker.mjs scripts/stage8/selfplay-generate.mjs scripts/stage8/selfplay-regression.mjs package.json
git commit -m "feat: 建立阶段八正式自弈生成器"
```

### Task 7: 压缩滚动经验池与样本版本门禁

**Files:**
- Create: `training/stage8/replay_buffer.py`
- Create: `training/stage8/dataset.py`
- Create: `training/stage8/tests/test_replay_buffer.py`
- Create: `scripts/stage8/experience-commit.mjs`

**Interfaces:**
- Produces: `ReplayBuffer.stage(shard)`、`commit(batch_id)`、`quarantine(batch_id, reason)`、`sample(batch_size)`。
- Produces: `Stage8Dataset`，拒绝版本不兼容样本。

- [ ] **Step 1: 写容量、淘汰和隔离失败测试**

```python
def test_replay_buffer_never_commits_quarantined_batch(tmp_path):
    pool = ReplayBuffer(tmp_path, capacity=10)
    pool.stage(make_shard("bad", 6))
    pool.quarantine("bad", "invalidWin")
    assert pool.size == 0
    assert (tmp_path / "quarantine" / "bad" / "reason.json").exists()

def test_eviction_preserves_champion_and_rare_actions(tmp_path):
    pool = ReplayBuffer(tmp_path, capacity=10)
    pool.commit_fixture_samples(ordinary=12, rare_chain_kong=2, champion=2)
    assert pool.size == 10
    assert pool.count(action="chainKong") == 2
    assert pool.count(permanent=True) == 2
```

Run: `.\.venv-stage8\Scripts\python.exe -m pytest training\stage8\tests\test_replay_buffer.py -q`

Expected: FAIL，因为经验池不存在。

- [ ] **Step 2: 实现压缩分片、原子索引和确定淘汰**

使用 gzip JSONL 分片和原子重命名；索引记录校验和、版本、课程、动作覆盖、永久标记和批次审计状态。

- [ ] **Step 3: 实现版本门禁**

`Stage8Dataset` 在打开分片时逐项比对规则、特征、动作、模型和训练版本；任一不匹配抛出 `VersionMismatchError`。

- [ ] **Step 4: 运行测试并提交**

```powershell
.\.venv-stage8\Scripts\python.exe -m pytest training\stage8\tests\test_replay_buffer.py -q
git add training/stage8/replay_buffer.py training/stage8/dataset.py training/stage8/tests/test_replay_buffer.py scripts/stage8/experience-commit.mjs
git commit -m "feat: 增加版本化滚动经验池"
```

### Task 8: PyTorch 双头模型与行为克隆冷启动

**Files:**
- Create: `training/stage8/model.py`
- Create: `training/stage8/behavior_clone.py`
- Create: `training/stage8/tests/test_model.py`
- Create: `scripts/stage8/generate-bc-data.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `Stage8PolicyValueNet(feature_size, action_size)`。
- Produces: `masked_policy(logits, legal_mask)`。
- Produces CLI: `npm.cmd run stage8:bc-data -- --config docs/stage8/training-config-v1.json` 和 Python `.\.venv-stage8\Scripts\python.exe training/stage8/behavior_clone.py --config docs/stage8/training-config-v1.json`。

- [ ] **Step 1: 写模型形状、掩码和零和失败测试**

```python
def test_policy_mask_and_zero_sum_value():
    model = Stage8PolicyValueNet(FEATURE_SIZE, ACTION_SPACE_SIZE)
    logits, values = model(torch.zeros(2, FEATURE_SIZE))
    mask = legal_mask_with_only([1, 9])
    probs = masked_policy(logits, mask)
    assert logits.shape == (2, ACTION_SPACE_SIZE)
    assert values.shape == (2, 4)
    assert torch.allclose(values.sum(dim=1), torch.zeros(2), atol=1e-6)
    assert probs[:, illegal_indices(mask)].sum().item() == 0
```

- [ ] **Step 2: 实现固定三层共享主干双头网络**

```python
class Stage8PolicyValueNet(nn.Module):
    def __init__(self, feature_size: int, action_size: int):
        super().__init__()
        self.trunk = nn.Sequential(nn.Linear(feature_size, 256), nn.ReLU(), nn.Linear(256, 256), nn.ReLU(), nn.Linear(256, 128), nn.ReLU())
        self.policy_head = nn.Linear(128, action_size)
        self.value_head = nn.Linear(128, 4)
    def forward(self, x):
        h = self.trunk(x)
        value = self.value_head(h)
        return self.policy_head(h), value - value.mean(dim=1, keepdim=True)
```

- [ ] **Step 3: 生成行为克隆样本**

Node 脚本调用阶段七统一决策和 MCTS，写合法动作目标分布；清单必须包含 `source: stage7-unified-mcts` 和 `playerExportsIncluded: false`。

- [ ] **Step 4: 实现行为克隆训练**

损失为合法动作交叉熵或 MCTS 分布 KL；不得加入终局前过程奖励。验证集报告非法概率质量、Top1 合法率和 MCTS 分布交叉熵。

- [ ] **Step 5: 验证并提交**

```powershell
.\.venv-stage8\Scripts\python.exe -m pytest training\stage8\tests\test_model.py -q
npm.cmd run test:stage8-bc
git add training/stage8/model.py training/stage8/behavior_clone.py training/stage8/tests/test_model.py scripts/stage8/generate-bc-data.mjs package.json
git commit -m "feat: 增加双头模型与行为克隆冷启动"
```

### Task 9: 纯终局 RL 更新与 checkpoint 恢复

**Files:**
- Create: `training/stage8/train.py`
- Create: `training/stage8/checkpoint.py`
- Create: `training/stage8/metrics.py`
- Create: `training/stage8/tests/test_training.py`
- Create: `training/stage8/tests/test_checkpoint.py`

**Interfaces:**
- Produces: `train_step(model, batch) -> TrainMetrics`。
- Produces: `save_checkpoint(path, state)`、`load_checkpoint(path, expected_versions)`。

- [ ] **Step 1: 写纯终局奖励失败测试**

```python
def test_training_uses_only_terminal_score_delta():
    batch = make_batch(terminal_delta=[3,-1,-1,-1], shaped_rewards=[99,99])
    metrics = train_step(model, batch)
    assert metrics.value_target == [3,-1,-1,-1]
    assert "shaped_rewards" not in metrics.consumed_fields
```

- [ ] **Step 2: 写 checkpoint 精确恢复失败测试**

```python
def test_checkpoint_restores_model_optimizer_rng_and_cursor(tmp_path):
    before = capture_training_state(step=17, replay_cursor=321)
    save_checkpoint(tmp_path, before)
    restored = load_checkpoint(tmp_path, EXPECTED_VERSIONS)
    assert restored.step == 17
    assert restored.replay_cursor == 321
    assert restored.rng_state == before.rng_state
    assert state_dict_equal(restored.model, before.model)
```

- [ ] **Step 3: 实现 RL 更新**

策略损失拟合 MCTS 访问分布，价值损失拟合归一化四家终局积分；非终局样本不携带奖励。发现 NaN/Infinity 时抛出熔断事件并拒绝保存 checkpoint。

- [ ] **Step 4: 实现原子 checkpoint**

保存模型、优化器、所有随机状态、训练步、累计局数、经验池游标、候选/冠军/基线版本、配置和校验和。版本不兼容必须拒绝恢复。

- [ ] **Step 5: 运行测试并提交**

```powershell
.\.venv-stage8\Scripts\python.exe -m pytest training\stage8\tests\test_training.py training\stage8\tests\test_checkpoint.py -q
git add training/stage8/train.py training/stage8/checkpoint.py training/stage8/metrics.py training/stage8/tests/test_training.py training/stage8/tests/test_checkpoint.py
git commit -m "feat: 增加纯终局训练与断点恢复"
```

### Task 10: 信息泄漏审计与多样本信念 MCTS

**Files:**
- Create: `src/game/stage8/belief-sampler.ts`
- Create: `src/game/stage8/guided-mcts.ts`
- Create: `scripts/stage8/leakage-audit.mjs`
- Create: `scripts/stage8/guided-mcts-regression.mjs`

**Interfaces:**
- Produces: `sampleBeliefs(visible, count, rng): BeliefState[]`。
- Produces: `runGuidedMcts(request, budget): Promise<GuidedMctsResult>`。

- [ ] **Step 1: 写真实暗手扰动不变性失败测试**

```javascript
const a = makeSecretStateVariant('A');
const b = makeSecretStateVariant('B');
assert.deepEqual(rootPolicyRequest(a, 0), rootPolicyRequest(b, 0));
assert.deepEqual(sampleBeliefWeights(a, 0, 20260712), sampleBeliefWeights(b, 0, 20260712));
```

- [ ] **Step 2: 实现公开信息信念采样**

从 136 张牌扣除当前手牌、公开弃牌和副露，只使用公开对手模型调整采样；真实暗手仅供模拟分支执行，不进入权重计算。

- [ ] **Step 3: 实现策略先验和价值叶评估**

每个信念样本独立搜索，再按公开权重聚合访问数和四家价值。使用单调时钟，超过预算停止扩展并返回已完成结果。

- [ ] **Step 4: 验证泄漏为零和预算可控**

Run:

```powershell
npm.cmd run verify:stage8-leakage
npm.cmd run test:stage8-mcts
```

Expected: 扰动不变，泄漏字段 0，测试预算内返回合法结果。

- [ ] **Step 5: 提交信念搜索**

```powershell
git add src/game/stage8/belief-sampler.ts src/game/stage8/guided-mcts.ts scripts/stage8/leakage-audit.mjs scripts/stage8/guided-mcts-regression.mjs package.json
git commit -m "feat: 增加隐信息审计与信念搜索"
```

### Task 11: 竞技场、置信区间和三代冠军门禁

**Files:**
- Create: `src/game/stage8/arena-stats.ts`
- Create: `scripts/stage8/arena.mjs`
- Create: `scripts/stage8/arena-regression.mjs`
- Create: `docs/stage8/champion-registry.json`
- Modify: `package.json`

**Interfaces:**
- Produces CLI: `npm.cmd run stage8:arena -- --candidate candidate-1 --opponent stage7 --games 50000 --seed 2026071201 --seatRotation true`。
- Produces: `meanDelta`、`ci95Lower`、`ci95Upper`、诊断指标和 `promotionEligible`。

- [ ] **Step 1: 写座位轮换和晋级失败测试**

```javascript
const report = arenaFromFixture({games: 50000, deltas: fixtureDeltas});
assert.equal(report.games, 50000);
assert.deepEqual(report.seatCounts, [12500,12500,12500,12500]);
assert.equal(report.ci95Lower > 0, true);
assert.equal(champion1Eligible({...report, meanDelta:.5}), true);
assert.equal(champion1Eligible({...report, meanDelta:.49}), false);
```

- [ ] **Step 2: 实现配对牌墙和统计**

每组固定牌墙供候选和对照交换四个座位；用座位校正后的每局积分差计算均值、样本标准差和 `mean ± 1.96 * standardError`。

- [ ] **Step 3: 实现不可放宽的三代门禁**

冠军 1 检查相对阶段七 `mean >= 0.5 && ci95Lower > 0`；冠军 2/3 检查相对上一冠军 `mean > 0 && ci95Lower > 0`；冠军 3 额外检查相对阶段七累计 `mean >= 1.0`。

- [ ] **Step 4: 运行测试并提交**

```powershell
npm.cmd run test:stage8-arena
git add src/game/stage8/arena-stats.ts scripts/stage8/arena.mjs scripts/stage8/arena-regression.mjs docs/stage8/champion-registry.json package.json
git commit -m "feat: 建立阶段八冠军竞技门禁"
```

### Task 12: ONNX 导出、大小门禁和跨运行时一致性

**Files:**
- Create: `training/stage8/export_onnx.py`
- Create: `training/stage8/verify_inference.py`
- Create: `training/stage8/tests/test_onnx.py`
- Create: `src/game/stage8/model-manifest.ts`
- Create: `scripts/stage8/verify-onnx.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `<model>.onnx`、`<model>.manifest.json`。
- Produces: `loadModelManifest()` 和校验和/大小验证。

- [ ] **Step 1: 安装唯一浏览器推理依赖**

Run: `npm.cmd install onnxruntime-web@1.27.0 --save-exact`

Expected: `package.json` 和锁文件只新增 ONNX Runtime Web 及其传递依赖。

- [ ] **Step 2: 写导出和一致性失败测试**

```python
def test_exported_model_is_small_and_equivalent(tmp_path):
    onnx_path = export_fixture_model(tmp_path)
    assert onnx_path.stat().st_size < 10 * 1024 * 1024
    torch_policy, torch_value = run_torch(FIXTURE_INPUT)
    ort_policy, ort_value = run_ort(onnx_path, FIXTURE_INPUT)
    np.testing.assert_allclose(ort_policy, torch_policy, rtol=1e-4, atol=1e-5)
    np.testing.assert_allclose(ort_value, torch_value, rtol=1e-4, atol=1e-5)
```

- [ ] **Step 3: 实现 ONNX 导出和清单**

清单包含模型、规则、特征、动作、训练和协议版本、SHA-256、文件大小、输入输出名称、候选/冠军状态和回退版本。

- [ ] **Step 4: 实现 Node/浏览器运行时一致性校验**

Node 验证脚本加载相同 fixture，要求 Top1 动作、Top3 顺序和价值误差与 Python 一致。

- [ ] **Step 5: 验证并提交**

```powershell
.\.venv-stage8\Scripts\python.exe -m pytest training\stage8\tests\test_onnx.py -q
npm.cmd run verify:stage8-onnx
git add package.json package-lock.json training/stage8/export_onnx.py training/stage8/verify_inference.py training/stage8/tests/test_onnx.py src/game/stage8/model-manifest.ts scripts/stage8/verify-onnx.mjs
git commit -m "feat: 增加阶段八 ONNX 模型交付"
```

### Task 13: 三阶段统一决策、解释证据和阶段七回退

**Files:**
- Create: `src/game/stage8/policy-protocol.ts`
- Create: `src/game/stage8/decision-service.ts`
- Create: `src/game/stage8/decision-evidence.ts`
- Create: `src/game/stage8/browser-runtime.ts`
- Create: `scripts/stage8/decision-regression.mjs`
- Modify: `src/game/recommendation/recommendation-engine.ts`
- Modify: `public/game/wannian-mahjong.html`

**Interfaces:**
- Produces: `Stage8DecisionResult`，同时供 AI 玩家和真人推荐消费。
- Produces: `decideVisibleState(request, phase): Promise<Stage8DecisionResult>`。

- [ ] **Step 1: 写影子/受控/主策略和同源失败测试**

```javascript
const shadow = await decide(scene, 'shadow');
assert.equal(shadow.finalAction, shadow.stage7Action);
assert.ok(shadow.rlSuggestedAction);
const controlled = await decide(scene, 'controlled');
assert.equal(controlled.finalAction, controlled.guardRejected ? controlled.stage7Action : controlled.rlMctsAction);
assert.deepEqual(await aiEntry(scene), await humanRecommendationEntry(scene));
```

- [ ] **Step 2: 写模型失败与 10 秒预算测试**

```javascript
const result = await decideWithRuntime(scene, runtimeThatRejects());
assert.equal(result.source, 'stage7-fallback');
assert.equal(result.fallbackReason, 'model-inference-failed');
assert.ok(result.elapsedMs <= 10000);
```

- [ ] **Step 3: 实现单一最终决策对象**

对象包含最终动作、Top 候选、合法掩码摘要、向听、待牌、路线、结构、公开风险、模型先验、MCTS 访问、价值、前二差异、采用阶段和回退原因。

- [ ] **Step 4: 接入 AI 和真人推荐**

页面 `aiChooseDiscard`、响应入口和真人推荐入口只调用同一 `Stage8DecisionResult`。影子期不改变实际动作；受控期只在高置信、合法且无护栏时采用；主策略期由 RL 排序、MCTS 增强。

- [ ] **Step 5: 更新解释模板**

推荐引擎只读取 `decision-evidence` 的验证字段，不生成神经网络内部思考描述，不展示与最终动作冲突的旧规则理由。

- [ ] **Step 6: 验证并提交**

```powershell
npm.cmd run test:stage8-decision
npm.cmd run test:stage7-ai-unified
npm.cmd run test:recommendation
git add src/game/stage8 src/game/recommendation/recommendation-engine.ts public/game/wannian-mahjong.html scripts/stage8/decision-regression.mjs package.json
git commit -m "feat: 接入阶段八统一决策与解释"
```

### Task 14: 移除旧页面 RL 和无效保存接口

**Files:**
- Modify: `public/game/wannian-mahjong.html`
- Modify: `next.config.mjs`
- Delete: `src/app/api/rl/load_rl/route.ts`
- Delete: `src/app/api/rl/save_rl/route.ts`
- Delete: `src/app/api/rl/save_rl_full/route.ts`
- Delete: `src/app/api/rl/validation.ts`
- Create: `scripts/stage8/legacy-rl-removal-regression.mjs`

**Interfaces:**
- Preserves: 后台 `selfplay:smoke`、普通游戏、单局导出、异常分析、会话持久化。
- Removes: 页面自弈训练入口、`RLTrainer`、`rl_model`、训练曲线、`window.RL`、过程奖励和旧保存路由。

- [ ] **Step 1: 写旧 RL 移除失败测试**

```javascript
for (const forbidden of ['bt-selfplay','RLTrainer','rl_model','window.RL','recordShantenChange','save_rl_full','sp-chart']) {
  assert.equal(html.includes(forbidden), false, forbidden);
}
assert.equal(html.includes('bt-export'), true);
assert.equal(packageJson.scripts['selfplay:smoke'], 'node scripts/selfplay-smoke.mjs');
```

Run: `node scripts/stage8/legacy-rl-removal-regression.mjs`

Expected: FAIL，当前页面仍包含旧 RL。

- [ ] **Step 2: 删除页面训练 UI 和过程奖励链路**

移除按钮、状态区、积分条、曲线、页面自弈控制、训练器初始化、经验收集、终局训练、localStorage 和 `window.RL` 分支。

- [ ] **Step 3: 删除只服务旧 RL 的 API 和 rewrite**

保留所有普通游戏 API；只删除 `/load_rl`、`/save_rl`、`/save_rl_full`。

- [ ] **Step 4: 验证普通功能未受影响**

Run:

```powershell
npm.cmd run test:stage8-legacy-removal
npm.cmd run test:stage7-recommendation
npm.cmd run selfplay:smoke -- --games 1000 --batchSize 1000 --report json --output docs/stage8/smoke-after-legacy-removal.json
```

Expected: 禁止标识全部消失，阶段七回归通过，Smoke 所有异常计数为 0。

- [ ] **Step 5: 提交旧链路移除**

```powershell
git add public/game/wannian-mahjong.html next.config.mjs src/app/api/rl scripts/stage8/legacy-rl-removal-regression.mjs package.json
git commit -m "refactor: 移除浏览器旧强化学习链路"
```

### Task 15: 报告、发布候选和原子回退

**Files:**
- Create: `scripts/stage8/report.mjs`
- Create: `scripts/stage8/release.mjs`
- Create: `scripts/stage8/rollback.mjs`
- Create: `scripts/stage8/release-regression.mjs`
- Create: `docs/stage8/release-manifest.json`
- Modify: `package.json`

**Interfaces:**
- Produces同源 Markdown/JSON 轮次报告。
- Produces不可变发布候选包；不自动发布。
- Produces回退上一冠军或阶段七基线命令。

- [ ] **Step 1: 写报告同源和禁止自动发布失败测试**

```javascript
const {json, markdown} = buildReports(FIXTURE_METRICS);
assert.equal(json.games, parseMarkdownMetric(markdown, '累计自弈局数'));
assert.equal(json.promotionEligible, false);
assert.equal(createReleaseCandidate(json).formalManifestChanged, false);
```

- [ ] **Step 2: 实现报告字段和下一步规则**

包含累计局数、有效样本、异常/隔离/熔断、吞吐资源、候选/冠军/基线、EV/CI、回归/Smoke/泄漏、晋级条件和 `continue|rollback|fix|release-review`。

- [ ] **Step 3: 实现人工确认发布和回退**

`release` 只生成候选包；`--confirm-product-acceptance stage8-product-acceptance-001` 才切换正式清单。回退只切换清单且校验目标 SHA-256，不删除模型。

- [ ] **Step 4: 验证并提交**

```powershell
npm.cmd run test:stage8-release
git add scripts/stage8/report.mjs scripts/stage8/release.mjs scripts/stage8/rollback.mjs scripts/stage8/release-regression.mjs docs/stage8/release-manifest.json package.json
git commit -m "feat: 增加模型报告发布与回退"
```

### Task 16: 阶段八聚合门禁、全量回归和浏览器验收

**Files:**
- Create: `scripts/stage8/verify-stage8.mjs`
- Create: `scripts/stage8/browser-runtime-regression.mjs`
- Create: `docs/stage8/acceptance-matrix.json`
- Modify: `package.json`

**Interfaces:**
- Produces CLI: `npm.cmd run verify:stage8`。
- Produces逐项验收矩阵，不允许用窄测试替代长程证据。

- [ ] **Step 1: 写验收矩阵失败测试**

```javascript
for (const requirement of PRD_REQUIREMENTS) assert.ok(matrix[requirement.id], requirement.id);
assert.equal(matrix['three-champions'].evidenceType, 'arena-report');
assert.equal(matrix['benchmark-24h'].minimumDurationHours, 24);
assert.equal(matrix['product-10-games'].evidenceType, 'manual-product-signoff');
```

- [ ] **Step 2: 实现聚合验证器**

验证器执行阶段八静态/动态测试，并检查规则、强 AI、推荐、MCTS、阶段六、阶段七、构建和 Smoke 的最新退出状态。长程证据缺失时输出 `incomplete`，不得输出通过。

- [ ] **Step 3: 执行全量回归**

Run:

```powershell
npm.cmd run test:rules
npm.cmd run verify:browser-rules
npm.cmd run test:strong-ai -- --report json
npm.cmd run verify:strong-ai
npm.cmd run test:recommendation -- --report json
npm.cmd run verify:recommendation
npm.cmd run test:mcts -- --report json
npm.cmd run verify:mcts
npm.cmd run test:stage6-model
npm.cmd run verify:stage6-data-gates
npm.cmd run test:stage7-recommendation
npm.cmd run test:stage7-ai-unified
npm.cmd run test:stage8
npm.cmd run build
npm.cmd run selfplay:smoke -- --games 1000 --batchSize 1000 --report json --output docs/stage8/selfplay-smoke-stage8-1000.json
npm.cmd run verify:stage8
```

Expected: 所有确定性命令退出 0；Smoke 的错胡、非法动作、泄漏、积分错误、不可复现和关键字段缺失均为 0；长程项仍标记 `incomplete`。

- [ ] **Step 4: 验证真实页面**

启动生产构建，访问 `http://127.0.0.1:18765/game/wannian-mahjong.html`；若端口占用，由 `next-with-port` 输出的实际端口替换 `18765` 并写入验收报告。验证 ONNX 影子加载、AI/真人同源、解释证据、10 秒预算、模型 404/损坏/NaN 回退、无旧 RL 入口和无控制台错误。

- [ ] **Step 5: 提交验收门禁**

```powershell
git add scripts/stage8/verify-stage8.mjs scripts/stage8/browser-runtime-regression.mjs docs/stage8/acceptance-matrix.json docs/stage8/selfplay-smoke-stage8-1000.json package.json
git commit -m "test: 建立阶段八完整验收门禁"
```

### Task 17: 运行完整 24 小时性能基准

**Files:**
- Create: `scripts/stage8/benchmark-24h.mjs`
- Create: `scripts/stage8/resource-sampler.ps1`
- Generate: `docs/stage8/benchmark-24h-stage8-m0.json`
- Generate: `docs/stage8/benchmark-24h-stage8-m0.md`
- Modify: `docs/stage8/acceptance-matrix.json`

**Interfaces:**
- Consumes: 正式模拟器、模型推理、经验池和训练更新。
- Produces: 每小时和 24 小时汇总、继续条件判定。

- [ ] **Step 1: 写基准时长和字段失败测试**

```javascript
assert.ok(report.elapsedHours >= 24);
for (const field of ['gamesPerHour','validGamesPerDay','validSamples','discardRatio','modelUpdateMs','arena50000Eta','cpu','gpu','vram','memory','phaseDurations','checkpointRecovery','fuseProbe']) assert.ok(report[field] != null, field);
```

- [ ] **Step 2: 实现真实资源采样和断点探针**

PowerShell 每分钟采集进程 CPU/内存和 `nvidia-smi` GPU/显存；基准中途执行一次受控暂停恢复和一次隔离批次熔断探针。

- [ ] **Step 3: 运行完整 24 小时基准**

Run:

```powershell
npm.cmd run stage8:benchmark -- --hours 24 --config docs/stage8/training-config-v1.json --output docs/stage8/benchmark-24h-stage8-m0.json
```

Expected: 实际持续至少 24 小时，不依赖浏览器页面。

- [ ] **Step 4: 生成报告并应用继续条件**

低于 10,000 有效局/日则停止长训并进入性能优化；10,000–20,000 重新评估周期；20,000 以上可继续本地冠军路线。每 100,000 局不足时明确报告样本不足。

- [ ] **Step 5: 提交基准证据**

```powershell
git add scripts/stage8/benchmark-24h.mjs scripts/stage8/resource-sampler.ps1 docs/stage8/benchmark-24h-stage8-m0.json docs/stage8/benchmark-24h-stage8-m0.md docs/stage8/acceptance-matrix.json package.json
git commit -m "perf: 完成阶段八二十四小时基准"
```

### Task 18: 训练与验收冠军 1

**Files:**
- Generate: `public/game/models/stage8/champion-1.onnx`
- Generate: `public/game/models/stage8/champion-1.manifest.json`
- Generate: `docs/stage8/champion-1-arena.json`
- Generate: `docs/stage8/champion-1-arena.md`
- Modify: `docs/stage8/champion-registry.json`
- Modify: `docs/stage8/acceptance-matrix.json`

- [ ] **Step 1: 训练候选直到 EV 趋势具备正式竞技条件**

Run: `npm.cmd run stage8:selfplay -- --resume latest --until-arena-eligible true`

Expected: 候选通过所有硬性门禁；策略争议进入异常池而非污染熔断。

- [ ] **Step 2: 对阶段七执行至少 50,000 场正式竞技**

Run: `npm.cmd run stage8:arena -- --candidate candidate-1 --opponent stage7 --games 50000 --seed 2026071201 --seatRotation true`

Expected: `meanDelta >= 0.5` 且 `ci95Lower > 0`；否则返回训练阶段，不晋级。

- [ ] **Step 3: 完成影子期和受控期自动验收**

要求同源决策、合法性、解释、回退、10 秒预算和确定性回归全部通过。

- [ ] **Step 4: 导出、登记并提交冠军 1**

```powershell
git add public/game/models/stage8/champion-1.onnx public/game/models/stage8/champion-1.manifest.json docs/stage8/champion-1-arena.json docs/stage8/champion-1-arena.md docs/stage8/champion-registry.json docs/stage8/acceptance-matrix.json
git commit -m "feat: 晋级阶段八冠军一"
```

### Task 19: 训练与验收冠军 2

**Files:**
- Generate: `public/game/models/stage8/champion-2.onnx`
- Generate: `public/game/models/stage8/champion-2.manifest.json`
- Generate: `docs/stage8/champion-2-arena.json`
- Generate: `docs/stage8/champion-2-arena.md`
- Modify: `docs/stage8/champion-registry.json`
- Modify: `docs/stage8/acceptance-matrix.json`

- [ ] **Step 1: 使用包含冠军 1 的历史对手池继续训练**

Run: `npm.cmd run stage8:selfplay -- --resume champion-1 --until-arena-eligible true`

- [ ] **Step 2: 对冠军 1 执行至少 50,000 场正式竞技**

Run: `npm.cmd run stage8:arena -- --candidate candidate-2 --opponent champion-1 --games 50000 --seed 2026071202 --seatRotation true`

Expected: `meanDelta > 0` 且 `ci95Lower > 0`；否则不晋级。

- [ ] **Step 3: 运行全部硬性回归并提交冠军 2**

```powershell
npm.cmd run verify:stage8
git add public/game/models/stage8/champion-2.onnx public/game/models/stage8/champion-2.manifest.json docs/stage8/champion-2-arena.json docs/stage8/champion-2-arena.md docs/stage8/champion-registry.json docs/stage8/acceptance-matrix.json
git commit -m "feat: 晋级阶段八冠军二"
```

### Task 20: 训练冠军 3、正式接入和产品验收交接

**Files:**
- Generate: `public/game/models/stage8/champion-3.onnx`
- Generate: `public/game/models/stage8/champion-3.manifest.json`
- Generate: `docs/stage8/champion-3-vs-champion-2-arena.json`
- Generate: `docs/stage8/champion-3-vs-stage7-arena.json`
- Generate: `docs/stage8/stage8-final-acceptance.md`
- Modify: `docs/stage8/champion-registry.json`
- Modify: `docs/stage8/release-manifest.json`
- Modify: `docs/stage8/acceptance-matrix.json`

- [ ] **Step 1: 继续训练候选 3**

Run: `npm.cmd run stage8:selfplay -- --resume champion-2 --until-arena-eligible true`

- [ ] **Step 2: 对冠军 2 执行至少 50,000 场竞技**

Run: `npm.cmd run stage8:arena -- --candidate candidate-3 --opponent champion-2 --games 50000 --seed 2026071203 --seatRotation true`

Expected: `meanDelta > 0` 且 `ci95Lower > 0`。

- [ ] **Step 3: 对阶段七执行至少 50,000 场累计优势竞技**

Run: `npm.cmd run stage8:arena -- --candidate candidate-3 --opponent stage7 --games 50000 --seed 2026071204 --seatRotation true`

Expected: `meanDelta >= 1.0` 且 `ci95Lower > 0`。

- [ ] **Step 4: 导出冠军 3 并接入主策略候选**

冠军 3 ONNX 必须小于 10MB；AI 玩家和真人推荐加载同一正式清单和同一 `Stage8DecisionResult`。候选包仍不自动发布。

- [ ] **Step 5: 执行最终自动验收**

Run: Task 16 全量命令及 `npm.cmd run verify:stage8`。

Expected: 除产品侧人工项外全部 `passed`，错胡、非法动作、泄漏、积分错误、不可复现和字段缺失均为 0。

- [ ] **Step 6: 交付产品侧 10 局体验验收**

产品侧人工检查模型加载、AI/推荐同源、解释一致、页面响应、恢复和肉眼低级错误。研发只记录产品签字结果，不代替产品确认。

- [ ] **Step 7: 人工确认发布并验证回退**

Run:

```powershell
npm.cmd run stage8:release -- --candidate champion-3 --confirm-product-acceptance stage8-product-acceptance-001
npm.cmd run stage8:rollback -- --dry-run previous-champion
npm.cmd run stage8:rollback -- --dry-run stage7
```

- [ ] **Step 8: 提交最终模型与验收证据**

```powershell
git add public/game/models/stage8/champion-3.onnx public/game/models/stage8/champion-3.manifest.json docs/stage8/champion-3-vs-champion-2-arena.json docs/stage8/champion-3-vs-stage7-arena.json docs/stage8/stage8-final-acceptance.md docs/stage8/champion-registry.json docs/stage8/release-manifest.json docs/stage8/acceptance-matrix.json
git commit -m "feat: 发布阶段八冠军三模型"
```

## Final Completion Audit

- [ ] PRD 第 1–18 节每项要求在 `docs/stage8/acceptance-matrix.json` 中有直接证据。
- [ ] 九类动作均有合法和非法牌例，完整规则没有通过关闭功能简化。
- [ ] 行为克隆只用于冷启动，RL 不含过程奖励。
- [ ] 玩家导出记录未进入训练清单和经验池。
- [ ] 泄漏、错胡、非法动作、积分不守恒、不可复现、NaN、无候选和版本错误均为 0。
- [ ] 24 小时基准实际持续不少于 24 小时。
- [ ] 三次冠军晋级各自包含不少于 50,000 场正式竞技。
- [ ] 冠军 3 相对阶段七达到 `+1.0/局`，并满足 95% 置信区间下界大于 0。
- [ ] 冠军 3 ONNX 小于 10MB，模型失败能回退阶段七。
- [ ] AI 玩家与真人推荐消费同一个最终决策对象。
- [ ] 旧页面 RL、`RLTrainer`、`rl_model`、训练入口和过程奖励已移除。
- [ ] 全量确定性回归、构建、1000 局 Smoke 和真实浏览器验收通过。
- [ ] 产品侧 10 局体验已有人工确认记录。
- [ ] 上一冠军和阶段七回退均已实际验证。
