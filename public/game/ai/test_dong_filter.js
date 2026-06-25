// 模拟 aiChooseDiscard 完整过滤链
const fs = require('fs');

function teq(a, b) { return a.k === b.k; }
function tkey(t) { return t.k; }
function kt(k) {
  if ('dongnanxibeizhongfabai'.includes(k)) return { k, t: 'honor', s: k, v: 0 };
  const sm = { wan: 'wan', tong: 'tong', tiao: 'tiao' };
  const sk = k.slice(0, k.length - 1);
  return { k, t: 'num', s: sm[sk], v: parseInt(k.slice(-1)) };
}

// calcShanten (same as before, with arrow fix)
function calcShanten(hand) {
  const wan = Array(9).fill(0), tong = Array(9).fill(0), tiao = Array(9).fill(0);
  const winds = [0, 0, 0, 0], dragons = [0, 0, 0];
  for (const t of hand) {
    if (t.t === 'num') {
      if (t.s === 'wan') wan[t.v - 1]++;
      else if (t.s === 'tong') tong[t.v - 1]++;
      else tiao[t.v - 1]++;
    } else {
      const wi = { dong: 0, nan: 1, xi: 2, bei: 3 }[t.s],
        di = { zhong: 0, fa: 1, bai: 2 }[t.s];
      if (wi !== undefined) winds[wi]++;
      else if (di !== undefined) dragons[di]++;
    }
  }
  function decNum(cnt, pos, hp, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 120) { let m = 0, t = 0; for (let k = pos; k < 9; k++) if (cnt[k] > 0) { m += Math.floor(cnt[k] / 3); cnt[k] %= 3; if (cnt[k] >= 2) t++; else if (cnt[k] === 1 && k + 1 < 9 && cnt[k + 1] > 0) { t++; cnt[k + 1]--; } } return [m, t, hp || t > 0]; }
    while (pos < 9 && cnt[pos] === 0) pos++;
    if (pos >= 9) return [0, 0, hp];
    let best = [0, 0, false]; const score = r => 2 * r[0] + r[1] + (r[2] ? 1 : 0);
    const r0 = decNum(cnt, pos + 1, hp, depth + 1); if (score(r0) > score(best) || (score(r0) === score(best) && r0[0] > best[0])) best = r0;
    if (cnt[pos] >= 3) { cnt[pos] -= 3; const r = decNum(cnt, pos, hp, depth + 1); if (score([r[0] + 1, r[1], r[2]]) > score(best) || (score([r[0] + 1, r[1], r[2]]) === score(best) && r[0] + 1 > best[0])) best = [r[0] + 1, r[1], r[2]]; cnt[pos] += 3; }
    if (pos <= 6 && cnt[pos] >= 1 && cnt[pos + 1] >= 1 && cnt[pos + 2] >= 1) {
      cnt[pos]--; cnt[pos + 1]--; cnt[pos + 2]--; const r = decNum(cnt, pos, hp, depth + 1);
      if (score([r[0] + 1, r[1], r[2]]) > score(best)) best = [r[0] + 1, r[1], r[2]]; cnt[pos]++; cnt[pos + 1]++; cnt[pos + 2]++;
    }
    if (!hp && cnt[pos] >= 2) { cnt[pos] -= 2; const r = decNum(cnt, pos, true, depth + 1); if (score(r) > score(best) || (score(r) === score(best) && r[0] > best[0])) best = r; cnt[pos] += 2; }
    if (pos <= 7 && cnt[pos] >= 1 && cnt[pos + 1] >= 1) {
      cnt[pos]--; cnt[pos + 1]--; const r = decNum(cnt, pos, hp, depth + 1);
      if (score([r[0], r[1] + 1, r[2]]) > score(best)) best = [r[0], r[1] + 1, r[2]]; cnt[pos]++; cnt[pos + 1]++;
    }
    if (pos <= 6 && cnt[pos] >= 1 && cnt[pos + 2] >= 1) {
      cnt[pos]--; cnt[pos + 2]--; const r = decNum(cnt, pos, hp, depth + 1);
      if (score([r[0], r[1] + 1, r[2]]) > score(best)) best = [r[0], r[1] + 1, r[2]]; cnt[pos]++; cnt[pos + 2]++;
    }
    return best;
  }
  function decHonor(cnt, n, hp, canSeq) {
    function dfs(pos, hp2, depth) {
      if (depth === undefined) depth = 0;
      if (depth > 120) { let m = 0; for (let k = pos; k < n; k++) if (cnt[k] >= 3) { m += Math.floor(cnt[k] / 3); cnt[k] %= 3; } return [m, 0, hp2 || cnt.some(c => c >= 2)]; }
      while (pos < n && cnt[pos] === 0) pos++;
      if (pos >= n) return [0, 0, hp2];
      let best = [0, 0, false]; const score = r => 2 * r[0] + (r[2] ? 1 : 0);
      const r0 = dfs(pos + 1, hp2, depth + 1); if (score(r0) > score(best) || (score(r0) === score(best) && r0[0] > best[0])) best = r0;
      if (cnt[pos] >= 3) { cnt[pos] -= 3; const r = dfs(pos, hp2, depth + 1); if (score([r[0] + 1, 0, r[2]]) > score(best) || (score([r[0] + 1, 0, r[2]]) === score(best) && r[0] + 1 > best[0])) best = [r[0] + 1, 0, r[2]]; cnt[pos] += 3; }
      if (!hp2 && cnt[pos] >= 2) { cnt[pos] -= 2; const r = dfs(pos, true, depth + 1); if (score(r) > score(best) || (score(r) === score(best) && r[0] > best[0])) best = r; cnt[pos] += 2; }
      if (canSeq) { for (const [j, k] of canSeq(pos, cnt)) { cnt[pos]--; cnt[j]--; cnt[k]--; const r = dfs(pos, hp2, depth + 1); if (score([r[0] + 1, 0, r[2]]) > score(best) || (score([r[0] + 1, 0, r[2]]) === score(best) && r[0] + 1 > best[0])) best = [r[0] + 1, 0, r[2]]; cnt[pos]++; cnt[j]++; cnt[k]++; } }
      return best;
    }
    return dfs(0, hp, 0);
  }
  const wr = decHonor(winds, 4, false, (pos, cnt) => { const s = []; for (let j = pos + 1; j < 4; j++) if (cnt[j]) for (let k = j + 1; k < 4; k++) if (cnt[k]) s.push([j, k]); return s; });
  const dr = decHonor(dragons, 3, false, (pos, cnt) => (pos === 0 && cnt[0] && cnt[1] && cnt[2]) ? [[1, 2]] : []);
  if (dr[0] === 0) { const p = dragons.filter(c => c > 0); if (p.length === 2 && p.every(c => c === 1)) dr[1] = 1; else if (p.length >= 2 && dr[2]) { dr[0] = 0; dr[1] = 1; dr[2] = false; } }
  const wr2 = decNum(wan, 0, false), tr = decNum(tong, 0, false), tir = decNum(tiao, 0, false);
  const parts = [wr, dr, wr2, tr, tir];
  let bestScore = 0;
  for (let i = 0; i < parts.length; i++) {
    let melds = 0, taatsu = 0;
    for (let j = 0; j < parts.length; j++) { melds += parts[j][0]; taatsu += parts[j][1]; }
    taatsu = Math.min(taatsu, 4 - melds);
    let total = 2 * melds + taatsu + (parts[i][2] ? 1 : 0);
    if (total > bestScore) bestScore = total;
  }
  return Math.max(0, 8 - bestScore);
}

// ---- ai_engine 完整过滤逻辑 ----
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

function breaksPairTaatsu(h, idx) {
  const t = h[idx];
  if (h.filter(x => teq(x, t)).length !== 2) return false;
  if (t.t === 'num') {
    const s = t.s, v = t.v;
    const sub = h.filter((_, j) => j !== idx);
    if (sub.some(x => x.t === 'num' && x.s === s && (x.v === v - 1 || x.v === v + 1))) return true;
  }
  return false;
}

function meldQuality(h, idx) {
  const t = h[idx]; const sub = h.filter((_, j) => j !== idx);
  if (t.t === 'honor' && ['zhong', 'fa', 'bai'].includes(t.s)) {
    const dorder = ['zhong', 'fa', 'bai']; const di = dorder.indexOf(t.s);
    if (di >= 0) {
      const allThree = dorder.every(d => d === t.s || sub.some(x => x.t === 'honor' && x.s === d));
      if (allThree) return 2;
      const hasOther = dorder.some((d, j) => j !== di && sub.some(x => x.t === 'honor' && x.s === d));
      if (hasOther) return 1;
    }
  }
  if (t.t === 'num') {
    const s = t.s, v = t.v;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1) && sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1)) return 2;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1) && sub.some(x => x.t === 'num' && x.s === s && x.v === v + 2)) return 2;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 2) && sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1)) return 2;
  }
  if (t.t === 'honor') {
    const order = ['dong', 'nan', 'xi', 'bei']; const oi = order.indexOf(t.s);
    if (oi >= 0) {
      const subWinds = sub.filter(x => x.t === 'honor' && order.includes(x.s)).map(x => x.s);
      if (new Set(subWinds).size >= 2) return 2;
    }
  }
  return 3;
}

function isolatedScore(h, idx) {
  const t = h[idx]; let sc = 0;
  if (t.t === 'num') {
    const s = t.s, v = t.v;
    for (const x of h) if (x.t === 'num' && x.s === s) { const d = Math.abs(x.v - v); if (d === 1) sc += 3; else if (d === 2) sc += 2; }
  } else {
    const wkeys = ['dong', 'nan', 'xi', 'bei'], akeys = ['zhong', 'fa', 'bai'];
    for (const x of h) {
      if (x.t === 'honor' && x.s === t.s) sc += 2;
      else if (x.t === 'honor' && wkeys.includes(t.s) && wkeys.includes(x.s)) sc += 1;
      else if (x.t === 'honor' && akeys.includes(t.s) && akeys.includes(x.s)) sc += 1;
    }
  }
  if (h.filter(x => teq(x, t)).length >= 2) sc += 5;
  return sc;
}

// ---- 测试 ----
const handKeys = ['tong7','tong6','tiao5','tong5','tong3','tong2','tiao7','tiao3','tong9','tong2','tiao2','dong','xi','tiao6'];
const hand = handKeys.map(k => kt(k));

console.log('=== 全量候选 shanten ===');
const results = [];
for (let i = 0; i < hand.length; i++) {
  const sub = hand.filter((_, j) => j !== i);
  results.push({ idx: i, tile: handKeys[i], shanten: calcShanten(sub) });
}
results.sort((a, b) => a.shanten - b.shanten);
for (const r of results) console.log(`  [${r.idx}]${r.tile}: shanten=${r.shanten}`);

const bestS = results[0].shanten;
let bestCands = results.filter(r => r.shanten === bestS);
console.log(`\n最佳shanten=${bestS}, 候选:`, bestCands.map(c => `[${c.idx}]${c.tile}`).join(', '));

// 过滤1: 不拆面子 > 不拆对子
const meldB = bestCands.map(c => breaksMeld(hand, c.idx));
const pairB = bestCands.map(c => breaksPair(hand, c.idx));
console.log('\nbreaksMeld:', bestCands.map((c, ci) => `[${c.idx}]${c.tile}=${meldB[ci]}`).join(', '));
console.log('breaksPair:', bestCands.map((c, ci) => `[${c.idx}]${c.tile}=${pairB[ci]}`).join(', '));

const nonMeld = bestCands.filter((_, ci) => !meldB[ci]);
if (nonMeld.length > 0) {
  const np = nonMeld.filter(c => !pairB[bestCands.findIndex(x => x.idx === c.idx)]);
  if (np.length > 0) { bestCands = np; console.log('-> np后:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', ')); }
  else { bestCands = nonMeld; console.log('-> nonMeld后:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', ')); }
} else {
  const np2 = bestCands.filter((_, ci) => !pairB[ci]);
  if (np2.length > 0) { bestCands = np2; console.log('-> np2后:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', ')); }
}

// 过滤2: 不拆 pair-taatsu
if (bestCands.length > 1) {
  const ptB = bestCands.map(c => breaksPairTaatsu(hand, c.idx));
  console.log('breaksPairTaatsu:', bestCands.map((c, ci) => `[${c.idx}]${c.tile}=${ptB[ci]}`).join(', '));
  const nonPT = bestCands.filter((_, ci) => !ptB[ci]);
  if (nonPT.length > 0) { bestCands = nonPT; console.log('-> nonPT后:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', ')); }
}

// 过滤3: 对子保留
if (bestCands.length > 1) {
  const pairCnt = bestCands.map(c => hand.filter(x => teq(x, hand[c.idx])).length);
  console.log('对子计数:', bestCands.map((c, ci) => `[${c.idx}]${c.tile}=${pairCnt[ci]}`).join(', '));
  const nonPB = bestCands.filter((_, ci) => pairCnt[ci] < 2);
  if (nonPB.length > 0) { bestCands = nonPB; console.log('-> 对子保留后:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', ')); }
}

// 过滤4: meldQuality
if (bestCands.length > 1) {
  const qualities = bestCands.map(c => meldQuality(hand, c.idx));
  console.log('meldQuality:', bestCands.map((c, ci) => `[${c.idx}]${c.tile}=${qualities[ci]}`).join(', '));
  const minQ = Math.min(...qualities);
  const bq = bestCands.filter((_, ci) => qualities[ci] === minQ);
  if (bq.length < bestCands.length) { bestCands = bq; console.log('-> quality后:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', ')); }
}

// 过滤5: 孤张评分
if (bestCands.length > 1) {
  const iso = bestCands.map(c => isolatedScore(hand, c.idx));
  console.log('isolatedScore:', bestCands.map((c, ci) => `[${c.idx}]${c.tile}=${iso[ci]}`).join(', '));
  const maxI = Math.max(...iso);
  const bi = bestCands.filter((_, ci) => iso[ci] === maxI);
  if (bi.length < bestCands.length) { bestCands = bi; console.log('-> iso后:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', ')); }
}

console.log('\n=== 最终选择 ===');
console.log('弃牌:', bestCands.map(c => `${c.tile}`).join(' / '));
