import type { GameState, LegalAction } from '../rules';
import type { AddedKongChainWindowInput, CandidateConcealedKongResource } from '../rules/special-kong';
import type { Stage8V2ProtocolInput } from './action-registry-v2';

export interface Stage8V2VisibleActionInput extends Stage8V2ProtocolInput {
  state: GameState;
  playerId: number;
  candidateKongResources?: CandidateConcealedKongResource[];
  addedKongChainWindows?: AddedKongChainWindowInput[];
}

export interface Stage8V2BrowserRuleFacade {
  getLegalActions(state: GameState, playerId: number): LegalAction[];
  canDeclareSpecialKongAction(action: unknown): boolean;
  resolveKongDraw(action: unknown): any;
  scoreKongSettlement(input: unknown): any;
  resolveSpecialKongAction(action: unknown): any;
  scoreSpecialKongSettlement(input: unknown): any;
  resolveRobKongWinner(state: GameState, owner: number, tile: import('../rules').Tile): number | null;
}

export interface Stage8V2PageSemanticInput extends Stage8V2VisibleActionInput {
  browserRuleEngine: Stage8V2BrowserRuleFacade;
}

type WithoutDrawTile<T> = T extends unknown ? Omit<T, 'drawTile'> : never;

export type Stage8V2KongResourceDeclaration = WithoutDrawTile<import('../rules').KongDrawResolutionInput>;

export type Stage8V2KongExecutionClaim =
  | {
    family: 'kongResource';
    action: Stage8V2KongResourceDeclaration;
    pointKongPlayer?: number;
  }
  | {
    family: 'specialKong';
    action: import('../rules/special-kong').SpecialKongDeclarationAction;
  }
  | {
    family: 'decline';
    owner: number;
  };

export interface Stage8V2KongExecutionInput extends Stage8V2ProtocolInput {
  state: GameState;
  selectedAction: import('./action-registry-v2').CanonicalStage8V2Action;
  claim: Stage8V2KongExecutionClaim;
}

export interface Stage8V2KongSettlementView {
  before: number[];
  after: number[];
  delta: number[];
  payments: number[];
  winner: number;
  event: string;
  handTypes: string[];
  multiplier: number;
  capped: boolean;
}

export interface Stage8V2KongExecutionResult {
  actionSpaceVersion: 'stage8-action-space-v2';
  actionType: import('./action-registry-v2').Stage8V2ActionType;
  owner: number;
  outcome: string;
  mustDiscard: boolean;
  robKongWindow: boolean;
  robKongWinner: number | null;
  wallConsumed: 0 | 1;
  nextHand: import('../rules').Tile[];
  nextMelds: import('../rules').Meld[];
  resourceAfterKong?: unknown;
  settlement: Stage8V2KongSettlementView | null;
  handTypes: string[];
  decompositionSignature: string | null;
  publicLog: {
    actionSpaceVersion: 'stage8-action-space-v2';
    actionType: import('./action-registry-v2').Stage8V2ActionType;
    owner: number;
    outcome: string;
    mustDiscard: boolean;
    robKongWinner: number | null;
    wallConsumed: 0 | 1;
    payments: number[] | null;
    handTypes: string[];
    decompositionSignature: string | null;
  };
}

export interface Stage8V2KongPageExecutionInput extends Stage8V2KongExecutionInput {
  browserRuleEngine: Stage8V2BrowserRuleFacade;
}
