import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { browserArtifactBaselineDirectory, captureVerifiedFrozenGeneratedBaseline } from './assert-browser-build-artifacts-clean.mjs';

const run = (script) => {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Browser artifact preparation failed: ${script}`);
};

captureVerifiedFrozenGeneratedBaseline();
try {
  for (const script of [
    'scripts/build-browser-rule-engine.mjs',
    'scripts/build-browser-strong-rule-ai.mjs',
    'scripts/build-browser-recommendation-engine.mjs',
    'scripts/build-browser-mcts-enhancement-engine.mjs',
    'scripts/clean-next-cache.mjs',
  ]) run(script);
} catch (error) {
  fs.rmSync(browserArtifactBaselineDirectory(), { recursive: true, force: false, maxRetries: 2, retryDelay: 50 });
  throw error;
}
