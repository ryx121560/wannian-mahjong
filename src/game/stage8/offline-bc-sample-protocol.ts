import type { CanonicalStage8V2Action } from './action-registry-v2';
import {
  validateStage8BcControlManifest,
  type Stage8BcControlManifest,
  type Stage8BcFusedDecision,
} from './offline-bc-control';
import {
  evaluateStage8BcTeacher,
  validateStage8BcTeacherEvidence,
  type Stage8BcTeacherEvidence,
} from './offline-bc-teacher';
import {
  hashStage8CanonicalActionSet,
  hashStage8OfflineIdentity,
  sortStage8CanonicalActions,
  stage8CanonicalActionKey,
} from './offline-action-identity';
import { encodeStage8OnnxTensorBatch } from './offline-onnx-tensor-contract';
import type { Stage8OfflineVisibleState } from './offline-round-adapter';

export const STAGE8_BC_SAMPLE_PROTOCOL_VERSION = 'stage8-bc-sample-protocol-v1';

export type Stage8BcEpisodeReward =
  | { terminal: true; terminalDelta: [number, number, number, number] }
  | { terminal: false; episodeId: string; terminalRewardReferenceSha256: string };

export interface Stage8BcReplayEnvelope {
  fixedSeed: number;
  episodeId: string;
  traceStep: number;
  selectedActionKey: string;
  preStateSha256: string;
  postStateSha256: string;
  publicEventSha256: string;
  episodeContextSha256: string;
  visibleStateSha256: string;
  legalActionSetSha256: string;
  teacherEvidenceSha256: string;
  episodeReward: Stage8BcEpisodeReward;
  replaySha256: string;
}

export interface Stage8BcSampleEnvelope {
  protocolVersion: typeof STAGE8_BC_SAMPLE_PROTOCOL_VERSION;
  sampleId: string;
  batchId: string;
  control: Stage8BcControlManifest;
  visibleState: Stage8OfflineVisibleState;
  canonicalActions: CanonicalStage8V2Action[];
  completeLegalActionSetSha256: string;
  teacherEvidence: Stage8BcTeacherEvidence;
  replay: Stage8BcReplayEnvelope;
  sampleSha256: string;
}

export type Stage8BcSampleResult<T> =
  | { ok: true; value: T }
  | { ok: false; decision: Stage8BcFusedDecision };

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{2,127}$/i.test(value);
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function fail(sampleId: unknown, reason: string): Stage8BcSampleResult<never> {
  const safe = validId(sampleId) ? sampleId : 'invalid-bc-sample';
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${safe}-isolation` } };
}

function validReward(reward: Stage8BcEpisodeReward): boolean {
  if (!reward || typeof reward !== 'object') return false;
  if (reward.terminal === true) {
    return exactKeys(reward, ['terminal','terminalDelta'])
      && Array.isArray(reward.terminalDelta)
      && reward.terminalDelta.length === 4
      && reward.terminalDelta.every(Number.isFinite)
      && Math.abs(reward.terminalDelta.reduce((sum, value) => sum + value, 0)) <= 1e-12;
  }
  return reward.terminal === false
    && exactKeys(reward, ['terminal','episodeId','terminalRewardReferenceSha256'])
    && validId(reward.episodeId)
    && isSha256(reward.terminalRewardReferenceSha256);
}

export function hashStage8BcSampleProtocolDefinition(): string {
  return hashStage8OfflineIdentity({
    protocolVersion: STAGE8_BC_SAMPLE_PROTOCOL_VERSION,
    input: 'strict-visible-state-and-complete-canonical-legal-set',
    teacherEvidence: 'recomputed-stage7-deterministic-search-enhanced-distribution',
    replay: 'fixed-seed-state-public-event-and-terminal-reward-identity',
    modelIdentity: 'not-applicable-before-bc-training',
    sideEffects: 'validation-only-zero-write',
  });
}

export function hashStage8BcReplayPayload(input: Omit<Stage8BcReplayEnvelope, 'replaySha256'>): string {
  return hashStage8OfflineIdentity(input);
}

export function hashStage8BcSamplePayload(input: Omit<Stage8BcSampleEnvelope, 'sampleSha256'>): string {
  return hashStage8OfflineIdentity(input);
}

/** Recomputes the teacher decision and validates an in-memory BC envelope without writing a sample. */
export function validateStage8BcSampleEnvelope(sample: Stage8BcSampleEnvelope): Stage8BcSampleResult<{ sampleSha256: string }> {
  const sampleId = sample?.sampleId;
  if (!exactKeys(sample, ['protocolVersion','sampleId','batchId','control','visibleState','canonicalActions','completeLegalActionSetSha256','teacherEvidence','replay','sampleSha256'])) return fail(sampleId, 'bc-sample-schema-invalid');
  if (sample.protocolVersion !== STAGE8_BC_SAMPLE_PROTOCOL_VERSION || !validId(sample.sampleId) || !validId(sample.batchId)) return fail(sampleId, 'bc-sample-identity-invalid');
  const control = validateStage8BcControlManifest(sample.control);
  if (!control.ok) return fail(sampleId, `bc-sample-${control.decision.reason}`);
  if (sample.control.identity.sampleSchemaSha256 !== hashStage8BcSampleProtocolDefinition()) return fail(sampleId, 'bc-sample-schema-identity-mismatch');
  if (!new RegExp(`^${sample.control.identity.runId}-sample-[0-9]{6}$`).test(sample.sampleId)
    || !new RegExp(`^${sample.control.identity.runId}-batch-[0-9]{6}$`).test(sample.batchId)) return fail(sampleId, 'bc-sample-run-identity-mismatch');
  const canonicalActions = sortStage8CanonicalActions(sample.canonicalActions);
  if (!canonicalActions.length || hashStage8CanonicalActionSet(canonicalActions) !== sample.completeLegalActionSetSha256) return fail(sampleId, 'bc-sample-complete-legal-action-set-invalid');
  const inputActionKeys = sample.canonicalActions.map(stage8CanonicalActionKey);
  const canonicalActionKeys = canonicalActions.map(stage8CanonicalActionKey);
  if (inputActionKeys.some((key, index) => key !== canonicalActionKeys[index])) return fail(sampleId, 'bc-sample-legal-actions-not-canonical');
  try {
    encodeStage8OnnxTensorBatch({ visibleState: sample.visibleState, legalActions: canonicalActions });
  } catch {
    return fail(sampleId, 'bc-sample-visible-or-action-schema-invalid');
  }
  const teacher = evaluateStage8BcTeacher({
    control: sample.control,
    visibleState: sample.visibleState,
    legalActions: canonicalActions,
    completeLegalActionSetSha256: sample.completeLegalActionSetSha256,
  });
  if (!teacher.ok) return fail(sampleId, `bc-sample-${teacher.decision.reason}`);
  if (!validateStage8BcTeacherEvidence(sample.teacherEvidence)
    || sample.teacherEvidence.evidenceSha256 !== teacher.value.evidence.evidenceSha256
    || hashStage8OfflineIdentity(sample.teacherEvidence) !== hashStage8OfflineIdentity(teacher.value.evidence)) return fail(sampleId, 'bc-sample-teacher-evidence-mismatch');
  const replay = sample.replay;
  if (!exactKeys(replay, ['fixedSeed','episodeId','traceStep','selectedActionKey','preStateSha256','postStateSha256','publicEventSha256','episodeContextSha256','visibleStateSha256','legalActionSetSha256','teacherEvidenceSha256','episodeReward','replaySha256'])) return fail(sampleId, 'bc-sample-replay-schema-invalid');
  if (!Number.isInteger(replay.fixedSeed) || replay.fixedSeed < 0 || !validId(replay.episodeId)
    || !Number.isInteger(replay.traceStep) || replay.traceStep < 1
    || replay.selectedActionKey !== teacher.value.evidence.selectedActionKey
    || !canonicalActions.some((action) => stage8CanonicalActionKey(action) === replay.selectedActionKey)
    || ![replay.preStateSha256,replay.postStateSha256,replay.publicEventSha256,replay.episodeContextSha256].every(isSha256)
    || replay.visibleStateSha256 !== teacher.value.evidence.visibleStateSha256
    || replay.legalActionSetSha256 !== teacher.value.evidence.legalActionSetSha256
    || replay.teacherEvidenceSha256 !== teacher.value.evidence.evidenceSha256) return fail(sampleId, 'bc-sample-replay-identity-invalid');
  if (!validReward(replay.episodeReward)) return fail(sampleId, 'bc-sample-terminal-reward-invalid');
  if (!replay.episodeReward.terminal && replay.episodeReward.episodeId !== replay.episodeId) return fail(sampleId, 'bc-sample-terminal-reward-episode-mismatch');
  const { replaySha256: _replaySha256, ...replayPayload } = replay;
  if (replay.replaySha256 !== hashStage8BcReplayPayload(replayPayload)) return fail(sampleId, 'bc-sample-replay-hash-mismatch');
  const { sampleSha256: _sampleSha256, ...samplePayload } = sample;
  const sampleSha256 = hashStage8BcSamplePayload(samplePayload);
  if (sample.sampleSha256 !== sampleSha256) return fail(sampleId, 'bc-sample-hash-mismatch');
  return { ok: true, value: { sampleSha256 } };
}
