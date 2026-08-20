import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wannian-approved-deployment-paths-'));
const require = createRequire(import.meta.url);

function loadModule(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const compiledPath = path.join(tempDir, `${path.basename(relativePath, '.ts')}-${Math.random().toString(16).slice(2)}.cjs`);
  const source = fs.readFileSync(sourcePath, 'utf8');
  fs.writeFileSync(compiledPath, ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, 'utf8');
  return require(compiledPath);
}

try {
  const { resolveRlWeightsFile, requireExistingRlWeightsFile } = loadModule('src/lib/rl-weights-file.ts');
  const { resolveGameExportDirectory } = loadModule('src/lib/game-record-export.ts');
  const weights = path.join(tempDir, 'rl_weights.json');
  const exportsDir = path.join(tempDir, 'exports');
  const otherExportsDir = path.join(tempDir, 'other-exports');
  fs.writeFileSync(weights, '{}', 'utf8');
  fs.mkdirSync(exportsDir);
  fs.mkdirSync(otherExportsDir);

  assert.equal(resolveRlWeightsFile({ APPROVED_RL_WEIGHTS_FILE: weights }), fs.realpathSync.native(weights));
  assert.equal(requireExistingRlWeightsFile({ APPROVED_RL_WEIGHTS_FILE: weights }), fs.realpathSync.native(weights));
  assert.equal(resolveGameExportDirectory({ APPROVED_GAME_EXPORT_DIR: exportsDir }), fs.realpathSync.native(exportsDir));

  assert.throws(() => resolveRlWeightsFile({}), /APPROVED_RL_WEIGHTS_FILE is required/);
  assert.throws(() => resolveRlWeightsFile({ APPROVED_RL_WEIGHTS_FILE: 'rl_weights.json' }), /must be an absolute path/);
  assert.throws(() => requireExistingRlWeightsFile({ APPROVED_RL_WEIGHTS_FILE: path.join(tempDir, 'missing.json') }), /does not exist/);
  assert.throws(() => resolveRlWeightsFile({ APPROVED_RL_WEIGHTS_FILE: weights, RL_WEIGHTS_FILE: path.join(tempDir, 'other.json') }), /does not match APPROVED_RL_WEIGHTS_FILE/);

  assert.throws(() => resolveGameExportDirectory({}), /APPROVED_GAME_EXPORT_DIR is required/);
  assert.throws(() => resolveGameExportDirectory({ APPROVED_GAME_EXPORT_DIR: 'exports' }), /must be an absolute path/);
  assert.throws(() => resolveGameExportDirectory({ APPROVED_GAME_EXPORT_DIR: path.join(tempDir, 'missing') }), /existing directory/);
  assert.throws(() => resolveGameExportDirectory({ APPROVED_GAME_EXPORT_DIR: exportsDir, GAME_EXPORT_DIR: otherExportsDir }), /does not match APPROVED_GAME_EXPORT_DIR/);

  for (const route of ['load_rl', 'save_rl', 'save_rl_full']) {
    const routeSource = fs.readFileSync(path.join(root, 'src/app/api/rl', route, 'route.ts'), 'utf8');
    assert.match(routeSource, /requireExistingRlWeightsFile/, `${route} must require an existing approved weights file`);
    assert.doesNotMatch(routeSource, /process\.cwd\(/, `${route} must not fall back to cwd`);
  }
  console.log('Approved deployment paths regression: passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
