import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runStage8BcCorpusCli } from './stage8-bc-corpus-runner.mjs';

const root = process.cwd();
const sha = (value) => createHash('sha256').update(String(value)).digest('hex');
const emitted = spawnSync(process.execPath, ['scripts/stage8-bc-corpus-runner-regression.mjs'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
  env: { ...process.env, STAGE8_BC_CORPUS_RUNNER_EMIT_FIXTURE: '1' },
});
assert.equal(emitted.status, 0, emitted.stderr);
const fixture = JSON.parse(emitted.stdout.trim().split(/\r?\n/).at(-1)).fixture;

function setup() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-corpus-cli-'));
  const artifactRoot = path.join(temporary, 'artifacts');
  fs.mkdirSync(artifactRoot);
  const controlPath = path.join(temporary, 'corpus-control.json');
  const artifactPath = path.join(temporary, 'artifact-control.json');
  fs.writeFileSync(controlPath, JSON.stringify(fixture.control));
  fs.writeFileSync(artifactPath, JSON.stringify(fixture.artifactControl));
  return {
    temporary, artifactRoot,
    environment: {
      STAGE8_BC_CORPUS_CONTROL_MANIFEST: controlPath,
      STAGE8_BC_ARTIFACT_CONTROL_MANIFEST: artifactPath,
      STAGE8_ARTIFACT_ROOT: artifactRoot,
      STAGE8_PYTHON: process.execPath,
      STAGE8_BC_CORPUS_RUN_DIRECTORY: path.join(artifactRoot, fixture.control.identity.runId),
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
const verifiedRunIdentity = () => ({ ok: true, value: { source: {} } });

const greenFixture = setup();
try {
  const green = await runStage8BcCorpusCli({ environment: greenFixture.environment, capacityPreflight,
    runIdentityVerifier: verifiedRunIdentity,
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
    compileRuntimeTree: () => {}, runnerModule: rejectingRunner, writerModule, teacherEvaluator: () => ({}), sampleValidator: () => ({ ok: true }) });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(quarantineFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY), false);
  const quarantine = `${quarantineFixture.environment.STAGE8_BC_CORPUS_RUN_DIRECTORY}.partial.quarantine`;
  assert.equal(fs.existsSync(quarantine), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(quarantine, 'QUARANTINED.json'), 'utf8')).automaticRetries, 0);
} finally { fs.rmSync(quarantineFixture.temporary, { recursive: true, force: true }); }

console.log(JSON.stringify({ passed: true, formalPilotGamesExecuted: 0, temporaryFixturesOnly: true,
  controls: ['full-readonly-preflight-before-temp','run-identity-drift-zero-write','atomic-final-rename','structured-quarantine','no-automatic-retry'] }));
