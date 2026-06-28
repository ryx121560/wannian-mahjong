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
    const replaced = hand.slice();
    replaced[i] = zhiChanDrawTile;
    if (canWin(replaced, { melds, winTile: zhiChanDrawTile }).canWin) {
      return { isTrueWin: false, isFakeWin: true, fakeWinReplacement: { originalTile, replacedBy: zhiChanDrawTile } };
    }
  }
  return { isTrueWin: false, isFakeWin: false };
}
