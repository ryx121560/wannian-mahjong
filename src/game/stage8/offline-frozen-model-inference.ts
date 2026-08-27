import type { CanonicalStage8V2Action } from './action-registry-v2';
import { hashStage8OfflineIdentity, sortStage8CanonicalActions, stage8CanonicalActionKey } from './offline-action-identity';
import type { Stage8OfflineVisibleState } from './offline-round-adapter';

export const STAGE8_FROZEN_MODEL_INFERENCE_VERSION = 'stage8-frozen-model-inference-v1';
export const STAGE8_FROZEN_MODEL_PACKAGE_VERSION = 'stage8-model-package-v2';
export const STAGE8_MODEL_INPUT_SCHEMA_VERSION = 'stage8-visible-canonical-input-v1';
export const STAGE8_MODEL_POLICY_OUTPUT_VERSION = 'stage8-complete-canonical-policy-logits-v1';
export const STAGE8_MODEL_VALUE_OUTPUT_VERSION = 'stage8-four-seat-zero-sum-value-v1';

export interface Stage8FrozenModelIdentityPackage {
  protocolVersion: typeof STAGE8_FROZEN_MODEL_PACKAGE_VERSION;
  modelId: string;
  modelFileSha256: string;
  onnxBinarySha256: string;
  modelManifestSha256: string;
  rulesSha256: string;
  actionSpaceSha256: string;
  legalActionMaskSha256: string;
  featureSha256: string;
  visibleInformationSha256: string;
  versionedModelUri: string;
  inputSchemaVersion: typeof STAGE8_MODEL_INPUT_SCHEMA_VERSION;
  policyOutputVersion: typeof STAGE8_MODEL_POLICY_OUTPUT_VERSION;
  valueOutputVersion: typeof STAGE8_MODEL_VALUE_OUTPUT_VERSION;
  inferenceContractSha256: string;
}

export interface Stage8FrozenModelInferenceRequest {
  protocolVersion: typeof STAGE8_FROZEN_MODEL_INFERENCE_VERSION;
  model: Stage8FrozenModelIdentityPackage;
  visibleState: Stage8OfflineVisibleState;
  canonicalActions: CanonicalStage8V2Action[];
  legalActionKeys: string[];
  visibleStateSha256: string;
  legalActionSetSha256: string;
  inputSha256: string;
}

export interface Stage8FrozenModelInferenceOutput {
  protocolVersion: typeof STAGE8_FROZEN_MODEL_INFERENCE_VERSION;
  modelId: string;
  modelFileSha256: string;
  onnxBinarySha256: string;
  modelManifestSha256: string;
  inferenceContractSha256: string;
  inputSha256: string;
  visibleStateSha256: string;
  legalActionSetSha256: string;
  policyLogits: Record<string, number>;
  valueDelta: [number, number, number, number];
  outputSha256: string;
}

export interface Stage8FrozenModelInferenceEvidence extends Stage8FrozenModelInferenceOutput {
  evidenceSha256: string;
}

export type Stage8FrozenModelInferencePort = (
  request: Readonly<Stage8FrozenModelInferenceRequest>,
) => Promise<Readonly<Stage8FrozenModelInferenceOutput>>;

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
    return Boolean(uri.protocol && uri.host)
      && (/(^|\/)v[0-9][^/]*(\/|$)/i.test(uri.pathname) || uri.searchParams.has('version'));
  } catch {
    return false;
  }
}

function exactFiniteValues(keys: readonly string[], values: unknown): values is Record<string, number> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
  const actual = Object.keys(values as Record<string, unknown>).sort();
  return actual.length === keys.length
    && actual.every((key, index) => key === keys[index])
    && keys.every((key) => Number.isFinite((values as Record<string, number>)[key]));
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
    Object.freeze(value);
  }
  return value;
}

export function hashStage8FrozenModelInferenceContract(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
    inputSchemaVersion: STAGE8_MODEL_INPUT_SCHEMA_VERSION,
    policyOutputVersion: STAGE8_MODEL_POLICY_OUTPUT_VERSION,
    valueOutputVersion: STAGE8_MODEL_VALUE_OUTPUT_VERSION,
    legalActionBinding: 'sorted-complete-canonical-keys',
    hiddenInformation: 'strict-visible-projection-only',
    failureMode: 'fail-closed',
  });
}

export function hashStage8FrozenModelInferenceOutput(
  output: Omit<Stage8FrozenModelInferenceOutput, 'outputSha256'>,
): string {
  return hashStage8OfflineIdentity(output);
}

export function validateStage8FrozenModelIdentityPackage(model: Stage8FrozenModelIdentityPackage): boolean {
  return Boolean(model)
    && model.protocolVersion === STAGE8_FROZEN_MODEL_PACKAGE_VERSION
    && validId(model.modelId)
    && [
      model.modelFileSha256,
      model.onnxBinarySha256,
      model.modelManifestSha256,
      model.rulesSha256,
      model.actionSpaceSha256,
      model.legalActionMaskSha256,
      model.featureSha256,
      model.visibleInformationSha256,
      model.inferenceContractSha256,
    ].every(isSha256)
    && model.inputSchemaVersion === STAGE8_MODEL_INPUT_SCHEMA_VERSION
    && model.policyOutputVersion === STAGE8_MODEL_POLICY_OUTPUT_VERSION
    && model.valueOutputVersion === STAGE8_MODEL_VALUE_OUTPUT_VERSION
    && model.inferenceContractSha256 === hashStage8FrozenModelInferenceContract()
    && validVersionedUri(model.versionedModelUri);
}

export function validateStage8FrozenModelInferenceEvidence(
  evidence: Stage8FrozenModelInferenceEvidence,
  legalActionKeys: readonly string[],
): boolean {
  if (!evidence || evidence.protocolVersion !== STAGE8_FROZEN_MODEL_INFERENCE_VERSION) return false;
  const sortedKeys = legalActionKeys.slice().sort();
  if (!sortedKeys.length || new Set(sortedKeys).size !== sortedKeys.length || !exactFiniteValues(sortedKeys, evidence.policyLogits)) return false;
  if (![evidence.modelFileSha256, evidence.onnxBinarySha256, evidence.modelManifestSha256, evidence.inferenceContractSha256, evidence.inputSha256, evidence.visibleStateSha256, evidence.legalActionSetSha256].every(isSha256)) return false;
  if (!validId(evidence.modelId) || !Array.isArray(evidence.valueDelta) || evidence.valueDelta.length !== 4 || !evidence.valueDelta.every(Number.isFinite) || Math.abs(evidence.valueDelta.reduce((sum, value) => sum + value, 0)) > 1e-9) return false;
  const normalized = {
    protocolVersion: evidence.protocolVersion,
    modelId: evidence.modelId,
    modelFileSha256: evidence.modelFileSha256,
    onnxBinarySha256: evidence.onnxBinarySha256,
    modelManifestSha256: evidence.modelManifestSha256,
    inferenceContractSha256: evidence.inferenceContractSha256,
    inputSha256: evidence.inputSha256,
    visibleStateSha256: evidence.visibleStateSha256,
    legalActionSetSha256: evidence.legalActionSetSha256,
    policyLogits: Object.fromEntries(sortedKeys.map((key) => [key, evidence.policyLogits[key]])),
    valueDelta: evidence.valueDelta.slice() as [number, number, number, number],
  };
  const outputSha256 = hashStage8FrozenModelInferenceOutput(normalized);
  return evidence.outputSha256 === outputSha256
    && evidence.evidenceSha256 === hashStage8OfflineIdentity({ ...normalized, outputSha256 });
}

/** Calls an injected frozen-model/ONNX inference boundary and validates every returned field. */
export async function executeStage8FrozenModelInference(input: {
  model: Stage8FrozenModelIdentityPackage;
  visibleState: Stage8OfflineVisibleState;
  legalActions: readonly CanonicalStage8V2Action[];
  inference: Stage8FrozenModelInferencePort;
}): Promise<Stage8FrozenModelInferenceEvidence> {
  if (!validateStage8FrozenModelIdentityPackage(input.model)) throw new Error('frozen-model-identity-invalid');
  if (typeof input.inference !== 'function') throw new Error('frozen-model-inference-port-required');
  const canonicalActions = sortStage8CanonicalActions(input.legalActions);
  const legalActionKeys = canonicalActions.map(stage8CanonicalActionKey);
  if (!legalActionKeys.length || new Set(legalActionKeys).size !== legalActionKeys.length) throw new Error('frozen-model-legal-actions-invalid');
  const requestBase = {
    protocolVersion: STAGE8_FROZEN_MODEL_INFERENCE_VERSION as typeof STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
    model: structuredClone(input.model),
    visibleState: structuredClone(input.visibleState),
    canonicalActions: structuredClone(canonicalActions),
    legalActionKeys,
    visibleStateSha256: hashStage8OfflineIdentity(input.visibleState),
    legalActionSetSha256: hashStage8OfflineIdentity(legalActionKeys),
  };
  const request: Stage8FrozenModelInferenceRequest = {
    ...requestBase,
    inputSha256: hashStage8OfflineIdentity(requestBase),
  };
  let output: Readonly<Stage8FrozenModelInferenceOutput>;
  try {
    output = await input.inference(deepFreeze(request));
  } catch {
    throw new Error('frozen-model-inference-failed');
  }
  if (hashStage8OfflineIdentity(requestBase) !== request.inputSha256) throw new Error('frozen-model-inference-request-mutated');
  const identityMatches = output
    && output.protocolVersion === STAGE8_FROZEN_MODEL_INFERENCE_VERSION
    && output.modelId === input.model.modelId
    && output.modelFileSha256 === input.model.modelFileSha256
    && output.onnxBinarySha256 === input.model.onnxBinarySha256
    && output.modelManifestSha256 === input.model.modelManifestSha256
    && output.inferenceContractSha256 === input.model.inferenceContractSha256
    && output.inputSha256 === request.inputSha256
    && output.visibleStateSha256 === request.visibleStateSha256
    && output.legalActionSetSha256 === request.legalActionSetSha256;
  if (!identityMatches) throw new Error('frozen-model-inference-identity-mismatch');
  const sortedKeys = legalActionKeys.slice().sort();
  if (!exactFiniteValues(sortedKeys, output.policyLogits)) throw new Error('frozen-model-policy-logits-invalid');
  if (!Array.isArray(output.valueDelta) || output.valueDelta.length !== 4 || !output.valueDelta.every(Number.isFinite)) throw new Error('frozen-model-value-invalid');
  if (Math.abs(output.valueDelta.reduce((sum, value) => sum + value, 0)) > 1e-9) throw new Error('frozen-model-value-not-zero-sum');
  const normalized = {
    protocolVersion: output.protocolVersion,
    modelId: output.modelId,
    modelFileSha256: output.modelFileSha256,
    onnxBinarySha256: output.onnxBinarySha256,
    modelManifestSha256: output.modelManifestSha256,
    inferenceContractSha256: output.inferenceContractSha256,
    inputSha256: output.inputSha256,
    visibleStateSha256: output.visibleStateSha256,
    legalActionSetSha256: output.legalActionSetSha256,
    policyLogits: Object.fromEntries(sortedKeys.map((key) => [key, output.policyLogits[key]])),
    valueDelta: output.valueDelta.slice() as [number, number, number, number],
  };
  const outputSha256 = hashStage8FrozenModelInferenceOutput(normalized);
  if (output.outputSha256 !== outputSha256) throw new Error('frozen-model-output-hash-mismatch');
  const evidence = {
    ...normalized,
    outputSha256,
    evidenceSha256: hashStage8OfflineIdentity({ ...normalized, outputSha256 }),
  };
  if (!validateStage8FrozenModelInferenceEvidence(evidence, sortedKeys)) throw new Error('frozen-model-evidence-invalid');
  return evidence;
}
