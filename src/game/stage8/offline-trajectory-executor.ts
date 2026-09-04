import type { GameState, RoundPublicEvent } from '../rules';
import { transitionRound } from '../rules';
import { STAGE8_ACTION_SPACE_V2_VERSION } from './action-registry-v2';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import { deriveStage8OfflineActions, executeStage8OfflineCanonicalAction, projectStage8OfflineVisibleState } from './offline-round-adapter';
import type { AddedKongChainWindowInput, CandidateConcealedKongResource } from '../rules/special-kong';
import { hashStage8CanonicalActionSet, hashStage8OfflineIdentity, stage8CanonicalActionKey } from './offline-action-identity';
import { advanceStage8OfflineEpisodeContext, createStage8OfflineEpisodeContext, validateStage8OfflineEpisodeContext, type Stage8OfflineEpisodeContext } from './offline-episode-context';

export interface Stage8OfflineTrajectoryStep {
  action: CanonicalStage8V2Action;
  visibleStateHash: string;
  legalActionIds: number[];
  legalActionSetHash: string;
  legalActionKeys?: string[];
  canonicalLegalActionSetHash?: string;
}

export interface Stage8OfflineTrajectoryInput {
  initialState: GameState;
  steps: Stage8OfflineTrajectoryStep[];
  candidateKongResources?: CandidateConcealedKongResource[];
  addedKongChainWindows?: AddedKongChainWindowInput[];
  episodeContext?: Stage8OfflineEpisodeContext;
}

export interface Stage8OfflineTrajectoryRecord {
  traceStep: number;
  actor: number;
  actionId: number | null;
  actionKey: string | null;
  actionType: string;
  preStateHash: string;
  postStateHash: string;
  preContextSha256: string;
  postContextSha256: string;
  publicEvent: RoundPublicEvent;
  settlementDelta: number[] | null;
}

export type Stage8OfflineTrajectoryResult =
  | { ok: true; state: GameState; context: Stage8OfflineEpisodeContext; records: Stage8OfflineTrajectoryRecord[]; traceHash: string }
  | { ok: false; state: GameState; context: Stage8OfflineEpisodeContext; records: Stage8OfflineTrajectoryRecord[]; reason: string };

function publicStateHash(state: GameState): string {
  return hashStage8OfflineIdentity({ phase: state.phase, currentPlayer: state.currentPlayer, melds: state.melds, discards: state.discards, scores: state.scores, lastDiscard: state.lastDiscard, lastDiscardPlayer: state.lastDiscardPlayer, wallRemainingCount: state.wallTiles.length, responseQueue: state.responseQueue, pendingKong: state.pendingKong && { kind: state.pendingKong.kind, owner: state.pendingKong.owner, tile: state.pendingKong.tile } });
}

function sameActions(left: CanonicalStage8V2Action[], ids: number[]): boolean {
  return left.map((action) => action.actionId).join(',') === ids.join(',');
}

function validateState(state: GameState): string | null {
  if (!state.players || state.players.length !== 4 || state.scores.length !== 4) return 'trajectory-four-player-state-required';
  if (!state.scores.every(Number.isFinite) || state.scores.reduce((sum, score) => sum + score, 0) !== 0) return 'trajectory-score-invariant-invalid';
  return null;
}

function append(records: Stage8OfflineTrajectoryRecord[], actor: number, action: CanonicalStage8V2Action | null, before: GameState, after: GameState, beforeContext: Stage8OfflineEpisodeContext, afterContext: Stage8OfflineEpisodeContext, event: RoundPublicEvent, delta: number[] | null): void {
  records.push({ traceStep: records.length + 1, actor, actionId: action?.actionId ?? null, actionKey: action ? stage8CanonicalActionKey(action) : null, actionType: action?.actionType || 'systemDraw', preStateHash: publicStateHash(before), postStateHash: publicStateHash(after), preContextSha256: beforeContext.identitySha256, postContextSha256: afterContext.identitySha256, publicEvent: event, settlementDelta: delta });
}

/** Executes only supplied canonical decisions; mandatory draw transitions are deterministic system steps. */
export function executeStage8OfflineTrajectory(input: Stage8OfflineTrajectoryInput): Stage8OfflineTrajectoryResult {
  const original = JSON.stringify(input.initialState);
  const records: Stage8OfflineTrajectoryRecord[] = [];
  let state = input.initialState;
  let context = input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows });
  const originalContext = JSON.stringify(context);
  const initialInvalid = validateState(state);
  if (initialInvalid) return { ok: false, state: input.initialState, context, records, reason: initialInvalid };
  if (!validateStage8OfflineEpisodeContext(context)) return { ok: false, state: input.initialState, context, records, reason: 'trajectory-episode-context-invalid' };
  for (const step of input.steps) {
    while (state.phase === 'drawing') {
      const draw = transitionRound(state, { type: 'draw', actor: state.currentPlayer });
      if (!draw.ok) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: `trajectory-system-draw-${draw.reason}` };
      const beforeContext = context;
      try {
        context = advanceStage8OfflineEpisodeContext({ context, before: state, action: null, after: draw.state, event: draw.event });
      } catch (error) {
        return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: `trajectory-episode-context-transition-fused:${error instanceof Error ? error.message : 'unknown'}` };
      }
      append(records, state.currentPlayer, null, state, draw.state, beforeContext, context, draw.event, draw.settlement?.delta || null);
      state = draw.state;
      const invalid = validateState(state);
      if (invalid) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: invalid };
    }
    if (state.phase === 'ended') return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: 'trajectory-action-after-ended' };
    if (step.action.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION || step.action.context.actor !== state.currentPlayer) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: 'trajectory-action-context-invalid' };
    const visible = projectStage8OfflineVisibleState(state, state.currentPlayer);
    if (hashStage8OfflineIdentity(visible) !== step.visibleStateHash) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: 'trajectory-visible-state-mismatch' };
    const legal = deriveStage8OfflineActions({ state, actor: state.currentPlayer, candidateKongResources: context.candidateKongResources, addedKongChainWindows: context.addedKongChainWindows, episodeContext: context });
    const actionKeys = legal.map(stage8CanonicalActionKey).sort();
    if (!sameActions(legal, step.legalActionIds) || hashStage8OfflineIdentity(step.legalActionIds) !== step.legalActionSetHash) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: 'trajectory-legal-action-set-mismatch' };
    if (step.legalActionKeys && (step.legalActionKeys.join(',') !== actionKeys.join(',') || step.canonicalLegalActionSetHash !== hashStage8CanonicalActionSet(legal))) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: 'trajectory-canonical-action-set-mismatch' };
    const result = executeStage8OfflineCanonicalAction({ state, action: step.action, candidateKongResources: context.candidateKongResources, addedKongChainWindows: context.addedKongChainWindows, episodeContext: context });
    if (!result.ok) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: `trajectory-transition-fused:${result.reason}` };
    const beforeContext = context;
    try {
      context = advanceStage8OfflineEpisodeContext({ context, before: state, action: step.action, after: result.state, event: result.event, canonicalLegalActionSetSha256: hashStage8CanonicalActionSet(legal) });
    } catch (error) {
      return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: `trajectory-episode-context-transition-fused:${error instanceof Error ? error.message : 'unknown'}` };
    }
    append(records, state.currentPlayer, step.action, state, result.state, beforeContext, context, result.event, result.settlement?.delta || null);
    state = result.state;
    const invalid = validateState(state);
    if (invalid) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: invalid };
  }
  if (JSON.stringify(input.initialState) !== original || (input.episodeContext && JSON.stringify(input.episodeContext) !== originalContext)) return { ok: false, state: input.initialState, context: input.episodeContext || createStage8OfflineEpisodeContext({ candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows }), records, reason: 'trajectory-input-mutated' };
  return { ok: true, state, context, records, traceHash: hashStage8OfflineIdentity(records) };
}

export function hashStage8OfflineVisibleState(value: unknown): string { return hashStage8OfflineIdentity(value); }
export function hashStage8OfflineLegalActionSet(ids: number[]): string { return hashStage8OfflineIdentity(ids); }
