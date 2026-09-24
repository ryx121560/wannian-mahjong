import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const scripts = [
  'scripts/stage8-fixed-curriculum-smoke-regression.mjs',
  'scripts/stage8-offline-selfplay-smoke-regression.mjs',
  'scripts/stage8-canonical-mcts-provider-regression.mjs',
  'scripts/stage8-frozen-model-inference-regression.mjs',
  'scripts/stage8-onnx-inference-adapter-regression.mjs',
  'scripts/stage8-offline-smoke-runtime-preflight-regression.mjs',
  'scripts/stage8-offline-smoke-runner-regression.mjs',
  'scripts/stage8-sample-replay-model-protocol-regression.mjs',
  'scripts/stage8-offline-trajectory-executor-regression.mjs',
  'scripts/stage8-v2-action-space-gate-regression.mjs',
  'scripts/stage8-v2-kong-execution-gate-regression.mjs',
];

for (const script of scripts) {
  try {
    await import(`${pathToFileURL(path.resolve(script)).href}?stage8-preflight=1`);
  } catch (error) {
    console.error(`stage8 offline selfplay preflight failed: ${script}`);
    throw error;
  }
}

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('stage8 offline selfplay preflight failed: tsconfig.json missing');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath), { noEmit: true, incremental: false }, configPath);
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: (file) => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' });
  throw new Error(`stage8 offline selfplay preflight typecheck failed\n${formatted}`);
}

console.log(JSON.stringify({ passed: true, formalSmokeGamesExecuted: 0, inMemoryTrueSourceGamesExecuted: 2, selfplayStarted: false, trainingStarted: false, artifactsWritten: false, note: 'This gate validates temporary-fixture and in-memory capability only and is not Smoke authorization.' }, null, 2));
