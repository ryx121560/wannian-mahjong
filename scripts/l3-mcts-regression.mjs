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

try { fs.unlinkSync(tempPath); } catch {}

const expectedDistribution = raw.distribution || {};
for (const [category, count] of Object.entries(expectedDistribution)) {
  if (byCategory[category] !== count) failures.push(`distribution ${category}: ${byCategory[category] || 0}, expected ${count}`);
}

const pass = raw.cases.length - failures.length;
const rate = raw.cases.length ? pass / raw.cases.length : 0;
console.log(JSON.stringify({ total: raw.cases.length, pass, fail: failures.length, passRate: Number((rate * 100).toFixed(2)), distribution: byCategory, failures: failures.slice(0, 30) }, null, 2));
if (raw.cases.length !== 150 || failures.length > 0) process.exit(1);
