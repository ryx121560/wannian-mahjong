import { resolveAddedKongDraw } from './added-kong';
import { resolveConcealedKongDraw } from './concealed-kong';
import { canWin } from './hand-evaluator';
import { canPeng } from './meld-validator';
import { canUseDeferredForcedRun, classifyDiscardKongClaim, createKongResource, resolveKongDraw } from './kong-resource';
import { getLegalActions } from './index';
import { scoreConcealedKongSettlement, scoreKongSettlement, scoreSettlement, scoreSpecialKongSettlement } from './score-calculator';
import type { ConcealedKongSettlementResult, SpecialKongSettlementResult } from './score-calculator';
import { canDeclareSpecialKongAction, resolveSpecialKongAction } from './special-kong';
import type { SpecialKongDeclarationAction } from './special-kong';
import type { DrawSettlementResult, GameState, KongSettlementResult, Meld, SettlementResult, SpecialKongActionIdentity, Tile } from './types';
import { ALL_TILE_KEYS } from './tile-utils';

export type RoundTransitionAction =
  | { type: 'draw'; actor: number }
  | { type: 'discard'; actor: number; tile: Tile }
  | { type: 'pass'; actor: number }
  | { type: 'pong'; actor: number }
  | { type: 'selfWin'; actor: number }
  | { type: 'discardWin'; actor: number }
  | { type: 'robKongWin'; actor: number }
  | { type: 'concealedKong'; actor: number; tile: Tile }
  | { type: 'addedKong'; actor: number; tile: Tile }
  | { type: 'directChisel'; actor: number }
  | { type: 'forcedRunImmediate'; actor: number }
  | { type: 'forcedRunDeferred'; actor: number; tile: Tile }
  | { type: 'specialKong'; actor: number; declaration: SpecialKongDeclarationAction; canonicalAction?: SpecialKongActionIdentity; skipRobWindow?: true };

export interface RoundPublicEvent {
  type: RoundTransitionAction['type'] | 'wallExhausted';
  actor: number | null;
  tile?: Tile;
  outcome?: string;
  canonicalAction?: SpecialKongActionIdentity;
  committed?: boolean;
}

export type RoundSettlement = SettlementResult | KongSettlementResult | ConcealedKongSettlementResult | SpecialKongSettlementResult | DrawSettlementResult;
export type RoundTransitionResult =
  | { ok: true; state: GameState; event: RoundPublicEvent; settlement: RoundSettlement | null }
  | { ok: false; state: GameState; reason: string };

function cloneMeld(meld: Meld): Meld { return { ...meld, tiles: meld.tiles.slice() as Meld['tiles'] }; }
function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players?.map((player) => ({ ...player, hand: player.hand.slice(), melds: (player.melds || []).map(cloneMeld) })),
    melds: state.melds.map((melds) => melds.map(cloneMeld)),
    discards: state.discards.map((discards) => discards.slice()),
    scores: state.scores.slice(), wallTiles: state.wallTiles.slice(), passRecords: state.passRecords.slice(), kongResources: state.kongResources?.map((resource) => ({ ...resource, pongMeld: cloneMeld(resource.pongMeld) })), responseQueue: state.responseQueue?.slice(), pendingKong: state.pendingKong ? JSON.parse(JSON.stringify(state.pendingKong)) : undefined,
  };
}
function failed(state: GameState, reason: string): RoundTransitionResult { return { ok: false, state, reason }; }
function player(state: GameState, actor: number) {
  const value = state.players?.[actor];
  if (!value || !Array.isArray(value.hand)) throw new Error('round-transition-player-invalid');
  return value;
}
function meldsOf(state: GameState, actor: number): Meld[] { return (player(state, actor).melds || state.melds[actor] || []).map(cloneMeld); }
function setMelds(state: GameState, actor: number, melds: Meld[]): void { player(state, actor).melds = melds.map(cloneMeld); state.melds[actor] = melds.map(cloneMeld); }
function remove(hand: Tile[], tile: Tile, count: number): Tile[] | null {
  const next = hand.slice();
  for (let index = 0; index < count; index += 1) { const found = next.indexOf(tile); if (found < 0) return null; next.splice(found, 1); }
  return next;
}
function normalEnd(state: GameState, actor: number, settlement: RoundSettlement, event: RoundPublicEvent): RoundTransitionResult {
  const next = cloneState(state); next.scores = settlement.after.slice();
  next.players?.forEach((entry, index) => { entry.score = settlement.after[index]; });
  next.phase = 'ended'; next.currentPlayer = actor; next.newDrawnTile = undefined;
  return { ok: true, state: next, event, settlement };
}
function ensureFourPlayers(state: GameState): string | null {
  if (!state.players || state.players.length !== 4 || state.melds.length !== 4 || state.discards.length !== 4 || state.scores.length !== 4) return 'round-transition-four-player-state-required';
  if (state.scores.some((score) => !Number.isFinite(score))) return 'round-transition-score-invalid';
  return null;
}
function responseQueue(state: GameState): number[] | null {
  if (state.phase !== 'responding' || state.lastDiscardPlayer == null) return null;
  if (!state.responseQueue) state.responseQueue = [1, 2, 3].map((offset) => (state.lastDiscardPlayer! + offset) % 4);
  return state.responseQueue;
}
function requireResponseTurn(state: GameState, actor: number): string | null {
  const queue = responseQueue(state);
  if (!queue || queue[0] !== actor) return 'round-transition-response-turn-invalid';
  return null;
}
function closeResponseWindow(state: GameState): void {
  state.responseQueue = undefined; state.lastDiscard = undefined; state.lastDiscardPlayer = undefined;
}
function replacePengWithGang(melds: Meld[], tile: Tile, owner: number): Meld[] | null {
  const index = melds.findIndex((meld) => meld.type === 'peng' && meld.tiles.length === 3 && meld.tiles.every((item) => item === tile));
  if (index < 0) return null;
  const next = melds.map(cloneMeld);
  next[index] = { type: 'mingGang', tiles: [tile, tile, tile, tile], fromPlayer: next[index].fromPlayer ?? owner };
  return next;
}
function sameTiles(left: Tile[], right: Tile[]): boolean {
  return left.length === right.length && left.slice().sort().every((tile, index) => tile === right.slice().sort()[index]);
}
function specialOwner(declaration: SpecialKongDeclarationAction): number { return declaration.input.owner; }
function specialHandAfter(declaration: SpecialKongDeclarationAction): Tile[] {
  return declaration.kind === 'addedKongChain' ? declaration.input.handAfterChainKong : declaration.input.handAfterKong;
}
function specialRobTile(declaration: SpecialKongDeclarationAction): Tile | null {
  if (declaration.kind === 'doublePongForcedRun') return declaration.input.selectedResource.tile;
  if (declaration.kind === 'addedKongChain') return declaration.input.chainPongMeld.tiles[0];
  return null;
}
function specialIdentity(declaration: SpecialKongDeclarationAction): SpecialKongActionIdentity {
  const index = (tile: Tile): number => ALL_TILE_KEYS.indexOf(tile);
  if (declaration.kind === 'forcedRunConcealed') return { actionType: 'forcedRunConcealed', actionId: 1100 + index(declaration.input.kongTile), tile: declaration.input.kongTile, resourceSignature: '' };
  if (declaration.kind === 'postPongCandidateConcealedKong') return { actionType: 'postPongCandidateConcealedKong', actionId: 1200 + index(declaration.input.resource.candidateKongTile), tile: declaration.input.resource.candidateKongTile, resourceSignature: `${declaration.input.resource.owner}:${declaration.input.resource.pongMeld.tiles[0]}:${declaration.input.resource.candidateKongTile}` };
  if (declaration.kind === 'doublePongForcedRun') return { actionType: 'doublePongForcedRun', actionId: 1300 + index(declaration.input.selectedResource.tile) * ALL_TILE_KEYS.length + index(declaration.input.conditionalResource.tile), tile: declaration.input.selectedResource.tile, resourceSignature: `${declaration.input.selectedResource.owner}:${declaration.input.selectedResource.tile}|${declaration.input.conditionalResource.owner}:${declaration.input.conditionalResource.tile}` };
  return { actionType: 'chainKong', actionId: 900 + index(declaration.input.chainPongMeld.tiles[0]), tile: declaration.input.chainPongMeld.tiles[0], resourceSignature: `${declaration.input.initialResource.owner}:${declaration.input.initialResource.tile}>${declaration.input.chainPongMeld.tiles[0]}` };
}
function sameSpecialIdentity(left: SpecialKongActionIdentity, right: SpecialKongActionIdentity): boolean {
  return left.actionType === right.actionType && left.actionId === right.actionId && left.tile === right.tile && left.resourceSignature === right.resourceSignature;
}
function stateIdentity(state: GameState): string {
  const source = JSON.stringify({ phase: state.phase, currentPlayer: state.currentPlayer, players: state.players?.map((entry) => ({ hand: entry.hand, melds: entry.melds })), melds: state.melds, discards: state.discards, scores: state.scores, wallTiles: state.wallTiles, kongResources: state.kongResources, lastDiscard: state.lastDiscard, lastDiscardPlayer: state.lastDiscardPlayer });
  let value = 2166136261;
  for (let index = 0; index < source.length; index += 1) value = Math.imul(value ^ source.charCodeAt(index), 16777619);
  return `fnv1a-${(value >>> 0).toString(16).padStart(8, '0')}`;
}

/** Pure rules transition. Invalid input returns the original state without mutation. */
export function transitionRound(state: GameState, action: RoundTransitionAction): RoundTransitionResult {
  const invalid = ensureFourPlayers(state); if (invalid) return failed(state, invalid);
  try {
    const next = cloneState(state); const current = player(next, action.actor);
    if (next.phase === 'ended') return failed(state, 'round-transition-already-ended');
    if (action.type === 'draw') {
      if (next.phase !== 'drawing' || next.currentPlayer !== action.actor) return failed(state, 'round-transition-draw-not-current');
      const tile = next.wallTiles.at(-1);
      if (!tile) {
        const settlement: DrawSettlementResult = { before: next.scores.slice(), after: next.scores.slice(), delta: [0, 0, 0, 0], reason: '墙尽流局' };
        return normalEnd(next, action.actor, settlement, { type: 'wallExhausted', actor: null });
      }
      next.wallTiles.pop(); current.hand.push(tile); next.phase = 'discarding'; next.newDrawnTile = tile;
      return { ok: true, state: next, event: { type: 'draw', actor: action.actor, tile }, settlement: null };
    }
    if (action.type === 'discard') {
      if (next.phase !== 'discarding' || next.currentPlayer !== action.actor || !getLegalActions(next, action.actor).includes('discard')) return failed(state, 'round-transition-discard-illegal');
      const hand = remove(current.hand, action.tile, 1); if (!hand) return failed(state, 'round-transition-discard-tile-missing');
      current.hand = hand; next.discards[action.actor].push(action.tile); next.lastDiscard = action.tile; next.lastDiscardPlayer = action.actor; next.phase = 'responding'; next.responseQueue = [1, 2, 3].map((offset) => (action.actor + offset) % 4); next.currentPlayer = next.responseQueue[0]; next.newDrawnTile = undefined;
      return { ok: true, state: next, event: { type: 'discard', actor: action.actor, tile: action.tile }, settlement: null };
    }
    if (action.type === 'pass') {
      if (next.phase !== 'responding' || !getLegalActions(next, action.actor).includes('pass') || next.lastDiscardPlayer == null || requireResponseTurn(next, action.actor)) return failed(state, 'round-transition-pass-illegal');
      next.passRecords.push({ player: action.actor, tile: next.lastDiscard as Tile, round: next.turn });
      next.responseQueue!.shift();
      if (next.responseQueue!.length) { next.currentPlayer = next.responseQueue![0]; return { ok: true, state: next, event: { type: 'pass', actor: action.actor }, settlement: null }; }
      const pendingKong = next.pendingKong;
      if (pendingKong) {
        next.currentPlayer = pendingKong.owner; next.phase = 'discarding'; closeResponseWindow(next);
        if (pendingKong.kind === 'addedKong') { next.pendingKong = undefined; return transitionRound(next, { type: 'addedKong', actor: pendingKong.owner, tile: pendingKong.tile }); }
        return transitionRound(next, { type: 'specialKong', actor: pendingKong.owner, declaration: pendingKong.declaration as SpecialKongDeclarationAction, canonicalAction: pendingKong.canonicalAction, skipRobWindow: true });
      }
      next.currentPlayer = (next.lastDiscardPlayer + 1) % 4; next.phase = 'drawing'; closeResponseWindow(next);
      return { ok: true, state: next, event: { type: 'pass', actor: action.actor }, settlement: null };
    }
    if (action.type === 'pong') {
      const tile = next.lastDiscard;
      if (next.phase !== 'responding' || !tile || next.lastDiscardPlayer == null || requireResponseTurn(next, action.actor) || !getLegalActions(next, action.actor).includes('pong') || !canPeng(current.hand, tile)) return failed(state, 'round-transition-pong-illegal');
      const hand = remove(current.hand, tile, 2); if (!hand || next.discards[next.lastDiscardPlayer].at(-1) !== tile) return failed(state, 'round-transition-pong-source-invalid');
      current.hand = hand; next.discards[next.lastDiscardPlayer].pop(); const pongMeld: Meld = { type: 'peng', tiles: [tile, tile, tile], fromPlayer: next.lastDiscardPlayer }; setMelds(next, action.actor, meldsOf(next, action.actor).concat([pongMeld]));
      if (current.hand.includes(tile)) next.kongResources = (next.kongResources || []).concat([createKongResource({ owner: action.actor, tile, pongMeld, source: 'pong' })]);
      next.currentPlayer = action.actor; next.phase = 'discarding'; closeResponseWindow(next); next.newDrawnTile = undefined;
      return { ok: true, state: next, event: { type: 'pong', actor: action.actor, tile }, settlement: null };
    }
    if (action.type === 'selfWin') {
      if (next.phase !== 'discarding' || next.currentPlayer !== action.actor || !canWin(current.hand, { melds: meldsOf(next, action.actor), winType: '自摸' }).canWin) return failed(state, 'round-transition-self-win-illegal');
      return normalEnd(state, action.actor, scoreSettlement({ winner: action.actor, winType: '自摸', hand: current.hand, scores: state.scores }), { type: 'selfWin', actor: action.actor });
    }
    if (action.type === 'discardWin') {
      const tile = next.lastDiscard;
      if (next.phase !== 'responding' || !tile || next.lastDiscardPlayer == null || requireResponseTurn(next, action.actor) || !getLegalActions(next, action.actor).includes('win') || !canWin(current.hand.concat(tile), { melds: meldsOf(next, action.actor), winTile: tile, winType: '点炮' }).canWin) return failed(state, 'round-transition-discard-win-illegal');
      return normalEnd(state, action.actor, scoreSettlement({ winner: action.actor, winType: '点炮', hand: current.hand.concat(tile), scores: state.scores, payer: next.lastDiscardPlayer }), { type: 'discardWin', actor: action.actor, tile });
    }
    if (action.type === 'robKongWin') {
      const pending = next.pendingKong; const tile = pending?.tile;
      if (!pending || next.phase !== 'responding' || !tile || requireResponseTurn(next, action.actor) || !canWin(current.hand.concat(tile), { melds: meldsOf(next, action.actor), winTile: tile, winType: '抢杠' }).canWin) return failed(state, 'round-transition-rob-kong-win-illegal');
      return normalEnd(state, action.actor, scoreSettlement({ winner: action.actor, winType: '抢杠', hand: current.hand.concat(tile), scores: state.scores, robKongTarget: pending.owner }), { type: 'robKongWin', actor: action.actor, tile });
    }
    if (action.type === 'concealedKong') {
      if (next.phase !== 'discarding' || next.currentPlayer !== action.actor || !getLegalActions(next, action.actor).includes('concealedKong')) return failed(state, 'round-transition-concealed-kong-illegal');
      const preKongHand = current.hand.slice(); const after = remove(preKongHand, action.tile, 4); const drawTile = next.wallTiles.at(-1); if (!after || !drawTile) return failed(state, 'round-transition-concealed-kong-context-invalid');
      const melds = meldsOf(next, action.actor).concat([{ type: 'anGang', tiles: [action.tile, action.tile, action.tile, action.tile] }]);
      const resolution = resolveConcealedKongDraw({ owner: action.actor, kongTile: action.tile, preKongHand, handAfterKong: after, melds, drawTile });
      current.hand = resolution.handAfterDraw.slice(); setMelds(next, action.actor, melds); next.wallTiles.pop(); next.newDrawnTile = drawTile;
      if (resolution.mustDiscard) { next.phase = 'discarding'; return { ok: true, state: next, event: { type: 'concealedKong', actor: action.actor, tile: action.tile, outcome: resolution.outcome }, settlement: null }; }
      const settlement = scoreConcealedKongSettlement({ action: { owner: action.actor, kongTile: action.tile, preKongHand, handAfterKong: after, melds, drawTile }, winner: action.actor, scores: state.scores });
      return normalEnd(next, action.actor, settlement, { type: 'concealedKong', actor: action.actor, tile: action.tile, outcome: resolution.outcome });
    }
    if (action.type === 'addedKong') {
      if (next.phase !== 'discarding' || next.currentPlayer !== action.actor || !getLegalActions(next, action.actor).includes('addedKong')) return failed(state, 'round-transition-added-kong-illegal');
      const drawTile = next.wallTiles.at(-1); if (!drawTile) return failed(state, 'round-transition-added-kong-supplement-unavailable');
      const resolution = resolveAddedKongDraw({ owner: action.actor, kongTile: action.tile, preKongHand: current.hand, melds: meldsOf(next, action.actor), drawTile, scores: next.scores, robKongState: next, resource: next.kongResources?.find((resource) => resource.owner === action.actor && resource.tile === action.tile && resource.status === 'active') });
      if (resolution.outcome === 'addedKongRobbed') {
        next.phase = 'responding'; next.lastDiscard = action.tile; next.lastDiscardPlayer = action.actor; next.pendingKong = { kind: 'addedKong', owner: action.actor, tile: action.tile }; next.responseQueue = [1, 2, 3].map((offset) => (action.actor + offset) % 4); next.currentPlayer = next.responseQueue[0];
        return { ok: true, state: next, event: { type: 'addedKong', actor: action.actor, tile: action.tile, outcome: 'addedKongRobWindow' }, settlement: null };
      }
      current.hand = resolution.handAfterDraw.slice(); setMelds(next, action.actor, resolution.melds); next.wallTiles.pop(); next.newDrawnTile = drawTile;
      if (resolution.settlement) return normalEnd(next, action.actor, resolution.settlement, { type: 'addedKong', actor: action.actor, tile: action.tile, outcome: resolution.outcome });
      next.phase = 'discarding'; return { ok: true, state: next, event: { type: 'addedKong', actor: action.actor, tile: action.tile, outcome: resolution.outcome }, settlement: null };
    }
    if (action.type === 'specialKong') {
      const declaration = action.declaration;
      if (specialOwner(declaration) !== action.actor || next.phase !== 'discarding' || next.currentPlayer !== action.actor) return failed(state, 'round-transition-special-kong-owner-invalid');
      if (!canDeclareSpecialKongAction(declaration)) return failed(state, 'round-transition-special-kong-declaration-invalid');
      const canonicalAction = specialIdentity(declaration);
      if (action.canonicalAction && !sameSpecialIdentity(action.canonicalAction, canonicalAction)) return failed(state, 'round-transition-special-kong-canonical-identity-invalid');
      if (action.skipRobWindow) {
        const pending = next.pendingKong;
        const allPassed = !!pending && pending.kind === 'specialKong' && sameSpecialIdentity(pending.canonicalAction, canonicalAction)
          && [1, 2, 3].every((offset) => next.passRecords.some((record) => record.player === (action.actor + offset) % 4 && record.tile === pending.tile && record.round === next.turn));
        if (!allPassed) return failed(state, 'round-transition-special-kong-commit-invalid');
        next.pendingKong = undefined;
      }
      const preKongHand = declaration.kind === 'addedKongChain' ? declaration.input.handBeforeChainKong : declaration.input.preKongHand;
      if (!sameTiles(current.hand, preKongHand)) return failed(state, 'round-transition-special-kong-stale-hand');
      const drawTile = next.wallTiles.at(-1); if (!drawTile) return failed(state, 'round-transition-special-kong-supplement-unavailable');
      const robTile = specialRobTile(declaration);
      if (robTile && action.canonicalAction && !action.skipRobWindow) {
        next.phase = 'responding'; next.lastDiscard = robTile; next.lastDiscardPlayer = action.actor;
        next.pendingKong = { kind: 'specialKong', owner: action.actor, tile: robTile, declaration: JSON.parse(JSON.stringify(declaration)), canonicalAction, preStateIdentity: stateIdentity(state) };
        next.responseQueue = [1, 2, 3].map((offset) => (action.actor + offset) % 4); next.currentPlayer = next.responseQueue[0];
        return { ok: true, state: next, event: { type: 'specialKong', actor: action.actor, tile: robTile, outcome: 'specialKongRobWindow', canonicalAction, committed: false }, settlement: null };
      }
      const resolvedAction = { kind: declaration.kind, input: { ...declaration.input, drawTile } } as Parameters<typeof resolveSpecialKongAction>[0];
      const resolution = resolveSpecialKongAction(resolvedAction);
      current.hand = specialHandAfter(declaration).concat(drawTile); setMelds(next, action.actor, resolvedAction.input.melds); next.wallTiles.pop(); next.newDrawnTile = drawTile;
      if (resolution.mustDiscard) { next.phase = 'discarding'; return { ok: true, state: next, event: { type: 'specialKong', actor: action.actor, tile: canonicalAction.tile, outcome: resolution.outcome, canonicalAction, committed: true }, settlement: null }; }
      const settlement = scoreSpecialKongSettlement({ action: resolvedAction, winner: action.actor, scores: state.scores });
      return normalEnd(next, action.actor, settlement, { type: 'specialKong', actor: action.actor, tile: canonicalAction.tile, outcome: resolution.outcome, canonicalAction, committed: true });
    }
    if (action.type === 'forcedRunDeferred') {
      if (next.phase !== 'discarding' || next.currentPlayer !== action.actor || !getLegalActions(next, action.actor).includes('deferredForcedRunKong') || !canUseDeferredForcedRun(next, action.actor)) return failed(state, 'round-transition-deferred-forced-run-illegal');
      const resource = next.kongResources?.find((entry) => entry.owner === action.actor && entry.tile === action.tile && entry.status === 'active');
      const drawTile = next.wallTiles.at(-1); const preKongHand = current.hand.slice(); const handAfterKong = remove(preKongHand, action.tile, 1); const melds = replacePengWithGang(meldsOf(next, action.actor), action.tile, action.actor);
      if (!resource || !drawTile || !handAfterKong || !melds) return failed(state, 'round-transition-deferred-forced-run-context-invalid');
      const resolution = resolveKongDraw({ kind: 'forcedRunDeferred', owner: action.actor, resource, preKongHand, handAfterKong, melds, drawTile });
      current.hand = handAfterKong.concat(drawTile); setMelds(next, action.actor, melds); next.wallTiles.pop(); next.newDrawnTile = drawTile;
      next.kongResources = (next.kongResources || []).map((entry) => entry.owner === action.actor && entry.tile === action.tile ? resolution.resourceAfterKong : entry);
      if (resolution.mustDiscard) { next.phase = 'discarding'; return { ok: true, state: next, event: { type: action.type, actor: action.actor, tile: action.tile, outcome: resolution.outcome }, settlement: null }; }
      const settlement = scoreKongSettlement({ action: { kind: 'forcedRunDeferred', owner: action.actor, resource, preKongHand, handAfterKong, melds, drawTile }, winner: action.actor, scores: state.scores });
      return normalEnd(next, action.actor, settlement, { type: action.type, actor: action.actor, tile: action.tile, outcome: resolution.outcome });
    }
    if (action.type === 'directChisel' || action.type === 'forcedRunImmediate') {
      const tile = next.lastDiscard;
      if (next.phase !== 'responding' || !tile || next.lastDiscardPlayer == null || requireResponseTurn(next, action.actor)) return failed(state, 'round-transition-kong-response-invalid');
      const kind = classifyDiscardKongClaim({ hand: current.hand, melds: meldsOf(next, action.actor), discardTile: tile, owner: action.actor, discardPlayer: next.lastDiscardPlayer }).kind;
      const expected = action.type === 'directChisel' ? 'directChisel' : 'forcedRunImmediate'; const legalAction = expected === 'directChisel' ? 'directChisel' : 'forcedRunKong'; if (kind !== expected || !getLegalActions(next, action.actor).includes(legalAction)) return failed(state, 'round-transition-kong-kind-illegal');
      const preKongHand = current.hand.slice(); const after = remove(preKongHand, tile, 3); const drawTile = next.wallTiles.at(-1); if (!after || !drawTile || next.discards[next.lastDiscardPlayer].at(-1) !== tile) return failed(state, 'round-transition-kong-physical-proof-invalid');
      const resource = createKongResource({ owner: action.actor, tile, pongMeld: { type: 'peng', tiles: [tile, tile, tile], fromPlayer: next.lastDiscardPlayer }, source: 'pong' });
      const melds = meldsOf(next, action.actor).concat([{ type: 'mingGang', tiles: [tile, tile, tile, tile], fromPlayer: next.lastDiscardPlayer }]);
      const resolution = resolveKongDraw({ kind: expected, owner: action.actor, resource, preKongHand, handAfterKong: after, melds, drawTile });
      current.hand = after.concat(drawTile); setMelds(next, action.actor, melds); next.discards[next.lastDiscardPlayer].pop(); next.wallTiles.pop(); next.newDrawnTile = drawTile; next.kongResources = (next.kongResources || []).concat([resolution.resourceAfterKong]);
      if (resolution.mustDiscard) { next.currentPlayer = action.actor; next.phase = 'discarding'; closeResponseWindow(next); return { ok: true, state: next, event: { type: action.type, actor: action.actor, tile, outcome: resolution.outcome }, settlement: null }; }
      const settlement = scoreKongSettlement({ action: { kind: expected, owner: action.actor, resource, preKongHand, handAfterKong: after, melds, drawTile }, winner: action.actor, pointKongPlayer: next.lastDiscardPlayer, scores: state.scores });
      return normalEnd(next, action.actor, settlement, { type: action.type, actor: action.actor, tile, outcome: resolution.outcome });
    }
    return failed(state, 'round-transition-action-unsupported');
  } catch (error) { return failed(state, `round-transition-fused:${error instanceof Error ? error.message : 'unknown'}`); }
}
