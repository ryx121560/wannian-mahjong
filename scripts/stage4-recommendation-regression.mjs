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

const duplicateTileContext = {
  ...raw.cases[0].context,
  selectedTile: 'xi',
  systemRecommendation: { tile: 'xi', tileLabel: '西', totalScore: 12, shantenAfter: 1, route: 'norm', speedScore: 1, handValueScore: 0.3, waitQualityScore: 0.2, defenseScore: 0.4 },
  candidates: [
    { tile: 'xi', tileLabel: '西', totalScore: 12, shantenAfter: 1, route: 'norm', speedScore: 1, handValueScore: 0.3, waitQualityScore: 0.2, defenseScore: 0.4 },
    { tile: 'xi', tileLabel: '西', totalScore: 11, shantenAfter: 1, route: 'norm', speedScore: 0.8, handValueScore: 0.2, waitQualityScore: 0.2, defenseScore: 0.3 },
    { tile: 'tong8', tileLabel: '8筒', totalScore: 10, shantenAfter: 1, route: 'dalan', speedScore: 0.7, handValueScore: 0.8, waitQualityScore: 0.4, defenseScore: 0.2 },
    { tile: 'wan1', tileLabel: '1万', totalScore: 6, shantenAfter: 2, route: 'norm', speedScore: 0.1, handValueScore: 0.1, waitQualityScore: 0.1, defenseScore: 0.5 },
  ],
  mctsSummary: {
    finalAction: '打西',
    strongRuleAction: '打西',
    mctsAction: '打8筒',
    modelAction: '打8筒',
    modelTendencyStrength: 'medium',
    modelAffectedFinalChoice: false,
    modelAgreement: { withMcts: true, withStrongRule: false },
    overridden: false,
    notOverrideReason: '搜索收益差距较小，保留强规则 AI 的稳定选择',
    playerExplanation: '打西 保留为当前建议',
    candidates: [
      { action: '打西', averageValue: 12, mainRisk: '风险可控' },
      { action: '打8筒', averageValue: 10, mainRisk: '风险可控' },
    ],
  },
};
const duplicatePanel = engine.buildPanel(duplicateTileContext);
const duplicateText = duplicatePanel.sections.map((item) => item.text).join('\n');
if (!duplicateText.includes('第二候选') || !duplicateText.includes('8筒')) {
  failures.push('stage4-duplicate: second candidate should exclude same tile as main recommendation');
}
if (/第二候选：\s*西/.test(duplicateText)) {
  failures.push('stage4-duplicate: second candidate repeats main tile');
}
const rankingText = duplicatePanel.sections.find((item) => item.title.includes('候选'))?.text || '';
if ((rankingText.match(/西/g) || []).length > 1) {
  failures.push('stage4-duplicate: candidate ranking repeats the same tile face');
}
if (!duplicateText.includes('与系统推荐一致')) {
  failures.push('stage4-click: selected main recommendation should show consistency wording');
}
if (duplicateText.includes('系统推荐的长期期望更高')) {
  failures.push('stage4-click: selected main recommendation still claims system recommendation is higher');
}
for (const keyword of ['当前规则推荐', 'MCTS/模型复核建议', '最终推荐']) {
  if (!duplicateText.includes(keyword)) failures.push(`stage4-review: missing explicit review distinction ${keyword}`);
}

const invalidReadyContext = {
  ...raw.cases[0].context,
  selectedTile: 'tiao7',
  systemRecommendation: { tile: 'tiao7', tileLabel: '7条', totalScore: 100, shantenAfter: 0, route: 'norm', speedScore: 1, handValueScore: 0, waitQualityScore: 0, defenseScore: 0, waitCount: 0, waitRemaining: 0, breaksTaatsu: true },
  candidates: [
    { tile: 'tiao7', tileLabel: '7条', totalScore: 100, shantenAfter: 0, route: 'norm', speedScore: 1, handValueScore: 0, waitQualityScore: 0, defenseScore: 0, waitCount: 0, waitRemaining: 0, breaksTaatsu: true },
    { tile: 'wan2', tileLabel: '2万', totalScore: 98, shantenAfter: 1, route: 'norm', speedScore: 0, handValueScore: 0, waitQualityScore: 1, defenseScore: 0.5, waitCount: 1, waitRemaining: 3 },
  ],
};
const invalidReadyText = engine.buildPanel(invalidReadyContext).sections.map((item) => item.text).join('\n');
if (invalidReadyText.includes('7条后为0向听') || invalidReadyText.includes('7条：进入 0 向听')) {
  failures.push('stage4-invalid-ready: zero-shanten candidate without legal waits is shown as ready');
}
if (!invalidReadyText.includes('未形成有效听牌')) {
  failures.push('stage4-invalid-ready: no legal wait explanation missing');
}

const mctsTieBreakContext = {
  ...raw.cases[0].context,
  selectedTile: 'tiao7',
  systemRecommendation: { tile: 'tiao7', tileLabel: '7条', totalScore: 78, shantenAfter: 2, route: 'norm', speedScore: 1, handValueScore: 0.5, waitQualityScore: 0.3, defenseScore: -0.2 },
  candidates: [
    { tile: 'tiao7', tileLabel: '7条', totalScore: 78, shantenAfter: 2, route: 'norm', speedScore: 1, handValueScore: 0.5, waitQualityScore: 0.3, defenseScore: -0.2 },
    { tile: 'tiao1', tileLabel: '1条', totalScore: 78, shantenAfter: 2, route: 'norm', speedScore: 1, handValueScore: 0.5, waitQualityScore: 0.3, defenseScore: 0.4 },
  ],
  mctsSummary: {
    finalAction: '打7条',
    strongRuleAction: '打7条',
    mctsAction: '打1条',
    modelAction: null,
    overridden: false,
    notOverrideReason: '搜索收益差距较小，保留强规则 AI 的稳定选择',
    playerExplanation: '打7条 保留为当前建议',
    candidates: [
      { action: '打7条', averageValue: 1.24, mainRisk: '对手威胁较高', dealInRisk: 0.58, kongRisk: 0 },
      { action: '打1条', averageValue: 5.1, mainRisk: '风险可控', dealInRisk: 0.12, kongRisk: 0 },
    ],
  },
};
const mctsTieBreakPanel = engine.buildPanel(mctsTieBreakContext);
if (mctsTieBreakPanel.systemTile !== 'tiao1') {
  failures.push(`stage4-mcts-tiebreak: expected tiao1 when scores tie and MCTS value is higher with lower risk, actual ${mctsTieBreakPanel.systemTile}`);
}
const mctsTieBreakText = mctsTieBreakPanel.sections.map((item) => item.text).join('\n');
if (!mctsTieBreakText.includes('后续均值 5.1')) {
  failures.push('stage4-mcts-tiebreak: chosen candidate should expose the higher MCTS average value');
}
if (!mctsTieBreakText.includes('最终采用复核排序更优的候选')) {
  failures.push('stage4-mcts-tiebreak: panel should explain why MCTS average overrides the original recommendation');
}

const finalConsistencyContext = {
  ...raw.cases[0].context,
  selectedTile: 'wan1',
  systemRecommendation: { tile: 'tong4', tileLabel: '4\u7b52', totalScore: 27, shantenAfter: 1, route: 'norm', speedScore: 1, handValueScore: 0.2, waitQualityScore: 0.1, defenseScore: 0.4, breaksPair: true },
  candidates: [
    { tile: 'tong4', tileLabel: '4\u7b52', totalScore: 27, shantenAfter: 1, route: 'norm', speedScore: 1, handValueScore: 0.2, waitQualityScore: 0.1, defenseScore: 0.4, breaksPair: true },
    { tile: 'wan1', tileLabel: '1\u4e07', totalScore: 25, shantenAfter: 0, route: 'norm', speedScore: 3, handValueScore: 1.5, waitQualityScore: 2, defenseScore: 0.1, waitCount: 2, waitRemaining: 6 },
    { tile: 'tiao7', tileLabel: '7\u6761', totalScore: 27, shantenAfter: 1, route: 'norm', speedScore: 1, handValueScore: 0.2, waitQualityScore: 0.1, defenseScore: 0.3, breaksTaatsu: true },
  ],
  mctsSummary: {
    finalAction: '\u62531\u4e07',
    strongRuleAction: '\u62531\u4e07',
    mctsAction: '\u62531\u4e07',
    modelAction: '\u62531\u4e07',
    modelTendencyStrength: 'medium',
    modelAffectedFinalChoice: false,
    modelAgreement: { withMcts: true, withStrongRule: true },
    overridden: false,
    notOverrideReason: 'rule/mcts/model agree',
    playerExplanation: '\u62531\u4e07',
    candidates: [
      { action: '\u62531\u4e07', averageValue: -2.1, mainRisk: 'stable', dealInRisk: 0.1, kongRisk: 0 },
      { action: '\u62534\u7b52', averageValue: -8.41, mainRisk: 'breaks pair', dealInRisk: 0.1, kongRisk: 0 },
    ],
  },
};
const finalConsistencyPanel = engine.buildPanel(finalConsistencyContext);
if (finalConsistencyPanel.systemTile !== 'wan1') {
  failures.push(`stage4-final-consistency: final recommendation should follow agreed rule/mcts/model action wan1, actual ${finalConsistencyPanel.systemTile}`);
}
const finalRankingText = finalConsistencyPanel.sections.find((item) => item.title.includes('候选'))?.text || '';
if (finalRankingText.includes('4\u7b52') && finalRankingText.indexOf('1\u4e07') > finalRankingText.indexOf('4\u7b52')) {
  failures.push('stage4-final-consistency: candidate ranking should keep wan1 above tong4');
}

const isolatedEdgeId = 'recommendation-isolated-edge-visible-count-001';
const isolatedEdgeContext = {
  ...raw.cases[0].context,
  selectedTile: 'tiao1',
  systemRecommendation: { tile: 'tiao6', tileLabel: '6条', totalScore: 100, shantenAfter: 2, route: 'norm', speedScore: 1, handValueScore: 0.5, waitQualityScore: 0.2, defenseScore: -0.3 },
  candidates: [
    { tile: 'tiao6', tileLabel: '6条', totalScore: 100, shantenAfter: 2, route: 'norm', speedScore: 1, handValueScore: 0.5, waitQualityScore: 0.2, defenseScore: -0.3 },
    { tile: 'wan4', tileLabel: '4万', totalScore: 92, shantenAfter: 3, route: 'norm', speedScore: -1, handValueScore: 0.2, waitQualityScore: 0.1, defenseScore: 0.4, breaksMeld: true },
    { tile: 'tiao1', tileLabel: '1条', totalScore: 100, shantenAfter: 2, route: 'norm', speedScore: 1, handValueScore: 0.5, waitQualityScore: 0.2, defenseScore: -0.3, edgeVisibleAdj: 6, edgeVisibleReason: '1条为边张孤张，关键连接牌2条已见并被公开消耗，伸展价值下降。' },
  ],
  mctsSummary: {
    finalAction: '打6条',
    strongRuleAction: '打6条',
    mctsAction: '打1条',
    modelAction: '打1条',
    modelTendencyStrength: 'strong',
    modelAffectedFinalChoice: false,
    modelAgreement: { withMcts: true, withStrongRule: false },
    overridden: false,
    notOverrideReason: '候选综合评分接近',
    playerExplanation: '复核建议打1条',
    candidates: [
      { action: '打6条', averageValue: 14.43, mainRisk: '对手威胁较高', dealInRisk: 0.4, kongRisk: 0 },
      { action: '打1条', averageValue: 16.23, mainRisk: '对手威胁较高', dealInRisk: 0.4, kongRisk: 0 },
    ],
  },
};
const isolatedEdgePanel = engine.buildPanel(isolatedEdgeContext);
if (isolatedEdgePanel.systemTile !== 'tiao1') {
  failures.push(`${isolatedEdgeId}: expected final recommendation tiao1, actual ${isolatedEdgePanel.systemTile}`);
}
const isolatedRankingText = isolatedEdgePanel.sections.find((item) => item.title.includes('候选'))?.text || '';
if (isolatedRankingText.includes('6条') && isolatedRankingText.indexOf('1条') > isolatedRankingText.indexOf('6条')) {
  failures.push(`${isolatedEdgeId}: candidate ranking should put tiao1 above tiao6`);
}
const isolatedEdgeText = isolatedEdgePanel.sections.map((item) => item.text).join('\n');
for (const keyword of ['边张孤张', '2条已见', '公开消耗', '伸展价值下降']) {
  if (!isolatedEdgeText.includes(keyword)) failures.push(`${isolatedEdgeId}: missing reason keyword ${keyword}`);
}

const draw8WanKeep56TongId = 'recommendation-draw-8wan-keep-56tong-001';
const draw8WanKeep56TongContext = {
  ...raw.cases[0].context,
  selectedTile: 'dong',
  systemRecommendation: { tile: 'dong', tileLabel: '东', totalScore: 86, shantenAfter: 2, route: 'norm', speedScore: 0.8, handValueScore: 0.4, waitQualityScore: 0.2, defenseScore: 0.1 },
  candidates: [
    { tile: 'dong', tileLabel: '东', totalScore: 86, shantenAfter: 2, route: 'norm', speedScore: 0.8, handValueScore: 0.4, waitQualityScore: 0.2, defenseScore: 0.1 },
    { tile: 'tong5', tileLabel: '5筒', totalScore: 72, shantenAfter: 3, route: 'norm', speedScore: -0.8, handValueScore: 0.3, waitQualityScore: 0.4, defenseScore: 0.2, breaksTaatsu: true, furoTransitionReason: '5筒6筒是连续搭子，摸8万后不应拆除有效结构。' },
    { tile: 'tong6', tileLabel: '6筒', totalScore: 72, shantenAfter: 3, route: 'norm', speedScore: -0.8, handValueScore: 0.3, waitQualityScore: 0.4, defenseScore: 0.2, breaksTaatsu: true, furoTransitionReason: '5筒6筒是连续搭子，摸8万后不应拆除有效结构。' },
  ],
};
const draw8WanKeep56TongPanel = engine.buildPanel(draw8WanKeep56TongContext);
if (draw8WanKeep56TongPanel.systemTile === 'tong5' || draw8WanKeep56TongPanel.systemTile === 'tong6') {
  failures.push(`${draw8WanKeep56TongId}: final recommendation should not break 5筒6筒`);
}
const draw8WanKeep56TongRanking = draw8WanKeep56TongPanel.sections.find((item) => item.title.includes('候选'))?.text || '';
if (draw8WanKeep56TongRanking.includes('5筒') && draw8WanKeep56TongRanking.indexOf('东') > draw8WanKeep56TongRanking.indexOf('5筒')) {
  failures.push(`${draw8WanKeep56TongId}: candidate ranking should keep safe loose tile above tong5`);
}
const draw8WanKeep56TongText = draw8WanKeep56TongPanel.sections.map((item) => item.text).join('\n');
if (!draw8WanKeep56TongText.includes('5筒6筒') || !draw8WanKeep56TongText.includes('不应拆除有效结构')) {
  failures.push(`${draw8WanKeep56TongId}: missing 56tong protection reason`);
}

const lowThreatDoNotBreak56TongId = 'ai-discard-low-threat-do-not-break-56tong-for-safety-001';
const lowThreatDoNotBreak56TongContext = {
  ...raw.cases[0].context,
  selectedTile: 'bei',
  systemRecommendation: { tile: 'bei', tileLabel: '北', totalScore: 84, shantenAfter: 2, route: 'norm', speedScore: 0.7, handValueScore: 0.3, waitQualityScore: 0.2, defenseScore: 0.1 },
  candidates: [
    { tile: 'bei', tileLabel: '北', totalScore: 84, shantenAfter: 2, route: 'norm', speedScore: 0.7, handValueScore: 0.3, waitQualityScore: 0.2, defenseScore: 0.1 },
    { tile: 'tong5', tileLabel: '5筒', totalScore: 70, shantenAfter: 3, route: 'norm', speedScore: -0.7, handValueScore: 0.3, waitQualityScore: 0.3, defenseScore: 0.5, breaksTaatsu: true, furoTransitionReason: '低威胁阶段不能仅因安全分拆5筒6筒有效搭子。' },
    { tile: 'tong6', tileLabel: '6筒', totalScore: 70, shantenAfter: 3, route: 'norm', speedScore: -0.7, handValueScore: 0.3, waitQualityScore: 0.3, defenseScore: 0.5, breaksTaatsu: true, furoTransitionReason: '低威胁阶段不能仅因安全分拆5筒6筒有效搭子。' },
  ],
};
const lowThreatDoNotBreak56TongPanel = engine.buildPanel(lowThreatDoNotBreak56TongContext);
if (lowThreatDoNotBreak56TongPanel.systemTile === 'tong5' || lowThreatDoNotBreak56TongPanel.systemTile === 'tong6') {
  failures.push(`${lowThreatDoNotBreak56TongId}: low-threat final recommendation should not break 5筒6筒`);
}
const lowThreatDoNotBreak56TongText = lowThreatDoNotBreak56TongPanel.sections.map((item) => item.text).join('\n');
if (!lowThreatDoNotBreak56TongText.includes('低威胁') || !lowThreatDoNotBreak56TongText.includes('不能仅因安全分拆5筒6筒')) {
  failures.push(`${lowThreatDoNotBreak56TongId}: missing low-threat structure protection reason`);
}

const pong8TongProtect567TongId = 'recommendation-pong-8tong-protect-567tong-001';
const pong8TongProtect567TongContext = {
  ...raw.cases[0].context,
  selectedTile: 'tiao6',
  systemRecommendation: { tile: 'tiao6', tileLabel: '6\u6761', totalScore: 88, shantenAfter: 1, route: 'norm', speedScore: 1.2, handValueScore: 0.4, waitQualityScore: 0.3, defenseScore: 0.1 },
  candidates: [
    { tile: 'tiao6', tileLabel: '6\u6761', totalScore: 88, shantenAfter: 1, route: 'norm', speedScore: 1.2, handValueScore: 0.4, waitQualityScore: 0.3, defenseScore: 0.1 },
    { tile: 'tong6', tileLabel: '6\u7b52', totalScore: 80, shantenAfter: 2, route: 'norm', speedScore: -0.5, handValueScore: 0.6, waitQualityScore: 0.4, defenseScore: 0.1, breaksTaatsu: true, furoTransitionAdj: -8, furoTransitionReason: '6\u7b52\u662f567\u7b52\u8fde\u7eed\u987a\u5b50\u7ed3\u6784\uff0c\u78b08\u7b52\u540e\u4e0d\u80fd\u6309\u5b64\u5f20\u5904\u7406\u3002' },
    { tile: 'wan4', tileLabel: '4\u4e07', totalScore: 74, shantenAfter: 2, route: 'norm', speedScore: -0.3, handValueScore: 0.2, waitQualityScore: 0.1, defenseScore: 0.2, breaksMeld: true },
  ],
  melds: [{ player: 0, tile: 'tong8', count: 3, type: 'peng' }],
};
const pong8TongProtect567TongPanel = engine.buildPanel(pong8TongProtect567TongContext);
if (pong8TongProtect567TongPanel.systemTile !== 'tiao6') {
  failures.push(`${pong8TongProtect567TongId}: expected final recommendation tiao6, actual ${pong8TongProtect567TongPanel.systemTile}`);
}
const pong8TongProtect567TongRanking = pong8TongProtect567TongPanel.sections.find((item) => item.title.includes('候选'))?.text || '';
if (pong8TongProtect567TongRanking.includes('6\u7b52') && pong8TongProtect567TongRanking.indexOf('6\u6761') > pong8TongProtect567TongRanking.indexOf('6\u7b52')) {
  failures.push(`${pong8TongProtect567TongId}: candidate ranking should keep tiao6 above tong6`);
}
const pong8TongProtect567TongText = pong8TongProtect567TongPanel.sections.map((item) => item.text).join('\n');
for (const keyword of ['567\u7b52', '\u4e0d\u80fd\u6309\u5b64\u5f20\u5904\u7406']) {
  if (!pong8TongProtect567TongText.includes(keyword)) failures.push(`${pong8TongProtect567TongId}: missing reason keyword ${keyword}`);
}
if (pong8TongProtect567TongText.includes('6\u7b52\u4e3a\u8fb9\u5f20\u5b64\u5f20') || pong8TongProtect567TongText.includes('6\u7b52\u4e3a\u5b64\u5f20')) {
  failures.push(`${pong8TongProtect567TongId}: tong6 should not be described as isolated after pong 8tong`);
}

const pong8TongDiscard3TongTenpai5WanId = 'recommendation-pong-8tong-discard-3tong-tenpai-5wan-001';
const pong8TongDiscard3TongTenpai5WanContext = {
  ...raw.cases[0].context,
  selectedTile: 'tong3',
  systemRecommendation: { tile: 'tong3', tileLabel: '3\u7b52', totalScore: 90, shantenAfter: 0, route: 'norm', speedScore: 2, handValueScore: 0.8, waitQualityScore: 1.5, defenseScore: 0.1, waitCount: 1, waitRemaining: 2, furoTransitionAdj: 6, furoTransitionReason: '\u62533\u7b52\u540e\u8fdb\u51650\u5411\u542c\uff0c\u4fdd\u75593445\u4e07\u8f6c\u542c\u6838\u5fc3\u7ed3\u6784\uff0c\u660e\u786e\u5f855\u4e07\u3002' },
  candidates: [
    { tile: 'tong3', tileLabel: '3\u7b52', totalScore: 90, shantenAfter: 0, route: 'norm', speedScore: 2, handValueScore: 0.8, waitQualityScore: 1.5, defenseScore: 0.1, waitCount: 1, waitRemaining: 2, furoTransitionAdj: 6, furoTransitionReason: '\u62533\u7b52\u540e\u8fdb\u51650\u5411\u542c\uff0c\u4fdd\u75593445\u4e07\u8f6c\u542c\u6838\u5fc3\u7ed3\u6784\uff0c\u660e\u786e\u5f855\u4e07\u3002' },
    { tile: 'wan5', tileLabel: '5\u4e07', totalScore: 78, shantenAfter: 1, route: 'norm', speedScore: -0.4, handValueScore: 0.2, waitQualityScore: 0.1, defenseScore: 0.2, breaksTaatsu: true, furoTransitionAdj: -8, furoTransitionReason: '5\u4e07\u662f3445\u4e07\u526f\u9732\u540e\u8f6c\u542c\u6838\u5fc3\u7ed3\u6784\uff0c\u4e0d\u5e94\u4f18\u5148\u62c6\u6389\u3002' },
    { tile: 'tong6', tileLabel: '6\u7b52', totalScore: 76, shantenAfter: 1, route: 'norm', speedScore: -0.5, handValueScore: 0.3, waitQualityScore: 0.2, defenseScore: 0.1, breaksTaatsu: true },
  ],
  melds: [{ player: 0, tile: 'tong8', count: 3, type: 'peng' }],
  furoTransitionReason: '\u62533\u7b52\u540e\u8fdb\u51650\u5411\u542c\uff0c\u4fdd\u75593445\u4e07\u8f6c\u542c\u6838\u5fc3\u7ed3\u6784\uff0c\u660e\u786e\u5f855\u4e07\u3002',
};
const pong8TongDiscard3TongTenpai5WanPanel = engine.buildPanel(pong8TongDiscard3TongTenpai5WanContext);
if (pong8TongDiscard3TongTenpai5WanPanel.systemTile !== 'tong3') {
  failures.push(`${pong8TongDiscard3TongTenpai5WanId}: expected final recommendation tong3, actual ${pong8TongDiscard3TongTenpai5WanPanel.systemTile}`);
}
const pong8TongDiscard3TongTenpai5WanRanking = pong8TongDiscard3TongTenpai5WanPanel.sections.find((item) => item.title.includes('候选'))?.text || '';
if (!pong8TongDiscard3TongTenpai5WanRanking.includes('3\u7b52')) {
  failures.push(`${pong8TongDiscard3TongTenpai5WanId}: candidate ranking should include tong3`);
}
if (pong8TongDiscard3TongTenpai5WanRanking.includes('5\u4e07') && pong8TongDiscard3TongTenpai5WanRanking.indexOf('3\u7b52') > pong8TongDiscard3TongTenpai5WanRanking.indexOf('5\u4e07')) {
  failures.push(`${pong8TongDiscard3TongTenpai5WanId}: candidate ranking should keep tong3 above wan5`);
}
const pong8TongDiscard3TongTenpai5WanText = pong8TongDiscard3TongTenpai5WanPanel.sections.map((item) => item.text).join('\n');
for (const keyword of ['0\u5411\u542c', '5\u4e07', '3445\u4e07', '\u8f6c\u542c\u6838\u5fc3\u7ed3\u6784']) {
  if (!pong8TongDiscard3TongTenpai5WanText.includes(keyword)) failures.push(`${pong8TongDiscard3TongTenpai5WanId}: missing reason keyword ${keyword}`);
}

if (runtimeHtml.includes('30秒后自动跳过') || /_respTimer\s*=\s*gameSetTimeout[\s\S]{0,260}30000/.test(runtimeHtml)) {
  failures.push('stage4-runtime: response countdown still exists');
}
if (!runtimeHtml.includes('导出失败：生成或下载 JSON 文件失败') || !runtimeHtml.includes('[game log] export failed')) {
  failures.push('stage4-runtime: export failure lacks locatable message');
}
if (!runtimeHtml.includes('const exportLogs=currentLog?[currentLog]:[]') || !runtimeHtml.includes('JSON.stringify(exportLogs,null,2)')) {
  failures.push('stage4-runtime: export should serialize only the current game log');
}
if (!runtimeHtml.includes('recordAiDiscardInterpretation') || !runtimeHtml.includes("createRecommendationRecord('ai-discard'")) {
  failures.push('stage4-runtime: ai discard interpretation is not recorded');
}
if (!runtimeHtml.includes('function aiUnprotectedSingleHonor') || !runtimeHtml.includes('singleHonorAdj')) {
  failures.push('stage4-runtime: original draw-tiao3 replay lacks single honor discard priority over isolated middle tile');
}
if (/function updateSuggestion\(\)[\s\S]*?let hand=effectiveHand\(0\)/.test(runtimeHtml)) {
  failures.push('stage4-runtime: discard recommendation still uses effectiveHand as concealed hand after melds');
}
if (!runtimeHtml.includes('concealedHandKeys') || !runtimeHtml.includes('meldContext')) {
  failures.push('stage4-runtime: recommendation context does not separate concealed hand and meld context');
}
if (!runtimeHtml.includes('responseActionText') || !runtimeHtml.includes('mctsSummaryFinalResponseCandidate')) {
  failures.push('stage4-runtime: response candidate matching is not action/player specific');
}
if (!runtimeHtml.includes('logSkippedAiResponses')) {
  failures.push('stage4-runtime: skipped AI responders are not logged');
}
if (!runtimeHtml.includes('responseHonorTreasureValue') || !runtimeHtml.includes('白板宝牌价值')) {
  failures.push('stage4-runtime: white dragon treasure value is not included in response scoring');
}
if (!/function canSelfWin\s*\(\s*hand\s*,\s*winTile/.test(runtimeHtml)) {
  failures.push('stage4-runtime: self draw win check does not accept winTile');
}
if (!runtimeHtml.includes('function canSelfWinForPlayer') || !runtimeHtml.includes('ruleMeldsForPlayer(playerIdx)')) {
  failures.push('stage4-runtime: self draw win check must use concealed hand plus real meld context');
}
if (/canSelfWin\(effectiveHand\(/.test(runtimeHtml) || /canHuNormal\(effectiveHand\([^)]*\),false,0/.test(runtimeHtml)) {
  failures.push('stage4-runtime: self draw win check still evaluates effectiveHand without meld context');
}
if (/canSelfWin\(effectiveHand\(p\)\)/.test(runtimeHtml) || /canSelfWin\(hand\)\{recordRecommendationChoice\('response','胡'\)/.test(runtimeHtml)) {
  failures.push('stage4-runtime: self draw win check still omits winTile at call site');
}
if (!runtimeHtml.includes("canHuNormal(testHand,false,ruleMelds,winTile,'自摸')")) {
  failures.push('stage4-runtime: wait enumeration does not pass real meld context and winTile');
}
if (!runtimeHtml.includes('function formatWinSettlementText') || !runtimeHtml.includes('displayText:formatWinSettlementText')) {
  failures.push('stage4-runtime: settled win result is not persisted with full score deltas');
}
if (!/GS\._lastResult\.displayText[\s\S]{0,220}message\.textContent=GS\._lastResult\.displayText/.test(runtimeHtml)) {
  failures.push('stage4-runtime: restored ended game does not show full settlement details');
}
if (!runtimeHtml.includes('furoTransitionStructureScore') || !runtimeHtml.includes('furoTransitionAdj')) {
  failures.push('stage4-runtime: furo transition 3445 structure protection is missing from recommendation scoring');
}
if (!runtimeHtml.includes('furoTransitionReason') || !runtimeHtml.includes('furoTransitionAdj:furoTransitionAdj')) {
  failures.push('stage4-runtime: furo transition scoring is not exposed to candidate display');
}
if (!runtimeHtml.includes('sortedCandidateViews') || !runtimeHtml.includes('candidateViews.slice().sort')) {
  failures.push('stage4-runtime: candidate display ranking does not follow final recommendation score');
}
if (!runtimeHtml.includes('candDetails.forEach(function(d)') || runtimeHtml.includes('bestCands.forEach(function(ci')) {
  failures.push('stage4-runtime: furo transition scoring must be generated for all discard candidates');
}
if (!runtimeHtml.includes('if(a.tile===finalKey&&b.tile!==finalKey)return -1') || runtimeHtml.includes('bestCandidateView.totalScore=maxCandidateScore+10')) {
  failures.push('stage4-runtime: final recommendation should be ranked first without fixed score promotion');
}
if (!runtimeHtml.includes('function furoTransitionCoreReason') || !runtimeHtml.includes('furoTransitionReason:furoTransitionReason')) {
  failures.push('stage4-runtime: furo transition explanation is not passed as hand-level recommendation context');
}
if (!runtimeHtml.includes('recommendationMelds().some(function(m){return m.player===playerIdx;}')) {
  failures.push('stage4-runtime: furo transition explanation ignores visible meld context');
}
if (runtimeHtml.includes('discardHasNeighbor')) {
  failures.push('stage4-runtime: furo transition explanation is still blocked by isolated-neighbor check');
}
if (!runtimeHtml.includes('function visibleEdgeIsolatedAdj') || !runtimeHtml.includes('edgeVisibleReason')) {
  failures.push('stage4-runtime: isolated edge discard does not consider visible key-tile consumption');
}
if (!runtimeHtml.includes('waitKeys.length>0?Math.min(top.v,0):top.v')) {
  failures.push('stage4-runtime: exposed-meld discard candidates do not promote legal tenpai waits to 0 shanten');
}
if (!runtimeHtml.includes('aiBreaksMeld(hand,discardIdx)||aiBreaksTaatsu(hand,discardIdx)||aiBreaksPair(hand,discardIdx)')) {
  failures.push('stage4-runtime: structure tiles can still be described as isolated discards');
}
if (!fs.readFileSync(sourcePath, 'utf8').includes('副露后转听核心结构')) {
  failures.push('stage4-copy: furo transition reason does not explain the 3445 core structure');
}
if (!fs.readFileSync(sourcePath, 'utf8').includes('context.furoTransitionReason')) {
  failures.push('stage4-copy: recommendation panel does not render hand-level furo transition explanation');
}
if (!fs.readFileSync(sourcePath, 'utf8').includes('candidateDisplayScore')) {
  failures.push('stage4-copy: candidate score display still lacks relative normalization');
}
if (!runtimeHtml.includes('lastDrawnTile') || !runtimeHtml.includes('lastDrawnTileKey')) {
  failures.push('stage4-runtime: AI drawn tile state is not stored per player');
}
if (!/function aiDisplayHand\s*\(/.test(runtimeHtml)) {
  failures.push('stage4-runtime: AI visible hand does not preserve drawn tile at the end');
}
if (!/aiDrawHighlight/.test(runtimeHtml) || !/lastDrawnTileKey/.test(runtimeHtml)) {
  failures.push('stage4-runtime: AI drawn tile green highlight is missing');
}
if (!/clearPlayerDrawMarker\s*\(/.test(runtimeHtml)) {
  failures.push('stage4-runtime: AI drawn tile marker is not cleared after discard or state transitions');
}
if (!runtimeHtml.includes('强行跑杠') || !runtimeHtml.includes('paoGangSuccess') || !runtimeHtml.includes('overallTenpai')) {
  failures.push('stage4-runtime: qiangxing pao gang result is not written to exported event log');
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
