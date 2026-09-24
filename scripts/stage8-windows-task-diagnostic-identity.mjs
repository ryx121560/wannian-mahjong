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
  try { return require('../src/game/stage8/offline-windows-task-diagnostic-identity.ts'); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const tools = loadTools();

function inspectCheckout(projectRoot) {
  const gitPrefix = ['-c', `safe.directory=${projectRoot}`, '-C', projectRoot];
  const head = spawnSync('git', [...gitPrefix, 'rev-parse', 'HEAD'], { encoding: 'utf8', shell: false, windowsHide: true });
  const status = spawnSync('git', [...gitPrefix, 'status', '--porcelain'], { encoding: 'utf8', shell: false, windowsHide: true });
  if (head.status !== 0 || status.status !== 0) throw new Error('windows-task-diagnostic-git-inspection-failed');
  return { headCommit: head.stdout.trim(), clean: status.stdout.trim() === '' };
}

function parseArgs(argv) {
  if (argv.length !== 5 || argv[0] !== '--check' || argv[1] !== '--source-root' || argv[3] !== '--user-sid') {
    throw new Error('usage: node stage8-windows-task-diagnostic-identity.mjs --check --source-root <clean-absolute-root> --user-sid <sid>');
  }
  if (!path.win32.isAbsolute(argv[2])) throw new Error('windows-task-diagnostic-source-root-must-be-absolute');
  return { mode: 'check', sourceRoot: path.win32.resolve(argv[2]), userSid: argv[4] };
}

export function runStage8WindowsTaskDiagnosticIdentityCheck(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseArgs(argv);
  const nodeExecutablePath = dependencies.nodeExecutablePath ?? process.execPath;
  const osTempRoot = dependencies.osTempRoot ?? os.tmpdir();
  const request = tools.buildStage8WindowsTaskDiagnosticIdentityInput({
    projectRoot: parsed.sourceRoot,
    nodeExecutablePath,
    osTempRoot,
    userSid: parsed.userSid,
  });
  const runtime = {
    expected: { projectRoot: parsed.sourceRoot, nodeExecutablePath, osTempRoot },
    inspectCheckout: dependencies.inspectCheckout ?? inspectCheckout,
    readFile: dependencies.readFile ?? ((absolutePath) => fs.readFileSync(absolutePath)),
  };
  const created = tools.createStage8WindowsTaskDiagnosticIdentityBundle({ request, ...runtime });
  if (!created.ok) throw new Error(created.reason);
  const validated = tools.validateStage8WindowsTaskDiagnosticIdentityBundle({ bundle: created.value, ...runtime });
  if (!validated.ok) throw new Error(validated.reason);
  return {
    ok: true,
    status: 'checked',
    identitySha256: validated.value.identitySha256,
    bundle: created.value,
    filesWritten: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    targetRootReads: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  };
}

export function serializeStage8WindowsTaskDiagnosticIdentityCheck(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(serializeStage8WindowsTaskDiagnosticIdentityCheck(runStage8WindowsTaskDiagnosticIdentityCheck()));
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      status: 'fused',
      error: error instanceof Error ? error.message : String(error),
      filesWritten: 0,
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
