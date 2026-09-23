import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  buildStage8WindowsTaskMaterials,
  renderStage8WindowsTaskXml,
} from './stage8-windows-task-host-materials.mjs';
import { runStage8WindowsTaskHost } from './stage8-windows-task-host-runner.mjs';

const require = createRequire(import.meta.url);
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

const identity = loadTs('../src/game/stage8/offline-windows-task-diagnostic-identity.ts');
const host = loadTs('../src/game/stage8/offline-windows-task-host-control.ts');
const demand = loadTs('../src/game/stage8/offline-windows-task-demand-start.ts');
const registerApproval = loadTs('../src/game/stage8/offline-windows-task-register-approval.ts');
const projectRoot = path.win32.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const hostRunId = 'stage8-disposable-diagnostic-demand-20260923';
const releaseCommit = '7c587b44ad85d301e0c60210beb2f1068a41e150';
const template = identity.buildStage8WindowsTaskDemandIdentityTemplate({
  releaseCommit,
  hostRunId,
  projectRoot,
  nodeExecutablePath: process.execPath,
  osTempRoot: os.tmpdir(),
  userSid: 'S-1-5-21-101-202-303-404',
  readFile: (target) => fs.readFileSync(target),
});
const control = structuredClone(template.controlTemplate);
const controlAuthorization = {
  scope: 'stage8-windows-task-host-control',
  approvalId: 'synthetic-test-control-approval',
  granted: true,
  hostRunId,
  releaseCommit,
};
control.authorization = {
  scope: controlAuthorization.scope,
  approvalId: controlAuthorization.approvalId,
  granted: true,
  authorizationSha256: host.hashStage8WindowsTaskHostControlAuthorization(controlAuthorization),
};
delete control.manifestSha256;
control.manifestSha256 = host.hashStage8WindowsTaskHostControlPayload(control);
const phaseAuthorization = (action) => {
  const payload = {
    protocolVersion: host.STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION,
    action,
    scope: `stage8-windows-task-host:${action}`,
    approvalId: `synthetic-test-${action}-approval`,
    granted: true,
    hostRunId,
    controlManifestSha256: control.manifestSha256,
  };
  return {
    ...payload,
    authorizationSha256: host.hashStage8WindowsTaskHostPhaseAuthorizationPayload(payload),
  };
};
const materialsAuthorization = phaseAuthorization('materials-emit');
const registerAuthorization = phaseAuthorization('register');
const runAuthorization = phaseAuthorization('run');
const built = buildStage8WindowsTaskMaterials(control);
const materialPayload = {
  ...built.material,
  materialsAuthorizationSha256: materialsAuthorization.authorizationSha256,
};
delete materialPayload.materialSha256;
const material = {
  ...materialPayload,
  materialSha256: host.hashStage8WindowsTaskHostMaterialPayload(materialPayload),
};
const taskXmlBytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(built.taskXml, 'utf16le')]);
const validState = {
  taskPath: control.task.taskPath,
  taskName: control.task.taskName,
  state: 'Ready',
  runningInstances: 0,
  lastTaskResult: null,
};
const input = {
  control,
  materialsAuthorization,
  registerAuthorization,
  runAuthorization: null,
  material,
  taskXmlBytes,
  exportedTaskXml: built.taskXml,
  renderTaskXmlBytes: (candidate) => Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(renderStage8WindowsTaskXml(candidate), 'utf16le'),
  ]),
  registeredTask: validState,
  osTempRoot: os.tmpdir(),
};
let checks = 0;
function test(callback) { callback(); checks += 1; }
function reseal(changed) {
  const value = structuredClone(changed);
  delete value.manifestSha256;
  value.manifestSha256 = host.hashStage8WindowsTaskHostControlPayload(value);
  return value;
}

test(() => {
  assert.equal(template.protocolVersion, identity.STAGE8_WINDOWS_TASK_DEMAND_IDENTITY_VERSION);
  assert.equal(control.task.trigger.type, 'on-demand-only');
  assert.equal(control.task.settings.allowDemandStart, true);
  assert.equal(host.validateStage8WindowsTaskHostControl(control, { osTempRoot: os.tmpdir() }).manifestSha256, control.manifestSha256);
  assert.equal(host.validateStage8WindowsTaskHostPhaseAuthorization(runAuthorization, control, 'run').authorizationSha256, runAuthorization.authorizationSha256);
});
test(() => {
  assert.equal((built.taskXml.match(/<Exec>/g) ?? []).length, 1);
  assert.doesNotMatch(built.taskXml, /<Triggers(?:\s|>)|<TimeTrigger>/);
  assert.match(built.taskXml, /<AllowStartOnDemand>true<\/AllowStartOnDemand>/);
  assert.match(built.taskXml, /<StartWhenAvailable>false<\/StartWhenAvailable>/);
  assert.doesNotMatch(built.taskXml, /<RestartOnFailure>|<Repetition>/);
});
test(() => {
  const admitted = demand.validateStage8WindowsTaskDemandRegistrationCandidate(input);
  assert.equal(admitted.control.manifestSha256, control.manifestSha256);
  assert.equal(admitted.material.materialSha256, material.materialSha256);
  assert.equal(admitted.registerAuthorization.authorizationSha256, registerAuthorization.authorizationSha256);
});
test(() => {
  const exportedTaskXml = built.taskXml
    .replace('<RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
      '<RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><IdleSettings><StopOnIdleEnd>true</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>')
    .replace('<RunOnlyIfIdle>false</RunOnlyIfIdle>',
      '<RunOnlyIfIdle>false</RunOnlyIfIdle><DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession><UseUnifiedSchedulingEngine>false</UseUnifiedSchedulingEngine>');
  assert.equal(demand.validateStage8WindowsTaskDemandRegistrationCandidate({
    ...input,
    exportedTaskXml,
  }).taskXmlSha256, material.taskXmlSha256);
  assert.throws(() => demand.validateStage8WindowsTaskDemandRegistrationCandidate({
    ...input,
    exportedTaskXml: exportedTaskXml.replace('<UseUnifiedSchedulingEngine>false</UseUnifiedSchedulingEngine>',
      '<UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>'),
  }), /exported-task-(?:xml|policy)-drift/);
});
test(() => assert.throws(
  () => demand.validateStage8WindowsTaskDemandRegistrationCandidate({ ...input, runAuthorization }),
  /run-phase-inheritance-forbidden/,
));
test(() => {
  const old = reseal({
    ...control,
    protocolVersion: host.STAGE8_WINDOWS_TASK_HOST_CONTROL_VERSION,
    task: {
      ...control.task,
      trigger: { type: 'time-once', startBoundaryUtc: '2026-09-17T02:00:00.000Z', endBoundaryUtc: '2026-09-17T02:30:00.000Z', repetition: false },
      settings: { ...control.task.settings, allowDemandStart: false },
    },
  });
  assert.throws(() => demand.validateStage8WindowsTaskDemandRegistrationCandidate({ ...input, control: old }), /old-or-automatic-control-forbidden|authorization-identity/);
});
test(() => {
  const oldFormalPaths = registerApproval.deriveStage8WindowsTaskRegisterFormalPaths(os.tmpdir());
  const oldFormalXml = fs.readFileSync(oldFormalPaths.taskDefinitionPath);
  assert.match(oldFormalXml.subarray(2).toString('utf16le'), /<TimeTrigger>/);
  assert.throws(() => demand.validateStage8WindowsTaskDemandRegistrationCandidate({
    ...input,
    taskXmlBytes: oldFormalXml,
  }), /task-material-xml-drift/);
});
test(() => {
  const automaticXml = built.taskXml.replace(
    '  <Principals>',
    '  <Triggers><TimeTrigger><StartBoundary>2026-09-24T02:00:00.000Z</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>\r\n  <Principals>',
  );
  const automaticBytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(automaticXml, 'utf16le')]);
  const automaticMaterialPayload = {
    ...material,
    taskXmlSha256: createHash('sha256').update(automaticBytes).digest('hex'),
  };
  delete automaticMaterialPayload.materialSha256;
  const automaticMaterial = {
    ...automaticMaterialPayload,
    materialSha256: host.hashStage8WindowsTaskHostMaterialPayload(automaticMaterialPayload),
  };
  assert.throws(() => demand.validateStage8WindowsTaskDemandRegistrationCandidate({
    ...input,
    material: automaticMaterial,
    taskXmlBytes: automaticBytes,
    exportedTaskXml: automaticXml,
    renderTaskXmlBytes: () => automaticBytes,
  }), /automatic-trigger-or-policy-drift/);
});
for (const trigger of [
  { type: 'time-once', startBoundaryUtc: '2026-09-24T02:00:00.000Z', endBoundaryUtc: '2026-09-24T02:30:00.000Z', repetition: false },
  { type: 'on-demand-only', automatic: true },
]) {
  test(() => assert.throws(
    () => host.validateStage8WindowsTaskHostControl(reseal({ ...control, task: { ...control.task, trigger } }), { osTempRoot: os.tmpdir() }),
    /trigger-(?:policy|schema-mismatch)/,
  ));
}
test(() => assert.throws(
  () => host.validateStage8WindowsTaskHostControl(reseal({ ...control, task: { ...control.task, settings: { ...control.task.settings, allowDemandStart: false } } }), { osTempRoot: os.tmpdir() }),
  /settings-policy/,
));
test(() => assert.throws(
  () => demand.validateStage8WindowsTaskDemandRegistrationCandidate({ ...input, registerAuthorization: materialsAuthorization }),
  /authorization-scope/,
));
test(() => assert.throws(
  () => demand.validateStage8WindowsTaskDemandRegistrationCandidate({ ...input, material: { ...material, taskXmlSha256: '0'.repeat(64) } }),
  /material-hash|task-material-xml-drift/,
));
for (const exportedTaskXml of [
  built.taskXml.replace('</Task>', '<Triggers><TimeTrigger /></Triggers></Task>'),
  built.taskXml.replace('<AllowStartOnDemand>true</AllowStartOnDemand>', '<AllowStartOnDemand>false</AllowStartOnDemand>'),
  built.taskXml.replace('<StartWhenAvailable>false</StartWhenAvailable>', '<StartWhenAvailable>true</StartWhenAvailable>'),
  built.taskXml.replace('</Settings>', '<RestartOnFailure><Count>1</Count></RestartOnFailure></Settings>'),
]) {
  test(() => assert.throws(
    () => demand.validateStage8WindowsTaskDemandRegistrationCandidate({ ...input, exportedTaskXml }),
    /exported-task-(?:xml|policy)-drift/,
  ));
}
test(() => assert.throws(
  () => demand.validateStage8WindowsTaskDemandRegistrationCandidate({ ...input, registeredTask: { ...validState, state: 'Running' } }),
  /registered-task-state-drift/,
));
test(() => assert.throws(
  () => demand.validateStage8WindowsTaskDemandRegistrationCandidate({ ...input, registeredTask: { ...validState, runningInstances: 1 } }),
  /registered-task-state-drift/,
));
for (const authorization of [
  null,
  registerAuthorization,
  { ...runAuthorization, controlManifestSha256: '0'.repeat(64) },
]) {
  let childStarts = 0;
  let capacityReads = 0;
  const existed = fs.existsSync(control.paths.evidenceRoot);
  await assert.rejects(() => runStage8WindowsTaskHost({
    control,
    authorization,
    controlPath: control.paths.controlPath,
    authorizationPath: control.paths.runAuthorizationPath,
    dependencies: {
      osTempRoot: os.tmpdir(),
      assertCapacity: () => { capacityReads += 1; },
      spawn: () => { childStarts += 1; throw new Error('must-not-start'); },
    },
  }), /authorization/);
  assert.equal(childStarts, 0);
  assert.equal(capacityReads, 0);
  assert.equal(fs.existsSync(control.paths.evidenceRoot), existed);
  checks += 1;
}

console.log(JSON.stringify({
  ok: true,
  checks,
  taskSchedulerRegistrations: 0,
  taskSchedulerRuns: 0,
  formalFilesWritten: 0,
  childProcessesStarted: 0,
  pilotRuns: 0,
  trainingRuns: 0,
}, null, 2));
