import type { Meld, ShantenResult, TenpaiResult, Tile } from '../rules/types';

export type AIPhase = 'early' | 'middle' | 'late';
export type DimensionKey = 'speed' | 'handValue' | 'waitQuality' | 'kongZhichan' | 'dalanRoute' | 'defense' | 'position' | 'structure';

export interface CandidateScore {
  tile: Tile;
  totalScore: number;
  breakdown: {
    speedScore: number;
    handValueScore: number;
    waitQualityScore: number;
    kongZhichanScore: number;
    dalanRouteScore: number;
    defenseScore: number;
    positionAdjustment: number;
    structurePenalty: number;
  };
  metadata: {
    shantenBefore: number;
    shantenAfter: number;
    expectedBaseScore: number;
    effectiveCount: number;
    isDalanRoute: boolean;
    kongOpportunity: boolean;
  };
}

export interface DalanRouteAnalysis {
  shouldConsiderDalan: boolean;
  dalanProgress: {
    allDifferent: boolean;
    honorCount: number;
    maxDiffOk: boolean;
    progressPercent: number;
  };
  recommendedSubtype: string | null;
  subtypeUpgradePotential: {
    mod3Convergence: number;
    sevenHonorsProgress: number;
  };
  dalanRouteScore: number;
  normalRouteAbandonCost: number;
}

export interface KongZhichanPotential {
  anGangOpportunities: { tile: Tile; probability: number; expectedGain: number; robRisk: number }[];
  zhiChanOpportunities: { keziTile: Tile; probability: number; expectedGain: number; interceptRisk: number }[];
  paoGangOpportunities: { tile: Tile; successProbability: number; expectedGain: number; failCost: number }[];
  lianGangPotential: { probability: number; extraMultiplier: number };
  noColorPotential: { isPossible: boolean; probability: number; bonusMultiplier: number };
  kongZhichanScore: number;
}

export interface PositionAdjustment {
  situation: 'bigLead' | 'smallLead' | 'even' | 'smallBehind' | 'bigBehind';
  offenseMultiplier: number;
  defenseMultiplier: number;
  riskTolerance: number;
}

export interface DecisionConfig {
  weights: Record<DimensionKey, number>;
  enabledDimensions: Set<DimensionKey>;
}

export interface StrongAIGameState {
  hand?: Tile[];
  melds: Meld[][];
  discards: Tile[][];
  turn: number;
  dealer: number;
  currentPlayer: number;
  scores: number[];
  wallTiles?: Tile[];
  wallRemaining?: number;
  players?: Array<{ hand: Tile[]; melds?: Meld[]; score?: number }>;
  newDrawnTile?: Tile;
}

export interface AIDecision {
  selectedTile: Tile;
  selectedScore: number;
  allCandidates: CandidateScore[];
  phase: AIPhase;
  reasoning: string;
  metadata: {
    shanten: number;
    isTenpai: boolean;
    dalanRoute: DalanRouteAnalysis | null;
    kongZhichan: KongZhichanPotential;
    position: PositionAdjustment;
  };
}

export interface DecisionLog {
  timestamp: string;
  turn: number;
  phase: AIPhase;
  hand: Tile[];
  melds: Meld[];
  scores: number[];
  shanten: number;
  isTenpai: boolean;
  candidates: CandidateScore[];
  selected: { tile: Tile; score: number; reasoning: string };
  routeAnalysis: {
    dalanRoute: DalanRouteAnalysis | null;
    kongZhichan: KongZhichanPotential;
    position: PositionAdjustment;
  };
}

export interface SpeedEvaluation {
  shantenBefore: number;
  shantenAfter: number;
  speedScore: number;
  effectiveTiles: Tile[];
  effectiveCount: number;
}

export interface HandValueEvaluation {
  possibleHandTypes: { type: string; probability: number }[];
  expectedBaseScore: number;
  expectedFinalScore: number;
  handValueScore: number;
}

export interface WaitQualityEvaluation {
  waitQualityScore: number;
  waitType: string;
  bestWait: { tile: Tile; remaining: number } | null;
}

export interface DefenseBasicResult {
  dangerTiles: Map<Tile, number>;
  safeTiles: Tile[];
  opponentTenpaiProb: number[];
  defenseScore: number;
}

export interface StructurePenaltyResult {
  penalty: number;
  destroyedStructure: {
    type: 'mianzi' | 'dazi' | 'duizi' | 'none';
    description: string;
  };
}

export type { Meld, ShantenResult, TenpaiResult, Tile };
