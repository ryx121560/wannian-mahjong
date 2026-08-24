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

export const STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION = 'stage8-offline-episode-context-v1';

export interface Stage8OfflineEpisodeContext {
  version: typeof STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION;
  candidateKongResources: CandidateConcealedKongResource[];
  addedKongChainWindows: AddedKongChainWindowInput[];
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
  return { version: context.version, candidateKongResources: context.candidateKongResources, addedKongChainWindows: context.addedKongChainWindows };
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
  });
}

export function validateStage8OfflineEpisodeContext(context: Stage8OfflineEpisodeContext): boolean {
  return context.version === STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION
    && context.identitySha256 === hashStage8OfflineIdentity(withoutIdentity(context))
    && context.candidateKongResources.every((resource) => resource.owner >= 0 && resource.owner < 4)
    && context.addedKongChainWindows.every((window) => prepareAddedKongChainWindow(window).canDeclare);
}

/** Advances only auxiliary declarations after a successful true-source transition. */
export function advanceStage8OfflineEpisodeContext(input: {
  context: Stage8OfflineEpisodeContext;
  before: GameState;
  action: CanonicalStage8V2Action | null;
  after: GameState;
  event: RoundPublicEvent;
}): Stage8OfflineEpisodeContext {
  if (!validateStage8OfflineEpisodeContext(input.context)) throw new Error('stage8-offline-episode-context-invalid');
  let candidates = input.context.candidateKongResources.map(cloneCandidate);
  let windows = input.context.addedKongChainWindows.map(cloneWindow);
  const ended = input.after.phase === 'ended' || input.event.type === 'wallExhausted';
  if (ended) {
    candidates = candidates.map((resource) => transitionCandidateConcealedKongResource(resource, { type: 'roundEnd' }));
    windows = [];
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
  return seal({ version: STAGE8_OFFLINE_EPISODE_CONTEXT_VERSION, candidateKongResources: candidates, addedKongChainWindows: windows });
}
