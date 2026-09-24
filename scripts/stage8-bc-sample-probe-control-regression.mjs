import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-probe-control-'));
const require = createRequire(import.meta.url);

function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); compileTree(from, to); }
    else if (entry.name.endsWith('.ts')) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: from,
      }).outputText);
    }
  }
}

function buildManifest(modules) {
  const { identity, bc, teacher, sample, tensor, writer, artifact, probe } = modules;
  const sha = identity.hashStage8OfflineIdentity;
  const runId = 'bc-sample-probe-candidate';
  const sourceBundleSha256 = sha('source-bundle');
  const bcPayload = {
    protocolVersion: bc.STAGE8_BC_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256, rulesSha256: sha('rules'), browserRulesSha256: sha('browser-rules'),
      actionSpaceSha256: sha('actions'), legalActionMaskSha256: sha('mask'), featureSha256: sha('features'),
      visibleInformationSha256: sha('visible'), tensorContractSha256: tensor.hashStage8OnnxTensorContract(),
      teacherDefinitionSha256: teacher.hashStage8BcTeacherDefinition(), sampleSchemaSha256: sample.hashStage8BcSampleProtocolDefinition(),
    },
    authorization: { approvalId: 'bc-probe-teacher-approval', granted: true, scope: 'bc-teacher-protocol-preflight' },
    teacherTemperature: 1,
    allowSampleGeneration: false, allowPythonRuntime: false, allowTraining: false, allowModelCreation: false,
    allowOnnxExport: false, allowArtifactWrite: false, allowSmoke: false, allowRuntime: false,
  };
  const bcControl = { ...bcPayload, manifestSha256: bc.hashStage8BcControlManifestPayload(bcPayload) };
  const artifactPayload = {
    protocolVersion: artifact.STAGE8_BC_ARTIFACT_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256, bcControlManifestSha256: bcControl.manifestSha256,
      sampleSchemaSha256: sample.hashStage8BcSampleProtocolDefinition(), tensorContractSha256: tensor.hashStage8OnnxTensorContract(),
      writerDefinitionSha256: writer.hashStage8BcArtifactWriterDefinition(), pythonDatasetDefinitionSha256: sha('python-dataset'),
      modelDefinitionSha256: sha('model'), trainingDefinitionSha256: sha('training'), checkpointDefinitionSha256: sha('checkpoint'),
      onnxExportDefinitionSha256: sha('onnx-export'), parityDefinitionSha256: sha('parity'),
    },
    bcControl,
    authorization: { approvalId: 'bc-probe-artifact-approval', granted: true, scope: artifact.STAGE8_BC_ARTIFACT_SCOPE },
    limits: { maxSamplesPerShard: artifact.STAGE8_BC_MAX_SAMPLES_PER_SHARD, maxUncompressedShardBytes: artifact.STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES },
    allowSampleGeneration: true, allowArtifactWrite: true, allowPythonRuntime: false, allowTraining: false,
    allowModelCreation: false, allowCheckpointWrite: false, allowOnnxExport: false, allowSmoke: false, allowRuntime: false,
  };
  const artifactControl = { ...artifactPayload, manifestSha256: artifact.hashStage8BcArtifactControlManifestPayload(artifactPayload) };
  const probePayload = {
    protocolVersion: probe.STAGE8_BC_SAMPLE_PROBE_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256, environmentManifestSha256: sha('environment'), artifactControlManifestSha256: artifactControl.manifestSha256,
      rulesSha256: bcControl.identity.rulesSha256, browserRulesSha256: bcControl.identity.browserRulesSha256,
      actionSpaceSha256: bcControl.identity.actionSpaceSha256, legalActionMaskSha256: bcControl.identity.legalActionMaskSha256,
      featureSha256: bcControl.identity.featureSha256, visibleInformationSha256: bcControl.identity.visibleInformationSha256,
      tensorContractSha256: bcControl.identity.tensorContractSha256, teacherDefinitionSha256: bcControl.identity.teacherDefinitionSha256,
      sampleSchemaSha256: bcControl.identity.sampleSchemaSha256, writerDefinitionSha256: artifactControl.identity.writerDefinitionSha256,
      trajectoryDefinitionSha256: sha('trajectory'), capacityPreflightSha256: sha('capacity-preflight'),
    },
    artifactControl,
    authorization: { approvalId: 'bc-sample-probe-approval', granted: true, scope: probe.STAGE8_BC_SAMPLE_PROBE_SCOPE },
    plan: {
      baseSeed: 2026082800, seedDerivation: 'base-plus-game-index-v1', gameCount: 4, candidateSeats: [0,1,2,3],
      workers: 1, curriculum: 'normal-full-rules', exploration: false, modelLoading: false, recordAllSeats: true,
      teacherVersion: teacher.STAGE8_BC_TEACHER_VERSION, teacherTemperature: 1,
      selection: 'argmax-then-canonical-key', maxSuccessfulTransitionsPerGame: 600,
    },
    capacity: { maxRunBytes: probe.STAGE8_BC_SAMPLE_PROBE_MAX_RUN_BYTES, preflightBeforeRun: true, preflightBeforeEachBatchCommit: true },
    allowProbeExecution: true, allowArtifactWrite: true, allowModelLoading: false, allowExploration: false,
    allowSmoke: false, allowSelfplay: false, allowTraining: false, allowOnnxExport: false, allowRuntime: false,
  };
  return { ...probePayload, manifestSha256: probe.hashStage8BcSampleProbeControlPayload(probePayload) };
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const modules = {
    identity: require(path.join(temp, 'game/stage8/offline-action-identity.js')),
    bc: require(path.join(temp, 'game/stage8/offline-bc-control.js')),
    teacher: require(path.join(temp, 'game/stage8/offline-bc-teacher.js')),
    sample: require(path.join(temp, 'game/stage8/offline-bc-sample-protocol.js')),
    tensor: require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js')),
    writer: require(path.join(temp, 'game/stage8/offline-bc-sample-writer.js')),
    artifact: require(path.join(temp, 'game/stage8/offline-bc-artifact-control.js')),
    probe: require(path.join(temp, 'game/stage8/offline-bc-sample-probe-control.js')),
  };
  const manifest = buildManifest(modules);
  const green = modules.probe.validateStage8BcSampleProbeControl(manifest);
  assert.equal(green.ok, true, green.ok ? '' : green.decision.reason);
  assert.deepEqual(green.value.fixedSeeds, [2026082800,2026082801,2026082802,2026082803]);
  const rehash = (changes) => {
    const payload = { ...structuredClone(manifest), ...changes };
    delete payload.manifestSha256;
    return { ...payload, manifestSha256: modules.probe.hashStage8BcSampleProbeControlPayload(payload) };
  };
  assert.equal(modules.probe.validateStage8BcSampleProbeControl(rehash({ authorization: { ...manifest.authorization, granted: false } })).decision.reason, 'bc-probe-control-authorization-required');
  assert.equal(modules.probe.validateStage8BcSampleProbeControl(rehash({ plan: { ...manifest.plan, candidateSeats: [0,1,2,2] } })).decision.reason, 'bc-probe-plan-invalid');
  assert.equal(modules.probe.validateStage8BcSampleProbeControl(rehash({ plan: { ...manifest.plan, exploration: true } })).decision.reason, 'bc-probe-plan-invalid');
  assert.equal(modules.probe.validateStage8BcSampleProbeControl(rehash({ allowTraining: true })).decision.reason, 'bc-probe-side-effect-boundary-invalid');
  assert.equal(modules.probe.validateStage8BcSampleProbeControl(rehash({ capacity: { ...manifest.capacity, maxRunBytes: 1 } })).decision.reason, 'bc-probe-capacity-contract-invalid');
  console.log(JSON.stringify({ passed: true, games: 4, candidateSeats: [0,1,2,3], workers: 1, exploration: false, modelLoading: false, maxTransitions: 600, writes: 0, eDriveWrites: 0, trainingStarted: false, formalSmokeGamesExecuted: 0 }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

export { buildManifest };
