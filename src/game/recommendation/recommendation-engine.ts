export type Confidence = '高' | '中' | '低';
export type RecommendationType = 'discard' | 'response' | 'ai-discard' | 'round-review' | 'summary';

export interface CandidateView {
  tile: string;
  tileLabel: string;
  totalScore: number;
  shantenAfter: number;
  route: string;
  speedScore?: number;
  handValueScore?: number;
  waitQualityScore?: number;
  kongZhichanScore?: number;
  dalanRouteScore?: number;
  defenseScore?: number;
  positionAdjustment?: number;
  structurePenalty?: number;
  waitCount?: number;
  waitRemaining?: number;
  waitTiles?: { tile: string; label?: string; remaining: number }[];
  breaksMeld?: boolean;
  breaksPair?: boolean;
  breaksTaatsu?: boolean;
}

export interface RecommendationContext {
  turn: number;
  phaseLabel: string;
  currentPlayer: number;
  hand: string[];
  handLabels: Record<string, string>;
  selectedTile?: string | null;
  systemRecommendation?: CandidateView | null;
  candidates: CandidateView[];
  discards: string[][];
  melds: { player: number; tile: string; count: number; type?: string }[];
  scores: number[];
  aiLastDiscard?: { player: number; playerName: string; tile: string; tileLabel: string } | null;
  responseEvent?: { fromPlayer: number; fromName: string; tile: string; tileLabel: string; actions: string[] } | null;
  previousRound?: RecommendationRecord | null;
  records?: RecommendationRecord[];
  summary?: GameRecommendationSummary | null;
}

export interface RecommendationRecord {
  id: string;
  type: RecommendationType;
  turn: number;
  confidence: Confidence;
  recommendedAction: string;
  actualAction?: string | null;
  adopted?: boolean | null;
  strategyGap?: string;
  reasons: string[];
  sections: RecommendationSection[];
}

export interface RecommendationSection {
  title: string;
  html: string;
  text: string;
}

export interface GameRecommendationSummary {
  total: number;
  discardRecommendations: number;
  responseRecommendations: number;
  highConfidenceMissed: number;
  obviousStrategyGaps: number;
  topics: Record<string, number>;
  reviewTurns: number[];
}

export interface RecommendationPanel {
  sections: RecommendationSection[];
  records: RecommendationRecord[];
  selectedTileKey?: string | null;
  systemTile?: string | null;
  confidence?: Confidence;
}

const ROUTE_LABELS: Record<string, string> = {
  norm: '普通面子手',
  normal: '普通面子手',
  '7p': '七对子',
  dalan: '打烂',
  quanzheng: '全正宗',
  banzheng: '半正宗',
  clear: '清一色',
  mixed: '混一色',
};

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function labelFor(context: RecommendationContext, tile?: string | null): string {
  if (!tile) return '无';
  return context.handLabels[tile] || tile;
}

export function toDisplayScore(value: number, min = -2, max = 2): number {
  if (!Number.isFinite(value)) return 50;
  if (max === min) return 50;
  return Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));
}

export function confidenceFor(candidates: CandidateView[]): Confidence {
  if (!candidates.length) return '低';
  const sorted = candidates.slice().sort((a, b) => b.totalScore - a.totalScore);
  const gap = sorted.length > 1 ? sorted[0].totalScore - sorted[1].totalScore : 10;
  if (gap >= 8) return '高';
  if (gap >= 3) return '中';
  return '低';
}

export function candidateTag(candidate: CandidateView, index: number): string {
  if (index === 0) return '推荐';
  if ((candidate.defenseScore || 0) < -0.6) return '风险';
  if (candidate.breaksMeld || candidate.breaksPair || candidate.breaksTaatsu || (candidate.structurePenalty || 0) < -4) return '破坏结构';
  if ((candidate.defenseScore || 0) > 0.4) return '防守优先';
  if (index === 1) return '可选';
  if (index <= 3) return '一般';
  return '不建议';
}

export function countVisible(tile: string, context: RecommendationContext): { publicSeen: number; own: number; unknown: number } {
  const publicSeen = (context.discards || []).reduce((sum, row) => sum + row.filter((item) => item === tile).length, 0)
    + (context.melds || []).reduce((sum, meld) => sum + (meld.tile === tile ? meld.count : 0), 0);
  const own = (context.hand || []).filter((item) => item === tile).length;
  return { publicSeen, own, unknown: Math.max(0, 4 - publicSeen - own) };
}

function section(title: string, htmlBody: string): RecommendationSection {
  return { title, text: stripTags(htmlBody), html: `<section class="rec-section"><h4>${esc(title)}</h4>${htmlBody}</section>` };
}

function line(label: string, value: string): string {
  return `<div class="rec-line"><b>${esc(label)}：</b>${value}</div>`;
}

function scoreWord(score: number, positive = true): string {
  if (score >= 75) return positive ? '较好' : '较低';
  if (score >= 50) return '中等';
  if (score >= 25) return positive ? '偏弱' : '偏高';
  return positive ? '较弱' : '较高';
}

function sortedCandidates(context: RecommendationContext): CandidateView[] {
  return (context.candidates || []).slice().sort((a, b) => b.totalScore - a.totalScore).slice(0, 5);
}

function systemCandidate(context: RecommendationContext): CandidateView | null {
  return context.systemRecommendation || sortedCandidates(context)[0] || null;
}

function topicFor(candidate: CandidateView): string {
  if ((candidate.defenseScore || 0) > Math.max(candidate.speedScore || 0, candidate.handValueScore || 0)) return '防守安全';
  if ((candidate.dalanRouteScore || 0) > 0.5) return '打烂/正宗路线';
  if ((candidate.kongZhichanScore || 0) > 0.5) return '杠/直铲机会';
  if ((candidate.handValueScore || 0) > (candidate.speedScore || 0)) return '打点收益';
  return '牌效速度';
}

export function buildDiscardRecommendation(context: RecommendationContext): RecommendationSection {
  const best = systemCandidate(context);
  if (!best) return section('一、系统推荐', '<p>当前没有可用的出牌推荐。</p>');
  const candidates = sortedCandidates(context);
  const second = candidates[1];
  const confidence = confidenceFor(candidates);
  const score = toDisplayScore(best.totalScore, -8, 18);
  const body = [
    line('推荐打出', `<span class="rec-tile">${esc(best.tileLabel)}</span>`),
    line('推荐目标', '长期期望收益最高'),
    line('置信度', esc(confidence)),
    line('综合评分', `${score} 分`),
    line('第二候选', second ? `${esc(second.tileLabel)}，${toDisplayScore(second.totalScore, -8, 18)} 分` : '暂无'),
    `<p class="rec-conclusion">结论：当前推荐偏向${esc(topicFor(best))}，弃${esc(best.tileLabel)}后为${esc(best.shantenAfter)}向听，并综合考虑结构、打点、防守和位置。</p>`,
  ].join('');
  return section('一、系统推荐', body);
}

export function buildDetailedReasons(context: RecommendationContext): RecommendationSection {
  const best = systemCandidate(context);
  if (!best) return section('二、详细推荐理由', '<p>暂无推荐理由。</p>');
  const speed = toDisplayScore(best.speedScore ?? -best.shantenAfter, -4, 2);
  const value = toDisplayScore(best.handValueScore ?? 0, -2, 3);
  const wait = toDisplayScore(best.waitQualityScore ?? 0, -2, 3);
  const defense = toDisplayScore(best.defenseScore ?? 0, -2, 3,);
  const route = ROUTE_LABELS[best.route] || best.route || '普通路线';
  const structure = best.breaksMeld || best.breaksPair || best.breaksTaatsu ? '可能破坏结构' : '不明显破坏结构';
  const body = [
    line('速度', `${scoreWord(speed)}，弃${esc(best.tileLabel)}后为${esc(best.shantenAfter)}向听。`),
    line('打点', `${scoreWord(value)}，当前路线为${esc(route)}。`),
    line('听牌质量', `${scoreWord(wait)}，${best.waitRemaining ? `剩余有效进张约 ${best.waitRemaining} 枚。` : '当前还未形成明确待牌。'}`),
    line('结构影响', `${esc(structure)}。${best.breaksPair ? '会拆对子，需要权衡。' : ''}${best.breaksTaatsu ? '会拆搭子，需要权衡。' : ''}`),
    line('防守风险', `${scoreWord(defense)}，只基于公开牌河、副露和已见牌判断。`),
    line('杠/直铲机会', (best.kongZhichanScore || 0) > 0.5 ? '存在潜在收益，推荐保留相关结构。' : '暂无明显机会。'),
    line('分数位置', '已纳入当前分数位置，不单独评价玩家能力。'),
  ].join('');
  return section('二、详细推荐理由', body);
}

export function buildCandidateRanking(context: RecommendationContext): RecommendationSection {
  const rows = sortedCandidates(context).map((candidate, index) => {
    const reasons: string[] = [];
    if (!candidate.breaksMeld && !candidate.breaksPair && !candidate.breaksTaatsu) reasons.push('不明显破坏面子、搭子或对子');
    if (candidate.breaksMeld || candidate.breaksPair || candidate.breaksTaatsu) reasons.push('会影响已有结构');
    reasons.push(`弃后为 ${candidate.shantenAfter} 向听`);
    if ((candidate.defenseScore || 0) > 0.2) reasons.push('公开信息下安全性较好');
    if ((candidate.defenseScore || 0) < -0.6) reasons.push('防守风险偏高');
    return `<div class="rec-candidate"><b>${index + 1}. ${esc(candidate.tileLabel)} - ${toDisplayScore(candidate.totalScore, -8, 18)} 分｜${esc(candidateTag(candidate, index))}</b><ul>${reasons.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>`;
  }).join('');
  return section('三、候选牌排序原因', rows || '<p>暂无候选排序。</p>');
}

export function buildClickAnalysis(context: RecommendationContext): RecommendationSection {
  const selected = context.selectedTile;
  if (!selected) return section('四、点击分析', '<p>当前未选中手牌。点击任意手牌后，这里会展示“如果打这张会怎样”。</p>');
  const candidate = (context.candidates || []).find((item) => item.tile === selected);
  const best = systemCandidate(context);
  const label = labelFor(context, selected);
  if (!candidate) return section('四、点击分析', `<p>你当前选中：<b>${esc(label)}</b>。这张牌当前不在候选弃牌中。</p>`);
  const diff = best ? toDisplayScore(best.totalScore, -8, 18) - toDisplayScore(candidate.totalScore, -8, 18) : 0;
  const body = [
    `<p>你当前选中：<b>${esc(label)}</b></p>`,
    `<ul><li>如果打${esc(label)}：进入 ${esc(candidate.shantenAfter)} 向听。</li>`,
    `<li>${candidate.breaksMeld || candidate.breaksPair || candidate.breaksTaatsu ? '会影响已有结构，需要谨慎。' : '不明显拆完整面子或对子。'}</li>`,
    `<li>与系统推荐${best ? esc(best.tileLabel) : '暂无'}相比，综合评分${diff > 0 ? `低约 ${diff} 分` : '接近'}。</li></ul>`,
    `<p class="rec-conclusion">结论：${diff >= 15 ? '策略差异明显，建议优先参考系统推荐。' : '属于可理解选择，但系统推荐的长期期望更高。'}</p>`,
  ].join('');
  return section('四、点击分析', body);
}

export function buildVisibleCount(context: RecommendationContext): RecommendationSection {
  const tile = context.selectedTile || systemCandidate(context)?.tile || null;
  if (!tile) return section('五、同牌高亮与剩余枚数', '<p>暂无选中牌。</p>');
  const counts = countVisible(tile, context);
  const label = labelFor(context, tile);
  const body = [
    line('当前牌', esc(label)),
    line('公开已见', `${counts.publicSeen} 张`),
    line('你手中', `${counts.own} 张`),
    line('剩余未知', `${counts.unknown} 张`),
    `<p class="rec-conclusion">${counts.unknown === 0 ? `${esc(label)}已经全部见光，进张价值为 0。` : `${esc(label)}仍有 ${counts.unknown} 张未知，牌效和风险都需要结合牌河判断。`}</p>`,
  ].join('');
  return section('五、同牌高亮与剩余枚数', body);
}

export function buildRiverAnalysis(context: RecommendationContext): RecommendationSection {
  const playerNames = ['你', 'AI下家', 'AI对家', 'AI上家'];
  const rows = [1, 2, 3].map((player) => {
    const discards = context.discards[player] || [];
    const melds = (context.melds || []).filter((meld) => meld.player === player);
    const last = discards.slice(-3).map((tile) => labelFor(context, tile)).join('、') || '暂无';
    const route = melds.length ? `已有 ${melds.length} 组副露，可能正在收缩路线` : discards.length >= 8 ? '弃牌较多，听牌概率上升' : '暂未显示明显路线';
    return `<li>${esc(playerNames[player])}：近三张 ${esc(last)}，${esc(route)}。</li>`;
  }).join('');
  const body = `<ul>${rows}</ul><p>重点观察：只基于公开弃牌和副露，不使用未公开信息。</p>`;
  return section('六、牌河与对手分析', body);
}

export function buildAiDiscardInterpretation(context: RecommendationContext): RecommendationSection {
  const ai = context.aiLastDiscard;
  if (!ai) return section('七、AI 玩家出牌解读', '<p>当前还没有新的 AI 出牌需要解读。</p>');
  const counts = countVisible(ai.tile, context);
  const body = [
    `<p>${esc(ai.playerName)}打出：<b>${esc(ai.tileLabel)}</b></p>`,
    '<p>可能原因：</p>',
    `<ul><li>${esc(ai.tileLabel)}公开已见 ${counts.publicSeen} 张，剩余价值发生变化。</li><li>从公开信息看，该出牌可能是在整理边张、孤张或进行防守。</li><li>如果该玩家已有副露，则可能继续向副露花色或字牌方向收缩。</li></ul>`,
    `<p>对你的影响：${counts.unknown === 0 ? '这张牌已经接近或完全见光，进张价值下降。' : '这张牌后续仍需结合对手路线判断风险。'}</p>`,
  ].join('');
  return section('七、AI 玩家出牌解读', body);
}

export function buildResponseRecommendation(context: RecommendationContext): RecommendationSection {
  const event = context.responseEvent;
  if (!event) return section('八、响应阶段推荐', '<p>当前无响应动作。胡、碰、杠、直铲、过会在可响应时展示。</p>');
  const priority = ['胡', '杠', '直铲', '碰', '过'];
  const recommended = priority.find((action) => event.actions.includes(action)) || event.actions[0] || '过';
  const confidence: Confidence = recommended === '胡' ? '高' : event.actions.length > 2 ? '中' : '低';
  const body = [
    line('当前事件', `${esc(event.fromName)}打出 ${esc(event.tileLabel)}`),
    line('可选动作', event.actions.map(esc).join('、') || '无'),
    line('系统建议', esc(recommended)),
    line('推荐置信度', confidence),
    '<p>详细分析：</p>',
    `<ul><li>${recommended === '胡' ? '当前可胡时优先避免过水。' : '当前动作需要比较收益、向听和结构损失。'}</li><li>选择过可能影响本圈同牌胡牌机会。</li><li>涉及杠/直铲时，会同时考虑宝牌、没走色和连杠潜力。</li></ul>`,
  ].join('');
  return section('八、响应阶段推荐', body);
}

export function buildRoundReview(context: RecommendationContext): RecommendationSection {
  const round = context.previousRound;
  if (!round) return section('九、本轮推荐复盘', '<p>本轮尚未形成出牌后的复盘。</p>');
  const body = [
    line('AI 推荐', esc(round.recommendedAction)),
    line('实际选择', esc(round.actualAction || '尚未选择')),
    line('是否采纳', round.adopted == null ? '待记录' : round.adopted ? '选择一致' : '未采纳'),
    `<p>策略差异：${esc(round.strategyGap || '等待玩家实际选择后生成。')}</p>`,
    '<p>复盘结论：只说明策略差异，不评价玩家能力。</p>',
  ].join('');
  return section('九、本轮推荐复盘', body);
}

export function summarizeRecords(records: RecommendationRecord[]): GameRecommendationSummary {
  const topics: Record<string, number> = {};
  let highConfidenceMissed = 0;
  let obviousStrategyGaps = 0;
  const reviewTurns: number[] = [];
  for (const record of records || []) {
    if (record.confidence === '高' && record.adopted === false) highConfidenceMissed += 1;
    if (record.strategyGap && record.strategyGap.includes('明显')) {
      obviousStrategyGaps += 1;
      reviewTurns.push(record.turn);
    }
    const joined = record.reasons.join('');
    const topic = joined.includes('防守') ? '防守安全'
      : joined.includes('打烂') || joined.includes('正宗') ? '打烂/正宗路线'
        : joined.includes('杠') || joined.includes('直铲') ? '杠/直铲机会'
          : '牌效速度';
    topics[topic] = (topics[topic] || 0) + 1;
  }
  return {
    total: records.length,
    discardRecommendations: records.filter((record) => record.type === 'discard').length,
    responseRecommendations: records.filter((record) => record.type === 'response').length,
    highConfidenceMissed,
    obviousStrategyGaps,
    topics,
    reviewTurns: Array.from(new Set(reviewTurns)).slice(0, 5),
  };
}

export function buildGameSummary(context: RecommendationContext): RecommendationSection {
  const summary = context.summary || summarizeRecords(context.records || []);
  if (!summary || summary.total === 0) return section('十、本局推荐总结', '<p>本局结束后自动置顶展示。当前还没有可汇总的推荐记录。</p>');
  const topics = Object.entries(summary.topics).map(([name, count]) => `${esc(name)}：${count} 次`).join('；') || '暂无';
  const body = [
    line('本局推荐总次数', `${summary.total} 次`),
    line('主动出牌推荐', `${summary.discardRecommendations} 次`),
    line('响应阶段推荐', `${summary.responseRecommendations} 次`),
    line('高置信推荐未采纳', `${summary.highConfidenceMissed} 次`),
    line('策略差异明显', `${summary.obviousStrategyGaps} 次`),
    line('本局推荐重点', topics),
    line('值得复盘的回合', summary.reviewTurns.length ? summary.reviewTurns.join('、') : '暂无'),
  ].join('');
  return section('十、本局推荐总结', body);
}

export function createRecommendationRecord(type: RecommendationType, context: RecommendationContext, sectionList: RecommendationSection[], actualAction?: string | null): RecommendationRecord {
  const best = systemCandidate(context);
  const confidence = confidenceFor(sortedCandidates(context));
  const recommendedAction = type === 'response' && context.responseEvent
    ? (['胡', '杠', '直铲', '碰', '过'].find((action) => context.responseEvent?.actions.includes(action)) || '过')
    : best ? `打${best.tileLabel}` : '等待';
  return {
    id: `${type}-${context.turn}-${Date.now()}`,
    type,
    turn: context.turn,
    confidence,
    recommendedAction,
    actualAction: actualAction || null,
    adopted: actualAction ? actualAction === recommendedAction || recommendedAction.includes(actualAction) : null,
    strategyGap: actualAction ? (recommendedAction.includes(actualAction) ? '选择一致' : '策略差异明显') : '等待实际选择',
    reasons: sectionList.map((item) => item.text.slice(0, 120)),
    sections: sectionList,
  };
}

export function buildPanel(context: RecommendationContext): RecommendationPanel {
  const sections = [
    buildDiscardRecommendation(context),
    buildDetailedReasons(context),
    buildCandidateRanking(context),
    buildClickAnalysis(context),
    buildVisibleCount(context),
    buildRiverAnalysis(context),
    buildAiDiscardInterpretation(context),
    buildResponseRecommendation(context),
    buildRoundReview(context),
    buildGameSummary(context),
  ];
  return {
    sections,
    records: context.records || [],
    selectedTileKey: context.selectedTile || null,
    systemTile: systemCandidate(context)?.tile || null,
    confidence: confidenceFor(sortedCandidates(context)),
  };
}

export function buildPanelHtml(context: RecommendationContext): string {
  return buildPanel(context).sections.map((item) => item.html).join('');
}
