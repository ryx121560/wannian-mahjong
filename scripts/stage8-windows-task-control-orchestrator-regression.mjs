import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  buildStage8WindowsTaskControlApprovalInputMaterials,
} from './stage8-windows-task-control-approval-input.mjs';
import {
  runStage8WindowsTaskControlOrchestrator,
  serializeStage8WindowsTaskControlOrchestratorFailure,
} from './stage8-windows-task-control-orchestrator.mjs';
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

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-windows-task-control-orchestrator-'));
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

function diagnosticRuntime() {
  const request = identityTools.buildStage8WindowsTaskDiagnosticIdentityInput({ projectRoot: runtimeRoot, nodeExecutablePath, osTempRoot, userSid });
  return {
    request,
    expected: { projectRoot: runtimeRoot, nodeExecutablePath, osTempRoot },
    inspectCheckout: () => ({ headCommit: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT, clean: true }),
    readFile: (absolutePath) => fs.readFileSync(absolutePath),
  };
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
  const validateIdentityBundle = () => ({
    ok: true,
    value: { identitySha256: approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256 },
  });
  const environment = {
    STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_AUTHORIZED: '1',
    STAGE8_WINDOWS_TASK_CONTROL_ORCHESTRATOR_EMIT: '1',
  };
  const dependencies = {
    environment,
    nodeExecutablePath,
    osTempRoot,
    inspectCheckout: (projectRootValue) => path.win32.resolve(projectRootValue).toLowerCase() === path.win32.resolve(runtimeRoot).toLowerCase()
      ? { headCommit: identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT, clean: true }
      : { headCommit: inputTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_RELEASE, clean: true },
    readFile: (absolutePath) => fs.readFileSync(absolutePath),
    runIdentityCheck: () => identityCheck,
    validateIdentityBundle,
  };
  const baseArgs = ['--runtime-root', runtimeRoot, '--signer-root', signerRoot, '--user-sid', userSid, '--product-approved-control-only'];
  const builderArgs = ['--check', ...baseArgs];
  const materials = buildStage8WindowsTaskControlApprovalInputMaterials(builderArgs, dependencies);
  const outputRoot = materials.authorization.outputRoot;
  assert.equal(identityBundle.phaseAuthorizationRequests.every((request) => request.approval === null), true);
  assert.deepEqual(identityBundle.phaseAuthorizationRequests.map((request) => request.action), ['materials-emit', 'register', 'run', 'verify', 'delete']);

  const beforeCheck = snapshot(temporaryRoot);
  const checked = runStage8WindowsTaskControlOrchestrator(['--check', ...baseArgs], dependencies);
  assert.equal(checked.status, 'checked');
  assert.equal(checked.filesWritten, 0);
  assert.equal(checked.filesVerified, 0);
  assert.equal(checked.identityBundlesPersisted, 0);
  assert.equal(checked.approvalInputsPersisted, 0);
  assert.equal(checked.phaseAuthorizationsIssued, 0);
  assert.equal(checked.scheduledTasksRead, 0);
  assert.equal(checked.scheduledTasksMutated, 0);
  assert.equal(checked.servicesRead, 0);
  assert.equal(checked.servicesMutated, 0);
  assert.equal(checked.formalPathsRead, 0);
  assert.equal(checked.formalPilotGamesCredited, 0);
  assert.deepEqual(snapshot(temporaryRoot), beforeCheck);
  assert.throws(() => runStage8WindowsTaskControlOrchestrator(['--emit', ...baseArgs], dependencies), /usage/);
  assert.throws(() => runStage8WindowsTaskControlOrchestrator(['--emit-and-verify', ...baseArgs], {
    ...dependencies,
    environment: { STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_AUTHORIZED: '1' },
  }), /orchestrator-emit-gate-required/);
  assert.throws(() => runStage8WindowsTaskControlOrchestrator(['--check', ...baseArgs], {
    ...dependencies,
    environment: {},
  }), /product-gate-required/);

  const emitted = runStage8WindowsTaskControlOrchestrator(['--emit-and-verify', ...baseArgs], dependencies);
  assert.equal(emitted.status, 'emitted-and-verified');
  assert.equal(emitted.filesWritten, 2);
  assert.equal(emitted.filesVerified, 2);
  assert.equal(emitted.identityBundlesPersisted, 0);
  assert.equal(emitted.approvalInputsPersisted, 0);
  assert.equal(emitted.phaseAuthorizationsIssued, 0);
  assert.equal(emitted.scheduledTasksRead, 0);
  assert.equal(emitted.scheduledTasksMutated, 0);
  assert.equal(emitted.servicesRead, 0);
  assert.equal(emitted.servicesMutated, 0);
  assert.equal(emitted.formalPathsRead, 0);
  assert.deepEqual(fs.readdirSync(outputRoot).sort(), ['control-approval-evidence.json', 'host-control.json']);
  assert.equal(fs.existsSync(`${outputRoot}.partial`), false);
  const evidence = JSON.parse(fs.readFileSync(path.join(outputRoot, 'control-approval-evidence.json'), 'utf8'));
  const control = JSON.parse(fs.readFileSync(path.join(outputRoot, 'host-control.json'), 'utf8'));
  assert.equal(evidence.phaseAuthorizationsIssued, 0);
  assert.deepEqual(evidence.control, control);
  assert.equal(evidence.controlManifestSha256, emitted.controlManifestSha256);
  assert.equal(evidence.evidenceSha256, emitted.evidenceSha256);
  assert.equal(fs.existsSync(path.join(outputRoot, 'identity-bundle.json')), false);
  assert.equal(fs.existsSync(path.join(outputRoot, 'control-approval-input.json')), false);

  const outputSnapshot = snapshot(outputRoot);
  let duplicateFailure;
  try {
    runStage8WindowsTaskControlOrchestrator(['--emit-and-verify', ...baseArgs], dependencies);
    assert.fail('expected duplicate output failure');
  } catch (error) {
    duplicateFailure = serializeStage8WindowsTaskControlOrchestratorFailure(error);
  }
  assert.match(duplicateFailure.error, /output-exists/);
  assert.equal(duplicateFailure.filesWritten, 0);
  assert.deepEqual(snapshot(outputRoot), outputSnapshot);
  fs.rmSync(path.win32.join(osTempRoot, 'WannianMahjong'), { recursive: true, force: true });

  let verifyFailure;
  const tamperingSigner = (argv, signerDependencies) => {
    const result = runStage8WindowsTaskControlApproval(argv, signerDependencies);
    if (argv[0] === '--emit') {
      fs.writeFileSync(path.join(signerDependencies.authorization.outputRoot, 'unexpected.json'), '{}\n', { encoding: 'utf8', flag: 'wx' });
    }
    return result;
  };
  try {
    runStage8WindowsTaskControlOrchestrator(['--emit-and-verify', ...baseArgs], { ...dependencies, runSigner: tamperingSigner });
    assert.fail('expected verify failure');
  } catch (error) {
    verifyFailure = serializeStage8WindowsTaskControlOrchestratorFailure(error);
  }
  assert.match(verifyFailure.error, /orchestrator-verify-failed/);
  assert.equal(verifyFailure.filesWritten, 2);
  assert.equal(verifyFailure.filesRemaining, 3);
  assert.equal(verifyFailure.outputRootExists, true);
  assert.equal(verifyFailure.verificationCompleted, false);
  assert.equal(verifyFailure.phaseAuthorizationsIssued, 0);
  assert.equal(verifyFailure.scheduledTasksMutated, 0);
  assert.equal(verifyFailure.servicesMutated, 0);
  assert.deepEqual(fs.readdirSync(outputRoot).sort(), ['control-approval-evidence.json', 'host-control.json', 'unexpected.json']);

  console.log(JSON.stringify({
    passed: true,
    scope: emitted.scope,
    authorizationInputSha256: emitted.authorizationInputSha256,
    controlManifestSha256: emitted.controlManifestSha256,
    evidenceSha256: emitted.evidenceSha256,
    temporaryFilesWritten: 2,
    temporaryFilesVerified: 2,
    identityBundlesPersisted: 0,
    approvalInputsPersisted: 0,
    phaseAuthorizationsIssued: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  }, null, 2));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
