import { countTiles, isNumberTile, tileSuit, tileValue } from '../rules';
import type { Meld, StructurePenaltyResult, Tile } from './types';

const DRAGON_TILES = new Set<Tile>(['zhong', 'fa', 'bai']);

function isDragon(tile: Tile): boolean {
  return DRAGON_TILES.has(tile);
}

function dragonKinds(hand: Tile[]): number {
  const counts = countTiles(hand);
  let kinds = 0;
  for (const tile of DRAGON_TILES) if ((counts.get(tile) || 0) > 0) kinds += 1;
  return kinds;
}

function shouldProtectDragonCombo(hand: Tile[]): boolean {
  const counts = countTiles(hand);
  const kinds = dragonKinds(hand);
  if (kinds >= 3) return true;
  if (kinds < 2) return false;
  return (counts.get('zhong') || 0) > 0;
}

export function breaksDragonCombo(hand: Tile[], discardTile: Tile): boolean {
  if (!isDragon(discardTile)) return false;
  const counts = countTiles(hand);
  if ((counts.get(discardTile) || 0) !== 1) return false;
  if (!shouldProtectDragonCombo(hand)) return false;
  const before = dragonKinds(hand);
  return dragonKinds(hand.filter((tile) => tile !== discardTile)) < before;
}

export function isolatedDiscardPriority(hand: Tile[], discardTile: Tile): number {
  const counts = countTiles(hand);
  const count = counts.get(discardTile) || 0;
  if (count !== 1) return 0;
  if (breaksDragonCombo(hand, discardTile)) return 0;
  if (!isNumberTile(discardTile)) return 0;

  const suit = tileSuit(discardTile);
  const value = tileValue(discardTile);
  const has = (offset: number) => counts.get(`${suit}${value + offset}` as Tile) || 0;
  if (has(-2) || has(-1) || has(1) || has(2)) return 0;
  if (value === 1 || value === 9) return 4;
  if (value === 2 || value === 8) return 3;
  if (value === 3 || value === 7) return 2;
  return 1;
}

export function evaluateStructurePenalty(hand: Tile[], _melds: Meld[], discardTile: Tile): StructurePenaltyResult {
  const counts = countTiles(hand);
  const count = counts.get(discardTile) || 0;
  if (breaksDragonCombo(hand, discardTile)) return { penalty: -1.2, destroyedStructure: { type: 'dazi', description: 'breaks dragon combo' } };
  if (count >= 3) return { penalty: -1.0, destroyedStructure: { type: 'mianzi', description: 'breaks triplet' } };
  if (isNumberTile(discardTile)) {
    const suit = tileSuit(discardTile);
    const value = tileValue(discardTile);
    const has = (offset: number) => counts.get(`${suit}${value + offset}` as Tile) || 0;
    if ((has(-2) && has(-1)) || (has(-1) && has(1)) || (has(1) && has(2))) return { penalty: -1.0, destroyedStructure: { type: 'mianzi', description: 'breaks sequence' } };
    if (has(-1) || has(1)) return { penalty: -0.5, destroyedStructure: { type: 'dazi', description: 'breaks adjacent taatsu' } };
    if (has(-2) || has(2)) return { penalty: -0.3, destroyedStructure: { type: 'dazi', description: 'breaks kanchan taatsu' } };
  }
  if (count === 2) return { penalty: -0.4, destroyedStructure: { type: 'duizi', description: 'breaks pair' } };
  return { penalty: 0, destroyedStructure: { type: 'none', description: 'isolated tile' } };
}
