// 测试 game 2026-6-2_20-01-06 turn 6
const fs = require('fs');

function kt(k) {
  if ('dongnanxibeizhongfabai'.includes(k)) return { k, t: 'honor', s: k, v: 0 };
  const sm = { wan: 'wan', tong: 'tong', tiao: 'tiao' };
  const sk = k.slice(0, k.length - 1);
  return { k, t: 'num', s: sm[sk], v: parseInt(k.slice(-1)) };
}

// ---- calcShanten (完整版) ----
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

// ---- 测试 ----
const handKeys = ['tong7','tong6','tiao5','tong5','tong3','tong2','tiao7','tiao3','tong9','tong2','tiao2','dong','xi','tiao6'];
const hand = handKeys.map(k => kt(k));

console.log('=== 手牌 (14张) ===');
console.log('筒:', 'tong2×2,tong3,tong5,tong6,tong7,tong9');
console.log('条:', 'tiao2,tiao3,tiao5,tiao6,tiao7');
console.log('风:', 'dong,xi');
console.log('');

console.log('=== calcShanten 逐个弃牌对比 ===');
const results = [];
for (let i = 0; i < hand.length; i++) {
  const sub = hand.filter((_, j) => j !== i);
  const s = calcShanten(sub);
  results.push({ idx: i, tile: handKeys[i], shanten: s });
}

const bestShanten = Math.min(...results.map(r => r.shanten));
const bestCands = results.filter(r => r.shanten === bestShanten);

// Show key candidates
for (const r of results) {
  if (['dong', 'xi', 'tong3', 'tong9', 'tong2', 'tiao2', 'tiao3'].includes(r.tile))
    console.log(`  弃${r.tile}[${r.idx}]: shanten=${r.shanten}`);
}

console.log(`\n最佳向听数: ${bestShanten}`);
console.log('最佳候选:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', '));

// 关键对比
const dongS = results.find(r => r.tile === 'dong');
const tong3S = results.find(r => r.tile === 'tong3');
const tong9S = results.find(r => r.tile === 'tong9');
console.log(`\n关键对比: dong=${dongS.shanten}, tong3=${tong3S.shanten}, tong9=${tong9S.shanten}`);
