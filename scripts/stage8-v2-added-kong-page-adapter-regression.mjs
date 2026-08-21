import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(process.cwd(), 'public/game/wannian-mahjong.html'), 'utf8');

function body(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  let depth = 0;
  for (let index = html.indexOf('{', start); index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}' && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

assert.match(body('resolvePageAddedKongDraw'), /RULE_ENGINE\.resolveAddedKongDraw\(/);
assert.match(body('applyPageAddedKongDraw'), /const replay=resolvePageAddedKongDraw\(/);
assert.match(body('applyPageAddedKongDraw'), /samePageAddedKongResolution\(replay,result\)/);
assert.match(body('applyPageAddedKongDraw'), /validPageAddedKongSettlement\(p,result\)/);
assert.doesNotMatch(body('applyPageAddedKongDraw'), /applyWin\(/);
const selfKong = body('doSelfKong');
assert.match(selfKong, /const result=resolvePageAddedKongDraw\(p,info\)/);
assert.match(selfKong, /return applyPageAddedKongDraw\(p,info,result\)/);
console.log('added-kong page bridge regression: passed');
