import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const compiledDir = path.join(os.tmpdir(), `wannian-strong-ai-cjs-${process.pid}`);
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const options = { category: readArg('--category'), report: readArg('--report') || 'text' };

function readArg(name) {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function compileDir(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of fs.readdirSync(sourceDir).filter((name) => name.endsWith('.ts'))) {
    const filePath = path.join(sourceDir, file);
    const source = fs.readFileSync(filePath, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true, esModuleInterop: true },
      fileName: filePath,
    }).outputText;
    fs.writeFileSync(path.join(targetDir, file.replace(/\.ts$/, '.js')), compiled);
  }
}

function loadStrongAI() {
  fs.rmSync(compiledDir, { recursive: true, force: true });
  compileDir(path.join(root, 'src/game/rules'), path.join(compiledDir, 'rules'));
  compileDir(path.join(root, 'src/game/strong-rule-ai'), path.join(compiledDir, 'strong-rule-ai'));
  return require(path.join(compiledDir, 'strong-rule-ai/index.js'));
}

function includesAny(actual, expected) {
  return expected.includes(actual);
}

function includesKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

const ai = loadStrongAI();
const data = JSON.parse(fs.readFileSync(path.join(root, 'docs/strong-rule-ai-l2-cases.json'), 'utf8'));
const cases = data.cases.filter((item) => !options.category || item.category.includes(options.category));
const failedCases = [];
let matched = 0;
const byCategory = {};
const start = Date.now();

for (const testCase of cases) {
  const state = {
    hand: testCase.hand,
    melds: [testCase.melds || [], [], [], []],
    discards: testCase.discards || [[], [], [], []],
    scores: testCase.scores,
    turn: testCase.turn,
    currentPlayer: testCase.currentPlayer,
    dealer: testCase.dealer,
    wallRemaining: testCase.wallRemaining,
  };
  byCategory[testCase.category] = byCategory[testCase.category] || { total: 0, matched: 0 };
  byCategory[testCase.category].total += 1;
  const before = Date.now();
  const decision = ai.makeDecision(state);
  const duration = Date.now() - before;
  const failures = [];
  if (duration > 500) failures.push(`decision latency expected < 500ms, actual ${duration}ms`);
  if (!decision.allCandidates?.length) failures.push('expected candidate score details');
  if (!decision.reasoning) failures.push('expected human-readable reasoning');
  if (!includesAny(decision.selectedTile, testCase.expected.bestDiscard)) failures.push(`bestDiscard expected one of ${JSON.stringify(testCase.expected.bestDiscard)}, actual ${decision.selectedTile}`);
  if (testCase.expected.unacceptableDiscards.includes(decision.selectedTile)) failures.push(`selected unacceptable discard ${decision.selectedTile}`);
  if (!includesKeyword(decision.reasoning, testCase.expected.reasoningKeywords)) failures.push(`reasoning expected keyword ${JSON.stringify(testCase.expected.reasoningKeywords)}, actual ${decision.reasoning}`);
  if (failures.length) failedCases.push({ id: testCase.id, category: testCase.category, selectedTile: decision.selectedTile, reasoning: decision.reasoning, failures });
  else {
    matched += 1;
    byCategory[testCase.category].matched += 1;
  }
}

const consistency = cases.length ? matched / cases.length : 0;
const report = {
  timestamp: new Date().toISOString(),
  totalCases: cases.length,
  matched,
  failed: failedCases.length,
  consistency: `${Math.round(consistency * 10000) / 100}%`,
  targetConsistency: `${Math.round((data.targetConsistency || 0.85) * 100)}%`,
  latencyTotalMs: Date.now() - start,
  byCategory,
  failedCases,
};

if (options.report === 'json') console.log(JSON.stringify(report, null, 2));
else {
  console.log(`Strong AI regression completed: ${matched}/${cases.length} matched (${report.consistency})`);
  if (failedCases.length) {
    for (const item of failedCases.slice(0, 20)) console.log(`- ${item.id}: ${item.failures.join('; ')}`);
  }
}

if (consistency < (data.targetConsistency || 0.85) || failedCases.some((item) => item.failures.some((failure) => failure.includes('latency') || failure.includes('candidate')))) process.exit(1);
