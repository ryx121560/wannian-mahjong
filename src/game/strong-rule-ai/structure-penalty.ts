import { countTiles, isNumberTile, tileSuit, tileValue } from '../rules';
import type { Meld, StructurePenaltyResult, Tile } from './types';

export function evaluateStructurePenalty(hand: Tile[], _melds: Meld[], discardTile: Tile): StructurePenaltyResult {
  const counts = countTiles(hand);
  const count = counts.get(discardTile) || 0;
  if (count >= 3) return { penalty: -1.0, destroyedStructure: { type: 'mianzi', description: '拆刻子' } };
  if (isNumberTile(discardTile)) {
    const suit = tileSuit(discardTile);
    const value = tileValue(discardTile);
    const has = (offset: number) => counts.get(`${suit}${value + offset}` as Tile) || 0;
    if ((has(-2) && has(-1)) || (has(-1) && has(1)) || (has(1) && has(2))) return { penalty: -1.0, destroyedStructure: { type: 'mianzi', description: '拆顺子' } };
    if (has(-1) || has(1)) return { penalty: -0.5, destroyedStructure: { type: 'dazi', description: '拆两面搭子' } };
    if (has(-2) || has(2)) return { penalty: -0.3, destroyedStructure: { type: 'dazi', description: '拆嵌张搭子' } };
  }
  if (count === 2) return { penalty: -0.4, destroyedStructure: { type: 'duizi', description: '拆对子' } };
  return { penalty: 0, destroyedStructure: { type: 'none', description: '弃孤张' } };
}
