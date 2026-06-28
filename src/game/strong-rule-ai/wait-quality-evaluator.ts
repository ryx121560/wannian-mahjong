import type { Meld, TenpaiResult, Tile, WaitQualityEvaluation } from './types';
import { clamp, roundScore } from './utils';

export function evaluateWaitQuality(_hand: Tile[], _melds: Meld[], tenpaiResult: TenpaiResult): WaitQualityEvaluation {
  if (!tenpaiResult.isTenpai || !tenpaiResult.waitingDetails.length) return { waitQualityScore: 0, waitType: 'not-tenpai', bestWait: null };
  const waits = tenpaiResult.waitingDetails;
  const waitCount = waits.length;
  const best = waits.slice().sort((a, b) => b.remaining - a.remaining || b.baseScoreIfWin - a.baseScoreIfWin)[0];
  let base = 0.2;
  if (waitCount >= 3) base = 1.0;
  else if (waitCount === 2) base = 0.8;
  else if (best.remaining >= 3) base = 0.6;
  else if (best.remaining === 2) base = 0.4;
  const remainingAdjustment = best.remaining >= 4 ? 0.2 : best.remaining === 3 ? 0.1 : best.remaining === 1 ? -0.1 : best.remaining === 0 ? -0.3 : 0;
  const valueAdjustment = best.baseScoreIfWin >= 8 ? 0.2 : best.baseScoreIfWin >= 4 ? 0.1 : 0;
  const score = clamp(base + remainingAdjustment + valueAdjustment);
  return {
    waitQualityScore: roundScore(score),
    waitType: waitCount >= 3 ? 'multi' : waitCount === 2 ? 'two-sided' : best.remaining <= 1 ? 'dead-or-single' : 'single',
    bestWait: { tile: best.tile, remaining: best.remaining },
  };
}
