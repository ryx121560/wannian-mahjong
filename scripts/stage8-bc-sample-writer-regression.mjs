import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-writer-'));
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

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const actions = require(path.join(temp, 'game/stage8/action-registry-v2.js'));
  const identity = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const bc = require(path.join(temp, 'game/stage8/offline-bc-control.js'));
  const teacher = require(path.join(temp, 'game/stage8/offline-bc-teacher.js'));
  const sampleTools = require(path.join(temp, 'game/stage8/offline-bc-sample-protocol.js'));
  const tensor = require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js'));
  const controlTools = require(path.join(temp, 'game/stage8/offline-bc-artifact-control.js'));
  const writer = require(path.join(temp, 'game/stage8/offline-bc-sample-writer.js'));
  const sha = identity.hashStage8OfflineIdentity;
  const runId = 'bc-writer-candidate';
  const batchId = `${runId}-batch-000001`;
  const episodeId = `${runId}-episode-one`;
  const bcPayload = {
    protocolVersion: bc.STAGE8_BC_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256: sha('bc-source'), rulesSha256: sha('rules'), browserRulesSha256: sha('browser-rules'),
      actionSpaceSha256: sha('actions'), legalActionMaskSha256: sha('mask'), featureSha256: sha('features'), visibleInformationSha256: sha('visible'),
      tensorContractSha256: tensor.hashStage8OnnxTensorContract(), teacherDefinitionSha256: teacher.hashStage8BcTeacherDefinition(), sampleSchemaSha256: sampleTools.hashStage8BcSampleProtocolDefinition(),
    },
    authorization: { approvalId: 'bc-protocol-approval', granted: true, scope: 'bc-teacher-protocol-preflight' },
    teacherTemperature: 1,
    allowSampleGeneration: false, allowPythonRuntime: false, allowTraining: false, allowModelCreation: false,
    allowOnnxExport: false, allowArtifactWrite: false, allowSmoke: false, allowRuntime: false,
  };
  const bcControl = { ...bcPayload, manifestSha256: bc.hashStage8BcControlManifestPayload(bcPayload) };
  const artifactPayload = {
    protocolVersion: controlTools.STAGE8_BC_ARTIFACT_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256: sha('artifact-source'), bcControlManifestSha256: bcControl.manifestSha256,
      sampleSchemaSha256: sampleTools.hashStage8BcSampleProtocolDefinition(), tensorContractSha256: tensor.hashStage8OnnxTensorContract(),
      writerDefinitionSha256: writer.hashStage8BcArtifactWriterDefinition(), pythonDatasetDefinitionSha256: sha('python-dataset'),
      modelDefinitionSha256: sha('model'), trainingDefinitionSha256: sha('training'), checkpointDefinitionSha256: sha('checkpoint'),
      onnxExportDefinitionSha256: sha('onnx-export'), parityDefinitionSha256: sha('parity'),
    },
    bcControl,
    authorization: { approvalId: 'bc-artifact-approval', granted: true, scope: controlTools.STAGE8_BC_ARTIFACT_SCOPE },
    limits: { maxSamplesPerShard: controlTools.STAGE8_BC_MAX_SAMPLES_PER_SHARD, maxUncompressedShardBytes: controlTools.STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES },
    allowSampleGeneration: true, allowArtifactWrite: true, allowPythonRuntime: false, allowTraining: false,
    allowModelCreation: false, allowCheckpointWrite: false, allowOnnxExport: false, allowSmoke: false, allowRuntime: false,
  };
  const artifactControl = { ...artifactPayload, manifestSha256: controlTools.hashStage8BcArtifactControlManifestPayload(artifactPayload) };
  const hand = ['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8','wan9','tong1','tong2','tong3','tong4','tong5'];
  const visibleState = { actor: 0, ownHand: hand, publicMelds: [[],[],[],[]], publicDiscards: [[],['tiao1'],['nan'],['bai']], scores: [0,0,0,0], dealer: 0, turn: 18, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 70 };
  const canonicalActions = identity.sortStage8CanonicalActions(hand.map((tile) => actions.canonicalizeStage8V2Action({ actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile, ownTileCount: 1, robKongWindow: false })));
  const completeLegalActionSetSha256 = identity.hashStage8CanonicalActionSet(canonicalActions);
  const decision = teacher.evaluateStage8BcTeacher({ control: bcControl, visibleState, legalActions: canonicalActions, completeLegalActionSetSha256 });
  assert.equal(decision.ok, true, decision.ok ? '' : decision.decision.reason);
  const terminalDelta = [6,-2,-2,-2];
  const terminalReference = writer.hashStage8BcTerminalReward({ episodeId, terminalDelta });
  function createSample(sequence, traceStep, episodeReward) {
    const replayPayload = {
      fixedSeed: 20260828, episodeId, traceStep, selectedActionKey: decision.value.evidence.selectedActionKey,
      preStateSha256: sha(`pre-${sequence}`), postStateSha256: sha(`post-${sequence}`), publicEventSha256: sha(`event-${sequence}`), episodeContextSha256: sha('episode-context'),
      visibleStateSha256: decision.value.evidence.visibleStateSha256, legalActionSetSha256: decision.value.evidence.legalActionSetSha256,
      teacherEvidenceSha256: decision.value.evidence.evidenceSha256, episodeReward,
    };
    const replay = { ...replayPayload, replaySha256: sampleTools.hashStage8BcReplayPayload(replayPayload) };
    const samplePayload = {
      protocolVersion: sampleTools.STAGE8_BC_SAMPLE_PROTOCOL_VERSION,
      sampleId: `${runId}-sample-${String(sequence).padStart(6, '0')}`,
      batchId, control: bcControl, visibleState, canonicalActions, completeLegalActionSetSha256,
      teacherEvidence: decision.value.evidence, replay,
    };
    return { ...samplePayload, sampleSha256: sampleTools.hashStage8BcSamplePayload(samplePayload) };
  }
  const samples = [
    createSample(1, 18, { terminal: false, episodeId, terminalRewardReferenceSha256: terminalReference }),
    createSample(2, 19, { terminal: true, terminalDelta }),
  ];
  const artifactRoot = 'C:\\stage8-bc-writer-test';
  const batchDirectory = `${artifactRoot}\\${batchId}`;
  const rootInput = (fileSystem) => ({ environment: { STAGE8_ARTIFACT_ROOT: artifactRoot }, projectRoots: ['C:\\repo'], exists: fileSystem.exists, isDirectory: fileSystem.isDirectory, resolvePath: fileSystem.resolvePath });
  function memoryFileSystem({ failRename = false, corruptFinalRead = false } = {}) {
    const files = new Map();
    let writes = 0;
    return {
      files,
      get writes() { return writes; },
      exists: (candidate) => candidate === artifactRoot || candidate === batchDirectory || files.has(candidate),
      isDirectory: (candidate) => candidate === artifactRoot || candidate === batchDirectory,
      listDirectory: (candidate) => {
        assert.equal(candidate, batchDirectory);
        return Array.from(files.keys()).filter((item) => path.win32.dirname(item) === batchDirectory).map((item) => path.win32.basename(item));
      },
      resolvePath: (candidate) => candidate,
      writeFileExclusive: (candidate, bytes) => {
        if (files.has(candidate)) throw new Error('exists');
        writes += 1;
        files.set(candidate, Buffer.from(bytes));
      },
      readFile: (candidate) => {
        const content = Buffer.from(files.get(candidate) ?? (() => { throw new Error('missing'); })());
        return corruptFinalRead && !candidate.endsWith('.partial') ? Buffer.concat([content, Buffer.from('corrupt')]) : content;
      },
      renameAtomic: (source, destination) => {
        if (failRename) throw new Error('injected-rename-failure');
        if (!files.has(source) || files.has(destination)) throw new Error('rename-invalid');
        files.set(destination, files.get(source)); files.delete(source);
      },
      removeFile: (candidate) => { files.delete(candidate); },
    };
  }

  const firstFs = memoryFileSystem();
  let isolatedValidatorCalls = 0;
  const first = writer.writeStage8BcSampleShard({
    manifest: artifactControl, artifactRoot: rootInput(firstFs), batchDirectory, shardId: 'shard-000001', samples, fileSystem: firstFs,
    sampleValidator: (sample) => { isolatedValidatorCalls += 1; return sampleTools.validateStage8BcSampleEnvelope(sample); },
  });
  assert.equal(first.ok, true, first.ok ? '' : first.decision.reason);
  assert.equal(isolatedValidatorCalls, 2, 'an injected cold-cache validator must check every sample before writing');
  assert.equal(first.value.sampleCount, 2);
  assert.equal(first.value.episodeCount, 1);
  assert.equal(firstFs.writes, 1, 'one partial file is the only write before atomic rename');
  assert.equal(firstFs.files.size, 1);
  const parsed = JSON.parse(gunzipSync(firstFs.files.get(first.value.artifactPath)).toString('utf8'));
  assert.equal(parsed.manifest.payloadSha256, first.value.payloadSha256);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].tensors.terminalRewardReferenceSha256, terminalReference);
  assert.equal(parsed.records[1].tensors.terminalRewardReferenceSha256, terminalReference);

  const secondFs = memoryFileSystem();
  const second = writer.writeStage8BcSampleShard({ manifest: artifactControl, artifactRoot: rootInput(secondFs), batchDirectory, shardId: 'shard-000001', samples: samples.slice().reverse(), fileSystem: secondFs });
  assert.equal(second.ok, true, second.ok ? '' : second.decision.reason);
  assert.equal(second.value.artifactFileSha256, first.value.artifactFileSha256, 'same samples must produce deterministic compressed bytes');
  assert.equal(second.value.payloadSha256, first.value.payloadSha256);

  const rejectedByValidatorFs = memoryFileSystem();
  const rejectedByValidator = writer.writeStage8BcSampleShard({
    manifest: artifactControl, artifactRoot: rootInput(rejectedByValidatorFs), batchDirectory, shardId: 'shard-000001', samples,
    fileSystem: rejectedByValidatorFs,
    sampleValidator: () => ({ ok: false, decision: { status: 'fused', reason: 'injected-teacher-cache-drift', isolationId: 'injected-isolation' } }),
  });
  assert.equal(rejectedByValidator.decision.reason, 'bc-artifact-injected-teacher-cache-drift');
  assert.equal(rejectedByValidatorFs.writes, 0, 'teacher evidence drift must fail before a partial file exists');

  const invalidReplayPayload = { ...samples[0].replay, episodeReward: { terminal: false, episodeId, terminalRewardReferenceSha256: sha('wrong-terminal') } };
  delete invalidReplayPayload.replaySha256;
  const invalidReplay = { ...invalidReplayPayload, replaySha256: sampleTools.hashStage8BcReplayPayload(invalidReplayPayload) };
  const invalidSamplePayload = { ...samples[0], replay: invalidReplay };
  delete invalidSamplePayload.sampleSha256;
  const invalidSample = { ...invalidSamplePayload, sampleSha256: sampleTools.hashStage8BcSamplePayload(invalidSamplePayload) };
  const invalidFs = memoryFileSystem();
  const invalid = writer.writeStage8BcSampleShard({ manifest: artifactControl, artifactRoot: rootInput(invalidFs), batchDirectory, shardId: 'shard-000001', samples: [invalidSample, samples[1]], fileSystem: invalidFs });
  assert.equal(invalid.decision.reason, 'bc-artifact-terminal-reference-unresolved');
  assert.equal(invalidFs.writes, 0);
  assert.equal(invalidFs.files.size, 0);

  const failedFs = memoryFileSystem({ failRename: true });
  const failed = writer.writeStage8BcSampleShard({ manifest: artifactControl, artifactRoot: rootInput(failedFs), batchDirectory, shardId: 'shard-000001', samples, fileSystem: failedFs });
  assert.equal(failed.decision.reason, 'bc-artifact-atomic-commit-failed');
  assert.equal(failedFs.writes, 1);
  assert.equal(failedFs.files.size, 0, 'failed atomic commit must remove the partial artifact');

  const corruptFinalFs = memoryFileSystem({ corruptFinalRead: true });
  const corruptFinal = writer.writeStage8BcSampleShard({ manifest: artifactControl, artifactRoot: rootInput(corruptFinalFs), batchDirectory, shardId: 'shard-000001', samples, fileSystem: corruptFinalFs });
  assert.equal(corruptFinal.decision.reason, 'bc-artifact-atomic-commit-failed');
  assert.equal(corruptFinalFs.files.size, 0, 'a final artifact that fails readback must be removed or quarantined');

  console.log(JSON.stringify({ passed: true, inMemorySamplesValidated: 2, deterministicShardReplay: true, trueTerminalRewardResolved: true, atomicPartialWrites: 4, corruptFinalRejected: true, committedTestArtifacts: 2, formalBcSamplesGenerated: 0, eDriveWrites: 0, trainingStarted: false, smokeGamesExecuted: 0 }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
