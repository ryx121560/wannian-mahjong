import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
const compiledDir = path.join(os.tmpdir(), `wannian-post-pong-kong-${process.pid}`);
const require = createRequire(import.meta.url);

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

function compileTree(sourceDir, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) compileTree(sourcePath, destinationPath);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true },
      fileName: sourcePath,
    }).outputText;
    fs.writeFileSync(destinationPath.replace(/\.ts$/, '.js'), output);
  }
}

function tile(k) { return { k }; }
function key(value) { return typeof value === 'string' ? value : value.k; }
function same(left, right) { return key(left) === key(right); }
function meld(tileKey, fromPlayer) { return { tile: tile(tileKey), count: 3, fromPlayer }; }
function ruleMeld(value) { return { type: 'peng', tiles: [key(value.tile), key(value.tile), key(value.tile)], fromPlayer: value.fromPlayer }; }

const pong7 = { type: 'peng', tiles: ['tiao7', 'tiao7', 'tiao7'], fromPlayer: 3 };
const pong4 = { type: 'peng', tiles: ['tiao4', 'tiao4', 'tiao4'], fromPlayer: 2 };
const resource7 = { owner: 0, tile: 'tiao7', pongMeld: pong7, source: 'pong', status: 'active' };
const postPongHand = ['tiao7', 'wan2', 'wan2', 'wan2', 'tong4', 'tong4', 'tiao8', 'tiao8'];

function pageState(wallTop = 'wan6') {
  return {
    phase: 'discarding', cur: 0, newDrawnTile: null, newDrawnIdx: -1,
    wall: [tile(wallTop)], canK: false, canP: false, canW: false, canWS: false,
    _kongResources: [resource7], _candidateKongResources: [], _kongActionWindow: null, _specialKongChoiceWindow: null,
    players: [
      { human: true, hand: postPongHand.map(tile), melds: [meld('tiao7', 3), meld('tiao4', 2)], score: 50 },
      { hand: [], melds: [], score: 50 }, { hand: [], melds: [], score: 50 }, { hand: [], melds: [], score: 50 },
    ],
  };
}

function declarationSummary(declarations) {
  return declarations.map((item) => ({ kind: item.kind, tile: key(item.tile) }));
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

function makePageContext() {
  const calls = { deferred: 0, added: 0, rob: 0, win: 0, snapshots: 0, timers: 0 };
  const context = {
    GS: pageState(), calls,
    tkey: key, kt: tile, teq: same,
    ruleTiles: (hand) => hand.map(key),
    ruleMeldsForPlayer: (owner) => context.GS.players[owner].melds.map(ruleMeld),
    pageKongResources: () => context.GS._kongResources,
    pageCandidateKongResources: () => context.GS._candidateKongResources,
    hasPageRuleMeld: (owner, expected) => context.GS.players[owner].melds.some((value) => {
      const actual = ruleMeld(value);
      return actual.type === expected.type && actual.tiles[0] === expected.tiles[0] && actual.fromPlayer === expected.fromPlayer;
    }),
    collectPageSpecialKongChoices: () => [],
    preparePageAddedKongChainAction: () => null,
    preparePageChainKongAction: () => null,
    preparePageDeferredKongAction: (owner) => {
      const resource = context.GS._kongResources.find((item) => item.owner === owner && item.status === 'active'
        && context.GS.players[owner].hand.some((value) => key(value) === item.tile));
      return resource ? { kind: 'forcedRunDeferred', owner, resource } : null;
    },
    pageRuleState: () => ({}),
    RULE_ENGINE: {
      canMingGang: (hand, melds, tileKey) => hand.includes(tileKey) && melds.some((value) => value.type === 'peng' && value.tiles[0] === tileKey) ? tileKey : null,
      canAnGang: () => [],
      resolveRobKongWinner() { calls.rob += 1; return null; },
    },
    clearSelectedTile() {}, openPageSpecialKongChoiceWindow: () => false, renderPageSpecialKongChoiceMenu() {}, render() {}, saveGameSnapshot() { calls.snapshots += 1; },
    executePageSpecialKongAction() { throw new Error('unexpected special execution'); },
    resolvePageRobKongWinner() { calls.rob += 1; return null; },
    applyWin() { calls.win += 1; },
    applyPageAddedKongChainAction() { throw new Error('unexpected added-chain execution'); },
    applyPageChainKongAction() { throw new Error('unexpected chain execution'); },
    applyPageDeferredKongAction() { calls.deferred += 1; return true; },
    resolvePageAddedKongDraw() { calls.added += 1; return null; },
    applyPageAddedKongDraw() { calls.added += 1; return false; },
    applyPageNormalConcealedKongAction() { throw new Error('unexpected concealed execution'); },
    document: {
      getElementById(id) {
        if (!this.nodes) this.nodes = {};
        if (!this.nodes[id]) this.nodes[id] = { disabled: false };
        return this.nodes[id];
      },
    },
  };
  vm.createContext(context);
  for (const name of ['collectPageKongDeclarations', 'canSelfKong', 'doSelfKong', 'updateBtns']) {
    vm.runInContext(extractFunction(name), context, { filename: `${name}.js` });
  }
  return context;
}

try {
  compileTree(path.join(root, 'src/game/rules'), path.join(compiledDir, 'rules'));
  compileTree(path.join(root, 'src/game/stage8'), path.join(compiledDir, 'stage8'));
  const rules = require(path.join(compiledDir, 'rules/index.js'));
  const v2 = require(path.join(compiledDir, 'stage8/action-space-v2.js'));

  const ruleState = {
    phase: 'discarding', currentPlayer: 0, newDrawnTile: undefined,
    players: [{ hand: postPongHand, melds: [pong7, pong4] }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
    melds: [[pong7, pong4], [], [], []], discards: [[], [], [], []], turn: 95, dealer: 0,
    scores: [50, 50, 50, 50], wallTiles: ['wan6'], passRecords: [], kongResources: [resource7],
  };
  assert.deepEqual(rules.canAnGang(postPongHand), [], 'the hand has no concealed four-of-a-kind');
  assert.equal(rules.canMingGang(postPongHand, [pong7], 'tiao7'), 'tiao7', 'the retained 7-tiao physically upgrades the real pong');
  assert.equal(rules.canMingGang(postPongHand, [pong4], 'tiao4'), null, 'the newly ponged 4-tiao has no retained fourth tile');
  assert.equal(rules.canUseDeferredForcedRun(ruleState, 0), true, 'the older active 7-tiao resource remains a legal deferred forced run');
  assert.deepEqual(rules.getLegalActions(ruleState, 0), ['discard', 'addedKong', 'deferredForcedRunKong']);

  const page = makePageContext();
  const beforeQuery = JSON.stringify(page.GS);
  const declarations = page.collectPageKongDeclarations(0);
  assert.deepEqual(plain(declarationSummary(declarations)), [
    { kind: 'forcedRunDeferred', tile: 'tiao7' },
    { kind: 'addedKong', tile: 'tiao7' },
  ], 'the common page collector must expose the existing 7-tiao upgrade once per legal declaration kind');
  assert.equal(JSON.stringify(page.GS), beforeQuery, 'querying declarations must not mutate game state');
  assert.equal(page.calls.rob + page.calls.deferred + page.calls.added + page.calls.win + page.calls.snapshots + page.calls.timers, 0, 'querying declarations must have no execution side effects');

  const wallIndependent = [];
  for (const wallTop of ['wan6', 'wan8']) {
    page.GS = pageState(wallTop);
    wallIndependent.push(declarationSummary(page.collectPageKongDeclarations(0)));
  }
  assert.deepEqual(wallIndependent[0], wallIndependent[1], 'the declaration set must not depend on the hidden wall top');
  const protectedState = pageState();
  Object.defineProperty(protectedState, 'wall', { get() { throw new Error('declaration collector read hidden wall'); } });
  page.GS = protectedState;
  assert.doesNotThrow(() => page.collectPageKongDeclarations(0), 'declaration collection must not read the wall');

  page.GS = pageState();
  page.GS.canK = false;
  page.updateBtns();
  assert.equal(page.document.getElementById('bt-kong').disabled, false, 'button refresh must use the common declaration collector instead of stale canK');
  assert.equal(page.canSelfKong(0).type, 'deferred', 'the published deterministic priority must keep deferred forced run ahead of physical added-kong');
  assert.equal(page.doSelfKong(0), true, 'the common kong button must execute the selected declaration');
  assert.equal(page.calls.rob, 1, 'deferred forced run must still check rob-kong exactly once');
  assert.equal(page.calls.deferred, 1, 'the physical upgrade must commit exactly once');
  assert.equal(page.calls.added, 0, 'the same upgrade must not also execute the lower-priority added-kong path');

  page.GS = pageState();
  page.GS._kongResources = [];
  page.GS.players[0].hand = page.GS.players[0].hand.filter((value) => key(value) !== 'tiao7');
  assert.deepEqual(plain(page.collectPageKongDeclarations(0)), [], 'without an active retained resource or any other kong, the button must remain disabled');
  page.updateBtns();
  assert.equal(page.document.getElementById('bt-kong').disabled, true);

  const protocol = { actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION };
  const browserContext = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/game/rule_engine.js'), 'utf8'), browserContext);
  const browserRuleEngine = browserContext.globalThis.WannianRuleEngine;
  const ruleActions = v2.deriveStage8V2RuleActions({ ...protocol, state: ruleState, playerId: 0 });
  const roundActions = v2.deriveStage8V2RoundEngineActions({ ...protocol, state: ruleState, playerId: 0 });
  const actionTypes = new Set(['forcedRunDeferred', 'addedKong']);
  const expectedCanonical = ruleActions.filter((action) => actionTypes.has(action.actionType));
  assert.deepEqual(plain(v2.compareStage8V2CanonicalActions(expectedCanonical, roundActions.filter((action) => actionTypes.has(action.actionType)))), { equal: true, leftOnly: [], rightOnly: [] });
  page.GS = pageState();
  const pageCanonical = page.collectPageKongDeclarations(0).map((item) => v2.canonicalizeStage8V2Action({
    actionType: item.kind, actor: 0, declarationWindow: 'self-draw-discard', tile: key(item.tile), ownTileCount: 1,
    robKongWindow: true, ...(item.kind === 'forcedRunDeferred' ? { resourceSignature: '0:tiao7' } : {}),
  }));
  assert.deepEqual(plain(v2.compareStage8V2CanonicalActions(expectedCanonical, pageCanonical)), { equal: true, leftOnly: [], rightOnly: [] }, 'real HTML declarations must match the rule and round-engine canonical actions');

  assert.match(extractFunction('collectPageKongDeclarations'), /collectPageSpecialKongChoices/);
  assert.doesNotMatch(extractFunction('collectPageKongDeclarations'), /\bwall\b/, 'declaration collector must not reference the hidden wall');
  assert.doesNotMatch(extractFunction('preparePageDeferredKongAction'), /pageRuleState|\bwall\b/, 'deferred declaration preparation must use visible state only');
  assert.match(extractFunction('doPong'), /collectPageKongDeclarations/);
  assert.match(extractFunction('canSelfKong'), /collectPageKongDeclarations/);
  assert.match(extractFunction('doSelfKong'), /collectPageKongDeclarations/);
  assert.match(extractFunction('updateBtns'), /collectPageKongDeclarations/);
  console.log('P0 post-pong kong reachability regression: passed');
} finally {
  fs.rmSync(compiledDir, { recursive: true, force: true });
}
