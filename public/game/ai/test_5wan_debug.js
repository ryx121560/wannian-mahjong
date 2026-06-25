// 调试：对家初始手牌为何弃5万
const handKeys = 'bai,tong4,fa,wan6,wan3,wan2,wan2,bai,wan3,bei,wan5,wan8,bai,zhong';

const kt=k=>{
  if('dongnanxibeizhongfabai'.includes(k))return{k,t:'honor',s:k,v:0};
  const sm={wan:'wan',tong:'tong',tiao:'tiao'};
  const sk=k.slice(0,k.length-1);
  return{k,t:'num',s:sm[sk],v:parseInt(k.slice(-1))};
};

const tkey = t => t.k;
const teq = (a,b) => a.t===b.t && a.s===b.s && a.v===b.v;
const hand = handKeys.split(',').map(kt);

// === calcShanten (from actual game code) ===
function analyzeHand(hand){
  const wan=Array(9).fill(0),tong=Array(9).fill(0),tiao=Array(9).fill(0),winds=[0,0,0,0],dragons=[0,0,0];
  for(const t of hand){if(t.t==='num'){if(t.s==='wan')wan[t.v-1]++;else if(t.s==='tong')tong[t.v-1]++;else tiao[t.v-1]++;}else{const wi={dong:0,nan:1,xi:2,bei:3}[t.s],di={zhong:0,fa:1,bai:2}[t.s];if(wi!==undefined)winds[wi]++;else if(di!==undefined)dragons[di]++;}}
  return {wan,tong,tiao,winds,dragons};
}

function calcShanten(hand){
  const a=analyzeHand(hand);
  function decNum(cnt,pos,hp,depth){
    if(depth===undefined)depth=0;
    if(depth>120){let m=0,t=0;for(let k=pos;k<9;k++)if(cnt[k]>0){m+=Math.floor(cnt[k]/3);cnt[k]%=3;if(cnt[k]>=2)t++;else if(cnt[k]===1&&k+1<9&&cnt[k+1]>0){t++;cnt[k+1]--;}}return[m,t,hp||t>0];}
    while(pos<9&&cnt[pos]===0)pos++;
    if(pos>=9)return[0,0,hp];
    let best=[0,0,false];
    const score=r=>2*r[0]+r[1]+(r[2]?1:0);
    const r0=decNum(cnt,pos+1,hp,depth+1);
    if(score(r0)>score(best)||(score(r0)===score(best)&&r0[0]>best[0]))best=r0;
    if(cnt[pos]>=3){cnt[pos]-=3;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0]+1,r[1],r[2]])>score(best)||(score([r[0]+1,r[1],r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,r[1],r[2]];cnt[pos]+=3;}
    if(pos<=6&&cnt[pos]>=1&&cnt[pos+1]>=1&&cnt[pos+2]>=1){cnt[pos]--;cnt[pos+1]--;cnt[pos+2]--;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0]+1,r[1],r[2]])>score(best))best=[r[0]+1,r[1],r[2]];cnt[pos]++;cnt[pos+1]++;cnt[pos+2]++;}
    if(!hp&&cnt[pos]>=2){cnt[pos]-=2;const r=decNum(cnt,pos,true,depth+1);if(score(r)>score(best)||(score(r)===score(best)&&r[0]>best[0]))best=r;cnt[pos]+=2;}
    if(pos<=7&&cnt[pos]>=1&&cnt[pos+1]>=1){cnt[pos]--;cnt[pos+1]--;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0],r[1]+1,r[2]])>score(best))best=[r[0],r[1]+1,r[2]];cnt[pos]++;cnt[pos+1]++;}
    if(pos<=6&&cnt[pos]>=1&&cnt[pos+2]>=1){cnt[pos]--;cnt[pos+2]--;const r=decNum(cnt,pos,hp,depth+1);if(score([r[0],r[1]+1,r[2]])>score(best))best=[r[0],r[1]+1,r[2]];cnt[pos]++;cnt[pos+2]++;}
    return best;
  }
  function decHonor(cnt,n,hp,canSeq){
    function dfs(pos,hp2,depth){
      if(depth===undefined)depth=0;
      if(depth>120){let m=0;for(let k=pos;k<n;k++)if(cnt[k]>=3){m+=Math.floor(cnt[k]/3);cnt[k]%=3;}return[m,0,hp2||cnt.some(c=>c>=2)];}
      while(pos<n&&cnt[pos]===0)pos++;
      if(pos>=n)return[0,0,hp2];
      let best=[0,0,false];
      const score=r=>2*r[0]+(r[2]?1:0);
      const r0=dfs(pos+1,hp2,depth+1);
      if(score(r0)>score(best)||(score(r0)===score(best)&&r0[0]>best[0]))best=r0;
      if(cnt[pos]>=3){cnt[pos]-=3;const r=dfs(pos,hp2,depth+1);if(score([r[0]+1,0,r[2]])>score(best)||(score([r[0]+1,0,r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,0,r[2]];cnt[pos]+=3;}
      if(!hp2&&cnt[pos]>=2){cnt[pos]-=2;const r=dfs(pos,true,depth+1);if(score(r)>score(best)||(score(r)===score(best)&&r[0]>best[0]))best=r;cnt[pos]+=2;}
      if(canSeq){for(const[j,k]of canSeq(pos,cnt)){cnt[pos]--;cnt[j]--;cnt[k]--;const r=dfs(pos,hp2,depth+1);if(score([r[0]+1,0,r[2]])>score(best)||(score([r[0]+1,0,r[2]])===score(best)&&r[0]+1>best[0]))best=[r[0]+1,0,r[2]];cnt[pos]++;cnt[j]++;cnt[k]++;}}
      return best;
    }
    return dfs(0,hp,0);
  }
  const wr=decHonor(a.winds,4,false,(pos,cnt)=>{const s=[];for(let j=pos+1;j<4;j++)if(cnt[j])for(let k=j+1;k<4;k++)if(cnt[k])s.push([j,k]);return s;});
  const dr=decHonor(a.dragons,3,false,(pos,cnt)=>(pos===0&&cnt[0]&&cnt[1]&&cnt[2])?[[1,2]]:[]);
  if(dr[0]===0){const p=a.dragons.filter(c=>c>0);if(p.length===2&&p.every(c=>c===1))dr[1]=1;else if(p.length>=2&&dr[2]){dr[0]=0;dr[1]=1;dr[2]=false;}}
  if(wr[0]===0){const pw=a.winds.filter(c=>c>0);if(pw.length===2&&pw.every(c=>c===1))wr[1]=1;else if(pw.length>=2&&wr[2]){wr[0]=0;wr[1]=1;wr[2]=false;}}
  const wr2=decNum(a.wan,0,false),tr=decNum(a.tong,0,false),tir=decNum(a.tiao,0,false);
  const parts=[wr,dr,wr2,tr,tir];
  let bestScore=0;
  for(let i=0;i<parts.length;i++){
    let melds=0,taatsu=0;
    for(let j=0;j<parts.length;j++){melds+=parts[j][0];taatsu+=parts[j][1];}
    taatsu=Math.min(taatsu,4-melds);
    let total=2*melds+taatsu+(parts[i][2]?1:0);
    if(total>bestScore)bestScore=total;
  }
  return Math.max(0,8-bestScore);
}

function calcShanten7Pairs(hand){
  const cnt={};for(const t of hand)cnt[t.k]=(cnt[t.k]||0)+1;
  let pairs=0;for(const v of Object.values(cnt))if(v>=2)pairs++;
  return Math.max(0,6-pairs);
}

// === breaksMeld / breaksPair ===
function breaksMeld(h, idx) {
  const t = h[idx];
  const sub = h.filter((_, j) => j !== idx);
  if (h.filter(x => teq(x, t)).length >= 3) return true;
  if (t.t === 'num') {
    const s = t.s, v = t.v;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1) && sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1)) return true;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v + 1) && sub.some(x => x.t === 'num' && x.s === s && x.v === v + 2)) return true;
    if (sub.some(x => x.t === 'num' && x.s === s && x.v === v - 2) && sub.some(x => x.t === 'num' && x.s === s && x.v === v - 1)) return true;
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
  return h.filter(x => teq(x, t)).length >= 2;
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

function countSeen(suit, value) {
  const k = suit + value;
  let seen = 0;
  for (const t of hand) if (tkey(t) === k) seen++;
  return seen;
}

// === meldQuality ===
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
  return 3;
}

function isInFourConsecutive(h, idx) {
  const t = h[idx];
  if (t.t !== 'num') return false;
  const set = new Set(h.filter(x => x.t === 'num' && x.s === t.s).map(x => x.v));
  const v = t.v;
  return [[v-3,v-2,v-1,v],[v-2,v-1,v,v+1],[v-1,v,v+1,v+2],[v,v+1,v+2,v+3]]
    .some(run => run.every(n => n >= 1 && n <= 9 && set.has(n)));
}

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

function isolatedScore(h, idx) {
  const t = h[idx]; let sc = 0;
  if (t.t === 'num') {
    const s = t.s, v = t.v;
    for (const x of h) {
      if (x.t === 'num' && x.s === s) {
        const d = Math.abs(x.v - v);
        if (d === 1) sc += 3;
        else if (d === 2) sc += 2;
      }
    }
  } else {
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

// === suitBias ===
function suitBias(hand) {
  const cnt = { wan: 0, tong: 0, tiao: 0 }; let honorCnt = 0;
  for (const t of hand) {
    if (t.t === 'honor') honorCnt++;
    else if (t.t === 'num') cnt[t.s]++;
  }
  const e = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const topSuit = e[0][0], topNum = e[0][1];
  const mixed = topNum + honorCnt;
  if (topNum >= 10) return { suit: topSuit, count: topNum, type: 'clear' };
  if (mixed >= 10 && topNum >= 5) return { suit: topSuit, count: mixed, type: 'mixed' };
  if (topNum >= 8) return { suit: topSuit, count: topNum, type: 'semi-clear' };
  if (mixed >= 7 && mixed < 10 && topNum >= 4) return { suit: topSuit, count: mixed, type: 'mixed-lean' };
  return { suit: topSuit, count: topNum, type: 'none' };
}

// === MAIN SIMULATION ===
console.log('=== 对家初始14张 ===');
console.log('手牌:', hand.map(t=>t.k).join(','));
console.log('分析:', analyzeHand(hand));

const bias = suitBias(hand);
console.log('suitBias:', bias);

// 计算每张牌
const effHand = [...hand]; // no melds
const pairCount = (() => { const c = {}; for (const t of hand) c[t.k] = (c[t.k] || 0) + 1; let p = 0; for (const v of Object.values(c)) if (v >= 2) p++; return p; })();

console.log('\n=== 第一步：shanten 计算所有候选 ===');
let bestShantenVal = Infinity, bestCands = [], subHands = [], bestPaths = [];
for (let i = 0; i < hand.length; i++) {
  const sub = effHand.filter((_, j) => j !== i);
  const sN = calcShanten(sub);
  const s7 = calcShanten7Pairs(sub);
  let s = sN, path = 'norm';
  if (s < bestShantenVal) { bestShantenVal = s; bestCands = [i]; subHands = [sub]; bestPaths = [path]; }
  else if (s === bestShantenVal) { bestCands.push(i); subHands.push(sub); bestPaths.push(path); }
  console.log(`  [${i}] 弃${hand[i].k.padEnd(7)} shanten=${s} path=${path}  breaksMeld=${breaksMeld(hand,i)} breaksPair=${breaksPair(hand,i)} breaksPT=${breaksPairTaatsu(hand,i)}`);
}

console.log(`\nbestShantenVal=${bestShantenVal}, bestCands=[${bestCands}]`);
console.log('bestCands tiles:', bestCands.map(i=>hand[i].k).join(','));

// === 第二步：唯一候选 ===
if (bestCands.length === 1) {
  console.log('唯一候选，直接返回');
  process.exit(0);
}

// === 第三步：优先级过滤 ===
console.log('\n=== 优先级过滤 ===');
const origCands = [...bestCands];
const meldB = bestCands.map(i => breaksMeld(hand, i));
const pairB = bestCands.map(i => breaksPair(hand, i));
console.log('breaksMeld:', meldB);
console.log('breaksPair:', pairB);
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
console.log('after meld/pair filter:', bestCands.map(i=>hand[i].k).join(','));

// === breaksPairTaatsu ===
if (bestCands.length > 1) {
  const ptB = bestCands.map(i => breaksPairTaatsu(hand, i));
  const nonPT = bestCands.filter((_, ci) => !ptB[ci]);
  if (nonPT.length > 0) {
    bestCands = nonPT; subHands = nonPT.map(i => subHands[origCands.indexOf(i)]); bestPaths = nonPT.map(i => bestPaths[origCands.indexOf(i)]);
  }
  console.log('after PT filter:', bestCands.map(i=>hand[i].k).join(','));
}

// === 对子保留 ===
if (bestCands.length > 1) {
  const pairCnt = bestCands.map(i => hand.filter(x => teq(x, hand[i])).length);
  const nonPB = bestCands.filter((_, ci) => pairCnt[ci] < 2);
  if (nonPB.length > 0) bestCands = nonPB;
  console.log('after pair preserve:', bestCands.map(i=>hand[i].k).join(','));
}

// === 四连型保护 ===
if (bestCands.length > 1) {
  const fc = bestCands.map(i => isInFourConsecutive(hand, i));
  const nonFC = bestCands.filter((_, ci) => !fc[ci]);
  if (nonFC.length > 0) bestCands = nonFC;
  console.log('after 4-consecutive:', bestCands.map(i=>hand[i].k).join(','));
}

// === 五对七对 ===
if (bestCands.length > 1) {
  const pc5 = countUniquePairs(hand);
  if (pc5 >= 5) console.log('五对七对触发');
  else console.log(`五对七对跳过 (pairCount=${pc5})`);
}

// === meldQuality ===
if (bestCands.length > 1) {
  const qualities = bestCands.map(i => meldQuality(hand, i));
  const minQ = Math.min(...qualities);
  const bq = bestCands.filter((_, ci) => qualities[ci] === minQ);
  console.log('meldQuality:', bestCands.map((i,ci)=>`${hand[i].k}=${qualities[ci]}`).join(', '));
  if (bq.length > 0 && bq.length < bestCands.length) bestCands = bq;
  console.log('after meldQuality:', bestCands.map(i=>hand[i].k).join(','));
}

// === 拆搭损失 ===
if (bestCands.length > 1) {
  const losses = bestCands.map(i => waitLoss(hand, i));
  const minLoss = Math.min(...losses);
  const lowLoss = bestCands.filter((_, ci) => losses[ci] === minLoss);
  console.log('waitLoss:', bestCands.map((i,ci)=>`${hand[i].k}=${losses[ci]}`).join(', '));
  if (lowLoss.length > 0 && lowLoss.length < bestCands.length) bestCands = lowLoss;
  console.log('after waitLoss:', bestCands.map(i=>hand[i].k).join(','));
}

// === isolatedScore ===
if (bestCands.length > 1) {
  const iso = bestCands.map(i => isolatedScore(hand, i));
  const minI = Math.min(...iso);
  const bi = bestCands.filter((_, ci) => iso[ci] === minI);
  console.log('isolatedScore:', bestCands.map((i,ci)=>`${hand[i].k}=${iso[ci]}`).join(', '));
  if (bi.length > 0 && bi.length < bestCands.length) bestCands = bi;
  console.log('after isolatedScore:', bestCands.map(i=>hand[i].k).join(','));
}

// === 时机权重 (early: turn<=24) — 修复后移到结构评估之后 ===
const TURN = 5;
if (bestCands.length > 1) {
  const phase2 = TURN <= 24 ? 'early' : TURN <= 48 ? 'mid' : 'late';
  console.log(`phase=${phase2}`);
  if (phase2 === 'early') {
    const midCands = bestCands.filter(i => {
      const t = hand[i];
      return t.t === 'num' && t.v >= 3 && t.v <= 7;
    });
    console.log('early midCands:', midCands.map(i=>hand[i].k).join(','));
    if (midCands.length > 0 && midCands.length < bestCands.length) {
      bestCands = midCands;
    }
  }
  console.log('after timing:', bestCands.map(i=>hand[i].k).join(','));
}

// === 雀头状态感知 ===
if (bestCands.length > 1) {
  const pc = countUniquePairs(hand);
  console.log(`pairCount=${pc}`);
  if (pc === 1) {
    const edgeCands = bestCands.filter(i => {
      const t = hand[i];
      return t.t === 'num' && (t.v === 1 || t.v === 9);
    });
    if (edgeCands.length > 0 && edgeCands.length < bestCands.length) {
      bestCands = edgeCands;
      console.log('有将弃边张');
    }
  } else if (pc === 0) {
    const nonMid = bestCands.filter(i => {
      const t = hand[i];
      return t.t === 'honor' || (t.t === 'num' && (t.v <= 2 || t.v >= 8));
    });
    if (nonMid.length > 0 && nonMid.length < bestCands.length) {
      bestCands = nonMid;
      console.log('无将弃幺九字');
    }
  }
  console.log('after jantou-aware:', bestCands.map(i=>hand[i].k).join(','));
}

console.log('\n=== 最终选中的牌 ===');
console.log(bestCands.map(i => hand[i].k).join(','));
console.log('选中: ' + hand[bestCands[0]].k);

// === 染手评分 ===
console.log('\n混一色 bias:', bias);
console.log('\n最终评分（模拟染手偏向）:');
for (const k of ['wan5','wan8','tong4','bei']) {
  const idx = hand.findIndex(t => t.k === k);
  if (idx < 0) continue;
  const tk = hand[idx];
  // 模拟 q 值（handPotential 近似为 0）
  let q = 0;
  if (bias.type === 'mixed' && tk.t === 'num' && tk.s === bias.suit) q -= 6;
  else if (bias.type === 'mixed' && tk.t === 'honor') q -= 5;
  // 拆搭损失（越小越好）
  const wl = waitLoss(hand, idx);
  // 孤张评分（越小越好）
  const iso = isolatedScore(hand, idx);
  // shanten
  const sub = effHand.filter((_, j) => j !== idx);
  const s = calcShanten(sub);
  console.log(`  弃${k.padEnd(6)} shanten=${s} 混一色q=${q}  waitLoss=${wl}  iso=${iso}`);
}
