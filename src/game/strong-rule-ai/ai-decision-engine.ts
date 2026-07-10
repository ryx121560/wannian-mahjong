import { checkTenpai, classifyHand, getShanten } from '../rules';
import { evaluateDalanImpact, evaluateDalanRoute } from './dalan-router';
import { createDefenseEvaluator } from './defense-engine';
import { analyzeKongZhichan } from './kong-zhichan-analyzer';
import { evaluateHandValue } from './hand-value-evaluator';
import { detectPhase, getPhaseWeights } from './phase-detector';
import { analyzePosition } from './position-adjuster';
import { evaluateSpeed } from './speed-evaluator';
import { breaksDragonCombo, evaluateStructurePenalty, isolatedDiscardPriority } from './structure-penalty';
import type { AIDecision, CandidateScore, DecisionConfig, DimensionKey, StrongAIGameState, Tile } from './types';
import { DEFAULT_DIMENSIONS, getPlayerHand, getPlayerMelds, removeOne, roundScore, tileLabel, uniqueDiscards } from './utils';
import { evaluateWaitQuality } from './wait-quality-evaluator';

const DEFAULT_CONFIG: DecisionConfig = {
  weights: { speed: 1.0, handValue: 0.8, waitQuality: 0.8, kongZhichan: 0.6, dalanRoute: 0.7, defense: 0.8, position: 0.5, structure: 1.0 },
  enabledDimensions: new Set(DEFAULT_DIMENSIONS),
};

function mergeConfig(config?: Partial<DecisionConfig>): DecisionConfig {
  return {
    weights: { ...DEFAULT_CONFIG.weights, ...(config?.weights || {}) },
    enabledDimensions: config?.enabledDimensions ? new Set(config.enabledDimensions) : new Set(DEFAULT_CONFIG.enabledDimensions),
  };
}

function enabled(config: DecisionConfig, key: DimensionKey, value: number): number {
  return config.enabledDimensions.has(key) ? value : 0;
}

function positionScore(positionOffense: number, positionDefense: number, attackScore: number, defenseScore: number): number {
  return (positionOffense - 1) * attackScore + (positionDefense - 1) * positionDefense * defenseScore;
}

function canUseIsolatedDiscardTieBreak(a: CandidateScore, b: CandidateScore): boolean {
  const aState = a.metadata.defense?.state;
  const bState = b.metadata.defense?.state;
  const aPosition = aState?.factors.scorePosition;
  const bPosition = bState?.factors.scorePosition;
  const sameShanten = a.metadata.shantenAfter === b.metadata.shantenAfter;
  const sameDefenseBand = Math.abs(a.breakdown.defenseScore - b.breakdown.defenseScore) < 0.05;
  const attackOnly = aState?.state === 'attack' && bState?.state === 'attack';
  const notProtectingLead = aPosition !== 'bigLead' && aPosition !== 'smallLead' && bPosition !== 'bigLead' && bPosition !== 'smallLead';
  return sameShanten && sameDefenseBand && attackOnly && notProtectingLead && !a.metadata.isDalanRoute && !b.metadata.isDalanRoute;
}

function reasoningFor(candidate: CandidateScore, phase: string): string {
  const b = candidate.breakdown;
  const ranked = [
    ['速度', b.speedScore],
    ['打点', b.handValueScore],
    ['听牌', b.waitQualityScore],
    ['杠直铲', b.kongZhichanScore],
    ['打烂', b.dalanRouteScore],
    ['防守', Math.abs(b.defenseScore)],
    ['结构', Math.abs(b.structurePenalty)],
  ].sort((a, b2) => Number(b2[1]) - Number(a[1]));
  const main = ranked.slice(0, 2).map((item) => item[0]).join('、');
  const phaseLabel = phase === 'early' ? '序盘' : phase === 'middle' ? '中盘' : '终盘';
  return `${phaseLabel}。主要考量${main}。兼顾速度、打点、听牌、杠直铲、打烂、防守、位置和结构。综合得分${candidate.totalScore}，选择弃${tileLabel(candidate.tile)}。`;
}

function shantenRegressionPenalty(shantenBefore: number, shantenAfter: number, defenseState: string | undefined): number {
  const regression = shantenAfter - shantenBefore;
  if (regression <= 0) return 0;
  if (defenseState === 'full-fold') return regression * 2;
  if (defenseState === 'half-fold') return regression * 4;
  return regression * 8;
}

const NUMBER_SUITS = ['wan', 'tong', 'tiao'] as const;
const WIND_TILES = new Set<Tile>(['dong', 'nan', 'xi', 'bei']);
const DRAGON_TILES = new Set<Tile>(['zhong', 'fa', 'bai']);

function tileSuitKey(tile: Tile): 'wan' | 'tong' | 'tiao' | null {
  if (tile.startsWith('wan')) return 'wan';
  if (tile.startsWith('tong')) return 'tong';
  if (tile.startsWith('tiao')) return 'tiao';
  return null;
}

function hasNumberNeighbor(hand: Tile[], tile: Tile): boolean {
  const suit = tileSuitKey(tile);
  if (!suit) return false;
  const value = Number(tile.replace(suit, ''));
  return hand.some((item) => {
    if (item === tile) return false;
    if (tileSuitKey(item) !== suit) return false;
    const nextValue = Number(item.replace(suit, ''));
    return Math.abs(nextValue - value) === 1 || Math.abs(nextValue - value) === 2;
  });
}

function mixedRouteAnalysis(hand: Tile[]): NonNullable<CandidateScore['metadata']['mixedRoute']> {
  const suitCounts = NUMBER_SUITS.map((suit) => ({ suit, count: hand.filter((tile) => tile.startsWith(suit)).length }));
  suitCounts.sort((a, b) => b.count - a.count);
  const main = suitCounts[0];
  const honorTiles = hand.filter((tile) => WIND_TILES.has(tile) || DRAGON_TILES.has(tile));
  const honorCount = honorTiles.length;
  const offSuitNumberCount = hand.filter((tile) => {
    const suit = tileSuitKey(tile);
    return suit && suit !== main.suit;
  }).length;
  const windKinds = new Set(honorTiles.filter((tile) => WIND_TILES.has(tile))).size;
  const dragonKinds = new Set(honorTiles.filter((tile) => DRAGON_TILES.has(tile))).size;
  const strong = main.count >= 6 && honorCount >= 4 && main.count + honorCount >= 10 && offSuitNumberCount <= 3;
  return {
    type: strong ? 'mixed-strong' : null,
    mainSuit: main.suit,
    mainSuitCount: main.count,
    honorCount,
    offSuitNumberCount,
    windCombo: windKinds >= 2,
    dragonCombo: dragonKinds >= 2,
    adjustment: 0,
  };
}

function mixedRouteDiscardAdjustment(hand: Tile[], tile: Tile, analysis: NonNullable<CandidateScore['metadata']['mixedRoute']>): NonNullable<CandidateScore['metadata']['mixedRoute']> {
  if (analysis.type !== 'mixed-strong') return analysis;
  const suit = tileSuitKey(tile);
  let adjustment = 0;
  let reason = '';
  if (suit && suit !== analysis.mainSuit) {
    adjustment += hasNumberNeighbor(hand, tile) ? 0.95 : 0.65;
    reason = 'off-suit-number-first';
  } else if (suit === analysis.mainSuit) {
    adjustment -= 0.45;
    reason = 'protect-main-suit';
  } else if (WIND_TILES.has(tile) && analysis.windCombo) {
    adjustment -= 1.25;
    reason = 'protect-wind-combo';
  } else if (DRAGON_TILES.has(tile) && analysis.dragonCombo) {
    adjustment -= 1.25;
    reason = 'protect-dragon-combo';
  } else if (WIND_TILES.has(tile) || DRAGON_TILES.has(tile)) {
    adjustment -= 0.45;
    reason = 'protect-honor-route';
  }
  return { ...analysis, adjustment: roundScore(adjustment), reason };
}

function hasClearDefenseReason(candidate: CandidateScore): boolean {
  const defenseState = candidate.metadata.defense?.state.state;
  if (defenseState === 'full-fold') return true;
  if (defenseState === 'half-fold' && candidate.breakdown.defenseScore > 0.8) return true;
  return false;
}

function severeBreakRank(candidate: CandidateScore): number {
  const destroyedType = candidate.metadata.destroyedStructureType;
  if (candidate.metadata.dragonComboBreak) return 5;
  if (candidate.metadata.breaksPair || destroyedType === 'duizi') return 4;
  if (destroyedType === 'mianzi') return 3;
  if (destroyedType === 'dazi') return 1;
  return 0;
}

function compareGuardFallback(a: CandidateScore, b: CandidateScore): number {
  const shantenDiff = a.metadata.shantenAfter - b.metadata.shantenAfter;
  if (shantenDiff) return shantenDiff;
  const breakDiff = severeBreakRank(a) - severeBreakRank(b);
  if (breakDiff) return breakDiff;
  const effectiveDiff = (b.metadata.effectiveCount || 0) - (a.metadata.effectiveCount || 0);
  if (effectiveDiff) return effectiveDiff;
  return b.totalScore - a.totalScore || a.tile.localeCompare(b.tile);
}

function finalDecisionGuard(candidates: CandidateScore[]): { selected: CandidateScore; guardReason: string | null; blockedReasonCodes: string[] } {
  const selected = candidates[0];
  const bestShanten = Math.min(...candidates.map((candidate) => candidate.metadata.shantenAfter));
  const bestCandidates = candidates.filter((candidate) => candidate.metadata.shantenAfter === bestShanten);
  const hasTenpaiCandidate = bestCandidates.some((candidate) => candidate.metadata.shantenAfter <= 0);
  const selectedBreakRank = severeBreakRank(selected);
  const blockedReasonCodes: string[] = [];
  if (selected.metadata.shantenAfter > bestShanten + 1) blockedReasonCodes.push('shanten-regression');
  if (hasTenpaiCandidate && selected.metadata.shantenAfter > bestShanten) blockedReasonCodes.push('abandons-tenpai');
  if (selected.metadata.dragonComboBreak) blockedReasonCodes.push('breaks-complete-dragon-combo');
  if (selected.metadata.breaksPair || selected.metadata.destroyedStructureType === 'duizi') blockedReasonCodes.push('breaks-pair');
  if (selectedBreakRank >= 3 && !hasClearDefenseReason(selected)) {
    const fallback = bestCandidates
      .filter((candidate) => !candidate.metadata.dragonComboBreak)
      .filter((candidate) => severeBreakRank(candidate) < selectedBreakRank)
      .slice()
      .sort(compareGuardFallback)[0];
    if (fallback) {
      return { selected: fallback, guardReason: 'final-decision-guard-structure', blockedReasonCodes };
    }
  }
  if (blockedReasonCodes.length && !hasClearDefenseReason(selected)) {
    const fallback = candidates
      .filter((candidate) => !candidate.metadata.dragonComboBreak)
      .slice()
      .sort(compareGuardFallback)[0];
    if (fallback && fallback.tile !== selected.tile) {
      return { selected: fallback, guardReason: 'final-decision-guard-high-risk', blockedReasonCodes };
    }
  }
  return { selected, guardReason: null, blockedReasonCodes };
}

export function makeDecision(state: StrongAIGameState, config?: Partial<DecisionConfig>): AIDecision {
  const hand = getPlayerHand(state);
  const melds = getPlayerMelds(state);
  const currentPlayer = state.currentPlayer;
  const merged = mergeConfig(config);
  const phase = detectPhase(state.turn || 1);
  const phaseWeights = getPhaseWeights(phase);
  const finalWeights = { ...phaseWeights };
  for (const key of Object.keys(merged.weights) as DimensionKey[]) finalWeights[key] *= merged.weights[key];
  const shanten = getShanten(hand, { melds });
  const tenpai = checkTenpai(hand, melds);
  const classification = classifyHand(hand, melds);
  const position = analyzePosition(state.scores || [0, 0, 0, 0], currentPlayer);
  const kongZhichan = analyzeKongZhichan(hand, melds, tenpai.isTenpai, classification.handTypes, state.wallRemaining || state.wallTiles?.length || 70);
  const dalanRoute = evaluateDalanRoute(hand, melds, state.turn || 1);
  const mixedRouteBase = mixedRouteAnalysis(hand);
  const speedContext = { shantenBefore: shanten.shanten };
  const legalDiscards = uniqueDiscards(state.newDrawnTile ? hand.filter((tile) => tile !== state.newDrawnTile) : hand);
  const evaluateDefense = createDefenseEvaluator(state, currentPlayer);
  const candidates = legalDiscards.map((tile): CandidateScore => {
    const afterHand = removeOne(hand, tile);
    const speed = evaluateSpeed(hand, melds, tile, speedContext);
    const handValue = evaluateHandValue(afterHand, melds, state.scores || [0, 0, 0, 0], currentPlayer);
    const waitQuality = tenpai.isTenpai ? evaluateWaitQuality(afterHand, melds, checkTenpai(afterHand, melds)) : { waitQualityScore: 0, waitType: 'not-tenpai', bestWait: null };
    const dalanImpact = evaluateDalanImpact(hand, melds, tile, dalanRoute);
    const defense = evaluateDefense(tile);
    const structure = evaluateStructurePenalty(hand, melds, tile);
    const dragonComboBreak = breaksDragonCombo(hand, tile);
    const breaksPair = hand.filter((item) => item === tile).length >= 2;
    const isolatedPriority = isolatedDiscardPriority(hand, tile);
    const mixedRoute = mixedRouteDiscardAdjustment(hand, tile, mixedRouteBase);
    const attackScore = speed.speedScore + handValue.handValueScore + waitQuality.waitQualityScore + kongZhichan.kongZhichanScore + dalanRoute.dalanRouteScore + dalanImpact;
    const posScore = positionScore(position.offenseMultiplier, position.defenseMultiplier, attackScore, defense.defenseScore);
    const breakdown = {
      speedScore: enabled(merged, 'speed', speed.speedScore),
      handValueScore: enabled(merged, 'handValue', handValue.handValueScore),
      waitQualityScore: enabled(merged, 'waitQuality', waitQuality.waitQualityScore),
      kongZhichanScore: enabled(merged, 'kongZhichan', kongZhichan.kongZhichanScore),
      dalanRouteScore: enabled(merged, 'dalanRoute', roundScore(dalanRoute.dalanRouteScore + dalanImpact)),
      defenseScore: enabled(merged, 'defense', defense.defenseScore),
      positionAdjustment: enabled(merged, 'position', roundScore(posScore)),
      structurePenalty: enabled(merged, 'structure', structure.penalty),
    };
    const regressionPenalty = shantenRegressionPenalty(speed.shantenBefore, speed.shantenAfter, defense.state.state);
    const totalScore = roundScore(
      breakdown.speedScore * finalWeights.speed
      + breakdown.handValueScore * finalWeights.handValue
      + breakdown.waitQualityScore * finalWeights.waitQuality
      + breakdown.kongZhichanScore * finalWeights.kongZhichan
      + breakdown.dalanRouteScore * finalWeights.dalanRoute
      + breakdown.defenseScore * finalWeights.defense
      + breakdown.positionAdjustment * finalWeights.position
      + breakdown.structurePenalty * finalWeights.structure
      + (mixedRoute.adjustment || 0)
      - regressionPenalty,
    );
    return {
      tile,
      totalScore,
      breakdown,
      metadata: {
        shantenBefore: speed.shantenBefore,
        shantenAfter: speed.shantenAfter,
        expectedBaseScore: handValue.expectedBaseScore,
        effectiveCount: speed.effectiveCount,
        isDalanRoute: dalanRoute.shouldConsiderDalan,
        kongOpportunity: kongZhichan.kongZhichanScore > 0,
        dragonComboBreak,
        destroyedStructureType: structure.destroyedStructure.type,
        breaksPair,
        mixedRoute,
        isolatedDiscardPriority: isolatedPriority,
        defense,
      },
    };
  }).sort((a, b) => {
    const scoreDiff = b.totalScore - a.totalScore;
    if (Math.abs(scoreDiff) > 0.25) return scoreDiff;
    const usePriority = canUseIsolatedDiscardTieBreak(a, b);
    const priorityDiff = usePriority ? (b.metadata.isolatedDiscardPriority || 0) - (a.metadata.isolatedDiscardPriority || 0) : 0;
    return priorityDiff || scoreDiff || a.tile.localeCompare(b.tile);
  });
  if (!candidates.length) throw new Error('no legal discard candidates');
  const guarded = finalDecisionGuard(candidates);
  const selected = guarded.selected;
  return {
    selectedTile: selected.tile,
    selectedScore: selected.totalScore,
    allCandidates: candidates,
    phase,
    reasoning: reasoningFor(selected, phase),
    metadata: { shanten: shanten.shanten, isTenpai: tenpai.isTenpai, dalanRoute, mixedRoute: selected.metadata.mixedRoute, kongZhichan, position, defenseState: selected.metadata.defense?.state, finalDecisionGuard: guarded.guardReason ? { triggered: true, reason: guarded.guardReason, blockedReasonCodes: guarded.blockedReasonCodes } : undefined },
  };
}
