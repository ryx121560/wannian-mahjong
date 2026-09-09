import { hashStage8OfflineIdentity } from './offline-action-identity';

export const STAGE8_BC_CORPUS_CONTROL_VERSION = 'stage8-bc-corpus-control-v1';
export const STAGE8_BC_CORPUS_SCOPE = 'bc-formal-corpus-pilot';
export const STAGE8_BC_CORPUS_GAME_COUNT = 64;
export const STAGE8_BC_CORPUS_BASE_SEED = 2026090800;
export const STAGE8_BC_CORPUS_WORKERS = 1;
export const STAGE8_BC_CORPUS_MAX_TRANSITIONS = 600;
export const STAGE8_BC_CORPUS_MAX_RUN_BYTES = 5 * 1024 * 1024 * 1024;
export const STAGE8_BC_CORPUS_SPLIT_COUNTS = Object.freeze({ train: 48, validation: 8, finalTest: 8 });

export interface Stage8BcCorpusControlManifest {
  protocolVersion: typeof STAGE8_BC_CORPUS_CONTROL_VERSION;
  identity: {
    runId: string;
    sourceBundleSha256: string;
    artifactControlManifestSha256: string;
    bcControlManifestSha256: string;
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
    pythonDatasetDefinitionSha256: string;
    corpusManifestDefinitionSha256: string;
    capacityPreflightSha256: string;
  };
  authorization: {
    approvalId: string;
    granted: boolean;
    scope: typeof STAGE8_BC_CORPUS_SCOPE;
  };
  plan: {
    baseSeed: typeof STAGE8_BC_CORPUS_BASE_SEED;
    seedDerivation: 'base-plus-game-index-v1';
    gameCount: typeof STAGE8_BC_CORPUS_GAME_COUNT;
    candidateSeatDerivation: 'game-index-modulo-four-v1';
    candidateSeatGames: [16, 16, 16, 16];
    workers: typeof STAGE8_BC_CORPUS_WORKERS;
    curriculum: 'normal-full-rules';
    exploration: false;
    modelLoading: false;
    recordAllSeats: true;
    maxSuccessfulTransitionsPerGame: typeof STAGE8_BC_CORPUS_MAX_TRANSITIONS;
    splitUnit: 'episode-seed-group';
    splitCounts: { train: 48; validation: 8; finalTest: 8 };
    splitAssignment: 'game-index-ranges-v1';
    crossRunPolicy: 'single-run-only';
  };
  capacity: {
    maxRunBytes: typeof STAGE8_BC_CORPUS_MAX_RUN_BYTES;
    rootHardLimitBytes: 68719476736;
    rootFusePercent: 80;
    preflightBeforeRun: true;
    preflightBeforeEachBatchCommit: true;
  };
  allowCorpusPilotExecution: true;
  allowArtifactWrite: true;
  allowCrossRun: false;
  allowTraining: false;
  allowValidationSamplingForTraining: false;
  allowFinalTestSamplingForTraining: false;
  allowModelLoading: false;
  allowExploration: false;
  allowSmoke: false;
  allowSelfplay: false;
  allowOnnxExport: false;
  allowRuntime: false;
  manifestSha256: string;
}

export type Stage8BcCorpusControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; decision: { status: 'fused'; reason: string; isolationId: string } };

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{2,127}$/i.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function fail(runId: unknown, reason: string): Stage8BcCorpusControlResult<never> {
  const safe = validId(runId) ? runId : 'invalid-bc-corpus-run';
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${safe}-isolation` } };
}

export function hashStage8BcCorpusControlPayload(
  input: Omit<Stage8BcCorpusControlManifest, 'manifestSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function deriveStage8BcCorpusSeed(gameIndex: number): number {
  if (!Number.isInteger(gameIndex) || gameIndex < 0 || gameIndex >= STAGE8_BC_CORPUS_GAME_COUNT) {
    throw new Error('bc-corpus-game-index-invalid');
  }
  return STAGE8_BC_CORPUS_BASE_SEED + gameIndex;
}

export function deriveStage8BcCorpusSplit(gameIndex: number): 'train' | 'validation' | 'final-test' {
  deriveStage8BcCorpusSeed(gameIndex);
  if (gameIndex < STAGE8_BC_CORPUS_SPLIT_COUNTS.train) return 'train';
  if (gameIndex < STAGE8_BC_CORPUS_SPLIT_COUNTS.train + STAGE8_BC_CORPUS_SPLIT_COUNTS.validation) return 'validation';
  return 'final-test';
}

/** Validates the frozen formal-corpus pilot plan without reading or writing artifacts. */
export function validateStage8BcCorpusControlManifest(
  manifest: Stage8BcCorpusControlManifest,
): Stage8BcCorpusControlResult<{ identitySha256: string; fixedSeeds: number[] }> {
  const runId = manifest?.identity?.runId;
  if (!exactKeys(manifest, [
    'protocolVersion','identity','authorization','plan','capacity','allowCorpusPilotExecution','allowArtifactWrite',
    'allowCrossRun','allowTraining','allowValidationSamplingForTraining','allowFinalTestSamplingForTraining',
    'allowModelLoading','allowExploration','allowSmoke','allowSelfplay','allowOnnxExport','allowRuntime','manifestSha256',
  ])) return fail(runId, 'bc-corpus-control-schema-invalid');
  if (!exactKeys(manifest.identity, [
    'runId','sourceBundleSha256','artifactControlManifestSha256','bcControlManifestSha256','rulesSha256','browserRulesSha256','actionSpaceSha256','legalActionMaskSha256',
    'featureSha256','visibleInformationSha256','tensorContractSha256','teacherDefinitionSha256','sampleSchemaSha256',
    'writerDefinitionSha256','trajectoryDefinitionSha256','pythonDatasetDefinitionSha256',
    'corpusManifestDefinitionSha256','capacityPreflightSha256',
  ]) || !exactKeys(manifest.authorization, ['approvalId','granted','scope'])
    || !exactKeys(manifest.plan, [
      'baseSeed','seedDerivation','gameCount','candidateSeatDerivation','candidateSeatGames','workers','curriculum',
      'exploration','modelLoading','recordAllSeats','maxSuccessfulTransitionsPerGame','splitUnit','splitCounts',
      'splitAssignment','crossRunPolicy',
    ]) || !exactKeys(manifest.plan.splitCounts, ['train','validation','finalTest'])
    || !exactKeys(manifest.capacity, [
      'maxRunBytes','rootHardLimitBytes','rootFusePercent','preflightBeforeRun','preflightBeforeEachBatchCommit',
    ])) return fail(runId, 'bc-corpus-control-nested-schema-invalid');
  if (manifest.protocolVersion !== STAGE8_BC_CORPUS_CONTROL_VERSION || !validId(runId)) {
    return fail(runId, 'bc-corpus-control-identity-invalid');
  }
  if (!manifest.authorization.granted || !validId(manifest.authorization.approvalId)
    || manifest.authorization.scope !== STAGE8_BC_CORPUS_SCOPE) {
    return fail(runId, 'bc-corpus-control-authorization-required');
  }
  if (Object.entries(manifest.identity).some(([key, value]) => key !== 'runId' && !isSha256(value))) {
    return fail(runId, 'bc-corpus-control-hash-invalid');
  }
  if (manifest.identity.legalActionMaskSha256 !== manifest.identity.actionSpaceSha256
    || manifest.identity.visibleInformationSha256 !== manifest.identity.featureSha256) {
    return fail(runId, 'bc-corpus-control-visible-or-mask-identity-unbound');
  }
  const plan = manifest.plan;
  if (plan.baseSeed !== STAGE8_BC_CORPUS_BASE_SEED || plan.seedDerivation !== 'base-plus-game-index-v1'
    || plan.gameCount !== STAGE8_BC_CORPUS_GAME_COUNT || plan.candidateSeatDerivation !== 'game-index-modulo-four-v1'
    || plan.candidateSeatGames.join(',') !== '16,16,16,16' || plan.workers !== STAGE8_BC_CORPUS_WORKERS
    || plan.curriculum !== 'normal-full-rules' || plan.exploration !== false || plan.modelLoading !== false
    || plan.recordAllSeats !== true || plan.maxSuccessfulTransitionsPerGame !== STAGE8_BC_CORPUS_MAX_TRANSITIONS
    || plan.splitUnit !== 'episode-seed-group' || plan.splitCounts.train !== 48
    || plan.splitCounts.validation !== 8 || plan.splitCounts.finalTest !== 8
    || plan.splitAssignment !== 'game-index-ranges-v1' || plan.crossRunPolicy !== 'single-run-only') {
    return fail(runId, 'bc-corpus-control-plan-invalid');
  }
  if (manifest.capacity.maxRunBytes !== STAGE8_BC_CORPUS_MAX_RUN_BYTES
    || manifest.capacity.rootHardLimitBytes !== 68719476736 || manifest.capacity.rootFusePercent !== 80
    || !manifest.capacity.preflightBeforeRun || !manifest.capacity.preflightBeforeEachBatchCommit) {
    return fail(runId, 'bc-corpus-control-capacity-invalid');
  }
  if (!manifest.allowCorpusPilotExecution || !manifest.allowArtifactWrite
    || [manifest.allowCrossRun,manifest.allowTraining,manifest.allowValidationSamplingForTraining,
      manifest.allowFinalTestSamplingForTraining,manifest.allowModelLoading,manifest.allowExploration,
      manifest.allowSmoke,manifest.allowSelfplay,manifest.allowOnnxExport,manifest.allowRuntime]
      .some((value) => value !== false)) return fail(runId, 'bc-corpus-control-side-effect-boundary-invalid');
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  if (manifest.manifestSha256 !== hashStage8BcCorpusControlPayload(payload)) {
    return fail(runId, 'bc-corpus-control-manifest-hash-mismatch');
  }
  return {
    ok: true,
    value: {
      identitySha256: hashStage8OfflineIdentity(manifest.identity),
      fixedSeeds: Array.from({ length: STAGE8_BC_CORPUS_GAME_COUNT }, (_, index) => deriveStage8BcCorpusSeed(index)),
    },
  };
}
