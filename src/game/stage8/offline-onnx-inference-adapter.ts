import * as ort from 'onnxruntime-node';
import { createHash } from 'node:crypto';
import {
  STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
  hashStage8FrozenModelInferenceOutput,
  validateStage8FrozenModelIdentityPackage,
  type Stage8FrozenModelIdentityPackage,
  type Stage8FrozenModelInferenceOutput,
  type Stage8FrozenModelInferencePort,
  type Stage8FrozenModelInferenceRequest,
} from './offline-frozen-model-inference';
import {
  STAGE8_ONNX_ACTION_FEATURE_COUNT,
  STAGE8_ONNX_CANONICAL_ACTION_INPUT,
  STAGE8_ONNX_EXECUTION_PROVIDER,
  STAGE8_ONNX_LEGAL_ACTION_MASK_INPUT,
  STAGE8_ONNX_POLICY_LOGITS_OUTPUT,
  STAGE8_ONNX_RUNTIME_PACKAGE,
  STAGE8_ONNX_RUNTIME_VERSION,
  STAGE8_ONNX_SESSION_OPTIONS,
  STAGE8_ONNX_VALUE_DELTA_OUTPUT,
  STAGE8_ONNX_VISIBLE_FEATURE_COUNT,
  STAGE8_ONNX_VISIBLE_STATE_INPUT,
  encodeStage8OnnxTensorBatch,
  hashStage8OnnxSessionOptions,
  hashStage8OnnxTensorContract,
} from './offline-onnx-tensor-contract';

export interface Stage8OnnxInferencePort extends Stage8FrozenModelInferencePort {
  release(): Promise<void>;
}

export interface Stage8OnnxRuntimeBoundary {
  createSession(bytes: Uint8Array, options: Readonly<typeof STAGE8_ONNX_SESSION_OPTIONS>): Promise<ort.InferenceSession>;
  createFloat32Tensor(data: Float32Array, dimensions: readonly number[]): ort.Tensor;
}

const inputNames = Object.freeze([
  STAGE8_ONNX_VISIBLE_STATE_INPUT,
  STAGE8_ONNX_CANONICAL_ACTION_INPUT,
  STAGE8_ONNX_LEGAL_ACTION_MASK_INPUT,
]);
const outputNames = Object.freeze([STAGE8_ONNX_POLICY_LOGITS_OUTPUT, STAGE8_ONNX_VALUE_DELTA_OUTPUT]);

function sameNames(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.slice().sort().every((name, index) => name === expected.slice().sort()[index]);
}

function tensorMetadata(session: ort.InferenceSession, name: string, output = false): ort.InferenceSession.TensorValueMetadata | null {
  const metadata = (output ? session.outputMetadata : session.inputMetadata).find((entry) => entry.name === name);
  return metadata?.isTensor ? metadata : null;
}

function validateSessionContract(session: ort.InferenceSession): void {
  if (!sameNames(session.inputNames, inputNames) || !sameNames(session.outputNames, outputNames)) throw new Error('stage8-onnx-session-io-names-invalid');
  const visible = tensorMetadata(session, STAGE8_ONNX_VISIBLE_STATE_INPUT);
  const actions = tensorMetadata(session, STAGE8_ONNX_CANONICAL_ACTION_INPUT);
  const mask = tensorMetadata(session, STAGE8_ONNX_LEGAL_ACTION_MASK_INPUT);
  const policy = tensorMetadata(session, STAGE8_ONNX_POLICY_LOGITS_OUTPUT, true);
  const value = tensorMetadata(session, STAGE8_ONNX_VALUE_DELTA_OUTPUT, true);
  if (![visible, actions, mask, policy, value].every((item) => item?.type === 'float32')) throw new Error('stage8-onnx-session-io-type-invalid');
  const actionDimension = actions!.shape[1];
  if (visible!.shape.length !== 2 || visible!.shape[0] !== 1 || visible!.shape[1] !== STAGE8_ONNX_VISIBLE_FEATURE_COUNT
    || actions!.shape.length !== 3 || actions!.shape[0] !== 1 || typeof actionDimension !== 'string' || !actionDimension || actions!.shape[2] !== STAGE8_ONNX_ACTION_FEATURE_COUNT
    || mask!.shape.length !== 2 || mask!.shape[0] !== 1 || mask!.shape[1] !== actionDimension
    || policy!.shape.length !== 2 || policy!.shape[0] !== 1 || policy!.shape[1] !== actionDimension
    || value!.shape.length !== 2 || value!.shape[0] !== 1 || value!.shape[1] !== 4) throw new Error('stage8-onnx-session-io-shape-invalid');
}

function float32Output(value: ort.OnnxValue | undefined, expectedLength: number, error: string): Float32Array {
  if (!value || !(value instanceof ort.Tensor) || value.type !== 'float32' || value.dims.reduce((product, dimension) => product * dimension, 1) !== expectedLength || !(value.data instanceof Float32Array)) throw new Error(error);
  if (!Array.from(value.data).every(Number.isFinite)) throw new Error(error);
  return value.data;
}

function defaultRuntime(): Stage8OnnxRuntimeBoundary {
  return {
    createSession: async (bytes, options) => ort.InferenceSession.create(Uint8Array.from(bytes).buffer, {
      ...options,
      executionProviders: options.executionProviders.slice(),
    }),
    createFloat32Tensor: (data, dimensions) => new ort.Tensor('float32', data, dimensions),
  };
}

/** Creates a CPU-only inference session from already verified immutable ONNX bytes. */
export async function createStage8OnnxInferencePort(input: {
  identity: Stage8FrozenModelIdentityPackage;
  onnxBytes: Uint8Array;
  runtime?: Stage8OnnxRuntimeBoundary;
}): Promise<Stage8OnnxInferencePort> {
  if (!validateStage8FrozenModelIdentityPackage(input.identity)) throw new Error('stage8-onnx-model-identity-invalid');
  if (!(input.onnxBytes instanceof Uint8Array) || !input.onnxBytes.length) throw new Error('stage8-onnx-verified-bytes-required');
  if (createHash('sha256').update(input.onnxBytes).digest('hex') !== input.identity.onnxBinarySha256) throw new Error('stage8-onnx-verified-bytes-identity-mismatch');
  if (input.identity.tensorContractSha256 !== hashStage8OnnxTensorContract()
    || input.identity.onnxRuntimePackage !== STAGE8_ONNX_RUNTIME_PACKAGE
    || input.identity.onnxRuntimeVersion !== STAGE8_ONNX_RUNTIME_VERSION
    || input.identity.onnxExecutionProvider !== STAGE8_ONNX_EXECUTION_PROVIDER
    || input.identity.onnxSessionOptionsSha256 !== hashStage8OnnxSessionOptions()) throw new Error('stage8-onnx-runtime-identity-invalid');
  const runtime = input.runtime ?? defaultRuntime();
  const verifiedBytes = Uint8Array.from(input.onnxBytes);
  let session: ort.InferenceSession;
  try {
    session = await runtime.createSession(verifiedBytes, STAGE8_ONNX_SESSION_OPTIONS);
    validateSessionContract(session);
  } catch (error) {
    throw new Error('stage8-onnx-session-initialization-failed', { cause: error });
  }
  let released = false;
  const port = async (request: Readonly<Stage8FrozenModelInferenceRequest>): Promise<Readonly<Stage8FrozenModelInferenceOutput>> => {
    if (released) throw new Error('stage8-onnx-session-released');
    if (request.model.onnxBinarySha256 !== input.identity.onnxBinarySha256 || request.model.inferenceContractSha256 !== input.identity.inferenceContractSha256) throw new Error('stage8-onnx-request-model-identity-mismatch');
    const batch = encodeStage8OnnxTensorBatch({ visibleState: request.visibleState, legalActions: request.canonicalActions });
    if (batch.visibleStateSha256 !== request.visibleStateSha256 || batch.legalActionSetSha256 !== request.legalActionSetSha256
      || batch.legalActionKeys.length !== request.legalActionKeys.length
      || !batch.legalActionKeys.every((key, index) => key === request.legalActionKeys[index])) throw new Error('stage8-onnx-request-step-identity-mismatch');
    let results: ort.InferenceSession.ReturnType;
    try {
      results = await session.run({
        [STAGE8_ONNX_VISIBLE_STATE_INPUT]: runtime.createFloat32Tensor(batch.visibleState, batch.visibleStateDimensions),
        [STAGE8_ONNX_CANONICAL_ACTION_INPUT]: runtime.createFloat32Tensor(batch.canonicalActionFeatures, batch.canonicalActionDimensions),
        [STAGE8_ONNX_LEGAL_ACTION_MASK_INPUT]: runtime.createFloat32Tensor(batch.legalActionMask, batch.legalActionMaskDimensions),
      }, outputNames);
    } catch (error) {
      throw new Error('stage8-onnx-inference-run-failed', { cause: error });
    }
    const policy = float32Output(results[STAGE8_ONNX_POLICY_LOGITS_OUTPUT], batch.legalActionKeys.length, 'stage8-onnx-policy-output-invalid');
    const value = float32Output(results[STAGE8_ONNX_VALUE_DELTA_OUTPUT], 4, 'stage8-onnx-value-output-invalid');
    const payload = {
      protocolVersion: STAGE8_FROZEN_MODEL_INFERENCE_VERSION as typeof STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
      modelId: input.identity.modelId,
      modelFileSha256: input.identity.modelFileSha256,
      onnxBinarySha256: input.identity.onnxBinarySha256,
      modelManifestSha256: input.identity.modelManifestSha256,
      inferenceContractSha256: input.identity.inferenceContractSha256,
      inputSha256: request.inputSha256,
      visibleStateSha256: request.visibleStateSha256,
      legalActionSetSha256: request.legalActionSetSha256,
      policyLogits: Object.fromEntries(batch.legalActionKeys.map((key, index) => [key, policy[index]])),
      valueDelta: Array.from(value) as [number, number, number, number],
    };
    return Object.freeze({ ...payload, outputSha256: hashStage8FrozenModelInferenceOutput(payload) });
  };
  return Object.assign(port, {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      await session.release();
    },
  });
}
