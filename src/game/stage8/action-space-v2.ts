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

export const STAGE8_ACTION_SPACE_V2_VERSION = 'stage8-action-space-v2';

const TILE_KEYS: Tile[] = [
  'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9',
  'tong1', 'tong2', 'tong3', 'tong4', 'tong5', 'tong6', 'tong7', 'tong8', 'tong9',
  'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao9',
  'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai',
];

export const STAGE8_ACTION_REGISTRY_V2 = Object.freeze({
  normalConcealedKong: Object.freeze({ baseId: 343, tiled: true }),
});

export interface Stage8V2ProtocolInput {
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
}

export interface CanonicalStage8V2Action {
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
  actionType: 'normalConcealedKong';
  actionId: number;
  tile: Tile;
  context: {
    actor: number;
    declarationWindow: 'self-draw-discard';
    ownTileCount: 4;
    robKongWindow: false;
  };
}

export interface Stage8V2ActionResult {
  canonicalLegalActions: CanonicalStage8V2Action[];
  publicLogSummary: {
    actionIds: number[];
    actionTypes: Array<CanonicalStage8V2Action['actionType']>;
    phase: GameState['phase'];
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

function tileIndex(tile: Tile): number {
  const index = TILE_KEYS.indexOf(tile);
  if (index < 0) throw new Error(`unknown stage8 v2 tile: ${tile}`);
  return index;
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

function canonicalAction(playerId: number, tile: Tile): CanonicalStage8V2Action {
  return {
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    actionType: 'normalConcealedKong',
    actionId: STAGE8_ACTION_REGISTRY_V2.normalConcealedKong.baseId + tileIndex(tile),
    tile,
    context: { actor: playerId, declarationWindow: 'self-draw-discard', ownTileCount: 4, robKongWindow: false },
  };
}

export function deriveStage8V2Actions(input: Stage8V2ProtocolInput & { state: GameState; playerId: number }): Stage8V2ActionResult {
  assertV2Protocol(input as unknown as Record<string, unknown>);
  const canonicalLegalActions = normalConcealedTiles(input.state, input.playerId)
    .map((tile) => canonicalAction(input.playerId, tile))
    .sort((left, right) => left.actionId - right.actionId);
  return {
    canonicalLegalActions,
    publicLogSummary: {
      actionIds: canonicalLegalActions.map((action) => action.actionId),
      actionTypes: canonicalLegalActions.map((action) => action.actionType),
      phase: input.state.phase,
    },
  };
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
