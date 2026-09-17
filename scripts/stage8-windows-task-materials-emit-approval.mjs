import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);

function loadTools() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
  try { return require('../src/game/stage8/offline-windows-task-materials-emit-approval.ts'); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const tools = loadTools();

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--check' || argv[1] !== '--signer-root' || argv[3] !== '--product-approved-materials-emit-only') {
    throw new Error('usage: node stage8-windows-task-materials-emit-approval.mjs --check --signer-root <clean-published-root> --product-approved-materials-emit-only');
  }
  if (!path.win32.isAbsolute(argv[2])) throw new Error('windows-task-materials-emit-signer-root-must-be-absolute');
  return { signerRoot: path.win32.resolve(argv[2]) };
}

function inspectCheckout(projectRoot) {
  const prefix = ['-c', `safe.directory=${projectRoot}`, '-C', projectRoot];
  const head = spawnSync('git', [...prefix, 'rev-parse', 'HEAD'], { encoding: 'utf8', shell: false, windowsHide: true });
  const status = spawnSync('git', [...prefix, 'status', '--porcelain'], { encoding: 'utf8', shell: false, windowsHide: true });
  const sourceRelease = spawnSync('git', [
    ...prefix, 'log', '-1', '--format=%H', '--', ...tools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SIGNER_FILES,
  ], { encoding: 'utf8', shell: false, windowsHide: true });
  if (head.status !== 0 || status.status !== 0 || sourceRelease.status !== 0) throw new Error('windows-task-materials-emit-git-inspection-failed');
  return {
    headCommit: head.stdout.trim().toLowerCase(),
    clean: status.stdout.trim() === '',
    sourceReleaseCommit: sourceRelease.stdout.trim().toLowerCase(),
  };
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }

export function buildStage8WindowsTaskMaterialsEmitApprovalCheck(argv = process.argv.slice(2), dependencies = {}) {
  if ((dependencies.environment ?? process.env).STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_CHECK !== '1') {
    throw new Error('windows-task-materials-emit-product-gate-required');
  }
  const parsed = parseArgs(argv);
  const osTempRoot = dependencies.osTempRoot ?? os.tmpdir();
  const formalRoot = tools.deriveStage8WindowsTaskMaterialsEmitFormalRoot(osTempRoot);
  const controlPath = path.win32.join(formalRoot, 'host-control.json');
  const evidencePath = path.win32.join(formalRoot, 'control-approval-evidence.json');
  const readFile = dependencies.readFile ?? ((absolutePath) => fs.readFileSync(absolutePath));
  let formalControlFilesRead = 0;
  const readFormalFile = (absolutePath) => {
    if (![controlPath, evidencePath].some((allowed) => path.win32.resolve(allowed).toLowerCase() === path.win32.resolve(absolutePath).toLowerCase())) {
      throw new Error('windows-task-materials-emit-formal-read-not-allowlisted');
    }
    formalControlFilesRead += 1;
    return readFile(absolutePath);
  };
  const controlBytes = readFormalFile(controlPath);
  const evidenceBytes = readFormalFile(evidencePath);
  const formal = tools.validateStage8WindowsTaskMaterialsEmitFormalPair({ controlBytes, evidenceBytes, osTempRoot });
  if (!formal.ok) throw new Error(formal.reason);
  const inspect = dependencies.inspectCheckout ?? inspectCheckout;
  const signer = tools.collectStage8WindowsTaskMaterialsEmitSignerIdentity({
    projectRoot: parsed.signerRoot,
    inspectCheckout: inspect,
    readFile,
  });
  if (!signer.ok) throw new Error(signer.reason);
  const decision = dependencies.productDecision ?? tools.createStage8WindowsTaskMaterialsEmitProductDecision({ signer: signer.value, targets: formal.value.targets });
  const authorization = tools.createStage8WindowsTaskMaterialsEmitApprovalInput({ decision, signer: signer.value, targets: formal.value.targets });
  if (!authorization.ok) throw new Error(authorization.reason);
  return { formal: formal.value, signer: signer.value, decision, authorization: authorization.value, formalControlFilesRead };
}

export function runStage8WindowsTaskMaterialsEmitApprovalCheck(argv = process.argv.slice(2), dependencies = {}) {
  const built = buildStage8WindowsTaskMaterialsEmitApprovalCheck(argv, dependencies);
  const checkOnce = () => {
    const checked = tools.checkStage8WindowsTaskMaterialsEmitApproval({
      authorization: built.authorization,
      decision: built.decision,
      signer: built.signer,
      formal: built.formal,
    });
    if (!checked.ok) throw new Error(checked.reason);
    return {
      ok: true,
      status: 'checked',
      scope: tools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE,
      action: tools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION,
      requestId: tools.STAGE8_WINDOWS_TASK_MATERIALS_EMIT_REQUEST_ID,
      diagnosticIdentitySha256: built.authorization.diagnosticIdentitySha256,
      controlManifestSha256: built.authorization.controlManifestSha256,
      controlEvidenceSha256: built.authorization.controlEvidenceSha256,
      runtimeReleaseCommit: built.authorization.runtimeReleaseCommit,
      runtimeSourceBundleSha256: built.authorization.runtimeSourceBundleSha256,
      signerReleaseCommit: built.signer.releaseCommit,
      signerSourceBundleSha256: built.signer.sourceBundleSha256,
      productDecisionSha256: built.decision.decisionSha256,
      approvalId: checked.value.approvalId,
      authorizationInputSha256: checked.value.authorizationInputSha256,
      candidateAuthorizationSha256: checked.value.authorizationSha256,
      checkIdentitySha256: checked.value.checkIdentitySha256,
      targetIdentitySha256: tools.hashStage8WindowsTaskMaterialsEmitTargets(built.authorization.targets),
      phaseApprovals: { 'materials-emit': null, register: null, run: null, verify: null, delete: null },
      filesWritten: 0,
      identityBundlesPersisted: 0,
      approvalInputsPersisted: 0,
      phaseAuthorizationsIssued: 0,
      materialsGenerated: 0,
      scheduledTasksRead: 0,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      diagnosticsRun: 0,
      formalPilotGamesCredited: 0,
    };
  };
  const first = checkOnce();
  const firstBytes = serialize(first);
  const second = checkOnce();
  if (firstBytes !== serialize(second)) throw new Error('windows-task-materials-emit-repeated-check-drift');
  return { ...first, repeatedCheckByteIdentical: true, formalControlFilesRead: built.formalControlFilesRead };
}

export function serializeStage8WindowsTaskMaterialsEmitApprovalFailure(error) {
  return {
    ok: false,
    status: 'fused',
    error: error instanceof Error ? error.message : String(error),
    filesWritten: 0,
    identityBundlesPersisted: 0,
    approvalInputsPersisted: 0,
    phaseAuthorizationsIssued: 0,
    materialsGenerated: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try { process.stdout.write(serialize(runStage8WindowsTaskMaterialsEmitApprovalCheck())); }
  catch (error) {
    process.stderr.write(serialize(serializeStage8WindowsTaskMaterialsEmitApprovalFailure(error)));
    process.exitCode = 1;
  }
}
