import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-frozen-model-inference-'));
const require = createRequire(import.meta.url);

function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); compileTree(from, to); }
    else if (entry.name.endsWith('.ts')) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: from }).outputText);
    }
  }
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const inference = require(path.join(temp, 'game/stage8/offline-frozen-model-inference.js'));
  const actions = require(path.join(temp, 'game/stage8/action-registry-v2.js'));
  const identities = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const h = identities.hashStage8OfflineIdentity;
  const model = {
    protocolVersion: inference.STAGE8_FROZEN_MODEL_PACKAGE_VERSION,
    modelId: 'candidate-model-v1',
    modelFileSha256: h('model'), onnxBinarySha256: h('onnx'), modelManifestSha256: h('manifest'),
    rulesSha256: h('rules'), actionSpaceSha256: h('actions'), legalActionMaskSha256: h('mask'),
    featureSha256: h('feature'), visibleInformationSha256: h('visible'),
    versionedModelUri: 'https://models.example.test/stage8/v1/candidate.onnx',
    inputSchemaVersion: inference.STAGE8_MODEL_INPUT_SCHEMA_VERSION,
    policyOutputVersion: inference.STAGE8_MODEL_POLICY_OUTPUT_VERSION,
    valueOutputVersion: inference.STAGE8_MODEL_VALUE_OUTPUT_VERSION,
    inferenceContractSha256: inference.hashStage8FrozenModelInferenceContract(),
  };
  const legalActions = [
    actions.canonicalizeStage8V2Action({ actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile: 'wan1', ownTileCount: 1, robKongWindow: false }),
    actions.canonicalizeStage8V2Action({ actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile: 'wan2', ownTileCount: 1, robKongWindow: false }),
  ];
  const visibleState = { actor: 0, ownHand: ['wan1','wan2'], publicMelds: [[],[],[],[]], publicDiscards: [[],[],[],[]], scores: [0,0,0,0], dealer: 0, turn: 1, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 82 };
  const makePort = (mutate = (value) => value) => async (request) => {
    const payload = {
      protocolVersion: inference.STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
      modelId: model.modelId, modelFileSha256: model.modelFileSha256, onnxBinarySha256: model.onnxBinarySha256,
      modelManifestSha256: model.modelManifestSha256, inferenceContractSha256: model.inferenceContractSha256,
      inputSha256: request.inputSha256,
      visibleStateSha256: request.visibleStateSha256,
      legalActionSetSha256: request.legalActionSetSha256,
      policyLogits: Object.fromEntries(request.legalActionKeys.map((key, index) => [key, index + 0.25])),
      valueDelta: [6,-2,-2,-2],
    };
    const changed = mutate(structuredClone(payload));
    const outputSha256 = Object.values(changed.policyLogits).every(Number.isFinite) && changed.valueDelta.every(Number.isFinite)
      ? inference.hashStage8FrozenModelInferenceOutput(changed)
      : '0'.repeat(64);
    return { ...changed, outputSha256 };
  };
  const green = await inference.executeStage8FrozenModelInference({ model, visibleState, legalActions, inference: makePort() });
  assert.deepEqual(Object.keys(green.policyLogits).sort(), legalActions.map(identities.stage8CanonicalActionKey).sort());
  assert.deepEqual(green.valueDelta, [6,-2,-2,-2]);
  assert.match(green.evidenceSha256, /^[a-f0-9]{64}$/);
  await assert.rejects(inference.executeStage8FrozenModelInference({ model, visibleState, legalActions, inference: makePort((value) => { delete value.policyLogits[Object.keys(value.policyLogits)[0]]; return value; }) }), /policy-logits-invalid/);
  await assert.rejects(inference.executeStage8FrozenModelInference({ model, visibleState, legalActions, inference: makePort((value) => { value.policyLogits[Object.keys(value.policyLogits)[0]] = Number.NaN; return value; }) }), /policy-logits-invalid/);
  await assert.rejects(inference.executeStage8FrozenModelInference({ model, visibleState, legalActions, inference: makePort((value) => { value.valueDelta = [1,0,0,0]; return value; }) }), /value-not-zero-sum/);
  await assert.rejects(inference.executeStage8FrozenModelInference({ model, visibleState, legalActions, inference: makePort((value) => { value.modelId = 'other-model-v1'; return value; }) }), /identity-mismatch/);
  let nestedRequestFrozen = false;
  await assert.rejects(inference.executeStage8FrozenModelInference({
    model,
    visibleState,
    legalActions,
    inference: async (request) => {
      nestedRequestFrozen = Object.isFrozen(request.visibleState) && Object.isFrozen(request.visibleState.ownHand) && Object.isFrozen(request.canonicalActions[0].context);
      request.visibleState.ownHand.push('wan9');
      throw new Error('mutation unexpectedly succeeded');
    },
  }), /inference-failed/);
  assert.equal(nestedRequestFrozen, true, 'all nested inference request data must be immutable');
  assert.equal(inference.validateStage8FrozenModelIdentityPackage({ ...model, versionedModelUri: 'model.onnx' }), false);
  console.log(JSON.stringify({ passed: true, completeCanonicalPolicyLogits: true, finiteZeroSumFourSeatValue: true, identityBound: true, recursivelyFrozenRequest: nestedRequestFrozen, hiddenInformationInput: 'visible-projection-only', formalSmokeGamesExecuted: 0, artifactsWritten: false }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
