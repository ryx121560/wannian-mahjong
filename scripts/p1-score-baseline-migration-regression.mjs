import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrateScoreBaseline } from './score-baseline-50-migration.mjs';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wannian-score-baseline-migration-'));
const approvedFile = path.join(tempRoot, 'rl_weights.json');
const original = {
  scores: [73, 61, 58, 42],
  totalGames: 731,
  scoreboard: { nn: { retained: true }, meta: { version: 4 } },
  gameSequence: 88,
};
fs.writeFileSync(approvedFile, JSON.stringify(original), 'utf8');

const result = migrateScoreBaseline({
  RL_WEIGHTS_FILE: approvedFile,
  APPROVED_RL_WEIGHTS_FILE: approvedFile,
  SCORE_BASELINE_MIGRATION_ID: 'score-baseline-50-v1',
  SCORE_BASELINE_MIGRATION_TIME: '2026-08-13T08-00-00-000Z',
});
assert.equal(result.applied, true, 'first approved migration must apply once');
const migrated = JSON.parse(fs.readFileSync(approvedFile, 'utf8'));
assert.deepEqual(migrated.scores, [50, 50, 50, 50], 'migration must reset only the four score totals');
assert.equal(migrated.totalGames, original.totalGames, 'migration must preserve totalGames');
assert.deepEqual(migrated.scoreboard, original.scoreboard, 'migration must preserve model weights and metadata');
assert.equal(migrated.gameSequence, original.gameSequence, 'migration must preserve gameSequence when present');
assert.ok(fs.existsSync(result.backupFile), 'migration must create a non-overwriting backup');
assert.ok(fs.existsSync(result.witnessFile), 'migration must create a redacted hash witness');
assert.deepEqual(JSON.parse(fs.readFileSync(result.backupFile, 'utf8')), original, 'backup must retain the exact original file');
const witness = JSON.parse(fs.readFileSync(result.witnessFile, 'utf8'));
assert.equal(witness.migrationId, 'score-baseline-50-v1');
assert.match(witness.sourceSha256, /^[a-f0-9]{64}$/);
assert.match(witness.targetSha256, /^[a-f0-9]{64}$/);
assert.equal('scores' in witness, false, 'witness must not expose original score values');
assert.equal('contents' in witness, false, 'witness must not expose file contents');
assert.equal(witness.sourceSha256, crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'));

const second = migrateScoreBaseline({
  RL_WEIGHTS_FILE: approvedFile,
  APPROVED_RL_WEIGHTS_FILE: approvedFile,
  SCORE_BASELINE_MIGRATION_ID: 'score-baseline-50-v1',
  SCORE_BASELINE_MIGRATION_TIME: '2026-08-13T08-00-00-000Z',
});
assert.equal(second.applied, false, 'repeated migration must be idempotent');
assert.equal(second.alreadyApplied, true, 'repeated migration must report its receipt');
assert.equal(fs.readdirSync(tempRoot).filter((name) => name.endsWith('.backup.json')).length, 1, 'idempotence must not create repeated backups');

const otherFile = path.join(tempRoot, 'other.json');
fs.writeFileSync(otherFile, JSON.stringify(original), 'utf8');
assert.throws(() => migrateScoreBaseline({
  RL_WEIGHTS_FILE: otherFile,
  APPROVED_RL_WEIGHTS_FILE: approvedFile,
  SCORE_BASELINE_MIGRATION_ID: 'mismatch',
}), /does not match/, 'an unapproved path must fail closed');
assert.deepEqual(JSON.parse(fs.readFileSync(otherFile, 'utf8')), original, 'path rejection must not modify the unapproved file');

const invalidFile = path.join(tempRoot, 'invalid.json');
fs.writeFileSync(invalidFile, '{"scores":[1,2]}', 'utf8');
assert.throws(() => migrateScoreBaseline({
  RL_WEIGHTS_FILE: invalidFile,
  APPROVED_RL_WEIGHTS_FILE: invalidFile,
  SCORE_BASELINE_MIGRATION_ID: 'invalid',
}), /four finite scores/, 'invalid score shape must fail before backup or write');
assert.equal(fs.readFileSync(invalidFile, 'utf8'), '{"scores":[1,2]}', 'validation failure must preserve the source byte-for-byte');

console.log('P1 score baseline migration regression passed');
