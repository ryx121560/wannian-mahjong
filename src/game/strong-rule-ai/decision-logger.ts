import type { AIDecision, DecisionLog, StrongAIGameState } from './types';

export function logDecision(decision: AIDecision, state?: StrongAIGameState): DecisionLog {
  return {
    timestamp: new Date().toISOString(),
    turn: state?.turn || 0,
    phase: decision.phase,
    hand: state?.hand || state?.players?.[state.currentPlayer]?.hand || [],
    melds: state?.melds?.[state.currentPlayer] || state?.players?.[state.currentPlayer]?.melds || [],
    scores: state?.scores || [],
    shanten: decision.metadata.shanten,
    isTenpai: decision.metadata.isTenpai,
    candidates: decision.allCandidates,
    selected: { tile: decision.selectedTile, score: decision.selectedScore, reasoning: decision.reasoning },
    routeAnalysis: {
      dalanRoute: decision.metadata.dalanRoute,
      kongZhichan: decision.metadata.kongZhichan,
      position: decision.metadata.position,
    },
  };
}

export function formatLog(log: DecisionLog, format: 'json' | 'compact'): string {
  if (format === 'json') return JSON.stringify(log, null, 2);
  const parts = log.candidates.find((item) => item.tile === log.selected.tile)?.breakdown;
  const detail = parts
    ? `速度:${parts.speedScore} 打点:${parts.handValueScore} 听牌:${parts.waitQualityScore} 杠铲:${parts.kongZhichanScore} 打烂:${parts.dalanRouteScore} 防守:${parts.defenseScore} 位置:${parts.positionAdjustment} 结构:${parts.structurePenalty}`
    : '';
  return `[第${log.turn}巡/${log.phase}] 向听数${log.shanten} 弃${log.selected.tile}(${log.selected.score})\n  ${detail}\n  理由: ${log.selected.reasoning}`;
}
