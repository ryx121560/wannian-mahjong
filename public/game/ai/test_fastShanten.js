// 测试 fastShanten 箭牌修复
const fs = require('fs');

function kt(k) {
  if ('dongnanxibeizhongfabai'.includes(k)) return { k, t: 'honor', s: k, v: 0 };
  const sm = { wan: 'wan', tong: 'tong', tiao: 'tiao' };
  const sk = k.slice(0, k.length - 1);
  return { k, t: 'num', s: sm[sk], v: parseInt(k.slice(-1)) };
}

// ---- 修复后的 fastShanten ----
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
  let arrowTiles = 0, arrowDistinct = 0;
  for (const a of ['zhong', 'fa', 'bai']) {
    const c = honorCounts[a] || 0;
    arrowTiles += c;
    if (c > 0) arrowDistinct++;
  }
  for (const a of ['zhong', 'fa', 'bai']) {
    const c = honorCounts[a] || 0;
    if (c >= 3) { melds++; arrowTiles -= 3; }
  }
  const arrowMelds = Math.floor(arrowDistinct / 3);
  melds += arrowMelds;
  arrowTiles -= arrowMelds * 3;
  if (arrowTiles >= 2 && arrowDistinct >= 2) { taatsu += 0.8; arrowTiles -= 2; }
  if (arrowTiles === 2) taatsu += 1.5;
  else if (arrowTiles === 1) taatsu += 0.3;
  if (!hasPair) {
    for (const a of ['zhong', 'fa', 'bai']) {
      const c = honorCounts[a] || 0;
      const used = Math.floor(c / 3) * 3;
      if (c - used >= 2) { hasPair = true; break; }
    }
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
  for (const suit of ['wan', 'tong', 'tiao'])
    for (let j = 1; j <= 9; j++) isolated += counts[suit][j];
  const blockTaatsu = Math.min(taatsu, 4 - melds);
  const wastePenalty = isolated * 0.05;
  const blocks = melds + blockTaatsu + (hasPair ? 1 : 0);
  return Math.max(0, 6 - blocks + wastePenalty);
}

// ---- 测试 ----
console.log('=== fastShanten 箭牌修复验证 ===\n');

// Case 1: zhong×2 + bai×1 (原问题手牌去掉其他干扰)
const case1 = ['zhong','zhong','bai'].map(k => kt(k));
console.log('Case 1: zhong×2+bai×1 →', fastShanten(case1, null).toFixed(2));

// Case 2: zhong×1 + bai×1
const case2 = ['zhong','bai'].map(k => kt(k));
console.log('Case 2: zhong×1+bai×1 →', fastShanten(case2, null).toFixed(2));

// Case 3: zhong×3
const case3 = ['zhong','zhong','zhong'].map(k => kt(k));
console.log('Case 3: zhong×3 →', fastShanten(case3, null).toFixed(2));

// Case 4: zhong×2 (only pair)
const case4 = ['zhong','zhong'].map(k => kt(k));
console.log('Case 4: zhong×2 →', fastShanten(case4, null).toFixed(2));

// Case 5: full hand, discard zhong vs tong1
const handKeys = ['tong4','tong5','wan6','zhong','wan8','tong9','tong4','zhong','tong1','bai','tong7','tiao4','tiao2','tiao5'];
const hand = handKeys.map(k => kt(k));
console.log('\nCase 5: 完整手牌去掉各候选后的fastShanten:');
const targets = ['zhong', 'tong1', 'bai'];
for (const t of targets) {
  const idx = handKeys.indexOf(t);
  const sub = hand.filter((_, j) => j !== idx);
  console.log(`  弃${t}: ${fastShanten(sub, null).toFixed(2)}`);
}
