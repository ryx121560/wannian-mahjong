import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { runStage8FormalSmokeReadiness, inspectStage8OnnxRuntimeDependency } from './stage8-formal-smoke-readiness.mjs';

const root = process.cwd();
const temp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-formal-smoke-readiness-')));
const artifactRoot = path.join(temp, 'artifacts');
const runDirectory = path.join(artifactRoot, 'formal-smoke-run');
const modelDirectory = path.join(artifactRoot, 'models', 'v1');
const sourceDirectory = path.join(artifactRoot, 'sources');
const controlPath = path.join(artifactRoot, 'control.json');
const runtimePath = path.join(artifactRoot, 'runtime.json');
const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire('node:module');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
let attemptedWrites = 0;
async function checkedReadiness(options) {
  const names = ['mkdtempSync', 'mkdirSync', 'writeFileSync', 'appendFileSync', 'renameSync'];
  const originals = Object.fromEntries(names.map((name) => [name, fs[name]]));
  for (const name of names) fs[name] = () => { attemptedWrites += 1; throw new Error(`unexpected-write:${name}`); };
  try { return await runStage8FormalSmokeReadiness(options); }
  finally { for (const name of names) fs[name] = originals[name]; }
}

function loadTs(filename) {
  const previous = Module._extensions['.ts'];
  Module._extensions['.ts'] = (module, sourcePath) => {
    module._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: sourcePath,
    }).outputText, sourcePath);
  };
  try { return nodeRequire(filename); }
  finally {
    if (previous) Module._extensions['.ts'] = previous;
    else delete Module._extensions['.ts'];
  }
}

const stage8 = (name) => loadTs(path.join(root, 'src', 'game', 'stage8', name));
const modules = {
  artifact: stage8('artifact-root-preflight.ts'),
  preflight: stage8('offline-smoke-runtime-preflight.ts'),
  tensor: stage8('offline-onnx-tensor-contract.ts'),
};
const controlTools = stage8('offline-selfplay-control.ts');
const curriculum = stage8('offline-curriculum-kong-zhichan-chain.ts');
const providerTools = stage8('offline-canonical-mcts-provider.ts');
const inferenceTools = stage8('offline-frozen-model-inference.ts');

function dependencyIdentity(overrides = {}) {
  const payload = {
    packageName: modules.tensor.STAGE8_ONNX_RUNTIME_PACKAGE,
    version: modules.tensor.STAGE8_ONNX_RUNTIME_VERSION,
    executionProvider: modules.tensor.STAGE8_ONNX_EXECUTION_PROVIDER,
    packageJsonSha256: sha('package-json'),
    lockEntrySha256: sha('lock-entry'),
    lockIntegrity: 'sha512-readiness-fixture-only',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    ...overrides,
  };
  return { ...payload, identitySha256: sha(Buffer.from(JSON.stringify(payload))) };
}

const expectedEffects = {
  temporaryDirectoriesCreated: 0,
  writersCreated: 0,
  artifactsWritten: 0,
  formalSmokeGamesExecuted: 0,
  samplesGenerated: 0,
  selfplayStarted: false,
  trainingStarted: false,
};

function writeJson(filename, value) {
  fs.writeFileSync(filename, JSON.stringify(value));
}

try {
  fs.mkdirSync(runDirectory, { recursive: true });
  fs.mkdirSync(modelDirectory, { recursive: true });
  fs.mkdirSync(sourceDirectory, { recursive: true });
  const modelPath = path.join(modelDirectory, 'candidate.model');
  const onnxPath = path.join(modelDirectory, 'candidate.onnx');
  const manifestPath = path.join(modelDirectory, 'manifest.json');
  const providerPath = path.join(sourceDirectory, 'provider.ts');
  const runtimeSourcePath = path.join(sourceDirectory, 'runtime.ts');
  fs.writeFileSync(modelPath, 'model-bytes');
  fs.writeFileSync(onnxPath, 'onnx-bytes');
  fs.writeFileSync(providerPath, 'provider-source');
  fs.writeFileSync(runtimeSourcePath, 'runtime-source');

  const fixed = sha('fixed-readiness-identity');
  const modelPackage = {
    protocolVersion: modules.preflight.STAGE8_MODEL_PACKAGE_MANIFEST_VERSION,
    modelId: 'readiness-fixture-model-v1',
    modelFileSha256: sha(fs.readFileSync(modelPath)),
    onnxBinarySha256: sha(fs.readFileSync(onnxPath)),
    rulesSha256: fixed,
    actionSpaceSha256: fixed,
    legalActionMaskSha256: fixed,
    featureSha256: fixed,
    visibleInformationSha256: fixed,
    versionedModelUri: 'https://models.example.test/stage8/v1/readiness.onnx',
    inputSchemaVersion: inferenceTools.STAGE8_MODEL_INPUT_SCHEMA_VERSION,
    policyOutputVersion: inferenceTools.STAGE8_MODEL_POLICY_OUTPUT_VERSION,
    valueOutputVersion: inferenceTools.STAGE8_MODEL_VALUE_OUTPUT_VERSION,
    tensorContractSha256: modules.tensor.hashStage8OnnxTensorContract(),
    onnxRuntimePackage: modules.tensor.STAGE8_ONNX_RUNTIME_PACKAGE,
    onnxRuntimeVersion: modules.tensor.STAGE8_ONNX_RUNTIME_VERSION,
    onnxExecutionProvider: modules.tensor.STAGE8_ONNX_EXECUTION_PROVIDER,
    onnxSessionOptionsSha256: modules.tensor.hashStage8OnnxSessionOptions(),
    inferenceContractSha256: inferenceTools.hashStage8FrozenModelInferenceContract(),
  };
  writeJson(manifestPath, modelPackage);
  const providerSources = [{ role: 'provider-source', relativePath: 'src/provider.ts', absolutePath: providerPath, sha256: sha(fs.readFileSync(providerPath)) }];
  const runtimeSources = [{ role: 'runtime-source', relativePath: 'src/runtime.ts', absolutePath: runtimeSourcePath, sha256: sha(fs.readFileSync(runtimeSourcePath)) }];
  const providerSourceBundleSha256 = modules.preflight.hashStage8SmokeSourceBundle(providerSources);
  const runtimeSourceBundleSha256 = modules.preflight.hashStage8SmokeSourceBundle(runtimeSources);
  const explicit = Object.freeze({ baseSeed: 4276993775, batchSize: 40, workers: 3, behaviorTemperature: 0.75, modelPolicyWeight: 0.4, runId: 'readiness-fixture-run', approvalId: 'readiness-fixture-approval' });
  const plan = curriculum.createStage8FixedCurriculumPlan(explicit.baseSeed);
  const identity = {
    runId: explicit.runId, runDomainSha256: fixed, rulesSha256: fixed, actionSpaceSha256: fixed,
    legalActionMaskSha256: fixed, featureSha256: fixed, visibleInformationSha256: fixed,
    sampleProtocolSha256: fixed, trajectoryExecutorSha256: fixed, selfplayRuntimeSha256: runtimeSourceBundleSha256,
    mctsProviderSha256: providerSourceBundleSha256, modelFileSha256: modelPackage.modelFileSha256,
    onnxBinarySha256: modelPackage.onnxBinarySha256, modelManifestSha256: sha(fs.readFileSync(manifestPath)),
    curriculumSha256: curriculum.hashStage8FixedCurriculumDefinition(), explorationSha256: fixed,
    seedPlanSha256: plan.planSha256, versionedModelUri: modelPackage.versionedModelUri,
  };
  const controlPayload = {
    protocolVersion: controlTools.STAGE8_OFFLINE_SMOKE_CONTROL_VERSION,
    identity,
    authorization: { approvalId: explicit.approvalId, granted: true, scope: 'fixed-course-smoke-run' },
    curriculum: 'kong-zhichan-chain', plannedGames: 1000, candidateSeatGames: [250, 250, 250, 250],
    scenarioRatio: { forcedRunKong: 2, zhichan: 2, chainKong: 1 }, targetedExplorationRate: 0.2,
    allowFixedCourseSmoke: true, allowTraining: false, allowSelfplayRuntime: true, allowReplayRuntime: false,
    allowModelRuntime: false, allowOnnxRuntime: false, allowCheckpoint: false, allowPilot: false,
    allowArena: false, allowChampion: false, allowProductionRuntime: false,
  };
  const control = { ...controlPayload, manifestSha256: controlTools.hashStage8OfflineSmokeControlManifestPayload(controlPayload) };
  const providerDefinitionSha256 = providerTools.hashStage8CanonicalMctsProviderDefinition({
    behaviorTemperature: explicit.behaviorTemperature,
    modelPolicyWeight: explicit.modelPolicyWeight,
    modelManifestSha256: identity.modelManifestSha256,
    inferenceContractSha256: modelPackage.inferenceContractSha256,
  });
  const fingerprint = modules.preflight.hashStage8FixedCurriculumSelfplayFingerprint({
    controlManifestSha256: control.manifestSha256, baseSeed: explicit.baseSeed, batchSize: explicit.batchSize,
    workers: explicit.workers, behaviorTemperature: explicit.behaviorTemperature, modelPolicyWeight: explicit.modelPolicyWeight,
    curriculumOverride: 'kong-zhichan-chain', providerDefinitionSha256, providerSourceBundleSha256,
    runtimeSourceBundleSha256, modelFileSha256: identity.modelFileSha256, onnxBinarySha256: identity.onnxBinarySha256,
    modelManifestSha256: identity.modelManifestSha256, inferenceContractSha256: modelPackage.inferenceContractSha256,
  });
  const runtimePayload = {
    protocolVersion: modules.preflight.STAGE8_FORMAL_SMOKE_RUNTIME_VERSION,
    controlManifestSha256: control.manifestSha256,
    authorization: { approvalId: explicit.approvalId, granted: true, scope: 'fixed-course-smoke-run' },
    runDirectory, modelFilePath: modelPath, onnxFilePath: onnxPath, modelManifestPath: manifestPath,
    baseSeed: explicit.baseSeed, batchSize: explicit.batchSize, workers: explicit.workers,
    behaviorTemperature: explicit.behaviorTemperature, modelPolicyWeight: explicit.modelPolicyWeight,
    curriculumOverride: 'kong-zhichan-chain', providerDefinitionSha256, providerSources, providerSourceBundleSha256,
    runtimeSources, runtimeSourceBundleSha256, fixedCurriculumSelfplayFingerprint: fingerprint,
    allowLedgerWrite: true, allowQuarantineWrite: true, allowTraining: false, allowReplay: false,
    allowCheckpoint: false, allowPilot: false, allowArena: false, allowChampion: false, allowProductionRuntime: false,
  };
  const runtime = { ...runtimePayload, manifestSha256: modules.preflight.hashStage8FormalSmokeRuntimeManifestPayload(runtimePayload) };
  writeJson(controlPath, control);
  writeJson(runtimePath, runtime);
  const environment = { STAGE8_ARTIFACT_ROOT: artifactRoot, STAGE8_SMOKE_CONTROL_MANIFEST: controlPath, STAGE8_SMOKE_RUNTIME_MANIFEST: runtimePath };
  let sessionCreates = 0;
  let sessionReleases = 0;
  const options = {
    environment, currentRoot: root, projectRoots: [root], modules,
    inspectDependency: () => dependencyIdentity(),
    inspectCapacity: () => ({ totalBytes: 1_000_000, freeBytes: 250_000, runBytes: 0 }),
    createModelInferencePort: async ({ identity: receivedIdentity, onnxBytes }) => {
      sessionCreates += 1;
      assert.equal(receivedIdentity.onnxBinarySha256, modelPackage.onnxBinarySha256);
      assert.equal(Buffer.from(onnxBytes).toString(), 'onnx-bytes');
      return { async release() { sessionReleases += 1; } };
    },
  };
  const green = await checkedReadiness(options);
  assert.equal(green.ok, true, green.reason);
  assert.equal(green.status, 'ready');
  assert.equal(green.value.runId, explicit.runId);
  assert.equal(green.value.approvalId, explicit.approvalId);
  assert.deepEqual(green.value.orchestration, {
    baseSeed: explicit.baseSeed, batchSize: explicit.batchSize, workers: explicit.workers,
    behaviorTemperature: explicit.behaviorTemperature, modelPolicyWeight: explicit.modelPolicyWeight,
  }, 'product-undecided values must be explicit and preserved');
  assert.deepEqual(green.effects, expectedEffects);
  assert.equal(sessionCreates, 1);
  assert.equal(sessionReleases, 1);

  async function expectFail(overrides, expectedReason, expectedSessionCreates = sessionCreates) {
    const result = await checkedReadiness({ ...options, ...overrides });
    assert.equal(result.ok, false, expectedReason);
    assert.equal(result.reason, expectedReason);
    assert.deepEqual(result.effects, expectedEffects);
    assert.equal(sessionCreates, expectedSessionCreates, `${expectedReason} must not initialize a CPU session`);
  }
  await expectFail({ environment: {} }, 'formal-smoke-readiness-explicit-inputs-required');
  await expectFail({ environment: { STAGE8_ARTIFACT_ROOT: root, STAGE8_SMOKE_CONTROL_MANIFEST: path.join(root, 'control.json'), STAGE8_SMOKE_RUNTIME_MANIFEST: path.join(root, 'runtime.json') } }, 'formal-smoke-readiness-project-tree-forbidden');
  await expectFail({ environment: { ...environment, STAGE8_SMOKE_CONTROL_MANIFEST: path.join(temp, 'outside-control.json') } }, 'formal-smoke-readiness-manifest-outside-artifact-root');
  const fileSystem = {
    exists: fs.existsSync,
    isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
    isFile: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    readFile: (candidate) => fs.readFileSync(candidate),
    listDirectory: (candidate) => candidate === runDirectory ? ['old-ledger.json'] : fs.readdirSync(candidate),
    realPath: (candidate) => fs.realpathSync.native(candidate),
  };
  await expectFail({ fileSystem }, 'smoke-runtime-directory-not-empty');
  await expectFail({ fileSystem: { ...fileSystem, realPath: (candidate) => candidate === artifactRoot ? root : candidate } }, 'formal-smoke-readiness-path-alias-forbidden');
  await expectFail({ inspectCapacity: () => ({ totalBytes: 1000, freeBytes: 200, runBytes: 0 }) }, 'formal-smoke-volume-used-ratio-fused');
  await expectFail({ inspectDependency: () => { throw new Error('formal-smoke-onnx-runtime-dependency-missing'); } }, 'formal-smoke-onnx-runtime-dependency-missing');
  await expectFail({ inspectDependency: () => dependencyIdentity({ version: '0.0.0' }) }, 'formal-smoke-onnx-runtime-dependency-identity-invalid');
  const tamperedFileSystem = { ...fileSystem, listDirectory: (candidate) => fs.readdirSync(candidate), readFile: (candidate) => candidate === onnxPath ? Buffer.from('tampered') : fs.readFileSync(candidate) };
  await expectFail({ fileSystem: tamperedFileSystem }, 'smoke-model-package-file-hash-mismatch');

  const deniedPayload = { ...controlPayload, authorization: { ...controlPayload.authorization, granted: false } };
  writeJson(controlPath, { ...deniedPayload, manifestSha256: controlTools.hashStage8OfflineSmokeControlManifestPayload(deniedPayload) });
  await expectFail({}, 'smoke-explicit-authorization-required');
  writeJson(controlPath, control);
  writeJson(runtimePath, { ...runtime, allowTraining: true });
  await expectFail({}, 'smoke-runtime-downstream-flow-forbidden');
  writeJson(runtimePath, runtime);

  for (const key of ['baseSeed', 'batchSize', 'workers', 'behaviorTemperature', 'modelPolicyWeight']) {
    const missing = { ...runtime };
    delete missing[key];
    writeJson(runtimePath, missing);
    await expectFail({}, 'smoke-runtime-orchestration-config-invalid');
  }
  writeJson(runtimePath, runtime);
  const malformed = { ...control };
  delete malformed.authorization;
  writeJson(controlPath, malformed);
  await expectFail({}, 'formal-smoke-readiness-manifest-contract-invalid');
  writeJson(controlPath, control);
  const actualDependency = inspectStage8OnnxRuntimeDependency(root, {
    packageName: modules.tensor.STAGE8_ONNX_RUNTIME_PACKAGE,
    version: modules.tensor.STAGE8_ONNX_RUNTIME_VERSION,
    executionProvider: modules.tensor.STAGE8_ONNX_EXECUTION_PROVIDER,
  });
  assert.equal(actualDependency.version, '1.27.0');
  assert.match(actualDependency.identitySha256, /^[a-f0-9]{64}$/);

  const beforeSessionFailure = sessionCreates;
  await expectFail({ createModelInferencePort: async () => { sessionCreates += 1; throw new Error('invalid-onnx'); } }, 'formal-smoke-cpu-onnx-session-preflight-failed', beforeSessionFailure + 1);
  const source = fs.readFileSync(path.join(root, 'scripts', 'stage8-formal-smoke-readiness.mjs'), 'utf8');
  for (const forbidden of ['runStage8FormalSmoke(', 'mkdtemp', 'mkdirSync', 'writeFileSync', 'renameSync']) assert.equal(source.includes(forbidden), false, `readiness entry must not contain ${forbidden}`);
  assert.equal(source.includes('stage8-offline-smoke-runner'), false, 'readiness must not import the formal runner');
  assert.equal(attemptedWrites, 0, 'filesystem write spies must remain untouched');
  const cliEnvironment = { ...process.env };
  for (const key of Object.keys(cliEnvironment)) if (key.startsWith('STAGE8_')) delete cliEnvironment[key];
  const cli = spawnSync(process.execPath, ['scripts/stage8-formal-smoke-readiness.mjs'], { cwd: root, env: cliEnvironment, encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.error?.message || cli.stderr);
  assert.equal(JSON.parse(cli.stdout).reason, 'formal-smoke-readiness-explicit-inputs-required');
  const isolatedCli = path.join(temp, 'readiness-without-dependencies.mjs');
  fs.writeFileSync(isolatedCli, source);
  const missingDependencyCli = spawnSync(process.execPath, [isolatedCli], {
    cwd: temp, env: { ...cliEnvironment, ...environment }, encoding: 'utf8',
  });
  assert.equal(missingDependencyCli.status, 1, missingDependencyCli.error?.message || missingDependencyCli.stderr);
  assert.equal(JSON.parse(missingDependencyCli.stdout).reason, 'formal-smoke-readiness-module-load-failed');
  let releaseAttempts = 0;
  await expectFail({ createModelInferencePort: async () => ({
    async release() { releaseAttempts += 1; throw new Error('release-failure'); },
  }) }, 'formal-smoke-cpu-onnx-session-preflight-failed');
  assert.equal(releaseAttempts, 2);
  assert.equal(attemptedWrites, 0);

  console.log(JSON.stringify({
    passed: true,
    controls: ['explicit-inputs', 'project-worktree-forbidden', 'manifest-root-boundary', 'empty-run-directory', 'immutable-model-bytes', 'explicit-orchestration-no-defaults', 'dependency-lock-identity', 'capacity-fuse', 'cpu-session-create-release', 'downstream-deny', 'zero-effects-on-failure', 'no-runner-import'],
    cpuSessionsInitialized: sessionCreates, successfulCpuSessionsReleased: sessionReleases,
    attemptedWrites, defaultCliExitCode: cli.status, missingDependencyCliExitCode: missingDependencyCli.status, releaseFailureAttempts: releaseAttempts,
    formalSmokeGamesExecuted: 0, artifactsWritten: 0, trainingStarted: false,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
