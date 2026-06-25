# 万年麻将 AI 三个问题的分析与修改方案

---

## 问题一：AI 拆自己的搭子（如拆 3-4 筒）

### 根因定位

**核心问题出在 `isolatedScore` 函数与候选集收缩方向相反。**

位于 `ai_engine.js` 第 ~316-332 行（`aiChooseDiscard` 函数内部）：

```javascript
if (bestCands.length > 1) {
  function isolatedScore(h, idx) {
    const t = h[idx]; let sc = 0;
    if (t.t === 'num') {
      const s = t.s, v = t.v;
      for (const x of h)
        if (x.t === 'num' && x.s === s) {
          const d = Math.abs(x.v - v);
          if (d === 1) sc += 3;      // 相邻 → 搭子成员
          else if (d === 2) sc += 2;  // 隔一张 → 嵌张成员
        }
    } else { /* 字牌逻辑 */ }
    if (h.filter(x => teq(x, t)).length >= 2) sc += 5; // 对子
    return sc;
  }
  const iso = bestCands.map(i => isolatedScore(hand, i));
  const maxI = Math.max(...iso);                          // ← BUG：取了最大值
  const bi = bestCands.filter((_, ci) => iso[ci] === maxI);
  if (bi.length > 0 && bi.length < bestCands.length) bestCands = bi;
}
```

**语义分析**：

| `isolatedScore` 返回值 | 含义 |
|---|---|
| 0 | 真正孤张（同色无相邻/隔位牌） |
| 2 | 隔位牌存在（嵌张搭子成员，如 3-5 中的 3） |
| 3 | 相邻牌存在（两面/边张搭子成员，如 3-4 中的 3） |
| 5+ | 对子或对子+搭子 |

该函数衡量一张牌的"连通度"：分数越高越不孤立（越有价值保留）。

**Bug 逻辑链**：
1. `maxI = Math.max(...iso)` 取到了**最高分**（最不孤立的牌）。
2. `bestCands = bi` 收缩后只保留了高分候选——即**搭子成员牌**。
3. 后续打分在这些"搭子成员"中选一张弃掉 → AI 拆了自己的 3-4 筒搭子。

**正确逻辑**：应当保留**最低分**（真正孤张），弃孤张而非弃搭子成员。

### 修改方案

将 `Math.max` 改为 `Math.min`：

```javascript
// 修改前：
const maxI = Math.max(...iso);
const bi = bestCands.filter((_, ci) => iso[ci] === maxI);

// 修改后：
const minI = Math.min(...iso);
const bi = bestCands.filter((_, ci) => iso[ci] === minI);
```

### 为什么之前的过滤没拦住？

在 `isolatedScore` 之前已有这些过滤：

| 过滤步骤 | 能拦住的 |
|---|---|
| `breaksMeld` | 拆刻子/顺子 |
| `breaksPair` | 拆对子（2 张相同） |
| `breaksPairTaatsu` | 拆"对子+搭子"复合型 |

但 **3-4 筒这种纯搭子**（每张只有 1 张、仅相邻、无对子）不会被以上任何过滤拦截。它在 shanten 计算中可能是等价的（拆了 shanten 不变），所以生存到了 `isolatedScore` 阶段，然后被错误保留在候选集。

---

## 问题二：AI 不杠（明杠）

### 根因定位

**`aiRespond` 中缺少非听牌时的杠判断分支。**

位于 `ai_engine.js` 第 ~375-398 行：

```javascript
function aiRespond(resp) {
  // ...
  // 1. 优先胡
  for (let r of resp) { if (r.cw) { applyWin(r.p, '点炮'); return; } }

  const curShanten = bestShanten(effectiveHand(GS.cur));

  // 2. 听牌时：有杠就杠
  if (curShanten === 0) {
    for (let r of resp) { if (!r.ck) continue; doKong(r.p); return; }
  }

  // 3. 非听牌时：只有碰的逻辑，完全没有杠的判断！
  const pongRate = GS.diff === 'easy' ? 0.3 : 1.0;
  for (let r of resp) {
    if (!r.cp) continue;
    // ... 碰的评估逻辑 ...
  }
  nextTurn();
}
```

第 3 步只有 `r.cp`（碰）的检查，完全跳过了 `r.ck`（杠）。当 AI 向听数 > 0 时，即使手中有 3 张相同的牌可以明杠，也会直接跳过。

对比：`aiTurn`（自摸后的回合）正确检查了自杠（加杠/暗杠），但 `aiRespond`（响应他人弃牌）中明杠只在听牌时生效。

### 修改方案

在碰逻辑循环之前，增加非听牌时的明杠判断：

```javascript
// 在 "const pongRate = ..." 之前插入：

// 非听牌时明杠判断
if (curShanten > 0) {
  for (let r of resp) {
    if (!r.ck) continue;
    const kongHand = simAfterPongKong(p.hand, t, 3);  // 杠需移除 3 张
    const kongShanten = bestShanten(kongHand);
    // 杠后向听数不变或改善即可杠
    if (kongShanten <= curShanten) {
      doKong(r.p);
      return;
    }
  }
}
```

**关键考量**：
- 杠比碰多消耗一张手牌（3 张 vs 2 张），但获得一次额外摸牌机会（"杠后摸"）。
- 仅当杠不恶化向听数时才杠（`kongShanten <= curShanten`）。

---

## 问题三：明杠在听牌时万能牌价值未被考虑

### 根因定位

**听牌时无条件杠，未评估杠是否会破坏听牌形。**

位于 `ai_engine.js` 第 ~382-383 行：

```javascript
if (curShanten === 0) {
  for (let r of resp) { if (!r.ck) continue; doKong(r.p); return; }
}
```

这段代码是：听牌了 → 有人打出可杠的牌 → 无条件杠。两个盲区：

1. **杠牌可能是听牌的关键等张之一**。例如手牌听 3-6 筒，有人打 3 筒，AI 无条件杠掉，导致自己失去一个听牌进张。
2. **杠后摸牌（万能牌）的价值未与失去听牌进张做比较**。

### 修改方案

将听牌时的杠决策改为先评估：

```javascript
if (curShanten === 0) {
  for (let r of resp) {
    if (!r.ck) continue;
    // 模拟杠后手牌
    const kongHand = simAfterPongKong(p.hand, t, 3);
    const kongShanten = bestShanten(kongHand);
    // 杠后仍听牌 → 杠（既保持听牌又多摸一张）
    if (kongShanten === 0) {
      doKong(r.p);
      return;
    }
    // 杠后退到一向听 → 不杠，等更好的进张（自摸或点炮）
    // 什么都不做，继续循环
  }
}
```

**判断逻辑**：`simAfterPongKong(p.hand, t, 3)` 从手牌中移除 3 张与弃牌相同的牌，模拟杠后状态：
- 如果杠后 `bestShanten === 0` → 杠的牌不在等张列表中，杠是纯收益。
- 如果杠后 `bestShanten === 1` → 杠破坏了听牌形，不杠。

---

## 补充：搭子信息表示

当前代码中**没有显式的 `handStructure` 数据结构记录搭子信息**。搭子识别散落在多处：

| 位置 | 函数 | 作用 |
|---|---|---|
| `ai_engine.js` | `breaksPairTaatsu` | 检测某张牌是否属于"对子+搭子"复合型 |
| `ai_engine.js` | `breaksMeld` | 检测某张牌是否属于刻子/顺子 |
| `ai_engine.js` | `isolatedScore` | 隐含搭子检测（相邻=3 分、隔位=2 分） |
| `wannian-mahjong.html` | `analyzeTileRole` | UI 建议面板用，分析单张牌角色 |
| `wannian-mahjong.html` | `analyzeHandStructure` | UI 建议面板用，统计刻子/对子/搭子数量 |
| `wannian-mahjong.html` | `calcShanten` 内部 `decNum` | 向听数计算时内部追踪 melds/taatsu/pair |

对于问题一的修复，修正 `isolatedScore` 的取舍方向（从 `max` 改为 `min`）即可，无需引入新的搭子数据结构。

---

## 执行总结

| 序号 | 文件 | 函数 / 位置 | 改动类型 | 改动说明 |
|---|---|---|---|---|
| 1 | `ai_engine.js` | `aiChooseDiscard` 内 `isolatedScore`（~326 行） | 改 1 行 | `Math.max` → `Math.min`，变量名 `maxI` → `minI` |
| 2 | `ai_engine.js` | `aiRespond` 函数，碰循环之前 | 新增 ~12 行 | 非听牌时明杠判断：`simAfterPongKong` 模拟杠后手牌，`bestShanten` 不恶化则杠 |
| 3 | `ai_engine.js` | `aiRespond` 函数，听牌杠分支（~382 行） | 改 ~6 行 | 从无条件杠改为先检查杠后 `bestShanten` 是否仍为 0 |

三处改动均在 `ai_engine.js` 单一文件中，互不冲突，可独立合入。