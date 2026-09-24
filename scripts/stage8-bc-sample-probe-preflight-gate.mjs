import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const before = {
  eRootExists: fs.existsSync('E:\\WannianMahjongStage8\\artifacts\\bc-sample-probe'),
  tsbuildinfoExists: fs.existsSync(path.join(root, 'tsconfig.tsbuildinfo')),
};

await import('./stage8-bc-sample-probe-runner-regression.mjs');
await import('./stage8-bc-sample-probe-cli-regression.mjs');
await import('./stage8-bc-sample-writer-regression.mjs');

const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
assert.ok(configPath, 'tsconfig.json must exist');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configFile.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root, { noEmit: true, incremental: false });
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));

assert.equal(fs.existsSync('E:\\WannianMahjongStage8\\artifacts\\bc-sample-probe'), before.eRootExists, 'gate must not create or modify an E-drive probe root');
assert.equal(fs.existsSync(path.join(root, 'tsconfig.tsbuildinfo')), before.tsbuildinfoExists, 'gate must not create tsbuildinfo');
console.log(JSON.stringify({
  passed: true,
  controls: ['cold-teacher-cache-domain','byte-identical-trace-sample-shard-replay','four-136-tile-games','all-seat-decisions','batch-atomic-quarantine','capacity-before-run-and-each-batch','node-readback','python-stdlib-readback'],
  candidateFixtureGames: 4,
  formalSamplesWritten: 0,
  eDriveWrites: 0,
  formalSmokeGamesExecuted: 0,
  trainingStarted: false,
  modelLoaded: false,
  serviceStarted: false,
}, null, 2));
