// ============================================================
// 万年麻将 AI 手牌评估模块
// 提供快速向听数估算、手牌评分、剩余牌池构建
// ============================================================

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
        const base = m.tile;
        counts[base.k]--;
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
  return pool;
}

// 随机摸一张
function randomDraw(pool) {
  const idx = Math.floor(Math.random() * pool.length);
  const key = pool[idx];
  const honorKeys = typeof HONORS !== 'undefined' ? HONORS : ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'];
  const isHonor = honorKeys.includes(key);
  return { k: key, t: isHonor ? 'honor' : 'num' };
}

// 手牌评分：综合向听数、搭子质量和危险度
function scoreHand(hand, GS, playerIdx) {
  if (!hand || hand.length === 0) return 0;
  const shanten = (typeof calcShanten === 'function') ? calcShanten(hand) : fastShanten(hand, null);
  let score = (6 - shanten) * 10;

  if (shanten === 0 && typeof listWaits === 'function') {
    const waits = listWaits(hand, playerIdx);
    score += 20 + (waits ? waits.length * 3 : 0);
  }

  if (shanten > 0 && typeof dangerLevel === 'function' && GS) {
    const danger = dangerLevel(playerIdx);
    score -= danger * 3;
  }

  return score;
}

// 快速向听数估算（不走完整 calcShanten，用简化版避免递归开销）
// biasType: 'mixed'|'clean' 混一色/清一色路径，字牌有额外战略价值
function fastShanten(hand, biasType) {
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

  // 箭牌（中发白）：任意3张不同=1刻子，2张不同=共享搭子(0.8)
  const arrowRemaining = [];
  for (const a of ['zhong', 'fa', 'bai']) {
    const c = honorCounts[a] || 0;
    if (c >= 3) melds++;
    const rest = c % 3;
    if (rest > 0) arrowRemaining.push({ key: a, count: rest });
  }
  const arrowMelds = Math.floor(arrowRemaining.length / 3);
  melds += arrowMelds;
  const arrowForTaatsu = arrowRemaining.slice(arrowMelds * 3);
  let arrowTiles = arrowForTaatsu.reduce(function(sum, item){ return sum + item.count; }, 0);
  const arrowDistinct = arrowForTaatsu.length;
  if (arrowDistinct >= 2) { taatsu += 0.8; arrowTiles = Math.max(0, arrowTiles - 2); }
  if (arrowTiles === 2) taatsu += 1.5;
  else if (arrowTiles === 1) taatsu += 0.3;
  if (!hasPair && arrowForTaatsu.some(function(item){ return item.count >= 2; })) hasPair = true;

  // Wind honors: keep triplets, mixed-wind melds, taatsu and pairs independent.
  const windRemaining = [];
  for (const w of ['dong', 'nan', 'xi', 'bei']) {
    const c = honorCounts[w] || 0;
    if (c >= 3) melds++;
    const rest = c % 3;
    if (rest > 0) windRemaining.push({ key: w, count: rest });
  }
  const windMelds = Math.floor(windRemaining.length / 3);
  melds += windMelds;
  const windForTaatsu = windRemaining.slice(windMelds * 3);
  const windTiles = windForTaatsu.reduce(function(sum, item){ return sum + item.count; }, 0);
  if (windTiles === 2) taatsu += 0.8;
  else if (windTiles === 1) taatsu += 0.3;
  if (!hasPair && windForTaatsu.some(function(item){ return item.count >= 2; })) hasPair = true;

  // 数牌：搭子分级权重（两面1.0 > 嵌张0.7 > 边张0.5）
  for (const suit of ['wan', 'tong', 'tiao']) {
    const c = counts[suit];
    let i = 1;
    while (i <= 9) {
      if (c[i] >= 3) { melds++; c[i] -= 3; continue; }
      if (i <= 7 && c[i] >= 1 && c[i + 1] >= 1 && c[i + 2] >= 1) {
        melds++; c[i]--; c[i + 1]--; c[i + 2]--; continue;
      }
      if (i <= 7 && i !== 1 && c[i] >= 1 && c[i + 1] >= 1) {
        taatsu += 1.0; c[i]--; c[i + 1]--; continue;
      }
      if ((i === 1 || i === 8) && i <= 8 && c[i] >= 1 && c[i + 1] >= 1) {
        taatsu += 0.5; c[i]--; c[i + 1]--; continue;
      }
      if (i <= 7 && c[i] >= 1 && c[i + 2] >= 1) {
        taatsu += 0.7; c[i]--; c[i + 2]--; continue;
      }
      if (i <= 8 && c[i] >= 2) {
        if (!hasPair) { hasPair = true; c[i] -= 2; continue; }
        taatsu += 1.2; c[i] -= 2; continue;
      }
      if (c[i] >= 2) { hasPair = true; c[i] -= 2; continue; }
      i++;
    }
  }

  let isolated = 0;
  for (const suit of ['wan', 'tong', 'tiao']) {
    for (let j = 1; j <= 9; j++) isolated += counts[suit][j];
  }
  const blockTaatsu = Math.min(taatsu, 4 - melds);
  const wastePenalty = isolated * 0.05;

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

console.log('[eval] loaded');
