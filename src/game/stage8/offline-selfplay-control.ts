import type { Stage8ArtifactRootPreflightInput } from './artifact-root-preflight';
import { preflightStage8ArtifactRoot } from './artifact-root-preflight';
import { hashStage8OfflineIdentity } from './offline-action-identity';

export const STAGE8_OFFLINE_SMOKE_CONTROL_VERSION = 'stage8-offline-smoke-control-v1';
export const STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT = 1000;
export const STAGE8_OFFLINE_SMOKE_GAMES_PER_CANDIDATE_SEAT = 250;
export const STAGE8_OFFLINE_SMOKE_EXPLORATION_RATE = 0.2;
export const STAGE8_OFFLINE_SMOKE_CURRICULUM = 'kong-zhichan-chain';

export interface Stage8OfflineSmokeIdentity {
  runId: string;
  runDomainSha256: string;
  rulesSha256: string;
  actionSpaceSha256: string;
  legalActionMaskSha256: string;
  featureSha256: string;
  visibleInformationSha256: string;
  sampleProtocolSha256: string;
  trajectoryExecutorSha256: string;
  selfplayRuntimeSha256: string;
  mctsProviderSha256: string;
  modelFileSha256: string;
  onnxBinarySha256: string;
  modelManifestSha256: string;
  curriculumSha256: string;
  explorationSha256: string;
  seedPlanSha256: string;
  versionedModelUri: string;
}

export interface Stage8OfflineSmokeControlManifest {
  protocolVersion: typeof STAGE8_OFFLINE_SMOKE_CONTROL_VERSION;
  identity: Stage8OfflineSmokeIdentity;
  authorization: {
    approvalId: string;
    granted: boolean;
    scope: 'fixed-course-smoke-preflight';
  };
  curriculum: typeof STAGE8_OFFLINE_SMOKE_CURRICULUM;
  plannedGames: typeof STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT;
  candidateSeatGames: [number, number, number, number];
  scenarioRatio: { forcedRunKong: 2; zhichan: 2; chainKong: 1 };
  targetedExplorationRate: typeof STAGE8_OFFLINE_SMOKE_EXPLORATION_RATE;
  allowFixedCourseSmoke: true;
  allowTraining: false;
  allowSelfplayRuntime: false;
  allowReplayRuntime: false;
  allowModelRuntime: false;
  allowOnnxRuntime: false;
  allowCheckpoint: false;
  allowPilot: false;
  allowArena: false;
  allowChampion: false;
  allowProductionRuntime: false;
  manifestSha256: string;
}

export interface Stage8OfflineSmokeControlDecision {
  status: 'fused';
  reason: string;
  isolationId: string;
}

export type Stage8OfflineSmokeControlResult<T> =
  | { ok: true; value: T }
  | { ok: false; decision: Stage8OfflineSmokeControlDecision };

function fail(runId: unknown, reason: string): Stage8OfflineSmokeControlResult<never> {
  const identity = typeof runId === 'string' && runId ? runId : 'invalid-smoke-run';
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${identity}-isolation` } };
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{2,127}$/i.test(value);
}

function validVersionedUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const uri = new URL(value);
    return Boolean(uri.protocol && uri.host) && (/(^|\/)v[0-9][^/]*(\/|$)/i.test(uri.pathname) || uri.searchParams.has('version'));
  } catch {
    return false;
  }
}

function identityHashes(identity: Stage8OfflineSmokeIdentity): string[] {
  return [
    identity.runDomainSha256, identity.rulesSha256, identity.actionSpaceSha256,
    identity.legalActionMaskSha256, identity.featureSha256, identity.visibleInformationSha256,
    identity.sampleProtocolSha256, identity.trajectoryExecutorSha256, identity.selfplayRuntimeSha256,
    identity.mctsProviderSha256, identity.modelFileSha256, identity.onnxBinarySha256,
    identity.modelManifestSha256, identity.curriculumSha256, identity.explorationSha256,
    identity.seedPlanSha256,
  ];
}

export function hashStage8OfflineSmokeControlManifestPayload(
  input: Omit<Stage8OfflineSmokeControlManifest, 'manifestSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

/** Validates an explicit future Smoke authorization without starting a process or writing artifacts. */
export function validateStage8OfflineSmokeControl(input: {
  manifest: Stage8OfflineSmokeControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
}): Stage8OfflineSmokeControlResult<{ artifactRoot: string; identitySha256: string }> {
  const { manifest } = input;
  const runId = manifest?.identity?.runId;
  const artifact = preflightStage8ArtifactRoot(input.artifactRoot);
  if (!artifact.ok) return fail(runId, `smoke-${artifact.reason}`);
  if (!manifest || manifest.protocolVersion !== STAGE8_OFFLINE_SMOKE_CONTROL_VERSION) return fail(runId, 'smoke-control-version-invalid');
  if (!validId(runId)) return fail(runId, 'smoke-run-id-invalid');
  if (!manifest.authorization.granted || !validId(manifest.authorization.approvalId) || manifest.authorization.scope !== 'fixed-course-smoke-preflight') return fail(runId, 'smoke-explicit-authorization-required');
  if (identityHashes(manifest.identity).some((value) => !isSha256(value))) return fail(runId, 'smoke-identity-hash-invalid');
  if (!validVersionedUri(manifest.identity.versionedModelUri)) return fail(runId, 'smoke-model-uri-invalid');
  if (manifest.identity.visibleInformationSha256 !== manifest.identity.featureSha256) return fail(runId, 'smoke-visible-feature-unbound');
  if (manifest.identity.legalActionMaskSha256 !== manifest.identity.actionSpaceSha256) return fail(runId, 'smoke-legal-mask-action-space-unbound');
  if (manifest.curriculum !== STAGE8_OFFLINE_SMOKE_CURRICULUM || manifest.plannedGames !== STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT) return fail(runId, 'smoke-fixed-course-plan-invalid');
  if (manifest.candidateSeatGames.length !== 4 || manifest.candidateSeatGames.some((count) => count !== STAGE8_OFFLINE_SMOKE_GAMES_PER_CANDIDATE_SEAT)) return fail(runId, 'smoke-candidate-seat-balance-invalid');
  if (manifest.scenarioRatio.forcedRunKong !== 2 || manifest.scenarioRatio.zhichan !== 2 || manifest.scenarioRatio.chainKong !== 1) return fail(runId, 'smoke-course-ratio-invalid');
  if (manifest.targetedExplorationRate !== STAGE8_OFFLINE_SMOKE_EXPLORATION_RATE) return fail(runId, 'smoke-exploration-rate-invalid');
  if (!manifest.allowFixedCourseSmoke || manifest.allowTraining || manifest.allowSelfplayRuntime || manifest.allowReplayRuntime || manifest.allowModelRuntime || manifest.allowOnnxRuntime || manifest.allowCheckpoint || manifest.allowPilot || manifest.allowArena || manifest.allowChampion || manifest.allowProductionRuntime) return fail(runId, 'smoke-downstream-flow-forbidden');
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  if (manifest.manifestSha256 !== hashStage8OfflineSmokeControlManifestPayload(payload)) return fail(runId, 'smoke-control-manifest-hash-mismatch');
  return { ok: true, value: { artifactRoot: artifact.artifactRoot, identitySha256: hashStage8OfflineIdentity(manifest.identity) } };
}
