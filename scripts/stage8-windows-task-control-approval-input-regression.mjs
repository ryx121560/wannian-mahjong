import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  runStage8WindowsTaskControlApprovalInputCheck,
  serializeStage8WindowsTaskControlApprovalInputCheck,
} from './stage8-windows-task-control-approval-input.mjs';
import { runStage8WindowsTaskControlApproval } from './stage8-windows-task-control-approval.mjs';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
}).outputText, filename);
const inputTools = require('../src/game/stage8/offline-windows-task-control-approval-input.ts');
const approvalTools = require('../src/game/stage8/offline-windows-task-control-approval.ts');
const identityTools = require('../src/game/stage8/offline-windows-task-diagnostic-identity.ts');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-windows-task-control-approval-input-'));
const runtimeRoot = path.join(temporaryRoot, 'runtime-source');
const signerRoot = path.join(temporaryRoot, 'signer-source');
const osTempRoot = path.join(temporaryRoot, 'os-temp');
const nodeExecutablePath = path.join(temporaryRoot, 'runtime', 'node.exe');
const userSid = 'S-1-5-21-1111111111-2222222222-3333333333-1001';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeExclusive(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}

function snapshot(root) {
  const entries = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else entries.push({ path: path.relative(root, absolute), sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') });
    }
  };
  visit(root);
  return entries;
}

function productDecision(overrides = {}) {
  const base = {
    protocolVersion: inputTools.STAGE8_WINDOWS_TASK_CONTROL_PRODUCT_DECISION_VERSION,
    scope: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE,
    granted: true,
    checkOnly: true,
    identitySha256: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
    signerReleaseCommit: inputTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_RELEASE,
    runtimeReleaseCommit: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
    hostRunId: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
    targetRunId: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID,
    taskName: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME,
    phaseAuthorizations: { 'materials-emit': false, register: false, run: false, verify: false, delete: false },
    ...overrides,
  };
  return { ...base, decisionSha256: inputTools.hashStage8WindowsTaskControlProductDecision(base) };
}

function diagnosticRuntime() {
  const request = identityTools.buildStage8WindowsTaskDiagnosticIdentityInput({ projectRoot: runtimeRoot, nodeExecutablePath, osTempRoot, userSid });
  return {
    request,
    expected: { projectRoot: runtimeRoot, nodeExecutablePath, osTempRoot },
    inspectCheckout: () => ({ headCommit: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT, clean: true }),
    readFile: (absolutePath) => fs.readFileSync(absolutePath),
  };
}

function signerRuntime({ clean = true, headCommit = inputTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_RELEASE, mutateRead } = {}) {
  return {
    inspectSignerCheckout: () => ({ headCommit, clean }),
    readSignerFile: (absolutePath) => {
      const bytes = fs.readFileSync(absolutePath);
      return mutateRead ? mutateRead(absolutePath, bytes) : bytes;
    },
  };
}

function validateIdentityBundle() {
  return { ok: true, value: { identitySha256: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256 } };
}

function expectDecisionFailure(mutator, reason) {
  const decision = productDecision();
  mutator(decision);
  const result = inputTools.validateStage8WindowsTaskControlProductDecision(decision);
  assert.equal(result.ok, false);
  assert.match(result.reason, reason);
}

function expectAuthorizationFailure(base, mutator, reason) {
  const authorization = clone(base.authorization);
  mutator(authorization);
  const result = approvalTools.validateStage8WindowsTaskControlApprovalInput({ ...base, authorization });
  assert.equal(result.ok, false);
  assert.match(result.reason, reason);
}

try {
  fs.mkdirSync(osTempRoot, { recursive: true });
  writeExclusive(nodeExecutablePath, 'node-runtime-v1');
  writeExclusive(path.join(runtimeRoot, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.hostRunner), 'host-runner-v1');
  writeExclusive(path.join(runtimeRoot, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.diagnostic), 'diagnostic-v1');
  writeExclusive(path.join(runtimeRoot, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.controlProtocol), 'control-protocol-v1');
  writeExclusive(path.join(runtimeRoot, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.identity), 'identity-v1');
  for (const relativePath of approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SIGNER_FILES) {
    const publishedBytes = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
    writeExclusive(path.join(signerRoot, relativePath), publishedBytes);
  }

  const diagnostic = identityTools.createStage8WindowsTaskDiagnosticIdentityBundle(diagnosticRuntime());
  assert.equal(diagnostic.ok, true, diagnostic.ok ? '' : diagnostic.reason);
  const identityBundle = clone(diagnostic.value);
  identityBundle.identitySha256 = approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256;
  const builderBase = {
    decision: productDecision(),
    identityBundle,
    signerProjectRoot: signerRoot,
    expectedOsTempRoot: osTempRoot,
    ...signerRuntime(),
    validateIdentityBundle,
  };
  const created = inputTools.createStage8WindowsTaskControlApprovalInput(builderBase);
  assert.equal(created.ok, true, created.ok ? '' : created.reason);
  assert.equal(created.value.scope, 'stage8-windows-task-host-control');
  assert.equal(created.value.granted, true);
  assert.equal(created.value.signer.releaseCommit, inputTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_RELEASE);
  assert.equal(created.value.identitySha256, approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256);
  assert.equal(created.value.runtimeReleaseCommit, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT);
  assert.equal(created.value.hostRunId, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID);
  assert.equal(created.value.targetRunId, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID);
  assert.equal(created.value.taskName, identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME);

  expectDecisionFailure((value) => { value.signerReleaseCommit = '0'.repeat(40); }, /policy-drift/);
  expectDecisionFailure((value) => { value.identitySha256 = '0'.repeat(64); }, /policy-drift/);
  expectDecisionFailure((value) => { value.hostRunId = 'formal-bc-corpus-pilot-20260913'; }, /policy-drift/);
  expectDecisionFailure((value) => { value.targetRunId = 'formal-bc-corpus-pilot-20260910'; }, /policy-drift/);
  expectDecisionFailure((value) => { value.taskName = 'Stage8-Host-old-pilot'; }, /policy-drift/);
  expectDecisionFailure((value) => { value.runtimeReleaseCommit = '0'.repeat(40); }, /policy-drift/);
  expectDecisionFailure((value) => { value.scope = 'materials-emit'; }, /policy-drift/);
  expectDecisionFailure((value) => { value.phaseAuthorizations.run = true; }, /policy-drift/);
  expectDecisionFailure((value) => { delete value.taskName; }, /schema-invalid/);
  expectDecisionFailure((value) => { value.extra = true; }, /schema-invalid/);
  expectDecisionFailure((value) => { value.decisionSha256 = '0'.repeat(64); }, /hash-mismatch/);

  const dirtySigner = inputTools.createStage8WindowsTaskControlApprovalInput({ ...builderBase, ...signerRuntime({ clean: false }) });
  assert.deepEqual(dirtySigner, { ok: false, reason: 'windows-task-control-approval-signer-release-drift' });
  const wrongSigner = inputTools.createStage8WindowsTaskControlApprovalInput({ ...builderBase, ...signerRuntime({ headCommit: '0'.repeat(40) }) });
  assert.deepEqual(wrongSigner, { ok: false, reason: 'windows-task-control-approval-signer-release-drift' });
  const signerDrift = inputTools.createStage8WindowsTaskControlApprovalInput({
    ...builderBase,
    ...signerRuntime({ mutateRead: (_absolutePath, bytes) => Buffer.concat([bytes, Buffer.from('drift')]) }),
  });
  assert.deepEqual(signerDrift, { ok: false, reason: 'windows-task-control-approval-input-signer-source-drift' });

  const validatorBase = {
    authorization: created.value,
    identityBundle,
    expectedOsTempRoot: osTempRoot,
    ...signerRuntime(),
    validateIdentityBundle,
  };
  expectAuthorizationFailure(validatorBase, (value) => { value.identitySha256 = '0'.repeat(64); }, /identity-invalid/);
  expectAuthorizationFailure(validatorBase, (value) => { value.controlTemplateSha256 = '0'.repeat(64); }, /diagnostic-identity-mismatch/);
  expectAuthorizationFailure(validatorBase, (value) => { value.hostRunId = 'formal-bc-corpus-pilot-20260913'; }, /identity-invalid/);
  expectAuthorizationFailure(validatorBase, (value) => { value.targetRunId = 'formal-bc-corpus-pilot-20260910'; }, /identity-invalid/);
  expectAuthorizationFailure(validatorBase, (value) => { value.taskName = 'Stage8-Host-old-pilot'; }, /identity-invalid/);
  expectAuthorizationFailure(validatorBase, (value) => { value.runtimeReleaseCommit = '0'.repeat(40); }, /identity-invalid/);
  expectAuthorizationFailure(validatorBase, (value) => { value.outputRoot = path.win32.join(signerRoot, 'output'); }, /input-hash-mismatch/);
  expectAuthorizationFailure(validatorBase, (value) => { value.scope = 'register'; }, /identity-invalid/);
  expectAuthorizationFailure(validatorBase, (value) => { value.approvalId = 'wrong-approval'; }, /id-mismatch/);
  expectAuthorizationFailure(validatorBase, (value) => { value.authorizationInputSha256 = '0'.repeat(64); }, /input-hash-mismatch/);
  expectAuthorizationFailure(validatorBase, (value) => { delete value.taskName; }, /schema-invalid/);
  expectAuthorizationFailure(validatorBase, (value) => { value.extra = true; }, /schema-invalid/);

  const before = snapshot(temporaryRoot);
  const identityCheck = {
    ok: true,
    status: 'checked',
    identitySha256: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
    bundle: identityBundle,
    filesWritten: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    targetRootReads: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  };
  const cliDependencies = {
    environment: { STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_AUTHORIZED: '1' },
    nodeExecutablePath,
    osTempRoot,
    inspectCheckout: (projectRoot) => path.win32.resolve(projectRoot).toLowerCase() === path.win32.resolve(runtimeRoot).toLowerCase()
      ? { headCommit: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT, clean: true }
      : { headCommit: inputTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_RELEASE, clean: true },
    readFile: (absolutePath) => fs.readFileSync(absolutePath),
    runIdentityCheck: () => identityCheck,
    validateIdentityBundle,
  };
  const argv = ['--check', '--runtime-root', runtimeRoot, '--signer-root', signerRoot, '--user-sid', userSid, '--product-approved-control-only'];
  assert.throws(() => runStage8WindowsTaskControlApprovalInputCheck(argv, { ...cliDependencies, environment: {} }), /product-gate-required/);
  const result = runStage8WindowsTaskControlApprovalInputCheck(argv, cliDependencies);
  assert.equal(result.repeatedCheckByteIdentical, true);
  assert.equal(result.filesWritten, 0);
  assert.equal(result.phaseAuthorizationsIssued, 0);
  assert.equal(result.scheduledTasksRead, 0);
  assert.equal(result.scheduledTasksMutated, 0);
  assert.equal(result.servicesRead, 0);
  assert.equal(result.servicesMutated, 0);
  assert.equal(result.targetRootReads, 0);
  assert.equal(result.formalPathsRead, 0);
  assert.equal(result.formalPilotGamesCredited, 0);
  assert.equal(serializeStage8WindowsTaskControlApprovalInputCheck(result), serializeStage8WindowsTaskControlApprovalInputCheck(runStage8WindowsTaskControlApprovalInputCheck(argv, cliDependencies)));
  assert.deepEqual(snapshot(temporaryRoot), before);

  const phaseDecision = productDecision();
  phaseDecision.phaseAuthorizations.verify = true;
  assert.throws(() => runStage8WindowsTaskControlApprovalInputCheck(argv, { ...cliDependencies, productDecision: phaseDecision }), /policy-drift/);

  console.log(JSON.stringify({
    passed: true,
    scope: result.scope,
    identitySha256: result.identitySha256,
    signerReleaseCommit: result.signerReleaseCommit,
    authorizationInputSha256: result.authorizationInputSha256,
    checkIdentitySha256: result.checkIdentitySha256,
    repeatedCheckByteIdentical: true,
    filesWritten: 0,
    phaseAuthorizationsIssued: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    targetRootReads: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  }, null, 2));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
