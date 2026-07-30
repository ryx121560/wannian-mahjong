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

function melds(tiles) {
  return tiles.map((tile) => ({ tile, count: 3 }));
}

function createRuntime(state) {
  const context = {
    RULE_ENGINE: loadRules(),
    tkey: (tile) => tile,
    meetsThresh: () => true,
    console: { info: () => {}, log: () => {} }
  };
  vm.createContext(context);
  for (const name of [
    'ruleTiles',
    'normalizedRuleMelds',
    'ruleMeldsFromPlayer',
    'canHuNormal',
    'canWinAfterPassForState',
    'canPongChk',
    'canKongChk',
    'resolveDiscardResponses',
    'revalidateRestoredResponseState'
  ]) vm.runInContext(extractFunction(name), context, { filename: `runtime-${name}.js` });
  return { context, state };
}

function runPageRestore(restoredState) {
  const events = [];
  const context = {
    RULE_ENGINE: loadRules(),
    GS: {},
    scores: [],
    totalGamesPlayed: 0,
    _selfPlay: { running: false, count: 0 },
    _sessionResumeScheduled: true,
    GAME_SESSION: { restore: () => ({ ok: true, state: restoredState, totalGames: 1, selfPlayRunning: false, savedAt: '2026-07-30T00:00:00.000Z' }) },
    kt: (tile) => tile,
    tkey: (tile) => tile,
    meetsThresh: () => true,
    clearGameTimers: () => events.push('clear-timers'),
    configureAiLearning: () => events.push('configure-ai'),
    setSelfPlayUiState: () => events.push('selfplay-ui'),
    restoredPhaseMessage: () => events.push('phase-message'),
    render: () => events.push('render'),
    updateBtns: () => events.push('buttons'),
    _spUpdateScore: () => events.push('score'),
    updateSuggestion: () => events.push('suggestion'),
    resumeRestoredGame: () => events.push('resume'),
    document: { getElementById: () => ({ textContent: '', style: {} }) },
    console: { info: (...args) => events.push(['info', ...args]), warn: () => {} }
  };
  vm.createContext(context);
  for (const name of [
    'ruleTiles',
    'normalizedRuleMelds',
    'ruleMeldsFromPlayer',
    'canHuNormal',
    'canWinAfterPassForState',
    'canPongChk',
    'canKongChk',
    'resolveDiscardResponses',
    'revalidateRestoredResponseState',
    'restoreGameSession'
  ]) vm.runInContext(extractFunction(name), context, { filename: `page-${name}.js` });
  assert.equal(context.restoreGameSession({}), true, 'page restore must complete');
  return { state: context.GS, events };
}

function responseState(overrides = {}) {
  return {
    phase: 'responding',
    cur: 2,
    turn: 107,
    lastDiscard: 'zhong',
    lastDiscardP: 2,
    passRecords: [],
    canP: false,
    canK: false,
    canW: true,
    _resp: null,
    _respP: 0,
    _responseKind: 'win',
    players: [
      { human: true, hand: ['nan', 'xi', 'xi', 'bei'], melds: melds(['tong7', 'tong3', 'tong5']) },
      { human: false, hand: [], melds: [] },
      { human: false, hand: [], melds: [] },
      { human: false, hand: [], melds: [] }
    ],
    ...overrides
  };
}

const stale107 = responseState();
const stale107Runtime = createRuntime(stale107);
const stale107Result = stale107Runtime.context.revalidateRestoredResponseState(stale107);
assert.equal(stale107Result.applied, true, 'responding snapshot must be revalidated');
assert.equal(stale107.canW, false, '107 stale human win must be cleared after restore');
assert.notEqual(stale107._responseKind, 'win', '107 stale response must not remain a win response');
assert.notEqual(stale107._respP, 0, '107 stale human responder must be cleared when no call is legal');

const eastWin = responseState({ players: [
  { human: true, hand: ['nan', 'xi', 'xi', 'bei'], melds: melds(['dong', 'dong', 'dong']) },
  { human: false, hand: [], melds: [] },
  { human: false, hand: [], melds: [] },
  { human: false, hand: [], melds: [] }
] });
createRuntime(eastWin).context.revalidateRestoredResponseState(eastWin);
assert.equal(eastWin.canW, true, 'real east pongs must retain a legal restored win');
assert.equal(eastWin._responseKind, 'win', 'legal restored win must retain win response kind');
assert.equal(eastWin._respP, 0, 'legal restored win must retain the human responder');

const pong = responseState({ lastDiscard: 'tong3', canW: false, _respP: -1, _responseKind: 'calls', players: [
  { human: true, hand: ['tong3', 'tong3'], melds: [] },
  { human: false, hand: [], melds: [] },
  { human: false, hand: [], melds: [] },
  { human: false, hand: [], melds: [] }
] });
createRuntime(pong).context.revalidateRestoredResponseState(pong);
assert.equal(pong.canP, true, 'legal restored pong must remain available');
assert.equal(pong.canK, false, 'two matching tiles must not expose a kong');
assert.equal(pong._responseKind, 'calls', 'legal restored pong must retain call response kind');
assert.equal(pong._respP, 0, 'legal restored pong must retain the human responder');

const kong = responseState({ lastDiscard: 'tong3', canW: false, _respP: -1, _responseKind: 'calls', players: [
  { human: true, hand: ['tong3', 'tong3', 'tong3'], melds: [] },
  { human: false, hand: [], melds: [] },
  { human: false, hand: [], melds: [] },
  { human: false, hand: [], melds: [] }
] });
createRuntime(kong).context.revalidateRestoredResponseState(kong);
assert.equal(kong.canK, true, 'legal restored kong must remain available');
assert.equal(kong._responseKind, 'calls', 'legal restored kong must retain call response kind');
assert.equal(kong._respP, 0, 'legal restored kong must retain the human responder');

const discarding = responseState({ phase: 'discarding', canW: false, canP: false, canK: false, _resp: null, _respP: -1, _responseKind: null });
const discardingBefore = JSON.stringify(discarding);
const discardingResult = createRuntime(discarding).context.revalidateRestoredResponseState(discarding);
assert.equal(discardingResult.applied, false, 'non-responding snapshots must not be revalidated');
assert.equal(JSON.stringify(discarding), discardingBefore, 'non-responding snapshots must remain unchanged');

const pageRestore = runPageRestore(responseState());
assert.equal(pageRestore.state.canW, false, 'page restore must clear the stale human win button state');
assert.notEqual(pageRestore.state._responseKind, 'win', 'page restore must not preserve the stale win response kind');
assert.equal(pageRestore.events.includes('resume'), true, 'page restore must continue through the normal resume path');
assert.equal(pageRestore.events.some((event) => Array.isArray(event) && event[0] === 'info' && event[1].includes('response-revalidated reason=stale-win-cleared')), true, 'page restore must emit a stable stale-win reason code');

assert.match(html, /function restoreGameSession\(snapshot\)[\s\S]*Object\.assign\(GS,restored\.state\);[\s\S]*revalidateRestoredResponseState\(GS\)/, 'restore path must revalidate responding snapshots after deserialization');
assert.match(html, /function checkResponses\(\)[\s\S]*resolveDiscardResponses\(GS\)/, 'new discard response path must use the shared resolver');

console.log('response restore revalidation regression: passed');
