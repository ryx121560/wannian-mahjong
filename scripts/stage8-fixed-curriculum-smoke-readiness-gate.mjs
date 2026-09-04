import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const scripts = [
  'scripts/stage8-fixed-curriculum-smoke-regression.mjs',
  'scripts/stage8-offline-smoke-runner-regression.mjs',
  'scripts/stage8-offline-smoke-runtime-preflight-regression.mjs',
  'scripts/stage8-offline-selfplay-smoke-regression.mjs',
  'scripts/stage8-offline-trajectory-executor-regression.mjs',
  'scripts/stage8-v2-action-space-gate-regression.mjs',
  'scripts/stage8-v2-kong-execution-gate-regression.mjs',
];

for (const script of scripts) {
  try {
    await import(`${pathToFileURL(path.join(root, script)).href}?stage8-fixed-course-readiness=1`);
  } catch (error) {
    console.error(`stage8 fixed-curriculum Smoke readiness failed: ${script}`);
    throw error;
  }
}

const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined, config.error ? ts.flattenDiagnosticMessageText(config.error.messageText, '\n') : '');
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { noEmit: true, incremental: false }, configPath);
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences });
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));

const runnerRegression = fs.readFileSync(path.join(root, 'scripts/stage8-offline-smoke-runner-regression.mjs'), 'utf8');
assert.equal(/\bfakeGames\b/.test(runnerRegression), false, 'synthetic games cannot prove formal execution readiness');
assert.match(runnerRegression, /inMemoryTrueSourceGamesExecuted:\s*3/);
assert.match(runnerRegression, /formalSmokeGamesExecuted:\s*0/);
const productionRunner = fs.readFileSync(path.join(root, 'src/game/stage8/offline-smoke-runner.ts'), 'utf8');
assert.match(productionRunner, /createStage8FixedCurriculumWallRecipe/);
assert.match(productionRunner, /assembleStage8FormalSmokeBatchLedger/);
assert.match(productionRunner, /validateStage8FormalSmokeCapacity/);
assert.equal(fs.existsSync(path.join(root, 'tsconfig.tsbuildinfo')), false, 'readiness gate must not leave tsconfig.tsbuildinfo');

console.log(JSON.stringify({
  passed: true,
  scope: 'fixed-curriculum-smoke-readiness-only',
  formalSmokeGamesExecuted: 0,
  inMemoryTrueSourceGamesExecuted: 3,
  plannedGamesExecuted: 0,
  trainingStarted: false,
  selfplayRuntimeStarted: false,
  externalArtifactsWritten: 0,
  note: 'OS-temporary and in-memory regressions are not formal 1000-game Smoke evidence or run authorization.',
}, null, 2));
