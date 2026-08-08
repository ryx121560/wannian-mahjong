import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const compiledDir = path.join(os.tmpdir(), `wannian-stage8-v2-normal-concealed-${process.pid}`);
const require = createRequire(import.meta.url);

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

fs.rmSync(compiledDir, { recursive: true, force: true });
compileTree(path.join(root, 'src/game/rules'), path.join(compiledDir, 'rules'));
compileTree(path.join(root, 'src/game/stage8'), path.join(compiledDir, 'stage8'));
const v2 = require(path.join(compiledDir, 'stage8/action-space-v2.js'));

const normalHand = [
  'tong6', 'tong6', 'tong6', 'tong6',
  'wan4', 'wan4', 'wan4', 'wan8', 'wan8',
  'tiao2', 'tiao3', 'tiao4', 'tong5', 'tong5',
];
const state = {
  phase: 'discarding', currentPlayer: 0, newDrawnTile: 'wan4',
  players: [{ hand: normalHand, melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
  melds: [[], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['wan9', 'wan6'], passRecords: [],
};
const protocol = { actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION };

const actions = v2.deriveStage8V2Actions({ ...protocol, state, playerId: 0 });
const normalAction = actions.canonicalLegalActions.find((action) => action.actionType === 'normalConcealedKong');
assert.ok(normalAction, 'normal concealed kong must be an independent v2 action');
assert.equal(normalAction.context.declarationWindow, 'self-draw-discard');
assert.equal(normalAction.context.robKongWindow, false);
assert.equal(normalAction.tile, 'tong6');
assert.equal(normalAction.actionId, v2.STAGE8_ACTION_REGISTRY_V2.normalConcealedKong.baseId + 14, 'canonical action IDs must be stable and registry-based');

const claim = v2.prepareStage8V2NormalConcealedKongClaim({ ...protocol, state, playerId: 0, tile: 'tong6' });
assert.equal('drawTile' in claim, false, 'a normal concealed-kong declaration must not spoof its supplement draw');
assert.equal(claim.declarationWindowDrawTile, 'wan4');

const fake = v2.simulateStage8V2NormalConcealedKong({ ...protocol, state, claim });
assert.equal(fake.outcome, 'normalConcealedKongFakeWin');
assert.equal(fake.nextState.phase, 'ended');
assert.equal(fake.robKongWindowOpened, false);
assert.deepEqual(fake.settlement.delta, [12, -4, -4, -4]);
assert.equal(fake.nextState.wallTiles.length, 1, 'simulation must consume exactly the wall-top supplement');
assert.deepEqual(fake.nextState.melds[0][0], { type: 'anGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'] });

const trueResult = v2.simulateStage8V2NormalConcealedKong({
  ...protocol, state: { ...state, wallTiles: ['wan9', 'wan8'] }, claim,
});
assert.equal(trueResult.outcome, 'normalConcealedKongTrueWin');
assert.deepEqual(trueResult.settlement.delta, [24, -8, -8, -8]);

assert.throws(() => v2.deriveStage8V2Actions({ state, playerId: 0 }), /stage8-action-space-v2 protocol required/);
assert.throws(
  () => v2.deriveStage8V2Actions({ ...protocol, state, playerId: 0, replayCursor: 1 }),
  /v1 artifact field rejected/,
  'v1 replay/checkpoint/model inputs must be rejected at public v2 entry points',
);
assert.throws(
  () => v2.simulateStage8V2NormalConcealedKong({ ...protocol, state, claim: { ...claim, v1ActionId: 105 } }),
  /v1 artifact field rejected: v1ActionId/,
  'v1 identifiers nested in a public claim must be rejected too',
);
assert.deepEqual(v2.scanStage8V2PublicSummary(fake.publicLogSummary), [], 'v2 public summaries must not include hidden state or future wall data');

console.log('stage8 v2 normal concealed kong regression: passed');
