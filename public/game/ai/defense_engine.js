// ============================================================
// 万年麻将 AI 防守引擎
// 提供危险度评估、风险容忍、防守评分等弃牌安全分析
// ============================================================

// 攻守判断：综合评估对手危险程度（多维度融合 + 对手建模）
function dangerLevel(playerIdx) {
  let d = 0;
  for (let opp = 0; opp < 4; opp++) {
    if (opp === playerIdx) continue;
    const melds = GS.players[opp].melds || [];

    // 副露数量
    if (melds.length >= 3) d += 3;
    else if (melds.length >= 2) d += 2;
    else if (melds.length >= 1) d += 1;

    // 对手建模：听牌概率直接加权
    const tp = typeof opponentTenpaiProb === 'function' ? opponentTenpaiProb(opp, GS) : 0;
    d += tp * 2.5;

    // 对手建模：待牌命中检测（听牌概率>0.5 时检查 AI 手牌中的危险牌）
    if (tp > 0.5) {
      const waits = typeof guessOpponentWaits === 'function' ? guessOpponentWaits(opp, GS) : new Set();
      const myHand = GS.players[playerIdx].hand || [];
      let hitCount = 0;
      for (const t of myHand) {
        if (waits.has(t.k)) hitCount++;
      }
      d += hitCount * 0.8;
    }

    const discs = GS.playerDiscards[opp] || [];
    if (discs.length >= 3) {
      const recent3 = discs.slice(-3);
      const allSafe = recent3.every(t => t.t === 'honor' || t.v === 1 || t.v === 9);
      if (allSafe) d += 1.2;

      const mid = Math.floor(discs.length / 2);
      const early = discs.slice(0, mid), late = discs.slice(mid);
      const earlyMid = early.filter(t => t.t === 'num' && t.v >= 3 && t.v <= 7).length;
      const lateSafe = late.filter(t => t.t === 'honor' || t.v === 1 || t.v === 9).length;
      if (earlyMid >= 2 && lateSafe >= 2) d += 1.0;
    }

    const myScore = GS.players[playerIdx].score || 100;
    const oppScore = GS.players[opp].score || 100;
    if (oppScore > myScore + 4000) d *= 0.7;
    else if (oppScore < myScore - 4000) d *= 1.3;

    if (opp === GS.dealer) d *= 1.2;
  }

  if (GS.turn > 60) d *= 1.15;
  if (GS.wall.length < 30) d *= 1.2;

  return Math.round(d * 10) / 10;
}

// 动态风险容忍度：领先怂、落后莽
function riskTolerance(playerIdx, GS) {
  const myScore = GS.players[playerIdx].score || 0;
  const maxOpp = Math.max(...[0, 1, 2, 3].filter(i => i !== playerIdx).map(i => GS.players[i].score || 0));
  const ptsAhead = myScore - maxOpp;

  let risk = 0.5;
  if (ptsAhead > 8000) risk = 0.2;
  else if (ptsAhead > 4000) risk = 0.35;
  else if (ptsAhead < -8000) risk = 0.8;
  else if (ptsAhead < -4000) risk = 0.65;

  const myShanten = calcShanten(GS.players[playerIdx].hand);
  if (myShanten >= 3) risk = Math.min(risk, 0.3);

  if (GS.turn > 60) risk -= 0.1;

  return Math.max(0.05, Math.min(1.0, risk));
}

// 筋牌判断：对手打过 X → Y 的 ryanmen 等待不成立
function isSujiSafe(tile, oppIdx) {
  if (tile.t !== 'num') return false;
  const discards = GS.playerDiscards[oppIdx] || [];
  const suji = { 1: [4], 2: [5], 3: [6], 4: [1, 7], 5: [2, 8], 6: [3, 9], 7: [4], 8: [5], 9: [6] };
  const tgts = suji[tile.v] || [];
  for (const d of discards) {
    if (d.t === 'num' && d.s === tile.s && tgts.includes(d.v)) return true;
  }
  return false;
}

// 对手花色危险度：基于弃牌花色分布
function oppSuitDanger(oppIdx, tile) {
  if (tile.t !== 'num') return 0;
  const discards = GS.playerDiscards[oppIdx] || [];
  const scnt = { wan: 0, tong: 0, tiao: 0 };
  for (const d of discards) { if (d.t === 'num') scnt[d.s]++; }
  const total = scnt.wan + scnt.tong + scnt.tiao;
  if (total < 3) return 0;

  const maxS = Object.entries(scnt).sort((a, b) => b[1] - a[1])[0];
  if (maxS[1] >= total * 0.6 && maxS[0] !== tile.s) return 3;
  return 0;
}

// 防守评分：安全牌得分高（在平手中优先被选为弃牌）
function defenseScore(tile, playerIdx) {
  let score = 0;

  // 现物：任何对手打过该牌 → 绝对安全
  for (let i = 0; i < 4; i++) {
    if (i === playerIdx) continue;
    if ((GS.playerDiscards[i] || []).some(d => teq(d, tile))) { score += 6; break; }
  }
  // 自己打过的最安全
  if ((GS.playerDiscards[playerIdx] || []).some(d => teq(d, tile))) score += 10;

  // 壁牌判断：该牌4张全现则100%安全
  if (tile.t === 'num') {
    let appear = 0;
    for (let pi = 0; pi < 4; pi++) {
      for (const d of (GS.playerDiscards[pi] || [])) {
        if (d.t === 'num' && d.s === tile.s && d.v === tile.v) appear++;
      }
    }
    for (let pi = 0; pi < 4; pi++) {
      const melds = GS.players[pi] && GS.players[pi].melds ? GS.players[pi].melds : [];
      for (const m of melds) {
        if (m.tile && m.tile.t === 'num' && m.tile.s === tile.s && m.tile.v === tile.v) {
          appear += (m.type === 'gang' || m.type === 'an_gang') ? 4 : 3;
        }
      }
    }
    if (appear >= 4) score += 12;
  }

  // 筋牌安全
  if (tile.t === 'num') {
    for (let opp = 0; opp < 4; opp++) {
      if (opp === playerIdx) continue;
      if (isSujiSafe(tile, opp)) score += 2.5;
    }
  }

  // 里筋（ura-suji）
  if (tile.t === 'num') {
    for (let opp = 0; opp < 4; opp++) {
      if (opp === playerIdx) continue;
      const discs = GS.playerDiscards[opp] || [];
      for (const d of discs) {
        if (d.t !== 'num' || d.s !== tile.s) continue;
        if (d.v === 5 && (tile.v === 2 || tile.v === 8)) { score += 1.5; break; }
        if (d.v === 4 && (tile.v === 1 || tile.v === 7)) { score += 1.5; break; }
        if (d.v === 6 && (tile.v === 3 || tile.v === 9)) { score += 1.5; break; }
      }
    }
  }

  // 跨筋（matagi-suji）
  if (tile.t === 'num') {
    for (let opp = 0; opp < 4; opp++) {
      if (opp === playerIdx) continue;
      const discs = GS.playerDiscards[opp] || [];
      for (const d of discs) {
        if (d.t !== 'num' || d.s !== tile.s) continue;
        if (d.v === 4 && (tile.v === 1 || tile.v === 7)) { score += 1.5; break; }
        if (d.v === 5 && (tile.v === 2 || tile.v === 8)) { score += 1.5; break; }
        if (d.v === 6 && (tile.v === 3 || tile.v === 9)) { score += 1.5; break; }
      }
    }
  }

  // 对手范围推理：被对手弃牌集中的花色 → 危险
  if (tile.t === 'num') {
    for (let opp = 0; opp < 4; opp++) {
      if (opp === playerIdx) continue;
      score -= oppSuitDanger(opp, tile);
    }
  }

  // 对手副露分析：对手碰了同花色则减分（小心清一色/混一色）
  for (let opp = 0; opp < 4; opp++) {
    if (opp === playerIdx) continue;
    const melds = GS.players[opp].melds || [];
    for (const m of melds) {
      if (m.count >= 3 && m.tile.t === 'num' && m.tile.s === tile.s) score -= 3;
    }
  }

  // 对手副露相邻牌危险
  for (let opp = 0; opp < 4; opp++) {
    if (opp === playerIdx) continue;
    const melds = GS.players[opp].melds || [];
    for (const m of melds) {
      if (m.tile.t === 'num' && m.tile.s === tile.s) {
        if (Math.abs(m.tile.v - tile.v) === 1) score -= 2;
        if (Math.abs(m.tile.v - tile.v) === 2) score -= 1;
      }
    }
  }

  return score;
}

// 综合自摸判断：检查所有牌型（面子手、七对子、打烂、半正宗、全正宗）
function canSelfWin(hand) {
  if (!hand || hand.length < 14) return false;
  const n = canHuNormal(hand, false);
  if (n && n.win) return true;
  try {
    if (calcShantenDalan(hand) === 0) return true;
    if (calcShantenBanzhengzong(hand) === 0) return true;
    if (calcShantenZhengzong(hand) === 0) return true;
  } catch (e) { }
  return false;
}

console.log('[defense_engine] loaded');
