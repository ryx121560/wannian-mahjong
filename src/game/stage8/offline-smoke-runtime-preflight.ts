import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type { Stage8ArtifactRootPreflightInput } from './artifact-root-preflight';
import { hashStage8OfflineIdentity } from './offline-action-identity';
import { hashStage8CanonicalMctsProviderDefinition } from './offline-canonical-mcts-provider';
import {
  STAGE8_OFFLINE_SMOKE_CURRICULUM,
  validateStage8OfflineSmokeControl,
  type Stage8OfflineSmokeControlManifest,
} from './offline-selfplay-control';

export const STAGE8_FORMAL_SMOKE_RUNTIME_VERSION = 'stage8-formal-smoke-runtime-v1';
export const STAGE8_MODEL_PACKAGE_MANIFEST_VERSION = 'stage8-model-package-v1';

export interface Stage8SmokeRuntimeFileSystem {
  exists(candidate: string): boolean;
  isDirectory(candidate: string): boolean;
  isFile(candidate: string): boolean;
  readFile(candidate: string): Uint8Array;
  listDirectory(candidate: string): string[];
}

export interface Stage8SmokeSourceFileIdentity {
  role: string;
  relativePath: string;
  absolutePath: string;
  sha256: string;
}

export interface Stage8ModelPackageManifest {
  protocolVersion: typeof STAGE8_MODEL_PACKAGE_MANIFEST_VERSION;
  modelId: string;
  modelFileSha256: string;
  onnxBinarySha256: string;
  rulesSha256: string;
  actionSpaceSha256: string;
  legalActionMaskSha256: string;
  featureSha256: string;
  visibleInformationSha256: string;
  versionedModelUri: string;
}

export interface Stage8FormalSmokeRuntimeManifest {
  protocolVersion: typeof STAGE8_FORMAL_SMOKE_RUNTIME_VERSION;
  controlManifestSha256: string;
  authorization: {
    approvalId: string;
    granted: boolean;
    scope: 'fixed-course-smoke-run';
  };
  runDirectory: string;
  modelFilePath: string;
  onnxFilePath: string;
  modelManifestPath: string;
  baseSeed: number;
  batchSize: number;
  workers: number;
  behaviorTemperature: number;
  curriculumOverride: typeof STAGE8_OFFLINE_SMOKE_CURRICULUM;
  providerDefinitionSha256: string;
  providerSources: Stage8SmokeSourceFileIdentity[];
  providerSourceBundleSha256: string;
  runtimeSources: Stage8SmokeSourceFileIdentity[];
  runtimeSourceBundleSha256: string;
  fixedCurriculumSelfplayFingerprint: string;
  allowLedgerWrite: true;
  allowQuarantineWrite: true;
  allowTraining: false;
  allowReplay: false;
  allowCheckpoint: false;
  allowPilot: false;
  allowArena: false;
  allowChampion: false;
  allowProductionRuntime: false;
  manifestSha256: string;
}

export interface Stage8FormalSmokeRuntimeDecision {
  status: 'fused';
  reason: string;
  isolationId: string;
}

export type Stage8FormalSmokeRuntimePreflight =
  | {
    ok: true;
    value: {
      artifactRoot: string;
      runDirectory: string;
      runtimeIdentitySha256: string;
      modelPackage: Stage8ModelPackageManifest;
    };
  }
  | { ok: false; decision: Stage8FormalSmokeRuntimeDecision };

function fail(runId: unknown, reason: string): Stage8FormalSmokeRuntimePreflight {
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

function bytesSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalize(candidate: string): string {
  return path.win32.normalize(candidate).replace(/[\\/]+$/, '').toLowerCase();
}

function isSameOrChild(candidate: string, root: string): boolean {
  const normalizedCandidate = normalize(candidate);
  const normalizedRoot = normalize(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
}

function isStrictChild(candidate: string, root: string): boolean {
  return normalize(candidate) !== normalize(root) && isSameOrChild(candidate, root);
}

function safeRead(fileSystem: Stage8SmokeRuntimeFileSystem, candidate: string): Uint8Array | null {
  try {
    if (!fileSystem.exists(candidate) || !fileSystem.isFile(candidate)) return null;
    const bytes = fileSystem.readFile(candidate);
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

export function hashStage8SmokeSourceBundle(files: readonly Stage8SmokeSourceFileIdentity[]): string {
  return hashStage8OfflineIdentity(files
    .map(({ role, relativePath, sha256 }) => ({ role, relativePath: relativePath.replace(/\\/g, '/'), sha256 }))
    .sort((left, right) => `${left.role}:${left.relativePath}`.localeCompare(`${right.role}:${right.relativePath}`)));
}

function validateSourceBundle(input: {
  files: readonly Stage8SmokeSourceFileIdentity[];
  expectedBundleSha256: string;
  fileSystem: Stage8SmokeRuntimeFileSystem;
}): string | null {
  if (!input.files.length || !isSha256(input.expectedBundleSha256)) return 'smoke-source-bundle-identity-invalid';
  const identities = new Set<string>();
  for (const file of input.files) {
    if (!validId(file.role) || !file.relativePath || path.win32.isAbsolute(file.relativePath) || file.relativePath.split(/[\\/]/).includes('..') || !path.win32.isAbsolute(file.absolutePath) || !isSha256(file.sha256)) return 'smoke-source-file-identity-invalid';
    const identity = `${file.role}:${file.relativePath.replace(/\\/g, '/').toLowerCase()}`;
    if (identities.has(identity)) return 'smoke-source-file-identity-duplicate';
    identities.add(identity);
    const bytes = safeRead(input.fileSystem, file.absolutePath);
    if (!bytes || bytesSha256(bytes) !== file.sha256) return 'smoke-source-file-hash-mismatch';
  }
  return hashStage8SmokeSourceBundle(input.files) === input.expectedBundleSha256 ? null : 'smoke-source-bundle-hash-mismatch';
}

function runtimePayload(manifest: Stage8FormalSmokeRuntimeManifest): Omit<Stage8FormalSmokeRuntimeManifest, 'manifestSha256'> {
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  return payload;
}

export function hashStage8FormalSmokeRuntimeManifestPayload(input: Omit<Stage8FormalSmokeRuntimeManifest, 'manifestSha256'>): string {
  return hashStage8OfflineIdentity(input);
}

export function hashStage8FixedCurriculumSelfplayFingerprint(input: {
  controlManifestSha256: string;
  baseSeed: number;
  batchSize: number;
  workers: number;
  behaviorTemperature: number;
  curriculumOverride: typeof STAGE8_OFFLINE_SMOKE_CURRICULUM;
  providerDefinitionSha256: string;
  providerSourceBundleSha256: string;
  runtimeSourceBundleSha256: string;
  modelFileSha256: string;
  onnxBinarySha256: string;
  modelManifestSha256: string;
}): string {
  return hashStage8OfflineIdentity({ version: STAGE8_FORMAL_SMOKE_RUNTIME_VERSION, ...input });
}

function parseModelPackage(bytes: Uint8Array): Stage8ModelPackageManifest | null {
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as Stage8ModelPackageManifest;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

/** Performs every content and identity check before a writer can be constructed. */
export function preflightStage8FormalSmokeRuntime(input: {
  control: Stage8OfflineSmokeControlManifest;
  runtime: Stage8FormalSmokeRuntimeManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  fileSystem: Stage8SmokeRuntimeFileSystem;
}): Stage8FormalSmokeRuntimePreflight {
  const runId = input.control?.identity?.runId;
  const control = validateStage8OfflineSmokeControl({ manifest: input.control, artifactRoot: input.artifactRoot });
  if (!control.ok) return fail(runId, control.decision.reason);
  const runtime = input.runtime;
  if (!runtime || runtime.protocolVersion !== STAGE8_FORMAL_SMOKE_RUNTIME_VERSION) return fail(runId, 'smoke-runtime-version-invalid');
  if (input.control.authorization.scope !== 'fixed-course-smoke-run' || !input.control.allowSelfplayRuntime) return fail(runId, 'smoke-runtime-control-authorization-required');
  if (!runtime.authorization.granted || runtime.authorization.scope !== 'fixed-course-smoke-run' || !validId(runtime.authorization.approvalId) || runtime.authorization.approvalId !== input.control.authorization.approvalId) return fail(runId, 'smoke-runtime-explicit-authorization-required');
  if (runtime.controlManifestSha256 !== input.control.manifestSha256) return fail(runId, 'smoke-runtime-control-manifest-mismatch');
  if (!path.win32.isAbsolute(runtime.runDirectory) || !isStrictChild(runtime.runDirectory, control.value.artifactRoot)) return fail(runId, 'smoke-runtime-directory-outside-artifact-root');
  try {
    if (!input.fileSystem.exists(runtime.runDirectory) || !input.fileSystem.isDirectory(runtime.runDirectory)) return fail(runId, 'smoke-runtime-directory-missing');
    if (input.fileSystem.listDirectory(runtime.runDirectory).length !== 0) return fail(runId, 'smoke-runtime-directory-not-empty');
  } catch {
    return fail(runId, 'smoke-runtime-directory-inspection-failed');
  }
  const assetPaths = [runtime.modelFilePath, runtime.onnxFilePath, runtime.modelManifestPath];
  if (assetPaths.some((candidate) => !path.win32.isAbsolute(candidate) || !isSameOrChild(candidate, control.value.artifactRoot))) return fail(runId, 'smoke-model-package-outside-artifact-root');
  const modelBytes = safeRead(input.fileSystem, runtime.modelFilePath);
  const onnxBytes = safeRead(input.fileSystem, runtime.onnxFilePath);
  const manifestBytes = safeRead(input.fileSystem, runtime.modelManifestPath);
  if (!modelBytes || !onnxBytes || !manifestBytes) return fail(runId, 'smoke-model-package-file-missing');
  if (bytesSha256(modelBytes) !== input.control.identity.modelFileSha256 || bytesSha256(onnxBytes) !== input.control.identity.onnxBinarySha256 || bytesSha256(manifestBytes) !== input.control.identity.modelManifestSha256) return fail(runId, 'smoke-model-package-file-hash-mismatch');
  const modelPackage = parseModelPackage(manifestBytes);
  if (!modelPackage || modelPackage.protocolVersion !== STAGE8_MODEL_PACKAGE_MANIFEST_VERSION || !validId(modelPackage.modelId) || !isSha256(modelPackage.modelFileSha256) || !isSha256(modelPackage.onnxBinarySha256) || !validVersionedUri(modelPackage.versionedModelUri)) return fail(runId, 'smoke-model-package-manifest-invalid');
  const identity = input.control.identity;
  if (modelPackage.modelFileSha256 !== identity.modelFileSha256 || modelPackage.onnxBinarySha256 !== identity.onnxBinarySha256 || modelPackage.rulesSha256 !== identity.rulesSha256 || modelPackage.actionSpaceSha256 !== identity.actionSpaceSha256 || modelPackage.legalActionMaskSha256 !== identity.legalActionMaskSha256 || modelPackage.featureSha256 !== identity.featureSha256 || modelPackage.visibleInformationSha256 !== identity.visibleInformationSha256 || modelPackage.versionedModelUri !== identity.versionedModelUri) return fail(runId, 'smoke-model-package-manifest-identity-mismatch');
  const providerSourceError = validateSourceBundle({ files: runtime.providerSources, expectedBundleSha256: runtime.providerSourceBundleSha256, fileSystem: input.fileSystem });
  if (providerSourceError) return fail(runId, providerSourceError);
  const runtimeSourceError = validateSourceBundle({ files: runtime.runtimeSources, expectedBundleSha256: runtime.runtimeSourceBundleSha256, fileSystem: input.fileSystem });
  if (runtimeSourceError) return fail(runId, runtimeSourceError);
  if (runtime.providerSourceBundleSha256 !== identity.mctsProviderSha256 || runtime.runtimeSourceBundleSha256 !== identity.selfplayRuntimeSha256) return fail(runId, 'smoke-runtime-source-control-identity-mismatch');
  if (!Number.isInteger(runtime.baseSeed) || runtime.baseSeed < 0 || runtime.baseSeed > 0xffffffff || !Number.isInteger(runtime.batchSize) || runtime.batchSize < 1 || runtime.batchSize > 1000 || !Number.isInteger(runtime.workers) || runtime.workers < 1 || runtime.workers > 64 || !Number.isFinite(runtime.behaviorTemperature) || runtime.behaviorTemperature <= 0 || runtime.behaviorTemperature > 100) return fail(runId, 'smoke-runtime-orchestration-config-invalid');
  if (runtime.curriculumOverride !== STAGE8_OFFLINE_SMOKE_CURRICULUM) return fail(runId, 'smoke-runtime-curriculum-invalid');
  if (runtime.providerDefinitionSha256 !== hashStage8CanonicalMctsProviderDefinition({ behaviorTemperature: runtime.behaviorTemperature })) return fail(runId, 'smoke-provider-definition-identity-mismatch');
  const expectedFingerprint = hashStage8FixedCurriculumSelfplayFingerprint({
    controlManifestSha256: runtime.controlManifestSha256,
    baseSeed: runtime.baseSeed,
    batchSize: runtime.batchSize,
    workers: runtime.workers,
    behaviorTemperature: runtime.behaviorTemperature,
    curriculumOverride: runtime.curriculumOverride,
    providerDefinitionSha256: runtime.providerDefinitionSha256,
    providerSourceBundleSha256: runtime.providerSourceBundleSha256,
    runtimeSourceBundleSha256: runtime.runtimeSourceBundleSha256,
    modelFileSha256: identity.modelFileSha256,
    onnxBinarySha256: identity.onnxBinarySha256,
    modelManifestSha256: identity.modelManifestSha256,
  });
  if (runtime.fixedCurriculumSelfplayFingerprint !== expectedFingerprint) return fail(runId, 'smoke-runtime-fingerprint-mismatch');
  if (!runtime.allowLedgerWrite || !runtime.allowQuarantineWrite || runtime.allowTraining || runtime.allowReplay || runtime.allowCheckpoint || runtime.allowPilot || runtime.allowArena || runtime.allowChampion || runtime.allowProductionRuntime) return fail(runId, 'smoke-runtime-downstream-flow-forbidden');
  if (runtime.manifestSha256 !== hashStage8FormalSmokeRuntimeManifestPayload(runtimePayload(runtime))) return fail(runId, 'smoke-runtime-manifest-hash-mismatch');
  return {
    ok: true,
    value: {
      artifactRoot: control.value.artifactRoot,
      runDirectory: path.win32.normalize(runtime.runDirectory),
      runtimeIdentitySha256: hashStage8OfflineIdentity({ control: input.control.manifestSha256, runtime: runtime.manifestSha256, fingerprint: runtime.fixedCurriculumSelfplayFingerprint }),
      modelPackage,
    },
  };
}
