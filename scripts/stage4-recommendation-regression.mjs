import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/recommendation/recommendation-engine.ts');
const casesPath = path.join(root, 'docs/stage4-recommendation-cases.json');
const tempPath = path.join(root, '.tmp-recommendation-engine.cjs');

if (!fs.existsSync(casesPath)) {
  throw new Error('docs/stage4-recommendation-cases.json missing. Run npm run generate:recommendation first.');
}

const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true, esModuleInterop: true },
  fileName: sourcePath,
}).outputText;
fs.writeFileSync(tempPath, compiled, 'utf8');
const require = createRequire(import.meta.url);
const engine = require(tempPath);

const raw = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const forbidden = ['speedScore', 'handValueScore', 'waitQualityScore', 'defenseScore', 'totalScore', 'structurePenalty'];
const failures = [];
const runtimeHtml = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');

for (const item of raw.cases) {
  const panel = engine.buildPanel(item.context);
  const html = engine.buildPanelHtml(item.context);
  if (panel.sections.length !== item.expected.sections) failures.push(`${item.id}: section count ${panel.sections.length}`);
  for (const keyword of item.expected.keywords || []) {
    if (!html.includes(keyword)) failures.push(`${item.id}: missing keyword ${keyword}`);
  }
  if (item.expected.noRawFields) {
    for (const field of forbidden) {
      if (html.includes(field)) failures.push(`${item.id}: leaked raw field ${field}`);
    }
  }
  if (item.expected.publicOnly && /暗手|AI手牌|隐藏手牌/.test(html)) failures.push(`${item.id}: public-only wording violation`);
  if (item.expected.stableSystemTile) {
    const changed = { ...item.context, selectedTile: item.context.selectedTile === 'wan3' ? 'tong3' : 'wan3' };
    const changedPanel = engine.buildPanel(changed);
    if (panel.systemTile !== changedPanel.systemTile) failures.push(`${item.id}: system recommendation changed after click`);
  }
}

const responseChineseContext = {
  ...raw.cases[0].context,
  phaseLabel: 'responding',
  candidates: [
    { tile: 'wan6', tileLabel: '碰6万', totalScore: 10, shantenAfter: 0, route: 'response', speedScore: 2, handValueScore: 0, waitQualityScore: 0, defenseScore: 0, followUpDiscardLabel: '南', followUpShanten: 0, followUpReason: '碰后打南能保持0向听，且南风后续进张价值较低。' },
    { tile: 'wan6', tileLabel: '杠 6万', totalScore: 8, shantenAfter: 0, route: 'response', speedScore: 1, kongZhichanScore: 1, defenseScore: 0, followUpPending: '杠后会先摸一张牌；如果这张牌不能杠开，系统会在下一步出牌建议里重新推荐应打哪张。' },
  ],
  systemRecommendation: { tile: 'wan6', tileLabel: '碰6万', totalScore: 10, shantenAfter: 0, route: 'response', speedScore: 2, handValueScore: 0, waitQualityScore: 0, defenseScore: 0, followUpDiscardLabel: '南', followUpShanten: 0, followUpReason: '碰后打南能保持0向听，且南风后续进张价值较低。' },
  responseEvent: { fromPlayer: 1, fromName: 'AI下家', tile: 'wan6', tileLabel: '6万', actions: ['杠', '碰', '过'] },
};
const responseChineseText = engine.buildPanel(responseChineseContext).sections.map((item) => item.text).join('\n');
if (/\bresponse\b/.test(responseChineseText)) {
  failures.push('stage4-copy: response recommendation leaks internal route name');
}
if (!responseChineseText.includes('碰牌后建议') || !responseChineseText.includes('打南')) {
  failures.push('stage4-response: pong recommendation lacks follow-up discard advice');
}
if (!responseChineseText.includes('杠牌后说明') || !responseChineseText.includes('下一步出牌建议')) {
  failures.push('stage4-response: kong recommendation lacks next-discard guidance');
}

if (runtimeHtml.includes('30秒后自动跳过') || /_respTimer\s*=\s*gameSetTimeout[\s\S]{0,260}30000/.test(runtimeHtml)) {
  failures.push('stage4-runtime: response countdown still exists');
}
if (!runtimeHtml.includes('导出失败：生成或下载 JSON 文件失败') || !runtimeHtml.includes('[game log] export failed')) {
  failures.push('stage4-runtime: export failure lacks locatable message');
}
if (!runtimeHtml.includes('recordAiDiscardInterpretation') || !runtimeHtml.includes("createRecommendationRecord('ai-discard'")) {
  failures.push('stage4-runtime: ai discard interpretation is not recorded');
}
if (!/function canSelfWin\s*\(\s*hand\s*,\s*winTile/.test(runtimeHtml)) {
  failures.push('stage4-runtime: self draw win check does not accept winTile');
}
if (/canSelfWin\(effectiveHand\(p\)\)/.test(runtimeHtml) || /canSelfWin\(hand\)\{recordRecommendationChoice\('response','胡'\)/.test(runtimeHtml)) {
  failures.push('stage4-runtime: self draw win check still omits winTile at call site');
}
if (!runtimeHtml.includes("canHuNormal(testHand,false,preMelds,winTile,'自摸')")) {
  failures.push('stage4-runtime: wait enumeration does not pass winTile');
}
if (!runtimeHtml.includes('function formatWinSettlementText') || !runtimeHtml.includes('displayText:formatWinSettlementText')) {
  failures.push('stage4-runtime: settled win result is not persisted with full score deltas');
}
if (!/GS\._lastResult\.displayText[\s\S]{0,220}message\.textContent=GS\._lastResult\.displayText/.test(runtimeHtml)) {
  failures.push('stage4-runtime: restored ended game does not show full settlement details');
}

const summaryContext = {
  ...raw.cases[0].context,
  phaseLabel: 'ended',
  candidates: [],
  systemRecommendation: null,
  responseEvent: null,
  records: [
    { id: 'summary-check', type: 'discard', turn: 1, confidence: '高', recommendedAction: '打三万', actualAction: '打三万', adopted: true, strategyGap: '选择一致', reasons: ['防守安全'], sections: [] },
  ],
  summary: { total: 1, discardRecommendations: 1, responseRecommendations: 0, highConfidenceMissed: 0, obviousStrategyGaps: 0, topics: { 防守安全: 1 }, reviewTurns: [] },
};
const summaryPanel = engine.buildPanel(summaryContext);
if (!summaryPanel.sections[0] || summaryPanel.sections[0].title !== '十、本局推荐总结') {
  failures.push('stage4-summary: game summary is not pinned after game end');
}

try { fs.unlinkSync(tempPath); } catch {}

const pass = raw.cases.length - failures.length;
const rate = raw.cases.length ? pass / raw.cases.length : 0;
console.log(JSON.stringify({ total: raw.cases.length, pass, fail: failures.length, passRate: Number((rate * 100).toFixed(2)), failures: failures.slice(0, 20) }, null, 2));
if (rate < 0.85 || failures.length > 0) process.exit(1);
