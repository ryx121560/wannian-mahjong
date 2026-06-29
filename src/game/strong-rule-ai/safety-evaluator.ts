import { isHonor, isNumberTile, tileSuit, tileValue } from '../rules';
import type { OpponentModel, SafetyEvaluation, SafetyReason, SafetyReasonType, StrongAIGameState, Tile } from './types';
import { opponentHasWildcardAbility } from './opponent-modeler';
import { allTileKeys, clamp, getPlayerHand, roundScore, visibleCount } from './utils';

interface SafetySignal {
  type: SafetyReasonType;
  contribution: number;
  description: string;
}

const SUJI_GROUPS = [
  [1, 4, 7],
  [2, 5, 8],
  [3, 6, 9],
];

function opponentDiscards(opponentIndex: number, state: StrongAIGameState): Tile[] {
  return state.discards?.[opponentIndex] || [];
}

function emptySignal(type: SafetyReasonType, description: string): SafetySignal {
  return { type, contribution: 0, description };
}

function isSameSuitNumber(tile: Tile, suit: string, value: number): boolean {
  return isNumberTile(tile) && tileSuit(tile) === suit && tileValue(tile) === value;
}

export function checkGenpai(tile: Tile, opponentIndex: number, state: StrongAIGameState): SafetySignal {
  if (!opponentDiscards(opponentIndex, state).includes(tile)) return emptySignal('genpai', `opponent-${opponentIndex}-not-genpai`);
  return { type: 'genpai', contribution: 0.8, description: `genpai-vs-${opponentIndex}` };
}

export function checkSuji(tile: Tile, opponentIndex: number, state: StrongAIGameState): SafetySignal {
  if (!isNumberTile(tile)) return emptySignal('suji', 'honor-no-suji');
  const suit = tileSuit(tile);
  const value = tileValue(tile);
  const group = SUJI_GROUPS.find((items) => items.includes(value));
  if (!group) return emptySignal('suji', 'no-suji-group');

  const discardedValues = new Set(
    opponentDiscards(opponentIndex, state)
      .filter((discard) => isNumberTile(discard) && tileSuit(discard) === suit)
      .map(tileValue),
  );
  const otherValues = group.filter((item) => item !== value);
  const hits = otherValues.filter((item) => discardedValues.has(item)).length;
  if (!hits) return emptySignal('suji', 'no-suji-hit');
  const base = hits === otherValues.length ? 0.5 : 0.3;
  return { type: 'suji', contribution: roundScore(base * 0.8), description: hits === otherValues.length ? 'complete-suji' : 'half-suji' };
}

export function checkKabe(tile: Tile, state: StrongAIGameState): SafetySignal {
  if (!isNumberTile(tile)) return emptySignal('kabe', 'honor-no-kabe');
  const suit = tileSuit(tile);
  const value = tileValue(tile);
  const ownHand = getPlayerHand(state);
  for (let wallValue = 1; wallValue <= 9; wallValue += 1) {
    const wallTile = `${suit}${wallValue}` as Tile;
    if (visibleCount(state, wallTile, ownHand) < 4) continue;
    const protectedValues = new Set<number>();
    for (const start of [wallValue - 2, wallValue - 1, wallValue]) {
      if (start >= 1 && start + 2 <= 9) {
        for (const item of [start, start + 1, start + 2]) if (item !== wallValue) protectedValues.add(item);
      }
    }
    if (protectedValues.has(value)) return { type: 'kabe', contribution: 0.4, description: `kabe-${wallTile}` };
  }
  return emptySignal('kabe', 'no-kabe');
}

export function checkOuterTile(tile: Tile, opponent: OpponentModel): SafetySignal {
  if (isHonor(tile)) return emptySignal('outer', 'honor-no-outer');
  const suit = tileSuit(tile);
  const route = opponent.predictedRoute.type;
  const evidence = opponent.predictedRoute.evidence.join(',');
  if ((route === 'qingyise' || route === 'hunyise') && !evidence.includes(suit)) return { type: 'outer', contribution: 0.3, description: `outer-vs-${route}` };
  if (route === 'quanfeng' && isNumberTile(tile)) return { type: 'outer', contribution: 0.3, description: 'number-outer-vs-quanfeng' };
  return emptySignal('outer', 'no-outer');
}

function checkUnused(tile: Tile, opponentIndex: number, state: StrongAIGameState, opponent: OpponentModel): SafetySignal {
  if (!opponentDiscards(opponentIndex, state).includes(tile)) return emptySignal('unused', 'not-discarded');
  if (opponent.melds.some((meld) => meld.tiles.includes(tile))) return emptySignal('unused', 'called-tile');
  return { type: 'unused', contribution: 0.2, description: `unused-vs-${opponentIndex}` };
}

function checkLateDanger(tile: Tile, state: StrongAIGameState): SafetySignal {
  if ((state.turn || 1) < 13) return emptySignal('late-danger', 'not-late');
  const revealedInDiscards = (state.discards || []).some((row) => row.includes(tile));
  if (revealedInDiscards) return emptySignal('late-danger', 'already-revealed');
  return { type: 'late-danger', contribution: -0.2, description: 'late-unrevealed-danger' };
}

export function applyWildcardModifier(signal: SafetySignal, opponent: OpponentModel): SafetySignal {
  if (!opponentHasWildcardAbility(opponent) || signal.contribution <= 0) return signal;
  const multipliers: Partial<Record<SafetyReasonType, number>> = { genpai: 0.5, suji: 0.7, kabe: 0.8, outer: 0.6 };
  const multiplier = multipliers[signal.type] || 1;
  if (multiplier === 1) return signal;
  return {
    ...signal,
    contribution: roundScore(signal.contribution * multiplier),
    description: `${signal.description}-wildcard-risk`,
  };
}

function strongestSignal(signals: SafetySignal[]): SafetySignal {
  const positive = signals.filter((signal) => signal.contribution > 0).sort((a, b) => b.contribution - a.contribution);
  if (positive.length) return positive[0];
  return signals.sort((a, b) => a.contribution - b.contribution)[0] || emptySignal('late-danger', 'no-signal');
}

function dangerLevel(score: number): SafetyEvaluation['dangerLevel'] {
  if (score >= 0.8) return 'safe';
  if (score >= 0.5) return 'low';
  if (score >= 0.3) return 'medium';
  if (score >= 0.1) return 'high';
  return 'extreme';
}

function reasonFromSignal(signal: SafetySignal, opponentIndex: number): SafetyReason {
  return {
    type: signal.type,
    description: signal.description,
    weight: signal.contribution,
    perOpponent: [{ playerIndex: opponentIndex, contribution: signal.contribution }],
  };
}

export function evaluateSafety(tile: Tile, state: StrongAIGameState, opponentModels: OpponentModel[]): SafetyEvaluation {
  const reasons: SafetyReason[] = [];
  const perOpponentSafety = new Map<number, number>();
  for (const opponent of opponentModels) {
    const signals = [
      checkGenpai(tile, opponent.playerIndex, state),
      checkSuji(tile, opponent.playerIndex, state),
      checkKabe(tile, state),
      checkOuterTile(tile, opponent),
      checkUnused(tile, opponent.playerIndex, state, opponent),
      checkLateDanger(tile, state),
    ];
    const selected = applyWildcardModifier(strongestSignal(signals), opponent);
    perOpponentSafety.set(opponent.playerIndex, selected.contribution);
    if (selected.contribution !== 0) reasons.push(reasonFromSignal(selected, opponent.playerIndex));
    if (opponentHasWildcardAbility(opponent)) {
      reasons.push({
        type: 'wildcard-risk',
        description: `wildcard-risk-vs-${opponent.playerIndex}`,
        weight: -0.1,
        perOpponent: [{ playerIndex: opponent.playerIndex, contribution: -0.1 }],
      });
    }
  }

  const rawRisk = opponentModels.reduce((sum, opponent) => {
    const opponentSafety = perOpponentSafety.get(opponent.playerIndex) || 0;
    return sum + opponent.tenpaiProbability * (1 - opponentSafety);
  }, 0);
  const safetyScore = roundScore(clamp(1 - rawRisk, 0, 1));
  return {
    tile,
    safetyScore,
    dangerLevel: dangerLevel(safetyScore),
    reasons,
  };
}

export function tileIsTerminalOrHonor(tile: Tile): boolean {
  return isHonor(tile) || (isNumberTile(tile) && [1, 9].includes(tileValue(tile)));
}

export function tileMatchesOpponentMeldSuit(tile: Tile, opponent: OpponentModel): boolean {
  if (!isNumberTile(tile)) return false;
  const suit = tileSuit(tile);
  return opponent.melds.some((meld) => meld.tiles.some((meldTile) => !!meldTile && isSameSuitNumber(meldTile, suit, tileValue(meldTile))));
}

export function isKnownTile(tile: Tile): boolean {
  return allTileKeys().includes(tile);
}
