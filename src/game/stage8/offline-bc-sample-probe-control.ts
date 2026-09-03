import { hashStage8OfflineIdentity } from './offline-action-identity';
import {
  validateStage8BcArtifactControlManifest,
  type Stage8BcArtifactControlManifest,
  type Stage8BcArtifactControlResult,
} from './offline-bc-artifact-control';
import { STAGE8_BC_TEACHER_TEMPERATURE } from './offline-bc-control';
import { STAGE8_BC_TEACHER_VERSION } from './offline-bc-teacher';

export const STAGE8_BC_SAMPLE_PROBE_CONTROL_VERSION = 'stage8-bc-sample-probe-control-v1';
export const STAGE8_BC_SAMPLE_PROBE_SCOPE = 'bc-sample-pipeline-probe';
export const STAGE8_BC_SAMPLE_PROBE_GAME_COUNT = 4;
export const STAGE8_BC_SAMPLE_PROBE_MAX_TRANSITIONS = 600;
export const STAGE8_BC_SAMPLE_PROBE_WORKERS = 1;
export const STAGE8_BC_SAMPLE_PROBE_MAX_RUN_BYTES = 320 * 1024 * 1024;

export interface Stage8BcSampleProbeControlManifest {
  protocolVersion: typeof STAGE8_BC_SAMPLE_PROBE_CONTROL_VERSION;
  identity: {
    runId: string;
    sourceBundleSha256: string;
    environmentManifestSha256: string;
    artifactControlManifestSha256: string;
    rulesSha256: string;
    browserRulesSha256: string;
    actionSpaceSha256: string;
    legalActionMaskSha256: string;
    featureSha256: string;
    visibleInformationSha256: string;
    tensorContractSha256: string;
    teacherDefinitionSha256: string;
    sampleSchemaSha256: string;
    writerDefinitionSha256: string;
    trajectoryDefinitionSha256: string;
    capacityPreflightSha256: string;
  };
  artifactControl: Stage8BcArtifactControlManifest;
  authorization: {
    approvalId: string;
    granted: boolean;
    scope: typeof STAGE8_BC_SAMPLE_PROBE_SCOPE;
  };
  plan: {
    baseSeed: number;
    seedDerivation: 'base-plus-game-index-v1';
    gameCount: typeof STAGE8_BC_SAMPLE_PROBE_GAME_COUNT;
    candidateSeats: [0, 1, 2, 3];
    workers: typeof STAGE8_BC_SAMPLE_PROBE_WORKERS;
    curriculum: 'normal-full-rules';
    exploration: false;
    modelLoading: false;
    recordAllSeats: true;
    teacherVersion: typeof STAGE8_BC_TEACHER_VERSION;
    teacherTemperature: typeof STAGE8_BC_TEACHER_TEMPERATURE;
    selection: 'argmax-then-canonical-key';
    maxSuccessfulTransitionsPerGame: typeof STAGE8_BC_SAMPLE_PROBE_MAX_TRANSITIONS;
  };
  capacity: {
    maxRunBytes: typeof STAGE8_BC_SAMPLE_PROBE_MAX_RUN_BYTES;
    preflightBeforeRun: true;
    preflightBeforeEachBatchCommit: true;
  };
  allowProbeExecution: true;
  allowArtifactWrite: true;
  allowModelLoading: false;
  allowExploration: false;
  allowSmoke: false;
  allowSelfplay: false;
  allowTraining: false;
  allowOnnxExport: false;
  allowRuntime: false;
  manifestSha256: string;
}

function fail(runId: unknown, reason: string): Stage8BcArtifactControlResult<never> {
  const safe = typeof runId === 'string' && /^[a-z][a-z0-9-]{2,127}$/i.test(runId)
    ? runId
    : 'invalid-bc-probe-run';
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${safe}-isolation` } };
}

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

export function hashStage8BcSampleProbeControlPayload(
  input: Omit<Stage8BcSampleProbeControlManifest, 'manifestSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function deriveStage8BcSampleProbeSeed(baseSeed: number, gameIndex: number): number {
  if (!Number.isInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xffffffff
    || !Number.isInteger(gameIndex) || gameIndex < 0 || gameIndex >= STAGE8_BC_SAMPLE_PROBE_GAME_COUNT
    || baseSeed + gameIndex > 0xffffffff) throw new Error('bc-probe-seed-derivation-invalid');
  return baseSeed + gameIndex;
}

/** Validates the four-game probe plan without touching the artifact root. */
export function validateStage8BcSampleProbeControl(
  manifest: Stage8BcSampleProbeControlManifest,
): Stage8BcArtifactControlResult<{ identitySha256: string; fixedSeeds: [number, number, number, number] }> {
  const runId = manifest?.identity?.runId;
  if (!exactKeys(manifest, [
    'protocolVersion','identity','artifactControl','authorization','plan','capacity','allowProbeExecution',
    'allowArtifactWrite','allowModelLoading','allowExploration','allowSmoke','allowSelfplay','allowTraining',
    'allowOnnxExport','allowRuntime','manifestSha256',
  ])) return fail(runId, 'bc-probe-control-schema-invalid');
  if (!exactKeys(manifest.identity, [
    'runId','sourceBundleSha256','environmentManifestSha256','artifactControlManifestSha256','rulesSha256',
    'browserRulesSha256','actionSpaceSha256','legalActionMaskSha256','featureSha256','visibleInformationSha256',
    'tensorContractSha256','teacherDefinitionSha256','sampleSchemaSha256','writerDefinitionSha256',
    'trajectoryDefinitionSha256','capacityPreflightSha256',
  ])) return fail(runId, 'bc-probe-control-identity-schema-invalid');
  if (!exactKeys(manifest.authorization, ['approvalId','granted','scope'])
    || !exactKeys(manifest.plan, [
      'baseSeed','seedDerivation','gameCount','candidateSeats','workers','curriculum','exploration','modelLoading',
      'recordAllSeats','teacherVersion','teacherTemperature','selection','maxSuccessfulTransitionsPerGame',
    ])
    || !exactKeys(manifest.capacity, ['maxRunBytes','preflightBeforeRun','preflightBeforeEachBatchCommit'])) {
    return fail(runId, 'bc-probe-control-nested-schema-invalid');
  }
  if (manifest.protocolVersion !== STAGE8_BC_SAMPLE_PROBE_CONTROL_VERSION || !validId(runId)) {
    return fail(runId, 'bc-probe-control-identity-invalid');
  }
  if (!manifest.authorization.granted || !validId(manifest.authorization.approvalId)
    || manifest.authorization.scope !== STAGE8_BC_SAMPLE_PROBE_SCOPE) {
    return fail(runId, 'bc-probe-control-authorization-required');
  }
  const artifact = validateStage8BcArtifactControlManifest(manifest.artifactControl);
  if (!artifact.ok) return fail(runId, `bc-probe-${artifact.decision.reason}`);
  if (manifest.artifactControl.identity.runId !== runId
    || manifest.identity.artifactControlManifestSha256 !== manifest.artifactControl.manifestSha256) {
    return fail(runId, 'bc-probe-artifact-control-identity-mismatch');
  }
  const hashes = Object.entries(manifest.identity)
    .filter(([key]) => key !== 'runId')
    .map(([, value]) => value);
  if (hashes.some((value) => !isSha256(value))) return fail(runId, 'bc-probe-control-hash-invalid');
  const bcIdentity = manifest.artifactControl.bcControl.identity;
  if (manifest.identity.sourceBundleSha256 !== bcIdentity.sourceBundleSha256
    || manifest.identity.rulesSha256 !== bcIdentity.rulesSha256
    || manifest.identity.browserRulesSha256 !== bcIdentity.browserRulesSha256
    || manifest.identity.actionSpaceSha256 !== bcIdentity.actionSpaceSha256
    || manifest.identity.legalActionMaskSha256 !== bcIdentity.legalActionMaskSha256
    || manifest.identity.featureSha256 !== bcIdentity.featureSha256
    || manifest.identity.visibleInformationSha256 !== bcIdentity.visibleInformationSha256
    || manifest.identity.tensorContractSha256 !== bcIdentity.tensorContractSha256
    || manifest.identity.teacherDefinitionSha256 !== bcIdentity.teacherDefinitionSha256
    || manifest.identity.sampleSchemaSha256 !== bcIdentity.sampleSchemaSha256
    || manifest.identity.writerDefinitionSha256 !== manifest.artifactControl.identity.writerDefinitionSha256) {
    return fail(runId, 'bc-probe-control-domain-identity-mismatch');
  }
  const plan = manifest.plan;
  if (plan.gameCount !== STAGE8_BC_SAMPLE_PROBE_GAME_COUNT
    || plan.candidateSeats.join(',') !== '0,1,2,3'
    || plan.workers !== STAGE8_BC_SAMPLE_PROBE_WORKERS
    || plan.curriculum !== 'normal-full-rules'
    || plan.exploration !== false
    || plan.modelLoading !== false
    || plan.recordAllSeats !== true
    || plan.teacherVersion !== STAGE8_BC_TEACHER_VERSION
    || plan.teacherTemperature !== STAGE8_BC_TEACHER_TEMPERATURE
    || plan.selection !== 'argmax-then-canonical-key'
    || plan.maxSuccessfulTransitionsPerGame !== STAGE8_BC_SAMPLE_PROBE_MAX_TRANSITIONS) {
    return fail(runId, 'bc-probe-plan-invalid');
  }
  if (manifest.capacity.maxRunBytes !== STAGE8_BC_SAMPLE_PROBE_MAX_RUN_BYTES
    || !manifest.capacity.preflightBeforeRun || !manifest.capacity.preflightBeforeEachBatchCommit) {
    return fail(runId, 'bc-probe-capacity-contract-invalid');
  }
  if (!manifest.allowProbeExecution || !manifest.allowArtifactWrite
    || [manifest.allowModelLoading,manifest.allowExploration,manifest.allowSmoke,manifest.allowSelfplay,
      manifest.allowTraining,manifest.allowOnnxExport,manifest.allowRuntime].some((value) => value !== false)) {
    return fail(runId, 'bc-probe-side-effect-boundary-invalid');
  }
  let fixedSeeds: [number, number, number, number];
  try {
    fixedSeeds = [0,1,2,3].map((index) => deriveStage8BcSampleProbeSeed(plan.baseSeed, index)) as [number, number, number, number];
  } catch {
    return fail(runId, 'bc-probe-seed-plan-invalid');
  }
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  if (manifest.manifestSha256 !== hashStage8BcSampleProbeControlPayload(payload)) {
    return fail(runId, 'bc-probe-control-manifest-hash-mismatch');
  }
  return { ok: true, value: { identitySha256: hashStage8OfflineIdentity(manifest.identity), fixedSeeds } };
}
