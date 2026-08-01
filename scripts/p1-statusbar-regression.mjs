import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production function ${name}`);
  let depth = 0;
  for (let index = html.indexOf('{', start); index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}' && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`unterminated production function ${name}`);
}

function functionBody(name) {
  return extractFunction(name).replace(/^[^{]*\{/, '').replace(/\}\s*$/, '');
}

assert.match(html, /<div id="bar"[^>]*>[^<]+<\/div>/, 'the long status bar must have a non-empty idle message');
assert.doesNotMatch(html, /id="scorebar"|#scorebar|updateScorebar|_spUpdateScore|_spInitScore/, 'the short four-player score bar must be removed from every page path');
assert.doesNotMatch(html, /id="msg"|#msg/, 'the page must not retain a second status or settlement bar');
assert.match(html, /#bar\{[^}]*position:fixed[^}]*top:[^;}]+[^}]*left:50%[^}]*transform:translateX\(-50%\)[^}]*max-height:\d+px[^}]*overflow-y:auto[^}]*pointer-events:none/s, 'the long bar must be fixed at the top center, bounded, and never intercept input');
assert.match(html, /#bar\{[^}]*max-width:calc\(100vw - \d+px\)/s, 'the long bar must constrain desktop and mobile width');
assert.match(html, /@media\s*\(max-width:600px\)\{[^}]*#bar\{/s, 'the long bar needs a small-screen rule');
assert.match(html, /canvas\{[^}]*margin:100px auto 0[^}]*\}/, 'the board must retain a top reserve below the fixed status bar');
assert.match(html, /#suggest\{[^}]*top:100px[^}]*\}/, 'the recommendation panel must start below the fixed status bar');

for (const [width, height] of [[1366, 768], [1920, 1080], [320, 568], [375, 667], [390, 844]]) {
  const compact = width <= 600;
  const top = compact ? 8 : 14;
  const horizontalInset = compact ? 16 : 24;
  const statusBottom = top + 76;
  assert.ok(width - horizontalInset > 0, `status bar must fit within ${width}x${height}`);
  assert.ok(statusBottom < 100, `status bar must clear the recommendation panel in ${width}x${height}`);
  assert.ok(statusBottom < height - 200, `status bar must clear the bottom controls in ${width}x${height}`);
}

const statusContext = {
  document: {
    bar: { textContent: '' },
    getElementById(id) {
      assert.equal(id, 'bar', 'setMsg must only write the long status bar');
      return this.bar;
    },
  },
};
vm.createContext(statusContext);
vm.runInContext(extractFunction('setMsg'), statusContext, { filename: 'setMsg.js' });
for (const value of ['', '   ', null, undefined, '等待响应']) {
  statusContext.setMsg(value);
  assert.notEqual(statusContext.document.bar.textContent.trim(), '', `status bar must stay non-empty for ${String(value)}`);
}

for (const name of ['enterIdleState', 'restoredPhaseMessage', 'newGame', 'drawGame', 'completePageKongSettlement', 'applyWin', 'startSelfPlayGame']) {
  assert.match(functionBody(name), /setMsg\(|showWinDlg\(/, `${name} must preserve a non-empty status or settlement message`);
}

assert.doesNotMatch(html, /id="sp-score"|id="sp-scorebar"/, 'self-play status must not render a second score display');
assert.match(html, /id="sp-status"[\s\S]*id="sp-info"/, 'self-play status must retain run state');

console.log('p1 statusbar regression passed');
