import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const generatedBrowserFiles = [
  'public/game/rule_engine.js',
  'public/game/strong_rule_ai.js',
  'public/game/recommendation_engine.js',
  'public/game/mcts_enhancement_engine.js',
];

function runGit(args) {
  return spawnSync('git', ['-c', `safe.directory=${process.cwd()}`, ...args], { cwd: process.cwd(), encoding: 'utf8' });
}

function restoreGeneratedBrowserBaseline() {
  const result = runGit(['restore', '--source=HEAD', '--worktree', '--', ...generatedBrowserFiles]);
  if (result.status !== 0) throw new Error(`Unable to restore generated browser artifact baseline: ${result.stderr || result.error?.message || 'unknown git error'}`);
}

const result = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});

if (result.status === 0) restoreGeneratedBrowserBaseline();
process.exit(result.status ?? 1);
