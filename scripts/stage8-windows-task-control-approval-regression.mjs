import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  runStage8WindowsTaskControlApproval,
  serializeStage8WindowsTaskControlApprovalFailure,
} from './stage8-windows-task-control-approval.mjs';

const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
}).outputText, filename);
const approvalTools = require('../src/game/stage8/offline-windows-task-control-approval.ts');
const identityTools = require('../src/game/stage8/offline-windows-task-diagnostic-identity.ts');
const identityHashTools = require('../src/game/stage8/offline-action-identity.ts');
const hostTools = require('../src/game/stage8/offline-windows-task-host-control.ts');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-windows-task-control-approval-'));
const sourceRoot = path.join(temporaryRoot, 'diagnostic-source');
const signerRoot = path.join(temporaryRoot, 'signer-source');
const osTempRoot = path.join(temporaryRoot, 'os-temp');
const nodeExecutablePath = path.join(temporaryRoot, 'runtime', 'node.exe');
const signerReleaseCommit = '9'.repeat(40);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeExclusive(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}

function diagnosticRuntime() {
  return {
    request: identityTools.buildStage8WindowsTaskDiagnosticIdentityInput({
      projectRoot: sourceRoot,
      nodeExecutablePath,
      osTempRoot,
      userSid: 'S-1-5-21-1111111111-2222222222-3333333333-1001',
    }),
    expected: { projectRoot: sourceRoot, nodeExecutablePath, osTempRoot },
    inspectCheckout: () => ({ headCommit: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT, clean: true }),
    readFile: (absolutePath) => fs.readFileSync(absolutePath),
  };
}

function signerRuntime({ clean = true, headCommit = signerReleaseCommit, mutateRead } = {}) {
  return {
    inspectSignerCheckout: () => ({ headCommit, clean }),
    readSignerFile: (absolutePath) => {
      const bytes = fs.readFileSync(absolutePath);
      return mutateRead ? mutateRead(absolutePath, bytes) : bytes;
    },
  };
}

function sealAuthorization(value) {
  const base = clone(value);
  base.approvalId = approvalTools.deriveStage8WindowsTaskControlApprovalId({
    identitySha256: base.identitySha256,
    controlTemplateSha256: base.controlTemplateSha256,
    hostRunId: base.hostRunId,
    targetRunId: base.targetRunId,
    taskName: base.taskName,
    runtimeReleaseCommit: base.runtimeReleaseCommit,
    signerReleaseCommit: base.signer.releaseCommit,
    signerSourceBundleSha256: base.signer.sourceBundleSha256,
  });
  const { authorizationInputSha256: ignored, ...payload } = base;
  void ignored;
  base.authorizationInputSha256 = approvalTools.hashStage8WindowsTaskControlApprovalInput(payload);
  return base;
}

function expectFailure(baseInput, mutator, reason, overrides = {}, reseal = false) {
  let authorization = clone(baseInput.authorization);
  mutator(authorization);
  if (reseal) authorization = sealAuthorization(authorization);
  const result = approvalTools.validateStage8WindowsTaskControlApprovalInput({ ...baseInput, ...overrides, authorization });
  assert.equal(result.ok, false);
  assert.match(result.reason, reason);
}

function nativeFileSystem(overrides = {}) {
  return {
    existsSync: (target) => fs.existsSync(target),
    mkdirSync: (target, options) => fs.mkdirSync(target, options),
    writeFileSync: (target, bytes, options) => fs.writeFileSync(target, bytes, options),
    readFileSync: (target, encoding) => fs.readFileSync(target, encoding),
    renameSync: (source, target) => fs.renameSync(source, target),
    readdirSync: (target) => fs.readdirSync(target),
    rmSync: (target, options) => fs.rmSync(target, options),
    rmdirSync: (target) => fs.rmdirSync(target),
    ...overrides,
  };
}

function captureEmitFailure(cliDependencies, fileSystem) {
  try {
    runStage8WindowsTaskControlApproval(['--emit', 'C:\\identity.json', 'C:\\authorization.json'], {
      ...cliDependencies,
      fileSystem,
      environment: { STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_EMIT: '1' },
    });
    assert.fail('expected emit failure');
  } catch (error) {
    return error;
  }
}

function assertCleanEmitFailure(error, authorization, expectedFilesWritten, reason) {
  assert.match(error.message, reason);
  assert.equal(error.failureEvidence.filesWritten, expectedFilesWritten);
  assert.equal(error.failureEvidence.filesRemaining, 0);
  assert.equal(error.failureEvidence.outputRootExists, false);
  assert.equal(error.failureEvidence.stagingExists, false);
  assert.equal(error.failureEvidence.cleanupSucceeded, true);
  assert.deepEqual(error.failureEvidence.cleanupErrors, []);
  assert.equal(error.failureEvidence.renameCompleted, false);
  assert.equal(error.failureEvidence.phaseAuthorizationsIssued, 0);
  assert.equal(error.failureEvidence.scheduledTasksMutated, 0);
  assert.equal(error.failureEvidence.servicesMutated, 0);
  assert.equal(fs.existsSync(authorization.outputRoot), false);
  assert.equal(fs.existsSync(`${authorization.outputRoot}.partial`), false);
  assert.equal(fs.existsSync(path.win32.join(osTempRoot, 'WannianMahjong')), false);
}

try {
  fs.mkdirSync(osTempRoot, { recursive: true });
  writeExclusive(nodeExecutablePath, 'node-runtime-v1');
  writeExclusive(path.join(sourceRoot, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.hostRunner), 'host-runner-v1');
  writeExclusive(path.join(sourceRoot, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.diagnostic), 'diagnostic-v1');
  writeExclusive(path.join(sourceRoot, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.controlProtocol), 'control-protocol-v1');
  writeExclusive(path.join(sourceRoot, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.identity), 'identity-v1');
  for (const relativePath of approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SIGNER_FILES) {
    writeExclusive(path.join(signerRoot, relativePath), `signer:${relativePath}`);
  }

  const diagnostic = identityTools.createStage8WindowsTaskDiagnosticIdentityBundle(diagnosticRuntime());
  assert.equal(diagnostic.ok, true, diagnostic.ok ? '' : diagnostic.reason);
  const identityBundle = clone(diagnostic.value);
  identityBundle.identitySha256 = approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256;
  const signer = approvalTools.collectStage8WindowsTaskControlApprovalSignerIdentity({
    projectRoot: signerRoot,
    releaseCommit: signerReleaseCommit,
    inspectCheckout: signerRuntime().inspectSignerCheckout,
    readFile: signerRuntime().readSignerFile,
  });
  assert.equal(signer.ok, true, signer.ok ? '' : signer.reason);
  const authorization = sealAuthorization({
    protocolVersion: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_VERSION,
    scope: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE,
    approvalId: '',
    granted: true,
    identitySha256: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
    controlTemplateSha256: identityHashTools.hashStage8OfflineIdentity(identityBundle.controlTemplate),
    hostRunId: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
    targetRunId: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID,
    taskName: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME,
    runtimeReleaseCommit: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
    signer: signer.value,
    outputRoot: path.win32.join(osTempRoot, 'WannianMahjong', 'Stage8', identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID, 'control-approval'),
    authorizationInputSha256: '',
  });
  const validateIdentityBundle = () => ({ ok: true, value: { identitySha256: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256 } });
  const baseInput = { authorization, identityBundle, expectedOsTempRoot: osTempRoot, ...signerRuntime(), validateIdentityBundle };

  const created = approvalTools.createStage8WindowsTaskControlApprovalEvidence(baseInput);
  assert.equal(created.ok, true, created.ok ? '' : created.reason);
  const verified = approvalTools.validateStage8WindowsTaskControlApprovalEvidence({ evidence: created.value, ...baseInput });
  assert.equal(verified.ok, true, verified.ok ? '' : verified.reason);
  assert.equal(created.value.scope, 'stage8-windows-task-host-control');
  assert.equal(created.value.phaseAuthorizationsIssued, 0);
  assert.equal(created.value.scheduledTasksMutated, 0);
  assert.equal(created.value.servicesMutated, 0);
  assert.equal(created.value.formalPathsRead, 0);
  assert.equal(created.value.formalPilotGamesCredited, 0);
  assert.doesNotThrow(() => hostTools.validateStage8WindowsTaskHostControl(created.value.control, { osTempRoot }));
  assert.equal(identityBundle.phaseAuthorizationRequests.every((entry) => entry.approval === null), true);

  expectFailure(baseInput, (value) => { value.scope = 'stage8-materials-emit'; }, /identity-invalid/);
  expectFailure(baseInput, (value) => { value.identitySha256 = '0'.repeat(64); }, /identity-invalid/);
  expectFailure(baseInput, (value) => { value.controlTemplateSha256 = '0'.repeat(64); }, /diagnostic-identity-mismatch/);
  expectFailure(baseInput, (value) => { value.hostRunId = 'formal-bc-corpus-pilot-20260913'; }, /identity-invalid/);
  expectFailure(baseInput, (value) => { value.targetRunId = 'formal-bc-corpus-pilot-20260910'; }, /identity-invalid/);
  expectFailure(baseInput, (value) => { value.taskName = 'Stage8-Host-conflict'; }, /identity-invalid/);
  expectFailure(baseInput, (value) => { value.runtimeReleaseCommit = '0'.repeat(40); }, /identity-invalid/);
  expectFailure(baseInput, (value) => { value.signer.releaseCommit = '0'.repeat(40); }, /signer-release-drift/);
  expectFailure(baseInput, (value) => { value.signer.files[0].sha256 = '0'.repeat(64); }, /signer-identity-mismatch/);
  expectFailure(baseInput, (value) => { value.signer.sourceBundleSha256 = '0'.repeat(64); }, /signer-identity-mismatch/);
  expectFailure(baseInput, (value) => { value.approvalId = 'stage8-windows-task-control-wrong'; }, /id-mismatch/);
  expectFailure(baseInput, (value) => { value.authorizationInputSha256 = '0'.repeat(64); }, /input-hash-mismatch/);
  expectFailure(baseInput, (value) => { value.outputRoot = 'relative'; }, /output-root-forbidden/, {}, true);
  expectFailure(baseInput, (value) => { value.outputRoot = path.win32.join(signerRoot, 'out'); }, /output-root-forbidden/, {}, true);
  expectFailure(baseInput, (value) => { value.outputRoot = 'E:\\WannianMahjongStage8\\artifacts\\control'; }, /output-root-forbidden/, {}, true);
  expectFailure(baseInput, (value) => { delete value.taskName; }, /schema-invalid/);
  expectFailure(baseInput, (value) => { value.unexpected = true; }, /schema-invalid/);
  expectFailure(baseInput, () => {}, /signer-release-drift/, signerRuntime({ clean: false }));
  expectFailure(baseInput, () => {}, /signer-release-drift/, signerRuntime({ headCommit: '0'.repeat(40) }));
  expectFailure(baseInput, () => {}, /signer-identity-mismatch/, signerRuntime({ mutateRead: (_absolutePath, bytes) => Buffer.concat([bytes, Buffer.from('drift')]) }));

  const changedEvidence = clone(created.value);
  changedEvidence.phaseAuthorizationsIssued = 1;
  const changedEvidenceResult = approvalTools.validateStage8WindowsTaskControlApprovalEvidence({ evidence: changedEvidence, ...baseInput });
  assert.deepEqual(changedEvidenceResult, { ok: false, reason: 'windows-task-control-approval-evidence-drift' });

  const cliDependencies = {
    identityBundle,
    authorization,
    osTempRoot,
    inspectCheckout: signerRuntime().inspectSignerCheckout,
    readFile: signerRuntime().readSignerFile,
    validateIdentityBundle,
  };
  const beforeCheck = fs.readdirSync(temporaryRoot).sort();
  const checked = runStage8WindowsTaskControlApproval(['--check', 'C:\\identity.json', 'C:\\authorization.json'], cliDependencies);
  assert.equal(checked.filesWritten, 0);
  assert.equal(checked.phaseAuthorizationsIssued, 0);
  assert.deepEqual(fs.readdirSync(temporaryRoot).sort(), beforeCheck);
  assert.throws(() => runStage8WindowsTaskControlApproval(['--emit', 'C:\\identity.json', 'C:\\authorization.json'], cliDependencies), /emit-gate-required/);

  let writeCalls = 0;
  const firstWriteFailure = captureEmitFailure(cliDependencies, nativeFileSystem({
    writeFileSync: (target, bytes, options) => {
      writeCalls += 1;
      if (writeCalls === 1) throw new Error('injected-first-write-failure');
      return fs.writeFileSync(target, bytes, options);
    },
  }));
  assertCleanEmitFailure(firstWriteFailure, authorization, 0, /injected-first-write-failure/);

  writeCalls = 0;
  const secondWriteFailure = captureEmitFailure(cliDependencies, nativeFileSystem({
    writeFileSync: (target, bytes, options) => {
      writeCalls += 1;
      if (writeCalls === 2) throw new Error('injected-second-write-failure');
      return fs.writeFileSync(target, bytes, options);
    },
  }));
  assertCleanEmitFailure(secondWriteFailure, authorization, 1, /injected-second-write-failure/);
  const serializedSecondWriteFailure = serializeStage8WindowsTaskControlApprovalFailure(secondWriteFailure);
  assert.equal(serializedSecondWriteFailure.filesWritten, 1);
  assert.equal(serializedSecondWriteFailure.filesRemaining, 0);
  assert.equal(serializedSecondWriteFailure.cleanupSucceeded, true);

  const roundtripFailure = captureEmitFailure(cliDependencies, nativeFileSystem({
    readFileSync: (target, encoding) => target.endsWith('host-control.json') ? 'injected-roundtrip-drift' : fs.readFileSync(target, encoding),
  }));
  assertCleanEmitFailure(roundtripFailure, authorization, 1, /write-roundtrip-failed/);

  const renameFailure = captureEmitFailure(cliDependencies, nativeFileSystem({
    renameSync: () => { throw new Error('injected-rename-failure'); },
  }));
  assertCleanEmitFailure(renameFailure, authorization, 2, /injected-rename-failure/);

  writeCalls = 0;
  const cleanupFailure = captureEmitFailure(cliDependencies, nativeFileSystem({
    writeFileSync: (target, bytes, options) => {
      writeCalls += 1;
      if (writeCalls === 2) throw new Error('injected-write-before-cleanup-failure');
      return fs.writeFileSync(target, bytes, options);
    },
    rmSync: () => { throw new Error('injected-staging-cleanup-failure'); },
  }));
  assert.match(cleanupFailure.message, /emit-cleanup-failed-residual/);
  assert.equal(cleanupFailure.failureEvidence.filesWritten, 1);
  assert.equal(cleanupFailure.failureEvidence.filesRemaining, 1);
  assert.equal(cleanupFailure.failureEvidence.outputRootExists, false);
  assert.equal(cleanupFailure.failureEvidence.stagingExists, true);
  assert.equal(cleanupFailure.failureEvidence.cleanupSucceeded, false);
  assert.match(cleanupFailure.failureEvidence.cleanupErrors.join(','), /injected-staging-cleanup-failure/);
  assert.equal(cleanupFailure.failureEvidence.phaseAuthorizationsIssued, 0);
  assert.equal(cleanupFailure.failureEvidence.scheduledTasksMutated, 0);
  assert.equal(cleanupFailure.failureEvidence.servicesMutated, 0);
  const serializedCleanupFailure = serializeStage8WindowsTaskControlApprovalFailure(cleanupFailure);
  assert.equal(serializedCleanupFailure.filesWritten, 1);
  assert.equal(serializedCleanupFailure.filesRemaining, 1);
  assert.equal(serializedCleanupFailure.stagingExists, true);
  assert.equal(serializedCleanupFailure.cleanupSucceeded, false);
  fs.rmSync(path.win32.join(osTempRoot, 'WannianMahjong'), { recursive: true, force: true });

  const parentCleanupFailure = captureEmitFailure(cliDependencies, nativeFileSystem({
    writeFileSync: () => { throw new Error('injected-write-before-parent-cleanup-failure'); },
    rmdirSync: () => { throw new Error('injected-parent-cleanup-failure'); },
  }));
  assert.match(parentCleanupFailure.message, /emit-cleanup-failed-residual/);
  assert.equal(parentCleanupFailure.failureEvidence.filesWritten, 0);
  assert.equal(parentCleanupFailure.failureEvidence.filesRemaining, 0);
  assert.equal(parentCleanupFailure.failureEvidence.outputRootExists, false);
  assert.equal(parentCleanupFailure.failureEvidence.stagingExists, false);
  assert.equal(parentCleanupFailure.failureEvidence.cleanupSucceeded, false);
  assert.ok(parentCleanupFailure.failureEvidence.directoriesRemaining > 0);
  assert.match(parentCleanupFailure.failureEvidence.cleanupErrors.join(','), /injected-parent-cleanup-failure/);
  fs.rmSync(path.win32.join(osTempRoot, 'WannianMahjong'), { recursive: true, force: true });

  const emitted = runStage8WindowsTaskControlApproval(['--emit', 'C:\\identity.json', 'C:\\authorization.json'], {
    ...cliDependencies,
    environment: { STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_EMIT: '1' },
  });
  assert.equal(emitted.filesWritten, 2);
  assert.equal(emitted.phaseAuthorizationsIssued, 0);
  assert.deepEqual(fs.readdirSync(authorization.outputRoot).sort(), ['control-approval-evidence.json', 'host-control.json']);
  const outputBytes = new Map(fs.readdirSync(authorization.outputRoot).map((name) => [name, fs.readFileSync(path.join(authorization.outputRoot, name), 'utf8')]));
  const duplicateFailure = captureEmitFailure(cliDependencies, nativeFileSystem());
  assert.match(duplicateFailure.message, /output-exists/);
  assert.equal(duplicateFailure.failureEvidence.filesWritten, 0);
  assert.equal(duplicateFailure.failureEvidence.filesRemaining, 2);
  assert.equal(duplicateFailure.failureEvidence.preexistingOutputRoot, true);
  assert.equal(duplicateFailure.failureEvidence.preexistingStaging, false);
  assert.equal(duplicateFailure.failureEvidence.cleanupAttempted, false);
  const serializedDuplicateFailure = serializeStage8WindowsTaskControlApprovalFailure(duplicateFailure);
  assert.equal(serializedDuplicateFailure.filesWritten, 0);
  assert.equal(serializedDuplicateFailure.preexistingOutputRoot, true);
  assert.equal(fs.existsSync(`${authorization.outputRoot}.partial`), false);
  for (const [name, bytes] of outputBytes) assert.equal(fs.readFileSync(path.join(authorization.outputRoot, name), 'utf8'), bytes);

  const cliVerified = runStage8WindowsTaskControlApproval(['--verify', authorization.outputRoot, 'C:\\identity.json', 'C:\\authorization.json'], cliDependencies);
  assert.equal(cliVerified.filesWritten, 0);
  assert.equal(cliVerified.phaseAuthorizationsIssued, 0);
  assert.throws(() => runStage8WindowsTaskControlApproval(['--verify', path.win32.join(osTempRoot, 'other'), 'C:\\identity.json', 'C:\\authorization.json'], cliDependencies), /verify-root-forbidden/);
  writeExclusive(path.join(authorization.outputRoot, 'unexpected.json'), '{}');
  assert.throws(() => runStage8WindowsTaskControlApproval(['--verify', authorization.outputRoot, 'C:\\identity.json', 'C:\\authorization.json'], cliDependencies), /output-schema-invalid/);

  console.log(JSON.stringify({
    passed: true,
    scope: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE,
    identitySha256: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
    approvalId: authorization.approvalId,
    filesWrittenByCheck: 0,
    temporaryFilesWrittenByEmit: 2,
    injectedEmitFailuresCovered: 6,
    phaseAuthorizationsIssued: 0,
    scheduledTasksMutated: 0,
    servicesMutated: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  }, null, 2));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
