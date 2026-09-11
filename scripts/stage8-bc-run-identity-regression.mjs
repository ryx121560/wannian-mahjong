import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { runStage8BcRunIdentityCli } from './stage8-bc-run-identity.mjs';

const root = process.cwd();
const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename);

try {
  const identity = require('../src/game/stage8/offline-bc-run-identity.ts');
  const bcTools = require('../src/game/stage8/offline-bc-control.ts');
  const artifactTools = require('../src/game/stage8/offline-bc-artifact-control.ts');
  const corpusTools = require('../src/game/stage8/offline-bc-corpus-control.ts');
  const sourceCommit = 'cb2b794e48fad81d3621690af4018eb73598153b';
  const approvalPayload = {
    protocolVersion: identity.STAGE8_BC_RUN_AUTHORIZATION_VERSION,
    runId: identity.STAGE8_BC_FORMAL_RUN_ID,
    sourceCommit,
    approvals: {
      bc: { approvalId: 'product-bc-control-20260910', granted: true, scope: 'bc-teacher-protocol-preflight' },
      artifact: { approvalId: 'product-bc-artifact-20260910', granted: true, scope: 'bc-sample-artifact-write' },
      corpus: { approvalId: 'product-bc-corpus-20260910', granted: true, scope: 'bc-formal-corpus-pilot' },
      emit: { approvalId: 'product-bc-material-emit-20260910', granted: true, scope: identity.STAGE8_BC_RUN_IDENTITY_EMIT_SCOPE },
    },
  };
  const authorization = {
    ...approvalPayload,
    authorizationSha256: identity.hashStage8BcRunAuthorizationInput(approvalPayload),
  };
  const sourceBytes = new Map(identity.STAGE8_BC_RUN_SOURCE_FILES.map((relativePath) => [
    relativePath,
    fs.readFileSync(path.join(root, ...relativePath.split('/'))),
  ]));
  const readerA = (relativePath) => Buffer.from(sourceBytes.get(relativePath));
  const readerB = (relativePath) => Buffer.from(sourceBytes.get(relativePath));
  const first = identity.createStage8BcRunIdentityMaterials({ authorization, readFile: readerA });
  const second = identity.createStage8BcRunIdentityMaterials({
    authorization: {
      approvals: {
        emit: authorization.approvals.emit,
        corpus: authorization.approvals.corpus,
        artifact: authorization.approvals.artifact,
        bc: authorization.approvals.bc,
      },
      authorizationSha256: authorization.authorizationSha256,
      sourceCommit: authorization.sourceCommit,
      runId: authorization.runId,
      protocolVersion: authorization.protocolVersion,
    },
    readFile: readerB,
  });
  assert.equal(first.ok, true, first.reason);
  assert.equal(second.ok, true, second.reason);
  assert.equal(JSON.stringify(first.value), JSON.stringify(second.value), 'absolute worktree path and JSON key order must not affect output');
  assert.equal(first.value.source.files.length, identity.STAGE8_BC_RUN_SOURCE_FILES.length);
  assert.equal(new Set(first.value.source.files.map((entry) => entry.path)).size, first.value.source.files.length);
  assert.equal(identity.validateStage8BcRunIdentityMaterials({
    sourceCommit, readFile: readerA, artifactControl: first.value.artifactControl, corpusControl: first.value.corpusControl,
  }).ok, true);

  const deniedPayload = structuredClone(approvalPayload);
  deniedPayload.approvals.emit.granted = false;
  const denied = { ...deniedPayload, authorizationSha256: identity.hashStage8BcRunAuthorizationInput(deniedPayload) };
  assert.equal(identity.createStage8BcRunIdentityMaterials({ authorization: denied, readFile: readerA }).reason,
    'bc-run-emit-authorization-required');
  const wrongScopePayload = structuredClone(approvalPayload);
  wrongScopePayload.approvals.corpus.scope = 'wrong-scope';
  const wrongScope = { ...wrongScopePayload, authorizationSha256: identity.hashStage8BcRunAuthorizationInput(wrongScopePayload) };
  assert.equal(identity.createStage8BcRunIdentityMaterials({ authorization: wrongScope, readFile: readerA }).reason,
    'bc-run-corpus-authorization-required');
  const wrongRunPayload = { ...approvalPayload, runId: 'formal-bc-corpus-pilot-other' };
  const wrongRun = { ...wrongRunPayload, authorizationSha256: identity.hashStage8BcRunAuthorizationInput(wrongRunPayload) };
  assert.equal(identity.createStage8BcRunIdentityMaterials({ authorization: wrongRun, readFile: readerA }).reason,
    'bc-run-authorization-identity-invalid');
  assert.equal(identity.createStage8BcRunIdentityMaterials({
    authorization: { ...authorization, authorizationSha256: '0'.repeat(64) }, readFile: readerA,
  }).reason, 'bc-run-authorization-hash-mismatch');

  for (const tamperedPath of identity.STAGE8_BC_RUN_SOURCE_FILES) {
    const tamperedReader = (relativePath) => relativePath === tamperedPath
      ? Buffer.concat([Buffer.from(sourceBytes.get(relativePath)), Buffer.from('\nTAMPERED')])
      : readerA(relativePath);
    assert.equal(identity.validateStage8BcRunIdentityMaterials({
      sourceCommit, readFile: tamperedReader, artifactControl: first.value.artifactControl, corpusControl: first.value.corpusControl,
    }).reason, 'bc-run-source-or-control-identity-mismatch', `source byte drift must fail: ${tamperedPath}`);
  }

  const foreignBcPayload = structuredClone(first.value.bcControl);
  delete foreignBcPayload.manifestSha256;
  foreignBcPayload.identity.sourceBundleSha256 = '1'.repeat(64);
  const foreignBc = { ...foreignBcPayload, manifestSha256: bcTools.hashStage8BcControlManifestPayload(foreignBcPayload) };
  const foreignArtifactPayload = structuredClone(first.value.artifactControl);
  delete foreignArtifactPayload.manifestSha256;
  foreignArtifactPayload.bcControl = foreignBc;
  foreignArtifactPayload.identity.sourceBundleSha256 = '1'.repeat(64);
  foreignArtifactPayload.identity.bcControlManifestSha256 = foreignBc.manifestSha256;
  const foreignArtifact = { ...foreignArtifactPayload,
    manifestSha256: artifactTools.hashStage8BcArtifactControlManifestPayload(foreignArtifactPayload) };
  const foreignCorpusPayload = structuredClone(first.value.corpusControl);
  delete foreignCorpusPayload.manifestSha256;
  foreignCorpusPayload.identity.sourceBundleSha256 = '1'.repeat(64);
  foreignCorpusPayload.identity.bcControlManifestSha256 = foreignBc.manifestSha256;
  foreignCorpusPayload.identity.artifactControlManifestSha256 = foreignArtifact.manifestSha256;
  const foreignCorpus = { ...foreignCorpusPayload,
    manifestSha256: corpusTools.hashStage8BcCorpusControlPayload(foreignCorpusPayload) };
  assert.equal(identity.validateStage8BcRunIdentityMaterials({
    sourceCommit, readFile: readerA, artifactControl: foreignArtifact, corpusControl: foreignCorpus,
  }).reason, 'bc-run-source-or-control-identity-mismatch', 'self-consistent fake hashes must fail current-source binding');

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-run-identity-'));
  try {
    const artifactRoot = path.join(temporary, 'artifacts');
    const controlDirectory = path.join(artifactRoot, `${identity.STAGE8_BC_FORMAL_RUN_ID}-control`);
    fs.mkdirSync(controlDirectory, { recursive: true });
    const authorizationPath = path.join(temporary, 'authorization.json');
    fs.writeFileSync(authorizationPath, JSON.stringify(authorization));
    const baseEnvironment = {
      STAGE8_BC_RUN_AUTHORIZATION: authorizationPath,
      STAGE8_ARTIFACT_ROOT: artifactRoot,
      STAGE8_BC_CONTROL_DIRECTORY: controlDirectory,
    };
    const injected = {
      environment: baseEnvironment,
      inspectCheckout: () => ({ sourceCommit, clean: true }),
      readSourceFile: readerA,
    };
    const checked = await runStage8BcRunIdentityCli({ ...injected, args: ['--check'] });
    assert.equal(checked.ok, true, checked.reason);
    assert.equal(checked.filesWritten, 0);
    assert.equal(fs.readdirSync(controlDirectory).length, 0);
    const missingAuthorization = await runStage8BcRunIdentityCli({
      ...injected, environment: { ...baseEnvironment, STAGE8_BC_RUN_AUTHORIZATION: '' }, args: ['--check'],
    });
    assert.equal(missingAuthorization.ok, false);
    assert.equal(fs.readdirSync(controlDirectory).length, 0);
    const wrongCommit = await runStage8BcRunIdentityCli({
      ...injected, inspectCheckout: () => ({ sourceCommit: 'f'.repeat(40), clean: true }), args: ['--check'],
    });
    assert.equal(wrongCommit.reason, 'bc-run-checkout-commit-mismatch');
    const dirty = await runStage8BcRunIdentityCli({
      ...injected, inspectCheckout: () => ({ sourceCommit, clean: false }), args: ['--check'],
    });
    assert.equal(dirty.reason, 'bc-run-checkout-not-clean');
    const emitDenied = await runStage8BcRunIdentityCli({ ...injected, args: ['--emit'] });
    assert.equal(emitDenied.reason, 'bc-run-identity-emit-authorization-required');
    const emitted = await runStage8BcRunIdentityCli({
      ...injected, args: ['--emit'], environment: { ...baseEnvironment, STAGE8_BC_RUN_IDENTITY_EMIT: '1' },
    });
    assert.equal(emitted.ok, true, emitted.reason);
    assert.equal(emitted.filesWritten, 2);
    assert.deepEqual(fs.readdirSync(controlDirectory).sort(), ['artifact-control.json','corpus-control.json']);
    const duplicate = await runStage8BcRunIdentityCli({
      ...injected, args: ['--emit'], environment: { ...baseEnvironment, STAGE8_BC_RUN_IDENTITY_EMIT: '1' },
    });
    assert.equal(duplicate.reason, 'bc-run-control-directory-invalid');

    const outside = path.join(temporary, `${identity.STAGE8_BC_FORMAL_RUN_ID}-control`);
    fs.mkdirSync(outside);
    const outsideResult = await runStage8BcRunIdentityCli({
      ...injected,
      args: ['--emit'],
      environment: { ...baseEnvironment, STAGE8_BC_CONTROL_DIRECTORY: outside, STAGE8_BC_RUN_IDENTITY_EMIT: '1' },
    });
    assert.equal(outsideResult.reason, 'bc-run-control-directory-invalid');
    assert.equal(fs.readdirSync(outside).length, 0);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    passed: true,
    runId: identity.STAGE8_BC_FORMAL_RUN_ID,
    sourceFiles: identity.STAGE8_BC_RUN_SOURCE_FILES.length,
    formalPilotGamesExecuted: 0,
    realControlFilesWritten: 0,
    temporaryFixturesOnly: true,
    controls: ['explicit-approval-file','real-source-bytes','commit-binding','cross-worktree-stability','self-consistent-tamper-rejection','readonly-check','atomic-two-file-emit'],
  }));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}
