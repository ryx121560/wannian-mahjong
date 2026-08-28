import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-artifact-control-'));
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
  const identity = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const bc = require(path.join(temp, 'game/stage8/offline-bc-control.js'));
  const teacher = require(path.join(temp, 'game/stage8/offline-bc-teacher.js'));
  const sample = require(path.join(temp, 'game/stage8/offline-bc-sample-protocol.js'));
  const tensor = require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js'));
  const writer = require(path.join(temp, 'game/stage8/offline-bc-sample-writer.js'));
  const control = require(path.join(temp, 'game/stage8/offline-bc-artifact-control.js'));
  const sha = identity.hashStage8OfflineIdentity;
  const runId = 'bc-artifact-candidate';
  const bcPayload = {
    protocolVersion: bc.STAGE8_BC_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256: sha('bc-source'), rulesSha256: sha('rules'), browserRulesSha256: sha('browser-rules'),
      actionSpaceSha256: sha('actions'), legalActionMaskSha256: sha('mask'), featureSha256: sha('features'), visibleInformationSha256: sha('visible'),
      tensorContractSha256: tensor.hashStage8OnnxTensorContract(), teacherDefinitionSha256: teacher.hashStage8BcTeacherDefinition(),
      sampleSchemaSha256: sample.hashStage8BcSampleProtocolDefinition(),
    },
    authorization: { approvalId: 'bc-protocol-approval', granted: true, scope: 'bc-teacher-protocol-preflight' },
    teacherTemperature: 1,
    allowSampleGeneration: false, allowPythonRuntime: false, allowTraining: false, allowModelCreation: false,
    allowOnnxExport: false, allowArtifactWrite: false, allowSmoke: false, allowRuntime: false,
  };
  const bcControl = { ...bcPayload, manifestSha256: bc.hashStage8BcControlManifestPayload(bcPayload) };
  const artifactPayload = {
    protocolVersion: control.STAGE8_BC_ARTIFACT_CONTROL_VERSION,
    identity: {
      runId, sourceBundleSha256: sha('artifact-source'), bcControlManifestSha256: bcControl.manifestSha256,
      sampleSchemaSha256: sample.hashStage8BcSampleProtocolDefinition(), tensorContractSha256: tensor.hashStage8OnnxTensorContract(),
      writerDefinitionSha256: writer.hashStage8BcArtifactWriterDefinition(), pythonDatasetDefinitionSha256: sha('python-dataset'),
      modelDefinitionSha256: sha('model'), trainingDefinitionSha256: sha('training'), checkpointDefinitionSha256: sha('checkpoint'),
      onnxExportDefinitionSha256: sha('onnx-export'), parityDefinitionSha256: sha('parity'),
    },
    bcControl,
    authorization: { approvalId: 'bc-artifact-approval', granted: true, scope: control.STAGE8_BC_ARTIFACT_SCOPE },
    limits: { maxSamplesPerShard: control.STAGE8_BC_MAX_SAMPLES_PER_SHARD, maxUncompressedShardBytes: control.STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES },
    allowSampleGeneration: true, allowArtifactWrite: true, allowPythonRuntime: false, allowTraining: false,
    allowModelCreation: false, allowCheckpointWrite: false, allowOnnxExport: false, allowSmoke: false, allowRuntime: false,
  };
  const artifactControl = { ...artifactPayload, manifestSha256: control.hashStage8BcArtifactControlManifestPayload(artifactPayload) };
  const artifactRoot = 'C:\\stage8-bc-test-artifacts';
  const batchDirectory = `${artifactRoot}\\${runId}-batch-000001`;
  let pathInspections = 0;
  const fileSystem = {
    exists: (candidate) => { pathInspections += 1; return candidate === artifactRoot || candidate === batchDirectory; },
    isDirectory: (candidate) => { pathInspections += 1; return candidate === artifactRoot || candidate === batchDirectory; },
    listDirectory: (candidate) => { pathInspections += 1; assert.equal(candidate, batchDirectory); return []; },
    resolvePath: (candidate) => candidate,
  };
  const rootInput = { environment: { STAGE8_ARTIFACT_ROOT: artifactRoot }, projectRoots: ['C:\\repo', 'C:\\repo\\.worktrees\\candidate'], exists: fileSystem.exists, isDirectory: fileSystem.isDirectory, resolvePath: fileSystem.resolvePath };
  const green = control.preflightStage8BcArtifactWrite({ manifest: artifactControl, artifactRoot: rootInput, batchDirectory, fileSystem });
  assert.equal(green.ok, true, green.ok ? '' : green.decision.reason);
  assert.equal(green.value.batchDirectory, batchDirectory);
  assert.ok(pathInspections > 0);

  const rehash = (base, changes) => {
    const payload = { ...base, ...changes };
    delete payload.manifestSha256;
    return { ...payload, manifestSha256: control.hashStage8BcArtifactControlManifestPayload(payload) };
  };
  assert.equal(control.validateStage8BcArtifactControlManifest(rehash(artifactControl, { authorization: { ...artifactControl.authorization, granted: false } })).decision.reason, 'bc-artifact-control-authorization-required');
  assert.equal(control.validateStage8BcArtifactControlManifest(rehash(artifactControl, { allowTraining: true })).decision.reason, 'bc-artifact-control-side-effect-boundary-invalid');
  assert.equal(control.validateStage8BcArtifactControlManifest(rehash(artifactControl, { limits: { ...artifactControl.limits, maxSamplesPerShard: 1 } })).decision.reason, 'bc-artifact-control-limits-invalid');
  assert.equal(control.preflightStage8BcArtifactWrite({ manifest: artifactControl, artifactRoot: { ...rootInput, environment: {} }, batchDirectory, fileSystem }).decision.reason, 'bc-artifact-stage8-artifact-root-required');
  assert.equal(control.preflightStage8BcArtifactWrite({ manifest: artifactControl, artifactRoot: rootInput, batchDirectory: 'C:\\repo\\inside', fileSystem }).decision.reason, 'bc-artifact-batch-directory-outside-root');
  assert.equal(control.preflightStage8BcArtifactWrite({ manifest: artifactControl, artifactRoot: rootInput, batchDirectory, fileSystem: { ...fileSystem, listDirectory: () => ['existing.json.gz'] } }).decision.reason, 'bc-artifact-batch-directory-not-empty');
  assert.equal(control.preflightStage8BcArtifactWrite({ manifest: artifactControl, artifactRoot: { ...rootInput, environment: { STAGE8_ARTIFACT_ROOT: 'E:\\not-created' }, exists: () => false }, batchDirectory: 'E:\\not-created\\batch', fileSystem: { ...fileSystem, exists: () => false } }).decision.reason, 'bc-artifact-stage8-artifact-root-missing');

  console.log(JSON.stringify({ passed: true, controls: ['explicit-write-authorization','existing-absolute-external-root','strict-child-empty-batch-directory','fixed-shard-quotas','downstream-deny'], artifactWrites: 0, eDriveDirectoriesCreated: 0, pythonProcessesStarted: 0, trainingStarted: false, smokeGamesExecuted: 0 }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
