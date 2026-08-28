import { hashStage8OfflineIdentity } from './offline-action-identity';

export const STAGE8_BC_CONTROL_VERSION = 'stage8-bc-control-v1';
export const STAGE8_BC_TEACHER_TEMPERATURE = 1;

export interface Stage8BcControlIdentity {
  runId: string;
  sourceBundleSha256: string;
  rulesSha256: string;
  browserRulesSha256: string;
  actionSpaceSha256: string;
  legalActionMaskSha256: string;
  featureSha256: string;
  visibleInformationSha256: string;
  tensorContractSha256: string;
  teacherDefinitionSha256: string;
  sampleSchemaSha256: string;
}

export interface Stage8BcControlManifest {
  protocolVersion: typeof STAGE8_BC_CONTROL_VERSION;
  identity: Stage8BcControlIdentity;
  authorization: {
    approvalId: string;
    granted: boolean;
    scope: 'bc-teacher-protocol-preflight';
  };
  teacherTemperature: typeof STAGE8_BC_TEACHER_TEMPERATURE;
  allowSampleGeneration: false;
  allowPythonRuntime: false;
  allowTraining: false;
  allowModelCreation: false;
  allowOnnxExport: false;
  allowArtifactWrite: false;
  allowSmoke: false;
  allowRuntime: false;
  manifestSha256: string;
}

export interface Stage8BcFusedDecision {
  status: 'fused';
  reason: string;
  isolationId: string;
}

export type Stage8BcControlResult<T> =
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

function fail(runId: unknown, reason: string): Stage8BcControlResult<never> {
  return {
    ok: false,
    decision: {
      status: 'fused',
      reason,
      isolationId: `${validId(runId) ? runId : 'invalid-bc-run'}-isolation`,
    },
  };
}

function identityHashes(identity: Stage8BcControlIdentity): string[] {
  return [
    identity.sourceBundleSha256,
    identity.rulesSha256,
    identity.browserRulesSha256,
    identity.actionSpaceSha256,
    identity.legalActionMaskSha256,
    identity.featureSha256,
    identity.visibleInformationSha256,
    identity.tensorContractSha256,
    identity.teacherDefinitionSha256,
    identity.sampleSchemaSha256,
  ];
}

export function hashStage8BcControlManifestPayload(
  input: Omit<Stage8BcControlManifest, 'manifestSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

/** Validates a code-only BC protocol authorization and never creates samples or artifacts. */
export function validateStage8BcControlManifest(
  manifest: Stage8BcControlManifest,
): Stage8BcControlResult<{ identitySha256: string }> {
  const runId = manifest?.identity?.runId;
  if (!exactKeys(manifest, ['protocolVersion','identity','authorization','teacherTemperature','allowSampleGeneration','allowPythonRuntime','allowTraining','allowModelCreation','allowOnnxExport','allowArtifactWrite','allowSmoke','allowRuntime','manifestSha256'])) return fail(runId, 'bc-control-schema-invalid');
  if (!exactKeys(manifest.identity, ['runId','sourceBundleSha256','rulesSha256','browserRulesSha256','actionSpaceSha256','legalActionMaskSha256','featureSha256','visibleInformationSha256','tensorContractSha256','teacherDefinitionSha256','sampleSchemaSha256'])) return fail(runId, 'bc-control-identity-schema-invalid');
  if (!exactKeys(manifest.authorization, ['approvalId','granted','scope'])) return fail(runId, 'bc-control-authorization-schema-invalid');
  if (!manifest || manifest.protocolVersion !== STAGE8_BC_CONTROL_VERSION) return fail(runId, 'bc-control-version-invalid');
  if (!validId(runId)) return fail(runId, 'bc-control-run-id-invalid');
  if (manifest.authorization?.granted !== true
    || !validId(manifest.authorization.approvalId)
    || manifest.authorization.scope !== 'bc-teacher-protocol-preflight') return fail(runId, 'bc-control-authorization-required');
  if (identityHashes(manifest.identity).some((value) => !isSha256(value))) return fail(runId, 'bc-control-identity-invalid');
  if (manifest.teacherTemperature !== STAGE8_BC_TEACHER_TEMPERATURE) return fail(runId, 'bc-control-temperature-invalid');
  if ([manifest.allowSampleGeneration, manifest.allowPythonRuntime, manifest.allowTraining,
    manifest.allowModelCreation, manifest.allowOnnxExport, manifest.allowArtifactWrite,
    manifest.allowSmoke, manifest.allowRuntime].some((value) => value !== false)) return fail(runId, 'bc-control-side-effect-boundary-invalid');
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  if (manifest.manifestSha256 !== hashStage8BcControlManifestPayload(payload)) return fail(runId, 'bc-control-manifest-hash-mismatch');
  return { ok: true, value: { identitySha256: hashStage8OfflineIdentity(manifest.identity) } };
}
