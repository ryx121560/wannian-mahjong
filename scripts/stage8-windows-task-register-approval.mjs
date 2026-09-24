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

function loadTools() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
  try { return require('../src/game/stage8/offline-windows-task-register-approval.ts'); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const tools = loadTools();

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--check' || argv[1] !== '--signer-root' || argv[3] !== '--product-approved-register-only') {
    throw new Error('usage: node stage8-windows-task-register-approval.mjs --check --signer-root <clean-published-root> --product-approved-register-only');
  }
  if (!path.win32.isAbsolute(argv[2])) throw new Error('windows-task-register-signer-root-must-be-absolute');
  return { signerRoot: path.win32.resolve(argv[2]) };
}

function inspectCheckout(projectRoot) {
  const prefix = ['-c', `safe.directory=${projectRoot}`, '-C', projectRoot];
  const head = spawnSync('git', [...prefix, 'rev-parse', 'HEAD'], { encoding: 'utf8', shell: false, windowsHide: true });
  const status = spawnSync('git', [...prefix, 'status', '--porcelain'], { encoding: 'utf8', shell: false, windowsHide: true });
  const sourceRelease = spawnSync('git', [
    ...prefix, 'log', '-1', '--format=%H', '--', ...tools.STAGE8_WINDOWS_TASK_REGISTER_SIGNER_FILES,
  ], { encoding: 'utf8', shell: false, windowsHide: true });
  if (head.status !== 0 || status.status !== 0 || sourceRelease.status !== 0) throw new Error('windows-task-register-git-inspection-failed');
  return {
    headCommit: head.stdout.trim().toLowerCase(),
    clean: status.stdout.trim() === '',
    sourceReleaseCommit: sourceRelease.stdout.trim().toLowerCase(),
  };
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

const schedulerQueryScript = String.raw`
$ErrorActionPreference = 'Stop'
$taskPath = $env:STAGE8_REGISTER_QUERY_TASK_PATH
$taskName = $env:STAGE8_REGISTER_QUERY_TASK_NAME
if ([string]::IsNullOrWhiteSpace($taskPath) -or [string]::IsNullOrWhiteSpace($taskName)) { throw 'query-identity-missing' }
$escapedPath = $taskPath.Replace('\', '\\').Replace("'", "''")
$escapedName = $taskName.Replace('\', '\\').Replace("'", "''")
$filter = "TaskName='$escapedName' AND TaskPath='$escapedPath'"
$matches = @(Get-CimInstance -Namespace 'Root/Microsoft/Windows/TaskScheduler' -ClassName 'MSFT_ScheduledTask' -Filter $filter -ErrorAction Stop)
if ($matches.Count -gt 1) { throw 'query-identity-not-unique' }
$exists = $matches.Count -eq 1
$result = [ordered]@{
  provider = 'windows-task-scheduler'
  querySucceeded = $true
  queriedTaskPath = $taskPath
  queriedTaskName = $taskName
  exists = $exists
  taskPath = if ($exists) { [string]$matches[0].TaskPath } else { $null }
  taskName = if ($exists) { [string]$matches[0].TaskName } else { $null }
}
$result | ConvertTo-Json -Compress
`;

export function inspectStage8WindowsTaskRegisterScheduler(taskPath, taskName, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? 'C:\\Windows';
  const powershellPath = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const spawn = dependencies.spawnSync ?? spawnSync;
  const result = spawn(powershellPath, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', schedulerQueryScript], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: {
      ...environment,
      STAGE8_REGISTER_QUERY_TASK_PATH: taskPath,
      STAGE8_REGISTER_QUERY_TASK_NAME: taskName,
    },
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string' || result.stdout.trim() === '') {
    throw new Error('windows-task-register-scheduler-query-failed');
  }
  try { return JSON.parse(result.stdout.trim()); }
  catch { throw new Error('windows-task-register-scheduler-query-output-invalid'); }
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function samePath(left, right) { return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase(); }
function annotateSchedulerRead(error, scheduledTasksRead) {
  const annotated = error instanceof Error ? error : new Error(String(error));
  annotated.scheduledTasksRead = scheduledTasksRead;
  return annotated;
}

export function buildStage8WindowsTaskRegisterApprovalCheck(argv = process.argv.slice(2), dependencies = {}) {
  if ((dependencies.environment ?? process.env).STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_CHECK !== '1') {
    throw new Error('windows-task-register-product-gate-required');
  }
  const parsed = parseArgs(argv);
  const osTempRoot = dependencies.osTempRoot ?? os.tmpdir();
  const formalPaths = tools.deriveStage8WindowsTaskRegisterFormalPaths(osTempRoot);
  const readFile = dependencies.readFile ?? ((absolutePath) => fs.readFileSync(absolutePath));
  const readDirectory = dependencies.listDirectory ?? listDirectory;
  const allowedFiles = [
    formalPaths.controlPath,
    formalPaths.evidencePath,
    formalPaths.materialsAuthorizationPath,
    formalPaths.taskDefinitionPath,
    formalPaths.taskMaterialsPath,
  ];
  const allowedDirectories = [formalPaths.authorizationDirectory, formalPaths.materialsDirectory];
  let formalFilesRead = 0;
  let formalDirectoriesRead = 0;
  const readFormalFile = (absolutePath) => {
    if (!allowedFiles.some((allowed) => samePath(allowed, absolutePath))) throw new Error('windows-task-register-formal-read-not-allowlisted');
    formalFilesRead += 1;
    return readFile(absolutePath);
  };
  const readFormalDirectory = (absolutePath) => {
    if (!allowedDirectories.some((allowed) => samePath(allowed, absolutePath))) throw new Error('windows-task-register-formal-directory-not-allowlisted');
    formalDirectoriesRead += 1;
    return readDirectory(absolutePath);
  };

  const formal = tools.validateStage8WindowsTaskRegisterFormalState({
    controlBytes: readFormalFile(formalPaths.controlPath),
    evidenceBytes: readFormalFile(formalPaths.evidencePath),
    materialsAuthorizationBytes: readFormalFile(formalPaths.materialsAuthorizationPath),
    taskXmlBytes: readFormalFile(formalPaths.taskDefinitionPath),
    taskMaterialsBytes: readFormalFile(formalPaths.taskMaterialsPath),
    authorizationDirectoryEntries: readFormalDirectory(formalPaths.authorizationDirectory),
    materialsDirectoryEntries: readFormalDirectory(formalPaths.materialsDirectory),
    osTempRoot,
    renderTaskXmlBytes: dependencies.renderTaskXmlBytes ?? ((control) => encodeTaskXml(renderStage8WindowsTaskXml(control))),
  });
  if (!formal.ok) throw new Error(formal.reason);

  const signer = tools.collectStage8WindowsTaskRegisterSignerIdentity({
    projectRoot: parsed.signerRoot,
    inspectCheckout: dependencies.inspectCheckout ?? inspectCheckout,
    readFile,
  });
  if (!signer.ok) throw new Error(signer.reason);
  tools.validateStage8WindowsTaskRegisterTargetPolicy(formal.value.targets, parsed.signerRoot, osTempRoot);

  const schedulerInspector = dependencies.schedulerInspector ?? inspectStage8WindowsTaskRegisterScheduler;
  let rawInspection;
  try { rawInspection = schedulerInspector(formal.value.targets.taskPath, formal.value.targets.taskName); }
  catch (error) { throw annotateSchedulerRead(error, 1); }
  const schedulerInspection = tools.validateStage8WindowsTaskRegisterSchedulerInspection(rawInspection, formal.value.targets);
  if (!schedulerInspection.ok) throw annotateSchedulerRead(new Error(schedulerInspection.reason), 1);

  const decision = dependencies.productDecision ?? tools.createStage8WindowsTaskRegisterProductDecision({
    signer: signer.value,
    formal: formal.value,
    schedulerInspection: schedulerInspection.value,
  });
  const authorization = tools.createStage8WindowsTaskRegisterApprovalInput({
    decision,
    signer: signer.value,
    formal: formal.value,
    schedulerInspection: schedulerInspection.value,
  });
  if (!authorization.ok) throw annotateSchedulerRead(new Error(authorization.reason), 1);
  return {
    formal: formal.value,
    signer: signer.value,
    schedulerInspection: schedulerInspection.value,
    decision,
    authorization: authorization.value,
    formalFilesRead,
    formalDirectoriesRead,
    scheduledTasksRead: 1,
  };
}

export function runStage8WindowsTaskRegisterApprovalCheck(argv = process.argv.slice(2), dependencies = {}) {
  const built = buildStage8WindowsTaskRegisterApprovalCheck(argv, dependencies);
  const checker = dependencies.checkApproval ?? tools.checkStage8WindowsTaskRegisterApproval;
  const checkOnce = () => {
    const checked = checker({
      authorization: built.authorization,
      decision: built.decision,
      signer: built.signer,
      formal: built.formal,
      schedulerInspection: built.schedulerInspection,
    });
    if (!checked.ok) throw annotateSchedulerRead(new Error(checked.reason), built.scheduledTasksRead);
    return {
      ok: true,
      status: 'checked',
      scope: tools.STAGE8_WINDOWS_TASK_REGISTER_SCOPE,
      action: tools.STAGE8_WINDOWS_TASK_REGISTER_ACTION,
      requestId: tools.STAGE8_WINDOWS_TASK_REGISTER_REQUEST_ID,
      ...built.formal.bindings,
      taskPath: built.formal.targets.taskPath,
      taskName: built.formal.targets.taskName,
      registerAuthorizationPath: built.formal.targets.registerAuthorizationPath,
      signerReleaseCommit: built.signer.releaseCommit,
      signerSourceBundleSha256: built.signer.sourceBundleSha256,
      productDecisionSha256: built.decision.decisionSha256,
      approvalId: checked.value.approvalId,
      authorizationInputSha256: checked.value.authorizationInputSha256,
      candidateAuthorizationSha256: checked.value.authorizationSha256,
      checkIdentitySha256: checked.value.checkIdentitySha256,
      targetIdentitySha256: tools.hashStage8WindowsTaskRegisterTargets(built.formal.targets),
      taskAbsent: true,
      phaseApprovals: { 'materials-emit': null, register: null, run: null, verify: null, delete: null },
      filesWritten: 0,
      identityBundlesPersisted: 0,
      approvalInputsPersisted: 0,
      phaseAuthorizationsIssued: 0,
      materialsGenerated: 0,
      scheduledTasksRead: built.scheduledTasksRead,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      diagnosticsRun: 0,
      formalPilotGamesCredited: 0,
      trainingRuns: 0,
      deployments: 0,
      port18768Operations: 0,
    };
  };
  const first = checkOnce();
  const firstBytes = serialize(first);
  const second = checkOnce();
  if (firstBytes !== serialize(second)) throw annotateSchedulerRead(new Error('windows-task-register-repeated-check-drift'), built.scheduledTasksRead);
  return {
    ...first,
    repeatedCheckByteIdentical: true,
    formalFilesRead: built.formalFilesRead,
    formalDirectoriesRead: built.formalDirectoriesRead,
  };
}

export function serializeStage8WindowsTaskRegisterApprovalFailure(error) {
  return {
    ok: false,
    status: 'fused',
    error: error instanceof Error ? error.message : String(error),
    filesWritten: 0,
    identityBundlesPersisted: 0,
    approvalInputsPersisted: 0,
    phaseAuthorizationsIssued: 0,
    materialsGenerated: 0,
    scheduledTasksRead: error && typeof error === 'object' && Number.isInteger(error.scheduledTasksRead) ? error.scheduledTasksRead : 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
    trainingRuns: 0,
    deployments: 0,
    port18768Operations: 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try { process.stdout.write(serialize(runStage8WindowsTaskRegisterApprovalCheck())); }
  catch (error) {
    process.stderr.write(serialize(serializeStage8WindowsTaskRegisterApprovalFailure(error)));
    process.exitCode = 1;
  }
}
