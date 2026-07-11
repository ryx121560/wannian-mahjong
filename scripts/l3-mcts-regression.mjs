import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/mcts/mcts-enhancement-engine.ts');
const casesPath = path.join(root, 'docs/l3-mcts-standard-cases.json');
const tempPath = path.join(root, '.tmp-mcts-enhancement-engine.cjs');

if (!fs.existsSync(casesPath)) {
  throw new Error('docs/l3-mcts-standard-cases.json missing. Run npm run generate:l3-mcts first.');
}

const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true, esModuleInterop: true },
  fileName: sourcePath,
}).outputText;
fs.writeFileSync(tempPath, compiled, 'utf8');
const require = createRequire(import.meta.url);
const engine = require(tempPath);

function actionText(candidate) {
  if (candidate.action === 'discard') return `打${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'pong') return `碰${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'kong') return `杠${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'win') return '胡';
  return '过';
}

const requiredFields = [
  'schemaVersion',
  'turn',
  'player',
  'phase',
  'finalAction',
  'strongRuleAction',
  'mctsAction',
  'overridden',
  'candidates',
  'defenseInfluence',
  'hiddenInferenceUsed',
  'hiddenInferenceNote',
  'scoreSituationNote',
  'kongRiskNote',
  'elapsedMs',
  'timedOut',
  'fallbackReason',
  'currentBestOnTimeout',
  'playerExplanation',
];
const forbiddenTerms = ['UCB', 'search tree', 'rollout path', 'node visit', 'node count', '搜索树', '节点', '访问次数', 'rollout', '公式'];

const raw = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const failures = [];
const byCategory = {};
let extraCases = 0;

for (const item of raw.cases) {
  let clock = 0;
  const now = item.expected.timeoutExpected ? () => {
    clock += 2;
    return clock;
  } : undefined;
  const summary = now ? engine.decideWithMcts(item.context, now) : engine.decideWithMcts(item.context);
  byCategory[item.category] = (byCategory[item.category] || 0) + 1;

  const legalActions = new Set((item.context.candidates || []).filter((candidate) => candidate.legal).map(actionText));
  if (item.expected.legalOnly && !legalActions.has(summary.finalAction)) {
    failures.push(`${item.id}: final action is not legal: ${summary.finalAction}`);
  }
  if (item.expected.finalAction && summary.finalAction !== item.expected.finalAction) {
    failures.push(`${item.id}: final action ${summary.finalAction}, expected ${item.expected.finalAction}`);
  }
  if (item.expected.overridden !== null && item.expected.overridden !== undefined && summary.overridden !== item.expected.overridden) {
    failures.push(`${item.id}: overridden ${summary.overridden}, expected ${item.expected.overridden}`);
  }
  if (item.expected.timeoutExpected && (!summary.timedOut || !summary.fallbackReason || !summary.currentBestOnTimeout)) {
    failures.push(`${item.id}: timeout metadata missing`);
  }
  if (item.expected.requiredExportFields) {
    for (const field of requiredFields) {
      if (!(field in summary)) failures.push(`${item.id}: missing export field ${field}`);
    }
    if (!Array.isArray(summary.candidates) || summary.candidates.length === 0) failures.push(`${item.id}: candidates summary missing`);
    for (const candidate of summary.candidates || []) {
      for (const field of ['action', 'averageValue', 'mainRisk', 'dealInRisk', 'kongRisk']) {
        if (!(field in candidate)) failures.push(`${item.id}: missing candidate field ${field}`);
      }
    }
  }
  if (item.expected.noTechnicalUiTerms) {
    const visibleText = summary.playerExplanation || '';
    for (const term of forbiddenTerms) {
      if (visibleText.includes(term)) failures.push(`${item.id}: leaked technical term ${term}`);
    }
  }
}

const sequenceCoreContext = {
  turn: 23,
  player: 2,
  phase: 'discarding',
  timeLimitMs: 10000,
  scores: [100, 100, 100, 100],
  dealer: 2,
  wallRemaining: 70,
  discards: [[], [], [], []],
  melds: [],
  handSummary: ['wan1', 'wan3', 'wan5', 'wan8', 'wan8', 'tong5', 'tong6', 'tong7', 'tong8', 'dong', 'nan', 'bei', 'bai', 'bai'],
  opponentThreats: [
    { player: 0, tenpaiRisk: 0.1, dalanRisk: 0.1, honorRisk: 0.1 },
    { player: 1, tenpaiRisk: 0.1, dalanRisk: 0.1, honorRisk: 0.1 },
    { player: 3, tenpaiRisk: 0.1, dalanRisk: 0.1, honorRisk: 0.1 },
  ],
  strongRuleAction: actionText({ action: 'discard', tile: 'wan1', tileLabel: '1万' }),
  candidates: [
    { id: 'discard:wan1', action: 'discard', tile: 'wan1', tileLabel: '1万', legal: true, baseScore: 0, shantenAfter: 2, route: 'norm', breaksRoute: false, defenseRisk: 0.22, dealInRisk: 0.08, kongRisk: 0, waitCount: 2, waitRemaining: 5, isStrongRuleChoice: true },
    { id: 'discard:tong5', action: 'discard', tile: 'tong5', tileLabel: '5筒', legal: true, baseScore: -0.2, shantenAfter: 2, route: 'norm', breaksRoute: false, defenseRisk: 0.2, dealInRisk: 0.08, kongRisk: 0, waitCount: 2, waitRemaining: 4 },
    { id: 'discard:tong6', action: 'discard', tile: 'tong6', tileLabel: '6筒', legal: true, baseScore: 4.3, shantenAfter: 2, route: 'norm', breaksRoute: true, defenseRisk: 0.08, dealInRisk: 0.05, kongRisk: 0, waitCount: 2, waitRemaining: 4 },
    { id: 'discard:tong7', action: 'discard', tile: 'tong7', tileLabel: '7筒', legal: true, baseScore: 4.2, shantenAfter: 2, route: 'norm', breaksRoute: true, defenseRisk: 0.08, dealInRisk: 0.05, kongRisk: 0, waitCount: 2, waitRemaining: 4 },
    { id: 'discard:tong8', action: 'discard', tile: 'tong8', tileLabel: '8筒', legal: true, baseScore: -0.1, shantenAfter: 2, route: 'norm', breaksRoute: false, defenseRisk: 0.2, dealInRisk: 0.08, kongRisk: 0, waitCount: 2, waitRemaining: 4 },
  ],
};
const sequenceCoreSummary = engine.decideWithMcts(sequenceCoreContext);
extraCases += 1;
if ([actionText({ action: 'discard', tile: 'tong6', tileLabel: '6筒' }), actionText({ action: 'discard', tile: 'tong7', tileLabel: '7筒' })].includes(sequenceCoreSummary.finalAction)) {
  failures.push(`mcts-sequence-core-protection-001: final action breaks 5-6-7-8 core sequence: ${sequenceCoreSummary.finalAction}`);
}
const sequenceCoreRank = sequenceCoreSummary.candidates.map((candidate) => candidate.action);
const firstCoreBreak = Math.min(
  ...[actionText({ action: 'discard', tile: 'tong6', tileLabel: '6筒' }), actionText({ action: 'discard', tile: 'tong7', tileLabel: '7筒' })]
    .map((action) => sequenceCoreRank.indexOf(action))
    .filter((idx) => idx >= 0),
);
const firstEdgeOrOutside = Math.min(
  ...[actionText({ action: 'discard', tile: 'wan1', tileLabel: '1万' }), actionText({ action: 'discard', tile: 'tong5', tileLabel: '5筒' }), actionText({ action: 'discard', tile: 'tong8', tileLabel: '8筒' })]
    .map((action) => sequenceCoreRank.indexOf(action))
    .filter((idx) => idx >= 0),
);
if (Number.isFinite(firstCoreBreak) && Number.isFinite(firstEdgeOrOutside) && firstCoreBreak < firstEdgeOrOutside) {
  failures.push(`mcts-sequence-core-protection-001: core breaker ranked above safer sequence edge/outside candidate: ${sequenceCoreRank.join(', ')}`);
}

const sequenceHighThreatContext = {
  turn: 49,
  player: 2,
  phase: 'discarding',
  timeLimitMs: 10000,
  scores: [100, 100, 100, 100],
  dealer: 2,
  wallRemaining: 28,
  discards: [[], [], [], []],
  melds: [],
  handSummary: ['tong7', 'bai', 'bai', 'dong', 'wan3', 'wan8', 'wan8', 'nan', 'tong8', 'bei', 'fa', 'bei', 'wan1', 'tong6'],
  opponentThreats: [
    { player: 0, tenpaiRisk: 0.86, dalanRisk: 0.55, honorRisk: 0.7 },
    { player: 1, tenpaiRisk: 0.78, dalanRisk: 0.45, honorRisk: 0.65 },
    { player: 3, tenpaiRisk: 0.82, dalanRisk: 0.5, honorRisk: 0.62 },
  ],
  strongRuleAction: actionText({ action: 'discard', tile: 'tong6', tileLabel: '6筒' }),
  candidates: [
    { id: 'discard:tong6', action: 'discard', tile: 'tong6', tileLabel: '6筒', legal: true, baseScore: 4.8, shantenAfter: 2, route: 'norm', breaksRoute: true, defenseRisk: 0.05, dealInRisk: 0.04, kongRisk: 0, waitCount: 1, waitRemaining: 3, isStrongRuleChoice: true },
    { id: 'discard:tong7', action: 'discard', tile: 'tong7', tileLabel: '7筒', legal: true, baseScore: 2.6, shantenAfter: 2, route: 'norm', breaksRoute: true, defenseRisk: 0.12, dealInRisk: 0.08, kongRisk: 0, waitCount: 1, waitRemaining: 3 },
    { id: 'discard:wan1', action: 'discard', tile: 'wan1', tileLabel: '1万', legal: true, baseScore: 0.5, shantenAfter: 2, route: 'norm', breaksRoute: false, defenseRisk: 0.42, dealInRisk: 0.25, kongRisk: 0, waitCount: 1, waitRemaining: 3 },
    { id: 'discard:fa', action: 'discard', tile: 'fa', tileLabel: '发', legal: true, baseScore: 0.1, shantenAfter: 2, route: 'norm', breaksRoute: false, defenseRisk: 0.5, dealInRisk: 0.3, kongRisk: 0, waitCount: 1, waitRemaining: 3 },
  ],
};
const sequenceHighThreatSummary = engine.decideWithMcts(sequenceHighThreatContext);
extraCases += 1;
if (sequenceHighThreatSummary.finalAction === actionText({ action: 'discard', tile: 'tong6', tileLabel: '6筒' })) {
  if (!sequenceHighThreatSummary.structureLossReason || !sequenceHighThreatSummary.defenseInfluence) {
    failures.push('mcts-sequence-core-protection-149: high-threat sequence break lacks defense and structure-loss explanation');
  }
}

const tenpaiPairRegressionContext = {
  turn: 81,
  player: 2,
  phase: 'discarding',
  timeLimitMs: 10000,
  scores: [100, 100, 100, 100],
  dealer: 2,
  wallRemaining: 32,
  discards: [['tong8'], [], ['tong8'], ['tong8']],
  melds: [{ player: 2, tile: 'wan7', count: 4, type: 'angang' }],
  handSummary: ['tong6', 'dong', 'tong3', 'tiao5', 'tong8', 'tong5', 'bei', 'tong7', 'tong4', 'tiao5', 'tong2'],
  opponentThreats: [
    { player: 0, tenpaiRisk: 0.75, dalanRisk: 0.2, honorRisk: 0.35 },
    { player: 1, tenpaiRisk: 0.68, dalanRisk: 0.2, honorRisk: 0.3 },
    { player: 3, tenpaiRisk: 0.7, dalanRisk: 0.2, honorRisk: 0.3 },
  ],
  strongRuleAction: actionText({ action: 'discard', tile: 'tiao5', tileLabel: '5条' }),
  candidates: [
    { id: 'discard:tong2', action: 'discard', tile: 'tong2', tileLabel: '2筒', legal: true, baseScore: 3, shantenAfter: 0, route: 'norm', breaksRoute: false, breaksPair: false, defenseRisk: 0.25, dealInRisk: 0.2, kongRisk: 0, waitCount: 2, waitRemaining: 7 },
    { id: 'discard:tong8', action: 'discard', tile: 'tong8', tileLabel: '8筒', legal: true, baseScore: -2, shantenAfter: 1, route: 'norm', breaksRoute: true, breaksPair: false, defenseRisk: 0.08, dealInRisk: 0.06, kongRisk: 0, waitCount: 2, waitRemaining: 7 },
    { id: 'discard:tiao5', action: 'discard', tile: 'tiao5', tileLabel: '5条', legal: true, baseScore: 12, shantenAfter: 1, route: 'norm', breaksRoute: true, breaksPair: true, defenseRisk: 0.05, dealInRisk: 0.04, kongRisk: 0, waitCount: 0, waitRemaining: 0, isStrongRuleChoice: true },
  ],
};
const tenpaiPairRegressionSummary = engine.decideWithMcts(tenpaiPairRegressionContext);
extraCases += 1;
if (tenpaiPairRegressionSummary.finalAction === actionText({ action: 'discard', tile: 'tiao5', tileLabel: '5条' })) {
  failures.push(`mcts-tenpai-no-break-pair-001: final action should keep tenpai instead of breaking pair: ${tenpaiPairRegressionSummary.finalAction}`);
}
if (tenpaiPairRegressionSummary.finalAction !== actionText({ action: 'discard', tile: 'tong2', tileLabel: '2筒' })) {
  failures.push(`mcts-tenpai-no-break-pair-001: expected keep-tenpai discard 2筒, actual ${tenpaiPairRegressionSummary.finalAction}`);
}

const lowVisibleRiskContext = {
  turn: 56,
  player: 0,
  phase: 'recommendation',
  timeLimitMs: 10000,
  scores: [100, 100, 100, 100],
  dealer: 0,
  wallRemaining: 50,
  discards: [['tiao1'], ['wan9'], ['tong9'], ['dong']],
  melds: [],
  handSummary: ['wan5', 'wan6', 'wan7', 'tong6', 'tong7', 'tong9', 'tong9', 'tong9', 'tiao1', 'tiao3', 'tiao5', 'tiao7', 'tiao8', 'tiao9'],
  opponentThreats: [
    { player: 1, tenpaiRisk: 0.7, dalanRisk: 0.2, honorRisk: 0.2 },
    { player: 2, tenpaiRisk: 0.65, dalanRisk: 0.2, honorRisk: 0.2 },
    { player: 3, tenpaiRisk: 0.68, dalanRisk: 0.2, honorRisk: 0.2 },
  ],
  strongRuleAction: actionText({ action: 'discard', tile: 'tiao7', tileLabel: '7条' }),
  candidates: [
    { id: 'discard:tiao7', action: 'discard', tile: 'tiao7', tileLabel: '7条', legal: true, baseScore: 8, shantenAfter: 2, route: 'norm', breaksRoute: true, defenseRisk: 0.2, dealInRisk: 0.62, kongRisk: 0, waitCount: 2, waitRemaining: 4, isStrongRuleChoice: true },
    { id: 'discard:tiao1', action: 'discard', tile: 'tiao1', tileLabel: '1条', legal: true, baseScore: 4, shantenAfter: 2, route: 'norm', breaksRoute: true, publicSeenCount: 1, defenseRisk: 0.2, dealInRisk: 0.62, kongRisk: 0, waitCount: 2, waitRemaining: 4 },
  ],
};
const lowVisibleRiskSummary = engine.decideWithMcts(lowVisibleRiskContext);
extraCases += 1;
const lowVisibleRiskCandidate = (lowVisibleRiskSummary.candidates || []).find((candidate) => candidate.action === actionText({ action: 'discard', tile: 'tiao1', tileLabel: '1条' }));
if (!lowVisibleRiskCandidate) {
  failures.push('mcts-low-visible-risk-label-001: missing 1条 candidate in summary');
} else if (lowVisibleRiskCandidate.mainRisk === '放炮风险较高') {
  failures.push('mcts-low-visible-risk-label-001: low visible 1条 must not be labeled as high deal-in risk');
}
if (lowVisibleRiskCandidate && !String(lowVisibleRiskCandidate.mainRisk || '').includes('低牌')) {
  failures.push(`mcts-low-visible-risk-label-001: expected low-tile risk explanation, actual ${lowVisibleRiskCandidate.mainRisk}`);
}

try { fs.unlinkSync(tempPath); } catch {}

const expectedDistribution = raw.distribution || {};
for (const [category, count] of Object.entries(expectedDistribution)) {
  if (byCategory[category] !== count) failures.push(`distribution ${category}: ${byCategory[category] || 0}, expected ${count}`);
}

const totalCases = raw.cases.length + extraCases;
const pass = totalCases - failures.length;
const rate = totalCases ? pass / totalCases : 0;
console.log(JSON.stringify({ total: totalCases, pass, fail: failures.length, passRate: Number((rate * 100).toFixed(2)), distribution: byCategory, extraCases, failures: failures.slice(0, 30) }, null, 2));
if (raw.cases.length !== 150 || extraCases !== 4 || failures.length > 0) process.exit(1);
