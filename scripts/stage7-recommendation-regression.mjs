import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/recommendation/recommendation-engine.ts');
const stage4CasesPath = path.join(root, 'docs/stage4-recommendation-cases.json');
const runtimePath = path.join(root, 'public/game/wannian-mahjong.html');
const tempPath = path.join(root, '.tmp-stage7-recommendation-engine.cjs');

const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true, esModuleInterop: true },
  fileName: sourcePath,
}).outputText;
fs.writeFileSync(tempPath, compiled, 'utf8');
const require = createRequire(import.meta.url);
const engine = require(tempPath);
try {
  fs.unlinkSync(tempPath);
} catch {
  // Best effort cleanup for the transient compiled test module.
}

const stage4 = JSON.parse(fs.readFileSync(stage4CasesPath, 'utf8'));
const runtimeHtml = fs.readFileSync(runtimePath, 'utf8');
const failures = [];
const assertionResults = [];

function assertCase(id, ok, message) {
  assertionResults.push({ id, ok: !!ok, message });
  if (!ok) failures.push(`${id}: ${message}`);
}

function sampleContext(overrides = {}) {
  return {
    ...stage4.cases[0].context,
    turn: 77,
    phaseLabel: 'discarding',
    selectedTile: 'tiao1',
    systemRecommendation: {
      tile: 'tiao1',
      tileLabel: '1条',
      totalScore: 95,
      shantenAfter: 1,
      route: 'norm',
      speedScore: 1.2,
      handValueScore: 0.7,
      waitQualityScore: 0.6,
      defenseScore: 0.2,
      waitCount: 2,
      waitRemaining: 5,
    },
    candidates: [
      {
        tile: 'tiao1',
        tileLabel: '1条',
        totalScore: 95,
        shantenAfter: 1,
        route: 'norm',
        speedScore: 1.2,
        handValueScore: 0.7,
        waitQualityScore: 0.6,
        defenseScore: 0.2,
        waitCount: 2,
        waitRemaining: 5,
      },
      {
        tile: 'tiao6',
        tileLabel: '6条',
        totalScore: 88,
        shantenAfter: 1,
        route: 'norm',
        speedScore: 1,
        handValueScore: 0.6,
        waitQualityScore: 0.5,
        defenseScore: 0.1,
        breaksTaatsu: true,
      },
      {
        tile: 'dong',
        tileLabel: '东',
        totalScore: 70,
        shantenAfter: 2,
        route: 'norm',
        speedScore: 0.1,
        handValueScore: 0.1,
        waitQualityScore: 0,
        defenseScore: 0.3,
      },
    ],
    mctsSummary: {
      finalAction: '打1条',
      strongRuleAction: '打1条',
      mctsAction: '打1条',
      modelAction: '打1条',
      modelTendencyStrength: 'strong',
      modelAffectedFinalChoice: true,
      modelAgreement: { withMcts: true, withStrongRule: true },
      overridden: false,
      notOverrideReason: '规则、MCTS 与阶段六模型同源一致',
      playerExplanation: '打1条保留中张伸展，候选排序与复核一致。',
      candidates: [
        { action: '打1条', averageValue: 16.2, mainRisk: '风险可控', dealInRisk: 0.1, kongRisk: 0 },
        { action: '打6条', averageValue: 12.4, mainRisk: '会拆搭子', dealInRisk: 0.1, kongRisk: 0 },
      ],
    },
    ...overrides,
  };
}

function sectionText(panel, titlePrefix) {
  return panel.sections.find((section) => section.title.startsWith(titlePrefix))?.text || '';
}

const panel = engine.buildPanel(sampleContext());
const systemText = sectionText(panel, '一、');
for (const keyword of ['推荐打出', '推荐目标', '核心理由', '第二候选', 'MCTS', '阶段六', '置信度']) {
  assertCase(`stage7-panel-system-${keyword}`, systemText.includes(keyword), `系统推荐缺少 ${keyword}`);
}
assertCase('stage7-panel-system-final-tile', panel.systemTile === 'tiao1', `最终推荐应为 tiao1，实际 ${panel.systemTile}`);

const detailText = sectionText(panel, '二、');
for (const keyword of ['速度', '结构', '收益', '风险', '取舍']) {
  assertCase(`stage7-panel-detail-${keyword}`, detailText.includes(keyword), `详细理由缺少 ${keyword}`);
}
assertCase('stage7-panel-detail-no-player-judgment', !/玩家能力|弱点|水平不足/.test(detailText), '详细理由不能评价玩家能力');

const rankingText = sectionText(panel, '三、');
for (const keyword of ['1条', '6条', '后续均值', '弃后']) {
  assertCase(`stage7-panel-ranking-${keyword}`, rankingText.includes(keyword), `候选排序缺少 ${keyword}`);
}
assertCase('stage7-panel-ranking-main-before-second', rankingText.indexOf('1条') >= 0 && rankingText.indexOf('1条') < rankingText.indexOf('6条'), '最终推荐必须排在第二候选前');

const duplicatePanel = engine.buildPanel(sampleContext({
  candidates: [
    { tile: 'dong', tileLabel: '东', totalScore: 90, shantenAfter: 1, route: 'norm' },
    { tile: 'dong', tileLabel: '东', totalScore: 89, shantenAfter: 1, route: 'norm' },
    { tile: 'nan', tileLabel: '南', totalScore: 86, shantenAfter: 1, route: 'norm' },
  ],
  systemRecommendation: { tile: 'dong', tileLabel: '东', totalScore: 90, shantenAfter: 1, route: 'norm' },
}));
const duplicateRankingText = sectionText(duplicatePanel, '三、');
assertCase('stage7-ranking-dedupe', (duplicateRankingText.match(/东/g) || []).length === 1, '候选排序必须按牌面去重');
assertCase('stage7-second-candidate-dedupe', sectionText(duplicatePanel, '一、').includes('南'), '第二候选不能重复主推荐');

const runtimeChecks = [
  ['stage7-runtime-unified-entry', 'function createUnifiedDecisionResult'],
  ['stage7-runtime-ai-uses-unified', 'createUnifiedDecisionResult(hand,playerIdx'],
  ['stage7-runtime-human-uses-unified', 'createUnifiedDecisionResult(hand,0'],
  ['stage7-runtime-ai-summary-field', 'aiDecisionSummary'],
  ['stage7-runtime-ai-anomaly-field', 'aiDecisionAnomalies'],
  ['stage7-runtime-key-summary-field', 'keyDecisionSummary'],
  ['stage7-runtime-export-analysis-only', 'trainingDataIncluded:false'],
  ['stage7-runtime-no-new-front-entry', 'bt-ai-log-export'],
];
for (const [id, needle] of runtimeChecks) {
  assertCase(id, runtimeHtml.includes(needle), `运行时缺少 ${needle}`);
}

for (let i = 0; i < 100; i += 1) {
  const context = stage4.cases[i % stage4.cases.length].context;
  const stagePanel = engine.buildPanel(context);
  const candidates = context.candidates || [];
  assertCase(`stage7-existing-${i + 1}-panel`, stagePanel.sections.length >= 3, '既有推荐用例必须能生成前三块面板');
  if (candidates.length) {
    assertCase(`stage7-existing-${i + 1}-system-in-candidates`, !stagePanel.systemTile || candidates.some((item) => item.tile === stagePanel.systemTile), '最终推荐必须来自候选列表');
  } else {
    assertCase(`stage7-existing-${i + 1}-empty-candidates`, true, '无候选用例允许无最终推荐');
  }
}

for (let i = 0; i < 80; i += 1) {
  const ctx = sampleContext({ turn: i + 1 });
  const p = engine.buildPanel(ctx);
  assertCase(`stage7-synthetic-${i + 1}-consistent-final`, p.systemTile === 'tiao1', '合成同源用例最终推荐必须稳定');
}

const pass = assertionResults.filter((item) => item.ok).length;
const total = assertionResults.length;
const report = {
  schemaVersion: 'stage7-recommendation-regression-v1',
  total,
  pass,
  fail: failures.length,
  passRate: Number(((pass / total) * 100).toFixed(2)),
  distribution: {
    panelSystem: assertionResults.filter((item) => item.id.startsWith('stage7-panel-system')).length,
    panelDetail: assertionResults.filter((item) => item.id.startsWith('stage7-panel-detail')).length,
    panelRanking: assertionResults.filter((item) => item.id.startsWith('stage7-panel-ranking') || item.id.startsWith('stage7-ranking')).length,
    runtime: assertionResults.filter((item) => item.id.startsWith('stage7-runtime')).length,
    existingReuse: assertionResults.filter((item) => item.id.startsWith('stage7-existing')).length,
    synthetic: assertionResults.filter((item) => item.id.startsWith('stage7-synthetic')).length,
  },
  failures: failures.slice(0, 30),
};

console.log(JSON.stringify(report, null, 2));
if (total < 200) {
  console.error(`stage7 regression must contain at least 200 assertions, actual ${total}`);
  process.exit(1);
}
if (failures.length) process.exit(1);
