// ============================================================
// 万年麻将 AI 引擎
// 染手偏向判定 + 弃牌决策编排（规则 / MCTS / RL 统一入口）
// ============================================================

// 染手偏向判定：清一色/混一色/半清方向（含现张感知）
function suitBias(hand) {
  const cnt = { wan: 0, tong: 0, tiao: 0 }; let honorCnt = 0;
  for (const t of hand) {
    if (t.t === 'honor') honorCnt++;
    else if (t.t === 'num') cnt[t.s]++;
  }
  const e = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const topSuit = e[0][0], topNum = e[0][1];
  const mixed = topNum + honorCnt;

  // 计算该花色剩余可摸张数（wall中 + 对手手牌中）
  function suitRemaining(suit) {
    let seen = 0;
    for (let pi = 0; pi < 4; pi++) {
      const pl = GS.players[pi]; if (!pl) continue;
      for (const t of pl.hand) { if (t.t === 'num' && t.s === suit) seen++; }
      for (const m of (pl.melds || [])) {
        if (m.tile && m.tile.t === 'num' && m.tile.s === suit) {
          seen += (m.type === 'gang' || m.type === 'an_gang') ? 4 : 3;
        }
      }
      for (const d of (GS.playerDiscards[pi] || [])) {
        if (d.t === 'num' && d.s === suit) seen++;
      }
    }
    // wall中还有实际可摸的
    const wallInSuit = GS.wall.filter(k => {
      if (typeof k !== 'string') return false;
      const t = { k: k, t: "dongnanxibeizhongfabai".includes(k) ? "honor" : "num" };
      if (t.t !== 'num') return false;
      return k.startsWith(suit);
    }).length;
    return wallInSuit; // 墙中可摸的数量
  }

  // 计算该花色牌的质量：非孤张（有相邻牌）占比
  function suitQuality(suit) {
    const suitTiles = hand.filter(t => t.t === 'num' && t.s === suit);
    if (suitTiles.length <= 1) return 0;
    let connected = 0;
    for (const t of suitTiles) {
      const v = t.v;
      const hasAdj = suitTiles.some(x => Math.abs(x.v - v) === 1 || Math.abs(x.v - v) === 2);
      if (hasAdj) connected++;
    }
    return connected / suitTiles.length;
  }

  let resultType = 'none';
  if (topNum >= 10) resultType = 'clear';
  else if (mixed >= 10 && topNum >= 5) resultType = 'mixed';
  else if (topNum >= 8) resultType = 'semi-clear';
  else if (mixed >= 7 && mixed < 10 && topNum >= 4) resultType = 'mixed-lean';

  // 现张感知降级
  if (resultType !== 'none') {
    const remaining = suitRemaining(topSuit);
    const quality = suitQuality(topSuit);

    if (remaining < 8) {
      resultType = 'none'; // 花色已枯，放弃染手
    } else if (remaining < 12) {
      if (resultType === 'clear') resultType = 'semi-clear';
      else if (resultType === 'semi-clear') resultType = 'mixed-lean';
      else if (resultType === 'mixed') resultType = 'mixed-lean';
    }

    if (quality < 0.4 && resultType !== 'none') {
      if (resultType === 'clear') resultType = 'semi-clear';
      else if (resultType === 'semi-clear' || resultType === 'mixed') resultType = 'mixed-lean';
    }
  }

  return { suit: topSuit, count: topNum, type: resultType };
}

// --- 面子/对子检测工具（全局可见，供 MCTS/RL 路径共用）---

function breaksMeld(h, idx) {
  const t = h[idx];
  const sub = h.filter((_, j) => j !== idx);
  if (h.filter(x => teq(x, t)).length >= 3) return true;
  if (t.t === 'num') {
    const s = t.s, v = t.v;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1)
      && sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1)) return true;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1)
      && sub.some(x => x.t === 'num' && x.s === s && x.v === v + 2)) return true;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 2)
      && sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1)) return true;
  }
  if (t.t === 'honor') {
    const order = ['dong', 'nan', 'xi', 'bei'];
    const oi = order.indexOf(t.s);
    if (oi >= 0) {
      const subWinds = sub.filter(x => x.t === 'honor' && order.includes(x.s)).map(x => x.s);
      if (new Set(subWinds).size === 2 && !subWinds.includes(t.s)) return true;
    }
    const dorder = ['zhong', 'fa', 'bai'];
    const di = dorder.indexOf(t.s);
    if (di >= 0) {
      const subArrows = sub.filter(x => x.t === 'honor' && dorder.includes(x.s)).map(x => x.s);
      if (new Set(subArrows).size === 2 && !subArrows.includes(t.s)) return true;
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
  const cnt = h.filter(x => teq(x, t)).length;
  if (cnt !== 2) return false;
  if (t.t !== 'num') return false;
  const s = t.s, v = t.v;
  const others = h.filter((_, j) => j !== idx);
  if (others.some(x => x.t === 'num' && x.s === s && (x.v === v - 1 || x.v === v + 1))) return true;
  if (others.some(x => x.t === 'num' && x.s === s && (x.v === v - 2 || x.v === v + 2))) return true;
  return false;
}

// --- 综合向听数 ---

function bestShanten(hand) {
  return Math.min(calcShanten(hand), calcShanten7Pairs(hand),
    calcShantenDalan(hand), calcShantenZhengzong(hand), calcShantenBanzhengzong(hand));
}

// 统计不重复的对子数
function countUniquePairs(hand) {
  const cnt = {};
  for (const t of hand) {
    const k = tkey(t);
    cnt[k] = (cnt[k] || 0) + 1;
  }
  let pairs = 0;
  for (const k in cnt) {
    if (cnt[k] >= 2) pairs++;
  }
  return pairs;
}

// 统计某张牌已出现的数量（手牌+副露+弃牌堆）
function countSeen(suit, value) {
  const k = suit + value;
  let seen = 0;
  for (let pi = 0; pi < 4; pi++) {
    const pl = GS.players[pi];
    if (!pl) continue;
    for (const t of pl.hand) if (tkey(t) === k) seen++;
    for (const m of (pl.melds || [])) {
      if (tkey(m.tile) === k) seen += (m.count === 4 ? 3 : m.count);
    }
    for (const d of (GS.playerDiscards[pi] || [])) if (tkey(d) === k) seen++;
  }
  return seen;
}

// --- 弃牌决策主入口 ---

// 路线锁定状态（存储在 GS 上跨回合持久）
function initRouteLock(playerIdx) {
  if (!GS._routeLock) GS._routeLock = {};
  if (!GS._routeLock[playerIdx]) GS._routeLock[playerIdx] = { path: null, shanten: 99, unchanged: 0 };
}
function lockRoute(playerIdx, path, shanten) {
  initRouteLock(playerIdx);
  GS._routeLock[playerIdx] = { path, shanten, unchanged: 0 };
}
function unlockIfStuck(playerIdx, currentShanten, currentPath) {
  initRouteLock(playerIdx);
  const lk = GS._routeLock[playerIdx];
  if (!lk.path) return false;
  // 同一路线且向听未改善则计数
  if (lk.path === currentPath && currentShanten >= lk.shanten) {
    lk.unchanged++;
    if (lk.unchanged >= 2) { lk.path = null; return true; }
  } else {
    lk.shanten = Math.min(lk.shanten, currentShanten);
    lk.unchanged = 0;
  }
  return false;
}

// 路线可行性检查：该路线关键牌是否已绝张
function routeFeasible(route, hand, excludeIdx) {
  if (route === 'dalan') {
    // 打烂路线：需要全不靠。检查手牌花色分布
    const sub = hand.filter((_, j) => j !== excludeIdx);
    const suits = { wan: [], tong: [], tiao: [] };
    for (const t of sub) {
      if (t.t === 'num') suits[t.s].push(t.v);
    }
    // 检查每个花色中是否有足够间隔的牌
    for (const [s, vs] of Object.entries(suits)) {
      if (vs.length === 0) continue;
      vs.sort((a, b) => a - b);
      for (let j = 1; j < vs.length; j++) {
        if (vs[j] - vs[j-1] < 3) return false; // 间隔不够
      }
    }
    return true;
  }
  if (route === 'quanzheng' || route === 'banzheng') {
    // 正宗路线：需要同色连续。检查关键同色牌是否已绝
    const sub = hand.filter((_, j) => j !== excludeIdx);
    const numTiles = sub.filter(t => t.t === 'num');
    const suitCnt = {};
    for (const t of numTiles) suitCnt[t.s] = (suitCnt[t.s] || 0) + 1;
    const mainSuit = Object.entries(suitCnt).sort((a, b) => b[1] - a[1])[0];
    if (!mainSuit) return false;
    // 墙中该花色剩余
    const wallInSuit = GS.wall.filter(k => k.startsWith(mainSuit[0])).length;
    return wallInSuit >= 10; // 正宗需要较多同花色牌
  }
  return true;
}

function aiChooseDiscard(hand, playerIdx) {
  const effHand = effectiveHand(playerIdx);
  initRouteLock(playerIdx);

  // 规则基础结果（向听数优先，供 MCTS/RL 参考）
  let _ruleCand = -1, _ruleShanten = 999;
  {
    let _bs = Infinity;
    for (let _i = 0; _i < hand.length; _i++) {
      const _sub = effHand.filter((_, _j) => _j !== _i);
      const _s = Math.min(calcShanten(_sub), calcShanten7Pairs(_sub),
        calcShantenDalan(_sub), calcShantenZhengzong(_sub), calcShantenBanzhengzong(_sub));
      if (_s < _bs ||
        (_s === _bs && !breaksMeld(hand, _i) && !breaksPair(hand, _i) &&
          (breaksMeld(hand, _ruleCand) || breaksPair(hand, _ruleCand))) ||
        (_s === _bs && !breaksPair(hand, _i) && breaksPair(hand, _ruleCand) &&
          !breaksMeld(hand, _ruleCand) && !breaksMeld(hand, _i))) {
        _bs = _s; _ruleCand = _i; _ruleShanten = _s;
      }
    }
  }

  // MCTS 路径
  if (window.MCTS && MCTS.useMCTS) {
    const idx = MCTS.chooseDiscard(hand, playerIdx, GS);
    if (idx >= 0 && idx < hand.length) {
      if (breaksMeld(hand, idx) || breaksPair(hand, idx)) {
        const subMCTS = effHand.filter((_, j) => j !== idx);
        const mctsShanten = calcShanten(subMCTS);
        let bestAlt = -1, bestAltS = Infinity;
        for (let i = 0; i < hand.length; i++) {
          if (i === idx) continue;
          if (!breaksMeld(hand, i) && !breaksPair(hand, i)) {
            const sub = effHand.filter((_, j) => j !== i);
            const s = calcShanten(sub);
            if (s < bestAltS) { bestAltS = s; bestAlt = i; }
          }
        }
        if (bestAlt < 0) {
          for (let i = 0; i < hand.length; i++) {
            if (i === idx) continue;
            if (!breaksMeld(hand, i)) {
              const sub = effHand.filter((_, j) => j !== i);
              const s = calcShanten(sub);
              if (s < bestAltS) { bestAltS = s; bestAlt = i; }
            }
          }
        }
        if (bestAlt >= 0 && bestAltS <= mctsShanten + 1) {
          if (bestAltS <= _ruleShanten) {
            hand._rlOldShanten = calcShanten(effHand); return bestAlt;
          }
        }
      }
      const _mctsS = calcShanten(effHand.filter((_, _j) => _j !== idx));
      if (_mctsS <= _ruleShanten) { hand._rlOldShanten = calcShanten(effHand); return idx; }
      if (_ruleCand >= 0) { hand._rlOldShanten = calcShanten(effHand); return _ruleCand; }
      hand._rlOldShanten = calcShanten(effHand); return idx;
    }
  }

  // RL 路径
  if (window.RL && RL.useRL && RL.agents[playerIdx]) {
    const idx = RL.chooseDiscard(hand, playerIdx, GS);
    if (idx >= 0 && idx < hand.length) {
      if (breaksMeld(hand, idx) || breaksPair(hand, idx)) {
        const subRL = effHand.filter((_, j) => j !== idx);
        const rlShanten = calcShanten(subRL);
        let bestAlt = -1, bestAltS = Infinity;
        for (let i = 0; i < hand.length; i++) {
          if (i === idx) continue;
          if (!breaksMeld(hand, i) && !breaksPair(hand, i)) {
            const sub = effHand.filter((_, j) => j !== i);
            const s = calcShanten(sub);
            if (s < bestAltS) { bestAltS = s; bestAlt = i; }
          }
        }
        if (bestAlt < 0) {
          for (let i = 0; i < hand.length; i++) {
            if (i === idx) continue;
            if (!breaksMeld(hand, i)) {
              const sub = effHand.filter((_, j) => j !== i);
              const s = calcShanten(sub);
              if (s < bestAltS) { bestAltS = s; bestAlt = i; }
            }
          }
        }
        if (bestAlt >= 0 && bestAltS <= rlShanten + 1) {
          if (bestAltS <= _ruleShanten) {
            hand._rlOldShanten = calcShanten(effHand); return bestAlt;
          }
        }
      }
      const _rlS = calcShanten(effHand.filter((_, _j) => _j !== idx));
      if (_rlS <= _ruleShanten) { hand._rlOldShanten = calcShanten(effHand); return idx; }
      if (_ruleCand >= 0) { hand._rlOldShanten = calcShanten(effHand); return _ruleCand; }
      hand._rlOldShanten = calcShanten(effHand); return idx;
    }
  }

  // 规则路径
  {
    // 路线锁定检查
    const lk = GS._routeLock[playerIdx];
    let lockedPath = null;
    if (lk.path && lk.shanten <= 1) lockedPath = lk.path;

    let bestShantenVal = Infinity, bestCands = [], subHands = [], bestPaths = [];
    const pairCount = (() => { const c = {}; for (const t of hand) c[t.k] = (c[t.k] || 0) + 1; let p = 0; for (const v of Object.values(c)) if (v >= 2) p++; return p; })();
    for (let i = 0; i < hand.length; i++) {
      const sub = effHand.filter((_, j) => j !== i);
      const sN = calcShanten(sub);
      const s7 = calcShanten7Pairs(sub);
      const sD = calcShantenDalan(sub);
      const sZ = calcShantenZhengzong(sub);
      const sBZ = calcShantenBanzhengzong(sub);
      const _pc7 = (function () { const c = {}; for (const t of sub) c[t.k] = (c[t.k] || 0) + 1; let p = 0; for (const v of Object.values(c)) if (v >= 2) p++; return p; })();
      const s7c = _pc7 < 3 ? s7 + 2 : _pc7 === 3 ? s7 + 1 : s7;

      // 路线可行性惩罚：关键牌已绝张则惩罚
      let sDF = sD, sZF = sZ, sBZF = sBZ;
      if (sD <= 3) { if (!routeFeasible('dalan', hand, i)) sDF += 2; }
      if (sZ <= 3) { if (!routeFeasible('quanzheng', hand, i)) sZF += 2; }
      if (sBZ <= 3) { if (!routeFeasible('banzheng', hand, i)) sBZF += 2; }

      const sAll = [{ p: 'norm', v: sN }, { p: '7p', v: s7c }, { p: 'dalan', v: sDF }, { p: 'quanzheng', v: sZF }, { p: 'banzheng', v: sBZF }];
      sAll.sort((a, b) => a.v - b.v);

      // 锁定路线优先
      let s, path;
      if (lockedPath) {
        const locked = sAll.find(x => x.p === lockedPath);
        if (locked && locked.v <= bestShantenVal + 2) {
          s = locked.v; path = locked.p;
        } else {
          s = sAll[0].v; path = sAll[0].p;
          unlockIfStuck(playerIdx, s, path);
        }
      } else {
        s = sAll[0].v; path = sAll[0].p;
      }

      if (path === '7p' && hand.filter(x => teq(x, hand[i])).length === 2) s += 20;
      if (path === 'norm' && pairCount <= 2 && hand.filter(x => teq(x, hand[i])).length === 2) s += 1;
      if (s < bestShantenVal) { bestShantenVal = s; bestCands = [i]; subHands = [sub]; bestPaths = [path]; }
      else if (s === bestShantenVal) { bestCands.push(i); subHands.push(sub); bestPaths.push(path); }
    }

    // 路线锁定：向听≤1 时锁定
    if (bestShantenVal <= 1 && bestCands.length > 0) {
      const topPath = bestPaths[0];
      if (!GS._routeLock[playerIdx].path || GS._routeLock[playerIdx].shanten > 1) {
        lockRoute(playerIdx, topPath, bestShantenVal);
      }
    }

    // 唯一候选拆面子/对子时：放宽向听数+1寻求替代
    if (bestCands.length === 1) {
      const curSub = subHands[0];
      const curS = calcShanten(curSub);
      if (breaksMeld(hand, bestCands[0]) || breaksPair(hand, bestCands[0])) {
        let bestAlt = -1, bestAltS = Infinity;
        for (let i = 0; i < hand.length; i++) {
          if (i === bestCands[0]) continue;
          if (!breaksMeld(hand, i) && !breaksPair(hand, i)) {
            const sub = effHand.filter((_, j) => j !== i);
            const s = calcShanten(sub);
            if (s < bestAltS) { bestAltS = s; bestAlt = i; }
          }
        }
        if (bestAlt < 0) {
          for (let i = 0; i < hand.length; i++) {
            if (i === bestCands[0]) continue;
            if (!breaksMeld(hand, i)) {
              const sub = effHand.filter((_, j) => j !== i);
              const s = calcShanten(sub);
              if (s < bestAltS) { bestAltS = s; bestAlt = i; }
            }
          }
        }
        if (bestAlt >= 0 && bestAltS <= curS + 1) {
          hand._rlOldShanten = calcShanten(effHand);
          return bestAlt;
        }
      }
      return bestCands[0];
    }

    // 优先级过滤：不拆面子 > 不拆对子 > 不拆搭子+对子
    const origCands = [...bestCands];
    const meldB = bestCands.map(i => breaksMeld(hand, i));
    const pairB = bestCands.map(i => breaksPair(hand, i));
    const nonMeld = bestCands.filter((_, ci) => !meldB[ci]);
    if (nonMeld.length > 0) {
      const np = nonMeld.filter(i => !pairB[origCands.indexOf(i)]);
      if (np.length > 0) {
        bestCands = np; subHands = np.map(i => subHands[origCands.indexOf(i)]); bestPaths = np.map(i => bestPaths[origCands.indexOf(i)]);
      } else {
        bestCands = nonMeld; subHands = nonMeld.map(i => subHands[origCands.indexOf(i)]); bestPaths = nonMeld.map(i => bestPaths[origCands.indexOf(i)]);
      }
    } else {
      const np2 = bestCands.filter((_, ci) => !pairB[ci]);
      if (np2.length > 0) {
        bestCands = np2; subHands = np2.map(i => subHands[origCands.indexOf(i)]); bestPaths = np2.map(i => bestPaths[origCands.indexOf(i)]);
      }
    }
    if (bestCands.length > 1) {
      const ptB = bestCands.map(i => breaksPairTaatsu(hand, i));
      const nonPT = bestCands.filter((_, ci) => !ptB[ci]);
      if (nonPT.length > 0) {
        bestCands = nonPT; subHands = nonPT.map(i => subHands[origCands.indexOf(i)]); bestPaths = nonPT.map(i => bestPaths[origCands.indexOf(i)]);
      }
    }

    // 对子保留
    if (bestCands.length > 1) {
      const pairCnt = bestCands.map(i => hand.filter(x => teq(x, hand[i])).length);
      const nonPB = bestCands.filter((_, ci) => pairCnt[ci] < 2);
      if (nonPB.length > 0) { bestCands = nonPB; }
    }

    // 四连型保护：不拆同花色连续四张
    if (bestCands.length > 1) {
      function isInFourConsecutive(h, idx) {
        const t = h[idx];
        if (t.t !== 'num') return false;
        const set = new Set(h.filter(x => x.t === 'num' && x.s === t.s).map(x => x.v));
        const v = t.v;
        return [[v-3,v-2,v-1,v],[v-2,v-1,v,v+1],[v-1,v,v+1,v+2],[v,v+1,v+2,v+3]]
          .some(run => run.every(n => n >= 1 && n <= 9 && set.has(n)));
      }
      const fc = bestCands.map(i => isInFourConsecutive(hand, i));
      const nonFC = bestCands.filter((_, ci) => !fc[ci]);
      if (nonFC.length > 0) bestCands = nonFC;
    }

    // 五对七对路线锁定：pairCount >= 5 且七对向听不差于面子手+1 时，不拆对子
    if (bestCands.length > 1) {
      const pc5 = countUniquePairs(hand);
      const s7p = typeof calcShanten7p === 'function' ? calcShanten7p(hand) : 99;
      if (pc5 >= 5 && s7p <= bestShantenVal + 1) {
        const nonPairCands = bestCands.filter(i => {
          const cnt = hand.filter(x => teq(x, hand[i])).length;
          return cnt < 2;
        });
        if (nonPairCands.length > 0) bestCands = nonPairCands;
      }
    }

    // 面子质量排序
    if (bestCands.length > 1) {
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
      const qualities = bestCands.map(i => meldQuality(hand, i));
      const minQ = Math.min(...qualities);
      const bq = bestCands.filter((_, ci) => qualities[ci] === minQ);
      if (bq.length > 0 && bq.length < bestCands.length) bestCands = bq;
    }

    // 拆搭损失评估：选损失进张最少的搭子拆
    if (bestCands.length > 1) {
      function waitLoss(h, idx) {
        const t = h[idx];
        if (t.t !== 'num') return 99;
        const s = t.s, v = t.v;
        const sub = h.filter((_, j) => j !== idx);
        let waits = 0;
        for (const x of sub) {
          if (x.t === 'num' && x.s === s) {
            const d = x.v - v;
            if (d === -1) waits += (4 - countSeen(s, v+1));
            else if (d === 1) waits += (4 - countSeen(s, v-1));
            else if (d === -2) waits += (4 - countSeen(s, v-1));
            else if (d === 2) waits += (4 - countSeen(s, v+1));
          }
        }
        return waits;
      }
      const losses = bestCands.map(i => waitLoss(hand, i));
      const minLoss = Math.min(...losses);
      const lowLoss = bestCands.filter((_, ci) => losses[ci] === minLoss);
      if (lowLoss.length > 0 && lowLoss.length < bestCands.length) bestCands = lowLoss;
    }

    // 孤张评分
    if (bestCands.length > 1) {
      function isolatedScore(h, idx) {
        const t = h[idx]; let sc = 0;
        if (t.t === 'num') { const s = t.s, v = t.v; for (const x of h) if (x.t === 'num' && x.s === s) { const d = Math.abs(x.v - v); if (d === 1) sc += 3; else if (d === 2) sc += 2; } }
        else {
          const wkeys = ['dong','nan','xi','bei'], akeys = ['zhong','fa','bai'];
          for (const x of h) {
            if (x.t === 'honor' && x.s === t.s) sc += 2;
            else if (x.t === 'honor' && wkeys.includes(t.s) && wkeys.includes(x.s)) sc += 3;
            else if (x.t === 'honor' && akeys.includes(t.s) && akeys.includes(x.s)) sc += 3;
          }
        }
        if (h.filter(x => teq(x, t)).length >= 2) sc += 5;
        return sc;
      }
      const iso = bestCands.map(i => isolatedScore(hand, i));
      const minI = Math.min(...iso);
      const bi = bestCands.filter((_, ci) => iso[ci] === minI);
      if (bi.length > 0 && bi.length < bestCands.length) bestCands = bi;
    }

    // 时机权重：早期弃中间搭子，晚期保中间搭子（必须在结构评估之后）
    if (bestCands.length > 1) {
      const phase2 = GS.turn <= 24 ? 'early' : GS.turn <= 48 ? 'mid' : 'late';
      if (phase2 === 'early') {
        const midCands = bestCands.filter(i => {
          const t = hand[i];
          return t.t === 'num' && t.v >= 3 && t.v <= 7;
        });
        if (midCands.length > 0 && midCands.length < bestCands.length) {
          bestCands = midCands;
        }
      } else if (phase2 === 'late') {
        const nonEdge = bestCands.filter(i => {
          const t = hand[i];
          return t.t === 'num' && (t.v >= 3 && t.v <= 7);
        });
        if (nonEdge.length > 0 && nonEdge.length < bestCands.length) {
          bestCands = nonEdge;
        }
      }
    }

    // 雀头状态感知：有将弃边张，无将保中张
    if (bestCands.length > 1) {
      const pairCount = countUniquePairs(hand);
      if (pairCount === 1) {
        const edgeCands = bestCands.filter(i => {
          const t = hand[i];
          return t.t === 'num' && (t.v === 1 || t.v === 9);
        });
        if (edgeCands.length > 0 && edgeCands.length < bestCands.length) {
          bestCands = edgeCands;
        }
      } else if (pairCount === 0) {
        const nonMid = bestCands.filter(i => {
          const t = hand[i];
          return t.t === 'honor' || (t.t === 'num' && (t.v <= 2 || t.v >= 8));
        });
        if (nonMid.length > 0 && nonMid.length < bestCands.length) {
          bestCands = nonMid;
        }
      }
    }

    // 假搭子检测
    if (bestCands.length > 1) {
      function remainingCount(k) { let r = 4; for (let pi = 0; pi < 4; pi++) { const pl = GS.players[pi]; if (!pl) continue; for (const t of pl.hand) if (tkey(t) === k) r--; for (const m of (pl.melds || [])) { const mk = tkey(m.tile); const c = m.count === 4 ? 3 : m.count; if (mk === k) r -= c; } for (const d of (GS.playerDiscards[pi] || [])) if (tkey(d) === k) r--; } return Math.max(0, r); }
      function hasDeadTaatsu(hnd) {
        const cnt = {}; for (const t of hnd) cnt[tkey(t)] = (cnt[tkey(t)] || 0) + 1;
        for (const t of hnd) {
          if (t.t !== 'num') continue;
          const k = tkey(t), v = t.v;
          if (cnt[k] >= 3) continue;
          if (cnt[k] === 2) { if (remainingCount(k) <= 1) return true; continue; }
          if (cnt[k] === 1 && v <= 7) { const n1 = v + 1 + '', n2 = v + 2 + ''; if (cnt[t.s + n1] && remainingCount(t.s + n2) <= 1) return true; if (cnt[t.s + n2] && remainingCount(t.s + n1) <= 1) return true; }
          if (cnt[k] === 1 && v >= 2 && v <= 8) { const n1 = v - 1 + '', n2 = v + 1 + ''; if (cnt[t.s + n1] && cnt[t.s + n2] && remainingCount(t.s + v) <= 1) return true; }
          if (cnt[k] === 1 && v <= 2) { if (cnt[t.s + '2'] && remainingCount(t.s + '3') <= 1) return true; if (cnt[t.s + '1'] && cnt[t.s + '3'] && remainingCount(t.s + '2') <= 1) return true; }
          if (cnt[k] === 1 && v >= 8) { if (cnt[t.s + '8'] && remainingCount(t.s + '7') <= 1) return true; if (cnt[t.s + '9'] && cnt[t.s + '7'] && remainingCount(t.s + '8') <= 1) return true; }
        }
        return false;
      }
      const deadFlags = bestCands.map(i => { const sub = effHand.filter((_, j) => j !== i); return hasDeadTaatsu(sub); });
      const aliveCands = bestCands.filter((_, ci) => !deadFlags[ci]);
      if (aliveCands.length > 0) bestCands = aliveCands;
    }

    // 安全度加权（渐进混合）
    const danger = typeof dangerLevel === 'function' ? dangerLevel(playerIdx) : 0;
    const phase = GS.turn <= 24 ? 'early' : GS.turn <= 48 ? 'mid' : 'late';
    const risk = typeof riskTolerance === 'function' ? riskTolerance(playerIdx, GS) : 0.5;
    // 渐进式：danger 0→4 时防御权重 1x→3x 平滑过渡
    const semiFoldSafeW = (1 - risk) * 10 * (1 + danger / 2);

    // 完全弃和（门槛提高）
    const fullFold = (danger >= 2.5 && bestShantenVal >= 3) || (danger >= 1.5 && bestShantenVal >= 4);
    if (fullFold) {
      let safestIdx = bestCands[0], safest = 0;
      bestCands.forEach(i => {
        let sc = typeof defenseScore === 'function' ? defenseScore(hand[i], playerIdx) : 0;
        if (hand[i].t === 'honor') sc += 3;
        else if (hand[i].v === 1 || hand[i].v === 9) sc += 2;
        if (sc > safest) { safest = sc; safestIdx = i; }
      });
      if (safest < 8) {
        let globalSafest = safestIdx, globalBest = safest;
        for (let i = 0; i < hand.length; i++) {
          if (bestCands.includes(i)) continue;
          if (breaksMeld(hand, i) || breaksPair(hand, i)) continue;
          let sc = typeof defenseScore === 'function' ? defenseScore(hand[i], playerIdx) : 0;
          if (hand[i].t === 'honor') sc += 4;
          else if (hand[i].v === 1 || hand[i].v === 9) sc += 3;
          if (sc > globalBest) { globalBest = sc; globalSafest = i; }
        }
        if (globalBest > safest + 2) safestIdx = globalSafest;
      }
      return safestIdx;
    }

    // 听牌阶段
    if (bestShantenVal === 0) {
      let bestScore = -Infinity, bestIdx = bestCands[0];
      bestCands.forEach((i, ci) => {
        const p = bestPaths[ci]; let w = 0;
        if (p === 'norm' || p === '7p') { const eff = [...effectiveHand(playerIdx), ...subHands[ci]]; w = countWaits(eff, playerIdx); }
        const s = typeof defenseScore === 'function' ? defenseScore(hand[i], playerIdx) : 0;
        const score = w + semiFoldSafeW * s;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      });
      return bestIdx;
    }

    // 未听牌：搭子质量 + 安全度 + 染手偏向
    const bias = suitBias(hand);
    let bestScore = -Infinity, bestIdx = bestCands[0];
    bestCands.forEach((i, ci) => {
      let q;
      const p = bestPaths[ci];
      if (p === 'dalan') q = typeof dalanDiscardScore === 'function' ? dalanDiscardScore(hand[i], subHands[ci]) : 0;
      else if (p === 'quanzheng') q = (typeof dalanDiscardScore === 'function' ? dalanDiscardScore(hand[i], subHands[ci]) : 0) + (typeof zhengzongDiscardBonus === 'function' ? zhengzongDiscardBonus(hand[i], subHands[ci]) : 0);
      else if (p === 'banzheng') q = (typeof dalanDiscardScore === 'function' ? dalanDiscardScore(hand[i], subHands[ci]) : 0) + (typeof zhengzongDiscardBonus === 'function' ? zhengzongDiscardBonus(hand[i], subHands[ci]) * 0.5 : 0);
      else q = typeof handPotential === 'function' ? handPotential(subHands[ci]) : 0;
      if (p === '7p') { const origCnt = hand.filter(h => teq(h, hand[i])).length; if (origCnt === 1) q += 4; if (hand[i].t === 'honor' && origCnt === 1) q += 2; }
      if (p === 'norm') {
        if (bias.type === 'clear' && hand[i].t === 'num' && hand[i].s === bias.suit) q -= 6;
        else if (bias.type === 'mixed' && hand[i].t === 'num' && hand[i].s === bias.suit) q -= 6;
        else if (bias.type === 'mixed' && hand[i].t === 'honor') q -= 5;
        else if (bias.type === 'semi-clear' && hand[i].t === 'num' && hand[i].s === bias.suit) q -= 3;
        else if (bias.type === 'mixed-lean' && hand[i].t === 'num' && hand[i].s === bias.suit) q -= 3;
        else if (bias.type === 'mixed-lean' && hand[i].t === 'honor') q -= 2;
      }
      if (p === 'norm' && bias.type === 'none' && hand[i].t === 'honor') { const honorCnt = hand.filter(h => h.t === 'honor').length; if (bias.count >= 4 && honorCnt >= 2) q -= 0.5; }
      if (p === 'norm') {
        const tileCnt = hand.filter(h => teq(h, hand[i])).length;
        if (tileCnt === 2) {
          const isPT = breaksPairTaatsu(hand, i);
          const skipBias = (bias.type === 'clear' || bias.type === 'mixed' || bias.type === 'semi-clear') && hand[i].t === 'num' && hand[i].s !== bias.suit;
          if (!skipBias) {
            if (isPT) q -= 6; else q -= 3;
            if (bias.type === 'mixed') q -= 2;
            if (bias.type === 'mixed-lean' && hand[i].t === 'num' && hand[i].s === bias.suit) q -= 2;
            if (bias.type === 'mixed-lean' && hand[i].t === 'honor') q -= 1;
          }
        }
      }
      const s = typeof defenseScore === 'function' ? defenseScore(hand[i], playerIdx) : 0;
      const score = q + semiFoldSafeW * s;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    return bestIdx;
  }

  // fallback（不应到达）
  let best = 0, bs = Infinity;
  hand.forEach((t, i) => {
    let sc = 1;
    if (t.t === 'honor') sc = 1.5;
    else { if (t.v === 1 || t.v === 9) sc = 2; else if (t.v === 2 || t.v === 8) sc = 2.5; else sc = 3; }
    const same = hand.filter(h => teq(h, t)).length;
    if (same >= 2) sc += 6; if (same >= 3) sc += 12;
    if (t.t === 'num') { if (hand.some(h => h.t === 'num' && h.s === t.s && h.v === t.v + 1)) sc += 4; if (hand.some(h => h.t === 'num' && h.s === t.s && h.v === t.v - 1)) sc += 4; }
    if (t.t === 'honor' && 'dongnanxibei'.includes(t.s)) { const windSet = new Set(hand.filter(h => h.t === 'honor' && 'dongnanxibei'.includes(h.s)).map(h => h.s)); if (windSet.size >= 3) sc += 8; else if (windSet.size >= 2) sc += 4; }
    if (t.t === 'honor' && 'zhongfabai'.includes(t.s)) { const dSet = new Set(hand.filter(h => h.t === 'honor' && 'zhongfabai'.includes(h.s)).map(h => h.s)); if (dSet.size >= 3) sc += 8; else if (dSet.size >= 2) sc += 4; }
    if (sc < bs) { bs = sc; best = i; }
  });
  return best;
}

// --- 副露响应决策 ---

function aiRespond(resp) {
  if (GS.phase !== 'responding') return;
  const t = GS.lastDiscard;
  const p = GS.players[GS.cur];

  for (let r of resp) { if (r.cw) { applyWin(r.p, '点炮'); return; } }

  const curShanten = bestShanten(effectiveHand(GS.cur));
  if (curShanten === 0) { for (let r of resp) { if (!r.ck) continue; const kongHand = simAfterPongKong(p.hand, t, 3); if (bestShanten(kongHand) === 0) { doKong(r.p); return; } } }

  for (let r of resp) {
    if (!r.ck) continue;
    const kongHand = simAfterPongKong(p.hand, t, 3);
    if (bestShanten(kongHand) <= curShanten) { doKong(r.p); return; }
  }

  // 四对好碰牌：pairCount >= 4 时积极碰牌走碰碰胡路线
  const pairCnt4 = countUniquePairs(p.hand);
  if (pairCnt4 >= 4) {
    for (let r of resp) {
      if (!r.cp) continue;
      const hand = simAfterPongKong(p.hand, t, 2);
      const postPairs = countUniquePairs(hand);
      if (postPairs >= 2) { doPong(r.p); return; }
    }
  }

  // 碰牌：向听改善或对子路线
  for (let r of resp) {
    if (!r.cp) continue;
    const hand = simAfterPongKong(p.hand, t, 2);
    const postShanten = Math.max(0, bestShanten(hand) - 2);
    const _dl = typeof dangerLevel === 'function' ? dangerLevel(GS.cur) : 0;
    const _ph = GS.turn <= 24 ? 'early' : GS.turn <= 48 ? 'mid' : 'late';
    // 碰后检查搭子质量：如果形成大量孤张，不碰
    const postNumTiles = hand.filter(x => x.t === 'num');
    let isolated = 0;
    for (const x of postNumTiles) {
      if (!hand.some(y => y.t === 'num' && y.s === x.s && Math.abs(y.v - x.v) <= 2 && y.k !== x.k)) isolated++;
    }
    const qualityOk = isolated < postNumTiles.length * 0.5;
    if (postShanten <= curShanten && qualityOk) { doPong(r.p); return; }
    if (postShanten > curShanten && _dl < 2 && _ph !== 'late' && qualityOk) { doPong(r.p); return; }
  }

  // 吃牌：向听改善 ≥ 1 且不破坏雀头
  for (let r of resp) {
    if (!r.cc) continue;
    const chiHand = [...p.hand.filter(x => !teq(x, t) || p.hand.indexOf(x) !== p.hand.findIndex(y => teq(y, t)))];
    // 简化为：吃后向听降低则吃
    const postS = bestShanten(chiHand);
    if (postS < curShanten) { doChi(r.p); return; }
  }

  nextTurn();
}

function simAfterPongKong(hand, tile, n) {
  const h = [...hand]; let removed = 0;
  for (let i = h.length - 1; i >= 0 && removed < n; i--) {
    if (teq(h[i], tile)) { h.splice(i, 1); removed++; }
  }
  return h;
}

console.log('[ai_engine] loaded');
