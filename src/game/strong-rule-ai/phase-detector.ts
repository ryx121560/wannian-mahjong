import type { AIPhase, DimensionKey } from './types';

const PHASE_WEIGHTS: Record<AIPhase, Record<DimensionKey, number>> = {
  early: { speed: 1.2, handValue: 0.8, waitQuality: 0.6, kongZhichan: 0.5, dalanRoute: 0.8, defense: 0.2, position: 0.5, structure: 1.0 },
  middle: { speed: 1.0, handValue: 1.0, waitQuality: 0.8, kongZhichan: 0.7, dalanRoute: 0.6, defense: 0.5, position: 0.5, structure: 1.0 },
  late: { speed: 0.6, handValue: 0.8, waitQuality: 1.0, kongZhichan: 0.8, dalanRoute: 0.3, defense: 1.2, position: 1.0, structure: 1.0 },
};

export function detectPhase(turn: number): AIPhase {
  if (turn <= 6) return 'early';
  if (turn <= 12) return 'middle';
  return 'late';
}

export function getPhaseWeights(phase: string): Record<DimensionKey, number> {
  return { ...PHASE_WEIGHTS[(phase as AIPhase) || 'middle'] || PHASE_WEIGHTS.middle };
}
