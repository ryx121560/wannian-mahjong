import type { GameState, RoundPublicEvent } from '../rules';
import { transitionRound } from '../rules';
import { STAGE8_ACTION_SPACE_V2_VERSION } from './action-registry-v2';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import { deriveStage8OfflineActions, executeStage8OfflineCanonicalAction, projectStage8OfflineVisibleState } from './offline-round-adapter';
import type { AddedKongChainWindowInput, CandidateConcealedKongResource } from '../rules/special-kong';

export interface Stage8OfflineTrajectoryStep {
  action: CanonicalStage8V2Action;
  visibleStateHash: string;
  legalActionIds: number[];
  legalActionSetHash: string;
}

export interface Stage8OfflineTrajectoryInput {
  initialState: GameState;
  steps: Stage8OfflineTrajectoryStep[];
  candidateKongResources?: CandidateConcealedKongResource[];
  addedKongChainWindows?: AddedKongChainWindowInput[];
}

export interface Stage8OfflineTrajectoryRecord {
  traceStep: number;
  actor: number;
  actionId: number | null;
  actionType: string;
  preStateHash: string;
  postStateHash: string;
  publicEvent: RoundPublicEvent;
  settlementDelta: number[] | null;
}

export type Stage8OfflineTrajectoryResult =
  | { ok: true; state: GameState; records: Stage8OfflineTrajectoryRecord[]; traceHash: string }
  | { ok: false; state: GameState; records: Stage8OfflineTrajectoryRecord[]; reason: string };

function stableHash(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function publicStateHash(state: GameState): string {
  return stableHash({ phase: state.phase, currentPlayer: state.currentPlayer, melds: state.melds, discards: state.discards, scores: state.scores, lastDiscard: state.lastDiscard, lastDiscardPlayer: state.lastDiscardPlayer, wallRemainingCount: state.wallTiles.length, responseQueue: state.responseQueue, pendingKong: state.pendingKong && { kind: state.pendingKong.kind, owner: state.pendingKong.owner, tile: state.pendingKong.tile } });
}

function sameActions(left: CanonicalStage8V2Action[], ids: number[]): boolean {
  return left.map((action) => action.actionId).join(',') === ids.join(',');
}

function validateState(state: GameState): string | null {
  if (!state.players || state.players.length !== 4 || state.scores.length !== 4) return 'trajectory-four-player-state-required';
  if (!state.scores.every(Number.isFinite) || state.scores.reduce((sum, score) => sum + score, 0) !== 0) return 'trajectory-score-invariant-invalid';
  return null;
}

function append(records: Stage8OfflineTrajectoryRecord[], actor: number, action: CanonicalStage8V2Action | null, before: GameState, after: GameState, event: RoundPublicEvent, delta: number[] | null): void {
  records.push({ traceStep: records.length + 1, actor, actionId: action?.actionId ?? null, actionType: action?.actionType || 'systemDraw', preStateHash: publicStateHash(before), postStateHash: publicStateHash(after), publicEvent: event, settlementDelta: delta });
}

/** Executes only supplied canonical decisions; mandatory draw transitions are deterministic system steps. */
export function executeStage8OfflineTrajectory(input: Stage8OfflineTrajectoryInput): Stage8OfflineTrajectoryResult {
  const original = JSON.stringify(input.initialState);
  const records: Stage8OfflineTrajectoryRecord[] = [];
  let state = input.initialState;
  const initialInvalid = validateState(state);
  if (initialInvalid) return { ok: false, state: input.initialState, records, reason: initialInvalid };
  for (const step of input.steps) {
    while (state.phase === 'drawing') {
      const draw = transitionRound(state, { type: 'draw', actor: state.currentPlayer });
      if (!draw.ok) return { ok: false, state: input.initialState, records, reason: `trajectory-system-draw-${draw.reason}` };
      append(records, state.currentPlayer, null, state, draw.state, draw.event, draw.settlement?.delta || null);
      state = draw.state;
      const invalid = validateState(state);
      if (invalid) return { ok: false, state: input.initialState, records, reason: invalid };
    }
    if (state.phase === 'ended') return { ok: false, state: input.initialState, records, reason: 'trajectory-action-after-ended' };
    if (step.action.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION || step.action.context.actor !== state.currentPlayer) return { ok: false, state: input.initialState, records, reason: 'trajectory-action-context-invalid' };
    const visible = projectStage8OfflineVisibleState(state, state.currentPlayer);
    if (stableHash(visible) !== step.visibleStateHash) return { ok: false, state: input.initialState, records, reason: 'trajectory-visible-state-mismatch' };
    const legal = deriveStage8OfflineActions({ state, actor: state.currentPlayer, candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows });
    if (!sameActions(legal, step.legalActionIds) || stableHash(step.legalActionIds) !== step.legalActionSetHash) return { ok: false, state: input.initialState, records, reason: 'trajectory-legal-action-set-mismatch' };
    const result = executeStage8OfflineCanonicalAction({ state, action: step.action, candidateKongResources: input.candidateKongResources, addedKongChainWindows: input.addedKongChainWindows });
    if (!result.ok) return { ok: false, state: input.initialState, records, reason: `trajectory-transition-fused:${result.reason}` };
    append(records, state.currentPlayer, step.action, state, result.state, result.event, result.settlement?.delta || null);
    state = result.state;
    const invalid = validateState(state);
    if (invalid) return { ok: false, state: input.initialState, records, reason: invalid };
  }
  if (JSON.stringify(input.initialState) !== original) return { ok: false, state: input.initialState, records, reason: 'trajectory-input-mutated' };
  return { ok: true, state, records, traceHash: stableHash(records) };
}

export function hashStage8OfflineVisibleState(value: unknown): string { return stableHash(value); }
export function hashStage8OfflineLegalActionSet(ids: number[]): string { return stableHash(ids); }
