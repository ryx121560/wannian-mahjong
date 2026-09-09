import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const python = process.env.STAGE8_PYTHON;
if (!python || !path.win32.isAbsolute(python)) {
  console.error('[stage8-bc-corpus-preflight] STAGE8_PYTHON absolute path required');
  process.exit(1);
}

const commands = [
  ['node-corpus', process.execPath, ['scripts/stage8-bc-corpus-regression.mjs']],
  ['python-corpus', python, ['scripts/stage8-bc-corpus-verify.py', '--self-test']],
  ['artifact-control', process.execPath, ['scripts/stage8-bc-artifact-control-regression.mjs']],
  ['sample-writer', process.execPath, ['scripts/stage8-bc-sample-writer-regression.mjs']],
  ['model-lifecycle', process.execPath, ['scripts/stage8-bc-model-lifecycle-regression.mjs']],
  ['python-code', process.execPath, ['scripts/stage8-bc-python-code-regression.mjs']],
  ['typescript', process.execPath, ['node_modules/typescript/lib/tsc.js', '--noEmit', '--incremental', 'false']],
];
for (const [label, command, args] of commands) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`[stage8-bc-corpus-preflight] ${label} failed with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
console.log(JSON.stringify({
  passed: true, pilotGamesExecuted: 0, trainingStarted: false, artifactsWritten: false,
  scope: 'formal-corpus-admission-and-split-protocol-only',
}));
