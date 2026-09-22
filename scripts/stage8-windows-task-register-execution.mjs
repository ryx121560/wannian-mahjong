import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { renderStage8WindowsTaskXml } from './stage8-windows-task-host-materials.mjs';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);

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
const hostTools = loadTs('../src/game/stage8/offline-windows-task-host-control.ts');

const schedulerInspectionScript = String.raw`
$ErrorActionPreference = 'Stop'
$taskPath = $env:STAGE8_REGISTER_EXECUTION_TASK_PATH
$taskName = $env:STAGE8_REGISTER_EXECUTION_TASK_NAME
$parentPath = '\WannianMahjong\'
$targetPath = '\WannianMahjong\Stage8\'
if ($taskPath -ne $targetPath -or [string]::IsNullOrWhiteSpace($taskName)) { throw 'scheduler-query-identity-drift' }
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
function Test-ExactFolder([string]$folderPath) {
  $comFolderPath = if ($folderPath -eq '\') { '\' } else { $folderPath.TrimEnd('\') }
  try { $null = $service.GetFolder($comFolderPath); return $true }
  catch { if ($_.Exception.HResult -eq -2147024894) { return $false }; throw }
}
$escapedPath = $taskPath.Replace('\', '\\').Replace("'", "''")
$escapedName = $taskName.Replace('\', '\\').Replace("'", "''")
$filter = "TaskName='$escapedName' AND TaskPath='$escapedPath'"
$matches = @(Get-CimInstance -Namespace 'Root/Microsoft/Windows/TaskScheduler' -ClassName 'MSFT_ScheduledTask' -Filter $filter -ErrorAction Stop)
if ($matches.Count -gt 1) { throw 'task-query-not-unique' }
$taskExists = $matches.Count -eq 1
$state = $null
$runningInstances = $null
$lastTaskResult = $null
if ($taskExists) {
  $folder = $service.GetFolder($taskPath.TrimEnd('\'))
  $task = $folder.GetTask($taskName)
  $stateNames = @('Unknown', 'Disabled', 'Queued', 'Ready', 'Running')
  $state = if ([int]$task.State -ge 0 -and [int]$task.State -lt $stateNames.Count) { $stateNames[[int]$task.State] } else { 'Unknown' }
  $runningInstances = [int]($task.GetInstances(0)).Count
  $lastRun = [datetime]$task.LastRunTime
  $lastTaskResult = if ($lastRun.Year -lt 2000) { $null } else { [int]$task.LastTaskResult }
}
[ordered]@{
  provider = 'windows-task-scheduler'
  querySucceeded = $true
  folders = @(
    [ordered]@{ path = $parentPath; exists = (Test-ExactFolder $parentPath) },
    [ordered]@{ path = $targetPath; exists = (Test-ExactFolder $targetPath) }
  )
  task = [ordered]@{
    queriedTaskPath = $taskPath
    queriedTaskName = $taskName
    exists = $taskExists
    taskPath = if ($taskExists) { $taskPath } else { $null }
    taskName = if ($taskExists) { $taskName } else { $null }
    state = if ($taskExists) { $state } else { $null }
    runningInstances = if ($taskExists) { $runningInstances } else { $null }
    lastTaskResult = if ($taskExists) { $lastTaskResult } else { $null }
  }
} | ConvertTo-Json -Depth 6 -Compress
`;

const createFolderScript = String.raw`
$ErrorActionPreference = 'Stop'
$folderPath = $env:STAGE8_REGISTER_EXECUTION_FOLDER_PATH
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
if ($folderPath -eq '\WannianMahjong\') {
  $parent = $service.GetFolder('\')
  try { $null = $service.GetFolder($folderPath.TrimEnd('\')); throw 'folder-already-exists' } catch { if ($_.Exception.Message -eq 'folder-already-exists') { throw } }
  $null = $parent.CreateFolder('WannianMahjong', $null)
} elseif ($folderPath -eq '\WannianMahjong\Stage8\') {
  $parent = $service.GetFolder('\WannianMahjong')
  try { $null = $service.GetFolder($folderPath.TrimEnd('\')); throw 'folder-already-exists' } catch { if ($_.Exception.Message -eq 'folder-already-exists') { throw } }
  $null = $parent.CreateFolder('Stage8', $null)
} else {
  throw 'folder-path-forbidden'
}
[ordered]@{ created = $true; path = $folderPath } | ConvertTo-Json -Compress
`;

const registerTaskScript = String.raw`
$ErrorActionPreference = 'Stop'
$taskPath = $env:STAGE8_REGISTER_EXECUTION_TASK_PATH
$taskName = $env:STAGE8_REGISTER_EXECUTION_TASK_NAME
$xmlPath = $env:STAGE8_REGISTER_EXECUTION_XML_PATH
$userSid = $env:STAGE8_REGISTER_EXECUTION_USER_SID
if ($taskPath -ne '\WannianMahjong\Stage8\' -or [string]::IsNullOrWhiteSpace($taskName) -or [string]::IsNullOrWhiteSpace($userSid)) { throw 'register-identity-drift' }
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder($taskPath.TrimEnd('\'))
try { $null = $folder.GetTask($taskName); throw 'task-already-exists' } catch { if ($_.Exception.Message -eq 'task-already-exists') { throw } }
$xml = [IO.File]::ReadAllText($xmlPath)
$TASK_CREATE = 2
$TASK_LOGON_S4U = 2
$null = $folder.RegisterTask($taskName, $xml, $TASK_CREATE, $userSid, $null, $TASK_LOGON_S4U, $null)
[ordered]@{ registered = $true; taskPath = $taskPath; taskName = $taskName } | ConvertTo-Json -Compress
`;

const exportTaskScript = String.raw`
$ErrorActionPreference = 'Stop'
$taskPath = $env:STAGE8_REGISTER_EXECUTION_TASK_PATH
$taskName = $env:STAGE8_REGISTER_EXECUTION_TASK_NAME
$xml = Export-ScheduledTask -TaskPath $taskPath -TaskName $taskName -ErrorAction Stop
[Console]::Out.Write($xml)
`;

const deleteTaskScript = String.raw`
$ErrorActionPreference = 'Stop'
$taskPath = $env:STAGE8_REGISTER_EXECUTION_TASK_PATH
$taskName = $env:STAGE8_REGISTER_EXECUTION_TASK_NAME
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder($taskPath.TrimEnd('\'))
$folder.DeleteTask($taskName, 0)
[ordered]@{ deleted = $true; taskPath = $taskPath; taskName = $taskName } | ConvertTo-Json -Compress
`;

const deleteFolderScript = String.raw`
$ErrorActionPreference = 'Stop'
$folderPath = $env:STAGE8_REGISTER_EXECUTION_FOLDER_PATH
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
if ($folderPath -eq '\WannianMahjong\Stage8\') {
  $parent = $service.GetFolder('\WannianMahjong')
  $parent.DeleteFolder('Stage8', 0)
} elseif ($folderPath -eq '\WannianMahjong\') {
  $parent = $service.GetFolder('\')
  $parent.DeleteFolder('WannianMahjong', 0)
} else {
  throw 'folder-path-forbidden'
}
[ordered]@{ deleted = $true; path = $folderPath } | ConvertTo-Json -Compress
`;

function parseArgs(argv) {
  if (argv.length !== 2
    || !['--check', '--register-and-verify'].includes(argv[0])
    || argv[1] !== '--product-approved-register-execution-only') {
    throw new Error('usage: node stage8-windows-task-register-execution.mjs --check|--register-and-verify --product-approved-register-execution-only');
  }
  return { mode: argv[0] };
}

function encodeTaskXml(taskXml) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(taskXml, 'utf16le')]);
}

function listDirectory(absolutePath) {
  return fs.readdirSync(absolutePath, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    kind: entry.isSymbolicLink() ? 'symbolic-link' : entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other',
  }));
}

function fileSystem(dependencies) {
  const injected = dependencies.fileSystem ?? {};
  return {
    existsSync: injected.existsSync ?? ((target) => fs.existsSync(target)),
    statSync: injected.statSync ?? ((target) => fs.statSync(target)),
    mkdirSync: injected.mkdirSync ?? ((target, options) => fs.mkdirSync(target, options)),
    openSync: injected.openSync ?? ((target, flags) => fs.openSync(target, flags)),
    writeSync: injected.writeSync ?? ((handle, bytes) => fs.writeSync(handle, bytes)),
    fsyncSync: injected.fsyncSync ?? ((handle) => fs.fsyncSync(handle)),
    closeSync: injected.closeSync ?? ((handle) => fs.closeSync(handle)),
    renameSync: injected.renameSync ?? ((source, target) => fs.renameSync(source, target)),
    readFileSync: injected.readFileSync ?? ((target) => fs.readFileSync(target)),
    unlinkSync: injected.unlinkSync ?? ((target) => fs.unlinkSync(target)),
    rmdirSync: injected.rmdirSync ?? ((target) => fs.rmdirSync(target)),
  };
}

function powershellPath(environment) {
  const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? 'C:\\Windows';
  return path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function invokePowerShell(script, environment, dependencies, extraEnvironment = {}, expectJson = true) {
  const spawn = dependencies.spawnSync ?? spawnSync;
  const result = spawn(powershellPath(environment), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: { ...environment, ...extraEnvironment },
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    throw new Error('windows-task-register-execution-powershell-failed');
  }
  if (!expectJson) return result.stdout;
  try { return JSON.parse(result.stdout.trim()); }
  catch { throw new Error('windows-task-register-execution-powershell-output-invalid'); }
}

export function inspectStage8WindowsTaskRegisterExecutionScheduler(taskPath, taskName, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return invokePowerShell(schedulerInspectionScript, environment, dependencies, {
    STAGE8_REGISTER_EXECUTION_TASK_PATH: taskPath,
    STAGE8_REGISTER_EXECUTION_TASK_NAME: taskName,
  });
}

export function createStage8WindowsTaskRegisterExecutionFolder(folderPath, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return invokePowerShell(createFolderScript, environment, dependencies, {
    STAGE8_REGISTER_EXECUTION_FOLDER_PATH: folderPath,
  });
}

export function registerStage8WindowsTaskRegisterExecutionTask(taskPath, taskName, xmlPath, userSid, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return invokePowerShell(registerTaskScript, environment, dependencies, {
    STAGE8_REGISTER_EXECUTION_TASK_PATH: taskPath,
    STAGE8_REGISTER_EXECUTION_TASK_NAME: taskName,
    STAGE8_REGISTER_EXECUTION_XML_PATH: xmlPath,
    STAGE8_REGISTER_EXECUTION_USER_SID: userSid,
  });
}

export function exportStage8WindowsTaskRegisterExecutionTask(taskPath, taskName, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return invokePowerShell(exportTaskScript, environment, dependencies, {
    STAGE8_REGISTER_EXECUTION_TASK_PATH: taskPath,
    STAGE8_REGISTER_EXECUTION_TASK_NAME: taskName,
  }, false);
}

export function unregisterStage8WindowsTaskRegisterExecutionTask(taskPath, taskName, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return invokePowerShell(deleteTaskScript, environment, dependencies, {
    STAGE8_REGISTER_EXECUTION_TASK_PATH: taskPath,
    STAGE8_REGISTER_EXECUTION_TASK_NAME: taskName,
  });
}

export function deleteStage8WindowsTaskRegisterExecutionFolder(folderPath, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  return invokePowerShell(deleteFolderScript, environment, dependencies, {
    STAGE8_REGISTER_EXECUTION_FOLDER_PATH: folderPath,
  });
}

function readJsonBytes(bytes, label) {
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw new Error(`windows-task-register-execution-${label}-json-invalid`); }
}

function validateEvidenceBytes(bytes, formal, expected, label) {
  const parsed = readJsonBytes(bytes, `${label}-evidence`);
  const validated = hostTools.validateStage8WindowsTaskHostRegistrationEvidence(
    parsed,
    formal.control,
    formal.registerAuthorization,
    formal.material,
    formal.materialsAuthorization,
  );
  if (JSON.stringify(validated) !== JSON.stringify(expected)) {
    throw new Error(`windows-task-register-execution-${label}-evidence-drift`);
  }
  return validated;
}

export function buildStage8WindowsTaskRegisterExecutionPreflight(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseArgs(argv);
  const environment = dependencies.environment ?? process.env;
  if (parsed.mode === '--check' && environment.STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_CHECK !== '1') {
    throw new Error('windows-task-register-execution-check-gate-required');
  }
  if (parsed.mode === '--register-and-verify' && environment.STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_MUTATE !== '1') {
    throw new Error('windows-task-register-execution-mutation-gate-required');
  }
  const osTempRoot = dependencies.osTempRoot ?? os.tmpdir();
  const formalPaths = registerTools.deriveStage8WindowsTaskRegisterFormalPaths(osTempRoot);
  const readFile = dependencies.readFile ?? ((target) => fs.readFileSync(target));
  const readDirectory = dependencies.listDirectory ?? listDirectory;
  const io = fileSystem(dependencies);
  const allowedFiles = [
    formalPaths.controlPath,
    formalPaths.evidencePath,
    formalPaths.materialsAuthorizationPath,
    formalPaths.registerAuthorizationPath,
    formalPaths.taskDefinitionPath,
    formalPaths.taskMaterialsPath,
  ];
  let formalFilesRead = 0;
  const readFormalFile = (target) => {
    if (!allowedFiles.some((allowed) => path.win32.resolve(allowed).toLowerCase() === path.win32.resolve(target).toLowerCase())) {
      throw new Error('windows-task-register-execution-formal-read-not-allowlisted');
    }
    formalFilesRead += 1;
    return readFile(target);
  };
  const formal = executionTools.validateStage8WindowsTaskRegisterExecutionFormalState({
    controlBytes: readFormalFile(formalPaths.controlPath),
    evidenceBytes: readFormalFile(formalPaths.evidencePath),
    materialsAuthorizationBytes: readFormalFile(formalPaths.materialsAuthorizationPath),
    registerAuthorizationBytes: readFormalFile(formalPaths.registerAuthorizationPath),
    taskXmlBytes: readFormalFile(formalPaths.taskDefinitionPath),
    taskMaterialsBytes: readFormalFile(formalPaths.taskMaterialsPath),
    authorizationDirectoryEntries: readDirectory(formalPaths.authorizationDirectory),
    materialsDirectoryEntries: readDirectory(formalPaths.materialsDirectory),
    osTempRoot,
    renderTaskXmlBytes: dependencies.renderTaskXmlBytes ?? ((control) => encodeTaskXml(renderStage8WindowsTaskXml(control))),
  });
  if (!formal.ok) throw new Error(formal.reason);
  const evidencePath = path.win32.join(formal.value.control.paths.evidenceRoot, 'registration.json');
  const stagingPath = `${evidencePath}.partial`;
  const evidenceRootExists = io.existsSync(formal.value.control.paths.evidenceRoot);
  if (evidenceRootExists && !io.statSync(formal.value.control.paths.evidenceRoot).isDirectory()) {
    throw new Error('windows-task-register-execution-evidence-root-not-directory');
  }
  const evidenceRootParent = path.win32.dirname(formal.value.control.paths.evidenceRoot);
  if (!evidenceRootExists
    && (!io.existsSync(evidenceRootParent) || !io.statSync(evidenceRootParent).isDirectory())) {
    throw new Error('windows-task-register-execution-evidence-root-parent-missing');
  }
  if (io.existsSync(evidencePath) || io.existsSync(stagingPath)) {
    throw new Error('windows-task-register-execution-evidence-already-exists');
  }
  const schedulerInspector = dependencies.schedulerInspector ?? inspectStage8WindowsTaskRegisterExecutionScheduler;
  const rawInspection = schedulerInspector(formal.value.targets.taskPath, formal.value.targets.taskName, dependencies);
  const inspection = executionTools.validateStage8WindowsTaskRegisterExecutionPreInspection(rawInspection, formal.value);
  if (!inspection.ok) throw new Error(inspection.reason);
  return {
    mode: parsed.mode,
    formal: formal.value,
    formalPaths,
    taskXmlBytes: readFile(formalPaths.taskDefinitionPath),
    inspection: inspection.value,
    evidencePath,
    stagingPath,
    evidenceRootExists,
    formalFilesRead,
    formalDirectoriesRead: 2,
    scheduledTasksRead: 1,
  };
}

function checkSummary(preflight) {
  const formal = preflight.formal;
  return {
    ok: true,
    status: 'checked',
    protocolVersion: executionTools.STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_VERSION,
    hostRunId: formal.control.hostRunId,
    taskPath: formal.targets.taskPath,
    taskName: formal.targets.taskName,
    controlManifestSha256: formal.control.manifestSha256,
    materialSha256: formal.material.materialSha256,
    taskXmlSha256: formal.material.taskXmlSha256,
    registerAuthorizationSha256: formal.registerAuthorization.authorizationSha256,
    registerAuthorizationFileSha256: executionTools.STAGE8_WINDOWS_TASK_REGISTER_AUTHORIZATION_FILE_SHA256,
    checkIdentitySha256: executionTools.hashStage8WindowsTaskRegisterExecutionCheckIdentity({
      controlManifestSha256: formal.control.manifestSha256,
      materialSha256: formal.material.materialSha256,
      registerAuthorizationSha256: formal.registerAuthorization.authorizationSha256,
      taskPath: formal.targets.taskPath,
      taskName: formal.targets.taskName,
      foldersAbsent: true,
      taskAbsent: true,
    }),
    authorizationDirectoryFiles: 2,
    materialsDirectoryFiles: 2,
    folders: preflight.inspection.folders,
    taskAbsent: true,
    evidencePath: preflight.evidencePath,
    evidenceRootExists: preflight.evidenceRootExists,
    evidenceAbsent: true,
    filesWritten: 0,
    directoriesCreated: 0,
    scheduledTasksRead: preflight.scheduledTasksRead,
    scheduledTasksMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
    trainingRuns: 0,
    deployments: 0,
    formalFilesRead: preflight.formalFilesRead,
    formalDirectoriesRead: preflight.formalDirectoriesRead,
  };
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }

function recoverCreatedState(state, preflight, dependencies) {
  try {
    const current = (dependencies.schedulerInspector ?? inspectStage8WindowsTaskRegisterExecutionScheduler)(
      preflight.formal.targets.taskPath,
      preflight.formal.targets.taskName,
      dependencies,
    );
    state.rollbackInspections += 1;
    if (state.registerAttempted && current?.task?.exists) state.taskCreated = true;
    for (const folder of current?.folders ?? []) {
      if (folder.exists && state.folderAttempts.includes(folder.path) && !state.createdFolders.includes(folder.path)) {
        state.createdFolders.push(folder.path);
      }
    }
  } catch (error) {
    state.cleanupErrors.push(`recovery-inspection:${error instanceof Error ? error.message : String(error)}`);
  }
}

function rollbackFailure(cause, state, preflight, dependencies, io) {
  recoverCreatedState(state, preflight, dependencies);
  if (state.handle !== null) {
    try { io.closeSync(state.handle); } catch (error) { state.cleanupErrors.push(`close:${error instanceof Error ? error.message : String(error)}`); }
    state.handle = null;
  }
  for (const target of [preflight.evidencePath, preflight.stagingPath]) {
    if ((target === preflight.evidencePath && !state.evidenceFinalCreated)
      || (target === preflight.stagingPath && !state.evidencePartialCreated)) continue;
    if (io.existsSync(target)) {
      try { io.unlinkSync(target); } catch (error) { state.cleanupErrors.push(`evidence-delete:${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  if (state.taskCreated) {
    try {
      (dependencies.taskUnregister ?? unregisterStage8WindowsTaskRegisterExecutionTask)(
        preflight.formal.targets.taskPath,
        preflight.formal.targets.taskName,
        dependencies,
      );
      state.taskRollbackCompleted = true;
      state.scheduledTasksMutated += 1;
    } catch (error) { state.cleanupErrors.push(`task-unregister:${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const folderPath of [...state.createdFolders].reverse()) {
    try {
      (dependencies.folderDelete ?? deleteStage8WindowsTaskRegisterExecutionFolder)(folderPath, dependencies);
      state.deletedFolders.push(folderPath);
    } catch (error) { state.cleanupErrors.push(`folder-delete:${folderPath}:${error instanceof Error ? error.message : String(error)}`); }
  }
  if (state.evidenceDirectoryCreated && io.existsSync(preflight.formal.control.paths.evidenceRoot)) {
    try { io.rmdirSync(preflight.formal.control.paths.evidenceRoot); }
    catch (error) { state.cleanupErrors.push(`evidence-directory-delete:${error instanceof Error ? error.message : String(error)}`); }
  }
  let residual = null;
  try {
    residual = (dependencies.schedulerInspector ?? inspectStage8WindowsTaskRegisterExecutionScheduler)(
      preflight.formal.targets.taskPath,
      preflight.formal.targets.taskName,
      dependencies,
    );
    state.rollbackInspections += 1;
  } catch (error) { state.cleanupErrors.push(`final-inspection:${error instanceof Error ? error.message : String(error)}`); }
  const evidenceResidual = io.existsSync(preflight.evidencePath) || io.existsSync(preflight.stagingPath);
  const evidenceDirectoryResidual = state.evidenceDirectoryCreated
    ? io.existsSync(preflight.formal.control.paths.evidenceRoot)
    : false;
  const taskResidual = residual?.task?.exists ?? null;
  const folderResiduals = residual?.folders?.filter((folder) => folder.exists).map((folder) => folder.path) ?? null;
  const cleanupSucceeded = !evidenceResidual && !evidenceDirectoryResidual
    && taskResidual === false && Array.isArray(folderResiduals) && folderResiduals.length === 0;
  const error = new Error(cleanupSucceeded
    ? `windows-task-register-execution-failed:${cause instanceof Error ? cause.message : String(cause)}`
    : `windows-task-register-execution-cleanup-failed-residual:${cause instanceof Error ? cause.message : String(cause)}`);
  error.failureEvidence = {
    filesWritten: state.evidenceFinalCreated ? 1 : 0,
    evidenceResidual,
    evidenceDirectoryCreated: state.evidenceDirectoryCreated,
    evidenceDirectoryResidual,
    taskCreated: state.taskCreated,
    taskRollbackCompleted: state.taskRollbackCompleted,
    taskResidual,
    folderAttempts: state.folderAttempts,
    foldersCreated: state.createdFolders,
    foldersDeleted: state.deletedFolders,
    folderResiduals,
    cleanupAttempted: true,
    cleanupSucceeded,
    cleanupErrors: state.cleanupErrors,
    scheduledTasksRead: preflight.scheduledTasksRead + state.rollbackInspections,
    scheduledTasksMutated: state.scheduledTasksMutated,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
    trainingRuns: 0,
    deployments: 0,
  };
  return error;
}

function registerAndVerify(preflight, dependencies) {
  const io = fileSystem(dependencies);
  const state = {
    folderAttempts: [],
    createdFolders: [],
    deletedFolders: [],
    registerAttempted: false,
    taskCreated: false,
    taskRollbackCompleted: false,
    evidencePartialCreated: false,
    evidenceFinalCreated: false,
    evidenceDirectoryCreated: false,
    handle: null,
    cleanupErrors: [],
    scheduledTasksMutated: 0,
    rollbackInspections: 0,
  };
  try {
    for (const folderPath of [
      executionTools.STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER,
      executionTools.STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER,
    ]) {
      state.folderAttempts.push(folderPath);
      const created = (dependencies.folderCreate ?? createStage8WindowsTaskRegisterExecutionFolder)(folderPath, dependencies);
      if (created?.created !== true || created.path !== folderPath) throw new Error('windows-task-register-execution-folder-create-result-drift');
      state.createdFolders.push(folderPath);
    }
    state.registerAttempted = true;
    const registered = (dependencies.taskRegister ?? registerStage8WindowsTaskRegisterExecutionTask)(
      preflight.formal.targets.taskPath,
      preflight.formal.targets.taskName,
      preflight.formalPaths.taskDefinitionPath,
      preflight.formal.control.task.principal.userSid,
      dependencies,
    );
    if (registered?.registered !== true
      || registered.taskPath !== preflight.formal.targets.taskPath
      || registered.taskName !== preflight.formal.targets.taskName) {
      throw new Error('windows-task-register-execution-task-register-result-drift');
    }
    state.taskCreated = true;
    state.scheduledTasksMutated += 1;
    const exportedTaskXml = (dependencies.taskExport ?? exportStage8WindowsTaskRegisterExecutionTask)(
      preflight.formal.targets.taskPath,
      preflight.formal.targets.taskName,
      dependencies,
    );
    const xmlIdentity = executionTools.validateStage8WindowsTaskRegisterExecutionXmlIdentity({
      taskXmlBytes: preflight.taskXmlBytes,
      exportedTaskXml,
      control: preflight.formal.control,
      material: preflight.formal.material,
    });
    const postRaw = (dependencies.schedulerInspector ?? inspectStage8WindowsTaskRegisterExecutionScheduler)(
      preflight.formal.targets.taskPath,
      preflight.formal.targets.taskName,
      dependencies,
    );
    const post = executionTools.validateStage8WindowsTaskRegisterExecutionPostInspection(postRaw, preflight.formal);
    if (!post.ok) throw new Error(post.reason);
    const evidence = executionTools.createStage8WindowsTaskRegisterExecutionEvidence({
      formal: preflight.formal,
      registeredAtUtc: (dependencies.now ?? (() => new Date()))().toISOString(),
    });
    const bytes = Buffer.from(serialize(evidence));
    if (bytes.length > preflight.formal.control.capacity.maxEvidenceBytes) {
      throw new Error('windows-task-register-execution-evidence-size-cap');
    }
    if (!preflight.evidenceRootExists) {
      io.mkdirSync(preflight.formal.control.paths.evidenceRoot, { recursive: false });
      state.evidenceDirectoryCreated = true;
    }
    state.handle = io.openSync(preflight.stagingPath, 'wx');
    state.evidencePartialCreated = true;
    if (io.writeSync(state.handle, bytes) !== bytes.length) throw new Error('windows-task-register-execution-evidence-short-write');
    io.fsyncSync(state.handle);
    io.closeSync(state.handle);
    state.handle = null;
    validateEvidenceBytes(io.readFileSync(preflight.stagingPath), preflight.formal, evidence, 'staging');
    io.renameSync(preflight.stagingPath, preflight.evidencePath);
    state.evidenceFinalCreated = true;
    state.evidencePartialCreated = false;
    validateEvidenceBytes(io.readFileSync(preflight.evidencePath), preflight.formal, evidence, 'final');
    return {
      ok: true,
      status: 'registered-and-verified',
      protocolVersion: executionTools.STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_VERSION,
      hostRunId: preflight.formal.control.hostRunId,
      taskPath: preflight.formal.targets.taskPath,
      taskName: preflight.formal.targets.taskName,
      createdFolders: state.createdFolders,
      preexistingFoldersDeleted: 0,
      taskState: 'Ready',
      runningInstances: 0,
      lastTaskResult: null,
      normalizedXmlSha256: xmlIdentity.normalizedXmlSha256,
      taskXmlSha256: xmlIdentity.taskXmlSha256,
      registerAuthorizationSha256: preflight.formal.registerAuthorization.authorizationSha256,
      registrationEvidenceSha256: evidence.evidenceSha256,
      registrationEvidencePath: preflight.evidencePath,
      filesWritten: 1,
      directoriesCreated: state.createdFolders.length,
      scheduledTasksRead: preflight.scheduledTasksRead + 1,
      scheduledTasksMutated: state.scheduledTasksMutated,
      diagnosticsRun: 0,
      formalPilotGamesCredited: 0,
      trainingRuns: 0,
      deployments: 0,
    };
  } catch (error) {
    throw rollbackFailure(error, state, preflight, dependencies, io);
  }
}

export function runStage8WindowsTaskRegisterExecution(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseArgs(argv);
  if (parsed.mode === '--check') {
    const first = checkSummary(buildStage8WindowsTaskRegisterExecutionPreflight(argv, dependencies));
    const second = checkSummary(buildStage8WindowsTaskRegisterExecutionPreflight(argv, dependencies));
    if (serialize(first) !== serialize(second)) throw new Error('windows-task-register-execution-repeated-check-drift');
    return {
      ...first,
      repeatedCheckByteIdentical: true,
      scheduledTasksRead: first.scheduledTasksRead + second.scheduledTasksRead,
      formalFilesRead: first.formalFilesRead + second.formalFilesRead,
      formalDirectoriesRead: first.formalDirectoriesRead + second.formalDirectoriesRead,
    };
  }
  return registerAndVerify(buildStage8WindowsTaskRegisterExecutionPreflight(argv, dependencies), dependencies);
}

export function serializeStage8WindowsTaskRegisterExecutionFailure(error) {
  return {
    ok: false,
    status: 'fused',
    error: error instanceof Error ? error.message : String(error),
    ...(error && typeof error === 'object' && 'failureEvidence' in error ? error.failureEvidence : {
      filesWritten: 0,
      cleanupAttempted: false,
      cleanupSucceeded: true,
      cleanupErrors: [],
      scheduledTasksRead: 0,
      scheduledTasksMutated: 0,
      diagnosticsRun: 0,
      formalPilotGamesCredited: 0,
      trainingRuns: 0,
      deployments: 0,
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try { process.stdout.write(serialize(runStage8WindowsTaskRegisterExecution())); }
  catch (error) {
    process.stderr.write(serialize(serializeStage8WindowsTaskRegisterExecutionFailure(error)));
    process.exitCode = 1;
  }
}
