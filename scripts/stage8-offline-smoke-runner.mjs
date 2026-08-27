import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);

function requiredAbsoluteFile(environmentName, environment) {
  const candidate = environment[environmentName];
  if (!candidate) throw new Error(`${environmentName} is required`);
  if (!path.win32.isAbsolute(candidate)) throw new Error(`${environmentName} must be absolute`);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) throw new Error(`${environmentName} must reference an existing file`);
  return candidate;
}

function requiredAbsoluteDirectory(environmentName, environment) {
  const candidate = environment[environmentName];
  if (!candidate) throw new Error(`${environmentName} is required`);
  if (!path.win32.isAbsolute(candidate)) throw new Error(`${environmentName} must be absolute`);
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) throw new Error(`${environmentName} must reference an existing directory`);
  return candidate;
}

function readJson(candidate) {
  return JSON.parse(fs.readFileSync(candidate, 'utf8'));
}

function loadTypeScriptModuleReadOnly(entryPath) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText;
    module._compile(compiled, filename);
  };
  try {
    return require(entryPath);
  } finally {
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
      const compiled = ts.transpileModule(fs.readFileSync(from, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: from,
      }).outputText;
      fs.writeFileSync(to, compiled);
    }
  }
}

function atomicWriter(runDirectory) {
  return {
    writeImmutable(relativeName, content) {
      const target = path.join(runDirectory, relativeName);
      const temporary = `${target}.tmp-${process.pid}`;
      try {
        fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
        if (fs.existsSync(target)) throw new Error(`immutable target already exists: ${target}`);
        fs.renameSync(temporary, target);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    },
  };
}

export async function runStage8OfflineSmokeCli(options = {}) {
  const environment = options.environment ?? process.env;
  const createTemporaryDirectory = options.createTemporaryDirectory
    ?? (() => fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-formal-smoke-runtime-')));
  const compileRuntimeTree = options.compileRuntimeTree ?? compileTree;
  const createArtifactWriter = options.createArtifactWriter ?? atomicWriter;
  let temp = null;
  let modelInference = null;
  try {
    const controlPath = requiredAbsoluteFile('STAGE8_SMOKE_CONTROL_MANIFEST', environment);
    const runtimePath = requiredAbsoluteFile('STAGE8_SMOKE_RUNTIME_MANIFEST', environment);
    const artifactRoot = requiredAbsoluteDirectory('STAGE8_ARTIFACT_ROOT', environment);
    const control = readJson(controlPath);
    const runtime = readJson(runtimePath);
    const fileSystem = options.runtimeFileSystem ?? {
      exists: fs.existsSync,
      isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
      isFile: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
      readFile: (candidate) => fs.readFileSync(candidate),
      listDirectory: (candidate) => fs.readdirSync(candidate),
    };
    const artifactRootModule = loadTypeScriptModuleReadOnly(
      path.join(root, 'src/game/stage8/artifact-root-preflight.ts'),
    );
    const gitFile = path.join(root, '.git');
    const gitFileContent = fs.existsSync(gitFile) && fs.statSync(gitFile).isFile()
      ? fs.readFileSync(gitFile, 'utf8')
      : undefined;
    const artifactRootInput = {
      environment: { STAGE8_ARTIFACT_ROOT: artifactRoot },
      projectRoots: artifactRootModule.deriveStage8ForbiddenProjectRoots({ currentRoot: root, gitFileContent }),
      exists: fileSystem.exists,
      isDirectory: fileSystem.isDirectory,
      resolvePath: options.resolveArtifactPath ?? fs.realpathSync.native,
    };

    // Load and execute the existing complete preflight through an in-memory
    // TypeScript hook. No temp tree, compiled file, or writer exists yet.
    const preflightModule = loadTypeScriptModuleReadOnly(
      path.join(root, 'src/game/stage8/offline-smoke-runtime-preflight.ts'),
    );
    const preflight = preflightModule.preflightStage8FormalSmokeRuntime({
      control,
      runtime,
      artifactRoot: artifactRootInput,
      fileSystem,
    });
    if (!preflight.ok) return {
      ok: false,
      status: 'fused',
      reason: preflight.decision.reason,
      isolationId: preflight.decision.isolationId,
      artifactsWritten: 0,
    };

    const createModelInferencePort = options.createModelInferencePort ?? (async ({ identity, onnxBytes }) => {
      const adapterModule = loadTypeScriptModuleReadOnly(
        path.join(root, 'src/game/stage8/offline-onnx-inference-adapter.ts'),
      );
      return adapterModule.createStage8OnnxInferencePort({ identity, onnxBytes });
    });
    try {
      modelInference = await createModelInferencePort(Object.freeze({
        identity: structuredClone(preflight.value.modelIdentity),
        modelBytes: Uint8Array.from(Buffer.from(preflight.value.verifiedModelPackageBytes.modelBase64, 'base64')),
        onnxBytes: Uint8Array.from(Buffer.from(preflight.value.verifiedModelPackageBytes.onnxBase64, 'base64')),
        manifestBytes: Uint8Array.from(Buffer.from(preflight.value.verifiedModelPackageBytes.manifestBase64, 'base64')),
      }));
    } catch {
      return {
        ok: false,
        status: 'fused',
        reason: 'formal-smoke-model-inference-port-initialization-failed',
        isolationId: `${control.identity.runId}-isolation`,
        artifactsWritten: 0,
      };
    }
    if (typeof modelInference !== 'function') return {
      ok: false,
      status: 'fused',
      reason: 'formal-smoke-model-inference-port-invalid',
      isolationId: `${control.identity.runId}-isolation`,
      artifactsWritten: 0,
    };

    temp = createTemporaryDirectory();
    compileRuntimeTree(path.join(root, 'src/game'), path.join(temp, 'game'));
    const runner = require(path.join(temp, 'game/stage8/offline-smoke-runner.js'));
    const providerModule = require(path.join(temp, 'game/stage8/offline-canonical-mcts-provider.js'));
    const provider = providerModule.createStage8CanonicalMctsProvider({
      providerIdentitySha256: control.identity.mctsProviderSha256,
      behaviorTemperature: runtime.behaviorTemperature,
      modelPolicyWeight: runtime.modelPolicyWeight,
      modelIdentity: preflight.value.modelIdentity,
      modelInference,
    });
    return await runner.runStage8FormalSmoke({
      control,
      runtime,
      artifactRoot: artifactRootInput,
      fileSystem,
      rawDistributionProvider: provider,
      writer: createArtifactWriter(runtime.runDirectory),
    });
  } catch (error) {
    return {
      ok: false,
      status: 'fused',
      reason: error instanceof Error ? error.message : String(error),
      isolationId: 'formal-smoke-cli-isolation',
      artifactsWritten: 0,
    };
  } finally {
    if (modelInference && typeof modelInference.release === 'function') {
      try { await modelInference.release(); } catch { /* Release is best-effort after the run has already fused or completed. */ }
    }
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runStage8OfflineSmokeCli();
  console.log(JSON.stringify(result.ok
    ? { ok: true, status: result.status, completedGames: result.ledger.completedGames, ledgerSha256: result.ledger.ledgerSha256, artifactsWritten: result.artifactsWritten }
    : result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
