import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { buildStage8WindowsTaskRegisterApprovalCheck } from './stage8-windows-task-register-approval.mjs';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);

function loadTs(relativePath) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
  try { return require(relativePath); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const approvalTools = loadTs('../src/game/stage8/offline-windows-task-register-approval.ts');
const hostTools = loadTs('../src/game/stage8/offline-windows-task-host-control.ts');
const identityTools = loadTs('../src/game/stage8/offline-action-identity.ts');

export const STAGE8_WINDOWS_TASK_REGISTER_PUBLISHED_BINDINGS = Object.freeze({
  signerReleaseCommit: 'b42f95346652e3027ba3a17e1ce7c576308760b3',
  signerSourceBundleSha256: 'fba33f7ed8c447f6fa36fe214cf6416f3138792527d0a574b63764a4cc3c45e8',
  productDecisionSha256: 'a9a9436e56303d061758bc1260088f1070f775568707e505e497f9f5c4832aac',
  approvalId: 'stage8-windows-task-register-57177c6b7ca6b8097d2ee688bba2d26d9343bcfb',
  authorizationInputSha256: '1604b445246c020c49a963677109c7924be013f913327b16ada933028c24afe9',
  candidateAuthorizationSha256: '8200af1cc16cfa280c12bdf446591b3efd72e6fbaf879c3e6fac8964f41672b9',
  checkIdentitySha256: '96d82fdac038b2a1953066ce0c8d9558b8df656ed4f2bc2e22ef84ee229693f5',
  targetIdentitySha256: '79302b148793f8f65c334a62c49e6f908805d6b6fa23ac3c34261175f9a2c7e3',
});

function parseArgs(argv) {
  if (argv.length !== 4
    || !['--check', '--emit-and-verify'].includes(argv[0])
    || argv[1] !== '--signer-root'
    || argv[3] !== '--product-approved-register-only') {
    throw new Error('usage: node stage8-windows-task-register-authorization-orchestrator.mjs --check|--emit-and-verify --signer-root <clean-published-b42f953-root> --product-approved-register-only');
  }
  if (!path.win32.isAbsolute(argv[2])) throw new Error('windows-task-register-orchestrator-signer-root-must-be-absolute');
  return {
    mode: argv[0],
    signerRoot: path.win32.resolve(argv[2]),
    builderArgv: ['--check', ...argv.slice(1)],
  };
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function samePath(left, right) { return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase(); }
function isInside(parent, child) {
  const root = path.win32.resolve(parent).toLowerCase();
  const target = path.win32.resolve(child).toLowerCase();
  return target === root || target.startsWith(`${root}${path.win32.sep}`);
}

function fileSystem(dependencies) {
  const injected = dependencies.fileSystem ?? {};
  return {
    existsSync: injected.existsSync ?? ((target) => fs.existsSync(target)),
    statSync: injected.statSync ?? ((target) => fs.statSync(target)),
    mkdirSync: injected.mkdirSync ?? ((target, options) => fs.mkdirSync(target, options)),
    openSync: injected.openSync ?? ((target, flags) => fs.openSync(target, flags)),
    writeSync: injected.writeSync ?? ((handle, bytes) => fs.writeSync(handle, bytes)),
    fsyncSync: injected.fsyncSync ?? ((handle) => fs.fsyncSync(handle)),
    closeSync: injected.closeSync ?? ((handle) => fs.closeSync(handle)),
    renameSync: injected.renameSync ?? ((source, target) => fs.renameSync(source, target)),
    readFileSync: injected.readFileSync ?? ((target) => fs.readFileSync(target)),
    readdirSync: injected.readdirSync ?? ((target, options) => fs.readdirSync(target, options)),
    unlinkSync: injected.unlinkSync ?? ((target) => fs.unlinkSync(target)),
    rmdirSync: injected.rmdirSync ?? ((target) => fs.rmdirSync(target)),
  };
}

export function createStage8WindowsTaskRegisterAuthorizationCandidate(built) {
  const checked = approvalTools.checkStage8WindowsTaskRegisterApproval({
    authorization: built.authorization,
    decision: built.decision,
    signer: built.signer,
    formal: built.formal,
    schedulerInspection: built.schedulerInspection,
  });
  if (!checked.ok) throw new Error(checked.reason);
  const payload = {
    protocolVersion: hostTools.STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION,
    action: approvalTools.STAGE8_WINDOWS_TASK_REGISTER_ACTION,
    scope: approvalTools.STAGE8_WINDOWS_TASK_REGISTER_SCOPE,
    approvalId: built.authorization.approvalId,
    granted: true,
    hostRunId: built.authorization.hostRunId,
    controlManifestSha256: built.authorization.bindings.controlManifestSha256,
  };
  const authorization = {
    ...payload,
    authorizationSha256: hostTools.hashStage8WindowsTaskHostPhaseAuthorizationPayload(payload),
  };
  hostTools.validateStage8WindowsTaskHostPhaseAuthorization(authorization, built.formal.control, 'register');
  if (checked.value.approvalId !== authorization.approvalId
    || checked.value.authorizationInputSha256 !== built.authorization.authorizationInputSha256
    || checked.value.authorizationSha256 !== authorization.authorizationSha256) {
    throw new Error('windows-task-register-orchestrator-check-candidate-drift');
  }
  return { checked: checked.value, authorization };
}

function actualBindings(built, candidate) {
  return {
    signerReleaseCommit: built.signer.releaseCommit,
    signerSourceBundleSha256: built.signer.sourceBundleSha256,
    productDecisionSha256: built.decision.decisionSha256,
    approvalId: candidate.authorization.approvalId,
    authorizationInputSha256: candidate.checked.authorizationInputSha256,
    candidateAuthorizationSha256: candidate.authorization.authorizationSha256,
    checkIdentitySha256: candidate.checked.checkIdentitySha256,
    targetIdentitySha256: approvalTools.hashStage8WindowsTaskRegisterTargets(built.authorization.targets),
  };
}

function assertBindings(built, candidate, expectedBindings) {
  const actual = actualBindings(built, candidate);
  for (const [key, expected] of Object.entries(expectedBindings)) {
    if (actual[key] !== expected) throw new Error(`windows-task-register-orchestrator-published-binding-drift:${key}`);
  }
  return actual;
}

function assertTargetPolicy(built, parsed, osTempRoot) {
  const target = built.formal.targets.registerAuthorizationPath;
  if (!samePath(target, built.authorization.targets.registerAuthorizationPath)
    || !path.win32.isAbsolute(target)
    || !isInside(osTempRoot, target)
    || isInside(parsed.signerRoot, target)
    || path.win32.basename(target).toLowerCase() !== 'register.json') {
    throw new Error('windows-task-register-orchestrator-target-path-drift');
  }
  if (built.schedulerInspection.exists !== false
    || built.schedulerInspection.taskPath !== null
    || built.schedulerInspection.taskName !== null
    || built.decision.phaseApprovals['materials-emit'] !== null
    || built.decision.phaseApprovals.register !== null
    || built.decision.phaseApprovals.run !== null
    || built.decision.phaseApprovals.verify !== null
    || built.decision.phaseApprovals.delete !== null) {
    throw new Error('windows-task-register-orchestrator-phase-inheritance-forbidden');
  }
}

function buildOnce(parsed, dependencies) {
  const environment = {
    ...(dependencies.environment ?? process.env),
    STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_CHECK: '1',
  };
  const builder = dependencies.buildRegister ?? buildStage8WindowsTaskRegisterApprovalCheck;
  const built = builder(parsed.builderArgv, { ...dependencies, environment });
  const osTempRoot = dependencies.osTempRoot ?? os.tmpdir();
  assertTargetPolicy(built, parsed, osTempRoot);
  const candidate = createStage8WindowsTaskRegisterAuthorizationCandidate(built);
  const bindings = assertBindings(
    built,
    candidate,
    dependencies.expectedBindings ?? STAGE8_WINDOWS_TASK_REGISTER_PUBLISHED_BINDINGS,
  );
  return { built, candidate, bindings, osTempRoot };
}

function checkSummary(value) {
  return {
    ok: true,
    status: 'checked',
    scope: approvalTools.STAGE8_WINDOWS_TASK_REGISTER_SCOPE,
    action: approvalTools.STAGE8_WINDOWS_TASK_REGISTER_ACTION,
    requestId: approvalTools.STAGE8_WINDOWS_TASK_REGISTER_REQUEST_ID,
    ...value.bindings,
    ...value.built.formal.bindings,
    taskPath: value.built.formal.targets.taskPath,
    taskName: value.built.formal.targets.taskName,
    registerAuthorizationPath: value.built.formal.targets.registerAuthorizationPath,
    taskAbsent: true,
    phaseApprovals: { 'materials-emit': null, register: null, run: null, verify: null, delete: null },
    filesWritten: 0,
    phaseAuthorizationsIssued: 0,
    materialsGenerated: 0,
    scheduledTasksRead: value.built.scheduledTasksRead,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
    trainingRuns: 0,
    deployments: 0,
    port18768Operations: 0,
    formalFilesRead: value.built.formalFilesRead,
    formalDirectoriesRead: value.built.formalDirectoriesRead,
  };
}

function validateAuthorizationBytes(bytes, built, expectedAuthorization, dependencies, stage) {
  const expectedBytes = Buffer.from(`${JSON.stringify(expectedAuthorization, null, 2)}\n`);
  if (!Buffer.from(bytes).equals(expectedBytes)) throw new Error(`windows-task-register-orchestrator-${stage}-bytes-drift`);
  let parsed;
  try { parsed = JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw new Error(`windows-task-register-orchestrator-${stage}-json-invalid`); }
  const validated = hostTools.validateStage8WindowsTaskHostPhaseAuthorization(parsed, built.formal.control, 'register');
  if (identityTools.canonicalizeStage8OfflineIdentity(validated) !== identityTools.canonicalizeStage8OfflineIdentity(expectedAuthorization)) {
    throw new Error(`windows-task-register-orchestrator-${stage}-authorization-drift`);
  }
  if (dependencies.validateAuthorization) dependencies.validateAuthorization({ stage, authorization: validated, built });
  return expectedBytes;
}

function inspectMaterialsAuthorization(state, io) {
  if (!state.materialsAuthorizationPreexisting) return { exists: io.existsSync(state.materialsAuthorizationPath), unchanged: null };
  if (!io.existsSync(state.materialsAuthorizationPath)) return { exists: false, unchanged: false };
  try {
    return {
      exists: true,
      unchanged: sha256(io.readFileSync(state.materialsAuthorizationPath)) === state.materialsAuthorizationFileSha256,
    };
  } catch { return { exists: true, unchanged: null }; }
}

function preexistingFailure(target, staging, state, io) {
  const material = inspectMaterialsAuthorization(state, io);
  const error = new Error(io.existsSync(target)
    ? 'windows-task-register-orchestrator-target-exists'
    : 'windows-task-register-orchestrator-staging-exists');
  error.failureEvidence = {
    filesWritten: 0,
    filesRemaining: Number(io.existsSync(target)) + Number(io.existsSync(staging)),
    targetExists: io.existsSync(target),
    stagingExists: io.existsSync(staging),
    preexistingTarget: io.existsSync(target),
    preexistingStaging: io.existsSync(staging),
    materialsAuthorizationExists: material.exists,
    materialsAuthorizationUnchanged: material.unchanged,
    cleanupAttempted: false,
    cleanupSucceeded: true,
    cleanupErrors: [],
    renameCompleted: false,
    phaseAuthorizationsIssued: 0,
    materialsGenerated: 0,
    scheduledTasksRead: state.scheduledTasksRead,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
    trainingRuns: 0,
    deployments: 0,
    port18768Operations: 0,
  };
  return error;
}

function emitFailure(cause, state, io) {
  const cleanupErrors = [];
  if (state.handle !== null) {
    try { io.closeSync(state.handle); } catch (error) { cleanupErrors.push(error instanceof Error ? error.message : String(error)); }
    state.handle = null;
  }
  if (state.renameCompleted && io.existsSync(state.target) && !io.existsSync(state.staging)) {
    try {
      io.renameSync(state.target, state.staging);
      state.rollbackCompleted = true;
    } catch (error) { cleanupErrors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (io.existsSync(state.staging)) {
    try { io.unlinkSync(state.staging); } catch (error) { cleanupErrors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (state.parentDirectoryCreated && io.existsSync(state.parent)) {
    try { io.rmdirSync(state.parent); } catch (error) { cleanupErrors.push(error instanceof Error ? error.message : String(error)); }
  }
  const targetExists = io.existsSync(state.target);
  const stagingExists = io.existsSync(state.staging);
  const parentDirectoryExists = state.parentDirectoryCreated && io.existsSync(state.parent);
  const material = inspectMaterialsAuthorization(state, io);
  const cleanupSucceeded = !targetExists && !stagingExists && !parentDirectoryExists
    && material.unchanged !== false;
  const error = new Error(cleanupSucceeded
    ? `windows-task-register-orchestrator-emit-failed:${cause instanceof Error ? cause.message : String(cause)}`
    : `windows-task-register-orchestrator-emit-cleanup-failed-residual:${cause instanceof Error ? cause.message : String(cause)}`);
  error.failureEvidence = {
    filesWritten: state.renameCompleted ? 1 : 0,
    filesRemaining: Number(targetExists) + Number(stagingExists),
    targetExists,
    stagingExists,
    parentDirectoryCreated: state.parentDirectoryCreated,
    parentDirectoryExists,
    directoriesCreated: Number(state.parentDirectoryCreated),
    directoriesRemaining: Number(parentDirectoryExists),
    materialsAuthorizationExists: material.exists,
    materialsAuthorizationUnchanged: material.unchanged,
    cleanupAttempted: true,
    cleanupSucceeded,
    cleanupErrors,
    renameCompleted: state.renameCompleted,
    rollbackCompleted: state.rollbackCompleted,
    phaseAuthorizationsIssued: 0,
    materialsGenerated: 0,
    scheduledTasksRead: state.scheduledTasksRead,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
    trainingRuns: 0,
    deployments: 0,
    port18768Operations: 0,
  };
  return error;
}

function validateAuthorizationDirectory(state, built, io) {
  if (io.existsSync(state.staging)) throw new Error('windows-task-register-orchestrator-staging-residual');
  const entries = io.readdirSync(state.parent, { withFileTypes: true });
  const normalized = entries.map((entry) => ({
    name: typeof entry === 'string' ? entry : entry.name,
    file: typeof entry === 'string' ? true : entry.isFile(),
  })).sort((left, right) => left.name.localeCompare(right.name));
  if (normalized.length !== 2
    || normalized.some((entry) => !entry.file)
    || normalized[0].name !== 'materials-emit.json'
    || normalized[1].name !== 'register.json') {
    throw new Error('windows-task-register-orchestrator-authorization-directory-drift');
  }
  if (!samePath(state.materialsAuthorizationPath, built.formal.targets.materialsAuthorizationPath)
    || sha256(io.readFileSync(state.materialsAuthorizationPath)) !== state.materialsAuthorizationFileSha256) {
    throw new Error('windows-task-register-orchestrator-materials-authorization-drift');
  }
}

function emitAndVerify(parsed, dependencies) {
  const first = buildOnce(parsed, dependencies);
  const second = buildOnce(parsed, dependencies);
  if (identityTools.canonicalizeStage8OfflineIdentity(second.candidate.authorization)
    !== identityTools.canonicalizeStage8OfflineIdentity(first.candidate.authorization)) {
    throw new Error('windows-task-register-orchestrator-rebuild-drift');
  }
  const io = fileSystem(dependencies);
  const target = second.built.formal.targets.registerAuthorizationPath;
  const staging = `${target}.partial`;
  const parent = path.win32.dirname(target);
  const materialsAuthorizationPath = second.built.formal.targets.materialsAuthorizationPath;
  const state = {
    target,
    staging,
    parent,
    materialsAuthorizationPath,
    materialsAuthorizationFileSha256: second.built.formal.bindings.materialsAuthorizationFileSha256,
    materialsAuthorizationPreexisting: io.existsSync(materialsAuthorizationPath),
    scheduledTasksRead: first.built.scheduledTasksRead + second.built.scheduledTasksRead,
    handle: null,
    parentDirectoryCreated: false,
    renameCompleted: false,
    rollbackCompleted: false,
  };
  if (io.existsSync(target) || io.existsSync(staging)) throw preexistingFailure(target, staging, state, io);
  const parentParent = path.win32.dirname(parent);
  try {
    if (!io.existsSync(parent)) {
      if (!io.existsSync(parentParent) || !io.statSync(parentParent).isDirectory()) {
        throw new Error('windows-task-register-orchestrator-parent-missing');
      }
      io.mkdirSync(parent, { recursive: false });
      state.parentDirectoryCreated = true;
    } else if (!io.statSync(parent).isDirectory()) {
      throw new Error('windows-task-register-orchestrator-parent-not-directory');
    }
    const bytes = Buffer.from(`${JSON.stringify(second.candidate.authorization, null, 2)}\n`);
    state.handle = io.openSync(staging, 'wx');
    const written = io.writeSync(state.handle, bytes);
    if (written !== bytes.length) throw new Error('windows-task-register-orchestrator-short-write');
    io.fsyncSync(state.handle);
    io.closeSync(state.handle);
    state.handle = null;
    validateAuthorizationBytes(io.readFileSync(staging), second.built, second.candidate.authorization, dependencies, 'staging');
    io.renameSync(staging, target);
    state.renameCompleted = true;
    validateAuthorizationBytes(io.readFileSync(target), second.built, second.candidate.authorization, dependencies, 'final');
    validateAuthorizationDirectory(state, second.built, io);
    return {
      ok: true,
      status: 'emitted-and-verified',
      scope: approvalTools.STAGE8_WINDOWS_TASK_REGISTER_SCOPE,
      action: approvalTools.STAGE8_WINDOWS_TASK_REGISTER_ACTION,
      requestId: approvalTools.STAGE8_WINDOWS_TASK_REGISTER_REQUEST_ID,
      ...second.bindings,
      ...second.built.formal.bindings,
      taskPath: second.built.formal.targets.taskPath,
      taskName: second.built.formal.targets.taskName,
      registerAuthorizationPath: target,
      taskAbsentAtSigning: true,
      phaseApprovals: {
        'materials-emit': null,
        register: second.candidate.authorization.authorizationSha256,
        run: null,
        verify: null,
        delete: null,
      },
      existingMaterialsAuthorizationSha256: second.built.formal.materialsAuthorization.authorizationSha256,
      materialsAuthorizationUnchanged: true,
      authorizationDirectoryFiles: 2,
      filesWritten: 1,
      filesVerified: 1,
      phaseAuthorizationsIssued: 1,
      materialsGenerated: 0,
      scheduledTasksRead: state.scheduledTasksRead,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      diagnosticsRun: 0,
      formalPilotGamesCredited: 0,
      trainingRuns: 0,
      deployments: 0,
      port18768Operations: 0,
      formalFilesRead: first.built.formalFilesRead + second.built.formalFilesRead,
      formalDirectoriesRead: first.built.formalDirectoriesRead + second.built.formalDirectoriesRead,
      stagingResidual: false,
    };
  } catch (error) {
    throw emitFailure(error, state, io);
  }
}

export function runStage8WindowsTaskRegisterAuthorizationOrchestrator(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseArgs(argv);
  const environment = dependencies.environment ?? process.env;
  if (parsed.mode === '--check' && environment.STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_CHECK !== '1') {
    throw new Error('windows-task-register-orchestrator-check-gate-required');
  }
  if (parsed.mode === '--emit-and-verify' && environment.STAGE8_WINDOWS_TASK_REGISTER_AUTHORIZATION_EMIT !== '1') {
    throw new Error('windows-task-register-orchestrator-emit-gate-required');
  }
  if (parsed.mode === '--check') {
    const first = checkSummary(buildOnce(parsed, dependencies));
    const second = checkSummary(buildOnce(parsed, dependencies));
    if (serialize(first) !== serialize(second)) throw new Error('windows-task-register-orchestrator-repeated-check-drift');
    return {
      ...first,
      repeatedCheckByteIdentical: true,
      scheduledTasksRead: first.scheduledTasksRead + second.scheduledTasksRead,
      formalFilesRead: first.formalFilesRead + second.formalFilesRead,
      formalDirectoriesRead: first.formalDirectoriesRead + second.formalDirectoriesRead,
    };
  }
  return emitAndVerify(parsed, dependencies);
}

export function serializeStage8WindowsTaskRegisterAuthorizationFailure(error) {
  const evidence = error && typeof error === 'object' && 'failureEvidence' in error
    ? error.failureEvidence
    : {
      filesWritten: 0,
      filesRemaining: 0,
      targetExists: null,
      stagingExists: null,
      parentDirectoryCreated: false,
      parentDirectoryExists: null,
      directoriesCreated: 0,
      directoriesRemaining: 0,
      materialsAuthorizationExists: null,
      materialsAuthorizationUnchanged: null,
      cleanupAttempted: false,
      cleanupSucceeded: true,
      cleanupErrors: [],
      renameCompleted: false,
      phaseAuthorizationsIssued: 0,
      materialsGenerated: 0,
      scheduledTasksRead: Number.isInteger(error?.scheduledTasksRead) ? error.scheduledTasksRead : 0,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      diagnosticsRun: 0,
      formalPilotGamesCredited: 0,
      trainingRuns: 0,
      deployments: 0,
      port18768Operations: 0,
    };
  return {
    ok: false,
    status: 'fused',
    error: error instanceof Error ? error.message : String(error),
    ...evidence,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try { process.stdout.write(serialize(runStage8WindowsTaskRegisterAuthorizationOrchestrator())); }
  catch (error) {
    process.stderr.write(serialize(serializeStage8WindowsTaskRegisterAuthorizationFailure(error)));
    process.exitCode = 1;
  }
}
