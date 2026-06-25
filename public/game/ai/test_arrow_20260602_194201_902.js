// 测试脚本 v2：箭牌问题分析
const fs = require('fs');
const path = require('path');

function teq(a, b) { return a.k === b.k; }
function tkey(t) { return t.k; }
function kt(k) {
  if ('dongnanxibeizhongfabai'.includes(k)) return { k, t: 'honor', s: k, v: 0 };
  const sm = { wan: 'wan', tong: 'tong', tiao: 'tiao' };
  const sk = k.slice(0, k.length - 1);
  return { k, t: 'num', s: sm[sk], v: parseInt(k.slice(-1)) };
}

// ---- 直接内联 fastShanten ----
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

  // 箭牌
  for (const h of ['zhong', 'fa', 'bai']) {
    const c = honorCounts[h] || 0;
    if (c >= 3) melds++;
    else if (c === 2) { taatsu += 1.5; hasPair = true; }
    else if (c === 1) taatsu += 0.3;
  }

  // 风牌
  let windTiles = 0, windDistinct = 0;
  for (const w of ['dong', 'nan', 'xi', 'bei']) {
    const c = honorCounts[w] || 0;
    windTiles += c;
    if (c > 0) windDistinct++;
  }
  for (const w of ['dong', 'nan', 'xi', 'bei']) {
    const c = honorCounts[w] || 0;
    if (c >= 3) { melds++; windTiles -= 3; }
  }
  const windMelds = Math.floor(windDistinct / 3);
  melds += windMelds;
  windTiles -= windMelds * 3;
  if (windTiles === 2) taatsu += 0.8;
  else if (windTiles === 1) taatsu += 0.3;
  if (!hasPair) {
    for (const w of ['dong', 'nan', 'xi', 'bei']) {
      const c = honorCounts[w] || 0;
      const used = Math.floor(c / 3) * 3;
      if (c - used >= 2) { hasPair = true; break; }
    }
  }

  // 数牌
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

// ---- 测试 ----
const handKeys = [
  'tong4', 'tong5', 'wan6', 'zhong', 'wan8', 'tong9', 'tong4',
  'zhong', 'tong1', 'bai', 'tong7', 'tiao4', 'tiao2', 'tiao5'
];
const hand = handKeys.map(k => kt(k));

console.log('=== 手牌分析 (' + hand.length + '张) ===');
console.log(handKeys.join(','));

// 计算每张牌去掉后的向听数
const results = [];
for (let i = 0; i < hand.length; i++) {
  const sub = hand.filter((_, j) => j !== i);
  const s = fastShanten(sub, null);
  results.push({ idx: i, tile: handKeys[i], shanten: s });
  console.log(`  弃[${i}] ${handKeys[i]}: shanten=${s.toFixed(3)}`);
}

const bestShanten = Math.min(...results.map(r => r.shanten));
const bestCands = results.filter(r => r.shanten === bestShanten);
console.log('\n最佳向听数:', bestShanten.toFixed(3));
console.log('候选牌:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', '));

// ---- breaksMeld ----
function breaksMeld(h, idx) {
  const t = h[idx];
  if (t.t === 'honor' && ['zhong', 'fa', 'bai'].includes(t.s)) {
    const dorder = ['zhong', 'fa', 'bai'];
    const sub = h.filter((_, j) => j !== idx);
    const subArrows = sub.filter(x => x.t === 'honor' && dorder.includes(x.s)).map(x => x.s);
    if (new Set(subArrows).size === 2 && !subArrows.includes(t.s)) return true;
  }
  if (t.t === 'num') {
    const sub = h.filter((_, j) => j !== idx);
    const s = t.s, v = t.v;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1) &&
        sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1)) return true;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1) &&
        sub.some(x => x.t === 'num' && x.s === s && x.v === v + 2)) return true;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 2) &&
        sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1)) return true;
  }
  if (t.t === 'honor') {
    const order = ['dong', 'nan', 'xi', 'bei']; const oi = order.indexOf(t.s);
    if (oi >= 0) {
      const sub = h.filter((_, j) => j !== idx);
      const subWinds = sub.filter(x => x.t === 'honor' && order.includes(x.s)).map(x => x.s);
      if (new Set(subWinds).size >= 2) return true;
    }
  }
  return false;
}

function breaksPair(h, idx) {
  const t = h[idx];
  return (h.filter(x => teq(x, t)).length) >= 2;
}

console.log('\n=== 过滤追踪 ===');
const bestIdxList = bestCands.map(c => c.idx);
const meldB = bestIdxList.map(i => breaksMeld(hand, i));
const pairB = bestIdxList.map(i => breaksPair(hand, i));
console.log('breaksMeld:', bestIdxList.map((i, ci) => `[${i}]${handKeys[i]}=${meldB[ci]}`).join(', '));
console.log('breaksPair:', bestIdxList.map((i, ci) => `[${i}]${handKeys[i]}=${pairB[ci]}`).join(', '));

const nonMeld = bestIdxList.filter((_, ci) => !meldB[ci]);
console.log('nonMeld:', nonMeld.map(i => `[${i}]${handKeys[i]}`).join(', '));

if (nonMeld.length > 0) {
  const np = nonMeld.filter(i => !pairB[bestIdxList.indexOf(i)]);
  console.log('不拆对后:', np.map(i => `[${i}]${handKeys[i]}`).join(', '));
}

console.log('\n=== 结论 ===');
console.log('期望: 应弃 tong1 而非 zhong');
