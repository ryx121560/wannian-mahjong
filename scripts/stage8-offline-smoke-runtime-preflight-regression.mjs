import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { runStage8OfflineSmokeCli } from './stage8-offline-smoke-runner.mjs';

const projectRoot = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-smoke-preflight-'));
const compiled = path.join(temp, 'compiled');
const artifactRoot = path.join(temp, 'artifacts');
const runDirectory = path.join(artifactRoot, 'formal-smoke-run');
const modelDirectory = path.join(artifactRoot, 'models', 'v1');
const sourceDirectory = path.join(temp, 'sources');
const require = createRequire(import.meta.url);

function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); compileTree(from, to); }
    else if (entry.name.endsWith('.ts')) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: from }).outputText); }
  }
}
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

try {
  fs.mkdirSync(runDirectory, { recursive: true });
  fs.mkdirSync(modelDirectory, { recursive: true });
  fs.mkdirSync(sourceDirectory, { recursive: true });
  compileTree(path.join(projectRoot, 'src/game'), path.join(compiled, 'game'));
  const preflight = require(path.join(compiled, 'game/stage8/offline-smoke-runtime-preflight.js'));
  const controlTools = require(path.join(compiled, 'game/stage8/offline-selfplay-control.js'));
  const curriculum = require(path.join(compiled, 'game/stage8/offline-curriculum-kong-zhichan-chain.js'));
  const providerTools = require(path.join(compiled, 'game/stage8/offline-canonical-mcts-provider.js'));

  const modelPath = path.join(modelDirectory, 'candidate.model');
  const onnxPath = path.join(modelDirectory, 'candidate.onnx');
  const manifestPath = path.join(modelDirectory, 'manifest.json');
  const providerSourcePath = path.join(sourceDirectory, 'provider.ts');
  const runtimeSourcePath = path.join(sourceDirectory, 'runner.ts');
  fs.writeFileSync(modelPath, 'model-bytes');
  fs.writeFileSync(onnxPath, 'onnx-bytes');
  fs.writeFileSync(providerSourcePath, 'provider-source');
  fs.writeFileSync(runtimeSourcePath, 'runtime-source');
  const fixed = sha('fixed-identity');
  const modelPackage = {
    protocolVersion: preflight.STAGE8_MODEL_PACKAGE_MANIFEST_VERSION,
    modelId: 'candidate-model-v1',
    modelFileSha256: sha(fs.readFileSync(modelPath)),
    onnxBinarySha256: sha(fs.readFileSync(onnxPath)),
    rulesSha256: fixed,
    actionSpaceSha256: fixed,
    legalActionMaskSha256: fixed,
    featureSha256: fixed,
    visibleInformationSha256: fixed,
    versionedModelUri: 'https://models.example.test/stage8/v1/candidate.onnx',
  };
  fs.writeFileSync(manifestPath, JSON.stringify(modelPackage));
  const providerSources = [{ role: 'provider-source', relativePath: 'src/provider.ts', absolutePath: providerSourcePath, sha256: sha(fs.readFileSync(providerSourcePath)) }];
  const runtimeSources = [{ role: 'runtime-source', relativePath: 'src/runner.ts', absolutePath: runtimeSourcePath, sha256: sha(fs.readFileSync(runtimeSourcePath)) }];
  const providerSourceBundleSha256 = preflight.hashStage8SmokeSourceBundle(providerSources);
  const runtimeSourceBundleSha256 = preflight.hashStage8SmokeSourceBundle(runtimeSources);
  const plan = curriculum.createStage8FixedCurriculumPlan(20260824);
  const identity = {
    runId: 'formal-smoke-candidate', runDomainSha256: fixed, rulesSha256: fixed,
    actionSpaceSha256: fixed, legalActionMaskSha256: fixed, featureSha256: fixed,
    visibleInformationSha256: fixed, sampleProtocolSha256: fixed, trajectoryExecutorSha256: fixed,
    selfplayRuntimeSha256: runtimeSourceBundleSha256, mctsProviderSha256: providerSourceBundleSha256,
    modelFileSha256: modelPackage.modelFileSha256, onnxBinarySha256: modelPackage.onnxBinarySha256,
    modelManifestSha256: sha(fs.readFileSync(manifestPath)), curriculumSha256: curriculum.hashStage8FixedCurriculumDefinition(),
    explorationSha256: fixed, seedPlanSha256: plan.planSha256, versionedModelUri: modelPackage.versionedModelUri,
  };
  const controlPayload = {
    protocolVersion: controlTools.STAGE8_OFFLINE_SMOKE_CONTROL_VERSION, identity,
    authorization: { approvalId: 'formal-smoke-approval', granted: true, scope: 'fixed-course-smoke-run' },
    curriculum: 'kong-zhichan-chain', plannedGames: 1000, candidateSeatGames: [250,250,250,250],
    scenarioRatio: { forcedRunKong: 2, zhichan: 2, chainKong: 1 }, targetedExplorationRate: 0.2,
    allowFixedCourseSmoke: true, allowTraining: false, allowSelfplayRuntime: true, allowReplayRuntime: false,
    allowModelRuntime: false, allowOnnxRuntime: false, allowCheckpoint: false, allowPilot: false,
    allowArena: false, allowChampion: false, allowProductionRuntime: false,
  };
  const control = { ...controlPayload, manifestSha256: controlTools.hashStage8OfflineSmokeControlManifestPayload(controlPayload) };
  const providerDefinitionSha256 = providerTools.hashStage8CanonicalMctsProviderDefinition({ behaviorTemperature: 1 });
  const fingerprint = preflight.hashStage8FixedCurriculumSelfplayFingerprint({
    controlManifestSha256: control.manifestSha256, baseSeed: 20260824, batchSize: 25, workers: 4,
    behaviorTemperature: 1, curriculumOverride: 'kong-zhichan-chain', providerDefinitionSha256,
    providerSourceBundleSha256, runtimeSourceBundleSha256, modelFileSha256: identity.modelFileSha256,
    onnxBinarySha256: identity.onnxBinarySha256, modelManifestSha256: identity.modelManifestSha256,
  });
  const runtimePayload = {
    protocolVersion: preflight.STAGE8_FORMAL_SMOKE_RUNTIME_VERSION,
    controlManifestSha256: control.manifestSha256,
    authorization: { approvalId: 'formal-smoke-approval', granted: true, scope: 'fixed-course-smoke-run' },
    runDirectory, modelFilePath: modelPath, onnxFilePath: onnxPath, modelManifestPath: manifestPath,
    baseSeed: 20260824, batchSize: 25, workers: 4, behaviorTemperature: 1,
    curriculumOverride: 'kong-zhichan-chain', providerDefinitionSha256,
    providerSources, providerSourceBundleSha256, runtimeSources, runtimeSourceBundleSha256,
    fixedCurriculumSelfplayFingerprint: fingerprint, allowLedgerWrite: true, allowQuarantineWrite: true,
    allowTraining: false, allowReplay: false, allowCheckpoint: false, allowPilot: false,
    allowArena: false, allowChampion: false, allowProductionRuntime: false,
  };
  const runtime = { ...runtimePayload, manifestSha256: preflight.hashStage8FormalSmokeRuntimeManifestPayload(runtimePayload) };
  const fileSystem = {
    exists: fs.existsSync,
    isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
    isFile: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    readFile: (candidate) => fs.readFileSync(candidate),
    listDirectory: (candidate) => fs.readdirSync(candidate),
  };
  const rootInput = { environment: { STAGE8_ARTIFACT_ROOT: artifactRoot }, projectRoots: [projectRoot], exists: fs.existsSync, isDirectory: fileSystem.isDirectory };
  const green = preflight.preflightStage8FormalSmokeRuntime({ control, runtime, artifactRoot: rootInput, fileSystem });
  assert.equal(green.ok, true, green.ok ? '' : green.decision.reason);
  assert.equal(preflight.preflightStage8FormalSmokeRuntime({ control, runtime, artifactRoot: { ...rootInput, environment: {} }, fileSystem }).decision.reason, 'smoke-stage8-artifact-root-required');
  assert.equal(preflight.preflightStage8FormalSmokeRuntime({ control, runtime, artifactRoot: rootInput, fileSystem: { ...fileSystem, exists: (candidate) => candidate === modelPath ? false : fs.existsSync(candidate) } }).decision.reason, 'smoke-model-package-file-missing');
  assert.equal(preflight.preflightStage8FormalSmokeRuntime({ control, runtime, artifactRoot: rootInput, fileSystem: { ...fileSystem, readFile: (candidate) => candidate === onnxPath ? Buffer.from('tampered') : fs.readFileSync(candidate) } }).decision.reason, 'smoke-model-package-file-hash-mismatch');
  assert.equal(preflight.preflightStage8FormalSmokeRuntime({ control, runtime, artifactRoot: rootInput, fileSystem: { ...fileSystem, listDirectory: (candidate) => candidate === runDirectory ? ['old-ledger.json'] : fs.readdirSync(candidate) } }).decision.reason, 'smoke-runtime-directory-not-empty');
  const preflightControlPayload = { ...controlPayload, authorization: { ...controlPayload.authorization, scope: 'fixed-course-smoke-preflight' }, allowSelfplayRuntime: false };
  const preflightControl = { ...preflightControlPayload, manifestSha256: controlTools.hashStage8OfflineSmokeControlManifestPayload(preflightControlPayload) };
  assert.equal(preflight.preflightStage8FormalSmokeRuntime({ control: preflightControl, runtime, artifactRoot: rootInput, fileSystem }).decision.reason, 'smoke-runtime-control-authorization-required');
  const tamperedRuntime = { ...runtime, workers: 2 };
  assert.equal(preflight.preflightStage8FormalSmokeRuntime({ control, runtime: tamperedRuntime, artifactRoot: rootInput, fileSystem }).decision.reason, 'smoke-runtime-fingerprint-mismatch');

  const controlPath = path.join(temp, 'formal-smoke-control.json');
  const runtimePath = path.join(temp, 'formal-smoke-runtime.json');
  const cliEnvironment = {
    STAGE8_SMOKE_CONTROL_MANIFEST: controlPath,
    STAGE8_SMOKE_RUNTIME_MANIFEST: runtimePath,
    STAGE8_ARTIFACT_ROOT: artifactRoot,
  };
  async function assertCliFailsBeforeTemporaryWrites(candidateControl, candidateRuntime, expectedReason) {
    fs.writeFileSync(controlPath, JSON.stringify(candidateControl));
    fs.writeFileSync(runtimePath, JSON.stringify(candidateRuntime));
    const temporaryWrites = { mkdtempSync: 0, compileTree: 0, writeFileSync: 0 };
    const result = await runStage8OfflineSmokeCli({
      environment: cliEnvironment,
      createTemporaryDirectory: () => { temporaryWrites.mkdtempSync += 1; throw new Error('unexpected-mkdtemp'); },
      compileRuntimeTree: () => { temporaryWrites.compileTree += 1; temporaryWrites.writeFileSync += 1; },
      createArtifactWriter: () => ({ writeImmutable: () => { temporaryWrites.writeFileSync += 1; } }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, expectedReason);
    assert.deepEqual(temporaryWrites, { mkdtempSync: 0, compileTree: 0, writeFileSync: 0 });
  }

  const deniedControlPayload = {
    ...controlPayload,
    authorization: { ...controlPayload.authorization, granted: false },
  };
  const deniedControl = {
    ...deniedControlPayload,
    manifestSha256: controlTools.hashStage8OfflineSmokeControlManifestPayload(deniedControlPayload),
  };
  await assertCliFailsBeforeTemporaryWrites(deniedControl, runtime, 'smoke-explicit-authorization-required');
  await assertCliFailsBeforeTemporaryWrites(control, { ...runtime, manifestSha256: '0'.repeat(64) }, 'smoke-runtime-manifest-hash-mismatch');
  const originalOnnx = fs.readFileSync(onnxPath);
  fs.writeFileSync(onnxPath, 'tampered-onnx');
  await assertCliFailsBeforeTemporaryWrites(control, runtime, 'smoke-model-package-file-hash-mismatch');
  fs.writeFileSync(onnxPath, originalOnnx);

  console.log(JSON.stringify({ passed: true, controls: ['existing-absolute-root','prebuilt-empty-run-directory','model-file-hash','onnx-hash','model-manifest-hash','source-bundle-hashes','run-authorization','runtime-fingerprint','downstream-deny','cli-full-preflight-before-mkdtemp','cli-preflight-failure-zero-temp-write'], formalSmokeGamesExecuted: 0, writerAvailableDuringPreflight: false, cliTemporaryWritesOnFailure: 0, artifactsWritten: false }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
