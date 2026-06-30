import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/recommendation/recommendation-engine.ts');
const casesPath = path.join(root, 'docs/stage4-recommendation-cases.json');
const tempPath = path.join(root, '.tmp-recommendation-engine.cjs');

if (!fs.existsSync(casesPath)) {
  throw new Error('docs/stage4-recommendation-cases.json missing. Run npm run generate:recommendation first.');
}

const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true, esModuleInterop: true },
  fileName: sourcePath,
}).outputText;
fs.writeFileSync(tempPath, compiled, 'utf8');
const require = createRequire(import.meta.url);
const engine = require(tempPath);

const raw = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const forbidden = ['speedScore', 'handValueScore', 'waitQualityScore', 'defenseScore', 'totalScore', 'structurePenalty'];
const failures = [];

for (const item of raw.cases) {
  const panel = engine.buildPanel(item.context);
  const html = engine.buildPanelHtml(item.context);
  if (panel.sections.length !== item.expected.sections) failures.push(`${item.id}: section count ${panel.sections.length}`);
  for (const keyword of item.expected.keywords || []) {
    if (!html.includes(keyword)) failures.push(`${item.id}: missing keyword ${keyword}`);
  }
  if (item.expected.noRawFields) {
    for (const field of forbidden) {
      if (html.includes(field)) failures.push(`${item.id}: leaked raw field ${field}`);
    }
  }
  if (item.expected.publicOnly && /暗手|AI手牌|隐藏手牌/.test(html)) failures.push(`${item.id}: public-only wording violation`);
  if (item.expected.stableSystemTile) {
    const changed = { ...item.context, selectedTile: item.context.selectedTile === 'wan3' ? 'tong3' : 'wan3' };
    const changedPanel = engine.buildPanel(changed);
    if (panel.systemTile !== changedPanel.systemTile) failures.push(`${item.id}: system recommendation changed after click`);
  }
}

try { fs.unlinkSync(tempPath); } catch {}

const pass = raw.cases.length - failures.length;
const rate = raw.cases.length ? pass / raw.cases.length : 0;
console.log(JSON.stringify({ total: raw.cases.length, pass, fail: failures.length, passRate: Number((rate * 100).toFixed(2)), failures: failures.slice(0, 20) }, null, 2));
if (rate < 0.85 || failures.length > 0) process.exit(1);
