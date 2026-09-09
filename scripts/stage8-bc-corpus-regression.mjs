import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const root = process.cwd();
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename);

try {
  const identity = require(path.join(root, 'src/game/stage8/offline-action-identity.ts'));
  const controlTools = require(path.join(root, 'src/game/stage8/offline-bc-corpus-control.ts'));
  const corpusTools = require(path.join(root, 'src/game/stage8/offline-bc-corpus-manifest.ts'));
  const hash = identity.hashStage8OfflineIdentity;
  const h = (value) => hash(value);
  const actionCoverage = (selectedType = null) => Object.fromEntries(corpusTools.STAGE8_BC_CORPUS_ACTION_TYPES.map((type) => [type, {
    legalOpportunities: type === selectedType ? 1 : 0,
    positiveProbability: type === selectedType ? 1 : 0,
    selected: type === selectedType ? 1 : 0,
  }]));
  const controlPayload = {
    protocolVersion: controlTools.STAGE8_BC_CORPUS_CONTROL_VERSION,
    identity: {
      runId: 'formal-bc-corpus-pilot-20260908', sourceBundleSha256: h('source'),
      artifactControlManifestSha256: h('artifact-control'), bcControlManifestSha256: h('bc-control'), rulesSha256: h('rules'),
      browserRulesSha256: h('browser-rules'), actionSpaceSha256: h('actions'), legalActionMaskSha256: h('actions'),
      featureSha256: h('features'), visibleInformationSha256: h('features'), tensorContractSha256: h('tensor'),
      teacherDefinitionSha256: h('teacher'), sampleSchemaSha256: h('sample'), writerDefinitionSha256: h('writer'),
      trajectoryDefinitionSha256: h('trajectory'), pythonDatasetDefinitionSha256: h('python-dataset'),
      corpusManifestDefinitionSha256: corpusTools.hashStage8BcCorpusManifestDefinition(), capacityPreflightSha256: h('capacity'),
    },
    authorization: { approvalId: 'formal-bc-corpus-pilot-approval', granted: true, scope: controlTools.STAGE8_BC_CORPUS_SCOPE },
    plan: {
      baseSeed: 2026090800, seedDerivation: 'base-plus-game-index-v1', gameCount: 64,
      candidateSeatDerivation: 'game-index-modulo-four-v1', candidateSeatGames: [16,16,16,16], workers: 1,
      curriculum: 'normal-full-rules', exploration: false, modelLoading: false, recordAllSeats: true,
      maxSuccessfulTransitionsPerGame: 600, splitUnit: 'episode-seed-group',
      splitCounts: { train: 48, validation: 8, finalTest: 8 }, splitAssignment: 'game-index-ranges-v1',
      crossRunPolicy: 'single-run-only',
    },
    capacity: {
      maxRunBytes: 5 * 1024 * 1024 * 1024, rootHardLimitBytes: 68719476736, rootFusePercent: 80,
      preflightBeforeRun: true, preflightBeforeEachBatchCommit: true,
    },
    allowCorpusPilotExecution: true, allowArtifactWrite: true, allowCrossRun: false, allowTraining: false,
    allowValidationSamplingForTraining: false, allowFinalTestSamplingForTraining: false, allowModelLoading: false,
    allowExploration: false, allowSmoke: false, allowSelfplay: false, allowOnnxExport: false, allowRuntime: false,
  };
  const control = { ...controlPayload, manifestSha256: controlTools.hashStage8BcCorpusControlPayload(controlPayload) };
  assert.equal(controlTools.validateStage8BcCorpusControlManifest(control).ok, true);
  const deniedPayload = { ...controlPayload, authorization: { ...controlPayload.authorization, granted: false } };
  assert.equal(controlTools.validateStage8BcCorpusControlManifest({ ...deniedPayload, manifestSha256: controlTools.hashStage8BcCorpusControlPayload(deniedPayload) }).decision.reason, 'bc-corpus-control-authorization-required');
  const wrongPlanPayload = { ...controlPayload, plan: { ...controlPayload.plan, gameCount: 63 } };
  assert.equal(controlTools.validateStage8BcCorpusControlManifest({ ...wrongPlanPayload, manifestSha256: controlTools.hashStage8BcCorpusControlPayload(wrongPlanPayload) }).decision.reason, 'bc-corpus-control-plan-invalid');

  const shards = Array.from({ length: 64 }, (_, gameIndex) => {
    const serial = String(gameIndex + 1).padStart(6, '0');
    return {
      relativePath: `batches/batch-${serial}/shard-${serial}.json.gz`, fileSha256: h(['file', gameIndex]),
      payloadSha256: h(['payload', gameIndex]), runId: control.identity.runId, batchId: `formal-batch-${serial}`,
      shardId: `formal-shard-${serial}`, gameIndex, fixedSeed: 2026090800 + gameIndex,
      candidateSeat: gameIndex % 4, split: controlTools.deriveStage8BcCorpusSplit(gameIndex),
      artifactControlManifestSha256: control.identity.artifactControlManifestSha256,
      bcControlManifestSha256: control.identity.bcControlManifestSha256,
      sourceBundleSha256: control.identity.sourceBundleSha256, sampleSchemaSha256: control.identity.sampleSchemaSha256,
      tensorContractSha256: control.identity.tensorContractSha256, teacherDefinitionSha256: control.identity.teacherDefinitionSha256,
      sampleCount: 1, episodeCount: 1, episodeId: `formal-episode-${serial}`,
      sampleIds: [`formal-sample-${serial}`], terminalDelta: [gameIndex % 2 ? 2 : -2, 0, gameIndex % 2 ? -2 : 2, 0],
      actionCoverage: actionCoverage(gameIndex % 3 === 0 ? 'pass' : 'discard'),
    };
  }).map((shard) => ({ ...shard, episodeSha256: h({
    episodeId: shard.episodeId, fixedSeed: shard.fixedSeed, sampleIds: shard.sampleIds, terminalDelta: shard.terminalDelta,
  }) }));
  const makeSplit = (name, list) => {
    const payload = {
      gameIndexes: list.map((shard) => shard.gameIndex), shardIds: list.map((shard) => shard.shardId),
      episodeIds: list.map((shard) => shard.episodeId), payloadSetSha256: h(list.map((shard) => shard.payloadSha256).sort()),
    };
    return { ...payload, splitSha256: h({ split: name, ...payload }) };
  };
  const splits = {
    train: makeSplit('train', shards.slice(0, 48)), validation: makeSplit('validation', shards.slice(48, 56)),
    finalTest: makeSplit('final-test', shards.slice(56)),
  };
  const aggregateCoverage = Object.fromEntries(corpusTools.STAGE8_BC_CORPUS_ACTION_TYPES.map((type) => [type, shards.reduce((sum, shard) => ({
    legalOpportunities: sum.legalOpportunities + shard.actionCoverage[type].legalOpportunities,
    positiveProbability: sum.positiveProbability + shard.actionCoverage[type].positiveProbability,
    selected: sum.selected + shard.actionCoverage[type].selected,
  }), { legalOpportunities: 0, positiveProbability: 0, selected: 0 })]));
  const anomalies = {
    illegalActions: 0, hiddenInformationLeaks: 0, nonFiniteValues: 0, nonZeroSumSettlements: 0,
    replayMismatches: 0, duplicateSamples: 0, duplicateEpisodes: 0, splitLeaks: 0, incompatibleIdentities: 0,
  };
  const corpusPayload = {
    protocolVersion: corpusTools.STAGE8_BC_CORPUS_MANIFEST_VERSION, corpusId: 'formal-bc-corpus-20260908',
    runId: control.identity.runId, control, sourceRunPolicy: 'single-run-only', sourceRunIds: [control.identity.runId],
    shards, splits,
    totals: {
      shardCount: 64, episodeCount: 64, sampleCount: 64,
      datasetPayloadSetSha256: h(shards.map((shard) => shard.payloadSha256).sort()),
      trainingDatasetPayloadSetSha256: splits.train.payloadSetSha256,
    },
    actionCoverage: aggregateCoverage, anomalies,
  };
  const corpus = { ...corpusPayload, manifestSha256: corpusTools.hashStage8BcCorpusManifestPayload(corpusPayload) };
  assert.equal(corpusTools.validateStage8BcCorpusManifest(corpus).ok, true);
  const rehashCorpus = (changes) => {
    const payload = { ...corpusPayload, ...changes };
    return { ...payload, manifestSha256: corpusTools.hashStage8BcCorpusManifestPayload(payload) };
  };
  assert.equal(corpusTools.validateStage8BcCorpusManifest(rehashCorpus({ sourceRunIds: [control.identity.runId, 'other-run'] })).decision.reason, 'bc-corpus-cross-run-forbidden');
  const duplicateSampleShards = structuredClone(shards); duplicateSampleShards[1].sampleIds = duplicateSampleShards[0].sampleIds.slice();
  duplicateSampleShards[1].episodeSha256 = h({
    episodeId: duplicateSampleShards[1].episodeId, fixedSeed: duplicateSampleShards[1].fixedSeed,
    sampleIds: duplicateSampleShards[1].sampleIds, terminalDelta: duplicateSampleShards[1].terminalDelta,
  });
  assert.equal(corpusTools.validateStage8BcCorpusManifest(rehashCorpus({ shards: duplicateSampleShards })).decision.reason, 'bc-corpus-sample-duplicate');
  const duplicateEpisodeShards = structuredClone(shards); duplicateEpisodeShards[1].episodeId = duplicateEpisodeShards[0].episodeId;
  duplicateEpisodeShards[1].episodeSha256 = h({
    episodeId: duplicateEpisodeShards[1].episodeId, fixedSeed: duplicateEpisodeShards[1].fixedSeed,
    sampleIds: duplicateEpisodeShards[1].sampleIds, terminalDelta: duplicateEpisodeShards[1].terminalDelta,
  });
  assert.equal(corpusTools.validateStage8BcCorpusManifest(rehashCorpus({ shards: duplicateEpisodeShards })).decision.reason, 'bc-corpus-episode-duplicate');
  assert.equal(corpusTools.validateStage8BcCorpusManifest(rehashCorpus({ anomalies: { ...anomalies, replayMismatches: 1 } })).decision.reason, 'bc-corpus-hard-anomaly');
  const leakedSplits = structuredClone(splits); leakedSplits.validation.episodeIds[0] = leakedSplits.train.episodeIds[0];
  const leakedPayload = { ...leakedSplits.validation }; delete leakedPayload.splitSha256;
  leakedSplits.validation.splitSha256 = h({ split: 'validation', ...leakedPayload });
  assert.equal(corpusTools.validateStage8BcCorpusManifest(rehashCorpus({ splits: leakedSplits })).decision.reason, 'bc-corpus-split-invalid');
  const trainingTicketPayload = {
    protocolVersion: 'stage8-bc-python-ticket-v1', phase: 'bc-training', runId: 'bc-training-run-20260909',
    approvalId: 'bc-training-run-approval', artifactRoot: 'C:\\stage8-artifacts',
    runDirectory: 'C:\\stage8-artifacts\\bc-training-run-20260909', lifecycleManifestSha256: h('lifecycle'),
    lifecycleIdentitySha256: h('lifecycle-identity'), datasetPayloadSetSha256: splits.train.payloadSetSha256,
    rulesSha256: control.identity.rulesSha256, actionSpaceSha256: control.identity.actionSpaceSha256,
    legalActionMaskSha256: control.identity.actionSpaceSha256, featureSha256: control.identity.featureSha256,
    visibleInformationSha256: control.identity.featureSha256, sampleSchemaSha256: control.identity.sampleSchemaSha256,
    tensorContractSha256: control.identity.tensorContractSha256, pythonEnvironmentLockSha256: h('python-lock'),
    pythonSourceBundleSha256: h('python-source'), modelDefinitionSha256: h('model-definition'),
    trainingDefinitionSha256: h('training-definition'), checkpointDefinitionSha256: h('checkpoint-definition'),
    onnxExportDefinitionSha256: h('onnx-export-definition'), parityDefinitionSha256: h('parity-definition'),
    inferenceContractSha256: h('inference-contract'), onnxRuntimePackage: 'onnxruntime-node', onnxRuntimeVersion: '1.27.0',
    onnxExecutionProvider: 'cpu', onnxSessionOptionsSha256: h('onnx-options'),
    trainingPlan: {
      fixedSeed: 2026090900, maxSteps: 1, epochs: 1, batchSize: 16, learningRate: 0.001,
      policyLossWeight: 1, valueLossWeight: 1, deterministicAlgorithms: true,
      valueTarget: 'terminal-four-seat-zero-sum-delta',
    },
    modelConfig: {
      visibleFeatureCount: 5577, actionFeatureCount: 181, stateHiddenSize: 256, stateEmbeddingSize: 128,
      actionEmbeddingSize: 64, valueSeats: 4, zeroSumValueHead: true,
    },
    allowTraining: true, allowCheckpointWrite: true, allowOnnxExport: false,
  };
  const trainingTicket = { ...trainingTicketPayload, ticketSha256: h(trainingTicketPayload) };
  const bindingPayload = {
    protocolVersion: corpusTools.STAGE8_BC_CORPUS_TRAINING_BINDING_VERSION, corpusId: corpus.corpusId,
    corpusManifestSha256: corpus.manifestSha256, corpusRunId: corpus.runId, trainingRunId: trainingTicket.runId,
    trainingLifecycleManifestSha256: trainingTicket.lifecycleManifestSha256,
    trainingDatasetPayloadSetSha256: trainingTicket.datasetPayloadSetSha256, trainSplitSha256: splits.train.splitSha256,
    trainShardIdsSha256: h(splits.train.shardIds),
    authorization: { approvalId: 'bc-corpus-training-binding-approval', granted: true, scope: corpusTools.STAGE8_BC_CORPUS_TRAINING_BINDING_SCOPE },
    allowTrainSplit: true, allowValidationSplit: false, allowFinalTestSplit: false,
  };
  const binding = { ...bindingPayload, bindingSha256: corpusTools.hashStage8BcCorpusTrainingBindingPayload(bindingPayload) };
  assert.equal(corpusTools.validateStage8BcCorpusTrainingBinding({ corpus, binding, trainingTicket }).ok, true);
  const validationLeakPayload = { ...bindingPayload, allowValidationSplit: true };
  assert.equal(corpusTools.validateStage8BcCorpusTrainingBinding({ corpus, binding: { ...validationLeakPayload, bindingSha256: corpusTools.hashStage8BcCorpusTrainingBindingPayload(validationLeakPayload) }, trainingTicket }).decision.reason, 'bc-corpus-training-binding-identity-invalid');
  assert.equal(corpusTools.validateStage8BcCorpusTrainingBinding({ corpus, binding, trainingTicket: { ...trainingTicket, datasetPayloadSetSha256: splits.validation.payloadSetSha256 } }).decision.reason, 'bc-corpus-training-binding-identity-invalid');
  const output = {
    passed: true, games: 64, split: [48,8,8], workers: 1, baseSeed: 2026090800,
    controls: ['explicit-authorization','single-run-only','global-sample-episode-dedup','episode-seed-split',
      'all-canonical-action-report','zero-hard-anomaly','train-ticket-cross-binding','validation-final-test-not-training'],
    pilotGamesExecuted: 0, trainingStarted: false, artifactsWritten: false,
    ...(process.env.STAGE8_BC_CORPUS_EMIT_FIXTURE === '1' ? { fixture: { corpus, binding, trainingTicket } } : {}),
  };
  console.log(JSON.stringify(output));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}
