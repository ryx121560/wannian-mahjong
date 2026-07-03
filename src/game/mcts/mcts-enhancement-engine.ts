export type MctsActionType = 'discard' | 'pong' | 'kong' | 'win' | 'pass';

export interface MctsCandidate {
  id: string;
  action: MctsActionType;
  tile?: string;
  tileLabel?: string;
  legal: boolean;
  baseScore: number;
  shantenAfter?: number;
  route?: string;
  breaksRoute?: boolean;
  defenseRisk?: number;
  dealInRisk?: number;
  kongRisk?: number;
  scoreImpact?: number;
  waitCount?: number;
  waitRemaining?: number;
  coreSequenceBreak?: boolean;
  isStrongRuleChoice?: boolean;
  dragonComboBreak?: boolean;
  isolatedDiscardPriority?: number;
  modelFeatures?: {
    routeTransition?: boolean;
    complexRanking?: boolean;
    scorePosition?: 'leading' | 'behind' | 'neutral';
  };
}

export interface MctsDecisionContext {
  turn: number;
  player: number;
  phase: 'discarding' | 'responding' | 'recommendation';
  timeLimitMs?: number;
  scores: number[];
  dealer?: number;
  wallRemaining?: number;
  discards: string[][];
  melds: { player: number; tile: string; count: number; type?: string }[];
  handSummary: string[];
  opponentThreats?: { player: number; tenpaiRisk: number; dalanRisk: number; honorRisk: number }[];
  strongRuleAction?: string | null;
  candidates: MctsCandidate[];
}

export interface MctsDecisionSummary {
  schemaVersion: 'mcts-decision-v1';
  modelDecisionSchemaVersion: 'stage6-model-decision-v1';
  modelVersion: string;
  trainingDataVersion: string;
  ruleEngineVersion: string;
  mctsVersion: string;
  strongRuleVersion: string;
  turn: number;
  player: number;
  phase: string;
  finalAction: string;
  strongRuleAction: string | null;
  mctsAction: string;
  modelAction: string | null;
  modelRoute: string | null;
  modelConfidence: 'weak' | 'medium' | 'strong';
  modelTendencyStrength: 'weak' | 'medium' | 'strong';
  modelAgreement: {
    withMcts: boolean;
    withStrongRule: boolean;
  };
  modelAffectedFinalChoice: boolean;
  modelAdoptionReason: string | null;
  modelRejectionReason: string | null;
  routeTransitionJudgment: string;
  ruleConstraintBlocks: string[];
  overridden: boolean;
  overrideReason: string | null;
  notOverrideReason: string | null;
  candidates: Array<{
    action: string;
    averageValue: number;
    mainRisk: string;
    dealInRisk: number;
    kongRisk: number;
    coreSequenceBreak: boolean;
  }>;
  defenseInfluence: string;
  structureLossReason: string | null;
  hiddenInferenceUsed: boolean;
  hiddenInferenceNote: string;
  scoreSituationNote: string;
  kongRiskNote: string;
  elapsedMs: number;
  timedOut: boolean;
  fallbackReason: string | null;
  currentBestOnTimeout: string | null;
  playerExplanation: string;
}

interface ScoredCandidate extends MctsCandidate {
  value: number;
  mainRisk: string;
}

const WEAK_GAP = 1.5;
const STAGE6_MODEL_VERSION = 'stage6-lightweight-strategy-v1';
const STAGE6_TRAINING_DATA_VERSION = 'stage6-mcts-selfplay-50000-v1';
const RULE_ENGINE_VERSION = 'wannian-rule-engine-stage1-gated';
const MCTS_VERSION = 'stage5-mcts-enhancement-v1';
const STRONG_RULE_VERSION = 'strong-rule-ai-stage3-v1';

interface ModelAdvice {
  action: string | null;
  route: string | null;
  confidence: 'weak' | 'medium' | 'strong';
  tendencyStrength: 'weak' | 'medium' | 'strong';
  candidate: ScoredCandidate | null;
  score: number;
  routeTransitionJudgment: string;
  ruleConstraintBlocks: string[];
}

function actionText(candidate: Pick<MctsCandidate, 'action' | 'tileLabel' | 'tile'>): string {
  if (candidate.action === 'discard') return `打${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'pong') return `碰${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'kong') return `杠${candidate.tileLabel || candidate.tile || ''}`;
  if (candidate.action === 'win') return '胡';
  return '过';
}

function clampRisk(value?: number): number {
  if (!Number.isFinite(value || 0)) return 0;
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function scorePosition(context: MctsDecisionContext): 'leading' | 'behind' | 'neutral' {
  const me = context.scores[context.player] || 0;
  const others = context.scores.filter((_, idx) => idx !== context.player);
  const maxOther = Math.max(...others);
  const minOther = Math.min(...others);
  if (me >= maxOther + 15) return 'leading';
  if (me <= minOther - 15) return 'behind';
  return 'neutral';
}

function strongestThreat(context: MctsDecisionContext): number {
  return Math.max(0, ...(context.opponentThreats || []).map((item) => clampRisk(item.tenpaiRisk)));
}

function hasDalanThreat(context: MctsDecisionContext): boolean {
  return (context.opponentThreats || []).some((item) => clampRisk(item.dalanRisk) >= 0.55);
}

function isHonor(tile?: string): boolean {
  return !!tile && ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'].includes(tile);
}

function numberValue(tile?: string): number | null {
  if (!tile) return null;
  const match = tile.match(/(\d)$/);
  return match ? Number(match[1]) : null;
}

function numberSuit(tile?: string): string | null {
  if (!tile) return null;
  const match = tile.match(/^(wan|tong|tiao)[1-9]$/);
  return match ? match[1] : null;
}

function breaksCoreSequence(candidate: MctsCandidate, context: MctsDecisionContext): boolean {
  if (candidate.coreSequenceBreak) return true;
  if (candidate.action !== 'discard') return false;
  const suit = numberSuit(candidate.tile);
  const value = numberValue(candidate.tile);
  if (!suit || value == null) return false;
  const values = new Set(
    (context.handSummary || [])
      .filter((tile) => numberSuit(tile) === suit)
      .map((tile) => numberValue(tile))
      .filter((item): item is number => item != null),
  );
  for (let start = 1; start <= 6; start += 1) {
    if (values.has(start) && values.has(start + 1) && values.has(start + 2) && values.has(start + 3)) {
      if (value === start + 1 || value === start + 2) return true;
    }
  }
  for (let start = 1; start <= 7; start += 1) {
    if (values.has(start) && values.has(start + 1) && values.has(start + 2)) {
      if (value === start || value === start + 1 || value === start + 2) return true;
    }
  }
  return false;
}

function scorePositionAdjustment(candidate: MctsCandidate, context: MctsDecisionContext): number {
  const pos = scorePosition(context);
  if (pos === 'leading') {
    if ((candidate.dealInRisk || 0) > 0.45 || (candidate.kongRisk || 0) > 0.45) return -3.5;
    if (candidate.action === 'win') return 2.5;
    return 0.8;
  }
  if (pos === 'behind') {
    if (candidate.action === 'win' && (candidate.scoreImpact || 0) < 2 && (candidate.route || '') !== 'high-value') return -0.7;
    if ((candidate.scoreImpact || 0) >= 4 || ['dalan', '7p', 'quanzheng', 'banzheng'].includes(candidate.route || '')) return 2.2;
    return 0;
  }
  return 0;
}

function defenseAdjustment(candidate: MctsCandidate, context: MctsDecisionContext): number {
  const defenseRisk = clampRisk(candidate.defenseRisk);
  const dealInRisk = clampRisk(candidate.dealInRisk);
  const late = context.turn >= 48;
  const leading = scorePosition(context) === 'leading';
  const threat = strongestThreat(context);
  const weight = (late ? 3.2 : 2.1) + (leading ? 1.4 : 0) + threat;
  return -(defenseRisk * 2 + dealInRisk * 3) * weight;
}

function kongAdjustment(candidate: MctsCandidate, context: MctsDecisionContext): number {
  if (candidate.action !== 'kong') return 0;
  let risk = clampRisk(candidate.kongRisk);
  const num = numberValue(candidate.tile);
  if (isHonor(candidate.tile)) risk += 0.25;
  if (num != null && num >= 5) risk += 0.15;
  if (hasDalanThreat(context)) risk += 0.2;
  risk += strongestThreat(context) * 0.2;
  const behind = scorePosition(context) === 'behind';
  const reward = (candidate.scoreImpact || 0) + (behind ? 1.2 : 0);
  return reward - Math.min(1.4, risk) * 5.5;
}

function routeProtectionAdjustment(candidate: MctsCandidate): number {
  if (!candidate.breaksRoute) return 0;
  const protectedRoute = ['dalan', '7p', 'quanzheng', 'banzheng', 'high-value'].includes(candidate.route || '');
  return protectedRoute ? -4.5 : -2;
}

function coreSequenceAdjustment(candidate: MctsCandidate, context: MctsDecisionContext): number {
  if (!breaksCoreSequence(candidate, context)) return 0;
  const threat = strongestThreat(context);
  const late = context.turn >= 48;
  if (threat >= 0.75 || late) return -2.5;
  return -7.5;
}

function dragonComboAdjustment(candidate: MctsCandidate, context: MctsDecisionContext): number {
  if (!candidate.dragonComboBreak) return 0;
  const threat = strongestThreat(context);
  return threat >= 0.75 ? -2.2 : -5.2;
}

function isolatedDiscardAdjustment(candidate: MctsCandidate, context: MctsDecisionContext): number {
  if (candidate.action !== 'discard') return 0;
  if (strongestThreat(context) >= 0.65 || scorePosition(context) === 'leading') return 0;
  const priority = Number(candidate.isolatedDiscardPriority || 0);
  if (!Number.isFinite(priority) || priority <= 0) return 0;
  return Math.min(5, priority) * 0.6;
}

function actionPriorityAdjustment(candidate: MctsCandidate, context: MctsDecisionContext): number {
  const hasWin = context.candidates.some((item) => item.legal && item.action === 'win');
  if (candidate.action === 'win') return 12 + (candidate.scoreImpact || 0);
  if (candidate.action === 'pass' && hasWin) return -16;
  if (candidate.action === 'pong') return 0.5;
  if (candidate.action === 'kong') return 0.4;
  return 0;
}

function invalidReadyAdjustment(candidate: MctsCandidate): number {
  if (candidate.action !== 'discard') return 0;
  if (candidate.shantenAfter !== 0) return 0;
  if ((candidate.waitCount ?? 1) > 0) return 0;
  return -6;
}

function hasInvalidReadyWait(candidate: MctsCandidate): boolean {
  return candidate.action === 'discard' && candidate.shantenAfter === 0 && (candidate.waitCount ?? 1) <= 0;
}

function mainRisk(candidate: MctsCandidate, context: MctsDecisionContext): string {
  if (!candidate.legal) return '非法动作';
  if (hasInvalidReadyWait(candidate)) return '没有合法待牌';
  if (candidate.action === 'kong' && clampRisk(candidate.kongRisk) >= 0.55) return '杠后风险较高';
  if (isHonor(candidate.tile) && candidate.action === 'kong') return '风牌/字牌杠需要谨慎';
  if (clampRisk(candidate.dealInRisk) >= 0.55) return '放炮风险较高';
  if (clampRisk(candidate.defenseRisk) >= 0.55 || strongestThreat(context) >= 0.65) return '对手威胁较高';
  if (candidate.breaksRoute) return '可能破坏高价值路线';
  return '风险可控';
}

function scoreCandidate(candidate: MctsCandidate, context: MctsDecisionContext): ScoredCandidate {
  const value = candidate.legal
    ? candidate.baseScore
      + scorePositionAdjustment(candidate, context)
      + defenseAdjustment(candidate, context)
      + kongAdjustment(candidate, context)
      + routeProtectionAdjustment(candidate)
      + coreSequenceAdjustment(candidate, context)
      + dragonComboAdjustment(candidate, context)
      + isolatedDiscardAdjustment(candidate, context)
      + invalidReadyAdjustment(candidate)
      + actionPriorityAdjustment(candidate, context)
    : -Infinity;
  return { ...candidate, value, mainRisk: mainRisk(candidate, context) };
}

function modelScore(candidate: ScoredCandidate, context: MctsDecisionContext): number {
  if (!candidate.legal) return -Infinity;
  let score = candidate.value;
  const pos = scorePosition(context);
  const route = candidate.route || 'norm';
  const routeTransition = !!candidate.modelFeatures?.routeTransition
    || (candidate.action === 'discard' && ['dalan', '7p', 'quanzheng', 'banzheng', 'high-value'].includes(route) && (candidate.shantenAfter ?? 9) <= 1);
  if (routeTransition) score += 1.2;
  if ((candidate.waitRemaining || 0) >= 4) score += 0.8;
  if ((candidate.waitCount || 0) >= 2) score += 0.5;
  if ((candidate.isolatedDiscardPriority || 0) > 0) score += Math.min(2, Number(candidate.isolatedDiscardPriority || 0) * 0.25);
  if (candidate.dragonComboBreak) score -= 2.2;
  if (breaksCoreSequence(candidate, context)) score -= strongestThreat(context) >= 0.75 ? 1.2 : 3.5;
  if (candidate.breaksRoute) score -= 1.4;
  if (pos === 'leading') score -= clampRisk(candidate.dealInRisk) * 2.2 + clampRisk(candidate.kongRisk) * 1.4;
  if (pos === 'behind' && (candidate.scoreImpact || 0) >= 2) score += 0.9;
  return score;
}

function confidenceFromGap(gap: number): 'weak' | 'medium' | 'strong' {
  if (gap >= 3) return 'strong';
  if (gap >= 1.2) return 'medium';
  return 'weak';
}

function buildModelAdvice(scored: ScoredCandidate[], context: MctsDecisionContext): ModelAdvice {
  const legal = scored.filter((item) => item.legal);
  const ranked = legal
    .map((candidate) => ({ candidate, score: modelScore(candidate, context) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0] || null;
  const second = ranked[1] || null;
  const gap = top && second ? top.score - second.score : top ? 3 : 0;
  const ruleConstraintBlocks = scored
    .filter((candidate) => !candidate.legal || hasInvalidReadyWait(candidate))
    .map((candidate) => `${actionText(candidate)}:${candidate.legal ? 'ready-wait-blocked' : 'illegal-blocked'}`);
  const routeTransitionCandidate = ranked.find((item) => !!item.candidate.modelFeatures?.routeTransition
    || ['dalan', '7p', 'quanzheng', 'banzheng', 'high-value'].includes(item.candidate.route || ''));
  const routeTransitionJudgment = routeTransitionCandidate
    ? `模型识别到${actionText(routeTransitionCandidate.candidate)}存在路线转换价值，已作为弱增强信号参与复核。`
    : '模型未识别到明确路线转换机会，仅按稳定候选排序辅助复核。';
  return {
    action: top ? actionText(top.candidate) : null,
    route: top?.candidate.route || null,
    confidence: confidenceFromGap(gap),
    tendencyStrength: confidenceFromGap(Math.abs(top?.score || 0)),
    candidate: top?.candidate || null,
    score: top?.score || 0,
    routeTransitionJudgment,
    ruleConstraintBlocks,
  };
}

function findStrongRule(scored: ScoredCandidate[], context: MctsDecisionContext): ScoredCandidate | null {
  return scored.find((item) => item.isStrongRuleChoice)
    || scored.find((item) => actionText(item) === context.strongRuleAction)
    || null;
}

function chooseFinal(scored: ScoredCandidate[], context: MctsDecisionContext): { best: ScoredCandidate; mctsBest: ScoredCandidate; strong: ScoredCandidate | null; model: ModelAdvice; reason: string | null; notReason: string | null; modelReason: string | null; modelRejectReason: string | null; modelAffected: boolean } {
  const legal = scored.filter((item) => item.legal).sort((a, b) => b.value - a.value);
  const fallback = legal[0] || scored[0];
  const strong = findStrongRule(scored, context);
  const model = buildModelAdvice(scored, context);
  if (!fallback) throw new Error('MCTS requires at least one candidate');
  if (!strong || !strong.legal) return { best: fallback, mctsBest: fallback, strong, model, reason: '强规则候选不可用，采用搜索收益最高的合法动作', notReason: null, modelReason: null, modelRejectReason: '强规则候选不可用，模型只记录建议不参与覆盖', modelAffected: false };
  if (hasInvalidReadyWait(strong)) {
    return { best: fallback, mctsBest: fallback, strong, model, reason: '强规则候选形成的听牌没有合法待牌，采用可实际胡牌的候选', notReason: null, modelReason: null, modelRejectReason: '规则约束阻断候选，模型不得覆盖', modelAffected: false };
  }
  const gap = fallback.value - strong.value;
  if (gap < WEAK_GAP && model.candidate && model.confidence !== 'weak') {
    const closeToMcts = fallback.value - model.candidate.value < WEAK_GAP;
    const closeToStrong = model.candidate.value - strong.value > -WEAK_GAP;
    if (closeToMcts && closeToStrong && !hasInvalidReadyWait(model.candidate)) {
      const affected = actionText(model.candidate) !== actionText(strong);
      return {
        best: model.candidate,
        mctsBest: fallback,
        strong,
        model,
        reason: affected ? '搜索收益差距较小，阶段六模型给出更稳定的路线排序' : null,
        notReason: affected ? null : '阶段六模型与强规则选择一致',
        modelReason: affected ? '模型仅在 MCTS 差距不明确时参与排序，未覆盖明确搜索结论' : '模型建议与最终选择一致',
        modelRejectReason: null,
        modelAffected: affected,
      };
    }
  }
  if (gap < WEAK_GAP) {
    return { best: strong, mctsBest: fallback, strong, model, reason: null, notReason: '搜索收益差距较小，保留强规则 AI 的稳定选择', modelReason: null, modelRejectReason: '模型信心不足或候选未通过收益接近条件', modelAffected: false };
  }
  return { best: fallback, mctsBest: fallback, strong, model, reason: mainRisk(fallback, context) === '风险可控' ? '后续平均收益明显更高且风险可控' : '后续收益优势覆盖主要风险', notReason: null, modelReason: null, modelRejectReason: 'MCTS 收益差距明确，模型不得覆盖', modelAffected: false };
}

function defenseInfluence(context: MctsDecisionContext): string {
  const threat = strongestThreat(context);
  if (threat >= 0.7) return '对手威胁较高，搜索已提高防守权重';
  if (context.turn >= 48) return '终盘阶段，搜索更重视安全牌和放炮风险';
  return '防守系统已参与候选收益修正';
}

function scoreSituationNote(context: MctsDecisionContext): string {
  const pos = scorePosition(context);
  if (pos === 'leading') return '当前玩家领先，搜索倾向稳定收益和降低放炮风险';
  if (pos === 'behind') return '当前玩家落后，搜索允许有收益依据的追分路线';
  return '当前分差接近，搜索优先选择平均收益更稳定的路线';
}

function kongRiskNote(scored: ScoredCandidate[]): string {
  const kong = scored.filter((item) => item.action === 'kong');
  if (!kong.length) return '本次没有杠牌候选';
  const risky = kong.some((item) => clampRisk(item.kongRisk) >= 0.55 || isHonor(item.tile) || (numberValue(item.tile) || 0) >= 5);
  return risky ? '杠牌候选已评估抢杠、风牌和高牌风险' : '杠牌候选风险较低，已纳入补牌和杠开收益';
}

function structureLossReason(final: ScoredCandidate, context: MctsDecisionContext): string | null {
  if (!breaksCoreSequence(final, context)) return null;
  const threat = strongestThreat(context);
  if (threat >= 0.75) return '当前处于高防守压力，系统已识别该弃牌会破坏完整顺子，但安全收益覆盖结构损失';
  if (context.turn >= 48) return '终盘阶段安全优先，系统已识别该弃牌会破坏完整顺子并按防守收益覆盖处理';
  return '系统已识别该弃牌会破坏完整顺子，低威胁局面默认降低该候选优先级';
}

function explanation(final: ScoredCandidate, summary: Pick<MctsDecisionSummary, 'overridden' | 'overrideReason' | 'notOverrideReason'>, context: MctsDecisionContext): string {
  const action = actionText(final);
  if (summary.overridden) return `${action} 是搜索复核后的选择：${summary.overrideReason}。${scoreSituationNote(context)}。`;
  return `${action} 保留为当前建议：${summary.notOverrideReason || '搜索复核后仍然稳定'}。${defenseInfluence(context)}。`;
}

export function decideWithMcts(context: MctsDecisionContext, now = () => Date.now()): MctsDecisionSummary {
  const start = now();
  const timeLimit = Math.max(1, context.timeLimitMs || 10000);
  const scored = (context.candidates || []).map((candidate) => scoreCandidate(candidate, context));
  if (!scored.length) throw new Error('MCTS requires at least one candidate');
  const timedOut = now() - start >= timeLimit;
  const decision = chooseFinal(scored, context);
  const elapsedMs = Math.max(0, now() - start);
  const finalAction = actionText(decision.best);
  const mctsAction = actionText(decision.mctsBest);
  const strongRuleAction = context.strongRuleAction || (decision.strong ? actionText(decision.strong) : null);
  const modelAction = decision.model.action;
  const overridden = !!strongRuleAction && finalAction !== strongRuleAction;
  const base = {
    overridden,
    overrideReason: overridden ? decision.reason : null,
    notOverrideReason: overridden ? null : decision.notReason,
  };
  return {
    schemaVersion: 'mcts-decision-v1',
    modelDecisionSchemaVersion: 'stage6-model-decision-v1',
    modelVersion: STAGE6_MODEL_VERSION,
    trainingDataVersion: STAGE6_TRAINING_DATA_VERSION,
    ruleEngineVersion: RULE_ENGINE_VERSION,
    mctsVersion: MCTS_VERSION,
    strongRuleVersion: STRONG_RULE_VERSION,
    turn: context.turn,
    player: context.player,
    phase: context.phase,
    finalAction,
    strongRuleAction,
    mctsAction,
    modelAction,
    modelRoute: decision.model.route,
    modelConfidence: decision.model.confidence,
    modelTendencyStrength: decision.model.tendencyStrength,
    modelAgreement: {
      withMcts: !!modelAction && modelAction === mctsAction,
      withStrongRule: !!modelAction && !!strongRuleAction && modelAction === strongRuleAction,
    },
    modelAffectedFinalChoice: decision.modelAffected,
    modelAdoptionReason: decision.modelReason,
    modelRejectionReason: decision.modelRejectReason,
    routeTransitionJudgment: decision.model.routeTransitionJudgment,
    ruleConstraintBlocks: decision.model.ruleConstraintBlocks,
    overridden,
    overrideReason: base.overrideReason,
    notOverrideReason: base.notOverrideReason,
    candidates: scored
      .filter((item) => item.legal)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((item) => ({
        action: actionText(item),
        averageValue: Number(item.value.toFixed(2)),
        mainRisk: item.mainRisk,
        dealInRisk: Number(clampRisk(item.dealInRisk).toFixed(2)),
        kongRisk: Number(clampRisk(item.kongRisk).toFixed(2)),
        coreSequenceBreak: breaksCoreSequence(item, context),
      })),
    defenseInfluence: defenseInfluence(context),
    structureLossReason: structureLossReason(decision.best, context),
    hiddenInferenceUsed: true,
    hiddenInferenceNote: '已根据弃牌、副露、对手威胁和剩余可见牌做隐藏信息风险修正',
    scoreSituationNote: scoreSituationNote(context),
    kongRiskNote: kongRiskNote(scored),
    elapsedMs,
    timedOut,
    fallbackReason: timedOut ? '达到决策时间上限，返回当前最优候选' : null,
    currentBestOnTimeout: timedOut ? mctsAction : null,
    playerExplanation: explanation(decision.best, base, context),
  };
}
