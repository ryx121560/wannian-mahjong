import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {
  createStage8WindowsTaskMaterialsEmitAuthorizationCandidate,
  runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator,
  serializeStage8WindowsTaskMaterialsEmitAuthorizationFailure,
} from './stage8-windows-task-materials-emit-authorization-orchestrator.mjs';

const require = createRequire(import.meta.url);

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

const approvalTools = loadTs('../src/game/stage8/offline-windows-task-materials-emit-approval.ts');
const hostTools = loadTs('../src/game/stage8/offline-windows-task-host-control.ts');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-materials-emit-authorization-'));
const authorizationDirectory = path.win32.join(fixtureRoot, 'authorizations');
const authorizationPath = path.win32.join(authorizationDirectory, 'materials-emit.json');
const stagingPath = `${authorizationPath}.partial`;
const signerRoot = 'C:\\published-stage8-materials-signer';
const formalRoot = approvalTools.deriveStage8WindowsTaskMaterialsEmitFormalRoot(os.tmpdir());
const formalControlBytes = fs.readFileSync(path.win32.join(formalRoot, 'host-control.json'));
const formalEvidenceBytes = fs.readFileSync(path.win32.join(formalRoot, 'control-approval-evidence.json'));
const formalControl = JSON.parse(formalControlBytes.toString('utf8'));
const checkArgv = ['--check', '--signer-root', signerRoot, '--product-approved-materials-emit-only'];
const emitArgv = ['--emit-and-verify', '--signer-root', signerRoot, '--product-approved-materials-emit-only'];

function clone(value) { return structuredClone(value); }
function fixtureTargets() {
  const materialsOutputDirectory = path.win32.join(fixtureRoot, 'materials');
  return {
    authorizationPath,
    materialsOutputDirectory,
    taskDefinitionPath: path.win32.join(materialsOutputDirectory, 'task-definition.xml'),
    taskMaterialsPath: path.win32.join(materialsOutputDirectory, 'task-materials.json'),
  };
}

function recreateInput(built) {
  built.decision = approvalTools.createStage8WindowsTaskMaterialsEmitProductDecision({ signer: built.signer, targets: built.formal.targets });
  const authorization = approvalTools.createStage8WindowsTaskMaterialsEmitApprovalInput({
    decision: built.decision,
    signer: built.signer,
    targets: built.formal.targets,
  });
  assert.equal(authorization.ok, true);
  built.authorization = authorization.value;
  return built;
}

function makeBuilt(mutator) {
  const built = {
    formal: { control: clone(formalControl), targets: fixtureTargets() },
    signer: {
      projectRoot: signerRoot,
      releaseCommit: 'c3fff6f44a2fd83755c177dccc0b76e5b6c0cac3',
      files: [
        { path: 'scripts/stage8-windows-task-materials-emit-approval.mjs', sha256: '1'.repeat(64) },
        { path: 'src/game/stage8/offline-windows-task-materials-emit-approval.ts', sha256: '2'.repeat(64) },
      ],
      sourceBundleSha256: '3'.repeat(64),
    },
    decision: null,
    authorization: null,
    formalControlFilesRead: 2,
  };
  recreateInput(built);
  mutator?.(built);
  return built;
}

const baseline = makeBuilt();
const baselineCandidate = createStage8WindowsTaskMaterialsEmitAuthorizationCandidate(baseline);
const expectedBindings = {
  signerReleaseCommit: baseline.signer.releaseCommit,
  signerSourceBundleSha256: baseline.signer.sourceBundleSha256,
  productDecisionSha256: baseline.decision.decisionSha256,
  approvalId: baselineCandidate.authorization.approvalId,
  authorizationInputSha256: baselineCandidate.checked.authorizationInputSha256,
  candidateAuthorizationSha256: baselineCandidate.authorization.authorizationSha256,
  checkIdentitySha256: baselineCandidate.checked.checkIdentitySha256,
  targetIdentitySha256: approvalTools.hashStage8WindowsTaskMaterialsEmitTargets(baseline.authorization.targets),
};
const environment = {
  STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_CHECK: '1',
  STAGE8_WINDOWS_TASK_MATERIALS_EMIT_AUTHORIZATION_EMIT: '1',
};
const baseDependencies = {
  environment,
  osTempRoot: fixtureRoot,
  expectedBindings,
  buildMaterials: () => makeBuilt(),
};

function resetOutput() {
  fs.rmSync(authorizationDirectory, { recursive: true, force: true });
  assert.equal(fs.existsSync(authorizationPath), false);
  assert.equal(fs.existsSync(stagingPath), false);
}

function expectFailure(run, pattern, assertion) {
  let caught;
  try { run(); } catch (error) { caught = error; }
  assert.ok(caught, `expected failure ${pattern}`);
  assert.match(caught.message, pattern);
  assertion?.(serializeStage8WindowsTaskMaterialsEmitAuthorizationFailure(caught), caught);
  return caught;
}

function runEmit(overrides = {}) {
  return runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(emitArgv, { ...baseDependencies, ...overrides });
}

try {
  const checked = runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(checkArgv, baseDependencies);
  assert.equal(checked.ok, true);
  assert.equal(checked.repeatedCheckByteIdentical, true);
  assert.deepEqual(checked.phaseApprovals, { 'materials-emit': null, register: null, run: null, verify: null, delete: null });
  assert.equal(checked.filesWritten, 0);
  assert.equal(checked.phaseAuthorizationsIssued, 0);
  assert.equal(checked.materialsGenerated, 0);
  assert.equal(fs.existsSync(authorizationPath), false);

  assert.throws(() => runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(checkArgv, { ...baseDependencies, environment: {} }), /check-gate-required/);
  assert.throws(() => runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(emitArgv, { ...baseDependencies, environment: {} }), /emit-gate-required/);
  assert.throws(() => runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(['--emit', ...emitArgv.slice(1)], baseDependencies), /usage/);

  const changedControlBytes = Buffer.from(formalControlBytes);
  changedControlBytes[changedControlBytes.length - 2] ^= 1;
  assert.match(approvalTools.validateStage8WindowsTaskMaterialsEmitFormalPair({
    controlBytes: changedControlBytes,
    evidenceBytes: formalEvidenceBytes,
    osTempRoot: os.tmpdir(),
  }).reason, /formal-file-hash-drift/);
  const changedEvidenceBytes = Buffer.from(formalEvidenceBytes);
  changedEvidenceBytes[changedEvidenceBytes.length - 2] ^= 1;
  assert.match(approvalTools.validateStage8WindowsTaskMaterialsEmitFormalPair({
    controlBytes: formalControlBytes,
    evidenceBytes: changedEvidenceBytes,
    osTempRoot: os.tmpdir(),
  }).reason, /formal-file-hash-drift/);

  const driftCases = [
    [(built) => { built.authorization.controlEvidenceSha256 = '0'.repeat(64); }, /input-drift/],
    [(built) => { built.authorization.authorizationInputSha256 = '0'.repeat(64); }, /input-drift/],
    [(built) => { built.authorization.scope = 'stage8-windows-task-host:register'; }, /input-drift/],
    [(built) => { built.authorization.action = 'register'; }, /input-drift/],
    [(built) => { built.decision.phaseApprovals.register = { granted: true }; }, /phase-inheritance-forbidden/],
    [(built) => { built.formal.control.manifestSha256 = '0'.repeat(64); }, /control-hash-drift|authorization-identity/],
  ];
  for (const [mutator, pattern] of driftCases) {
    expectFailure(() => runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(checkArgv, {
      ...baseDependencies,
      buildMaterials: () => makeBuilt(mutator),
    }), pattern);
  }

  expectFailure(() => runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(checkArgv, {
    ...baseDependencies,
    buildMaterials: () => makeBuilt((built) => {
      built.signer.sourceBundleSha256 = '4'.repeat(64);
      recreateInput(built);
    }),
  }), /published-binding-drift:signerSourceBundleSha256/);
  expectFailure(() => runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(checkArgv, {
    ...baseDependencies,
    buildMaterials: () => makeBuilt((built) => {
      built.signer.releaseCommit = '0'.repeat(40);
      recreateInput(built);
    }),
  }), /published-binding-drift:signerReleaseCommit/);

  for (const escapedPath of [
    'E:\\forbidden\\materials-emit.json',
    path.win32.join(signerRoot, 'materials-emit.json'),
    path.win32.join(fixtureRoot, 'authorizations', 'register.json'),
  ]) {
    expectFailure(() => runStage8WindowsTaskMaterialsEmitAuthorizationOrchestrator(checkArgv, {
      ...baseDependencies,
      buildMaterials: () => makeBuilt((built) => {
        built.formal.targets.authorizationPath = escapedPath;
        recreateInput(built);
      }),
    }), /target-path-drift/);
  }

  resetOutput();
  const emitted = runEmit();
  assert.equal(emitted.status, 'emitted-and-verified');
  assert.equal(emitted.filesWritten, 1);
  assert.equal(emitted.filesVerified, 1);
  assert.equal(emitted.phaseAuthorizationsIssued, 1);
  assert.equal(emitted.materialsGenerated, 0);
  assert.equal(emitted.phaseApprovals.register, null);
  assert.equal(emitted.phaseApprovals.run, null);
  assert.equal(emitted.phaseApprovals.verify, null);
  assert.equal(emitted.phaseApprovals.delete, null);
  assert.equal(fs.existsSync(authorizationPath), true);
  assert.equal(fs.existsSync(stagingPath), false);
  const emittedAuthorization = JSON.parse(fs.readFileSync(authorizationPath, 'utf8'));
  hostTools.validateStage8WindowsTaskHostPhaseAuthorization(emittedAuthorization, formalControl, 'materials-emit');

  expectFailure(() => runEmit(), /target-exists/, (failure) => {
    assert.equal(failure.filesWritten, 0);
    assert.equal(failure.preexistingTarget, true);
    assert.equal(failure.cleanupAttempted, false);
  });
  fs.unlinkSync(authorizationPath);
  fs.writeFileSync(stagingPath, 'preexisting');
  expectFailure(() => runEmit(), /staging-exists/, (failure) => {
    assert.equal(failure.preexistingStaging, true);
    assert.equal(fs.readFileSync(stagingPath, 'utf8'), 'preexisting');
  });
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
    fs.mkdirSync(authorizationDirectory, { recursive: false });
    expectFailure(() => runEmit({ fileSystem }), new RegExp(`injected-${label}`), (failure) => {
      assert.equal(failure.targetExists, false);
      assert.equal(failure.stagingExists, false);
      assert.equal(failure.cleanupSucceeded, true);
      assert.equal(failure.phaseAuthorizationsIssued, 0);
    });
  }

  resetOutput();
  fs.mkdirSync(authorizationDirectory, { recursive: false });
  expectFailure(() => runEmit({ fileSystem: { readFileSync: () => { throw new Error('injected-staging-read'); } } }), /injected-staging-read/, (failure) => {
    assert.equal(failure.cleanupSucceeded, true);
  });

  resetOutput();
  fs.mkdirSync(authorizationDirectory, { recursive: false });
  let readCalls = 0;
  expectFailure(() => runEmit({ fileSystem: { readFileSync: (target) => {
    readCalls += 1;
    if (readCalls === 2) throw new Error('injected-final-read');
    return fs.readFileSync(target);
  } } }), /injected-final-read/, (failure) => {
    assert.equal(failure.cleanupSucceeded, true);
    assert.equal(failure.targetExists, false);
    assert.equal(failure.stagingExists, false);
    assert.equal(failure.renameCompleted, true);
    assert.equal(failure.rollbackCompleted, true);
  });

  resetOutput();
  fs.mkdirSync(authorizationDirectory, { recursive: false });
  expectFailure(() => runEmit({ validateAuthorization: ({ stage }) => {
    if (stage === 'final') throw new Error('injected-final-verify');
  } }), /injected-final-verify/, (failure) => {
    assert.equal(failure.cleanupSucceeded, true);
    assert.equal(failure.targetExists, false);
  });

  resetOutput();
  fs.mkdirSync(authorizationDirectory, { recursive: false });
  expectFailure(() => runEmit({ fileSystem: {
    writeSync: () => { throw new Error('injected-write-before-cleanup-failure'); },
    unlinkSync: () => { throw new Error('injected-cleanup'); },
  } }), /cleanup-failed-residual/, (failure) => {
    assert.equal(failure.cleanupSucceeded, false);
    assert.equal(failure.stagingExists, true);
    assert.equal(failure.phaseAuthorizationsIssued, 0);
  });
  fs.unlinkSync(stagingPath);

  resetOutput();
  expectFailure(() => runEmit({ fileSystem: { mkdirSync: () => { throw new Error('injected-create'); } } }), /injected-create/, (failure) => {
    assert.equal(failure.targetExists, false);
    assert.equal(failure.stagingExists, false);
  });

  resetOutput();
  expectFailure(() => runEmit({ fileSystem: { writeSync: () => { throw new Error('injected-write-created-parent'); } } }), /injected-write-created-parent/, (failure) => {
    assert.equal(failure.parentDirectoryCreated, true);
    assert.equal(failure.parentDirectoryExists, false);
    assert.equal(failure.directoriesRemaining, 0);
    assert.equal(failure.cleanupSucceeded, true);
    assert.equal(fs.existsSync(authorizationDirectory), false);
  });

  resetOutput();
  expectFailure(() => runEmit({ fileSystem: {
    writeSync: () => { throw new Error('injected-write-before-rmdir-failure'); },
    rmdirSync: () => { throw new Error('injected-rmdir-cleanup'); },
  } }), /cleanup-failed-residual/, (failure) => {
    assert.equal(failure.parentDirectoryCreated, true);
    assert.equal(failure.parentDirectoryExists, true);
    assert.equal(failure.directoriesRemaining, 1);
    assert.equal(failure.cleanupSucceeded, false);
    assert.match(failure.cleanupErrors.join(','), /injected-rmdir-cleanup/);
  });
  fs.rmdirSync(authorizationDirectory);

  resetOutput();
  fs.mkdirSync(authorizationDirectory, { recursive: false });
  let renameCalls = 0;
  expectFailure(() => runEmit({
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
    assert.match(failure.cleanupErrors.join(','), /injected-rollback-cleanup/);
  });
  fs.unlinkSync(authorizationPath);

  console.log(JSON.stringify({
    ok: true,
    checks: 31,
    checkRepeatedByteIdentical: true,
    successfulFilesWritten: 1,
    successfulPhaseAuthorizationsIssued: 1,
    injectedFailures: 12,
    materialsGenerated: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    diagnosticsRun: 0,
    formalPilotGamesCredited: 0,
  }, null, 2));
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
