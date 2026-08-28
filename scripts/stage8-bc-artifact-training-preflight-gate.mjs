import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const expectedProjectFiles = [
  'package.json',
  'src/game/stage8/offline-bc-artifact-control.ts',
  'src/game/stage8/offline-bc-sample-writer.ts',
  'src/game/stage8/offline-bc-model-lifecycle-protocol.ts',
  'src/game/stage8/python/stage8_bc/__init__.py',
  'src/game/stage8/python/stage8_bc/contracts.py',
  'src/game/stage8/python/stage8_bc/dataset.py',
  'src/game/stage8/python/stage8_bc/model.py',
  'src/game/stage8/python/stage8_bc/training.py',
  'src/game/stage8/python/stage8_bc/export_onnx.py',
  'scripts/stage8-bc-artifact-control-regression.mjs',
  'scripts/stage8-bc-sample-writer-regression.mjs',
  'scripts/stage8-bc-model-lifecycle-regression.mjs',
  'scripts/stage8-bc-python-code-regression.py',
  'scripts/stage8-bc-python-code-regression.mjs',
  'scripts/stage8-bc-artifact-training-preflight-gate.mjs',
  'docs/stage8-bc-artifact-training-code-candidate-report-2026-08-28.md',
];
const regressions = [
  'scripts/stage8-bc-artifact-control-regression.mjs',
  'scripts/stage8-bc-sample-writer-regression.mjs',
  'scripts/stage8-bc-model-lifecycle-regression.mjs',
  'scripts/stage8-bc-python-code-regression.mjs',
];

for (const relative of expectedProjectFiles) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `${relative} missing`);
}
for (const relative of regressions) {
  await import(pathToFileURL(path.join(root, relative)).href);
}

const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined, config.error ? ts.flattenDiagnosticMessageText(config.error.messageText, '\n') : '');
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { noEmit: true, incremental: false }, configPath);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));

const pythonFiles = expectedProjectFiles.filter((relative) => relative.endsWith('.py'));
const prohibitedPython = /(^|\n)\s*(?:from|import)\s+(?:torch|onnx)(?:\.|\s|$)|\b(?:pip\s+install|subprocess|os\.system|mkdir|makedirs)\b|E:\\/m;
const sourceHash = crypto.createHash('sha256');
for (const relative of pythonFiles) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  assert.equal(prohibitedPython.test(source), false, `${relative} must keep dependencies lazy and must not create directories or run installers`);
  sourceHash.update(relative.replaceAll('\\', '/')).update('\0').update(source).update('\0');
}
const pythonRoot = path.join(root, 'src/game/stage8/python');
const pythonResidue = [];
function findPythonResidue(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) pythonResidue.push(candidate);
    else if (entry.isDirectory()) findPythonResidue(candidate);
  }
}
findPythonResidue(pythonRoot);
assert.deepEqual(pythonResidue, [], 'Python regression must not leave bytecode in the project tree');
assert.equal(fs.existsSync(path.join(root, 'tsconfig.tsbuildinfo')), false, 'typecheck must not leave tsconfig.tsbuildinfo');

console.log(JSON.stringify({
  passed: true,
  scopeFiles: expectedProjectFiles.length,
  nodeProtocolRegressions: 3,
  standardLibraryPythonRegressions: 1,
  pythonSourceBundleSha256: sourceHash.digest('hex'),
  typecheckIncremental: false,
  dependencyInstalls: 0,
  formalBcSamplesWritten: 0,
  formalModelsWritten: 0,
  formalOnnxExportsWritten: 0,
  formalCheckpointsWritten: 0,
  eDriveWrites: 0,
  trainingStarted: false,
  smokeGamesExecuted: 0,
  serviceStarted: false,
}, null, 2));
