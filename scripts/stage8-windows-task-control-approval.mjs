import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);

function loadTs(relativePath) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
  try { return require(relativePath); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

const approvalTools = loadTs('../src/game/stage8/offline-windows-task-control-approval.ts');
const identityTools = loadTs('../src/game/stage8/offline-windows-task-diagnostic-identity.ts');

function inspectCheckout(projectRoot) {
  const prefix = ['-c', `safe.directory=${projectRoot}`, '-C', projectRoot];
  const head = spawnSync('git', [...prefix, 'rev-parse', 'HEAD'], { encoding: 'utf8', shell: false, windowsHide: true });
  const status = spawnSync('git', [...prefix, 'status', '--porcelain'], { encoding: 'utf8', shell: false, windowsHide: true });
  if (head.status !== 0 || status.status !== 0) throw new Error('windows-task-control-approval-git-inspection-failed');
  return { headCommit: head.stdout.trim().toLowerCase(), clean: status.stdout.trim() === '' };
}

function readJson(absolutePath) {
  if (!path.win32.isAbsolute(absolutePath)) throw new Error('windows-task-control-approval-input-path-must-be-absolute');
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function parseArgs(argv) {
  if (argv.length === 3 && argv[0] === '--check') return { mode: 'check', identityPath: argv[1], authorizationPath: argv[2] };
  if (argv.length === 3 && argv[0] === '--emit') return { mode: 'emit', identityPath: argv[1], authorizationPath: argv[2] };
  if (argv.length === 4 && argv[0] === '--verify') return { mode: 'verify', outputRoot: argv[1], identityPath: argv[2], authorizationPath: argv[3] };
  throw new Error('usage: node stage8-windows-task-control-approval.mjs --check|--emit <identity-bundle.json> <control-approval-input.json> | --verify <output-root> <identity-bundle.json> <control-approval-input.json>');
}

function runtime(identityBundle, dependencies) {
  const inspect = dependencies.inspectCheckout ?? inspectCheckout;
  const readFile = dependencies.readFile ?? ((absolutePath) => fs.readFileSync(absolutePath));
  const expectedOsTempRoot = dependencies.osTempRoot ?? os.tmpdir();
  return {
    expectedOsTempRoot,
    inspectSignerCheckout: inspect,
    readSignerFile: readFile,
    validateIdentityBundle: dependencies.validateIdentityBundle ?? ((bundle) => identityTools.validateStage8WindowsTaskDiagnosticIdentityBundle({
      bundle,
      expected: {
        projectRoot: identityBundle.request.projectRoot,
        nodeExecutablePath: identityBundle.request.nodeExecutablePath,
        osTempRoot: identityBundle.request.osTempRoot,
      },
      inspectCheckout: inspect,
      readFile,
    })),
  };
}

function fileSystem(dependencies) {
  const injected = dependencies.fileSystem ?? {};
  return {
    existsSync: injected.existsSync ?? ((target) => fs.existsSync(target)),
    mkdirSync: injected.mkdirSync ?? ((target, options) => fs.mkdirSync(target, options)),
    writeFileSync: injected.writeFileSync ?? ((target, bytes, options) => fs.writeFileSync(target, bytes, options)),
    readFileSync: injected.readFileSync ?? ((target, encoding) => fs.readFileSync(target, encoding)),
    renameSync: injected.renameSync ?? ((source, target) => fs.renameSync(source, target)),
    readdirSync: injected.readdirSync ?? ((target) => fs.readdirSync(target)),
    rmSync: injected.rmSync ?? ((target, options) => fs.rmSync(target, options)),
    rmdirSync: injected.rmdirSync ?? ((target) => fs.rmdirSync(target)),
  };
}

function writeJsonExclusive(target, value, io, onWritten) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  io.writeFileSync(target, bytes, { encoding: 'utf8', flag: 'wx' });
  onWritten();
  if (io.readFileSync(target, 'utf8') !== bytes) throw new Error('windows-task-control-approval-write-roundtrip-failed');
}

function createEmitParents(outputRoot, expectedOsTempRoot, io, state) {
  const base = path.win32.resolve(expectedOsTempRoot);
  const parent = path.win32.dirname(path.win32.resolve(outputRoot));
  const relative = path.win32.relative(base, parent);
  if (!relative || relative === '..' || relative.startsWith(`..${path.win32.sep}`) || path.win32.isAbsolute(relative)) {
    throw new Error('windows-task-control-approval-emit-parent-forbidden');
  }
  let current = base;
  for (const segment of relative.split(path.win32.sep)) {
    current = path.win32.join(current, segment);
    if (io.existsSync(current)) continue;
    try {
      io.mkdirSync(current, { recursive: false });
      state.createdParentDirectories.push(current);
    } catch (error) {
      if (io.existsSync(current)) state.possibleParentDirectories.push(current);
      throw error;
    }
  }
}

function countEntries(io, target) {
  try { return io.existsSync(target) ? io.readdirSync(target).length : 0; } catch { return null; }
}

function createEmitFailure(cause, state, io) {
  const cleanupErrors = [];
  const outputEntriesBeforeCleanup = countEntries(io, state.outputRoot);
  const stagingEntriesBeforeCleanup = countEntries(io, state.staging);
  if (outputEntriesBeforeCleanup !== null && stagingEntriesBeforeCleanup !== null) {
    state.filesWritten = Math.max(state.filesWritten, outputEntriesBeforeCleanup + stagingEntriesBeforeCleanup);
  }
  const stagingExistedBeforeCleanup = io.existsSync(state.staging);
  if (stagingExistedBeforeCleanup) {
    try { io.rmSync(state.staging, { recursive: true, force: false }); } catch (error) {
      cleanupErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!io.existsSync(state.staging) && !io.existsSync(state.outputRoot)) {
    for (const directory of [...state.createdParentDirectories].reverse()) {
      if (!io.existsSync(directory)) continue;
      try { io.rmdirSync(directory); } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  const outputRootExists = io.existsSync(state.outputRoot);
  const stagingExists = io.existsSync(state.staging);
  const allAttemptParentDirectories = [...new Set([...state.createdParentDirectories, ...state.possibleParentDirectories])];
  const residualParentDirectories = allAttemptParentDirectories.filter((directory) => io.existsSync(directory));
  const outputEntries = countEntries(io, state.outputRoot);
  const stagingEntries = countEntries(io, state.staging);
  const filesRemaining = outputEntries === null || stagingEntries === null ? null : outputEntries + stagingEntries;
  const cleanupSucceeded = cleanupErrors.length === 0 && !outputRootExists && !stagingExists && residualParentDirectories.length === 0;
  const failure = new Error(cleanupSucceeded
    ? `windows-task-control-approval-emit-failed:${cause instanceof Error ? cause.message : String(cause)}`
    : `windows-task-control-approval-emit-cleanup-failed-residual:${cause instanceof Error ? cause.message : String(cause)}`);
  failure.failureEvidence = {
    cause: cause instanceof Error ? cause.message : String(cause),
    filesWritten: state.filesWritten,
    filesRemaining,
    directoriesCreated: allAttemptParentDirectories.length + Number(state.stagingCreated || stagingExistedBeforeCleanup),
    directoriesRemaining: residualParentDirectories.length + Number(outputRootExists) + Number(stagingExists),
    outputRootExists,
    stagingExists,
    cleanupAttempted: true,
    cleanupSucceeded,
    cleanupErrors,
    renameCompleted: state.renameCompleted,
    phaseAuthorizationsIssued: 0,
    scheduledTasksMutated: 0,
    servicesMutated: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  };
  return failure;
}

function createPreexistingOutputFailure(outputRoot, staging, io) {
  const outputRootExists = io.existsSync(outputRoot);
  const stagingExists = io.existsSync(staging);
  const outputEntries = countEntries(io, outputRoot);
  const stagingEntries = countEntries(io, staging);
  const failure = new Error('windows-task-control-approval-output-exists');
  failure.failureEvidence = {
    cause: 'windows-task-control-approval-output-exists',
    filesWritten: 0,
    filesRemaining: outputEntries === null || stagingEntries === null ? null : outputEntries + stagingEntries,
    directoriesCreated: 0,
    directoriesRemaining: 0,
    outputRootExists,
    stagingExists,
    preexistingOutputRoot: outputRootExists,
    preexistingStaging: stagingExists,
    cleanupAttempted: false,
    cleanupSucceeded: true,
    cleanupErrors: [],
    renameCompleted: false,
    phaseAuthorizationsIssued: 0,
    scheduledTasksMutated: 0,
    servicesMutated: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
  };
  return failure;
}

export function runStage8WindowsTaskControlApproval(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseArgs(argv);
  const identityBundle = dependencies.identityBundle ?? readJson(parsed.identityPath);
  const authorization = dependencies.authorization ?? readJson(parsed.authorizationPath);
  const shared = { authorization, identityBundle, ...runtime(identityBundle, dependencies) };
  if (parsed.mode === 'check') {
    const result = approvalTools.createStage8WindowsTaskControlApprovalEvidence(shared);
    if (!result.ok) throw new Error(result.reason);
    return {
      ok: true, status: 'checked', approvalId: result.value.approvalId,
      controlManifestSha256: result.value.controlManifestSha256, evidenceSha256: result.value.evidenceSha256,
      filesWritten: 0, phaseAuthorizationsIssued: 0, scheduledTasksMutated: 0, servicesMutated: 0,
      formalPathsRead: 0, formalPilotGamesCredited: 0,
    };
  }
  if (parsed.mode === 'emit') {
    if ((dependencies.environment ?? process.env).STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_EMIT !== '1') throw new Error('windows-task-control-approval-emit-gate-required');
    const validatedAuthorization = approvalTools.validateStage8WindowsTaskControlApprovalInput(shared);
    if (!validatedAuthorization.ok) throw new Error(validatedAuthorization.reason);
    const result = approvalTools.createStage8WindowsTaskControlApprovalEvidence(shared);
    if (!result.ok) throw new Error(result.reason);
    const outputRoot = validatedAuthorization.value.outputRoot;
    const staging = `${outputRoot}.partial`;
    const io = fileSystem(dependencies);
    if (io.existsSync(outputRoot) || io.existsSync(staging)) throw createPreexistingOutputFailure(outputRoot, staging, io);
    const state = {
      outputRoot,
      staging,
      createdParentDirectories: [],
      possibleParentDirectories: [],
      stagingCreated: false,
      filesWritten: 0,
      renameCompleted: false,
    };
    try {
      createEmitParents(outputRoot, shared.expectedOsTempRoot, io, state);
      io.mkdirSync(staging, { recursive: false });
      state.stagingCreated = true;
      writeJsonExclusive(path.win32.join(staging, 'host-control.json'), result.value.control, io, () => { state.filesWritten += 1; });
      writeJsonExclusive(path.win32.join(staging, 'control-approval-evidence.json'), result.value, io, () => { state.filesWritten += 1; });
      io.renameSync(staging, outputRoot);
      state.renameCompleted = true;
    } catch (error) {
      throw createEmitFailure(error, state, io);
    }
    return {
      ok: true, status: 'emitted', outputRoot,
      controlManifestSha256: result.value.controlManifestSha256, evidenceSha256: result.value.evidenceSha256,
      filesWritten: 2, phaseAuthorizationsIssued: 0, scheduledTasksMutated: 0, servicesMutated: 0,
      formalPathsRead: 0, formalPilotGamesCredited: 0,
    };
  }
  const inputValidation = approvalTools.validateStage8WindowsTaskControlApprovalInput(shared);
  if (!inputValidation.ok) throw new Error(inputValidation.reason);
  if (!path.win32.isAbsolute(parsed.outputRoot)
    || path.win32.resolve(parsed.outputRoot).toLowerCase() !== path.win32.resolve(inputValidation.value.outputRoot).toLowerCase()) throw new Error('windows-task-control-approval-verify-root-forbidden');
  const names = fs.readdirSync(parsed.outputRoot).sort();
  if (names.join(',') !== 'control-approval-evidence.json,host-control.json') throw new Error('windows-task-control-approval-output-schema-invalid');
  const evidence = readJson(path.join(parsed.outputRoot, 'control-approval-evidence.json'));
  const control = readJson(path.join(parsed.outputRoot, 'host-control.json'));
  if (JSON.stringify(evidence.control) !== JSON.stringify(control)) throw new Error('windows-task-control-approval-control-copy-mismatch');
  const verified = approvalTools.validateStage8WindowsTaskControlApprovalEvidence({ evidence, ...shared });
  if (!verified.ok) throw new Error(verified.reason);
  return {
    ok: true, status: 'verified', outputRoot: parsed.outputRoot,
    controlManifestSha256: verified.value.controlManifestSha256, evidenceSha256: verified.value.evidenceSha256,
    filesWritten: 0, phaseAuthorizationsIssued: 0, scheduledTasksMutated: 0, servicesMutated: 0,
    formalPathsRead: 0, formalPilotGamesCredited: 0,
  };
}

export function serializeStage8WindowsTaskControlApprovalFailure(error) {
  const failureEvidence = error && typeof error === 'object' && 'failureEvidence' in error
    ? error.failureEvidence
    : {
      filesWritten: 0, filesRemaining: 0, directoriesCreated: 0, directoriesRemaining: 0,
      outputRootExists: null, stagingExists: null, cleanupAttempted: false, cleanupSucceeded: true, cleanupErrors: [], renameCompleted: false,
      phaseAuthorizationsIssued: 0, scheduledTasksMutated: 0, servicesMutated: 0,
      formalPathsRead: 0, formalPilotGamesCredited: 0,
    };
  return {
    ok: false,
    status: 'fused',
    error: error instanceof Error ? error.message : String(error),
    ...failureEvidence,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(`${JSON.stringify(runStage8WindowsTaskControlApproval(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeStage8WindowsTaskControlApprovalFailure(error), null, 2)}\n`);
    process.exitCode = 1;
  }
}
