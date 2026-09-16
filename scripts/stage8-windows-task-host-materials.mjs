import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDirectory, '..');

function loadProtocol() {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
  try {
    return require('../src/game/stage8/offline-windows-task-host-control.ts');
  } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const protocol = loadProtocol();

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function quoteWindowsArgument(value) {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/u, '$1$1')}"`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function encodeTaskXml(taskXml) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(taskXml, 'utf16le')]);
}

export function renderStage8WindowsTaskXml(control) {
  protocol.validateStage8WindowsTaskHostControl(control, { osTempRoot: os.tmpdir() });
  const taskArguments = [control.command.hostRunnerPath, '--run', control.paths.controlPath, control.paths.runAuthorizationPath]
    .map(quoteWindowsArgument)
    .join(' ');
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '  <RegistrationInfo><Description>Stage8 disposable diagnostic host candidate; no formal Pilot credit.</Description></RegistrationInfo>',
    '  <Triggers>',
    `    <TimeTrigger><StartBoundary>${xml(control.task.trigger.startBoundaryUtc)}</StartBoundary><EndBoundary>${xml(control.task.trigger.endBoundaryUtc)}</EndBoundary><Enabled>true</Enabled></TimeTrigger>`,
    '  </Triggers>',
    '  <Principals>',
    `    <Principal id="Author"><UserId>${xml(control.task.principal.userSid)}</UserId><LogonType>S4U</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>`,
    '  </Principals>',
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <AllowHardTerminate>true</AllowHardTerminate>',
    '    <StartWhenAvailable>false</StartWhenAvailable>',
    '    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>',
    '    <AllowStartOnDemand>false</AllowStartOnDemand>',
    '    <Enabled>true</Enabled>',
    '    <Hidden>false</Hidden>',
    '    <RunOnlyIfIdle>false</RunOnlyIfIdle>',
    '    <WakeToRun>false</WakeToRun>',
    '    <ExecutionTimeLimit>PT15M</ExecutionTimeLimit>',
    '    <Priority>7</Priority>',
    '  </Settings>',
    '  <Actions Context="Author">',
    `    <Exec><Command>${xml(control.command.executablePath)}</Command><Arguments>${xml(taskArguments)}</Arguments><WorkingDirectory>${xml(control.command.workingDirectory)}</WorkingDirectory></Exec>`,
    '  </Actions>',
    '</Task>',
    '',
  ].join('\r\n');
}

export function buildStage8WindowsTaskMaterials(control) {
  const taskXml = renderStage8WindowsTaskXml(control);
  const materialPayload = {
    materialVersion: protocol.STAGE8_WINDOWS_TASK_HOST_MATERIAL_VERSION,
    hostRunId: control.hostRunId,
    controlManifestSha256: control.manifestSha256,
    taskPath: control.task.taskPath,
    taskName: control.task.taskName,
    taskXmlSha256: sha256(encodeTaskXml(taskXml)),
    materialsAuthorizationSha256: null,
    mutationCommandsIncluded: false,
    scheduledTasksMutated: 0,
    formalPilotGamesCredited: 0,
  };
  return { taskXml, material: { ...materialPayload, materialSha256: protocol.hashStage8WindowsTaskHostMaterialPayload(materialPayload) } };
}

export function emitStage8WindowsTaskMaterials({ control, authorization, outputDirectory }) {
  protocol.validateStage8WindowsTaskHostControl(control, { osTempRoot: os.tmpdir() });
  protocol.validateStage8WindowsTaskHostPhaseAuthorization(authorization, control, 'materials-emit');
  if (!path.win32.isAbsolute(outputDirectory) || !path.resolve(outputDirectory).toLowerCase().startsWith(`${path.resolve(os.tmpdir()).toLowerCase()}${path.sep}`)) {
    throw new Error('stage8-windows-task-host-material-output-outside-os-temp');
  }
  fs.mkdirSync(outputDirectory, { recursive: false });
  const { taskXml, material } = buildStage8WindowsTaskMaterials(control);
  const { materialSha256: ignored, ...materialPayload } = material;
  void ignored;
  const authorizedMaterialPayload = { ...materialPayload, materialsAuthorizationSha256: authorization.authorizationSha256 };
  const authorizedMaterial = { ...authorizedMaterialPayload, materialSha256: protocol.hashStage8WindowsTaskHostMaterialPayload(authorizedMaterialPayload) };
  fs.writeFileSync(path.join(outputDirectory, 'task-definition.xml'), encodeTaskXml(taskXml), { flag: 'wx' });
  fs.writeFileSync(path.join(outputDirectory, 'task-materials.json'), `${JSON.stringify(authorizedMaterial, null, 2)}\n`, { flag: 'wx' });
  return { outputDirectory, filesWritten: 2, scheduledTasksMutated: 0, material: authorizedMaterial };
}

function readJson(absolutePath) {
  if (!path.win32.isAbsolute(absolutePath)) throw new Error('stage8-windows-task-host-cli-path-must-be-absolute');
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

export function runStage8WindowsTaskMaterialsCli(argv = process.argv.slice(2)) {
  const [mode, controlPath, authorizationPath, outputDirectory] = argv;
  if (mode === '--check' && argv.length === 2) {
    const control = protocol.validateStage8WindowsTaskHostControl(readJson(controlPath), { osTempRoot: os.tmpdir() });
    const built = buildStage8WindowsTaskMaterials(control);
    return { ok: true, filesWritten: 0, scheduledTasksMutated: 0, taskXmlSha256: built.material.taskXmlSha256 };
  }
  if (mode === '--emit' && argv.length === 4) {
    const control = protocol.validateStage8WindowsTaskHostControl(readJson(controlPath), { osTempRoot: os.tmpdir() });
    return emitStage8WindowsTaskMaterials({ control, authorization: readJson(authorizationPath), outputDirectory });
  }
  throw new Error('usage: node stage8-windows-task-host-materials.mjs --check <absolute-control-path> | --emit <absolute-control-path> <absolute-materials-authorization-path> <absolute-output-directory>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    console.log(JSON.stringify(runStage8WindowsTaskMaterialsCli(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), filesWritten: 0, scheduledTasksMutated: 0 }, null, 2));
    process.exitCode = 1;
  }
}

export { projectRoot };
