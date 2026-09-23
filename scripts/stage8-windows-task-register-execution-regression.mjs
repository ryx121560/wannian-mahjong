import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  runStage8WindowsTaskRegisterExecution,
  serializeStage8WindowsTaskRegisterExecutionFailure,
} from './stage8-windows-task-register-execution.mjs';

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

const executionTools = loadTs('../src/game/stage8/offline-windows-task-register-execution.ts');
const registerTools = loadTs('../src/game/stage8/offline-windows-task-register-approval.ts');
const formalPaths = registerTools.deriveStage8WindowsTaskRegisterFormalPaths(os.tmpdir());
const formalFilePaths = [
  formalPaths.controlPath,
  formalPaths.evidencePath,
  formalPaths.materialsAuthorizationPath,
  formalPaths.registerAuthorizationPath,
  formalPaths.taskDefinitionPath,
  formalPaths.taskMaterialsPath,
];
const key = (value) => path.win32.resolve(value).toLowerCase();
const formalBytes = new Map(formalFilePaths.map((target) => [key(target), fs.readFileSync(target)]));
const control = JSON.parse(formalBytes.get(key(formalPaths.controlPath)).toString('utf8'));
const evidencePath = path.win32.join(control.paths.evidenceRoot, 'registration.json');
const stagingPath = `${evidencePath}.partial`;
const taskXmlText = formalBytes.get(key(formalPaths.taskDefinitionPath)).subarray(2).toString('utf16le');
const material = JSON.parse(formalBytes.get(key(formalPaths.taskMaterialsPath)).toString('utf8'));
const checkArgv = ['--check', '--product-approved-register-execution-only'];
const mutateArgv = ['--register-and-verify', '--product-approved-register-execution-only'];
const windowsIdleSettings = '<IdleSettings><StopOnIdleEnd>true</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>';
const windowsRemoteAppDefault = '<DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>';
const windowsUnifiedEngineDefault = '<UseUnifiedSchedulingEngine>false</UseUnifiedSchedulingEngine>';

function withWindowsExportDefaults(source, options = {}) {
  const selected = { idle: true, remoteApp: true, unifiedEngine: true, ...options };
  let result = source;
  if (selected.idle) {
    result = result.replace(
      '<RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
      `<RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>${windowsIdleSettings}`,
    );
  }
  const afterIdle = [
    selected.remoteApp ? windowsRemoteAppDefault : '',
    selected.unifiedEngine ? windowsUnifiedEngineDefault : '',
  ].join('');
  if (afterIdle) {
    result = result.replace(
      '<RunOnlyIfIdle>false</RunOnlyIfIdle>',
      `<RunOnlyIfIdle>false</RunOnlyIfIdle>${afterIdle}`,
    );
  }
  return result;
}

function validateExportedXml(exportedTaskXml) {
  return executionTools.validateStage8WindowsTaskRegisterExecutionXmlIdentity({
    taskXmlBytes: formalBytes.get(key(formalPaths.taskDefinitionPath)),
    exportedTaskXml,
    control,
    material,
  });
}

function clone(value) { return structuredClone(value); }
function absentTask() {
  return {
    queriedTaskPath: control.task.taskPath,
    queriedTaskName: control.task.taskName,
    exists: false,
    taskPath: null,
    taskName: null,
    state: null,
    runningInstances: null,
    lastTaskResult: null,
  };
}

function makeHarness(options = {}) {
  const state = {
    folders: new Map([
      [executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER, false],
      [executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER, false],
    ]),
    task: absentTask(),
    files: new Map(),
    directories: new Set(options.evidenceRootAbsent ? [key(path.win32.dirname(control.paths.evidenceRoot))] : [
      key(path.win32.dirname(control.paths.evidenceRoot)),
      key(control.paths.evidenceRoot),
    ]),
    handles: new Map(),
    nextHandle: 10,
    events: [],
    inspections: 0,
    realScheduledTasksMutated: 0,
    ...options.initialState,
  };
  const inspection = () => ({
    provider: 'windows-task-scheduler',
    querySucceeded: true,
    folders: [...state.folders].map(([folderPath, exists]) => ({ path: folderPath, exists })),
    task: clone(state.task),
  });
  const fileSystem = {
    existsSync(target) {
      if (state.directories.has(key(target))) return true;
      return state.files.has(key(target));
    },
    statSync(target) {
      if (state.directories.has(key(target))) return { isDirectory: () => true };
      throw new Error('stat-unexpected');
    },
    mkdirSync(target, mkdirOptions) {
      state.events.push(`mkdir:${path.win32.basename(target)}`);
      assert.deepEqual(mkdirOptions, { recursive: false });
      if (options.failAt === 'mkdir') throw new Error('injected-mkdir-failure');
      if (state.directories.has(key(target))) throw new Error('directory-already-exists');
      state.directories.add(key(target));
    },
    openSync(target, flags) {
      state.events.push(`open:${path.win32.basename(target)}:${flags}`);
      if (options.failAt === 'open') throw new Error('injected-open-failure');
      if (flags !== 'wx' || state.files.has(key(target))) throw new Error('open-exclusive-failure');
      const handle = state.nextHandle++;
      state.files.set(key(target), Buffer.alloc(0));
      state.handles.set(handle, key(target));
      return handle;
    },
    writeSync(handle, bytes) {
      state.events.push('write');
      if (options.failAt === 'write') throw new Error('injected-write-failure');
      const target = state.handles.get(handle);
      state.files.set(target, Buffer.from(bytes));
      return options.failAt === 'short-write' ? bytes.length - 1 : bytes.length;
    },
    fsyncSync() {
      state.events.push('fsync');
      if (options.failAt === 'fsync') throw new Error('injected-fsync-failure');
    },
    closeSync(handle) {
      state.events.push('close');
      if (options.failAt === 'close') throw new Error('injected-close-failure');
      state.handles.delete(handle);
    },
    renameSync(source, target) {
      state.events.push('rename');
      if (options.failAt === 'rename') throw new Error('injected-rename-failure');
      const bytes = state.files.get(key(source));
      if (!bytes || state.files.has(key(target))) throw new Error('rename-precondition-failed');
      state.files.delete(key(source));
      state.files.set(key(target), bytes);
    },
    readFileSync(target) {
      state.events.push(`read:${path.win32.basename(target)}`);
      const bytes = state.files.get(key(target));
      if (!bytes) throw new Error('read-missing');
      if (options.failAt === 'final-read' && key(target) === key(evidencePath)) return Buffer.from('{}\n');
      if (options.failAt === 'staging-read' && key(target) === key(stagingPath)) return Buffer.from('{}\n');
      return Buffer.from(bytes);
    },
    unlinkSync(target) {
      state.events.push(`unlink:${path.win32.basename(target)}`);
      if (options.failAt === 'unlink') throw new Error('injected-unlink-failure');
      if (!state.files.delete(key(target))) throw new Error('unlink-missing');
    },
    rmdirSync(target) {
      state.events.push(`rmdir:${path.win32.basename(target)}`);
      if (options.failAt === 'rmdir') throw new Error('injected-rmdir-failure');
      if ([...state.files].some(([filePath]) => path.win32.dirname(filePath) === key(target))) throw new Error('directory-not-empty');
      if (!state.directories.delete(key(target))) throw new Error('directory-missing');
    },
  };
  const dependencies = {
    environment: {
      STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_CHECK: '1',
      STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_MUTATE: '1',
    },
    osTempRoot: os.tmpdir(),
    readFile(target) {
      if (options.readOverrides?.has(key(target))) return options.readOverrides.get(key(target));
      const bytes = formalBytes.get(key(target));
      if (!bytes) throw new Error('formal-read-unexpected');
      return Buffer.from(bytes);
    },
    listDirectory(target) {
      if (key(target) === key(formalPaths.authorizationDirectory)) {
        return clone(options.authorizationEntries ?? [
          { name: 'materials-emit.json', kind: 'file' },
          { name: 'register.json', kind: 'file' },
        ]);
      }
      if (key(target) === key(formalPaths.materialsDirectory)) return clone([
        { name: 'task-definition.xml', kind: 'file' },
        { name: 'task-materials.json', kind: 'file' },
      ]);
      throw new Error('directory-read-unexpected');
    },
    fileSystem,
    schedulerInspector() {
      state.events.push('inspect');
      state.inspections += 1;
      if (options.failAt === 'inspect' || (options.failAt === 'post-inspect' && state.inspections === 2)) {
        throw new Error('injected-inspection-failure');
      }
      return inspection();
    },
    folderCreate(folderPath) {
      state.events.push(`create-folder:${folderPath}`);
      if (options.failAt === `create-folder:${folderPath}`) throw new Error('injected-folder-create-failure');
      if (state.folders.get(folderPath)) throw new Error('folder-already-exists');
      if (folderPath === executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER
        && !state.folders.get(executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER)) throw new Error('parent-missing');
      state.folders.set(folderPath, true);
      if (options.failAt === `create-folder-after:${folderPath}`) throw new Error('injected-folder-create-response-failure');
      return { created: true, path: folderPath };
    },
    taskRegister(taskPath, taskName) {
      state.events.push('register-task');
      if (options.failAt === 'register-task-before') throw new Error('injected-register-failure');
      state.task = {
        queriedTaskPath: taskPath,
        queriedTaskName: taskName,
        exists: true,
        taskPath,
        taskName,
        state: options.postTaskState ?? 'Ready',
        runningInstances: options.postRunningInstances ?? 0,
        lastTaskResult: options.postLastTaskResult ?? null,
      };
      if (options.failAt === 'register-task-after') throw new Error('injected-register-response-failure');
      return { registered: true, taskPath, taskName };
    },
    taskExport() {
      state.events.push('export-task');
      if (options.failAt === 'export-task') throw new Error('injected-export-failure');
      return options.exportedTaskXml ?? taskXmlText;
    },
    taskUnregister() {
      state.events.push('unregister-task');
      if (options.failAt === 'unregister-task') throw new Error('injected-unregister-failure');
      state.task = absentTask();
      return { deleted: true, taskPath: control.task.taskPath, taskName: control.task.taskName };
    },
    folderDelete(folderPath) {
      state.events.push(`delete-folder:${folderPath}`);
      if (options.failAt === `delete-folder:${folderPath}`) throw new Error('injected-folder-delete-failure');
      if (folderPath === executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER
        && state.folders.get(executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER)) throw new Error('child-remains');
      if (folderPath === executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER && state.task.exists) throw new Error('task-remains');
      state.folders.set(folderPath, false);
      return { deleted: true, path: folderPath };
    },
    now: () => new Date('2026-09-22T08:30:00.000Z'),
  };
  if (options.dependencies) Object.assign(dependencies, options.dependencies);
  return { dependencies, state };
}

let checks = 0;
function test(callback) { callback(); checks += 1; }
function captureFailure(callback) {
  try { callback(); } catch (error) { return error; }
  assert.fail('expected failure');
}

test(() => {
  const exact = validateExportedXml(taskXmlText);
  assert.equal(exact.taskXmlSha256, material.taskXmlSha256);
});

for (const options of [
  { idle: true, remoteApp: false, unifiedEngine: false },
  { idle: false, remoteApp: true, unifiedEngine: false },
  { idle: false, remoteApp: false, unifiedEngine: true },
  { idle: true, remoteApp: true, unifiedEngine: false },
  { idle: true, remoteApp: false, unifiedEngine: true },
  { idle: false, remoteApp: true, unifiedEngine: true },
  { idle: true, remoteApp: true, unifiedEngine: true },
]) {
  test(() => {
    const validated = validateExportedXml(withWindowsExportDefaults(taskXmlText, options));
    assert.equal(validated.taskXmlSha256, material.taskXmlSha256);
  });
}

for (const mutate of [
  (value) => value.replace('<StopOnIdleEnd>true</StopOnIdleEnd>', '<StopOnIdleEnd>false</StopOnIdleEnd>'),
  (value) => value.replace('<RestartOnIdle>false</RestartOnIdle>', '<RestartOnIdle>true</RestartOnIdle>'),
  (value) => value.replace(windowsIdleSettings, '<IdleSettings><RestartOnIdle>false</RestartOnIdle><StopOnIdleEnd>true</StopOnIdleEnd></IdleSettings>'),
  (value) => value.replace('<StopOnIdleEnd>true</StopOnIdleEnd>', ''),
  (value) => value.replace('<RestartOnIdle>false</RestartOnIdle>', ''),
  (value) => value.replace(windowsIdleSettings, `${windowsIdleSettings}${windowsIdleSettings}`),
  (value) => value.replace('<IdleSettings>', '<IdleSettings Duration="PT10M">'),
  (value) => value.replace('<StopOnIdleEnd>', '<StopOnIdleEnd Test="1">'),
  (value) => value.replace(windowsRemoteAppDefault, '<DisallowStartOnRemoteAppSession>true</DisallowStartOnRemoteAppSession>'),
  (value) => value.replace(windowsRemoteAppDefault, `${windowsRemoteAppDefault}${windowsRemoteAppDefault}`),
  (value) => value.replace('<DisallowStartOnRemoteAppSession>', '<DisallowStartOnRemoteAppSession Test="1">'),
  (value) => value.replace(windowsUnifiedEngineDefault, '<UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>'),
  (value) => value.replace(windowsUnifiedEngineDefault, `${windowsUnifiedEngineDefault}${windowsUnifiedEngineDefault}`),
  (value) => value.replace('<UseUnifiedSchedulingEngine>', '<UseUnifiedSchedulingEngine Test="1">'),
  (value) => value.replace(`${windowsRemoteAppDefault}${windowsUnifiedEngineDefault}`, `${windowsUnifiedEngineDefault}${windowsRemoteAppDefault}`),
  (value) => value.replace(windowsIdleSettings, '').replace('</Settings>', `</Settings>${windowsIdleSettings}`),
  (value) => value.replace(windowsRemoteAppDefault, '').replace('</Settings>', `</Settings>${windowsRemoteAppDefault}`),
  (value) => value.replace(windowsUnifiedEngineDefault, '').replace('</Settings>', `</Settings>${windowsUnifiedEngineDefault}`),
  (value) => value.replace(windowsIdleSettings, '').replace('<MultipleInstancesPolicy>', `${windowsIdleSettings}<MultipleInstancesPolicy>`),
  (value) => value.replace(windowsRemoteAppDefault, '').replace('<AllowStartOnDemand>', `${windowsRemoteAppDefault}<AllowStartOnDemand>`),
]) {
  test(() => assert.throws(
    () => validateExportedXml(mutate(withWindowsExportDefaults(taskXmlText))),
    /exported-task-(?:xml|policy)-drift/,
  ));
}

for (const mutate of [
  (value) => value.replace('</Triggers>', '<TimeTrigger><StartBoundary>2026-09-17T02:00:00.000Z</StartBoundary></TimeTrigger></Triggers>'),
  (value) => value.replace('</Actions>', '<Exec><Command>cmd.exe</Command></Exec></Actions>'),
  (value) => value.replace('</Principals>', '<Principal id="Other"><UserId>S-1-0-0</UserId></Principal></Principals>'),
  (value) => value.replace(/<Command>[^<]+<\/Command>/, '<Command>cmd.exe</Command>'),
  (value) => value.replace(/<Arguments>[^<]+<\/Arguments>/, '<Arguments>--changed</Arguments>'),
  (value) => value.replace(/<WorkingDirectory>[^<]+<\/WorkingDirectory>/, '<WorkingDirectory>C:\\changed</WorkingDirectory>'),
  (value) => value.replace(/<UserId>[^<]+<\/UserId>/, '<UserId>S-1-0-0</UserId>'),
  (value) => value.replace('<LogonType>S4U</LogonType>', '<LogonType>Password</LogonType>'),
  (value) => value.replace('<RunLevel>LeastPrivilege</RunLevel>', '<RunLevel>HighestAvailable</RunLevel>'),
  (value) => value.replace('<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>', '<MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>'),
  (value) => value.replace('<StartWhenAvailable>false</StartWhenAvailable>', '<StartWhenAvailable>true</StartWhenAvailable>'),
  (value) => value.replace('<ExecutionTimeLimit>PT15M</ExecutionTimeLimit>', '<ExecutionTimeLimit>PT30M</ExecutionTimeLimit>'),
  (value) => value.replace('</TimeTrigger>', '<Repetition><Interval>PT1M</Interval></Repetition></TimeTrigger>'),
  (value) => value.replace('</Settings>', '<RestartOnFailure><Interval>PT1M</Interval><Count>1</Count></RestartOnFailure></Settings>'),
  (value) => value.replace('<StartBoundary>2026-09-17T02:00:00.000Z</StartBoundary>', '<StartBoundary>2026-09-17T02:01:00.000Z</StartBoundary>'),
  (value) => value.replace('<EndBoundary>2026-09-17T02:30:00.000Z</EndBoundary>', '<EndBoundary>2026-09-17T02:31:00.000Z</EndBoundary>'),
  (value) => value.replace('</Settings>', '<UnknownSetting>false</UnknownSetting></Settings>'),
  (value) => value.replace('<WakeToRun>false</WakeToRun>', ''),
]) {
  test(() => assert.throws(
    () => validateExportedXml(mutate(withWindowsExportDefaults(taskXmlText))),
    /exported-task-xml-drift/,
  ));
}

test(() => {
  const { dependencies, state } = makeHarness();
  const result = runStage8WindowsTaskRegisterExecution(checkArgv, dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'checked');
  assert.equal(result.repeatedCheckByteIdentical, true);
  assert.equal(result.authorizationDirectoryFiles, 2);
  assert.equal(result.taskAbsent, true);
  assert.equal(result.evidenceAbsent, true);
  assert.equal(result.scheduledTasksRead, 2);
  assert.equal(result.scheduledTasksMutated, 0);
  assert.equal(result.filesWritten, 0);
  assert.deepEqual(state.events, ['inspect', 'inspect']);
});

for (const failAt of [
  `create-folder:${executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER}`,
  `create-folder:${executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER}`,
  `create-folder-after:${executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER}`,
  'register-task-before',
  'export-task',
  'post-inspect',
]) {
  test(() => {
    const { dependencies, state } = makeHarness({ failAt });
    const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, dependencies));
    assert.equal(error.failureEvidence.cleanupSucceeded, true, failAt);
    assert.equal(state.task.exists, false, failAt);
    assert.deepEqual([...state.folders.values()], [false, false], failAt);
  });
}

test(() => {
  const { dependencies } = makeHarness();
  dependencies.environment = {};
  assert.throws(() => runStage8WindowsTaskRegisterExecution(checkArgv, dependencies), /check-gate-required/);
  assert.throws(() => runStage8WindowsTaskRegisterExecution(mutateArgv, dependencies), /mutation-gate-required/);
});

test(() => assert.throws(
  () => runStage8WindowsTaskRegisterExecution(['--register', '--product-approved-register-execution-only'], makeHarness().dependencies),
  /usage/,
));

for (const entries of [
  [{ name: 'materials-emit.json', kind: 'file' }],
  [{ name: 'materials-emit.json', kind: 'file' }, { name: 'register.json', kind: 'file' }, { name: 'register.json.partial', kind: 'file' }],
  [{ name: 'materials-emit.json', kind: 'file' }, { name: 'register.json', kind: 'symbolic-link' }],
]) {
  test(() => assert.throws(
    () => runStage8WindowsTaskRegisterExecution(checkArgv, makeHarness({ authorizationEntries: entries }).dependencies),
    /authorization-directory/,
  ));
}

test(() => {
  const overrides = new Map([[key(formalPaths.registerAuthorizationPath), Buffer.from(formalBytes.get(key(formalPaths.registerAuthorizationPath)))]]);
  overrides.get(key(formalPaths.registerAuthorizationPath))[10] ^= 1;
  assert.throws(() => runStage8WindowsTaskRegisterExecution(checkArgv, makeHarness({ readOverrides: overrides }).dependencies), /authorization-file-hash-drift/);
});

test(() => {
  const harness = makeHarness();
  harness.state.files.set(key(evidencePath), Buffer.from('{}'));
  assert.throws(() => runStage8WindowsTaskRegisterExecution(checkArgv, harness.dependencies), /evidence-already-exists/);
});

test(() => {
  const harness = makeHarness();
  harness.state.folders.set(executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER, true);
  assert.throws(() => runStage8WindowsTaskRegisterExecution(checkArgv, harness.dependencies), /folder-already-exists/);
});

test(() => {
  const harness = makeHarness();
  harness.state.task = {
    ...absentTask(), exists: true, taskPath: control.task.taskPath, taskName: control.task.taskName,
    state: 'Ready', runningInstances: 0, lastTaskResult: null,
  };
  assert.throws(() => runStage8WindowsTaskRegisterExecution(checkArgv, harness.dependencies), /task-already-exists/);
});

test(() => {
  const { dependencies, state } = makeHarness();
  const result = runStage8WindowsTaskRegisterExecution(mutateArgv, dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'registered-and-verified');
  assert.deepEqual(result.createdFolders, [
    executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER,
    executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER,
  ]);
  assert.equal(result.taskState, 'Ready');
  assert.equal(result.runningInstances, 0);
  assert.equal(result.lastTaskResult, null);
  assert.equal(result.scheduledTasksMutated, 1);
  assert.equal(state.files.has(key(evidencePath)), true);
  assert.equal(state.files.has(key(stagingPath)), false);
  assert.deepEqual(state.events.slice(0, 7), [
    'inspect',
    `create-folder:${executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER}`,
    `create-folder:${executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER}`,
    'register-task',
    'export-task',
    'inspect',
    'open:registration.json.partial:wx',
  ]);
  assert.deepEqual(state.events.slice(7), [
    'write', 'fsync', 'close', 'read:registration.json.partial', 'rename', 'read:registration.json',
  ]);
});

test(() => {
  const { dependencies, state } = makeHarness({ evidenceRootAbsent: true });
  const result = runStage8WindowsTaskRegisterExecution(mutateArgv, dependencies);
  assert.equal(result.ok, true);
  assert.equal(state.directories.has(key(control.paths.evidenceRoot)), true);
  assert.ok(state.events.includes('mkdir:evidence'));
});

test(() => {
  const { dependencies, state } = makeHarness({ evidenceRootAbsent: true, failAt: 'open' });
  const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, dependencies));
  assert.equal(error.failureEvidence.cleanupSucceeded, true);
  assert.equal(error.failureEvidence.evidenceDirectoryCreated, true);
  assert.equal(state.directories.has(key(control.paths.evidenceRoot)), false);
  assert.ok(state.events.includes('rmdir:evidence'));
});

test(() => {
  const harness = makeHarness();
  runStage8WindowsTaskRegisterExecution(mutateArgv, harness.dependencies);
  const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, harness.dependencies));
  assert.match(error.message, /evidence-already-exists/);
  assert.equal(harness.state.task.exists, true);
});

test(() => {
  const { dependencies, state } = makeHarness({ exportedTaskXml: taskXmlText.replace('<LogonType>S4U</LogonType>', '<LogonType>Password</LogonType>') });
  const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, dependencies));
  assert.equal(error.failureEvidence.cleanupSucceeded, true);
  assert.equal(state.task.exists, false);
  assert.deepEqual([...state.folders.values()], [false, false]);
  assert.ok(state.events.indexOf('unregister-task') < state.events.indexOf(`delete-folder:${executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER}`));
});

for (const options of [
  { postTaskState: 'Running' },
  { postRunningInstances: 1 },
  { postLastTaskResult: 0 },
]) {
  test(() => {
    const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, makeHarness(options).dependencies));
    assert.equal(error.failureEvidence.cleanupSucceeded, true);
  });
}

for (const failAt of ['open', 'write', 'short-write', 'fsync', 'close', 'staging-read', 'rename', 'final-read']) {
  test(() => {
    const { dependencies, state } = makeHarness({ failAt });
    const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, dependencies));
    assert.equal(error.failureEvidence.cleanupSucceeded, true, failAt);
    assert.equal(state.task.exists, false, failAt);
    assert.deepEqual([...state.folders.values()], [false, false], failAt);
    assert.equal(state.files.has(key(evidencePath)), false, failAt);
    assert.equal(state.files.has(key(stagingPath)), false, failAt);
  });
}

test(() => {
  const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, makeHarness({ failAt: 'register-task-after' }).dependencies));
  assert.equal(error.failureEvidence.taskCreated, true);
  assert.equal(error.failureEvidence.taskRollbackCompleted, true);
  assert.equal(error.failureEvidence.cleanupSucceeded, true);
});

test(() => {
  const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, makeHarness({
    failAt: 'unregister-task',
    exportedTaskXml: '<Task></Task>',
  }).dependencies));
  assert.equal(error.failureEvidence.cleanupSucceeded, false);
  assert.equal(error.failureEvidence.taskResidual, true);
  assert.ok(error.failureEvidence.cleanupErrors.some((message) => message.startsWith('task-unregister:')));
});

test(() => {
  const error = captureFailure(() => runStage8WindowsTaskRegisterExecution(mutateArgv, makeHarness({
    failAt: `delete-folder:${executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER}`,
    exportedTaskXml: '<Task></Task>',
  }).dependencies));
  assert.equal(error.failureEvidence.cleanupSucceeded, false);
  assert.deepEqual(error.failureEvidence.folderResiduals, [
    executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER,
    executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER,
  ]);
});

test(() => {
  const source = fs.readFileSync(new URL('./stage8-windows-task-register-execution.mjs', import.meta.url), 'utf8');
  assert.match(source, /Export-ScheduledTask/);
  assert.match(source, /RegisterTask\(\$taskName, \$xml, \$TASK_CREATE/);
  assert.doesNotMatch(source, /Start-ScheduledTask|-Force|TASK_CREATE_OR_UPDATE/i);
  assert.doesNotMatch(source, /runAuthorization|verifyAuthorization|deleteAuthorization/);
});

console.log(JSON.stringify({
  ok: true,
  checks,
  productionSchedulerCalls: 0,
  actualScheduledTasksMutated: 0,
  realFilesWritten: 0,
  diagnosticsRun: 0,
  formalPilotGamesCredited: 0,
  trainingRuns: 0,
  deployments: 0,
}, null, 2));
