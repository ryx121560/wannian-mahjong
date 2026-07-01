import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/mcts/mcts-enhancement-engine.ts');
const casesPath = path.join(root, 'docs/stage6-data-model-cases.json');
const htmlPath = path.join(root, 'public/game/wannian-mahjong.html');
const tempPath = path.join(root, '.tmp-stage6-mcts-engine.cjs');

if (!fs.existsSync(casesPath)) {
  throw new Error('docs/stage6-data-model-cases.json missing. Run npm run generate:stage6-model first.');
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

const requiredModelFields = [
  'modelDecisionSchemaVersion',
  'modelVersion',
  'trainingDataVersion',
  'ruleEngineVersion',
  'mctsVersion',
  'strongRuleVersion',
  'modelAction',
  'modelRoute',
  'modelConfidence',
  'modelTendencyStrength',
  'modelAgreement',
  'modelAffectedFinalChoice',
  'modelAdoptionReason',
  'modelRejectionReason',
  'routeTransitionJudgment',
  'ruleConstraintBlocks',
];

const forbiddenVisibleTerms = [
  'modelAction',
  'modelRoute',
  'modelConfidence',
  'trainingDataVersion',
  'modelDecisionSchemaVersion',
  'routeTransitionJudgment',
];

const raw = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const failures = [];
const byCategory = {};

for (const item of raw.cases) {
  let clock = 0;
  const now = item.category === 'inference-performance'
    ? () => {
      clock += 2;
      return clock;
    }
    : undefined;
  const summary = now ? engine.decideWithMcts(item.context, now) : engine.decideWithMcts(item.context);
  byCategory[item.category] = (byCategory[item.category] || 0) + 1;

  const legalActions = new Set((item.context.candidates || []).filter((candidate) => candidate.legal).map(actionText));
  if (item.expected.legalOnly && !legalActions.has(summary.finalAction)) {
    failures.push(`${item.id}: final action is not legal: ${summary.finalAction}`);
  }

  if (item.expected.requiredModelFields) {
    for (const field of requiredModelFields) {
      if (!(field in summary)) failures.push(`${item.id}: missing model field ${field}`);
    }
    if (summary.modelDecisionSchemaVersion !== 'stage6-model-decision-v1') failures.push(`${item.id}: wrong model schema`);
    if (!summary.modelVersion || !summary.trainingDataVersion) failures.push(`${item.id}: model versions missing`);
  }

  if (item.expected.noClearMctsOverride && summary.finalAction !== summary.mctsAction) {
    failures.push(`${item.id}: model or strong rule overrode a clear MCTS conclusion`);
  }

  if (item.expected.requiresRouteTransition && !summary.routeTransitionJudgment.includes('路线转换')) {
    failures.push(`${item.id}: route transition judgment missing`);
  }

  if (item.expected.requiresRuleBlock && (!Array.isArray(summary.ruleConstraintBlocks) || summary.ruleConstraintBlocks.length === 0)) {
    failures.push(`${item.id}: rule constraint block record missing`);
  }

  if (item.expected.noInternalFieldLeak) {
    const visible = [summary.playerExplanation, summary.routeTransitionJudgment, summary.modelAdoptionReason, summary.modelRejectionReason].filter(Boolean).join(' ');
    for (const term of forbiddenVisibleTerms) {
      if (visible.includes(term)) failures.push(`${item.id}: internal field leaked to visible text: ${term}`);
    }
  }
}

const expectedDistribution = raw.distribution || {};
for (const [category, count] of Object.entries(expectedDistribution)) {
  if (byCategory[category] !== count) failures.push(`distribution ${category}: ${byCategory[category] || 0}, expected ${count}`);
}

const html = fs.readFileSync(htmlPath, 'utf8');
if (html.includes('强规则 AI 八维参数') || html.includes('strong-ai-dimensions') || html.includes('data-ai-weight') || html.includes('data-ai-enabled')) {
  failures.push('frontend strong-rule eight-dimension controls still exist');
}
if (html.includes('_debug') || html.includes('debugKong')) {
  failures.push('hidden debug mode hook still exists');
}
if (!html.includes('STAGE6_MODEL_INFO') || !html.includes('stage6Model')) {
  failures.push('exported game log does not include stage6 model version metadata');
}

try { fs.unlinkSync(tempPath); } catch {}

const pass = raw.cases.length - failures.length;
const rate = raw.cases.length ? pass / raw.cases.length : 0;
console.log(JSON.stringify({ total: raw.cases.length, pass, fail: failures.length, passRate: Number((rate * 100).toFixed(2)), distribution: byCategory, failures: failures.slice(0, 40) }, null, 2));
if (raw.cases.length !== 150 || failures.length > 0) process.exit(1);
