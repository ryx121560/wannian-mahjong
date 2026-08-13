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

function loadSessionSnapshot() {
  const context = { window: {} };
  vm.runInNewContext(snapshotSource, context, { filename: 'session_snapshot.js' });
  return context.window.GameSessionSnapshot;
}

assert.match(html, /function captureSettledKongSupplement\(/, 'kong settlement must capture a structured supplement tile before clearing the live draw marker');
assert.match(html, /function resolveEndedKongSupplement\(/, 'ended rendering must validate the structured supplement against the winning hand');
assert.match(html, /杠开补牌/, 'the ended board must visibly label the independent supplement tile');
assert.match(extractFunction('completePageKongSettlement'), /const kongSupplement=captureSettledKongSupplement\(owner\)[\s\S]*GS\._lastResult\.kongSupplement=kongSupplement/, 'every common kong settlement must persist the structured supplement captured before the live marker is cleared');

const tile = { k: 'tong8' };
const context = { GS: { phase: 'discarding', newDrawnTile: tile, newDrawnIdx: 2, players: [{ hand: [{ k: 'wan1' }, { k: 'wan2' }, tile] }] }, tkey: (value) => value.k };
vm.createContext(context);
vm.runInContext(extractFunction('captureSettledKongSupplement'), context, { filename: 'capture-settled-kong-supplement.js' });
vm.runInContext(extractFunction('resolveEndedKongSupplement'), context, { filename: 'resolve-ended-kong-supplement.js' });
const captured = JSON.parse(JSON.stringify(context.captureSettledKongSupplement(0)));
assert.deepEqual(captured, { owner: 0, tileKey: 'tong8', handIndex: 2 }, 'capture must bind the exact physical supplement to owner, key, and hand index');
context.GS.phase = 'ended';
context.GS._lastResult = { type: '杠开', winner: 0, kongSupplement: captured };
const resolved = context.resolveEndedKongSupplement();
assert.equal(resolved.tile, tile, 'ended presentation must resolve the exact physical tile object in the hand');
assert.equal(resolved.label, '杠开补牌');
context.GS._lastResult = { type: '点炮', winner: 0 };
assert.equal(context.resolveEndedKongSupplement(), null, 'ordinary wins must not show an empty supplement marker');
context.GS._lastResult = { type: '杠开', winner: 0, kongSupplement: { owner: 0, tileKey: 'tong9', handIndex: 2 } };
assert.equal(context.resolveEndedKongSupplement(), null, 'invalid structured references must fail closed');

const session = loadSessionSnapshot();
const players = Array.from({ length: 4 }, (_, index) => ({ name: `P${index}`, human: index === 0, score: 50, hand: index === 0 ? ['wan1', 'wan2', 'tong8'] : [], melds: [] }));
const snapshotState = {
  wall: [], players, discards: [], playerDiscards: [[], [], [], []], lastDiscard: null, lastDiscardP: -1,
  cur: 0, dealer: 0, turn: 8, phase: 'ended', canP: false, canK: false, canW: false, canWS: false,
  _resp: null, _respP: -1, _responseKind: null, _kc: {}, _hasWild: {}, _kongResources: [], _kongActionWindow: null,
  _candidateKongResources: [], _specialKongChoiceWindow: null, newDrawnTile: null, newDrawnIdx: -1,
  _lastResult: { type: '杠开', winner: 0, scoreDeltas: [12, -4, -4, -4], kongSupplement: captured },
};
const snapshot = session.create(snapshotState, { totalGames: 1, selfPlayRunning: false }, (value) => value);
const restored = session.restore(snapshot, (value) => ({ k: value }));
assert.equal(restored.ok, true, 'ended kong settlement snapshot must restore');
assert.deepEqual(JSON.parse(JSON.stringify(restored.state._lastResult.kongSupplement)), captured, 'refresh restore must retain the structured supplement reference');
const legacyState = JSON.parse(JSON.stringify(snapshotState));
delete legacyState._lastResult.kongSupplement;
const legacySnapshot = session.create(legacyState, { totalGames: 1, selfPlayRunning: false }, (value) => value);
const legacyRestored = session.restore(legacySnapshot, (value) => ({ k: value }));
assert.equal(legacyRestored.ok, true, 'older ended snapshots without the display field must remain restorable');
assert.equal(Object.hasOwn(legacyRestored.state._lastResult, 'kongSupplement'), false, 'legacy snapshots must not synthesize a supplement');

for (const name of ['applyInitialPageKongAction', 'applyPageDeferredKongAction', 'applyPageSpecialKongAction', 'applyPageAddedKongDraw']) {
  assert.match(extractFunction(name), /GS\.newDrawnTile=.*GS\.newDrawnIdx=/s, `${name} must retain the live draw marker for non-settling discard branches`);
}
assert.match(extractFunction('completePageKongSettlement'), /GS\.newDrawnTile=null;GS\.newDrawnIdx=-1/, 'immediate settlements must clear the clickable live draw marker');
console.log('p1 kong settlement draw regression passed');
