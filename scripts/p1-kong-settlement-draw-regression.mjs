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
assert.match(html, /function resolveEndedKongSupplement\(/, 'ended rendering must resolve the structured supplement against the owning hand');
assert.match(html, /function captureSettledAiSelfDraw\(/, 'AI self-draw settlement must capture an exact structured tile before clearing the live draw marker');
assert.match(html, /function resolveEndedAiSelfDraw\(/, 'ended rendering must resolve an AI self-draw against the winning hand');
assert.match(html, /function revealAiHandsForNormalEnd\(/, 'a normal ended result must force the existing AI-hand visibility setting open');
assert.match(extractFunction('revealAiHandsForNormalEnd'), /result\.type==='流局'[\s\S]*\['自摸','点炮','杠开'\]\.includes\(result\.type\)/, 'ended AI-hand visibility must use the explicit draw and win-type allowlist');
assert.match(html, /function drawKongSupplementLabel\(/, 'ended rendering must visibly label the owner supplement tile');
assert.match(html, /settled1&&GS\.showAI[\s\S]*TW\/2,TH\+20/, 'the right-side supplement label must be outside its vertical tile and hidden with AI hands');
assert.match(html, /settled3&&GS\.showAI[\s\S]*TW\/2,-TH-12/, 'the left-side supplement label must be outside its vertical tile and hidden with AI hands');
assert.match(html, /independent1\.tile,\{face:!!GS\.showAI,hl:!!GS\.showAI\}/, 'the right-side independent AI tile highlight must follow AI visibility');
assert.match(html, /independent3\.tile,\{face:!!GS\.showAI,hl:!!GS\.showAI\}/, 'the left-side independent AI tile highlight must follow AI visibility');
const renderSource = extractFunction('render');
for (const owner of [0, 1, 2, 3]) {
  assert.match(renderSource, new RegExp(`endedKongSupplement&&endedKongSupplement\\.owner===${owner}`), `seat ${owner} must use the structured supplement owner when rendering the ended board`);
}
assert.match(extractFunction('completePageKongSettlement'), /const kongSupplement=captureSettledKongSupplement\(owner\)[\s\S]*GS\._lastResult\.kongSupplement=kongSupplement/, 'every common kong settlement must persist the structured supplement captured before the live marker is cleared');
assert.match(extractFunction('applyWin'), /const aiSelfDraw=captureSettledAiSelfDraw\(winner,wt\)[\s\S]*if\(aiSelfDraw\)GS\._lastResult\.aiSelfDraw=aiSelfDraw[\s\S]*revealAiHandsForNormalEnd\(\)/, 'a normal AI self draw must persist only an exact display reference before the live marker is cleared and reveal all AI hands');
assert.match(extractFunction('completePageKongSettlement'), /revealAiHandsForNormalEnd\(\)/, 'a settled kong win must reveal all AI hands without being reclassified as a self draw');
assert.match(extractFunction('drawGame'), /GS\._lastResult=.*type:'流局'[\s\S]*revealAiHandsForNormalEnd\(\)/, 'a normal draw must reveal all AI hands without synthesizing a winner');
assert.match(extractFunction('restoreGameSession'), /revealAiHandsForNormalEnd\(\);[\s\S]*restoredPhaseMessage\(\)/, 'refresh restore must derive normal-end AI visibility from the existing result');

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
assert.equal(resolved.tile, tile, 'ended presentation must resolve the exact physical tile object in the owner hand');
assert.equal(resolved.label, '杠开补牌');
context.GS._lastResult = { type: '点炮', winner: 0, kongSupplement: captured };
assert.equal(context.resolveEndedKongSupplement(), null, 'a non-kong ended result must not expose a supplement');
context.GS._lastResult = { type: '杠开', winner: 1, kongSupplement: captured };
assert.equal(context.resolveEndedKongSupplement(), null, 'a supplement owner that differs from the winner must fail closed');
context.GS._lastResult = { type: '杠开', winner: 0, kongSupplement: { owner: 0, tileKey: 'tong9', handIndex: 2 } };
assert.equal(context.resolveEndedKongSupplement(), null, 'a supplement with a mismatched hand index or tile key must fail closed');

const selfDrawTile = { k: 'wan9' };
const selfDrawContext = {
  GS: { phase: 'discarding', cur: 2, newDrawnTile: selfDrawTile, newDrawnIdx: 2, players: [{ human: true, hand: [] }, { human: false, hand: [] }, { human: false, hand: [{ k: 'wan1' }, { k: 'wan2' }, selfDrawTile] }, { human: false, hand: [] }] },
  tkey: (value) => value.k,
};
vm.createContext(selfDrawContext);
vm.runInContext(extractFunction('captureSettledAiSelfDraw'), selfDrawContext, { filename: 'capture-settled-ai-self-draw.js' });
vm.runInContext(extractFunction('resolveEndedAiSelfDraw'), selfDrawContext, { filename: 'resolve-ended-ai-self-draw.js' });
const capturedSelfDraw = JSON.parse(JSON.stringify(selfDrawContext.captureSettledAiSelfDraw(2, '自摸')));
assert.deepEqual(capturedSelfDraw, { owner: 2, tileKey: 'wan9', handIndex: 2 }, 'AI self-draw capture must bind the winning seat, exact tile key, and hand index');
selfDrawContext.GS.phase = 'ended';
selfDrawContext.GS.newDrawnTile = null;
selfDrawContext.GS.newDrawnIdx = -1;
selfDrawContext.GS._lastResult = { type: '自摸', winner: 2, aiSelfDraw: capturedSelfDraw };
assert.equal(selfDrawContext.resolveEndedAiSelfDraw().tile, selfDrawTile, 'AI self-draw rendering must resolve the original tile from the winner hand');
selfDrawContext.GS._lastResult = { type: '点炮', winner: 2, aiSelfDraw: capturedSelfDraw };
assert.equal(selfDrawContext.resolveEndedAiSelfDraw(), null, 'an AI point win must not be misrendered as a self draw');
selfDrawContext.GS._lastResult = { type: '自摸', winner: 1, aiSelfDraw: capturedSelfDraw };
assert.equal(selfDrawContext.resolveEndedAiSelfDraw(), null, 'a mismatched self-draw winner must fail closed');

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
