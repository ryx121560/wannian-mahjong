import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'lib', 'rl-weights-file.ts');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wannian-rl-weights-path-'));
const compiledPath = path.join(tempDir, 'rl-weights-file.cjs');

if (!fs.existsSync(sourcePath)) {
  throw new Error('Missing explicit RL weights path module: src/lib/rl-weights-file.ts');
}

const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
fs.writeFileSync(compiledPath, compiled, 'utf8');

const require = createRequire(import.meta.url);
const { resolveRlWeightsFile } = require(compiledPath);
const tempWeights = path.join(tempDir, 'weights.json');
fs.writeFileSync(tempWeights, '{"scores":[1,2,3,4]}', 'utf8');
const otherWeights = path.join(tempDir, 'other.json');
fs.writeFileSync(otherWeights, '{}', 'utf8');

assert.throws(
  () => resolveRlWeightsFile({}),
  /APPROVED_RL_WEIGHTS_FILE is required/,
  'missing configured path must fail instead of using process.cwd()',
);

assert.throws(
  () => resolveRlWeightsFile({ APPROVED_RL_WEIGHTS_FILE: 'rl_weights.json' }),
  /must be an absolute path/,
  'relative approved path must fail',
);

assert.throws(
  () => resolveRlWeightsFile({
    RL_WEIGHTS_FILE: otherWeights,
    APPROVED_RL_WEIGHTS_FILE: tempWeights,
  }),
  /does not match APPROVED_RL_WEIGHTS_FILE/,
  'production-approved path mismatch must fail',
);

const resolved = resolveRlWeightsFile({
  APPROVED_RL_WEIGHTS_FILE: tempWeights,
});
assert.equal(resolved, fs.realpathSync.native(tempWeights), 'configured path must resolve independently from cwd');

console.log('RL weights explicit path regression passed');
