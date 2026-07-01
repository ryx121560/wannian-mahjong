import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outPath = path.join(root, 'docs/stage6-data-model-cases.json');

const distribution = {
  'route-transition': 30,
  'complex-ranking': 20,
  'model-vs-mcts-disagreement': 20,
  'labels-rewards': 15,
  'rule-constraint-blocks': 20,
  'score-position': 15,
  'recommendation-explanation': 10,
  'export-fields': 10,
  'eight-dim-removal': 5,
  'inference-performance': 5,
};

function baseContext(id, overrides = {}) {
  const player = id % 4;
  const scores = overrides.scores || [100, 98, 101, 99];
  return {
    turn: 24 + (id % 30),
    player,
    phase: overrides.phase || 'discarding',
    timeLimitMs: overrides.timeLimitMs || 10000,
    scores,
    dealer: 0,
    wallRemaining: 70 - (id % 18),
    discards: [
      ['wan1', 'tong9'],
      ['nan', 'tiao8'],
      ['bai', 'wan9'],
      ['dong', 'tong1'],
    ],
    melds: overrides.melds || [],
    handSummary: ['wan1', 'wan2', 'wan3', 'tong2', 'tong3', 'tong4', 'fa'],
    opponentThreats: overrides.opponentThreats || [
      { player: 1, tenpaiRisk: 0.25, dalanRisk: 0.1, honorRisk: 0.2 },
      { player: 2, tenpaiRisk: 0.35, dalanRisk: 0.2, honorRisk: 0.25 },
      { player: 3, tenpaiRisk: 0.2, dalanRisk: 0.15, honorRisk: 0.2 },
    ],
    strongRuleAction: overrides.strongRuleAction || '打南',
    candidates: overrides.candidates,
  };
}

function discard(id, tile, label, baseScore, extra = {}) {
  return {
    id: `discard:${id}:${tile}`,
    action: 'discard',
    tile,
    tileLabel: label,
    legal: extra.legal ?? true,
    baseScore,
    shantenAfter: extra.shantenAfter ?? 1,
    route: extra.route || 'norm',
    breaksRoute: !!extra.breaksRoute,
    dragonComboBreak: !!extra.dragonComboBreak,
    isolatedDiscardPriority: extra.isolatedDiscardPriority || 0,
    defenseRisk: extra.defenseRisk ?? 0.2,
    dealInRisk: extra.dealInRisk ?? 0.2,
    kongRisk: 0,
    scoreImpact: extra.scoreImpact || 0,
    waitCount: extra.waitCount ?? 1,
    waitRemaining: extra.waitRemaining ?? 2,
    isStrongRuleChoice: !!extra.strong,
    modelFeatures: extra.modelFeatures,
  };
}

function makeCase(category, index) {
  const id = index + 1;
  const base = {
    id: `stage6-${category}-${String(id).padStart(3, '0')}`,
    category,
    expected: {
      legalOnly: true,
      requiredModelFields: true,
      noInternalFieldLeak: true,
    },
  };

  if (category === 'route-transition') {
    base.context = baseContext(id, {
      candidates: [
        discard(0, 'nan', '南', 10, { strong: true, route: 'norm', waitRemaining: 1 }),
        discard(1, 'tong2', '2筒', 10.35, { route: 'dalan', waitCount: 3, waitRemaining: 7, scoreImpact: 2, modelFeatures: { routeTransition: true } }),
        discard(2, 'wan9', '9万', 8.5, { route: 'norm', isolatedDiscardPriority: 2 }),
      ],
    });
    base.expected.requiresRouteTransition = true;
    return base;
  }

  if (category === 'complex-ranking') {
    base.context = baseContext(id, {
      candidates: [
        discard(0, 'nan', '南', 9.2, { strong: true, waitRemaining: 2 }),
        discard(1, 'wan1', '1万', 9.8, { isolatedDiscardPriority: 5, waitRemaining: 4, waitCount: 2 }),
        discard(2, 'fa', '发', 9.7, { dragonComboBreak: true, waitRemaining: 5 }),
      ],
    });
    return base;
  }

  if (category === 'model-vs-mcts-disagreement') {
    base.context = baseContext(id, {
      strongRuleAction: '打南',
      candidates: [
        discard(0, 'nan', '南', 8, { strong: true, route: 'norm' }),
        discard(1, 'tong2', '2筒', 13, { route: 'norm', waitRemaining: 1, dealInRisk: 0.15 }),
        discard(2, 'wan1', '1万', 10.5, { route: 'dalan', waitRemaining: 8, scoreImpact: 2, modelFeatures: { routeTransition: true } }),
      ],
    });
    base.expected.noClearMctsOverride = true;
    return base;
  }

  if (category === 'rule-constraint-blocks') {
    base.context = baseContext(id, {
      candidates: [
        discard(0, 'nan', '南', 9, { strong: true }),
        discard(1, 'tong2', '2筒', 11, { legal: false, route: 'dalan', waitRemaining: 8 }),
        discard(2, 'wan1', '1万', 8.8, { shantenAfter: 0, waitCount: 0, waitRemaining: 0 }),
      ],
    });
    base.expected.requiresRuleBlock = true;
    return base;
  }

  if (category === 'score-position') {
    const leading = id % 2 === 0;
    base.context = baseContext(id, {
      scores: leading ? [130, 90, 95, 100] : [80, 110, 105, 115],
      candidates: [
        discard(0, 'nan', '南', 9.8, { strong: true, dealInRisk: leading ? 0.1 : 0.35 }),
        discard(1, 'tong2', '2筒', 10.2, { scoreImpact: leading ? 0 : 3, dealInRisk: leading ? 0.55 : 0.25 }),
        discard(2, 'wan1', '1万', 9.5, { waitRemaining: 4 }),
      ],
    });
    return base;
  }

  const commonCandidates = [
    discard(0, 'nan', '南', 9.6, { strong: true }),
    discard(1, 'tong2', '2筒', 10.2, { waitRemaining: 4, waitCount: 2 }),
    discard(2, 'wan9', '9万', 8.7, { isolatedDiscardPriority: 3 }),
  ];
  base.context = baseContext(id, {
    phase: category === 'recommendation-explanation' ? 'recommendation' : 'discarding',
    timeLimitMs: category === 'inference-performance' ? 1 : 10000,
    candidates: commonCandidates,
  });
  return base;
}

const cases = [];
for (const [category, count] of Object.entries(distribution)) {
  for (let i = 0; i < count; i += 1) cases.push(makeCase(category, cases.length));
}

const output = {
  schemaVersion: 'stage6-data-model-cases-v1',
  generatedAt: new Date().toISOString(),
  distribution,
  cases,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, outPath)} with ${cases.length} cases`);
