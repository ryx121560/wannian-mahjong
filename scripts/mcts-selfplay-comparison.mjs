import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/mcts/mcts-enhancement-engine.ts');
const casesPath = path.join(root, 'docs/l3-mcts-standard-cases.json');
const outPath = path.join(root, 'docs/stage5-mcts-selfplay-comparison.json');
const tempPath = path.join(root, '.tmp-mcts-selfplay-engine.cjs');

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

const raw = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const byCategory = {};
let overrides = 0;
let kept = 0;
let totalDelta = 0;
let compared = 0;
let defenseInfluenced = 0;
let kongReviewed = 0;
let timeoutFallbacks = 0;

for (const item of raw.cases) {
  let clock = 0;
  const now = item.expected?.timeoutExpected ? () => {
    clock += 2;
    return clock;
  } : undefined;
  const summary = now ? engine.decideWithMcts(item.context, now) : engine.decideWithMcts(item.context);
  const strongAction = summary.strongRuleAction;
  const final = summary.candidates.find((candidate) => candidate.action === summary.finalAction);
  const strong = summary.candidates.find((candidate) => candidate.action === strongAction);
  const delta = final && strong ? Number((final.averageValue - strong.averageValue).toFixed(2)) : 0;
  if (summary.overridden) overrides += 1;
  else kept += 1;
  if (final && strong) {
    totalDelta += delta;
    compared += 1;
  }
  if ((summary.defenseInfluence || '').includes('防守') || (summary.defenseInfluence || '').includes('威胁')) defenseInfluenced += 1;
  if ((summary.kongRiskNote || '').includes('杠')) kongReviewed += 1;
  if (summary.timedOut) timeoutFallbacks += 1;
  const bucket = byCategory[item.category] || { total: 0, overrides: 0, kept: 0, averageDelta: 0, deltaSum: 0 };
  bucket.total += 1;
  if (summary.overridden) bucket.overrides += 1;
  else bucket.kept += 1;
  bucket.deltaSum += delta;
  bucket.averageDelta = Number((bucket.deltaSum / bucket.total).toFixed(2));
  byCategory[item.category] = bucket;
}

for (const bucket of Object.values(byCategory)) delete bucket.deltaSum;

const report = {
  schemaVersion: 'stage5-mcts-selfplay-comparison-v1',
  generatedAt: new Date().toISOString(),
  sourceCases: 'docs/l3-mcts-standard-cases.json',
  totalCases: raw.cases.length,
  baseline: 'strong-rule candidate',
  enhanced: 'stage5 mcts final action',
  overrides,
  kept,
  averageValueDeltaWhenComparable: compared ? Number((totalDelta / compared).toFixed(2)) : 0,
  defenseInfluenced,
  kongReviewed,
  timeoutFallbacks,
  byCategory,
  conclusion: 'Stage 5 MCTS is active as the default review layer and produces exportable comparison evidence against the strong-rule baseline.',
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
try { fs.unlinkSync(tempPath); } catch {}
console.log(`Wrote ${path.relative(root, outPath)} with ${raw.cases.length} comparison cases`);
