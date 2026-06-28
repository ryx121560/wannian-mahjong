import fs from 'node:fs';

const out = 'docs/strong-rule-ai-l2-cases.json';
const cases = [];

function add(category, description, input, expected) {
  const count = cases.filter((item) => item.category === category).length + 1;
  cases.push({
    id: `L2-${category}-${String(count).padStart(3, '0')}`,
    level: 'L2',
    category,
    description,
    melds: [],
    discards: [[], [], [], []],
    scores: [100, 100, 100, 100],
    turn: 3,
    currentPlayer: 0,
    dealer: 0,
    wallRemaining: 80,
    ...input,
    expected,
  });
}

const dalanHand = ['wan1', 'wan4', 'wan8', 'tiao2', 'tiao6', 'tong3', 'tong7', 'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'];
const earlyHand = ['wan2', 'wan3', 'tong4', 'tong5', 'tiao6', 'tiao7', 'wan9', 'tong9', 'dong', 'fa', 'wan5', 'wan6', 'tiao1', 'bai'];
const tenpaiHand = ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7', 'wan6', 'wan7', 'dong', 'dong', 'bai'];
const kongHand = ['wan1', 'wan1', 'wan1', 'wan1', 'tong2', 'tong3', 'tong4', 'tiao5', 'tiao6', 'tiao7', 'dong', 'dong', 'fa', 'bai'];
const windHand = ['dong', 'nan', 'xi', 'wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao6', 'tiao7', 'tiao8', 'bai', 'fa'];
const positionLead = ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7', 'wan8', 'dong', 'fa', 'bai', 'bei'];
const stackHand = ['wan1', 'wan1', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4', 'wan5', 'wan5', 'wan6', 'wan6', 'dong', 'fa'];
const capHand = ['dong', 'dong', 'dong', 'nan', 'nan', 'nan', 'xi', 'xi', 'xi', 'bei', 'bei', 'bei', 'fa', 'fa'];

for (let i = 0; i < 40; i += 1) {
  add('dalan-route', `打烂路线启动 ${i + 1}`, { hand: dalanHand, turn: 3 + (i % 4) }, {
    bestDiscard: ['wan8', 'tiao2', 'tiao6', 'tong3', 'tong7', 'bai'],
    unacceptableDiscards: ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa'],
    reasoningKeywords: ['打烂'],
  });
}

for (let i = 0; i < 50; i += 1) {
  add('early-discard', `序盘孤张优先 ${i + 1}`, { hand: earlyHand, turn: 1 + (i % 6) }, {
    bestDiscard: ['dong', 'fa', 'bai', 'wan9', 'tong9', 'tiao1'],
    unacceptableDiscards: ['wan2', 'wan3', 'tong4', 'tong5', 'tiao6', 'tiao7', 'wan5', 'wan6'],
    reasoningKeywords: ['序盘'],
  });
}

for (let i = 0; i < 40; i += 1) {
  add('tenpai-choice', `听牌质量 ${i + 1}`, { hand: tenpaiHand, turn: 9 + (i % 5) }, {
    bestDiscard: ['bai'],
    unacceptableDiscards: ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7', 'dong'],
    reasoningKeywords: ['听牌'],
  });
}

for (let i = 0; i < 30; i += 1) {
  add('kong-zhichan', `杠直铲潜力 ${i + 1}`, { hand: kongHand, turn: 8 + (i % 4) }, {
    bestDiscard: ['fa', 'bai', 'dong'],
    unacceptableDiscards: ['wan1'],
    reasoningKeywords: ['杠'],
  });
}

for (let i = 0; i < 20; i += 1) {
  add('wind-shunzi', `风牌顺子保留 ${i + 1}`, { hand: windHand, turn: 5 + (i % 3) }, {
    bestDiscard: ['bai', 'fa'],
    unacceptableDiscards: ['dong', 'nan', 'xi'],
    reasoningKeywords: ['结构'],
  });
}

for (let i = 0; i < 20; i += 1) {
  add('pass-rule', `过水策略占位 ${i + 1}`, { hand: tenpaiHand, turn: 10, scores: i % 2 ? [92, 100, 100, 100] : [110, 100, 100, 100] }, {
    bestDiscard: ['bai'],
    unacceptableDiscards: ['dong'],
    reasoningKeywords: ['听牌'],
  });
}

for (let i = 0; i < 25; i += 1) {
  add('position', `分数位置 ${i + 1}`, { hand: positionLead, turn: 13 + (i % 5), scores: i % 2 ? [90, 100, 101, 99] : [116, 100, 100, 100], discards: [['bai'], ['fa'], ['dong'], ['bei']] }, {
    bestDiscard: i % 2 ? ['dong', 'fa', 'bai', 'bei', 'wan8'] : ['bai', 'fa', 'dong', 'bei'],
    unacceptableDiscards: ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5'],
    reasoningKeywords: [i % 2 ? '打点' : '防守'],
  });
}

for (let i = 0; i < 25; i += 1) {
  add('structure-protection', `结构保护 ${i + 1}`, { hand: earlyHand, turn: 6 + (i % 3) }, {
    bestDiscard: ['dong', 'fa', 'bai', 'wan9', 'tong9', 'tiao1'],
    unacceptableDiscards: ['wan2', 'wan3', 'tong4', 'tong5', 'tiao6', 'tiao7'],
    reasoningKeywords: ['结构'],
  });
}

for (let i = 0; i < 25; i += 1) {
  add('hand-stack', `牌型叠加 ${i + 1}`, { hand: stackHand, turn: 7 + (i % 5) }, {
    bestDiscard: ['dong', 'fa'],
    unacceptableDiscards: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6'],
    reasoningKeywords: ['打点'],
  });
}

for (let i = 0; i < 25; i += 1) {
  add('cap-awareness', `封顶意识 ${i + 1}`, { hand: capHand, turn: 12 + (i % 5), scores: [100, 100, 100, 100] }, {
    bestDiscard: ['fa'],
    unacceptableDiscards: ['dong', 'nan', 'xi', 'bei'],
    reasoningKeywords: ['打点'],
  });
}

fs.writeFileSync(out, JSON.stringify({ version: '2026-06-27', source: '万年麻将阶段二PRD-强规则AI.md', targetConsistency: 0.85, cases }, null, 2) + '\n', 'utf8');
console.log(`Generated ${cases.length} L2 AI cases at ${out}`);
