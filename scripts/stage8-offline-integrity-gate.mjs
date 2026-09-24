import { spawnSync } from 'node:child_process';
import path from 'node:path';

const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const run = (script) => {
  const result = spawnSync(process.execPath, [npmCli, 'run', script], { cwd: process.cwd(), stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`stage8 offline integrity failed: ${script}`);
};
for (const script of ['test:stage8-offline-round-integrity', 'test:stage8-artifact-root-preflight', 'test:stage8-v2-action-space', 'test:stage8-v2-kong-execution']) run(script);
run('build');
const ruleEngineCheck = spawnSync(process.execPath, ['scripts/build-browser-rule-engine.mjs', '--check'], { cwd: process.cwd(), stdio: 'inherit' });
if (ruleEngineCheck.status !== 0) throw new Error('stage8 offline integrity failed: browser rule-engine check after build');
const frozenArtifactsCheck = spawnSync(process.execPath, ['scripts/assert-browser-build-artifacts-clean.mjs'], { cwd: process.cwd(), stdio: 'inherit' });
if (frozenArtifactsCheck.status !== 0) throw new Error('stage8 offline integrity failed: frozen browser artifact identity after build');
console.log('stage8 offline integrity gate: passed; build, rule-engine parity, and frozen artifact identity were verified as outer gates. This is not training authorization.');
