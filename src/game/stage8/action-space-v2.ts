import {
  resolveConcealedKongDraw,
  scoreConcealedKongSettlement,
} from '../rules';
import type {
  ConcealedKongDrawInput,
  ConcealedKongSettlementResult,
  GameState,
  Meld,
  Tile,
} from '../rules';

import {
  STAGE8_ACTION_SPACE_V2_VERSION,
  STAGE8_ACTION_REGISTRY_V2,
  assertStage8V2Protocol,
  canonicalizeStage8V2Action,
  STAGE8_V2_TILE_KEYS,
} from './action-registry-v2';
import type { CanonicalStage8V2Action, Stage8V2ProtocolInput } from './action-registry-v2';

export {
  STAGE8_ACTION_SPACE_V2_VERSION,
  STAGE8_ACTION_REGISTRY_V2,
  assertStage8V2Protocol,
  canonicalizeStage8V2Action,
  STAGE8_V2_TILE_KEYS,
};
export type { CanonicalStage8V2Action, Stage8V2ProtocolInput };
const TILE_KEYS: Tile[] = STAGE8_V2_TILE_KEYS;

export { deriveStage8V2RuleActions, executeStage8V2RuleKongAction } from './rule-semantics-adapter-v2';
export { deriveStage8V2PageSemanticActions, executeStage8V2PageKongAction } from './page-semantics-adapter-v2';
export { deriveStage8V2RoundEngineActions, executeStage8V2AddedKongDraw, executeStage8V2RoundKongAction } from './round-engine-v2';
export type { Stage8V2AddedKongExecutionInput } from './round-engine-v2';
export type { Stage8V2VisibleActionInput, Stage8V2PageSemanticInput, Stage8V2BrowserRuleFacade } from './v2-visible-state';

export function compareStage8V2CanonicalActions(
  left: CanonicalStage8V2Action[],
  right: CanonicalStage8V2Action[],
): { equal: boolean; leftOnly: number[]; rightOnly: number[] } {
  const leftIds = left.map((action) => action.actionId);
  const rightIds = right.map((action) => action.actionId);
  return {
    equal: leftIds.length === rightIds.length && leftIds.every((actionId, index) => actionId === rightIds[index]),
    leftOnly: leftIds.filter((actionId) => !rightIds.includes(actionId)),
    rightOnly: rightIds.filter((actionId) => !leftIds.includes(actionId)),
  };
}
export interface Stage8V2NormalConcealedKongClaim extends Stage8V2ProtocolInput {
  kind: 'normalConcealedKong';
  owner: number;
  kongTile: Tile;
  preKongHand: Tile[];
  preKongMelds: Meld[];
  declarationWindowDrawTile: Tile;
}

export interface Stage8V2NormalConcealedKongSimulation extends Stage8V2ProtocolInput {
  state: GameState;
  claim: Stage8V2NormalConcealedKongClaim;
}

export interface Stage8V2NormalConcealedKongResult {
  outcome: 'normalConcealedKongTrueWin' | 'normalConcealedKongFakeWin';
  settlement: ConcealedKongSettlementResult;
  nextState: GameState;
  robKongWindowOpened: false;
  publicLogSummary: {
    actionType: 'normalConcealedKong';
    outcome: 'normalConcealedKongTrueWin' | 'normalConcealedKongFakeWin';
    payments: number[];
    handTypes: string[];
    decompositionSignature: string;
  };
}

function assertV2Protocol(input: Record<string, unknown>): void {
  if (input.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION) {
    throw new Error('stage8-action-space-v2 protocol required');
  }
  const forbidden = new Set(['replayCursor', 'checkpoint', 'model', 'manifest', 'workRoot', 'v1ActionId', 'v1ActionSpaceVersion']);
  const visited = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key)) throw new Error(`v1 artifact field rejected: ${key}`);
      visit(child);
    }
  }
  visit(input);
}

function playerState(state: GameState, playerId: number): { hand: Tile[]; melds: Meld[] } {
  const player = state.players?.[playerId];
  if (!player) throw new Error(`missing stage8 v2 player: ${playerId}`);
  return { hand: player.hand.slice(), melds: (player.melds || state.melds[playerId] || []).slice() };
}

function removeTiles(hand: Tile[], tile: Tile, count: number): Tile[] {
  const next = hand.slice();
  for (let index = 0; index < count; index += 1) {
    const tileIndex = next.indexOf(tile);
    if (tileIndex < 0) throw new Error('normal concealed kong physical tile proof missing');
    next.splice(tileIndex, 1);
  }
  return next;
}

function normalConcealedTiles(state: GameState, playerId: number): Tile[] {
  if (state.phase !== 'discarding' || state.currentPlayer !== playerId || !state.newDrawnTile) return [];
  const { hand } = playerState(state, playerId);
  return TILE_KEYS.filter((tile) => hand.filter((item) => item === tile).length === 4);
}

/** @deprecated Use an explicit rule, page-semantic, or round-engine adapter. */
export function deriveStage8V2Actions(input: Stage8V2ProtocolInput & { state: GameState; playerId: number }): never {
  assertV2Protocol(input as unknown as Record<string, unknown>);
  throw new Error(
    'ambiguous v2 action entry disabled; use deriveStage8V2RuleActions, deriveStage8V2PageSemanticActions, or deriveStage8V2RoundEngineActions',
  );
}

export function prepareStage8V2NormalConcealedKongClaim(input: Stage8V2ProtocolInput & {
  state: GameState;
  playerId: number;
  tile: Tile;
}): Stage8V2NormalConcealedKongClaim {
  assertV2Protocol(input as unknown as Record<string, unknown>);
  if (!normalConcealedTiles(input.state, input.playerId).includes(input.tile)) {
    throw new Error('normal concealed kong not legal in this declaration window');
  }
  const player = playerState(input.state, input.playerId);
  return {
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    kind: 'normalConcealedKong',
    owner: input.playerId,
    kongTile: input.tile,
    preKongHand: player.hand,
    preKongMelds: player.melds,
    declarationWindowDrawTile: input.state.newDrawnTile as Tile,
  };
}

function sameTiles(left: Tile[], right: Tile[]): boolean {
  return left.length === right.length && left.slice().sort().every((tile, index) => tile === right.slice().sort()[index]);
}

function buildRuleInput(state: GameState, claim: Stage8V2NormalConcealedKongClaim): ConcealedKongDrawInput {
  const player = playerState(state, claim.owner);
  if (!sameTiles(player.hand, claim.preKongHand)) throw new Error('normal concealed kong state no longer matches declaration');
  const handAfterKong = removeTiles(claim.preKongHand, claim.kongTile, 4);
  const drawTile = state.wallTiles.at(-1);
  if (!drawTile) throw new Error('normal concealed kong supplement unavailable');
  return {
    owner: claim.owner,
    kongTile: claim.kongTile,
    preKongHand: claim.preKongHand,
    handAfterKong,
    melds: claim.preKongMelds.concat([{ type: 'anGang', tiles: [claim.kongTile, claim.kongTile, claim.kongTile, claim.kongTile] }]),
    drawTile,
  };
}

export function simulateStage8V2NormalConcealedKong(input: Stage8V2NormalConcealedKongSimulation): Stage8V2NormalConcealedKongResult {
  assertV2Protocol(input as unknown as Record<string, unknown>);
  const claim = input.claim;
  if (claim.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION || claim.kind !== 'normalConcealedKong') {
    throw new Error('invalid normal concealed kong v2 claim');
  }
  const ruleInput = buildRuleInput(input.state, claim);
  const resolution = resolveConcealedKongDraw(ruleInput);
  const settlement = scoreConcealedKongSettlement({ action: ruleInput, winner: claim.owner, scores: input.state.scores });
  const players = (input.state.players || []).map((player, index) => index === claim.owner
    ? { ...player, hand: ruleInput.handAfterKong.concat(ruleInput.drawTile), melds: ruleInput.melds.slice() }
    : { ...player, hand: player.hand.slice(), melds: (player.melds || []).slice() });
  const melds = input.state.melds.map((playerMelds, index) => index === claim.owner ? ruleInput.melds.slice() : playerMelds.slice());
  const outcome = resolution.outcome === 'concealedKongTrueWin' ? 'normalConcealedKongTrueWin' : 'normalConcealedKongFakeWin';
  const nextState: GameState = {
    ...input.state,
    players,
    melds,
    scores: settlement.after.slice(),
    wallTiles: input.state.wallTiles.slice(0, -1),
    phase: 'ended',
    newDrawnTile: ruleInput.drawTile,
  };
  return {
    outcome,
    settlement,
    nextState,
    robKongWindowOpened: false,
    publicLogSummary: {
      actionType: 'normalConcealedKong',
      outcome,
      payments: settlement.payments.slice(),
      handTypes: resolution.classification.handTypes.slice(),
      decompositionSignature: resolution.classification.decompositionSignature,
    },
  };
}

export function scanStage8V2PublicSummary(value: unknown): string[] {
  const encoded = JSON.stringify(value).toLowerCase();
  return ['futurewall', 'opponenthand', 'hiddenhand'].filter((forbidden) => encoded.includes(forbidden));
}
