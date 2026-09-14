import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import ts from 'typescript';
import { verifyStage8BcOperationalInterruptionQuarantine } from './stage8-bc-operational-interruption-evidence.mjs';

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

function requiredFile(name, environment) {
  const value = environment[name];
  if (!value || !path.win32.isAbsolute(value) || !fs.existsSync(value) || !fs.statSync(value).isFile()) {
    throw new Error(`${name} must be an absolute existing file`);
  }
  return value;
}

function requiredDirectory(name, environment) {
  const value = environment[name];
  if (!value || !path.win32.isAbsolute(value) || !fs.existsSync(value) || !fs.statSync(value).isDirectory()) {
    throw new Error(`${name} must be an absolute existing directory`);
  }
  return value;
}

function inspectCheckout() {
  const run = (args) => spawnSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, shell: false,
  });
  const head = run(['rev-parse', 'HEAD']);
  const status = run(['status', '--porcelain=v1', '--untracked-files=all']);
  if (head.status !== 0 || status.status !== 0) throw new Error('bc-supervision-git-inspection-failed');
  return { sourceCommit: head.stdout.trim().toLowerCase(), clean: status.stdout.trim() === '' };
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function directChild(candidate, parent) {
  const normalizedCandidate = path.win32.normalize(candidate);
  return path.win32.dirname(normalizedCandidate).toLowerCase() === path.win32.normalize(parent).toLowerCase();
}

function preflightCapacity(artifactRoot, pendingBytes) {
  const stats = fs.statfsSync(artifactRoot);
  const totalBytes = Number(stats.blocks) * Number(stats.bsize);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  let rootBytes = 0;
  for (const entry of fs.readdirSync(artifactRoot, { withFileTypes: true })) {
    if (entry.isFile()) rootBytes += fs.statSync(path.join(artifactRoot, entry.name)).size;
  }
  return Number.isSafeInteger(totalBytes) && Number.isSafeInteger(freeBytes)
    && freeBytes >= pendingBytes && rootBytes + pendingBytes <= 64 * 1024 ** 3
    && (totalBytes - freeBytes + pendingBytes) / totalBytes < 0.8;
}

export async function launchStage8BcSupervised(options = {}) {
  const environment = options.environment ?? process.env;
  let supervisionDirectory = null;
  try {
    const paths = {
      authorization: requiredFile('STAGE8_BC_RUN_AUTHORIZATION', environment),
      predecessor: requiredFile('STAGE8_BC_PREDECESSOR_EVIDENCE', environment),
      artifact: requiredFile('STAGE8_BC_ARTIFACT_CONTROL_MANIFEST', environment),
      corpus: requiredFile('STAGE8_BC_CORPUS_CONTROL_MANIFEST', environment),
      supervision: requiredFile('STAGE8_BC_SUPERVISION_CONTROL_MANIFEST', environment),
      python: requiredFile('STAGE8_PYTHON', environment),
    };
    const artifactRoot = requiredDirectory('STAGE8_ARTIFACT_ROOT', environment);
    const finalRunDirectory = environment.STAGE8_BC_CORPUS_RUN_DIRECTORY;
    supervisionDirectory = environment.STAGE8_BC_SUPERVISION_DIRECTORY;
    const values = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, JSON.parse(
      key === 'python' ? 'null' : fs.readFileSync(value, 'utf8'),
    )]));
    const supervisionTools = options.supervisionTools ?? loadTs(path.join(root, 'src/game/stage8/offline-bc-supervision-control.ts'));
    const rootTools = options.rootTools ?? loadTs(path.join(root, 'src/game/stage8/artifact-root-preflight.ts'));
    const identityTools = options.identityTools ?? loadTs(path.join(root, 'src/game/stage8/offline-bc-run-identity.ts'));
    const supervision = supervisionTools.validateStage8BcSupervisionControlManifest(values.supervision);
    if (!supervision.ok) throw new Error(supervision.reason);
    if (values.corpus?.protocolVersion !== 'stage8-bc-corpus-control-v3'
      || values.corpus?.plan?.supervisedExecutionRequired !== true
      || values.corpus?.plan?.workers !== 1
      || values.corpus?.plan?.automaticRetries !== 0
      || values.corpus?.plan?.seedOverrides !== 0
      || values.supervision.identity.corpusControlManifestSha256 !== values.corpus?.manifestSha256
      || values.supervision.identity.artifactControlManifestSha256 !== values.artifact?.manifestSha256
      || values.supervision.identity.predecessorEvidenceSha256 !== values.predecessor?.evidenceSha256
      || values.supervision.identity.runAuthorizationSha256 !== values.authorization?.authorizationSha256) {
      throw new Error('bc-supervision-control-cross-binding-invalid');
    }
    const checkout = (options.inspectCheckout ?? inspectCheckout)();
    if (!checkout.clean || checkout.sourceCommit !== values.supervision.identity.sourceCommit) throw new Error('bc-supervision-checkout-invalid');
    const rootValidation = rootTools.preflightStage8ArtifactRoot({
      environment: { STAGE8_ARTIFACT_ROOT: artifactRoot },
      projectRoots: rootTools.deriveStage8ForbiddenProjectRoots({
        currentRoot: root,
        gitFileContent: fs.statSync(path.join(root, '.git')).isFile() ? fs.readFileSync(path.join(root, '.git'), 'utf8') : undefined,
      }),
      exists: fs.existsSync,
      isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
      resolvePath: options.resolvePath ?? fs.realpathSync.native,
    });
    if (!rootValidation.ok) throw new Error(rootValidation.reason);
    const identity = (options.validateIdentity ?? identityTools.validateStage8BcRunIdentityMaterials)({
      sourceCommit: checkout.sourceCommit,
      readFile: (relativePath) => fs.readFileSync(path.join(root, ...relativePath.split('/'))),
      authorization: values.authorization,
      predecessorEvidence: values.predecessor,
      artifactControl: values.artifact,
      corpusControl: values.corpus,
      supervisionControl: values.supervision,
    });
    if (!identity.ok) throw new Error(identity.reason);
    const predecessor = (options.verifyPredecessor ?? verifyStage8BcOperationalInterruptionQuarantine)({
      artifactRoot, evidence: values.predecessor,
    });
    if (!predecessor.ok) throw new Error(predecessor.reason);
    const runId = values.supervision.identity.runId;
    if (!finalRunDirectory || !supervisionDirectory || !path.win32.isAbsolute(finalRunDirectory)
      || !path.win32.isAbsolute(supervisionDirectory) || !directChild(finalRunDirectory, artifactRoot)
      || !directChild(supervisionDirectory, artifactRoot)
      || path.win32.basename(finalRunDirectory) !== runId
      || path.win32.basename(supervisionDirectory) !== `${runId}.supervision`
      || [finalRunDirectory,`${finalRunDirectory}.partial`,`${finalRunDirectory}.partial.quarantine`,supervisionDirectory]
        .some((candidate) => fs.existsSync(candidate))) throw new Error('bc-supervision-run-path-invalid');
    if (!(options.capacityPreflight ?? preflightCapacity)(artifactRoot, values.corpus.capacity.maxRunBytes + 16 * 1024 ** 2)) {
      throw new Error('bc-supervision-capacity-fused');
    }
    const launchNonce = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(supervisionDirectory);
    const stdout = fs.openSync(path.join(supervisionDirectory, 'supervisor.stdout.log'), 'wx');
    const stderr = fs.openSync(path.join(supervisionDirectory, 'supervisor.stderr.log'), 'wx');
    const supervisorScript = path.join(root, 'scripts/stage8-bc-corpus-supervisor.mjs');
    const childEnvironment = Object.fromEntries(Object.entries(environment).filter(([key]) => [
      'SystemRoot','WINDIR','ComSpec','TEMP','TMP','PATH','PATHEXT','NODE_PATH',
      'STAGE8_BC_CORPUS_CONTROL_MANIFEST','STAGE8_BC_ARTIFACT_CONTROL_MANIFEST','STAGE8_BC_RUN_AUTHORIZATION',
      'STAGE8_BC_PREDECESSOR_EVIDENCE','STAGE8_ARTIFACT_ROOT','STAGE8_PYTHON','STAGE8_BC_CORPUS_RUN_DIRECTORY',
      'STAGE8_BC_SUPERVISION_CONTROL_MANIFEST','STAGE8_BC_SUPERVISION_DIRECTORY','STAGE8_BC_SUPERVISED_WORKER_SCRIPT',
    ].includes(key)));
    Object.assign(childEnvironment, {
      STAGE8_BC_SUPERVISION_NONCE: launchNonce,
      STAGE8_BC_LAUNCHER_PID: String(process.pid),
    });
    const child = (options.spawnSupervisor ?? spawn)(process.execPath, [supervisorScript, '--host'], {
      cwd: root, env: childEnvironment, shell: false, windowsHide: true, detached: true,
      stdio: ['ignore',stdout,stderr],
    });
    fs.closeSync(stdout); fs.closeSync(stderr);
    if (!child.pid) throw new Error('bc-supervision-supervisor-start-failed');
    const initialPath = path.join(supervisionDirectory, 'status-000000.json');
    const deadline = Date.now() + (options.startupTimeoutMs ?? 10_000);
    while (!fs.existsSync(initialPath) && Date.now() < deadline) sleep(25);
    if (!fs.existsSync(initialPath)) throw new Error('bc-supervision-startup-handshake-timeout');
    const initial = JSON.parse(fs.readFileSync(initialPath, 'utf8'));
    const checked = supervisionTools.validateStage8BcSupervisionStatus({ status: initial, control: values.supervision });
    if (!checked.ok || initial.supervisorPid !== child.pid || initial.launchNonce !== launchNonce) {
      throw new Error(checked.ok ? 'bc-supervision-startup-identity-mismatch' : checked.reason);
    }
    child.unref();
    return { ok: true, status: 'launched', runId, supervisorPid: child.pid, launchNonce,
      supervisionDirectory, filesWritten: fs.readdirSync(supervisionDirectory).length,
      pilotGamesExecuted: 0, automaticRetries: 0 };
  } catch (error) {
    if (supervisionDirectory && fs.existsSync(supervisionDirectory)
      && fs.readdirSync(supervisionDirectory).length === 0) fs.rmdirSync(supervisionDirectory);
    const filesWritten = supervisionDirectory && fs.existsSync(supervisionDirectory)
      ? fs.readdirSync(supervisionDirectory).length : 0;
    return { ok: false, status: 'fused', reason: error instanceof Error ? error.message : String(error),
      filesWritten, pilotGamesExecuted: 0, automaticRetries: 0 };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== '--launch') {
    console.error('bc-supervision-launch-mode-required'); process.exitCode = 1;
  } else {
    const result = await launchStage8BcSupervised();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
}
