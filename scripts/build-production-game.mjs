import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { browserArtifactBaselineDirectory, frozenGeneratedBaselines, verifyFrozenGeneratedBaselines } from './assert-browser-build-artifacts-clean.mjs';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
function loadCapturedGeneratedBaselineBytes() {
  const directory = browserArtifactBaselineDirectory();
  const manifestPath = path.join(directory, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing verified browser artifact baseline: ${directory}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.cwd !== fs.realpathSync(process.cwd()) || JSON.stringify(manifest.files) !== JSON.stringify(frozenGeneratedBaselines)) {
    throw new Error('Verified browser artifact baseline manifest does not match this build');
  }
  const bytes = new Map();
  for (const [file, expected] of Object.entries(frozenGeneratedBaselines)) {
    const content = fs.readFileSync(path.join(directory, path.basename(file))); const actual = crypto.createHash('sha256').update(content).digest('hex');
    if (actual !== expected) throw new Error(`Generated browser artifact baseline mismatch: ${file}`);
    bytes.set(file, content);
  }
  return { bytes, directory };
}
const { bytes: baselineBytes, directory: baselineDirectory } = loadCapturedGeneratedBaselineBytes();
let exitCode = 1;
try {
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  });
  if (result.status !== 0) exitCode = result.status ?? 1;
  else exitCode = 0;
} finally {
  try {
    for (const [file, content] of baselineBytes) fs.writeFileSync(file, content, { flag: 'w' });
    verifyFrozenGeneratedBaselines(baselineBytes);
  } finally {
    fs.rmSync(baselineDirectory, { recursive: true, force: false, maxRetries: 2, retryDelay: 50 });
  }
}
process.exit(exitCode);
