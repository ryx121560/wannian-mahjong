import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const frozenGeneratedBaselines = {
  'public/game/strong_rule_ai.js': '35c1bcece0bb579687bf91056bd541dcc283a79879bd580aa1044ad729864b01',
  'public/game/recommendation_engine.js': 'ddc570b481d53e226e3405a54340a08ecf1b4ac09ef0c74e4de5618992975fc9',
  'public/game/mcts_enhancement_engine.js': '126ee7a472f5c7cfb8b37a8bcf7e91be29fa0f46acba028c64a3aaffcd3d58f5',
};
export const browserArtifactBaselineDirectory = () => path.join(
  os.tmpdir(),
  `wannian-mahjong-browser-artifacts-${crypto.createHash('sha256').update(fs.realpathSync(process.cwd())).digest('hex')}`,
);

export const verifyFrozenGeneratedBaselines = (bytesByFile) => {
  const bytes = new Map();
  for (const [file, expected] of Object.entries(frozenGeneratedBaselines)) {
    const content = bytesByFile?.get(file) ?? fs.readFileSync(file);
    const actual = crypto.createHash('sha256').update(content).digest('hex');
  if (actual !== expected) throw new Error(`Generated browser artifact baseline mismatch: ${file}`);
    bytes.set(file, content);
  }
  return bytes;
};

export const captureVerifiedFrozenGeneratedBaseline = () => {
  const baselineBytes = verifyFrozenGeneratedBaselines();
  const directory = browserArtifactBaselineDirectory();
  if (fs.existsSync(directory)) throw new Error(`Refusing to overwrite pending browser artifact baseline: ${directory}`);
  fs.mkdirSync(directory, { recursive: true });
  for (const [file, content] of baselineBytes) fs.writeFileSync(path.join(directory, path.basename(file)), content, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
    cwd: fs.realpathSync(process.cwd()),
    files: Object.fromEntries(Object.entries(frozenGeneratedBaselines)),
  }), { flag: 'wx' });
  console.log(`Captured verified frozen browser artifact bytes before build: ${directory}`);
  return directory;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--capture-baseline')) captureVerifiedFrozenGeneratedBaseline();
  else verifyFrozenGeneratedBaselines();
  console.log('Verified frozen non-rule generated browser artifact identities before build');
  console.log('Generated browser artifact content identities verified before build');
}
