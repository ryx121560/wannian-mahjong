import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename);

try {
  const identity = require(path.join(root, 'src/game/stage8/offline-action-identity.ts'));
  const bc = require(path.join(root, 'src/game/stage8/offline-bc-control.ts'));
  const teacher = require(path.join(root, 'src/game/stage8/offline-bc-teacher.ts'));
  const sample = require(path.join(root, 'src/game/stage8/offline-bc-sample-protocol.ts'));
  const tensor = require(path.join(root, 'src/game/stage8/offline-onnx-tensor-contract.ts'));
  const writer = require(path.join(root, 'src/game/stage8/offline-bc-sample-writer.ts'));
  const artifact = require(path.join(root, 'src/game/stage8/offline-bc-artifact-control.ts'));
  const corpusControl = require(path.join(root, 'src/game/stage8/offline-bc-corpus-control.ts'));
  const corpusManifest = require(path.join(root, 'src/game/stage8/offline-bc-corpus-manifest.ts'));
  const runner = require(path.join(root, 'src/game/stage8/offline-bc-corpus-runner.ts'));
  const gameRunner = require(path.join(root, 'src/game/stage8/offline-bc-sample-probe-runner.ts'));
  const h = identity.hashStage8OfflineIdentity;
  const runId = 'formal-bc-corpus-pilot-20260909';
  const sourceBundleSha256 = h('formal-source');
  const bcPayload = {
    protocolVersion: bc.STAGE8_BC_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256, rulesSha256: h('rules'), browserRulesSha256: h('browser-rules'),
      actionSpaceSha256: h('actions'), legalActionMaskSha256: h('actions'), featureSha256: h('features'),
      visibleInformationSha256: h('features'), tensorContractSha256: tensor.hashStage8OnnxTensorContract(),
      teacherDefinitionSha256: teacher.hashStage8BcTeacherDefinition(), sampleSchemaSha256: sample.hashStage8BcSampleProtocolDefinition(),
    },
    authorization: { approvalId: 'formal-bc-teacher-approval', granted: true, scope: 'bc-teacher-protocol-preflight' },
    teacherTemperature: 1, allowSampleGeneration: false, allowPythonRuntime: false, allowTraining: false,
    allowModelCreation: false, allowOnnxExport: false, allowArtifactWrite: false, allowSmoke: false, allowRuntime: false,
  };
  const bcControl = { ...bcPayload, manifestSha256: bc.hashStage8BcControlManifestPayload(bcPayload) };
  const artifactPayload = {
    protocolVersion: artifact.STAGE8_BC_ARTIFACT_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256, bcControlManifestSha256: bcControl.manifestSha256,
      sampleSchemaSha256: bcControl.identity.sampleSchemaSha256, tensorContractSha256: bcControl.identity.tensorContractSha256,
      writerDefinitionSha256: writer.hashStage8BcArtifactWriterDefinition(), pythonDatasetDefinitionSha256: h('python-dataset'),
      modelDefinitionSha256: h('model'), trainingDefinitionSha256: h('training'), checkpointDefinitionSha256: h('checkpoint'),
      onnxExportDefinitionSha256: h('onnx-export'), parityDefinitionSha256: h('parity'),
    },
    bcControl, authorization: { approvalId: 'formal-bc-artifact-approval', granted: true, scope: artifact.STAGE8_BC_ARTIFACT_SCOPE },
    limits: { maxSamplesPerShard: 4096, maxUncompressedShardBytes: 64 * 1024 * 1024 },
    allowSampleGeneration: true, allowArtifactWrite: true, allowPythonRuntime: false, allowTraining: false,
    allowModelCreation: false, allowCheckpointWrite: false, allowOnnxExport: false, allowSmoke: false, allowRuntime: false,
  };
  const artifactControl = { ...artifactPayload, manifestSha256: artifact.hashStage8BcArtifactControlManifestPayload(artifactPayload) };
  const controlPayload = {
    protocolVersion: corpusControl.STAGE8_BC_CORPUS_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256, artifactControlManifestSha256: artifactControl.manifestSha256,
      bcControlManifestSha256: bcControl.manifestSha256, rulesSha256: bcControl.identity.rulesSha256,
      browserRulesSha256: bcControl.identity.browserRulesSha256, actionSpaceSha256: bcControl.identity.actionSpaceSha256,
      legalActionMaskSha256: bcControl.identity.legalActionMaskSha256, featureSha256: bcControl.identity.featureSha256,
      visibleInformationSha256: bcControl.identity.visibleInformationSha256, tensorContractSha256: bcControl.identity.tensorContractSha256,
      teacherDefinitionSha256: bcControl.identity.teacherDefinitionSha256, sampleSchemaSha256: bcControl.identity.sampleSchemaSha256,
      writerDefinitionSha256: artifactControl.identity.writerDefinitionSha256, trajectoryDefinitionSha256: h('trajectory'),
      pythonDatasetDefinitionSha256: artifactControl.identity.pythonDatasetDefinitionSha256,
      corpusManifestDefinitionSha256: corpusManifest.hashStage8BcCorpusManifestDefinition(), capacityPreflightSha256: h('capacity'),
    },
    authorization: { approvalId: 'formal-bc-corpus-approval', granted: true, scope: corpusControl.STAGE8_BC_CORPUS_SCOPE },
    plan: {
      baseSeed: 2026090800, seedDerivation: 'base-plus-game-index-v1', gameCount: 64,
      candidateSeatDerivation: 'game-index-modulo-four-v1', candidateSeatGames: [16,16,16,16], workers: 1,
      curriculum: 'normal-full-rules', exploration: false, modelLoading: false, recordAllSeats: true,
      maxSuccessfulTransitionsPerGame: 600, splitUnit: 'episode-seed-group', splitCounts: { train: 48, validation: 8, finalTest: 8 },
      splitAssignment: 'game-index-ranges-v1', crossRunPolicy: 'single-run-only',
    },
    capacity: { maxRunBytes: 5 * 1024 ** 3, rootHardLimitBytes: 64 * 1024 ** 3, rootFusePercent: 80,
      preflightBeforeRun: true, preflightBeforeEachBatchCommit: true },
    allowCorpusPilotExecution: true, allowArtifactWrite: true, allowCrossRun: false, allowTraining: false,
    allowValidationSamplingForTraining: false, allowFinalTestSamplingForTraining: false, allowModelLoading: false,
    allowExploration: false, allowSmoke: false, allowSelfplay: false, allowOnnxExport: false, allowRuntime: false,
  };
  const control = { ...controlPayload, manifestSha256: corpusControl.hashStage8BcCorpusControlPayload(controlPayload) };
  assert.equal(corpusControl.validateStage8BcCorpusControlManifest(control).ok, true);
  assert.equal(artifact.validateStage8BcArtifactControlManifest(artifactControl).ok, true);
  const realGame = gameRunner.executeStage8BcTeacherGame({
    runId, bcControl, gameIndex: 0, gameCount: 64, fixedSeed: 2026090800,
    candidateSeat: 0, sampleOffset: 0, maxSuccessfulTransitions: 600,
  });
  assert.equal(realGame.ok, true, realGame.ok ? '' : realGame.decision.reason);
  assert.equal(realGame.ledger.terminalCount, 1);
  assert.equal(realGame.ledger.terminalDelta.reduce((sum, value) => sum + value, 0), 0);
  assert.ok(realGame.ledger.transitions.length <= 600 && realGame.ledger.samples.length > 0);

  const action = { actionSpaceVersion: 'stage8-action-space-v2', actionType: 'pass', actionId: 0,
    context: { actor: 0, declarationWindow: 'discard-response', robKongWindow: false } };
  const actionKey = identity.stage8CanonicalActionKey(action);
  const gameFor = (input, duplicate = false) => {
    const serial = String(input.gameIndex + 1).padStart(6, '0');
    const sampleId = duplicate ? 'formal-sample-duplicate' : `formal-sample-${serial}`;
    const episodeId = duplicate ? 'formal-episode-duplicate' : `formal-episode-${serial}`;
    const sampleEnvelope = {
      sampleId,
      replay: { episodeId },
      canonicalActions: [{ ...action, context: { ...action.context, actor: input.candidateSeat } }],
      teacherEvidence: { selectedActionKey: identity.stage8CanonicalActionKey({ ...action, context: { ...action.context, actor: input.candidateSeat } }),
        teacherDistribution: {} },
      batchId: `${runId}-batch-${serial}`,
    };
    sampleEnvelope.teacherEvidence.teacherDistribution[sampleEnvelope.teacherEvidence.selectedActionKey] = 1;
    const base = {
      gameIndex: input.gameIndex, gameId: `formal-game-${serial}`, fixedSeed: input.fixedSeed, candidateSeat: input.candidateSeat,
      workerSlot: 0, decisionCount: 1, transitionCount: 1, terminalCount: 1, endType: 'wallExhausted',
      terminalStateSha256: h(['state', input.gameIndex]), terminalEventSha256: h(['event', input.gameIndex]),
      terminalSettlementSha256: h(['settlement', input.gameIndex]), terminalDelta: [0,0,0,0],
      traceSha256: h(['trace', input.gameIndex]), transitions: [{}], samples: [sampleEnvelope],
    };
    return { ok: true, ledger: { ...base, semanticSha256: h(base) } };
  };
  const makePort = (changes = {}) => {
    const calls = { capacity: [], shards: [], final: 0, quarantine: [] };
    const port = {
      capacityPreflight: (request) => { calls.capacity.push(request); return { ...request, ok: true,
        totalBytes: 100 * 1024 ** 3, freeBytes: 90 * 1024 ** 3, rootBytes: 1024, runBytes: 0,
        identitySha256: control.identity.capacityPreflightSha256 }; },
      commitShard: ({ gameIndex, game, relativeDirectory, shardId }) => {
        calls.shards.push(gameIndex);
        return { ok: true, shard: { relativePath: `${relativeDirectory}/${shardId}.json.gz`, fileSha256: h(['file', gameIndex]),
          payloadSha256: h(['payload', gameIndex]), sampleCount: game.samples.length, episodeCount: 1 } };
      },
      verifyPython: ({ manifest, shards }) => ({ ok: true, corpusManifestSha256: manifest.manifestSha256,
        shardCount: 64, sampleCount: manifest.totals.sampleCount, splitCounts: { train: 48, validation: 8, finalTest: 8 },
        fileSetSha256: h(shards.map((item) => item.fileSha256).sort()), torchImported: false }),
      commitRun: () => { calls.final += 1; return { ok: true }; },
      quarantineRun: (value) => calls.quarantine.push(value),
      ...changes,
    };
    return { port, calls };
  };
  const greenPort = makePort();
  const green = runner.executeStage8BcCorpusTransaction({ corpusId: runId, control, artifactControl, port: greenPort.port,
    gameExecutor: (input) => gameFor(input) });
  assert.equal(green.ok, true, green.ok ? '' : green.reason);
  assert.equal(green.artifactsWritten, 66);
  assert.equal(greenPort.calls.shards.length, 64);
  assert.equal(greenPort.calls.capacity.length, 66);
  assert.equal(greenPort.calls.final, 1);
  assert.equal(green.manifest.splits.train.shardIds.length, 48);
  assert.equal(green.manifest.splits.validation.shardIds.length, 8);
  assert.equal(green.manifest.splits.finalTest.shardIds.length, 8);
  const replayPort = makePort();
  const replay = runner.executeStage8BcCorpusTransaction({ corpusId: runId, control, artifactControl, port: replayPort.port,
    gameExecutor: (input) => gameFor(input) });
  assert.equal(replay.ok, true);
  assert.equal(replay.manifest.manifestSha256, green.manifest.manifestSha256);
  assert.equal(replay.ledger.ledgerSha256, green.ledger.ledgerSha256);

  let replayCalls = 0;
  const mismatch = runner.executeStage8BcCorpusTransaction({ corpusId: runId, control, artifactControl, port: makePort().port,
    gameExecutor: (input) => { replayCalls += 1; const value = gameFor(input); if (replayCalls === 2) value.ledger.semanticSha256 = h('changed'); return value; } });
  assert.equal(mismatch.ok, false); assert.equal(mismatch.reason, 'bc-corpus-game-replay-mismatch');
  const duplicate = runner.executeStage8BcCorpusTransaction({ corpusId: runId, control, artifactControl, port: makePort().port,
    gameExecutor: (input) => gameFor(input, true) });
  assert.equal(duplicate.ok, false); assert.equal(duplicate.reason, 'bc-corpus-global-sample-or-episode-duplicate');
  const capacityPort = makePort({ capacityPreflight: (request) => ({ ...request, ok: false, totalBytes: 1, freeBytes: 0,
    rootBytes: 0, runBytes: 0, identitySha256: control.identity.capacityPreflightSha256 }) });
  const capacityFailure = runner.executeStage8BcCorpusTransaction({ corpusId: runId, control, artifactControl,
    port: capacityPort.port, gameExecutor: (input) => gameFor(input) });
  assert.equal(capacityFailure.ok, false); assert.equal(capacityFailure.completedShardCount, 0);
  const pythonPort = makePort({ verifyPython: () => ({ ok: false, corpusManifestSha256: '', shardCount: 0, sampleCount: 0,
    splitCounts: { train: 0, validation: 0, finalTest: 0 }, fileSetSha256: '', torchImported: false }) });
  const pythonFailure = runner.executeStage8BcCorpusTransaction({ corpusId: runId, control, artifactControl,
    port: pythonPort.port, gameExecutor: (input) => gameFor(input) });
  assert.equal(pythonFailure.ok, false); assert.equal(pythonFailure.completedShardCount, 64); assert.equal(pythonPort.calls.final, 0);
  const probeNamed = structuredClone(control); probeNamed.identity.runId = 'formal-bc-corpus-probe-invalid';
  const probeResult = runner.executeStage8BcCorpusTransaction({ corpusId: runId, control: probeNamed, artifactControl,
    port: makePort().port, gameExecutor: (input) => gameFor(input) });
  assert.equal(probeResult.ok, false); assert.equal(probeResult.reason, 'bc-corpus-formal-run-identity-invalid');
  console.log(JSON.stringify({ passed: true, plannedGames: 64, realGamesExecuted: 1, lightweightFixtureExecutions: 128,
    splits: [48,8,8], capacityChecks: 66, artifactsWritten: 0, trainingStarted: false,
    controls: ['fixed-seed-seat-worker','cold-semantic-replay','global-dedup','capacity-every-commit','python-before-atomic-final','no-retry-or-seed-override'],
    ...(process.env.STAGE8_BC_CORPUS_RUNNER_EMIT_FIXTURE === '1' ? { fixture: { control, artifactControl } } : {}),
  }));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}
