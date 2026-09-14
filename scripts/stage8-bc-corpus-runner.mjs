import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { verifyStage8BcOperationalInterruptionQuarantine } from './stage8-bc-operational-interruption-evidence.mjs';

const root = process.cwd();
const require = createRequire(import.meta.url);

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

function normalize(value) {
  return path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function isStrictChild(value, parent) {
  return normalize(value) !== normalize(parent) && normalize(value).startsWith(`${normalize(parent)}\\`);
}

function loadTypeScriptModuleReadOnly(entryPath) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText, filename);
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

function fileSystemPort() {
  return {
    exists: fs.existsSync,
    isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
    listDirectory: fs.readdirSync,
    resolvePath: fs.realpathSync.native,
    writeFileExclusive: (candidate, bytes) => fs.writeFileSync(candidate, bytes, { flag: 'wx' }),
    readFile: fs.readFileSync,
    renameAtomic: fs.renameSync,
    removeFile: fs.unlinkSync,
  };
}

function directoryBytes(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('bc-corpus-reparse-entry-forbidden');
    if (entry.isDirectory()) total += directoryBytes(candidate);
    else if (entry.isFile()) total += fs.statSync(candidate).size;
  }
  return total;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inspectGitCheckout(checkoutRoot) {
  const run = (args) => spawnSync('git', ['-c', `safe.directory=${checkoutRoot.replace(/\\/g, '/')}`, ...args], {
    cwd: checkoutRoot, encoding: 'utf8', windowsHide: true,
  });
  const head = run(['rev-parse', 'HEAD']);
  const status = run(['status', '--porcelain=v1', '--untracked-files=all']);
  if (head.status !== 0 || status.status !== 0) throw new Error('bc-corpus-git-inspection-failed');
  return { sourceCommit: head.stdout.trim().toLowerCase(), clean: status.stdout.trim() === '' };
}

function defaultCapacity(rootPath, runPath, identitySha256, request) {
  const volume = fs.statfsSync(rootPath);
  return {
    ...request,
    ok: true,
    totalBytes: Number(volume.blocks) * Number(volume.bsize),
    freeBytes: Number(volume.bavail) * Number(volume.bsize),
    rootBytes: directoryBytes(rootPath),
    runBytes: fs.existsSync(runPath) ? directoryBytes(runPath) : 0,
    identitySha256,
  };
}

function fused(reason, runId, counters) {
  return {
    ok: false, status: 'fused', reason, isolationId: `${runId || 'invalid-formal-bc-corpus-run'}-isolation`,
    artifactsWritten: 0, pilotGamesExecuted: 0, trainingStarted: false, counters,
  };
}

export async function runStage8BcCorpusCli(options = {}) {
  const environment = options.environment ?? process.env;
  const counters = { temporaryDirectories: 0, stagingDirectories: 0, shardCommits: 0, finalCommits: 0, pythonVerifications: 0 };
  let temporaryDirectory = null;
  let stagingDirectory = null;
  let runId = 'invalid-formal-bc-corpus-run';
  try {
    const corpusControlPath = requiredFile('STAGE8_BC_CORPUS_CONTROL_MANIFEST', environment);
    const artifactControlPath = requiredFile('STAGE8_BC_ARTIFACT_CONTROL_MANIFEST', environment);
    const authorizationPath = requiredFile('STAGE8_BC_RUN_AUTHORIZATION', environment);
    const predecessorEvidencePath = requiredFile('STAGE8_BC_PREDECESSOR_EVIDENCE', environment);
    const pythonPath = requiredFile('STAGE8_PYTHON', environment);
    const artifactRoot = requiredDirectory('STAGE8_ARTIFACT_ROOT', environment);
    const finalRunDirectory = environment.STAGE8_BC_CORPUS_RUN_DIRECTORY;
    const corpusControl = JSON.parse(fs.readFileSync(corpusControlPath, 'utf8'));
    const artifactControl = JSON.parse(fs.readFileSync(artifactControlPath, 'utf8'));
    const authorization = JSON.parse(fs.readFileSync(authorizationPath, 'utf8'));
    const predecessorEvidence = JSON.parse(fs.readFileSync(predecessorEvidencePath, 'utf8'));
    runId = corpusControl?.identity?.runId ?? runId;
    const controlTools = loadTypeScriptModuleReadOnly(path.join(root, 'src/game/stage8/offline-bc-corpus-control.ts'));
    const artifactTools = loadTypeScriptModuleReadOnly(path.join(root, 'src/game/stage8/offline-bc-artifact-control.ts'));
    const rootTools = loadTypeScriptModuleReadOnly(path.join(root, 'src/game/stage8/artifact-root-preflight.ts'));
    const controlValidation = controlTools.validateStage8BcCorpusControlManifest(corpusControl);
    if (!controlValidation.ok) return fused(controlValidation.decision.reason, runId, counters);
    const artifactValidation = artifactTools.validateStage8BcArtifactControlManifest(artifactControl);
    if (!artifactValidation.ok) return fused(artifactValidation.decision.reason, runId, counters);
    if (!finalRunDirectory || !path.win32.isAbsolute(finalRunDirectory) || !isStrictChild(finalRunDirectory, artifactRoot)
      || path.win32.dirname(path.win32.normalize(finalRunDirectory)) !== path.win32.normalize(artifactRoot)
      || path.win32.basename(finalRunDirectory) !== runId || /(probe|diagnostic|rerun)/i.test(finalRunDirectory)
      || fs.existsSync(finalRunDirectory)) {
      return fused('bc-corpus-final-directory-invalid', runId, counters);
    }
    const gitFile = path.join(root, '.git');
    const artifactRootInput = {
      environment: { STAGE8_ARTIFACT_ROOT: artifactRoot },
      projectRoots: rootTools.deriveStage8ForbiddenProjectRoots({
        currentRoot: root,
        gitFileContent: fs.existsSync(gitFile) && fs.statSync(gitFile).isFile() ? fs.readFileSync(gitFile, 'utf8') : undefined,
      }),
      exists: fs.existsSync,
      isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
      resolvePath: options.resolveArtifactPath ?? fs.realpathSync.native,
    };
    const rootValidation = rootTools.preflightStage8ArtifactRoot(artifactRootInput);
    if (!rootValidation.ok) return fused(rootValidation.reason, runId, counters);
    if (artifactControl.manifestSha256 !== corpusControl.identity.artifactControlManifestSha256
      || artifactControl.bcControl.manifestSha256 !== corpusControl.identity.bcControlManifestSha256
      || artifactControl.identity.runId !== runId || artifactControl.bcControl.identity.runId !== runId) {
      return fused('bc-corpus-cli-control-cross-binding-invalid', runId, counters);
    }
    const runIdentityValidation = options.runIdentityVerifier
      ? options.runIdentityVerifier({ authorization, predecessorEvidence, artifactControl, corpusControl, root })
      : (() => {
        const checkout = (options.inspectCheckout ?? inspectGitCheckout)(root);
        if (!checkout.clean) return { ok: false, reason: 'bc-run-checkout-not-clean' };
        const identityTools = loadTypeScriptModuleReadOnly(path.join(root, 'src/game/stage8/offline-bc-run-identity.ts'));
        return identityTools.validateStage8BcRunIdentityMaterials({
          sourceCommit: checkout.sourceCommit,
          readFile: (relativePath) => fs.readFileSync(path.join(root, ...relativePath.split('/'))),
          authorization,
          predecessorEvidence,
          artifactControl,
          corpusControl,
        });
      })();
    if (!runIdentityValidation.ok) {
      return fused(runIdentityValidation.reason || 'bc-corpus-cli-run-identity-invalid', runId, counters);
    }
    const predecessorValidation = (options.predecessorVerifier ?? verifyStage8BcOperationalInterruptionQuarantine)({
      artifactRoot,
      evidence: predecessorEvidence,
    });
    if (!predecessorValidation.ok) {
      return fused(predecessorValidation.reason || 'bc-corpus-cli-predecessor-evidence-invalid', runId, counters);
    }
    stagingDirectory = `${finalRunDirectory}.partial`;
    if (fs.existsSync(stagingDirectory) || fs.existsSync(`${stagingDirectory}.quarantine`)) {
      return fused('bc-corpus-staging-directory-already-exists', runId, counters);
    }
    const capacity = options.capacityPreflight ?? defaultCapacity;
    const before = capacity(artifactRoot, stagingDirectory, corpusControl.identity.capacityPreflightSha256, {
      stage: 'before-run', gameIndex: null, pendingBytes: corpusControl.capacity.maxRunBytes,
    });
    const capacityValid = before?.ok === true && before.identitySha256 === corpusControl.identity.capacityPreflightSha256
      && before.pendingBytes === corpusControl.capacity.maxRunBytes && before.runBytes + before.pendingBytes <= corpusControl.capacity.maxRunBytes
      && before.rootBytes + before.pendingBytes <= corpusControl.capacity.rootHardLimitBytes
      && before.freeBytes >= before.pendingBytes
      && (before.totalBytes - before.freeBytes + before.pendingBytes) / before.totalBytes < corpusControl.capacity.rootFusePercent / 100;
    if (!capacityValid) return fused('bc-corpus-cli-capacity-before-write-invalid', runId, counters);

    temporaryDirectory = (options.createTemporaryDirectory ?? (() => fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-corpus-runtime-'))))();
    counters.temporaryDirectories += 1;
    (options.compileRuntimeTree ?? compileTree)(path.join(root, 'src/game'), path.join(temporaryDirectory, 'game'));
    const runtime = options.runnerModule ?? require(path.join(temporaryDirectory, 'game/stage8/offline-bc-corpus-runner.js'));
    const writer = options.writerModule ?? require(path.join(temporaryDirectory, 'game/stage8/offline-bc-sample-writer.js'));
    const teacherEvaluator = options.teacherEvaluator ?? createColdModulePort(
      path.join(temporaryDirectory, 'game/stage8/offline-bc-teacher.js'), 'evaluateStage8BcTeacher',
    );
    const sampleValidator = options.sampleValidator ?? createColdModulePort(
      path.join(temporaryDirectory, 'game/stage8/offline-bc-sample-protocol.js'), 'validateStage8BcSampleEnvelope',
    );
    const fsPort = fileSystemPort();
    const committedFiles = [];
    const ensureStaging = () => {
      if (!fs.existsSync(stagingDirectory)) {
        fs.mkdirSync(stagingDirectory);
        counters.stagingDirectories += 1;
      }
    };
    const transaction = runtime.executeStage8BcCorpusTransaction({
      corpusId: runId,
      control: corpusControl,
      artifactControl,
      teacherEvaluator,
      port: {
        capacityPreflight: (request) => capacity(
          artifactRoot, stagingDirectory, corpusControl.identity.capacityPreflightSha256, request,
        ),
        commitShard: ({ gameIndex, game, relativeDirectory, shardId }) => {
          ensureStaging();
          const serial = String(gameIndex + 1).padStart(6, '0');
          const batchDirectory = path.join(stagingDirectory, 'batches', `batch-${serial}`);
          fs.mkdirSync(batchDirectory, { recursive: true });
          const committed = writer.writeStage8BcSampleShard({
            manifest: artifactControl, artifactRoot: artifactRootInput, batchDirectory, shardId,
            samples: game.samples, fileSystem: fsPort, sampleValidator,
          });
          if (!committed.ok) return { ok: false, reason: committed.decision.reason };
          committedFiles.push(committed.value.artifactPath);
          counters.shardCommits += 1;
          return { ok: true, shard: {
            relativePath: `${relativeDirectory}/${path.basename(committed.value.artifactPath)}`,
            fileSha256: committed.value.artifactFileSha256,
            payloadSha256: committed.value.payloadSha256,
            sampleCount: committed.value.sampleCount,
            episodeCount: committed.value.episodeCount,
          } };
        },
        verifyPython: ({ manifest }) => {
          ensureStaging();
          const pendingManifest = path.join(stagingDirectory, 'corpus-manifest.pending.json');
          fs.writeFileSync(pendingManifest, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', flag: 'wx' });
          const verify = options.verifyPython ?? ((manifestPath) => spawnSync(
            pythonPath, [path.join(root, 'scripts/stage8-bc-corpus-verify.py'), '--verify-directory', manifestPath, artifactRoot, stagingDirectory],
            { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } },
          ));
          const result = verify(pendingManifest, committedFiles);
          counters.pythonVerifications += 1;
          if (result.status !== 0) return { ok: false, corpusManifestSha256: '', shardCount: 0, sampleCount: 0,
            splitCounts: { train: 0, validation: 0, finalTest: 0 }, fileSetSha256: '', torchImported: false };
          return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
        },
        commitRun: ({ manifest, ledger }) => {
          ensureStaging();
          const pendingManifest = path.join(stagingDirectory, 'corpus-manifest.pending.json');
          if (!fs.existsSync(pendingManifest)) return { ok: false, reason: 'bc-corpus-python-manifest-evidence-missing' };
          const pendingBytes = fs.readFileSync(pendingManifest);
          if (sha256(pendingBytes) !== sha256(Buffer.from(`${JSON.stringify(manifest)}\n`))) {
            return { ok: false, reason: 'bc-corpus-pending-manifest-changed' };
          }
          fs.writeFileSync(path.join(stagingDirectory, 'corpus-ledger.json'), `${JSON.stringify(ledger)}\n`, { encoding: 'utf8', flag: 'wx' });
          fs.renameSync(pendingManifest, path.join(stagingDirectory, 'corpus-manifest.json'));
          fs.renameSync(stagingDirectory, finalRunDirectory);
          stagingDirectory = null;
          counters.finalCommits += 1;
          return { ok: true };
        },
        quarantineRun: ({ reason, completedShardCount, ledgerSha256 }) => {
          if (!stagingDirectory || !fs.existsSync(stagingDirectory)) return;
          fs.writeFileSync(path.join(stagingDirectory, 'QUARANTINED.json'), `${JSON.stringify({
            status: 'quarantined', reason, completedShardCount, ledgerSha256, automaticRetries: 0, seedOverrides: 0,
          })}\n`, { encoding: 'utf8', flag: 'wx' });
          fs.renameSync(stagingDirectory, `${stagingDirectory}.quarantine`);
          stagingDirectory = null;
        },
      },
    });
    return { ...transaction, counters };
  } catch (error) {
    if (stagingDirectory && fs.existsSync(stagingDirectory)) {
      try {
        const quarantine = `${stagingDirectory}.quarantine`;
        if (!fs.existsSync(quarantine)) {
          fs.writeFileSync(path.join(stagingDirectory, 'QUARANTINED.json'), `${JSON.stringify({
            status: 'quarantined', reason: error instanceof Error ? error.message : String(error),
            completedShardCount: counters.shardCommits, automaticRetries: 0, seedOverrides: 0,
          })}\n`, { encoding: 'utf8', flag: 'wx' });
          fs.renameSync(stagingDirectory, quarantine);
          stagingDirectory = null;
        }
      } catch {
        return fused('bc-corpus-cli-unexpected-failure-quarantine-failed', runId, counters);
      }
    }
    return fused(error instanceof Error ? error.message : String(error), runId, counters);
  } finally {
    if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runStage8BcCorpusCli();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
