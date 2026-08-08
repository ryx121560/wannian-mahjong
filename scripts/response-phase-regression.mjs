import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
const ruleBundle = fs.readFileSync(path.join(root, 'public/game/rule_engine.js'), 'utf8');

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

function loadRules() {
  const context = { window: {} };
  vm.runInNewContext(ruleBundle, context, { filename: 'rule_engine.js' });
  return context.window.WannianRuleEngine;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function responseState(overrides = {}) {
  return {
    phase: 'discarding',
    cur: 3,
    turn: 35,
    lastDiscard: 'dong',
    lastDiscardP: 3,
    passRecords: [],
    players: [
      { human: true, name: '你', hand: ['dong', 'dong'], melds: [], score: 100 },
      { human: false, name: 'AI下家', hand: [], melds: [], score: 100 },
      { human: false, name: 'AI对家', hand: [], melds: [], score: 100 },
      { human: false, name: 'AI上家', hand: [], melds: [], score: 100 },
    ],
    ...overrides,
  };
}

function createRuntime(state) {
  const events = [];
  const context = {
    RULE_ENGINE: loadRules(),
    GS: state,
    tkey: (tile) => tile,
    meetsThresh: () => true,
    setMsg: (message) => events.push(['message', message]),
    render: () => events.push(['render']),
    updateBtns: () => events.push(['buttons']),
    updateSuggestion: () => events.push(['suggestion']),
    saveGameSnapshot: (reason) => events.push(['snapshot', reason]),
    clearTimeout: () => {},
    gameSetTimeout: () => 0,
    aiRespond: (responses) => events.push(['aiRespond', responses]),
    console: { log: () => {}, error: () => {} },
  };
  vm.createContext(context);
  for (const name of [
    'ruleTiles',
    'normalizedRuleMelds',
    'ruleMeldsFromPlayer',
    'pageRuleState',
    'canWinAfterPassForState',
    'canPongChk',
    'canKongChk',
    'responseResolutionState',
    'resolveDiscardResponses',
    'checkResponses',
  ]) vm.runInContext(extractFunction(name), context, { filename: `response-phase-${name}.js` });
  return { context, events };
}

const pongState = responseState();
const directRuntime = createRuntime(pongState);
const beforeDirectResolve = clone(pongState);
const directResolved = directRuntime.context.resolveDiscardResponses(pongState);
assert.equal(directResolved.canP, false, 'raw discarding state must not expose a pong before the response phase is derived');
assert.deepEqual(clone(pongState), beforeDirectResolve, 'direct resolver calls must not mutate their input state');

const runtime = createRuntime(responseState());
runtime.context.checkResponses();
assert.equal(runtime.context.GS.phase, 'responding', 'checkResponses must transition the live state only after resolving legality');
assert.equal(runtime.context.GS.canP, true, 'the human with two east tiles must receive the pong response');
assert.equal(runtime.context.GS.canW, false, 'a pong-only response must not expose win');
assert.equal(runtime.context.GS._responseKind, 'calls', 'pong must be recorded as a call response');
assert.equal(runtime.context.GS._respP, 0, 'the human player must be selected as the response owner');
assert.equal(runtime.events.some((event) => event[0] === 'snapshot' && event[1] === 'human-call-response'), true, 'human pong response must persist only after live response state is committed');

const winOverPongState = responseState({
  lastDiscard: 'zhong',
  players: [
    { human: true, name: '你', hand: ['nan', 'xi', 'xi', 'bei'], melds: [{ tile: 'dong', count: 3 }, { tile: 'dong', count: 3 }, { tile: 'dong', count: 3 }], score: 100 },
    { human: false, name: 'AI下家', hand: [], melds: [], score: 100 },
    { human: false, name: 'AI对家', hand: [], melds: [], score: 100 },
    { human: false, name: 'AI上家', hand: [], melds: [], score: 100 },
  ],
});
const winRuntime = createRuntime(winOverPongState);
winRuntime.context.checkResponses();
assert.equal(winRuntime.context.GS._responseKind, 'win', 'nearest legal win must continue to suppress pong and kong calls');
assert.equal(winRuntime.context.GS.canW, true, 'legal human win must remain enabled');
assert.equal(winRuntime.context.GS.canP, false, 'win priority must clear pong availability');

const noResponseState = responseState({
  players: [
    { human: true, name: '你', hand: ['wan1', 'wan2'], melds: [], score: 100 },
    { human: false, name: 'AI下家', hand: [], melds: [], score: 100 },
    { human: false, name: 'AI对家', hand: [], melds: [], score: 100 },
    { human: false, name: 'AI上家', hand: [], melds: [], score: 100 },
  ],
});
const noResponseRuntime = createRuntime(noResponseState);
noResponseRuntime.context.checkResponses();
assert.equal(noResponseRuntime.context.GS._responseKind, 'calls', 'no-response path must retain the normal call resolution branch');
assert.equal(noResponseRuntime.context.GS.canP, false, 'no-response path must not invent pong');
assert.equal(noResponseRuntime.events.some((event) => event[0] === 'aiRespond'), true, 'no-response path must continue into the next-turn response handler');

assert.match(extractFunction('checkResponses'), /resolveDiscardResponses\(responseResolutionState\(GS\)\)/, 'checkResponses must resolve against a side-effect-free responding-state view');
assert.match(extractFunction('responseResolutionState'), /Object\.assign\(\{\},state,\{phase:'responding'\}\)/, 'response state derivation must not mutate the live game state');

console.log('response phase regression: passed');
