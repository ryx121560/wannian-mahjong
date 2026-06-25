# 万年麻将 AI 防守系统设计

**日期**: 2026-06-02
**状态**: 待确认

## 1. 目标

让 AI 具备职业麻将选手的防守判断能力：推定对手听牌状态、量化每张牌的放铳风险、在 MCTS 搜索中自然整合攻防决策、根据点数动态调整风险偏好。

## 2. 架构

```
┌──────────────────────────────────────────┐
│              GS (全局状态)                │
│  playerDiscards[] / melds[] / turn /     │
│  scores[] / wall remnants               │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│         OpponentModel (新增模块)          │
│  - estimateShanten(oppIdx) → float       │
│  - tenpaiProb(oppIdx) → 0~1              │
│  - guessWaits(oppIdx) → Set<牌key>       │
│  - tileDanger(tile, oppIdx) → 0~1        │
│  - dangerSuits(oppIdx) → Set<花色>       │
│  位置：ai_mcts.js 新函数 (约120行)        │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│         MCTS Rollout 改造                 │
│  摸 → 弃(含dangerPenalty) →              │
│  放铳检查(dealInPenalty) → 评分           │
│  修改：fastShanten/rollout (约40行)       │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│     aiChooseDiscard 动态阈值              │
│  riskTolerance = f(点差, 向听, 局数)      │
│  替换 safeW 硬编码 (约20行)               │
└──────────────────────────────────────────┘
```

## 3. 模块详细设计

### 3.1 OpponentModel — 对手状态推测

**文件**: `ai_mcts.js`，新增独立函数块

#### 3.1.1 弃牌特征向量

每对手维护（运行时动态计算，不存状态）：

```javascript
function analyzeOpponentDiscards(oppIdx, GS) {
  const discards = GS.playerDiscards[oppIdx] || [];
  const mid = Math.floor(discards.length / 2);
  
  const early = discards.slice(0, mid);  // 前一半弃牌
  const late = discards.slice(mid);       // 后一半弃牌
  
  function classify(d) {
    if (d.t === 'honor') return 'honor';
    if (d.v === 1 || d.v === 9) return 'terminal';
    return 'middle'; // 2-8
  }
  
  return {
    discards,
    melds: GS.players[oppIdx].melds || [],
    early: { middle: 0, terminal: 0, honor: 0, total: early.length },
    late:  { middle: 0, terminal: 0, honor: 0, total: late.length },
  };
  // 实际代码中用 forEach + classify 填 middle/terminal/honor 计数
}
```

#### 3.1.2 向听数推定

```javascript
function estimateShanten(oppIdx, GS) {
  const d = analyzeOpponentDiscards(oppIdx, GS);
  let shanten = 4.0;
  
  // 副露加速
  shanten -= d.melds.length * 1.5;
  
  // 早期弃牌分析
  if (d.early.total >= 5) {
    const midRate = d.early.middle / d.early.total;
    if (midRate > 0.5) shanten -= 0.7; // 牌效好：在拆有效搭子整理手牌
    if (midRate > 0.7) shanten -= 0.3; // 几乎全是中张 → 牌很好
  }
  
  // 晚期弃牌分析
  if (d.late.total >= 4) {
    const termRate = (d.late.terminal + d.late.honor) / d.late.total;
    if (termRate > 0.6) shanten -= 1.0; // 开始弃安全牌 → 接近听牌
  }
  
  // 近期两巡连续弃字牌/幺九 → 大概率在保听
  if (d.late.total >= 2) {
    const last2 = d.discards.slice(-2);
    const allSafe = last2.every(t => t.t === 'honor' || t.v === 1 || t.v === 9);
    if (allSafe) shanten -= 0.8;
  }
  
  // 对手刚摸牌后弃中张 → 还在拆搭子（远）
  // 通过比对最近弃牌和前一张来判断（需 GS._lastDiscards 或从 discards 推断）
  
  return Math.max(0, shanten);
}
```

#### 3.1.3 听牌概率

```javascript
function tenpaiProb(oppIdx, GS) {
  const s = estimateShanten(oppIdx, GS);
  const d = analyzeOpponentDiscards(oppIdx, GS);
  let prob = 0;
  
  if (s <= 0.5) prob = 0.7;
  else if (s <= 1.0) prob = 0.35;
  else if (s <= 1.5) prob = 0.15;
  else prob = 0.02;
  
  // 两个以上副露 → 加倍怀疑
  if (d.melds.length >= 2) prob += 0.25;
  else if (d.melds.length >= 1) prob += 0.1;
  
  // 连弃安全牌 → 很可能已听
  const recent3 = d.discards.slice(-3);
  const allSafe = recent3.every(t => t.t === 'honor' || t.v === 1 || t.v === 9);
  if (allSafe && recent3.length >= 3) prob += 0.2;
  
  return Math.min(1, prob);
}
```

#### 3.1.4 危险花色

```javascript
function dangerSuits(oppIdx, GS) {
  const d = analyzeOpponentDiscards(oppIdx, GS);
  const suitCount = { wan: 0, tong: 0, tiao: 0 };
  for (const tile of d.discards) {
    if (tile.t === 'num') suitCount[tile.s]++;
  }
  
  const total = suitCount.wan + suitCount.tong + suitCount.tiao;
  if (total < 6) return new Set(); // 样本太少不判
  
  // 弃牌最多的花色 → 安全；其余 → 可能是染手目标
  const sorted = Object.entries(suitCount).sort((a,b) => b[1]-a[1]);
  const mostSuit = sorted[0][0];
  const danger = new Set();
  
  for (const [suit, cnt] of sorted) {
    if (suit !== mostSuit && cnt < total * 0.3) {
      danger.add(suit); // 被大量丢弃的花色的对立花色 → 可能是手牌花色
    }
  }
  
  // 副露花色 → 必定危险
  for (const m of d.melds) {
    if (m.tile.t === 'num') danger.add(m.tile.s);
  }
  
  return danger;
}
```

#### 3.1.5 待牌推测（贝叶斯）

```javascript
function guessWaits(oppIdx, GS) {
  // 仅在 tenpaiProb > 0.3 时调用，否则返回空
  const tp = tenpaiProb(oppIdx, GS);
  if (tp < 0.3) return new Set();
  
  const danger = dangerSuits(oppIdx, GS);
  const d = analyzeOpponentDiscards(oppIdx, GS);
  const discards = new Set(d.discards.map(t => tkey(t)));
  const meldKeys = new Set();
  for (const m of d.melds) meldKeys.add(tkey(m.tile));
  
  // 构建候选待牌池：所有还可能有剩余的牌
  const candidates = [];
  const allTiles = [];
  for (const suit of ['wan','tong','tiao']) {
    for (let v = 1; v <= 9; v++) allTiles.push(suit + v);
  }
  for (const h of ['dong','nan','xi','bei','zhong','fa','bai']) allTiles.push(h);
  
  for (const k of allTiles) {
    if (discards.has(k)) continue;       // 对手弃过 → 不会等
    if (meldKeys.has(k)) continue;        // 对手副露中 → 不会等（除非碰后等杠，但概率低）
    
    // 壁牌跳过：4张全现
    const remaining = getRemainingCount(k, GS);
    if (remaining <= 0) continue;
    
    // 基础概率 = 1 / 剩余数（越少越可能是被等的）
    let weight = 1 / remaining;
    
    // 花色权重
    const suit = k.slice(0, -1);
    if (danger.has(suit)) weight *= 4;     // 危险花色
    else if (k[0] === 'd' || k[0] === 'n' || k[0] === 'x' || k[0] === 'b' ||
             k[0] === 'z' || k[0] === 'f') {
      weight *= 0.15; // 字牌等率低（除非对手碰过同系字牌）
    } else {
      weight *= 1.0;
    }
    
    // 筋牌排除：对手抢了某张牌则对应筋牌的等率降低（不是0，因为可能是嵌张/边张/单骑）
    // 简化处理：跳过（后续迭代加）
    
    // 副露相关：对手碰了5筒，则4筒/6筒等率提高
    for (const m of d.melds) {
      if (m.tile.t === 'num' && m.tile.s === suit) {
        if (Math.abs(m.tile.v - parseInt(k.slice(-1))) === 1) weight *= 1.5;
      }
    }
    
    candidates.push({ k, weight });
  }
  
  // 取 top-10 最可能的待牌
  candidates.sort((a, b) => b.weight - a.weight);
  return new Set(candidates.slice(0, 10).map(c => c.k));
}
```

**辅助函数** `getRemainingCount(k, GS)`：统计所有手牌/副露/弃牌中该牌的可见数，返回 `4 - 可见数`。

所有函数使用项目中已有的 `tkey(tile)`（在 wannian-mahjong.html 全局定义）做牌的唯一 key。

### 3.2 Tile Danger — 牌危险度

```javascript
function tileDanger(tile, oppIdx, GS) {
  const d = analyzeOpponentDiscards(oppIdx, GS);
  const key = tkey(tile);
  
  // 现物（对手弃过）：绝对安全
  if (d.discards.some(t => tkey(t) === key)) return 0;
  
  // 壁牌（4张全现）：绝对安全
  if (getRemainingCount(key, GS) <= 0) return 0;
  
  let danger = 0.8; // 基础：中等危险
  
  // 筋牌：对手打过某牌 → 该牌的筋牌不能形成两面听，半安全
  if (tile.t === 'num') {
    for (const dt of d.discards) {
      if (dt.t !== 'num' || dt.s !== tile.s) continue;
      // 对手打过4 → 1和7是筋（不能形成4-5-6两面的等4）
      if (dt.v === tile.v + 3 || dt.v === tile.v - 3) {
        danger = 0.3;
        break;
      }
      // 对手打过5 → 2和8是筋
      if ((tile.v === 2 && dt.v === 5) || (tile.v === 8 && dt.v === 5)) {
        danger = 0.3;
        break;
      }
      // 对手打过6 → 3和9是筋
      if ((tile.v === 3 && dt.v === 6) || (tile.v === 9 && dt.v === 6)) {
        danger = 0.3;
        break;
      }
    }
  }
  
  // 危险花色判定
  if (danger > 0.3) {
    const dangerS = dangerSuits(oppIdx, GS);
    if (tile.t === 'num' && dangerS.has(tile.s)) {
      danger = 0.7;
    }
  }
  
  return danger;
}
```

### 3.3 MCTS Rollout 改造

#### 3.3.1 rollout 内层：弃牌选择加 dangerPenalty

在现有 `adjustedS = s + pairPenalty + biasAdj` 后追加：

```javascript
// 防守感知：危险牌+对手接近听牌 → 惩罚
let dangerPenalty = 0;
const tile = simHand[i];
if (tile) {
  for (let opp = 0; opp < 4; opp++) {
    if (opp === playerIdx) continue;
    const tp = tenpaiProb(opp, GS);
    if (tp < 0.15) continue;
    const td = tileDanger(tile, opp, GS);
    dangerPenalty += td * tp * 2.0;
  }
}
const adjustedS = s + pairPenalty + biasAdj + dangerPenalty;
```

**常数**: `dangerPenalty = Σ(tileDanger × tenpaiProb × 2.0)`，最高约 3×0.8×1.0×2.0=4.8，能把危险牌的路由彻底压下去。

#### 3.3.2 rollout 主循环：放铳检查

每次弃牌后（`simHand.splice(bestDiscard, 1)` 之后）追加：

```javascript
// 放铳检查
let dealInPenalty = 0;
for (let opp = 0; opp < 4; opp++) {
  if (opp === playerIdx) continue;
  const tp = tenpaiProb(opp, GS);
  if (tp < 0.1) continue;
  const waits = guessWaits(opp, GS);
  if (waits.has(discardedKey)) {
    dealInPenalty += tp * 20; // 放铳罚 20 分（远超正常自摸收益 ~8 分）
  }
}
totalScore -= dealInPenalty;
```

**注意**: `discardedKey` 是被弃牌的 key，需在 `simHand.splice` **之前** 从 `simHand[bestDiscard].k` 捕获：

```javascript
// splice 前：
const discardedKey = simHand[bestDiscard].k;
simHand.splice(bestDiscard, 1);
// 然后用 discardedKey 做放铳检查
```

### 3.4 动态风险阈值

替换 `wannian-mahjong.html` 中 `aiChooseDiscard` 的 `safeW` 硬编码：

```javascript
function riskTolerance(playerIdx, GS) {
  // 分数领先 → 趋近0（怂），落后 → 趋近1（莽）
  const myScore = GS.players[playerIdx].score || 0;
  const maxOpp = Math.max(...[0,1,2,3].filter(i=>i!==playerIdx).map(i=>GS.players[i].score||0));
  const ptsAhead = myScore - maxOpp;
  
  let risk = 0.5;
  if (ptsAhead > 8000) risk = 0.2;
  else if (ptsAhead > 4000) risk = 0.35;
  else if (ptsAhead < -8000) risk = 0.8;
  else if (ptsAhead < -4000) risk = 0.65;
  
  // 向听数调节：离听牌越远 → 越保守（反正也赢不了）
  const myShanten = calcShanten(GS.players[playerIdx].hand);
  if (myShanten >= 3) risk = Math.min(risk, 0.3);
  
  // 终局调节：南场/最后一局 → 略微保守
  if (GS.turn > 60) risk -= 0.1;
  
  return Math.max(0.05, Math.min(1.0, risk));
}
```

替换原有的：
```javascript
let safeW = danger >= 3 ? 6 : danger >= 2 ? 3 : danger >= 1 ? 1 : 0;
if (phase === 'late') safeW = Math.max(safeW, 4);
else if (phase === 'mid') safeW = Math.max(safeW, 1);
```

为：
```javascript
const risk = riskTolerance(playerIdx, GS);
// risk 低 → 安全分权重大 → 怂。risk 高 → 安全分权重小 → 莽
const safeW = Math.round((1 - risk) * 10);
```

## 4. 数据流

```
aiChooseDiscard 被调用
  │
  ├─ 计算 riskTolerance → safeW
  │
  ├─ 规则引擎：calcShanten 遍历候选（不变）
  │
  ├─ MCTS: mctsChooseDiscard
  │     │
  │     ├─ fastShanten (不变)
  │     │
  │     └─ rollout × N 次
  │           │
  │           ├─ 构建 pool (不变)
  │           ├─ for d in 0..maxDepth:
  │           │   摸牌 (不变)
  │           │   选弃牌 (新增 dangerPenalty)
  │           │   执行弃牌
  │           │   ├─ 释放铳检查 (新增)
  │           │   │   遍历对手 → tenpaiProb → guessWaits
  │           │   │   命中 → totalScore -= DEAL_IN * tp
  │           │   └─ 向听改善评分 (不变)
  │           └─ 最终 scoreHand (不变)
  │
  ├─ 选最优候选
  │
  └─ safeW 过滤 / 弃和判断 (变更为 riskTolerance 驱动)
```

## 5. 文件变更

| 文件 | 变更 | 行数估计 |
|------|------|---------|
| `ai_mcts.js` | 新增 OpponentModel 函数块 | ~130 |
| `ai_mcts.js` | 修改 rollout：dangerPenalty + dealInPenalty | +20 |
| `wannian-mahjong.html` | 新增 riskTolerance 函数 | +25 |
| `wannian-mahjong.html` | 替换 safeW 逻辑 | -15/+10 |

总计约 ~170 行新增，~15 行删除。

## 6. 测试策略

1. **单元测试**：构造假对手弃牌序列，验证 `estimateShanten`/`tenpaiProb`/`tileDanger` 输出合理
2. **对局测试**：用历史对局的 suggestLog 比对 AI 选牌是否避开已知放铳牌
3. **A/B 测试**：新旧 AI 对打 100 局，统计放铳率变化
4. **极端场景**：
   - 对手明确听牌（3副露+连弃安全牌）→ AI 应全防守
   - 大比分领先 → AI 应极度保守
   - 大比分落后 → AI 应冒险进攻
