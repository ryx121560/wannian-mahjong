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
fs.writeFileSync(weights, '{}', 'utf8');
fs.writeFileSync(other, '{}', 'utf8');

assert.throws(
  () => resolveProductionLaunchConfig({ PORT: '18768' }),
  /RL_WEIGHTS_FILE is required/,
  'production launch must not silently use a cwd-relative file',
);
assert.throws(
  () => resolveProductionLaunchConfig({
    PORT: '18768', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: other,
  }),
  /does not match APPROVED_RL_WEIGHTS_FILE/,
  'production launch must reject a non-authoritative configured path',
);
assert.throws(
  () => resolveProductionLaunchConfig({
    PORT: '18769', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: weights,
  }),
  /PORT=18768/,
  'production launch must reject a non-canonical port',
);

const config = resolveProductionLaunchConfig({
  PORT: '18768', RL_WEIGHTS_FILE: weights, APPROVED_RL_WEIGHTS_FILE: weights,
});
assert.equal(config.port, '18768');
assert.equal(config.portWindow, '0');
assert.equal(config.weightsFile, fs.realpathSync.native(weights));
assert.equal(config.approvedWeightsFile, fs.realpathSync.native(weights));

console.log('Production launch gate regression passed');
