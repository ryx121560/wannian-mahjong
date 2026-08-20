import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const html = fs.readFileSync(path.join(process.cwd(), 'public/game/wannian-mahjong.html'), 'utf8');
function extract(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  let depth = 0;
  for (let index = html.indexOf('{', start); index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}' && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}
function tile(k) { return { k }; }
function runtime(hand, melds, declaration) {
  const events = [];
  const context = {
    GS: { phase: 'discarding', cur: 2, newDrawnTile: tile('tong9'), newDrawnIdx: hand.length - 1, wall: [tile('wan9')], _kc: [0, 0, 0], players: [null, null, { name: 'AI对家', human: false, hand, melds, score: 100 }] },
    teq: (left, right) => left.k === right.k,
    collectPageKongDeclarations: () => declaration ? [{ info: declaration }] : [],
    evaluateAiSelfKong: () => ({ allow: true, beforeShanten: 0, afterShanten: 0, rawAfterShanten: 0, routeAfter: 'fixture', waitBefore: [], waitAfter: [], lostWaits: [], reason: 'fixture' }),
    logAiResponseDecision: () => {}, clearPlayerDrawMarker: () => {}, markPlayerDrawnTile: () => {}, logEvent: (...args) => events.push(args),
    canHuNormal: () => ({ win: false }), concealedHand: (player) => context.GS.players[player].hand, ruleMeldsForPlayer: () => [], meetsThresh: () => false,
    canSelfWinForPlayer: () => false, setMsg: () => {}, render: () => {}, updateBtns: () => {}, saveGameSnapshot: () => {}, clearTimeout: () => {}, gameSetTimeout: () => 0, aiDiscard: () => {}, lbl: (value) => value.k,
  };
  vm.createContext(context);
  for (const name of ['currentAiSelfKongDeclaration', 'resumeAiDiscardAfterInvalidSelfKong', 'aiSelfKong']) vm.runInContext(extract(name), context);
  return { context, events };
}

{
  const hand = [tile('wan1'), tile('wan1'), tile('wan1'), tile('wan1'), tile('tong9')];
  const test = runtime(hand, [], { type: 'concealed', tile: tile('wan1') });
  assert.equal(test.context.aiSelfKong(2, { type: 'concealed', tile: tile('tong9') }), false);
  assert.deepEqual(test.context.GS.players[2].hand.map((value) => value.k), ['wan1', 'wan1', 'wan1', 'wan1', 'tong9']);
  assert.equal(test.context.GS.wall.length, 1); assert.equal(test.context.GS.players[2].melds.length, 0); assert.equal(test.events.length, 0);
}
{
  const hand = [tile('wan1'), tile('wan1'), tile('wan1'), tile('wan1'), tile('tong9')];
  const declaration = { type: 'concealed', tile: tile('wan1') };
  const test = runtime(hand, [], declaration);
  assert.equal(test.context.aiSelfKong(2, declaration), undefined);
  assert.deepEqual(test.context.GS.players[2].hand.map((value) => value.k), ['tong9', 'wan9']);
  assert.equal(test.context.GS.players[2].melds[0].tile.k, 'wan1'); assert.equal(test.context.GS.wall.length, 0);
  assert.deepEqual(test.events.map((event) => [event[1], event[2].k]), [['暗杠', 'wan1'], ['杠后摸', 'wan9']]);
}
{
  const hand = [tile('wan1'), tile('wan1'), tile('wan1'), tile('wan1'), tile('tong9')];
  const test = runtime(hand, [], null);
  assert.equal(test.context.aiSelfKong(2, { type: 'concealed', tile: tile('wan1') }), false);
  assert.equal(test.events.length, 0); assert.equal(test.context.GS.wall.length, 1);
}
{
  const hand = [tile('wan1'), tile('tong9')];
  const declaration = { type: 'add', tile: tile('wan1') };
  const test = runtime(hand, [{ tile: tile('wan1'), count: 3 }], declaration);
  test.context.aiSelfKong(2, declaration);
  assert.deepEqual(test.context.GS.players[2].hand.map((value) => value.k), ['tong9', 'wan9']);
  assert.equal(test.context.GS.players[2].melds[0].count, 4); assert.equal(test.context.GS.players[2].melds[0].tile.k, 'wan1');
  assert.equal(test.events[0][2].k, 'wan1');
}

console.log('P0 AI self-kong atomicity regression passed');
