import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outPath = path.join(root, 'docs/stage4-recommendation-cases.json');
const buckets = [
  ['active-explanation', 15],
  ['candidate-ranking', 10],
  ['click-analysis', 10],
  ['same-tile-visible-count', 10],
  ['river-opponent-analysis', 15],
  ['ai-discard-interpretation', 10],
  ['response-recommendation', 15],
  ['round-review', 10],
  ['game-summary', 5],
];

const labels = {
  wan3: '三万',
  wan4: '四万',
  wan5: '五万',
  tong3: '三筒',
  tiao7: '七条',
  fa: '发财',
};

function context(seed, category) {
  const selected = seed % 2 === 0 ? 'wan3' : 'tong3';
  const response = category === 'response-recommendation'
    ? { fromPlayer: 1, fromName: 'AI下家', tile: 'wan5', tileLabel: '五万', actions: seed % 3 === 0 ? ['胡', '碰', '杠', '直铲', '过'] : ['碰', '杠', '直铲', '过'] }
    : null;
  const previousRound = category === 'round-review' || category === 'game-summary'
    ? { id: `round-${seed}`, type: 'discard', turn: seed, confidence: '高', recommendedAction: '打三万', actualAction: seed % 2 === 0 ? '打三万' : '打三筒', adopted: seed % 2 === 0, strategyGap: seed % 2 === 0 ? '选择一致' : '策略差异明显', reasons: ['系统推荐围绕牌效速度和防守安全'], sections: [] }
    : null;
  const records = previousRound ? [previousRound] : [];
  return {
    turn: seed,
    phaseLabel: response ? 'responding' : 'discarding',
    currentPlayer: 0,
    hand: ['wan3', 'wan4', 'wan5', 'tong3', 'tiao7', 'fa'],
    handLabels: labels,
    selectedTile: selected,
    systemRecommendation: { tile: 'wan3', tileLabel: '三万', totalScore: 14 + (seed % 3), shantenAfter: 1, route: 'norm', speedScore: 1, handValueScore: 0.8, waitQualityScore: 0.5, defenseScore: 0.4, waitRemaining: 6 },
    candidates: [
      { tile: 'wan3', tileLabel: '三万', totalScore: 14 + (seed % 3), shantenAfter: 1, route: 'norm', speedScore: 1, handValueScore: 0.8, waitQualityScore: 0.5, defenseScore: 0.4, waitRemaining: 6 },
      { tile: 'tong3', tileLabel: '三筒', totalScore: 5 + (seed % 2), shantenAfter: 2, route: 'dalan', dalanRouteScore: 0.8, defenseScore: 0.1, breaksTaatsu: true },
      { tile: 'fa', tileLabel: '发财', totalScore: 2, shantenAfter: 2, route: 'norm', defenseScore: 0.9, breaksPair: true },
    ],
    discards: [['wan3'], ['tong3', 'wan3'], ['fa'], ['tiao7']],
    melds: [{ player: 1, tile: 'wan3', count: 3, type: 'peng' }],
    scores: [101, 98, 100, 101],
    aiLastDiscard: category === 'ai-discard-interpretation' ? { player: 1, playerName: 'AI下家', tile: 'tong3', tileLabel: '三筒' } : null,
    responseEvent: response,
    previousRound,
    records,
  };
}

const cases = [];
let id = 1;
for (const [category, count] of buckets) {
  for (let i = 0; i < count; i += 1) {
    const ctx = context(id, category);
    cases.push({
      id: `stage4-${String(id).padStart(3, '0')}`,
      level: 'stage4',
      category,
      description: `阶段四推荐系统用例：${category}`,
      context: ctx,
      expected: {
        sections: 10,
        keywords: category === 'response-recommendation' ? ['响应阶段推荐', '系统建议', '直铲', '过'] : ['系统推荐', '详细推荐理由', '牌河与对手分析'],
        stableSystemTile: 'wan3',
        noRawFields: true,
        publicOnly: true,
      },
    });
    id += 1;
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify({ schemaVersion: 'stage4-recommendation-cases-v1', total: cases.length, cases }, null, 2)}\n`, 'utf8');
console.log(`Generated ${cases.length} stage4 recommendation cases at ${path.relative(root, outPath)}`);
