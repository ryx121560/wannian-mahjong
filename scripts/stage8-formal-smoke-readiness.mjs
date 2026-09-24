import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire('node:module');
const ZERO_EFFECTS = Object.freeze({
  temporaryDirectoriesCreated: 0,
  writersCreated: 0,
  artifactsWritten: 0,
  formalSmokeGamesExecuted: 0,
  samplesGenerated: 0,
  selfplayStarted: false,
  trainingStarted: false,
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalize(candidate) {
  return path.win32.normalize(candidate).replace(/[\\/]+$/, '').toLowerCase();
}

function isSameOrChild(candidate, root) {
  const normalizedCandidate = normalize(candidate);
  const normalizedRoot = normalize(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
}

function loadTypeScriptModule(filename) {
  const ts = nodeRequire('typescript');
  const extensions = Module._extensions;
  const previous = extensions['.ts'];
  extensions['.ts'] = (module, sourcePath) => {
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: sourcePath,
    }).outputText;
    module._compile(output, sourcePath);
  };
  try {
    delete nodeRequire.cache[nodeRequire.resolve(filename)];
    return nodeRequire(filename);
  } finally {
    if (previous) extensions['.ts'] = previous;
    else delete extensions['.ts'];
  }
}

function loadStage8Modules(root) {
  const stage8Root = path.join(root, 'src', 'game', 'stage8');
  return {
    artifact: loadTypeScriptModule(path.join(stage8Root, 'artifact-root-preflight.ts')),
    preflight: loadTypeScriptModule(path.join(stage8Root, 'offline-smoke-runtime-preflight.ts')),
    tensor: loadTypeScriptModule(path.join(stage8Root, 'offline-onnx-tensor-contract.ts')),
  };
}

function fail(runId, reason) {
  const identity = typeof runId === 'string' && runId ? runId : 'invalid-smoke-run';
  return {
    ok: false,
    status: 'fused',
    reason,
    isolationId: `${identity}-readiness-isolation`,
    effects: ZERO_EFFECTS,
  };
}

function safeJson(bytes) {
  try {
    const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function defaultFileSystem() {
  return {
    exists: fs.existsSync,
    isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
    isFile: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    readFile: (candidate) => fs.readFileSync(candidate),
    listDirectory: (candidate) => fs.readdirSync(candidate),
    realPath: (candidate) => fs.realpathSync.native(candidate),
  };
}

function defaultCapacitySnapshot(runDirectory) {
  const volume = fs.statfsSync(runDirectory);
  const totalBytes = Number(BigInt(volume.bsize) * BigInt(volume.blocks));
  const freeBytes = Number(BigInt(volume.bsize) * BigInt(volume.bavail));
  if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(freeBytes)) {
    throw new Error('formal-smoke-capacity-evidence-invalid');
  }
  return { totalBytes, freeBytes, runBytes: 0 };
}

export function inspectStage8OnnxRuntimeDependency(root, expected) {
  const packagePath = path.join(root, 'node_modules', expected.packageName, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  if (!fs.existsSync(packagePath) || !fs.existsSync(lockPath)) throw new Error('formal-smoke-onnx-runtime-dependency-missing');
  const packageBytes = fs.readFileSync(packagePath);
  const lockBytes = fs.readFileSync(lockPath);
  const packageJson = safeJson(packageBytes);
  const packageLock = safeJson(lockBytes);
  const lockEntry = packageLock?.packages?.[`node_modules/${expected.packageName}`];
  if (packageJson?.name !== expected.packageName || packageJson?.version !== expected.version) throw new Error('formal-smoke-onnx-runtime-dependency-version-mismatch');
  if (lockEntry?.version !== expected.version || typeof lockEntry?.integrity !== 'string' || !lockEntry.integrity.startsWith('sha512-')) throw new Error('formal-smoke-onnx-runtime-lock-identity-invalid');
  const payload = {
    packageName: packageJson.name,
    version: packageJson.version,
    executionProvider: expected.executionProvider,
    packageJsonSha256: sha256(packageBytes),
    lockEntrySha256: sha256(Buffer.from(JSON.stringify(lockEntry))),
    lockIntegrity: lockEntry.integrity,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
  return Object.freeze({ ...payload, identitySha256: sha256(Buffer.from(JSON.stringify(payload))) });
}

function validDependencyIdentity(value, expected) {
  if (!value || value.packageName !== expected.packageName || value.version !== expected.version
    || value.executionProvider !== expected.executionProvider || !/^sha512-/.test(value.lockIntegrity || '')) return false;
  const { identitySha256, ...payload } = value;
  return /^[a-f0-9]{64}$/i.test(value.packageJsonSha256 || '')
    && /^[a-f0-9]{64}$/i.test(value.lockEntrySha256 || '')
    && identitySha256 === sha256(Buffer.from(JSON.stringify(payload)));
}

function readGitFile(root) {
  try {
    const candidate = path.join(root, '.git');
    return fs.statSync(candidate).isFile() ? fs.readFileSync(candidate, 'utf8') : undefined;
  } catch {
    return undefined;
  }
}

export async function runStage8FormalSmokeReadiness(options = {}) {
  const environment = options.environment ?? process.env;
  const root = path.resolve(options.currentRoot ?? process.cwd());
  const fileSystem = options.fileSystem ?? defaultFileSystem();
  const controlPath = environment.STAGE8_SMOKE_CONTROL_MANIFEST;
  const runtimePath = environment.STAGE8_SMOKE_RUNTIME_MANIFEST;
  const artifactRoot = environment.STAGE8_ARTIFACT_ROOT;
  if (![controlPath, runtimePath, artifactRoot].every((value) => typeof value === 'string' && path.win32.isAbsolute(value))) {
    return fail(undefined, 'formal-smoke-readiness-explicit-inputs-required');
  }
  let modules;
  try {
    modules = options.modules ?? loadStage8Modules(root);
  } catch {
    return fail(undefined, 'formal-smoke-readiness-module-load-failed');
  }
  let roots;
  try {
    roots = options.projectRoots ?? modules.artifact.deriveStage8ForbiddenProjectRoots({
      currentRoot: root,
      gitFileContent: readGitFile(root),
    });
  } catch {
    return fail(undefined, 'formal-smoke-readiness-project-roots-invalid');
  }
  if (roots.some((projectRoot) => [artifactRoot, controlPath, runtimePath].some((candidate) => isSameOrChild(candidate, projectRoot)))) {
    return fail(undefined, 'formal-smoke-readiness-project-tree-forbidden');
  }
  if (!isSameOrChild(controlPath, artifactRoot) || !isSameOrChild(runtimePath, artifactRoot)) {
    return fail(undefined, 'formal-smoke-readiness-manifest-outside-artifact-root');
  }
  let control;
  let runtime;
  try {
    if (fileSystem.realPath && [artifactRoot, controlPath, runtimePath].some((candidate) => normalize(fileSystem.realPath(candidate)) !== normalize(candidate))) {
      return fail(undefined, 'formal-smoke-readiness-path-alias-forbidden');
    }
    if (!fileSystem.exists(controlPath) || !fileSystem.isFile(controlPath)
      || !fileSystem.exists(runtimePath) || !fileSystem.isFile(runtimePath)) return fail(undefined, 'formal-smoke-readiness-manifest-missing');
    control = safeJson(fileSystem.readFile(controlPath));
    runtime = safeJson(fileSystem.readFile(runtimePath));
  } catch {
    return fail(undefined, 'formal-smoke-readiness-manifest-read-failed');
  }
  const runId = control?.identity?.runId;
  if (!control || !runtime) return fail(runId, 'formal-smoke-readiness-manifest-invalid');
  try {
    const assets = [runtime.runDirectory, runtime.modelFilePath, runtime.onnxFilePath, runtime.modelManifestPath];
    if (fileSystem.realPath && assets.some((candidate) => typeof candidate !== 'string'
      || normalize(fileSystem.realPath(candidate)) !== normalize(candidate))) return fail(runId, 'formal-smoke-readiness-path-alias-forbidden');
  } catch {
    return fail(runId, 'formal-smoke-readiness-asset-path-invalid');
  }
  const artifactInput = {
    environment: { STAGE8_ARTIFACT_ROOT: artifactRoot },
    projectRoots: roots,
    exists: fileSystem.exists,
    isDirectory: fileSystem.isDirectory,
    resolvePath: fileSystem.realPath,
  };
  let runtimePreflight;
  try {
    runtimePreflight = modules.preflight.preflightStage8FormalSmokeRuntime({
      control, runtime, artifactRoot: artifactInput, fileSystem,
    });
  } catch {
    return fail(runId, 'formal-smoke-readiness-manifest-contract-invalid');
  }
  if (!runtimePreflight.ok) return fail(runId, runtimePreflight.decision.reason);
  const expectedDependency = Object.freeze({
    packageName: modules.tensor.STAGE8_ONNX_RUNTIME_PACKAGE,
    version: modules.tensor.STAGE8_ONNX_RUNTIME_VERSION,
    executionProvider: modules.tensor.STAGE8_ONNX_EXECUTION_PROVIDER,
  });
  let dependencyIdentity;
  try {
    dependencyIdentity = await (options.inspectDependency ?? inspectStage8OnnxRuntimeDependency)(root, expectedDependency);
  } catch (error) {
    return fail(runId, error instanceof Error && error.message.startsWith('formal-smoke-') ? error.message : 'formal-smoke-onnx-runtime-dependency-inspection-failed');
  }
  if (!validDependencyIdentity(dependencyIdentity, expectedDependency)) return fail(runId, 'formal-smoke-onnx-runtime-dependency-identity-invalid');
  let capacitySnapshot;
  try {
    capacitySnapshot = await (options.inspectCapacity ?? defaultCapacitySnapshot)(runtimePreflight.value.runDirectory);
  } catch {
    return fail(runId, 'formal-smoke-capacity-inspection-failed');
  }
  const capacityError = modules.preflight.validateStage8FormalSmokeCapacity({
    snapshot: capacitySnapshot,
    pendingBytes: 0,
    ...modules.preflight.STAGE8_FORMAL_SMOKE_CAPACITY_LIMITS,
  });
  if (capacityError) return fail(runId, capacityError);
  let inferencePort;
  try {
    const createPort = options.createModelInferencePort ?? (async (input) => {
      const adapter = loadTypeScriptModule(path.join(root, 'src', 'game', 'stage8', 'offline-onnx-inference-adapter.ts'));
      const ort = nodeRequire('onnxruntime-node');
      let session;
      try {
        return await adapter.createStage8OnnxInferencePort({ ...input, runtime: {
          async createSession(bytes, sessionOptions) {
            session = await ort.InferenceSession.create(Uint8Array.from(bytes).buffer, {
              ...sessionOptions, executionProviders: sessionOptions.executionProviders.slice(),
            });
            return session;
          },
          createFloat32Tensor: (data, dimensions) => new ort.Tensor('float32', data, dimensions),
        } });
      } catch (error) {
        if (session) await session.release();
        throw error;
      }
    });
    inferencePort = await createPort({
      identity: runtimePreflight.value.modelIdentity,
      onnxBytes: Buffer.from(runtimePreflight.value.verifiedModelPackageBytes.onnxBase64, 'base64'),
    });
    if (!inferencePort || typeof inferencePort.release !== 'function') throw new Error('invalid-port');
    await inferencePort.release();
  } catch {
    try { await inferencePort?.release?.(); } catch { /* Fail closed below. */ }
    return fail(runId, 'formal-smoke-cpu-onnx-session-preflight-failed');
  }
  const readinessPayload = {
    protocolVersion: 'stage8-formal-smoke-readiness-v1',
    runId,
    approvalId: control.authorization.approvalId,
    artifactRoot: runtimePreflight.value.artifactRoot,
    runDirectory: runtimePreflight.value.runDirectory,
    controlManifestSha256: control.manifestSha256,
    runtimeManifestSha256: runtime.manifestSha256,
    runtimeIdentitySha256: runtimePreflight.value.runtimeIdentitySha256,
    modelIdentitySha256: sha256(Buffer.from(JSON.stringify(runtimePreflight.value.modelIdentity))),
    dependencyIdentitySha256: dependencyIdentity.identitySha256,
    capacitySnapshot,
    orchestration: {
      baseSeed: runtime.baseSeed,
      batchSize: runtime.batchSize,
      workers: runtime.workers,
      behaviorTemperature: runtime.behaviorTemperature,
      modelPolicyWeight: runtime.modelPolicyWeight,
    },
  };
  return {
    ok: true,
    status: 'ready',
    value: Object.freeze({
      ...readinessPayload,
      readinessIdentitySha256: sha256(Buffer.from(JSON.stringify(readinessPayload))),
      dependencyIdentity,
    }),
    effects: ZERO_EFFECTS,
  };
}

async function main() {
  const result = await runStage8FormalSmokeReadiness();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
