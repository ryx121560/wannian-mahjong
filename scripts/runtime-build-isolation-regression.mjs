import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildScript = fs.readFileSync(path.join(root, 'scripts', 'build-production-game.mjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(packageJson.scripts.build, 'node scripts/build-production-game.mjs');
assert.match(buildScript, /require\.resolve\('next\/dist\/bin\/next'\)/);
assert.match(buildScript, /cwd: process\.cwd\(\)/);
assert.doesNotMatch(buildScript, /C:\\Users\\Administrator\\Documents\\NEW/);
console.log('Runtime build isolation regression: passed');
