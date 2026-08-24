import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-v2-added-kong-round-'));

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

function visibleResult(result) {
  return {
    outcome: result.outcome,
    mustDiscard: result.mustDiscard,
    robKongWindow: result.robKongWindow,
    robKongWinner: result.robKongWinner,
    handAfterDraw: result.handAfterDraw,
    melds: result.melds,
    resourceAfterKong: result.resourceAfterKong,
    chainWindow: result.chainWindow,
    classification: result.classification,
    settlement: result.settlement,
    publicLog: result.publicLog,
  };
}

try {
  compileTree(path.join(root, 'src/game'), path.join(tempRoot, 'game'));
  const rules = require(path.join(tempRoot, 'game/rules/index.js'));
  const round = require(path.join(tempRoot, 'game/stage8/round-engine-v2.js'));
  assert.equal(typeof round.executeStage8V2AddedKongDraw, 'function', 'TDD: v2 round engine must expose a pure added-kong execution entry');

  const pengTong1 = { type: 'peng', tiles: ['tong1', 'tong1', 'tong1'], fromPlayer: 1 };
  const pengWan2 = { type: 'peng', tiles: ['wan2', 'wan2', 'wan2'], fromPlayer: 2 };
  const scores = [100, 100, 100, 100];
  const emptyOpponents = [{ hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }];
  const sharedState = (hand, melds, drawTile, opponents = emptyOpponents) => ({
    phase: 'discarding', currentPlayer: 0, turn: 0, dealer: 0, scores, passRecords: [], discards: [[], [], [], []],
    players: [{ hand, melds }, ...opponents], melds: [melds, [], [], []], wallTiles: [drawTile],
  });
  const fixtures = [
    {
      kongTile: 'tong1', hand: ['tong1', 'wan1', 'wan2', 'wan3', 'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'zhong'],
      melds: [pengTong1], drawTile: 'bai', expected: 'addedKongFakeWin', expectFakeWin: true,
    },
    {
      kongTile: 'tong1', hand: ['tong1', 'wan1', 'wan2', 'wan4', 'tiao1', 'tiao3', 'tiao5', 'tiao7', 'tiao9', 'zhong', 'fa'],
      melds: [pengTong1], drawTile: 'bai', expected: 'addedKongContinueDiscard', expectContinueDiscard: true,
    },
    {
      kongTile: 'tong1', hand: ['tong1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4'],
      melds: [pengTong1], drawTile: 'wan4', expected: 'addedKongImmediateWin',
    },
    {
      kongTile: 'tong1', hand: ['tong1', 'wan2', 'wan3', 'wan4', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'zhong', 'fa'],
      melds: [pengTong1, pengWan2], drawTile: 'wan2',
      resource: { owner: 0, tile: 'tong1', pongMeld: pengTong1, source: 'pong', status: 'active' },
      expected: 'addedKongChainWindow',
    },
    {
      kongTile: 'tong6', hand: ['tong6', 'wan1', 'wan2', 'wan3', 'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'zhong'],
      melds: [{ type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 1 }], drawTile: 'bai',
      opponents: [{ hand: ['tong6', 'tong6', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4'], melds: [] }, ...emptyOpponents.slice(1)],
      expected: 'addedKongRobbed',
    },
  ];
  let chainInput;
  for (const fixture of fixtures) {
    const state = sharedState(fixture.hand, fixture.melds, fixture.drawTile, fixture.opponents);
    const input = {
      actionSpaceVersion: 'stage8-action-space-v2', state, owner: 0,
      kongTile: fixture.kongTile, drawTile: fixture.drawTile, resource: fixture.resource,
    };
    const expected = rules.resolveAddedKongDraw({
      owner: 0, kongTile: fixture.kongTile, preKongHand: fixture.hand, melds: fixture.melds,
      drawTile: fixture.drawTile, scores, robKongState: state, resource: fixture.resource,
    });
    const before = JSON.stringify(state);
    const actual = round.executeStage8V2AddedKongDraw(input);
    assert.equal(actual.outcome, fixture.expected);
    assert.deepEqual(visibleResult(actual), visibleResult(expected), 'round engine must reproduce complete public result for ' + fixture.expected);
    assert.equal(JSON.stringify(state), before, 'round execution must remain pure');
    if (fixture.expectFakeWin) {
      assert.equal(actual.mustDiscard, false, 'fake-win supplement must settle immediately');
      assert.deepEqual(actual.classification.handTypes, ['平胡']);
      assert.deepEqual(actual.publicLog.handTypes, ['平胡']);
      assert.equal(actual.settlement.winner, 0);
      assert.deepEqual(actual.settlement.before, [100, 100, 100, 100]);
      assert.deepEqual(actual.settlement.after, [106, 98, 98, 98]);
      assert.deepEqual(actual.settlement.delta, [6, -2, -2, -2]);
    }
    if (fixture.expectContinueDiscard) {
      assert.equal(actual.mustDiscard, true, 'a non-winning non-fake supplement must continue to discard');
      assert.equal(actual.classification, undefined);
      assert.equal(actual.settlement, undefined);
    }
    if (fixture.expected === 'addedKongChainWindow') chainInput = input;
  }

  assert.throws(() => round.executeStage8V2AddedKongDraw({ ...chainInput, drawTile: 'wan3' }), /wall-top-mismatch/, 'round execution must reject an externally injected non-wall supplement');
  assert.throws(() => round.executeStage8V2AddedKongDraw({ ...chainInput, v1ActionId: 343 }), /v1/, 'public v2 execution must reject v1 action identities');

  console.log('stage8 v2 added-kong round-engine regression: passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
