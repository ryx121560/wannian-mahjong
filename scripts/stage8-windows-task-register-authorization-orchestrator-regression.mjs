import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { buildStage8WindowsTaskRegisterApprovalCheck } from './stage8-windows-task-register-approval.mjs';
import {
  createStage8WindowsTaskRegisterAuthorizationCandidate,
  runStage8WindowsTaskRegisterAuthorizationOrchestrator,
  serializeStage8WindowsTaskRegisterAuthorizationFailure,
} from './stage8-windows-task-register-authorization-orchestrator.mjs';

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

const approvalTools = loadTs('../src/game/stage8/offline-windows-task-register-approval.ts');
const hostTools = loadTs('../src/game/stage8/offline-windows-task-host-control.ts');
const projectRoot = path.win32.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-register-authorization-'));
const authorizationDirectory = path.win32.join(fixtureRoot, 'authorizations');
const materialsAuthorizationPath = path.win32.join(authorizationDirectory, 'materials-emit.json');
const registerAuthorizationPath = path.win32.join(authorizationDirectory, 'register.json');
const stagingPath = `${registerAuthorizationPath}.partial`;
const formalPaths = approvalTools.deriveStage8WindowsTaskRegisterFormalPaths(os.tmpdir());
const formalMaterialsAuthorizationBytes = fs.readFileSync(formalPaths.materialsAuthorizationPath);
const formalMaterialsAuthorizationFileSha256 = crypto.createHash('sha256').update(formalMaterialsAuthorizationBytes).digest('hex');
const signerReleaseCommit = 'b42f95346652e3027ba3a17e1ce7c576308760b3';
const checkArgv = ['--check', '--signer-root', projectRoot, '--product-approved-register-only'];
const emitArgv = ['--emit-and-verify', '--signer-root', projectRoot, '--product-approved-register-only'];

function clone(value) { return structuredClone(value); }
function sha256(absolutePath) { return crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'); }
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

const publishedBuilt = buildStage8WindowsTaskRegisterApprovalCheck(checkArgv, {
  environment: { STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_CHECK: '1' },
  osTempRoot: os.tmpdir(),
  inspectCheckout: () => ({ headCommit: signerReleaseCommit, sourceReleaseCommit: signerReleaseCommit, clean: true }),
  schedulerInspector: absentInspection,
});

function fixtureTargets() {
  const materialsDirectory = path.win32.join(fixtureRoot, 'materials');
  return {
    registerAuthorizationPath,
    materialsAuthorizationPath,
    materialsDirectory,
    taskDefinitionPath: path.win32.join(materialsDirectory, 'task-definition.xml'),
    taskMaterialsPath: path.win32.join(materialsDirectory, 'task-materials.json'),
    taskPath: publishedBuilt.formal.targets.taskPath,
    taskName: publishedBuilt.formal.targets.taskName,
  };
}

function recreateInput(built) {
  built.decision = approvalTools.createStage8WindowsTaskRegisterProductDecision({
    signer: built.signer,
    formal: built.formal,
    schedulerInspection: built.schedulerInspection,
  });
  const authorization = approvalTools.createStage8WindowsTaskRegisterApprovalInput({
    decision: built.decision,
    signer: built.signer,
    formal: built.formal,
    schedulerInspection: built.schedulerInspection,
  });
  assert.equal(authorization.ok, true);
  built.decision = clone(built.decision);
  built.authorization = clone(authorization.value);
  return built;
}

function makeBuilt(mutator) {
  const built = clone(publishedBuilt);
  built.formal.targets = fixtureTargets();
  built.schedulerInspection = absentInspection(built.formal.targets.taskPath, built.formal.targets.taskName);
  built.scheduledTasksRead = 1;
  recreateInput(built);
  mutator?.(built);
  return built;
}

const baseline = makeBuilt();
const baselineCandidate = createStage8WindowsTaskRegisterAuthorizationCandidate(baseline);
const expectedBindings = {
  signerReleaseCommit: baseline.signer.releaseCommit,
  signerSourceBundleSha256: baseline.signer.sourceBundleSha256,
  productDecisionSha256: baseline.decision.decisionSha256,
  approvalId: baselineCandidate.authorization.approvalId,
  authorizationInputSha256: baselineCandidate.checked.authorizationInputSha256,
  candidateAuthorizationSha256: baselineCandidate.authorization.authorizationSha256,
  checkIdentitySha256: baselineCandidate.checked.checkIdentitySha256,
  targetIdentitySha256: approvalTools.hashStage8WindowsTaskRegisterTargets(baseline.authorization.targets),
};
const environment = {
  STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_CHECK: '1',
  STAGE8_WINDOWS_TASK_REGISTER_AUTHORIZATION_EMIT: '1',
};
const baseDependencies = {
  environment,
  osTempRoot: fixtureRoot,
  expectedBindings,
  buildRegister: () => makeBuilt(),
};

function resetOutput({ createParent = true } = {}) {
  fs.rmSync(authorizationDirectory, { recursive: true, force: true });
  if (createParent) {
    fs.mkdirSync(authorizationDirectory, { recursive: false });
    fs.writeFileSync(materialsAuthorizationPath, formalMaterialsAuthorizationBytes, { flag: 'wx' });
  }
  assert.equal(fs.existsSync(registerAuthorizationPath), false);
  assert.equal(fs.existsSync(stagingPath), false);
}

function assertMaterialsAuthorizationUnchanged() {
  assert.equal(fs.existsSync(materialsAuthorizationPath), true);
  assert.equal(sha256(materialsAuthorizationPath), formalMaterialsAuthorizationFileSha256);
}

function expectFailure(run, pattern, assertion) {
  let caught;
  try { run(); } catch (error) { caught = error; }
  assert.ok(caught, `expected failure ${pattern}`);
  assert.match(caught.message, pattern);
  assertion?.(serializeStage8WindowsTaskRegisterAuthorizationFailure(caught), caught);
  return caught;
}

function runEmit(overrides = {}) {
  return runStage8WindowsTaskRegisterAuthorizationOrchestrator(emitArgv, { ...baseDependencies, ...overrides });
}

let checks = 0;
function test(callback) { callback(); checks += 1; }

try {
  resetOutput();
  test(() => {
    const checked = runStage8WindowsTaskRegisterAuthorizationOrchestrator(checkArgv, baseDependencies);
    assert.equal(checked.ok, true);
    assert.equal(checked.repeatedCheckByteIdentical, true);
    assert.deepEqual(checked.phaseApprovals, { 'materials-emit': null, register: null, run: null, verify: null, delete: null });
    assert.equal(checked.filesWritten, 0);
    assert.equal(checked.phaseAuthorizationsIssued, 0);
    assert.equal(checked.materialsGenerated, 0);
    assert.equal(checked.scheduledTasksRead, 2);
    assert.equal(checked.scheduledTasksMutated, 0);
    assert.equal(fs.existsSync(registerAuthorizationPath), false);
    assertMaterialsAuthorizationUnchanged();
  });

  test(() => assert.throws(() => runStage8WindowsTaskRegisterAuthorizationOrchestrator(checkArgv, { ...baseDependencies, environment: {} }), /check-gate-required/));
  test(() => assert.throws(() => runStage8WindowsTaskRegisterAuthorizationOrchestrator(emitArgv, { ...baseDependencies, environment: {} }), /emit-gate-required/));
  test(() => assert.throws(() => runStage8WindowsTaskRegisterAuthorizationOrchestrator(['--emit', ...emitArgv.slice(1)], baseDependencies), /usage/));

  const driftCases = [
    [(built) => { built.authorization.bindings.controlEvidenceSha256 = '0'.repeat(64); }, /input-drift/],
    [(built) => { built.authorization.authorizationInputSha256 = '0'.repeat(64); }, /input-drift/],
    [(built) => { built.authorization.scope = 'stage8-windows-task-host:run'; }, /input-drift/],
    [(built) => { built.authorization.action = 'run'; }, /input-drift/],
    [(built) => { built.decision.phaseApprovals.run = { granted: true }; }, /phase-inheritance-forbidden/],
    [(built) => { built.formal.control.manifestSha256 = '0'.repeat(64); }, /formal-binding-drift|authorization-identity/],
    [(built) => { built.schedulerInspection.exists = true; }, /phase-inheritance-forbidden/],
  ];
  for (const [mutator, pattern] of driftCases) {
    test(() => expectFailure(() => runStage8WindowsTaskRegisterAuthorizationOrchestrator(checkArgv, {
      ...baseDependencies,
      buildRegister: () => makeBuilt(mutator),
    }), pattern));
  }

  test(() => expectFailure(() => runStage8WindowsTaskRegisterAuthorizationOrchestrator(checkArgv, {
    ...baseDependencies,
    buildRegister: () => makeBuilt((built) => {
      built.signer.sourceBundleSha256 = '4'.repeat(64);
      recreateInput(built);
    }),
  }), /published-binding-drift:signerSourceBundleSha256/));
  test(() => expectFailure(() => runStage8WindowsTaskRegisterAuthorizationOrchestrator(checkArgv, {
    ...baseDependencies,
    buildRegister: () => makeBuilt((built) => {
      built.signer.releaseCommit = '0'.repeat(40);
      recreateInput(built);
    }),
  }), /published-binding-drift:signerReleaseCommit/));

  for (const escapedPath of [
    'E:\\forbidden\\register.json',
    path.win32.join(projectRoot, 'register.json'),
    path.win32.join(fixtureRoot, 'authorizations', 'run.json'),
  ]) {
    test(() => expectFailure(() => runStage8WindowsTaskRegisterAuthorizationOrchestrator(checkArgv, {
      ...baseDependencies,
      buildRegister: () => makeBuilt((built) => {
        built.formal.targets.registerAuthorizationPath = escapedPath;
        recreateInput(built);
      }),
    }), /target-path-drift/));
  }

  test(() => {
    let builds = 0;
    expectFailure(() => runStage8WindowsTaskRegisterAuthorizationOrchestrator(checkArgv, {
      ...baseDependencies,
      buildRegister: () => {
        builds += 1;
        const built = makeBuilt();
        if (builds === 2) built.formalFilesRead += 1;
        return built;
      },
    }), /repeated-check-drift/);
  });

  resetOutput();
  test(() => {
    const emitted = runEmit();
    assert.equal(emitted.status, 'emitted-and-verified');
    assert.equal(emitted.filesWritten, 1);
    assert.equal(emitted.filesVerified, 1);
    assert.equal(emitted.phaseAuthorizationsIssued, 1);
    assert.equal(emitted.materialsGenerated, 0);
    assert.equal(emitted.scheduledTasksRead, 2);
    assert.equal(emitted.scheduledTasksMutated, 0);
    assert.equal(emitted.phaseApprovals['materials-emit'], null);
    assert.equal(emitted.phaseApprovals.register, baselineCandidate.authorization.authorizationSha256);
    assert.equal(emitted.phaseApprovals.run, null);
    assert.equal(emitted.phaseApprovals.verify, null);
    assert.equal(emitted.phaseApprovals.delete, null);
    assert.equal(emitted.materialsAuthorizationUnchanged, true);
    assert.equal(emitted.authorizationDirectoryFiles, 2);
    assert.equal(fs.existsSync(registerAuthorizationPath), true);
    assert.equal(fs.existsSync(stagingPath), false);
    assertMaterialsAuthorizationUnchanged();
    const emittedAuthorization = JSON.parse(fs.readFileSync(registerAuthorizationPath, 'utf8'));
    hostTools.validateStage8WindowsTaskHostPhaseAuthorization(emittedAuthorization, publishedBuilt.formal.control, 'register');
    assert.deepEqual(fs.readdirSync(authorizationDirectory).sort(), ['materials-emit.json', 'register.json']);
  });

  test(() => expectFailure(() => runEmit(), /target-exists/, (failure) => {
    assert.equal(failure.filesWritten, 0);
    assert.equal(failure.preexistingTarget, true);
    assert.equal(failure.cleanupAttempted, false);
    assert.equal(failure.materialsAuthorizationUnchanged, true);
  }));
  fs.unlinkSync(registerAuthorizationPath);
  fs.writeFileSync(stagingPath, 'preexisting');
  test(() => expectFailure(() => runEmit(), /staging-exists/, (failure) => {
    assert.equal(failure.preexistingStaging, true);
    assert.equal(fs.readFileSync(stagingPath, 'utf8'), 'preexisting');
    assert.equal(failure.materialsAuthorizationUnchanged, true);
  }));
  fs.unlinkSync(stagingPath);

  const cleanableFailures = [
    ['open', { openSync: () => { throw new Error('injected-open'); } }],
    ['write', { writeSync: () => { throw new Error('injected-write'); } }],
    ['fsync', { fsyncSync: () => { throw new Error('injected-fsync'); } }],
    ['close', (() => {
      let calls = 0;
      return { closeSync: (handle) => {
        calls += 1;
        if (calls === 1) { fs.closeSync(handle); throw new Error('injected-close'); }
        throw new Error('injected-close-cleanup');
      } };
    })()],
    ['rename', { renameSync: () => { throw new Error('injected-rename'); } }],
  ];
  for (const [label, fileSystem] of cleanableFailures) {
    resetOutput();
    test(() => expectFailure(() => runEmit({ fileSystem }), new RegExp(`injected-${label}`), (failure) => {
      assert.equal(failure.targetExists, false);
      assert.equal(failure.stagingExists, false);
      assert.equal(failure.cleanupSucceeded, true);
      assert.equal(failure.phaseAuthorizationsIssued, 0);
      assert.equal(failure.materialsAuthorizationUnchanged, true);
      assertMaterialsAuthorizationUnchanged();
    }));
  }

  resetOutput();
  test(() => expectFailure(() => runEmit({ fileSystem: {
    readFileSync: (target) => samePath(target, stagingPath) ? (() => { throw new Error('injected-staging-read'); })() : fs.readFileSync(target),
  } }), /injected-staging-read/, (failure) => {
    assert.equal(failure.cleanupSucceeded, true);
    assertMaterialsAuthorizationUnchanged();
  }));

  resetOutput();
  let readCalls = 0;
  test(() => expectFailure(() => runEmit({ fileSystem: { readFileSync: (target) => {
    if (samePath(target, stagingPath) || samePath(target, registerAuthorizationPath)) readCalls += 1;
    if (readCalls === 2) throw new Error('injected-final-read');
    return fs.readFileSync(target);
  } } }), /injected-final-read/, (failure) => {
    assert.equal(failure.cleanupSucceeded, true);
    assert.equal(failure.targetExists, false);
    assert.equal(failure.renameCompleted, true);
    assert.equal(failure.rollbackCompleted, true);
    assertMaterialsAuthorizationUnchanged();
  }));

  resetOutput();
  test(() => expectFailure(() => runEmit({ validateAuthorization: ({ stage }) => {
    if (stage === 'final') throw new Error('injected-final-verify');
  } }), /injected-final-verify/, (failure) => {
    assert.equal(failure.cleanupSucceeded, true);
    assert.equal(failure.targetExists, false);
    assertMaterialsAuthorizationUnchanged();
  }));

  resetOutput();
  test(() => expectFailure(() => runEmit({ fileSystem: {
    readFileSync: (target) => {
      if (samePath(target, materialsAuthorizationPath)) throw new Error('injected-material-read');
      return fs.readFileSync(target);
    },
  } }), /injected-material-read/, (failure) => {
    assert.equal(failure.cleanupSucceeded, true);
    assert.equal(failure.targetExists, false);
    assertMaterialsAuthorizationUnchanged();
  }));

  resetOutput();
  test(() => expectFailure(() => runEmit({ fileSystem: {
    readdirSync: () => [
      { name: 'materials-emit.json', isFile: () => true },
      { name: 'register.json', isFile: () => true },
      { name: 'run.json', isFile: () => true },
    ],
  } }), /authorization-directory-drift/, (failure) => {
    assert.equal(failure.cleanupSucceeded, true);
    assert.equal(failure.targetExists, false);
    assertMaterialsAuthorizationUnchanged();
  }));

  resetOutput();
  test(() => expectFailure(() => runEmit({ fileSystem: {
    writeSync: () => { throw new Error('injected-write-before-cleanup-failure'); },
    unlinkSync: () => { throw new Error('injected-cleanup'); },
  } }), /cleanup-failed-residual/, (failure) => {
    assert.equal(failure.cleanupSucceeded, false);
    assert.equal(failure.stagingExists, true);
    assert.equal(failure.phaseAuthorizationsIssued, 0);
    assert.equal(failure.materialsAuthorizationUnchanged, true);
  }));
  fs.unlinkSync(stagingPath);

  resetOutput({ createParent: false });
  test(() => expectFailure(() => runEmit({ fileSystem: { mkdirSync: () => { throw new Error('injected-create'); } } }), /injected-create/, (failure) => {
    assert.equal(failure.targetExists, false);
    assert.equal(failure.stagingExists, false);
  }));

  resetOutput({ createParent: false });
  test(() => expectFailure(() => runEmit({ fileSystem: { writeSync: () => { throw new Error('injected-write-created-parent'); } } }), /injected-write-created-parent/, (failure) => {
    assert.equal(failure.parentDirectoryCreated, true);
    assert.equal(failure.parentDirectoryExists, false);
    assert.equal(failure.directoriesRemaining, 0);
    assert.equal(failure.cleanupSucceeded, true);
    assert.equal(fs.existsSync(authorizationDirectory), false);
  }));

  resetOutput({ createParent: false });
  test(() => expectFailure(() => runEmit({ fileSystem: {
    writeSync: () => { throw new Error('injected-write-before-rmdir-failure'); },
    rmdirSync: () => { throw new Error('injected-rmdir-cleanup'); },
  } }), /cleanup-failed-residual/, (failure) => {
    assert.equal(failure.parentDirectoryCreated, true);
    assert.equal(failure.parentDirectoryExists, true);
    assert.equal(failure.directoriesRemaining, 1);
    assert.equal(failure.cleanupSucceeded, false);
    assert.match(failure.cleanupErrors.join(','), /injected-rmdir-cleanup/);
  }));
  fs.rmdirSync(authorizationDirectory);

  resetOutput();
  let renameCalls = 0;
  test(() => expectFailure(() => runEmit({
    validateAuthorization: ({ stage }) => { if (stage === 'final') throw new Error('injected-verify-before-rollback-failure'); },
    fileSystem: { renameSync: (source, target) => {
      renameCalls += 1;
      if (renameCalls === 2) throw new Error('injected-rollback-cleanup');
      return fs.renameSync(source, target);
    } },
  }), /cleanup-failed-residual/, (failure) => {
    assert.equal(failure.cleanupSucceeded, false);
    assert.equal(failure.targetExists, true);
    assert.equal(failure.stagingExists, false);
    assert.equal(failure.materialsAuthorizationUnchanged, true);
    assert.match(failure.cleanupErrors.join(','), /injected-rollback-cleanup/);
  }));
  fs.unlinkSync(registerAuthorizationPath);
  assertMaterialsAuthorizationUnchanged();

  console.log(JSON.stringify({
    ok: true,
    checks,
    checkRepeatedByteIdentical: true,
    successfulFilesWritten: 1,
    successfulPhaseAuthorizationsIssued: 1,
    injectedFailures: 15,
    materialsAuthorizationUnchanged: true,
    materialsGenerated: 0,
    scheduledTasksReadOnSuccess: 2,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
    trainingRuns: 0,
    deployments: 0,
    port18768Operations: 0,
  }, null, 2));
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

function samePath(left, right) {
  return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase();
}
