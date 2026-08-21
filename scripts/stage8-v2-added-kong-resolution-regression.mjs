import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'added-kong-rules-'));
const require = createRequire(import.meta.url);

function compileTree(sourceDir, outputDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(outputDir, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      compileTree(source, target);
    } else if (entry.name.endsWith('.ts')) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, ts.transpileModule(fs.readFileSync(source, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText);
    }
  }
}
try {
  compileTree(path.join(root, 'src/game/rules'), path.join(output, 'rules'));
  const { resolveAddedKongDraw } = require(path.join(output, 'rules/index.js'));
  const peng = { type: 'peng', tiles: ['tong1', 'tong1', 'tong1'], fromPlayer: 1 };
  const scores = [100, 100, 100, 100];
  const state = (hand, opponents = [{ hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }]) => ({
    phase: 'discarding', currentPlayer: 0, turn: 0, dealer: 0, scores, wallTiles: [], discards: [[], [], [], []], passRecords: [],
    players: [{ hand, melds: [peng] }, ...opponents], melds: [[peng], [], [], []],
  });
  const normal = { owner: 0, kongTile: 'tong1', preKongHand: ['tong1', 'wan1', 'wan2', 'wan3', 'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'zhong'], melds: [peng], drawTile: 'bai', scores, robKongState: state(['tong1', 'wan1', 'wan2', 'wan3', 'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'zhong']) };
  const continued = resolveAddedKongDraw(normal);
  assert.equal(continued.outcome, 'addedKongContinueDiscard');
  assert.equal(continued.mustDiscard, true);
  assert.equal(continued.melds[0].type, 'mingGang');
  const won = resolveAddedKongDraw({ ...normal, preKongHand: ['tong1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4'], drawTile: 'wan4', robKongState: state(['tong1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4']) });
  assert.equal(won.outcome, 'addedKongImmediateWin');
  assert.equal(won.settlement.delta.reduce((sum, value) => sum + value, 0), 0);
  assert.deepEqual(won.settlement.after.map((value, index) => value - won.settlement.before[index]), won.settlement.delta);
  const robbed = resolveAddedKongDraw({ ...normal, kongTile: 'tong6', preKongHand: normal.preKongHand.map((tile) => tile === 'tong1' ? 'tong6' : tile), melds: [{ type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 1 }], robKongState: state(normal.preKongHand.map((tile) => tile === 'tong1' ? 'tong6' : tile), [{ hand: ['tong6', 'tong6', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4'], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }]) });
  assert.equal(robbed.outcome, 'addedKongRobbed');
  assert.equal(robbed.robKongWinner, 1);
  console.log('added-kong pure settlement regression: passed');
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
