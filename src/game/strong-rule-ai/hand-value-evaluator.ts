import { DEFAULT_RULES } from '../rules';
import type { HandValueEvaluation, Meld, Tile } from './types';
import { clamp, countPairsAndTriples, maxNumberSuitCount, roundScore } from './utils';

export function evaluateHandValue(hand: Tile[], _melds: Meld[], _scores: number[] = [0, 0, 0, 0], _currentPlayer = 0): HandValueEvaluation {
  const { pairs, triplets } = countPairsAndTriples(hand);
  const maxSuit = maxNumberSuitCount(hand);
  const possibleHandTypes: { type: string; probability: number; base: number }[] = [];
  const flushProbability = clamp((maxSuit / 13) * 0.8);
  const pongProbability = clamp(((pairs + triplets) / 4) * 0.7);
  const sevenPairsProbability = clamp((pairs / 7) * 0.6);
  if (maxSuit >= 8 || flushProbability >= 0.45) possibleHandTypes.push({ type: '清一色/混一色', probability: roundScore(flushProbability), base: maxSuit >= 10 ? 4 : 2 });
  if (pairs + triplets >= 4 || pongProbability >= 0.45) possibleHandTypes.push({ type: '碰碰胡', probability: roundScore(pongProbability), base: 2 });
  if (pairs >= 4 || sevenPairsProbability >= 0.3) possibleHandTypes.push({ type: '七对', probability: roundScore(sevenPairsProbability), base: 2 });
  if (!possibleHandTypes.length) possibleHandTypes.push({ type: '平胡', probability: 1, base: 1 });
  const stackMultiplier = possibleHandTypes.length > 1 ? 1.5 : 1.0;
  const expectedBaseScore = possibleHandTypes.reduce((sum, item) => sum + item.probability * item.base * stackMultiplier, 0);
  const averageWinMultiplier = 1 * 0.45 + 2 * 0.45 + 2 * 0.1;
  const expectedFinalScore = Math.min(expectedBaseScore * averageWinMultiplier, DEFAULT_RULES.capAmount);
  return {
    possibleHandTypes: possibleHandTypes.map(({ type, probability }) => ({ type, probability })),
    expectedBaseScore: roundScore(expectedBaseScore),
    expectedFinalScore: roundScore(expectedFinalScore),
    handValueScore: roundScore(expectedFinalScore / DEFAULT_RULES.capAmount),
  };
}
