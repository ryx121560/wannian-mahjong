import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-canonical-mcts-'));
const require = createRequire(import.meta.url);

function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      compileTree(from, to);
    } else if (entry.name.endsWith('.ts')) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: from,
      }).outputText);
    }
  }
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const providerTools = require(path.join(temp, 'game/stage8/offline-canonical-mcts-provider.js'));
  const actions = require(path.join(temp, 'game/stage8/action-registry-v2.js'));
  const identities = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const inferenceTools = require(path.join(temp, 'game/stage8/offline-frozen-model-inference.js'));
  const mcts = require(path.join(temp, 'game/mcts/mcts-enhancement-engine.js'));
  const identity = identities.hashStage8OfflineIdentity('canonical-mcts-source-bundle');
  const visibleState = {
    actor: 0,
    ownHand: ['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8','wan9','tong1','tong2','tong3','tong4','tong5'],
    publicMelds: [[],[],[],[]],
    publicDiscards: [[],['wan1'],['tong9'],['nan']],
    scores: [0,0,0,0],
    dealer: 0,
    turn: 18,
    phase: 'discarding',
    currentPlayer: 0,
    wallRemainingCount: 70,
  };
  const legalActions = [
    ...['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8'].map((tile) => actions.canonicalizeStage8V2Action({ actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile, ownTileCount: 1, robKongWindow: false })),
    actions.canonicalizeStage8V2Action({ actionType: 'win', actor: 0, declarationWindow: 'self-draw-discard', robKongWindow: false }),
    actions.canonicalizeStage8V2Action({ actionType: 'normalConcealedKong', actor: 0, declarationWindow: 'self-draw-discard', tile: 'wan9', ownTileCount: 4, robKongWindow: false }),
  ];
  const modelIdentity = {
    protocolVersion: inferenceTools.STAGE8_FROZEN_MODEL_PACKAGE_VERSION,
    modelId: 'candidate-model-v1',
    modelFileSha256: identities.hashStage8OfflineIdentity('model'),
    onnxBinarySha256: identities.hashStage8OfflineIdentity('onnx'),
    modelManifestSha256: identities.hashStage8OfflineIdentity('manifest'),
    rulesSha256: identities.hashStage8OfflineIdentity('rules'),
    actionSpaceSha256: identities.hashStage8OfflineIdentity('actions'),
    legalActionMaskSha256: identities.hashStage8OfflineIdentity('mask'),
    featureSha256: identities.hashStage8OfflineIdentity('features'),
    visibleInformationSha256: identities.hashStage8OfflineIdentity('visible'),
    versionedModelUri: 'https://models.example.test/stage8/v1/candidate.onnx',
    inputSchemaVersion: inferenceTools.STAGE8_MODEL_INPUT_SCHEMA_VERSION,
    policyOutputVersion: inferenceTools.STAGE8_MODEL_POLICY_OUTPUT_VERSION,
    valueOutputVersion: inferenceTools.STAGE8_MODEL_VALUE_OUTPUT_VERSION,
    inferenceContractSha256: inferenceTools.hashStage8FrozenModelInferenceContract(),
  };
  let inferenceCalls = 0;
  const preferredKey = identities.stage8CanonicalActionKey(legalActions[0]);
  const modelInference = async (request) => {
    inferenceCalls += 1;
    assert.deepEqual(request.legalActionKeys.slice().sort(), legalActions.map(identities.stage8CanonicalActionKey).sort());
    const payload = {
      protocolVersion: inferenceTools.STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
      modelId: modelIdentity.modelId,
      modelFileSha256: modelIdentity.modelFileSha256,
      onnxBinarySha256: modelIdentity.onnxBinarySha256,
      modelManifestSha256: modelIdentity.modelManifestSha256,
      inferenceContractSha256: modelIdentity.inferenceContractSha256,
      inputSha256: request.inputSha256,
      visibleStateSha256: request.visibleStateSha256,
      legalActionSetSha256: request.legalActionSetSha256,
      policyLogits: Object.fromEntries(request.legalActionKeys.map((key) => [key, key === preferredKey ? 9 : -2])),
      valueDelta: [3, -1, -1, -1],
    };
    return { ...payload, outputSha256: inferenceTools.hashStage8FrozenModelInferenceOutput(payload) };
  };
  const providerConfig = { providerIdentitySha256: identity, behaviorTemperature: 1.25, modelPolicyWeight: 0.4, modelIdentity, modelInference };
  const provider = providerTools.createStage8CanonicalMctsProvider(providerConfig);
  const request = { visibleState, legalActions, identitySha256: identity };
  const first = await provider(request);
  const second = await provider(structuredClone(request));
  const keys = legalActions.map(identities.stage8CanonicalActionKey).sort();
  assert.deepEqual(Object.keys(first.distribution).sort(), keys, 'all canonical candidates must be represented');
  assert.ok(keys.length > 6, 'regression exceeds the production summary top-six surface');
  assert.ok(Object.values(first.distribution).every((value) => Number.isFinite(value) && value > 0));
  assert.ok(Math.abs(Object.values(first.distribution).reduce((sum, value) => sum + value, 0) - 1) <= 1e-12);
  assert.ok(first.distribution[preferredKey] > Math.min(...Object.values(first.distribution)), 'model policy must audibly influence the fused distribution');
  assert.equal(first.evidence.details.modelInference.valueDelta.reduce((sum, value) => sum + value, 0), 0);
  assert.deepEqual(second, first, 'same visible input and identity must be deterministic');
  assert.equal(inferenceCalls, 2, 'one frozen-model call is required per provider decision');
  const mctsContext = {
    turn: visibleState.turn, player: 0, phase: 'discarding', scores: visibleState.scores,
    discards: visibleState.publicDiscards, melds: [], handSummary: visibleState.ownHand,
    candidates: legalActions.map((action) => ({ id: identities.stage8CanonicalActionKey(action), action: action.actionType === 'discard' ? 'discard' : action.actionType === 'win' ? 'win' : 'kong', tile: action.tile, legal: true, baseScore: 0 })),
  };
  assert.equal(mcts.scoreMctsCandidateValues(mctsContext).length, legalActions.length, 'existing MCTS exports every legal score');
  await assert.rejects(provider({ ...request, identitySha256: identities.hashStage8OfflineIdentity('wrong') }), /identity-mismatch/);
  await assert.rejects(provider({ ...request, visibleState: { ...visibleState, opponentHands: [['bai']] } }), /visible-state-invalid/, 'hidden fields fail closed');
  const definitionInput = { behaviorTemperature: 1.25, modelPolicyWeight: 0.4, modelManifestSha256: modelIdentity.modelManifestSha256, inferenceContractSha256: modelIdentity.inferenceContractSha256 };
  assert.equal(providerTools.hashStage8CanonicalMctsProviderDefinition(definitionInput), providerTools.hashStage8CanonicalMctsProviderDefinition(definitionInput));
  console.log(JSON.stringify({
    passed: true,
    canonicalCandidates: keys.length,
    distributionSum: Object.values(first.distribution).reduce((sum, value) => sum + value, 0),
    frozenModelInferenceCalls: inferenceCalls,
    modelPolicyInfluencedDistribution: true,
    existingMctsFullScoreSurface: true,
    productionDecisionSemanticsChanged: false,
    formalSmokeGamesExecuted: 0,
    artifactsWritten: false,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
