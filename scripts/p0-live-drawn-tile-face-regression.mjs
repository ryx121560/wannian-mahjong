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
    drawKongSupplementLabel: (x, y, label, rotation, offsetX, offsetY) => labels.push({ x, y, label, rotation, offsetX, offsetY }),
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('aiNewDrawnTileForDisplay'), context, { filename: 'ai-new-drawn-tile-for-display.js' });
  vm.runInContext(extractFunction('aiDisplayHand'), context, { filename: 'ai-display-hand.js' });
  vm.runInContext(extractFunction('aiDrawHighlight'), context, { filename: 'ai-draw-highlight.js' });
  vm.runInContext(extractFunction('resolveEndedKongSupplement'), context, { filename: 'resolve-ended-kong-supplement.js' });
  vm.runInContext(extractFunction('resolveEndedAiSelfDraw'), context, { filename: 'resolve-ended-ai-self-draw.js' });
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
assert.equal(independentCall(rendered, settledTile).opts.face, true, 'a settled human kong supplement must render independently at its owner seat');
assert.deepEqual(rendered.labels.map((entry) => entry.label), ['杠开补牌'], 'a settled human kong supplement must retain one owner label');
assert.equal(rendered.hot.some((entry) => entry.t === settledTile), false, 'a settled human kong supplement must not be clickable');
assert.equal(rendered.strokes.length, 1, 'a settled human kong supplement must retain one separator');

const ordinaryEndedTile = tile('wan5');
const ordinaryEndedState = baseState(ordinaryEndedTile);
ordinaryEndedState.phase = 'ended';
ordinaryEndedState.newDrawnTile = null;
ordinaryEndedState.newDrawnIdx = -1;
ordinaryEndedState._lastResult = { type: '自摸', winner: 0 };
rendered = renderState(ordinaryEndedState);
assert.equal(rendered.drawCalls.some((entry) => entry.opts.hl === true), false, 'ordinary ended states must not synthesize an independent tile');
assert.equal(rendered.labels.length, 0, 'ordinary ended states must not show an empty kong supplement label');

function aiSelfDrawEndedState(playerIdx, drawnTile) {
  const state = aiDrawState(playerIdx, drawnTile);
  state.phase = 'ended';
  state.newDrawnTile = null;
  state.newDrawnIdx = -1;
  state.showAI = false;
  state._lastResult = { type: '自摸', winner: playerIdx, aiSelfDraw: { owner: playerIdx, tileKey: drawnTile.k, handIndex: 2 } };
  return state;
}

function revealAiHandsForNormalEnd(state) {
  const context = { GS: state };
  vm.createContext(context);
  vm.runInContext(extractFunction('revealAiHandsForNormalEnd'), context, { filename: 'reveal-ai-hands-for-normal-end.js' });
  assert.equal(context.revealAiHandsForNormalEnd(), true, 'a normal ended result must force open AI hands');
}

for (const playerIdx of [1, 2, 3]) {
  const selfDrawTile = tile(`tiao${playerIdx + 4}`);
  const state = aiSelfDrawEndedState(playerIdx, selfDrawTile);
  revealAiHandsForNormalEnd(state);
  const result = renderState(state);
  const calls = result.drawCalls.filter((entry) => entry.tile === selfDrawTile);
  assert.equal(calls.length, 1, `AI ${playerIdx} self draw must render exactly once at the independent position`);
  assert.equal(calls[0].opts.face, true, `AI ${playerIdx} self draw must reveal its face at settlement`);
  assert.equal(calls[0].opts.hl, true, `AI ${playerIdx} self draw must retain the independent draw treatment`);
  assert.equal(result.strokes.length, 1, `AI ${playerIdx} self draw must render one separator`);
  assert.equal(result.labels.length, 0, `AI ${playerIdx} self draw must not reuse the kong supplement label`);
}

const aiPointWinState = aiDrawState(2, tile('wan4'));
aiPointWinState.phase = 'ended';
aiPointWinState.newDrawnTile = null;
aiPointWinState.newDrawnIdx = -1;
aiPointWinState._lastResult = { type: '点炮', winner: 2 };
revealAiHandsForNormalEnd(aiPointWinState);
rendered = renderState(aiPointWinState);
assert.equal(rendered.drawCalls.filter((entry) => entry.tile === aiPointWinState.players[2].hand[2]).length, 1, 'an AI point win must retain its complete normal hand');
assert.equal(rendered.drawCalls.some((entry) => entry.opts.hl === true), false, 'an AI point win must not synthesize a self-draw tile');
assert.equal(rendered.strokes.length, 0, 'an AI point win must not synthesize a separator');

const humanSelfDrawState = baseState(tile('tiao6'));
humanSelfDrawState.phase = 'ended';
humanSelfDrawState.newDrawnTile = null;
humanSelfDrawState.newDrawnIdx = -1;
humanSelfDrawState._lastResult = { type: '自摸', winner: 0, aiSelfDraw: { owner: 0, tileKey: 'tiao6', handIndex: 2 } };
rendered = renderState(humanSelfDrawState);
assert.equal(rendered.drawCalls.filter((entry) => entry.tile === humanSelfDrawState.players[0].hand[2]).length, 1, 'a human self draw must retain the existing normal ended layout');
assert.equal(rendered.drawCalls.some((entry) => entry.opts.hl === true), false, 'a human self draw must not gain an independent AI tile');
assert.equal(rendered.strokes.length, 0, 'a human self draw must not gain an AI separator');

for (const type of ['自摸', '点炮', '杠开']) {
  const humanWin = baseState(tile('wan3'));
  humanWin.phase = 'ended';
  humanWin.newDrawnTile = null;
  humanWin.newDrawnIdx = -1;
  humanWin.showAI = false;
  humanWin._lastResult = { type, winner: 0 };
  revealAiHandsForNormalEnd(humanWin);
  assert.equal(humanWin.showAI, true, `a human ${type} win must open all AI hands`);

  const aiWin = aiDrawState(1, tile('wan4'));
  aiWin.phase = 'ended';
  aiWin.newDrawnTile = null;
  aiWin.newDrawnIdx = -1;
  aiWin.showAI = false;
  aiWin._lastResult = { type, winner: 1 };
  revealAiHandsForNormalEnd(aiWin);
  assert.equal(aiWin.showAI, true, `an AI ${type} win must open all AI hands`);
}

const drawEndedState = baseState(tile('wan6'));
drawEndedState.phase = 'ended';
drawEndedState.newDrawnTile = null;
drawEndedState.newDrawnIdx = -1;
drawEndedState.showAI = false;
drawEndedState._lastResult = { type: '流局', scoreDeltas: [0, 0, 0, 0] };
revealAiHandsForNormalEnd(drawEndedState);
assert.equal(drawEndedState.showAI, true, 'a normal draw must open all AI hands');
rendered = renderState(drawEndedState);
assert.equal(rendered.drawCalls.some((entry) => entry.opts.hl === true), false, 'a draw must not synthesize a self-draw tile');
assert.equal(rendered.strokes.length, 0, 'a draw must not synthesize a self-draw separator');

const midGameState = aiDrawState(1, tile('wan7'));
midGameState.showAI = false;
midGameState._lastResult = { type: '流局', scoreDeltas: [0, 0, 0, 0] };
assert.equal((() => { const context = { GS: midGameState }; vm.createContext(context); vm.runInContext(extractFunction('revealAiHandsForNormalEnd'), context); return context.revealAiHandsForNormalEnd(); })(), false, 'a non-ended state must not change AI-hand visibility');
assert.equal(midGameState.showAI, false, 'a non-ended state must retain hidden AI hands');

const unknownEndedState = baseState(tile('wan8'));
unknownEndedState.phase = 'ended';
unknownEndedState.newDrawnTile = null;
unknownEndedState.newDrawnIdx = -1;
unknownEndedState.showAI = false;
unknownEndedState._lastResult = { type: 'unknown-ended-result', winner: 0 };
assert.equal((() => { const context = { GS: unknownEndedState }; vm.createContext(context); vm.runInContext(extractFunction('revealAiHandsForNormalEnd'), context); return context.revealAiHandsForNormalEnd(); })(), false, 'an unknown ended result must not reveal AI hands');
assert.equal(unknownEndedState.showAI, false, 'an unknown ended result must retain hidden AI hands');

const restoredEndedSnapshot = snapshotContext.window.GameSessionSnapshot.create(settledState, { totalGames: 1, selfPlayRunning: false }, (value) => value.k);
const restoredEnded = snapshotContext.window.GameSessionSnapshot.restore(restoredEndedSnapshot, (key) => tile(key));
assert.equal(restoredEnded.ok, true, 'a settled human kong snapshot must restore');
rendered = renderState(restoredEnded.state);
assert.equal(independentCall(rendered, restoredEnded.state.players[0].hand[2]).opts.face, true, 'a restored settled human kong supplement must remain independently rendered at its owner seat');
assert.deepEqual(rendered.labels.map((entry) => entry.label), ['杠开补牌'], 'a restored settled human kong supplement must retain its owner label');
assert.equal(rendered.strokes.length, 1, 'a restored settled human kong state must retain one separator');

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
endedAddedKongState._lastResult = { type: '杠开', winner: 2, kongSupplement: { owner: 2, tileKey: 'tong3', handIndex: 2 } };
addedKongRendered = renderState(endedAddedKongState);
assert.equal(independentCall(addedKongRendered, endedAddedKongState.players[2].hand[2]).opts.face, true, 'a settled opposite AI kong supplement must render independently at its owner seat');
assert.deepEqual(addedKongRendered.labels.map((entry) => entry.label), ['杠开补牌'], 'a settled opposite AI kong supplement must retain one owner label');
assert.equal(addedKongRendered.strokes.length, 1, 'a settled opposite AI kong supplement must retain one separator');

const directChiselTile = tile('wan7');
const directChiselEndedState = aiDrawState(3, directChiselTile);
directChiselEndedState.phase = 'ended';
directChiselEndedState.newDrawnTile = null;
directChiselEndedState.newDrawnIdx = -1;
directChiselEndedState._lastResult = {
  type: '杠开', winner: 3, kongAction: 'directChisel', kongOutcome: 'directChiselFakeWin',
  kongSupplement: { owner: 3, tileKey: 'wan7', handIndex: 2 },
};
const directChiselRendered = renderState(directChiselEndedState);
assert.equal(directChiselRendered.drawCalls.filter((entry) => entry.tile === directChiselTile).length, 1, 'an AI upper direct-chisel supplement must remain in its owner hand exactly once');
assert.equal(independentCall(directChiselRendered, directChiselTile).opts.face, true, 'an AI upper direct-chisel supplement must render independently at its owner seat');
assert.deepEqual(directChiselRendered.labels.map((entry) => entry.label), ['杠开补牌'], 'an AI upper direct-chisel settlement must show one owner label');
assert.equal(directChiselRendered.labels[0].rotation, Math.PI / 2, 'an AI upper supplement label must follow the side-hand direction');
assert.equal(directChiselRendered.labels[0].offsetX, 28, 'an AI upper supplement label must remain centered in its side-hand coordinate system');
assert.equal(directChiselRendered.labels[0].offsetY, -90, 'an AI upper supplement label must sit outside the tile instead of overlapping it');
assert.equal(directChiselRendered.strokes.length, 1, 'an AI upper direct-chisel settlement must show one separator');

const lowerAiTile = tile('wan6');
const lowerAiEndedState = aiDrawState(1, lowerAiTile);
lowerAiEndedState.phase = 'ended';
lowerAiEndedState.newDrawnTile = null;
lowerAiEndedState.newDrawnIdx = -1;
lowerAiEndedState._lastResult = { type: '杠开', winner: 1, kongSupplement: { owner: 1, tileKey: 'wan6', handIndex: 2 } };
const lowerAiRendered = renderState(lowerAiEndedState);
assert.equal(independentCall(lowerAiRendered, lowerAiTile).opts.face, true, 'a lower AI kong supplement must render independently at its owner seat');
assert.deepEqual(lowerAiRendered.labels.map((entry) => entry.label), ['杠开补牌'], 'a lower AI kong supplement must show one owner label');
assert.equal(lowerAiRendered.labels[0].rotation, Math.PI / 2, 'a lower AI supplement label must follow the side-hand direction');
assert.equal(lowerAiRendered.labels[0].offsetX, 28, 'a lower AI supplement label must remain centered in its side-hand coordinate system');
assert.equal(lowerAiRendered.labels[0].offsetY, 98, 'a lower AI supplement label must sit outside the tile instead of overlapping it');
assert.equal(lowerAiRendered.strokes.length, 1, 'a lower AI kong supplement must show one separator');

for (const playerIdx of [1, 3]) {
  const hiddenLive = aiDrawState(playerIdx, tile(`tiao${playerIdx + 1}`));
  hiddenLive.showAI = false;
  const hiddenLiveRendered = renderState(hiddenLive);
  const hiddenLiveCalls = hiddenLiveRendered.drawCalls.filter((entry) => entry.tile === hiddenLive.newDrawnTile);
  assert.equal(hiddenLiveCalls.length, 1, `a hidden AI ${playerIdx} live draw must remain a single card back`);
  assert.equal(hiddenLiveCalls[0].opts.face, false, `a hidden AI ${playerIdx} live draw must remain face down`);
  assert.equal(hiddenLiveCalls[0].opts.hl, false, `a hidden AI ${playerIdx} live draw must not use a green highlight`);
  assert.equal(hiddenLiveRendered.labels.length, 0, `a hidden AI ${playerIdx} live draw must not expose a supplement label`);
  assert.equal(hiddenLiveRendered.strokes.length, 1, `a hidden AI ${playerIdx} live draw may retain its separator`);

  const hiddenSettled = aiDrawState(playerIdx, tile(`wan${playerIdx + 2}`));
  hiddenSettled.showAI = false;
  hiddenSettled.phase = 'ended';
  hiddenSettled.newDrawnTile = null;
  hiddenSettled.newDrawnIdx = -1;
  hiddenSettled._lastResult = { type: '杠开', winner: playerIdx, kongSupplement: { owner: playerIdx, tileKey: hiddenSettled.players[playerIdx].hand[2].k, handIndex: 2 } };
  const hiddenSettledRendered = renderState(hiddenSettled);
  const hiddenSettledTile = hiddenSettled.players[playerIdx].hand[2];
  const hiddenSettledCalls = hiddenSettledRendered.drawCalls.filter((entry) => entry.tile === hiddenSettledTile);
  assert.equal(hiddenSettledCalls.length, 1, `a hidden AI ${playerIdx} settled supplement must remain a single card back`);
  assert.equal(hiddenSettledCalls[0].opts.face, false, `a hidden AI ${playerIdx} settled supplement must remain face down`);
  assert.equal(hiddenSettledCalls[0].opts.hl, false, `a hidden AI ${playerIdx} settled supplement must not use a green highlight`);
  assert.equal(hiddenSettledRendered.labels.length, 0, `a hidden AI ${playerIdx} settled supplement must not expose a label`);
  assert.equal(hiddenSettledRendered.strokes.length, 1, `a hidden AI ${playerIdx} settled supplement may retain its separator`);
}

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

const humanResponseState = baseState(tile('tong4'));
humanResponseState.phase = 'responding';
rendered = renderState(humanResponseState);
assert.equal(rendered.drawCalls.filter((entry) => entry.tile === humanResponseState.newDrawnTile).length, 1, 'a human response state must retain the former draw in the hand exactly once');
assert.equal(rendered.drawCalls.some((entry) => entry.tile === humanResponseState.newDrawnTile && entry.opts.hl === true), false, 'a human response state must not retain an independent tile');
assert.equal(rendered.strokes.length, 0, 'a human response state must not retain a separator');

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

const restoredAiSelfDrawSource = aiSelfDrawEndedState(3, tile('wan9'));
const restoredAiSelfDrawSnapshot = snapshotContext.window.GameSessionSnapshot.create(restoredAiSelfDrawSource, { totalGames: 1, selfPlayRunning: false }, (value) => value.k);
const restoredAiSelfDraw = snapshotContext.window.GameSessionSnapshot.restore(restoredAiSelfDrawSnapshot, (key) => tile(key));
assert.equal(restoredAiSelfDraw.ok, true, 'an AI self-draw ended snapshot must restore');
revealAiHandsForNormalEnd(restoredAiSelfDraw.state);
aiRendered = renderState(restoredAiSelfDraw.state);
assert.equal(aiRendered.drawCalls.filter((entry) => entry.tile === restoredAiSelfDraw.state.players[3].hand[2]).length, 1, 'a restored AI self draw must remain independently rendered exactly once');
assert.equal(aiRendered.strokes.length, 1, 'a restored AI self draw must retain one separator');
assert.equal(aiRendered.labels.length, 0, 'a restored AI self draw must not gain a kong label');

const restoredDrawSnapshot = snapshotContext.window.GameSessionSnapshot.create(drawEndedState, { totalGames: 1, selfPlayRunning: false }, (value) => value.k);
const restoredDraw = snapshotContext.window.GameSessionSnapshot.restore(restoredDrawSnapshot, (key) => tile(key));
assert.equal(restoredDraw.ok, true, 'a normal draw snapshot must restore');
restoredDraw.state.showAI = false;
revealAiHandsForNormalEnd(restoredDraw.state);
assert.equal(restoredDraw.state.showAI, true, 'a restored normal draw must reopen AI hands');

console.log('p0 live drawn tile face regression passed');
