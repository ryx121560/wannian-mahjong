// 测试脚本：箭牌问题分析
// 模拟 gameId "2026-6-2_19-26-24" 中用户的手牌

const fs = require('fs');
const path = require('path');

// ---- 独立定义 tkey / teq / kt ----
function tkey(t) { return t.k; }
function teq(a, b) { return a.k === b.k; }
function kt(k) {
  if ('dongnanxibeizhongfabai'.includes(k)) return { k, t: 'honor', s: k, v: 0 };
  const sm = { wan: 'wan', tong: 'tong', tiao: 'tiao' };
  const sk = k.slice(0, k.length - 1);
  return { k, t: 'num', s: sm[sk], v: parseInt(k.slice(-1)) };
}

// ---- 读取 eval.js ----
const evalSrc = fs.readFileSync(path.join(__dirname, 'eval.js'), 'utf8');
// 注入全局定义
const evalWrapped = `
const teq = ${teq.toString()};
const tkey = ${tkey.toString()};
const kt = ${kt.toString()};
${evalSrc}
`;
eval(evalWrapped);

// 构建手牌
const handKeys = [
  'tong4', 'tong5', 'wan6', 'zhong', 'wan8', 'tong9', 'tong4',
  'zhong', 'tong1', 'bai', 'tong7', 'tiao4', 'tiao2', 'tiao5'
];
const hand = handKeys.map(k => kt(k));

console.log('=== 手牌分析 ===');
console.log('手牌(' + hand.length + '张):', handKeys.join(','));

// 计算每张牌去掉后的向听数
const results = [];
for (let i = 0; i < hand.length; i++) {
  const sub = hand.filter((_, j) => j !== i);
  const s = fastShanten(sub, null);
  results.push({ idx: i, tile: handKeys[i], shanten: s, subLen: sub.length });
  console.log(`  弃[${i}] ${handKeys[i]}: shanten=${s}`);
}

// 找最佳向听数
const bestShanten = Math.min(...results.map(r => r.shanten));
const bestCands = results.filter(r => r.shanten === bestShanten);
console.log('\n最佳向听数:', bestShanten);
console.log('候选牌:', bestCands.map(c => `[${c.idx}]${c.tile}`).join(', '));

// 模拟 breaksMeld, breaksPair
function breaksMeld_arrow(h, idx) {
  const t = h[idx];
  if (t.t === 'honor' && ['zhong', 'fa', 'bai'].includes(t.s)) {
    const dorder = ['zhong', 'fa', 'bai'];
    const sub = h.filter((_, j) => j !== idx);
    const subArrows = sub.filter(x => x.t === 'honor' && dorder.includes(x.s)).map(x => x.s);
    if (new Set(subArrows).size === 2 && !subArrows.includes(t.s)) return true;
  }
  // 三序连检测
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
  // 风牌检测
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

console.log('\n=== 过滤阶段追踪 ===');
const bestIdxList = bestCands.map(c => c.idx);
console.log('最佳候选索引:', bestIdxList);

const meldB = bestIdxList.map(i => breaksMeld_arrow(hand, i));
const pairB = bestIdxList.map(i => breaksPair(hand, i));

console.log('breaksMeld:', bestIdxList.map((i, ci) => `[${i}]${handKeys[i]}=${meldB[ci]}`).join(', '));
console.log('breaksPair:', bestIdxList.map((i, ci) => `[${i}]${handKeys[i]}=${pairB[ci]}`).join(', '));

// 不拆面子过滤
const nonMeld = bestIdxList.filter((_, ci) => !meldB[ci]);
console.log('nonMeld:', nonMeld.map(i => `[${i}]${handKeys[i]}`).join(', '));

if (nonMeld.length > 0) {
  const np = nonMeld.filter(i => !pairB[bestIdxList.indexOf(i)]);
  console.log('不拆对子后:', np.map(i => `[${i}]${handKeys[i]}`).join(', '));
}

console.log('\n=== 结论 ===');
console.log('应弃牌: tong1 而非 zhong');
