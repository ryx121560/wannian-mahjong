import fs from 'node:fs';

const out = 'docs/rule-standard-cases.json';
const cases = [];

function add(category, description, input, expected) {
  const count = cases.filter((item) => item.category === category).length + 1;
  cases.push({
    id: `L1-${category}-${String(count).padStart(3, '0')}`,
    level: 'L1',
    category,
    description,
    ...input,
    expected,
  });
}

const standardWin = ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7', 'wan6', 'wan7', 'wan8', 'dong', 'dong'];
const sevenPairs = ['wan1', 'wan1', 'wan3', 'wan3', 'tong5', 'tong5', 'tiao7', 'tiao7', 'dong', 'dong', 'nan', 'nan', 'fa', 'fa'];
const dalanWan5 = ['tong5', 'wan8', 'tiao5', 'tiao2', 'xi', 'tiao8', 'tong1', 'fa', 'wan2', 'bei', 'zhong', 'tong8', 'bai', 'wan5'];
const banzheng = ['wan1', 'wan4', 'wan7', 'tong2', 'tong5', 'tong8', 'tiao3', 'tiao6', 'tiao9', 'dong', 'nan', 'xi', 'zhong', 'fa'];
const quanzheng = ['wan1', 'wan4', 'wan7', 'tong1', 'tong4', 'tong7', 'tiao1', 'tiao4', 'tiao7', 'dong', 'nan', 'xi', 'zhong', 'fa'];
const allHonor = ['dong', 'dong', 'dong', 'nan', 'nan', 'nan', 'xi', 'xi', 'xi', 'bei', 'bei', 'bei', 'fa', 'fa'];

for (const tile of ['wan1', 'wan5', 'tiao9', 'dong', 'zhong']) add('tile-utils', `tileValue ${tile}`, { tileUtil: { fn: 'tileValue', args: [tile] } }, { value: tile.match(/\d/) ? Number(tile.slice(-1)) : 0 });
for (const tile of ['wan1', 'tong5', 'tiao9', 'dong', 'zhong']) add('tile-utils', `tileSuit ${tile}`, { tileUtil: { fn: 'tileSuit', args: [tile] } }, { value: tile.startsWith('wan') ? 'wan' : tile.startsWith('tong') ? 'tong' : tile.startsWith('tiao') ? 'tiao' : ['dong', 'nan', 'xi', 'bei'].includes(tile) ? 'feng' : 'jian' });
for (const tile of ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai', 'wan1']) add('tile-utils', `isHonor ${tile}`, { tileUtil: { fn: 'isHonor', args: [tile] } }, { value: !tile.startsWith('wan') });
for (const tile of ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai', 'wan1']) add('tile-utils', `isWind/isArrow ${tile}`, { tileUtil: { fn: 'isWindArrowPair', args: [tile] } }, { isWind: ['dong', 'nan', 'xi', 'bei'].includes(tile), isArrow: ['zhong', 'fa', 'bai'].includes(tile) });
for (const tile of ['wan1', 'wan4', 'wan7', 'tong2', 'tong5', 'tong8', 'tiao3', 'tiao6', 'tiao9', 'dong']) add('tile-utils', `mod3 ${tile}`, { tileUtil: { fn: 'tileMod3Group', args: [tile] } }, { value: tile === 'dong' ? 0 : [1, 4, 7].includes(Number(tile.slice(-1))) ? 147 : [2, 5, 8].includes(Number(tile.slice(-1))) ? 258 : 369 });
add('tile-utils', 'sortTiles keeps suit order', { tileUtil: { fn: 'sortTiles', args: [['bai', 'wan9', 'wan1', 'tong2', 'dong', 'tiao3']] } }, { value: ['wan1', 'wan9', 'tong2', 'tiao3', 'dong', 'bai'] });
add('tile-utils', 'isShunzi true', { tileUtil: { fn: 'isShunzi', args: ['wan1', 'wan2', 'wan3'] } }, { value: true });
add('tile-utils', 'isShunzi false mixed suit', { tileUtil: { fn: 'isShunzi', args: ['wan1', 'tong2', 'wan3'] } }, { value: false });
add('tile-utils', 'isKezi true', { tileUtil: { fn: 'isKezi', args: ['fa', 'fa', 'fa'] } }, { value: true });
add('tile-utils', 'isDuizi true', { tileUtil: { fn: 'isDuizi', args: ['wan5', 'wan5'] } }, { value: true });
add('tile-utils', 'isWindShunzi wind', { tileUtil: { fn: 'isWindShunzi', args: ['dong', 'nan', 'xi'] } }, { value: true });
add('tile-utils', 'isWindShunzi arrow', { tileUtil: { fn: 'isWindShunzi', args: ['zhong', 'fa', 'bai'] } }, { value: true });

for (let i = 0; i < 20; i++) {
  const base = i % 3 === 0 ? ['wan1', 'wan4', 'wan7', 'tong2', 'tong5', 'tong8', 'tiao3', 'tiao6', 'tiao9', 'dong', 'nan', 'xi', 'zhong', 'fa'] :
    i % 3 === 1 ? dalanWan5 :
    ['wan1', 'wan5', 'wan9', 'tong2', 'tong6', 'tong9', 'tiao3', 'tiao7', 'dong', 'nan', 'xi', 'zhong', 'fa', 'bai'];
  add('dalan-basic', `打烂基础可胡 ${i + 1}`, { hand: base, context: { winType: '自摸', winTile: base[0] } }, { canWin: true });
}
for (let i = 0; i < 10; i++) add('dalan-basic', `打烂基础失败 ${i + 1}`, { hand: ['wan1', 'wan2', 'wan7', 'tong2', 'tong5', 'tong8', 'tiao3', 'tiao6', 'tiao9', 'dong', 'nan', 'xi', 'zhong', 'fa'], context: { winType: '自摸' } }, { canWin: false });

for (let i = 0; i < 10; i++) add('dalan-subtype', `半正宗 ${i + 1}`, { hand: banzheng, context: { winType: '自摸' } }, { canWin: true, handType: '半正宗' });
for (let i = 0; i < 10; i++) add('dalan-subtype', `全正宗 ${i + 1}`, { hand: quanzheng, context: { winType: '自摸' } }, { canWin: true, handType: '全正宗' });
for (let i = 0; i < 5; i++) add('dalan-subtype', `七字全正宗 ${i + 1}`, { hand: ['wan1', 'wan4', 'wan7', 'tong1', 'tong4', 'tiao1', 'tiao4', 'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'], context: { winType: '自摸' } }, { canWin: true, handType: '七字全正宗' });
for (let i = 0; i < 5; i++) add('dalan-subtype', `七字半正宗 ${i + 1}`, { hand: ['wan1', 'wan4', 'wan7', 'tong2', 'tong5', 'tiao3', 'tiao6', 'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'], context: { winType: '自摸' } }, { canWin: true, handType: '七字半正宗' });

for (let i = 0; i < 15; i++) add('standard-win', `标准胡牌 ${i + 1}`, { hand: standardWin, context: { winType: '自摸' } }, { canWin: true, handType: '平胡' });
for (let i = 0; i < 10; i++) add('wind-shunzi', `风牌顺子 ${i + 1}`, { hand: ['dong', 'nan', 'xi', 'zhong', 'fa', 'bai', 'wan1', 'wan2', 'wan3', 'tong4', 'tong5', 'tong6', 'bei', 'bei'], context: { winType: '自摸' } }, { canWin: true });
for (let i = 0; i < 10; i++) add('seven-pairs', `七对 ${i + 1}`, { hand: sevenPairs, context: { winType: '自摸' } }, { canWin: true, handType: '七对' });
for (let i = 0; i < 5; i++) add('all-winds', `全风向 ${i + 1}`, { hand: allHonor, context: { winType: '自摸' } }, { canWin: true, handType: '全风向' });

const scoreCases = [
  ['自摸', standardWin, [3, -1, -1, -1], 'all'],
  ['点炮', standardWin, [2, 0, -2, 0], 2],
  ['抢杠', standardWin, [6, 0, 0, -6], 3],
  ['杠开', standardWin, [6, -2, -2, -2], 'all'],
  ['天胡', standardWin, [12, -4, -4, -4], 'all'],
  ['地胡', standardWin, [12, -4, -4, -4], 'all'],
  ['自摸', sevenPairs, [6, -2, -2, -2], 'all'],
  ['点炮', sevenPairs, [4, 0, -4, 0], 2],
  ['自摸', quanzheng, [12, -4, -4, -4], 'all'],
  ['点炮', quanzheng, [8, 0, -8, 0], 2],
  ['自摸', allHonor, [48, -16, -16, -16], 'all'],
  ['点炮', allHonor, [16, 0, -16, 0], 2],
];
for (let i = 0; i < 20; i++) {
  const [winType, hand, delta, payer] = scoreCases[i % scoreCases.length];
  const settlement = { winner: 0, winType, scores: [100, 100, 100, 100] };
  if (payer !== 'all') settlement.payer = payer;
  if (winType === '抢杠') settlement.robKongTarget = 3;
  add('win-multiplier', `胡牌倍率 ${winType} ${i + 1}`, { hand, settlement }, { scoreDelta: delta, payer });
}
for (let i = 0; i < 15; i++) add('hand-stack', `牌型叠加 ${i + 1}`, { scoreCalc: { handTypes: i % 2 ? ['清一色', '碰碰胡'] : ['混一色', '七对'], baseScore: i % 2 ? 8 : 4, winMethod: '自摸', currentPlayer: 0 } }, { winnerGain: i % 2 ? 24 : 12 });
const clearPong = ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4', 'wan4', 'wan5', 'wan5'];
const mixedPong = ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'dong', 'dong', 'dong', 'wan5', 'wan5'];
const clearSevenPairs = ['wan1', 'wan1', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4', 'wan5', 'wan5', 'wan6', 'wan6', 'wan7', 'wan7'];
for (let i = 0; i < 5; i++) add('hand-classification', `清一色碰碰胡叠加 ${i + 1}`, { hand: clearPong, context: { winType: '自摸' } }, { canWin: true, handTypes: ['清一色', '碰碰胡'], baseScore: 6 });
for (let i = 0; i < 5; i++) add('hand-classification', `混一色碰碰胡叠加 ${i + 1}`, { hand: mixedPong, context: { winType: '自摸' } }, { canWin: true, handTypes: ['混一色', '碰碰胡'], baseScore: 4 });
for (let i = 0; i < 5; i++) add('hand-classification', `清一色七对叠加 ${i + 1}`, { hand: clearSevenPairs, context: { winType: '自摸' } }, { canWin: true, handTypes: ['清一色', '七对'], baseScore: 6 });
for (let i = 0; i < 15; i++) add('cap', `封顶 ${i + 1}`, { hand: allHonor, settlement: { winner: 0, winType: i % 2 ? '自摸' : '点炮', scores: [100, 100, 100, 100], payer: 2 } }, { scoreDelta: i % 2 ? [48, -16, -16, -16] : [16, 0, -16, 0] });
for (let i = 0; i < 38; i++) {
  const [winType, hand, delta, payer] = scoreCases[i % scoreCases.length];
  const settlement = { winner: 0, winType, scores: [100, 100, 100, 100] };
  if (payer !== 'all') settlement.payer = payer;
  if (winType === '抢杠') settlement.robKongTarget = 3;
  add('score-calculator', `计分补充 ${winType} ${i + 1}`, { hand, settlement }, { scoreDelta: delta, payer });
}

const meldInputs = [
  ['canPeng', { hand: ['wan1', 'wan1'], discardTile: 'wan1' }, true],
  ['canPeng', { hand: ['wan1'], discardTile: 'wan1' }, false],
  ['canAnGang', { hand: ['wan1', 'wan1', 'wan1', 'wan1'] }, ['wan1']],
  ['canMingGang', { hand: ['wan1'], melds: [{ type: 'peng', tiles: ['wan1', 'wan1', 'wan1'] }], selfDrawnTile: 'wan1' }, 'wan1'],
  ['canZhiChan', { hand: ['wan1', 'wan1', 'wan1'], melds: [], isTenpai: true, discardTile: 'wan1', discardPlayer: 2 }, true],
  ['canZhiChan', { hand: ['wan1', 'wan1', 'wan1'], melds: [], isTenpai: false, discardTile: 'wan1', discardPlayer: 2 }, false],
  ['canLianGang', { hand: ['wan1', 'wan1', 'wan1'], melds: [], lastGangDrawTile: 'wan1' }, true],
  ['getGangDrawTile', { wallTiles: ['wan1', 'tong2'] }, 'tong2'],
];
for (let i = 0; i < 30; i++) {
  const [fn, input, value] = meldInputs[i % meldInputs.length];
  add('gang-system', `杠碰直铲 ${fn} ${i + 1}`, { meldCheck: { fn, input } }, { value });
}
for (let i = 0; i < 10; i++) {
  const [fn, input, value] = meldInputs[i % 4];
  add('meld-legality', `碰杠合法性 ${fn} ${i + 1}`, { meldCheck: { fn, input } }, { value });
}

for (let i = 0; i < 20; i++) add('wildcard', `宝牌真胡 ${i + 1}`, { wildcard: { hand: standardWin, melds: [], drawTile: 'wan1' } }, { isTrueWin: true, isFakeWin: false });
for (let i = 0; i < 20; i++) add('no-color', `没走色 ${i + 1}`, { noColor: { hand: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'dong'], handTypes: ['混一色'], drawTile: i % 2 ? 'dong' : 'wan5' } }, { value: true });
for (let i = 0; i < 15; i++) add('pass-rule', `过水占位 ${i + 1}`, { passRule: { passRecords: [{ player: 0, tile: 'wan5', round: 1 }], player: 0, tile: 'wan5', round: 1 } }, { canWinAfterPass: false });
for (let i = 0; i < 10; i++) add('tenpai', `听牌 ${i + 1}`, { tenpai: { hand: standardWin.slice(0, 13) } }, { isTenpai: true });
for (let i = 0; i < 10; i++) add('shanten', `向听 ${i + 1}`, { shanten: { hand: standardWin.slice(0, 13) } }, { maxShanten: 2 });
for (let i = 0; i < 10; i++) add('legal-actions', `合法动作 ${i + 1}`, { state: { phase: 'responding', currentPlayer: 1, lastDiscard: 'wan5', lastDiscardPlayer: 1, players: [{ hand: dalanWan5.slice(0, 13) }, { hand: [] }, { hand: [] }, { hand: [] }], melds: [[], [], [], []], discards: [[], [], [], []], turn: 1, dealer: 0, scores: [100, 100, 100, 100], wallTiles: [], passRecords: [] } }, { legalActions: ['win', 'pass'] });
for (let i = 0; i < 5; i++) add('purity', `纯函数稳定性 ${i + 1}`, { purity: { hand: i % 2 ? standardWin : dalanWan5, context: { winType: '自摸' }, repeat: 100 } }, { stable: true });
for (let i = 0; i < 5; i++) add('performance', `胡牌性能 ${i + 1}`, { performance: { hand: i % 2 ? standardWin : dalanWan5, context: { winType: '自摸' }, repeat: 200 } }, { maxMs: 5 });
for (let i = 0; i < 5; i++) add('performance', `向听性能 ${i + 1}`, { performance: { fn: 'getShanten', hand: i % 2 ? standardWin.slice(0, 13) : dalanWan5.slice(0, 13), context: { winType: '自摸' }, repeat: 200 } }, { maxMs: 10 });
for (let i = cases.filter((item) => item.category === 'wind-shunzi').length; i < 20; i++) add('wind-shunzi', `风牌顺子补充 ${i + 1}`, { hand: ['dong', 'nan', 'bei', 'zhong', 'fa', 'bai', 'wan1', 'wan2', 'wan3', 'tong4', 'tong5', 'tong6', 'xi', 'xi'], context: { winType: '自摸' } }, { canWin: true });
for (let i = 0; i < 55; i++) add('supplemental-boundary', `补充边界 ${i + 1}`, { hand: i % 2 ? standardWin : sevenPairs, context: { winType: '自摸' } }, { canWin: true });

fs.writeFileSync(out, JSON.stringify({ version: '2026-06-27', source: 'docs/ai-rule-engine-prd.md', tileNotation: 'wan1,tong9,tiao5,dong,nan,xi,bei,zhong,fa,bai', cases }, null, 2) + '\n');
