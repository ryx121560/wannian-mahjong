import { checkTenpai, classifyHand, getShanten } from '../rules';
import { evaluateDalanImpact, evaluateDalanRoute } from './dalan-router';
import { evaluateDefenseBasic } from './defense-basic';
import { analyzeKongZhichan } from './kong-zhichan-analyzer';
import { evaluateHandValue } from './hand-value-evaluator';
import { detectPhase, getPhaseWeights } from './phase-detector';
import { analyzePosition } from './position-adjuster';
import { evaluateSpeed } from './speed-evaluator';
import { evaluateStructurePenalty } from './structure-penalty';
import type { AIDecision, CandidateScore, DecisionConfig, DimensionKey, StrongAIGameState, Tile } from './types';
import { DEFAULT_DIMENSIONS, getPlayerHand, getPlayerMelds, removeOne, roundScore, tileLabel, uniqueDiscards } from './utils';
import { evaluateWaitQuality } from './wait-quality-evaluator';

const DEFAULT_CONFIG: DecisionConfig = {
  weights: { speed: 1.0, handValue: 0.8, waitQuality: 0.8, kongZhichan: 0.6, dalanRoute: 0.7, defense: 0.4, position: 0.5, structure: 1.0 },
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
  return (positionOffense - 1) * attackScore + (positionDefense - 1) * Math.abs(defenseScore);
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
  const legalDiscards = uniqueDiscards(state.newDrawnTile ? hand.filter((tile) => tile !== state.newDrawnTile) : hand);
  const candidates = legalDiscards.map((tile): CandidateScore => {
    const afterHand = removeOne(hand, tile);
    const speed = evaluateSpeed(hand, melds, tile);
    const handValue = evaluateHandValue(afterHand, melds, state.scores || [0, 0, 0, 0], currentPlayer);
    const waitQuality = tenpai.isTenpai ? evaluateWaitQuality(afterHand, melds, checkTenpai(afterHand, melds)) : { waitQualityScore: 0, waitType: 'not-tenpai', bestWait: null };
    const dalanImpact = evaluateDalanImpact(hand, melds, tile, dalanRoute);
    const defense = evaluateDefenseBasic(state, tile, currentPlayer);
    const structure = evaluateStructurePenalty(hand, melds, tile);
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
    const totalScore = roundScore(
      breakdown.speedScore * finalWeights.speed
      + breakdown.handValueScore * finalWeights.handValue
      + breakdown.waitQualityScore * finalWeights.waitQuality
      + breakdown.kongZhichanScore * finalWeights.kongZhichan
      + breakdown.dalanRouteScore * finalWeights.dalanRoute
      + breakdown.defenseScore * finalWeights.defense
      + breakdown.positionAdjustment * finalWeights.position
      + breakdown.structurePenalty * finalWeights.structure,
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
      },
    };
  }).sort((a, b) => b.totalScore - a.totalScore || a.tile.localeCompare(b.tile));
  if (!candidates.length) throw new Error('no legal discard candidates');
  const selected = candidates[0];
  return {
    selectedTile: selected.tile,
    selectedScore: selected.totalScore,
    allCandidates: candidates,
    phase,
    reasoning: reasoningFor(selected, phase),
    metadata: { shanten: shanten.shanten, isTenpai: tenpai.isTenpai, dalanRoute, kongZhichan, position },
  };
}
