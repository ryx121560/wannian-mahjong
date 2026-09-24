import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
const ruleBundle = fs.readFileSync(path.join(root, 'public/game/rule_engine.js'), 'utf8');
const snapshotSource = fs.readFileSync(path.join(root, 'public/game/session_snapshot.js'), 'utf8');

function loadRules() {
  const context = { window: {} };
  vm.runInNewContext(ruleBundle, context, { filename: 'rule_engine.js' });
  return context.window.WannianRuleEngine;
}

function loadSession() {
  const context = { window: {} };
  vm.runInNewContext(snapshotSource, context, { filename: 'session_snapshot.js' });
  return context.window.GameSessionSnapshot;
}

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

function player(index, hand, melds) {
  return { name: index === 0 ? 'You' : `AI${index}`, human: index === 0, score: 100, hand, melds: melds || [] };
}

const rules = loadRules();
for (const name of [
  'resolveSpecialKongAction',
  'scoreSpecialKongSettlement',
  'enumeratePostPongCandidateConcealedKongs',
  'transitionCandidateConcealedKongResource',
  'prepareAddedKongChainWindow',
]) assert.equal(typeof rules[name], 'function', `browser rule bundle must expose ${name}`);

for (const name of [
  'collectPageSpecialKongChoices',
  'openPageSpecialKongChoiceWindow',
  'applyPageSpecialKongChoice',
  'cancelPageSpecialKongChoice',
  'resolvePageSpecialKongAction',
  'preflightPageSpecialKongResolution',
  'applyPageSpecialKongAction',
]) assert.match(html, new RegExp(`function ${name}\\(`), `page must expose ${name}`);
assert.match(html, /_candidateKongResources/, 'page must keep candidate resources separately from legacy resources');
assert.match(html, /_specialKongChoiceWindow/, 'page must keep an explicit special-kong choice window');
assert.match(extractFunction('pageKongActionLabel'), /addedKongChain/, 'page settlement summaries must retain the matching-pong chain action category');

const candidateResource = {
  owner: 0,
  pongMeld: { type: 'peng', tiles: ['dong', 'dong', 'dong'], fromPlayer: 1 },
  candidateKongTile: 'wan1',
  status: 'active',
};
const snapshotState = {
  wall: [],
  players: [player(0, ['wan1', 'wan1', 'wan1', 'wan1'], [{ tile: 'dong', count: 3, fromPlayer: 1 }]), player(1, [], []), player(2, [], []), player(3, [], [])],
  discards: [], playerDiscards: [[], [], [], []], lastDiscard: null, lastDiscardP: -1,
  cur: 0, dealer: 0, turn: 4, phase: 'discarding', canP: false, canK: true, canW: false, canWS: false,
  _resp: null, _respP: -1, _responseKind: null, _kc: {}, _hasWild: {}, _kongResources: [],
  _candidateKongResources: [candidateResource], _kongActionWindow: null,
  _specialKongChoiceWindow: { owner: 0, phase: 'discarding', choices: [{ key: 'postPongCandidateConcealedKong:wan1:dong', kind: 'postPongCandidateConcealedKong', tile: 'wan1' }] },
  newDrawnTile: null, newDrawnIdx: -1,
};
const session = loadSession();
const snapshot = session.create(snapshotState, { totalGames: 0, selfPlayRunning: false }, (tile) => tile);
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.kongContext.candidateResources)), [candidateResource], 'snapshot must persist a validated candidate resource');
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.kongContext.choiceWindow)), snapshotState._specialKongChoiceWindow, 'snapshot must persist the choice window');
const restored = session.restore(snapshot, (tile) => tile);
assert.equal(restored.ok, true, 'candidate-resource snapshot must restore');
assert.deepEqual(JSON.parse(JSON.stringify(restored.state._candidateKongResources)), [candidateResource], 'restored state must retain candidate resources');
assert.deepEqual(JSON.parse(JSON.stringify(restored.state._specialKongChoiceWindow)), snapshotState._specialKongChoiceWindow, 'restored state must retain the choice window');
const legacy = JSON.parse(JSON.stringify(snapshot));
delete legacy.kongContext.candidateResources;
delete legacy.kongContext.choiceWindow;
const legacyRestored = session.restore(legacy, (tile) => tile);
assert.equal(legacyRestored.ok, true, 'old snapshots must remain valid without phase2 fields');
assert.deepEqual(JSON.parse(JSON.stringify(legacyRestored.state._candidateKongResources)), [], 'old snapshots must default candidate resources');
assert.equal(legacyRestored.state._specialKongChoiceWindow, null, 'old snapshots must default choice windows');

const addedChainWindowForSnapshot = {
  kind: 'addedKongChain', owner: 0,
  initialResource: {
    owner: 0, tile: 'wan2', source: 'pong', status: 'active',
    pongMeld: { type: 'peng', tiles: ['wan2', 'wan2', 'wan2'], fromPlayer: 2 },
  },
  chainPongMeld: { type: 'peng', tiles: ['wan1', 'wan1', 'wan1'], fromPlayer: 1 },
  preKongHand: ['wan2', 'zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  initialHandAfterKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  initialMelds: [
    { type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 },
    { type: 'peng', tiles: ['wan1', 'wan1', 'wan1'], fromPlayer: 1 },
  ],
  firstDrawTile: 'wan1',
};
const addedChainSnapshotState = {
  ...snapshotState,
  _kongActionWindow: addedChainWindowForSnapshot,
  _specialKongChoiceWindow: null,
};
const addedChainSnapshot = session.create(addedChainSnapshotState, { totalGames: 0, selfPlayRunning: false }, (tile) => tile);
const addedChainRestored = session.restore(addedChainSnapshot, (tile) => tile);
assert.equal(addedChainRestored.ok, true, 'added-kong chain window snapshot must restore without losing its replay context');
assert.deepEqual(JSON.parse(JSON.stringify(addedChainRestored.state._kongActionWindow)), addedChainWindowForSnapshot, 'added-kong chain window restore must retain the exact replay context');
function loadSpecialPageExecutor() {
  const context = {
    RULE_ENGINE: loadRules(), GS: null,
    kt: (tile) => (typeof tile === 'string' ? { k: tile } : tile),
    tkey: (tile) => (typeof tile === 'string' ? tile : tile.k),
    teq: (left, right) => left.k === right.k,
    logEvent: () => {}, completePageKongSettlement: () => true, setMsg: () => {}, render: () => {}, updateBtns: () => {}, saveGameSnapshot: () => {}, clearPlayerDrawMarker: () => {},
  };
  vm.createContext(context);
  for (const name of [
    'ruleTiles', 'ruleMeldsFromPlayer', 'ruleMeldsForPlayer', 'removePageTiles',
    'pageKongResources', 'setPageKongResources', 'replacePageKongResource', 'activePageKongResource',
    'pageCandidateKongResources', 'setPageCandidateKongResources', 'hasPageRuleMeld', 'replacePageCandidateKongResource',
    'resolvePageSpecialKongAction', 'preflightPageSpecialKongResolution', 'hasPageKongSettlementContract',
    'isPageSpecialKongCommitResultValid', 'applyPageSpecialKongAction', 'cancelPageSpecialKongChoice', 'resetPageKongResponseState', 'preparePageAddedKongFirstAction', 'applyPageAddedKongFirstAction', 'revalidateRestoredKongState',
  ]) vm.runInContext(extractFunction(name), context, { filename: `page-${name}.js` });
  return context;
}

const candidateAction = {
  kind: 'postPongCandidateConcealedKong',
  input: {
    owner: 0, resource: candidateResource,
    preKongHand: ['wan1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan5', 'wan5', 'wan5', 'bai', 'bai'],
    handAfterKong: ['wan2', 'wan2', 'wan2', 'wan5', 'wan5', 'wan5', 'bai', 'bai'],
    melds: [{ type: 'peng', tiles: ['dong', 'dong', 'dong'], fromPlayer: 1 }, { type: 'anGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'] }],
  },
};
const specialState = {
  players: [
    { name: 'You', human: true, score: 100, hand: candidateAction.input.preKongHand.map((tile) => ({ k: tile })), melds: [{ tile: { k: 'dong' }, count: 3, fromPlayer: 1 }] },
    player(1, [], []), player(2, [], []), player(3, [], []),
  ],
  wall: [{ k: 'bai' }], _candidateKongResources: [{ ...candidateResource }], _kongResources: [],
  _kongActionWindow: null, _specialKongChoiceWindow: null, _kc: {}, newDrawnTile: null, newDrawnIdx: -1,
};
const specialExecutor = loadSpecialPageExecutor();
specialExecutor.GS = specialState;
assert.equal(specialExecutor.applyPageSpecialKongAction(candidateAction), true, 'candidate concealed kong must commit after the rule-core preflight succeeds');
assert.equal(Array.from(specialState.players[0].hand, (tile) => tile.k).sort().join(','), ['bai', 'bai', 'bai', 'wan2', 'wan2', 'wan2', 'wan5', 'wan5', 'wan5'].join(','), 'candidate commit must remove four physical tiles and add one supplement');
assert.equal(specialState.players[0].melds.filter((meld) => meld.count === 4 && meld.concealed).length, 1, 'candidate commit must preserve a physical concealed four-tile meld');
assert.equal(specialState._candidateKongResources[0].status, 'consumed', 'candidate commit must consume only the declared candidate resource');
assert.deepEqual(specialState.wall, [], 'candidate commit must consume exactly one wall tile');


const forcedAction = {
  kind: 'forcedRunConcealed',
  input: {
    owner: 0, kongTile: 'wan1',
    preKongHand: ['fa', 'fa', 'wan1', 'wan1', 'wan1', 'wan1', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tong5', 'tong6', 'dong'],
    handAfterKong: ['fa', 'fa', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tong5', 'tong6', 'dong'],
    melds: [{ type: 'anGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'] }],
  },
};
const forcedState = {
  players: [{ name: 'You', human: true, score: 100, hand: forcedAction.input.preKongHand.map((tile) => ({ k: tile })), melds: [] }, player(1, [], []), player(2, [], []), player(3, [], [])],
  wall: [{ k: 'tiao4' }], _kongResources: [], _candidateKongResources: [], _kongActionWindow: null, _specialKongChoiceWindow: null, _kc: {}, newDrawnTile: { k: 'dong' }, newDrawnIdx: 13,
};
specialExecutor.GS = forcedState;
assert.equal(specialExecutor.applyPageSpecialKongAction(forcedAction), true, 'concealed forced run must use the special core and commit its successful fake-win path');
assert.equal(forcedState.players[0].melds[0].count, 4, 'concealed forced run must write one physical four-tile concealed meld');
assert.deepEqual(forcedState.wall, [], 'concealed forced run must consume exactly one supplement');

const pongOne = { owner: 0, tile: 'wan1', pongMeld: { type: 'peng', tiles: ['wan1', 'wan1', 'wan1'], fromPlayer: 1 }, source: 'pong', status: 'active' };
const pongTwo = { owner: 0, tile: 'wan2', pongMeld: { type: 'peng', tiles: ['wan2', 'wan2', 'wan2'], fromPlayer: 2 }, source: 'pong', status: 'active' };
const doubleAction = {
  kind: 'doublePongForcedRun',
  input: {
    owner: 0, selectedResource: pongOne, conditionalResource: pongTwo,
    preKongHand: ['wan1', 'wan2', 'zhong', 'zhong', 'tong5', 'tong6', 'tiao5', 'tiao6', 'dong'],
    handAfterKong: ['wan2', 'zhong', 'zhong', 'tong5', 'tong6', 'tiao5', 'tiao6', 'dong'],
    melds: [{ type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 }, pongTwo.pongMeld],
  },
};
const doubleState = {
  players: [{ name: 'You', human: true, score: 100, hand: doubleAction.input.preKongHand.map((tile) => ({ k: tile })), melds: [{ tile: { k: 'wan1' }, count: 3, fromPlayer: 1 }, { tile: { k: 'wan2' }, count: 3, fromPlayer: 2 }] }, player(1, [], []), player(2, [], []), player(3, [], [])],
  wall: [{ k: 'tong4' }], _kongResources: [{ ...pongOne }, { ...pongTwo }], _candidateKongResources: [], _kongActionWindow: null, _specialKongChoiceWindow: null, _kc: {}, newDrawnTile: { k: 'dong' }, newDrawnIdx: 8,
};
specialExecutor.GS = doubleState;
assert.equal(specialExecutor.applyPageSpecialKongAction(doubleAction), true, 'double-pong forced run must commit only through the special core preflight');
assert.equal(doubleState.players[0].melds.find((meld) => meld.tile.k === 'wan1').count, 4, 'selected double-pong resource must become the declared kong');
assert.equal(doubleState._kongResources.find((resource) => resource.tile === 'wan1').status, 'consumed', 'selected double-pong resource must be consumed');
assert.equal(doubleState._kongResources.find((resource) => resource.tile === 'wan2').status, 'active', 'unselected double-pong resource must remain active');
assert.deepEqual(doubleState.wall, [], 'double-pong forced run must consume one supplement');

for (const name of ['preparePageAddedKongChainAction', 'openPageAddedKongChainWindow', 'applyPageAddedKongChainAction']) {
  assert.match(html, new RegExp(`function ${name}\\(`), `page must expose ${name} for matching-pong chain kong`);
}
const firstAddedChainState = {
  players: [{
    name: 'You', human: true, score: 100,
    hand: ['wan2', 'zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'].map((tile) => ({ k: tile })),
    melds: [{ tile: { k: 'wan2' }, count: 3, fromPlayer: 2 }, { tile: { k: 'wan1' }, count: 3, fromPlayer: 1 }],
  }, player(1, [], []), player(2, [], []), player(3, [], [])],
  wall: [{ k: 'wan1' }], _kongResources: [{ ...pongTwo }], _candidateKongResources: [], _kongActionWindow: null,
  _specialKongChoiceWindow: null, _kc: {}, cur: 0, phase: 'discarding', newDrawnTile: { k: 'zhong' }, newDrawnIdx: 1,
};
specialExecutor.GS = firstAddedChainState;
const firstAddedChainPlan = specialExecutor.preparePageAddedKongFirstAction(0, { type: 'add', tile: { k: 'wan2' } });
assert.ok(firstAddedChainPlan, 'first added kong must preflight a matching real-pong chain window before any page write');
assert.equal(firstAddedChainPlan.windowInput.chainPongMeld.tiles[0], 'wan1', 'the first supplement must bind the distinct matching real pong');
assert.equal(specialExecutor.applyPageAddedKongFirstAction(firstAddedChainPlan), true, 'first added kong must atomically create the manual chain window');
assert.equal(firstAddedChainState.players[0].melds.find((meld) => meld.tile.k === 'wan2').count, 4, 'first added kong must upgrade only the declared first pong');
assert.equal(firstAddedChainState.players[0].melds.find((meld) => meld.tile.k === 'wan1').count, 3, 'first added kong must not consume the matching second pong before manual chain declaration');
assert.equal(firstAddedChainState._kongActionWindow.kind, 'addedKongChain', 'first added kong must persist the chain window for later manual declaration');
assert.equal(firstAddedChainState._kongResources.find((resource) => resource.tile === 'wan2').status, 'consumed', 'the first added kong must consume its live resource while retaining an active replay context in the chain window');
assert.deepEqual(firstAddedChainState.wall, [], 'first added kong must consume exactly the first supplement before opening the chain window');
const firstAddedChainRestore = specialExecutor.revalidateRestoredKongState(firstAddedChainState);
assert.equal(firstAddedChainRestore.reason, 'ok', 'added-kong chain restore must not invalidate a consumed live resource that has an active replay context');
assert.equal(firstAddedChainState._kongActionWindow.kind, 'addedKongChain', 'added-kong chain restore must retain the manual second-kong window');
const cancelChoiceState = {
  players: [player(0, [], []), player(1, [], []), player(2, [], []), player(3, [], [])],
  _kongResources: [{ ...pongOne }], _candidateKongResources: [{ ...candidateResource }],
  _specialKongChoiceWindow: { owner: 0, phase: 'discarding', choices: [{ key: 'forcedRunConcealed:wan1:', kind: 'forcedRunConcealed', tile: 'wan1' }] },
};
let cancelSnapshotWrites = 0;
specialExecutor.GS = cancelChoiceState;
specialExecutor.saveGameSnapshot = () => { cancelSnapshotWrites += 1; };
assert.equal(specialExecutor.cancelPageSpecialKongChoice(), true, 'cancel must close a visible special-kong choice window');
assert.equal(cancelChoiceState._specialKongChoiceWindow, null, 'cancel must clear the persisted choice window');
assert.equal(cancelChoiceState._kongResources[0].status, 'active', 'cancel must not consume ordinary kong resources');
assert.equal(cancelChoiceState._candidateKongResources[0].status, 'active', 'cancel must not consume candidate concealed-kong resources');
assert.equal(cancelSnapshotWrites, 1, 'cancel must persist the cleared choice window so refresh cannot reopen it');
const addedChainAction = {
  kind: 'addedKongChain',
  input: {
    owner: 0,
    initialResource: pongTwo,
    chainPongMeld: pongOne.pongMeld,
    preKongHand: ['wan2', 'zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
    initialHandAfterKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
    initialMelds: [
      { type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 },
      pongOne.pongMeld,
    ],
    firstDrawTile: 'wan1',
    handBeforeChainKong: ['zhong', 'wan1', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
    handAfterChainKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
    melds: [
      { type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 },
      { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 },
    ],
  },
};
const addedChainState = {
  players: [{
    name: 'You', human: true, score: 100,
    hand: addedChainAction.input.handBeforeChainKong.map((tile) => ({ k: tile })),
    melds: [{ tile: { k: 'wan2' }, count: 4, fromPlayer: 2 }, { tile: { k: 'wan1' }, count: 3, fromPlayer: 1 }],
  }, player(1, [], []), player(2, [], []), player(3, [], [])],
  wall: [{ k: 'zhong' }], _kongResources: [{ ...pongTwo, status: 'consumed' }], _candidateKongResources: [],
  _kongActionWindow: {
    kind: 'addedKongChain', owner: 0, initialResource: { ...pongTwo }, chainPongMeld: pongOne.pongMeld,
    preKongHand: addedChainAction.input.preKongHand.slice(), initialHandAfterKong: addedChainAction.input.initialHandAfterKong.slice(),
    initialMelds: JSON.parse(JSON.stringify(addedChainAction.input.initialMelds)), firstDrawTile: 'wan1',
  },
  _specialKongChoiceWindow: null, _kc: {}, newDrawnTile: { k: 'wan1' }, newDrawnIdx: 3,
};
specialExecutor.GS = addedChainState;
assert.equal(specialExecutor.applyPageSpecialKongAction(addedChainAction), true, 'matching-pong chain kong must settle only through special rule-core preflight');
assert.equal(addedChainState.players[0].melds.find((meld) => meld.tile.k === 'wan1').count, 4, 'matching-pong chain commit must upgrade the second real pong only after preflight');
assert.equal(addedChainState._kongResources.find((resource) => resource.tile === 'wan2').status, 'consumed', 'matching-pong chain commit must consume the carried initial resource exactly once');
assert.deepEqual(addedChainState.wall, [], 'matching-pong chain commit must consume exactly one second supplement');

// A real matching-pong chain upgrades a real peng with its single drawn fourth tile.
// The fourth tile is not four concealed copies in hand.
const realAddedChainInput = {
  owner: 0,
  initialResource: pongTwo,
  chainPongMeld: pongOne.pongMeld,
  preKongHand: ['wan2', 'zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  initialHandAfterKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  initialMelds: [
    { type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 },
    pongOne.pongMeld,
  ],
  firstDrawTile: 'wan1',
  handBeforeChainKong: ['zhong', 'wan1', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  handAfterChainKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  melds: [
    { type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 },
    { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 },
  ],
  drawTile: 'zhong',
};
assert.doesNotThrow(() => rules.resolveAddedKongChain(realAddedChainInput), 'a real peng plus its one drawn fourth tile must resolve a matching-pong chain');

const realAddedChainState = {
  players: [{
    name: 'You', human: true, score: 100,
    hand: realAddedChainInput.handBeforeChainKong.map((tile) => ({ k: tile })),
    melds: [{ tile: { k: 'wan2' }, count: 4, fromPlayer: 2 }, { tile: { k: 'wan1' }, count: 3, fromPlayer: 1 }],
  }, player(1, [], []), player(2, [], []), player(3, [], [])],
  wall: [{ k: 'zhong' }], _kongResources: [{ ...pongTwo, status: 'consumed' }], _candidateKongResources: [],
  _kongActionWindow: {
    kind: 'addedKongChain', owner: 0, initialResource: { ...pongTwo }, chainPongMeld: pongOne.pongMeld,
    preKongHand: realAddedChainInput.preKongHand.slice(), initialHandAfterKong: realAddedChainInput.initialHandAfterKong.slice(),
    initialMelds: JSON.parse(JSON.stringify(realAddedChainInput.initialMelds)), firstDrawTile: 'wan1',
  },
  _specialKongChoiceWindow: null, _kc: {}, newDrawnTile: { k: 'wan1' }, newDrawnIdx: 1,
};
specialExecutor.GS = realAddedChainState;
assert.equal(specialExecutor.revalidateRestoredKongState(realAddedChainState).reason, 'ok', 'restored matching-pong chain window must retain its one fourth tile');
assert.equal(specialExecutor.applyPageSpecialKongAction({ kind: 'addedKongChain', input: realAddedChainInput }), true, 'matching-pong chain must atomically upgrade the real peng by consuming only its drawn fourth tile');
assert.equal(realAddedChainState.players[0].melds.find((meld) => meld.tile.k === 'wan1').count, 4, 'chain commit must upgrade the existing real peng');
assert.deepEqual(Array.from(realAddedChainState.players[0].hand, (tile) => tile.k).sort(), ['tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'zhong', 'zhong'].sort(), 'chain commit must remove only the drawn fourth tile and add one second supplement');

let routedAddedChain = null;
const routeContext = {
  GS: { players: [player(0, [], []), player(1, [], []), player(2, [], []), player(3, [], [])] },
  clearSelectedTile: () => {},
  kt: (tile) => (typeof tile === 'string' ? { k: tile } : tile),
  collectPageSpecialKongChoices: () => [],
  collectPageKongDeclarations: () => [{
    kind: 'addedKongChain',
    action: { kind: 'addedKongChain', input: realAddedChainInput },
    info: { type: 'addedKongChain', tile: { k: 'wan1' } },
  }],
  preparePageAddedKongChainAction: () => ({ kind: 'addedKongChain', input: realAddedChainInput }),
  resolvePageRobKongWinner: () => null,
  applyPageAddedKongChainAction: (action) => { routedAddedChain = action; return true; },
  preparePageChainKongAction: () => null,
  preparePageDeferredKongAction: () => null,
  canSelfKong: () => null,
};
vm.createContext(routeContext);
vm.runInContext(extractFunction('doSelfKong'), routeContext, { filename: 'page-doSelfKong.js' });
assert.equal(routeContext.doSelfKong(0), true, 'manual matching-pong chain must route through the second-kong rob check before legacy self-kong logic');
assert.equal(routedAddedChain.kind, 'addedKongChain', 'manual matching-pong chain must use the dedicated action path');
let aiAddedChainRoutes = 0;
const aiAddedChainContext = {
  currentAiSelfKongDeclaration: (_playerId, info) => info,
  logAiResponseDecision: () => {},
  pageKongActionLabel: (kind) => kind,
  doSelfKong: () => { aiAddedChainRoutes += 1; return 'routed'; },
};
vm.createContext(aiAddedChainContext);
vm.runInContext(extractFunction('aiSelfKong'), aiAddedChainContext, { filename: 'page-aiSelfKong-added-chain.js' });
assert.equal(
  aiAddedChainContext.aiSelfKong(0, { type: 'addedKongChain', tile: { k: 'wan1' } }),
  'routed',
  'AI added-kong-chain selection must delegate to the explicit doSelfKong action path',
);
assert.equal(aiAddedChainRoutes, 1, 'AI must not fall through to the legacy concealed-kong mutation path for an added-kong chain');

let robChainCommit = false;
let robChainWinner = null;
const robRouteContext = {
  GS: { players: [player(0, [], []), player(1, [], []), player(2, [], []), player(3, [], [])] },
  clearSelectedTile: () => {},
  kt: (tile) => (typeof tile === 'string' ? { k: tile } : tile),
  collectPageSpecialKongChoices: () => [],
  collectPageKongDeclarations: () => [{
    kind: 'addedKongChain',
    action: { kind: 'addedKongChain', input: realAddedChainInput },
    info: { type: 'addedKongChain', tile: { k: 'wan1' } },
  }],
  preparePageAddedKongChainAction: () => ({ kind: 'addedKongChain', input: realAddedChainInput }),
  resolvePageRobKongWinner: () => 1,
  applyPageAddedKongChainAction: () => { robChainCommit = true; return true; },
  setMsg: () => {},
  applyWin: (winner) => { robChainWinner = winner; },
  preparePageChainKongAction: () => null,
  preparePageDeferredKongAction: () => null,
  canSelfKong: () => null,
};
vm.createContext(robRouteContext);
vm.runInContext(extractFunction('doSelfKong'), robRouteContext, { filename: 'page-doSelfKong-rob.js' });
assert.equal(robRouteContext.doSelfKong(0), true, 'a matching-pong chain declaration must honor rob-kong before second-kong commit');
assert.equal(robChainWinner, 1, 'the nearest resolved rob-kong winner must receive the win path');
assert.equal(robChainCommit, false, 'rob-kong must leave the second-kong page commit unopened');

function createAddedChainEligibilityContext(phase) {
  let robCalls = 0;
  let commitCalls = 0;
  let winCalls = 0;
  let saveCalls = 0;
  const state = {
    phase,
    cur: 0,
    wall: [{ k: 'wan1' }],
    players: [player(0, [{ k: 'zhong' }], []), player(1, [], []), player(2, [], []), player(3, [], [])],
    _kongActionWindow: { kind: 'addedKongChain', owner: 0 },
    _kongResources: [{ ...pongTwo, status: 'consumed' }],
    _candidateKongResources: [],
    _specialKongChoiceWindow: null,
    _kc: {},
    newDrawnTile: phase === 'drawing' ? null : { k: 'wan1' },
    newDrawnIdx: phase === 'drawing' ? -1 : 1,
    canK: false,
    canWS: false,
    logs: [],
  };
  const context = {
    GS: state,
    kt: (tile) => (typeof tile === 'string' ? { k: tile } : tile),
    tkey: (tile) => (typeof tile === 'string' ? tile : tile.k),
    collectPageKongDeclarations: () => [{
      kind: 'addedKongChain',
      action: { kind: 'addedKongChain', input: realAddedChainInput },
      info: { type: 'addedKongChain', tile: { k: 'wan1' }, action: { kind: 'addedKongChain', input: realAddedChainInput } },
    }],
    preparePageAddedKongChainAction: () => ({ kind: 'addedKongChain', input: realAddedChainInput }),
    preparePageChainKongAction: () => null,
    preparePageDeferredKongAction: () => null,
    resolvePageRobKongWinner: () => { robCalls += 1; return 1; },
    applyPageAddedKongChainAction: () => { commitCalls += 1; return true; },
    applyWin: () => { winCalls += 1; },
    canSelfWinForPlayer: () => false,
    clearPlayerDrawMarker: () => {},
    clearSelectedTile: () => {},
    logEvent: () => {},
    setMsg: () => {},
    render: () => {},
    updateBtns: () => {},
    updateSuggestion: () => {},
    saveGameSnapshot: () => { saveCalls += 1; },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('canSelfKong'), context, { filename: 'page-canSelfKong-pure.js' });
  vm.runInContext(extractFunction('completeHumanDraw'), context, { filename: 'page-completeHumanDraw-pure.js' });
  return { context, state, counts: () => ({ robCalls, commitCalls, winCalls, saveCalls }) };
}

const queryContext = createAddedChainEligibilityContext('discarding');
const queryBefore = JSON.stringify(queryContext.state);
const queryEligibility = queryContext.context.canSelfKong(0);
assert.equal(queryEligibility.type, 'addedKongChain', 'canSelfKong must describe an added-kong chain eligibility without executing it');
assert.equal(JSON.stringify(queryContext.state), queryBefore, 'canSelfKong eligibility query must leave all game state unchanged');
assert.deepEqual(queryContext.counts(), { robCalls: 0, commitCalls: 0, winCalls: 0, saveCalls: 0 }, 'canSelfKong must not resolve rob-kong, commit, settle, or save');
const actualHelperState = {
  newDrawnTile: { k: 'wan1' },
  players: [{
    hand: [{ k: 'wan1' }],
    melds: [{ tile: { k: 'wan2' }, count: 4, fromPlayer: 2 }, { tile: { k: 'wan1' }, count: 3, fromPlayer: 1 }],
  }, player(1, [], []), player(2, [], []), player(3, [], [])],
  _kongActionWindow: {
    kind: 'addedKongChain', owner: 0, initialResource: pongTwo, chainPongMeld: pongOne.pongMeld,
    preKongHand: realAddedChainInput.preKongHand, initialHandAfterKong: realAddedChainInput.initialHandAfterKong,
    initialMelds: realAddedChainInput.initialMelds, firstDrawTile: 'wan1',
  },
};
const actualHelperContext = {
  GS: actualHelperState,
  kt: (tile) => (typeof tile === 'string' ? { k: tile } : tile),
  tkey: (tile) => (typeof tile === 'string' ? tile : tile.k),
  ruleTiles: (hand) => hand.map((tile) => (typeof tile === 'string' ? tile : tile.k)),
  removePageTiles: (hand, tile, count) => {
    const result = hand.slice();
    let remaining = count;
    for (let index = result.length - 1; index >= 0 && remaining > 0; index -= 1) {
      if ((result[index].k || result[index]) === (tile.k || tile)) { result.splice(index, 1); remaining -= 1; }
    }
    return remaining === 0 ? result : null;
  },
  ruleMeldsForPlayer: () => [
    { type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 },
    { type: 'peng', tiles: ['wan1', 'wan1', 'wan1'], fromPlayer: 1 },
  ],
  collectPageKongDeclarations: (owner) => {
    const action = actualHelperContext.preparePageAddedKongChainAction(owner);
    return action ? [{ kind: 'addedKongChain', action, info: { type: 'addedKongChain', tile: { k: 'wan1' }, action } }] : [];
  },
  RULE_ENGINE: { prepareAddedKongChainWindow: () => ({ canDeclare: true }) },
};
vm.createContext(actualHelperContext);
vm.runInContext(extractFunction('preparePageAddedKongChainAction'), actualHelperContext, { filename: 'page-added-chain-actual-helper.js' });
vm.runInContext(extractFunction('canSelfKong'), actualHelperContext, { filename: 'page-canSelfKong-actual-helper.js' });
const actualHelperBefore = JSON.stringify(actualHelperState);
assert.equal(actualHelperContext.canSelfKong(0).type, 'addedKongChain', 'actual added-chain eligibility helper must describe the matching-pong chain');
assert.equal(JSON.stringify(actualHelperState), actualHelperBefore, 'actual added-chain eligibility helper must remain side-effect free when queried');

const drawContext = createAddedChainEligibilityContext('drawing');
assert.equal(drawContext.context.completeHumanDraw(0, 'phase2-purity'), true, 'normal human draw must still compute a kong eligibility');
assert.equal(drawContext.state.canK, true, 'matching-pong chain eligibility must remain available after the normal draw');
assert.deepEqual(drawContext.counts(), { robCalls: 0, commitCalls: 0, winCalls: 0, saveCalls: 1 }, 'completeHumanDraw may save the normal draw snapshot but must not resolve rob-kong, commit, or settle a chain');
assert.equal(drawContext.state._kongActionWindow.kind, 'addedKongChain', 'canK refresh must not consume or clear the chain window');
console.log('P0 special kong page phase2 regression: passed');
