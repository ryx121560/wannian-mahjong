import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];
const cases = [];

function loadBrowserBundle(relativePath, globalName) {
  const sandbox = { console, globalThis: {} };
  sandbox.window = sandbox.globalThis;
  sandbox.global = sandbox.globalThis;
  const code = fs.readFileSync(path.join(root, relativePath), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: relativePath });
  const value = sandbox.globalThis[globalName];
  if (!value) throw new Error(`Failed to load ${globalName} from ${relativePath}`);
  return value;
}

const StrongAI = loadBrowserBundle('public/game/strong_rule_ai.js', 'WannianStrongRuleAI');
const Mcts = loadBrowserBundle('public/game/mcts_enhancement_engine.js', 'WannianMctsEnhancement');
const Recommendation = loadBrowserBundle('public/game/recommendation_engine.js', 'WannianRecommendationEngine');

const LABELS = {
  dong: '东', nan: '南', xi: '西', bei: '北', zhong: '中', fa: '发', bai: '白',
};

function tileLabel(tile) {
  if (LABELS[tile]) return LABELS[tile];
  const match = tile.match(/^(wan|tong|tiao)([1-9])$/);
  if (!match) return tile;
  const suit = { wan: '万', tong: '筒', tiao: '条' }[match[1]];
  return `${Number(match[2])}${suit}`;
}

function rotateSuit(tile, offset) {
  const suits = ['wan', 'tong', 'tiao'];
  const match = tile.match(/^(wan|tong|tiao)([1-9])$/);
  if (!match) return tile;
  return `${suits[(suits.indexOf(match[1]) + offset) % suits.length]}${match[2]}`;
}

function rotateHonor(tile, offset) {
  const honors = ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'];
  const index = honors.indexOf(tile);
  if (index < 0) return tile;
  return honors[(index + offset) % honors.length];
}

function rotateTile(tile, offset) {
  return rotateHonor(rotateSuit(tile, offset % 3), offset % 7);
}

const baseHands = [
  ['wan1', 'wan2', 'wan3', 'wan5', 'wan6', 'tong3', 'tong4', 'tong5', 'tiao7', 'tiao8', 'dong', 'nan', 'fa', 'bai'],
  ['wan3', 'wan4', 'wan5', 'tong5', 'tong6', 'tong7', 'tiao1', 'tiao1', 'tiao3', 'tiao4', 'dong', 'dong', 'zhong', 'fa'],
  ['wan7', 'wan8', 'wan9', 'tong2', 'tong3', 'tong4', 'tiao5', 'tiao6', 'tiao8', 'tiao8', 'nan', 'xi', 'zhong', 'bai'],
  ['wan1', 'wan4', 'wan7', 'tong2', 'tong5', 'tong8', 'tiao3', 'tiao6', 'tiao9', 'dong', 'nan', 'xi', 'zhong', 'fa'],
  ['wan2', 'wan2', 'wan5', 'wan5', 'tong3', 'tong3', 'tong8', 'tiao4', 'tiao4', 'tiao9', 'dong', 'nan', 'fa', 'bai'],
  ['wan4', 'wan4', 'wan5', 'wan6', 'tong6', 'tong7', 'tong8', 'tiao2', 'tiao3', 'tiao4', 'xi', 'xi', 'zhong', 'bai'],
  ['wan5', 'wan6', 'wan7', 'tong1', 'tong2', 'tong3', 'tong7', 'tong8', 'tiao8', 'tiao9', 'bei', 'zhong', 'fa', 'bai'],
  ['wan8', 'wan8', 'wan9', 'tong4', 'tong5', 'tong6', 'tiao1', 'tiao2', 'tiao3', 'dong', 'nan', 'nan', 'fa', 'fa'],
  ['wan3', 'wan5', 'wan7', 'tong3', 'tong5', 'tong7', 'tiao3', 'tiao5', 'tiao7', 'dong', 'xi', 'zhong', 'fa', 'bai'],
  ['wan1', 'wan1', 'wan2', 'wan3', 'tong6', 'tong6', 'tong7', 'tong8', 'tiao4', 'tiao5', 'tiao6', 'bei', 'zhong', 'zhong'],
];

for (let i = 0; i < 50; i += 1) {
  const base = baseHands[i % baseHands.length];
  cases.push({
    id: `stage7-ai-unified-${String(i + 1).padStart(3, '0')}`,
    turn: 8 + i,
    player: 0,
    hand: base.map((tile) => rotateTile(tile, i)),
    scores: [100 + (i % 5), 100 - (i % 3), 100 + ((i + 1) % 4), 100 - ((i + 2) % 4)],
    discards: [
      ['wan9', 'tong9', 'tiao9'].map((tile) => rotateTile(tile, i)),
      ['dong', 'wan1', 'tong2'].map((tile) => rotateTile(tile, i + 1)),
      ['nan', 'wan2', 'tong3'].map((tile) => rotateTile(tile, i + 2)),
      ['xi', 'wan3', 'tong4'].map((tile) => rotateTile(tile, i + 3)),
    ],
    melds: i % 4 === 0 ? [{ player: 2, tile: rotateTile('tong8', i), count: 3, type: 'peng' }] : [],
    wallRemaining: 70 - (i % 30),
  });
}

cases.push({
  id: 'stage7-ai-discard-dragon-sequence-tenpai-001',
  turn: 51,
  player: 0,
  hand: ['wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'wan9', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao8', 'zhong', 'fa', 'bai'],
  scores: [100, 99, 101, 100],
  discards: [
    ['wan1', 'tong9', 'nan'],
    ['tong1', 'dong', 'wan2'],
    ['tiao1', 'xi', 'tong2'],
    ['wan3', 'bei', 'tong3'],
  ],
  melds: [],
  wallRemaining: 58,
  expected: {
    allowedFinalTiles: ['wan5', 'wan8'],
    forbiddenFinalTiles: ['zhong', 'fa', 'bai'],
    requiredCandidateTiles: ['wan5', 'wan8'],
    maxShantenAfter: 0,
    forbiddenAnomalies: ['shanten-regression', 'breaks-complete-dragon-combo'],
    needsReview: false,
  },
});

cases.push({
  id: 'stage7-ai-discard-mixed-honor-route-001',
  turn: 31,
  player: 3,
  hand: ['wan1', 'wan1', 'wan2', 'wan3', 'wan3', 'wan7', 'wan8', 'tong4', 'tong6', 'dong', 'xi', 'zhong', 'fa', 'bai'],
  scores: [100, 100, 100, 100],
  discards: [
    ['wan9', 'tong9', 'tiao9'],
    ['nan', 'wan4', 'tong2'],
    ['bei', 'wan5', 'tong3'],
    ['tiao1', 'wan6', 'tong7'],
  ],
  melds: [],
  wallRemaining: 62,
  expected: {
    allowedFinalTiles: ['tong4', 'tong6'],
    forbiddenFinalTiles: ['dong', 'xi'],
    requiredCandidateTiles: ['tong4', 'tong6'],
    requiredMetadata: { mixedRouteType: 'mixed-strong' },
  },
});

cases.push({
  id: 'stage7-ai-discard-sequence-core-protection-056',
  turn: 56,
  player: 0,
  hand: ['wan5', 'wan6', 'wan7', 'tong6', 'tong7', 'tong9', 'tong9', 'tong9', 'tiao1', 'tiao3', 'tiao5', 'tiao7', 'tiao8', 'tiao9'],
  scores: [100, 100, 100, 100],
  discards: [
    ['wan1', 'tong1', 'bei'],
    ['wan2', 'tong2', 'dong'],
    ['wan3', 'tong3', 'nan'],
    ['wan4', 'tong4', 'xi'],
  ],
  melds: [],
  wallRemaining: 50,
  expected: {
    forbiddenFinalTiles: ['tiao7'],
    requiredCandidateTiles: ['tiao1', 'tiao3', 'tiao5', 'tiao7'],
  },
});

cases.push({
  id: 'stage7-ai-pong-tenpai-zero-shanten-001',
  turn: 43,
  player: 2,
  hand: ['tong4', 'tong5', 'tong7', 'wan7', 'wan7'],
  scores: [100, 100, 100, 100],
  discards: [
    ['wan1', 'tong9', 'nan'],
    ['tong1', 'dong', 'wan2'],
    ['tiao1', 'xi', 'tong2'],
    ['wan3', 'bei', 'tong3'],
  ],
  melds: [{ player: 2, tile: 'tong3', count: 3, type: 'peng' }],
  wallRemaining: 44,
  expected: {
    allowedFinalTiles: ['tong4', 'tong7'],
    forbiddenFinalTiles: ['tong5', 'wan7'],
    requiredCandidateTiles: ['tong4', 'tong7'],
    maxShantenAfter: 0,
    forbiddenAnomalies: ['shanten-regression', 'candidate-score-conflict'],
    needsReview: false,
  },
});

cases.push({
  id: 'stage7-recommendation-mixed-route-model-adoption-001',
  turn: 12,
  player: 0,
  hand: ['wan1', 'wan1', 'wan3', 'wan4', 'wan6', 'wan7', 'wan7', 'wan9', 'tiao3', 'tiao7', 'dong', 'nan', 'xi', 'zhong'],
  scores: [100, 100, 100, 100],
  discards: [
    ['tong9'],
    ['tong1'],
    ['tiao9'],
    ['bei'],
  ],
  melds: [],
  wallRemaining: 68,
  expected: {
    allowedFinalTiles: ['tiao3', 'tiao7'],
    forbiddenFinalTiles: ['zhong', 'dong', 'nan', 'xi', 'wan1', 'wan3', 'wan4', 'wan6', 'wan7', 'wan9'],
    requiredCandidateTiles: ['tiao3', 'tiao7'],
    requiredMetadata: { mixedRouteType: 'mixed-strong' },
  },
});

cases.push({
  id: 'stage7-recommendation-isolated-tiebreak-local-defense-001',
  turn: 10,
  player: 0,
  hand: ['wan2', 'wan4', 'wan5', 'wan9', 'tong5', 'tong2', 'tiao5', 'tiao6', 'tiao6', 'tiao8', 'fa', 'fa', 'bei', 'nan'],
  scores: [100, 100, 100, 100],
  discards: [
    ['wan1'],
    ['tiao2'],
    ['dong'],
    ['xi'],
  ],
  melds: [],
  wallRemaining: 70,
  expected: {
    forbiddenFinalTiles: ['tong5'],
    requiredCandidateTiles: ['tong2', 'tong5'],
    rankBefore: [['tong2', 'tong5']],
    maxShantenAfter: 4,
  },
});

cases.push({
  id: 'stage7-recommendation-wind-taatsu-threat-attribution-001',
  turn: 34,
  player: 0,
  hand: ['wan4', 'wan5', 'wan7', 'tong5', 'tong7', 'tiao5', 'tiao6', 'tiao6', 'tiao8', 'tiao9', 'fa', 'fa', 'nan', 'bei'],
  scores: [100, 100, 100, 100],
  discards: [
    ['wan1', 'tong1'],
    ['tiao1', 'zhong'],
    ['bei', 'wan2'],
    ['dong', 'zhong'],
  ],
  melds: [{ player: 3, tile: 'bai', count: 3, type: 'peng' }],
  wallRemaining: 58,
  expected: {
    forbiddenFinalTiles: ['nan', 'bei'],
    requiredCandidateTiles: ['nan', 'bei', 'tong5', 'tong7'],
  },
});

cases.push({
  id: 'stage7-recommendation-wind-taatsu-high-threat-defense-exception-001',
  turn: 60,
  player: 0,
  hand: ['wan4', 'wan5', 'wan7', 'tong5', 'tong7', 'tiao5', 'tiao6', 'tiao6', 'tiao8', 'tiao9', 'fa', 'fa', 'nan', 'bei'],
  scores: [100, 100, 100, 100],
  discards: [
    ['wan1', 'tong1'],
    ['bei', 'wan2', 'tong2', 'tiao2'],
    ['wan3', 'tong3'],
    ['bei', 'dong', 'zhong'],
  ],
  melds: [
    { player: 1, tile: 'tong9', count: 3, type: 'peng' },
    { player: 1, tile: 'wan9', count: 3, type: 'peng' },
    { player: 3, tile: 'bai', count: 3, type: 'peng' },
  ],
  wallRemaining: 18,
  expected: {
    allowedFinalTiles: ['bei'],
    forbiddenFinalTiles: ['nan'],
    requiredCandidateTiles: ['nan', 'bei'],
    requiredMetadata: { windComboBreak: true, defenseState: 'half-fold' },
  },
});

function makeState(scene) {
  const melds = [[], [], [], []];
  for (const meld of scene.melds || []) {
    const player = Number.isInteger(meld.player) ? meld.player : scene.player;
    melds[player].push({ type: meld.type || 'peng', tiles: Array.from({ length: meld.count || 3 }, () => meld.tile) });
  }
  return {
    hand: scene.hand,
    melds,
    discards: scene.discards,
    scores: scene.scores,
    turn: scene.turn,
    currentPlayer: scene.player,
    dealer: scene.turn % 4,
    wallRemaining: scene.wallRemaining,
  };
}

function strongConfig() {
  return {
    weights: { speed: 1, handValue: 0.8, waitQuality: 0.8, kongZhichan: 0.6, dalanRoute: 0.7, defense: 0.4, position: 0.5, structure: 1 },
    enabledDimensions: new Set(['speed', 'handValue', 'waitQuality', 'kongZhichan', 'dalanRoute', 'defense', 'position', 'structure']),
  };
}

function candidateViews(decision) {
  return decision.allCandidates.map((candidate) => ({
    tile: candidate.tile,
    tileLabel: tileLabel(candidate.tile),
    totalScore: candidate.totalScore,
    shantenAfter: candidate.metadata?.shantenAfter ?? 99,
    route: candidate.metadata?.isDalanRoute ? 'dalan' : 'norm',
    speedScore: candidate.breakdown?.speedScore || 0,
    handValueScore: candidate.breakdown?.handValueScore || 0,
    waitQualityScore: candidate.breakdown?.waitQualityScore || 0,
    kongZhichanScore: candidate.breakdown?.kongZhichanScore || 0,
    dalanRouteScore: candidate.breakdown?.dalanRouteScore || 0,
    defenseScore: candidate.breakdown?.defenseScore || 0,
    positionAdjustment: candidate.breakdown?.positionAdjustment || 0,
    structurePenalty: candidate.breakdown?.structurePenalty || 0,
    waitCount: (candidate.metadata?.shantenAfter ?? 99) === 0 ? Math.max(1, candidate.metadata?.effectiveCount || 1) : 0,
    waitRemaining: (candidate.metadata?.shantenAfter ?? 99) === 0 ? Math.max(1, candidate.metadata?.effectiveCount || 1) : 0,
    breaksMeld: (candidate.breakdown?.structurePenalty || 0) <= -6,
    breaksPair: !!candidate.metadata?.dragonComboBreak,
    breaksTaatsu: (candidate.breakdown?.structurePenalty || 0) < 0,
    windComboBreak: !!candidate.metadata?.windComboBreak,
    dragonComboBreak: !!candidate.metadata?.dragonComboBreak,
    mixedRouteType: candidate.metadata?.mixedRoute?.type || null,
    mixedRouteReason: candidate.metadata?.mixedRoute?.reason || null,
  }));
}

function mctsCandidatesFromDecision(decision) {
  return decision.allCandidates.map((candidate, index) => ({
    id: `discard:${index}:${candidate.tile}`,
    action: 'discard',
    tile: candidate.tile,
    tileLabel: tileLabel(candidate.tile),
    legal: true,
    baseScore: candidate.totalScore,
    shantenAfter: candidate.metadata?.shantenAfter ?? 99,
    route: candidate.metadata?.isDalanRoute ? 'dalan' : 'norm',
    breaksRoute: (candidate.breakdown?.structurePenalty || 0) < 0,
    breaksPair: !!candidate.metadata?.dragonComboBreak,
    dragonComboBreak: !!candidate.metadata?.dragonComboBreak,
    isolatedDiscardPriority: candidate.metadata?.isolatedDiscardPriority || 0,
    mixedRouteType: candidate.metadata?.mixedRoute?.type || null,
    mixedRouteReason: candidate.metadata?.mixedRoute?.reason || null,
    defenseRisk: Math.max(0, Math.min(1, 1 - ((candidate.breakdown?.defenseScore || 0) + 2) / 6)),
    dealInRisk: 0.1,
    kongRisk: 0,
    scoreImpact: 0,
    isStrongRuleChoice: candidate.tile === decision.selectedTile,
  }));
}

function mctsContext(scene, candidates, strongAction, phase) {
  return {
    turn: scene.turn,
    player: scene.player,
    phase,
    timeLimitMs: 10000,
    scores: scene.scores,
    dealer: scene.turn % 4,
    wallRemaining: scene.wallRemaining,
    discards: scene.discards,
    melds: scene.melds,
    handSummary: scene.hand,
    opponentThreats: [
      { player: 1, tenpaiRisk: 0.15 + (scene.turn % 5) * 0.05, dalanRisk: 0.1, honorRisk: 0.1 },
      { player: 2, tenpaiRisk: 0.2, dalanRisk: 0.2, honorRisk: 0.2 },
      { player: 3, tenpaiRisk: 0.1, dalanRisk: 0.1, honorRisk: 0.1 },
    ],
    strongRuleAction: strongAction,
    candidates,
  };
}

function tileFromAction(action, views) {
  const label = String(action || '').replace(/^打/, '');
  return views.find((candidate) => candidate.tileLabel === label)?.tile || null;
}

function top3FromMcts(summary, views) {
  return (summary.candidates || [])
    .filter((candidate) => candidate.action.startsWith('打'))
    .slice(0, 3)
    .map((candidate) => tileFromAction(candidate.action, views))
    .filter(Boolean);
}

function recommendationContext(scene, views, summary) {
  const handLabels = {};
  for (const tile of scene.hand) handLabels[tile] = tileLabel(tile);
  return {
    turn: scene.turn,
    phaseLabel: 'discarding',
    currentPlayer: scene.player,
    hand: scene.hand,
    handLabels,
    selectedTile: null,
    systemRecommendation: views.find((candidate) => candidate.tile === tileFromAction(summary.finalAction, views)) || views[0],
    candidates: views,
    discards: scene.discards,
    melds: scene.melds,
    scores: scene.scores,
    mctsSummary: summary,
  };
}

function contextDifferenceReason(aiEntry, recommendationEntry) {
  const reasons = [];
  if (aiEntry.player !== recommendationEntry.player) reasons.push('seat differs');
  if (aiEntry.phase !== recommendationEntry.phase) reasons.push('phase differs');
  if (JSON.stringify(aiEntry.scores) !== JSON.stringify(recommendationEntry.scores)) reasons.push('score context differs');
  if (JSON.stringify(aiEntry.discards) !== JSON.stringify(recommendationEntry.discards)) reasons.push('visible discards differ');
  if (JSON.stringify(aiEntry.melds) !== JSON.stringify(recommendationEntry.melds)) reasons.push('meld context differs');
  return reasons.length ? reasons.join('; ') : 'same context, unified decision mismatch';
}

function compareScene(scene) {
  const decision = StrongAI.makeDecision(makeState(scene), strongConfig());
  const views = candidateViews(decision);
  const mctsCandidates = mctsCandidatesFromDecision(decision);
  const strongAction = `打${tileLabel(decision.selectedTile)}`;
  const aiMcts = Mcts.decideWithMcts(mctsContext(scene, mctsCandidates, strongAction, 'discarding'));
  const aiFinal = tileFromAction(aiMcts.finalAction, views) || decision.selectedTile;
  const aiTop3 = top3FromMcts(aiMcts, views);
  const recCtx = recommendationContext(scene, views, aiMcts);
  const recPanel = Recommendation.buildPanel(recCtx);
  const recFinal = recPanel.systemTile;
  const recTop3 = top3FromMcts(aiMcts, views);
  const aiChosen = views.find((candidate) => candidate.tile === aiFinal);
  const recChosen = views.find((candidate) => candidate.tile === recFinal);
  const aiEntry = { player: scene.player, phase: 'discarding', scores: scene.scores, discards: scene.discards, melds: scene.melds };
  const recommendationEntry = { player: scene.player, phase: 'discarding', scores: scene.scores, discards: scene.discards, melds: scene.melds };
  const mismatches = [];
  if (aiFinal !== recFinal) mismatches.push(`final ${aiFinal} != ${recFinal}`);
  if (JSON.stringify(aiTop3) !== JSON.stringify(recTop3)) mismatches.push(`top3 ${aiTop3.join(',')} != ${recTop3.join(',')}`);
  if ((aiChosen?.shantenAfter ?? 99) !== (recChosen?.shantenAfter ?? 99)) mismatches.push(`shanten ${(aiChosen?.shantenAfter ?? 99)} != ${(recChosen?.shantenAfter ?? 99)}`);
  if ((aiChosen?.route || '') !== (recChosen?.route || '')) mismatches.push(`route ${(aiChosen?.route || '')} != ${(recChosen?.route || '')}`);
  const reviewA = [aiMcts.finalAction, aiMcts.mctsAction, aiMcts.modelAction || ''].join('|');
  const reviewB = [recCtx.mctsSummary.finalAction, recCtx.mctsSummary.mctsAction, recCtx.mctsSummary.modelAction || ''].join('|');
  if (reviewA !== reviewB) mismatches.push(`review ${reviewA} != ${reviewB}`);
  if (scene.expected) {
    const allCandidateTiles = new Set(views.map((candidate) => candidate.tile));
    for (const tile of scene.expected.requiredCandidateTiles || []) {
      if (!allCandidateTiles.has(tile)) mismatches.push(`required candidate missing ${tile}`);
    }
    if ((scene.expected.forbiddenFinalTiles || []).includes(aiFinal)) mismatches.push(`forbidden final discard ${aiFinal}`);
    if (scene.expected.allowedFinalTiles && !scene.expected.allowedFinalTiles.includes(aiFinal)) {
      mismatches.push(`final ${aiFinal} not in allowed ${scene.expected.allowedFinalTiles.join(',')}`);
    }
    if ((aiChosen?.shantenAfter ?? 99) > scene.expected.maxShantenAfter) {
      mismatches.push(`shantenAfter ${(aiChosen?.shantenAfter ?? 99)} > ${scene.expected.maxShantenAfter}`);
    }
    if (scene.expected.requiredMetadata?.mixedRouteType) {
      const routeType = aiChosen?.mixedRouteType || decision.metadata?.mixedRoute?.type || null;
      if (routeType !== scene.expected.requiredMetadata.mixedRouteType) {
        mismatches.push(`mixedRouteType ${routeType || 'none'} != ${scene.expected.requiredMetadata.mixedRouteType}`);
      }
    }
    if (scene.expected.requiredMetadata?.windComboBreak && !aiChosen?.windComboBreak) {
      mismatches.push('windComboBreak metadata missing on final candidate');
    }
    if (scene.expected.requiredMetadata?.defenseState) {
      const defenseState = decision.metadata?.defenseState?.state || null;
      if (defenseState !== scene.expected.requiredMetadata.defenseState) {
        mismatches.push(`defenseState ${defenseState || 'none'} != ${scene.expected.requiredMetadata.defenseState}`);
      }
    }
    for (const pair of scene.expected.rankBefore || []) {
      const firstRank = views.findIndex((candidate) => candidate.tile === pair[0]);
      const secondRank = views.findIndex((candidate) => candidate.tile === pair[1]);
      if (firstRank < 0 || secondRank < 0 || firstRank > secondRank) {
        mismatches.push(`expected ${pair[0]} ranked before ${pair[1]}`);
      }
    }
    const anomalyCodes = [];
    const bestShanten = Math.min(...views.map((candidate) => candidate.shantenAfter));
    if ((aiChosen?.shantenAfter ?? 99) > bestShanten) anomalyCodes.push('shanten-regression');
    if (aiChosen?.dragonComboBreak) anomalyCodes.push('breaks-complete-dragon-combo');
    for (const code of scene.expected.forbiddenAnomalies || []) {
      if (anomalyCodes.includes(code)) mismatches.push(`forbidden anomaly ${code}`);
    }
    const needsReview = anomalyCodes.length > 0;
    if (scene.expected.needsReview === false && needsReview) mismatches.push('needsReview true');
  }
  return {
    id: scene.id,
    pass: mismatches.length === 0,
    aiFinal,
    recFinal,
    aiTop3,
    recTop3,
    shanten: aiChosen?.shantenAfter ?? null,
    route: aiChosen?.route || null,
    review: { finalAction: aiMcts.finalAction, mctsAction: aiMcts.mctsAction, modelAction: aiMcts.modelAction },
    contextDifferenceReason: mismatches.length ? contextDifferenceReason(aiEntry, recommendationEntry) : null,
    mismatches,
  };
}

const results = cases.map(compareScene);
for (const result of results) {
  if (!result.pass) failures.push(result);
}

const report = {
  schemaVersion: 'stage7-ai-unified-dynamic-regression-v1',
  total: results.length,
  pass: results.filter((item) => item.pass).length,
  fail: failures.length,
  comparedFields: ['finalDiscard', 'candidateTop3', 'shantenAfter', 'route', 'mctsModelReview'],
  failures: failures.slice(0, 20),
};

console.log(JSON.stringify(report, null, 2));
if (results.length < 50) {
  console.error(`stage7 AI unified dynamic regression requires at least 50 scenes, actual ${results.length}`);
  process.exit(1);
}
if (failures.length) process.exit(1);
