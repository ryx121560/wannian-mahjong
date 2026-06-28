import { isHonor, isNumberTile, tileMod3Group } from '../rules';
import type { DalanRouteAnalysis, Meld, Tile } from './types';
import { clamp, countPairsAndTriples, dalanGapOk, daziCount, honorKinds, maxMod3Convergence, removeOne, roundScore } from './utils';

export function evaluateDalanRoute(hand: Tile[], melds: Meld[], _turn: number): DalanRouteAnalysis {
  const allDifferent = new Set(hand).size === hand.length;
  const honorCount = honorKinds(hand).length;
  const maxDiffOk = dalanGapOk(hand);
  const progress = (allDifferent ? 0.3 : 0) + Math.min(honorCount / 7, 1) * 0.3 + (maxDiffOk ? 0.4 : 0);
  const { triplets } = countPairsAndTriples(hand);
  const completeStructures = triplets + melds.length;
  const normalRouteAbandonCost = clamp((completeStructures + daziCount(hand) * 0.35) / 4);
  const mod3Convergence = maxMod3Convergence(hand);
  const sevenHonorsProgress = honorKinds(hand).length;
  let recommendedSubtype: string | null = null;
  if (sevenHonorsProgress >= 6 && mod3Convergence > 0.8) recommendedSubtype = '七字全正宗';
  else if (sevenHonorsProgress >= 6) recommendedSubtype = '七字系列';
  else if (mod3Convergence > 0.8) recommendedSubtype = '全正宗';
  else if (mod3Convergence >= 0.5) recommendedSubtype = '半正宗';
  else if (progress > 0.6) recommendedSubtype = '打烂';
  const shouldConsiderDalan = progress > 0.6 && completeStructures < 2;
  const dalanRouteScore = shouldConsiderDalan ? clamp(progress - normalRouteAbandonCost * 0.35) : clamp(progress * 0.35 - completeStructures * 0.2);
  return {
    shouldConsiderDalan,
    dalanProgress: { allDifferent, honorCount, maxDiffOk, progressPercent: Math.round(progress * 100) },
    recommendedSubtype,
    subtypeUpgradePotential: { mod3Convergence: roundScore(mod3Convergence), sevenHonorsProgress },
    dalanRouteScore: roundScore(dalanRouteScore),
    normalRouteAbandonCost: roundScore(normalRouteAbandonCost),
  };
}

export function evaluateDalanImpact(hand: Tile[], melds: Meld[], discardTile: Tile, currentAnalysis: DalanRouteAnalysis): number {
  const next = evaluateDalanRoute(removeOne(hand, discardTile), melds, 1);
  let delta = next.dalanRouteScore - currentAnalysis.dalanRouteScore;
  if (isHonor(discardTile) && currentAnalysis.dalanProgress.honorCount >= 5) delta -= 0.25;
  if (isNumberTile(discardTile) && currentAnalysis.subtypeUpgradePotential.mod3Convergence >= 0.5) {
    const remainingNumberGroups = removeOne(hand, discardTile).filter(isNumberTile).map(tileMod3Group).filter((value) => value !== 0);
    const sameGroup = remainingNumberGroups.filter((group) => group === tileMod3Group(discardTile)).length;
    if (sameGroup >= 2) delta -= 0.1;
  }
  return roundScore(clamp(delta, -1, 1));
}
