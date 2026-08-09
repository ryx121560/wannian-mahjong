import { canDeclareSpecialKongAction, getLegalActions, resolveAddedKongDraw, resolveKongDraw, resolveRobKongWinner, resolveSpecialKongAction, scoreKongSettlement, scoreSpecialKongSettlement } from '../rules';
import type { GameState, KongDrawResolutionInput, LegalAction, Meld, SpecialKongAction, Tile } from '../rules';
import type { AddedKongChainWindowInput, CandidateConcealedKongResource } from '../rules/special-kong';
import { assertStage8V2Protocol, canonicalizeStage8V2Action } from './action-registry-v2';
import { STAGE8_ACTION_SPACE_V2_VERSION } from './action-registry-v2';
import type { CanonicalStage8V2Action, Stage8V2ActionType } from './action-registry-v2';
import type { Stage8V2KongExecutionInput, Stage8V2KongExecutionResult, Stage8V2VisibleActionInput } from './v2-visible-state';

function roundPlayer(state: GameState, playerId: number): { hand: Tile[]; melds: Meld[] } {
  const value = state.players?.[playerId];
  if (!value) throw new Error(`missing stage8 v2 round player: ${playerId}`);
  return { hand: value.hand.slice(), melds: (value.melds || state.melds[playerId] || []).slice() };
}

function roundTiles(hand: Tile[]): Tile[] {
  return Array.from(new Set(hand)).sort();
}

function roundCount(hand: Tile[], tile: Tile): number {
  return hand.filter((item) => item === tile).length;
}

function roundRemoveTiles(hand: Tile[], tile: Tile, amount: number): Tile[] | null {
  const next = hand.slice();
  for (let index = 0; index < amount; index += 1) {
    const found = next.indexOf(tile);
    if (found < 0) return null;
    next.splice(found, 1);
  }
  return next;
}
function roundWindow(state: GameState): 'discard-response' | 'self-draw-discard' {
  return state.phase === 'responding' ? 'discard-response' : 'self-draw-discard';
}

function roundActions(state: GameState, playerId: number, legal: LegalAction[], candidateKongResources: CandidateConcealedKongResource[], addedKongChainWindows: AddedKongChainWindowInput[]): CanonicalStage8V2Action[] {
  const current = roundPlayer(state, playerId);
  const window = roundWindow(state);
  const actions: CanonicalStage8V2Action[] = [];
  if (legal.includes('pass')) actions.push(canonicalizeStage8V2Action({ actionType: 'pass', actor: playerId, declarationWindow: window, robKongWindow: false }));
  if (legal.includes('discard')) for (const tile of roundTiles(current.hand)) actions.push(canonicalizeStage8V2Action({ actionType: 'discard', actor: playerId, declarationWindow: 'self-draw-discard', tile, robKongWindow: false }));
  if (legal.includes('pong') && state.lastDiscard) actions.push(canonicalizeStage8V2Action({ actionType: 'pong', actor: playerId, declarationWindow: 'discard-response', tile: state.lastDiscard, ownTileCount: 2, robKongWindow: false }));
  if (legal.includes('win') || legal.includes('selfWin')) actions.push(canonicalizeStage8V2Action({ actionType: 'win', actor: playerId, declarationWindow: window, robKongWindow: false }));
  if (legal.includes('directChisel') && state.lastDiscard) actions.push(canonicalizeStage8V2Action({ actionType: 'directChisel', actor: playerId, declarationWindow: 'discard-response', tile: state.lastDiscard, ownTileCount: 3, robKongWindow: true }));
  if (legal.includes('forcedRunKong') && state.lastDiscard) actions.push(canonicalizeStage8V2Action({ actionType: 'forcedRunImmediate', actor: playerId, declarationWindow: 'discard-response', tile: state.lastDiscard, ownTileCount: 3, robKongWindow: true }));
  if (legal.includes('concealedKong')) for (const tile of roundTiles(current.hand).filter((tile) => roundCount(current.hand, tile) === 4)) {
    const handAfterKong = roundRemoveTiles(current.hand, tile, 4);
    const specialAction = handAfterKong && {
      kind: 'forcedRunConcealed' as const,
      input: { owner: playerId, kongTile: tile, preKongHand: current.hand, handAfterKong, melds: current.melds.concat([{ type: 'anGang', tiles: [tile, tile, tile, tile] }]) },
    };
    actions.push(canonicalizeStage8V2Action({ actionType: 'normalConcealedKong', actor: playerId, declarationWindow: 'self-draw-discard', tile, ownTileCount: 4, robKongWindow: false }));
    if (specialAction && canDeclareSpecialKongAction(specialAction)) {
      actions.push(canonicalizeStage8V2Action({ actionType: 'forcedRunConcealed', actor: playerId, declarationWindow: 'self-draw-discard', tile, ownTileCount: 4, robKongWindow: false }));
    }
  }
  for (const resource of candidateKongResources.filter((resource) => resource.owner === playerId && resource.status === 'active')) {
    const tile = resource.candidateKongTile;
    const handAfterKong = roundRemoveTiles(current.hand, tile, 4);
    const hasPong = current.melds.some((meld) => meld.type === 'peng' && meld.tiles.length === 3 && meld.tiles.every((item) => item === resource.pongMeld.tiles[0]));
    const specialAction = handAfterKong && hasPong && {
      kind: 'postPongCandidateConcealedKong' as const,
      input: { owner: playerId, resource, preKongHand: current.hand, handAfterKong, melds: current.melds.concat([{ type: 'anGang', tiles: [tile, tile, tile, tile] }]) },
    };
    if (specialAction && canDeclareSpecialKongAction(specialAction)) {
      actions.push(canonicalizeStage8V2Action({ actionType: 'postPongCandidateConcealedKong', actor: playerId, declarationWindow: 'post-pong-discard', tile, ownTileCount: 4, robKongWindow: false, resourceSignature: String(resource.owner) + ':' + String(resource.pongMeld.tiles[0]) + ':' + String(tile) }));
    }
  }
  if (legal.includes('addedKong')) for (const meld of current.melds.filter((meld) => meld.type === 'peng' && meld.tiles.length === 3 && meld.tiles.every((tile) => tile === meld.tiles[0]))) {
    const tile = meld.tiles[0];
    if (current.hand.includes(tile)) actions.push(canonicalizeStage8V2Action({ actionType: 'addedKong', actor: playerId, declarationWindow: 'self-draw-discard', tile, ownTileCount: 1, robKongWindow: true }));
  }
  const activeResources = (state.kongResources || []).filter((resource) => resource.owner === playerId && resource.status === 'active');
  for (const selectedResource of activeResources) for (const conditionalResource of activeResources) {
    if (selectedResource.tile === conditionalResource.tile || !current.hand.includes(selectedResource.tile) || !current.hand.includes(conditionalResource.tile)) continue;
    const handAfterKong = roundRemoveTiles(current.hand, selectedResource.tile, 1);
    const selectedPongIndex = current.melds.findIndex((meld) => meld.type === 'peng' && meld.tiles.length === 3 && meld.tiles.every((item) => item === selectedResource.tile));
    if (!handAfterKong || selectedPongIndex < 0) continue;
    const melds: Meld[] = current.melds.map((meld, index) => index === selectedPongIndex ? { type: 'mingGang', tiles: [selectedResource.tile, selectedResource.tile, selectedResource.tile, selectedResource.tile] as [Tile, Tile, Tile, Tile], fromPlayer: meld.fromPlayer } : meld);
    const specialAction = {
      kind: 'doublePongForcedRun' as const,
      input: { owner: playerId, selectedResource, conditionalResource, preKongHand: current.hand, handAfterKong, melds },
    };
    if (canDeclareSpecialKongAction(specialAction)) {
      actions.push(canonicalizeStage8V2Action({ actionType: 'doublePongForcedRun', actor: playerId, declarationWindow: 'self-draw-discard', selectedTile: selectedResource.tile, conditionalTile: conditionalResource.tile, ownTileCount: 1, robKongWindow: true, resourceSignature: String(selectedResource.owner) + ':' + String(selectedResource.tile) + '|' + String(conditionalResource.owner) + ':' + String(conditionalResource.tile) }));
    }
  }
  if (legal.includes('deferredForcedRunKong')) for (const resource of (state.kongResources || []).filter((resource) => resource.owner === playerId && resource.status === 'active' && current.hand.includes(resource.tile))) {
    actions.push(canonicalizeStage8V2Action({ actionType: 'forcedRunDeferred', actor: playerId, declarationWindow: 'self-draw-discard', tile: resource.tile, ownTileCount: 1, robKongWindow: true, resourceSignature: `${resource.owner}:${resource.tile}` }));
  }
  for (const windowState of addedKongChainWindows.filter((windowState) => windowState.owner === playerId)) {
    const chainTile = windowState.chainPongMeld.tiles[0];
    const handAfterChainKong = roundRemoveTiles(current.hand, chainTile, 1);
    const chainPongIndex = current.melds.findIndex((meld) => meld.type === 'peng' && meld.tiles.length === 3 && meld.tiles.every((item) => item === chainTile));
    if (!handAfterChainKong || chainPongIndex < 0) continue;
    const melds: Meld[] = current.melds.map((meld, index) => index === chainPongIndex ? { type: 'mingGang', tiles: [chainTile, chainTile, chainTile, chainTile] as [Tile, Tile, Tile, Tile], fromPlayer: meld.fromPlayer } : meld);
    const specialAction = {
      kind: 'addedKongChain' as const,
      input: { ...windowState, handBeforeChainKong: current.hand, handAfterChainKong, melds },
    };
    if (canDeclareSpecialKongAction(specialAction)) {
      actions.push(canonicalizeStage8V2Action({ actionType: 'chainKong', actor: playerId, declarationWindow: 'chain-kong', tile: chainTile, ownTileCount: 1, robKongWindow: true, resourceSignature: String(windowState.initialResource.owner) + ':' + String(windowState.initialResource.tile) + '>' + String(chainTile) }));
    }
  }
  const hasKongChoice = actions.some((action) => !['pass', 'discard', 'pong', 'win', 'declineKong'].includes(action.actionType));
  if (hasKongChoice) {
    const declineWindow = actions.some((action) => action.actionType === 'chainKong')
      ? 'chain-kong'
      : actions.some((action) => action.actionType === 'postPongCandidateConcealedKong')
        ? 'post-pong-discard'
        : window;
    actions.push(canonicalizeStage8V2Action({
      actionType: 'declineKong',
      actor: playerId,
      declarationWindow: declineWindow,
      robKongWindow: false,
    }));
  }
  return actions.sort((left, right) => left.actionId - right.actionId);
}

export function deriveStage8V2RoundEngineActions(input: Stage8V2VisibleActionInput): CanonicalStage8V2Action[] {
  assertStage8V2Protocol(input as unknown as Record<string, unknown>);
  return roundActions(input.state, input.playerId, getLegalActions(input.state, input.playerId), input.candidateKongResources || [], input.addedKongChainWindows || []);
}

export interface Stage8V2AddedKongExecutionInput {
  actionSpaceVersion: 'stage8-action-space-v2';
  state: GameState;
  owner: number;
  kongTile: Tile;
  drawTile: Tile;
  resource?: import('../rules').KongResource;
}

export function executeStage8V2AddedKongDraw(input: Stage8V2AddedKongExecutionInput) {
  assertStage8V2Protocol(input as unknown as Record<string, unknown>);
  const player = roundPlayer(input.state, input.owner);
  const wallTop = input.state.wallTiles[input.state.wallTiles.length - 1];
  if (wallTop !== input.drawTile) throw new Error('stage8-v2-added-kong-wall-top-mismatch');
  return resolveAddedKongDraw({
    owner: input.owner,
    kongTile: input.kongTile,
    preKongHand: player.hand,
    melds: player.melds,
    drawTile: input.drawTile,
    scores: input.state.scores,
    robKongState: input.state,
    resource: input.resource,
  });
}
function roundExecutionOwner(input: Stage8V2KongExecutionInput): number {
  if (input.claim.family === 'decline') return input.claim.owner;
  if (input.claim.family === 'kongResource') return input.claim.action.owner;
  return input.claim.action.input.owner;
}

function roundExecutionActionType(input: Stage8V2KongExecutionInput): Stage8V2ActionType {
  if (input.claim.family === 'decline') return 'declineKong';
  const kind = input.claim.action.kind;
  return kind === 'addedKongChain' ? 'chainKong' : kind;
}

function roundExecutionRobTile(input: Stage8V2KongExecutionInput): Tile | null {
  if (input.claim.family === 'decline') return null;
  if (input.claim.family === 'kongResource') {
    const action = input.claim.action;
    return action.kind === 'chainKong' ? action.secondKongTile : action.resource.tile;
  }
  const action = input.claim.action;
  if (action.kind === 'doublePongForcedRun') return action.input.selectedResource.tile;
  if (action.kind === 'addedKongChain') return action.input.chainPongMeld.tiles[0];
  return null;
}

function roundExecutionPlayer(state: GameState, owner: number): { hand: Tile[]; melds: Meld[] } {
  const value = state.players?.[owner];
  if (!value) throw new Error('stage8-v2-round-execution-player-missing');
  return {
    hand: value.hand.slice(),
    melds: (value.melds || state.melds[owner] || []).map((meld) => ({ ...meld, tiles: meld.tiles.slice() as Meld['tiles'] })),
  };
}

function roundExecutionResult(
  input: Stage8V2KongExecutionInput,
  values: Omit<Stage8V2KongExecutionResult, 'actionSpaceVersion' | 'actionType' | 'owner' | 'publicLog'>,
): Stage8V2KongExecutionResult {
  const actionType = input.selectedAction.actionType;
  const owner = roundExecutionOwner(input);
  return {
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    actionType,
    owner,
    ...values,
    publicLog: {
      actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
      actionType,
      owner,
      outcome: values.outcome,
      mustDiscard: values.mustDiscard,
      robKongWinner: values.robKongWinner,
      wallConsumed: values.wallConsumed,
      payments: values.settlement?.payments || null,
      handTypes: values.handTypes,
      decompositionSignature: values.decompositionSignature,
    },
  };
}

export function executeStage8V2RoundKongAction(input: Stage8V2KongExecutionInput): Stage8V2KongExecutionResult {
  assertStage8V2Protocol(input as unknown as Record<string, unknown>);
  const owner = roundExecutionOwner(input);
  if (input.selectedAction.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION
    || input.selectedAction.actionType !== roundExecutionActionType(input)
    || input.selectedAction.context.actor !== owner) {
    throw new Error('stage8-v2-round-selected-action-mismatch');
  }
  const current = roundExecutionPlayer(input.state, owner);
  if (input.claim.family === 'decline') {
    return roundExecutionResult(input, {
      outcome: 'kongDeclined',
      mustDiscard: true,
      robKongWindow: false,
      robKongWinner: null,
      wallConsumed: 0,
      nextHand: current.hand,
      nextMelds: current.melds,
      settlement: null,
      handTypes: [],
      decompositionSignature: null,
    });
  }

  const robTile = roundExecutionRobTile(input);
  if (input.selectedAction.context.robKongWindow && robTile) {
    const robKongWinner = resolveRobKongWinner(input.state, owner, robTile);
    if (robKongWinner != null) {
      return roundExecutionResult(input, {
        outcome: 'kongRobbed',
        mustDiscard: false,
        robKongWindow: true,
        robKongWinner,
        wallConsumed: 0,
        nextHand: current.hand,
        nextMelds: current.melds,
        settlement: null,
        handTypes: [],
        decompositionSignature: null,
      });
    }
  }

  const drawTile = input.state.wallTiles[input.state.wallTiles.length - 1];
  if (!drawTile) throw new Error('stage8-v2-round-supplement-unavailable');
  if (input.claim.family === 'kongResource') {
    const action = { ...input.claim.action, drawTile } as KongDrawResolutionInput;
    const resolution = resolveKongDraw(action);
    const settlement = resolution.mustDiscard
      ? null
      : scoreKongSettlement({
        action,
        winner: owner,
        pointKongPlayer: input.claim.pointKongPlayer,
        scores: input.state.scores,
      });
    const classification = resolution.evaluation.classification;
    return roundExecutionResult(input, {
      outcome: resolution.outcome,
      mustDiscard: resolution.mustDiscard,
      robKongWindow: input.selectedAction.context.robKongWindow,
      robKongWinner: null,
      wallConsumed: 1,
      nextHand: action.handAfterKong.concat(drawTile),
      nextMelds: action.melds.map((meld) => ({ ...meld, tiles: meld.tiles.slice() as Meld['tiles'] })),
      resourceAfterKong: resolution.resourceAfterKong,
      settlement,
      handTypes: classification?.handTypes.slice() || [],
      decompositionSignature: classification?.decompositionSignature || resolution.evaluation.decomposition?.signature || null,
    });
  }

  const action = {
    kind: input.claim.action.kind,
    input: { ...input.claim.action.input, drawTile },
  } as SpecialKongAction;
  const resolution = resolveSpecialKongAction(action);
  const settlement = resolution.mustDiscard
    ? null
    : scoreSpecialKongSettlement({ action, winner: owner, scores: input.state.scores });
  const classification = resolution.evaluation.classification;
  const nextHand = action.kind === 'addedKongChain'
    ? action.input.handAfterChainKong.concat(drawTile)
    : action.input.handAfterKong.concat(drawTile);
  return roundExecutionResult(input, {
    outcome: resolution.outcome,
    mustDiscard: resolution.mustDiscard,
    robKongWindow: resolution.robKongWindow,
    robKongWinner: null,
    wallConsumed: 1,
    nextHand,
    nextMelds: action.input.melds.map((meld) => ({ ...meld, tiles: meld.tiles.slice() as Meld['tiles'] })),
    resourceAfterKong: resolution.resourceAfterKong,
    settlement,
    handTypes: classification?.handTypes.slice() || [],
    decompositionSignature: classification?.decompositionSignature || resolution.evaluation.decomposition?.signature || null,
  });
}
