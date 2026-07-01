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

function stateFromCase(testCase) {
  return {
    hand: testCase.hand,
    melds: testCase.allMelds || [testCase.melds || [], [], [], []],
    discards: testCase.discards || [[], [], [], []],
    scores: testCase.scores,
    turn: testCase.turn,
    currentPlayer: testCase.currentPlayer,
    dealer: testCase.dealer,
    wallRemaining: testCase.wallRemaining,
    passRecords: testCase.passRecords || [],
  };
}

const ai = loadStrongAI();
ai.makeDecision({
  hand: ['wan1', 'wan2', 'wan3', 'tong1', 'tong2', 'tong3', 'tiao1', 'tiao2', 'tiao3', 'dong', 'nan', 'xi', 'bei', 'bai'],
  melds: [[], [], [], []],
  discards: [[], [], [], []],
  scores: [100, 100, 100, 100],
  turn: 1,
  currentPlayer: 0,
  dealer: 0,
  wallRemaining: 80,
});
const dataFiles = [
  path.join(root, 'docs/strong-rule-ai-l2-cases.json'),
  path.join(root, 'docs/strong-rule-ai-l2-defense-cases.json'),
].filter((file) => fs.existsSync(file));
const datasets = dataFiles.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const targetConsistency = Math.max(...datasets.map((data) => data.targetConsistency || 0.85), 0.85);
const cases = datasets.flatMap((data) => data.cases || []).filter((item) => !options.category || item.category.includes(options.category));
for (const testCase of cases) ai.makeDecision(stateFromCase(testCase));
const failedCases = [];
let matched = 0;
const byCategory = {};
const start = Date.now();

for (const testCase of cases) {
  const state = stateFromCase(testCase);
  byCategory[testCase.category] = byCategory[testCase.category] || { total: 0, matched: 0 };
  byCategory[testCase.category].total += 1;
  const before = Date.now();
  const decision = ai.makeDecision(state);
  const duration = Date.now() - before;
  const failures = [];
  const latencyLimit = testCase.category.startsWith('defense-') ? 200 : 500;
  if (duration > latencyLimit) failures.push(`decision latency expected < ${latencyLimit}ms, actual ${duration}ms`);
  if (!decision.allCandidates?.length) failures.push('expected candidate score details');
  if (!decision.reasoning) failures.push('expected human-readable reasoning');
  if (!includesAny(decision.selectedTile, testCase.expected.bestDiscard)) failures.push(`bestDiscard expected one of ${JSON.stringify(testCase.expected.bestDiscard)}, actual ${decision.selectedTile}`);
  if (testCase.expected.unacceptableDiscards.includes(decision.selectedTile)) failures.push(`selected unacceptable discard ${decision.selectedTile}`);
  const defenseReasoning = decision.allCandidates.find((candidate) => candidate.tile === decision.selectedTile)?.metadata?.defense?.reasoning || '';
  const combinedReasoning = `${decision.reasoning} ${defenseReasoning}`;
  if (!includesKeyword(combinedReasoning, testCase.expected.reasoningKeywords)) failures.push(`reasoning expected keyword ${JSON.stringify(testCase.expected.reasoningKeywords)}, actual ${combinedReasoning}`);
  if (testCase.expected.expectedState && decision.metadata?.defenseState?.state !== testCase.expected.expectedState) failures.push(`expectedState ${testCase.expected.expectedState}, actual ${decision.metadata?.defenseState?.state}`);
  if (failures.length) failedCases.push({ id: testCase.id, category: testCase.category, selectedTile: decision.selectedTile, reasoning: combinedReasoning, failures });
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
  targetConsistency: `${Math.round(targetConsistency * 100)}%`,
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

if (cases.length && (consistency < targetConsistency || failedCases.some((item) => item.failures.some((failure) => failure.includes('latency') || failure.includes('candidate'))))) process.exit(1);
