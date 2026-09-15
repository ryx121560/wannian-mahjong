import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const EVIDENCE_NAME = 'SECOND_OPERATIONAL_INTERRUPTION.json';
const MARKER_NAME = 'QUARANTINED.json';

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

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const normalize = (value) => path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
const directChild = (candidate, parent) => path.win32.dirname(normalize(candidate)) === normalize(parent);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

function requiredPath(environment, name, type) {
  const value = environment[name];
  if (!value || !path.win32.isAbsolute(value) || !fs.existsSync(value)) throw new Error(`${name}-invalid`);
  const stat = fs.statSync(value);
  if ((type === 'file' && !stat.isFile()) || (type === 'directory' && !stat.isDirectory())
    || fs.lstatSync(value).isSymbolicLink()) throw new Error(`${name}-invalid`);
  return value;
}

function assertNoReparseEntries(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('bc-second-interruption-reparse-entry-forbidden');
    if (entry.isDirectory()) assertNoReparseEntries(path.join(directory, entry.name));
  }
}

function readJsonFile(file) {
  const bytes = fs.readFileSync(file);
  return { bytes, sha256: sha256(bytes), value: JSON.parse(bytes.toString('utf8')) };
}

export function inspectWindowsProcess(pid, options = {}) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('bc-second-interruption-process-probe-pid-invalid');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{probeVersion='stage8-bc-process-probe-v1';queryPid=${pid};present=$true;process=[pscustomobject]@{ProcessId=$p.Id;StartTime=$p.StartTime.ToString('o');Path=$p.Path}}|ConvertTo-Json -Compress -Depth 3}else{[pscustomobject]@{probeVersion='stage8-bc-process-probe-v1';queryPid=${pid};present=$false;process=$null}|ConvertTo-Json -Compress -Depth 3}`;
  const result = (options.spawnProcess ?? spawnSync)(executable, ['-NoProfile','-NonInteractive','-Command',command], {
    encoding: 'utf8', windowsHide: true, shell: false,
  });
  if (result?.error || result?.signal !== null || result?.status !== 0
    || typeof result.stderr !== 'string' || result.stderr.trim() !== ''
    || typeof result.stdout !== 'string' || result.stdout.trim() === '') {
    throw new Error('bc-second-interruption-process-probe-execution-failed');
  }
  let payload;
  try { payload = JSON.parse(result.stdout.trim()); } catch {
    throw new Error('bc-second-interruption-process-probe-output-invalid');
  }
  if (!exactKeys(payload, ['probeVersion','queryPid','present','process'])
    || payload.probeVersion !== 'stage8-bc-process-probe-v1' || payload.queryPid !== pid
    || typeof payload.present !== 'boolean') {
    throw new Error('bc-second-interruption-process-probe-schema-invalid');
  }
  if (!payload.present) {
    if (payload.process !== null) throw new Error('bc-second-interruption-process-probe-schema-invalid');
    return { state: 'absent', pid };
  }
  if (!exactKeys(payload.process, ['ProcessId','StartTime','Path']) || payload.process.ProcessId !== pid
    || typeof payload.process.StartTime !== 'string' || !Number.isFinite(Date.parse(payload.process.StartTime))
    || typeof payload.process.Path !== 'string' || payload.process.Path.length === 0) {
    throw new Error('bc-second-interruption-process-probe-schema-invalid');
  }
  return { state: 'present', pid, process: payload.process };
}

function assertProcessesAbsent(pids, inspectProcess) {
  for (const pid of pids) {
    const result = inspectProcess(pid);
    if (!result || result.pid !== pid || !['present','absent'].includes(result.state)) {
      throw new Error('bc-second-interruption-process-probe-result-invalid');
    }
    if (result.state === 'present') throw new Error('bc-second-interruption-live-process-present');
  }
}

function validators(options) {
  return options.validators ?? {
    protocol: loadTs(path.join(root, 'src/game/stage8/offline-bc-operational-interruption.ts')),
    identity: loadTs(path.join(root, 'src/game/stage8/offline-bc-run-identity.ts')),
    artifact: loadTs(path.join(root, 'src/game/stage8/offline-bc-artifact-control.ts')),
    corpus: loadTs(path.join(root, 'src/game/stage8/offline-bc-corpus-control.ts')),
    supervision: loadTs(path.join(root, 'src/game/stage8/offline-bc-supervision-control.ts')),
  };
}

function validateBoundInputs(files, tools) {
  const authorization = tools.identity.validateStage8BcRunAuthorizationInput(files.authorization.value);
  const predecessor = tools.protocol.validateStage8BcOperationalInterruptionEvidence(files.predecessor.value);
  const artifact = tools.artifact.validateStage8BcArtifactControlManifest(files.artifact.value);
  const corpus = tools.corpus.validateStage8BcCorpusControlManifest(files.corpus.value);
  const supervision = tools.supervision.validateStage8BcSupervisionControlManifest(files.supervision.value);
  const failed = [authorization,predecessor,artifact,corpus,supervision].find((result) => !result.ok);
  if (failed) throw new Error(failed.reason ?? failed.decision?.reason ?? 'bc-second-interruption-control-invalid');
  const auth = files.authorization.value;
  const pred = files.predecessor.value;
  const artifactControl = files.artifact.value;
  const corpusControl = files.corpus.value;
  const supervisionControl = files.supervision.value;
  if (artifactControl.protocolVersion !== 'stage8-bc-artifact-control-v2'
    || corpusControl.protocolVersion !== 'stage8-bc-corpus-control-v3'
    || auth.runId !== artifactControl.identity.runId || auth.runId !== corpusControl.identity.runId
    || auth.runId !== supervisionControl.identity.runId
    || auth.sourceCommit.toLowerCase() !== supervisionControl.identity.sourceCommit.toLowerCase()
    || artifactControl.identity.sourceBundleSha256 !== supervisionControl.identity.sourceBundleSha256
    || corpusControl.identity.sourceBundleSha256 !== supervisionControl.identity.sourceBundleSha256
    || auth.authorizationSha256 !== artifactControl.identity.runAuthorizationSha256
    || auth.authorizationSha256 !== corpusControl.identity.runAuthorizationSha256
    || auth.authorizationSha256 !== supervisionControl.identity.runAuthorizationSha256
    || auth.predecessor.runId !== pred.predecessorRunId
    || auth.predecessor.evidenceSha256 !== pred.evidenceSha256
    || pred.evidenceSha256 !== artifactControl.identity.predecessorEvidenceSha256
    || pred.evidenceSha256 !== corpusControl.identity.predecessorEvidenceSha256
    || pred.evidenceSha256 !== supervisionControl.identity.predecessorEvidenceSha256
    || artifactControl.manifestSha256 !== corpusControl.identity.artifactControlManifestSha256
    || artifactControl.manifestSha256 !== supervisionControl.identity.artifactControlManifestSha256
    || corpusControl.manifestSha256 !== supervisionControl.identity.corpusControlManifestSha256
    || corpusControl.plan.workers !== 1 || corpusControl.plan.priorOperationalInterruptions !== 1
    || corpusControl.plan.maxOperationalInterruptions !== 1 || corpusControl.plan.automaticRetries !== 0
    || corpusControl.plan.seedOverrides !== 0 || corpusControl.plan.allowThirdAttempt !== false
    || corpusControl.capacity.maxRunBytes !== 5 * 1024 ** 3
    || corpusControl.capacity.rootHardLimitBytes !== 64 * 1024 ** 3
    || corpusControl.capacity.rootFusePercent !== 80
    || supervisionControl.policy.workers !== 1 || supervisionControl.policy.priorOperationalInterruptions !== 1
    || supervisionControl.policy.maxOperationalInterruptions !== 1 || supervisionControl.policy.automaticRetries !== 0
    || supervisionControl.policy.seedOverrides !== 0 || supervisionControl.policy.allowThirdAttempt !== false) {
    throw new Error('bc-second-interruption-cross-binding-invalid');
  }
}

function loadBoundFiles(environment) {
  const names = {
    authorization: 'STAGE8_BC_RUN_AUTHORIZATION', predecessor: 'STAGE8_BC_PREDECESSOR_EVIDENCE',
    artifact: 'STAGE8_BC_ARTIFACT_CONTROL_MANIFEST', corpus: 'STAGE8_BC_CORPUS_CONTROL_MANIFEST',
    supervision: 'STAGE8_BC_SUPERVISION_CONTROL_MANIFEST',
  };
  return Object.fromEntries(Object.entries(names).map(([key, name]) => [
    key,
    readJsonFile(requiredPath(environment, name, 'file')),
  ]));
}

function boundIdentity(files) {
  const control = files.supervision.value;
  return {
    runId: control.identity.runId,
    sourceCommit: control.identity.sourceCommit,
    sourceBundleSha256: control.identity.sourceBundleSha256,
    runAuthorizationSha256: files.authorization.value.authorizationSha256,
    runAuthorizationFileSha256: files.authorization.sha256,
    predecessorRunId: files.predecessor.value.predecessorRunId,
    predecessorEvidenceSha256: files.predecessor.value.evidenceSha256,
    predecessorEvidenceFileSha256: files.predecessor.sha256,
    artifactControlManifestSha256: files.artifact.value.manifestSha256,
    artifactControlFileSha256: files.artifact.sha256,
    corpusControlManifestSha256: files.corpus.value.manifestSha256,
    corpusControlFileSha256: files.corpus.sha256,
    supervisionControlManifestSha256: files.supervision.value.manifestSha256,
    supervisionControlFileSha256: files.supervision.sha256,
  };
}

function inspectStatusChain(directory, control, tools) {
  const names = fs.readdirSync(directory).filter((name) => /^status-\d{6}\.json$/.test(name)).sort();
  if (names.length < 2 || names.some((name, index) => name !== `status-${String(index).padStart(6, '0')}.json`)) {
    throw new Error('bc-second-interruption-status-sequence-invalid');
  }
  let previous;
  let commandIdentity;
  const statuses = names.map((name, index) => {
    const status = readJsonFile(path.join(directory, name)).value;
    const checked = tools.supervision.validateStage8BcSupervisionStatus({ status, control, previous });
    if (!checked.ok) throw new Error(checked.reason);
    if (status.sequence !== index || (commandIdentity && JSON.stringify(status.commandIdentity) !== commandIdentity)) {
      throw new Error('bc-second-interruption-status-runtime-identity-drift');
    }
    commandIdentity ??= JSON.stringify(status.commandIdentity);
    previous = status;
    return status;
  });
  return statuses;
}

function inspectShards(directory, expectedCount, tools) {
  const batchesRoot = path.join(directory, 'batches');
  if (!fs.existsSync(batchesRoot) || !fs.statSync(batchesRoot).isDirectory()) {
    throw new Error('bc-second-interruption-batches-missing');
  }
  const batchNames = fs.readdirSync(batchesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (batchNames.length !== expectedCount
    || batchNames.some((name, index) => name !== `batch-${String(index + 1).padStart(6, '0')}`)) {
    throw new Error('bc-second-interruption-batch-sequence-invalid');
  }
  let lastWriteTimeMs = 0;
  const shards = batchNames.map((batchName) => {
    const batchDirectory = path.join(batchesRoot, batchName);
    const names = fs.readdirSync(batchDirectory);
    if (names.length !== 1 || !names[0].endsWith('.json.gz')) throw new Error('bc-second-interruption-batch-layout-invalid');
    const shardPath = path.join(batchDirectory, names[0]);
    const bytes = fs.readFileSync(shardPath);
    const envelope = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
    if (!Array.isArray(envelope?.records) || envelope.records.length === 0) {
      throw new Error('bc-second-interruption-shard-records-invalid');
    }
    lastWriteTimeMs = Math.max(lastWriteTimeMs, fs.statSync(shardPath).mtimeMs);
    return {
      relativePath: path.relative(directory, shardPath).replace(/\\/g, '/'),
      bytes: bytes.length,
      records: envelope.records.length,
      sha256: sha256(bytes),
    };
  });
  return {
    shards,
    shardAggregateSha256: tools.protocol.hashStage8BcOperationalInterruptionShardAggregate(shards),
    totalRecords: shards.reduce((sum, shard) => sum + shard.records, 0),
    totalBytes: shards.reduce((sum, shard) => sum + shard.bytes, 0),
    lastWriteTimeUtc: new Date(lastWriteTimeMs).toISOString(),
  };
}

export function inspectStage8BcSecondInterruption(options = {}) {
  try {
    const environment = options.environment ?? process.env;
    const tools = validators(options);
    const artifactRoot = requiredPath(environment, 'STAGE8_ARTIFACT_ROOT', 'directory');
    const runDirectory = environment.STAGE8_BC_CORPUS_RUN_DIRECTORY;
    const supervisionDirectory = requiredPath(environment, 'STAGE8_BC_SUPERVISION_DIRECTORY', 'directory');
    if (!runDirectory || !path.win32.isAbsolute(runDirectory) || !directChild(runDirectory, artifactRoot)) {
      throw new Error('bc-second-interruption-run-path-invalid');
    }
    const stagingDirectory = `${runDirectory}.partial`;
    const quarantineDirectory = `${stagingDirectory}.quarantine`;
    if (!fs.existsSync(stagingDirectory) || !fs.statSync(stagingDirectory).isDirectory()
      || fs.lstatSync(stagingDirectory).isSymbolicLink() || fs.existsSync(runDirectory)
      || fs.existsSync(quarantineDirectory) || !directChild(stagingDirectory, artifactRoot)
      || !directChild(supervisionDirectory, artifactRoot)) throw new Error('bc-second-interruption-path-state-invalid');
    assertNoReparseEntries(stagingDirectory);
    assertNoReparseEntries(supervisionDirectory);
    if (fs.existsSync(path.join(stagingDirectory, EVIDENCE_NAME)) || fs.existsSync(path.join(stagingDirectory, MARKER_NAME))
      || ['corpus-manifest.json','corpus-manifest.pending.json','corpus-ledger.json']
        .some((name) => fs.existsSync(path.join(stagingDirectory, name)))) {
      throw new Error('bc-second-interruption-committed-or-recovery-output-present');
    }
    const files = loadBoundFiles(environment);
    validateBoundInputs(files, tools);
    const control = files.supervision.value;
    if (path.win32.basename(runDirectory) !== control.identity.runId
      || path.win32.basename(supervisionDirectory) !== `${control.identity.runId}.supervision`) {
      throw new Error('bc-second-interruption-directory-identity-invalid');
    }
    const lockFile = readJsonFile(path.join(supervisionDirectory, 'LOCK.json'));
    if (!exactKeys(lockFile.value, [
      'protocolVersion','runId','launchNonce','launcherPid','supervisorPid','supervisorStartedAt','supervisionManifestSha256',
    ])) throw new Error('bc-second-interruption-lock-schema-invalid');
    const statuses = inspectStatusChain(supervisionDirectory, control, tools);
    const first = statuses[0];
    const last = statuses.at(-1);
    if (lockFile.value.protocolVersion !== first.protocolVersion || lockFile.value.runId !== first.runId
      || lockFile.value.launchNonce !== first.launchNonce || lockFile.value.launcherPid !== first.launcherPid
      || lockFile.value.supervisorPid !== first.supervisorPid
      || new Date(lockFile.value.supervisorStartedAt).toISOString() !== first.supervisorStartedAt
      || lockFile.value.supervisionManifestSha256 !== control.manifestSha256) {
      throw new Error('bc-second-interruption-lock-identity-invalid');
    }
    const nowMs = options.nowMs ?? Date.now();
    if (last.state !== 'running' || last.terminalState !== null || last.exitCode !== null || last.signal !== null
      || nowMs - Date.parse(last.heartbeatAt) <= control.policy.heartbeatStaleMs
      || last.progress.completedGames !== 16 || last.progress.completedShards !== 16 || last.progress.lastGameIndex !== 15
      || last.automaticRetries !== 0 || last.seedOverrides !== 0) {
      throw new Error('bc-second-interruption-latest-status-not-stale-boundary');
    }
    const inspectProcess = options.inspectProcess
      ?? ((pid) => inspectWindowsProcess(pid, { spawnProcess: options.spawnProcessProbe }));
    assertProcessesAbsent([last.launcherPid,last.supervisorPid,last.workerPid], inspectProcess);
    const shardSnapshot = inspectShards(stagingDirectory, last.progress.completedShards, tools);
    const evidenceInput = {
      identity: boundIdentity(files),
      supervision: {
        relativePath: path.win32.basename(supervisionDirectory), lockSha256: lockFile.sha256,
        statusCount: statuses.length, statusHeadSha256: last.statusSha256, launchNonce: last.launchNonce,
        launcherPid: last.launcherPid, supervisorPid: last.supervisorPid, workerPid: last.workerPid,
        lastSequence: last.sequence, lastState: 'running', heartbeatAt: last.heartbeatAt,
        completedGames: last.progress.completedGames, completedShards: last.progress.completedShards,
        lastGameIndex: last.progress.lastGameIndex,
      },
      quarantine: {
        relativePath: path.win32.basename(quarantineDirectory), completedShardCount: shardSnapshot.shards.length,
        ...shardSnapshot,
      },
      interruption: {
        classification: 'second-external-operational-interruption',
        classificationBasis: 'stale-heartbeat-and-supervisor-worker-absent',
        currentInterruptionOrdinal: 2, priorOperationalInterruptions: 1,
        maxOperationalInterruptions: 1, benchmarkInvalidated: true,
      },
      policy: { workers: 1, automaticRetries: 0, seedOverrides: 0, allowThirdAttempt: false, allowResume: false, diagnosticOnly: true },
      commitments: {
        finalCommitted: false, corpusManifestCommitted: false, replayCommitted: false,
        checkpointCommitted: false, trainingCommitted: false, formalPilotGamesCredited: 0,
      },
    };
    const built = tools.protocol.createStage8BcSecondInterruptionEvidence(evidenceInput);
    if (!built.ok) throw new Error(built.reason);
    const marker = tools.protocol.createStage8BcSecondInterruptionMarker(built.value);
    if (!marker.ok) throw new Error(marker.reason);
    return { ok: true, status: 'stale-confirmed', filesWritten: 0, value: {
      stagingDirectory, quarantineDirectory, evidence: built.value, marker: marker.value,
    } };
  } catch (error) {
    return { ok: false, status: 'fused', reason: error instanceof Error ? error.message : String(error), filesWritten: 0 };
  }
}

export function verifyStage8BcSecondInterruptionQuarantine(options = {}) {
  try {
    const tools = validators(options);
    const directory = options.quarantineDirectory;
    assertNoReparseEntries(directory);
    const evidence = readJsonFile(path.join(directory, EVIDENCE_NAME)).value;
    const marker = readJsonFile(path.join(directory, MARKER_NAME)).value;
    const valid = tools.protocol.validateStage8BcSecondInterruptionEvidence(evidence, options.expectedIdentity);
    if (!valid.ok) throw new Error(valid.reason);
    if (options.environment) {
      const environment = options.environment;
      const files = loadBoundFiles(environment);
      validateBoundInputs(files, tools);
      const identity = boundIdentity(files);
      const identityCheck = tools.protocol.validateStage8BcSecondInterruptionEvidence(evidence, identity);
      if (!identityCheck.ok) throw new Error(identityCheck.reason);
      const supervisionDirectory = requiredPath(environment, 'STAGE8_BC_SUPERVISION_DIRECTORY', 'directory');
      const control = files.supervision.value;
      const statuses = inspectStatusChain(supervisionDirectory, control, tools);
      const last = statuses.at(-1);
      const lockSha256 = readJsonFile(path.join(supervisionDirectory, 'LOCK.json')).sha256;
      const nowMs = options.nowMs ?? Date.now();
      const inspectProcess = options.inspectProcess
        ?? ((pid) => inspectWindowsProcess(pid, { spawnProcess: options.spawnProcessProbe }));
      if (lockSha256 !== evidence.supervision.lockSha256 || statuses.length !== evidence.supervision.statusCount
        || last.statusSha256 !== evidence.supervision.statusHeadSha256
        || last.launchNonce !== evidence.supervision.launchNonce || last.launcherPid !== evidence.supervision.launcherPid
        || last.supervisorPid !== evidence.supervision.supervisorPid || last.workerPid !== evidence.supervision.workerPid
        || last.sequence !== evidence.supervision.lastSequence || last.state !== 'running' || last.terminalState !== null
        || last.heartbeatAt !== evidence.supervision.heartbeatAt
        || last.progress.completedGames !== evidence.supervision.completedGames
        || last.progress.completedShards !== evidence.supervision.completedShards
        || last.progress.lastGameIndex !== evidence.supervision.lastGameIndex
        || nowMs - Date.parse(last.heartbeatAt) <= control.policy.heartbeatStaleMs) {
        throw new Error('bc-second-interruption-supervision-evidence-drift');
      }
      assertProcessesAbsent([last.launcherPid,last.supervisorPid,last.workerPid], inspectProcess);
      const runDirectory = environment.STAGE8_BC_CORPUS_RUN_DIRECTORY;
      if (fs.existsSync(runDirectory) || fs.existsSync(`${runDirectory}.partial`)
        || normalize(`${runDirectory}.partial.quarantine`) !== normalize(directory)) {
        throw new Error('bc-second-interruption-quarantine-path-drift');
      }
    }
    const expectedMarker = tools.protocol.createStage8BcSecondInterruptionMarker(evidence);
    if (!expectedMarker.ok || JSON.stringify(expectedMarker.value) !== JSON.stringify(marker)) {
      throw new Error('bc-second-interruption-marker-invalid');
    }
    const shards = inspectShards(directory, evidence.quarantine.completedShardCount, tools);
    if (JSON.stringify(shards) !== JSON.stringify({
      shards: evidence.quarantine.shards,
      shardAggregateSha256: evidence.quarantine.shardAggregateSha256,
      totalRecords: evidence.quarantine.totalRecords,
      totalBytes: evidence.quarantine.totalBytes,
      lastWriteTimeUtc: evidence.quarantine.lastWriteTimeUtc,
    })) throw new Error('bc-second-interruption-quarantine-drift');
    return { ok: true, status: 'quarantined-verified', filesWritten: 0, evidenceSha256: evidence.evidenceSha256,
      markerSha256: sha256(fs.readFileSync(path.join(directory, MARKER_NAME))) };
  } catch (error) {
    return { ok: false, status: 'fused', reason: error instanceof Error ? error.message : String(error), filesWritten: 0 };
  }
}

export function runStage8BcSecondInterruptionRecovery(options = {}) {
  const args = options.args ?? process.argv.slice(2);
  const mode = args.length === 1 && args[0] === '--check' ? 'check'
    : args.length === 1 && args[0] === '--quarantine' ? 'quarantine'
      : args.length === 1 && args[0] === '--verify' ? 'verify' : null;
  if (!mode) return { ok: false, status: 'fused', reason: 'bc-second-interruption-mode-required', filesWritten: 0 };
  if (mode === 'verify') {
    const environment = options.environment ?? process.env;
    const runDirectory = environment.STAGE8_BC_CORPUS_RUN_DIRECTORY;
    if (!runDirectory || !path.win32.isAbsolute(runDirectory)) {
      return { ok: false, status: 'fused', reason: 'bc-second-interruption-run-path-invalid', filesWritten: 0 };
    }
    return verifyStage8BcSecondInterruptionQuarantine({
      ...options, environment, quarantineDirectory: `${runDirectory}.partial.quarantine`,
    });
  }
  const inspected = inspectStage8BcSecondInterruption(options);
  if (!inspected.ok || mode === 'check') return inspected;
  const environment = options.environment ?? process.env;
  if (environment.STAGE8_BC_SECOND_INTERRUPTION_QUARANTINE !== '1') {
    return { ok: false, status: 'fused', reason: 'bc-second-interruption-quarantine-authorization-required', filesWritten: 0 };
  }
  const rechecked = inspectStage8BcSecondInterruption(options);
  if (!rechecked.ok) return rechecked;
  if (JSON.stringify(rechecked.value) !== JSON.stringify(inspected.value)) {
    return { ok: false, status: 'fused', reason: 'bc-second-interruption-pre-write-recheck-drift', filesWritten: 0 };
  }
  const { stagingDirectory, quarantineDirectory, evidence, marker } = rechecked.value;
  const evidencePath = path.join(stagingDirectory, EVIDENCE_NAME);
  const markerPath = path.join(stagingDirectory, MARKER_NAME);
  let renameCompleted = false;
  try {
    const evidenceBytes = `${JSON.stringify(evidence)}\n`;
    const markerBytes = `${JSON.stringify(marker)}\n`;
    fs.writeFileSync(evidencePath, evidenceBytes, { encoding: 'utf8', flag: 'wx' });
    fs.writeFileSync(markerPath, markerBytes, { encoding: 'utf8', flag: 'wx' });
    if (fs.readFileSync(evidencePath, 'utf8') !== evidenceBytes || fs.readFileSync(markerPath, 'utf8') !== markerBytes
      || fs.existsSync(quarantineDirectory)) throw new Error('bc-second-interruption-pre-rename-drift');
    fs.renameSync(stagingDirectory, quarantineDirectory);
    renameCompleted = true;
    const verified = verifyStage8BcSecondInterruptionQuarantine({
      ...options, environment, quarantineDirectory, expectedIdentity: evidence.identity,
    });
    if (!verified.ok) throw new Error(verified.reason);
    return { ok: true, status: 'quarantined', filesWritten: 2, evidenceSha256: evidence.evidenceSha256,
      markerSha256: verified.markerSha256, quarantineDirectory, automaticRetries: 0, allowThirdAttempt: false };
  } catch (error) {
    if (!renameCompleted && fs.existsSync(stagingDirectory)) {
      for (const file of [markerPath,evidencePath]) {
        try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch { /* Preserve fail-closed state. */ }
      }
    }
    if (renameCompleted) {
      return {
        ok: false,
        status: 'quarantined-but-verification-failed',
        reason: error instanceof Error ? error.message : String(error),
        filesWritten: 2,
        quarantineDirectory,
        quarantinePresent: fs.existsSync(quarantineDirectory),
        stagingPresent: fs.existsSync(stagingDirectory),
        atomicRenameCompleted: true,
        automaticRetries: 0,
        allowThirdAttempt: false,
      };
    }
    return { ok: false, status: 'fused', reason: error instanceof Error ? error.message : String(error), filesWritten: 0 };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runStage8BcSecondInterruptionRecovery();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
