import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-python-code-'));
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
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: from,
      }).outputText);
    }
  }
}

function findPython() {
  const candidates = [
    process.env.STAGE8_BC_TEST_PYTHON,
    path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    'python',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    if (probe.status === 0) return candidate;
  }
  throw new Error('A Python 3 interpreter is required for the standard-library-only regression; no install was attempted.');
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const actions = require(path.join(temp, 'game/stage8/action-registry-v2.js'));
  const identityTools = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const bc = require(path.join(temp, 'game/stage8/offline-bc-control.js'));
  const teacher = require(path.join(temp, 'game/stage8/offline-bc-teacher.js'));
  const sampleTools = require(path.join(temp, 'game/stage8/offline-bc-sample-protocol.js'));
  const artifactControlTools = require(path.join(temp, 'game/stage8/offline-bc-artifact-control.js'));
  const sampleWriter = require(path.join(temp, 'game/stage8/offline-bc-sample-writer.js'));
  const tensor = require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js'));
  const frozen = require(path.join(temp, 'game/stage8/offline-frozen-model-inference.js'));
  const lifecycle = require(path.join(temp, 'game/stage8/offline-bc-model-lifecycle-protocol.js'));
  const sha = identityTools.hashStage8OfflineIdentity;
  const artifactRoot = path.join(temp, 'artifacts');
  const runDirectory = path.join(artifactRoot, 'bc-python-code-run');
  const batchDirectory = path.join(artifactRoot, 'bc-python-code-batch');
  fs.mkdirSync(runDirectory, { recursive: true });
  fs.mkdirSync(batchDirectory, { recursive: true });
  const runId = 'bc-python-code-run';
  const identity = {
    runId,
    sourceBundleSha256: sha('source'), artifactControlManifestSha256: sha('artifact-control'), datasetPayloadSetSha256: sha(['payload-one']),
    rulesSha256: sha('rules'), actionSpaceSha256: sha('actions'), legalActionMaskSha256: sha('actions'), featureSha256: sha('features'), visibleInformationSha256: sha('features'),
    sampleSchemaSha256: sampleTools.hashStage8BcSampleProtocolDefinition(), tensorContractSha256: tensor.hashStage8OnnxTensorContract(), pythonEnvironmentLockSha256: sha('python-lock'), pythonSourceBundleSha256: sha('python-source'),
    modelDefinitionSha256: lifecycle.hashStage8BcModelDefinition(), trainingDefinitionSha256: lifecycle.hashStage8BcTrainingDefinition(), checkpointDefinitionSha256: lifecycle.hashStage8BcCheckpointDefinition(),
    onnxExportDefinitionSha256: lifecycle.hashStage8BcOnnxExportDefinition(), parityDefinitionSha256: lifecycle.hashStage8BcParityDefinition(),
    inferenceContractSha256: frozen.hashStage8FrozenModelInferenceContract(), onnxSessionOptionsSha256: tensor.hashStage8OnnxSessionOptions(),
  };
  const bcPayload = {
    protocolVersion: bc.STAGE8_BC_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256: sha('bc-source'), rulesSha256: identity.rulesSha256,
      browserRulesSha256: sha('browser-rules'), actionSpaceSha256: identity.actionSpaceSha256,
      legalActionMaskSha256: sha('bc-mask'), featureSha256: sha('bc-features'), visibleInformationSha256: sha('bc-visible'),
      tensorContractSha256: tensor.hashStage8OnnxTensorContract(), teacherDefinitionSha256: teacher.hashStage8BcTeacherDefinition(),
      sampleSchemaSha256: sampleTools.hashStage8BcSampleProtocolDefinition(),
    },
    authorization: { approvalId: 'bc-protocol-approval', granted: true, scope: 'bc-teacher-protocol-preflight' },
    teacherTemperature: 1,
    allowSampleGeneration: false, allowPythonRuntime: false, allowTraining: false, allowModelCreation: false,
    allowOnnxExport: false, allowArtifactWrite: false, allowSmoke: false, allowRuntime: false,
  };
  const bcControl = { ...bcPayload, manifestSha256: bc.hashStage8BcControlManifestPayload(bcPayload) };
  const artifactPayload = {
    protocolVersion: artifactControlTools.STAGE8_BC_ARTIFACT_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256: sha('artifact-source'), bcControlManifestSha256: bcControl.manifestSha256,
      sampleSchemaSha256: sampleTools.hashStage8BcSampleProtocolDefinition(), tensorContractSha256: tensor.hashStage8OnnxTensorContract(),
      writerDefinitionSha256: sampleWriter.hashStage8BcArtifactWriterDefinition(), pythonDatasetDefinitionSha256: sha('python-dataset'),
      modelDefinitionSha256: identity.modelDefinitionSha256, trainingDefinitionSha256: identity.trainingDefinitionSha256,
      checkpointDefinitionSha256: identity.checkpointDefinitionSha256, onnxExportDefinitionSha256: identity.onnxExportDefinitionSha256,
      parityDefinitionSha256: identity.parityDefinitionSha256,
    },
    bcControl,
    authorization: { approvalId: 'bc-artifact-approval', granted: true, scope: artifactControlTools.STAGE8_BC_ARTIFACT_SCOPE },
    limits: {
      maxSamplesPerShard: artifactControlTools.STAGE8_BC_MAX_SAMPLES_PER_SHARD,
      maxUncompressedShardBytes: artifactControlTools.STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES,
    },
    allowSampleGeneration: true, allowArtifactWrite: true, allowPythonRuntime: false, allowTraining: false,
    allowModelCreation: false, allowCheckpointWrite: false, allowOnnxExport: false, allowSmoke: false, allowRuntime: false,
  };
  const artifactControl = { ...artifactPayload, manifestSha256: artifactControlTools.hashStage8BcArtifactControlManifestPayload(artifactPayload) };
  const hand = ['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8','wan9','tong1','tong2','tong3','tong4','tong5'];
  const visibleState = {
    actor: 0, ownHand: hand, publicMelds: [[],[],[],[]], publicDiscards: [[],['tiao1'],['nan'],['bai']],
    scores: [0,0,0,0], dealer: 0, turn: 18, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 70,
  };
  const canonicalActions = identityTools.sortStage8CanonicalActions(hand.map((tile) => actions.canonicalizeStage8V2Action({
    actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile, ownTileCount: 1, robKongWindow: false,
  })));
  const completeLegalActionSetSha256 = identityTools.hashStage8CanonicalActionSet(canonicalActions);
  const decision = teacher.evaluateStage8BcTeacher({ control: bcControl, visibleState, legalActions: canonicalActions, completeLegalActionSetSha256 });
  assert.equal(decision.ok, true, decision.ok ? '' : decision.decision.reason);
  const episodeId = `${runId}-episode-one`;
  const terminalDelta = [6,-2,-2,-2];
  const terminalReference = sampleWriter.hashStage8BcTerminalReward({ episodeId, terminalDelta });
  function createSample(sequence, traceStep, episodeReward) {
    const replayPayload = {
      fixedSeed: 20260828, episodeId, traceStep, selectedActionKey: decision.value.evidence.selectedActionKey,
      preStateSha256: sha(`pre-${sequence}`), postStateSha256: sha(`post-${sequence}`), publicEventSha256: sha(`event-${sequence}`),
      episodeContextSha256: sha('episode-context'), visibleStateSha256: decision.value.evidence.visibleStateSha256,
      legalActionSetSha256: decision.value.evidence.legalActionSetSha256, teacherEvidenceSha256: decision.value.evidence.evidenceSha256,
      episodeReward,
    };
    const replay = { ...replayPayload, replaySha256: sampleTools.hashStage8BcReplayPayload(replayPayload) };
    const samplePayload = {
      protocolVersion: sampleTools.STAGE8_BC_SAMPLE_PROTOCOL_VERSION,
      sampleId: `${runId}-sample-${String(sequence).padStart(6, '0')}`, batchId: `${runId}-batch-000001`,
      control: bcControl, visibleState, canonicalActions, completeLegalActionSetSha256, teacherEvidence: decision.value.evidence, replay,
    };
    return { ...samplePayload, sampleSha256: sampleTools.hashStage8BcSamplePayload(samplePayload) };
  }
  const samples = [
    createSample(1, 18, { terminal: false, episodeId, terminalRewardReferenceSha256: terminalReference }),
    createSample(2, 19, { terminal: true, terminalDelta }),
  ];
  const realFileSystem = {
    exists: fs.existsSync,
    isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
    listDirectory: fs.readdirSync,
    resolvePath: fs.realpathSync,
    writeFileExclusive: (candidate, bytes) => fs.writeFileSync(candidate, bytes, { flag: 'wx' }),
    readFile: fs.readFileSync,
    renameAtomic: fs.renameSync,
    removeFile: fs.unlinkSync,
  };
  const writerResult = sampleWriter.writeStage8BcSampleShard({
    manifest: artifactControl,
    artifactRoot: { environment: { STAGE8_ARTIFACT_ROOT: artifactRoot }, projectRoots: [root], exists: fs.existsSync,
      isDirectory: realFileSystem.isDirectory, resolvePath: fs.realpathSync },
    batchDirectory, shardId: 'shard-000001', samples, fileSystem: realFileSystem,
  });
  assert.equal(writerResult.ok, true, writerResult.ok ? '' : writerResult.decision.reason);
  identity.datasetPayloadSetSha256 = sha([writerResult.value.payloadSha256]);
  const trainingPlan = {
    fixedSeed: 20260828, maxSteps: 10, epochs: 2, batchSize: 8, learningRate: 0.001,
    policyLossWeight: 1, valueLossWeight: 1, deterministicAlgorithms: true,
    valueTarget: 'terminal-four-seat-zero-sum-delta',
  };
  const flags = {
    'bc-training': { allowPythonRuntime: true, allowTraining: true, allowCheckpointWrite: true, allowOnnxExport: false },
    'bc-onnx-export': { allowPythonRuntime: true, allowTraining: false, allowCheckpointWrite: false, allowOnnxExport: true },
  };
  function createManifest(phase) {
    const payload = {
      protocolVersion: lifecycle.STAGE8_BC_MODEL_LIFECYCLE_VERSION, phase, identity,
      authorization: { approvalId: `${phase}-approval`, granted: true, scope: phase },
      trainingPlan, modelConfig: lifecycle.STAGE8_BC_MODEL_CONFIG, ...flags[phase],
      allowSmoke: false, allowSelfplay: false, allowReplay: false, allowPilot: false,
      allowArena: false, allowChampion: false, allowRuntime: false,
    };
    return { ...payload, manifestSha256: lifecycle.hashStage8BcModelLifecycleManifestPayload(payload) };
  }
  const fileSystem = {
    exists: fs.existsSync,
    isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
    listDirectory: fs.readdirSync,
    resolvePath: path.resolve,
  };
  const artifactRootInput = {
    environment: { STAGE8_ARTIFACT_ROOT: artifactRoot },
    projectRoots: [root], exists: fileSystem.exists, isDirectory: fileSystem.isDirectory,
    resolvePath: fileSystem.resolvePath,
  };
  const trainingManifest = createManifest('bc-training');
  const exportManifest = createManifest('bc-onnx-export');
  const training = lifecycle.preflightStage8BcPythonExecution({
    manifest: trainingManifest, artifactRoot: artifactRootInput, runDirectory, fileSystem,
  });
  const exporting = lifecycle.preflightStage8BcPythonExecution({
    manifest: exportManifest, artifactRoot: artifactRootInput, runDirectory, fileSystem,
  });
  assert.equal(training.ok, true, training.ok ? '' : training.decision.reason);
  assert.equal(exporting.ok, true, exporting.ok ? '' : exporting.decision.reason);

  const canonicalHashFixture = {
    alpha: [1, true, null, '万年麻将'],
    numeric: [0.000001, 0.0000001, 100000000000000000000, 1e21, 0.30000000000000004],
    omega: { enabled: false, version: 'v1' },
  };
  const expectedDefinitions = {
    modelDefinitionSha256: lifecycle.hashStage8BcModelDefinition(),
    trainingDefinitionSha256: lifecycle.hashStage8BcTrainingDefinition(),
    checkpointDefinitionSha256: lifecycle.hashStage8BcCheckpointDefinition(),
    onnxExportDefinitionSha256: lifecycle.hashStage8BcOnnxExportDefinition(),
    parityDefinitionSha256: lifecycle.hashStage8BcParityDefinition(),
  };
  const expectedParameterCount = 1_473_221;
  const checkpointPayload = {
    protocolVersion: lifecycle.STAGE8_BC_CHECKPOINT_EVIDENCE_VERSION,
    runId,
    checkpointId: 'checkpoint-stdlib-test',
    lifecycleManifestSha256: trainingManifest.manifestSha256,
    datasetPayloadSetSha256: identity.datasetPayloadSetSha256,
    modelDefinitionSha256: identity.modelDefinitionSha256,
    trainingDefinitionSha256: identity.trainingDefinitionSha256,
    checkpointDefinitionSha256: identity.checkpointDefinitionSha256,
    checkpointStep: 10,
    checkpointFileSha256: sha('checkpoint-file'),
    modelStateSha256: sha('model-state'),
    optimizerStateSha256: sha('optimizer-state'),
    policyLossDecimal: '0.5',
    valueLossDecimal: '0.25',
    totalLossDecimal: '0.75',
    hardAnomalies: 0,
    lastComplete: true,
  };
  const checkpointEvidence = { ...checkpointPayload, evidenceSha256: sha(checkpointPayload) };
  const request = {
    trainingTicket: training.value,
    exportTicket: exporting.value,
    checkpointEvidence,
    shardPath: writerResult.value.artifactPath,
    canonicalHashFixture,
    canonicalHashSha256: sha(canonicalHashFixture),
    expectedDefinitions,
    expectedParameterCount,
    atomicFixtureSha256: crypto.createHash('sha256').update('stage8-bc-atomic-fixture').digest('hex'),
  };
  const requestPath = path.join(temp, 'request.json');
  fs.writeFileSync(requestPath, JSON.stringify(request), 'utf8');
  const python = findPython();
  const pythonPackageRoot = path.join(root, 'src/game/stage8/python');
  const execution = spawnSync(python, ['-B', path.join(root, 'scripts/stage8-bc-python-code-regression.py'), requestPath], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONPATH: [pythonPackageRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    },
  });
  assert.equal(execution.status, 0, `${execution.stdout}\n${execution.stderr}`);
  const result = JSON.parse(execution.stdout.trim());
  assert.equal(result.passed, true);
  assert.deepEqual(result.definitions, expectedDefinitions);
  assert.equal(result.trainingTicketSha256, training.value.ticketSha256);
  assert.equal(result.exportTicketSha256, exporting.value.ticketSha256);
  assert.equal(result.expectedParameterCount, expectedParameterCount);
  assert.equal(result.nodePythonShardRecords, 2);
  assert.equal(result.tamperedShardRejected, true);
  assert.equal(result.torchImported, false);
  assert.equal(result.onnxImported, false);
  assert.deepEqual(fs.readdirSync(runDirectory), [], 'standard-library fixture must clean its only temporary artifact');
  console.log(JSON.stringify({
    passed: true,
    pythonExecutable: python,
    crossLanguageDefinitionHashes: 5,
    crossLanguageCanonicalHash: true,
    nodePythonShardRecords: result.nodePythonShardRecords,
    tamperedShardRejected: result.tamperedShardRejected,
    artifactRootBoundary: true,
    cpuAndMissingDependencyFailClosedBeforeImport: true,
    temporaryFixtureWrites: result.temporaryFixtureWrites,
    formalSamplesWritten: 0,
    formalModelsWritten: 0,
    torchImported: false,
    onnxImported: false,
    trainingStarted: false,
    smokeGamesExecuted: 0,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
