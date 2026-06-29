import fs from 'node:fs';

const out = 'docs/strong-rule-ai-l2-defense-cases.json';
const cases = [];

const farHand = ['tiao7', 'tiao4', 'tong1', 'tong1', 'tong6', 'tong2', 'tiao3', 'tiao4', 'tong5', 'tong3', 'wan8', 'wan3', 'tong9', 'tiao2'];
const tenpaiHand = ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7', 'wan6', 'wan7', 'dong', 'dong', 'bai'];
const balancedHand = ['wan2', 'wan5', 'wan8', 'tiao3', 'tiao7', 'tong4', 'tong9', 'dong', 'nan', 'xi', 'zhong', 'fa', 'bai', 'wan3'];
const safeHonors = ['dong', 'nan', 'xi', 'fa', 'bai', 'zhong'];
const numberSafes = ['wan1', 'wan4', 'wan7', 'tiao1', 'tiao4', 'tiao7', 'tong1', 'tong4', 'tong7'];
const allBest = [...safeHonors, ...numberSafes, 'wan2', 'wan5', 'wan8', 'tiao3', 'tiao7', 'tong4', 'tong9', 'wan3', 'tong1', 'tong2', 'tong3', 'tong5', 'tong6', 'tiao2', 'tiao4'];

function meld(type, tiles) {
  return { type, tiles };
}

function emptyMelds() {
  return [[], [], [], []];
}

function threatMelds(kind = 'peng') {
  return [
    [],
    [meld(kind, kind === 'mingGang' || kind === 'anGang' ? ['tong5', 'tong5', 'tong5', 'tong5'] : ['tong5', 'tong5', 'tong5']), meld('peng', ['tiao4', 'tiao4', 'tiao4'])],
    [],
    [],
  ];
}

function add(category, description, input, expected) {
  const count = cases.filter((item) => item.category === category).length + 1;
  cases.push({
    id: `L2-${category}-${String(count).padStart(3, '0')}`,
    level: 'L2',
    category,
    description,
    hand: farHand,
    melds: [],
    discards: [[], ['wan9', 'tiao9', 'tong9', 'wan4', 'tiao5', 'tong5'], ['dong'], ['bei']],
    allMelds: threatMelds(),
    scores: [100, 100, 100, 100],
    turn: 11,
    currentPlayer: 0,
    dealer: 0,
    wallRemaining: 30,
    passRecords: [],
    ...input,
    expected,
  });
}

function defenseExpected(bestDiscard, expectedState, keywords, unacceptable = []) {
  return {
    bestDiscard,
    unacceptableDiscards: unacceptable,
    expectedState,
    reasoningKeywords: keywords,
  };
}

for (let i = 0; i < 15; i += 1) {
  add('defense-genpai', `genpai defense ${i + 1}`, {
    hand: balancedHand,
    discards: [[], ['wan3', 'wan5', 'tong2', 'tiao8', 'nan', 'tong5'], ['wan3'], ['wan3']],
  }, defenseExpected(['wan3', 'wan5', 'nan', ...safeHonors], 'half-fold', ['genpai', 'half-fold'], ['wan8', 'tiao7']));
}

for (let i = 0; i < 15; i += 1) {
  add('defense-suji', `suji defense ${i + 1}`, {
    hand: balancedHand,
    discards: [[], ['wan6', 'wan9', 'tiao4', 'tong6', 'fa', 'tong5'], ['dong'], ['bei']],
  }, defenseExpected(['wan3', 'wan5', 'tiao1', 'tiao7', 'tong3', 'tong9', ...safeHonors], 'half-fold', ['suji', 'half-fold'], ['wan8']));
}

for (let i = 0; i < 10; i += 1) {
  add('defense-kabe', `kabe defense ${i + 1}`, {
    hand: ['wan2', 'wan3', 'wan5', 'wan6', 'tiao1', 'tiao4', 'tiao7', 'tong1', 'tong4', 'dong', 'nan', 'xi', 'fa', 'bai'],
    discards: [['wan4'], ['wan4', 'tong2', 'tong5', 'tiao8'], ['wan4'], ['wan4']],
  }, defenseExpected(['wan2', 'wan3', 'wan5', 'wan6', ...safeHonors], 'half-fold', ['kabe', 'half-fold'], ['tiao7']));
}

for (let i = 0; i < 10; i += 1) {
  add('defense-outer', `outer tile defense ${i + 1}`, {
    hand: balancedHand,
    discards: [[], ['wan1', 'wan9', 'tong1', 'tong9', 'fa'], ['dong'], ['bei']],
    allMelds: [[], [meld('peng', ['tiao3', 'tiao3', 'tiao3']), meld('peng', ['tiao8', 'tiao8', 'tiao8'])], [], []],
  }, defenseExpected(['wan3', 'wan2', 'wan5', 'wan8', 'tong4', 'tong9', ...safeHonors], 'half-fold', ['outer', 'half-fold'], ['tiao3', 'tiao7']));
}

for (let i = 0; i < 15; i += 1) {
  add('defense-wildcard', `wildcard safety invalidation ${i + 1}`, {
    hand: balancedHand,
    discards: [[], ['wan3', 'wan5', 'tong2', 'tiao8', 'nan'], ['dong'], ['bei']],
    allMelds: threatMelds(i % 2 ? 'mingGang' : 'anGang'),
  }, defenseExpected(['wan3', 'wan5', 'nan', ...safeHonors], 'half-fold', ['wildcard-risk', 'half-fold'], ['wan8', 'tiao7']));
}

for (let i = 0; i < 15; i += 1) {
  const attack = i % 3 === 0;
  const full = i % 3 === 1;
  add('defense-fsm', `attack defense fsm ${i + 1}`, {
    hand: attack ? tenpaiHand : farHand,
    scores: attack ? [85, 105, 105, 105] : full ? [125, 98, 92, 95] : [100, 100, 100, 100],
    turn: full ? 14 : 11,
    allMelds: threatMelds(),
  }, defenseExpected(attack ? allBest : full ? [...safeHonors, ...numberSafes] : allBest, attack ? 'attack' : full ? 'full-fold' : 'half-fold', [attack ? 'attack' : full ? 'full-fold' : 'half-fold'], attack ? [] : ['wan7']));
}

for (let i = 0; i < 10; i += 1) {
  add('defense-quanfeng', `quanfeng defense ${i + 1}`, {
    hand: farHand,
    discards: [[], ['dong', 'nan', 'xi', 'fa'], ['wan5'], ['tong5']],
    allMelds: [[], [meld('peng', ['bei', 'bei', 'bei'])], [], []],
    turn: 13,
  }, defenseExpected(numberSafes, 'half-fold', ['quanfeng', 'half-fold'], safeHonors));
}

for (let i = 0; i < 5; i += 1) {
  add('defense-dalan', `dalan opponent relaxed ${i + 1}`, {
    hand: balancedHand,
    discards: [[], ['wan1', 'tiao4', 'tong7', 'fa', 'wan8', 'tiao2'], ['dong'], ['bei']],
    allMelds: emptyMelds(),
  }, defenseExpected(allBest, 'attack', ['dalan', 'attack'], []));
}

for (let i = 0; i < 5; i += 1) {
  add('defense-pass', `pass information ${i + 1}`, {
    hand: balancedHand,
    passRecords: [{ player: 1, tile: 'wan3', round: 11 }],
  }, defenseExpected(['wan3', 'wan5', ...safeHonors], 'half-fold', ['pass-safe', 'half-fold'], ['wan8']));
}

for (let i = 0; i < 10; i += 1) {
  add('defense-late', `late comprehensive defense ${i + 1}`, {
    hand: farHand,
    turn: 14,
    discards: [[], ['wan5', 'tong2', 'tiao8', 'nan', 'wan4'], ['dong'], ['bei']],
    allMelds: threatMelds(),
  }, defenseExpected([...safeHonors, ...numberSafes], 'half-fold', ['late', 'half-fold'], ['wan7']));
}

for (let i = 0; i < 5; i += 1) {
  add('defense-lead', `lead protection ${i + 1}`, {
    hand: farHand,
    scores: [128, 95, 91, 96],
    turn: 14,
    allMelds: threatMelds(),
  }, defenseExpected([...safeHonors, ...numberSafes], 'full-fold', ['full-fold'], ['wan7']));
}

for (let i = 0; i < 5; i += 1) {
  add('defense-behind', `behind attack ${i + 1}`, {
    hand: tenpaiHand,
    scores: [82, 108, 105, 101],
    turn: 14,
    allMelds: threatMelds(),
  }, defenseExpected(allBest, 'attack', ['attack'], []));
}

fs.writeFileSync(out, JSON.stringify({ version: '2026-06-29', source: '万年麻将阶段三PRD-对手建模与防守系统.md', targetConsistency: 0.85, cases }, null, 2) + '\n', 'utf8');
console.log(`Generated ${cases.length} L2 defense cases at ${out}`);
