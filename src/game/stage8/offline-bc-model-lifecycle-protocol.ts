import * as path from 'node:path';
import {
  preflightStage8ArtifactRoot,
  type Stage8ArtifactRootPreflightInput,
} from './artifact-root-preflight';
import type { Stage8BcArtifactPathFileSystem } from './offline-bc-artifact-control';
import { hashStage8OfflineIdentity } from './offline-action-identity';
import {
  STAGE8_MODEL_INPUT_SCHEMA_VERSION,
  STAGE8_MODEL_POLICY_OUTPUT_VERSION,
  STAGE8_MODEL_VALUE_OUTPUT_VERSION,
  hashStage8FrozenModelInferenceContract,
  type Stage8FrozenModelIdentityPackage,
  validateStage8FrozenModelIdentityPackage,
} from './offline-frozen-model-inference';
import {
  STAGE8_ONNX_EXECUTION_PROVIDER,
  STAGE8_ONNX_RUNTIME_PACKAGE,
  STAGE8_ONNX_RUNTIME_VERSION,
  hashStage8OnnxSessionOptions,
  hashStage8OnnxTensorContract,
} from './offline-onnx-tensor-contract';

export const STAGE8_BC_MODEL_LIFECYCLE_VERSION = 'stage8-bc-model-lifecycle-v1';
export const STAGE8_BC_PYTHON_TICKET_VERSION = 'stage8-bc-python-ticket-v1';
export const STAGE8_BC_CHECKPOINT_EVIDENCE_VERSION = 'stage8-bc-checkpoint-evidence-v1';
export const STAGE8_BC_ONNX_EXPORT_EVIDENCE_VERSION = 'stage8-bc-onnx-export-evidence-v1';
export const STAGE8_BC_PARITY_EVIDENCE_VERSION = 'stage8-bc-python-node-parity-v1';
export const STAGE8_BC_MODEL_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type Stage8BcModelLifecyclePhase = 'bc-training' | 'bc-onnx-export' | 'bc-parity-verify';

export interface Stage8BcModelConfig {
  visibleFeatureCount: 5577;
  actionFeatureCount: 181;
  stateHiddenSize: 256;
  stateEmbeddingSize: 128;
  actionEmbeddingSize: 64;
  valueSeats: 4;
  zeroSumValueHead: true;
}

export const STAGE8_BC_MODEL_CONFIG: Stage8BcModelConfig = Object.freeze({
  visibleFeatureCount: 5577,
  actionFeatureCount: 181,
  stateHiddenSize: 256,
  stateEmbeddingSize: 128,
  actionEmbeddingSize: 64,
  valueSeats: 4,
  zeroSumValueHead: true,
});

export interface Stage8BcModelLifecycleIdentity {
  runId: string;
  sourceBundleSha256: string;
  artifactControlManifestSha256: string;
  datasetPayloadSetSha256: string;
  rulesSha256: string;
  actionSpaceSha256: string;
  legalActionMaskSha256: string;
  featureSha256: string;
  visibleInformationSha256: string;
  sampleSchemaSha256: string;
  tensorContractSha256: string;
  pythonEnvironmentLockSha256: string;
  pythonSourceBundleSha256: string;
  modelDefinitionSha256: string;
  trainingDefinitionSha256: string;
  checkpointDefinitionSha256: string;
  onnxExportDefinitionSha256: string;
  parityDefinitionSha256: string;
  inferenceContractSha256: string;
  onnxSessionOptionsSha256: string;
}

export interface Stage8BcModelLifecycleManifest {
  protocolVersion: typeof STAGE8_BC_MODEL_LIFECYCLE_VERSION;
  phase: Stage8BcModelLifecyclePhase;
  identity: Stage8BcModelLifecycleIdentity;
  authorization: {
    approvalId: string;
    granted: boolean;
    scope: Stage8BcModelLifecyclePhase;
  };
  trainingPlan: {
    fixedSeed: number;
    maxSteps: number;
    epochs: number;
    batchSize: number;
    learningRate: number;
    policyLossWeight: number;
    valueLossWeight: number;
    deterministicAlgorithms: true;
    valueTarget: 'terminal-four-seat-zero-sum-delta';
  };
  modelConfig: Stage8BcModelConfig;
  allowPythonRuntime: boolean;
  allowTraining: boolean;
  allowCheckpointWrite: boolean;
  allowOnnxExport: boolean;
  allowSmoke: false;
  allowSelfplay: false;
  allowReplay: false;
  allowPilot: false;
  allowArena: false;
  allowChampion: false;
  allowRuntime: false;
  manifestSha256: string;
}

export interface Stage8BcPythonExecutionTicket {
  protocolVersion: typeof STAGE8_BC_PYTHON_TICKET_VERSION;
  phase: Stage8BcModelLifecyclePhase;
  runId: string;
  approvalId: string;
  artifactRoot: string;
  runDirectory: string;
  lifecycleManifestSha256: string;
  lifecycleIdentitySha256: string;
  datasetPayloadSetSha256: string;
  rulesSha256: string;
  actionSpaceSha256: string;
  legalActionMaskSha256: string;
  featureSha256: string;
  visibleInformationSha256: string;
  sampleSchemaSha256: string;
  tensorContractSha256: string;
  pythonEnvironmentLockSha256: string;
  pythonSourceBundleSha256: string;
  modelDefinitionSha256: string;
  trainingDefinitionSha256: string;
  checkpointDefinitionSha256: string;
  onnxExportDefinitionSha256: string;
  parityDefinitionSha256: string;
  inferenceContractSha256: string;
  onnxRuntimePackage: typeof STAGE8_ONNX_RUNTIME_PACKAGE;
  onnxRuntimeVersion: typeof STAGE8_ONNX_RUNTIME_VERSION;
  onnxExecutionProvider: typeof STAGE8_ONNX_EXECUTION_PROVIDER;
  onnxSessionOptionsSha256: string;
  trainingPlan: Stage8BcModelLifecycleManifest['trainingPlan'];
  modelConfig: Stage8BcModelConfig;
  allowTraining: boolean;
  allowCheckpointWrite: boolean;
  allowOnnxExport: boolean;
  ticketSha256: string;
}

export interface Stage8BcCheckpointEvidence {
  protocolVersion: typeof STAGE8_BC_CHECKPOINT_EVIDENCE_VERSION;
  runId: string;
  checkpointId: string;
  lifecycleManifestSha256: string;
  datasetPayloadSetSha256: string;
  modelDefinitionSha256: string;
  trainingDefinitionSha256: string;
  checkpointDefinitionSha256: string;
  checkpointStep: number;
  checkpointFileSha256: string;
  modelStateSha256: string;
  optimizerStateSha256: string;
  policyLossDecimal: string;
  valueLossDecimal: string;
  totalLossDecimal: string;
  hardAnomalies: 0;
  lastComplete: true;
  evidenceSha256: string;
}

export interface Stage8BcOnnxExportEvidence {
  protocolVersion: typeof STAGE8_BC_ONNX_EXPORT_EVIDENCE_VERSION;
  runId: string;
  modelId: string;
  lifecycleManifestSha256: string;
  checkpointEvidenceSha256: string;
  checkpointFileSha256: string;
  onnxBinarySha256: string;
  modelManifestSha256: string;
  modelFileBytes: number;
  onnxFileBytes: number;
  dynamicLegalActionDimension: true;
  onnxCheckerPassed: true;
  frozenModelIdentity: Stage8FrozenModelIdentityPackage;
  evidenceSha256: string;
}

export interface Stage8BcPythonNodeParityEvidence {
  protocolVersion: typeof STAGE8_BC_PARITY_EVIDENCE_VERSION;
  runId: string;
  fixtureId: string;
  lifecycleManifestSha256: string;
  modelManifestSha256: string;
  onnxBinarySha256: string;
  tensorContractSha256: string;
  visibleStateSha256: string;
  legalActionSetSha256: string;
  legalActionKeys: string[];
  numericEncoding: 'little-endian-float32-base64';
  pythonPolicyLogitsFloat32Base64: string;
  nodePolicyLogitsFloat32Base64: string;
  pythonValueDeltaFloat32Base64: string;
  nodeValueDeltaFloat32Base64: string;
  absoluteToleranceDecimal: string;
  maximumPolicyDifferenceDecimal: string;
  maximumValueDifferenceDecimal: string;
  passed: true;
  evidenceSha256: string;
}

export type Stage8BcLifecycleResult<T> =
  | { ok: true; value: T }
  | { ok: false; decision: { status: 'fused'; reason: string; isolationId: string } };

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function finiteDecimal(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && Number.isFinite(Number(value));
}

function decodeFloat32Base64(value: unknown, expectedLength: number): number[] | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length !== expectedLength * 4 || bytes.toString('base64') !== value) return null;
    const output = Array.from({ length: expectedLength }, (_, index) => bytes.readFloatLE(index * 4));
    return output.every(Number.isFinite) ? output : null;
  } catch {
    return null;
  }
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

function fail(runId: unknown, reason: string): Stage8BcLifecycleResult<never> {
  const safe = validId(runId) ? runId : 'invalid-bc-model-run';
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

function manifestPayload(manifest: Stage8BcModelLifecycleManifest): Omit<Stage8BcModelLifecycleManifest, 'manifestSha256'> {
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  return payload;
}

function evidencePayload<T extends { evidenceSha256: string }>(evidence: T): Omit<T, 'evidenceSha256'> {
  const { evidenceSha256: _evidenceSha256, ...payload } = evidence;
  return payload;
}

function identityHashes(identity: Stage8BcModelLifecycleIdentity): string[] {
  return Object.entries(identity).filter(([key]) => key !== 'runId').map(([, value]) => value);
}

function validModelConfig(config: Stage8BcModelConfig): boolean {
  return hashStage8OfflineIdentity(config) === hashStage8OfflineIdentity(STAGE8_BC_MODEL_CONFIG);
}

function expectedAllowFlags(phase: Stage8BcModelLifecyclePhase): Pick<Stage8BcModelLifecycleManifest,
  'allowPythonRuntime' | 'allowTraining' | 'allowCheckpointWrite' | 'allowOnnxExport'> {
  if (phase === 'bc-training') return { allowPythonRuntime: true, allowTraining: true, allowCheckpointWrite: true, allowOnnxExport: false };
  if (phase === 'bc-onnx-export') return { allowPythonRuntime: true, allowTraining: false, allowCheckpointWrite: false, allowOnnxExport: true };
  return { allowPythonRuntime: false, allowTraining: false, allowCheckpointWrite: false, allowOnnxExport: false };
}

const checkpointEvidenceKeys = [
  'protocolVersion','runId','checkpointId','lifecycleManifestSha256','datasetPayloadSetSha256','modelDefinitionSha256',
  'trainingDefinitionSha256','checkpointDefinitionSha256','checkpointStep','checkpointFileSha256','modelStateSha256',
  'optimizerStateSha256','policyLossDecimal','valueLossDecimal','totalLossDecimal','hardAnomalies','lastComplete','evidenceSha256',
];

function checkpointMatchesLifecycleIdentity(
  manifest: Stage8BcModelLifecycleManifest,
  evidence: Stage8BcCheckpointEvidence,
  requireLifecycleManifestMatch: boolean,
): boolean {
  return exactKeys(evidence, checkpointEvidenceKeys)
    && evidence.protocolVersion === STAGE8_BC_CHECKPOINT_EVIDENCE_VERSION
    && evidence.runId === manifest.identity.runId
    && validId(evidence.checkpointId)
    && (!requireLifecycleManifestMatch || evidence.lifecycleManifestSha256 === manifest.manifestSha256)
    && isSha256(evidence.lifecycleManifestSha256)
    && evidence.datasetPayloadSetSha256 === manifest.identity.datasetPayloadSetSha256
    && evidence.modelDefinitionSha256 === manifest.identity.modelDefinitionSha256
    && evidence.trainingDefinitionSha256 === manifest.identity.trainingDefinitionSha256
    && evidence.checkpointDefinitionSha256 === manifest.identity.checkpointDefinitionSha256
    && [evidence.checkpointFileSha256,evidence.modelStateSha256,evidence.optimizerStateSha256].every(isSha256)
    && Number.isInteger(evidence.checkpointStep) && evidence.checkpointStep >= 1
    && evidence.checkpointStep <= manifest.trainingPlan.maxSteps
    && [evidence.policyLossDecimal,evidence.valueLossDecimal,evidence.totalLossDecimal].every(finiteDecimal)
    && evidence.hardAnomalies === 0 && evidence.lastComplete === true
    && evidence.evidenceSha256 === hashStage8OfflineIdentity(evidencePayload(evidence));
}

function modelIdentityMatchesLifecycle(
  manifest: Stage8BcModelLifecycleManifest,
  model: Stage8FrozenModelIdentityPackage,
): boolean {
  return validateStage8FrozenModelIdentityPackage(model)
    && model.tensorContractSha256 === manifest.identity.tensorContractSha256
    && model.rulesSha256 === manifest.identity.rulesSha256
    && model.actionSpaceSha256 === manifest.identity.actionSpaceSha256
    && model.legalActionMaskSha256 === manifest.identity.legalActionMaskSha256
    && model.featureSha256 === manifest.identity.featureSha256
    && model.visibleInformationSha256 === manifest.identity.visibleInformationSha256
    && model.inferenceContractSha256 === manifest.identity.inferenceContractSha256
    && model.onnxSessionOptionsSha256 === manifest.identity.onnxSessionOptionsSha256;
}

export function hashStage8BcModelDefinition(): string {
  return hashStage8OfflineIdentity({
    version: 'stage8-bc-dual-head-model-v1',
    config: STAGE8_BC_MODEL_CONFIG,
    policy: 'masked-dynamic-canonical-action-logits',
    value: 'four-seat-terminal-delta-minus-seat-mean',
    parameterTarget: 'float32-under-10MiB',
  });
}

export function hashStage8BcTrainingDefinition(): string {
  return hashStage8OfflineIdentity({
    version: 'stage8-bc-training-v1',
    policyLoss: 'full-teacher-distribution-cross-entropy',
    valueLoss: 'smooth-l1-real-terminal-four-seat-delta',
    rewards: 'terminal-only-no-process-reward',
    determinism: 'fixed-seed-deterministic-algorithms-fail-closed',
    finiteChecks: 'input-output-gradient-loss',
  });
}

export function hashStage8BcCheckpointDefinition(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_BC_CHECKPOINT_EVIDENCE_VERSION,
    commit: 'in-memory-serialization-exclusive-partial-write-readback-atomic-rename',
    resume: 'last-complete-only-full-run-dataset-model-optimizer-identity',
    failure: 'no-partial-checkpoint-commit',
  });
}

export function hashStage8BcOnnxExportDefinition(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_BC_ONNX_EXPORT_EVIDENCE_VERSION,
    exporter: 'torch.onnx.export-dynamo-true-in-memory',
    dynamicDimension: 'canonical-legal-action-count',
    checker: 'onnx.checker.check_model-before-write',
    inputs: STAGE8_MODEL_INPUT_SCHEMA_VERSION,
    policy: STAGE8_MODEL_POLICY_OUTPUT_VERSION,
    value: STAGE8_MODEL_VALUE_OUTPUT_VERSION,
  });
}

export function hashStage8BcParityDefinition(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_BC_PARITY_EVIDENCE_VERSION,
    inputs: 'same-visible-state-and-complete-canonical-legal-action-tensors',
    outputs: 'python-and-node-policy-logits-and-four-seat-value',
    comparison: 'finite-elementwise-absolute-tolerance',
    identity: 'same-onnx-model-manifest-tensor-visible-and-action-set',
  });
}

export function hashStage8BcModelLifecycleManifestPayload(
  input: Omit<Stage8BcModelLifecycleManifest, 'manifestSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function hashStage8BcPythonExecutionTicketPayload(
  input: Omit<Stage8BcPythonExecutionTicket, 'ticketSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function validateStage8BcModelLifecycleManifest(
  manifest: Stage8BcModelLifecycleManifest,
): Stage8BcLifecycleResult<{ identitySha256: string }> {
  const runId = manifest?.identity?.runId;
  if (!exactKeys(manifest, [
    'protocolVersion','phase','identity','authorization','trainingPlan','modelConfig','allowPythonRuntime','allowTraining',
    'allowCheckpointWrite','allowOnnxExport','allowSmoke','allowSelfplay','allowReplay','allowPilot','allowArena',
    'allowChampion','allowRuntime','manifestSha256',
  ])) return fail(runId, 'bc-lifecycle-schema-invalid');
  if (!exactKeys(manifest.identity, [
    'runId','sourceBundleSha256','artifactControlManifestSha256','datasetPayloadSetSha256','rulesSha256','actionSpaceSha256',
    'legalActionMaskSha256','featureSha256','visibleInformationSha256','sampleSchemaSha256','tensorContractSha256',
    'pythonEnvironmentLockSha256','pythonSourceBundleSha256','modelDefinitionSha256','trainingDefinitionSha256',
    'checkpointDefinitionSha256','onnxExportDefinitionSha256','parityDefinitionSha256','inferenceContractSha256',
    'onnxSessionOptionsSha256',
  ]) || !exactKeys(manifest.authorization, ['approvalId','granted','scope']) || !exactKeys(manifest.trainingPlan, [
    'fixedSeed','maxSteps','epochs','batchSize','learningRate','policyLossWeight','valueLossWeight','deterministicAlgorithms','valueTarget',
  ])) return fail(runId, 'bc-lifecycle-nested-schema-invalid');
  if (manifest.protocolVersion !== STAGE8_BC_MODEL_LIFECYCLE_VERSION || !validId(runId)
    || !['bc-training','bc-onnx-export','bc-parity-verify'].includes(manifest.phase)) return fail(runId, 'bc-lifecycle-identity-invalid');
  if (!manifest.authorization.granted || !validId(manifest.authorization.approvalId)
    || manifest.authorization.scope !== manifest.phase) return fail(runId, 'bc-lifecycle-authorization-required');
  if (identityHashes(manifest.identity).some((value) => !isSha256(value))) return fail(runId, 'bc-lifecycle-hash-invalid');
  if (manifest.identity.tensorContractSha256 !== hashStage8OnnxTensorContract()
    || manifest.identity.modelDefinitionSha256 !== hashStage8BcModelDefinition()
    || manifest.identity.trainingDefinitionSha256 !== hashStage8BcTrainingDefinition()
    || manifest.identity.checkpointDefinitionSha256 !== hashStage8BcCheckpointDefinition()
    || manifest.identity.onnxExportDefinitionSha256 !== hashStage8BcOnnxExportDefinition()
    || manifest.identity.parityDefinitionSha256 !== hashStage8BcParityDefinition()
    || manifest.identity.inferenceContractSha256 !== hashStage8FrozenModelInferenceContract()
    || manifest.identity.onnxSessionOptionsSha256 !== hashStage8OnnxSessionOptions()) return fail(runId, 'bc-lifecycle-definition-mismatch');
  if (manifest.identity.visibleInformationSha256 !== manifest.identity.featureSha256
    || manifest.identity.legalActionMaskSha256 !== manifest.identity.actionSpaceSha256) return fail(runId, 'bc-lifecycle-visible-or-mask-identity-unbound');
  const plan = manifest.trainingPlan;
  if (!Number.isInteger(plan.fixedSeed) || plan.fixedSeed < 0 || plan.fixedSeed > 0xffffffff
    || !Number.isInteger(plan.maxSteps) || plan.maxSteps < 1 || plan.maxSteps > 315
    || !Number.isInteger(plan.epochs) || plan.epochs < 1 || plan.epochs > 1000
    || !Number.isInteger(plan.batchSize) || plan.batchSize < 1 || plan.batchSize > 4096
    || !Number.isFinite(plan.learningRate) || plan.learningRate <= 0 || plan.learningRate > 1
    || !Number.isFinite(plan.policyLossWeight) || plan.policyLossWeight <= 0
    || !Number.isFinite(plan.valueLossWeight) || plan.valueLossWeight <= 0
    || plan.deterministicAlgorithms !== true || plan.valueTarget !== 'terminal-four-seat-zero-sum-delta') return fail(runId, 'bc-lifecycle-training-plan-invalid');
  if (!validModelConfig(manifest.modelConfig)) return fail(runId, 'bc-lifecycle-model-config-invalid');
  const expected = expectedAllowFlags(manifest.phase);
  if (manifest.allowPythonRuntime !== expected.allowPythonRuntime || manifest.allowTraining !== expected.allowTraining
    || manifest.allowCheckpointWrite !== expected.allowCheckpointWrite || manifest.allowOnnxExport !== expected.allowOnnxExport
    || [manifest.allowSmoke,manifest.allowSelfplay,manifest.allowReplay,manifest.allowPilot,manifest.allowArena,
      manifest.allowChampion,manifest.allowRuntime].some((value) => value !== false)) return fail(runId, 'bc-lifecycle-side-effect-boundary-invalid');
  if (manifest.manifestSha256 !== hashStage8BcModelLifecycleManifestPayload(manifestPayload(manifest))) return fail(runId, 'bc-lifecycle-manifest-hash-mismatch');
  return { ok: true, value: { identitySha256: hashStage8OfflineIdentity(manifest.identity) } };
}

/** Issues an immutable Python ticket only after the external root and empty run directory pass. */
export function preflightStage8BcPythonExecution(input: {
  manifest: Stage8BcModelLifecycleManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  runDirectory: string;
  fileSystem: Stage8BcArtifactPathFileSystem;
}): Stage8BcLifecycleResult<Stage8BcPythonExecutionTicket> {
  const runId = input.manifest?.identity?.runId;
  const validated = validateStage8BcModelLifecycleManifest(input.manifest);
  if (!validated.ok) return validated;
  const root = preflightStage8ArtifactRoot(input.artifactRoot);
  if (!root.ok) return fail(runId, `bc-lifecycle-${root.reason}`);
  if (!path.win32.isAbsolute(input.runDirectory)) return fail(runId, 'bc-lifecycle-run-directory-must-be-absolute');
  let resolvedRoot: string;
  let resolvedRun: string;
  try {
    resolvedRoot = input.fileSystem.resolvePath(root.artifactRoot);
    resolvedRun = input.fileSystem.resolvePath(input.runDirectory);
    if (!isStrictChild(resolvedRun, resolvedRoot)) return fail(runId, 'bc-lifecycle-run-directory-outside-root');
    if (!input.fileSystem.exists(input.runDirectory) || !input.fileSystem.isDirectory(input.runDirectory)) return fail(runId, 'bc-lifecycle-run-directory-missing');
    if (input.fileSystem.listDirectory(input.runDirectory).length !== 0) return fail(runId, 'bc-lifecycle-run-directory-not-empty');
  } catch {
    return fail(runId, 'bc-lifecycle-run-directory-inspection-failed');
  }
  const payload: Omit<Stage8BcPythonExecutionTicket, 'ticketSha256'> = {
    protocolVersion: STAGE8_BC_PYTHON_TICKET_VERSION as typeof STAGE8_BC_PYTHON_TICKET_VERSION,
    phase: input.manifest.phase,
    runId: input.manifest.identity.runId,
    approvalId: input.manifest.authorization.approvalId,
    artifactRoot: path.win32.normalize(resolvedRoot),
    runDirectory: path.win32.normalize(resolvedRun),
    lifecycleManifestSha256: input.manifest.manifestSha256,
    lifecycleIdentitySha256: validated.value.identitySha256,
    datasetPayloadSetSha256: input.manifest.identity.datasetPayloadSetSha256,
    rulesSha256: input.manifest.identity.rulesSha256,
    actionSpaceSha256: input.manifest.identity.actionSpaceSha256,
    legalActionMaskSha256: input.manifest.identity.legalActionMaskSha256,
    featureSha256: input.manifest.identity.featureSha256,
    visibleInformationSha256: input.manifest.identity.visibleInformationSha256,
    sampleSchemaSha256: input.manifest.identity.sampleSchemaSha256,
    tensorContractSha256: input.manifest.identity.tensorContractSha256,
    pythonEnvironmentLockSha256: input.manifest.identity.pythonEnvironmentLockSha256,
    pythonSourceBundleSha256: input.manifest.identity.pythonSourceBundleSha256,
    modelDefinitionSha256: input.manifest.identity.modelDefinitionSha256,
    trainingDefinitionSha256: input.manifest.identity.trainingDefinitionSha256,
    checkpointDefinitionSha256: input.manifest.identity.checkpointDefinitionSha256,
    onnxExportDefinitionSha256: input.manifest.identity.onnxExportDefinitionSha256,
    parityDefinitionSha256: input.manifest.identity.parityDefinitionSha256,
    inferenceContractSha256: input.manifest.identity.inferenceContractSha256,
    onnxRuntimePackage: STAGE8_ONNX_RUNTIME_PACKAGE,
    onnxRuntimeVersion: STAGE8_ONNX_RUNTIME_VERSION,
    onnxExecutionProvider: STAGE8_ONNX_EXECUTION_PROVIDER,
    onnxSessionOptionsSha256: input.manifest.identity.onnxSessionOptionsSha256,
    trainingPlan: structuredClone(input.manifest.trainingPlan),
    modelConfig: structuredClone(input.manifest.modelConfig),
    allowTraining: input.manifest.allowTraining,
    allowCheckpointWrite: input.manifest.allowCheckpointWrite,
    allowOnnxExport: input.manifest.allowOnnxExport,
  };
  return { ok: true, value: { ...payload, ticketSha256: hashStage8BcPythonExecutionTicketPayload(payload) } };
}

export function validateStage8BcCheckpointEvidence(input: {
  manifest: Stage8BcModelLifecycleManifest;
  evidence: Stage8BcCheckpointEvidence;
}): Stage8BcLifecycleResult<{ checkpointFileSha256: string }> {
  const runId = input.manifest?.identity?.runId;
  const manifest = validateStage8BcModelLifecycleManifest(input.manifest);
  if (!manifest.ok) return manifest;
  const evidence = input.evidence;
  if (input.manifest.phase !== 'bc-training' || !input.manifest.allowCheckpointWrite) return fail(runId, 'bc-checkpoint-phase-forbidden');
  if (!exactKeys(evidence, checkpointEvidenceKeys)) return fail(runId, 'bc-checkpoint-schema-invalid');
  if (!checkpointMatchesLifecycleIdentity(input.manifest, evidence, true)) return fail(runId, 'bc-checkpoint-identity-or-result-invalid');
  return { ok: true, value: { checkpointFileSha256: evidence.checkpointFileSha256 } };
}

export function validateStage8BcOnnxExportEvidence(input: {
  manifest: Stage8BcModelLifecycleManifest;
  checkpoint: Stage8BcCheckpointEvidence;
  evidence: Stage8BcOnnxExportEvidence;
}): Stage8BcLifecycleResult<{ frozenModelIdentity: Stage8FrozenModelIdentityPackage }> {
  const runId = input.manifest?.identity?.runId;
  const manifest = validateStage8BcModelLifecycleManifest(input.manifest);
  if (!manifest.ok) return manifest;
  const evidence = input.evidence;
  if (input.manifest.phase !== 'bc-onnx-export' || !input.manifest.allowOnnxExport) return fail(runId, 'bc-onnx-export-phase-forbidden');
  const checkpoint = input.checkpoint;
  if (!checkpointMatchesLifecycleIdentity(input.manifest, checkpoint, false)) return fail(runId, 'bc-onnx-export-checkpoint-invalid');
  if (!exactKeys(evidence, [
    'protocolVersion','runId','modelId','lifecycleManifestSha256','checkpointEvidenceSha256','checkpointFileSha256',
    'onnxBinarySha256','modelManifestSha256','modelFileBytes','onnxFileBytes','dynamicLegalActionDimension',
    'onnxCheckerPassed','frozenModelIdentity','evidenceSha256',
  ])) return fail(runId, 'bc-onnx-export-schema-invalid');
  if (evidence.protocolVersion !== STAGE8_BC_ONNX_EXPORT_EVIDENCE_VERSION || evidence.runId !== runId || !validId(evidence.modelId)
    || evidence.lifecycleManifestSha256 !== input.manifest.manifestSha256
    || evidence.checkpointEvidenceSha256 !== input.checkpoint.evidenceSha256
    || evidence.checkpointFileSha256 !== input.checkpoint.checkpointFileSha256
    || evidence.onnxBinarySha256 !== evidence.frozenModelIdentity.onnxBinarySha256
    || evidence.modelManifestSha256 !== evidence.frozenModelIdentity.modelManifestSha256
    || evidence.modelId !== evidence.frozenModelIdentity.modelId
    || !Number.isInteger(evidence.modelFileBytes) || evidence.modelFileBytes < 1 || evidence.modelFileBytes >= STAGE8_BC_MODEL_MAX_FILE_BYTES
    || !Number.isInteger(evidence.onnxFileBytes) || evidence.onnxFileBytes < 1 || evidence.onnxFileBytes >= STAGE8_BC_MODEL_MAX_FILE_BYTES
    || evidence.dynamicLegalActionDimension !== true || evidence.onnxCheckerPassed !== true
    || !modelIdentityMatchesLifecycle(input.manifest, evidence.frozenModelIdentity)) return fail(runId, 'bc-onnx-export-identity-or-result-invalid');
  if (evidence.evidenceSha256 !== hashStage8OfflineIdentity(evidencePayload(evidence))) return fail(runId, 'bc-onnx-export-evidence-hash-mismatch');
  return { ok: true, value: { frozenModelIdentity: evidence.frozenModelIdentity } };
}

export function validateStage8BcPythonNodeParityEvidence(input: {
  manifest: Stage8BcModelLifecycleManifest;
  modelIdentity: Stage8FrozenModelIdentityPackage;
  evidence: Stage8BcPythonNodeParityEvidence;
}): Stage8BcLifecycleResult<{ maximumDifference: number }> {
  const runId = input.manifest?.identity?.runId;
  const manifest = validateStage8BcModelLifecycleManifest(input.manifest);
  if (!manifest.ok) return manifest;
  const evidence = input.evidence;
  if (input.manifest.phase !== 'bc-parity-verify') return fail(runId, 'bc-parity-phase-forbidden');
  if (!modelIdentityMatchesLifecycle(input.manifest, input.modelIdentity)) return fail(runId, 'bc-parity-model-identity-mismatch');
  if (!exactKeys(evidence, [
    'protocolVersion','runId','fixtureId','lifecycleManifestSha256','modelManifestSha256','onnxBinarySha256',
    'tensorContractSha256','visibleStateSha256','legalActionSetSha256','legalActionKeys','numericEncoding',
    'pythonPolicyLogitsFloat32Base64','nodePolicyLogitsFloat32Base64','pythonValueDeltaFloat32Base64',
    'nodeValueDeltaFloat32Base64','absoluteToleranceDecimal','maximumPolicyDifferenceDecimal','maximumValueDifferenceDecimal',
    'passed','evidenceSha256',
  ])) return fail(runId, 'bc-parity-schema-invalid');
  const pythonPolicy = decodeFloat32Base64(evidence.pythonPolicyLogitsFloat32Base64, evidence.legalActionKeys.length);
  const nodePolicy = decodeFloat32Base64(evidence.nodePolicyLogitsFloat32Base64, evidence.legalActionKeys.length);
  const pythonValue = decodeFloat32Base64(evidence.pythonValueDeltaFloat32Base64, 4);
  const nodeValue = decodeFloat32Base64(evidence.nodeValueDeltaFloat32Base64, 4);
  const policyDifference = pythonPolicy && nodePolicy
    ? Math.max(0, ...pythonPolicy.map((value, index) => Math.abs(value - nodePolicy[index])))
    : Number.POSITIVE_INFINITY;
  const valueDifference = pythonValue && nodeValue
    ? Math.max(...pythonValue.map((value, index) => Math.abs(value - nodeValue[index])))
    : Number.POSITIVE_INFINITY;
  const absoluteTolerance = Number(evidence.absoluteToleranceDecimal);
  const claimedPolicyDifference = Number(evidence.maximumPolicyDifferenceDecimal);
  const claimedValueDifference = Number(evidence.maximumValueDifferenceDecimal);
  if (evidence.protocolVersion !== STAGE8_BC_PARITY_EVIDENCE_VERSION || evidence.runId !== runId || !validId(evidence.fixtureId)
    || evidence.lifecycleManifestSha256 !== input.manifest.manifestSha256
    || evidence.modelManifestSha256 !== input.modelIdentity.modelManifestSha256
    || evidence.onnxBinarySha256 !== input.modelIdentity.onnxBinarySha256
    || evidence.tensorContractSha256 !== input.manifest.identity.tensorContractSha256
    || ![evidence.visibleStateSha256,evidence.legalActionSetSha256].every(isSha256)
    || !evidence.legalActionKeys.length || new Set(evidence.legalActionKeys).size !== evidence.legalActionKeys.length
    || evidence.legalActionKeys.some((key, index) => typeof key !== 'string' || (index > 0 && evidence.legalActionKeys[index - 1] >= key))
    || evidence.numericEncoding !== 'little-endian-float32-base64'
    || !pythonPolicy || !nodePolicy || !pythonValue || !nodeValue
    || ![evidence.absoluteToleranceDecimal,evidence.maximumPolicyDifferenceDecimal,evidence.maximumValueDifferenceDecimal].every(finiteDecimal)
    || absoluteTolerance <= 0 || absoluteTolerance > 1e-3
    || Math.abs(pythonValue.reduce((sum, value) => sum + value, 0)) > 1e-5
    || Math.abs(nodeValue.reduce((sum, value) => sum + value, 0)) > 1e-5
    || Math.abs(claimedPolicyDifference - policyDifference) > 1e-12
    || Math.abs(claimedValueDifference - valueDifference) > 1e-12
    || policyDifference > absoluteTolerance || valueDifference > absoluteTolerance || evidence.passed !== true) return fail(runId, 'bc-parity-identity-or-output-mismatch');
  if (evidence.evidenceSha256 !== hashStage8OfflineIdentity(evidencePayload(evidence))) return fail(runId, 'bc-parity-evidence-hash-mismatch');
  return { ok: true, value: { maximumDifference: Math.max(policyDifference, valueDifference) } };
}
