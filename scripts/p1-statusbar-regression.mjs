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

assert.match(html, /<div id="bar"[^>]*>[^<]+<\/div>/, 'the long score bar must have non-empty fallback content');
assert.doesNotMatch(html, /id="scorebar"|#scorebar|updateScorebar|_spUpdateScore|_spInitScore/, 'the short four-player score bar must be removed from every page path');
assert.doesNotMatch(html, /id="msg"|#msg/, 'the page must not retain a second status or settlement bar');
assert.match(html, /#bar\{[^}]*position:fixed[^}]*top:[^;}]+[^}]*left:50%[^}]*transform:translateX\(-50%\)[^}]*box-sizing:border-box[^}]*width:min\([^}]*pointer-events:none/s, 'the long score bar must use border-box sizing, stay fixed at the top center, and never intercept input');
assert.match(html, /#bar\{[^}]*max-width:calc\(100vw - \d+px\)/s, 'the long bar must constrain desktop and mobile width');
assert.match(html, /@media\s*\(max-width:600px\)\{[^}]*#bar\{/s, 'the long bar needs a small-screen rule');
assert.match(html, /canvas\{[^}]*margin:100px auto 0[^}]*\}/, 'the board must retain a top reserve below the fixed status bar');
assert.match(html, /#suggest\{[^}]*top:100px[^}]*\}/, 'the recommendation panel must start below the fixed status bar');

for (const [width, height] of [[1366, 768], [1920, 1080], [320, 568], [375, 667], [390, 844]]) {
  const compact = width <= 600;
  const top = compact ? 8 : 14;
  const horizontalInset = compact ? 16 : 24;
  const outerWidth = Math.min(520, width - horizontalInset);
  const statusBottom = top + 76;
  assert.ok(outerWidth <= width - horizontalInset, `status bar outer box must fit within ${width}x${height}`);
  assert.ok(statusBottom < 100, `status bar must clear the recommendation panel in ${width}x${height}`);
  assert.ok(statusBottom < height - 200, `status bar must clear the bottom controls in ${width}x${height}`);
}

assert.match(html, /function updateTopScoreBar\(\)/, 'the top bar needs an explicit four-player score renderer');
assert.doesNotMatch(extractFunction('setMsg'), /getElementById\('bar'\)|textContent/, 'status updates must never overwrite visible scores');

const scoreContext = {
  document: {
    bar: { textContent: '' },
    getElementById(id) {
      assert.equal(id, 'bar', 'score renderer must only write the top score bar');
      return this.bar;
    },
  },
  GS: {
    players: [
      { name: '你', score: 101 },
      { name: 'AI下家', score: 99 },
      { name: 'AI对家', score: 98 },
      { name: 'AI上家', score: 102 },
    ],
  },
};
vm.createContext(scoreContext);
vm.runInContext(extractFunction('updateTopScoreBar'), scoreContext, { filename: 'updateTopScoreBar.js' });
vm.runInContext(extractFunction('setMsg'), scoreContext, { filename: 'setMsg.js' });
scoreContext.updateTopScoreBar();
assert.match(scoreContext.document.bar.textContent, /你:101.*AI下家:99.*AI对家:98.*AI上家:102/, 'the top bar must preserve configured player names in fixed seat order');
const visibleScores = scoreContext.document.bar.textContent;
for (const status of ['选择要打出的牌', '等待响应', '自弈进行中', '本局结算完成']) {
  scoreContext.setMsg(status);
  assert.equal(scoreContext.document.bar.textContent, visibleScores, `${status} must not overwrite visible scores`);
}
scoreContext.GS.players=[];
scoreContext.updateTopScoreBar();
assert.match(scoreContext.document.bar.textContent, /你:-.*AI下家:-.*AI对家:-.*AI上家:-/, 'missing players must use the stable 你/AI fallback labels');
scoreContext.GS=undefined;
scoreContext.updateTopScoreBar();
assert.match(scoreContext.document.bar.textContent, /你:-.*AI下家:-.*AI对家:-.*AI上家:-/, 'missing game state must use the stable 你/AI fallback labels');

for (const name of ['enterIdleState', 'restoredPhaseMessage', 'newGame', 'drawGame', 'completePageKongSettlement', 'applyWin', 'startSelfPlayGame']) {
  assert.match(functionBody(name), /updateTopScoreBar\(|render\(|setMsg\(/, `${name} must refresh the visible top scores through the common lifecycle`);
}

assert.doesNotMatch(html, /id="sp-score"|id="sp-scorebar"/, 'self-play status must not render a second score display');
assert.match(html, /id="sp-status"[\s\S]*id="sp-info"/, 'self-play status must retain run state');

console.log('p1 statusbar regression passed');
