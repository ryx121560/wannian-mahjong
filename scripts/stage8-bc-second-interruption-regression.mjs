import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  inspectStage8BcSecondInterruption,
  inspectWindowsProcess,
  runStage8BcSecondInterruptionRecovery,
  verifyStage8BcSecondInterruptionQuarantine,
} from './stage8-bc-second-interruption-recovery.mjs';

const root = process.cwd();
const require = createRequire(import.meta.url);

function loadTs(entry) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(
    fs.readFileSync(filename, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename },
  ).outputText, filename);
  try { return require(entry); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const protocol = loadTs(path.join(root, 'src/game/stage8/offline-bc-operational-interruption.ts'));
const supervisionTools = loadTs(path.join(root, 'src/game/stage8/offline-bc-supervision-control.ts'));
const corpusTools = loadTs(path.join(root, 'src/game/stage8/offline-bc-corpus-control.ts'));
const h = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const absentProcess = (pid) => ({ state: 'absent', pid });

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function resignCorpus(file, control) {
  const { manifestSha256: _manifestSha256, ...payload } = control;
  control.manifestSha256 = corpusTools.hashStage8BcCorpusControlPayload(payload);
  fs.writeFileSync(file, `${JSON.stringify(control)}\n`);
}

function resignSupervision(file, control) {
  const { manifestSha256: _manifestSha256, ...payload } = control;
  control.manifestSha256 = supervisionTools.hashStage8BcSupervisionControlPayload(payload);
  fs.writeFileSync(file, `${JSON.stringify(control)}\n`);
}

function controlFor(runId, values) {
  const payload = {
    protocolVersion: supervisionTools.STAGE8_BC_SUPERVISION_CONTROL_VERSION,
    identity: {
      runId, sourceCommit: 'a'.repeat(40), sourceBundleSha256: h('source'),
      runAuthorizationSha256: values.authorization, artifactControlManifestSha256: values.artifact,
      corpusControlManifestSha256: values.corpus, predecessorEvidenceSha256: values.predecessor,
      supervisionDefinitionSha256: supervisionTools.hashStage8BcSupervisionDefinition(),
      launcherSourceSha256: h('launcher'), supervisorSourceSha256: h('supervisor'), runnerSourceSha256: h('runner'),
    },
    authorization: { approvalId: 'product-supervision-approval', granted: true, scope: supervisionTools.STAGE8_BC_SUPERVISION_SCOPE },
    policy: {
      workers: 1, priorOperationalInterruptions: 1, maxOperationalInterruptions: 1,
      automaticRetries: 0, seedOverrides: 0, allowThirdAttempt: false,
      windowsHide: true, detachedSupervisor: true, shell: false,
      heartbeatIntervalMs: supervisionTools.STAGE8_BC_HEARTBEAT_INTERVAL_MS,
      heartbeatStaleMs: supervisionTools.STAGE8_BC_HEARTBEAT_STALE_MS,
    },
  };
  return { ...payload, manifestSha256: supervisionTools.hashStage8BcSupervisionControlPayload(payload) };
}

function statusFor(control, previous, state, progress, heartbeatAt) {
  const payload = {
    protocolVersion: supervisionTools.STAGE8_BC_SUPERVISION_PROTOCOL_VERSION,
    runId: control.identity.runId, supervisionManifestSha256: control.manifestSha256,
    sourceCommit: control.identity.sourceCommit, sourceBundleSha256: control.identity.sourceBundleSha256,
    predecessorEvidenceSha256: control.identity.predecessorEvidenceSha256,
    launchNonce: h('nonce'), sequence: previous ? previous.sequence + 1 : 0,
    previousStatusSha256: previous?.statusSha256 ?? null, state,
    launcherPid: 91001, supervisorPid: 91002, workerPid: 91003,
    supervisorStartedAt: '2026-09-14T12:00:00.000Z', workerStartedAt: '2026-09-14T12:00:01.000Z',
    heartbeatAt, progress,
    commandIdentity: {
      executableSha256: h('node'), argvSha256: h('argv'),
      environmentAllowlistSha256: h('env'), cwdSha256: h('cwd'),
    },
    exitCode: null, signal: null, terminalState: null, automaticRetries: 0, seedOverrides: 0,
  };
  return { ...payload, statusSha256: supervisionTools.hashStage8BcSupervisionStatusPayload(payload) };
}

function fixture(parent, name) {
  const directory = path.join(parent, name);
  const artifactRoot = path.join(directory, 'artifacts');
  const controlsRoot = path.join(directory, 'controls');
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.mkdirSync(controlsRoot);
  const runId = `formal-bc-corpus-${name}`;
  const values = { authorization: h(`${name}-authorization`), predecessor: h(`${name}-predecessor`),
    artifact: h(`${name}-artifact`) };
  const authorization = { runId, sourceCommit: 'a'.repeat(40), authorizationSha256: values.authorization,
    predecessor: { runId: 'formal-bc-corpus-predecessor', evidenceSha256: values.predecessor } };
  const predecessor = { predecessorRunId: authorization.predecessor.runId, evidenceSha256: values.predecessor };
  const artifact = { protocolVersion: 'stage8-bc-artifact-control-v2', manifestSha256: values.artifact,
    identity: { runId, sourceBundleSha256: h('source'), runAuthorizationSha256: values.authorization,
      predecessorEvidenceSha256: values.predecessor } };
  const corpusPayload = { protocolVersion: corpusTools.STAGE8_BC_CORPUS_CONTROL_SUPERVISED_VERSION,
    identity: { runId, sourceBundleSha256: h('source'), runAuthorizationSha256: values.authorization,
      predecessorRunId: authorization.predecessor.runId, predecessorEvidenceSha256: values.predecessor,
      artifactControlManifestSha256: values.artifact, bcControlManifestSha256: h('bc-control'),
      rulesSha256: h('rules'), browserRulesSha256: h('browser-rules'), actionSpaceSha256: h('actions'),
      legalActionMaskSha256: h('actions'), featureSha256: h('features'), visibleInformationSha256: h('features'),
      tensorContractSha256: h('tensor'), teacherDefinitionSha256: h('teacher'), sampleSchemaSha256: h('sample'),
      writerDefinitionSha256: h('writer'), trajectoryDefinitionSha256: h('trajectory'),
      pythonDatasetDefinitionSha256: h('python-dataset'), corpusManifestDefinitionSha256: h('corpus-manifest'),
      capacityPreflightSha256: h('capacity'), supervisionDefinitionSha256: h('supervision-definition') },
    authorization: { approvalId: 'product-corpus-approval', granted: true, scope: corpusTools.STAGE8_BC_CORPUS_SCOPE },
    plan: {
      baseSeed: corpusTools.STAGE8_BC_CORPUS_BASE_SEED, seedDerivation: 'base-plus-game-index-v1',
      gameCount: 64, candidateSeatDerivation: 'game-index-modulo-four-v1', candidateSeatGames: [16,16,16,16],
      workers: 1, curriculum: 'normal-full-rules', exploration: false, modelLoading: false, recordAllSeats: true,
      maxSuccessfulTransitionsPerGame: 600, splitUnit: 'episode-seed-group',
      splitCounts: { train: 48, validation: 8, finalTest: 8 }, splitAssignment: 'game-index-ranges-v1',
      crossRunPolicy: 'single-run-only', supervisedExecutionRequired: true, priorOperationalInterruptions: 1,
      maxOperationalInterruptions: 1, automaticRetries: 0, seedOverrides: 0,
    },
    capacity: { maxRunBytes: 5 * 1024 ** 3, rootHardLimitBytes: 64 * 1024 ** 3, rootFusePercent: 80,
      preflightBeforeRun: true, preflightBeforeEachBatchCommit: true },
    allowCorpusPilotExecution: true, allowArtifactWrite: true, allowCrossRun: false, allowTraining: false,
    allowValidationSamplingForTraining: false, allowFinalTestSamplingForTraining: false,
    allowModelLoading: false, allowExploration: false, allowSmoke: false, allowSelfplay: false,
    allowOnnxExport: false, allowRuntime: false,
  };
  const corpus = { ...corpusPayload, manifestSha256: corpusTools.hashStage8BcCorpusControlPayload(corpusPayload) };
  values.corpus = corpus.manifestSha256;
  const supervision = controlFor(runId, values);
  const objects = { authorization, predecessor, artifact, corpus, supervision };
  const paths = Object.fromEntries(Object.entries(objects).map(([key, value]) => {
    const file = path.join(controlsRoot, `${key}.json`); writeJson(file, value); return [key, file];
  }));
  const runDirectory = path.join(artifactRoot, runId);
  const staging = `${runDirectory}.partial`;
  const supervisionDirectory = path.join(artifactRoot, `${runId}.supervision`);
  fs.mkdirSync(staging);
  fs.mkdirSync(supervisionDirectory);
  fs.mkdirSync(path.join(staging, 'batches'));
  for (let index = 1; index <= 16; index += 1) {
    const batch = path.join(staging, 'batches', `batch-${String(index).padStart(6, '0')}`);
    fs.mkdirSync(batch);
    fs.writeFileSync(path.join(batch, `shard-${String(index).padStart(6, '0')}.json.gz`),
      zlib.gzipSync(JSON.stringify({ records: [{ gameIndex: index - 1, sample: index }] })));
  }
  const lock = {
    protocolVersion: supervisionTools.STAGE8_BC_SUPERVISION_PROTOCOL_VERSION,
    runId, launchNonce: h('nonce'), launcherPid: 91001, supervisorPid: 91002,
    supervisorStartedAt: '2026-09-14T12:00:00.000Z', supervisionManifestSha256: supervision.manifestSha256,
  };
  writeJson(path.join(supervisionDirectory, 'LOCK.json'), lock);
  const statuses = [];
  statuses.push(statusFor(supervision, undefined, 'starting', { completedGames: 0, completedShards: 0, lastGameIndex: null }, '2026-09-14T12:00:02.000Z'));
  statuses.push(statusFor(supervision, statuses[0], 'running', { completedGames: 0, completedShards: 0, lastGameIndex: null }, '2026-09-14T12:00:03.000Z'));
  statuses.push(statusFor(supervision, statuses[1], 'running', { completedGames: 16, completedShards: 16, lastGameIndex: 15 }, '2026-09-14T12:56:40.107Z'));
  statuses.forEach((status) => writeJson(path.join(supervisionDirectory,
    `status-${String(status.sequence).padStart(6, '0')}.json`), status));
  const environment = {
    STAGE8_ARTIFACT_ROOT: artifactRoot, STAGE8_BC_CORPUS_RUN_DIRECTORY: runDirectory,
    STAGE8_BC_SUPERVISION_DIRECTORY: supervisionDirectory, STAGE8_BC_RUN_AUTHORIZATION: paths.authorization,
    STAGE8_BC_PREDECESSOR_EVIDENCE: paths.predecessor, STAGE8_BC_ARTIFACT_CONTROL_MANIFEST: paths.artifact,
    STAGE8_BC_CORPUS_CONTROL_MANIFEST: paths.corpus, STAGE8_BC_SUPERVISION_CONTROL_MANIFEST: paths.supervision,
  };
  const validators = {
    protocol: { ...protocol, validateStage8BcOperationalInterruptionEvidence: () => ({ ok: true, value: {} }) },
    identity: { validateStage8BcRunAuthorizationInput: () => ({ ok: true, value: {} }) },
    artifact: { validateStage8BcArtifactControlManifest: () => ({ ok: true, value: {} }) },
    corpus: corpusTools,
    supervision: supervisionTools,
  };
  return { directory, environment, validators, objects, paths, staging, quarantine: `${staging}.quarantine`, supervisionDirectory };
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-second-interruption-'));

assert.equal(typeof protocol.createStage8BcSecondInterruptionEvidence, 'function');
assert.equal(typeof inspectStage8BcSecondInterruption, 'function');
assert.equal(typeof inspectWindowsProcess, 'function');
assert.equal(typeof runStage8BcSecondInterruptionRecovery, 'function');

try {
  const probePayload = (pid, present) => JSON.stringify({
    probeVersion: 'stage8-bc-process-probe-v1', queryPid: pid, present,
    process: present ? { ProcessId: pid, StartTime: '2026-09-14T12:00:00.000Z', Path: 'C:\\node.exe' } : null,
  });
  const probeResult = (stdout, overrides = {}) => ({
    error: undefined, signal: null, status: 0, stderr: '', stdout, ...overrides,
  });
  assert.deepEqual(inspectWindowsProcess(42, { spawnProcess: () => probeResult(probePayload(42, false)) }),
    { state: 'absent', pid: 42 });
  assert.equal(inspectWindowsProcess(42, { spawnProcess: () => probeResult(probePayload(42, true)) }).state, 'present');
  for (const probe of [
    probeResult('', { status: null }),
    probeResult('', { error: new Error('spawn failed'), status: null }),
    probeResult('', { status: 7 }),
    probeResult('', { signal: 'SIGTERM', status: null }),
    probeResult(probePayload(42, false), { stderr: 'diagnostic failure' }),
  ]) assert.throws(() => inspectWindowsProcess(42, { spawnProcess: () => probe }),
    /bc-second-interruption-process-probe-execution-failed/);
  assert.throws(() => inspectWindowsProcess(42, { spawnProcess: () => probeResult('{broken') }),
    /bc-second-interruption-process-probe-output-invalid/);
  assert.throws(() => inspectWindowsProcess(42, { spawnProcess: () => probeResult(probePayload(43, false)) }),
    /bc-second-interruption-process-probe-schema-invalid/);
  assert.throws(() => inspectWindowsProcess(42, { spawnProcess: () => probeResult(JSON.stringify({
    probeVersion: 'stage8-bc-process-probe-v1', queryPid: 42, present: true,
    process: { ProcessId: 43, StartTime: '2026-09-14T12:00:00.000Z', Path: 'C:\\node.exe' },
  })) }), /bc-second-interruption-process-probe-schema-invalid/);
  if (process.platform === 'win32') {
    try {
      assert.equal(inspectWindowsProcess(process.pid).state, 'present');
      assert.equal(inspectWindowsProcess(2_147_483_647).state, 'absent');
    } catch (error) {
      assert.match(String(error), /bc-second-interruption-process-probe-execution-failed/);
    }
  }

  const checked = fixture(temporary, 'check');
  assert.equal(corpusTools.validateStage8BcCorpusControlManifest(checked.objects.corpus).ok, true);
  assert.equal(Object.hasOwn(checked.objects.corpus.plan, 'allowThirdAttempt'), false);
  const checkResult = runStage8BcSecondInterruptionRecovery({ args: ['--check'], environment: checked.environment,
    validators: checked.validators, inspectProcess: absentProcess, nowMs: Date.parse('2026-09-15T00:00:00Z') });
  assert.equal(checkResult.ok, true);
  assert.equal(checkResult.filesWritten, 0);
  assert.equal(fs.existsSync(checked.staging), true);
  assert.equal(fs.existsSync(checked.quarantine), false);
  assert.equal(checkResult.value.evidence.quarantine.completedShardCount, 16);
  assert.equal(checkResult.value.evidence.supervision.statusCount, 3);
  assert.equal(checkResult.value.evidence.interruption.benchmarkInvalidated, true);

  const live = fixture(temporary, 'live');
  assert.equal(inspectStage8BcSecondInterruption({ environment: live.environment, validators: live.validators,
    inspectProcess: (pid) => pid === 91002 ? { state: 'present', pid, process: {} } : absentProcess(pid),
    nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason, 'bc-second-interruption-live-process-present');

  const probeFailure = fixture(temporary, 'probe-failure');
  assert.equal(inspectStage8BcSecondInterruption({ environment: probeFailure.environment,
    validators: probeFailure.validators, inspectProcess: () => { throw new Error('probe-unavailable'); },
    nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason, 'probe-unavailable');
  const invalidProbe = fixture(temporary, 'invalid-probe');
  assert.equal(inspectStage8BcSecondInterruption({ environment: invalidProbe.environment,
    validators: invalidProbe.validators, inspectProcess: () => null,
    nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason,
  'bc-second-interruption-process-probe-result-invalid');

  const fresh = fixture(temporary, 'fresh');
  assert.equal(inspectStage8BcSecondInterruption({ environment: fresh.environment, validators: fresh.validators,
    inspectProcess: absentProcess, nowMs: Date.parse('2026-09-14T12:56:45Z') }).reason,
  'bc-second-interruption-latest-status-not-stale-boundary');

  const brokenChain = fixture(temporary, 'broken-chain');
  const lastStatusPath = path.join(brokenChain.supervisionDirectory, 'status-000002.json');
  const lastStatus = JSON.parse(fs.readFileSync(lastStatusPath, 'utf8'));
  lastStatus.progress.completedGames = 15;
  fs.writeFileSync(lastStatusPath, `${JSON.stringify(lastStatus)}\n`);
  assert.equal(inspectStage8BcSecondInterruption({ environment: brokenChain.environment, validators: brokenChain.validators,
    inspectProcess: absentProcess, nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason,
  'bc-supervision-status-hash-mismatch');

  const wrongBinding = fixture(temporary, 'wrong-binding');
  wrongBinding.objects.corpus.identity.runAuthorizationSha256 = h('wrong');
  resignCorpus(wrongBinding.paths.corpus, wrongBinding.objects.corpus);
  assert.equal(inspectStage8BcSecondInterruption({ environment: wrongBinding.environment, validators: wrongBinding.validators,
    inspectProcess: absentProcess, nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason,
  'bc-second-interruption-cross-binding-invalid');

  const wrongCapacity = fixture(temporary, 'wrong-capacity');
  wrongCapacity.objects.corpus.capacity.rootFusePercent = 81;
  resignCorpus(wrongCapacity.paths.corpus, wrongCapacity.objects.corpus);
  assert.equal(inspectStage8BcSecondInterruption({ environment: wrongCapacity.environment,
    validators: wrongCapacity.validators, inspectProcess: absentProcess,
    nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason, 'bc-corpus-control-capacity-invalid');

  const extraCorpusField = fixture(temporary, 'extra-corpus-field');
  extraCorpusField.objects.corpus.plan.allowThirdAttempt = false;
  resignCorpus(extraCorpusField.paths.corpus, extraCorpusField.objects.corpus);
  assert.equal(inspectStage8BcSecondInterruption({ environment: extraCorpusField.environment,
    validators: extraCorpusField.validators, inspectProcess: absentProcess,
    nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason, 'bc-corpus-control-nested-schema-invalid');

  for (const [name, value, expectedReason] of [
    ['missing', undefined, 'bc-supervision-control-schema-invalid'],
    ['null', null, 'bc-supervision-control-policy-invalid'],
    ['true', true, 'bc-supervision-control-policy-invalid'],
  ]) {
    const invalidSupervision = fixture(temporary, `supervision-${name}`);
    if (value === undefined) delete invalidSupervision.objects.supervision.policy.allowThirdAttempt;
    else invalidSupervision.objects.supervision.policy.allowThirdAttempt = value;
    resignSupervision(invalidSupervision.paths.supervision, invalidSupervision.objects.supervision);
    assert.equal(inspectStage8BcSecondInterruption({ environment: invalidSupervision.environment,
      validators: invalidSupervision.validators, inspectProcess: absentProcess,
      nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason, expectedReason);
  }

  const wrongShard = fixture(temporary, 'wrong-shard');
  fs.appendFileSync(path.join(wrongShard.staging, 'batches', 'batch-000016', 'shard-000016.json.gz'), 'tamper');
  assert.equal(inspectStage8BcSecondInterruption({ environment: wrongShard.environment, validators: wrongShard.validators,
    inspectProcess: absentProcess, nowMs: Date.parse('2026-09-15T00:00:00Z') }).ok, false);

  const existing = fixture(temporary, 'existing');
  fs.mkdirSync(existing.quarantine);
  assert.equal(inspectStage8BcSecondInterruption({ environment: existing.environment, validators: existing.validators,
    inspectProcess: absentProcess, nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason,
  'bc-second-interruption-path-state-invalid');

  const unauthorized = fixture(temporary, 'unauthorized');
  assert.equal(runStage8BcSecondInterruptionRecovery({ args: ['--quarantine'], environment: unauthorized.environment,
    validators: unauthorized.validators, inspectProcess: absentProcess,
    nowMs: Date.parse('2026-09-15T00:00:00Z') }).reason,
  'bc-second-interruption-quarantine-authorization-required');
  assert.equal(fs.existsSync(unauthorized.staging), true);

  const preWriteDrift = fixture(temporary, 'pre-write-drift');
  preWriteDrift.environment.STAGE8_BC_SECOND_INTERRUPTION_QUARANTINE = '1';
  let preWriteProbeCount = 0;
  const driftShard = path.join(preWriteDrift.staging, 'batches', 'batch-000016', 'shard-000016.json.gz');
  const driftResult = runStage8BcSecondInterruptionRecovery({ args: ['--quarantine'],
    environment: preWriteDrift.environment, validators: preWriteDrift.validators,
    inspectProcess: (pid) => {
      preWriteProbeCount += 1;
      if (preWriteProbeCount === 4) fs.writeFileSync(driftShard,
        zlib.gzipSync(JSON.stringify({ records: [{ gameIndex: 15, sample: 'drift' }] })));
      return absentProcess(pid);
    },
    nowMs: Date.parse('2026-09-15T00:00:00Z') });
  assert.equal(driftResult.reason, 'bc-second-interruption-pre-write-recheck-drift');
  assert.equal(driftResult.filesWritten, 0);
  assert.equal(fs.existsSync(preWriteDrift.staging), true);
  assert.equal(fs.existsSync(preWriteDrift.quarantine), false);

  const postVerifyFailure = fixture(temporary, 'post-verify-failure');
  postVerifyFailure.environment.STAGE8_BC_SECOND_INTERRUPTION_QUARANTINE = '1';
  let postVerifyProbeCount = 0;
  const postVerifyResult = runStage8BcSecondInterruptionRecovery({ args: ['--quarantine'],
    environment: postVerifyFailure.environment, validators: postVerifyFailure.validators,
    inspectProcess: (pid) => {
      postVerifyProbeCount += 1;
      return postVerifyProbeCount === 7 ? { state: 'present', pid, process: {} } : absentProcess(pid);
    },
    nowMs: Date.parse('2026-09-15T00:00:00Z') });
  assert.equal(postVerifyResult.ok, false);
  assert.equal(postVerifyResult.status, 'quarantined-but-verification-failed');
  assert.equal(postVerifyResult.filesWritten, 2);
  assert.equal(postVerifyResult.atomicRenameCompleted, true);
  assert.equal(postVerifyResult.quarantinePresent, true);
  assert.equal(postVerifyResult.stagingPresent, false);

  const committed = fixture(temporary, 'committed');
  committed.environment.STAGE8_BC_SECOND_INTERRUPTION_QUARANTINE = '1';
  const result = runStage8BcSecondInterruptionRecovery({ args: ['--quarantine'], environment: committed.environment,
    validators: committed.validators, inspectProcess: absentProcess, nowMs: Date.parse('2026-09-15T00:00:00Z') });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'quarantined');
  assert.equal(result.filesWritten, 2);
  assert.equal(fs.existsSync(committed.staging), false);
  assert.equal(fs.existsSync(committed.quarantine), true);
  assert.equal(verifyStage8BcSecondInterruptionQuarantine({ quarantineDirectory: committed.quarantine,
    validators: committed.validators }).ok, true);
  assert.equal(runStage8BcSecondInterruptionRecovery({ args: ['--verify'], environment: committed.environment,
    validators: committed.validators, inspectProcess: absentProcess,
    nowMs: Date.parse('2026-09-15T00:00:00Z') }).ok, true);
  const evidenceBytes = fs.readFileSync(path.join(committed.quarantine, 'SECOND_OPERATIONAL_INTERRUPTION.json'));
  assert.equal(JSON.parse(evidenceBytes).evidenceSha256, result.evidenceSha256);
  assert.equal(runStage8BcSecondInterruptionRecovery({ args: ['--quarantine'], environment: committed.environment,
    validators: committed.validators, inspectProcess: absentProcess, nowMs: Date.parse('2026-09-15T00:00:00Z') }).ok, false);

  const markerPath = path.join(committed.quarantine, 'QUARANTINED.json');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); marker.allowThirdAttempt = true;
  fs.writeFileSync(markerPath, `${JSON.stringify(marker)}\n`);
  assert.equal(verifyStage8BcSecondInterruptionQuarantine({ quarantineDirectory: committed.quarantine,
    validators: committed.validators }).reason, 'bc-second-interruption-marker-invalid');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: 'passed',
  suite: 'stage8-bc-second-interruption-regression',
  temporaryFixtureOnly: true,
  formalPathsRead: 0,
  shards: 16,
  automaticRetries: 0,
  allowThirdAttempt: false,
}, null, 2));
