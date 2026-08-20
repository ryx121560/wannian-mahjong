import { spawnSync } from 'node:child_process';

const generatedBrowserFiles = [
  'public/game/rule_engine.js',
  'public/game/strong_rule_ai.js',
  'public/game/recommendation_engine.js',
  'public/game/mcts_enhancement_engine.js',
];

const result = spawnSync('git', ['-c', `safe.directory=${process.cwd()}`, 'status', '--porcelain', '--', ...generatedBrowserFiles], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

if (result.status !== 0) throw new Error(`Unable to inspect generated browser artifacts: ${result.stderr || result.error?.message || 'unknown git error'}`);
if (result.stdout.trim()) throw new Error('Generated browser artifacts must be clean before build');

console.log('Generated browser artifacts are clean before build');
