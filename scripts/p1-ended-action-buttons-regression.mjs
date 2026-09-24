import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const html = fs.readFileSync(path.join(process.cwd(), 'public/game/wannian-mahjong.html'), 'utf8');

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

for (const name of ['handlePongButton', 'handleKongButton', 'handleWinButton', 'handlePassButton']) {
  assert.match(html, new RegExp(`function ${name}\\(`), `${name} must expose a phase-guarded action entry`);
}
assert.match(extractFunction('updateBtns'), /GS\.phase==='idle'\|\|GS\.phase==='ended'/, 'idle and ended must hard-disable all four game action buttons');
assert.match(html, /\.btn-a:disabled\{background:#555[^}]*\}/, 'pong and kong must use the existing gray disabled style');
assert.match(html, /\.btn-w:disabled\{background:#555[^}]*\}/, 'win must use the existing gray disabled style');
assert.match(html, /\.btn-p:disabled\{background:#666[^}]*\}/, 'pass must use the existing gray disabled style');

function makeContext(phase) {
  const buttons = Object.fromEntries(['bt-pong', 'bt-kong', 'bt-win', 'bt-pass'].map((id) => [id, { disabled: false }]));
  const calls = { pong: 0, kong: 0, selfKong: 0, win: 0, pass: 0, recommendation: 0, timer: 0, writes: 0 };
  const context = {
    GS: {
      phase, cur: 0, canP: true, canK: true, canW: true, canWS: true,
      _respP: 0, _respTimer: 17, lastDiscard: { k: 'dong' }, players: [{ human: true }],
      marker: 'unchanged',
    },
    document: { getElementById: (id) => buttons[id] },
    clearTimeout: () => { calls.timer += 1; },
    recordRecommendationChoice: () => { calls.recommendation += 1; },
    doPong: () => { calls.pong += 1; }, doKong: () => { calls.kong += 1; }, doSelfKong: () => { calls.selfKong += 1; },
    applyWin: () => { calls.win += 1; }, canSelfWinForPlayer: () => true,
    collectPageKongDeclarations: () => [{ info: { type: 'concealedKong', tile: 'dong' } }],
    recordPass: () => { calls.writes += 1; }, nextTurn: () => { calls.pass += 1; },
  };
  vm.createContext(context);
  for (const name of ['updateBtns', 'handlePongButton', 'handleKongButton', 'handleWinButton', 'handlePassButton']) {
    vm.runInContext(extractFunction(name), context, { filename: `${name}.js` });
  }
  return { context, buttons, calls };
}

for (const phase of ['ended', 'idle']) {
  const { context, buttons, calls } = makeContext(phase);
  const before = JSON.stringify(context.GS);
  context.updateBtns();
  assert.deepEqual(Object.values(buttons).map((button) => button.disabled), [true, true, true, true], `${phase} must gray all four game action buttons`);
  assert.equal(context.handlePongButton(), false);
  assert.equal(context.handleKongButton(), false);
  assert.equal(context.handleWinButton(), false);
  assert.equal(context.handlePassButton(), false);
  assert.equal(JSON.stringify(context.GS), before, `${phase} handlers must not mutate game state`);
  assert.deepEqual(calls, { pong: 0, kong: 0, selfKong: 0, win: 0, pass: 0, recommendation: 0, timer: 0, writes: 0 }, `${phase} handlers must have zero side effects`);
}

{
  const { context, buttons, calls } = makeContext('responding');
  context.updateBtns();
  assert.deepEqual(Object.values(buttons).map((button) => button.disabled), [false, false, false, false], 'legal responding actions must remain enabled');
  assert.equal(context.handlePongButton(), true); assert.equal(calls.pong, 1);
  assert.equal(context.handleKongButton(), true); assert.equal(calls.kong, 1);
  assert.equal(context.handleWinButton(), true); assert.equal(calls.win, 1);
  assert.equal(context.handlePassButton(), true); assert.equal(calls.pass, 1);
}

{
  const { context, buttons, calls } = makeContext('discarding');
  context.GS._respP = -1; context.GS.canP = false; context.GS.canW = false;
  context.updateBtns();
  assert.equal(buttons['bt-kong'].disabled, false, 'legal self-kong must remain enabled while discarding');
  assert.equal(buttons['bt-win'].disabled, false, 'legal self-win must remain enabled while discarding');
  assert.equal(context.handleKongButton(), true); assert.equal(calls.selfKong, 1);
  assert.equal(context.handleWinButton(), true); assert.equal(calls.win, 1);
  assert.equal(context.handlePongButton(), false);
  assert.equal(context.handlePassButton(), false);
}

for (const name of ['drawGame', 'completePageKongSettlement', 'applyWin', 'restoreGameSession']) {
  assert.match(extractFunction(name), /updateBtns\(/, `${name} must refresh disabled state on its ended path`);
}
assert.doesNotMatch(extractFunction('updateBtns'), /bt-rules|bt-ai-settings|bt-new|bt-export|bt-reset-scores/, 'non-game controls must remain outside the ended action-button lock');
console.log('p1 ended action buttons regression passed');
