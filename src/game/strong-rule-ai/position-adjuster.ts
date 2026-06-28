import type { PositionAdjustment } from './types';

export function analyzePosition(scores: number[], currentPlayer: number): PositionAdjustment {
  const own = scores[currentPlayer] || 0;
  const bestOther = Math.max(...scores.filter((_, index) => index !== currentPlayer));
  const diff = own - bestOther;
  if (diff > 8) return { situation: 'bigLead', offenseMultiplier: 0.5, defenseMultiplier: 2.0, riskTolerance: 0.2 };
  if (diff > 2) return { situation: 'smallLead', offenseMultiplier: 1.0, defenseMultiplier: 1.2, riskTolerance: 0.4 };
  if (diff >= -2) return { situation: 'even', offenseMultiplier: 1.0, defenseMultiplier: 1.0, riskTolerance: 0.6 };
  if (diff >= -8) return { situation: 'smallBehind', offenseMultiplier: 1.2, defenseMultiplier: 0.8, riskTolerance: 0.7 };
  return { situation: 'bigBehind', offenseMultiplier: 1.5, defenseMultiplier: 0.5, riskTolerance: 0.9 };
}
