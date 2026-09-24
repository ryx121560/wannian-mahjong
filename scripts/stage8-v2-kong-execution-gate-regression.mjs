import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-v2-kong-execution-'));

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

try {
  compileTree(path.join(root, 'src/game'), path.join(tempRoot, 'game'));
  const v2 = require(path.join(tempRoot, 'game/stage8/action-space-v2.js'));
  const rules = require(path.join(tempRoot, 'game/rules/index.js'));
  assert.equal(typeof v2.executeStage8V2RuleKongAction, 'function', 'TDD: rule adapter must expose special-kong execution');
  assert.equal(typeof v2.executeStage8V2PageKongAction, 'function', 'TDD: page adapter must expose special-kong execution');
  assert.equal(typeof v2.executeStage8V2RoundKongAction, 'function', 'TDD: round engine must expose special-kong execution');

  const browserContext = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/game/rule_engine.js'), 'utf8'), browserContext, { filename: 'rule_engine.js' });
  const browserRuleEngine = browserContext.globalThis.WannianRuleEngine;
  const directResource = rules.createKongResource({
    owner: 1,
    tile: 'wan9',
    pongMeld: { type: 'peng', tiles: ['wan9', 'wan9', 'wan9'], fromPlayer: 0 },
    source: 'pong',
  });
  const handAfterKong = ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan7', 'wan7', 'wan8'];
  const preKongHand = ['wan9', 'wan9', 'wan9', ...handAfterKong];
  const melds = [{ type: 'mingGang', tiles: ['wan9', 'wan9', 'wan9', 'wan9'], fromPlayer: 0 }];
  const state = {
    phase: 'responding',
    currentPlayer: 1,
    lastDiscard: 'wan9',
    lastDiscardPlayer: 0,
    players: [
      { hand: [], melds: [] },
      { hand: preKongHand, melds: [] },
      { hand: [], melds: [] },
      { hand: [], melds: [] },
    ],
    melds: [[], [], [], []],
    discards: [['wan9'], [], [], []],
    turn: 1,
    dealer: 0,
    scores: [100, 100, 100, 100],
    wallTiles: ['zhong'],
    passRecords: [],
    kongResources: [],
  };
  const selectedAction = v2.canonicalizeStage8V2Action({
    actionType: 'directChisel',
    actor: 1,
    declarationWindow: 'discard-response',
    tile: 'wan9',
    ownTileCount: 3,
    robKongWindow: true,
  });
  const input = {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state,
    selectedAction,
    claim: {
      family: 'kongResource',
      pointKongPlayer: 0,
      action: { kind: 'directChisel', owner: 1, resource: directResource, preKongHand, handAfterKong, melds },
    },
  };
  const before = JSON.stringify(state);
  const ruleResult = v2.executeStage8V2RuleKongAction(input);
  const pageResult = v2.executeStage8V2PageKongAction({ ...input, browserRuleEngine });
  const roundResult = v2.executeStage8V2RoundKongAction(input);
  assert.equal(ruleResult.outcome, 'directChiselFakeWin');
  assert.equal(ruleResult.wallConsumed, 1);
  assert.deepEqual(ruleResult.settlement.payments, [8, 0, 4, 4]);
  assert.deepEqual(JSON.parse(JSON.stringify(pageResult)), JSON.parse(JSON.stringify(ruleResult)));
  assert.deepEqual(JSON.parse(JSON.stringify(roundResult)), JSON.parse(JSON.stringify(ruleResult)));
  assert.equal(JSON.stringify(state), before, 'execution adapters must remain pure');
  assert.deepEqual(v2.scanStage8V2PublicSummary(ruleResult.publicLog), []);
  function makeState(owner, hand, playerMelds, drawTile, extra = {}) {
    const players = Array.from({ length: 4 }, (_, playerId) => ({
      hand: playerId === owner ? hand.slice() : [],
      melds: playerId === owner ? playerMelds.map((meld) => ({ ...meld, tiles: meld.tiles.slice() })) : [],
    }));
    return {
      phase: 'discarding',
      currentPlayer: owner,
      players,
      melds: players.map((player) => player.melds),
      discards: [[], [], [], []],
      turn: 1,
      dealer: 0,
      scores: [100, 100, 100, 100],
      wallTiles: drawTile == null ? [] : [drawTile],
      passRecords: [],
      kongResources: [],
      ...extra,
    };
  }

  function runFixture(name, fixtureInput, expected) {
    const fixtureBefore = JSON.stringify(fixtureInput.state);
    const rule = v2.executeStage8V2RuleKongAction(fixtureInput);
    const page = v2.executeStage8V2PageKongAction({ ...fixtureInput, browserRuleEngine });
    const round = v2.executeStage8V2RoundKongAction(fixtureInput);
    assert.deepEqual(JSON.parse(JSON.stringify(page)), JSON.parse(JSON.stringify(rule)), name + ': page result');
    assert.deepEqual(JSON.parse(JSON.stringify(round)), JSON.parse(JSON.stringify(rule)), name + ': round result');
    assert.equal(rule.outcome, expected.outcome, name + ': outcome');
    assert.equal(rule.wallConsumed, expected.wallConsumed, name + ': wall consumption');
    if (expected.mustDiscard != null) assert.equal(rule.mustDiscard, expected.mustDiscard, name + ': discard state');
    if (expected.payments) assert.deepEqual(rule.settlement?.payments, expected.payments, name + ': payments');
    assert.equal(JSON.stringify(fixtureInput.state), fixtureBefore, name + ': pure execution');
    assert.deepEqual(v2.scanStage8V2PublicSummary(rule.publicLog), [], name + ': privacy scan');
    assert.doesNotMatch(JSON.stringify(rule.publicLog).toLowerCase(), /futurewall|opponenthand|hiddenhand|replaycursor|checkpoint|model|manifest/, name + ': visible public log only');
    assert.deepEqual(
      JSON.parse(JSON.stringify(v2.executeStage8V2RuleKongAction(fixtureInput))),
      JSON.parse(JSON.stringify(rule)),
      name + ': deterministic replay',
    );
    return rule;
  }

  const tong6Peng = { type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 0 };
  const tong6Resource = rules.createKongResource({ owner: 1, tile: 'tong6', pongMeld: tong6Peng, source: 'pong' });
  const tong6Gang = { type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 };
  const forcedPreKongHand = ['tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'];
  const forcedHandAfterKong = ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'];
  const forcedSelected = v2.canonicalizeStage8V2Action({
    actionType: 'forcedRunImmediate',
    actor: 1,
    declarationWindow: 'discard-response',
    tile: 'tong6',
    ownTileCount: 3,
    robKongWindow: true,
  });
  runFixture('immediate forced run success', {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(1, forcedPreKongHand, [], 'tiao4'),
    selectedAction: forcedSelected,
    claim: {
      family: 'kongResource',
      pointKongPlayer: 0,
      action: {
        kind: 'forcedRunImmediate',
        owner: 1,
        resource: tong6Resource,
        preKongHand: forcedPreKongHand,
        handAfterKong: forcedHandAfterKong,
        melds: [tong6Gang],
      },
    },
  }, { outcome: 'forcedRunGangKaiFakeWin', wallConsumed: 1 });

  runFixture('immediate forced run failure', {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(1, forcedPreKongHand, [], 'zhong'),
    selectedAction: forcedSelected,
    claim: {
      family: 'kongResource',
      pointKongPlayer: 0,
      action: {
        kind: 'forcedRunImmediate',
        owner: 1,
        resource: tong6Resource,
        preKongHand: forcedPreKongHand,
        handAfterKong: forcedHandAfterKong,
        melds: [tong6Gang],
      },
    },
  }, { outcome: 'forcedRunFailureDiscard', wallConsumed: 1, mustDiscard: true });

  const deferredPreKongHand = ['tong6', 'fa', 'fa', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao8', 'dong'];
  const deferredHandAfterKong = deferredPreKongHand.slice(1);
  runFixture('deferred forced run success', {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(1, deferredPreKongHand, [tong6Peng], 'fa', { kongResources: [tong6Resource] }),
    selectedAction: v2.canonicalizeStage8V2Action({
      actionType: 'forcedRunDeferred',
      actor: 1,
      declarationWindow: 'self-draw-discard',
      tile: 'tong6',
      ownTileCount: 1,
      robKongWindow: true,
      resourceSignature: '1:tong6',
    }),
    claim: {
      family: 'kongResource',
      action: {
        kind: 'forcedRunDeferred',
        owner: 1,
        resource: tong6Resource,
        preKongHand: deferredPreKongHand,
        handAfterKong: deferredHandAfterKong,
        melds: [tong6Gang],
      },
    },
  }, { outcome: 'forcedRunGangKaiFakeWin', wallConsumed: 1 });




  const chainAction = {
    kind: 'chainKong',
    owner: 1,
    resource: rules.consumeKongResource(tong6Resource),
    preKongHand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
    initialHandAfterKong: ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
    initialMelds: [tong6Gang],
    firstDrawTile: 'wan1',
    secondKongTile: 'wan1',
    secondKongMeld: { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 },
    handBeforeKong: ['wan1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
    handAfterKong: ['wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
    melds: [tong6Gang, { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 }],
  };
  runFixture('manual chain kong', {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(1, chainAction.handBeforeKong, chainAction.initialMelds, 'wan9'),
    selectedAction: v2.canonicalizeStage8V2Action({
      actionType: 'chainKong',
      actor: 1,
      declarationWindow: 'chain-kong',
      tile: 'wan1',
      ownTileCount: 4,
      robKongWindow: true,
      resourceSignature: '1:tong6>wan1',
    }),
    claim: { family: 'kongResource', pointKongPlayer: 0, action: chainAction },
  }, { outcome: 'directChiselChainFakeWin', wallConsumed: 1, payments: [16, 0, 8, 8] });

  const forcedConcealedAction = {
    kind: 'forcedRunConcealed',
    input: {
      owner: 0,
      kongTile: 'wan1',
      preKongHand: ['fa', 'fa', 'wan1', 'wan1', 'wan1', 'wan1', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tong5', 'tong6', 'dong'],
      handAfterKong: ['fa', 'fa', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tong5', 'tong6', 'dong'],
      melds: [{ type: 'anGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'] }],
    },
  };
  runFixture('concealed forced run success', {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(0, forcedConcealedAction.input.preKongHand, [], 'tiao4'),
    selectedAction: v2.canonicalizeStage8V2Action({
      actionType: 'forcedRunConcealed',
      actor: 0,
      declarationWindow: 'self-draw-discard',
      tile: 'wan1',
      ownTileCount: 4,
      robKongWindow: false,
    }),
    claim: { family: 'specialKong', action: forcedConcealedAction },
  }, { outcome: 'forcedRunConcealedFakeWin', wallConsumed: 1, payments: [0, 2, 2, 2] });

  const eastPong = { type: 'peng', tiles: ['dong', 'dong', 'dong'], fromPlayer: 1 };
  const candidateResource = rules.createCandidateConcealedKongResource({
    owner: 0,
    pongMeld: eastPong,
    candidateKongTile: 'wan1',
  });
  const candidateAction = {
    kind: 'postPongCandidateConcealedKong',
    input: {
      owner: 0,
      resource: candidateResource,
      preKongHand: ['wan1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan5', 'wan5', 'wan5', 'bai', 'bai'],
      handAfterKong: ['wan2', 'wan2', 'wan2', 'wan5', 'wan5', 'wan5', 'bai', 'bai'],
      melds: [eastPong, { type: 'anGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'] }],
    },
  };
  const candidateResult = runFixture('post-pong candidate concealed kong', {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(0, candidateAction.input.preKongHand, [eastPong], 'bai'),
    selectedAction: v2.canonicalizeStage8V2Action({
      actionType: 'postPongCandidateConcealedKong',
      actor: 0,
      declarationWindow: 'post-pong-discard',
      tile: 'wan1',
      ownTileCount: 4,
      robKongWindow: false,
      resourceSignature: '0:dong:wan1',
    }),
    claim: { family: 'specialKong', action: candidateAction },
  }, { outcome: 'postPongCandidateConcealedFakeWin', wallConsumed: 1 });
  assert.equal(candidateResult.resourceAfterKong.status, 'consumed');




  const pong1 = { type: 'peng', tiles: ['wan1', 'wan1', 'wan1'], fromPlayer: 1 };
  const pong2 = { type: 'peng', tiles: ['wan2', 'wan2', 'wan2'], fromPlayer: 2 };
  const resource1 = rules.createKongResource({ owner: 0, tile: 'wan1', pongMeld: pong1, source: 'pong' });
  const resource2 = rules.createKongResource({ owner: 0, tile: 'wan2', pongMeld: pong2, source: 'pong' });
  const doublePongAction = {
    kind: 'doublePongForcedRun',
    input: {
      owner: 0,
      selectedResource: resource1,
      conditionalResource: resource2,
      preKongHand: ['wan1', 'wan2', 'zhong', 'zhong', 'tong5', 'tong6', 'tiao5', 'tiao6', 'dong'],
      handAfterKong: ['wan2', 'zhong', 'zhong', 'tong5', 'tong6', 'tiao5', 'tiao6', 'dong'],
      melds: [{ type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 }, pong2],
    },
  };
  const doubleInput = {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(0, doublePongAction.input.preKongHand, [pong1, pong2], 'tong4', { kongResources: [resource1, resource2] }),
    selectedAction: v2.canonicalizeStage8V2Action({
      actionType: 'doublePongForcedRun',
      actor: 0,
      declarationWindow: 'self-draw-discard',
      selectedTile: 'wan1',
      conditionalTile: 'wan2',
      ownTileCount: 1,
      robKongWindow: true,
      resourceSignature: '0:wan1|0:wan2',
    }),
    claim: { family: 'specialKong', action: doublePongAction },
  };
  const doubleResult = runFixture('double-pong selective forced run', doubleInput, {
    outcome: 'doublePongForcedRunFakeWin',
    wallConsumed: 1,
    payments: [0, 2, 2, 2],
  });

  const addedChainAction = {
    kind: 'addedKongChain',
    input: {
      owner: 0,
      initialResource: resource2,
      chainPongMeld: pong1,
      preKongHand: ['wan2', 'zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
      initialHandAfterKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
      initialMelds: [{ type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 }, pong1],
      firstDrawTile: 'wan1',
      handBeforeChainKong: ['zhong', 'wan1', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
      handAfterChainKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
      melds: [
        { type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 },
        { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 },
      ],
    },
  };
  runFixture('added-kong chain true win', {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(0, addedChainAction.input.handBeforeChainKong, addedChainAction.input.initialMelds, 'zhong'),
    selectedAction: v2.canonicalizeStage8V2Action({
      actionType: 'chainKong',
      actor: 0,
      declarationWindow: 'chain-kong',
      tile: 'wan1',
      ownTileCount: 1,
      robKongWindow: true,
      resourceSignature: '0:wan2>wan1',
    }),
    claim: { family: 'specialKong', action: addedChainAction },
  }, { outcome: 'addedKongChainTrueWin', wallConsumed: 1, payments: [0, 8, 8, 8] });

  runFixture('explicit kong decline', {
    actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION,
    state: makeState(0, forcedConcealedAction.input.preKongHand, [], 'tiao4'),
    selectedAction: v2.canonicalizeStage8V2Action({
      actionType: 'declineKong',
      actor: 0,
      declarationWindow: 'self-draw-discard',
      robKongWindow: false,
    }),
    claim: { family: 'decline', owner: 0 },
  }, { outcome: 'kongDeclined', wallConsumed: 0, mustDiscard: true });

  const robState = makeState(0, doublePongAction.input.preKongHand, [pong1, pong2], 'tong4', {
    kongResources: [resource1, resource2],
  });
  robState.players[1] = {
    hand: ['wan1', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4', 'wan5', 'wan5', 'tong1', 'tong1', 'tong2', 'tong2'],
    melds: [],
  };
  robState.melds[1] = [];
  const robbed = runFixture('double-pong rob-kong priority', { ...doubleInput, state: robState }, {
    outcome: 'kongRobbed',
    wallConsumed: 0,
  });
  assert.equal(robbed.robKongWinner, 1);
  assert.equal(robbed.settlement, null);

  assert.throws(
    () => v2.executeStage8V2RuleKongAction({ ...doubleInput, replayCursor: 1 }),
    /v1 artifact field rejected: replayCursor/,
  );
  assert.throws(
    () => v2.executeStage8V2PageKongAction({ ...doubleInput, browserRuleEngine, checkpoint: 'v1' }),
    /v1 artifact field rejected: checkpoint/,
  );
  assert.throws(
    () => v2.executeStage8V2RoundKongAction({ ...doubleInput, model: 'v1' }),
    /v1 artifact field rejected: model/,
  );

  console.log('stage8 v2 special-kong execution gate regression: passed');


} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
