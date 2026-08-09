import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const sourceDir = path.join(root, 'src/game/rules');
const compiledDir = path.join(os.tmpdir(), `wannian-p0-special-kong-${process.pid}`);
const require = createRequire(import.meta.url);

function loadRules() {
  fs.rmSync(compiledDir, { recursive: true, force: true });
  fs.mkdirSync(compiledDir, { recursive: true });
  for (const file of fs.readdirSync(sourceDir).filter((name) => name.endsWith('.ts'))) {
    const sourcePath = path.join(sourceDir, file);
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true },
      fileName: sourcePath,
    }).outputText;
    fs.writeFileSync(path.join(compiledDir, file.replace(/\.ts$/, '.js')), output);
  }
  return require(path.join(compiledDir, 'index.js'));
}

const rules = loadRules();
for (const name of [
  'resolveForcedRunConcealed',
  'createCandidateConcealedKongResource',
  'enumeratePostPongCandidateConcealedKongs',
  'transitionCandidateConcealedKongResource',
  'resolveDoublePongForcedRun',
  'prepareAddedKongChainWindow',
  'resolveAddedKongChain',
  'scoreSpecialKongSettlement',
]) assert.equal(typeof rules[name], 'function', `${name} must be exported`);

const normalConcealedInput = {
  owner: 0,
  kongTile: 'wan1',
  preKongHand: ['wan1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan8', 'dong', 'dong'],
  handAfterKong: ['wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan8', 'dong', 'dong'],
  melds: [{ type: 'anGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'] }],
  drawTile: 'wan8',
};
assert.throws(() => rules.resolveForcedRunConcealed(normalConcealedInput), /normal-concealed-kong-available/);

const forcedRun = rules.resolveForcedRunConcealed({
  owner: 0,
  kongTile: 'wan1',
  preKongHand: ['fa', 'fa', 'wan1', 'wan1', 'wan1', 'wan1', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tong5', 'tong6', 'dong'],
  handAfterKong: ['fa', 'fa', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tong5', 'tong6', 'dong'],
  melds: [{ type: 'anGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'] }],
  drawTile: 'tiao4',
});
assert.deepEqual(
  rules.scoreSpecialKongSettlement({ action: forcedRun.action, winner: 0, scores: [100, 100, 100, 100] }).delta,
  [6, -2, -2, -2],
);

const eastPong = { type: 'peng', tiles: ['dong', 'dong', 'dong'], fromPlayer: 3 };
const candidate = rules.createCandidateConcealedKongResource({ owner: 0, pongMeld: eastPong, candidateKongTile: 'wan1' });
assert.equal(rules.transitionCandidateConcealedKongResource(candidate, { type: 'decline' }).status, 'active');
assert.equal(rules.transitionCandidateConcealedKongResource(candidate, { type: 'discard', player: 0, tile: 'wan1' }).status, 'invalidated');
assert.equal(rules.transitionCandidateConcealedKongResource(candidate, { type: 'roundEnd' }).status, 'invalidated');
assert.deepEqual(
  rules.enumeratePostPongCandidateConcealedKongs({
    owner: 0,
    pongMeld: eastPong,
    hand: ['wan1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan2', 'wan5', 'wan5', 'wan5', 'bai', 'bai'],
  }).map((item) => item.candidateKongTile),
  ['wan1', 'wan2'],
);

const pong1 = { type: 'peng', tiles: ['wan1', 'wan1', 'wan1'], fromPlayer: 1 };
const pong2 = { type: 'peng', tiles: ['wan2', 'wan2', 'wan2'], fromPlayer: 2 };
const doublePong = rules.resolveDoublePongForcedRun({
  owner: 0,
  selectedResource: rules.createKongResource({ owner: 0, tile: 'wan1', pongMeld: pong1, source: 'pong' }),
  conditionalResource: rules.createKongResource({ owner: 0, tile: 'wan2', pongMeld: pong2, source: 'pong' }),
  preKongHand: ['wan1', 'wan2', 'zhong', 'zhong', 'tong5', 'tong6', 'tiao5', 'tiao6', 'dong'],
  handAfterKong: ['wan2', 'zhong', 'zhong', 'tong5', 'tong6', 'tiao5', 'tiao6', 'dong'],
  melds: [{ type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 }, pong2],
  drawTile: 'tong4',
});
assert.equal(doublePong.resourceAfterKong.selected.status, 'consumed');
assert.equal(doublePong.resourceAfterKong.conditional.status, 'active');

const chainBase = {
  owner: 0,
  initialResource: rules.createKongResource({ owner: 0, tile: 'wan2', pongMeld: pong2, source: 'pong' }),
  chainPongMeld: pong1,
  preKongHand: ['wan2', 'zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  initialHandAfterKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  initialMelds: [{ type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 }, pong1],
};
assert.deepEqual(rules.prepareAddedKongChainWindow({ ...chainBase, firstDrawTile: 'wan3' }), {
  canDeclare: false, reason: 'first-draw-does-not-match-real-pong', robKongWindow: false,
});
const chain = rules.resolveAddedKongChain({
  ...chainBase,
  firstDrawTile: 'wan1',
  handBeforeChainKong: ['zhong', 'wan1', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  handAfterChainKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  melds: [
    { type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 },
    { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 },
  ],
  drawTile: 'zhong',
});
assert.equal(chain.outcome, 'addedKongChainTrueWin');
assert.equal(chain.evaluation.decomposition.resourceUse.sourceTile, 'wan2');
assert.deepEqual(rules.scoreSpecialKongSettlement({ action: chain.action, winner: 0, scores: [100, 100, 100, 100] }).delta, [24, -8, -8, -8]);
assert.deepEqual(
  rules.scoreSpecialKongSettlement({ action: { ...chain.action, input: { ...chain.action.input, drawTile: 'bai' } }, winner: 0, scores: [100, 100, 100, 100] }).delta,
  [12, -4, -4, -4],
);

console.log('P0 special kong rules stage 1 regression: passed');
