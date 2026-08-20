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
  const strokes = [];
  let path = [];
  const gradient = { addColorStop() {} };
  const ctx = {
    clearRect() {}, createRadialGradient() { return gradient; }, fillRect() {}, strokeRect() {}, beginPath() { path = []; }, moveTo(x, y) { path.push({ x, y }); }, lineTo(x, y) { path.push({ x, y }); }, stroke() { strokes.push(path); },
    save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
  };
  const context = {
    GS: state, ctx, W: 1366, H: 768, TW: 56, TH: 78, GAP: 2,
    updateTopScoreBar() {}, tcmp: (a, b) => a.k.localeCompare(b.k), tkey: (value) => value.k,
    getSelectedTile: () => selectedTile, drawTile: (x, y, value, opts = {}) => drawCalls.push({ x, y, tile: value, opts }),
    drawKongSupplementLabel: (x, y, label) => labels.push({ x, y, label }),
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('aiNewDrawnTileForDisplay'), context, { filename: 'ai-new-drawn-tile-for-display.js' });
  vm.runInContext(extractFunction('aiDisplayHand'), context, { filename: 'ai-display-hand.js' });
  vm.runInContext(extractFunction('aiDrawHighlight'), context, { filename: 'ai-draw-highlight.js' });
  vm.runInContext(extractFunction('resolveEndedKongSupplement'), context, { filename: 'resolve-ended-kong-supplement.js' });
  vm.runInContext(extractFunction('drawHandSeparator'), context, { filename: 'draw-hand-separator.js' });
  vm.runInContext(extractFunction('render'), context, { filename: 'render.js' });
  context.render();
  return { drawCalls, labels, strokes, hot: state._hot };
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

function aiDrawState(playerIdx, drawnTile) {
  const state = baseState(tile('bai'));
  state.players[0].hand = [tile('wan1'), tile('wan2')];
  const normal = [tile('wan1'), tile('wan2')];
  state.players[playerIdx].hand = normal.concat([drawnTile]);
  state.cur = playerIdx;
  state.phase = 'discarding';
  state.newDrawnTile = drawnTile;
  state.newDrawnIdx = 2;
  state.showAI = true;
  return state;
}

function assertAiIndependentDraw(playerIdx, label = `AI ${playerIdx}`) {
  const drawnTile = tile(`tong${playerIdx + 1}`);
  const state = aiDrawState(playerIdx, drawnTile);
  const result = renderState(state);
  const calls = result.drawCalls.filter((entry) => entry.tile === drawnTile);
  assert.equal(calls.length, 1, `${label} must render its current draw exactly once`);
  assert.equal(calls[0].opts.hl, true, `${label} current draw must be independently highlighted`);
  assert.equal(calls[0].opts.face, true, `${label} draw must use the already visible hand face setting`);
  assert.equal(result.strokes.length, 1, `${label} current draw must render exactly one separator`);
  const separator = result.strokes[0];
  assert.equal(separator.length, 2, `AI ${playerIdx} separator must be a single line`);
  if (playerIdx === 2) assert.equal(separator[0].x, separator[1].x, 'the opposite AI separator must be vertical');
  else assert.equal(separator[0].y, separator[1].y, `side AI ${playerIdx} separator must follow the vertical hand layout`);
  return { state, result, drawnTile };
}

for (const playerIdx of [1, 2, 3]) assertAiIndependentDraw(playerIdx);

const addedKongDraw = assertAiIndependentDraw(2, 'an AI normal added-kong supplement');
addedKongDraw.state.phase = 'drawing';
let addedKongRendered = renderState(addedKongDraw.state);
assert.equal(addedKongRendered.drawCalls.some((entry) => entry.tile === addedKongDraw.drawnTile && entry.opts.hl), false, 'an AI added-kong supplement must clear its independent display after discard');
assert.equal(addedKongRendered.strokes.length, 0, 'an AI added-kong supplement must clear its separator after discard');

const endedAddedKongState = aiDrawState(2, tile('tong3'));
endedAddedKongState.phase = 'ended';
endedAddedKongState.newDrawnTile = null;
endedAddedKongState.newDrawnIdx = -1;
addedKongRendered = renderState(endedAddedKongState);
assert.equal(addedKongRendered.drawCalls.some((entry) => entry.opts.hl), false, 'a settled AI added-kong supplement must not remain independently displayed');
assert.equal(addedKongRendered.strokes.length, 0, 'a settled AI added-kong supplement must not retain a separator');

const aiDiscardState = aiDrawState(1, tile('tong2'));
aiDiscardState.phase = 'drawing';
let aiRendered = renderState(aiDiscardState);
assert.equal(aiRendered.drawCalls.filter((entry) => entry.tile === aiDiscardState.newDrawnTile).length, 1, 'a non-discarding AI state must retain one normal hand tile');
assert.equal(aiRendered.drawCalls.some((entry) => entry.tile === aiDiscardState.newDrawnTile && entry.opts.hl), false, 'a non-discarding AI state must not retain an independent draw');
assert.equal(aiRendered.strokes.length, 0, 'a non-discarding AI state must not retain a separator');

const responseState = aiDrawState(2, tile('tong3'));
responseState.phase = 'responding';
aiRendered = renderState(responseState);
assert.equal(aiRendered.drawCalls.some((entry) => entry.tile === responseState.newDrawnTile && entry.opts.hl), false, 'a response state must not retain an AI independent draw');
assert.equal(aiRendered.strokes.length, 0, 'a response state must not retain an AI separator');

const endedAiState = aiDrawState(1, tile('tong2'));
endedAiState.phase = 'ended';
endedAiState.newDrawnTile = null;
endedAiState.newDrawnIdx = -1;
aiRendered = renderState(endedAiState);
assert.equal(aiRendered.drawCalls.some((entry) => entry.opts.hl), false, 'an ended AI state must not retain an independent draw');
assert.equal(aiRendered.strokes.length, 0, 'an ended AI state must not retain an AI separator');

const restoredAiSource = aiDrawState(3, tile('tong4'));
const restoredAiSnapshot = snapshotContext.window.GameSessionSnapshot.create(restoredAiSource, { totalGames: 1, selfPlayRunning: false }, (value) => value.k);
const restoredAi = snapshotContext.window.GameSessionSnapshot.restore(restoredAiSnapshot, (key) => tile(key));
assert.equal(restoredAi.ok, true, 'an AI live draw snapshot must restore');
aiRendered = renderState(restoredAi.state);
assert.equal(aiRendered.drawCalls.filter((entry) => entry.tile === restoredAi.state.newDrawnTile).length, 1, 'a restored AI live draw must not duplicate the independent tile');
assert.equal(aiRendered.strokes.length, 1, 'a restored AI live draw must retain exactly one separator');

console.log('p0 live drawn tile face regression passed');
