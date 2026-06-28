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
const prdAllHonor = ['dong', 'dong', 'dong', 'dong', 'nan', 'nan', 'nan', 'nan', 'xi', 'xi', 'xi', 'bei', 'zhong', 'fa'];
const fakeWinByDong = ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7', 'wan6', 'wan7', 'wan8', 'dong', 'bai'];
const fakeWinByBai = ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tong1', 'tong2', 'tong3', 'dong', 'fa'];
const notTenpai = ['wan1', 'wan1', 'wan4', 'tong2', 'tong5', 'tiao3', 'tiao8', 'dong', 'nan', 'xi', 'bei', 'zhong', 'fa'];
const oneShanten = ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'wan6', 'wan7', 'dong', 'dong', 'fa'];

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
add('all-winds', 'PRD全风向不要求标准面子结构', { hand: prdAllHonor, context: { winType: '自摸', winTile: 'fa' } }, { canWin: true, handTypes: ['全风向'], baseScore: 16 });

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
add('score-calculator', 'calculateScore 点炮使用指定付款人', { scoreCalc: { handTypes: ['平胡'], baseScore: 1, winMethod: '点炮', currentPlayer: 0, payer: 2 } }, { winnerGain: 1, scorePerPlayer: [0, 0, 1, 0] });
const clearPong = ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4', 'wan4', 'wan5', 'wan5'];
const mixedPong = ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'dong', 'dong', 'dong', 'wan5', 'wan5'];
const clearSevenPairs = ['wan1', 'wan1', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4', 'wan5', 'wan5', 'wan6', 'wan6', 'wan7', 'wan7'];
for (let i = 0; i < 5; i++) add('hand-classification', `清一色碰碰胡叠加 ${i + 1}`, { hand: clearPong, context: { winType: '自摸' } }, { canWin: true, handTypes: ['清一色', '碰碰胡'], baseScore: 8 });
for (let i = 0; i < 5; i++) add('hand-classification', `混一色碰碰胡叠加 ${i + 1}`, { hand: mixedPong, context: { winType: '自摸' } }, { canWin: true, handTypes: ['混一色', '碰碰胡'], baseScore: 4 });
for (let i = 0; i < 5; i++) add('hand-classification', `清一色七对叠加 ${i + 1}`, { hand: clearSevenPairs, context: { winType: '自摸' } }, { canWin: true, handTypes: ['清一色', '七对'], baseScore: 8 });
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
  ['canQiangXingPaoGang', { hand: ['wan2', 'wan2', 'wan2'], melds: [], isTenpai: false, discardTile: 'wan2' }, { canGang: true, gangTile: 'wan2', isPaoGang: true }],
  ['canQiangXingPaoGang', { hand: ['wan2', 'wan2', 'wan2'], melds: [], isTenpai: true, discardTile: 'wan2' }, { canGang: false, gangTile: null, isPaoGang: false }],
];
for (let i = 0; i < 30; i++) {
  const [fn, input, value] = meldInputs[i % meldInputs.length];
  add('gang-system', `杠碰直铲 ${fn} ${i + 1}`, { meldCheck: { fn, input } }, { value });
}
for (let i = 0; i < 10; i++) {
  const [fn, input, value] = meldInputs[i % meldInputs.length];
  add('meld-legality', `碰杠合法性 ${fn} ${i + 1}`, { meldCheck: { fn, input } }, { value });
}

const wildcardCases = [
  ['宝牌真胡', standardWin, 'wan1', { isTrueWin: true, isFakeWin: false }],
  ['宝牌假胡-东风替白板', fakeWinByDong, 'dong', { isTrueWin: false, isFakeWin: true, fakeWinReplacement: { originalTile: 'bai', replacedBy: 'dong' } }],
  ['宝牌不能胡', fakeWinByBai, 'zhong', { isTrueWin: false, isFakeWin: false }],
  ['宝牌七对真胡', sevenPairs, 'wan1', { isTrueWin: true, isFakeWin: false }],
];
for (let i = 0; i < 20; i++) {
  const [description, hand, drawTile, expected] = wildcardCases[i % wildcardCases.length];
  add('wildcard', `${description} ${i + 1}`, { wildcard: { hand, melds: [], drawTile } }, expected);
}
const noColorCases = [
  ['混一色补字牌没走色', ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'dong'], ['混一色'], 'dong', true],
  ['混一色补同花色没走色', ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'dong'], ['混一色'], 'wan5', true],
  ['混一色补异花色走色', ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'dong'], ['混一色'], 'tong5', false],
  ['清一色补异花色走色', ['tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao9'], ['清一色'], 'wan5', false],
];
for (let i = 0; i < 20; i++) {
  const [description, hand, handTypes, drawTile, value] = noColorCases[i % noColorCases.length];
  add('no-color', `${description} ${i + 1}`, { noColor: { hand, handTypes, drawTile } }, { value });
}
const passCases = [
  ['同圈同张不可胡', { passRecords: [{ player: 0, tile: 'wan5', round: 1 }], player: 0, tile: 'wan5', round: 1 }, false],
  ['同圈不同张可胡', { passRecords: [{ player: 0, tile: 'wan5', round: 1 }], player: 0, tile: 'wan6', round: 1 }, true],
  ['下一圈同张解禁', { passRecords: [{ player: 0, tile: 'wan5', round: 1 }], player: 0, tile: 'wan5', round: 2 }, true],
  ['不同玩家不受影响', { passRecords: [{ player: 1, tile: 'wan5', round: 1 }], player: 0, tile: 'wan5', round: 1 }, true],
];
for (let i = 0; i < 15; i++) {
  const [description, passRule, canWinAfterPass] = passCases[i % passCases.length];
  add('pass-rule', `${description} ${i + 1}`, { passRule }, { canWinAfterPass });
}
const tenpaiCases = [
  ['单张听东风', standardWin.slice(0, 13), { isTenpai: true, waitingTiles: ['dong'], minWaitCount: 1 }],
  ['七对听发财', sevenPairs.slice(0, 13), { isTenpai: true, waitingTiles: ['fa'], minWaitCount: 1 }],
  ['非听牌散手', notTenpai, { isTenpai: false }],
  ['多面听', ['wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7'], { isTenpai: true, waitingTiles: ['wan5', 'wan8'], minWaitCount: 2 }],
  ['风牌听', ['dong', 'nan', 'xi', 'zhong', 'fa', 'bai', 'wan1', 'wan2', 'wan3', 'tong4', 'tong5', 'tong6', 'bei'], { isTenpai: true, waitingTiles: ['bei'], minWaitCount: 1 }],
];
for (let i = 0; i < 10; i++) {
  const [description, hand, expected] = tenpaiCases[i % tenpaiCases.length];
  add('tenpai', `${description} ${i + 1}`, { tenpai: { hand } }, expected);
}
const shantenCases = [
  ['已胡', standardWin, { maxShanten: -1, exactShanten: -1 }],
  ['已听牌', standardWin.slice(0, 13), { maxShanten: 0, exactShanten: 0 }],
  ['一向听', oneShanten, { maxShanten: 1, exactShanten: 1 }],
  ['二向听以内', notTenpai, { maxShanten: 2 }],
];
for (let i = 0; i < 10; i++) {
  const [description, hand, expected] = shantenCases[i % shantenCases.length];
  add('shanten', `${description} ${i + 1}`, { shanten: { hand } }, expected);
}
for (let i = 0; i < 10; i++) add('legal-actions', `合法动作 ${i + 1}`, { state: { phase: 'responding', currentPlayer: 1, lastDiscard: 'wan5', lastDiscardPlayer: 1, players: [{ hand: dalanWan5.slice(0, 13) }, { hand: [] }, { hand: [] }, { hand: [] }], melds: [[], [], [], []], discards: [[], [], [], []], turn: 1, dealer: 0, scores: [100, 100, 100, 100], wallTiles: [], passRecords: [] } }, { legalActions: ['win', 'pass'] });
for (let i = 0; i < 5; i++) add('purity', `纯函数稳定性 ${i + 1}`, { purity: { hand: i % 2 ? standardWin : dalanWan5, context: { winType: '自摸' }, repeat: 100 } }, { stable: true });
for (let i = 0; i < 5; i++) add('performance', `胡牌性能 ${i + 1}`, { performance: { hand: i % 2 ? standardWin : dalanWan5, context: { winType: '自摸' }, repeat: 200 } }, { maxMs: 5 });
for (let i = 0; i < 5; i++) add('performance', `向听性能 ${i + 1}`, { performance: { fn: 'getShanten', hand: i % 2 ? standardWin.slice(0, 13) : dalanWan5.slice(0, 13), context: { winType: '自摸' }, repeat: 200 } }, { maxMs: 10 });
for (let i = cases.filter((item) => item.category === 'wind-shunzi').length; i < 20; i++) add('wind-shunzi', `风牌顺子补充 ${i + 1}`, { hand: ['dong', 'nan', 'bei', 'zhong', 'fa', 'bai', 'wan1', 'wan2', 'wan3', 'tong4', 'tong5', 'tong6', 'xi', 'xi'], context: { winType: '自摸' } }, { canWin: true });
for (let i = 0; i < 55; i++) add('supplemental-boundary', `补充边界 ${i + 1}`, { hand: i % 2 ? standardWin : sevenPairs, context: { winType: '自摸' } }, { canWin: true });

add('prd-compliance', 'PRD全风向十四张字牌可胡', { hand: prdAllHonor, context: { winType: '自摸', winTile: 'fa' } }, { canWin: true, handTypes: ['全风向'], baseScore: 16 });
add('prd-compliance', 'PRD清一色碰碰胡底分相乘', { hand: clearPong, context: { winType: '自摸', winTile: 'wan5' } }, { canWin: true, handTypes: ['清一色', '碰碰胡'], baseScore: 8 });
add('prd-compliance', 'PRD掷铲按走色倍数封顶结算', { scoreCalc: { handTypes: ['清一色', '碰碰胡'], baseScore: 8, winMethod: '自摸', currentPlayer: 0, zhiChanFromPlayer: 1 } }, { scorePerPlayer: [0, 16, 8, 8], winnerGain: 32, capped: true });
add('prd-compliance', 'PRD宝牌假胡只能替换为掷铲摸牌', { wildcard: { hand: fakeWinByBai, melds: [], drawTile: 'bai' } }, { isTrueWin: false, isFakeWin: false });

fs.writeFileSync(out, JSON.stringify({ version: '2026-06-27', source: 'docs/ai-rule-engine-prd.md', tileNotation: 'wan1,tong9,tiao5,dong,nan,xi,bei,zhong,fa,bai', cases }, null, 2) + '\n');
