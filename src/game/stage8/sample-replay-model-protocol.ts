import { createHash } from 'node:crypto';
import { hashStage8TrainingManifestPayload, validateStage8TrainingControlManifest, type Stage8TrainingControlManifest } from './training-control-protocol';
import type { Stage8ArtifactRootPreflightInput } from './artifact-root-preflight';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import { stage8CanonicalActionKey } from './offline-action-identity';
import { validateStage8OfflineSmokeControl, type Stage8OfflineSmokeControlManifest } from './offline-selfplay-control';

export const STAGE8_SAMPLE_REPLAY_PROTOCOL_VERSION = 'stage8-sample-replay-model-v2';

export interface Stage8ModelPackageIdentity {
  modelFileSha256: string;
  onnxBinarySha256: string;
  modelManifestSha256: string;
  versionedExternalUri: string;
}

export interface Stage8VisibleSampleState {
  actor: number;
  ownHand: string[];
  publicMelds: Array<Array<{ type: string; tiles: string[]; fromPlayer?: number }>>;
  publicDiscards: string[][];
  scores: number[];
  dealer: number;
  turn: number;
  phase: string;
  currentPlayer: number;
  lastDiscard?: string;
  lastDiscardPlayer?: number;
  wallRemainingCount: number;
}

export interface Stage8ActionEvidence {
  legalActionIds: string[];
  legalActionSetSha256: string;
  candidateActionIds: string[];
  canonicalActions: CanonicalStage8V2Action[];
  mctsDistribution: Record<string, number>;
  behaviorActionDistribution: Record<string, number>;
  selectedActionId: string;
  selectedCanonicalAction: CanonicalStage8V2Action;
  selectedActionIdentitySha256: string;
  behaviorActionProbability: number;
  behaviorActionSource: string;
  exploration: boolean;
}

export type Stage8EpisodeReward =
  | { terminal: true; terminalDelta: [number, number, number, number] }
  | { terminal: false; episodeId: string; terminalRewardReferenceSha256: string };

export interface Stage8ReplayEnvelope {
  fixedSeed: number;
  canonicalActionId: string;
  preStateSha256: string;
  postStateSha256: string;
  publicEventSha256: string;
  executionDomainSha256: string;
  visibleStateSha256: string;
  smokeControlSha256: string;
  episodeContextSha256: string;
  traceStep: number;
  episodeReward: Stage8EpisodeReward;
  replaySha256: string;
}

export interface Stage8OfflineSample {
  sampleId: string;
  batchId: string;
  manifest: Stage8TrainingControlManifest;
  smokeControl: Stage8OfflineSmokeControlManifest;
  model: Stage8ModelPackageIdentity;
  visibleState: Stage8VisibleSampleState;
  action: Stage8ActionEvidence;
  replay: Stage8ReplayEnvelope;
}

export interface Stage8SampleProtocolDecision {
  status: 'fused';
  reason: string;
  isolationId: string;
}
export type Stage8SampleProtocolResult<T> = { ok: true; value: T } | { ok: false; decision: Stage8SampleProtocolDecision };

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}
function hash(value: unknown): string { return createHash('sha256').update(canonicalize(value)).digest('hex'); }
function isSha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value); }
function isCanonicalActionId(value: unknown): value is string { return typeof value === 'string' && /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)*$/i.test(value); }
function isSortedUnique(values: string[]): boolean { return values.every((value, index) => isCanonicalActionId(value) && (index === 0 || values[index - 1] < value)); }
function sameArray(left: string[], right: string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function fail(sampleId: unknown, reason: string): Stage8SampleProtocolResult<never> { return { ok: false, decision: { status: 'fused', reason, isolationId: `${typeof sampleId === 'string' ? sampleId : 'invalid-sample'}-isolation` } }; }
function finiteProbability(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1; }
function validDistribution(distribution: unknown, actionIds: string[]): boolean {
  if (!distribution || typeof distribution !== 'object' || Array.isArray(distribution)) return false;
  const entries = Object.entries(distribution as Record<string, unknown>);
  if (!sameArray(entries.map(([key]) => key).sort(), actionIds)) return false;
  const sum = entries.reduce((total, [, value]) => total + (finiteProbability(value) ? value : Number.NaN), 0);
  return Number.isFinite(sum) && Math.abs(sum - 1) <= 1e-12;
}
function validVersionedUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const uri = new URL(value); return Boolean(uri.protocol && uri.host) && (/(^|\/)v[0-9][^/]*(\/|$)/i.test(uri.pathname) || uri.searchParams.has('version')); } catch { return false; }
}
function exactKeys(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).every((key) => allowed.includes(key));
}
function validStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
function validVisibleState(value: unknown): value is Stage8VisibleSampleState {
  const allowed = ['actor','ownHand','publicMelds','publicDiscards','scores','dealer','turn','phase','currentPlayer','lastDiscard','lastDiscardPlayer','wallRemainingCount'];
  if (!exactKeys(value, allowed)) return false;
  const state = value as Record<string, unknown>;
  if (![state.actor, state.dealer, state.turn, state.currentPlayer, state.wallRemainingCount].every(Number.isInteger) || typeof state.phase !== 'string' || !validStringArray(state.ownHand) || !Array.isArray(state.scores) || !state.scores.every((score) => typeof score === 'number' && Number.isFinite(score) || false) || !Array.isArray(state.publicDiscards) || !state.publicDiscards.every(validStringArray)) return false;
  if (state.lastDiscard !== undefined && typeof state.lastDiscard !== 'string') return false;
  if (state.lastDiscardPlayer !== undefined && !Number.isInteger(state.lastDiscardPlayer)) return false;
  if (!Array.isArray(state.publicMelds)) return false;
  return state.publicMelds.every((seat) => Array.isArray(seat) && seat.every((meld) => exactKeys(meld, ['type','tiles','fromPlayer']) && typeof meld.type === 'string' && validStringArray(meld.tiles) && (meld.fromPlayer === undefined || Number.isInteger(meld.fromPlayer))));
}

/** Validates only an in-memory envelope. It does not load models, execute replay, create files, or write samples. */
export function validateStage8OfflineSample(input: { sample: Stage8OfflineSample; artifactRoot: Stage8ArtifactRootPreflightInput }): Stage8SampleProtocolResult<{ sampleSha256: string }> {
  const { sample } = input;
  if (!sample || typeof sample !== 'object' || typeof sample.sampleId !== 'string' || typeof sample.batchId !== 'string') return fail(sample?.sampleId, 'sample-identity-invalid');
  const control = validateStage8TrainingControlManifest({ manifest: sample.manifest, artifactRoot: input.artifactRoot });
  if (!control.ok) return fail(sample.sampleId, `sample-training-control-${control.reason}`);
  const smokeControl = validateStage8OfflineSmokeControl({ manifest: sample.smokeControl, artifactRoot: input.artifactRoot });
  if (!smokeControl.ok) return fail(sample.sampleId, `sample-${smokeControl.decision.reason}`);
  const manifestPayload = { protocolVersion: sample.manifest.protocolVersion, identity: sample.manifest.identity, authorization: sample.manifest.authorization, maxSteps: sample.manifest.maxSteps, phase: sample.manifest.phase, allowSmoke: sample.manifest.allowSmoke, allowPilot: sample.manifest.allowPilot, allowArena: sample.manifest.allowArena, allowChampion: sample.manifest.allowChampion, allowRuntime: sample.manifest.allowRuntime };
  if (sample.manifest.manifestSha256 !== hashStage8TrainingManifestPayload(manifestPayload)) return fail(sample.sampleId, 'sample-training-manifest-mismatch');
  const identity = sample.manifest.identity;
  if (!isSha256(identity.rulesSha256) || !isSha256(identity.actionSpaceSha256) || !isSha256(identity.legalActionMaskSha256) || !isSha256(identity.featureSha256) || !isSha256(identity.visibleInformationSha256) || !isSha256(identity.sampleSchemaSha256)) return fail(sample.sampleId, 'sample-identity-hash-invalid');
  if (identity.legalActionMaskSha256 !== identity.actionSpaceSha256 || identity.visibleInformationSha256 !== identity.featureSha256) return fail(sample.sampleId, 'sample-visible-or-mask-identity-mismatch');
  const smokeIdentity = sample.smokeControl.identity;
  if (smokeIdentity.runId !== identity.runId || smokeIdentity.runDomainSha256 !== identity.runDomainSha256 || smokeIdentity.rulesSha256 !== identity.rulesSha256 || smokeIdentity.actionSpaceSha256 !== identity.actionSpaceSha256 || smokeIdentity.legalActionMaskSha256 !== identity.legalActionMaskSha256 || smokeIdentity.featureSha256 !== identity.featureSha256 || smokeIdentity.visibleInformationSha256 !== identity.visibleInformationSha256 || smokeIdentity.sampleProtocolSha256 !== identity.sampleSchemaSha256 || smokeIdentity.modelFileSha256 !== identity.modelSha256) return fail(sample.sampleId, 'sample-smoke-training-identity-mismatch');
  if (!isSha256(sample.model.modelFileSha256) || !isSha256(sample.model.onnxBinarySha256) || !isSha256(sample.model.modelManifestSha256) || !validVersionedUri(sample.model.versionedExternalUri)) return fail(sample.sampleId, 'sample-model-package-identity-invalid');
  if (sample.model.modelFileSha256 !== identity.modelSha256) return fail(sample.sampleId, 'sample-model-manifest-incompatible');
  if (sample.model.modelFileSha256 !== smokeIdentity.modelFileSha256 || sample.model.onnxBinarySha256 !== smokeIdentity.onnxBinarySha256 || sample.model.modelManifestSha256 !== smokeIdentity.modelManifestSha256 || sample.model.versionedExternalUri !== smokeIdentity.versionedModelUri) return fail(sample.sampleId, 'sample-smoke-model-package-incompatible');
  if (!new RegExp(`^${identity.runId}-batch-[0-9]{6}$`).test(sample.batchId)) return fail(sample.sampleId, 'sample-batch-manifest-incompatible');
  if (!validVisibleState(sample.visibleState)) return fail(sample.sampleId, 'sample-visible-state-schema-invalid');
  const visibleHash = hash(sample.visibleState); if (sample.replay.visibleStateSha256 !== visibleHash) return fail(sample.sampleId, 'sample-visible-state-hash-mismatch');
  const action = sample.action;
  if (!Array.isArray(action.legalActionIds) || !isSortedUnique(action.legalActionIds) || !isSha256(action.legalActionSetSha256) || action.legalActionSetSha256 !== hash(action.legalActionIds)) return fail(sample.sampleId, 'sample-legal-action-set-invalid');
  if (!Array.isArray(action.candidateActionIds) || !isSortedUnique(action.candidateActionIds) || !sameArray(action.candidateActionIds, action.legalActionIds)) return fail(sample.sampleId, 'sample-candidate-action-set-mismatch');
  if (!Array.isArray(action.canonicalActions) || action.canonicalActions.length !== action.legalActionIds.length || !sameArray(action.canonicalActions.map(stage8CanonicalActionKey).sort(), action.legalActionIds)) return fail(sample.sampleId, 'sample-canonical-action-set-mismatch');
  if (!validDistribution(action.mctsDistribution, action.candidateActionIds) || !validDistribution(action.behaviorActionDistribution, action.candidateActionIds)) return fail(sample.sampleId, 'sample-action-distribution-invalid');
  if (!isCanonicalActionId(action.selectedActionId) || !action.candidateActionIds.includes(action.selectedActionId) || stage8CanonicalActionKey(action.selectedCanonicalAction) !== action.selectedActionId || action.selectedActionIdentitySha256 !== hash(action.selectedCanonicalAction) || !finiteProbability(action.behaviorActionProbability) || action.behaviorActionProbability !== action.behaviorActionDistribution[action.selectedActionId] || !['mcts','curriculum-exploration'].includes(action.behaviorActionSource) || typeof action.exploration !== 'boolean' || action.exploration !== (action.behaviorActionSource === 'curriculum-exploration')) return fail(sample.sampleId, 'sample-selected-action-invalid');
  const replay = sample.replay;
  if (!Number.isInteger(replay.fixedSeed) || replay.fixedSeed < 0 || !Number.isInteger(replay.traceStep) || replay.traceStep < 1 || replay.canonicalActionId !== action.selectedActionId || ![replay.preStateSha256, replay.postStateSha256, replay.publicEventSha256, replay.executionDomainSha256, replay.visibleStateSha256, replay.smokeControlSha256, replay.episodeContextSha256].every(isSha256) || replay.executionDomainSha256 !== identity.runDomainSha256 || replay.smokeControlSha256 !== sample.smokeControl.manifestSha256) return fail(sample.sampleId, 'sample-replay-identity-invalid');
  if (replay.episodeReward.terminal) { const delta = replay.episodeReward.terminalDelta; if (!Array.isArray(delta) || delta.length !== 4 || !delta.every((value) => typeof value === 'number' && Number.isFinite(value)) || delta.reduce((sum, value) => sum + value, 0) !== 0) return fail(sample.sampleId, 'sample-terminal-reward-invalid'); }
  else if (typeof replay.episodeReward.episodeId !== 'string' || !replay.episodeReward.episodeId || !isSha256(replay.episodeReward.terminalRewardReferenceSha256)) return fail(sample.sampleId, 'sample-terminal-reward-reference-invalid');
  const replayPayload = { fixedSeed: replay.fixedSeed, canonicalActionId: replay.canonicalActionId, preStateSha256: replay.preStateSha256, postStateSha256: replay.postStateSha256, publicEventSha256: replay.publicEventSha256, executionDomainSha256: replay.executionDomainSha256, visibleStateSha256: replay.visibleStateSha256, smokeControlSha256: replay.smokeControlSha256, episodeContextSha256: replay.episodeContextSha256, traceStep: replay.traceStep, episodeReward: replay.episodeReward };
  if (replay.replaySha256 !== hash(replayPayload)) return fail(sample.sampleId, 'sample-replay-hash-mismatch');
  return { ok: true, value: { sampleSha256: hash({ sampleId: sample.sampleId, batchId: sample.batchId, manifestSha256: sample.manifest.manifestSha256, model: sample.model, visibleStateSha256: replay.visibleStateSha256, legalActionSetSha256: action.legalActionSetSha256, replaySha256: replay.replaySha256 }) } };
}

export function hashStage8ReplayEnvelopePayload(input: Omit<Stage8ReplayEnvelope, 'replaySha256'>): string { return hash(input); }
export function hashStage8VisibleSampleState(input: Stage8VisibleSampleState): string { return hash(input); }
