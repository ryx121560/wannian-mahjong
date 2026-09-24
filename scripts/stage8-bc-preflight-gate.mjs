import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const expectedProjectFiles = [
  'package.json',
  'src/game/stage8/offline-bc-control.ts',
  'src/game/stage8/offline-bc-teacher.ts',
  'src/game/stage8/offline-bc-sample-protocol.ts',
  'src/game/stage8/offline-canonical-mcts-provider.ts',
  'scripts/stage8-bc-teacher-regression.mjs',
  'scripts/stage8-bc-sample-protocol-regression.mjs',
  'scripts/stage8-bc-preflight-gate.mjs',
  'docs/stage8-bc-teacher-sample-protocol-candidate-report-2026-08-27.md',
];

await import(pathToFileURL(path.join(root, 'scripts/stage8-bc-teacher-regression.mjs')).href);
await import(pathToFileURL(path.join(root, 'scripts/stage8-bc-sample-protocol-regression.mjs')).href);
const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined, config.error ? ts.flattenDiagnosticMessageText(config.error.messageText, '\n') : '');
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { noEmit: true, incremental: false }, configPath);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));

const prohibitedSource = /aiChooseDiscard|aiRespond|createStage8CanonicalMctsProvider|executeStage8FrozenModelInference|child_process|writeFile|mkdir|STAGE8_ARTIFACT_ROOT/;
for (const relative of ['src/game/stage8/offline-bc-control.ts','src/game/stage8/offline-bc-teacher.ts','src/game/stage8/offline-bc-sample-protocol.ts']) {
  assert.equal(prohibitedSource.test(fs.readFileSync(path.join(root, relative), 'utf8')), false, `${relative} must remain pure and model-free`);
}
for (const relative of expectedProjectFiles.slice(1, -1)) assert.equal(fs.existsSync(path.join(root, relative)), true, `${relative} missing`);
assert.equal(fs.existsSync(path.join(root, 'tsconfig.tsbuildinfo')), false, 'typecheck must not leave tsconfig.tsbuildinfo');
console.log(JSON.stringify({ passed: true, scopeFiles: expectedProjectFiles.length,
  formalBcSamplesGenerated: 0, pythonProcessesStarted: 0, trainingStarted: false, modelsCreated: 0,
  onnxExportsCreated: 0, artifactWrites: 0, smokeGamesExecuted: 0, serviceStarted: false }, null, 2));
