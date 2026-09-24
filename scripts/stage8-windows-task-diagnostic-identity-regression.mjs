import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  runStage8WindowsTaskDiagnosticIdentityCheck,
  serializeStage8WindowsTaskDiagnosticIdentityCheck,
} from './stage8-windows-task-diagnostic-identity.mjs';

const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
}).outputText, filename);
const tools = require('../src/game/stage8/offline-windows-task-diagnostic-identity.ts');
const hostTools = require('../src/game/stage8/offline-windows-task-host-control.ts');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-windows-task-diagnostic-identity-'));
const sourceRoot = path.join(temporaryRoot, 'clean-source');
const osTempRoot = path.join(temporaryRoot, 'os-temp');
const nodeExecutablePath = path.join(temporaryRoot, 'runtime', 'node.exe');
const userSid = 'S-1-5-21-1111111111-2222222222-3333333333-1001';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeFixture(relativePath, bytes) {
  const target = path.join(sourceRoot, relativePath);
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

function sealRequest(request) {
  const { requestSha256: ignored, ...payload } = request;
  void ignored;
  return { ...payload, requestSha256: tools.hashStage8WindowsTaskDiagnosticIdentityInput(payload) };
}

function createRuntime({ clean = true, headCommit = tools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT, mutateRead } = {}) {
  let targetRootReads = 0;
  const request = tools.buildStage8WindowsTaskDiagnosticIdentityInput({ projectRoot: sourceRoot, nodeExecutablePath, osTempRoot, userSid });
  const targetPaths = [request.paths.controlPath, request.paths.evidenceRoot, request.paths.stdoutPath, request.paths.stderrPath, ...Object.values(request.paths.phaseAuthorizationPaths)].map((value) => path.win32.resolve(value).toLowerCase());
  return {
    request,
    expected: { projectRoot: sourceRoot, nodeExecutablePath, osTempRoot },
    inspectCheckout: () => ({ headCommit, clean }),
    readFile: (absolutePath) => {
      const normalized = path.win32.resolve(absolutePath).toLowerCase();
      if (targetPaths.some((target) => normalized === target || normalized.startsWith(`${target}\\`))) {
        targetRootReads += 1;
        throw new Error('target-root-read-forbidden');
      }
      const bytes = fs.readFileSync(absolutePath);
      return mutateRead ? mutateRead(absolutePath, bytes) : bytes;
    },
    targetRootReads: () => targetRootReads,
  };
}

function expectInputFailure(mutator, reason) {
  const runtime = createRuntime();
  const changed = clone(runtime.request);
  mutator(changed);
  const result = tools.validateStage8WindowsTaskDiagnosticIdentityInput(sealRequest(changed), runtime.expected);
  assert.equal(result.ok, false);
  assert.match(result.reason, reason);
}

try {
  fs.mkdirSync(path.dirname(nodeExecutablePath), { recursive: true });
  fs.mkdirSync(osTempRoot, { recursive: true });
  fs.writeFileSync(nodeExecutablePath, 'node-runtime-v1', { flag: 'wx' });
  writeFixture(tools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.hostRunner, 'host-runner-v1');
  writeFixture(tools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.diagnostic, 'diagnostic-v1');
  writeFixture(tools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.controlProtocol, 'control-protocol-v1');
  writeFixture(tools.STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.identity, 'identity-v1');

  const runtime = createRuntime();
  const created = tools.createStage8WindowsTaskDiagnosticIdentityBundle(runtime);
  assert.equal(created.ok, true, created.ok ? '' : created.reason);
  const validated = tools.validateStage8WindowsTaskDiagnosticIdentityBundle({ bundle: created.value, ...runtime });
  assert.equal(validated.ok, true, validated.ok ? '' : validated.reason);
  assert.equal(runtime.targetRootReads(), 0);
  assert.equal(created.value.request.hostRunId, 'stage8-disposable-diagnostic-20260916');
  assert.equal(created.value.request.targetRunId, 'stage8-disposable-diagnostic-20260916-diagnostic');
  assert.equal(created.value.request.releaseCommit, 'fae72b67b297672960d49361e6252c7e022d9040');
  assert.equal(created.value.request.taskName, 'Stage8-Host-stage8-disposable-diagnostic-20260916');
  assert.equal(created.value.controlTemplate.authorization.granted, false);
  assert.equal(created.value.controlTemplate.authorization.approvalId, null);
  assert.equal(created.value.controlTemplate.manifestSha256, null);
  assert.throws(() => hostTools.validateStage8WindowsTaskHostControl(created.value.controlTemplate, { osTempRoot }), /control-authorization-denied/);
  assert.deepEqual(created.value.phaseAuthorizationRequests.map((entry) => entry.action), ['materials-emit', 'register', 'run', 'verify', 'delete']);
  assert.equal(new Set(created.value.phaseAuthorizationRequests.map((entry) => entry.requestId)).size, 5);
  for (const request of [created.value.controlAuthorizationRequest, ...created.value.phaseAuthorizationRequests]) {
    assert.equal(request.approval, null);
    assert.equal(request.controlManifestSha256, null);
  }

  const wrongCommitRuntime = createRuntime({ headCommit: '0'.repeat(40) });
  const wrongCommit = tools.createStage8WindowsTaskDiagnosticIdentityBundle(wrongCommitRuntime);
  assert.deepEqual(wrongCommit, { ok: false, reason: 'windows-task-diagnostic-checkout-not-clean-release' });
  const dirty = tools.createStage8WindowsTaskDiagnosticIdentityBundle(createRuntime({ clean: false }));
  assert.deepEqual(dirty, { ok: false, reason: 'windows-task-diagnostic-checkout-not-clean-release' });

  const sourceDriftRuntime = createRuntime({ mutateRead: (absolutePath, bytes) => absolutePath.endsWith('stage8-windows-task-host-runner.mjs') ? Buffer.concat([bytes, Buffer.from('drift')]) : bytes });
  const sourceDrift = tools.validateStage8WindowsTaskDiagnosticIdentityBundle({ bundle: created.value, ...sourceDriftRuntime });
  assert.deepEqual(sourceDrift, { ok: false, reason: 'windows-task-diagnostic-bundle-identity-drift' });
  const nodeDriftRuntime = createRuntime({ mutateRead: (absolutePath, bytes) => absolutePath === nodeExecutablePath ? Buffer.concat([bytes, Buffer.from('drift')]) : bytes });
  const nodeDrift = tools.validateStage8WindowsTaskDiagnosticIdentityBundle({ bundle: created.value, ...nodeDriftRuntime });
  assert.deepEqual(nodeDrift, { ok: false, reason: 'windows-task-diagnostic-bundle-identity-drift' });

  for (const mutate of [
    (bundle) => { bundle.controlTemplate.command.arguments[2] = '1'; },
    (bundle) => { bundle.controlTemplate.command.environment.push({ name: 'DRIFT', value: '1' }); },
    (bundle) => { bundle.sourceIdentity.files[0].sha256 = 'f'.repeat(64); },
    (bundle) => { bundle.phaseAuthorizationRequests[0].scope = 'wrong-scope'; },
  ]) {
    const changed = clone(created.value);
    mutate(changed);
    const result = tools.validateStage8WindowsTaskDiagnosticIdentityBundle({ bundle: changed, ...createRuntime() });
    assert.deepEqual(result, { ok: false, reason: 'windows-task-diagnostic-bundle-identity-drift' });
  }

  expectInputFailure((value) => { value.releaseCommit = '0'.repeat(40); }, /input-policy-drift/);
  expectInputFailure((value) => { value.hostRunId = 'formal-bc-corpus-pilot-20260913'; }, /input-policy-drift/);
  expectInputFailure((value) => { value.targetRunId = 'formal-bc-corpus-pilot-20260910'; }, /input-policy-drift/);
  expectInputFailure((value) => { value.projectRoot = 'relative'; }, /runtime-path-drift/);
  expectInputFailure((value) => { value.paths.evidenceRoot = path.join(sourceRoot, 'evidence'); }, /evidence-root-forbidden/);
  expectInputFailure((value) => { value.paths.evidenceRoot = 'E:\\WannianMahjongStage8\\artifacts\\diagnostic'; }, /evidence-root-forbidden/);
  expectInputFailure((value) => { value.taskName = 'Stage8-Host-conflict'; }, /input-policy-drift/);
  expectInputFailure((value) => { value.workload.allowThirdPilot = true; }, /input-policy-drift/);
  expectInputFailure((value) => { value.workload.allowFormalPilot = true; }, /input-policy-drift/);
  expectInputFailure((value) => { value.workload.allowTraining = true; }, /input-policy-drift/);
  expectInputFailure((value) => { value.workload.allowSmoke = true; }, /input-policy-drift/);
  const missing = clone(runtime.request);
  delete missing.taskName;
  assert.deepEqual(tools.validateStage8WindowsTaskDiagnosticIdentityInput(missing, runtime.expected), { ok: false, reason: 'windows-task-diagnostic-input-schema-invalid' });
  const extra = { ...runtime.request, unexpected: true };
  assert.deepEqual(tools.validateStage8WindowsTaskDiagnosticIdentityInput(extra, runtime.expected), { ok: false, reason: 'windows-task-diagnostic-input-schema-invalid' });

  const before = snapshot(temporaryRoot);
  const cliDependencies = {
    nodeExecutablePath,
    osTempRoot,
    inspectCheckout: runtime.inspectCheckout,
    readFile: runtime.readFile,
  };
  const argv = ['--check', '--source-root', sourceRoot, '--user-sid', userSid];
  const first = runStage8WindowsTaskDiagnosticIdentityCheck(argv, cliDependencies);
  const second = runStage8WindowsTaskDiagnosticIdentityCheck(argv, cliDependencies);
  assert.equal(serializeStage8WindowsTaskDiagnosticIdentityCheck(first), serializeStage8WindowsTaskDiagnosticIdentityCheck(second));
  assert.deepEqual(snapshot(temporaryRoot), before);
  assert.deepEqual({
    filesWritten: first.filesWritten,
    scheduledTasksRead: first.scheduledTasksRead,
    scheduledTasksMutated: first.scheduledTasksMutated,
    servicesRead: first.servicesRead,
    servicesMutated: first.servicesMutated,
    targetRootReads: first.targetRootReads,
    formalPathsRead: first.formalPathsRead,
    formalPilotGamesCredited: first.formalPilotGamesCredited,
  }, { filesWritten: 0, scheduledTasksRead: 0, scheduledTasksMutated: 0, servicesRead: 0, servicesMutated: 0, targetRootReads: 0, formalPathsRead: 0, formalPilotGamesCredited: 0 });
  assert.equal(runtime.targetRootReads(), 0);

  console.log(JSON.stringify({
    passed: true,
    identitySha256: first.identitySha256,
    repeatedCheckByteIdentical: true,
    controls: ['clean-fae72b6', 'source-and-node-bytes', 'arguments-cwd-environment', 'new-run-id', 'unsigned-control', 'five-independent-phase-requests', 'exact-schema', 'os-temp-only', 'diagnostic-only', 'zero-side-effects'],
    filesWritten: 0,
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
