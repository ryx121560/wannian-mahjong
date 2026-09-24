import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);

function requiredAbsoluteFile(name, environment) {
  const candidate = environment[name];
  if (!candidate || !path.win32.isAbsolute(candidate)) throw new Error(`${name} must be an absolute existing file`);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) throw new Error(`${name} must be an absolute existing file`);
  return candidate;
}

function requiredAbsoluteDirectory(name, environment) {
  const candidate = environment[name];
  if (!candidate || !path.win32.isAbsolute(candidate)) throw new Error(`${name} must be an absolute existing directory`);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) throw new Error(`${name} must be an absolute existing directory`);
  return candidate;
}

function loadTypeScriptModuleReadOnly(entryPath) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    }).outputText, filename);
  };
  try { return require(entryPath); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

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

function isStrictChild(candidate, parent) {
  const normalizedCandidate = path.win32.normalize(candidate).replace(/[\\/]+$/, '').toLowerCase();
  const normalizedParent = path.win32.normalize(parent).replace(/[\\/]+$/, '').toLowerCase();
  return normalizedCandidate !== normalizedParent && normalizedCandidate.startsWith(`${normalizedParent}\\`);
}

function fileSystemPort() {
  return {
    exists: fs.existsSync,
    isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
    listDirectory: fs.readdirSync,
    resolvePath: fs.realpathSync.native,
    writeFileExclusive: (candidate, bytes) => fs.writeFileSync(candidate, bytes, { flag: 'wx' }),
    readFile: (candidate) => fs.readFileSync(candidate),
    renameAtomic: fs.renameSync,
    removeFile: fs.unlinkSync,
  };
}

function capacityPreflight(rootPath, identitySha256, input) {
  const stats = fs.statfsSync(rootPath);
  const availableBytes = Number(stats.bavail) * Number(stats.bsize);
  return { ...input, ok: Number.isFinite(availableBytes) && availableBytes >= input.requestedBytes, availableBytes, identitySha256 };
}

function createColdModulePort(modulePath, exportName) {
  const evict = (moduleId, visited = new Set()) => {
    if (visited.has(moduleId)) return;
    visited.add(moduleId);
    const cached = require.cache[moduleId];
    if (!cached) return;
    for (const child of cached.children) evict(child.id, visited);
    delete require.cache[moduleId];
  };
  return (input) => {
    evict(require.resolve(modulePath));
    return require(modulePath)[exportName](input);
  };
}

export async function runStage8BcSampleProbeCli(options = {}) {
  const environment = options.environment ?? process.env;
  const counters = { temporaryDirectories: 0, artifactDirectories: 0, batchCommits: 0, finalCommits: 0 };
  let temp = null;
  let stagingRunDirectory = null;
  try {
    const controlPath = requiredAbsoluteFile('STAGE8_BC_PROBE_CONTROL_MANIFEST', environment);
    const artifactRoot = requiredAbsoluteDirectory('STAGE8_ARTIFACT_ROOT', environment);
    const pythonPath = requiredAbsoluteFile('STAGE8_PYTHON', environment);
    const finalRunDirectory = environment.STAGE8_BC_PROBE_RUN_DIRECTORY;
    if (!finalRunDirectory || !path.win32.isAbsolute(finalRunDirectory) || !isStrictChild(finalRunDirectory, artifactRoot)) {
      throw new Error('STAGE8_BC_PROBE_RUN_DIRECTORY must be a new strict child of STAGE8_ARTIFACT_ROOT');
    }
    if (fs.existsSync(finalRunDirectory)) throw new Error('STAGE8_BC_PROBE_RUN_DIRECTORY must not already exist');
    const control = JSON.parse(fs.readFileSync(controlPath, 'utf8'));
    const controlModule = loadTypeScriptModuleReadOnly(path.join(root, 'src/game/stage8/offline-bc-sample-probe-control.ts'));
    const controlValidation = controlModule.validateStage8BcSampleProbeControl(control);
    if (!controlValidation.ok) return { ok: false, status: 'fused', reason: controlValidation.decision.reason, isolationId: controlValidation.decision.isolationId, artifactsWritten: 0, counters };
    const artifactRootModule = loadTypeScriptModuleReadOnly(path.join(root, 'src/game/stage8/artifact-root-preflight.ts'));
    const gitFile = path.join(root, '.git');
    const artifactRootInput = {
      environment: { STAGE8_ARTIFACT_ROOT: artifactRoot },
      projectRoots: artifactRootModule.deriveStage8ForbiddenProjectRoots({
        currentRoot: root,
        gitFileContent: fs.existsSync(gitFile) && fs.statSync(gitFile).isFile() ? fs.readFileSync(gitFile, 'utf8') : undefined,
      }),
      exists: fs.existsSync,
      isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
      resolvePath: options.resolveArtifactPath ?? fs.realpathSync.native,
    };
    const rootValidation = artifactRootModule.preflightStage8ArtifactRoot(artifactRootInput);
    if (!rootValidation.ok) return { ok: false, status: 'fused', reason: rootValidation.reason, isolationId: `${control.identity.runId}-isolation`, artifactsWritten: 0, counters };
    const preliminaryCapacity = (options.capacityPreflight ?? capacityPreflight)(artifactRoot, control.identity.capacityPreflightSha256, {
      stage: 'before-run', batchIndex: null, requestedBytes: control.capacity.maxRunBytes,
    });
    if (!preliminaryCapacity.ok || preliminaryCapacity.identitySha256 !== control.identity.capacityPreflightSha256
      || preliminaryCapacity.availableBytes < preliminaryCapacity.requestedBytes) {
      return { ok: false, status: 'fused', reason: 'bc-probe-cli-capacity-before-temp-invalid', isolationId: `${control.identity.runId}-isolation`, artifactsWritten: 0, counters };
    }

    temp = (options.createTemporaryDirectory ?? (() => fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-probe-runtime-'))))();
    counters.temporaryDirectories += 1;
    (options.compileRuntimeTree ?? compileTree)(path.join(root, 'src/game'), path.join(temp, 'game'));
    const runner = require(path.join(temp, 'game/stage8/offline-bc-sample-probe-runner.js'));
    const writer = require(path.join(temp, 'game/stage8/offline-bc-sample-writer.js'));
    const teacherEvaluator = createColdModulePort(
      path.join(temp, 'game/stage8/offline-bc-teacher.js'),
      'evaluateStage8BcTeacher',
    );
    const sampleValidator = createColdModulePort(
      path.join(temp, 'game/stage8/offline-bc-sample-protocol.js'),
      'validateStage8BcSampleEnvelope',
    );
    const stagingSuffix = `.partial-${control.identity.runId}`;
    stagingRunDirectory = `${finalRunDirectory}${stagingSuffix}`;
    const artifactFiles = [];
    const fsPort = fileSystemPort();
    const ensureStaging = () => {
      if (fs.existsSync(stagingRunDirectory)) throw new Error('bc-probe-staging-run-already-exists');
      fs.mkdirSync(stagingRunDirectory);
      counters.artifactDirectories += 1;
      for (let index = 0; index < 4; index += 1) fs.mkdirSync(path.join(stagingRunDirectory, `${control.identity.runId}-batch-${String(index + 1).padStart(6, '0')}`));
    };
    let stagingCreated = false;
    const transaction = runner.executeStage8BcSampleProbeTransaction({
      control,
      teacherEvaluator,
      port: {
        capacityPreflight: (request) => (options.capacityPreflight ?? capacityPreflight)(artifactRoot, control.identity.capacityPreflightSha256, request),
        commitBatch: ({ batchIndex, game }) => {
          if (!stagingCreated) { ensureStaging(); stagingCreated = true; }
          const batchDirectory = path.join(stagingRunDirectory, `${control.identity.runId}-batch-${String(batchIndex + 1).padStart(6, '0')}`);
          const committed = writer.writeStage8BcSampleShard({
            manifest: control.artifactControl, artifactRoot: artifactRootInput, batchDirectory,
            shardId: 'shard-000001', samples: game.samples, fileSystem: fsPort, sampleValidator,
          });
          if (!committed.ok) return { ok: false, reason: committed.decision.reason };
          artifactFiles.push(committed.value.artifactPath);
          counters.batchCommits += 1;
          return { ok: true, artifactSha256: committed.value.artifactFileSha256 };
        },
        commitRun: ({ semanticSha256, artifactSha256List }) => {
          const verifyPython = options.verifyPython ?? ((files) => spawnSync(pythonPath, [path.join(root, 'scripts/stage8-bc-sample-probe-verify.py'), ...files], { encoding: 'utf8', windowsHide: true }));
          const verified = verifyPython(artifactFiles);
          if (verified.status !== 0) return { ok: false, reason: 'bc-probe-python-readback-failed' };
          const parsed = JSON.parse(verified.stdout);
          if (!parsed.ok || parsed.torchImported !== false || parsed.shards.length !== 4) return { ok: false, reason: 'bc-probe-python-readback-invalid' };
          const ledgerPath = path.join(stagingRunDirectory, 'probe-ledger.json');
          fs.writeFileSync(ledgerPath, `${JSON.stringify({
            protocolVersion: runner.STAGE8_BC_SAMPLE_PROBE_RUNNER_VERSION,
            runId: control.identity.runId, semanticSha256, artifactSha256List, pythonReadback: parsed,
            formalSmokeGamesExecuted: 0, trainingStarted: false, modelLoaded: false,
          })}\n`, { encoding: 'utf8', flag: 'wx' });
          fs.renameSync(stagingRunDirectory, finalRunDirectory);
          stagingRunDirectory = null;
          counters.finalCommits += 1;
          return { ok: true };
        },
        quarantineRun: (reason) => {
          if (!stagingRunDirectory || !fs.existsSync(stagingRunDirectory)) return;
          fs.writeFileSync(path.join(stagingRunDirectory, 'QUARANTINED.txt'), reason, { encoding: 'utf8', flag: 'wx' });
          fs.renameSync(stagingRunDirectory, `${stagingRunDirectory}.quarantine`);
          stagingRunDirectory = null;
        },
      },
    });
    return { ...transaction, counters };
  } catch (error) {
    return { ok: false, status: 'fused', reason: error instanceof Error ? error.message : String(error), isolationId: 'bc-probe-cli-isolation', artifactsWritten: 0, counters };
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runStage8BcSampleProbeCli();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
