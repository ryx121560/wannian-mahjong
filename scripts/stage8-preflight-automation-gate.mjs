import { spawnSync } from 'node:child_process';
import path from 'node:path';

const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
const npmInvocation = (args) => process.platform === 'win32' ? [process.execPath, [npmCli, ...args]] : ['npm', args];
const npxInvocation = (args) => process.platform === 'win32' ? [process.execPath, [npxCli, ...args]] : ['npx', args];

const commands = [
  ['core-rules', ...npmInvocation(['run', 'test:rules'])],
  ['p0-index', ...npmInvocation(['run', 'test:stage8-preflight-p0-index'])],
  ['rule-state-machine', ...npmInvocation(['run', 'test:stage8-preflight-rule-state-machine'])],
  ['response-page', ...npmInvocation(['run', 'test:response-phase'])],
  ['response-restore', ...npmInvocation(['run', 'test:response-restore-revalidation'])],
  ['kong-page', ...npmInvocation(['run', 'test:p0-kong-page-persistence'])],
  ['ended-buttons', ...npmInvocation(['run', 'test:p1-ended-action-buttons'])],
  ['supplement-owner', ...npmInvocation(['run', 'test:p1-kong-settlement-draw'])],
  ['ai-drawn-tile', ...npmInvocation(['run', 'test:p0-live-drawn-tile-face'])],
  ['p0-atomic-kong', ...npmInvocation(['run', 'test:p0-ai-self-kong-atomicity'])],
  ['p0-direct-chisel', ...npmInvocation(['run', 'test:p0-direct-chisel-settlement'])],
  ['p0-post-pong-routing', ...npmInvocation(['run', 'test:p0-post-pong-kong-reachability'])],
  ['p0-added-kong-browser-parity', ...npmInvocation(['run', 'test:p0-added-kong-wildcard-browser-parity'])],
  ['stage8-action-space', ...npmInvocation(['run', 'test:stage8-v2-action-space'])],
  ['stage8-kong-execution', ...npmInvocation(['run', 'test:stage8-v2-kong-execution'])],
  ['browser-rule-check', process.execPath, ['scripts/build-browser-rule-engine.mjs', '--check']],
  ['tsc', ...npxInvocation(['tsc', '--noEmit', '--incremental', 'false'])],
  ['build', ...npmInvocation(['run', 'build'])],
  ['diff-check', 'git', ['diff', '--check']],
];

for (const [id, command, args] of commands) {
  console.log(`\n[stage8-preflight] START ${id}`);
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[stage8-preflight] FAIL ${id}; reproduce with: ${command} ${args.join(' ')}`);
    process.exit(result.status || 1);
  }
  console.log(`[stage8-preflight] PASS ${id}`);
}
const expectedStatus = new Set([
  ' M package.json',
  ' M scripts/p1-ended-action-buttons-regression.mjs',
  '?? docs/stage8-preflight-automation-gates-candidate-report-2026-08-24.md',
  '?? docs/stage8-preflight-p0-regression-index.json',
  '?? scripts/stage8-preflight-automation-gate.mjs',
  '?? scripts/stage8-preflight-p0-index.mjs',
  '?? scripts/stage8-preflight-rule-state-machine.mjs',
]);
const hygiene = spawnSync('git', ['-c', `safe.directory=${process.cwd()}`, 'status', '--porcelain'], { cwd: process.cwd(), encoding: 'utf8' });
if (hygiene.status !== 0) throw new Error(`stage8-preflight hygiene could not inspect git status: ${hygiene.stderr || hygiene.stdout || hygiene.error}`);
const unexpectedStatus = hygiene.stdout.split(/\r?\n/).filter(Boolean).filter((line) => !expectedStatus.has(line));
if (unexpectedStatus.length) throw new Error(`stage8-preflight hygiene found unexpected candidate artifacts: ${unexpectedStatus.join(' | ')}`);
console.log('[stage8-preflight] PASS candidate hygiene (exact 7 declared files)');
console.log(`\n[stage8-preflight] PASS ${commands.length} deterministic gates; this is not training authorization.`);
