import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { buildStage8WindowsTaskMaterialsEmitApprovalCheck } from './stage8-windows-task-materials-emit-approval.mjs';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);

function loadTs(relativePath) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
  try { return require(relativePath); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const approvalTools = loadTs('../src/game/stage8/offline-windows-task-materials-emit-approval.ts');
const hostTools = loadTs('../src/game/stage8/offline-windows-task-host-control.ts');
const identityTools = loadTs('../src/game/stage8/offline-action-identity.ts');

export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_PUBLISHED_BINDINGS = Object.freeze({
  signerReleaseCommit: 'c3fff6f44a2fd83755c177dccc0b76e5b6c0cac3',
  signerSourceBundleSha256: '558fd581f489d8da44fc82196e2296e2e0013735adfa2151243c8c8eb53d9ce1',
  productDecisionSha256: '57c33fbc1f541b69edb6f69a2a8c5d296b78ffc686b6a012358ccda9d48b7267',
  approvalId: 'stage8-windows-task-materials-emit-9579b37f38bdadfc10132efccc5c2b71b07c63a9',
  authorizationInputSha256: '01147ce15fed8e8d4f7b6f5344c419faf7a956806c2ddedb37a3d97f5713ef97',
  candidateAuthorizationSha256: 'c9c328380beee30e7cbd2954f95c6573aad4925f1dce7869f0f16673bf32dca2',
  checkIdentitySha256: '781e5a8fccac422835d950adaecc741407a06a96d96f346a6f4c2ac2af612ed0',
  targetIdentitySha256: 'a260273b77b3fba67f46ea3065c4545d21fec176c5b5bac72264b2a9a22c2a09',
});

function parseArgs(argv) {
  if (argv.length !== 4
    || !['--check', '--emit-and-verify'].includes(argv[0])
    || argv[1] !== '--signer-root'
    || argv[3] !== '--product-approved-materials-emit-only') {
    throw new Error('usage: node stage8-windows-task-materials-emit-authorization-orchestrator.mjs --check|--emit-and-verify --signer-root <clean-published-c3-root> --product-approved-materials-emit-only');
  }
  if (!path.win32.isAbsolute(argv[2])) throw new Error('windows-task-materials-emit-orchestrator-signer-root-must-be-absolute');
  return {
    mode: argv[0],
    signerRoot: path.win32.resolve(argv[2]),
    builderArgv: ['--check', ...argv.slice(1)],
  };
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
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
    unlinkSync: injected.unlinkSync ?? ((target) => fs.unlinkSync(target)),
    rmdirSync: injected.rmdirSync ?? ((target) => fs.rmdirSync(target)),
  };
}

export function createStage8WindowsTaskMaterialsEmitAuthorizationCandidate(built) {
  const checked = approvalTools.checkStage8WindowsTaskMaterialsEmitApproval({
    authorization: built.authorization,
    decision: built.decision,
    signer: built.signer,
    formal: built.formal,
  });
  if (!checked.ok) throw new Error(checked.reason);
  const payload = {
    protocolVersion: hostTools.STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION,
    action: approvalTools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION,
    scope: approvalTools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE,
    approvalId: built.authorization.approvalId,
    granted: true,
    hostRunId: built.authorization.hostRunId,
    controlManifestSha256: built.authorization.controlManifestSha256,
  };
  const authorization = {
    ...payload,
    authorizationSha256: hostTools.hashStage8WindowsTaskHostPhaseAuthorizationPayload(payload),
  };
  hostTools.validateStage8WindowsTaskHostPhaseAuthorization(authorization, built.formal.control, 'materials-emit');
  if (checked.value.approvalId !== authorization.approvalId
    || checked.value.authorizationInputSha256 !== built.authorization.authorizationInputSha256
    || checked.value.authorizationSha256 !== authorization.authorizationSha256) {
    throw new Error('windows-task-materials-emit-orchestrator-check-candidate-drift');
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
    targetIdentitySha256: approvalTools.hashStage8WindowsTaskMaterialsEmitTargets(built.authorization.targets),
  };
}

function assertBindings(built, candidate, expectedBindings) {
  const actual = actualBindings(built, candidate);
  for (const [key, expected] of Object.entries(expectedBindings)) {
    if (actual[key] !== expected) throw new Error(`windows-task-materials-emit-orchestrator-published-binding-drift:${key}`);
  }
  return actual;
}

function assertTargetPolicy(built, parsed, osTempRoot) {
  const target = built.formal.targets.authorizationPath;
  if (!samePath(target, built.authorization.targets.authorizationPath)
    || !path.win32.isAbsolute(target)
    || !isInside(osTempRoot, target)
    || isInside(parsed.signerRoot, target)
    || path.win32.basename(target).toLowerCase() !== 'materials-emit.json') {
    throw new Error('windows-task-materials-emit-orchestrator-target-path-drift');
  }
  if (built.decision.phaseApprovals['materials-emit'] !== null
    || built.decision.phaseApprovals.register !== null
    || built.decision.phaseApprovals.run !== null
    || built.decision.phaseApprovals.verify !== null
    || built.decision.phaseApprovals.delete !== null) {
    throw new Error('windows-task-materials-emit-orchestrator-phase-inheritance-forbidden');
  }
}

function buildOnce(parsed, dependencies) {
  const environment = {
    ...(dependencies.environment ?? process.env),
    STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_CHECK: '1',
  };
  const builder = dependencies.buildMaterials ?? buildStage8WindowsTaskMaterialsEmitApprovalCheck;
  const built = builder(parsed.builderArgv, { ...dependencies, environment });
  const osTempRoot = dependencies.osTempRoot ?? os.tmpdir();
  assertTargetPolicy(built, parsed, osTempRoot);
  const candidate = createStage8WindowsTaskMaterialsEmitAuthorizationCandidate(built);
  const bindings = assertBindings(
    built,
    candidate,
    dependencies.expectedBindings ?? STAGE8_WINDOWS_TASK_MATERIALS_EMIT_PUBLISHED_BINDINGS,
  );
  return { built, candidate, bindings, osTempRoot };
}

function checkSummary(value) {
  return {
    ok: true,
    status: 'checked',
    scope: approvalTools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE,
    action: approvalTools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION,
    requestId: approvalTools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_REQUEST_ID,
    ...value.bindings,
    controlManifestSha256: value.built.authorization.controlManifestSha256,
    controlEvidenceSha256: value.built.authorization.controlEvidenceSha256,
    phaseApprovals: { 'materials-emit': null, register: null, run: null, verify: null, delete: null },
    filesWritten: 0,
    phaseAuthorizationsIssued: 0,
    materialsGenerated: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
    formalControlFilesRead: value.built.formalControlFilesRead,
  };
}

function validateAuthorizationBytes(bytes, built, expectedAuthorization, dependencies, stage) {
  const expectedBytes = Buffer.from(`${JSON.stringify(expectedAuthorization, null, 2)}\n`);
  if (!Buffer.from(bytes).equals(expectedBytes)) throw new Error(`windows-task-materials-emit-orchestrator-${stage}-bytes-drift`);
  let parsed;
  try { parsed = JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw new Error(`windows-task-materials-emit-orchestrator-${stage}-json-invalid`); }
  const validated = hostTools.validateStage8WindowsTaskHostPhaseAuthorization(parsed, built.formal.control, 'materials-emit');
  if (identityTools.canonicalizeStage8OfflineIdentity(validated) !== identityTools.canonicalizeStage8OfflineIdentity(expectedAuthorization)) {
    throw new Error(`windows-task-materials-emit-orchestrator-${stage}-authorization-drift`);
  }
  if (dependencies.validateAuthorization) dependencies.validateAuthorization({ stage, authorization: validated, built });
  return expectedBytes;
}

function preexistingFailure(target, staging, io) {
  const error = new Error(io.existsSync(target)
    ? 'windows-task-materials-emit-orchestrator-target-exists'
    : 'windows-task-materials-emit-orchestrator-staging-exists');
  error.failureEvidence = {
    filesWritten: 0,
    filesRemaining: Number(io.existsSync(target)) + Number(io.existsSync(staging)),
    targetExists: io.existsSync(target),
    stagingExists: io.existsSync(staging),
    preexistingTarget: io.existsSync(target),
    preexistingStaging: io.existsSync(staging),
    cleanupAttempted: false,
    cleanupSucceeded: true,
    cleanupErrors: [],
    renameCompleted: false,
    phaseAuthorizationsIssued: 0,
    materialsGenerated: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
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
  const cleanupSucceeded = !targetExists && !stagingExists && !parentDirectoryExists;
  const error = new Error(cleanupSucceeded
    ? `windows-task-materials-emit-orchestrator-emit-failed:${cause instanceof Error ? cause.message : String(cause)}`
    : `windows-task-materials-emit-orchestrator-emit-cleanup-failed-residual:${cause instanceof Error ? cause.message : String(cause)}`);
  error.failureEvidence = {
    filesWritten: state.renameCompleted ? 1 : 0,
    filesRemaining: Number(targetExists) + Number(stagingExists),
    targetExists,
    stagingExists,
    parentDirectoryCreated: state.parentDirectoryCreated,
    parentDirectoryExists,
    directoriesCreated: Number(state.parentDirectoryCreated),
    directoriesRemaining: Number(parentDirectoryExists),
    cleanupAttempted: true,
    cleanupSucceeded,
    cleanupErrors,
    renameCompleted: state.renameCompleted,
    rollbackCompleted: state.rollbackCompleted,
    phaseAuthorizationsIssued: 0,
    materialsGenerated: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
  };
  return error;
}

function emitAndVerify(parsed, dependencies) {
  const first = buildOnce(parsed, dependencies);
  const io = fileSystem(dependencies);
  const target = first.built.formal.targets.authorizationPath;
  const staging = `${target}.partial`;
  if (io.existsSync(target) || io.existsSync(staging)) throw preexistingFailure(target, staging, io);
  const parent = path.win32.dirname(target);
  const parentParent = path.win32.dirname(parent);
  const state = {
    target,
    staging,
    parent,
    handle: null,
    parentDirectoryCreated: false,
    renameCompleted: false,
    rollbackCompleted: false,
  };
  try {
    if (!io.existsSync(parent)) {
      if (!io.existsSync(parentParent) || !io.statSync(parentParent).isDirectory()) {
        throw new Error('windows-task-materials-emit-orchestrator-parent-missing');
      }
      io.mkdirSync(parent, { recursive: false });
      state.parentDirectoryCreated = true;
    } else if (!io.statSync(parent).isDirectory()) {
      throw new Error('windows-task-materials-emit-orchestrator-parent-not-directory');
    }
    const bytes = Buffer.from(`${JSON.stringify(first.candidate.authorization, null, 2)}\n`);
    state.handle = io.openSync(staging, 'wx');
    const written = io.writeSync(state.handle, bytes);
    if (written !== bytes.length) throw new Error('windows-task-materials-emit-orchestrator-short-write');
    io.fsyncSync(state.handle);
    io.closeSync(state.handle);
    state.handle = null;
    validateAuthorizationBytes(io.readFileSync(staging), first.built, first.candidate.authorization, dependencies, 'staging');
    io.renameSync(staging, target);
    state.renameCompleted = true;

    const second = buildOnce(parsed, dependencies);
    if (identityTools.canonicalizeStage8OfflineIdentity(second.candidate.authorization)
      !== identityTools.canonicalizeStage8OfflineIdentity(first.candidate.authorization)) {
      throw new Error('windows-task-materials-emit-orchestrator-rebuild-drift');
    }
    validateAuthorizationBytes(io.readFileSync(target), second.built, second.candidate.authorization, dependencies, 'final');
    if (io.existsSync(staging)) throw new Error('windows-task-materials-emit-orchestrator-staging-residual');
    return {
      ok: true,
      status: 'emitted-and-verified',
      scope: approvalTools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE,
      action: approvalTools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION,
      requestId: approvalTools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_REQUEST_ID,
      ...second.bindings,
      controlManifestSha256: second.built.authorization.controlManifestSha256,
      controlEvidenceSha256: second.built.authorization.controlEvidenceSha256,
      phaseApprovals: {
        'materials-emit': second.candidate.authorization.authorizationSha256,
        register: null,
        run: null,
        verify: null,
        delete: null,
      },
      filesWritten: 1,
      filesVerified: 1,
      phaseAuthorizationsIssued: 1,
      materialsGenerated: 0,
      scheduledTasksRead: 0,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      diagnosticsRun: 0,
      formalPilotGamesCredited: 0,
      formalControlFilesRead: first.built.formalControlFilesRead + second.built.formalControlFilesRead,
      stagingResidual: false,
    };
  } catch (error) {
    throw emitFailure(error, state, io);
  }
}

export function runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseArgs(argv);
  const environment = dependencies.environment ?? process.env;
  if (parsed.mode === '--check' && environment.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_CHECK !== '1') {
    throw new Error('windows-task-materials-emit-orchestrator-check-gate-required');
  }
  if (parsed.mode === '--emit-and-verify' && environment.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_AUTHORIZATION_EMIT !== '1') {
    throw new Error('windows-task-materials-emit-orchestrator-emit-gate-required');
  }
  if (parsed.mode === '--check') {
    const first = checkSummary(buildOnce(parsed, dependencies));
    const second = checkSummary(buildOnce(parsed, dependencies));
    if (serialize(first) !== serialize(second)) throw new Error('windows-task-materials-emit-orchestrator-repeated-check-drift');
    return { ...first, repeatedCheckByteIdentical: true };
  }
  return emitAndVerify(parsed, dependencies);
}

export function serializeStage8WindowsTaskMaterialsEmitAuthorizationFailure(error) {
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
      cleanupAttempted: false,
      cleanupSucceeded: true,
      cleanupErrors: [],
      renameCompleted: false,
      phaseAuthorizationsIssued: 0,
      materialsGenerated: 0,
      scheduledTasksRead: 0,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      diagnosticsRun: 0,
      formalPilotGamesCredited: 0,
    };
  return {
    ok: false,
    status: 'fused',
    error: error instanceof Error ? error.message : String(error),
    ...evidence,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try { process.stdout.write(serialize(runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator())); }
  catch (error) {
    process.stderr.write(serialize(serializeStage8WindowsTaskMaterialsEmitAuthorizationFailure(error)));
    process.exitCode = 1;
  }
}
