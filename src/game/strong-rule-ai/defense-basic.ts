import { isHonor, tileSuit } from '../rules';
import type { DefenseBasicResult, StrongAIGameState, Tile } from './types';
import { clamp, roundScore } from './utils';

function opponentTenpaiProbability(state: StrongAIGameState, opponent: number): number {
  const meldCount = state.melds?.[opponent]?.length || state.players?.[opponent]?.melds?.length || 0;
  if (state.turn >= 13 && meldCount > 0) return 0.8;
  if (state.turn >= 7 && meldCount > 0) return 0.5;
  if (state.turn >= 13) return 0.3;
  if (state.turn >= 7) return 0.1;
  return 0.05;
}

export function evaluateDefenseBasic(state: StrongAIGameState, candidateTile: Tile, currentPlayer: number): DefenseBasicResult {
  const dangerTiles = new Map<Tile, number>();
  const safeTiles = new Set<Tile>();
  const opponentTenpaiProb = [0, 0, 0, 0];
  let weightedDanger = 0;
  for (let player = 0; player < 4; player += 1) {
    if (player === currentPlayer) continue;
    const discards = state.discards?.[player] || [];
    if (discards.includes(candidateTile)) safeTiles.add(candidateTile);
    const tenpai = opponentTenpaiProbability(state, player);
    opponentTenpaiProb[player] = tenpai;
    let danger = discards.includes(candidateTile) ? 0 : state.turn >= 13 ? 0.2 : 0;
    const melds = state.melds?.[player] || state.players?.[player]?.melds || [];
    const meldSuitCount = new Map<string, number>();
    for (const meld of melds) {
      for (const tile of meld.tiles) {
        if (tile && !isHonor(tile)) meldSuitCount.set(tileSuit(tile), (meldSuitCount.get(tileSuit(tile)) || 0) + 1);
      }
    }
    if (!isHonor(candidateTile)) {
      const suitCount = meldSuitCount.get(tileSuit(candidateTile)) || 0;
      if (suitCount >= 3) danger += 0.3;
      if (suitCount > 0) danger += 0.2;
    }
    danger = clamp(danger);
    if (danger > 0) dangerTiles.set(candidateTile, Math.max(dangerTiles.get(candidateTile) || 0, danger));
    weightedDanger += tenpai * danger;
  }
  return { dangerTiles, safeTiles: Array.from(safeTiles), opponentTenpaiProb, defenseScore: -roundScore(clamp(weightedDanger)) };
}
