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

const events = [];
const context = {
  GS: {
    _respTimer: null, lastDiscard: { k: 'wan1' }, lastDiscardP: 2, cur: 0,
    players: [{ hand: [{ k: 'wan1' }, { k: 'wan1' }, { k: 'wan1' }], melds: [], human: true }],
    playerDiscards: [[], [], [{ k: 'wan1' }]], canP: true, canK: true, canW: false,
  },
  clearTimeout() {}, clearSelectedTile() {}, teq: (left, right) => left.k === right.k,
  preparePageInitialKongAction: () => ({ kind: 'directChisel', owner: 0, pointKongPlayer: 2, resource: { tile: 'wan1' } }),
  doKong: (player) => { events.push(['directChisel', player]); return true; },
  createPageKongResource() {}, setPageKongResources() {}, pageKongResources: () => [], ruleMeldsForPlayer: () => [],
  RULE_ENGINE: { enumeratePostPongCandidateConcealedKongs: () => [] }, ruleTiles: (hand) => hand.map((tile) => tile.k),
  logEvent: (...args) => events.push(['event', ...args]), clearPlayerDrawMarker() {}, setMsg() {}, render() {}, updateBtns() {}, saveGameSnapshot() {}, updateSuggestion() {},
};
vm.createContext(context);
vm.runInContext(extract('doPong'), context);
assert.equal(context.doPong(0), true);
assert.equal(events.length, 1, 'direct chisel must not first emit a pong event');
assert.equal(events[0][0], 'directChisel');
assert.equal(events[0][1], 0, 'direct chisel must reuse the existing kong entrypoint');
assert.deepEqual(context.GS.players[0].hand.map((tile) => tile.k), ['wan1', 'wan1', 'wan1'], 'direct chisel must not consume only two tiles as pong');
assert.match(extract('preparePageInitialKongAction'), /pointKongPlayer:GS\.lastDiscardP/);
assert.match(extract('applyInitialPageKongAction'), /preflightPageKongResolution\(action,owner,pointKongPlayer\)/);
assert.match(extract('resolvePageKongAction'), /pointKongPlayer:input\.pointKongPlayer/);
assert.match(extract('doPong'), /directChiselAction\.kind==='directChisel'\)return doKong\(p\)/);
assert.match(extract('doKong'), /resolveRobKongWinner/);

const ruleContext = {};
vm.createContext(ruleContext);
vm.runInContext(fs.readFileSync(path.join(process.cwd(), 'public/game/rule_engine.js'), 'utf8'), ruleContext);
const rules = ruleContext.WannianRuleEngine;
const resource = rules.createKongResource({
  owner: 0,
  tile: 'wan1',
  pongMeld: { type: 'peng', tiles: ['wan1', 'wan1', 'wan1'], fromPlayer: 2 },
  source: 'pong',
});
const action = {
  kind: 'directChisel', owner: 0, resource,
  preKongHand: ['wan1', 'nan', 'wan1', 'tong6', 'wan1', 'tong4', 'nan'],
  handAfterKong: ['nan', 'tong6', 'tong4', 'nan'],
  melds: [
    { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 2 },
    { type: 'peng', tiles: ['tong1', 'tong1', 'tong1'], fromPlayer: 2 },
    { type: 'peng', tiles: ['tong3', 'tong3', 'tong3'], fromPlayer: 3 },
  ],
  drawTile: 'tong4',
};
assert.equal(rules.resolveKongDraw(action).outcome, 'directChiselFakeWin');
const settlement = rules.scoreKongSettlement({ action, winner: 0, pointKongPlayer: 2, scores: [85, 43, 35, 41] });
assert.deepEqual(Array.from(settlement.payments), [0, 4, 8, 4], 'the discarder must pay double for a direct chisel');
assert.deepEqual(Array.from(settlement.delta), [16, -4, -8, -4], 'direct chisel must award the winner 16 points');
console.log('P0 direct chisel settlement regression passed');
