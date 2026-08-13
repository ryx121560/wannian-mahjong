import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
const snapshotSource = fs.readFileSync(path.join(root, 'public/game/session_snapshot.js'), 'utf8');

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

function tile(key) {
  return { k: key };
}

function player(index, hand = []) {
  return { name: index === 0 ? '你' : `AI${index}`, human: index === 0, score: 50, hand, melds: [] };
}

function baseState(drawnTile) {
  return {
    phase: 'discarding', cur: 0, wall: [tile('wan9')], players: [player(0, [tile('wan1'), tile('wan2'), drawnTile]), player(1), player(2), player(3)],
    newDrawnTile: drawnTile, newDrawnIdx: 2, selectedTile: null, showAI: false, _hot: [], _recommendation: {},
    _aiDiscardAnim: null, _lastResult: null, playerDiscards: [[], [], [], []], discards: [], lastDiscard: null, lastDiscardP: -1,
    canP: false, canK: false, canW: false, canWS: false, _resp: null, _respP: -1, _responseKind: null,
    dealer: 0, turn: 4, _kc: {}, _hasWild: {}, _kongResources: [], _kongActionWindow: null,
    _candidateKongResources: [], _specialKongChoiceWindow: null,
  };
}

function renderState(state, selectedTile = null) {
  const drawCalls = [];
  const labels = [];
  const gradient = { addColorStop() {} };
  const ctx = {
    clearRect() {}, createRadialGradient() { return gradient; }, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
  };
  const context = {
    GS: state, ctx, W: 1366, H: 768, TW: 56, TH: 78, GAP: 2,
    updateTopScoreBar() {}, tcmp: (a, b) => a.k.localeCompare(b.k), tkey: (value) => value.k,
    getSelectedTile: () => selectedTile, drawTile: (x, y, value, opts = {}) => drawCalls.push({ x, y, tile: value, opts }),
    drawKongSupplementLabel: (x, y, label) => labels.push({ x, y, label }), aiDisplayHand: () => [], aiDrawHighlight: () => false,
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('resolveEndedKongSupplement'), context, { filename: 'resolve-ended-kong-supplement.js' });
  vm.runInContext(extractFunction('render'), context, { filename: 'render.js' });
  context.render();
  return { drawCalls, labels, hot: state._hot };
}

function independentCall(result, expectedTile) {
  const calls = result.drawCalls.filter((entry) => entry.tile === expectedTile && entry.opts.hl === true);
  assert.equal(calls.length, 1, 'the independent tile must be rendered exactly once');
  return calls[0];
}

const liveTile = tile('tong6');
const liveState = baseState(liveTile);
let rendered = renderState(liveState);
assert.equal(independentCall(rendered, liveTile).opts.face, true, 'a normal human draw must render face up');
assert.equal(rendered.hot.some((entry) => entry.t === liveTile && entry.idx === 2), true, 'the live tile must keep its clickable hot area');

rendered = renderState(liveState, liveTile);
assert.equal(independentCall(rendered, liveTile).opts.face, true, 'selected rerender must keep the live tile face up');
assert.equal(independentCall(rendered, liveTile).opts.sel, true, 'selected rerender must retain selection styling');
rendered = renderState(liveState);
assert.equal(independentCall(rendered, liveTile).opts.face, true, 'repeat render must not turn the live tile face down');

const kongFailureTile = tile('tiao7');
const kongFailureState = baseState(kongFailureTile);
kongFailureState._kongActionWindow = { kind: 'forcedRunFailureDiscard', owner: 0 };
rendered = renderState(kongFailureState);
assert.equal(independentCall(rendered, kongFailureTile).opts.face, true, 'a kong draw that continues to discard must render face up');
assert.equal(rendered.hot.some((entry) => entry.t === kongFailureTile), true, 'the kong failure draw must remain clickable');

const snapshotContext = { window: {} };
vm.runInNewContext(snapshotSource, snapshotContext, { filename: 'session_snapshot.js' });
const snapshot = snapshotContext.window.GameSessionSnapshot.create(liveState, { totalGames: 1, selfPlayRunning: false }, (value) => value.k);
const restored = snapshotContext.window.GameSessionSnapshot.restore(snapshot, (key) => tile(key));
assert.equal(restored.ok, true, 'a live draw snapshot must restore');
rendered = renderState(restored.state);
assert.equal(independentCall(rendered, restored.state.newDrawnTile).opts.face, true, 'restored live draw must remain face up');

const discardTile = tile('wan8');
const discardState = baseState(discardTile);
let responseChecks = 0;
const discardContext = {
  GS: discardState, teq: (left, right) => left === right || left.k === right.k, recordRecommendationChoice() {}, lbl: (value) => value.k,
  clearPlayerDrawMarker() {}, applyPageKongDiscardLifecycle() {}, clearSelectedTile() {}, logEvent() {}, getAiHandMeta: () => undefined,
  window: { RL: null }, checkResponses: () => { responseChecks += 1; }, render() {}, updateSuggestion() {},
};
vm.createContext(discardContext);
vm.runInContext(extractFunction('doDiscard'), discardContext, { filename: 'do-discard.js' });
discardContext.doDiscard(discardTile);
assert.equal(discardState.players[0].hand.some((entry) => entry === discardTile), false, 'clicking the independent tile must still discard it');
assert.equal(discardState.newDrawnTile, null, 'discard must clear the live draw marker');
assert.equal(discardState.newDrawnIdx, -1, 'discard must clear the live draw index');
assert.equal(responseChecks, 1, 'discard must continue into response resolution exactly once');

const settledTile = tile('tong8');
const settledState = baseState(settledTile);
settledState.phase = 'ended';
settledState.newDrawnTile = null;
settledState.newDrawnIdx = -1;
settledState._lastResult = { type: '杠开', winner: 0, kongSupplement: { owner: 0, tileKey: 'tong8', handIndex: 2 } };
rendered = renderState(settledState);
assert.equal(independentCall(rendered, settledTile).opts.face, true, 'settled kong supplement must remain face up');
assert.deepEqual(rendered.labels.map((entry) => entry.label), ['杠开补牌'], 'settled kong supplement must retain its visible label');
assert.equal(rendered.hot.some((entry) => entry.t === settledTile), false, 'settled kong supplement must not be clickable');

const ordinaryEndedTile = tile('wan5');
const ordinaryEndedState = baseState(ordinaryEndedTile);
ordinaryEndedState.phase = 'ended';
ordinaryEndedState.newDrawnTile = null;
ordinaryEndedState.newDrawnIdx = -1;
ordinaryEndedState._lastResult = { type: '自摸', winner: 0 };
rendered = renderState(ordinaryEndedState);
assert.equal(rendered.drawCalls.some((entry) => entry.opts.hl === true), false, 'ordinary ended states must not synthesize an independent tile');
assert.equal(rendered.labels.length, 0, 'ordinary ended states must not show an empty kong supplement label');

console.log('p0 live drawn tile face regression passed');
