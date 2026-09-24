import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-lifecycle-'));
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

function float32Base64(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer.toString('base64');
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const identityTools = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const tensor = require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js'));
  const frozen = require(path.join(temp, 'game/stage8/offline-frozen-model-inference.js'));
  const lifecycle = require(path.join(temp, 'game/stage8/offline-bc-model-lifecycle-protocol.js'));
  const sha = identityTools.hashStage8OfflineIdentity;
  const runId = 'bc-model-candidate';
  const fixed = sha('fixed');
  const identity = {
    runId, sourceBundleSha256: sha('source'), artifactControlManifestSha256: sha('artifact-control'), datasetPayloadSetSha256: sha(['payload-one']),
    rulesSha256: sha('rules'), actionSpaceSha256: sha('actions'), legalActionMaskSha256: sha('actions'), featureSha256: sha('features'), visibleInformationSha256: sha('features'),
    sampleSchemaSha256: sha('sample-schema'), tensorContractSha256: tensor.hashStage8OnnxTensorContract(), pythonEnvironmentLockSha256: sha('python-lock'), pythonSourceBundleSha256: sha('python-source'),
    modelDefinitionSha256: lifecycle.hashStage8BcModelDefinition(), trainingDefinitionSha256: lifecycle.hashStage8BcTrainingDefinition(), checkpointDefinitionSha256: lifecycle.hashStage8BcCheckpointDefinition(),
    onnxExportDefinitionSha256: lifecycle.hashStage8BcOnnxExportDefinition(), parityDefinitionSha256: lifecycle.hashStage8BcParityDefinition(),
    inferenceContractSha256: frozen.hashStage8FrozenModelInferenceContract(), onnxSessionOptionsSha256: tensor.hashStage8OnnxSessionOptions(),
  };
  const trainingPlan = { fixedSeed: 20260828, maxSteps: 10, epochs: 2, batchSize: 8, learningRate: 0.001, policyLossWeight: 1, valueLossWeight: 1, deterministicAlgorithms: true, valueTarget: 'terminal-four-seat-zero-sum-delta' };
  const flags = {
    'bc-training': { allowPythonRuntime: true, allowTraining: true, allowCheckpointWrite: true, allowOnnxExport: false },
    'bc-onnx-export': { allowPythonRuntime: true, allowTraining: false, allowCheckpointWrite: false, allowOnnxExport: true },
    'bc-parity-verify': { allowPythonRuntime: false, allowTraining: false, allowCheckpointWrite: false, allowOnnxExport: false },
  };
  function createManifest(phase, changes = {}) {
    const payload = {
      protocolVersion: lifecycle.STAGE8_BC_MODEL_LIFECYCLE_VERSION, phase, identity,
      authorization: { approvalId: `${phase}-approval`, granted: true, scope: phase },
      trainingPlan, modelConfig: lifecycle.STAGE8_BC_MODEL_CONFIG, ...flags[phase],
      allowSmoke: false, allowSelfplay: false, allowReplay: false, allowPilot: false, allowArena: false, allowChampion: false, allowRuntime: false,
      ...changes,
    };
    return { ...payload, manifestSha256: lifecycle.hashStage8BcModelLifecycleManifestPayload(payload) };
  }
  const trainingManifest = createManifest('bc-training');
  const exportManifest = createManifest('bc-onnx-export');
  const parityManifest = createManifest('bc-parity-verify');
  assert.equal(lifecycle.validateStage8BcModelLifecycleManifest(trainingManifest).ok, true);
  assert.equal(lifecycle.validateStage8BcModelLifecycleManifest(exportManifest).ok, true);
  assert.equal(lifecycle.validateStage8BcModelLifecycleManifest(parityManifest).ok, true);

  const artifactRoot = 'C:\\stage8-bc-model-test';
  const runDirectory = `${artifactRoot}\\${runId}`;
  let fileWrites = 0;
  const fileSystem = {
    exists: (candidate) => candidate === artifactRoot || candidate === runDirectory,
    isDirectory: (candidate) => candidate === artifactRoot || candidate === runDirectory,
    listDirectory: () => [], resolvePath: (candidate) => candidate,
    writeFile: () => { fileWrites += 1; },
  };
  const rootInput = { environment: { STAGE8_ARTIFACT_ROOT: artifactRoot }, projectRoots: ['C:\\repo'], exists: fileSystem.exists, isDirectory: fileSystem.isDirectory, resolvePath: fileSystem.resolvePath };
  const ticket = lifecycle.preflightStage8BcPythonExecution({ manifest: trainingManifest, artifactRoot: rootInput, runDirectory, fileSystem });
  assert.equal(ticket.ok, true, ticket.ok ? '' : ticket.decision.reason);
  assert.equal(ticket.value.ticketSha256, lifecycle.hashStage8BcPythonExecutionTicketPayload(Object.fromEntries(Object.entries(ticket.value).filter(([key]) => key !== 'ticketSha256'))));
  assert.equal(fileWrites, 0, 'preflight must never write');

  assert.equal(lifecycle.validateStage8BcModelLifecycleManifest(createManifest('bc-training', { authorization: { approvalId: 'denied', granted: false, scope: 'bc-training' } })).decision.reason, 'bc-lifecycle-authorization-required');
  assert.equal(lifecycle.validateStage8BcModelLifecycleManifest(createManifest('bc-training', { trainingPlan: { ...trainingPlan, maxSteps: 316 } })).decision.reason, 'bc-lifecycle-training-plan-invalid');
  assert.equal(lifecycle.validateStage8BcModelLifecycleManifest(createManifest('bc-training', { allowOnnxExport: true })).decision.reason, 'bc-lifecycle-side-effect-boundary-invalid');
  assert.equal(lifecycle.preflightStage8BcPythonExecution({ manifest: trainingManifest, artifactRoot: { ...rootInput, environment: {} }, runDirectory, fileSystem }).decision.reason, 'bc-lifecycle-stage8-artifact-root-required');

  const checkpointPayload = {
    protocolVersion: lifecycle.STAGE8_BC_CHECKPOINT_EVIDENCE_VERSION, runId, checkpointId: 'checkpoint-000010', lifecycleManifestSha256: trainingManifest.manifestSha256,
    datasetPayloadSetSha256: identity.datasetPayloadSetSha256, modelDefinitionSha256: identity.modelDefinitionSha256, trainingDefinitionSha256: identity.trainingDefinitionSha256,
    checkpointDefinitionSha256: identity.checkpointDefinitionSha256, checkpointStep: 10, checkpointFileSha256: sha('checkpoint-file'), modelStateSha256: sha('model-state'), optimizerStateSha256: sha('optimizer-state'),
    policyLossDecimal: '0.5', valueLossDecimal: '0.25', totalLossDecimal: '0.75', hardAnomalies: 0, lastComplete: true,
  };
  const checkpoint = { ...checkpointPayload, evidenceSha256: sha(checkpointPayload) };
  assert.equal(lifecycle.validateStage8BcCheckpointEvidence({ manifest: trainingManifest, evidence: checkpoint }).ok, true);
  const checkpointTamperedPayload = { ...checkpoint, checkpointStep: 11 };
  delete checkpointTamperedPayload.evidenceSha256;
  const checkpointTampered = { ...checkpointTamperedPayload, evidenceSha256: sha(checkpointTamperedPayload) };
  assert.equal(lifecycle.validateStage8BcCheckpointEvidence({ manifest: trainingManifest, evidence: checkpointTampered }).decision.reason, 'bc-checkpoint-identity-or-result-invalid');

  const frozenIdentity = {
    protocolVersion: frozen.STAGE8_FROZEN_MODEL_PACKAGE_VERSION, modelId: 'model-candidate-one', modelFileSha256: sha('model-file'), onnxBinarySha256: sha('onnx'), modelManifestSha256: sha('manifest'),
    rulesSha256: identity.rulesSha256, actionSpaceSha256: identity.actionSpaceSha256, legalActionMaskSha256: identity.legalActionMaskSha256, featureSha256: identity.featureSha256, visibleInformationSha256: identity.visibleInformationSha256,
    versionedModelUri: 'https://models.example.invalid/stage8/v1/model.onnx', inputSchemaVersion: frozen.STAGE8_MODEL_INPUT_SCHEMA_VERSION,
    policyOutputVersion: frozen.STAGE8_MODEL_POLICY_OUTPUT_VERSION, valueOutputVersion: frozen.STAGE8_MODEL_VALUE_OUTPUT_VERSION,
    tensorContractSha256: identity.tensorContractSha256, onnxRuntimePackage: tensor.STAGE8_ONNX_RUNTIME_PACKAGE, onnxRuntimeVersion: tensor.STAGE8_ONNX_RUNTIME_VERSION,
    onnxExecutionProvider: tensor.STAGE8_ONNX_EXECUTION_PROVIDER, onnxSessionOptionsSha256: identity.onnxSessionOptionsSha256, inferenceContractSha256: identity.inferenceContractSha256,
  };
  const exportPayload = {
    protocolVersion: lifecycle.STAGE8_BC_ONNX_EXPORT_EVIDENCE_VERSION, runId, modelId: frozenIdentity.modelId, lifecycleManifestSha256: exportManifest.manifestSha256,
    checkpointEvidenceSha256: checkpoint.evidenceSha256, checkpointFileSha256: checkpoint.checkpointFileSha256, onnxBinarySha256: frozenIdentity.onnxBinarySha256,
    modelManifestSha256: frozenIdentity.modelManifestSha256, modelFileBytes: 1024, onnxFileBytes: 2048, dynamicLegalActionDimension: true, onnxCheckerPassed: true, frozenModelIdentity: frozenIdentity,
  };
  const exportEvidence = { ...exportPayload, evidenceSha256: sha(exportPayload) };
  assert.equal(lifecycle.validateStage8BcOnnxExportEvidence({ manifest: exportManifest, checkpoint, evidence: exportEvidence }).ok, true);
  assert.equal(lifecycle.validateStage8BcOnnxExportEvidence({ manifest: exportManifest, checkpoint: checkpointTampered, evidence: exportEvidence }).decision.reason, 'bc-onnx-export-checkpoint-invalid');
  const foreignModelPayload = { ...exportEvidence, frozenModelIdentity: { ...frozenIdentity, rulesSha256: sha('foreign-rules') } };
  delete foreignModelPayload.evidenceSha256;
  const foreignModel = { ...foreignModelPayload, evidenceSha256: sha(foreignModelPayload) };
  assert.equal(lifecycle.validateStage8BcOnnxExportEvidence({ manifest: exportManifest, checkpoint, evidence: foreignModel }).decision.reason, 'bc-onnx-export-identity-or-result-invalid');

  const legalActionKeys = ['action-a','action-b'];
  const pythonPolicy = [0.25,0.75]; const nodePolicy = [0.25000003,0.74999994];
  const pythonValue = [1,-1,0,0]; const nodeValue = [1.0000001,-1.0000001,0,0];
  const decoded = (base64) => Array.from({ length: Buffer.from(base64, 'base64').length / 4 }, (_, index) => Buffer.from(base64, 'base64').readFloatLE(index * 4));
  const pythonPolicyBase64 = float32Base64(pythonPolicy); const nodePolicyBase64 = float32Base64(nodePolicy);
  const pythonValueBase64 = float32Base64(pythonValue); const nodeValueBase64 = float32Base64(nodeValue);
  const policyDifference = Math.max(...decoded(pythonPolicyBase64).map((value, index) => Math.abs(value - decoded(nodePolicyBase64)[index])));
  const valueDifference = Math.max(...decoded(pythonValueBase64).map((value, index) => Math.abs(value - decoded(nodeValueBase64)[index])));
  const parityPayload = {
    protocolVersion: lifecycle.STAGE8_BC_PARITY_EVIDENCE_VERSION, runId, fixtureId: 'parity-fixture-one', lifecycleManifestSha256: parityManifest.manifestSha256,
    modelManifestSha256: frozenIdentity.modelManifestSha256, onnxBinarySha256: frozenIdentity.onnxBinarySha256, tensorContractSha256: identity.tensorContractSha256,
    visibleStateSha256: sha('visible-state'), legalActionSetSha256: sha(legalActionKeys), legalActionKeys, numericEncoding: 'little-endian-float32-base64',
    pythonPolicyLogitsFloat32Base64: pythonPolicyBase64, nodePolicyLogitsFloat32Base64: nodePolicyBase64,
    pythonValueDeltaFloat32Base64: pythonValueBase64, nodeValueDeltaFloat32Base64: nodeValueBase64,
    absoluteToleranceDecimal: '0.000001', maximumPolicyDifferenceDecimal: String(policyDifference), maximumValueDifferenceDecimal: String(valueDifference), passed: true,
  };
  const parityEvidence = { ...parityPayload, evidenceSha256: sha(parityPayload) };
  assert.equal(lifecycle.validateStage8BcPythonNodeParityEvidence({ manifest: parityManifest, modelIdentity: frozenIdentity, evidence: parityEvidence }).ok, true);
  assert.equal(lifecycle.validateStage8BcPythonNodeParityEvidence({ manifest: parityManifest, modelIdentity: { ...frozenIdentity, rulesSha256: sha('foreign-rules') }, evidence: parityEvidence }).decision.reason, 'bc-parity-model-identity-mismatch');
  const mismatchPayload = { ...parityPayload, nodePolicyLogitsFloat32Base64: float32Base64([0.1,0.9]), maximumPolicyDifferenceDecimal: '0.15' };
  const mismatch = { ...mismatchPayload, evidenceSha256: sha(mismatchPayload) };
  assert.equal(lifecycle.validateStage8BcPythonNodeParityEvidence({ manifest: parityManifest, modelIdentity: frozenIdentity, evidence: mismatch }).decision.reason, 'bc-parity-identity-or-output-mismatch');

  console.log(JSON.stringify({ passed: true, controls: ['separate-training-export-parity-authorizations','step-315-upper-bound','last-complete-checkpoint','under-10MiB-dynamic-onnx','python-node-same-input-output-identity'], pythonProcessesStarted: 0, trainingStarted: false, checkpointsWritten: 0, onnxExportsWritten: 0, eDriveWrites: 0, smokeGamesExecuted: 0 }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
