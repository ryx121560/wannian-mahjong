import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-v2-added-kong-'));

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
  compileTree(path.join(root, 'src/game/rules'), path.join(tempRoot, 'rules'));
  const rules = require(path.join(tempRoot, 'rules/index.js'));
  assert.equal(typeof rules.resolveAddedKongDraw, 'function', 'TDD: rules core must expose resolveAddedKongDraw');

  const pengTong1 = { type: 'peng', tiles: ['tong1', 'tong1', 'tong1'], fromPlayer: 1 };
  const pengWan2 = { type: 'peng', tiles: ['wan2', 'wan2', 'wan2'], fromPlayer: 2 };
  const activeTong1 = { owner: 0, tile: 'tong1', pongMeld: pengTong1, source: 'pong', status: 'active' };
  const scores = [100, 100, 100, 100];
  const emptyOpponents = [
    { hand: [], melds: [] },
    { hand: [], melds: [] },
    { hand: [], melds: [] },
    { hand: [], melds: [] },
  ];

  const continueInput = {
    owner: 0,
    kongTile: 'tong1',
    preKongHand: ['tong1', 'wan1', 'wan2', 'wan4', 'tiao1', 'tiao3', 'tiao5', 'tiao7', 'tiao9', 'zhong', 'fa'],
    melds: [pengTong1],
    drawTile: 'bai',
    scores,
    robKongState: { phase: 'discarding', currentPlayer: 0, players: [{ hand: ['tong1', 'wan1', 'wan2', 'wan4', 'tiao1', 'tiao3', 'tiao5', 'tiao7', 'tiao9', 'zhong', 'fa'], melds: [pengTong1] }, ...emptyOpponents.slice(1)], melds: [[pengTong1], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0, scores, wallTiles: [], passRecords: [] },
  };
  const continuation = rules.resolveAddedKongDraw(continueInput);
  assert.equal(continuation.outcome, 'addedKongContinueDiscard', 'non-chain non-winning added kong must continue to discard');
  assert.equal(continuation.mustDiscard, true);
  assert.deepEqual(continuation.handAfterDraw, continueInput.preKongHand.filter((tile, index) => !(tile === 'tong1' && index === 0)).concat('bai'));
  assert.equal(continuation.melds[0].type, 'mingGang');
  assert.equal(continuation.settlement, undefined);

  const immediateInput = {
    ...continueInput,
    preKongHand: ['tong1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4'],
    drawTile: 'wan4',
    robKongState: { ...continueInput.robKongState, players: [{ hand: ['tong1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4'], melds: [pengTong1] }, ...emptyOpponents.slice(1)] },
  };
  const immediate = rules.resolveAddedKongDraw(immediateInput);
  assert.equal(immediate.outcome, 'addedKongImmediateWin', 'published ordinary added-kong win must settle immediately');
  assert.equal(immediate.mustDiscard, false);
  assert.ok(immediate.settlement, 'immediate added-kong win must have a settlement');
  assert.ok(immediate.classification.decompositionSignature, 'immediate added-kong output must bind a decomposition signature');

  const fakeInput = {
    owner: 0,
    kongTile: 'tiao9',
    preKongHand: ['tong3', 'tiao8', 'tiao4', 'tong3', 'tong5', 'tiao3', 'tong7', 'tiao6', 'tiao2', 'tiao7', 'tiao9'],
    melds: [{ type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }],
    drawTile: 'tiao5',
    scores,
    robKongState: { phase: 'discarding', currentPlayer: 0, players: [{ hand: ['tong3', 'tiao8', 'tiao4', 'tong3', 'tong5', 'tiao3', 'tong7', 'tiao6', 'tiao2', 'tiao7', 'tiao9'], melds: [{ type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }] }, ...emptyOpponents.slice(1)], melds: [[{ type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0, scores, wallTiles: [], passRecords: [] },
  };
  const fake = rules.resolveAddedKongDraw(fakeInput);
  assert.equal(fake.outcome, 'addedKongFakeWin', 'the post-added-kong supplement must resolve through the resource fake-win branch');
  assert.equal(fake.mustDiscard, false);
  assert.deepEqual(fake.handAfterDraw, fakeInput.preKongHand.filter((tile, index) => !(tile === 'tiao9' && index === 10)).concat('tiao5'), 'resource classification must not forge the physical supplement tile');
  assert.deepEqual(fake.classification.handTypes, ['平胡']);
  assert.match(fake.classification.decompositionSignature, /pair=tong3,tong3/);
  assert.deepEqual(fake.settlement.delta, [6, -2, -2, -2], 'ordinary added-kong fake wins use the ordinary kong-kai settlement');
  assert.equal(fake.publicLog.outcome, 'addedKongFakeWin');

  const chainInput = {
    owner: 0,
    kongTile: 'tong1',
    preKongHand: ['tong1', 'wan2', 'wan3', 'wan4', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'zhong', 'fa'],
    melds: [pengTong1, pengWan2],
    resource: activeTong1,
    drawTile: 'wan2',
    scores,
    robKongState: { phase: 'discarding', currentPlayer: 0, players: [{ hand: ['tong1', 'wan2', 'wan3', 'wan4', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'zhong', 'fa'], melds: [pengTong1, pengWan2] }, ...emptyOpponents.slice(1)], melds: [[pengTong1, pengWan2], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0, scores, wallTiles: [], passRecords: [] },
  };
  const chain = rules.resolveAddedKongDraw(chainInput);
  assert.equal(chain.outcome, 'addedKongChainWindow', 'first supplement matching another real peng must open a manual chain window');
  assert.equal(chain.mustDiscard, false);
  assert.equal(chain.chainWindow.chainPongMeld.tiles[0], 'wan2');
  assert.equal(chain.resourceAfterKong.status, 'consumed');
  assert.equal(chain.settlement, undefined);

  const robbedInput = {
    ...continueInput,
    kongTile: 'tong6',
    preKongHand: continueInput.preKongHand.map((tile) => tile === 'tong1' ? 'tong6' : tile),
    melds: [{ type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 1 }],
    robKongState: { ...continueInput.robKongState, players: [
      { hand: continueInput.preKongHand.map((tile) => tile === 'tong1' ? 'tong6' : tile), melds: [{ type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 1 }] },
      { hand: ['tong6', 'tong6', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4'], melds: [] },
      ...emptyOpponents.slice(2),
    ] },
  };
  const robbed = rules.resolveAddedKongDraw(robbedInput);
  assert.equal(robbed.outcome, 'addedKongRobbed', 'nearest rob-kong win must prevent the added-kong commit');
  assert.equal(robbed.robKongWinner, 1);
  assert.deepEqual(robbed.handAfterDraw, robbedInput.preKongHand, 'rob-kong result must not consume hand tiles or draw a supplement');
  assert.deepEqual(robbed.melds, robbedInput.melds, 'rob-kong result must leave melds unchanged');
  assert.equal(robbed.settlement, undefined);

  console.log('stage8 v2 added-kong resolution regression: passed');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
