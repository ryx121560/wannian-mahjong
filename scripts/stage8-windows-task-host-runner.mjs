import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);

function loadProtocol() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
  try { return require('../src/game/stage8/offline-windows-task-host-control.ts'); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const protocol = loadProtocol();
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function readJson(absolutePath) {
  if (!path.win32.isAbsolute(absolutePath)) throw new Error('stage8-windows-task-host-cli-path-must-be-absolute');
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function samePath(left, right) {
  return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase();
}

function getGitState(workingDirectory) {
  const head = spawnSync('git', ['-C', workingDirectory, 'rev-parse', 'HEAD'], { encoding: 'utf8', shell: false, windowsHide: true });
  const status = spawnSync('git', ['-C', workingDirectory, 'status', '--porcelain'], { encoding: 'utf8', shell: false, windowsHide: true });
  if (head.status !== 0 || status.status !== 0) throw new Error('stage8-windows-task-host-git-state-unavailable');
  return { head: head.stdout.trim(), clean: status.stdout.trim() === '' };
}

function directoryBytes(root) {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error('stage8-windows-task-host-capacity-symlink-forbidden');
    total += entry.isDirectory() ? directoryBytes(candidate) : fs.statSync(candidate).size;
  }
  return total;
}

function assertCapacity(control) {
  const capacityRoot = path.dirname(control.paths.evidenceRoot);
  const disk = fs.statfsSync(capacityRoot);
  const total = Number(disk.blocks) * Number(disk.bsize);
  const free = Number(disk.bavail) * Number(disk.bsize);
  const used = directoryBytes(capacityRoot);
  if (used >= control.capacity.rootHardLimitBytes || free < control.capacity.maxRunBytes || (total - free) / total >= control.capacity.rootFusePercent / 100) {
    throw new Error('stage8-windows-task-host-operational-capacity-fused');
  }
}

function verifyBoundIdentity(control, dependencies) {
  const git = (dependencies.getGitState ?? getGitState)(control.command.workingDirectory);
  if (!git.clean || git.head !== control.identity.releaseCommit) throw new Error('stage8-windows-task-host-release-state-drift');
  const identities = [
    [control.command.executablePath, control.identity.nodeExecutableSha256, 'node-executable'],
    [control.command.hostRunnerPath, control.identity.hostRunnerSourceSha256, 'host-runner-source'],
    [control.command.targetScriptPath, control.identity.targetSourceSha256, 'target-source'],
    [control.command.controlProtocolPath, control.identity.controlProtocolSourceSha256, 'control-protocol-source'],
    [control.command.identitySourcePath, control.identity.identitySourceSha256, 'identity-source'],
  ];
  for (const [candidate, expected, label] of identities) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile() || sha256(fs.readFileSync(candidate)) !== expected) {
      throw new Error(`stage8-windows-task-host-${label}-drift`);
    }
  }
}

function writeImmutableJson(target, value) {
  const bytes = `${JSON.stringify(value)}\n`;
  fs.writeFileSync(target, bytes, { encoding: 'utf8', flag: 'wx' });
  if (fs.readFileSync(target, 'utf8') !== bytes) throw new Error('stage8-windows-task-host-evidence-roundtrip');
}

function createStatus({ control, previous, state, hostPid, childPid, startedAtMs, now, stdoutBytes, stderrBytes, exitCode = null, signal = null }) {
  const payload = {
    protocolVersion: protocol.STAGE8_WINDOWS_TASK_HOST_STATUS_VERSION,
    hostRunId: control.hostRunId,
    sequence: previous ? previous.sequence + 1 : 1,
    state,
    observedAtUtc: new Date(now()).toISOString(),
    previousStatusSha256: previous?.statusSha256 ?? null,
    hostPid,
    childPid,
    elapsedMs: Math.max(0, now() - startedAtMs),
    stdoutBytes,
    stderrBytes,
    exitCode,
    signal,
    automaticRetries: 0,
    formalPilotGamesCredited: 0,
  };
  return { ...payload, statusSha256: protocol.hashStage8WindowsTaskHostStatusPayload(payload) };
}

function publishStatus(control, status) {
  const target = path.join(control.paths.evidenceRoot, `status-${String(status.sequence).padStart(6, '0')}.json`);
  const bytes = Buffer.byteLength(`${JSON.stringify(status)}\n`);
  if (directoryBytes(control.paths.evidenceRoot) + bytes > control.capacity.maxEvidenceBytes) throw new Error('stage8-windows-task-host-evidence-capacity-fused');
  writeImmutableJson(target, status);
}

function publishTerminal(control, { state, terminalStatusSha256, reason, childProcessesStarted }) {
  writeImmutableJson(path.join(control.paths.evidenceRoot, 'terminal.json'), {
    hostRunId: control.hostRunId,
    state,
    terminalStatusSha256,
    reason,
    automaticRetries: 0,
    childProcessesStarted,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  });
}

function prepareLogHandles(control, dependencies) {
  const openLogFile = dependencies.openLogFile ?? ((target) => fs.openSync(target, 'wx'));
  const closeLogFile = dependencies.closeLogFile ?? ((handle) => fs.closeSync(handle));
  const handles = [];
  let closed = false;
  const close = () => {
    if (closed) return null;
    closed = true;
    let firstError = null;
    for (const handle of handles) {
      try { closeLogFile(handle); } catch (error) { firstError ??= error; }
    }
    return firstError;
  };
  try {
    const stdoutHandle = openLogFile(control.paths.stdoutPath);
    handles.push(stdoutHandle);
    const stderrHandle = openLogFile(control.paths.stderrPath);
    handles.push(stderrHandle);
    return { ok: true, stdoutHandle, stderrHandle, close };
  } catch (error) {
    const closeError = close();
    return { ok: false, error, closeError };
  }
}

export async function runStage8WindowsTaskHost(options) {
  const dependencies = options.dependencies ?? {};
  const now = dependencies.now ?? Date.now;
  const hostPid = dependencies.hostPid ?? process.pid;
  const control = protocol.validateStage8WindowsTaskHostControl(options.control, { osTempRoot: dependencies.osTempRoot ?? os.tmpdir() });
  protocol.validateStage8WindowsTaskHostPhaseAuthorization(options.authorization, control, 'run');
  if (!samePath(options.controlPath, control.paths.controlPath) || !samePath(options.authorizationPath, control.paths.runAuthorizationPath)) throw new Error('stage8-windows-task-host-launch-path-drift');
  verifyBoundIdentity(control, dependencies);
  if (fs.existsSync(control.paths.evidenceRoot)) throw new Error('stage8-windows-task-host-duplicate-or-unknown-state');
  (dependencies.assertCapacity ?? assertCapacity)(control);
  fs.mkdirSync(control.paths.evidenceRoot, { recursive: false });
  writeImmutableJson(path.join(control.paths.evidenceRoot, 'LOCK.json'), {
    protocolVersion: protocol.STAGE8_WINDOWS_TASK_HOST_STATUS_VERSION,
    hostRunId: control.hostRunId,
    controlManifestSha256: control.manifestSha256,
    runAuthorizationSha256: options.authorization.authorizationSha256,
    hostPid,
    createdAtUtc: new Date(now()).toISOString(),
    automaticRetries: 0,
  });

  const startedAtMs = now();
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let previous = createStatus({ control, previous: null, state: 'starting', hostPid, childPid: null, startedAtMs, now, stdoutBytes, stderrBytes });
  publishStatus(control, previous);
  const failBeforeChild = (reason) => {
    previous = createStatus({ control, previous, state: 'failed', hostPid, childPid: null, startedAtMs, now, stdoutBytes, stderrBytes });
    publishStatus(control, previous);
    publishTerminal(control, { state: 'failed', terminalStatusSha256: previous.statusSha256, reason, childProcessesStarted: 0 });
    return { ok: false, state: 'failed', terminalStatusSha256: previous.statusSha256, automaticRetries: 0, childProcessesStarted: 0, formalPathsRead: 0, formalPilotGamesCredited: 0 };
  };
  const logs = prepareLogHandles(control, dependencies);
  if (!logs.ok) {
    const openReason = logs.error instanceof Error ? logs.error.message : String(logs.error);
    const closeReason = logs.closeError instanceof Error ? `; close: ${logs.closeError.message}` : '';
    return failBeforeChild(`stage8-windows-task-host-log-prepare-failed: ${openReason}${closeReason}`);
  }
  const environment = Object.fromEntries(control.command.environment.map(({ name, value }) => [name, value]));
  const spawnProcess = dependencies.spawn ?? spawn;
  let child;
  let spawnFailure = null;
  try {
    child = spawnProcess(control.command.executablePath, control.command.arguments, {
      cwd: control.command.workingDirectory,
      env: environment,
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    spawnFailure = error instanceof Error ? error.message : String(error);
  }
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) {
    child?.on?.('error', () => {});
    const closeError = logs.close();
    const reason = spawnFailure ?? 'stage8-windows-task-host-child-pid-unavailable';
    const closeReason = closeError instanceof Error ? `; close: ${closeError.message}` : '';
    return failBeforeChild(`${reason}${closeReason}`);
  }
  let fusedReason = null;
  let timedOut = false;
  let terminationRequested = false;
  const requestTermination = (reason, timeout = false) => {
    fusedReason ??= reason;
    if (timeout) timedOut = true;
    if (terminationRequested) return;
    terminationRequested = true;
    try { child.kill(); } catch (error) {
      const killReason = error instanceof Error ? error.message : String(error);
      fusedReason = `${fusedReason}; kill: ${killReason}`;
    }
  };
  const outcomePromise = new Promise((resolve) => {
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; resolve(result); } };
    child.on('error', (error) => finish({ exitCode: null, signal: null, error }));
    child.once('close', (exitCode, signal) => finish({ exitCode, signal, error: null }));
  });
  const writeLogChunk = dependencies.writeLogChunk ?? ((handle, bytes) => fs.writeSync(handle, bytes));
  const capture = (stream, handle, channel) => stream.on('data', (chunk) => {
    if (terminationRequested) return;
    try {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const limit = channel === 'stdout' ? control.capacity.maxStdoutBytes : control.capacity.maxStderrBytes;
      const current = channel === 'stdout' ? stdoutBytes : stderrBytes;
      const writableBytes = Math.max(0, Math.min(bytes.length, limit - current));
      if (writableBytes > 0) {
        const written = writeLogChunk(handle, bytes.subarray(0, writableBytes));
        if (written !== writableBytes) throw new Error('stage8-windows-task-host-log-short-write');
      }
      if (channel === 'stdout') stdoutBytes += writableBytes;
      else stderrBytes += writableBytes;
      if (writableBytes < bytes.length) requestTermination(`stage8-windows-task-host-${channel}-capacity-fused`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      requestTermination(`stage8-windows-task-host-${channel}-write-failed: ${reason}`);
    }
  });
  try {
    capture(child.stdout, logs.stdoutHandle, 'stdout');
    capture(child.stderr, logs.stderrHandle, 'stderr');
    const runningStatus = createStatus({ control, previous, state: 'running', hostPid, childPid: child.pid, startedAtMs, now, stdoutBytes, stderrBytes });
    publishStatus(control, runningStatus);
    previous = runningStatus;
  } catch (error) {
    requestTermination(error instanceof Error ? error.message : String(error));
  }

  const heartbeatMs = dependencies.heartbeatMs ?? 30 * 1000;
  const setIntervalFn = dependencies.setInterval ?? setInterval;
  const clearIntervalFn = dependencies.clearInterval ?? clearInterval;
  const setTimeoutFn = dependencies.setTimeout ?? setTimeout;
  const clearTimeoutFn = dependencies.clearTimeout ?? clearTimeout;
  let heartbeat = null;
  let timeout = null;
  try {
    heartbeat = setIntervalFn(() => {
      if (terminationRequested) return;
      try {
        const runningStatus = createStatus({ control, previous, state: 'running', hostPid, childPid: child.pid, startedAtMs, now, stdoutBytes, stderrBytes });
        publishStatus(control, runningStatus);
        previous = runningStatus;
      } catch (error) {
        requestTermination(error instanceof Error ? error.message : String(error));
      }
    }, heartbeatMs);
    timeout = setTimeoutFn(() => requestTermination('stage8-windows-task-host-self-timeout', true), control.workload.durationMs + 30 * 1000);
  } catch (error) {
    requestTermination(error instanceof Error ? error.message : String(error));
  }

  const outcome = await outcomePromise;
  try { if (heartbeat !== null) clearIntervalFn(heartbeat); } catch (error) { fusedReason ??= error instanceof Error ? error.message : String(error); }
  try { if (timeout !== null) clearTimeoutFn(timeout); } catch (error) { fusedReason ??= error instanceof Error ? error.message : String(error); }
  const closeError = logs.close();
  if (closeError) fusedReason ??= closeError instanceof Error ? closeError.message : String(closeError);
  const state = timedOut ? 'timed-out' : outcome.error || fusedReason || outcome.exitCode !== 0 ? 'failed' : 'completed';
  previous = createStatus({ control, previous, state, hostPid, childPid: child.pid, startedAtMs, now, stdoutBytes, stderrBytes, exitCode: outcome.exitCode, signal: outcome.signal });
  publishStatus(control, previous);
  const reason = fusedReason ?? (outcome.error instanceof Error ? outcome.error.message : outcome.exitCode === 0 ? null : `stage8-windows-task-host-child-exit-${outcome.exitCode ?? 'unknown'}`);
  publishTerminal(control, { state, terminalStatusSha256: previous.statusSha256, reason, childProcessesStarted: 1 });
  return { ok: state === 'completed', state, terminalStatusSha256: previous.statusSha256, automaticRetries: 0, childProcessesStarted: 1, formalPathsRead: 0, formalPilotGamesCredited: 0 };
}

export async function runStage8WindowsTaskHostCli(argv = process.argv.slice(2)) {
  if (argv.length !== 3 || argv[0] !== '--run') throw new Error('usage: node stage8-windows-task-host-runner.mjs --run <absolute-control-path> <absolute-run-authorization-path>');
  const [, controlPath, authorizationPath] = argv;
  return runStage8WindowsTaskHost({ controlPath, authorizationPath, control: readJson(controlPath), authorization: readJson(authorizationPath) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const result = await runStage8WindowsTaskHostCli();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), automaticRetries: 0, formalPathsRead: 0, formalPilotGamesCredited: 0 }, null, 2));
    process.exitCode = 1;
  }
}
