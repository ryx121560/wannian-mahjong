import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);

function loadTs(entry) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText, filename);
  try { return require(entry); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const MAX_SUPERVISION_BYTES = 16 * 1024 * 1024;
const MAX_WORKER_LOG_BYTES = 4 * 1024 * 1024;
const atomicJson = (target, value) => {
  const temporary = `${target}.partial-${process.pid}`;
  const bytes = `${JSON.stringify(value)}\n`;
  fs.writeFileSync(temporary, bytes, { encoding: 'utf8', flag: 'wx' });
  if (fs.readFileSync(temporary, 'utf8') !== bytes) throw new Error('bc-supervision-atomic-roundtrip-failed');
  fs.renameSync(temporary, target);
};

function commandIdentity({ executable, argv, environment, cwd }) {
  const allowed = Object.keys(environment).sort().map((key) => ({ key, valueSha256: sha(String(environment[key])) }));
  return {
    executableSha256: sha(fs.readFileSync(executable)),
    argvSha256: sha(JSON.stringify(argv)),
    environmentAllowlistSha256: sha(JSON.stringify(allowed)),
    cwdSha256: sha(path.win32.normalize(cwd).toLowerCase()),
  };
}

function readControl(controlPath, supervisionTools) {
  const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
  const validated = supervisionTools.validateStage8BcSupervisionControlManifest(control);
  if (!validated.ok) throw new Error(validated.reason);
  return control;
}

function nextStatus({ previous, control, launchNonce, launcherPid, supervisorPid, workerPid,
  supervisorStartedAt, workerStartedAt, command, state, progress, exitCode = null, signal = null,
  terminalState = null, now = new Date().toISOString(), supervisionTools }) {
  const payload = {
    protocolVersion: supervisionTools.STAGE8_BC_SUPERVISION_PROTOCOL_VERSION,
    runId: control.identity.runId,
    supervisionManifestSha256: control.manifestSha256,
    sourceCommit: control.identity.sourceCommit,
    sourceBundleSha256: control.identity.sourceBundleSha256,
    predecessorEvidenceSha256: control.identity.predecessorEvidenceSha256,
    launchNonce,
    sequence: previous ? previous.sequence + 1 : 0,
    previousStatusSha256: previous?.statusSha256 ?? null,
    state,
    launcherPid,
    supervisorPid,
    workerPid,
    supervisorStartedAt,
    workerStartedAt,
    heartbeatAt: now,
    progress,
    commandIdentity: command,
    exitCode,
    signal,
    terminalState,
    automaticRetries: 0,
    seedOverrides: 0,
  };
  const status = { ...payload, statusSha256: supervisionTools.hashStage8BcSupervisionStatusPayload(payload) };
  const validated = supervisionTools.validateStage8BcSupervisionStatus({ status, control, previous });
  if (!validated.ok) throw new Error(validated.reason);
  return status;
}

function publishStatus(directory, status) {
  const immutable = path.join(directory, `status-${String(status.sequence).padStart(6, '0')}.json`);
  const bytes = `${JSON.stringify(status)}\n`;
  const used = fs.readdirSync(directory).reduce((sum, name) => {
    const candidate = path.join(directory, name);
    return sum + (fs.statSync(candidate).isFile() ? fs.statSync(candidate).size : 0);
  }, 0);
  const disk = fs.statfsSync(directory);
  const total = Number(disk.blocks) * Number(disk.bsize);
  const free = Number(disk.bavail) * Number(disk.bsize);
  if (used + Buffer.byteLength(bytes) > MAX_SUPERVISION_BYTES || free < Buffer.byteLength(bytes)
    || (total - free + Buffer.byteLength(bytes)) / total >= 0.8) {
    throw new Error('bc-supervision-operational-capacity-fused');
  }
  fs.writeFileSync(immutable, bytes, { encoding: 'utf8', flag: 'wx' });
}

function quarantineInterruptedRun(environment, completedShards) {
  const finalDirectory = environment.STAGE8_BC_CORPUS_RUN_DIRECTORY;
  const staging = `${finalDirectory}.partial`;
  const quarantine = `${staging}.quarantine`;
  if (!fs.existsSync(staging)) return;
  if (fs.existsSync(quarantine)) throw new Error('bc-supervision-quarantine-already-exists');
  const marker = path.join(staging, 'QUARANTINED.json');
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, `${JSON.stringify({
    status: 'quarantined',
    reason: 'operational-interruption-limit-reached',
    completedShardCount: completedShards,
    automaticRetries: 0,
    seedOverrides: 0,
  })}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(staging, quarantine);
}

export async function runStage8BcSupervisorHost(options = {}) {
  const environment = options.environment ?? process.env;
  const controlPath = environment.STAGE8_BC_SUPERVISION_CONTROL_MANIFEST;
  const directory = environment.STAGE8_BC_SUPERVISION_DIRECTORY;
  const launchNonce = environment.STAGE8_BC_SUPERVISION_NONCE;
  const launcherPid = Number(environment.STAGE8_BC_LAUNCHER_PID);
  if (!controlPath || !directory || !/^[a-f0-9]{64}$/i.test(launchNonce ?? '')
    || !Number.isInteger(launcherPid) || launcherPid <= 0) throw new Error('bc-supervision-host-environment-invalid');
  const supervisionTools = options.supervisionTools ?? loadTs(path.join(root, 'src/game/stage8/offline-bc-supervision-control.ts'));
  const control = readControl(controlPath, supervisionTools);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error('bc-supervision-directory-missing');
  const lockPath = path.join(directory, 'LOCK.json');
  const supervisorProcess = (options.inspectProcess ?? inspectWindowsProcess)(process.pid);
  if (!supervisorProcess?.StartTime || !supervisorProcess?.Path) throw new Error('bc-supervision-supervisor-process-identity-unavailable');
  const supervisorStartedAt = new Date(supervisorProcess.StartTime).toISOString();
  fs.writeFileSync(lockPath, `${JSON.stringify({
    protocolVersion: supervisionTools.STAGE8_BC_SUPERVISION_PROTOCOL_VERSION,
    runId: control.identity.runId,
    launchNonce,
    launcherPid,
    supervisorPid: process.pid,
    supervisorStartedAt,
    supervisionManifestSha256: control.manifestSha256,
  })}\n`, { encoding: 'utf8', flag: 'wx' });
  const workerScript = environment.STAGE8_BC_SUPERVISED_WORKER_SCRIPT
    || path.join(root, 'scripts/stage8-bc-corpus-runner.mjs');
  const workerArgs = [workerScript, '--supervised-worker'];
  const workerEnvironment = Object.fromEntries(Object.entries(environment).filter(([key]) => [
    'SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','PATHEXT','NODE_PATH',
    'STAGE8_BC_CORPUS_CONTROL_MANIFEST','STAGE8_BC_ARTIFACT_CONTROL_MANIFEST','STAGE8_BC_RUN_AUTHORIZATION',
    'STAGE8_BC_PREDECESSOR_EVIDENCE','STAGE8_ARTIFACT_ROOT','STAGE8_PYTHON','STAGE8_BC_CORPUS_RUN_DIRECTORY',
    'STAGE8_BC_SUPERVISION_CONTROL_MANIFEST','STAGE8_BC_SUPERVISION_DIRECTORY','STAGE8_BC_SUPERVISION_NONCE',
  ].includes(key)));
  workerEnvironment.STAGE8_BC_SUPERVISOR_PID = String(process.pid);
  const spawnWorker = options.spawnWorker ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions));
  const worker = spawnWorker(process.execPath, workerArgs, {
    cwd: root, env: workerEnvironment, shell: false, windowsHide: true, detached: false,
    stdio: ['ignore','pipe','pipe','ipc'],
  });
  if (!worker.pid) throw new Error('bc-supervision-worker-start-failed');
  const workerProcess = (options.inspectProcess ?? inspectWindowsProcess)(worker.pid);
  if (!workerProcess?.StartTime || !workerProcess?.Path
    || sha(fs.readFileSync(workerProcess.Path)) !== sha(fs.readFileSync(process.execPath))) {
    worker.kill?.();
    throw new Error('bc-supervision-worker-process-identity-unavailable');
  }
  const workerStartedAt = new Date(workerProcess.StartTime).toISOString();
  const command = commandIdentity({ executable: process.execPath, argv: workerArgs, environment: workerEnvironment, cwd: root });
  let progress = { completedGames: 0, completedShards: 0, lastGameIndex: null };
  let status = nextStatus({ control, launchNonce, launcherPid, supervisorPid: process.pid, workerPid: worker.pid,
    supervisorStartedAt, workerStartedAt, command, state: 'starting', progress, supervisionTools });
  publishStatus(directory, status);
  worker.send?.({ type: 'stage8-bc-supervision-start', launchNonce, statusSha256: status.statusSha256 });
  status = nextStatus({ previous: status, control, launchNonce, launcherPid, supervisorPid: process.pid, workerPid: worker.pid,
    supervisorStartedAt, workerStartedAt, command, state: 'running', progress, supervisionTools });
  publishStatus(directory, status);
  let finalResult = null;
  let supervisionFailure = null;
  let workerLogBytes = 0;
  const appendWorkerLog = (name, chunk) => {
    workerLogBytes += chunk.length;
    if (workerLogBytes > MAX_WORKER_LOG_BYTES) {
      supervisionFailure = 'bc-supervision-worker-log-limit-fused';
      worker.kill?.();
      return;
    }
    fs.appendFileSync(path.join(directory, name), chunk);
  };
  worker.stdout?.on('data', (chunk) => appendWorkerLog('worker.stdout.log', chunk));
  worker.stderr?.on('data', (chunk) => appendWorkerLog('worker.stderr.log', chunk));
  worker.on?.('message', (message) => {
    if (message?.type === 'stage8-bc-progress' && Number.isInteger(message.gameIndex)) {
      progress = { completedGames: message.gameIndex + 1, completedShards: message.completedShards, lastGameIndex: message.gameIndex };
    } else if (message?.type === 'stage8-bc-result') finalResult = message.result;
  });
  const interval = setInterval(() => {
    try {
      status = nextStatus({ previous: status, control, launchNonce, launcherPid, supervisorPid: process.pid,
        workerPid: worker.pid, supervisorStartedAt, workerStartedAt, command, state: 'running', progress, supervisionTools });
      publishStatus(directory, status);
    } catch (error) {
      supervisionFailure = error instanceof Error ? error.message : String(error);
      worker.kill?.();
    }
  }, control.policy.heartbeatIntervalMs);
  const exited = await new Promise((resolve) => worker.once('exit', (code, signal) => resolve({ code, signal })));
  clearInterval(interval);
  const committed = exited.code === 0 && finalResult?.ok === true
    && fs.existsSync(environment.STAGE8_BC_CORPUS_RUN_DIRECTORY);
  let state = committed ? 'completed' : finalResult || supervisionFailure ? 'failed' : 'interrupted';
  let terminalState = committed ? 'committed' : finalResult || supervisionFailure ? 'fused' : 'operational-interruption-limit-reached';
  if (!committed) {
    try { quarantineInterruptedRun(environment, progress.completedShards); } catch {
      state = 'failed'; terminalState = 'fused';
    }
  }
  status = nextStatus({ previous: status, control, launchNonce, launcherPid, supervisorPid: process.pid,
    workerPid: worker.pid, supervisorStartedAt, workerStartedAt, command, state, progress,
    exitCode: exited.code, signal: exited.signal, terminalState, supervisionTools });
  publishStatus(directory, status);
  return status;
}

function inspectWindowsProcess(pid) {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{ProcessId=$p.Id;StartTime=$p.StartTime.ToString('o');Path=$p.Path}|ConvertTo-Json -Compress}`;
  const result = spawnSync(executable, ['-NoProfile','-NonInteractive','-Command', command], {
    encoding: 'utf8', windowsHide: true, shell: false,
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return JSON.parse(result.stdout.trim());
}

export function monitorStage8BcSupervision(options = {}) {
  const directory = options.directory;
  const controlPath = options.controlPath;
  try {
    const supervisionTools = options.supervisionTools ?? loadTs(path.join(root, 'src/game/stage8/offline-bc-supervision-control.ts'));
    const control = readControl(controlPath, supervisionTools);
    const statusFiles = fs.readdirSync(directory).filter((name) => /^status-\d{6}\.json$/.test(name)).sort();
    if (statusFiles.length === 0) throw new Error('bc-supervision-status-missing');
    const status = JSON.parse(fs.readFileSync(path.join(directory, statusFiles.at(-1)), 'utf8'));
    const previous = status.sequence === 0 ? undefined : JSON.parse(fs.readFileSync(
      path.join(directory, `status-${String(status.sequence - 1).padStart(6, '0')}.json`), 'utf8'));
    const valid = supervisionTools.validateStage8BcSupervisionStatus({ status, control, previous });
    if (!valid.ok) return { ok: false, classification: 'tampered', reason: valid.reason, filesWritten: 0 };
    if (valid.value.terminal) return { ok: true, classification: status.state === 'completed' ? 'completed' : 'failed', status, filesWritten: 0 };
    const processInfo = (options.inspectProcess ?? inspectWindowsProcess)(status.supervisorPid);
    if (!processInfo) return { ok: true, classification: 'stale', status, filesWritten: 0 };
    const creationTime = new Date(processInfo.StartTime).getTime();
    const expectedStart = new Date(status.supervisorStartedAt).getTime();
    if (!Number.isFinite(creationTime) || Math.abs(creationTime - expectedStart) > 15_000
      || !processInfo.Path || sha(fs.readFileSync(processInfo.Path)) !== status.commandIdentity.executableSha256) {
      return { ok: false, classification: 'tampered', reason: 'bc-supervision-process-identity-mismatch', filesWritten: 0 };
    }
    const stale = Date.now() - new Date(status.heartbeatAt).getTime() > control.policy.heartbeatStaleMs;
    return { ok: true, classification: stale ? 'stale' : 'running', status, filesWritten: 0 };
  } catch (error) {
    return { ok: false, classification: 'tampered', reason: error instanceof Error ? error.message : String(error), filesWritten: 0 };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--host') {
    await runStage8BcSupervisorHost();
  } else if (process.argv[2] === '--status') {
    const result = monitorStage8BcSupervision({
      directory: process.env.STAGE8_BC_SUPERVISION_DIRECTORY,
      controlPath: process.env.STAGE8_BC_SUPERVISION_CONTROL_MANIFEST,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else {
    console.error('bc-supervision-mode-required');
    process.exitCode = 1;
  }
}
