import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const wrapper = fs.readFileSync(path.join(root, 'scripts', 'next-with-port.mjs'), 'utf8');
const buildScript = fs.readFileSync(path.join(root, 'scripts', 'build-production-game.mjs'), 'utf8');
const prebuildGuard = fs.readFileSync(path.join(root, 'scripts', 'assert-browser-build-artifacts-clean.mjs'), 'utf8');
const ruleEngineBuild = fs.readFileSync(path.join(root, 'scripts', 'build-browser-rule-engine.mjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const generatedBrowserFiles = [
  'public/game/rule_engine.js',
  'public/game/strong_rule_ai.js',
  'public/game/recommendation_engine.js',
  'public/game/mcts_enhancement_engine.js',
];

assert.equal(packageJson.scripts['test:stage1-runtime-hygiene'], 'node scripts/stage1-runtime-hygiene-regression.mjs');
assert.match(wrapper, /const loopbackHost = '127\.0\.0\.1';/);
assert.match(wrapper, /createRequire\(import\.meta\.url\)/);
assert.match(wrapper, /require\.resolve\('next\/dist\/bin\/next'\)/);
assert.match(wrapper, /HOSTNAME: loopbackHost/);
assert.match(wrapper, /'-H', loopbackHost/);
assert.doesNotMatch(wrapper, /npx\.cmd|next\.cmd/);
assert.doesNotMatch(wrapper, /canListen\(port, '::'\)|canListen\(port, '0\.0\.0\.0'\)/);
assert.match(prebuildGuard, /Generated browser artifacts must be clean before build/);
assert.match(prebuildGuard, /'-c', `safe\.directory=\$\{process\.cwd\(\)\}`/);
assert.match(prebuildGuard, /Verified intentional browser rule engine override before build/);
assert.match(prebuildGuard, /scripts\/build-browser-rule-engine\.mjs', '--check'/);
assert.match(ruleEngineBuild, /function normalizeLineEndings\(value\)/);
assert.match(ruleEngineBuild, /function outputLineEnding\(currentBundle\)/);
assert.match(ruleEngineBuild, /normalizeLineEndings\(currentBundle\) !== bundle/);
assert.match(ruleEngineBuild, /bundle\.replace\(\/\\n\/g, outputLineEnding\(currentBundle\)\)/);
assert.match(buildScript, /function hasVerifiedRuleEngineOverride\(\)/);
assert.match(buildScript, /preserveRuleEngineOverride/);
assert.match(buildScript, /file !== 'public\/game\/rule_engine\.js'/);
assert.match(buildScript, /'-c', `safe\.directory=\$\{process\.cwd\(\)\}`/);
for (const file of generatedBrowserFiles) assert.match(buildScript, new RegExp(file.replaceAll('.', '\\.')));

console.log('Stage 1 runtime hygiene regression: passed');
