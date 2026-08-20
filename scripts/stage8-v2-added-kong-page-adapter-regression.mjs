import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-v2-added-kong-page-'));

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

function compileTree(sourceDir, outputDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const outputPath = path.join(outputDir, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) {
      fs.mkdirSync(outputPath, { recursive: true });
      compileTree(sourcePath, outputPath);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: sourcePath,
    });
    fs.writeFileSync(outputPath, output.outputText, 'utf8');
  }
}

function pageMeld(meld) {
  return { tile: { k: meld.tiles[0] }, count: meld.tiles.length, fromPlayer: meld.fromPlayer };
}

function visibleResult(result) {
  return JSON.parse(JSON.stringify({
    outcome: result.outcome,
    mustDiscard: result.mustDiscard,
    robKongWindow: result.robKongWindow,
    handAfterDraw: result.handAfterDraw,
    melds: result.melds,
    robKongWinner: result.robKongWinner,
    resourceAfterKong: result.resourceAfterKong,
    chainWindow: result.chainWindow,
    classification: result.classification,
    settlement: result.settlement,
    publicLog: result.publicLog,
  }));
}

function pageResolve(rules, input) {
  const state = {
    players: input.robKongState.players.map((player, index) => ({
      score: input.scores[index],
      hand: player.hand.map((tile) => ({ k: tile })),
      melds: (player.melds || []).map(pageMeld),
    })),
    wall: [{ k: input.drawTile }],
  };
  const context = {
    RULE_ENGINE: rules,
    GS: state,
    tkey: (tile) => typeof tile === 'string' ? tile : tile.k,
    ruleTiles: (hand) => hand.map((tile) => tile.k),
    ruleMeldsForPlayer: (playerId) => state.players[playerId].melds.map((meld) => ({
      type: meld.count === 4 ? 'mingGang' : 'peng',
      tiles: Array(meld.count).fill(meld.tile.k),
      fromPlayer: meld.fromPlayer,
    })),
    pageRuleState: () => input.robKongState,
    activePageKongResource: () => input.resource,
    hasPageRuleMeld: () => !!input.resource,
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('resolvePageAddedKongDraw'), context, { filename: 'page-added-kong-adapter.js' });
  const before = JSON.stringify(state);
  const result = context.resolvePageAddedKongDraw(input.owner, { type: 'add', tile: { k: input.kongTile } });
  assert.equal(JSON.stringify(state), before, 'page added-kong adaptation must not mutate game state before commit');
  return result;
}

function pageCommit(rules, input, suppliedResult) {
  const calls = { applyWin: 0, saveSnapshot: 0, render: 0, timers: 0 };
  const state = {
    phase: 'discarding', cur: input.owner, lastDiscard: null, lastDiscardP: -1,
    canP: false, canK: true, canW: false, canWS: false, _resp: null, _respP: -1, _responseKind: null,
    players: input.robKongState.players.map((player, index) => ({
      name: index === 0 ? 'you' : `ai-${index}`, human: index === 0, score: input.scores[index],
      hand: player.hand.map((tile) => ({ k: tile })), melds: (player.melds || []).map(pageMeld),
    })),
    wall: [{ k: input.drawTile }], _kc: {}, _kongResources: [], _kongActionWindow: null,
    newDrawnTile: null, newDrawnIdx: -1, _lastResult: null,
  };
  const context = {
    RULE_ENGINE: rules, GS: state, window: {},
    document: { getElementById: () => ({ textContent: '' }) },
    _selfPlay: { running: false }, totalGamesPlayed: 0,
    tkey: (tile) => typeof tile === 'string' ? tile : tile.k,
    kt: (tile) => ({ k: tile }),
    teq: (left, right) => (typeof left === 'string' ? left : left.k) === (typeof right === 'string' ? right : right.k),
    ruleTiles: (hand) => hand.map((tile) => tile.k),
    ruleMeldsForPlayer: (playerId) => state.players[playerId].melds.map((meld) => ({
      type: meld.count === 4 ? 'mingGang' : 'peng',
      tiles: Array(meld.count).fill(meld.tile.k),
      fromPlayer: meld.fromPlayer,
    })),
    pageRuleState: () => input.robKongState,
    activePageKongResource: () => input.resource,
    hasPageRuleMeld: () => !!input.resource,
    replacePageKongResource: (resource) => { state._kongResources = [resource]; },
    logEvent: () => {}, setMsg: () => {},
    render: () => { calls.render += 1; }, updateBtns: () => {},
    saveGameSnapshot: () => { calls.saveSnapshot += 1; },
    canSelfWinForPlayer: () => false, lbl: (tile) => tile.k, updateSuggestion: () => {},
    applyWin: () => { calls.applyWin += 1; },
    clearAllDrawMarkers: () => {}, invalidatePageKongResources: () => {},
    formatWinSettlementText: (title, detail, gain) => `${title}|${detail}|${gain}`,
    commitTopSettlementSummary: () => {}, finalizeRecommendationSummary: () => {},
    renderFinalRecommendationPanel: () => {}, persistSettledScores: () => -1,
    saveGameLog: () => {}, _spOnGameEnd: () => {},
    revealAiHandsForNormalEnd: () => {},
    gameSetTimeout: () => { calls.timers += 1; return 1; },
    startSelfPlayGame: () => {}, showWinDlg: () => {},
  };
  vm.createContext(context);
  for (const name of [
    'removePageTiles', 'resolvePageAddedKongDraw', 'samePageRuleTileList',
    'captureSettledKongSupplement',
    'samePageAddedKongRuleResult', 'resetPageKongResponseState', 'pageKongActionLabel', 'completePageKongSettlement',
    'hasPageAddedKongSettlementContract', 'completePageAddedKongSettlement', 'applyPageAddedKongDraw',
  ]) vm.runInContext(extractFunction(name), context, { filename: `page-${name}.js` });
  const before = JSON.stringify(state);
  const applied = context.applyPageAddedKongDraw(input.owner, suppliedResult);
  return { applied, before, after: JSON.stringify(state), state: JSON.parse(JSON.stringify(state)), calls };
}

try {
  assert.match(html, /function resolvePageAddedKongDraw\(/, 'page must construct a replayable added-kong input for the pure rules core');
  assert.match(html, /RULE_ENGINE\.resolveAddedKongDraw\(/, 'page must delegate added-kong draw resolution to the pure rules core');
  assert.match(extractFunction('doSelfKong'), /resolvePageAddedKongDraw\(/, 'explicit kong click must route ordinary added kong through the pure resolver');
  assert.doesNotMatch(extractFunction('doSelfKong'), /preparePageAddedKongFirstAction\(/, 'doSelfKong must not own a second added-kong draw derivation path');
  assert.doesNotMatch(extractFunction('applyPageAddedKongDraw'), /applyWin\(/, 'page added-kong commit must not re-enter the legacy page scoring path');

  compileTree(path.join(root, 'src/game/rules'), path.join(tempRoot, 'rules'));
  const rules = require(path.join(tempRoot, 'rules/index.js'));
  const pengTong1 = { type: 'peng', tiles: ['tong1', 'tong1', 'tong1'], fromPlayer: 1 };
  const pengWan2 = { type: 'peng', tiles: ['wan2', 'wan2', 'wan2'], fromPlayer: 2 };
  const scores = [100, 100, 100, 100];
  const emptyOpponents = [{ hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }];
  const sharedState = (hand, melds, opponents = emptyOpponents) => ({
    phase: 'discarding', currentPlayer: 0, players: [{ hand, melds }, ...opponents], melds: [melds, [], [], []],
    discards: [[], [], [], []], turn: 0, dealer: 0, scores, wallTiles: [], passRecords: [],
  });
  const fixtures = [
    {
      owner: 0, kongTile: 'tong1', preKongHand: ['tong1', 'wan1', 'wan2', 'wan4', 'tiao1', 'tiao3', 'tiao5', 'tiao7', 'tiao9', 'zhong', 'fa'], melds: [pengTong1], drawTile: 'bai', scores,
      robKongState: sharedState(['tong1', 'wan1', 'wan2', 'wan4', 'tiao1', 'tiao3', 'tiao5', 'tiao7', 'tiao9', 'zhong', 'fa'], [pengTong1]), expected: 'addedKongContinueDiscard',
    },
    {
      owner: 0, kongTile: 'tong1', preKongHand: ['tong1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4'], melds: [pengTong1], drawTile: 'wan4', scores,
      robKongState: sharedState(['tong1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4'], [pengTong1]), expected: 'addedKongImmediateWin',
    },
    {
      owner: 0, kongTile: 'tiao9', preKongHand: ['tong3', 'tiao8', 'tiao4', 'tong3', 'tong5', 'tiao3', 'tong7', 'tiao6', 'tiao2', 'tiao7', 'tiao9'], melds: [{ type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }], drawTile: 'tiao5', scores,
      robKongState: sharedState(['tong3', 'tiao8', 'tiao4', 'tong3', 'tong5', 'tiao3', 'tong7', 'tiao6', 'tiao2', 'tiao7', 'tiao9'], [{ type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }]), expected: 'addedKongFakeWin',
    },
    {
      owner: 0, kongTile: 'tong1', preKongHand: ['tong1', 'wan2', 'wan3', 'wan4', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'zhong', 'fa'], melds: [pengTong1, pengWan2], drawTile: 'wan2', scores,
      resource: { owner: 0, tile: 'tong1', pongMeld: pengTong1, source: 'pong', status: 'active' },
      robKongState: sharedState(['tong1', 'wan2', 'wan3', 'wan4', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'zhong', 'fa'], [pengTong1, pengWan2]), expected: 'addedKongChainWindow',
    },
    {
      owner: 0, kongTile: 'tong6', preKongHand: ['tong6', 'wan1', 'wan2', 'wan3', 'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'zhong'], melds: [{ type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 1 }], drawTile: 'bai', scores,
      robKongState: sharedState(['tong6', 'wan1', 'wan2', 'wan3', 'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'zhong'], [{ type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 1 }], [{ hand: ['tong6', 'tong6', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4'], melds: [] }, ...emptyOpponents.slice(1)]), expected: 'addedKongRobbed',
    },
  ];
  for (const fixture of fixtures) {
    const direct = rules.resolveAddedKongDraw(fixture);
    const page = pageResolve(rules, fixture);
    assert.equal(direct.outcome, fixture.expected, `fixture ${fixture.expected} must lock published added-kong semantics`);
    assert.deepEqual(visibleResult(page), visibleResult(direct), `page adapter must match the pure result for ${fixture.expected}`);
  }

  const immediateFixture = fixtures.find((fixture) => fixture.expected === 'addedKongImmediateWin');
  const immediate = rules.resolveAddedKongDraw(immediateFixture);
  const immediateCommit = pageCommit(rules, immediateFixture, immediate);
  assert.equal(immediateCommit.applied, true, 'page must commit a valid immediate added-kong settlement');
  assert.equal(immediateCommit.calls.applyWin, 0, 'page must not recalculate added-kong settlement through applyWin');
  assert.deepEqual(immediateCommit.state.players.map((player) => player.score), immediate.settlement.after, 'page scores must come from the pure settlement');
  assert.deepEqual(immediateCommit.state._lastResult.scoreDeltas, immediate.settlement.delta, 'page result deltas must come from the pure settlement');
  assert.deepEqual(immediateCommit.state._lastResult.handTypes, immediate.classification.handTypes, 'page result must preserve the pure hand classification');
  assert.equal(immediateCommit.state._lastResult.decompositionSignature, immediate.classification.decompositionSignature, 'page result must preserve the pure decomposition signature');
  assert.deepEqual(immediateCommit.state.players[0].hand.map((tile) => tile.k).sort(), immediate.handAfterDraw.slice().sort(), 'page hand transition must match the pure result');
  assert.equal(immediateCommit.state.players[0].melds[0].count, 4, 'page must upgrade the real peng to a four-tile kong');
  assert.equal(immediateCommit.state.wall.length, 0, 'page must consume exactly one supplement tile');

  const fakeFixture = fixtures.find((fixture) => fixture.expected === 'addedKongFakeWin');
  const fake = rules.resolveAddedKongDraw(fakeFixture);
  const fakeCommit = pageCommit(rules, fakeFixture, fake);
  assert.equal(fakeCommit.applied, true, 'page must commit a valid added-kong resource fake-win settlement');
  assert.equal(fakeCommit.calls.applyWin, 0, 'page must not rerun generic win scoring for an added-kong resource fake win');
  assert.deepEqual(fakeCommit.state.players.map((player) => player.score), fake.settlement.after);
  assert.deepEqual(fakeCommit.state._lastResult.scoreDeltas, [6, -2, -2, -2]);
  assert.deepEqual(fakeCommit.state._lastResult.handTypes, ['平胡']);
  assert.equal(fakeCommit.state.players[0].hand.filter((tile) => tile.k === 'tiao5').length, 1, 'page must retain the physical supplement tile after resource classification');
  assert.equal(fakeCommit.state.players[0].hand.some((tile) => tile.k === 'tong6'), false, 'page must not persist a substituted classification tile');
  assert.equal(fakeCommit.state.players[0].melds[0].count, 4);
  assert.equal(fakeCommit.state.wall.length, 0);

  const chainFixture = fixtures.find((fixture) => fixture.expected === 'addedKongChainWindow');
  const chain = rules.resolveAddedKongDraw(chainFixture);
  const chainCommit = pageCommit(rules, chainFixture, chain);
  assert.equal(chainCommit.applied, true);
  assert.equal(chainCommit.state._kongActionWindow.kind, 'addedKongChain');
  assert.equal(chainCommit.state.wall.length, 0);

  const continueFixture = fixtures.find((fixture) => fixture.expected === 'addedKongContinueDiscard');
  const continuation = rules.resolveAddedKongDraw(continueFixture);
  const continueCommit = pageCommit(rules, continueFixture, continuation);
  assert.equal(continueCommit.applied, true);
  assert.equal(continueCommit.state.phase, 'discarding');
  assert.deepEqual(continueCommit.state.players.map((player) => player.score), continueFixture.scores);

  const robbedFixture = fixtures.find((fixture) => fixture.expected === 'addedKongRobbed');
  const robbed = rules.resolveAddedKongDraw(robbedFixture);
  const robbedCommit = pageCommit(rules, robbedFixture, robbed);
  assert.equal(robbedCommit.applied, false);
  assert.equal(robbedCommit.after, robbedCommit.before, 'robbed added kong must not mutate the page commit state');
  assert.equal(robbedCommit.calls.applyWin, 0);

  const missingSettlement = { ...immediate, settlement: undefined };
  const missingSettlementCommit = pageCommit(rules, immediateFixture, missingSettlement);
  assert.equal(missingSettlementCommit.applied, false);
  assert.equal(missingSettlementCommit.after, missingSettlementCommit.before, 'missing settlement contract must fail before page mutation');

  const forgedSettlement = JSON.parse(JSON.stringify(immediate));
  forgedSettlement.settlement.after[0] += 16;
  forgedSettlement.settlement.delta[0] += 16;
  const forgedSettlementCommit = pageCommit(rules, immediateFixture, forgedSettlement);
  assert.equal(forgedSettlementCommit.applied, false);
  assert.equal(forgedSettlementCommit.after, forgedSettlementCommit.before, 'tampered settlement must fail replay validation before page mutation');

  console.log('stage8 v2 added-kong page adapter regression: passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
