import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
const ruleBundle = fs.readFileSync(path.join(root, 'public/game/rule_engine.js'), 'utf8');
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

function loadRules() {
  const context = { window: {} };
  vm.runInNewContext(ruleBundle, context, { filename: 'rule_engine.js' });
  return context.window.WannianRuleEngine;
}

function loadSessionSnapshot() {
  const context = { window: {} };
  vm.runInNewContext(snapshotSource, context, { filename: 'session_snapshot.js' });
  return context.window.GameSessionSnapshot;
}

function loadKongAdapter() {
  const context = {
    RULE_ENGINE: loadRules(),
    tkey: (tile) => tile,
    kt: (tile) => tile,
  };
  vm.createContext(context);
  for (const name of [
    'ruleTiles',
    'ruleMeldsFromPlayer',
    'createPageKongResource',
    'classifyPageDiscardKongAction',
    'transitionPageKongResources',
    'resolvePageKongAction',
  ]) vm.runInContext(extractFunction(name), context, { filename: `page-${name}.js` });
  return context;
}

function loadPageKongExecutors() {
  const context = {
    RULE_ENGINE: loadRules(),
    GS: null,
    kt: (tile) => (typeof tile === 'string' ? { k: tile } : tile),
    tkey: (tile) => (typeof tile === 'string' ? tile : tile.k),
    teq: (left, right) => left.k === right.k,
    logEvent: () => { throw new Error('initial kong preflight must not log'); },
    setMsg: () => { throw new Error('initial kong preflight must not update UI'); },
    render: () => { throw new Error('initial kong preflight must not render'); },
    updateBtns: () => { throw new Error('initial kong preflight must not update buttons'); },
    saveGameSnapshot: () => { throw new Error('initial kong preflight must not save'); },
    clearTimeout: () => { throw new Error('initial kong preflight must not schedule'); },
    gameSetTimeout: () => { throw new Error('initial kong preflight must not schedule'); },
    aiDiscard: () => { throw new Error('initial kong preflight must not discard'); },
    updateSuggestion: () => { throw new Error('initial kong preflight must not update suggestion'); },
    canSelfKong: () => false,
    pageKongActionLabel: () => '杠',
    pageKongResolutionLogMeta: () => ({}),
    openPageChainKongWindow: () => false,
    resetPageKongResponseState: () => { throw new Error('initial kong preflight must not reset response'); },
    replacePageKongResource: () => { throw new Error('initial kong preflight must not replace resource'); },
    completePageKongSettlement: () => { throw new Error('initial kong preflight must not settle'); },
  };
  vm.createContext(context);
  for (const name of [
    'removePageTiles',
    'resolvePageKongAction',
    'preflightPageKongResolution',
    'hasPageKongSettlementContract',
    'isPageKongCommitResultValid',
    'applyInitialPageKongAction',
    'applyPageDeferredKongAction',
    'applyPageChainKongAction',
  ]) {
    vm.runInContext(extractFunction(name), context, { filename: `page-${name}.js` });
  }
  return context;
}

const runtime = loadKongAdapter();
const browserRules = loadRules();
const normalConcealedAction = {
  owner: 0,
  kongTile: 'tong6',
  preKongHand: ['tong6', 'tong6', 'tong6', 'tong6', 'wan4', 'wan4', 'wan4', 'wan8', 'wan8', 'tiao2', 'tiao3', 'tiao4', 'tong5', 'tong5'],
  handAfterKong: ['wan4', 'wan4', 'wan4', 'wan8', 'wan8', 'tiao2', 'tiao3', 'tiao4', 'tong5', 'tong5'],
  melds: [{ type: 'anGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'] }],
  drawTile: 'wan6',
};
assert.equal(browserRules.resolveConcealedKongDraw(normalConcealedAction).outcome, 'concealedKongFakeWin', 'the page browser bundle must expose normal concealed-kong classification');
assert.deepEqual(
  JSON.parse(JSON.stringify(browserRules.scoreConcealedKongSettlement({ action: normalConcealedAction, winner: 0, scores: [100, 100, 100, 100] }).delta)),
  [12, -4, -4, -4],
  'the page browser bundle must expose ordinary concealed-kong settlement',
);
const player = {
  hand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tiao1'],
  melds: [],
};

const resource = runtime.createPageKongResource(1, 'tong6', 0);
assert.deepEqual(JSON.parse(JSON.stringify(resource)), {
  owner: 1,
  tile: 'tong6',
  pongMeld: { type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 0 },
  source: 'pong',
  status: 'active',
}, 'a page pong must create an owner-bound real KongResource');

const direct = runtime.classifyPageDiscardKongAction(player, 'tong6', 1, 0);
assert.equal(direct.kind, 'directChisel', 'the confirmed direct-chisel fixture must classify through the rule core');
assert.equal(direct.canDecline, true, 'the common kong button must remain optional');

const directAction = {
  kind: 'directChisel',
  owner: 1,
  resource,
  preKongHand: player.hand,
  handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tiao1'],
  melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
  drawTile: 'tiao1',
};
const directTrue = runtime.resolvePageKongAction({ action: directAction, winner: 1, pointKongPlayer: 0, scores: [100, 100, 100, 100] });
assert.equal(directTrue.resolution.outcome, 'directChiselTrueWin', 'the page bridge must preserve direct-chisel true-win classification from the rule core');
assert.deepEqual(JSON.parse(JSON.stringify(directTrue.settlement.delta)), [-8, 16, -4, -4], 'the page bridge must preserve direct-chisel true-win responsibility');
const directFake = runtime.resolvePageKongAction({ action: { ...directAction, drawTile: 'zhong' }, winner: 1, pointKongPlayer: 0, scores: [100, 100, 100, 100] });
assert.equal(directFake.resolution.outcome, 'directChiselFakeWin', 'a non-real direct supplement must remain a direct-chisel fake win');
assert.deepEqual(JSON.parse(JSON.stringify(directFake.settlement.delta)), [-4, 8, -2, -2], 'the page bridge must preserve direct-chisel fake-win responsibility');

const unchanged = runtime.transitionPageKongResources([resource], { type: 'discard', player: 2, tile: 'tong6' });
assert.equal(unchanged[0].status, 'active', 'another player cannot consume or invalidate a resource');
const invalidated = runtime.transitionPageKongResources([resource], { type: 'discard', player: 1, tile: 'tong6' });
assert.equal(invalidated[0].status, 'invalidated', 'discarding the retained resource tile must invalidate it');

const forcedAction = {
  kind: 'forcedRunImmediate',
  owner: 1,
  resource,
  preKongHand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
  drawTile: 'tiao4',
};
const forcedSuccess = runtime.resolvePageKongAction({
  action: forcedAction,
  winner: 1,
  scores: [100, 100, 100, 100],
});
assert.equal(forcedSuccess.resolution.outcome, 'forcedRunGangKaiFakeWin', 'page must use the core forced-run success outcome');
assert.deepEqual(JSON.parse(JSON.stringify(forcedSuccess.settlement.delta)), [-2, 6, -2, -2], 'page settlement must use the core per-payer result');

const forcedFailure = runtime.resolvePageKongAction({
  action: { ...forcedAction, drawTile: 'zhong' },
  winner: 1,
  scores: [100, 100, 100, 100],
});
assert.equal(forcedFailure.resolution.outcome, 'forcedRunFailureDiscard', 'failed forced run must remain a discard branch');
assert.equal(forcedFailure.settlement, null, 'failed forced run must not settle in the page');

const chainAction = {
  kind: 'chainKong',
  owner: 1,
  resource: { ...resource, status: 'consumed' },
  preKongHand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
  initialHandAfterKong: ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
  initialMelds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
  firstDrawTile: 'wan1',
  secondKongTile: 'wan1',
  secondKongMeld: { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 },
  handBeforeKong: ['wan1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
  handAfterKong: ['wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
  melds: [
    { type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 },
    { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 },
  ],
  drawTile: 'wan9',
};
const chainFake = runtime.resolvePageKongAction({ action: chainAction, winner: 1, pointKongPlayer: 0, scores: [100, 100, 100, 100] });
assert.equal(chainFake.resolution.outcome, 'directChiselChainFakeWin', 'the page bridge must preserve the chain-kong fake-win outcome');
assert.deepEqual(JSON.parse(JSON.stringify(chainFake.settlement.delta)), [-16, 32, -8, -8], 'the confirmed chain-kong 9wan fixture must settle 16/8/8 and net +32');

const pageKongExecutors = loadPageKongExecutors();
function pageTile(tile) {
  return { k: tile };
}

function initialKongState(hand, discardTile, wall) {
  return {
    players: Array.from({ length: 4 }, (_, index) => ({
      name: `P${index}`,
      human: true,
      score: 100 + index,
      hand: index === 1 ? hand.map(pageTile) : [],
      melds: [],
    })),
    playerDiscards: [[pageTile(discardTile)], [], [], []],
    lastDiscard: pageTile(discardTile),
    lastDiscardP: 0,
    wall: wall.map((tile) => (tile == null ? tile : pageTile(tile))),
    _kongResources: [{ ...resource }],
    _kongActionWindow: { kind: 'existing-window', owner: 1 },
    _kc: { 1: 2 },
    _aiActionTimer: 123,
    newDrawnTile: null,
    newDrawnIdx: -1,
    phase: 'responding',
    canK: true,
    _gameLog: { events: [{ action: 'before-kong' }] },
  };
}

for (const [name, action] of [
  ['direct chisel', directAction],
  ['immediate forced run', forcedAction],
]) {
  for (const [wallCase, wall] of [
    ['empty wall', []],
    ['unavailable supplement', [null]],
  ]) {
    const state = initialKongState(action.preKongHand, 'tong6', wall);
    const before = JSON.parse(JSON.stringify(state));
    pageKongExecutors.GS = state;
    assert.equal(
      pageKongExecutors.applyInitialPageKongAction({ ...action, resource: { ...action.resource } }),
      false,
      `${name} must reject ${wallCase}`,
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(state)),
      before,
      `${name} must leave every page state field unchanged when ${wallCase}`,
    );
  }
}

const invalidInitialState = initialKongState(directAction.preKongHand, 'tong6', ['tiao1']);
const invalidInitialBefore = JSON.parse(JSON.stringify(invalidInitialState));
pageKongExecutors.GS = invalidInitialState;
assert.equal(
  pageKongExecutors.applyInitialPageKongAction({ ...directAction, resource: { ...directAction.resource, status: 'consumed' } }),
  false,
  'an initial kong rejected by the rule core must not commit a partial page mutation',
);
assert.deepEqual(
  JSON.parse(JSON.stringify(invalidInitialState)),
  invalidInitialBefore,
  'a rule-core preflight rejection must preserve hand, meld, discard, wall, resource, score, and log state',
);

const deferredAction = {
  kind: 'forcedRunDeferred',
  owner: 1,
  resource,
  preKongHand: ['tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
  pointKongPlayer: null,
};

function deferredKongState(wall) {
  const state = initialKongState(deferredAction.preKongHand, 'tong6', wall);
  state.players[1].melds = [{ tile: pageTile('tong6'), count: 3, fromPlayer: 0 }];
  return state;
}

function chainKongState(wall) {
  const state = initialKongState(chainAction.handBeforeKong, 'tong6', wall);
  state.players[1].melds = [{ tile: pageTile('tong6'), count: 4, fromPlayer: 0 }];
  state._kongResources = [{ ...chainAction.resource }];
  state._kongActionWindow = {
    kind: 'directChisel',
    owner: 1,
    resource: { ...chainAction.resource },
    pointKongPlayer: 0,
  };
  return state;
}

function assertPageKongFailureIsAtomic(name, method, state, action) {
  const before = JSON.parse(JSON.stringify(state));
  pageKongExecutors.GS = state;
  assert.equal(pageKongExecutors[method](action), false, `${name} must reject without completing a partial kong`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(state)),
    before,
    `${name} must preserve hands, melds, discards, wall, resources, action window, scores, and logs`,
  );
}

for (const [wallCase, wall] of [
  ['empty wall', []],
  ['unavailable supplement', [null]],
]) {
  assertPageKongFailureIsAtomic(`deferred forced run with ${wallCase}`, 'applyPageDeferredKongAction', deferredKongState(wall), { ...deferredAction, resource: { ...resource } });
  assertPageKongFailureIsAtomic(`chain kong with ${wallCase}`, 'applyPageChainKongAction', chainKongState(wall), { ...chainAction, resource: { ...chainAction.resource } });
}

assertPageKongFailureIsAtomic(
  'deferred forced run rejected by the rule core',
  'applyPageDeferredKongAction',
  deferredKongState(['tiao4']),
  { ...deferredAction, resource: { ...resource, status: 'consumed' } },
);
assertPageKongFailureIsAtomic(
  'chain kong rejected by the rule core',
  'applyPageChainKongAction',
  chainKongState(['wan9']),
  { ...chainAction, resource: { ...chainAction.resource, status: 'active' } },
);

const missingSettlementState = chainKongState(['wan9']);
const missingSettlementBefore = JSON.parse(JSON.stringify(missingSettlementState));
const savedResolvePageKongAction = pageKongExecutors.resolvePageKongAction;
const savedLogEvent = pageKongExecutors.logEvent;
const savedCompletePageKongSettlement = pageKongExecutors.completePageKongSettlement;
const missingSettlementSideEffects = { log: 0, settlement: 0 };
pageKongExecutors.resolvePageKongAction = () => ({ resolution: { outcome: 'directChiselChainFakeWin' } });
pageKongExecutors.logEvent = () => { missingSettlementSideEffects.log += 1; };
pageKongExecutors.completePageKongSettlement = () => {
  missingSettlementSideEffects.settlement += 1;
  return false;
};
pageKongExecutors.GS = missingSettlementState;
try {
  assert.equal(
    pageKongExecutors.applyPageChainKongAction({ ...chainAction, resource: { ...chainAction.resource } }),
    false,
    'chain kong must reject a rule result without settlement before committing page state',
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(missingSettlementState)),
    missingSettlementBefore,
    'a chain kong without settlement must preserve the resource window, first draw, hand, melds, wall, scores, and log state',
  );
  assert.deepEqual(missingSettlementSideEffects, { log: 0, settlement: 0 }, 'a chain kong without settlement must not log or settle');
} finally {
  pageKongExecutors.resolvePageKongAction = savedResolvePageKongAction;
  pageKongExecutors.logEvent = savedLogEvent;
  pageKongExecutors.completePageKongSettlement = savedCompletePageKongSettlement;
}

function assertPageKongResultRejectedAtomic(name, method, state, action, result) {
  const before = JSON.parse(JSON.stringify(state));
  const original = {
    resolvePageKongAction: pageKongExecutors.resolvePageKongAction,
    replacePageKongResource: pageKongExecutors.replacePageKongResource,
    resetPageKongResponseState: pageKongExecutors.resetPageKongResponseState,
    completePageKongSettlement: pageKongExecutors.completePageKongSettlement,
    logEvent: pageKongExecutors.logEvent,
    setMsg: pageKongExecutors.setMsg,
    render: pageKongExecutors.render,
    updateBtns: pageKongExecutors.updateBtns,
    saveGameSnapshot: pageKongExecutors.saveGameSnapshot,
    clearTimeout: pageKongExecutors.clearTimeout,
    gameSetTimeout: pageKongExecutors.gameSetTimeout,
    aiDiscard: pageKongExecutors.aiDiscard,
    updateSuggestion: pageKongExecutors.updateSuggestion,
    canSelfKong: pageKongExecutors.canSelfKong,
  };
  const sideEffects = { resource: 0, response: 0, settlement: 0, log: 0, ui: 0, snapshot: 0, timer: 0 };
  pageKongExecutors.resolvePageKongAction = () => result;
  pageKongExecutors.replacePageKongResource = () => { sideEffects.resource += 1; };
  pageKongExecutors.resetPageKongResponseState = () => { sideEffects.response += 1; };
  pageKongExecutors.completePageKongSettlement = () => { sideEffects.settlement += 1; return false; };
  pageKongExecutors.logEvent = () => { sideEffects.log += 1; };
  pageKongExecutors.setMsg = () => { sideEffects.ui += 1; };
  pageKongExecutors.render = () => { sideEffects.ui += 1; };
  pageKongExecutors.updateBtns = () => { sideEffects.ui += 1; };
  pageKongExecutors.saveGameSnapshot = () => { sideEffects.snapshot += 1; };
  pageKongExecutors.clearTimeout = () => { sideEffects.timer += 1; };
  pageKongExecutors.gameSetTimeout = () => { sideEffects.timer += 1; return 456; };
  pageKongExecutors.aiDiscard = () => { sideEffects.timer += 1; };
  pageKongExecutors.updateSuggestion = () => { sideEffects.ui += 1; };
  pageKongExecutors.canSelfKong = () => false;
  pageKongExecutors.GS = state;
  try {
    assert.equal(pageKongExecutors[method](action), false, `${name} must reject before page state mutation`);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), before, `${name} must preserve every page state field`);
    assert.deepEqual(sideEffects, { resource: 0, response: 0, settlement: 0, log: 0, ui: 0, snapshot: 0, timer: 0 }, `${name} must not emit page side effects`);
  } finally {
    Object.assign(pageKongExecutors, original);
  }
}

const minimalResolution = (outcome) => ({ outcome, resourceAfterKong: { ...resource, status: 'consumed' } });
assertPageKongResultRejectedAtomic(
  'direct chisel with resolution but no settlement',
  'applyInitialPageKongAction',
  initialKongState(directAction.preKongHand, 'tong6', ['tiao1']),
  { ...directAction, resource: { ...resource } },
  { resolution: minimalResolution('directChiselTrueWin') },
);
assertPageKongResultRejectedAtomic(
  'immediate forced run success with resolution but no settlement',
  'applyInitialPageKongAction',
  initialKongState(forcedAction.preKongHand, 'tong6', ['tiao4']),
  { ...forcedAction, resource: { ...resource } },
  { resolution: minimalResolution('forcedRunGangKaiFakeWin') },
);
assertPageKongResultRejectedAtomic(
  'deferred forced run success with resolution but no settlement',
  'applyPageDeferredKongAction',
  deferredKongState(['tiao4']),
  { ...deferredAction, resource: { ...resource } },
  { resolution: minimalResolution('forcedRunGangKaiFakeWin') },
);
assertPageKongResultRejectedAtomic(
  'forced run failure carrying a settlement',
  'applyInitialPageKongAction',
  initialKongState(forcedAction.preKongHand, 'tong6', ['zhong']),
  { ...forcedAction, resource: { ...resource } },
  { resolution: minimalResolution('forcedRunFailureDiscard'), settlement: chainFake.settlement },
);

pageKongExecutors.GS = initialKongState(forcedAction.preKongHand, 'tong6', ['zhong']);
assert.equal(pageKongExecutors.isPageKongCommitResultValid(directAction, directTrue), true, 'direct chisel must require and accept its valid settlement');
assert.equal(pageKongExecutors.isPageKongCommitResultValid(chainAction, chainFake), true, 'chain kong must require and accept its valid settlement');
assert.equal(pageKongExecutors.isPageKongCommitResultValid(forcedAction, forcedSuccess), true, 'a successful forced run must require and accept its valid settlement');
assert.equal(pageKongExecutors.isPageKongCommitResultValid(forcedAction, forcedFailure), true, 'a real forced-run failure without settlement must retain the legal discard branch');
assert.equal(pageKongExecutors.isPageKongCommitResultValid(forcedAction, { resolution: minimalResolution('forcedRunFailureDiscard'), settlement: chainFake.settlement }), false, 'a failed forced run carrying settlement must be rejected');

const session = loadSessionSnapshot();
const snapshotState = {
  wall: [],
  players: Array.from({ length: 4 }, (_, index) => ({
    name: `P${index}`,
    human: index === 0,
    score: 100,
    hand: index === 1 ? ['tong6'] : [],
    melds: index === 1 ? [{ tile: 'tong6', count: 3, fromPlayer: 0 }] : [],
  })),
  discards: [],
  playerDiscards: [[], [], [], []],
  lastDiscard: null,
  lastDiscardP: -1,
  cur: 1,
  dealer: 0,
  turn: 12,
  phase: 'discarding',
  canP: false,
  canK: true,
  canW: false,
  canWS: false,
  _resp: null,
  _respP: -1,
  _responseKind: null,
  _kc: {},
  _hasWild: {},
  _kongResources: [resource],
  _kongActionWindow: { kind: 'forcedRunDeferred', owner: 1, resource },
  newDrawnTile: null,
  newDrawnIdx: -1,
};
const snapshot = session.create(snapshotState, { totalGames: 12, selfPlayRunning: false }, (tile) => tile);
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.kongContext.resources)), JSON.parse(JSON.stringify([resource])), 'snapshot must persist the real resource, not a global wild flag');
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.kongContext.actionWindow)), JSON.parse(JSON.stringify(snapshotState._kongActionWindow)), 'snapshot must persist the active kong action window');
const restoredSnapshot = session.restore(snapshot, (tile) => tile);
assert.equal(restoredSnapshot.ok, true, 'new resource snapshot must restore');
assert.deepEqual(JSON.parse(JSON.stringify(restoredSnapshot.state._kongResources)), JSON.parse(JSON.stringify([resource])), 'restored state must retain real resources');
assert.deepEqual(JSON.parse(JSON.stringify(restoredSnapshot.state._kongActionWindow)), JSON.parse(JSON.stringify(snapshotState._kongActionWindow)), 'restored state must retain the action window');
assert.equal(restoredSnapshot.state.players[1].melds[0].fromPlayer, 0, 'snapshot must retain the real pong source player');

const concealedKongSnapshotState = JSON.parse(JSON.stringify(snapshotState));
concealedKongSnapshotState.players[0].melds = [{ tile: 'tong6', count: 4, concealed: true }];
concealedKongSnapshotState._lastResult = {
  type: '杠开',
  kongAction: 'concealedKong',
  kongOutcome: 'concealedKongFakeWin',
  scoreDeltas: [12, -4, -4, -4],
};
const concealedKongSnapshot = session.create(concealedKongSnapshotState, { totalGames: 13, selfPlayRunning: false }, (tile) => tile);
assert.equal(concealedKongSnapshot.players[0].melds[0].concealed, true, 'ordinary concealed-kong snapshots must retain the real meld visibility');
const restoredConcealedKongSnapshot = session.restore(concealedKongSnapshot, (tile) => tile);
assert.equal(restoredConcealedKongSnapshot.ok, true, 'ordinary concealed-kong snapshots must restore');
assert.equal(restoredConcealedKongSnapshot.state.players[0].melds[0].concealed, true, 'restored ordinary concealed kong must remain an anGang');
assert.equal(restoredConcealedKongSnapshot.state._lastResult.kongOutcome, 'concealedKongFakeWin', 'trusted normal concealed-kong settlement summaries must persist across refresh');

const legacySnapshot = JSON.parse(JSON.stringify(snapshot));
delete legacySnapshot.kongContext.resources;
delete legacySnapshot.kongContext.actionWindow;
const restoredLegacy = session.restore(legacySnapshot, (tile) => tile);
assert.equal(restoredLegacy.ok, true, 'legacy snapshots without P0 fields must remain restorable');
assert.deepEqual(JSON.parse(JSON.stringify(restoredLegacy.state._kongResources)), [], 'legacy snapshots must default to no resource');
assert.equal(restoredLegacy.state._kongActionWindow, null, 'legacy snapshots must default to no action window');

assert.doesNotMatch(html, /Object\.values\(GS\._hasWild\|\|\{\}\)\.some/, 'page self-win must not use a global wild flag');
assert.match(
  extractFunction('resolveDiscardResponses'),
  /RULE_ENGINE\.getLegalActions\(pageRuleState\(state\),i\)/,
  'discard response legality must come from the rule core action list',
);
assert.match(
  extractFunction('doPong'),
  /createPageKongResource\(p,t,sourcePlayer\)/,
  'a pong that retains the third matching tile must create a real resource',
);
assert.match(
  extractFunction('doDiscard'),
  /applyPageKongDiscardLifecycle\(GS\.cur,tile\)/,
  'human discard must use the shared resource lifecycle transition',
);
assert.match(
  extractFunction('applyPageKongDiscardLifecycle'),
  /transitionPageKongResources\(pageKongResources\(\),\{type:'discard',player:playerIdx,tile:tkey\(tile\)\}\)/,
  'the shared discard lifecycle must transition resources through the rule core',
);
assert.match(
  extractFunction('aiDiscard'),
  /applyPageKongDiscardLifecycle\(p,t\)/,
  'AI discard must use the same resource lifecycle as human discard',
);
assert.match(
  extractFunction('aiSelfKong'),
  /return doSelfKong\(p\)/,
  'AI deferred and chain kongs must delegate to the shared core-backed executor',
);
assert.match(
  extractFunction('doKong'),
  /preparePageInitialKongAction\(p\)/,
  'discard kong execution must start from a rule-core replayable action',
);
assert.match(
  extractFunction('doKong'),
  /RULE_ENGINE\.resolveRobKongWinner\(/,
  'rob-kong priority must be resolved by the rule core before state mutation',
);
assert.match(
  extractFunction('doKong'),
  /applyInitialPageKongAction\(action\)/,
  'discard kong execution must delegate state mutation to the core-backed action executor',
);
assert.match(
  extractFunction('applyInitialPageKongAction'),
  /preflightPageKongResolution\(/,
  'discard kong must preflight through the shared core-backed atomic bridge',
);
assert.match(
  extractFunction('preflightPageKongResolution'),
  /resolvePageKongAction\(/,
  'the shared atomic preflight must use the rule-core bridge',
);
assert.match(
  extractFunction('applyPageDeferredKongAction'),
  /preflightPageKongResolution\(/,
  'deferred forced run must use the same atomic preflight as initial kong',
);
assert.match(
  extractFunction('applyPageChainKongAction'),
  /preflightPageKongResolution\(/,
  'chain kong must use the same atomic preflight as initial kong',
);
assert.match(
  extractFunction('canSelfKong'),
  /preparePageDeferredKongAction\(p\)/,
  'a retained resource must surface a deferred forced-run opportunity only for its owner turn',
);
assert.match(
  extractFunction('doSelfKong'),
  /preparePageChainKongAction\(p\)/,
  'the common kong button must prepare a real second-kong action from the first draw window',
);
assert.match(
  extractFunction('doSelfKong'),
  /RULE_ENGINE\.resolveRobKongWinner\(/,
  'second kong must resolve rob-kong before it consumes tiles or draws',
);
assert.match(
  extractFunction('restoreGameSession'),
  /revalidateRestoredKongState\(GS\)/,
  'restored resource and kong-window state must be revalidated against current real melds',
);
assert.doesNotMatch(html, /function legacyKongImplementation\(/, 'the removed page-local discard-kong implementation must not remain callable');
assert.match(
  extractFunction('newGame'),
  /GS\._kongResources=\[\];GS\._kongActionWindow=null;/,
  'new games must clear all prior-round resource and action-window state',
);
assert.match(
  extractFunction('drawGame'),
  /invalidatePageKongResources\(\)/,
  'draw settlement must invalidate all active resources',
);
assert.match(
  extractFunction('applyWin'),
  /invalidatePageKongResources\(\)/,
  'win settlement and final-audit blocking must invalidate all active resources',
);
assert.match(
  extractFunction('doDiscard'),
  /applyPageKongDiscardLifecycle\(GS\.cur,tile\)/,
  'normal discard must apply the shared pending-chain decline lifecycle',
);
assert.match(
  extractFunction('applyPageKongDiscardLifecycle'),
  /GS\._kongActionWindow=null/,
  'the shared discard lifecycle must explicitly decline a pending manual chain-kong window',
);

console.log('P0 kong page and persistence regression: passed');
