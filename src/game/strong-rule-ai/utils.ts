import { ALL_TILE_KEYS, countTiles, isHonor, isNumberTile, tileMod3Group, tileSuit, tileValue } from '../rules';
import type { Meld, StrongAIGameState, Tile } from './types';

export const DEFAULT_DIMENSIONS = ['speed', 'handValue', 'waitQuality', 'kongZhichan', 'dalanRoute', 'defense', 'position', 'structure'] as const;

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function roundScore(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function removeOne(hand: Tile[], tile: Tile): Tile[] {
  let removed = false;
  return hand.filter((item) => {
    if (!removed && item === tile) {
      removed = true;
      return false;
    }
    return true;
  });
}

export function uniqueDiscards(hand: Tile[]): Tile[] {
  return Array.from(new Set(hand));
}

export function getPlayerHand(state: StrongAIGameState): Tile[] {
  const player = state.players?.[state.currentPlayer];
  return (player?.hand || state.hand || []).slice();
}

export function getPlayerMelds(state: StrongAIGameState): Meld[] {
  const player = state.players?.[state.currentPlayer];
  return (player?.melds || state.melds?.[state.currentPlayer] || []).slice();
}

export function visibleCount(state: StrongAIGameState, tile: Tile, ownHand: Tile[] = []): number {
  let count = ownHand.filter((item) => item === tile).length;
  for (const row of state.discards || []) count += row.filter((item) => item === tile).length;
  for (const melds of state.melds || []) {
    for (const meld of melds) count += meld.tiles.filter((item) => item === tile).length;
  }
  return count;
}

export function remainingCount(state: StrongAIGameState | null, tile: Tile, ownHand: Tile[] = []): number {
  if (!state) return Math.max(0, 4 - ownHand.filter((item) => item === tile).length);
  return Math.max(0, 4 - visibleCount(state, tile, ownHand));
}

export function allTileKeys(): Tile[] {
  return ALL_TILE_KEYS as Tile[];
}

export function countPairsAndTriples(hand: Tile[]): { pairs: number; triplets: number; pairTiles: Tile[] } {
  const counts = countTiles(hand);
  let pairs = 0;
  let triplets = 0;
  const pairTiles: Tile[] = [];
  for (const [tile, count] of counts.entries()) {
    if (count >= 2) {
      pairs += 1;
      pairTiles.push(tile as Tile);
    }
    if (count >= 3) triplets += 1;
  }
  return { pairs, triplets, pairTiles };
}

export function numberSuitCounts(hand: Tile[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const tile of hand) {
    if (isNumberTile(tile)) result.set(tileSuit(tile), (result.get(tileSuit(tile)) || 0) + 1);
  }
  return result;
}

export function maxNumberSuitCount(hand: Tile[]): number {
  return Math.max(0, ...Array.from(numberSuitCounts(hand).values()));
}

export function honorKinds(hand: Tile[]): Tile[] {
  return Array.from(new Set(hand.filter(isHonor)));
}

export function hasMianziLikeStructure(hand: Tile[]): boolean {
  const counts = countTiles(hand);
  for (const count of counts.values()) if (count >= 3) return true;
  for (const suit of ['wan', 'tong', 'tiao']) {
    for (let value = 1; value <= 7; value += 1) {
      if (counts.get(`${suit}${value}` as Tile) && counts.get(`${suit}${value + 1}` as Tile) && counts.get(`${suit}${value + 2}` as Tile)) return true;
    }
  }
  return false;
}

export function daziCount(hand: Tile[]): number {
  const counts = countTiles(hand);
  let total = 0;
  for (const [tile, count] of counts.entries()) if (count >= 2) total += 1;
  for (const suit of ['wan', 'tong', 'tiao']) {
    for (let value = 1; value <= 8; value += 1) {
      if (counts.get(`${suit}${value}` as Tile) && counts.get(`${suit}${value + 1}` as Tile)) total += 1;
    }
    for (let value = 1; value <= 7; value += 1) {
      if (counts.get(`${suit}${value}` as Tile) && counts.get(`${suit}${value + 2}` as Tile)) total += 1;
    }
  }
  return total;
}

export function maxMod3Convergence(hand: Tile[]): number {
  const groups = hand.filter(isNumberTile).map(tileMod3Group).filter((value) => value !== 0);
  if (!groups.length) return 0;
  const counts = new Map<number, number>();
  for (const group of groups) counts.set(group, (counts.get(group) || 0) + 1);
  return Math.max(...Array.from(counts.values())) / groups.length;
}

export function dalanGapOk(hand: Tile[]): boolean {
  for (const suit of ['wan', 'tong', 'tiao']) {
    const values = hand.filter((tile) => tileSuit(tile) === suit).map(tileValue).sort((a, b) => a - b);
    for (let i = 1; i < values.length; i += 1) if (values[i] - values[i - 1] < 3) return false;
  }
  return true;
}

export function tileLabel(tile: Tile): string {
  const honors: Record<string, string> = { dong: '东风', nan: '南风', xi: '西风', bei: '北风', zhong: '红中', fa: '发财', bai: '白板' };
  if (honors[tile]) return honors[tile];
  if (tile.startsWith('wan')) return `${tileValue(tile)}万`;
  if (tile.startsWith('tong')) return `${tileValue(tile)}筒`;
  return `${tileValue(tile)}条`;
}
