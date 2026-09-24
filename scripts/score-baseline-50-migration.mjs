import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCORE_BASELINE = 50;
const DEFAULT_MIGRATION_ID = 'score-baseline-50-v1';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalPath(value) {
  const normalized = path.normalize(value);
  return fs.existsSync(normalized) ? fs.realpathSync.native(normalized) : normalized;
}

function samePath(left, right) {
  const a = canonicalPath(left);
  const b = canonicalPath(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function safeMigrationId(value) {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(value)) throw new Error('SCORE_BASELINE_MIGRATION_ID is invalid');
  return value;
}

function resolveMigrationConfig(env) {
  const configured = env.RL_WEIGHTS_FILE;
  const approved = env.APPROVED_RL_WEIGHTS_FILE;
  if (!configured || !path.isAbsolute(configured)) throw new Error('RL_WEIGHTS_FILE must be an explicit absolute path');
  if (!approved || !path.isAbsolute(approved)) throw new Error('APPROVED_RL_WEIGHTS_FILE must be an explicit absolute path');
  if (!samePath(configured, approved)) throw new Error('RL_WEIGHTS_FILE does not match APPROVED_RL_WEIGHTS_FILE');
  const weightsFile = canonicalPath(configured);
  if (!fs.existsSync(weightsFile) || !fs.statSync(weightsFile).isFile()) throw new Error('RL_WEIGHTS_FILE must reference an existing file');
  const migrationId = safeMigrationId(env.SCORE_BASELINE_MIGRATION_ID || DEFAULT_MIGRATION_ID);
  const timestamp = env.SCORE_BASELINE_MIGRATION_TIME || new Date().toISOString().replace(/[:.]/g, '-');
  if (!/^[0-9TZ-]{10,40}$/.test(timestamp)) throw new Error('SCORE_BASELINE_MIGRATION_TIME is invalid');
  return {
    weightsFile,
    migrationId,
    timestamp,
    witnessFile: `${weightsFile}.${migrationId}.witness.json`,
  };
}

function validateWeights(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('RL weights file must contain valid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('RL weights file must contain an object');
  if (!Array.isArray(parsed.scores) || parsed.scores.length !== 4 || !parsed.scores.every(Number.isFinite)) {
    throw new Error('RL weights file must contain four finite scores');
  }
  return parsed;
}

function writeAtomic(target, contents) {
  const temporary = `${target}.migration-${process.pid}-${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function completePreparedMigration(config, witness, currentRaw) {
  const currentSha256 = sha256(currentRaw);
  if (currentSha256 === witness.targetSha256) {
    return { applied: false, alreadyApplied: true, backupFile: witness.backupFile, witnessFile: config.witnessFile };
  }
  if (currentSha256 !== witness.sourceSha256) throw new Error('migration witness does not match the current RL weights file');
  const original = validateWeights(currentRaw);
  const migratedRaw = JSON.stringify({ ...original, scores: [SCORE_BASELINE, SCORE_BASELINE, SCORE_BASELINE, SCORE_BASELINE] });
  if (sha256(migratedRaw) !== witness.targetSha256) throw new Error('migration witness target hash is not reproducible');
  writeAtomic(config.weightsFile, migratedRaw);
  return { applied: true, resumed: true, backupFile: witness.backupFile, witnessFile: config.witnessFile };
}

export function migrateScoreBaseline(env = process.env) {
  const config = resolveMigrationConfig(env);
  const currentRaw = fs.readFileSync(config.weightsFile, 'utf8');
  if (fs.existsSync(config.witnessFile)) {
    let witness;
    try { witness = JSON.parse(fs.readFileSync(config.witnessFile, 'utf8')); } catch { throw new Error('migration witness is invalid'); }
    if (!witness || witness.migrationId !== config.migrationId || typeof witness.sourceSha256 !== 'string' || typeof witness.targetSha256 !== 'string' || typeof witness.backupFile !== 'string') {
      throw new Error('migration witness contract is invalid');
    }
    return completePreparedMigration(config, witness, currentRaw);
  }

  const original = validateWeights(currentRaw);
  const migratedRaw = JSON.stringify({ ...original, scores: [SCORE_BASELINE, SCORE_BASELINE, SCORE_BASELINE, SCORE_BASELINE] });
  const backupFile = `${config.weightsFile}.${config.migrationId}.${config.timestamp}.backup.json`;
  const witness = {
    schemaVersion: 'wannian-score-baseline-migration-witness-v1',
    migrationId: config.migrationId,
    preparedAt: config.timestamp,
    sourceSha256: sha256(currentRaw),
    targetSha256: sha256(migratedRaw),
    backupFile,
    preservedFieldsSha256: sha256(JSON.stringify(Object.fromEntries(Object.entries(original).filter(([key]) => key !== 'scores')))),
  };

  fs.writeFileSync(backupFile, currentRaw, { encoding: 'utf8', flag: 'wx' });
  try {
    fs.writeFileSync(config.witnessFile, JSON.stringify(witness, null, 2), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    fs.unlinkSync(backupFile);
    throw error;
  }
  writeAtomic(config.weightsFile, migratedRaw);
  return { applied: true, backupFile, witnessFile: config.witnessFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = migrateScoreBaseline();
    console.log(JSON.stringify({ ok: true, applied: result.applied, alreadyApplied: result.alreadyApplied === true, witnessFile: result.witnessFile }));
  } catch (error) {
    console.error(`[score-baseline-migration] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
