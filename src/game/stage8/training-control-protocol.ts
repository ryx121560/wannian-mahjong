import { createHash } from 'node:crypto';
import { preflightStage8ArtifactRoot, type Stage8ArtifactRootPreflightInput } from './artifact-root-preflight';

export const STAGE8_TRAINING_CONTROL_VERSION = 'stage8-training-control-v1';
export const STAGE8_TRAINING_MAX_STEPS = 315;

export type Stage8TrainingPhase = 'bootstrap';
export type Stage8TrainingBatchStatus = 'planned' | 'prepared' | 'fused' | 'quarantined';
export type Stage8TrainingHardFailure =
  | 'win-verification-failed'
  | 'illegal-action-executed'
  | 'hidden-information-leak'
  | 'score-not-zero-sum'
  | 'state-not-reproducible'
  | 'model-output-invalid'
  | 'legal-action-without-candidate'
  | 'sample-version-incompatible'
  | 'step-limit-exceeded'
  | 'batch-step-boundary-exceeded';

export interface Stage8TrainingManifestIdentity {
  runId: string;
  runDomainSha256: string;
  rulesSha256: string;
  actionSpaceSha256: string;
  legalActionMaskSha256: string;
  featureSha256: string;
  visibleInformationSha256: string;
  curriculumSha256: string;
  explorationSha256: string;
  modelSha256: string;
  sampleSchemaSha256: string;
  trainingControlSourceSha256: string;
  trainingControlFingerprint: string;
  selfplayRuntimeSourceSha256: string;
  selfplayRuntimeFingerprint: string;
  arenaRuntimeFingerprint: string;
}

export interface Stage8TrainingAuthorization {
  approvalId: string;
  granted: boolean;
}

export interface Stage8TrainingControlManifest {
  protocolVersion: typeof STAGE8_TRAINING_CONTROL_VERSION;
  identity: Stage8TrainingManifestIdentity;
  authorization: Stage8TrainingAuthorization;
  manifestSha256: string;
  maxSteps: number;
  phase: Stage8TrainingPhase;
  allowSmoke: false;
  allowPilot: false;
  allowArena: false;
  allowChampion: false;
  allowRuntime: false;
}

export interface Stage8TrainingBatch {
  batchId: string;
  runId: string;
  startStep: number;
  endStep: number;
  status: Stage8TrainingBatchStatus;
  identitySha256: string;
  quarantineReason?: Stage8TrainingHardFailure;
  isolationId?: string;
}

export interface Stage8TrainingBatchLedger {
  batchId: string;
  isolationId: string;
  lastCompleteCheckpointId: string;
  lastCompleteCheckpointStep: number;
  modelSha256: string;
  manifestSha256: string;
  runDomainSha256: string;
  identitySha256: string;
}

export interface Stage8TrainingCheckpointDeclaration {
  checkpointId: string;
  checkpointStep: number;
  modelSha256: string;
  manifestSha256: string;
  runDomainSha256: string;
  identitySha256: string;
}

export type Stage8TrainingControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}
function sha256(value: unknown): string { return createHash('sha256').update(canonicalize(value)).digest('hex'); }
function isSha256(value: string): boolean { return /^[a-f0-9]{64}$/i.test(value); }
function validId(value: string): boolean { return /^[a-z][a-z0-9-]{2,127}$/i.test(value); }
function identityFields(identity: Stage8TrainingManifestIdentity): string[] {
  return [identity.runDomainSha256, identity.rulesSha256, identity.actionSpaceSha256, identity.legalActionMaskSha256, identity.featureSha256, identity.visibleInformationSha256, identity.curriculumSha256, identity.explorationSha256, identity.modelSha256, identity.sampleSchemaSha256, identity.trainingControlSourceSha256, identity.trainingControlFingerprint, identity.selfplayRuntimeSourceSha256, identity.selfplayRuntimeFingerprint, identity.arenaRuntimeFingerprint];
}

/** Validates a complete run identity without creating manifests, directories, samples, or models. */
export function validateStage8TrainingControlManifest(input: {
  manifest: Stage8TrainingControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
}): Stage8TrainingControlResult<{ artifactRoot: string; identitySha256: string }> {
  const artifact = preflightStage8ArtifactRoot(input.artifactRoot);
  if (!artifact.ok) return artifact;
  const { manifest } = input;
  const identity = manifest.identity;
  if (manifest.protocolVersion !== STAGE8_TRAINING_CONTROL_VERSION) return { ok: false, reason: 'training-control-version-invalid' };
  if (!validId(identity.runId)) return { ok: false, reason: 'training-run-id-invalid' };
  if (!manifest.authorization.granted || !validId(manifest.authorization.approvalId)) return { ok: false, reason: 'training-authorization-required' };
  if (identityFields(identity).some((hash) => !isSha256(hash))) return { ok: false, reason: 'training-manifest-identity-hash-invalid' };
  if (identity.visibleInformationSha256 !== identity.featureSha256) return { ok: false, reason: 'training-visible-information-feature-unbound' };
  if (identity.legalActionMaskSha256 !== identity.actionSpaceSha256) return { ok: false, reason: 'training-legal-mask-action-space-unbound' };
  if (manifest.maxSteps !== STAGE8_TRAINING_MAX_STEPS) return { ok: false, reason: 'training-step-limit-invalid' };
  if (manifest.phase !== 'bootstrap') return { ok: false, reason: 'training-phase-invalid' };
  if (manifest.allowSmoke || manifest.allowPilot || manifest.allowArena || manifest.allowChampion || manifest.allowRuntime) return { ok: false, reason: 'training-downstream-flow-forbidden' };
  const expected = sha256({ protocolVersion: manifest.protocolVersion, identity, authorization: manifest.authorization, maxSteps: manifest.maxSteps, phase: manifest.phase, allowSmoke: false, allowPilot: false, allowArena: false, allowChampion: false, allowRuntime: false });
  if (manifest.manifestSha256 !== expected) return { ok: false, reason: 'training-manifest-hash-mismatch' };
  return { ok: true, value: { artifactRoot: artifact.artifactRoot, identitySha256: sha256(identity) } };
}

/** Plans one batch only; it has no runtime side effects and cannot advance beyond the PRD hard limit. */
export function planStage8TrainingBatch(input: {
  manifest: Stage8TrainingControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  batchId: string;
  startStep: number;
  endStep: number;
  existingBatchIds: readonly string[];
}): Stage8TrainingControlResult<Stage8TrainingBatch> {
  const validated = validateStage8TrainingControlManifest({ manifest: input.manifest, artifactRoot: input.artifactRoot });
  if (!validated.ok) return validated;
  if (!new RegExp(`^${input.manifest.identity.runId}-batch-[0-9]{6}$`).test(input.batchId)) return { ok: false, reason: 'training-batch-id-invalid' };
  if (input.existingBatchIds.includes(input.batchId)) return { ok: false, reason: 'training-batch-id-duplicate' };
  if (!Number.isInteger(input.startStep) || !Number.isInteger(input.endStep) || input.startStep < 0 || input.endStep <= input.startStep) return { ok: false, reason: 'training-batch-step-range-invalid' };
  if (input.endStep > STAGE8_TRAINING_MAX_STEPS) return { ok: false, reason: 'training-step-limit-exceeded' };
  return { ok: true, value: { batchId: input.batchId, runId: input.manifest.identity.runId, startStep: input.startStep, endStep: input.endStep, status: 'planned', identitySha256: validated.value.identitySha256 } };
}

/** Marks a validated plan as ready for an external, separately authorized runner. It does not start one. */
export function prepareStage8TrainingBatch(input: {
  batch: Stage8TrainingBatch;
  manifest: Stage8TrainingControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
}): Stage8TrainingControlResult<Stage8TrainingBatch> {
  const validated = validateStage8TrainingControlManifest({ manifest: input.manifest, artifactRoot: input.artifactRoot });
  if (!validated.ok) return validated;
  if (input.batch.status !== 'planned') return { ok: false, reason: 'training-batch-not-planned-for-prepare' };
  if (input.batch.identitySha256 !== validated.value.identitySha256 || input.batch.runId !== input.manifest.identity.runId) return { ok: false, reason: 'training-batch-identity-mismatch' };
  return { ok: true, value: { ...input.batch, status: 'prepared' } };
}

/** Converts a detected hard failure into an auditable isolated decision; it never writes the isolation. */
export function fuseStage8TrainingBatch(batch: Stage8TrainingBatch, failure: Stage8TrainingHardFailure): Stage8TrainingControlResult<Stage8TrainingBatch> {
  if (batch.status !== 'prepared') return { ok: false, reason: 'training-batch-not-prepared-for-fuse' };
  if (!validId(failure)) return { ok: false, reason: 'training-hard-failure-invalid' };
  return { ok: true, value: { ...batch, status: 'fused', quarantineReason: failure, isolationId: `${batch.batchId}-isolation` } };
}

/** A runner must ask this pure guard before every step; crossing the batch or global limit returns a fused isolation decision. */
export function enforceStage8TrainingStepLimit(batch: Stage8TrainingBatch, nextStep: number): Stage8TrainingControlResult<Stage8TrainingBatch> {
  if (batch.status !== 'prepared') return { ok: false, reason: 'training-batch-not-prepared-for-step-check' };
  if (!Number.isInteger(nextStep) || nextStep < batch.startStep) return { ok: false, reason: 'training-step-invalid' };
  if (nextStep > STAGE8_TRAINING_MAX_STEPS) return fuseStage8TrainingBatch(batch, 'step-limit-exceeded');
  if (nextStep > batch.endStep) return fuseStage8TrainingBatch(batch, 'batch-step-boundary-exceeded');
  return { ok: true, value: batch };
}

/** Recovery is permitted only after an isolated failure and an exact identity/checkpoint proof. */
export function validateStage8TrainingRecovery(input: {
  batch: Stage8TrainingBatch;
  manifest: Stage8TrainingControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  ledger: Stage8TrainingBatchLedger;
  checkpoint: Stage8TrainingCheckpointDeclaration;
}): Stage8TrainingControlResult<{ resumeFromStep: number }> {
  const validated = validateStage8TrainingControlManifest({ manifest: input.manifest, artifactRoot: input.artifactRoot });
  if (!validated.ok) return validated;
  if (input.batch.status !== 'fused' || !input.batch.isolationId) return { ok: false, reason: 'training-recovery-isolation-required' };
  const { ledger, checkpoint } = input;
  if (ledger.batchId !== input.batch.batchId || ledger.isolationId !== input.batch.isolationId) return { ok: false, reason: 'training-recovery-ledger-isolation-mismatch' };
  if (ledger.lastCompleteCheckpointId !== checkpoint.checkpointId || ledger.lastCompleteCheckpointStep !== checkpoint.checkpointStep) return { ok: false, reason: 'training-recovery-not-last-complete-checkpoint' };
  if (!validId(ledger.lastCompleteCheckpointId) || !Number.isInteger(ledger.lastCompleteCheckpointStep) || ledger.lastCompleteCheckpointStep < input.batch.startStep || ledger.lastCompleteCheckpointStep > input.batch.endStep || ledger.lastCompleteCheckpointStep > STAGE8_TRAINING_MAX_STEPS) return { ok: false, reason: 'training-recovery-checkpoint-invalid' };
  if (ledger.identitySha256 !== validated.value.identitySha256 || checkpoint.identitySha256 !== validated.value.identitySha256 || ledger.modelSha256 !== input.manifest.identity.modelSha256 || checkpoint.modelSha256 !== input.manifest.identity.modelSha256 || ledger.manifestSha256 !== input.manifest.manifestSha256 || checkpoint.manifestSha256 !== input.manifest.manifestSha256 || ledger.runDomainSha256 !== input.manifest.identity.runDomainSha256 || checkpoint.runDomainSha256 !== input.manifest.identity.runDomainSha256) return { ok: false, reason: 'training-recovery-identity-mismatch' };
  return { ok: true, value: { resumeFromStep: ledger.lastCompleteCheckpointStep } };
}

export function hashStage8TrainingManifestPayload(input: Omit<Stage8TrainingControlManifest, 'manifestSha256'>): string {
  return sha256(input);
}
