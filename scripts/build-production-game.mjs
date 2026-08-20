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

function hasVerifiedRuleEngineOverride() {
  const status = runGit(['status', '--porcelain', '--', 'public/game/rule_engine.js']);
  if (status.status !== 0) throw new Error(`Unable to inspect browser rule engine override: ${status.stderr || status.error?.message || 'unknown git error'}`);
  if (!status.stdout.trim()) return false;
  const verification = spawnSync(process.execPath, ['scripts/build-browser-rule-engine.mjs', '--check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (verification.status !== 0) throw new Error(`Browser rule engine override is not reproducible: ${verification.stderr || verification.error?.message || 'unknown verification error'}`);
  return true;
}

function restoreGeneratedBrowserBaseline(preserveRuleEngineOverride) {
  const files = preserveRuleEngineOverride
    ? generatedBrowserFiles.filter((file) => file !== 'public/game/rule_engine.js')
    : generatedBrowserFiles;
  const result = runGit(['restore', '--source=HEAD', '--worktree', '--', ...files]);
  if (result.status !== 0) throw new Error(`Unable to restore generated browser artifact baseline: ${result.stderr || result.error?.message || 'unknown git error'}`);
}

const preserveRuleEngineOverride = hasVerifiedRuleEngineOverride();
const result = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});

if (result.status === 0) restoreGeneratedBrowserBaseline(preserveRuleEngineOverride);
process.exit(result.status ?? 1);
