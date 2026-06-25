// ============================================================
// 万年麻将 MCTS 弃牌搜索
// 对每张候选弃牌模拟数百轮后续摸打，选出最优
// ============================================================

const TILE_POOL = (() => {
  const suits = ['wan', 'tong', 'tiao'];
  const honors = ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'];
  const pool = [];
  suits.forEach(s => { for (let n = 1; n <= 9; n++) pool.push(s + n); });
  honors.forEach(h => pool.push(h));
  return pool; // 34 种牌
})();

// 构建剩余牌池（未见的牌各有多少张）
function buildRemainingPool(hand, GS) {
  const counts = {};
  TILE_POOL.forEach(k => counts[k] = 4);

  // 减去手牌
  for (const t of hand) counts[t.k]--;

  // 减去所有弃牌
  for (let i = 0; i < 4; i++) {
    const discs = GS.playerDiscards[i] || [];
    for (const d of discs) counts[d.k]--;
    const melds = (GS.players && GS.players[i]) ? (GS.players[i].melds || []) : [];
    for (const m of melds) {
      if (m.type === 'chi') {
        // 吃：三张牌
        const base = m.tile;
        counts[base.k]--;
        // chi 的另外两张
        if (m.tiles) for (const t of m.tiles) counts[t.k]--;
      } else if (m.type === 'peng') {
        for (let j = 0; j < 3; j++) counts[m.tile.k]--;
      } else if (m.type === 'gang' || m.type === 'an_gang') {
        for (let j = 0; j < 4; j++) counts[m.tile.k]--;
      }
    }
  }

  // 去掉负值（防御性）
  for (const k in counts) if (counts[k] < 0) counts[k] = 0;

  // 转为加权列表
  const pool = [];
  for (const k in counts) {
    for (let i = 0; i < counts[k]; i++) pool.push(k);
  }
  return pool; // ['wan1','wan1',...]
}

// 随机摸一张
function randomDraw(pool) {
  const idx = Math.floor(Math.random() * pool.length);
  const key = pool[idx];
  // 正确设置牌类型，供 calcShanten 等函数使用
  const isHonor = 'dongnanxibeizhongfabai'.includes(key);
  return { k: key, t: isHonor ? 'honor' : 'num' };
}

// 弃牌评分：综合向听数、搭子质量和危险度
function scoreHand(hand, GS, playerIdx) {
  if (!hand || hand.length === 0) return 0;
  const shanten = (typeof calcShanten === 'function') ? calcShanten(hand) : estimateShanten(hand);
  // 向听数越低越好（0=听牌，-1=和牌）
  let score = (6 - shanten) * 10;

  // 听牌额外奖励 + 等牌数量
  if (shanten === 0 && typeof listWaits === 'function') {
    // 注意：listWaits 的第二个参数是 playerIdx，不是 GS
    const waits = listWaits(hand, playerIdx);
    score += 20 + (waits ? waits.length * 3 : 0);
  }

  // 危险度惩罚（如果有危险度函数）
  if (shanten > 0 && typeof dangerLevel === 'function' && GS) {
    const danger = dangerLevel(playerIdx);
    score -= danger * 3;
  }

  return score;
}

// 快速向听数估算（不走完整 calcShanten，用简化版避免递归开销）
// biasType: 'mixed'|'clean' 混一色/清一色路径，字牌有额外战略价值
function fastShanten(hand, biasType) {
  // 面子手快速估：数牌按搭子数算
  const counts = { wan: Array(10).fill(0), tong: Array(10).fill(0), tiao: Array(10).fill(0) };
  const honorCounts = { dong: 0, nan: 0, xi: 0, bei: 0, zhong: 0, fa: 0, bai: 0 };

  for (const t of hand) {
    const k = t.k;
    if (honorCounts.hasOwnProperty(k)) { honorCounts[k]++; continue; }
    const suit = k.slice(0, -1);
    const num = parseInt(k.slice(-1));
    if (counts[suit]) counts[suit][num]++;
  }

  let melds = 0, taatsu = 0, hasPair = false;

  // 字牌：孤张 0.3（弱），对子 1.5（可碰/雀头）
  for (const h in honorCounts) {
    const c = honorCounts[h];
    if (c >= 3) melds++;
    else if (c === 2) { taatsu += 1.5; hasPair = true; }
    else if (c === 1) taatsu += 0.3;
  }

  // 万年麻将规则：任意3张风牌可成刻子，2张不同风牌=1个共享搭子（等任意第三张风牌）
  // fastShanten 把每张孤立风牌各计1搭子，高估了。修正：每2张孤立风牌只算1搭子
  let windIso = 0;
  for (const w of ['dong', 'nan', 'xi', 'bei']) {
    if (honorCounts[w] === 1) windIso++;
  }
  taatsu -= Math.floor(windIso / 2);

  // 数牌：搭子分级权重（两面1.0 > 嵌张0.7 > 边张0.5）
  for (const suit of ['wan', 'tong', 'tiao']) {
    const c = counts[suit];
    let i = 1;
    while (i <= 9) {
      if (c[i] >= 3) { melds++; c[i] -= 3; continue; }
      if (i <= 7 && c[i] >= 1 && c[i + 1] >= 1 && c[i + 2] >= 1) {
        melds++; c[i]--; c[i + 1]--; c[i + 2]--; continue;
      }
      // 两面 (ryanmen): 1.0 — 排除边张位置
      if (i <= 7 && i !== 1 && c[i] >= 1 && c[i + 1] >= 1) {
        taatsu += 1.0; c[i]--; c[i + 1]--; continue;
      }
      // 边张 (penchan): 0.5 — 1-2 或 8-9
      if ((i === 1 || i === 8) && i <= 8 && c[i] >= 1 && c[i + 1] >= 1) {
        taatsu += 0.5; c[i]--; c[i + 1]--; continue;
      }
      // 嵌张 (kanchan): 0.7
      if (i <= 7 && c[i] >= 1 && c[i + 2] >= 1) {
        taatsu += 0.7; c[i]--; c[i + 2]--; continue;
      }
      if (i <= 8 && c[i] >= 2) {
        if (!hasPair) { hasPair = true; c[i] -= 2; continue; }
        // 多余对子：保留为搭子，给予更高权重（可碰、可转雀头）
        taatsu += 1.2; c[i] -= 2; continue;
      }
      if (c[i] >= 2) { hasPair = true; c[i] -= 2; continue; }
      i++;
    }
  }

  // 剩余孤立数牌：不参与搭子计数，但每张加微惩罚以区分同向听数手牌
  let isolated = 0;
  for (const suit of ['wan', 'tong', 'tiao']) {
    for (let j = 1; j <= 9; j++) isolated += counts[suit][j];
  }
  const blockTaatsu = Math.min(taatsu, 4 - melds);
  const wastePenalty = isolated * 0.05;



  // 混一色/清一色：孤立字牌是战略资产，每个贡献0.3向听数改善
  // 避免 MCTS 在搭子饱和时把字牌当"多余"弃掉
  let flushBonus = 0;
  if (biasType === 'mixed' || biasType === 'clean') {
    for (const h in honorCounts) {
      const c = honorCounts[h];
      if (c === 1) flushBonus += 0.3;
      else if (c === 2) flushBonus += 0.6;
    }
  }

  const blocks = melds + blockTaatsu + (hasPair ? 1 : 0);
  return Math.max(0, 6 - blocks - flushBonus + wastePenalty);
}

// ============================================================
// 贝叶斯待牌推测：返回对手最可能等的 top-10 牌 key 集合
function guessOpponentWaits(oppIdx, GS) {
  const tp = opponentTenpaiProb(oppIdx, GS);
  if (tp < 0.25) return new Set();

  const danger = opponentDangerSuits(oppIdx, GS);
  const d = analyzeOpponentDiscards(oppIdx, GS);
  const discardedKeys = new Set(d.discards.map(t => t.k));
  const meldKeys = new Set();
  for (const m of d.melds) {
    if (m.tile) meldKeys.add(m.tile.k);
    if (m.tiles) for (const t of m.tiles) meldKeys.add(t.k);
  }

  // 分数位置权重
  const oppScore = (GS.players && GS.players[oppIdx]) ? (GS.players[oppIdx].score || 100) : 100;
  const maxScore = Math.max(...[0,1,2,3].map(i => (GS.players && GS.players[i]) ? (GS.players[i].score || 0) : 0));
  const isAhead = oppScore >= maxScore - 2000;
  const isDealer = oppIdx === GS.dealer;

  // 构建候选待牌池
  const candidates = [];
  for (const k of TILE_POOL) {
    if (discardedKeys.has(k)) continue;
    if (meldKeys.has(k)) continue;

    const remaining = getRemainingCountGlobal(k, GS);
    if (remaining <= 0) continue;

    let weight = 1 / remaining;

    // 花色权重
    const suit = k.slice(0, -1);
    const honorsSet = new Set(['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai']);
    if (danger.has(suit)) weight *= 4;
    else if (honorsSet.has(k)) weight *= 0.12;
    else weight *= 1.0;

    // 副露相邻牌提高权重
    for (const m of d.melds) {
      if (m.tile && m.tile.t === 'num' && m.tile.s === suit) {
        const mv = m.tile.v;
        const kv = parseInt(k.slice(-1));
        if (Math.abs(mv - kv) === 1) weight *= 1.8;
        if (Math.abs(mv - kv) === 2) weight *= 1.3;
      }
    }

    // 领先的对手：更可能等安全的中张
    if (isAhead && !honorsSet.has(k)) weight *= 1.2;
    // 庄家：更积极进攻，可能等更多牌
    if (isDealer) weight *= 1.15;

    candidates.push({ k, weight });
  }

  candidates.sort((a, b) => b.weight - a.weight);
  return new Set(candidates.slice(0, 10).map(c => c.k));
}

// 辅助：该牌在全局尚存几张
function getRemainingCountGlobal(k, GS) {
  let cnt = 4;
  // 减弃牌
  for (let i = 0; i < 4; i++) {
    const discs = GS.playerDiscards[i] || [];
    for (const d of discs) if (d.k === k) cnt--;
    // 副露
    const melds = (GS.players && GS.players[i]) ? (GS.players[i].melds || []) : [];
    for (const m of melds) {
      if (!m.tile) continue;
      if (m.type === 'peng' && m.tile.k === k) cnt -= 3;
      else if ((m.type === 'gang' || m.type === 'an_gang') && m.tile.k === k) cnt -= 4;
      else if (m.type === 'chi') {
        if (m.tile.k === k) cnt--;
        if (m.tiles) for (const t of m.tiles) if (t.k === k) cnt--;
      }
    }
  }
  return Math.max(0, cnt);
}

// 单张牌危险度（合并模型）
// 融合筋牌/里筋/壁牌/现物/副露相邻等维度
function tileDangerAgainst(tile, oppIdx, GS) {
  const d = analyzeOpponentDiscards(oppIdx, GS);
  const key = tile.k;

  // 现物：对手弃过 → 绝对安全
  if (d.discards.some(t => t.k === key)) return 0;

  // 壁牌：4张全现 → 绝对安全
  if (getRemainingCountGlobal(key, GS) <= 0) return 0;

  let danger = 0.8;

  // 筋牌判定（普通suji）
  if (tile.t === 'num') {
    for (const dt of d.discards) {
      if (dt.t !== 'num' || dt.s !== tile.s) continue;
      if (dt.v === tile.v + 3 || dt.v === tile.v - 3) { danger = 0.25; break; }
      if ((tile.v === 2 && dt.v === 5) || (tile.v === 8 && dt.v === 5)) { danger = 0.25; break; }
      if ((tile.v === 3 && dt.v === 6) || (tile.v === 9 && dt.v === 6)) { danger = 0.25; break; }
    }
  }

  // 里筋（ura-suji）：对手弃5→2/8也相对安全
  if (danger > 0.25 && tile.t === 'num') {
    for (const dt of d.discards) {
      if (dt.t !== 'num' || dt.s !== tile.s) continue;
      if (dt.v === 5 && (tile.v === 2 || tile.v === 8)) { danger = 0.35; break; }
      if (dt.v === 4 && (tile.v === 1 || tile.v === 7)) { danger = 0.35; break; }
      if (dt.v === 6 && (tile.v === 3 || tile.v === 9)) { danger = 0.35; break; }
    }
  }

  // 跨筋（matagi-suji）：对手弃4→1/7也偏安全
  if (danger > 0.35 && tile.t === 'num') {
    for (const dt of d.discards) {
      if (dt.t !== 'num' || dt.s !== tile.s) continue;
      if (dt.v === 4 && (tile.v === 1 || tile.v === 7)) { danger = 0.45; break; }
      if (dt.v === 5 && (tile.v === 2 || tile.v === 8)) { danger = 0.45; break; }
      if (dt.v === 6 && (tile.v === 3 || tile.v === 9)) { danger = 0.45; break; }
    }
  }

  // 危险花色加权
  if (danger > 0.3) {
    const dS = opponentDangerSuits(oppIdx, GS);
    if (tile.t === 'num' && dS.has(tile.s)) danger = Math.max(danger, 0.7);
  }

  // 副露相邻牌更危险：对手碰了5筒→4筒/6筒等两面待牌
  for (const m of d.melds) {
    if (m.tile && m.tile.t === 'num' && tile.t === 'num' && m.tile.s === tile.s) {
      if (Math.abs(m.tile.v - tile.v) === 1) danger = Math.max(danger, 0.75);
      if (Math.abs(m.tile.v - tile.v) === 2) danger = Math.max(danger, 0.6);
    }
  }

  return Math.min(1, danger);
}

// 对手手牌建模（OpponentModel）
// 基于弃牌时序/副露/花色分布推测对手听牌状态与待牌
// ============================================================

// 分析对手弃牌特征
function analyzeOpponentDiscards(oppIdx, GS) {
  const discards = GS.playerDiscards[oppIdx] || [];
  const mid = Math.floor(discards.length / 2);
  const earlyDiscards = discards.slice(0, mid);
  const lateDiscards = discards.slice(mid);

  function classify(d) {
    if (d.t === 'honor') return 'honor';
    if (d.v === 1 || d.v === 9) return 'terminal';
    return 'middle';
  }
  const countBy = (arr) => {
    const r = { middle: 0, terminal: 0, honor: 0 };
    arr.forEach(d => { r[classify(d)]++; });
    return r;
  };
  const early = countBy(earlyDiscards);
  const late = countBy(lateDiscards);
  early.total = earlyDiscards.length;
  late.total = lateDiscards.length;

  return {
    discards,
    early,
    late,
    melds: (GS.players && GS.players[oppIdx]) ? (GS.players[oppIdx].melds || []) : [],
  };
}

// 推定对手向听数
function estimateOpponentShanten(oppIdx, GS) {
  const d = analyzeOpponentDiscards(oppIdx, GS);
  let shanten = 4.0;

  // 副露加速
  shanten -= d.melds.length * 1.5;

  // 早期弃牌分析
  if (d.early.total >= 5) {
    const midRate = d.early.middle / d.early.total;
    if (midRate > 0.5) shanten -= 0.7;
    if (midRate > 0.7) shanten -= 0.3;
  }

  // 晚期弃牌：开始弃安全牌 → 接近听牌
  if (d.late.total >= 4) {
    const termRate = (d.late.terminal + d.late.honor) / d.late.total;
    if (termRate > 0.6) shanten -= 1.0;
  }

  // 近期两巡连续弃幺九/字牌 → 大概率保听
  if (d.discards.length >= 2) {
    const last2 = d.discards.slice(-2);
    const allSafe = last2.every(t => t.t === 'honor' || t.v === 1 || t.v === 9);
    if (allSafe) shanten -= 0.8;
  }

  return Math.max(0, shanten);
}

// 对手听牌概率 0~1
function opponentTenpaiProb(oppIdx, GS) {
  const s = estimateOpponentShanten(oppIdx, GS);
  const d = analyzeOpponentDiscards(oppIdx, GS);
  let prob = 0;

  if (s <= 0.5) prob = 0.75;
  else if (s <= 1.0) prob = 0.4;
  else if (s <= 1.5) prob = 0.18;
  else prob = 0.02;

  if (d.melds.length >= 2) prob += 0.25;
  else if (d.melds.length >= 1) prob += 0.1;

  // 连弃安全牌 → 很可能已听
  const recent3 = d.discards.slice(-3);
  const allSafe = recent3.every(t => t.t === 'honor' || t.v === 1 || t.v === 9);
  if (allSafe && recent3.length >= 3) prob += 0.2;

  // 分数位置：落后对手更可能积极听牌
  const oppScore = (GS.players && GS.players[oppIdx]) ? (GS.players[oppIdx].score || 100) : 100;
  const maxScore = Math.max(...[0,1,2,3].map(i => (GS.players && GS.players[i]) ? (GS.players[i].score || 0) : 0));
  if (oppScore < maxScore - 4000) prob += 0.1;

  // 庄家更积极
  if (oppIdx === GS.dealer) prob += 0.08;

  return Math.min(1, prob);
}

// 对手危险花色集合
function opponentDangerSuits(oppIdx, GS) {
  const d = analyzeOpponentDiscards(oppIdx, GS);
  const suitCount = { wan: 0, tong: 0, tiao: 0 };
  for (const t of d.discards) {
    if (t.t === 'num') suitCount[t.s]++;
  }

  const total = suitCount.wan + suitCount.tong + suitCount.tiao;
  if (total < 6) return new Set();

  const sorted = Object.entries(suitCount).sort((a, b) => b[1] - a[1]);
  const mostSuit = sorted[0][0];
  const danger = new Set();
  for (const [suit, cnt] of sorted) {
    if (suit !== mostSuit && cnt < total * 0.3) {
      danger.add(suit);
    }
  }

  // 副露花色必定危险
  for (const m of d.melds) {
    if (m.tile && m.tile.t === 'num') danger.add(m.tile.s);
  }

  return danger;
}


// 模拟一条路线：从弃掉某牌开始，摸 N 轮，计算最终局面评分
// biasType: 染手路径类型，用于保护混一色/清一色下的字牌
function rollout(hand, discardKey, GS, playerIdx, maxDepth, biasType) {
  let simHand = hand.map(t => ({ k: t.k, t: t.t }));
  // 弃掉指定牌
  const idx = simHand.findIndex(t => t.k === discardKey);
  if (idx < 0) return 0;
  simHand.splice(idx, 1);

  const pool = buildRemainingPool(simHand, GS);
  if (pool.length === 0) return scoreHand(simHand, GS, playerIdx);

  // 染手路径下提取主色
  const biasSuit = (biasType === 'mixed' || biasType === 'clean')
    ? (typeof suitBias === 'function' ? suitBias(simHand).suit : null) : null;

  let totalScore = 0;
  let currentShanten = fastShanten(simHand, biasType);

  for (let d = 0; d < maxDepth; d++) {
    if (pool.length === 0 || simHand.length === 0) break;

    // 摸随机牌
    const drawIdx = Math.floor(Math.random() * pool.length);
    const drawn = pool[drawIdx];
    pool.splice(drawIdx, 1);
    simHand.push({ k: drawn, t: drawn });

    // 选最优弃牌：贪心最小化向听数 + 对子保留偏好 + 染手偏向 + 防守aware
    let bestDiscard = 0, bestS = 999;
    for (let i = 0; i < simHand.length; i++) {
      const testHand = simHand.filter((_, j) => j !== i);
      const s = fastShanten(testHand, biasType);
      // 对子保留偏好：弃牌后该牌在手牌中剩1张 → 对子被拆，加惩罚
      const tileKey = simHand[i].k;
      const remaining = testHand.filter(t => t.k === tileKey).length;
      const pairPenalty = (remaining === 1) ? 1.0 : 0;
      // 染手偏向：混一色/清一色下，弃字牌罚0.5，弃非主色数牌奖0.3
      let biasAdj = 0;
      if (biasSuit) {
        const tile = simHand[i];
        if (tile.t === 'honor') biasAdj = 0.5;
        else if (tile.t === 'num' && tile.k.slice(0, -1) !== biasSuit) biasAdj = -0.3;
      }
      // 防守感知：危险牌+对手接近听牌 → 惩罚
      let dangerPenalty = 0;
      for (let opp = 0; opp < 4; opp++) {
        if (opp === playerIdx) continue;
        const tp = opponentTenpaiProb(opp, GS);
        if (tp < 0.15) continue;
        const td = tileDangerAgainst(simHand[i], opp, GS);
        // 分数差加权：我方领先→更保守，落后→更激进
        const myScore = (GS.players && GS.players[playerIdx]) ? (GS.players[playerIdx].score || 100) : 100;
        const oppScore = (GS.players && GS.players[opp]) ? (GS.players[opp].score || 100) : 100;
        const scoreFactor = (myScore - oppScore) > 4000 ? 1.5 : (myScore - oppScore) < -4000 ? 0.6 : 1.0;
        dangerPenalty += td * tp * 2.5 * scoreFactor;
      }
      const adjustedS = s + pairPenalty + biasAdj + dangerPenalty;
      if (adjustedS < bestS) { bestS = adjustedS; bestDiscard = i; }
    }
    const discardedKey = simHand[bestDiscard].k;
    simHand.splice(bestDiscard, 1);

    // 放铳检查
    let dealInPenalty = 0;
    for (let opp = 0; opp < 4; opp++) {
      if (opp === playerIdx) continue;
      const tp = opponentTenpaiProb(opp, GS);
      if (tp < 0.1) continue;
      const waits = guessOpponentWaits(opp, GS);
      if (waits.has(discardedKey)) {
        const myScore = (GS.players && GS.players[playerIdx]) ? (GS.players[playerIdx].score || 100) : 100;
        const oppScore = (GS.players && GS.players[opp]) ? (GS.players[opp].score || 100) : 100;
        const scoreFactor = (myScore - oppScore) > 4000 ? 1.5 : (myScore - oppScore) < -4000 ? 0.5 : 1.0;
        dealInPenalty += tp * 25 * scoreFactor;
      }
    }
    totalScore -= dealInPenalty;

    const newShanten = fastShanten(simHand, biasType);
    // 向听数改善奖励
    if (newShanten < currentShanten) totalScore += 3;
    else if (newShanten === currentShanten) totalScore += 0.2;
    else totalScore -= 1;

    currentShanten = newShanten;
    if (newShanten <= 0) { totalScore += 5; break; } // 听牌或更好，停止模拟
  }

  // 最终局面评分
  totalScore += scoreHand(simHand, GS, playerIdx) * 0.3;
  return totalScore;
}

// MCTS 主入口
function mctsChooseDiscard(hand, playerIdx, GS, sims, depth) {
  sims = sims || 100;
  depth = depth || 5;

  // 去重候选牌
  const seen = new Set();
  const candidates = [];
  for (const t of hand) {
    if (!seen.has(t.k)) { seen.add(t.k); candidates.push(t.k); }
  }

  if (candidates.length <= 1) return 0; // 只有一种牌可弃

  // 计算染手偏向，传递给 rollout 和 fastShanten
  const bias = (typeof suitBias === 'function') ? suitBias(hand) : { type: 'none' };
  // 归一化：mixed-lean → mixed，semi-clear → clean
  const normBiasType = (t) => (t === 'mixed' || t === 'mixed-lean') ? 'mixed'
    : (t === 'clean' || t === 'semi-clear') ? 'clean' : null;
  const biasType = normBiasType(bias.type);

  // 并行模拟所有候选
  const scores = {};
  for (const c of candidates) scores[c] = 0;

  for (let s = 0; s < sims; s++) {
    for (const c of candidates) {
      scores[c] += rollout(hand, c, GS, playerIdx, depth, biasType);
    }
  }

  // 归一化
  for (const c of candidates) scores[c] /= sims;

  // 选手牌中得分最高的
  let bestScore = -Infinity, bestIdx = 0;
  for (let i = 0; i < hand.length; i++) {
    const s = scores[hand[i].k];
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }

  return bestIdx;
}

// --- 全局 MCTS 控制器 ---
window.MCTS = {
  useMCTS: false,
  sims: 200,         // 每张候选牌模拟次数
  depth: 5,         // 每次模拟摸牌轮数
  cache: new Map(),

  chooseDiscard(hand, playerIdx, GS) {
    // 手牌 ≤2 张时不搜索
    if (hand.length <= 2) return 0;

    const t0 = performance.now();
    const idx = mctsChooseDiscard(hand, playerIdx, GS, this.sims, this.depth);
    const elapsed = performance.now() - t0;

    if (elapsed > 500) {
      // 自动降档
      this.sims = Math.max(30, Math.floor(this.sims * 0.7));
      console.log(`[MCTS] 耗时 ${elapsed.toFixed(0)}ms，降档 sims→${this.sims}`);
    }

    return idx;
  },

  toggle() { this.useMCTS = !this.useMCTS; return this.useMCTS; }
};

console.log('[MCTS] Monte Carlo Tree Search loaded. sims=' + window.MCTS.sims + ' depth=' + window.MCTS.depth);
