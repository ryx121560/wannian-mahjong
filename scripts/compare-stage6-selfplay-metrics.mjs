import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/mcts/mcts-enhancement-engine.ts');
const casesPath = path.join(root, 'docs/stage6-data-model-cases.json');
const outPath = path.join(root, 'docs/stage6-selfplay-metrics-comparison.json');
const tempPath = path.join(root, '.tmp-stage6-selfplay-metrics.cjs');

const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true, esModuleInterop: true },
  fileName: sourcePath,
}).outputText;
fs.writeFileSync(tempPath, compiled, 'utf8');
const require = createRequire(import.meta.url);
const engine = require(tempPath);

const raw = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

function actionText(candidate) {
  if (candidate.action === 'discard') return `打${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'pong') return `碰${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'kong') return `杠${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'win') return '胡';
  return '过';
}

function findCandidate(context, action) {
  return (context.candidates || []).find((candidate) => actionText(candidate) === action) || null;
}

function candidateValue(candidate) {
  if (!candidate) return 0;
  const riskPenalty = Number(candidate.dealInRisk || 0) * 4 + Number(candidate.kongRisk || 0) * 2;
  const winBonus = candidate.action === 'win' ? 8 : 0;
  return Number(((candidate.baseScore || 0) + (candidate.scoreImpact || 0) + winBonus - riskPenalty).toFixed(4));
}

const rows = [];
for (const item of raw.cases) {
  const summary = engine.decideWithMcts(item.context);
  const stage6 = findCandidate(item.context, summary.finalAction);
  const stage5 = findCandidate(item.context, summary.mctsAction);
  const strong = findCandidate(item.context, summary.strongRuleAction);
  rows.push({
    id: item.id,
    category: item.category,
    stage6Action: summary.finalAction,
    stage5Action: summary.mctsAction,
    strongRuleAction: summary.strongRuleAction,
    stage6Value: candidateValue(stage6),
    stage5Value: candidateValue(stage5),
    strongRuleValue: candidateValue(strong),
    stage6DealInRisk: Number((stage6?.dealInRisk || 0).toFixed(4)),
    stage5DealInRisk: Number((stage5?.dealInRisk || 0).toFixed(4)),
    stage6WinRateProxy: stage6?.action === 'win' ? 1 : Math.max(0, Math.min(1, (stage6?.waitRemaining || 0) / 12)),
    stage5WinRateProxy: stage5?.action === 'win' ? 1 : Math.max(0, Math.min(1, (stage5?.waitRemaining || 0) / 12)),
    modelAffectedFinalChoice: summary.modelAffectedFinalChoice,
    illegalBlocked: Array.isArray(summary.ruleConstraintBlocks) ? summary.ruleConstraintBlocks.length : 0,
  });
}

function average(field) {
  return Number((rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length).toFixed(4));
}

const metrics = {
  schemaVersion: 'stage6-selfplay-metrics-comparison-v1',
  generatedAt: new Date().toISOString(),
  sourceCases: 'docs/stage6-data-model-cases.json',
  totalCases: rows.length,
  baseline: 'stage5 mcts action',
  enhanced: 'stage6 final action',
  averageStage6Value: average('stage6Value'),
  averageStage5Value: average('stage5Value'),
  averageValueDelta: Number((average('stage6Value') - average('stage5Value')).toFixed(4)),
  stage6DealInRisk: average('stage6DealInRisk'),
  stage5DealInRisk: average('stage5DealInRisk'),
  dealInRiskDelta: Number((average('stage6DealInRisk') - average('stage5DealInRisk')).toFixed(4)),
  stage6WinRateProxy: average('stage6WinRateProxy'),
  stage5WinRateProxy: average('stage5WinRateProxy'),
  winRateProxyDelta: Number((average('stage6WinRateProxy') - average('stage5WinRateProxy')).toFixed(4)),
  modelAffectedCases: rows.filter((row) => row.modelAffectedFinalChoice).length,
  illegalBlockedCases: rows.filter((row) => row.illegalBlocked > 0).length,
  acceptance: {
    averageScoreNotLower: null,
    dealInNotSignificantlyHigher: null,
    illegalRecommendationBlocked: null,
  },
};

metrics.acceptance.averageScoreNotLower = metrics.averageValueDelta >= -0.01;
metrics.acceptance.dealInNotSignificantlyHigher = metrics.dealInRiskDelta <= 0.02;
metrics.acceptance.illegalRecommendationBlocked = metrics.illegalBlockedCases >= 20;
metrics.pass = Object.values(metrics.acceptance).every(Boolean);

fs.writeFileSync(outPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
try { fs.unlinkSync(tempPath); } catch {}

console.log(JSON.stringify(metrics, null, 2));
if (!metrics.pass) process.exit(1);
