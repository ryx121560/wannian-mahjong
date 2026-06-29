import { checkTenpai, getShanten } from '../rules';
import { determineState } from './attack-defense-fsm';
import { buildOpponentModels } from './opponent-modeler';
import { evaluateSafety } from './safety-evaluator';
import { processSpecialSignals } from './defense-signal-processor';
import type { DefenseResult, StrongAIGameState, Tile } from './types';
import { clamp, getPlayerHand, getPlayerMelds, roundScore } from './utils';

function formatDefenseReasoning(result: {
  modifiedSafety: number;
  state: DefenseResult['state'];
  signals: string[];
  defenseScore: number;
  safety: ReturnType<typeof evaluateSafety>;
}): string {
  const threat = `maxTenpai-${result.state.factors.maxOpponentTenpaiProb}`;
  const danger = `${result.safety.dangerLevel}-safety-${result.modifiedSafety}`;
  const reasonTypes = result.safety.reasons.length ? result.safety.reasons.map((reason) => reason.type).join(',') : 'no-safety-reason';
  const signals = result.signals.length ? result.signals.join(',') : 'no-special-signal';
  return `${result.state.state}. ${result.state.reasoning}. ${threat}. ${danger}. ${reasonTypes}. ${signals}. defense-score-${result.defenseScore}`;
}

export function evaluateDefense(state: StrongAIGameState, candidateTile: Tile, currentPlayer = state.currentPlayer): DefenseResult {
  const opponentModels = buildOpponentModels(state, currentPlayer);
  const baseSafety = evaluateSafety(candidateTile, state, opponentModels);
  const special = processSpecialSignals(candidateTile, state, opponentModels, baseSafety);
  const hand = getPlayerHand(state);
  const melds = getPlayerMelds(state);
  const shanten = getShanten(hand, { melds });
  const tenpai = checkTenpai(hand, melds);
  const fsmState = determineState(hand, melds, shanten.shanten, tenpai.isTenpai, opponentModels, state.scores || [0, 0, 0, 0], currentPlayer, state.turn || 1);

  let defenseScore = (special.modifiedSafety - 1.0) * fsmState.defenseWeight;
  if (fsmState.state === 'attack') defenseScore *= 0.3;
  if (fsmState.state === 'full-fold') defenseScore *= 1.5;
  defenseScore = roundScore(clamp(defenseScore, -2, 0));

  const safetyPerTile = new Map([[candidateTile, { ...baseSafety, safetyScore: special.modifiedSafety }]]);
  const reasoning = formatDefenseReasoning({
    modifiedSafety: special.modifiedSafety,
    state: fsmState,
    signals: special.signals,
    defenseScore,
    safety: baseSafety,
  });

  return {
    safetyPerTile,
    opponentModels,
    state: fsmState,
    defenseScore,
    reasoning,
  };
}
