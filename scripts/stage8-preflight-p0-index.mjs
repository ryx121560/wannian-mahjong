import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'docs/stage8-preflight-p0-regression-index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(index.schemaVersion, 1, 'unsupported P0 regression index schema');
assert.ok(Array.isArray(index.entries) && index.entries.length >= 8, 'P0 regression index must include the audited minimum set');
for (const entry of index.entries) {
  assert.equal(typeof entry.id, 'string', 'each P0 index entry needs an id');
  assert.equal(typeof entry.scope, 'string', `${entry.id}: missing scope`);
  assert.ok(Array.isArray(entry.scripts) && entry.scripts.length > 0, `${entry.id}: missing scripts`);
  for (const scriptName of entry.scripts) {
    const command = packageJson.scripts[scriptName];
    assert.equal(typeof command, 'string', `${entry.id}: package script ${scriptName} is missing`);
    const match = command.match(/node\s+(scripts\/[\w.-]+\.mjs)/);
    assert.ok(match, `${entry.id}: ${scriptName} must point to a deterministic node regression`);
    assert.ok(fs.existsSync(path.join(root, match[1])), `${entry.id}: indexed script ${match[1]} is missing`);
  }
}
console.log(`stage8 preflight P0 index: passed (${index.entries.length} entries)`);
