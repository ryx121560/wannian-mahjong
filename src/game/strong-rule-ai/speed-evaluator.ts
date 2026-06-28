import { getShanten } from '../rules';
import type { Meld, SpeedEvaluation, Tile } from './types';
import { allTileKeys, clamp, removeOne, roundScore } from './utils';

function effectiveTiles(hand: Tile[], melds: Meld[]): Tile[] {
  const current = getShanten(hand, { melds }).shanten;
  return allTileKeys().filter((tile) => getShanten(hand.concat(tile), { melds }).shanten < current);
}

export function evaluateSpeed(hand: Tile[], melds: Meld[], discardTile: Tile): SpeedEvaluation {
  const afterHand = removeOne(hand, discardTile);
  const shantenBefore = getShanten(hand, { melds }).shanten;
  const shantenAfter = getShanten(afterHand, { melds }).shanten;
  const beforeEffective = effectiveTiles(hand, melds);
  const afterEffective = effectiveTiles(afterHand, melds);
  let speedScore = 0;
  if (shantenAfter < shantenBefore) speedScore = clamp(0.5 + (shantenBefore - shantenAfter) * 0.25, -1, 1);
  else if (shantenAfter > shantenBefore) speedScore = -clamp(0.5 + (shantenAfter - shantenBefore) * 0.25, 0, 1);
  else {
    const diff = afterEffective.length - beforeEffective.length;
    speedScore = diff === 0 ? 0 : clamp(diff / 12, -0.3, 0.3);
  }
  return { shantenBefore, shantenAfter, speedScore: roundScore(speedScore), effectiveTiles: afterEffective, effectiveCount: afterEffective.length };
}
