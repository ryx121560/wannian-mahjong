import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { launchStage8BcSupervised } from './stage8-bc-corpus-supervised-launch.mjs';
import { monitorStage8BcSupervision } from './stage8-bc-corpus-supervisor.mjs';

const root = process.cwd();
const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename);
const tools = require('../src/game/stage8/offline-bc-supervision-control.ts');
const h = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const wait = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

function controlFor(runId, corpusSha, artifactSha, evidenceSha, authorizationSha) {
  const payload = {
    protocolVersion: tools.STAGE8_BC_SUPERVISION_CONTROL_VERSION,
    identity: {
      runId, sourceCommit: 'c'.repeat(40), sourceBundleSha256: h('source'),
      runAuthorizationSha256: authorizationSha, artifactControlManifestSha256: artifactSha,
      corpusControlManifestSha256: corpusSha, predecessorEvidenceSha256: evidenceSha,
      supervisionDefinitionSha256: tools.hashStage8BcSupervisionDefinition(),
      launcherSourceSha256: h('launcher'), supervisorSourceSha256: h('supervisor'), runnerSourceSha256: h('runner'),
    },
    authorization: { approvalId: 'product-supervision-approval', granted: true, scope: tools.STAGE8_BC_SUPERVISION_SCOPE },
    policy: {
      workers: 1, priorOperationalInterruptions: 1, maxOperationalInterruptions: 1,
      automaticRetries: 0, seedOverrides: 0, allowThirdAttempt: false,
      windowsHide: true, detachedSupervisor: true, shell: false,
      heartbeatIntervalMs: tools.STAGE8_BC_HEARTBEAT_INTERVAL_MS,
      heartbeatStaleMs: tools.STAGE8_BC_HEARTBEAT_STALE_MS,
    },
  };
  return { ...payload, manifestSha256: tools.hashStage8BcSupervisionControlPayload(payload) };
}

function writeScenario(parent, name, workerBody) {
  const directory = path.join(parent, name);
  const artifactRoot = path.join(directory, 'artifacts');
  fs.mkdirSync(artifactRoot, { recursive: true });
  const runId = `formal-bc-corpus-${name}`;
  const evidence = { evidenceSha256: h(`${name}-evidence`) };
  const authorization = { authorizationSha256: h(`${name}-authorization`) };
  const artifact = { manifestSha256: h(`${name}-artifact`) };
  const corpus = {
    protocolVersion: 'stage8-bc-corpus-control-v3', manifestSha256: h(`${name}-corpus`),
    identity: { runId }, plan: { supervisedExecutionRequired: true, workers: 1, automaticRetries: 0, seedOverrides: 0 },
    capacity: { maxRunBytes: 1024 },
  };
  const supervision = controlFor(runId, corpus.manifestSha256, artifact.manifestSha256,
    evidence.evidenceSha256, authorization.authorizationSha256);
  const files = { authorization, predecessor: evidence, artifact, corpus, supervision };
  const filePaths = {};
  for (const [key, value] of Object.entries(files)) {
    filePaths[key] = path.join(directory, `${key}.json`);
    fs.writeFileSync(filePaths[key], JSON.stringify(value));
  }
  const worker = path.join(directory, 'worker.mjs');
  fs.writeFileSync(worker, workerBody);
  const finalDirectory = path.join(artifactRoot, runId);
  const supervisionDirectory = path.join(artifactRoot, `${runId}.supervision`);
  const environment = {
    ...process.env,
    STAGE8_BC_RUN_AUTHORIZATION: filePaths.authorization,
    STAGE8_BC_PREDECESSOR_EVIDENCE: filePaths.predecessor,
    STAGE8_BC_ARTIFACT_CONTROL_MANIFEST: filePaths.artifact,
    STAGE8_BC_CORPUS_CONTROL_MANIFEST: filePaths.corpus,
    STAGE8_BC_SUPERVISION_CONTROL_MANIFEST: filePaths.supervision,
    STAGE8_ARTIFACT_ROOT: artifactRoot,
    STAGE8_PYTHON: process.execPath,
    STAGE8_BC_CORPUS_RUN_DIRECTORY: finalDirectory,
    STAGE8_BC_SUPERVISION_DIRECTORY: supervisionDirectory,
    STAGE8_BC_SUPERVISED_WORKER_SCRIPT: worker,
  };
  return { directory, artifactRoot, runId, files, filePaths, worker, finalDirectory, supervisionDirectory, environment };
}

function launcherHarness(scenario) {
  const config = path.join(scenario.directory, 'launch-config.json');
  const harness = path.join(scenario.directory, 'launcher-harness.mjs');
  fs.writeFileSync(config, JSON.stringify({ environment: scenario.environment }));
  fs.writeFileSync(harness, `
import fs from 'node:fs';
import { launchStage8BcSupervised } from ${JSON.stringify(pathToFileURL(path.join(root, 'scripts/stage8-bc-corpus-supervised-launch.mjs')).href)};
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const result=await launchStage8BcSupervised({environment:config.environment,
  inspectCheckout:()=>({sourceCommit:'${'c'.repeat(40)}',clean:true}),
  validateIdentity:()=>({ok:true}), verifyPredecessor:()=>({ok:true}), capacityPreflight:()=>true,
  rootTools:{deriveStage8ForbiddenProjectRoots:()=>['C:\\\\repo'],preflightStage8ArtifactRoot:()=>({ok:true,artifactRoot:config.environment.STAGE8_ARTIFACT_ROOT})}});
console.log(JSON.stringify(result)); if(!result.ok)process.exitCode=1;
`);
  return { harness, config };
}

function waitForTerminal(directory, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(directory)) {
      const files = fs.readdirSync(directory).filter((name) => /^status-\d{6}\.json$/.test(name)).sort();
      if (files.length) {
        const status = JSON.parse(fs.readFileSync(path.join(directory, files.at(-1)), 'utf8'));
        if (status.terminalState) return status;
      }
    }
    wait(50);
  }
  throw new Error('supervision fixture terminal timeout');
}

function supervisionStatuses(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => /^status-\d{6}\.json$/.test(name)).sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
}

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function pathIsInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function requireCrossSessionConfigPath(value, mustExist) {
  if (!value || !path.isAbsolute(value)) throw new Error('cross-session-config-absolute-path-required');
  const resolved = path.resolve(value);
  const relative = path.relative(path.resolve(os.tmpdir()), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('cross-session-config-must-be-in-os-temp');
  if (fs.existsSync(resolved) !== mustExist) {
    throw new Error(mustExist ? 'cross-session-config-missing' : 'cross-session-config-already-exists');
  }
  return resolved;
}

async function launchCrossSessionFixture(configArgument) {
  const configPath = requireCrossSessionConfigPath(configArgument, false);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-supervision-cross-session-'));
  try {
    const scenario = writeScenario(temporary, 'command-session-exit', `
import fs from 'node:fs';
const launchCommandPid=${process.pid};
const launchCommandAlive=()=>{try{process.kill(launchCommandPid,0);return true;}catch{return false;}};
process.once('message',()=>{
  const deadline=Date.now()+15000;
  const poll=setInterval(()=>{
    if(launchCommandAlive()&&Date.now()<deadline)return;
    clearInterval(poll);
    if(launchCommandAlive())process.exit(18);
    setTimeout(()=>{
      fs.mkdirSync(process.env.STAGE8_BC_CORPUS_RUN_DIRECTORY);
      process.send?.({type:'stage8-bc-progress',gameIndex:63,completedShards:64});
      process.send?.({type:'stage8-bc-result',result:{ok:true,status:'committed'}});
      setTimeout(()=>process.exit(0),100);
    },3500);
  },50);
});
`);
    const launched = await launchStage8BcSupervised({ environment: scenario.environment,
      inspectCheckout: () => ({ sourceCommit: 'c'.repeat(40), clean: true }), validateIdentity: () => ({ ok: true }),
      verifyPredecessor: () => ({ ok: true }), capacityPreflight: () => true,
      rootTools: { deriveStage8ForbiddenProjectRoots: () => ['C:\\repo'],
        preflightStage8ArtifactRoot: () => ({ ok: true, artifactRoot: scenario.artifactRoot }) },
    });
    assert.equal(launched.ok, true, launched.reason);
    const statuses = supervisionStatuses(scenario.supervisionDirectory);
    assert.ok(statuses.length > 0, 'supervisor must publish an initial status before launcher exits');
    const configPayload = {
      protocolVersion: 'stage8-bc-supervision-cross-session-fixture-v1',
      launchCommandPid: process.pid,
      launchCommandReadyAt: new Date().toISOString(),
      temporaryRoot: temporary,
      scenarioDirectory: scenario.directory,
      supervisionDirectory: scenario.supervisionDirectory,
      finalDirectory: scenario.finalDirectory,
      controlPath: scenario.filePaths.supervision,
      supervisorPid: launched.supervisorPid,
      lastStatusSequenceBeforeLaunchCommandExit: statuses.at(-1).sequence,
      formalPilotGamesExecuted: 0,
      eDriveWrites: 0,
    };
    const config = { ...configPayload, configSha256: h(JSON.stringify(configPayload)) };
    fs.writeFileSync(configPath, `${JSON.stringify(config)}\n`, { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify({ passed: true, phase: 'cross-session-launch', configPath,
      launchCommandPid: process.pid, supervisorPid: launched.supervisorPid,
      supervisionDirectory: scenario.supervisionDirectory, formalPilotGamesExecuted: 0, eDriveWrites: 0 }));
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function verifyCrossSessionFixture(configArgument) {
  const configPath = requireCrossSessionConfigPath(configArgument, true);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.protocolVersion, 'stage8-bc-supervision-cross-session-fixture-v1');
  const configPayload = structuredClone(config); delete configPayload.configSha256;
  assert.equal(config.configSha256, h(JSON.stringify(configPayload)), 'cross-session config identity must match');
  const temporaryRoot = path.resolve(config.temporaryRoot);
  const tempRelative = path.relative(path.resolve(os.tmpdir()), temporaryRoot);
  assert.equal(tempRelative.startsWith('..') || path.isAbsolute(tempRelative), false,
    'cross-session fixture root must remain inside OS temp');
  assert.match(path.basename(temporaryRoot), /^stage8-bc-supervision-cross-session-/);
  assert.equal(path.dirname(path.resolve(config.scenarioDirectory)), temporaryRoot);
  assert.equal(pathIsInside(config.scenarioDirectory, config.supervisionDirectory), true);
  assert.equal(pathIsInside(config.scenarioDirectory, config.finalDirectory), true);
  assert.equal(pathIsInside(config.scenarioDirectory, config.controlPath), true);
  assert.equal(processIsAlive(config.launchCommandPid), false, 'the independent launch command must already be gone');
  const verifyStartedAt = Date.now();
  const proofDeadline = verifyStartedAt + 8_000;
  let postSessionStatus = null;
  while (Date.now() < proofDeadline) {
    const statuses = supervisionStatuses(config.supervisionDirectory);
    postSessionStatus = statuses.find((status) => status.sequence > config.lastStatusSequenceBeforeLaunchCommandExit
      && new Date(status.heartbeatAt).getTime() >= verifyStartedAt);
    if (postSessionStatus || statuses.some((status) => status.terminalState === 'committed')) break;
    wait(50);
  }
  const completed = waitForTerminal(config.supervisionDirectory);
  const survivedStatus = postSessionStatus ?? completed;
  assert.ok(survivedStatus.sequence > config.lastStatusSequenceBeforeLaunchCommandExit,
    'supervisor must publish after the launch command was ready to exit');
  assert.equal(survivedStatus.supervisorPid, config.supervisorPid);
  assert.equal(survivedStatus.launcherPid, config.launchCommandPid);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.terminalState, 'committed');
  assert.equal(completed.progress.completedGames, 64,
    'the hash-chained terminal status must include progress emitted only after the launch command exited');
  assert.equal(completed.automaticRetries, 0);
  const statuses = supervisionStatuses(config.supervisionDirectory);
  const control = JSON.parse(fs.readFileSync(config.controlPath, 'utf8'));
  for (let index = 0; index < statuses.length; index += 1) {
    assert.equal(tools.validateStage8BcSupervisionStatus({
      status: statuses[index], control, previous: index ? statuses[index - 1] : undefined,
    }).ok, true);
  }
  assert.equal(statuses.filter((status) => status.terminalState === 'committed').length, 1);
  assert.equal(monitorStage8BcSupervision({ directory: config.supervisionDirectory,
    controlPath: config.controlPath }).classification, 'completed');
  assert.equal(fs.existsSync(config.finalDirectory), true);
  const processDeadline = Date.now() + 5_000;
  while (processIsAlive(config.supervisorPid) && Date.now() < processDeadline) wait(50);
  assert.equal(processIsAlive(config.supervisorPid), false, 'supervisor must exit after publishing the terminal state');
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  fs.rmSync(configPath, { force: true });
  console.log(JSON.stringify({ passed: true, phase: 'cross-session-verify', launchCommandExited: true,
    supervisorPublishedAfterIndependentCommandExit: true, detachedSupervisorCompleted: true,
    singleCommittedTerminal: true, hashChainValid: true, noResidualProcess: true,
    fixtureCleaned: true, formalPilotGamesExecuted: 0, eDriveWrites: 0 }));
}

const mode = process.argv[2];
if (mode === '--cross-session-launch') {
  try { await launchCrossSessionFixture(process.argv[3]); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
} else if (mode === '--cross-session-verify') {
  try { verifyCrossSessionFixture(process.argv[3]); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
} else {
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-supervision-'));
try {
  assert.equal(tools.validateStage8BcSupervisionControlManifest(controlFor(
    'formal-bc-corpus-schema', h('corpus'), h('artifact'), h('evidence'), h('authorization'),
  )).ok, true);
  const normal = writeScenario(temporary, 'detached-parent-exit', `
import fs from 'node:fs';
process.once('message',()=>setTimeout(()=>{
  fs.mkdirSync(process.env.STAGE8_BC_CORPUS_RUN_DIRECTORY);
  process.send?.({type:'stage8-bc-progress',gameIndex:63,completedShards:64});
  process.send?.({type:'stage8-bc-result',result:{ok:true,status:'committed'}});
  setTimeout(()=>process.exit(0),100);
},700));
`);
  const launchedBy = launcherHarness(normal);
  const launcher = spawnSync(process.execPath, [launchedBy.harness, launchedBy.config], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000,
  });
  assert.equal(launcher.status, 0, launcher.stderr || launcher.stdout);
  const launchResult = JSON.parse(launcher.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(launchResult.ok, true, launchResult.reason);
  assert.throws(() => process.kill(launcher.pid, 0), /ESRCH|no such process/i, 'launcher must have exited');
  assert.doesNotThrow(() => process.kill(launchResult.supervisorPid, 0), 'detached supervisor must outlive launcher');
  const duplicate = await launchStage8BcSupervised({ environment: normal.environment,
    inspectCheckout: () => ({ sourceCommit: 'c'.repeat(40), clean: true }), validateIdentity: () => ({ ok: true }),
    verifyPredecessor: () => ({ ok: true }), capacityPreflight: () => true,
    rootTools: { deriveStage8ForbiddenProjectRoots: () => ['C:\\repo'], preflightStage8ArtifactRoot: () => ({ ok: true }) },
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'bc-supervision-run-path-invalid');
  const completed = waitForTerminal(normal.supervisionDirectory);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.terminalState, 'committed');
  assert.equal(completed.automaticRetries, 0);
  const monitored = monitorStage8BcSupervision({ directory: normal.supervisionDirectory, controlPath: normal.filePaths.supervision });
  assert.equal(monitored.classification, 'completed');

  const statuses = fs.readdirSync(normal.supervisionDirectory).filter((name) => /^status-\d{6}\.json$/.test(name)).sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(normal.supervisionDirectory, name), 'utf8')));
  for (let index = 0; index < statuses.length; index += 1) {
    assert.equal(tools.validateStage8BcSupervisionStatus({
      status: statuses[index], control: normal.files.supervision, previous: index ? statuses[index - 1] : undefined,
    }).ok, true);
  }
  const liveIndex = statuses.findIndex((status) => status.state === 'running');
  assert.ok(liveIndex > 0);
  const monitorFixture = path.join(temporary, 'monitor-fixture'); fs.mkdirSync(monitorFixture);
  for (let index = 0; index <= liveIndex; index += 1) {
    fs.writeFileSync(path.join(monitorFixture, `status-${String(index).padStart(6, '0')}.json`), JSON.stringify(statuses[index]));
  }
  assert.equal(monitorStage8BcSupervision({ directory: monitorFixture, controlPath: normal.filePaths.supervision,
    inspectProcess: () => null }).classification, 'stale');
  assert.equal(monitorStage8BcSupervision({ directory: monitorFixture, controlPath: normal.filePaths.supervision,
    inspectProcess: () => ({ ProcessId: statuses[liveIndex].supervisorPid,
      StartTime: new Date(0).toISOString(), Path: process.execPath }) }).classification, 'tampered');
  const tampered = structuredClone(statuses.at(-1)); tampered.heartbeatAt = new Date(0).toISOString();
  fs.writeFileSync(path.join(normal.supervisionDirectory, `status-${String(tampered.sequence + 1).padStart(6, '0')}.json`), JSON.stringify(tampered));
  assert.equal(monitorStage8BcSupervision({ directory: normal.supervisionDirectory,
    controlPath: normal.filePaths.supervision }).classification, 'tampered');

  const interrupted = writeScenario(temporary, 'second-interruption', `
import fs from 'node:fs'; import path from 'node:path';
process.once('message',()=>setTimeout(()=>{
  const staging=process.env.STAGE8_BC_CORPUS_RUN_DIRECTORY+'.partial'; fs.mkdirSync(staging);
  fs.writeFileSync(path.join(staging,'diagnostic.tmp'),'partial'); process.exit(17);
},300));
`);
  const interruptedHarness = launcherHarness(interrupted);
  const interruptedLauncher = spawnSync(process.execPath, [interruptedHarness.harness, interruptedHarness.config], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10_000,
  });
  assert.equal(interruptedLauncher.status, 0, interruptedLauncher.stderr || interruptedLauncher.stdout);
  const interruptedStatus = waitForTerminal(interrupted.supervisionDirectory);
  assert.equal(interruptedStatus.state, 'interrupted');
  assert.equal(interruptedStatus.exitCode, 17);
  assert.equal(interruptedStatus.terminalState, 'operational-interruption-limit-reached');
  const quarantine = `${interrupted.finalDirectory}.partial.quarantine`;
  assert.equal(fs.existsSync(quarantine), true);
  const marker = JSON.parse(fs.readFileSync(path.join(quarantine, 'QUARANTINED.json'), 'utf8'));
  assert.equal(marker.automaticRetries, 0); assert.equal(marker.seedOverrides, 0);
  assert.equal(marker.reason, 'operational-interruption-limit-reached');

  const capacity = writeScenario(temporary, 'capacity-fused', 'process.exit(99);');
  const capacityResult = await launchStage8BcSupervised({ environment: capacity.environment,
    inspectCheckout: () => ({ sourceCommit: 'c'.repeat(40), clean: true }), validateIdentity: () => ({ ok: true }),
    verifyPredecessor: () => ({ ok: true }), capacityPreflight: () => false,
    rootTools: { deriveStage8ForbiddenProjectRoots: () => ['C:\\repo'], preflightStage8ArtifactRoot: () => ({ ok: true }) },
  });
  assert.equal(capacityResult.reason, 'bc-supervision-capacity-fused');
  assert.equal(fs.existsSync(capacity.supervisionDirectory), false);

  const initial = statuses[0];
  const wrongCommand = { ...initial.commandIdentity, cwdSha256: h('wrong-cwd') };
  assert.equal(tools.validateStage8BcSupervisionStatus({ status: initial, control: normal.files.supervision,
    expectedCommandIdentity: wrongCommand }).reason, 'bc-supervision-status-command-identity-mismatch');
  const forged = structuredClone(statuses[1]); forged.previousStatusSha256 = h('forged');
  const forgedPayload = structuredClone(forged); delete forgedPayload.statusSha256;
  forged.statusSha256 = tools.hashStage8BcSupervisionStatusPayload(forgedPayload);
  assert.equal(tools.validateStage8BcSupervisionStatus({ status: forged, control: normal.files.supervision,
    previous: statuses[0] }).reason, 'bc-supervision-status-chain-invalid');
  const stale = monitorStage8BcSupervision({ directory: interrupted.supervisionDirectory,
    controlPath: interrupted.filePaths.supervision, inspectProcess: () => null });
  assert.equal(stale.classification, 'failed', 'terminal interruption remains failed, not live PID state');

  const oldControl = structuredClone(normal.files.corpus); oldControl.protocolVersion = 'stage8-bc-corpus-control-v2';
  fs.writeFileSync(normal.filePaths.corpus, JSON.stringify(oldControl));
  const oldResult = await launchStage8BcSupervised({ environment: { ...normal.environment,
    STAGE8_BC_SUPERVISION_DIRECTORY: path.join(normal.artifactRoot, 'old-control.supervision') },
    inspectCheckout: () => ({ sourceCommit: 'c'.repeat(40), clean: true }), validateIdentity: () => ({ ok: true }),
    verifyPredecessor: () => ({ ok: true }), capacityPreflight: () => true,
    rootTools: { deriveStage8ForbiddenProjectRoots: () => ['C:\\repo'], preflightStage8ArtifactRoot: () => ({ ok: true }) },
  });
  assert.equal(oldResult.reason, 'bc-supervision-control-cross-binding-invalid');

  console.log(JSON.stringify({ passed: true, launcherExitedBeforeCompletion: true, detachedSupervisorCompleted: true,
    normalTerminal: 'committed', abnormalExitCode: 17, secondInterruptionQuarantined: true,
    automaticRetries: 0, thirdAutomaticAttempt: false, formalPilotGamesExecuted: 0,
    eDriveWrites: 0, temporaryFixturesOnly: true,
    controls: ['exclusive-directory-lock','pid-start-command-identity','hash-chained-status','readonly-monitor',
      'capacity-before-write','old-control-rejected','abnormal-exit-quarantine','launcher-parent-exit-survival'],
  }));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
  fs.rmSync(temporary, { recursive: true, force: true });
}
}
