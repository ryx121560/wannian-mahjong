import { isHonor, isNumberTile, tileSuit } from '../rules';
import type { OpponentModel, SafetyEvaluation, StrongAIGameState, Tile } from './types';
import { opponentHasWildcardAbility } from './opponent-modeler';
import { clamp, roundScore } from './utils';
import { tileIsTerminalOrHonor } from './safety-evaluator';

function relatedMeldThreat(tile: Tile, opponent: OpponentModel): boolean {
  if (!isNumberTile(tile)) return false;
  const suit = tileSuit(tile);
  return opponent.melds.some((meld) => meld.tiles.some((item) => !!item && isNumberTile(item) && tileSuit(item) === suit));
}

function hasCurrentPassRecord(tile: Tile, state: StrongAIGameState, opponent: OpponentModel): boolean {
  return (state.passRecords || []).some((record) => record.player === opponent.playerIndex && record.tile === tile && record.round === (state.turn || 1));
}

export function processSpecialSignals(
  tile: Tile,
  state: StrongAIGameState,
  opponentModels: OpponentModel[],
  baseSafety: SafetyEvaluation,
): { modifiedSafety: number; signals: string[] } {
  let safety = baseSafety.safetyScore;
  const signals: string[] = [];

  for (const opponent of opponentModels) {
    if (opponent.meldCount > 0 && relatedMeldThreat(tile, opponent)) {
      safety *= 0.7;
      signals.push(`meld-threat-vs-${opponent.playerIndex}`);
    }
    if (opponent.predictedRoute.type === 'quanfeng') {
      if (isHonor(tile)) {
        safety *= 0.3;
        signals.push(`quanfeng-honor-danger-vs-${opponent.playerIndex}`);
      } else {
        safety *= 1.1;
        signals.push(`quanfeng-number-safer-vs-${opponent.playerIndex}`);
      }
    }
    if (opponentHasWildcardAbility(opponent)) signals.push(`wildcard-risk-vs-${opponent.playerIndex}`);
    if (opponent.predictedRoute.type === 'dalan') {
      safety *= 1.2;
      signals.push(`dalan-relaxed-vs-${opponent.playerIndex}`);
    }
    if (opponent.predictedRoute.type === 'pengpeng' && tileIsTerminalOrHonor(tile)) {
      safety *= 0.5;
      signals.push(`pengpeng-terminal-honor-risk-vs-${opponent.playerIndex}`);
    }
    if (hasCurrentPassRecord(tile, state, opponent)) {
      safety += 0.3;
      signals.push(`pass-safe-vs-${opponent.playerIndex}`);
    }
  }

  return { modifiedSafety: roundScore(clamp(safety, 0, 1)), signals };
}
