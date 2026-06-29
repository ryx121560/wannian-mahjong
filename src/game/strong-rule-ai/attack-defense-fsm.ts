import { analyzePosition } from './position-adjuster';
import type { AttackDefenseStatus, Meld, OpponentModel, Tile } from './types';
import { roundScore } from './utils';

export function determineState(
  selfHand: Tile[],
  selfMelds: Meld[],
  selfShanten: number,
  selfTenpai: boolean,
  opponentModels: OpponentModel[],
  scores: number[],
  currentPlayer: number,
  turn: number,
): AttackDefenseStatus {
  void selfHand;
  void selfMelds;
  const maxOpponentTenpaiProb = roundScore(Math.max(0, ...opponentModels.map((model) => model.tenpaiProbability)));
  const scorePosition = analyzePosition(scores || [0, 0, 0, 0], currentPlayer).situation;

  if (selfTenpai || scorePosition === 'bigBehind') {
    return {
      state: 'attack',
      reasoning: selfTenpai ? 'attack-self-tenpai' : 'attack-big-behind',
      factors: { selfTenpai, selfShanten, maxOpponentTenpaiProb, scorePosition, turn },
      offenseWeight: 1.5,
      defenseWeight: 0.3,
    };
  }

  if (maxOpponentTenpaiProb > 0.7 && selfShanten >= 3 && (scorePosition === 'bigLead' || scorePosition === 'smallLead')) {
    return {
      state: 'full-fold',
      reasoning: 'full-fold-leading-high-threat',
      factors: { selfTenpai, selfShanten, maxOpponentTenpaiProb, scorePosition, turn },
      offenseWeight: 0.2,
      defenseWeight: 2.0,
    };
  }

  if (maxOpponentTenpaiProb > 0.5 && selfShanten >= 2) {
    return {
      state: 'half-fold',
      reasoning: 'half-fold-high-threat-far-from-tenpai',
      factors: { selfTenpai, selfShanten, maxOpponentTenpaiProb, scorePosition, turn },
      offenseWeight: 0.7,
      defenseWeight: 1.0,
    };
  }

  return {
    state: 'attack',
    reasoning: 'attack-default',
    factors: { selfTenpai, selfShanten, maxOpponentTenpaiProb, scorePosition, turn },
    offenseWeight: 1.0,
    defenseWeight: 1.0,
  };
}
