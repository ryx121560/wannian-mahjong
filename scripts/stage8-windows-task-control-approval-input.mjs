import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { runStage8WindowsTaskControlApproval } from './stage8-windows-task-control-approval.mjs';
import { runStage8WindowsTaskDiagnosticIdentityCheck } from './stage8-windows-task-diagnostic-identity.mjs';

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

const inputTools = loadTs('../src/game/stage8/offline-windows-task-control-approval-input.ts');
const approvalTools = loadTs('../src/game/stage8/offline-windows-task-control-approval.ts');
const identityTools = loadTs('../src/game/stage8/offline-windows-task-diagnostic-identity.ts');
const identityHashTools = loadTs('../src/game/stage8/offline-action-identity.ts');

function samePath(left, right) {
  return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase();
}

function isInside(parent, child) {
  const normalizedParent = path.win32.resolve(parent).toLowerCase();
  const normalizedChild = path.win32.resolve(child).toLowerCase();
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${path.win32.sep}`);
}

function parseArgs(argv) {
  if (argv.length !== 8
    || argv[0] !== '--check'
    || argv[1] !== '--runtime-root'
    || argv[3] !== '--signer-root'
    || argv[5] !== '--user-sid'
    || argv[7] !== '--product-approved-control-only') {
    throw new Error('usage: node stage8-windows-task-control-approval-input.mjs --check --runtime-root <clean-fae-root> --signer-root <clean-5a2-root> --user-sid <sid> --product-approved-control-only');
  }
  if (!path.win32.isAbsolute(argv[2]) || !path.win32.isAbsolute(argv[4])) {
    throw new Error('windows-task-control-approval-input-root-must-be-absolute');
  }
  return {
    runtimeRoot: path.win32.resolve(argv[2]),
    signerRoot: path.win32.resolve(argv[4]),
    userSid: argv[6],
  };
}

function inspectCheckout(projectRoot) {
  const prefix = ['-c', `safe.directory=${projectRoot}`, '-C', projectRoot];
  const head = spawnSync('git', [...prefix, 'rev-parse', 'HEAD'], { encoding: 'utf8', shell: false, windowsHide: true });
  const status = spawnSync('git', [...prefix, 'status', '--porcelain'], { encoding: 'utf8', shell: false, windowsHide: true });
  if (head.status !== 0 || status.status !== 0) throw new Error('windows-task-control-approval-input-git-inspection-failed');
  return { headCommit: head.stdout.trim().toLowerCase(), clean: status.stdout.trim() === '' };
}

function createProductDecision() {
  const payload = {
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
  };
  return { ...payload, decisionSha256: inputTools.hashStage8WindowsTaskControlProductDecision(payload) };
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function runStage8WindowsTaskControlApprovalInputCheck(argv = process.argv.slice(2), dependencies = {}) {
  if ((dependencies.environment ?? process.env).STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_AUTHORIZED !== '1') {
    throw new Error('windows-task-control-approval-input-product-gate-required');
  }
  const parsed = parseArgs(argv);
  const nodeExecutablePath = dependencies.nodeExecutablePath ?? process.execPath;
  const osTempRoot = dependencies.osTempRoot ?? os.tmpdir();
  const request = identityTools.buildStage8WindowsTaskDiagnosticIdentityInput({
    projectRoot: parsed.runtimeRoot,
    nodeExecutablePath,
    osTempRoot,
    userSid: parsed.userSid,
  });
  const targetRoot = path.win32.join(osTempRoot, 'WannianMahjong', 'Stage8', identityTools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID);
  const allowedReads = new Set([
    path.win32.resolve(nodeExecutablePath).toLowerCase(),
    ...Object.values(request.sourcePaths).map((value) => path.win32.resolve(value).toLowerCase()),
    ...approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SIGNER_FILES
      .map((relativePath) => path.win32.resolve(parsed.signerRoot, relativePath).toLowerCase()),
  ]);
  let targetRootReads = 0;
  let formalPathsRead = 0;
  const baseReadFile = dependencies.readFile ?? ((absolutePath) => fs.readFileSync(absolutePath));
  const readFile = (absolutePath) => {
    const normalized = path.win32.resolve(absolutePath);
    if (isInside(targetRoot, normalized)) {
      targetRootReads += 1;
      throw new Error('windows-task-control-approval-input-target-root-read-forbidden');
    }
    if (allowedReads.has(normalized.toLowerCase())) return baseReadFile(absolutePath);
    if (/^e:\\/i.test(normalized)) {
      formalPathsRead += 1;
      throw new Error('windows-task-control-approval-input-formal-path-read-forbidden');
    }
    throw new Error('windows-task-control-approval-input-read-not-allowlisted');
  };
  const baseInspectCheckout = dependencies.inspectCheckout ?? inspectCheckout;
  const inspect = (projectRoot) => {
    if (!samePath(projectRoot, parsed.runtimeRoot) && !samePath(projectRoot, parsed.signerRoot)) {
      throw new Error('windows-task-control-approval-input-checkout-not-allowlisted');
    }
    return baseInspectCheckout(projectRoot);
  };
  const validateIdentityBundle = dependencies.validateIdentityBundle ?? ((bundle) => identityTools.validateStage8WindowsTaskDiagnosticIdentityBundle({
    bundle,
    expected: { projectRoot: parsed.runtimeRoot, nodeExecutablePath, osTempRoot },
    inspectCheckout: inspect,
    readFile,
  }));
  const decision = dependencies.productDecision ?? createProductDecision();
  const runIdentityCheck = dependencies.runIdentityCheck ?? runStage8WindowsTaskDiagnosticIdentityCheck;
  const runApprovalCheck = dependencies.runApprovalCheck ?? runStage8WindowsTaskControlApproval;

  const executeOnce = () => {
    const identityCheck = runIdentityCheck([
      '--check', '--source-root', parsed.runtimeRoot, '--user-sid', parsed.userSid,
    ], { nodeExecutablePath, osTempRoot, inspectCheckout: inspect, readFile });
    if (identityCheck.identitySha256 !== approvalTools.STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256) {
      throw new Error('windows-task-control-approval-input-identity-sha-mismatch');
    }
    const created = inputTools.createStage8WindowsTaskControlApprovalInput({
      decision,
      identityBundle: identityCheck.bundle,
      signerProjectRoot: parsed.signerRoot,
      expectedOsTempRoot: osTempRoot,
      inspectSignerCheckout: inspect,
      readSignerFile: readFile,
      validateIdentityBundle,
    });
    if (!created.ok) throw new Error(created.reason);
    const checked = runApprovalCheck([
      '--check', 'C:\\in-memory-diagnostic-identity.json', 'C:\\in-memory-control-approval-input.json',
    ], {
      identityBundle: identityCheck.bundle,
      authorization: created.value,
      osTempRoot,
      inspectCheckout: inspect,
      readFile,
      validateIdentityBundle,
    });
    const checkIdentitySha256 = identityHashTools.hashStage8OfflineIdentity({
      decisionSha256: decision.decisionSha256,
      identitySha256: created.value.identitySha256,
      controlTemplateSha256: created.value.controlTemplateSha256,
      signerReleaseCommit: created.value.signer.releaseCommit,
      signerSourceBundleSha256: created.value.signer.sourceBundleSha256,
      authorizationInputSha256: created.value.authorizationInputSha256,
      approvalId: created.value.approvalId,
      controlManifestSha256: checked.controlManifestSha256,
      evidenceSha256: checked.evidenceSha256,
    });
    return {
      ok: true,
      status: 'checked',
      scope: created.value.scope,
      identitySha256: created.value.identitySha256,
      controlTemplateSha256: created.value.controlTemplateSha256,
      signerReleaseCommit: created.value.signer.releaseCommit,
      signerSourceBundleSha256: created.value.signer.sourceBundleSha256,
      productDecisionSha256: decision.decisionSha256,
      approvalId: created.value.approvalId,
      authorizationInputSha256: created.value.authorizationInputSha256,
      controlManifestSha256: checked.controlManifestSha256,
      evidenceSha256: checked.evidenceSha256,
      checkIdentitySha256,
      filesWritten: 0,
      phaseAuthorizationsIssued: 0,
      scheduledTasksRead: 0,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      targetRootReads,
      formalPathsRead,
      formalPilotGamesCredited: 0,
    };
  };

  const first = executeOnce();
  const firstBytes = serialize(first);
  const second = executeOnce();
  if (firstBytes !== serialize(second)) throw new Error('windows-task-control-approval-input-repeated-check-drift');
  return { ...first, repeatedCheckByteIdentical: true };
}

export function serializeStage8WindowsTaskControlApprovalInputCheck(result) {
  return serialize(result);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(serializeStage8WindowsTaskControlApprovalInputCheck(runStage8WindowsTaskControlApprovalInputCheck()));
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      status: 'fused',
      error: error instanceof Error ? error.message : String(error),
      filesWritten: 0,
      phaseAuthorizationsIssued: 0,
      scheduledTasksRead: 0,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      targetRootReads: 0,
      formalPathsRead: 0,
      formalPilotGamesCredited: 0,
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
