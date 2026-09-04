import { transitionRound } from '../rules/round-transition';
import type { GameState, RoundTransitionAction, RoundTransitionResult, SpecialKongActionIdentity, Tile } from '../rules';
import { deriveStage8V2RoundEngineActions } from './round-engine-v2';
import { STAGE8_ACTION_SPACE_V2_VERSION } from './action-registry-v2';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import type { AddedKongChainWindowInput, CandidateConcealedKongResource } from '../rules/special-kong';
import type { SpecialKongDeclarationAction } from '../rules/special-kong';
import type { Meld } from '../rules';
import { hashStage8CanonicalActionSet, hashStage8OfflineIdentity } from './offline-action-identity';
import { validateStage8OfflineEpisodeContext, type Stage8OfflineEpisodeContext } from './offline-episode-context';

export interface Stage8OfflineVisibleState {
  actor: number;
  ownHand: Tile[];
  publicMelds: GameState['melds'];
  publicDiscards: GameState['discards'];
  scores: number[];
  dealer: number;
  turn: number;
  phase: GameState['phase'];
  currentPlayer: number;
  lastDiscard?: Tile;
  lastDiscardPlayer?: number;
  wallRemainingCount: number;
}

/** Builds the only policy input. Opponent hands and wall order are deliberately excluded. */
export function projectStage8OfflineVisibleState(state: GameState, actor: number): Stage8OfflineVisibleState {
  const player = state.players?.[actor];
  if (!player) throw new Error('stage8-offline-visible-player-missing');
  return {
    actor, ownHand: player.hand.slice(), publicMelds: state.melds.map((melds) => melds.map((meld) => ({ ...meld, tiles: meld.tiles.slice() as typeof meld.tiles }))), publicDiscards: state.discards.map((discards) => discards.slice()), scores: state.scores.slice(), dealer: state.dealer, turn: state.turn, phase: state.phase, currentPlayer: state.currentPlayer, lastDiscard: state.lastDiscard, lastDiscardPlayer: state.lastDiscardPlayer, wallRemainingCount: state.wallTiles.length,
  };
}

/** Offline adapter delegates every state mutation to the rules true source. */
export function executeStage8OfflineRoundAction(state: GameState, action: RoundTransitionAction): RoundTransitionResult {
  return transitionRound(state, action);
}

/** The offline action surface is derived from the same v2 registry as Stage8, never from page code. */
export function deriveStage8OfflineActions(input: {
  state: GameState;
  actor: number;
  candidateKongResources?: CandidateConcealedKongResource[];
  addedKongChainWindows?: AddedKongChainWindowInput[];
  episodeContext?: Stage8OfflineEpisodeContext;
}): CanonicalStage8V2Action[] {
  const actions = deriveStage8V2RoundEngineActions({
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    state: input.state,
    playerId: input.actor,
    candidateKongResources: input.candidateKongResources,
    addedKongChainWindows: input.addedKongChainWindows,
  });
  const marker = input.episodeContext?.pendingKongDecline;
  if (!marker) return actions;
  if (!validateStage8OfflineEpisodeContext(input.episodeContext!)
    || input.state.phase !== 'discarding'
    || input.state.currentPlayer !== input.actor
    || marker.actor !== input.actor
    || hashStage8OfflineIdentity(input.state) !== marker.preStateSha256
    || hashStage8CanonicalActionSet(actions) !== marker.legalActionSetSha256
    || !actions.some((action) => action.actionType === 'declineKong'
      && action.context.actor === marker.actor
      && action.context.declarationWindow === marker.declarationWindow)) {
    return [];
  }
  return actions.filter((action) => action.actionType === 'discard');
}

function removeTiles(hand: Tile[], tile: Tile, count: number): Tile[] | null { const next = hand.slice(); for (let index = 0; index < count; index += 1) { const found = next.indexOf(tile); if (found < 0) return null; next.splice(found, 1); } return next; }
function replacePeng(melds: Meld[], tile: Tile): Meld[] | null { const index = melds.findIndex((meld) => meld.type === 'peng' && meld.tiles.length === 3 && meld.tiles.every((value) => value === tile)); if (index < 0) return null; return melds.map((meld, current) => current === index ? { type: 'mingGang', tiles: [tile, tile, tile, tile], fromPlayer: meld.fromPlayer } : { ...meld, tiles: meld.tiles.slice() as Meld['tiles'] }); }

/** Converts a canonical v2 special-kong action into the exact declaration consumed by rules. */
export function prepareStage8OfflineSpecialKongDeclaration(input: {
  state: GameState; action: CanonicalStage8V2Action; candidateKongResources?: CandidateConcealedKongResource[]; addedKongChainWindows?: AddedKongChainWindowInput[];
}): SpecialKongDeclarationAction | null {
  const actor = input.action.context.actor; const player = input.state.players?.[actor]; const tile = input.action.tile || (input.action.actionType === 'doublePongForcedRun' ? input.action.context.resourceSignature?.split('|')[0]?.split(':')[1] as Tile | undefined : undefined);
  if (!player || !tile) return null; const melds = (player.melds || input.state.melds[actor] || []).map((meld) => ({ ...meld, tiles: meld.tiles.slice() as Meld['tiles'] }));
  if (input.action.actionType === 'forcedRunConcealed') { const handAfterKong = removeTiles(player.hand, tile, 4); if (!handAfterKong) return null; return { kind: 'forcedRunConcealed', input: { owner: actor, kongTile: tile, preKongHand: player.hand.slice(), handAfterKong, melds: melds.concat([{ type: 'anGang', tiles: [tile, tile, tile, tile] }]) } }; }
  if (input.action.actionType === 'postPongCandidateConcealedKong') { const resource = input.candidateKongResources?.find((item) => item.owner === actor && item.candidateKongTile === tile && item.status === 'active'); const handAfterKong = removeTiles(player.hand, tile, 4); if (!resource || !handAfterKong) return null; return { kind: 'postPongCandidateConcealedKong', input: { owner: actor, resource, preKongHand: player.hand.slice(), handAfterKong, melds: melds.concat([{ type: 'anGang', tiles: [tile, tile, tile, tile] }]) } }; }
  if (input.action.actionType === 'doublePongForcedRun') { const signature = input.action.context.resourceSignature; const [selectedTile, conditionalTile] = signature ? signature.split('|').map((part) => part.split(':')[1] as Tile) : []; const selectedResource = input.state.kongResources?.find((item) => item.owner === actor && item.tile === selectedTile && item.status === 'active'); const conditionalResource = input.state.kongResources?.find((item) => item.owner === actor && item.tile === conditionalTile && item.status === 'active'); const handAfterKong = selectedTile ? removeTiles(player.hand, selectedTile, 1) : null; const nextMelds = selectedTile ? replacePeng(melds, selectedTile) : null; if (!selectedResource || !conditionalResource || !handAfterKong || !nextMelds) return null; return { kind: 'doublePongForcedRun', input: { owner: actor, selectedResource, conditionalResource, preKongHand: player.hand.slice(), handAfterKong, melds: nextMelds } }; }
  if (input.action.actionType === 'chainKong') { const window = input.addedKongChainWindows?.find((item) => item.owner === actor && item.chainPongMeld.tiles[0] === tile); const handAfterChainKong = removeTiles(player.hand, tile, 1); const nextMelds = replacePeng(melds, tile); if (!window || !handAfterChainKong || !nextMelds) return null; return { kind: 'addedKongChain', input: { ...window, handBeforeChainKong: player.hand.slice(), handAfterChainKong, melds: nextMelds } }; }
  return null;
}

function sameCanonicalAction(left: CanonicalStage8V2Action, right: CanonicalStage8V2Action): boolean {
  return left.actionSpaceVersion === right.actionSpaceVersion
    && left.actionType === right.actionType
    && left.actionId === right.actionId
    && left.tile === right.tile
    && left.context.actor === right.context.actor
    && left.context.declarationWindow === right.context.declarationWindow
    && left.context.ownTileCount === right.context.ownTileCount
    && left.context.robKongWindow === right.context.robKongWindow
    && left.context.resourceSignature === right.context.resourceSignature;
}

function specialIdentity(action: CanonicalStage8V2Action): SpecialKongActionIdentity | null {
  const tile = action.tile || (action.actionType === 'doublePongForcedRun' ? action.context.resourceSignature?.split('|')[0]?.split(':')[1] as Tile | undefined : undefined);
  if (!tile) return null;
  if (action.actionType === 'forcedRunConcealed') return { actionType: 'forcedRunConcealed', actionId: action.actionId, tile, resourceSignature: action.context.resourceSignature || '' };
  if (action.actionType === 'postPongCandidateConcealedKong') return { actionType: 'postPongCandidateConcealedKong', actionId: action.actionId, tile, resourceSignature: action.context.resourceSignature || '' };
  if (action.actionType === 'doublePongForcedRun') return { actionType: 'doublePongForcedRun', actionId: action.actionId, tile, resourceSignature: action.context.resourceSignature || '' };
  if (action.actionType === 'chainKong') return { actionType: 'chainKong', actionId: action.actionId, tile, resourceSignature: action.context.resourceSignature || '' };
  return null;
}

/** Converts only an exact current canonical action into a rules transition. */
export function executeStage8OfflineCanonicalAction(input: {
  state: GameState;
  action: CanonicalStage8V2Action;
  candidateKongResources?: CandidateConcealedKongResource[];
  addedKongChainWindows?: AddedKongChainWindowInput[];
  episodeContext?: Stage8OfflineEpisodeContext;
}): RoundTransitionResult {
  const legal = deriveStage8OfflineActions({ state: input.state, actor: input.action.context.actor, candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows, episodeContext: input.episodeContext });
  if (!legal.some((candidate) => sameCanonicalAction(candidate, input.action))) {
    return { ok: false, state: input.state, reason: 'stage8-offline-canonical-action-illegal' };
  }
  const actor = input.action.context.actor;
  let transition: RoundTransitionAction | null = null;
  if (input.action.actionType === 'pass') transition = { type: 'pass', actor };
  else if (input.action.actionType === 'discard' && input.action.tile) transition = { type: 'discard', actor, tile: input.action.tile };
  else if (input.action.actionType === 'pong') transition = { type: 'pong', actor };
  else if (input.action.actionType === 'win') transition = input.state.phase === 'discarding'
    ? { type: 'selfWin', actor }
    : input.state.pendingKong?.kind === 'specialKong' || input.state.pendingKong?.kind === 'addedKong'
      ? { type: 'robKongWin', actor }
      : { type: 'discardWin', actor };
  else if (input.action.actionType === 'normalConcealedKong' && input.action.tile) transition = { type: 'concealedKong', actor, tile: input.action.tile };
  else if (input.action.actionType === 'addedKong' && input.action.tile) transition = { type: 'addedKong', actor, tile: input.action.tile };
  else if (input.action.actionType === 'directChisel') transition = { type: 'directChisel', actor };
  else if (input.action.actionType === 'forcedRunImmediate') transition = { type: 'forcedRunImmediate', actor };
  else if (input.action.actionType === 'forcedRunDeferred' && input.action.tile) transition = { type: 'forcedRunDeferred', actor, tile: input.action.tile };
  else if (input.action.actionType === 'declineKong'
    && input.state.phase === 'discarding'
    && input.state.currentPlayer === actor
    && input.action.context.declarationWindow !== 'discard-response') {
    return { ok: true, state: input.state, event: { type: 'specialKong', actor, outcome: 'kongDeclined', committed: false }, settlement: null };
  }
  else {
    const declaration = prepareStage8OfflineSpecialKongDeclaration(input);
    const identity = specialIdentity(input.action);
    if (declaration && identity) transition = { type: 'specialKong', actor, declaration, canonicalAction: identity };
  }
  if (!transition) return { ok: false, state: input.state, reason: 'stage8-offline-canonical-action-unmapped' };
  return executeStage8OfflineRoundAction(input.state, transition);
}
