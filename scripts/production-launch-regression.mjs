import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const modulePath = new URL('./start-production-game.mjs', import.meta.url);
let production;
try {
  production = await import(modulePath.href);
} catch (error) {
  throw new Error(`Missing production launch gate: ${error.message}`);
}

const { resolveProductionLaunchConfig } = production;
assert.equal(typeof resolveProductionLaunchConfig, 'function', 'production launcher must expose preflight validation');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wannian-production-launch-'));
const weights = path.join(tempDir, 'approved-weights.json');
const other = path.join(tempDir, 'other-weights.json');
const exportsDir = path.join(tempDir, 'exports');
fs.writeFileSync(weights, '{}', 'utf8');
fs.writeFileSync(other, '{}', 'utf8');
fs.mkdirSync(exportsDir);

assert.throws(
  () => resolveProductionLaunchConfig({ PORT: '18768' }),
  /RL_WEIGHTS_FILE is required/,
  'production launch must not silently use a cwd-relative file',
);
assert.throws(
  () => resolveProductionLaunchConfig({
    PORT: '18768', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: other, GAME_EXPORT_DIR: exportsDir, APPROVED_GAME_EXPORT_DIR: exportsDir,
  }),
  /does not match APPROVED_RL_WEIGHTS_FILE/,
  'production launch must reject a non-authoritative configured path',
);
assert.throws(
  () => resolveProductionLaunchConfig({
    PORT: '18769', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: weights, GAME_EXPORT_DIR: exportsDir, APPROVED_GAME_EXPORT_DIR: exportsDir,
  }),
  /PORT=18768/,
  'production launch must reject a non-canonical port',
);
assert.throws(
  () => resolveProductionLaunchConfig({ PORT: '18768', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: weights }),
  /GAME_EXPORT_DIR is required/,
  'production launch must require an explicit export directory',
);
assert.throws(
  () => resolveProductionLaunchConfig({ PORT: '18768', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: weights, GAME_EXPORT_DIR: 'relative-exports', APPROVED_GAME_EXPORT_DIR: exportsDir }),
  /GAME_EXPORT_DIR must be an absolute path/,
  'production launch must reject a cwd-relative export directory',
);
assert.throws(
  () => resolveProductionLaunchConfig({ PORT: '18768', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: weights, GAME_EXPORT_DIR: exportsDir, APPROVED_GAME_EXPORT_DIR: tempDir }),
  /GAME_EXPORT_DIR does not match APPROVED_GAME_EXPORT_DIR/,
  'production launch must reject an unapproved export directory',
);

const config = resolveProductionLaunchConfig({
  PORT: '18768', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: weights, GAME_EXPORT_DIR: exportsDir, APPROVED_GAME_EXPORT_DIR: exportsDir,
});
assert.equal(config.port, '18768');
assert.equal(config.portWindow, '0');
assert.equal(config.weightsFile, fs.realpathSync.native(weights));
assert.equal(config.approvedWeightsFile, fs.realpathSync.native(weights));
assert.equal(config.exportDirectory, fs.realpathSync.native(exportsDir));
assert.equal(config.approvedExportDirectory, fs.realpathSync.native(exportsDir));

console.log('Production launch gate regression passed');
