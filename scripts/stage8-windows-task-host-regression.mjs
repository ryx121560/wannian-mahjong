import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { buildStage8WindowsTaskMaterials, emitStage8WindowsTaskMaterials } from './stage8-windows-task-host-materials.mjs';
import { runStage8WindowsTaskHost } from './stage8-windows-task-host-runner.mjs';
import { parseStage8WindowsTaskHostDiagnosticArgs, runStage8WindowsTaskHostDiagnostic } from './stage8-windows-task-host-diagnostic.mjs';

const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
}).outputText, filename);
const protocol = require('../src/game/stage8/offline-windows-task-host-control.ts');
const identityTools = require('../src/game/stage8/offline-action-identity.ts');
const root = process.cwd();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-windows-task-host-'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function clone(value) {
  return structuredClone(value);
}

function sealControl(payload) {
  return { ...payload, manifestSha256: protocol.hashStage8WindowsTaskHostControlPayload(payload) };
}

function reseal(control) {
  const { manifestSha256: ignored, ...payload } = control;
  void ignored;
  return sealControl(payload);
}

function phaseAuthorization(control, action) {
  const scopes = {
    'materials-emit': 'stage8-windows-task-host:materials-emit', register: 'stage8-windows-task-host:register',
    run: 'stage8-windows-task-host:run', verify: 'stage8-windows-task-host:verify', delete: 'stage8-windows-task-host:delete',
  };
  const payload = {
    protocolVersion: protocol.STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION,
    action,
    scope: scopes[action],
    approvalId: `approval-${action}-20260915`,
    granted: true,
    hostRunId: control.hostRunId,
    controlManifestSha256: control.manifestSha256,
  };
  return { ...payload, authorizationSha256: protocol.hashStage8WindowsTaskHostPhaseAuthorizationPayload(payload) };
}

function buildControl(hostRunId = 'stage8-host-diagnostic-20260915') {
  const executablePath = path.join(temporaryRoot, 'node-placeholder.exe');
  if (!fs.existsSync(executablePath)) fs.writeFileSync(executablePath, 'node-placeholder', { flag: 'wx' });
  const hostRunnerPath = path.join(root, 'scripts', 'stage8-windows-task-host-runner.mjs');
  const targetScriptPath = path.join(root, 'scripts', 'stage8-windows-task-host-diagnostic.mjs');
  const controlProtocolPath = path.join(root, 'src', 'game', 'stage8', 'offline-windows-task-host-control.ts');
  const identitySourcePath = path.join(root, 'src', 'game', 'stage8', 'offline-action-identity.ts');
  const command = {
    executablePath,
    hostRunnerPath,
    targetScriptPath,
    controlProtocolPath,
    identitySourcePath,
    arguments: [targetScriptPath, '--duration-ms', String(protocol.STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS)],
    workingDirectory: root,
    environment: [],
    shell: false,
    detached: false,
    windowsHide: true,
  };
  const identityCore = {
    releaseCommit: '3049696d8cf37efd64f40819d421b8a9b23d482f',
    nodeExecutableSha256: sha(fs.readFileSync(executablePath)),
    hostRunnerSourceSha256: sha(fs.readFileSync(hostRunnerPath)),
    targetSourceSha256: sha(fs.readFileSync(targetScriptPath)),
    controlProtocolSourceSha256: sha(fs.readFileSync(controlProtocolPath)),
    identitySourceSha256: sha(fs.readFileSync(identitySourcePath)),
    argumentsSha256: identityTools.hashStage8OfflineIdentity(command.arguments),
    workingDirectorySha256: identityTools.hashStage8OfflineIdentity(command.workingDirectory),
    environmentSha256: identityTools.hashStage8OfflineIdentity(command.environment),
  };
  const identity = { ...identityCore, sourceBundleSha256: protocol.hashStage8WindowsTaskHostSourceBundle(identityCore) };
  const approvalId = 'product-stage8-windows-host-candidate';
  const authorization = {
    scope: 'stage8-windows-task-host-control', approvalId, granted: true,
    authorizationSha256: protocol.hashStage8WindowsTaskHostControlAuthorization({ scope: 'stage8-windows-task-host-control', approvalId, granted: true, hostRunId, releaseCommit: identity.releaseCommit }),
  };
  const runRoot = path.join(temporaryRoot, hostRunId);
  const payload = {
    protocolVersion: protocol.STAGE8_WINDOWS_TASK_HOST_CONTROL_VERSION,
    hostRunId,
    targetRunId: `${hostRunId}-diagnostic`,
    identity,
    authorization,
    task: {
      provider: 'windows-task-scheduler', taskPath: '\\WannianMahjong\\Stage8\\', taskName: `Stage8-Host-${hostRunId}`,
      trigger: { type: 'time-once', startBoundaryUtc: '2026-09-16T01:00:00.000Z', endBoundaryUtc: '2026-09-16T01:30:00.000Z', repetition: false },
      principal: { userSid: 'S-1-5-21-1723998074-1700686576-500004715-500', logonType: 'S4U', runLevel: 'Limited', storePassword: false, interactive: false },
      settings: { multipleInstances: 'IgnoreNew', restartCount: 0, allowDemandStart: false, startWhenAvailable: false, runOnlyIfNetworkAvailable: false, runOnlyIfIdle: false, wakeToRun: false, executionTimeLimitMs: protocol.STAGE8_WINDOWS_TASK_HOST_EXECUTION_LIMIT_MS, deleteExpiredTaskAfterMs: null },
    },
    command,
    paths: { controlPath: path.join(runRoot, 'control.json'), runAuthorizationPath: path.join(runRoot, 'run-authorization.json'), evidenceRoot: path.join(runRoot, 'evidence'), stdoutPath: path.join(runRoot, 'evidence', 'stdout.log'), stderrPath: path.join(runRoot, 'evidence', 'stderr.log') },
    workload: { kind: 'disposable-diagnostic', durationMs: protocol.STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS, selfTerminate: true, allowFormalPilot: false, allowTraining: false, allowSmoke: false, allowSelfPlay: false, allowReplay: false, allowModelRead: false },
    capacity: { maxRunBytes: 5 * 1024 ** 3, rootHardLimitBytes: 64 * 1024 ** 3, rootFusePercent: 80, maxStdoutBytes: 4 * 1024 ** 2, maxStderrBytes: 4 * 1024 ** 2, maxEvidenceBytes: 16 * 1024 ** 2 },
    cleanup: { mode: 'disable-then-delete', automatic: false, requiresAuthorization: true, preserveEvidence: true },
  };
  return sealControl(payload);
}

function expectReject(mutator, expected) {
  const changed = clone(buildControl(`stage8-host-red-${Math.random().toString(16).slice(2, 14)}`));
  mutator(changed);
  assert.throws(() => protocol.validateStage8WindowsTaskHostControl(reseal(changed), { osTempRoot: os.tmpdir() }), new RegExp(expected));
}

function fakeChild({ stdout = 'diagnostic-ok\n', stderr = '', exitCode = 0, duplicateTerminalEvents = false } = {}) {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killCount = 0;
  child.kill = () => {
    child.killCount += 1;
    queueMicrotask(() => {
      if (duplicateTerminalEvents) child.emit('error', new Error('synthetic-duplicate-error-1'));
      child.emit('close', null, 'SIGTERM');
      if (duplicateTerminalEvents) child.emit('error', new Error('synthetic-duplicate-error-2'));
      if (duplicateTerminalEvents) child.emit('close', null, 'SIGTERM');
    });
    return true;
  };
  queueMicrotask(() => {
    if (stdout) child.stdout.write(stdout);
    if (stderr) child.stderr.write(stderr);
    child.stdout.end();
    child.stderr.end();
    child.emit('close', exitCode, null);
  });
  return child;
}

try {
  const control = buildControl();
  assert.equal(protocol.validateStage8WindowsTaskHostControl(control, { osTempRoot: os.tmpdir() }).hostRunId, control.hostRunId);
  assert.throws(() => protocol.validateStage8WindowsTaskHostPhaseAuthorization({}, control, 'run'), /authorization/);
  const wrongScope = phaseAuthorization(control, 'verify');
  assert.throws(() => protocol.validateStage8WindowsTaskHostPhaseAuthorization(wrongScope, control, 'run'), /authorization-scope/);
  expectReject((value) => { value.command.executablePath = 'node.exe'; }, 'invalid-absolute-path');
  expectReject((value) => { value.command.shell = true; }, 'command-policy');
  expectReject((value) => { value.command.detached = true; }, 'command-policy');
  expectReject((value) => { value.task.principal.runLevel = 'HighestAvailable'; }, 'principal-policy');
  expectReject((value) => { value.task.principal.storePassword = true; }, 'principal-policy');
  expectReject((value) => { value.task.trigger.repetition = true; }, 'trigger-policy');
  expectReject((value) => { value.task.settings.startWhenAvailable = true; }, 'settings-policy');
  expectReject((value) => { value.task.settings.multipleInstances = 'Parallel'; }, 'settings-policy');
  expectReject((value) => { value.task.settings.restartCount = 1; }, 'settings-policy');
  expectReject((value) => { value.workload.allowFormalPilot = true; }, 'workload-policy');
  expectReject((value) => { value.command.environment = [{ name: 'API_TOKEN', value: 'secret' }]; }, 'environment-secret');

  const materials = buildStage8WindowsTaskMaterials(control);
  const repeatedMaterials = buildStage8WindowsTaskMaterials(control);
  assert.equal(materials.taskXml, repeatedMaterials.taskXml);
  assert.equal(materials.material.materialSha256, repeatedMaterials.material.materialSha256);
  assert.match(materials.taskXml, /<LogonType>S4U<\/LogonType>/);
  assert.match(materials.taskXml, /<RunLevel>LeastPrivilege<\/RunLevel>/);
  assert.match(materials.taskXml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
  assert.match(materials.taskXml, /<StartWhenAvailable>false<\/StartWhenAvailable>/);
  assert.match(materials.taskXml, /<AllowStartOnDemand>false<\/AllowStartOnDemand>/);
  assert.doesNotMatch(materials.taskXml, /RestartOnFailure|Repetition|Password/);
  const materialsOutput = path.join(temporaryRoot, 'materials');
  const materialsAuthorization = phaseAuthorization(control, 'materials-emit');
  const emitted = emitStage8WindowsTaskMaterials({ control, authorization: materialsAuthorization, outputDirectory: materialsOutput });
  assert.deepEqual([emitted.filesWritten, emitted.scheduledTasksMutated], [2, 0]);
  assert.deepEqual([...fs.readFileSync(path.join(materialsOutput, 'task-definition.xml')).subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(emitted.material.materialsAuthorizationSha256, materialsAuthorization.authorizationSha256);
  protocol.validateStage8WindowsTaskHostMaterial(emitted.material, control, materialsAuthorization);
  assert.throws(() => protocol.validateStage8WindowsTaskHostMaterial(materials.material, control, materialsAuthorization), /material-authorization/);
  assert.throws(() => emitStage8WindowsTaskMaterials({ control, authorization: phaseAuthorization(control, 'materials-emit'), outputDirectory: materialsOutput }), /EEXIST/);

  fs.mkdirSync(path.dirname(control.paths.controlPath), { recursive: true });
  const runAuthorization = phaseAuthorization(control, 'run');
  fs.writeFileSync(control.paths.controlPath, `${JSON.stringify(control)}\n`, { flag: 'wx' });
  fs.writeFileSync(control.paths.runAuthorizationPath, `${JSON.stringify(runAuthorization)}\n`, { flag: 'wx' });
  let spawnCount = 0;
  let clock = Date.parse('2026-09-16T01:00:00.000Z');
  const result = await runStage8WindowsTaskHost({
    control, authorization: runAuthorization, controlPath: control.paths.controlPath, authorizationPath: control.paths.runAuthorizationPath,
    dependencies: {
      osTempRoot: os.tmpdir(),
      getGitState: () => ({ head: control.identity.releaseCommit, clean: true }),
      assertCapacity: () => {},
      spawn: (executable, args, options) => {
        spawnCount += 1;
        assert.equal(executable, control.command.executablePath);
        assert.deepEqual(args, control.command.arguments);
        assert.deepEqual(options, { cwd: root, env: {}, shell: false, detached: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        return fakeChild();
      },
      now: () => { clock += 240_001; return clock; },
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => 2,
      clearTimeout: () => {},
      hostPid: 3131,
    },
  });
  assert.equal(result.ok, true);
  assert.equal(spawnCount, 1);
  assert.deepEqual({ automaticRetries: result.automaticRetries, childProcessesStarted: result.childProcessesStarted, formalPathsRead: result.formalPathsRead, formalPilotGamesCredited: result.formalPilotGamesCredited }, { automaticRetries: 0, childProcessesStarted: 1, formalPathsRead: 0, formalPilotGamesCredited: 0 });
  await assert.rejects(() => runStage8WindowsTaskHost({ control, authorization: runAuthorization, controlPath: control.paths.controlPath, authorizationPath: control.paths.runAuthorizationPath, dependencies: { osTempRoot: os.tmpdir(), getGitState: () => ({ head: control.identity.releaseCommit, clean: true }), assertCapacity: () => {}, spawn: () => fakeChild() } }), /duplicate-or-unknown-state/);

  const capacityControl = buildControl('stage8-host-capacity-red-20260915');
  const capacityAuthorization = phaseAuthorization(capacityControl, 'run');
  await assert.rejects(() => runStage8WindowsTaskHost({
    control: capacityControl, authorization: capacityAuthorization, controlPath: capacityControl.paths.controlPath, authorizationPath: capacityControl.paths.runAuthorizationPath,
    dependencies: { osTempRoot: os.tmpdir(), getGitState: () => ({ head: capacityControl.identity.releaseCommit, clean: true }), assertCapacity: () => { throw new Error('stage8-windows-task-host-operational-capacity-fused'); } },
  }), /operational-capacity-fused/);
  assert.equal(fs.existsSync(capacityControl.paths.evidenceRoot), false);

  const stdoutExistsControl = buildControl('stage8-host-stdout-exists-20260916');
  fs.mkdirSync(path.dirname(stdoutExistsControl.paths.evidenceRoot), { recursive: true });
  let stdoutExistsSpawnCalls = 0;
  const stdoutExistsResult = await runStage8WindowsTaskHost({
    control: stdoutExistsControl, authorization: phaseAuthorization(stdoutExistsControl, 'run'), controlPath: stdoutExistsControl.paths.controlPath, authorizationPath: stdoutExistsControl.paths.runAuthorizationPath,
    dependencies: {
      osTempRoot: os.tmpdir(), getGitState: () => ({ head: stdoutExistsControl.identity.releaseCommit, clean: true }), assertCapacity: () => {},
      openLogFile: (target) => {
        if (target === stdoutExistsControl.paths.stdoutPath) fs.writeFileSync(target, 'preexisting-stdout', { flag: 'wx' });
        return fs.openSync(target, 'wx');
      },
      spawn: () => { stdoutExistsSpawnCalls += 1; return fakeChild(); }, hostPid: 3134,
    },
  });
  assert.deepEqual({ state: stdoutExistsResult.state, spawnCalls: stdoutExistsSpawnCalls }, { state: 'failed', spawnCalls: 0 });
  assert.equal(fs.readFileSync(stdoutExistsControl.paths.stdoutPath, 'utf8'), 'preexisting-stdout');
  assert.equal(fs.readdirSync(stdoutExistsControl.paths.evidenceRoot).filter((name) => name === 'terminal.json').length, 1);
  const stdoutExistsStatuses = fs.readdirSync(stdoutExistsControl.paths.evidenceRoot).filter((name) => /^status-\d{6}\.json$/.test(name)).sort().map((name) => JSON.parse(fs.readFileSync(path.join(stdoutExistsControl.paths.evidenceRoot, name), 'utf8')));
  assert.equal(protocol.validateStage8WindowsTaskHostStatusChain(stdoutExistsStatuses, stdoutExistsControl).at(-1).state, 'failed');

  const stderrExistsControl = buildControl('stage8-host-stderr-exists-20260916');
  fs.mkdirSync(path.dirname(stderrExistsControl.paths.evidenceRoot), { recursive: true });
  let stderrExistsSpawnCalls = 0;
  const stderrClosedHandles = new Set();
  const stderrExistsResult = await runStage8WindowsTaskHost({
    control: stderrExistsControl, authorization: phaseAuthorization(stderrExistsControl, 'run'), controlPath: stderrExistsControl.paths.controlPath, authorizationPath: stderrExistsControl.paths.runAuthorizationPath,
    dependencies: {
      osTempRoot: os.tmpdir(), getGitState: () => ({ head: stderrExistsControl.identity.releaseCommit, clean: true }), assertCapacity: () => {},
      openLogFile: (target) => {
        if (target === stderrExistsControl.paths.stderrPath) fs.writeFileSync(target, 'preexisting-stderr', { flag: 'wx' });
        return fs.openSync(target, 'wx');
      },
      closeLogFile: (handle) => {
        assert.equal(stderrClosedHandles.has(handle), false, 'stderr preparation handle must close once');
        stderrClosedHandles.add(handle);
        fs.closeSync(handle);
      },
      spawn: () => { stderrExistsSpawnCalls += 1; return fakeChild(); }, hostPid: 3135,
    },
  });
  assert.deepEqual({ state: stderrExistsResult.state, spawnCalls: stderrExistsSpawnCalls, closedHandles: stderrClosedHandles.size }, { state: 'failed', spawnCalls: 0, closedHandles: 1 });
  assert.equal(fs.statSync(stderrExistsControl.paths.stdoutPath).size, 0);
  assert.equal(fs.readFileSync(stderrExistsControl.paths.stderrPath, 'utf8'), 'preexisting-stderr');
  assert.equal(fs.readdirSync(stderrExistsControl.paths.evidenceRoot).filter((name) => name === 'terminal.json').length, 1);

  const spawnFailureControl = buildControl('stage8-host-spawn-failure-20260915');
  fs.mkdirSync(path.dirname(spawnFailureControl.paths.evidenceRoot), { recursive: true });
  let failureClock = Date.parse('2026-09-16T02:00:00.000Z');
  const spawnFailureClosedHandles = new Set();
  const spawnFailureResult = await runStage8WindowsTaskHost({
    control: spawnFailureControl, authorization: phaseAuthorization(spawnFailureControl, 'run'), controlPath: spawnFailureControl.paths.controlPath, authorizationPath: spawnFailureControl.paths.runAuthorizationPath,
    dependencies: {
      osTempRoot: os.tmpdir(), getGitState: () => ({ head: spawnFailureControl.identity.releaseCommit, clean: true }), assertCapacity: () => {},
      closeLogFile: (handle) => {
        assert.equal(spawnFailureClosedHandles.has(handle), false, 'spawn failure handle must close once');
        spawnFailureClosedHandles.add(handle);
        fs.closeSync(handle);
      },
      spawn: () => { throw new Error('synthetic-spawn-failure'); }, now: () => ++failureClock, hostPid: 3132,
    },
  });
  assert.deepEqual({ ok: spawnFailureResult.ok, childProcessesStarted: spawnFailureResult.childProcessesStarted, automaticRetries: spawnFailureResult.automaticRetries, closedHandles: spawnFailureClosedHandles.size }, { ok: false, childProcessesStarted: 0, automaticRetries: 0, closedHandles: 2 });
  const spawnFailureStatuses = fs.readdirSync(spawnFailureControl.paths.evidenceRoot).filter((name) => /^status-\d{6}\.json$/.test(name)).sort().map((name) => JSON.parse(fs.readFileSync(path.join(spawnFailureControl.paths.evidenceRoot, name), 'utf8')));
  assert.equal(protocol.validateStage8WindowsTaskHostStatusChain(spawnFailureStatuses, spawnFailureControl).at(-1).state, 'failed');

  const writeFailureControl = buildControl('stage8-host-write-failure-20260916');
  fs.mkdirSync(path.dirname(writeFailureControl.paths.evidenceRoot), { recursive: true });
  let writeFailureClock = Date.parse('2026-09-16T02:30:00.000Z');
  let writeFailureChild = null;
  const writeFailureClosedHandles = new Set();
  const writeFailureResult = await runStage8WindowsTaskHost({
    control: writeFailureControl, authorization: phaseAuthorization(writeFailureControl, 'run'), controlPath: writeFailureControl.paths.controlPath, authorizationPath: writeFailureControl.paths.runAuthorizationPath,
    dependencies: {
      osTempRoot: os.tmpdir(), getGitState: () => ({ head: writeFailureControl.identity.releaseCommit, clean: true }), assertCapacity: () => {},
      spawn: () => { writeFailureChild = fakeChild({ stdout: 'trigger-write-failure', duplicateTerminalEvents: true }); return writeFailureChild; },
      writeLogChunk: () => { throw new Error('synthetic-log-write-failure'); },
      closeLogFile: (handle) => {
        assert.equal(writeFailureClosedHandles.has(handle), false, 'write failure handle must close once');
        writeFailureClosedHandles.add(handle);
        fs.closeSync(handle);
      },
      now: () => ++writeFailureClock, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 2, clearTimeout: () => {}, hostPid: 3136,
    },
  });
  assert.deepEqual({ state: writeFailureResult.state, killCount: writeFailureChild.killCount, closedHandles: writeFailureClosedHandles.size }, { state: 'failed', killCount: 1, closedHandles: 2 });
  assert.equal(fs.readdirSync(writeFailureControl.paths.evidenceRoot).filter((name) => name === 'terminal.json').length, 1);
  const writeFailureStatuses = fs.readdirSync(writeFailureControl.paths.evidenceRoot).filter((name) => /^status-\d{6}\.json$/.test(name)).sort().map((name) => JSON.parse(fs.readFileSync(path.join(writeFailureControl.paths.evidenceRoot, name), 'utf8')));
  const validatedWriteFailureStatuses = protocol.validateStage8WindowsTaskHostStatusChain(writeFailureStatuses, writeFailureControl);
  assert.equal(validatedWriteFailureStatuses.filter((status) => ['completed', 'failed', 'timed-out'].includes(status.state)).length, 1);
  assert.equal(validatedWriteFailureStatuses.at(-1).state, 'failed');

  const logCapControl = buildControl('stage8-host-log-cap-red-20260915');
  fs.mkdirSync(path.dirname(logCapControl.paths.evidenceRoot), { recursive: true });
  let logClock = Date.parse('2026-09-16T03:00:00.000Z');
  const logCapResult = await runStage8WindowsTaskHost({
    control: logCapControl, authorization: phaseAuthorization(logCapControl, 'run'), controlPath: logCapControl.paths.controlPath, authorizationPath: logCapControl.paths.runAuthorizationPath,
    dependencies: { osTempRoot: os.tmpdir(), getGitState: () => ({ head: logCapControl.identity.releaseCommit, clean: true }), assertCapacity: () => {}, spawn: () => fakeChild({ stdout: Buffer.alloc(logCapControl.capacity.maxStdoutBytes + 1) }), now: () => ++logClock, setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 2, clearTimeout: () => {}, hostPid: 3133 },
  });
  assert.equal(logCapResult.state, 'failed');
  assert.equal(fs.statSync(logCapControl.paths.stdoutPath).size, logCapControl.capacity.maxStdoutBytes);
  const logCapStatuses = fs.readdirSync(logCapControl.paths.evidenceRoot).filter((name) => /^status-\d{6}\.json$/.test(name)).sort().map((name) => JSON.parse(fs.readFileSync(path.join(logCapControl.paths.evidenceRoot, name), 'utf8')));
  protocol.validateStage8WindowsTaskHostStatusChain(logCapStatuses, logCapControl);

  const statuses = fs.readdirSync(control.paths.evidenceRoot).filter((name) => /^status-\d{6}\.json$/.test(name)).sort().map((name) => JSON.parse(fs.readFileSync(path.join(control.paths.evidenceRoot, name), 'utf8')));
  const validatedStatuses = protocol.validateStage8WindowsTaskHostStatusChain(statuses, control);
  assert.equal(validatedStatuses.at(-1).state, 'completed');
  assert.throws(() => protocol.validateStage8WindowsTaskHostStatusChain([...statuses, statuses.at(-1)], control), /status-(identity|after-terminal)/);

  const registerAuthorization = phaseAuthorization(control, 'register');
  const registrationPayload = {
    protocolVersion: protocol.STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION, kind: 'registration', hostRunId: control.hostRunId,
    taskPath: control.task.taskPath, taskName: control.task.taskName, controlManifestSha256: control.manifestSha256,
    materialSha256: emitted.material.materialSha256, taskXmlSha256: emitted.material.taskXmlSha256, exportedTaskXmlSha256: emitted.material.taskXmlSha256,
    registerAuthorizationSha256: registerAuthorization.authorizationSha256, registeredAtUtc: '2026-09-16T01:00:00.000Z', taskState: 'Ready', runningInstances: 0, lastTaskResult: null,
  };
  const registration = { ...registrationPayload, evidenceSha256: protocol.hashStage8WindowsTaskHostRegistrationEvidencePayload(registrationPayload) };
  protocol.validateStage8WindowsTaskHostRegistrationEvidence(registration, control, registerAuthorization, emitted.material, materialsAuthorization);
  assert.throws(() => protocol.validateStage8WindowsTaskHostRegistrationEvidence({ ...registration, exportedTaskXmlSha256: 'f'.repeat(64) }, control, registerAuthorization, emitted.material, materialsAuthorization), /registration-identity/);

  const verifyAuthorization = phaseAuthorization(control, 'verify');
  const verificationPayload = {
    protocolVersion: protocol.STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION, kind: 'verification', hostRunId: control.hostRunId,
    verifyAuthorizationSha256: verifyAuthorization.authorizationSha256, registrationEvidenceSha256: registration.evidenceSha256,
    terminalStatusSha256: validatedStatuses.at(-1).statusSha256, observedAtUtc: '2026-09-16T01:14:00.000Z', survivedHostLeaseMs: 720_000,
    taskState: 'Ready', lastTaskResult: 0, runningInstances: 0, selfTerminated: true, residualHostProcesses: 0, residualChildProcesses: 0, formalPathsRead: 0, formalPilotGamesCredited: 0,
  };
  const verification = { ...verificationPayload, evidenceSha256: protocol.hashStage8WindowsTaskHostVerificationEvidencePayload(verificationPayload) };
  protocol.validateStage8WindowsTaskHostVerificationEvidence(verification, control, verifyAuthorization, registration, registerAuthorization, emitted.material, materialsAuthorization, statuses);
  const shortVerificationPayload = { ...verificationPayload, survivedHostLeaseMs: 600_000 };
  const shortVerification = { ...shortVerificationPayload, evidenceSha256: protocol.hashStage8WindowsTaskHostVerificationEvidencePayload(shortVerificationPayload) };
  assert.throws(() => protocol.validateStage8WindowsTaskHostVerificationEvidence(shortVerification, control, verifyAuthorization, registration, registerAuthorization, emitted.material, materialsAuthorization, statuses), /verification-policy/);

  const deleteAuthorization = phaseAuthorization(control, 'delete');
  const cleanupPayload = {
    protocolVersion: protocol.STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION, kind: 'cleanup', hostRunId: control.hostRunId,
    taskPath: control.task.taskPath, taskName: control.task.taskName, deleteAuthorizationSha256: deleteAuthorization.authorizationSha256,
    attemptedAtUtc: '2026-09-16T01:15:00.000Z', state: 'completed', disabled: true, deleted: true, taskAbsent: true, reason: null,
  };
  const cleanup = { ...cleanupPayload, evidenceSha256: protocol.hashStage8WindowsTaskHostCleanupEvidencePayload(cleanupPayload) };
  protocol.validateStage8WindowsTaskHostCleanupEvidence(cleanup, control, deleteAuthorization);
  assert.throws(() => protocol.validateStage8WindowsTaskHostCleanupEvidence({ ...cleanup, taskAbsent: false }, control, deleteAuthorization), /cleanup-incomplete/);

  assert.deepEqual(parseStage8WindowsTaskHostDiagnosticArgs(['--duration-ms', '720000']), { durationMs: 720000 });
  assert.throws(() => parseStage8WindowsTaskHostDiagnosticArgs(['--duration-ms', '1']), /usage/);
  let diagnosticClock = 0;
  const diagnosticLines = [];
  const diagnostic = await runStage8WindowsTaskHostDiagnostic({ durationMs: 3, allowedDurationMs: 3, heartbeatMs: 1, now: () => diagnosticClock, wait: async (milliseconds) => { diagnosticClock += milliseconds; }, write: (line) => diagnosticLines.push(line) });
  assert.deepEqual({ selfTerminated: diagnostic.selfTerminated, formalPathsRead: diagnostic.formalPathsRead, formalPilotGamesCredited: diagnostic.formalPilotGamesCredited }, { selfTerminated: true, formalPathsRead: 0, formalPilotGamesCredited: 0 });
  assert.equal(diagnosticLines.length, 4);

  const candidateSources = ['stage8-windows-task-host-materials.mjs', 'stage8-windows-task-host-runner.mjs', 'stage8-windows-task-host-diagnostic.mjs'].map((name) => fs.readFileSync(path.join(root, 'scripts', name), 'utf8')).join('\n');
  assert.doesNotMatch(candidateSources, /spawn(?:Sync)?\s*\(\s*['"](?:schtasks|powershell|pwsh|sc)(?:\.exe)?['"]/i);
  console.log(JSON.stringify({
    passed: true,
    controls: ['phase-authorization', 'exact-schema', 'absolute-no-shell', 'identity-hashes', 's4u-limited-no-password', 'one-time-no-catchup', 'ignore-new-zero-retry', 'pre-spawn-log-preparation', 'exactly-once-handle-close', 'write-exception-fuse', 'capacity-and-log-caps', 'immutable-status-chain', 'lease-survival-verification', 'explicit-cleanup-evidence', 'diagnostic-only'],
    filesWrittenToOsTemp: true,
    scheduledTasksMutated: 0,
    servicesMutated: 0,
    diagnosticWallClockWaitMs: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  }, null, 2));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
