import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const compiledDir = path.join(os.tmpdir(), `wannian-strong-ai-kong-review-${process.pid}`);
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const output = readArg('--output') || path.join(root, 'docs/strong-ai-kong-zhichan-review-2026-07-10.json');

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

function includesKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function selectedFailures(testCase, decision, duration) {
  const failures = [];
  const expected = testCase.expected || {};
  const selectedTile = decision.selectedTile;
  const expectedBest = expected.bestDiscard || [];
  const unacceptable = expected.unacceptableDiscards || [];
  const keywords = expected.reasoningKeywords || [];
  const defenseReasoning = decision.allCandidates.find((candidate) => candidate.tile === selectedTile)?.metadata?.defense?.reasoning || '';
  const combinedReasoning = `${decision.reasoning || ''} ${defenseReasoning}`.trim();

  if (duration > 500) failures.push(`decision latency expected < 500ms, actual ${duration}ms`);
  if (!decision.allCandidates?.length) failures.push('expected candidate score details');
  if (!decision.reasoning) failures.push('expected human-readable reasoning');
  if (!expectedBest.includes(selectedTile)) failures.push(`bestDiscard expected one of ${JSON.stringify(expectedBest)}, actual ${selectedTile}`);
  if (unacceptable.includes(selectedTile)) failures.push(`selected unacceptable discard ${selectedTile}`);
  if (keywords.length && !includesKeyword(combinedReasoning, keywords)) {
    failures.push(`reasoning expected keyword ${JSON.stringify(keywords)}, actual ${combinedReasoning}`);
  }

  return { failures, combinedReasoning };
}

function serializeCandidate(candidate, rank) {
  return {
    rank,
    tile: candidate.tile,
    totalScore: candidate.totalScore,
    breakdown: candidate.breakdown,
    metadata: {
      shantenBefore: candidate.metadata?.shantenBefore,
      shantenAfter: candidate.metadata?.shantenAfter,
      expectedBaseScore: candidate.metadata?.expectedBaseScore,
      effectiveCount: candidate.metadata?.effectiveCount,
      isDalanRoute: candidate.metadata?.isDalanRoute,
      kongOpportunity: candidate.metadata?.kongOpportunity,
      dragonComboBreak: candidate.metadata?.dragonComboBreak,
      destroyedStructureType: candidate.metadata?.destroyedStructureType,
      breaksPair: candidate.metadata?.breaksPair,
      mixedRoute: candidate.metadata?.mixedRoute,
      isolatedDiscardPriority: candidate.metadata?.isolatedDiscardPriority,
      defenseState: candidate.metadata?.defense?.state,
      defenseScore: candidate.metadata?.defense?.defenseScore,
      defenseReasoning: candidate.metadata?.defense?.reasoning,
    },
  };
}

function rankedCandidates(decision) {
  return [...(decision.allCandidates || [])]
    .sort((left, right) => right.totalScore - left.totalScore)
    .map((candidate, index) => serializeCandidate(candidate, index + 1));
}

function loadKongCases() {
  const dataFile = path.join(root, 'docs/strong-rule-ai-l2-cases.json');
  if (!fs.existsSync(dataFile)) throw new Error(`Missing L2 case file: ${dataFile}`);
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  return (data.cases || []).filter((testCase) => testCase.category === 'kong-zhichan');
}

const ai = loadStrongAI();
const cases = loadKongCases();
const exportedCases = [];
let failed = 0;

for (const testCase of cases) {
  const state = stateFromCase(testCase);
  const before = Date.now();
  const decision = ai.makeDecision(state);
  const durationMs = Date.now() - before;
  const { failures, combinedReasoning } = selectedFailures(testCase, decision, durationMs);
  const candidatesByScore = rankedCandidates(decision);
  const selectedCandidate = candidatesByScore.find((candidate) => candidate.tile === decision.selectedTile) || null;
  if (failures.length) failed += 1;

  exportedCases.push({
    id: testCase.id,
    category: testCase.category,
    description: testCase.description,
    level: testCase.level,
    input: {
      hand: testCase.hand,
      melds: testCase.melds || [],
      allMelds: testCase.allMelds,
      discards: testCase.discards || [[], [], [], []],
      scores: testCase.scores,
      turn: testCase.turn,
      currentPlayer: testCase.currentPlayer,
      dealer: testCase.dealer,
      wallRemaining: testCase.wallRemaining,
      passRecords: testCase.passRecords || [],
    },
    expected: testCase.expected,
    actual: {
      selectedTile: decision.selectedTile,
      selectedScore: decision.selectedScore,
      phase: decision.phase,
      reasoning: decision.reasoning,
      combinedReasoning,
      durationMs,
      metadata: decision.metadata,
      selectedCandidateRankByScore: selectedCandidate?.rank || null,
      selectedCandidate,
      topCandidates: candidatesByScore.slice(0, 10),
    },
    validation: {
      passed: failures.length === 0,
      failures,
    },
    suggestedReviewFocus: '判断当前 AI 打 1万 是否比期望字牌更合理',
    reviewStatus: 'pending',
    reviewConclusion: '',
  });
}

const report = {
  schemaVersion: 'strong-ai-kong-zhichan-review-v1',
  generatedAt: new Date().toISOString(),
  source: 'docs/strong-rule-ai-l2-cases.json',
  category: 'kong-zhichan',
  totalCases: cases.length,
  failedCases: failed,
  passedCases: cases.length - failed,
  purpose: '导出 kong-zhichan 回归牌例，供产品逐条判断测试期望应更新还是 AI 策略应修复。',
  reviewLegend: {
    reviewStatus: ['pending', 'reviewed'],
    reviewConclusion: ['测试期望应更新', 'AI策略应修复', '需要补充规则口径'],
  },
  cases: exportedCases,
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.rmSync(compiledDir, { recursive: true, force: true });

console.log(JSON.stringify({
  output,
  totalCases: report.totalCases,
  failedCases: report.failedCases,
  passedCases: report.passedCases,
}, null, 2));
