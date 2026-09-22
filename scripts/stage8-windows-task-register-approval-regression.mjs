import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  buildStage8WindowsTaskRegisterApprovalCheck,
  inspectStage8WindowsTaskRegisterScheduler,
  runStage8WindowsTaskRegisterApprovalCheck,
  serializeStage8WindowsTaskRegisterApprovalFailure,
} from './stage8-windows-task-register-approval.mjs';

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

const tools = loadTs('../src/game/stage8/offline-windows-task-register-approval.ts');
const hostTools = loadTs('../src/game/stage8/offline-windows-task-host-control.ts');
const projectRoot = path.win32.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const signerReleaseCommit = '86dedb7a44270d634364a1a43d95315b1bef7e95';
const argv = ['--check', '--signer-root', projectRoot, '--product-approved-register-only'];
const osTempRoot = os.tmpdir();
const formalPaths = tools.deriveStage8WindowsTaskRegisterFormalPaths(osTempRoot);
const formalFilePaths = [
  formalPaths.controlPath,
  formalPaths.evidencePath,
  formalPaths.materialsAuthorizationPath,
  formalPaths.taskDefinitionPath,
  formalPaths.taskMaterialsPath,
];
const formalBytes = new Map(formalFilePaths.map((absolutePath) => [path.win32.resolve(absolutePath).toLowerCase(), fs.readFileSync(absolutePath)]));

function clone(value) { return structuredClone(value); }
function pathKey(value) { return path.win32.resolve(value).toLowerCase(); }
function absentInspection(taskPath, taskName) {
  return {
    provider: 'windows-task-scheduler',
    querySucceeded: true,
    queriedTaskPath: taskPath,
    queriedTaskName: taskName,
    exists: false,
    taskPath: null,
    taskName: null,
  };
}
function defaultListDirectory(absolutePath) {
  if (pathKey(absolutePath) === pathKey(formalPaths.authorizationDirectory)) {
    return [{ name: 'materials-emit.json', kind: 'file' }];
  }
  if (pathKey(absolutePath) === pathKey(formalPaths.materialsDirectory)) {
    return [
      { name: 'task-definition.xml', kind: 'file' },
      { name: 'task-materials.json', kind: 'file' },
    ];
  }
  throw new Error('unexpected-directory');
}
function defaultReadFile(absolutePath) {
  const fixed = formalBytes.get(pathKey(absolutePath));
  return fixed ? Buffer.from(fixed) : fs.readFileSync(absolutePath);
}
function makeDependencies(overrides = {}) {
  const counter = { schedulerCalls: 0 };
  const dependencies = {
    environment: { STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_CHECK: '1' },
    osTempRoot,
    readFile: defaultReadFile,
    listDirectory: defaultListDirectory,
    inspectCheckout: () => ({ headCommit: signerReleaseCommit, sourceReleaseCommit: signerReleaseCommit, clean: true }),
    schedulerInspector: (taskPath, taskName) => {
      counter.schedulerCalls += 1;
      return absentInspection(taskPath, taskName);
    },
    ...overrides,
  };
  return { dependencies, counter };
}
function changedBytes(absolutePath) {
  const changed = Buffer.from(formalBytes.get(pathKey(absolutePath)));
  changed[changed.length - 2] ^= 1;
  return changed;
}
function readFileOverride(targetPath, behavior) {
  return (absolutePath) => pathKey(absolutePath) === pathKey(targetPath) ? behavior() : defaultReadFile(absolutePath);
}
function expectCoreFailure(built, mutateAuthorization, mutateDecision, pattern) {
  const authorization = clone(built.authorization);
  const decision = clone(built.decision);
  mutateAuthorization?.(authorization);
  mutateDecision?.(decision);
  const checked = tools.checkStage8WindowsTaskRegisterApproval({
    authorization,
    decision,
    signer: built.signer,
    formal: built.formal,
    schedulerInspection: built.schedulerInspection,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.reason, pattern);
}

let checks = 0;
function test(callback) { callback(); checks += 1; }

test(() => {
  const { dependencies, counter } = makeDependencies();
  const checked = runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies);
  assert.equal(checked.ok, true);
  assert.equal(checked.scope, 'stage8-windows-task-host:register');
  assert.equal(checked.action, 'register');
  assert.equal(checked.requestId, 'stage8-disposable-diagnostic-20260916-register-signing-request');
  assert.equal(checked.taskAbsent, true);
  assert.equal(checked.repeatedCheckByteIdentical, true);
  assert.equal(checked.formalFilesRead, 5);
  assert.equal(checked.formalDirectoriesRead, 2);
  assert.equal(checked.scheduledTasksRead, 1);
  assert.equal(counter.schedulerCalls, 1);
  assert.deepEqual(checked.phaseApprovals, { 'materials-emit': null, register: null, run: null, verify: null, delete: null });
  for (const key of ['filesWritten','identityBundlesPersisted','approvalInputsPersisted','phaseAuthorizationsIssued','materialsGenerated','scheduledTasksMutated','servicesRead','servicesMutated','diagnosticsRun','formalPilotGamesCredited','trainingRuns','deployments','port18768Operations']) {
    assert.equal(checked[key], 0, key);
  }
});

test(() => assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(['--emit', ...argv.slice(1)], makeDependencies().dependencies), /usage/));
test(() => assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, { ...makeDependencies().dependencies, environment: {} }), /product-gate-required/));

for (const absolutePath of formalFilePaths) {
  test(() => {
    const { dependencies } = makeDependencies({ readFile: readFileOverride(absolutePath, () => { throw new Error('missing'); }) });
    assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /missing/);
  });
  test(() => {
    const { dependencies } = makeDependencies({ readFile: readFileOverride(absolutePath, () => changedBytes(absolutePath)) });
    assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /hash-drift|invalid/);
  });
}

test(() => {
  const { dependencies } = makeDependencies({
    listDirectory: (absolutePath) => pathKey(absolutePath) === pathKey(formalPaths.materialsDirectory)
      ? [...defaultListDirectory(absolutePath), { name: 'extra.json', kind: 'file' }]
      : defaultListDirectory(absolutePath),
  });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /materials-directory-contents-drift/);
});
test(() => {
  const { dependencies } = makeDependencies({
    listDirectory: (absolutePath) => pathKey(absolutePath) === pathKey(formalPaths.materialsDirectory)
      ? [...defaultListDirectory(absolutePath), { name: 'task-definition.xml.partial', kind: 'file' }]
      : defaultListDirectory(absolutePath),
  });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /materials-directory-contents-drift/);
});
test(() => {
  const { dependencies } = makeDependencies({
    listDirectory: (absolutePath) => pathKey(absolutePath) === pathKey(formalPaths.authorizationDirectory)
      ? [...defaultListDirectory(absolutePath), { name: 'register.json', kind: 'file' }]
      : defaultListDirectory(absolutePath),
  });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /authorization-directory-contents-drift/);
});
test(() => {
  const { dependencies } = makeDependencies({
    listDirectory: (absolutePath) => pathKey(absolutePath) === pathKey(formalPaths.materialsDirectory)
      ? [{ name: 'task-definition.xml', kind: 'symbolic-link' }, { name: 'task-materials.json', kind: 'file' }]
      : defaultListDirectory(absolutePath),
  });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /materials-directory-entry-invalid/);
});

test(() => {
  const { dependencies } = makeDependencies({ renderTaskXmlBytes: () => Buffer.from([0xff, 0xfe, 0x3c, 0x00]) });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /task-xml-render-drift/);
});
test(() => assert.throws(() => tools.validateStage8WindowsTaskRegisterCanonicalXml(Buffer.from('<Task></Task>')), /encoding-invalid/));
test(() => {
  const invalid = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<?xml version="1.0" encoding="UTF-16"?><Task><Exec></Task>', 'utf16le')]);
  assert.throws(() => tools.validateStage8WindowsTaskRegisterCanonicalXml(invalid), /nesting-invalid/);
});

test(() => {
  const { dependencies } = makeDependencies({ inspectCheckout: () => ({ headCommit: signerReleaseCommit, clean: false }) });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /signer-release-drift/);
});
test(() => {
  const { dependencies } = makeDependencies({ schedulerInspector: () => { throw new Error('scheduler-down'); } });
  let error;
  try { runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies); } catch (caught) { error = caught; }
  assert.match(error.message, /scheduler-down/);
  assert.equal(serializeStage8WindowsTaskRegisterApprovalFailure(error).scheduledTasksRead, 1);
});
test(() => {
  const { dependencies } = makeDependencies({ schedulerInspector: (taskPath, taskName) => ({
    ...absentInspection(taskPath, taskName), exists: true, taskPath, taskName,
  }) });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /task-already-exists/);
});
test(() => {
  const { dependencies } = makeDependencies({ schedulerInspector: (taskPath, taskName) => ({
    ...absentInspection(taskPath, taskName), queriedTaskName: `${taskName}-other`,
  }) });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /scheduler-query-identity-drift/);
});
test(() => {
  const { dependencies } = makeDependencies({ schedulerInspector: () => ({ querySucceeded: true }) });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /scheduler-inspection-schema-invalid/);
});

const built = buildStage8WindowsTaskRegisterApprovalCheck(argv, makeDependencies().dependencies);
test(() => expectCoreFailure(built, (value) => { value.scope = 'stage8-windows-task-host:run'; }, null, /input-drift/));
test(() => expectCoreFailure(built, (value) => { value.action = 'run'; }, null, /input-drift/));
test(() => expectCoreFailure(built, (value) => { value.bindings.controlManifestSha256 = '0'.repeat(64); }, null, /input-drift/));
test(() => expectCoreFailure(built, (value) => { value.bindings.materialsAuthorizationSha256 = '0'.repeat(64); }, null, /input-drift/));
test(() => expectCoreFailure(built, (value) => { value.targets.taskPath = '\\Other\\'; }, null, /input-drift/));
test(() => expectCoreFailure(built, (value) => { value.targets.taskName = 'Other'; }, null, /input-drift/));
test(() => expectCoreFailure(built, (value) => { value.signer.releaseCommit = '0'.repeat(40); }, null, /input-drift/));
test(() => expectCoreFailure(built, null, (value) => { value.phaseApprovals.run = { granted: true }; }, /decision-policy-drift/));
test(() => expectCoreFailure(built, null, (value) => { value.scope = 'stage8-windows-task-host:materials-emit'; }, /decision-policy-drift/));
test(() => expectCoreFailure(built, (value) => { value.extra = true; }, null, /input-schema-invalid/));

test(() => {
  const relative = clone(built.formal.targets);
  relative.registerAuthorizationPath = 'register.json';
  assert.throws(() => tools.validateStage8WindowsTaskRegisterTargetPolicy(relative, projectRoot, osTempRoot), /target-policy-drift/);
});
test(() => {
  const outside = clone(built.formal.targets);
  outside.registerAuthorizationPath = 'E:\\forbidden\\register.json';
  assert.throws(() => tools.validateStage8WindowsTaskRegisterTargetPolicy(outside, projectRoot, osTempRoot), /target-policy-drift/);
});
test(() => {
  const internal = clone(built.formal.targets);
  internal.registerAuthorizationPath = path.win32.join(projectRoot, 'register.json');
  assert.throws(() => tools.validateStage8WindowsTaskRegisterTargetPolicy(internal, projectRoot, projectRoot), /target-policy-drift/);
});

test(() => {
  const authorization = clone(built.formal.materialsAuthorization);
  authorization.action = 'register';
  assert.throws(() => hostTools.validateStage8WindowsTaskHostPhaseAuthorization(authorization, built.formal.control, 'materials-emit'), /authorization-scope/);
});
test(() => {
  const material = clone(built.formal.material);
  delete material.mutationCommandsIncluded;
  assert.throws(() => hostTools.validateStage8WindowsTaskHostMaterial(material, built.formal.control, built.formal.materialsAuthorization), /schema-mismatch/);
});

test(() => {
  let calls = 0;
  const { dependencies } = makeDependencies({
    checkApproval: (input) => {
      calls += 1;
      const checked = tools.checkStage8WindowsTaskRegisterApproval(input);
      return calls === 2 && checked.ok
        ? { ok: true, value: { ...checked.value, checkIdentitySha256: '0'.repeat(64) } }
        : checked;
    },
  });
  assert.throws(() => runStage8WindowsTaskRegisterApprovalCheck(argv, dependencies), /repeated-check-drift/);
});

test(() => {
  const source = fs.readFileSync(new URL('./stage8-windows-task-register-approval.mjs', import.meta.url), 'utf8');
  assert.match(source, /Get-CimInstance/);
  assert.doesNotMatch(source, /Register-ScheduledTask|Start-ScheduledTask|Unregister-ScheduledTask|schtasks(?:\.exe)?\s+\/(?:create|run|delete)/i);
});
test(() => {
  let captured;
  const result = inspectStage8WindowsTaskRegisterScheduler('\\WannianMahjong\\Stage8\\', 'Stage8-Host-test', {
    environment: { SystemRoot: 'C:\\Windows' },
    spawnSync: (executable, args, options) => {
      captured = { executable, args, options };
      return {
        status: 0,
        stdout: JSON.stringify(absentInspection('\\WannianMahjong\\Stage8\\', 'Stage8-Host-test')),
        stderr: '',
      };
    },
  });
  assert.deepEqual(result, absentInspection('\\WannianMahjong\\Stage8\\', 'Stage8-Host-test'));
  assert.equal(captured.executable, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.match(captured.args.at(-1), /\$taskPath\.Replace\('\\', '\\\\'\)/);
  assert.equal(captured.options.shell, false);
  assert.equal(captured.options.env.STAGE8_REGISTER_QUERY_TASK_PATH, '\\WannianMahjong\\Stage8\\');
  assert.equal(captured.options.env.STAGE8_REGISTER_QUERY_TASK_NAME, 'Stage8-Host-test');
});

const checked = runStage8WindowsTaskRegisterApprovalCheck(argv, makeDependencies().dependencies);
console.log(JSON.stringify({
  ok: true,
  checks,
  scope: checked.scope,
  action: checked.action,
  repeatedCheckByteIdentical: checked.repeatedCheckByteIdentical,
  formalFilesRead: checked.formalFilesRead,
  formalDirectoriesRead: checked.formalDirectoriesRead,
  scheduledTasksRead: checked.scheduledTasksRead,
  scheduledTasksMutated: checked.scheduledTasksMutated,
  filesWritten: checked.filesWritten,
  phaseAuthorizationsIssued: checked.phaseAuthorizationsIssued,
  materialsGenerated: checked.materialsGenerated,
  servicesMutated: checked.servicesMutated,
  diagnosticsRun: checked.diagnosticsRun,
  formalPilotGamesCredited: checked.formalPilotGamesCredited,
  trainingRuns: checked.trainingRuns,
  deployments: checked.deployments,
  port18768Operations: checked.port18768Operations,
}, null, 2));
