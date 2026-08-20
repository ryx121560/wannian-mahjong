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
const dirtyPaths = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim());
const intentionalRuleEngineOverride = dirtyPaths.length === 1 && dirtyPaths[0] === 'public/game/rule_engine.js';
if (dirtyPaths.length && !intentionalRuleEngineOverride) throw new Error('Generated browser artifacts must be clean before build');
if (intentionalRuleEngineOverride) {
  const verification = spawnSync(process.execPath, ['scripts/build-browser-rule-engine.mjs', '--check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (verification.status !== 0) throw new Error(`Intentional browser rule engine override is not reproducible: ${verification.stderr || verification.error?.message || 'unknown verification error'}`);
  console.log('Verified intentional browser rule engine override before build');
}

console.log('Generated browser artifacts are clean before build');
