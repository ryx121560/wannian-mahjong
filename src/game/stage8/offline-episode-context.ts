import type { GameState, Meld, RoundPublicEvent, Tile } from '../rules';
import {
  enumeratePostPongCandidateConcealedKongs,
  prepareAddedKongChainWindow,
  transitionCandidateConcealedKongResource,
  type AddedKongChainWindowInput,
  type CandidateConcealedKongResource,
} from '../rules/special-kong';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import { hashStage8OfflineIdentity } from './offline-action-identity';

export const STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION = 'stage8-offline-episode-context-v2';

export interface Stage8OfflinePendingKongDecline {
  actor: number;
  declarationWindow: 'self-draw-discard' | 'post-pong-discard' | 'chain-kong';
  preStateSha256: string;
  legalActionSetSha256: string;
}

export interface Stage8OfflineEpisodeContext {
  version: typeof STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION;
  candidateKongResources: CandidateConcealedKongResource[];
  addedKongChainWindows: AddedKongChainWindowInput[];
  pendingKongDecline: Stage8OfflinePendingKongDecline | null;
  identitySha256: string;
}

function cloneMeld(meld: Meld): Meld { return { ...meld, tiles: meld.tiles.slice() as Meld['tiles'] }; }
function cloneCandidate(resource: CandidateConcealedKongResource): CandidateConcealedKongResource { return { ...resource, pongMeld: cloneMeld(resource.pongMeld) }; }
function cloneWindow(window: AddedKongChainWindowInput): AddedKongChainWindowInput {
  return {
    ...window,
    initialResource: { ...window.initialResource, pongMeld: cloneMeld(window.initialResource.pongMeld) },
    chainPongMeld: cloneMeld(window.chainPongMeld),
    preKongHand: window.preKongHand.slice(), initialHandAfterKong: window.initialHandAfterKong.slice(),
    initialMelds: window.initialMelds.map(cloneMeld),
  };
}
function withoutIdentity(context: Omit<Stage8OfflineEpisodeContext, 'identitySha256'>): unknown {
  return { version: context.version, candidateKongResources: context.candidateKongResources, addedKongChainWindows: context.addedKongChainWindows, pendingKongDecline: context.pendingKongDecline };
}
function seal(context: Omit<Stage8OfflineEpisodeContext, 'identitySha256'>): Stage8OfflineEpisodeContext {
  return { ...context, identitySha256: hashStage8OfflineIdentity(withoutIdentity(context)) };
}
function removeOne(hand: Tile[], tile: Tile): Tile[] | null { const next = hand.slice(); const index = next.indexOf(tile); if (index < 0) return null; next.splice(index, 1); return next; }
function meldsOf(state: GameState, actor: number): Meld[] { return (state.players?.[actor]?.melds || state.melds[actor] || []).map(cloneMeld); }
function sameCandidate(left: CandidateConcealedKongResource, right: CandidateConcealedKongResource): boolean {
  return left.owner === right.owner && left.candidateKongTile === right.candidateKongTile && left.pongMeld.tiles[0] === right.pongMeld.tiles[0];
}
function sameWindow(left: AddedKongChainWindowInput, right: AddedKongChainWindowInput): boolean {
  return left.owner === right.owner && left.initialResource.tile === right.initialResource.tile && left.chainPongMeld.tiles[0] === right.chainPongMeld.tiles[0];
}

export function createStage8OfflineEpisodeContext(input?: {
  candidateKongResources?: CandidateConcealedKongResource[];
  addedKongChainWindows?: AddedKongChainWindowInput[];
}): Stage8OfflineEpisodeContext {
  return seal({
    version: STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION,
    candidateKongResources: (input?.candidateKongResources || []).map(cloneCandidate),
    addedKongChainWindows: (input?.addedKongChainWindows || []).map(cloneWindow),
    pendingKongDecline: null,
  });
}

export function validateStage8OfflineEpisodeContext(context: Stage8OfflineEpisodeContext): boolean {
  const marker = context.pendingKongDecline;
  return context.version === STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION
    && context.identitySha256 === hashStage8OfflineIdentity(withoutIdentity(context))
    && context.candidateKongResources.every((resource) => resource.owner >= 0 && resource.owner < 4)
    && context.addedKongChainWindows.every((window) => prepareAddedKongChainWindow(window).canDeclare)
    && (marker === null || (
      Number.isInteger(marker.actor) && marker.actor >= 0 && marker.actor < 4
      && ['self-draw-discard', 'post-pong-discard', 'chain-kong'].includes(marker.declarationWindow)
      && /^[a-f0-9]{64}$/.test(marker.preStateSha256)
      && /^[a-f0-9]{64}$/.test(marker.legalActionSetSha256)
    ));
}

/** Advances only auxiliary declarations after a successful true-source transition. */
export function advanceStage8OfflineEpisodeContext(input: {
  context: Stage8OfflineEpisodeContext;
  before: GameState;
  action: CanonicalStage8V2Action | null;
  after: GameState;
  event: RoundPublicEvent;
  canonicalLegalActionSetSha256?: string;
}): Stage8OfflineEpisodeContext {
  if (!validateStage8OfflineEpisodeContext(input.context)) throw new Error('stage8-offline-episode-context-invalid');
  let candidates = input.context.candidateKongResources.map(cloneCandidate);
  let windows = input.context.addedKongChainWindows.map(cloneWindow);
  let pendingKongDecline = input.context.pendingKongDecline ? { ...input.context.pendingKongDecline } : null;
  const ended = input.after.phase === 'ended' || input.event.type === 'wallExhausted';
  if (ended) {
    candidates = candidates.map((resource) => transitionCandidateConcealedKongResource(resource, { type: 'roundEnd' }));
    windows = [];
    pendingKongDecline = null;
  } else if (input.action?.actionType === 'declineKong') {
    if (pendingKongDecline) throw new Error('stage8-offline-kong-decline-already-pending');
    if (input.before.phase !== 'discarding' || input.before.currentPlayer !== input.action.context.actor
      || input.action.context.declarationWindow === 'discard-response'
      || input.event.type !== 'specialKong' || input.event.outcome !== 'kongDeclined'
      || input.event.actor !== input.action.context.actor || input.event.committed !== false
      || hashStage8OfflineIdentity(input.before) !== hashStage8OfflineIdentity(input.after)
      || !input.canonicalLegalActionSetSha256 || !/^[a-f0-9]{64}$/.test(input.canonicalLegalActionSetSha256)) {
      throw new Error('stage8-offline-kong-decline-transition-invalid');
    }
    pendingKongDecline = {
      actor: input.action.context.actor,
      declarationWindow: input.action.context.declarationWindow,
      preStateSha256: hashStage8OfflineIdentity(input.before),
      legalActionSetSha256: input.canonicalLegalActionSetSha256,
    };
  } else if (pendingKongDecline) {
    if (input.action?.actionType !== 'discard' || input.action.context.actor !== pendingKongDecline.actor
      || input.event.type !== 'discard' || input.event.actor !== pendingKongDecline.actor
      || hashStage8OfflineIdentity(input.before) !== pendingKongDecline.preStateSha256) {
      throw new Error('stage8-offline-kong-decline-followup-invalid');
    }
    pendingKongDecline = null;
    candidates = candidates.map((resource) => transitionCandidateConcealedKongResource(resource, { type: 'discard', player: input.event.actor!, tile: input.event.tile! }));
    windows = windows.filter((window) => window.owner !== input.event.actor);
  } else if (input.event.type === 'pong' && input.event.actor != null && input.event.tile) {
    const actor = input.event.actor;
    const pongMeld = meldsOf(input.after, actor).find((meld) => meld.type === 'peng' && meld.tiles.every((tile) => tile === input.event.tile));
    const hand = input.after.players?.[actor]?.hand;
    if (pongMeld && hand) {
      for (const resource of enumeratePostPongCandidateConcealedKongs({ owner: actor, pongMeld, hand })) {
        if (!candidates.some((existing) => sameCandidate(existing, resource))) candidates.push(resource);
      }
    }
  } else if (input.event.type === 'discard' && input.event.actor != null && input.event.tile) {
    candidates = candidates.map((resource) => transitionCandidateConcealedKongResource(resource, { type: 'discard', player: input.event.actor!, tile: input.event.tile! }));
    windows = windows.filter((window) => window.owner !== input.event.actor);
  }

  if (!ended && input.event.type === 'specialKong' && input.event.committed && input.event.canonicalAction) {
    if (input.event.canonicalAction.actionType === 'postPongCandidateConcealedKong') {
      candidates = candidates.map((resource) => transitionCandidateConcealedKongResource(resource, { type: 'declareCandidateKong', player: input.event.actor!, tile: input.event.tile! }));
    }
    if (input.event.canonicalAction.actionType === 'chainKong') {
      windows = windows.filter((window) => !(window.owner === input.event.actor && window.chainPongMeld.tiles[0] === input.event.tile));
    }
  }

  if (!ended && input.event.type === 'addedKong' && input.event.outcome !== 'addedKongRobWindow' && input.event.actor != null && input.event.tile && input.after.phase === 'discarding' && input.after.newDrawnTile) {
    const actor = input.event.actor; const beforePlayer = input.before.players?.[actor];
    const initialResource = input.before.kongResources?.find((resource) => resource.owner === actor && resource.tile === input.event.tile && resource.status === 'active');
    const initialHandAfterKong = beforePlayer ? removeOne(beforePlayer.hand, input.event.tile) : null;
    const chainPongMeld = meldsOf(input.after, actor).find((meld) => meld.type === 'peng' && meld.tiles.every((tile) => tile === input.after.newDrawnTile));
    if (beforePlayer && initialResource && initialHandAfterKong && chainPongMeld) {
      const window: AddedKongChainWindowInput = {
        owner: actor,
        initialResource: { ...initialResource, pongMeld: cloneMeld(initialResource.pongMeld) },
        chainPongMeld: cloneMeld(chainPongMeld), preKongHand: beforePlayer.hand.slice(),
        initialHandAfterKong, initialMelds: meldsOf(input.after, actor), firstDrawTile: input.after.newDrawnTile,
      };
      if (prepareAddedKongChainWindow(window).canDeclare && !windows.some((existing) => sameWindow(existing, window))) windows.push(window);
    }
  }
  return seal({ version: STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION, candidateKongResources: candidates, addedKongChainWindows: windows, pendingKongDecline });
}
