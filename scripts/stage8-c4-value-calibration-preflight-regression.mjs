import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const runner = path.join(root, 'scripts', 'stage8-c4-value-calibration-preflight.mjs');
const configPath = path.join(root, 'docs', 'stage8', 'candidate-4-value-calibration-readiness-config-v1.json');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-c4-preflight-'));

function run(config, output) {
  return spawnSync(process.execPath, [runner, '--config', config, '--output', output], {
    cwd: root,
    encoding: 'utf8',
  });
}

try {
  const output = path.join(tempRoot, 'preflight.json');
  const first = run(configPath, output);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(report.status, 'fixture-readiness-passed-real-offline-gate-blocked');
  assert.ok(Object.values(report.implementationGates).every(Boolean));
  assert.equal(report.executionPrerequisites.v2ValueModelAvailable, false);
  assert.equal(report.executionPrerequisites.v2CalibrationCorpusAvailable, false);
  assert.deepEqual(report.authorizations, {
    candidateCreated: false,
    corpusGenerated: false,
    finalTestOpened: false,
    trainingAuthorized: false,
    arenaAuthorized: false,
    runtimeAuthorized: false,
  });
  assert.equal(report.evidence.design.sha256, report.designSha256);
  assert.equal(report.evidence.actionRegistry.sha256, report.lineage.actionRegistrySourceSha256.toUpperCase());
  assert.equal(report.verificationEvidence.readinessRegressionPassed, true);
  assert.equal(report.verificationEvidence.stage8V2ActionSpaceGatePassed, true);
  assert.match(report.verificationEvidence.readinessRegressionSha256, /^[0-9A-F]{64}$/);
  assert.match(report.verificationEvidence.stage8V2GateRegressionSha256, /^[0-9A-F]{64}$/);

  const before = fs.readFileSync(output, 'utf8');
  const second = run(configPath, output);
  assert.notEqual(second.status, 0, 'preflight must refuse overwrite');
  assert.match(second.stderr, /output already exists/);
  assert.equal(fs.readFileSync(output, 'utf8'), before, 'refused overwrite must preserve immutable evidence');

  const tampered = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  tampered.lineage.actionRegistrySourceSha256 = '0'.repeat(64);
  const tamperedConfig = path.join(tempRoot, 'tampered-config.json');
  const tamperedOutput = path.join(tempRoot, 'tampered-output.json');
  fs.writeFileSync(tamperedConfig, `${JSON.stringify(tampered, null, 2)}\n`);
  const tamperedRun = run(tamperedConfig, tamperedOutput);
  assert.notEqual(tamperedRun.status, 0);
  assert.match(tamperedRun.stderr, /hash mismatch: actionRegistry/);
  assert.equal(fs.existsSync(tamperedOutput), false);

  const wrongCommit = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  wrongCommit.lineage.actionSpaceGateCommit = '0'.repeat(40);
  const wrongCommitConfig = path.join(tempRoot, 'wrong-commit-config.json');
  const wrongCommitOutput = path.join(tempRoot, 'wrong-commit-output.json');
  fs.writeFileSync(wrongCommitConfig, `${JSON.stringify(wrongCommit, null, 2)}\n`);
  const wrongCommitRun = run(wrongCommitConfig, wrongCommitOutput);
  assert.notEqual(wrongCommitRun.status, 0);
  assert.match(wrongCommitRun.stderr, /lineage mismatch: actionSpaceGateCommit/);
  assert.equal(fs.existsSync(wrongCommitOutput), false);

  const forbidden = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  forbidden.lineage.manifest = 'stage8-v1-manifest.json';
  const forbiddenConfig = path.join(tempRoot, 'forbidden-config.json');
  const forbiddenOutput = path.join(tempRoot, 'forbidden-output.json');
  fs.writeFileSync(forbiddenConfig, `${JSON.stringify(forbidden, null, 2)}\n`);
  const forbiddenRun = run(forbiddenConfig, forbiddenOutput);
  assert.notEqual(forbiddenRun.status, 0);
  assert.match(forbiddenRun.stderr, /v1 artifact field rejected: manifest/);
  assert.equal(fs.existsSync(forbiddenOutput), false);

  const unauthorized = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  unauthorized.authorizations.trainingAuthorized = true;
  const unauthorizedConfig = path.join(tempRoot, 'unauthorized-config.json');
  const unauthorizedOutput = path.join(tempRoot, 'unauthorized-output.json');
  fs.writeFileSync(unauthorizedConfig, `${JSON.stringify(unauthorized, null, 2)}\n`);
  const unauthorizedRun = run(unauthorizedConfig, unauthorizedOutput);
  assert.notEqual(unauthorizedRun.status, 0);
  assert.match(unauthorizedRun.stderr, /readiness cannot authorize downstream actions/);
  assert.equal(fs.existsSync(unauthorizedOutput), false);

  const created = fs.readdirSync(tempRoot).sort();
  assert.deepEqual(created, ['forbidden-config.json', 'preflight.json', 'tampered-config.json', 'unauthorized-config.json', 'wrong-commit-config.json']);
  console.log('Stage8 H-C4 value calibration preflight regression: passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}