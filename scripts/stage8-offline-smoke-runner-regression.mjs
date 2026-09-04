import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-smoke-runner-regression-'));
const require = createRequire(import.meta.url);
const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

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
  const runner = require(path.join(temp, 'game/stage8/offline-smoke-runner.js'));
  const preflightTools = require(path.join(temp, 'game/stage8/offline-smoke-runtime-preflight.js'));
  const controlTools = require(path.join(temp, 'game/stage8/offline-selfplay-control.js'));
  const curriculum = require(path.join(temp, 'game/stage8/offline-curriculum-kong-zhichan-chain.js'));
  const behavior = require(path.join(temp, 'game/stage8/offline-behavior-distribution.js'));
  const identityTools = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const inferenceTools = require(path.join(temp, 'game/stage8/offline-frozen-model-inference.js'));
  const tensorTools = require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js'));

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
    curriculum: 'kong-zhichan-chain', plannedGames: 1000, candidateSeatGames: [250, 250, 250, 250],
    scenarioRatio: { forcedRunKong: 2, zhichan: 2, chainKong: 1 }, targetedExplorationRate: 0.2,
    allowFixedCourseSmoke: true, allowTraining: false, allowSelfplayRuntime: true,
    allowReplayRuntime: false, allowModelRuntime: false, allowOnnxRuntime: false, allowCheckpoint: false,
    allowPilot: false, allowArena: false, allowChampion: false, allowProductionRuntime: false,
  };
  const control = { ...controlPayload, manifestSha256: controlTools.hashStage8OfflineSmokeControlManifestPayload(controlPayload) };
  const modelIdentity = {
    protocolVersion: inferenceTools.STAGE8_FROZEN_MODEL_PACKAGE_VERSION,
    modelId: 'candidate-model-v1', modelFileSha256: fixed, onnxBinarySha256: fixed, modelManifestSha256: fixed,
    rulesSha256: fixed, actionSpaceSha256: fixed, legalActionMaskSha256: fixed, featureSha256: fixed,
    visibleInformationSha256: fixed, versionedModelUri: identity.versionedModelUri,
    inputSchemaVersion: inferenceTools.STAGE8_MODEL_INPUT_SCHEMA_VERSION,
    policyOutputVersion: inferenceTools.STAGE8_MODEL_POLICY_OUTPUT_VERSION,
    valueOutputVersion: inferenceTools.STAGE8_MODEL_VALUE_OUTPUT_VERSION,
    tensorContractSha256: tensorTools.hashStage8OnnxTensorContract(),
    onnxRuntimePackage: tensorTools.STAGE8_ONNX_RUNTIME_PACKAGE,
    onnxRuntimeVersion: tensorTools.STAGE8_ONNX_RUNTIME_VERSION,
    onnxExecutionProvider: tensorTools.STAGE8_ONNX_EXECUTION_PROVIDER,
    onnxSessionOptionsSha256: tensorTools.hashStage8OnnxSessionOptions(),
    inferenceContractSha256: inferenceTools.hashStage8FrozenModelInferenceContract(),
  };
  const modelInference = async (request) => {
    const payload = {
      protocolVersion: inferenceTools.STAGE8_FROZEN_MODEL_INFERENCE_VERSION,
      modelId: modelIdentity.modelId, modelFileSha256: modelIdentity.modelFileSha256,
      onnxBinarySha256: modelIdentity.onnxBinarySha256, modelManifestSha256: modelIdentity.modelManifestSha256,
      inferenceContractSha256: modelIdentity.inferenceContractSha256, inputSha256: request.inputSha256,
      visibleStateSha256: request.visibleStateSha256, legalActionSetSha256: request.legalActionSetSha256,
      policyLogits: Object.fromEntries(request.legalActionKeys.map((key, index) => [key, index / Math.max(request.legalActionKeys.length, 1)])),
      valueDelta: [0, 0, 0, 0],
    };
    return { ...payload, outputSha256: inferenceTools.hashStage8FrozenModelInferenceOutput(payload) };
  };
  const provider = async (request) => {
    const actions = identityTools.sortStage8CanonicalActions(request.legalActions);
    const priority = [
      'win', 'directChisel', 'forcedRunImmediate', 'forcedRunDeferred', 'chainKong',
      'normalConcealedKong', 'addedKong', 'forcedRunConcealed',
      'postPongCandidateConcealedKong', 'doublePongForcedRun', 'pong', 'pass', 'discard',
    ];
    let selected = actions.find((action) => action.actionType === 'discard' && /9$/.test(action.tile || ''));
    if (!selected || request.visibleState.phase !== 'discarding') {
      selected = priority.map((type) => actions.find((action) => action.actionType === type)).find(Boolean);
    }
    assert.ok(selected, 'in-memory provider must select an executable canonical action');
    const selectedKey = identityTools.stage8CanonicalActionKey(selected);
    const keys = actions.map(identityTools.stage8CanonicalActionKey);
    const distribution = Object.fromEntries(keys.map((key) => [key, key === selectedKey ? 1 : 0]));
    const modelEvidence = await inferenceTools.executeStage8FrozenModelInference({
      model: modelIdentity, visibleState: request.visibleState, legalActions: actions, inference: modelInference,
    });
    return behavior.createStage8OfflineRawDistributionResult({
      request, providerVersion: 'stage8-in-memory-executable-canonical-provider-v1', distribution,
      details: { modelInference: modelEvidence, selectionBoundary: 'test-only-no-formal-smoke' },
    });
  };
  const rootInput = {
    environment: { STAGE8_ARTIFACT_ROOT: 'E:\\stage8-artifacts' }, projectRoots: [root],
    exists: (candidate) => candidate === 'E:\\stage8-artifacts',
    isDirectory: (candidate) => candidate === 'E:\\stage8-artifacts',
  };
  const runtimeFor = (workers) => ({
    manifestSha256: sha(`runtime-${workers}`), fixedCurriculumSelfplayFingerprint: sha(`fingerprint-${workers}`),
    providerSourceBundleSha256: sha('provider-source-bundle'),
    runtimeSourceBundleSha256: sha('runtime-source-bundle'),
    batchSize: 1, workers, curriculumOverride: controlTools.STAGE8_OFFLINE_SMOKE_CURRICULUM,
    behaviorTemperature: 1,
  });

  async function executeProofGame(workers) {
    const assignments = [runner.createStage8FormalSmokeAssignments(plan, 1, workers)[2]];
    const games = [];
    for (const assignment of assignments) {
      const result = await runner.executeStage8FormalSmokeGame({
        plan, game: plan.games[assignment.gameIndex], assignment, smokeControl: control,
        artifactRoot: rootInput, rawDistributionProvider: provider, providerIdentitySha256: providerIdentity,
      });
      assert.equal(result.ok, true, result.ok ? '' : `${result.gameId}: ${result.reason}`);
      assert.equal(result.ledger.terminalDelta.reduce((sum, value) => sum + value, 0), 0);
      assert.ok(result.ledger.transitions > 0 && result.ledger.transitions <= 600);
      assert.deepEqual(result.ledger.coverage, runner.deriveStage8FormalSmokeGameCoverage(result.ledger.candidateSeat, result.ledger.decisions));
      games.push(result.ledger);
    }
    return games;
  }

  const gamesByWorkers = new Map();
  for (const workers of [1, 2, 4]) gamesByWorkers.set(workers, await executeProofGame(workers));
  const semanticHashes = [...gamesByWorkers.entries()].map(([workers, games]) => ({
    workers,
    gameHashes: games.map(runner.hashStage8FormalSmokeGameSemanticResult),
    batchSemanticHash: runner.hashStage8FormalSmokeSemanticResults(games),
  }));
  assert.deepEqual(semanticHashes[0].gameHashes, semanticHashes[1].gameHashes);
  assert.deepEqual(semanticHashes[0].gameHashes, semanticHashes[2].gameHashes);
  assert.equal(semanticHashes[0].batchSemanticHash, semanticHashes[1].batchSemanticHash);
  assert.equal(semanticHashes[0].batchSemanticHash, semanticHashes[2].batchSemanticHash);
  assert.deepEqual([...gamesByWorkers.values()].map((games) => games[0].workerSlot), [0, 0, 2]);

  const batches = [];
  const priorBatchSha256 = sha('verified-prior-batch');
  for (const workers of [1, 2, 4]) {
    const assembled = runner.assembleStage8FormalSmokeBatchLedger({
      control, runtime: runtimeFor(workers), modelIdentity, plan, batchIndex: 2,
      previousBatchSha256: priorBatchSha256, games: gamesByWorkers.get(workers),
    });
    assert.equal(assembled.ok, true, assembled.ok ? '' : assembled.reason);
    assert.equal(assembled.ledger.completedGames, 1);
    assert.equal(assembled.ledger.fixedSeeds.length, 1);
    assert.equal(assembled.ledger.previousBatchSha256, priorBatchSha256);
    assert.equal(assembled.ledger.modelFileSha256, modelIdentity.modelFileSha256);
    assert.equal(assembled.ledger.onnxBinarySha256, modelIdentity.onnxBinarySha256);
    assert.equal(assembled.ledger.modelManifestSha256, modelIdentity.modelManifestSha256);
    assert.equal(assembled.ledger.providerSourceBundleSha256, runtimeFor(workers).providerSourceBundleSha256);
    assert.equal(assembled.ledger.runtimeSourceBundleSha256, runtimeFor(workers).runtimeSourceBundleSha256);
    assert.equal(assembled.ledger.batchSha256, runner.hashStage8FormalSmokeBatchLedger(assembled.ledger));
    batches.push(assembled.ledger);
  }
  const tamperedBatch = structuredClone(batches[2]);
  tamperedBatch.games[0].coverage.zhichan.legalOpportunities += 1;
  tamperedBatch.games[0].semanticResultSha256 = runner.hashStage8FormalSmokeGameSemanticResult(tamperedBatch.games[0]);
  const tamperedAssembly = runner.assembleStage8FormalSmokeBatchLedger({
    control, runtime: runtimeFor(4), modelIdentity, plan, batchIndex: 2,
    previousBatchSha256: priorBatchSha256, games: tamperedBatch.games,
  });
  assert.equal(tamperedAssembly.reason, 'formal-smoke-ledger-game-evidence-invalid', 'coverage cannot be declared without a canonical opportunity');
  assert.equal(runner.assembleStage8FormalSmokeLedger({
    control, runtime: runtimeFor(4), modelIdentity, plan, batches: [batches[2]],
  }).reason, 'formal-smoke-ledger-batch-count-invalid', 'partial batches can never become a final ledger');

  const limits = preflightTools.STAGE8_FORMAL_SMOKE_CAPACITY_LIMITS;
  assert.equal(preflightTools.validateStage8FormalSmokeCapacity({
    snapshot: { totalBytes: 1000, freeBytes: 500, runBytes: 100 }, pendingBytes: 100,
    maxRunBytes: limits.maxRunBytes, maxVolumeUsedRatio: limits.maxVolumeUsedRatio,
  }), null);
  assert.equal(preflightTools.validateStage8FormalSmokeCapacity({
    snapshot: { totalBytes: 1000, freeBytes: 201, runBytes: 0 }, pendingBytes: 1,
    maxRunBytes: limits.maxRunBytes, maxVolumeUsedRatio: limits.maxVolumeUsedRatio,
  }), 'formal-smoke-volume-used-ratio-fused');
  assert.equal(preflightTools.validateStage8FormalSmokeCapacity({
    snapshot: { totalBytes: 1000, freeBytes: 10, runBytes: 0 }, pendingBytes: 11,
    maxRunBytes: limits.maxRunBytes, maxVolumeUsedRatio: limits.maxVolumeUsedRatio,
  }), 'formal-smoke-volume-free-space-insufficient');
  assert.equal(preflightTools.validateStage8FormalSmokeCapacity({
    snapshot: { totalBytes: 2 ** 40, freeBytes: 2 ** 39, runBytes: limits.maxRunBytes }, pendingBytes: 1,
    maxRunBytes: limits.maxRunBytes, maxVolumeUsedRatio: limits.maxVolumeUsedRatio,
  }), 'formal-smoke-run-capacity-limit-exceeded');

  let writes = 0;
  let capacityInspections = 0;
  const denied = await runner.runStage8FormalSmoke({
    control, runtime: runtimeFor(4), artifactRoot: { ...rootInput, environment: {} },
    fileSystem: { exists: () => false, isDirectory: () => false, isFile: () => false, readFile: () => Buffer.alloc(0), listDirectory: () => [] },
    rawDistributionProvider: provider,
    writer: {
      inspectCapacity: () => { capacityInspections += 1; return { totalBytes: 1000, freeBytes: 500, runBytes: 0 }; },
      writeImmutable: () => { writes += 1; },
    },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'smoke-stage8-artifact-root-required');
  assert.equal(capacityInspections, 0, 'identity preflight must precede capacity inspection');
  assert.equal(writes, 0, 'missing runtime inputs must return before any writer call');

  const cli = await import(pathToFileURL(path.join(root, 'scripts/stage8-offline-smoke-runner.mjs')).href);
  const writerDirectory = path.join(temp, 'atomic-writer-fixture');
  fs.mkdirSync(writerDirectory);
  const atomicWriter = cli.createStage8FormalSmokeAtomicWriter(writerDirectory);
  assert.ok(atomicWriter.inspectCapacity().freeBytes > 0);
  atomicWriter.writeImmutable('smoke-batch-0001.json', '{"fixture":true}');
  assert.equal(fs.readFileSync(path.join(writerDirectory, 'smoke-batch-0001.json'), 'utf8'), '{"fixture":true}');
  assert.throws(() => atomicWriter.writeImmutable('smoke-batch-0001.json', '{"fixture":false}'), /immutable target already exists/);
  assert.throws(() => atomicWriter.writeImmutable('../outside.json', '{}'), /artifact-name-invalid/);
  assert.equal(fs.readdirSync(writerDirectory).some((name) => name.includes('.tmp-')), false);

  console.log(JSON.stringify({
    passed: true,
    inMemoryTrueSourceGamesExecuted: 3,
    formalSmokeGamesExecuted: 0,
    plannedLedgerSlotsValidated: 1000,
    workerConfigurationsCompared: [1, 2, 4],
    workerSemanticHash: semanticHashes[0].batchSemanticHash,
    immutableBatchLedgersValidated: batches.length,
    capacityLimits: limits,
    controls: ['course-wall-recipe-bound', 'canonical-trajectory', 'terminal-zero-sum', '600-transition-fuse', 'global-index-seed', 'worker-semantic-equivalence', 'rules-derived-coverage', 'explicit-model-source-identities', 'immutable-batch-hash', 'previous-batch-chain', 'atomic-wx-rename', 'partial-final-rejected', 'pre-run-capacity', 'pre-commit-capacity', 'missing-input-zero-write'],
    trainingStarted: false,
    artifactsWritten: false,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
