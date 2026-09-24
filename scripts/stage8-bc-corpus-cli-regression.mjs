import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { runStage8BcCorpusCli } from './stage8-bc-corpus-runner.mjs';

const root = process.cwd();
const sha = (value) => createHash('sha256').update(String(value)).digest('hex');
const require = createRequire(import.meta.url);
const previousTs = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename);
const bcTools = require('../src/game/stage8/offline-bc-control.ts');
const artifactTools = require('../src/game/stage8/offline-bc-artifact-control.ts');
const corpusTools = require('../src/game/stage8/offline-bc-corpus-control.ts');
const emitted = spawnSync(process.execPath, ['scripts/stage8-bc-corpus-runner-regression.mjs'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
  env: { ...process.env, STAGE8_BC_CORPUS_RUNNER_EMIT_FIXTURE: '1' },
});
assert.equal(emitted.status, 0, emitted.stderr);
const fixture = JSON.parse(emitted.stdout.trim().split(/\r?\n/).at(-1)).fixture;
const nextRunId = 'formal-bc-corpus-pilot-20260913';
const predecessorRunId = 'formal-bc-corpus-pilot-20260910';
const predecessorEvidenceSha256 = sha('fixture-predecessor-evidence');
const runAuthorizationSha256 = sha('fixture-run-authorization');

function nextRunFixture() {
  const bcPayload = structuredClone(fixture.artifactControl.bcControl);
  delete bcPayload.manifestSha256;
  bcPayload.identity.runId = nextRunId;
  const bcControl = { ...bcPayload, manifestSha256: bcTools.hashStage8BcControlManifestPayload(bcPayload) };
  const artifactPayload = structuredClone(fixture.artifactControl);
  delete artifactPayload.manifestSha256;
  artifactPayload.protocolVersion = artifactTools.STAGE8_BC_ARTIFACT_CONTROL_PREDECESSOR_VERSION;
  artifactPayload.bcControl = bcControl;
  Object.assign(artifactPayload.identity, {
    runId: nextRunId,
    predecessorRunId,
    predecessorEvidenceSha256,
    runAuthorizationSha256,
    bcControlManifestSha256: bcControl.manifestSha256,
  });
  const artifactControl = {
    ...artifactPayload,
    manifestSha256: artifactTools.hashStage8BcArtifactControlManifestPayload(artifactPayload),
  };
  const corpusPayload = structuredClone(fixture.control);
  delete corpusPayload.manifestSha256;
  corpusPayload.protocolVersion = corpusTools.STAGE8_BC_CORPUS_CONTROL_PREDECESSOR_VERSION;
  Object.assign(corpusPayload.identity, {
    runId: nextRunId,
    predecessorRunId,
    predecessorEvidenceSha256,
    runAuthorizationSha256,
    artifactControlManifestSha256: artifactControl.manifestSha256,
    bcControlManifestSha256: bcControl.manifestSha256,
  });
  const control = { ...corpusPayload, manifestSha256: corpusTools.hashStage8BcCorpusControlPayload(corpusPayload) };
  return { control, artifactControl };
}

function setup() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-corpus-cli-'));
  const artifactRoot = path.join(temporary, 'artifacts');
  fs.mkdirSync(artifactRoot);
  const controlPath = path.join(temporary, 'corpus-control.json');
  const artifactPath = path.join(temporary, 'artifact-control.json');
  const authorizationPath = path.join(temporary, 'run-authorization.json');
  const predecessorEvidencePath = path.join(temporary, 'predecessor-evidence.json');
  const next = nextRunFixture();
  fs.writeFileSync(controlPath, JSON.stringify(next.control));
  fs.writeFileSync(artifactPath, JSON.stringify(next.artifactControl));
  fs.writeFileSync(authorizationPath, JSON.stringify({
    protocolVersion: 'stage8-bc-run-authorization-v2',
    runId: nextRunId,
    sourceCommit: 'c'.repeat(40),
    predecessor: { runId: predecessorRunId, evidenceSha256: predecessorEvidenceSha256 },
    authorizationSha256: runAuthorizationSha256,
  }));
  fs.writeFileSync(predecessorEvidencePath, JSON.stringify({
    protocolVersion: 'stage8-bc-operational-interruption-evidence-v1',
    predecessorRunId,
    evidenceSha256: predecessorEvidenceSha256,
  }));
  return {
    temporary, artifactRoot,
    environment: {
      STAGE8_BC_CORPUS_CONTROL_MANIFEST: controlPath,
      STAGE8_BC_ARTIFACT_CONTROL_MANIFEST: artifactPath,
      STAGE8_BC_RUN_AUTHORIZATION: authorizationPath,
      STAGE8_BC_PREDECESSOR_EVIDENCE: predecessorEvidencePath,
      STAGE8_ARTIFACT_ROOT: artifactRoot,
      STAGE8_PYTHON: process.execPath,
      STAGE8_BC_CORPUS_RUN_DIRECTORY: path.join(artifactRoot, nextRunId),
    },
  };
}

const capacityPreflight = (_root, _run, identitySha256, request) => ({
  ...request, ok: true, totalBytes: 100 * 1024 ** 3, freeBytes: 90 * 1024 ** 3,
  rootBytes: 0, runBytes: 0, identitySha256,
});
const writerModule = {
  writeStage8BcSampleShard: ({ batchDirectory, shardId, fileSystem }) => {
    const bytes = Buffer.from(`fixture:${shardId}`);
    const target = path.join(batchDirectory, `${shardId}.json.gz`);
    fileSystem.writeFileExclusive(target, bytes);
    return { ok: true, value: { artifactPath: target, artifactFileSha256: sha(bytes), payloadSha256: sha(`payload:${shardId}`),
      sampleCount: 1, episodeCount: 1, artifactsWritten: 1 } };
  },
};
const runnerModule = {
  executeStage8BcCorpusTransaction: ({ port }) => {
    const shards = [];
    for (let gameIndex = 0; gameIndex < 64; gameIndex += 1) {
      const serial = String(gameIndex + 1).padStart(6, '0');
      const committed = port.commitShard({ gameIndex, game: { samples: [{}] },
        relativeDirectory: `${fixture.control.identity.runId}/batches/batch-${serial}`, shardId: `formal-shard-${serial}` });
      if (!committed.ok) return { ok: false, status: 'fused', reason: committed.reason, artifactsWritten: 0 };
      shards.push(committed.shard);
    }
    const manifest = { manifestSha256: sha('manifest'), totals: { sampleCount: 64 } };
    const verified = port.verifyPython({ manifest, shards });
    if (!verified.ok) { port.quarantineRun({ reason: 'python-failed', completedShardCount: 64, ledgerSha256: sha('q') });
      return { ok: false, status: 'fused', reason: 'python-failed', artifactsWritten: 0 }; }
    const ledger = { ledgerSha256: sha('ledger') };
    const committed = port.commitRun({ manifest, ledger });
    return committed.ok
      ? { ok: true, status: 'committed', manifest, ledger, artifactsWritten: 66, pilotGamesExecuted: 64, trainingStarted: false }
      : { ok: false, status: 'fused', reason: committed.reason, artifactsWritten: 0 };
  },
};
const verifiedRunIdentity = ({ authorization, predecessorEvidence, artifactControl, corpusControl }) => {
  const valid = authorization.protocolVersion === 'stage8-bc-run-authorization-v2'
    && authorization.predecessor?.runId === predecessorRunId
    && authorization.predecessor?.evidenceSha256 === predecessorEvidenceSha256
    && predecessorEvidence.evidenceSha256 === predecessorEvidenceSha256
    && artifactControl.protocolVersion === artifactTools.STAGE8_BC_ARTIFACT_CONTROL_PREDECESSOR_VERSION
    && corpusControl.protocolVersion === corpusTools.STAGE8_BC_CORPUS_CONTROL_PREDECESSOR_VERSION
    && artifactControl.identity.runAuthorizationSha256 === runAuthorizationSha256
    && corpusControl.identity.predecessorEvidenceSha256 === predecessorEvidenceSha256;
  return valid ? { ok: true, value: { source: {} } }
    : { ok: false, reason: 'bc-run-source-or-control-identity-mismatch' };
};
const verifiedPredecessor = () => ({ ok: true, value: { evidenceSha256: sha('fixture-evidence') } });

const directCli = spawnSync(process.execPath, ['scripts/stage8-bc-corpus-runner.mjs'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
assert.notEqual(directCli.status, 0);
assert.match(directCli.stdout, /bc-corpus-supervision-required/);

const greenFixture = setup();
try {
  const green = await runStage8BcCorpusCli({ environment: greenFixture.environment, capacityPreflight,
    runIdentityVerifier: verifiedRunIdentity,
    predecessorVerifier: verifiedPredecessor,
    compileRuntimeTree: () => {}, runnerModule, writerModule, teacherEvaluator: () => assert.fail('fixture runner does not invoke teacher'),
    sampleValidator: () => ({ ok: true }), verifyPython: () => ({ status: 0, stdout: JSON.stringify({
      ok: true, corpusManifestSha256: sha('manifest'), shardCount: 64, sampleCount: 64,
      splitCounts: { train: 48, validation: 8, finalTest: 8 }, fileSetSha256: sha('files'), torchImported: false,
    }) }),
  });
  assert.equal(green.ok, true, green.reason);
  assert.equal(green.counters.temporaryDirectories, 1);
  assert.equal(green.counters.shardCommits, 64);
  assert.equal(green.counters.pythonVerifications, 1);
  assert.equal(green.counters.finalCommits, 1);
  assert.equal(fs.existsSync(greenFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY), true);
  assert.equal(fs.existsSync(`${greenFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY}.partial`), false);
  assert.equal(fs.existsSync(path.join(greenFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY, 'corpus-manifest.json')), true);
} finally { fs.rmSync(greenFixture.temporary, { recursive: true, force: true }); }

const deniedFixture = setup();
try {
  const denied = structuredClone(fixture.control);
  denied.authorization.granted = false;
  fs.writeFileSync(deniedFixture.environment.STAGE8_BC_CORPUS_CONTROL_MANIFEST, JSON.stringify(denied));
  let temporaryWrites = 0;
  const result = await runStage8BcCorpusCli({ environment: deniedFixture.environment,
    createTemporaryDirectory: () => { temporaryWrites += 1; throw new Error('must-not-write'); } });
  assert.equal(result.ok, false);
  assert.equal(temporaryWrites, 0);
  assert.equal(result.counters.stagingDirectories, 0);
  assert.equal(fs.readdirSync(deniedFixture.artifactRoot).length, 0);
} finally { fs.rmSync(deniedFixture.temporary, { recursive: true, force: true }); }

const driftFixture = setup();
try {
  let temporaryWrites = 0;
  const result = await runStage8BcCorpusCli({ environment: driftFixture.environment,
    runIdentityVerifier: () => ({ ok: false, reason: 'bc-run-source-or-control-identity-mismatch' }),
    createTemporaryDirectory: () => { temporaryWrites += 1; throw new Error('must-not-write'); } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bc-run-source-or-control-identity-mismatch');
  assert.equal(temporaryWrites, 0);
  assert.equal(result.counters.stagingDirectories, 0);
  assert.equal(fs.readdirSync(driftFixture.artifactRoot).length, 0);
} finally { fs.rmSync(driftFixture.temporary, { recursive: true, force: true }); }

const predecessorDriftFixture = setup();
try {
  let temporaryWrites = 0;
  const result = await runStage8BcCorpusCli({ environment: predecessorDriftFixture.environment,
    runIdentityVerifier: verifiedRunIdentity,
    predecessorVerifier: () => ({ ok: false, reason: 'bc-operational-interruption-quarantine-drift' }),
    createTemporaryDirectory: () => { temporaryWrites += 1; throw new Error('must-not-write'); } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bc-operational-interruption-quarantine-drift');
  assert.equal(temporaryWrites, 0);
  assert.equal(result.counters.stagingDirectories, 0);
  assert.deepEqual(fs.readdirSync(predecessorDriftFixture.artifactRoot), []);
} finally { fs.rmSync(predecessorDriftFixture.temporary, { recursive: true, force: true }); }

const legacyAuthorizationFixture = setup();
try {
  fs.writeFileSync(legacyAuthorizationFixture.environment.STAGE8_BC_RUN_AUTHORIZATION,
    JSON.stringify({ protocolVersion: 'stage8-bc-run-authorization-v1' }));
  let temporaryWrites = 0;
  const result = await runStage8BcCorpusCli({ environment: legacyAuthorizationFixture.environment,
    runIdentityVerifier: ({ authorization }) => authorization.protocolVersion === 'stage8-bc-run-authorization-v2'
      ? ({ ok: true, value: { source: {} } }) : ({ ok: false, reason: 'bc-run-authorization-schema-invalid' }),
    predecessorVerifier: verifiedPredecessor,
    createTemporaryDirectory: () => { temporaryWrites += 1; throw new Error('must-not-write'); } });
  assert.equal(result.reason, 'bc-run-authorization-schema-invalid');
  assert.equal(temporaryWrites, 0);
  assert.equal(result.counters.stagingDirectories, 0);
} finally { fs.rmSync(legacyAuthorizationFixture.temporary, { recursive: true, force: true }); }

const legacyControlFixture = setup();
try {
  fs.writeFileSync(legacyControlFixture.environment.STAGE8_BC_CORPUS_CONTROL_MANIFEST, JSON.stringify(fixture.control));
  fs.writeFileSync(legacyControlFixture.environment.STAGE8_BC_ARTIFACT_CONTROL_MANIFEST, JSON.stringify(fixture.artifactControl));
  legacyControlFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY = path.join(
    legacyControlFixture.artifactRoot,
    fixture.control.identity.runId,
  );
  let temporaryWrites = 0;
  const result = await runStage8BcCorpusCli({ environment: legacyControlFixture.environment,
    runIdentityVerifier: verifiedRunIdentity,
    predecessorVerifier: verifiedPredecessor,
    createTemporaryDirectory: () => { temporaryWrites += 1; throw new Error('must-not-write'); } });
  assert.equal(result.reason, 'bc-run-source-or-control-identity-mismatch');
  assert.equal(temporaryWrites, 0);
  assert.equal(result.counters.stagingDirectories, 0);
} finally { fs.rmSync(legacyControlFixture.temporary, { recursive: true, force: true }); }

const copiedShardFixture = setup();
try {
  const staging = `${copiedShardFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY}.partial`;
  fs.mkdirSync(path.join(staging, 'batches', 'batch-000001'), { recursive: true });
  fs.writeFileSync(path.join(staging, 'batches', 'batch-000001', 'copied-old-shard.json.gz'), 'diagnostic-only');
  let temporaryWrites = 0;
  const result = await runStage8BcCorpusCli({ environment: copiedShardFixture.environment,
    runIdentityVerifier: verifiedRunIdentity,
    predecessorVerifier: verifiedPredecessor,
    createTemporaryDirectory: () => { temporaryWrites += 1; throw new Error('must-not-write'); } });
  assert.equal(result.reason, 'bc-corpus-staging-directory-already-exists');
  assert.equal(temporaryWrites, 0);
  assert.equal(result.counters.stagingDirectories, 0);
  assert.equal(fs.readFileSync(path.join(staging, 'batches', 'batch-000001', 'copied-old-shard.json.gz'), 'utf8'), 'diagnostic-only');
} finally { fs.rmSync(copiedShardFixture.temporary, { recursive: true, force: true }); }

const quarantineFixture = setup();
try {
  const rejectingRunner = { executeStage8BcCorpusTransaction: ({ port }) => {
    const committed = port.commitShard({ gameIndex: 0, game: { samples: [{}] },
      relativeDirectory: `${fixture.control.identity.runId}/batches/batch-000001`, shardId: 'formal-shard-000001' });
    assert.equal(committed.ok, true);
    port.quarantineRun({ reason: 'fixture-mid-run-failure', completedShardCount: 1, ledgerSha256: sha('quarantine') });
    return { ok: false, status: 'fused', reason: 'fixture-mid-run-failure', artifactsWritten: 0 };
  } };
  const result = await runStage8BcCorpusCli({ environment: quarantineFixture.environment, capacityPreflight,
    runIdentityVerifier: verifiedRunIdentity,
    predecessorVerifier: verifiedPredecessor,
    compileRuntimeTree: () => {}, runnerModule: rejectingRunner, writerModule, teacherEvaluator: () => ({}), sampleValidator: () => ({ ok: true }) });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(quarantineFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY), false);
  const quarantine = `${quarantineFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY}.partial.quarantine`;
  assert.equal(fs.existsSync(quarantine), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(quarantine, 'QUARANTINED.json'), 'utf8')).automaticRetries, 0);
} finally { fs.rmSync(quarantineFixture.temporary, { recursive: true, force: true }); }

console.log(JSON.stringify({ passed: true, formalPilotGamesExecuted: 0, temporaryFixturesOnly: true,
  controls: ['legacy-v2-unit-green','formal-direct-cli-supervision-required','full-readonly-preflight-before-temp','run-identity-drift-zero-write',
    'predecessor-drift-zero-write','old-authorization-zero-write','old-control-zero-write',
    'copied-old-shard-zero-write','atomic-final-rename','structured-quarantine','no-automatic-retry'] }));

if (previousTs) require.extensions['.ts'] = previousTs;
else delete require.extensions['.ts'];
