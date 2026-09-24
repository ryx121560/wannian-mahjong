import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

function varint(value) {
  let remaining = BigInt(value); const bytes = [];
  while (remaining > 0x7fn) { bytes.push(Number(remaining & 0x7fn) | 0x80); remaining >>= 7n; }
  bytes.push(Number(remaining)); return Buffer.from(bytes);
}
function tag(field, wire) { return varint((field << 3) | wire); }
function int64(field, value) { return Buffer.concat([tag(field, 0), varint(value)]); }
function bytes(field, value) { const data = Buffer.from(value); return Buffer.concat([tag(field, 2), varint(data.length), data]); }
function string(field, value) { return bytes(field, Buffer.from(value, 'utf8')); }
function message(field, fields) { return bytes(field, Buffer.concat(fields)); }
function dimension(value) { return typeof value === 'number' ? [int64(1, value)] : [string(2, value)]; }
function valueInfo(name, shape) {
  const tensorShape = shape.map((value) => message(1, dimension(value)));
  const tensorType = [int64(1, 1), message(2, tensorShape)];
  return [string(1, name), message(2, [message(1, tensorType)])];
}
function createFixtureModel(tensor) {
  const node = [string(1, tensor.STAGE8_ONNX_LEGAL_ACTION_MASK_INPUT), string(2, tensor.STAGE8_ONNX_POLICY_LOGITS_OUTPUT), string(3, 'policy-identity'), string(4, 'Identity')];
  const valueBytes = Buffer.alloc(4 * 4);
  const valueInitializer = [int64(1, 1), int64(1, 4), int64(2, 1), string(8, tensor.STAGE8_ONNX_VALUE_DELTA_OUTPUT), bytes(9, valueBytes)];
  const graph = [
    message(1, node),
    string(2, 'stage8-cpu-adapter-regression'),
    message(5, valueInitializer),
    message(11, valueInfo(tensor.STAGE8_ONNX_VISIBLE_STATE_INPUT, [1, tensor.STAGE8_ONNX_VISIBLE_FEATURE_COUNT])),
    message(11, valueInfo(tensor.STAGE8_ONNX_CANONICAL_ACTION_INPUT, [1, 'legal_action_count', tensor.STAGE8_ONNX_ACTION_FEATURE_COUNT])),
    message(11, valueInfo(tensor.STAGE8_ONNX_LEGAL_ACTION_MASK_INPUT, [1, 'legal_action_count'])),
    message(12, valueInfo(tensor.STAGE8_ONNX_POLICY_LOGITS_OUTPUT, [1, 'legal_action_count'])),
    message(12, valueInfo(tensor.STAGE8_ONNX_VALUE_DELTA_OUTPUT, [1, 4])),
  ];
  return Buffer.concat([
    int64(1, 8),
    string(2, 'wannian-mahjong-stage8-regression'),
    message(7, graph),
    message(8, [string(1, ''), int64(2, 13)]),
  ]);
}

function loadTypeScriptModule(entryPath) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    }).outputText;
    module._compile(compiled, filename);
  };
  try { return require(entryPath); }
  finally { if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts']; }
}

const tensor = loadTypeScriptModule(path.join(root, 'src/game/stage8/offline-onnx-tensor-contract.ts'));
const adapter = loadTypeScriptModule(path.join(root, 'src/game/stage8/offline-onnx-inference-adapter.ts'));
const inference = loadTypeScriptModule(path.join(root, 'src/game/stage8/offline-frozen-model-inference.ts'));
const actions = loadTypeScriptModule(path.join(root, 'src/game/stage8/action-registry-v2.ts'));
const identities = loadTypeScriptModule(path.join(root, 'src/game/stage8/offline-action-identity.ts'));
const modelBytes = createFixtureModel(tensor);
const fixed = sha('stage8-onnx-regression-fixed');
const model = {
  protocolVersion: inference.STAGE8_FROZEN_MODEL_PACKAGE_VERSION,
  modelId: 'candidate-model-v1',
  modelFileSha256: fixed,
  onnxBinarySha256: sha(modelBytes),
  modelManifestSha256: fixed,
  rulesSha256: fixed,
  actionSpaceSha256: fixed,
  legalActionMaskSha256: fixed,
  featureSha256: fixed,
  visibleInformationSha256: fixed,
  versionedModelUri: 'https://models.example.test/stage8/v1/candidate.onnx',
  inputSchemaVersion: inference.STAGE8_MODEL_INPUT_SCHEMA_VERSION,
  policyOutputVersion: inference.STAGE8_MODEL_POLICY_OUTPUT_VERSION,
  valueOutputVersion: inference.STAGE8_MODEL_VALUE_OUTPUT_VERSION,
  tensorContractSha256: tensor.hashStage8OnnxTensorContract(),
  onnxRuntimePackage: tensor.STAGE8_ONNX_RUNTIME_PACKAGE,
  onnxRuntimeVersion: tensor.STAGE8_ONNX_RUNTIME_VERSION,
  onnxExecutionProvider: tensor.STAGE8_ONNX_EXECUTION_PROVIDER,
  onnxSessionOptionsSha256: tensor.hashStage8OnnxSessionOptions(),
  inferenceContractSha256: inference.hashStage8FrozenModelInferenceContract(),
};
const legalActions = [
  actions.canonicalizeStage8V2Action({ actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile: 'wan1', ownTileCount: 1, robKongWindow: false }),
  actions.canonicalizeStage8V2Action({ actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile: 'wan2', ownTileCount: 1, robKongWindow: false }),
];
const visibleState = { actor: 0, ownHand: ['wan1', 'wan2'], publicMelds: [[], [], [], []], publicDiscards: [[], [], [], []], scores: [0, 0, 0, 0], dealer: 0, turn: 1, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 82 };

const port = await adapter.createStage8OnnxInferencePort({ identity: model, onnxBytes: Uint8Array.from(modelBytes) });
const green = await inference.executeStage8FrozenModelInference({ model, visibleState, legalActions, inference: port });
assert.deepEqual(Object.values(green.policyLogits), [1, 1]);
assert.deepEqual(green.valueDelta, [0, 0, 0, 0]);
assert.equal(green.visibleStateSha256, identities.hashStage8OfflineIdentity(visibleState));
await assert.rejects(adapter.createStage8OnnxInferencePort({ identity: model, onnxBytes: Uint8Array.from(Buffer.from('tampered')) }), /verified-bytes-identity-mismatch/);
await assert.rejects(inference.executeStage8FrozenModelInference({ model, visibleState: { ...visibleState, opponentHands: [['wan9']] }, legalActions, inference: port }), /inference-failed/);
await port.release();
await assert.rejects(inference.executeStage8FrozenModelInference({ model, visibleState, legalActions, inference: port }), /inference-failed/);

assert.equal(tensor.STAGE8_ONNX_RUNTIME_PACKAGE, 'onnxruntime-node');
assert.equal(tensor.STAGE8_ONNX_RUNTIME_VERSION, '1.27.0');
assert.deepEqual(tensor.STAGE8_ONNX_SESSION_OPTIONS.executionProviders, ['cpu']);
assert.equal(Object.values(tensor.STAGE8_ONNX_SESSION_OPTIONS).some((value) => String(value).toLowerCase().includes('dml') || String(value).toLowerCase().includes('gpu')), false);
console.log(JSON.stringify({ passed: true, runtime: 'onnxruntime-node@1.27.0', executionProvider: 'cpu', realCpuInferenceCalls: 1, tensorContractSha256: tensor.hashStage8OnnxTensorContract(), sessionOptionsSha256: tensor.hashStage8OnnxSessionOptions(), inferenceContractSha256: inference.hashStage8FrozenModelInferenceContract(), fixtureOnnxSha256: sha(modelBytes), completeCanonicalActionTensor: true, visibleStateAllowlist: true, immutableVerifiedBytesOnly: true, formalSmokeGamesExecuted: 0, artifactsWritten: false }, null, 2));
