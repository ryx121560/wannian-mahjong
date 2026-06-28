import { ALL_TILE_KEYS } from './tile-utils';
import { canWin } from './hand-evaluator';
import type { Meld, Tile } from './types';

export function resolveWildcard(
  hand: Tile[],
  melds: Meld[],
  zhiChanDrawTile: Tile,
): {
  isTrueWin: boolean;
  isFakeWin: boolean;
  fakeWinReplacement?: { originalTile: Tile; replacedBy: Tile };
} {
  if (canWin(hand, { melds }).canWin) return { isTrueWin: true, isFakeWin: false };
  for (let i = 0; i < hand.length; i += 1) {
    const originalTile = hand[i];
    for (const replacement of ALL_TILE_KEYS) {
      const replaced = hand.slice();
      replaced[i] = replacement;
      if (canWin(replaced, { melds, winTile: zhiChanDrawTile }).canWin) {
        return { isTrueWin: false, isFakeWin: true, fakeWinReplacement: { originalTile, replacedBy: replacement } };
      }
    }
  }
  return { isTrueWin: false, isFakeWin: false };
}
