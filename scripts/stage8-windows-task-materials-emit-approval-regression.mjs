import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  buildStage8WindowsTaskMaterialsEmitApprovalCheck,
  runStage8WindowsTaskMaterialsEmitApprovalCheck,
} from './stage8-windows-task-materials-emit-approval.mjs';

const require = createRequire(import.meta.url);

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
const projectRoot = path.win32.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');
const signerReleaseCommit = 'ed9bfedd57e2ff3841afc02a304588c52bd35c1b';
const argv = ['--check', '--signer-root', projectRoot, '--product-approved-materials-emit-only'];
const dependencies = {
  environment: { STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_CHECK: '1' },
  osTempRoot: os.tmpdir(),
  inspectCheckout: () => ({ headCommit: signerReleaseCommit, clean: true }),
};

function clone(value) { return structuredClone(value); }
function expectFailure(authorizationMutator, decisionMutator, pattern) {
  const built = buildStage8WindowsTaskMaterialsEmitApprovalCheck(argv, dependencies);
  const authorization = clone(built.authorization);
  const decision = clone(built.decision);
  authorizationMutator?.(authorization);
  decisionMutator?.(decision);
  const result = tools.checkStage8WindowsTaskMaterialsEmitApproval({
    authorization,
    decision,
    signer: built.signer,
    formal: built.formal,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, pattern);
}

const checked = runStage8WindowsTaskMaterialsEmitApprovalCheck(argv, dependencies);
assert.equal(checked.ok, true);
assert.equal(checked.scope, 'stage8-windows-task-host:materials-emit');
assert.equal(checked.action, 'materials-emit');
assert.equal(checked.requestId, 'stage8-disposable-diagnostic-20260916-materials-emit-signing-request');
assert.equal(checked.repeatedCheckByteIdentical, true);
assert.equal(checked.formalControlFilesRead, 2);
assert.deepEqual(checked.phaseApprovals, { 'materials-emit': null, register: null, run: null, verify: null, delete: null });
for (const key of ['filesWritten','identityBundlesPersisted','approvalInputsPersisted','phaseAuthorizationsIssued','materialsGenerated','scheduledTasksRead','scheduledTasksMutated','servicesRead','servicesMutated','diagnosticsRun','formalPilotGamesCredited']) {
  assert.equal(checked[key], 0, key);
}

expectFailure(() => {}, (value) => { delete value.scope; }, /decision-schema-invalid/);
expectFailure((value) => { value.scope = 'stage8-windows-task-host:register'; }, null, /input-drift/);
expectFailure((value) => { value.requestId = `${value.requestId}-drift`; }, null, /input-drift/);
expectFailure((value) => { value.action = 'register'; }, null, /input-drift/);
expectFailure((value) => { value.controlManifestSha256 = '0'.repeat(64); }, null, /input-drift/);
expectFailure((value) => { value.controlEvidenceSha256 = '0'.repeat(64); }, null, /input-drift/);
expectFailure((value) => { value.runtimeReleaseCommit = '0'.repeat(40); }, null, /input-drift/);
expectFailure((value) => { value.runtimeSourceBundleSha256 = '0'.repeat(64); }, null, /input-drift/);
expectFailure((value) => { value.targets.materialsOutputDirectory = 'E:\\forbidden'; }, null, /input-drift/);
expectFailure((value) => { value.extra = true; }, null, /input-schema-invalid/);
expectFailure(() => {}, (value) => { value.phaseApprovals.register = { granted: true }; }, /decision-policy-drift/);
expectFailure((value) => { delete value.authorizationInputSha256; }, null, /input-schema-invalid/);

const formalRoot = tools.deriveStage8WindowsTaskMaterialsEmitFormalRoot(os.tmpdir());
const controlBytes = fs.readFileSync(path.win32.join(formalRoot, 'host-control.json'));
const evidenceBytes = fs.readFileSync(path.win32.join(formalRoot, 'control-approval-evidence.json'));
const changedControl = Buffer.from(controlBytes);
changedControl[changedControl.length - 2] ^= 1;
assert.match(tools.validateStage8WindowsTaskMaterialsEmitFormalPair({ controlBytes: changedControl, evidenceBytes, osTempRoot: os.tmpdir() }).reason, /formal-file-hash-drift/);
const changedEvidence = Buffer.from(evidenceBytes);
changedEvidence[changedEvidence.length - 2] ^= 1;
assert.match(tools.validateStage8WindowsTaskMaterialsEmitFormalPair({ controlBytes, evidenceBytes: changedEvidence, osTempRoot: os.tmpdir() }).reason, /formal-file-hash-drift/);

assert.throws(() => runStage8WindowsTaskMaterialsEmitApprovalCheck(['--emit', ...argv.slice(1)], dependencies), /usage/);
assert.throws(() => runStage8WindowsTaskMaterialsEmitApprovalCheck(argv, { ...dependencies, environment: {} }), /product-gate-required/);

console.log(JSON.stringify({
  ok: true,
  checks: 17,
  scope: checked.scope,
  checkIdentitySha256: checked.checkIdentitySha256,
  repeatedCheckByteIdentical: true,
  filesWritten: 0,
  phaseAuthorizationsIssued: 0,
  materialsGenerated: 0,
  scheduledTasksRead: 0,
  scheduledTasksMutated: 0,
  servicesRead: 0,
  servicesMutated: 0,
  diagnosticsRun: 0,
  formalPilotGamesCredited: 0,
}, null, 2));
