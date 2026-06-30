import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outPath = path.join(root, 'docs/l3-mcts-standard-cases.json');

const buckets = [
  ['ordinary-discard-override', 20],
  ['dalan-vs-normal', 20],
  ['kong-or-no-kong', 25],
  ['high-number-honor-kong-risk', 15],
  ['response-actions', 15],
  ['late-defense', 15],
  ['hidden-inference', 15],
  ['score-situation', 10],
  ['recommendation-panel', 10],
  ['timeout-fallback', 5],
];

const labels = {
  wan1: '一万',
  wan3: '三万',
  wan4: '四万',
  wan5: '五万',
  tiao7: '七条',
  dong: '东风',
  fa: '发财',
};

function actionText(candidate) {
  if (candidate.action === 'discard') return `打${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'pong') return `碰${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'kong') return `杠${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'win') return '胡';
  return '过';
}

function baseContext(seed, category) {
  return {
    turn: 20 + (seed % 8),
    player: seed % 4,
    phase: category === 'response-actions' ? 'responding' : category === 'recommendation-panel' ? 'recommendation' : 'discarding',
    timeLimitMs: 10000,
    scores: [100, 100, 100, 100],
    dealer: 0,
    wallRemaining: 58,
    discards: [['wan1'], ['wan3'], ['tiao7'], ['fa']],
    melds: [{ player: 1, tile: 'wan3', count: 3, type: 'peng' }],
    handSummary: ['wan3', 'wan4', 'wan5', 'tiao7', 'fa'],
    opponentThreats: [{ player: 1, tenpaiRisk: 0.25, dalanRisk: 0.2, honorRisk: 0.2 }],
    strongRuleAction: null,
    candidates: [],
  };
}

function discardCandidate(tile, baseScore, strong = false, extra = {}) {
  return {
    id: `discard-${tile}`,
    action: 'discard',
    tile,
    tileLabel: labels[tile] || tile,
    legal: true,
    baseScore,
    shantenAfter: 1,
    route: 'norm',
    defenseRisk: 0.15,
    dealInRisk: 0.15,
    kongRisk: 0,
    scoreImpact: 0,
    isStrongRuleChoice: strong,
    ...extra,
  };
}

function caseFor(category, seed) {
  const context = baseContext(seed, category);
  let expectedFinal = null;
  let expectedOverridden = null;
  let timeoutExpected = false;

  if (category === 'ordinary-discard-override') {
    context.candidates = [
      discardCandidate('wan3', 4, true),
      discardCandidate('wan4', 12),
      discardCandidate('fa', 2),
    ];
    context.strongRuleAction = actionText(context.candidates[0]);
    expectedFinal = '打四万';
    expectedOverridden = true;
  } else if (category === 'dalan-vs-normal') {
    context.candidates = [
      discardCandidate('wan3', 6, true),
      discardCandidate('fa', 12, false, { route: 'dalan', scoreImpact: 4 }),
    ];
    context.strongRuleAction = actionText(context.candidates[0]);
    expectedFinal = '打发财';
    expectedOverridden = true;
  } else if (category === 'kong-or-no-kong') {
    const allow = seed % 2 === 0;
    context.phase = 'responding';
    context.candidates = allow
      ? [
        { id: 'kong-wan5', action: 'kong', tile: 'wan5', tileLabel: '五万', legal: true, baseScore: 12, kongRisk: 0.12, scoreImpact: 4, isStrongRuleChoice: true },
        { id: 'pass', action: 'pass', tile: 'wan5', tileLabel: '五万', legal: true, baseScore: 1 },
      ]
      : [
        { id: 'kong-dong', action: 'kong', tile: 'dong', tileLabel: '东风', legal: true, baseScore: 8, kongRisk: 0.9, scoreImpact: 1, isStrongRuleChoice: true },
        { id: 'pass', action: 'pass', tile: 'dong', tileLabel: '东风', legal: true, baseScore: 5 },
      ];
    context.strongRuleAction = actionText(context.candidates[0]);
    context.opponentThreats = [{ player: 2, tenpaiRisk: allow ? 0.2 : 0.8, dalanRisk: allow ? 0.1 : 0.8, honorRisk: allow ? 0.1 : 0.8 }];
    expectedFinal = allow ? '杠五万' : '过';
  } else if (category === 'high-number-honor-kong-risk') {
    const tile = seed % 2 === 0 ? 'tiao7' : 'fa';
    context.phase = 'responding';
    context.candidates = [
      { id: `kong-${tile}`, action: 'kong', tile, tileLabel: labels[tile], legal: true, baseScore: 8, kongRisk: 0.75, scoreImpact: 1, isStrongRuleChoice: true },
      { id: 'pass', action: 'pass', tile, tileLabel: labels[tile], legal: true, baseScore: 5 },
    ];
    context.strongRuleAction = actionText(context.candidates[0]);
    context.opponentThreats = [{ player: 1, tenpaiRisk: 0.85, dalanRisk: 0.65, honorRisk: 0.7 }];
    expectedFinal = '过';
  } else if (category === 'response-actions') {
    context.phase = 'responding';
    context.candidates = [
      { id: 'win', action: 'win', tile: 'wan4', tileLabel: '四万', legal: true, baseScore: 4, scoreImpact: 2, isStrongRuleChoice: true },
      { id: 'pass', action: 'pass', tile: 'wan4', tileLabel: '四万', legal: true, baseScore: 12 },
    ];
    context.strongRuleAction = '胡';
    expectedFinal = '胡';
    expectedOverridden = false;
  } else if (category === 'late-defense') {
    context.turn = 56;
    context.scores = [120, 98, 91, 101];
    context.candidates = [
      discardCandidate('wan5', 11, true, { defenseRisk: 0.8, dealInRisk: 0.75 }),
      discardCandidate('wan1', 8, false, { defenseRisk: 0.05, dealInRisk: 0.05 }),
    ];
    context.strongRuleAction = actionText(context.candidates[0]);
    context.opponentThreats = [{ player: 2, tenpaiRisk: 0.8, dalanRisk: 0.2, honorRisk: 0.2 }];
    expectedFinal = '打一万';
    expectedOverridden = true;
  } else if (category === 'hidden-inference') {
    context.candidates = [
      discardCandidate('fa', 10, true, { defenseRisk: 0.85, dealInRisk: 0.85 }),
      discardCandidate('wan1', 7, false, { defenseRisk: 0.05, dealInRisk: 0.05 }),
    ];
    context.strongRuleAction = actionText(context.candidates[0]);
    context.opponentThreats = [{ player: 1, tenpaiRisk: 0.9, dalanRisk: 0.7, honorRisk: 0.85 }];
    expectedFinal = '打一万';
    expectedOverridden = true;
  } else if (category === 'score-situation') {
    const behind = seed % 2 === 0;
    context.scores = behind ? [80, 110, 105, 106] : [125, 98, 99, 100];
    context.player = 0;
    context.candidates = behind
      ? [
        discardCandidate('wan3', 6, true),
        discardCandidate('fa', 8, false, { route: 'quanzheng', scoreImpact: 5 }),
      ]
      : [
        discardCandidate('wan5', 10, true, { defenseRisk: 0.65, dealInRisk: 0.7 }),
        discardCandidate('wan1', 7, false, { defenseRisk: 0.05, dealInRisk: 0.05 }),
      ];
    context.strongRuleAction = actionText(context.candidates[0]);
    expectedFinal = behind ? '打发财' : '打一万';
    expectedOverridden = true;
  } else if (category === 'recommendation-panel') {
    context.phase = 'recommendation';
    context.candidates = [
      discardCandidate('wan3', 5, true),
      discardCandidate('wan4', 11),
    ];
    context.strongRuleAction = actionText(context.candidates[0]);
    expectedFinal = '打四万';
    expectedOverridden = true;
  } else if (category === 'timeout-fallback') {
    context.timeLimitMs = 1;
    context.candidates = [
      discardCandidate('wan3', 5, true),
      discardCandidate('wan4', 8),
    ];
    context.strongRuleAction = actionText(context.candidates[0]);
    expectedFinal = '打四万';
    timeoutExpected = true;
  }

  return {
    id: `l3-mcts-${String(seed).padStart(3, '0')}`,
    level: 'L3',
    category,
    description: `阶段五 MCTS 标准用例：${category}`,
    context,
    expected: {
      finalAction: expectedFinal,
      overridden: expectedOverridden,
      timeoutExpected,
      legalOnly: true,
      requiredExportFields: true,
      noTechnicalUiTerms: true,
    },
  };
}

const cases = [];
let seed = 1;
for (const [category, count] of buckets) {
  for (let i = 0; i < count; i += 1) {
    cases.push(caseFor(category, seed));
    seed += 1;
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify({ schemaVersion: 'l3-mcts-standard-cases-v1', total: cases.length, distribution: Object.fromEntries(buckets), cases }, null, 2)}\n`, 'utf8');
console.log(`Generated ${cases.length} L3 MCTS cases at ${path.relative(root, outPath)}`);
