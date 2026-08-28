import * as path from 'node:path';
import {
  preflightStage8ArtifactRoot,
  type Stage8ArtifactRootPreflightInput,
} from './artifact-root-preflight';
import {
  validateStage8BcControlManifest,
  type Stage8BcControlManifest,
  type Stage8BcFusedDecision,
} from './offline-bc-control';
import { hashStage8OfflineIdentity } from './offline-action-identity';
import { hashStage8BcSampleProtocolDefinition } from './offline-bc-sample-protocol';
import { hashStage8OnnxTensorContract } from './offline-onnx-tensor-contract';

export const STAGE8_BC_ARTIFACT_CONTROL_VERSION = 'stage8-bc-artifact-control-v1';
export const STAGE8_BC_ARTIFACT_SCOPE = 'bc-sample-artifact-write';
export const STAGE8_BC_MAX_SAMPLES_PER_SHARD = 4096;
export const STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES = 64 * 1024 * 1024;

export interface Stage8BcArtifactControlIdentity {
  runId: string;
  sourceBundleSha256: string;
  bcControlManifestSha256: string;
  sampleSchemaSha256: string;
  tensorContractSha256: string;
  writerDefinitionSha256: string;
  pythonDatasetDefinitionSha256: string;
  modelDefinitionSha256: string;
  trainingDefinitionSha256: string;
  checkpointDefinitionSha256: string;
  onnxExportDefinitionSha256: string;
  parityDefinitionSha256: string;
}

export interface Stage8BcArtifactControlManifest {
  protocolVersion: typeof STAGE8_BC_ARTIFACT_CONTROL_VERSION;
  identity: Stage8BcArtifactControlIdentity;
  bcControl: Stage8BcControlManifest;
  authorization: {
    approvalId: string;
    granted: boolean;
    scope: typeof STAGE8_BC_ARTIFACT_SCOPE;
  };
  limits: {
    maxSamplesPerShard: number;
    maxUncompressedShardBytes: number;
  };
  allowSampleGeneration: true;
  allowArtifactWrite: true;
  allowPythonRuntime: false;
  allowTraining: false;
  allowModelCreation: false;
  allowCheckpointWrite: false;
  allowOnnxExport: false;
  allowSmoke: false;
  allowRuntime: false;
  manifestSha256: string;
}

export interface Stage8BcArtifactPathFileSystem {
  exists(candidate: string): boolean;
  isDirectory(candidate: string): boolean;
  listDirectory(candidate: string): string[];
  resolvePath(candidate: string): string;
}

export type Stage8BcArtifactControlResult<T> =
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

function fail(runId: unknown, reason: string): Stage8BcArtifactControlResult<never> {
  const safe = validId(runId) ? runId : 'invalid-bc-artifact-run';
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${safe}-isolation` } };
}

function normalize(candidate: string): string {
  return path.win32.normalize(candidate).replace(/[\\/]+$/, '').toLowerCase();
}

function isStrictChild(candidate: string, root: string): boolean {
  const normalizedCandidate = normalize(candidate);
  const normalizedRoot = normalize(root);
  return normalizedCandidate !== normalizedRoot && normalizedCandidate.startsWith(`${normalizedRoot}\\`);
}

function identityHashes(identity: Stage8BcArtifactControlIdentity): string[] {
  return [
    identity.sourceBundleSha256,
    identity.bcControlManifestSha256,
    identity.sampleSchemaSha256,
    identity.tensorContractSha256,
    identity.writerDefinitionSha256,
    identity.pythonDatasetDefinitionSha256,
    identity.modelDefinitionSha256,
    identity.trainingDefinitionSha256,
    identity.checkpointDefinitionSha256,
    identity.onnxExportDefinitionSha256,
    identity.parityDefinitionSha256,
  ];
}

export function hashStage8BcArtifactControlManifestPayload(
  input: Omit<Stage8BcArtifactControlManifest, 'manifestSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

/** Validates explicit sample-write authorization without touching any path. */
export function validateStage8BcArtifactControlManifest(
  manifest: Stage8BcArtifactControlManifest,
): Stage8BcArtifactControlResult<{ identitySha256: string }> {
  const runId = manifest?.identity?.runId;
  if (!exactKeys(manifest, [
    'protocolVersion','identity','bcControl','authorization','limits','allowSampleGeneration','allowArtifactWrite',
    'allowPythonRuntime','allowTraining','allowModelCreation','allowCheckpointWrite','allowOnnxExport','allowSmoke',
    'allowRuntime','manifestSha256',
  ])) return fail(runId, 'bc-artifact-control-schema-invalid');
  if (!exactKeys(manifest.identity, [
    'runId','sourceBundleSha256','bcControlManifestSha256','sampleSchemaSha256','tensorContractSha256',
    'writerDefinitionSha256','pythonDatasetDefinitionSha256','modelDefinitionSha256','trainingDefinitionSha256',
    'checkpointDefinitionSha256','onnxExportDefinitionSha256','parityDefinitionSha256',
  ])) return fail(runId, 'bc-artifact-control-identity-schema-invalid');
  if (!exactKeys(manifest.authorization, ['approvalId','granted','scope'])
    || !exactKeys(manifest.limits, ['maxSamplesPerShard','maxUncompressedShardBytes'])) return fail(runId, 'bc-artifact-control-nested-schema-invalid');
  if (manifest.protocolVersion !== STAGE8_BC_ARTIFACT_CONTROL_VERSION || !validId(runId)) return fail(runId, 'bc-artifact-control-identity-invalid');
  if (!manifest.authorization.granted || !validId(manifest.authorization.approvalId)
    || manifest.authorization.scope !== STAGE8_BC_ARTIFACT_SCOPE) return fail(runId, 'bc-artifact-control-authorization-required');
  const bcControl = validateStage8BcControlManifest(manifest.bcControl);
  if (!bcControl.ok) return fail(runId, `bc-artifact-${bcControl.decision.reason}`);
  if (manifest.bcControl.identity.runId !== runId
    || manifest.identity.bcControlManifestSha256 !== manifest.bcControl.manifestSha256) return fail(runId, 'bc-artifact-control-bc-identity-mismatch');
  if (identityHashes(manifest.identity).some((value) => !isSha256(value))) return fail(runId, 'bc-artifact-control-hash-invalid');
  if (manifest.identity.sampleSchemaSha256 !== hashStage8BcSampleProtocolDefinition()
    || manifest.identity.tensorContractSha256 !== hashStage8OnnxTensorContract()) return fail(runId, 'bc-artifact-control-contract-mismatch');
  if (manifest.limits.maxSamplesPerShard !== STAGE8_BC_MAX_SAMPLES_PER_SHARD
    || manifest.limits.maxUncompressedShardBytes !== STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES) return fail(runId, 'bc-artifact-control-limits-invalid');
  if (manifest.allowSampleGeneration !== true || manifest.allowArtifactWrite !== true
    || [manifest.allowPythonRuntime,manifest.allowTraining,manifest.allowModelCreation,manifest.allowCheckpointWrite,
      manifest.allowOnnxExport,manifest.allowSmoke,manifest.allowRuntime].some((value) => value !== false)) return fail(runId, 'bc-artifact-control-side-effect-boundary-invalid');
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  if (manifest.manifestSha256 !== hashStage8BcArtifactControlManifestPayload(payload)) return fail(runId, 'bc-artifact-control-manifest-hash-mismatch');
  return { ok: true, value: { identitySha256: hashStage8OfflineIdentity(manifest.identity) } };
}

/** Completes root and empty batch-directory checks before a writer can be created. */
export function preflightStage8BcArtifactWrite(input: {
  manifest: Stage8BcArtifactControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  batchDirectory: string;
  fileSystem: Stage8BcArtifactPathFileSystem;
}): Stage8BcArtifactControlResult<{
  artifactRoot: string;
  batchDirectory: string;
  identitySha256: string;
}> {
  const runId = input.manifest?.identity?.runId;
  const control = validateStage8BcArtifactControlManifest(input.manifest);
  if (!control.ok) return control;
  const artifact = preflightStage8ArtifactRoot(input.artifactRoot);
  if (!artifact.ok) return fail(runId, `bc-artifact-${artifact.reason}`);
  if (!path.win32.isAbsolute(input.batchDirectory)) return fail(runId, 'bc-artifact-batch-directory-must-be-absolute');
  let resolvedRoot: string;
  let resolvedBatch: string;
  try {
    resolvedRoot = input.fileSystem.resolvePath(artifact.artifactRoot);
    resolvedBatch = input.fileSystem.resolvePath(input.batchDirectory);
    if (!isStrictChild(resolvedBatch, resolvedRoot)) return fail(runId, 'bc-artifact-batch-directory-outside-root');
    if (!input.fileSystem.exists(input.batchDirectory) || !input.fileSystem.isDirectory(input.batchDirectory)) return fail(runId, 'bc-artifact-batch-directory-missing');
    if (input.fileSystem.listDirectory(input.batchDirectory).length !== 0) return fail(runId, 'bc-artifact-batch-directory-not-empty');
  } catch {
    return fail(runId, 'bc-artifact-batch-directory-inspection-failed');
  }
  return {
    ok: true,
    value: {
      artifactRoot: path.win32.normalize(resolvedRoot),
      batchDirectory: path.win32.normalize(resolvedBatch),
      identitySha256: control.value.identitySha256,
    },
  };
}
