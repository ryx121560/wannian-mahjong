import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-smoke-runner-regression-'));
const require = createRequire(import.meta.url);
const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); compileTree(from, to); }
    else if (entry.name.endsWith('.ts')) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: from }).outputText); }
  }
}

function scenarioCoverage(scenario) {
  const coverage = {
    forcedRunKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: false },
    zhichan: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: false },
    chainKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: true },
  };
  coverage[scenario] = { ...coverage[scenario], legalOpportunities: 1, positiveBehavior: 1, selected: 1 };
  return coverage;
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const runner = require(path.join(temp, 'game/stage8/offline-smoke-runner.js'));
  const controlTools = require(path.join(temp, 'game/stage8/offline-selfplay-control.js'));
  const curriculum = require(path.join(temp, 'game/stage8/offline-curriculum-kong-zhichan-chain.js'));
  const behavior = require(path.join(temp, 'game/stage8/offline-behavior-distribution.js'));
  const providerTools = require(path.join(temp, 'game/stage8/offline-canonical-mcts-provider.js'));
  const identities = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const inferenceTools = require(path.join(temp, 'game/stage8/offline-frozen-model-inference.js'));
  const plan = curriculum.createStage8FixedCurriculumPlan(20260824);
  const fixed = sha('fixed');
  const providerIdentity = sha('provider-source-bundle');
  const identity = {
    runId: 'formal-smoke-candidate', runDomainSha256: fixed, rulesSha256: fixed,
    actionSpaceSha256: fixed, legalActionMaskSha256: fixed, featureSha256: fixed,
    visibleInformationSha256: fixed, sampleProtocolSha256: fixed, trajectoryExecutorSha256: fixed,
    selfplayRuntimeSha256: sha('runtime-source-bundle'), mctsProviderSha256: providerIdentity,
    modelFileSha256: fixed, onnxBinarySha256: fixed, modelManifestSha256: fixed,
    curriculumSha256: curriculum.hashStage8FixedCurriculumDefinition(),
    explorationSha256: behavior.hashStage8OfflineExplorationDefinition(), seedPlanSha256: plan.planSha256,
    versionedModelUri: 'https://models.example.test/stage8/v1/candidate.onnx',
  };
  const controlPayload = {
    protocolVersion: controlTools.STAGE8_OFFLINE_SMOKE_CONTROL_VERSION, identity,
    authorization: { approvalId: 'formal-smoke-approval', granted: true, scope: 'fixed-course-smoke-run' },
    curriculum: 'kong-zhichan-chain', plannedGames: 1000, candidateSeatGames: [250,250,250,250],
    scenarioRatio: { forcedRunKong: 2, zhichan: 2, chainKong: 1 }, targetedExplorationRate: 0.2,
    allowFixedCourseSmoke: true, allowTraining: false, allowSelfplayRuntime: true,
    allowReplayRuntime: false, allowModelRuntime: false, allowOnnxRuntime: false, allowCheckpoint: false,
    allowPilot: false, allowArena: false, allowChampion: false, allowProductionRuntime: false,
  };
  const control = { ...controlPayload, manifestSha256: controlTools.hashStage8OfflineSmokeControlManifestPayload(controlPayload) };
  const modelIdentity = {
    protocolVersion: inferenceTools.STAGE8_FROZEN_MODEL_PACKAGE_VERSION,
    modelId: 'candidate-model-v1', modelFileSha256: fixed, onnxBinarySha256: fixed, modelManifestSha256: fixed,
    rulesSha256: fixed, actionSpaceSha256: fixed, legalActionMaskSha256: fixed, featureSha256: fixed, visibleInformationSha256: fixed,
    versionedModelUri: identity.versionedModelUri,
    inputSchemaVersion: inferenceTools.STAGE8_MODEL_INPUT_SCHEMA_VERSION,
    policyOutputVersion: inferenceTools.STAGE8_MODEL_POLICY_OUTPUT_VERSION,
    valueOutputVersion: inferenceTools.STAGE8_MODEL_VALUE_OUTPUT_VERSION,
    inferenceContractSha256: inferenceTools.hashStage8FrozenModelInferenceContract(),
  };
  const modelInference = async (request) => {
    const payload = {
      protocolVersion: inferenceTools.STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
      modelId: modelIdentity.modelId, modelFileSha256: modelIdentity.modelFileSha256, onnxBinarySha256: modelIdentity.onnxBinarySha256,
      modelManifestSha256: modelIdentity.modelManifestSha256, inferenceContractSha256: modelIdentity.inferenceContractSha256,
      inputSha256: request.inputSha256,
      visibleStateSha256: request.visibleStateSha256,
      legalActionSetSha256: request.legalActionSetSha256,
      policyLogits: Object.fromEntries(request.legalActionKeys.map((key, index) => [key, index / Math.max(request.legalActionKeys.length, 1)])),
      valueDelta: [0,0,0,0],
    };
    return { ...payload, outputSha256: inferenceTools.hashStage8FrozenModelInferenceOutput(payload) };
  };
  const createModelEvidence = (keys, inputSha256, visibleStateSha256, evidenceIdentity = modelIdentity, legalActionSetSha256 = identities.hashStage8OfflineIdentity(keys.slice().sort())) => {
    const payload = {
      protocolVersion: inferenceTools.STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
      modelId: evidenceIdentity.modelId, modelFileSha256: evidenceIdentity.modelFileSha256, onnxBinarySha256: evidenceIdentity.onnxBinarySha256,
      modelManifestSha256: evidenceIdentity.modelManifestSha256, inferenceContractSha256: evidenceIdentity.inferenceContractSha256,
      inputSha256,
      visibleStateSha256,
      legalActionSetSha256,
      policyLogits: Object.fromEntries(keys.map((key) => [key, 0])),
      valueDelta: [0,0,0,0],
    };
    const outputSha256 = inferenceTools.hashStage8FrozenModelInferenceOutput(payload);
    return { ...payload, outputSha256, evidenceSha256: identities.hashStage8OfflineIdentity({ ...payload, outputSha256 }) };
  };
  const provider = providerTools.createStage8CanonicalMctsProvider({ providerIdentitySha256: providerIdentity, behaviorTemperature: 1, modelPolicyWeight: 0.35, modelIdentity, modelInference });
  const rootInput = { environment: { STAGE8_ARTIFACT_ROOT: 'E:\\stage8-artifacts' }, projectRoots: [root], exists: (candidate) => candidate === 'E:\\stage8-artifacts', isDirectory: (candidate) => candidate === 'E:\\stage8-artifacts' };
  const firstAssignment = runner.createStage8FormalSmokeAssignments(plan, 25, 4)[0];
  const oneGame = await runner.executeStage8FormalSmokeGame({ plan, game: plan.games[0], assignment: firstAssignment, smokeControl: control, artifactRoot: rootInput, rawDistributionProvider: provider, providerIdentitySha256: providerIdentity });
  assert.equal(oneGame.ok, true, oneGame.ok ? '' : oneGame.reason);
  assert.equal(oneGame.ledger.terminalDelta.reduce((sum, value) => sum + value, 0), 0);
  assert.ok(oneGame.ledger.transitions > 0 && oneGame.ledger.transitions <= 600);
  const replayAssignment = runner.createStage8FormalSmokeAssignments(plan, 25, 1)[0];
  const replayGame = await runner.executeStage8FormalSmokeGame({ plan, game: plan.games[0], assignment: replayAssignment, smokeControl: control, artifactRoot: rootInput, rawDistributionProvider: provider, providerIdentitySha256: providerIdentity });
  assert.equal(replayGame.ok, true, replayGame.ok ? '' : replayGame.reason);
  assert.equal(runner.hashStage8FormalSmokeGameSemanticResult(replayGame.ledger), runner.hashStage8FormalSmokeGameSemanticResult(oneGame.ledger), 'same global game index must replay identically across worker layouts');

  function fakeGames(workers) {
    const assignments = runner.createStage8FormalSmokeAssignments(plan, 25, workers);
    return plan.games.map((game) => {
      const assignment = assignments[game.gameIndex];
      const selectedAction = { actionSpaceVersion: 'stage8-action-space-v2', actionType: 'discard', actionId: 200, tile: 'wan1', context: { actor: game.candidateSeat, declarationWindow: 'self-draw-discard', ownTileCount: 1, robKongWindow: false } };
      const selectedActionKey = identities.stage8CanonicalActionKey(selectedAction);
      const decision = {
        traceStepBefore: 0,
        decisionIdentitySha256: sha(`decision-${game.gameIndex}`),
        visibleStateSha256: sha(`visible-${game.gameIndex}`),
        episodeContextSha256: sha(`context-${game.gameIndex}`),
        legalActionSetSha256: identities.hashStage8OfflineIdentity([selectedActionKey]),
        legalActionKeys: [selectedActionKey], canonicalActions: [selectedAction],
        mctsDistribution: { [selectedActionKey]: 1 }, behaviorActionDistribution: { [selectedActionKey]: 1 },
        selectedActionKey, selectedAction, behaviorActionProbability: 1, behaviorActionSource: 'mcts', exploration: false,
        records: [{ traceStep: 1, actor: game.candidateSeat, actionId: 200, actionKey: selectedActionKey, actionType: 'discard', preStateHash: sha('pre'), postStateHash: sha('post'), publicEvent: { type: 'discard', actor: game.candidateSeat, tile: 'wan1' }, settlementDelta: null }],
        publicEventSha256: sha(`event-${game.gameIndex}`), decisionSha256: '',
      };
      decision.rawDistributionEvidence = behavior.createStage8OfflineRawDistributionResult({
        request: { visibleState: { identity: decision.visibleStateSha256 }, legalActions: [selectedAction], identitySha256: providerIdentity },
        providerVersion: 'stage8-test-ledger-provider-v1',
        distribution: decision.mctsDistribution,
        details: { modelInference: createModelEvidence([selectedActionKey], sha(`model-input-${game.gameIndex}`), decision.visibleStateSha256) },
      }).evidence;
      decision.decisionSha256 = runner.hashStage8FormalSmokeDecisionLedger(decision);
      const ledger = {
        gameIndex: game.gameIndex, gameId: game.gameId, fixedSeed: game.fixedSeed,
        candidateSeat: game.candidateSeat, scenario: game.scenario,
        batchIndex: assignment.batchIndex, workerSlot: assignment.workerSlot,
        transitions: 1, traceHash: sha(`trace-${game.gameIndex}`), terminalStateSha256: sha(`state-${game.gameIndex}`),
        terminalDelta: [0,0,0,0], coverage: scenarioCoverage(game.scenario),
        canonicalActionCounts: { [game.scenario]: 1 }, decisions: [decision], semanticResultSha256: '',
      };
      ledger.semanticResultSha256 = runner.hashStage8FormalSmokeGameSemanticResult(ledger);
      return ledger;
    });
  }
  const runtime1 = { manifestSha256: sha('runtime-1'), fixedCurriculumSelfplayFingerprint: sha('fingerprint-1'), batchSize: 25, workers: 1 };
  const runtime4 = { manifestSha256: sha('runtime-4'), fixedCurriculumSelfplayFingerprint: sha('fingerprint-4'), batchSize: 25, workers: 4 };
  const games1 = fakeGames(1);
  const games4 = fakeGames(4);
  const ledger1 = runner.assembleStage8FormalSmokeLedger({ control, runtime: runtime1, modelIdentity, plan, games: games1 });
  const ledger4 = runner.assembleStage8FormalSmokeLedger({ control, runtime: runtime4, modelIdentity, plan, games: games4 });
  assert.equal(ledger1.ok, true, ledger1.ok ? '' : ledger1.reason);
  assert.equal(ledger4.ok, true, ledger4.ok ? '' : ledger4.reason);
  assert.equal(ledger1.ledger.semanticResultsSha256, ledger4.ledger.semanticResultsSha256, 'worker count cannot change per-game semantics');
  assert.equal(ledger4.ledger.completedGames, 1000);
  assert.deepEqual(ledger4.ledger.candidateSeatGames, [250,250,250,250]);
  assert.ok(ledger4.ledger.coverage.byCandidateSeat.every((seat) => seat.forcedRunKong.legalOpportunities === 100 && seat.zhichan.legalOpportunities === 100 && seat.chainKong.legalOpportunities === 50));
  const tampered = structuredClone(games4); tampered[7].terminalDelta = [1,0,0,0];
  assert.equal(runner.assembleStage8FormalSmokeLedger({ control, runtime: runtime4, modelIdentity, plan, games: tampered }).reason, 'formal-smoke-ledger-game-evidence-invalid');
  const rebindDecisionEvidence = (game, options = {}) => {
    const cloned = structuredClone(game);
    const decision = cloned.decisions[0];
    const evidenceIdentity = options.modelIdentity ?? modelIdentity;
    const modelEvidence = createModelEvidence(
      decision.legalActionKeys,
      sha(`foreign-model-input-${cloned.gameIndex}`),
      options.visibleStateSha256 ?? decision.visibleStateSha256,
      evidenceIdentity,
      options.legalActionSetSha256 ?? decision.legalActionSetSha256,
    );
    decision.rawDistributionEvidence = behavior.createStage8OfflineRawDistributionResult({
      request: { visibleState: { identity: decision.visibleStateSha256 }, legalActions: decision.canonicalActions, identitySha256: options.providerIdentitySha256 ?? providerIdentity },
      providerVersion: 'stage8-test-ledger-provider-v1',
      distribution: decision.mctsDistribution,
      details: { modelInference: modelEvidence },
    }).evidence;
    decision.decisionSha256 = runner.hashStage8FormalSmokeDecisionLedger(decision);
    cloned.semanticResultSha256 = runner.hashStage8FormalSmokeGameSemanticResult(cloned);
    return cloned;
  };
  const foreignProviderGames = games4.slice();
  foreignProviderGames[0] = rebindDecisionEvidence(foreignProviderGames[0], { providerIdentitySha256: sha('foreign-provider') });
  assert.equal(runner.assembleStage8FormalSmokeLedger({ control, runtime: runtime4, modelIdentity, plan, games: foreignProviderGames }).reason, 'formal-smoke-ledger-game-evidence-invalid');
  const foreignModel = { ...modelIdentity, modelId: 'foreign-model-v1' };
  const foreignModelGames = games4.slice();
  foreignModelGames[0] = rebindDecisionEvidence(foreignModelGames[0], { modelIdentity: foreignModel });
  assert.equal(runner.assembleStage8FormalSmokeLedger({ control, runtime: runtime4, modelIdentity, plan, games: foreignModelGames }).reason, 'formal-smoke-ledger-game-evidence-invalid');
  const wrongVisibleGames = games4.slice();
  wrongVisibleGames[0] = rebindDecisionEvidence(wrongVisibleGames[0], { visibleStateSha256: sha('foreign-visible-state') });
  assert.equal(runner.assembleStage8FormalSmokeLedger({ control, runtime: runtime4, modelIdentity, plan, games: wrongVisibleGames }).reason, 'formal-smoke-ledger-game-evidence-invalid');
  const wrongLegalSetGames = games4.slice();
  wrongLegalSetGames[0] = rebindDecisionEvidence(wrongLegalSetGames[0], { legalActionSetSha256: sha('foreign-legal-set') });
  assert.equal(runner.assembleStage8FormalSmokeLedger({ control, runtime: runtime4, modelIdentity, plan, games: wrongLegalSetGames }).reason, 'formal-smoke-ledger-game-evidence-invalid');
  assert.equal(runner.assembleStage8FormalSmokeLedger({ control, runtime: runtime4, modelIdentity: { ...modelIdentity, modelFileSha256: sha('foreign-model-file') }, plan, games: games4 }).reason, 'formal-smoke-ledger-model-identity-mismatch');

  let writes = 0;
  const denied = await runner.runStage8FormalSmoke({
    control, runtime: runtime4,
    artifactRoot: { ...rootInput, environment: {} },
    fileSystem: { exists: () => false, isDirectory: () => false, isFile: () => false, readFile: () => Buffer.alloc(0), listDirectory: () => [] },
    rawDistributionProvider: provider,
    writer: { writeImmutable: () => { writes += 1; } },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'smoke-stage8-artifact-root-required');
  assert.equal(writes, 0, 'missing runtime inputs must return before any writer call');
  console.log(JSON.stringify({
    passed: true,
    inMemoryTrueSourceGamesExecuted: 2,
    formalSmokeGamesExecuted: 0,
    plannedLedgerSlotsValidated: 1000,
    workerConfigurationsCompared: [1,4],
    workerSemanticHash: ledger4.ledger.semanticResultsSha256,
    controls: ['136-tile-initial-state','canonical-trajectory','terminal-zero-sum','600-transition-fuse','global-index-seed','worker-semantic-equivalence','coverage-ledger','provider-control-binding','preflight-model-binding','visible-state-evidence-binding','legal-action-set-evidence-binding','replay-identities','missing-input-zero-write'],
    trainingStarted: false,
    artifactsWritten: false,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
