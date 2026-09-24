import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const sourceDir = path.join(root, 'src/game/rules');
const compiledDir = path.join(os.tmpdir(), `wannian-p0-kong-rules-${process.pid}`);
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
const tong6Peng = { type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 0 };

// A real pong and its retained tile must create owner-bound resource state.
const resource = rules.createKongResource({
  owner: 1,
  tile: 'tong6',
  pongMeld: tong6Peng,
  source: 'pong',
});
assert.deepEqual(resource, {
  owner: 1,
  tile: 'tong6',
  pongMeld: tong6Peng,
  source: 'pong',
  status: 'active',
});

function resolveKongDraw(input) {
  const preKongTiles = input.kind === 'forcedRunDeferred'
    ? [resource.tile]
    : [resource.tile, resource.tile, resource.tile];
  return rules.resolveKongDraw({
    owner: resource.owner,
    preKongHand: input.preKongHand || preKongTiles.concat(input.handAfterKong),
    ...input,
  });
}

// A legal discard win suppresses pong and both kong response branches.
const responseState = {
  phase: 'responding',
  currentPlayer: 0,
  lastDiscard: 'tong6',
  lastDiscardPlayer: 0,
  players: [
    { hand: [] },
    { hand: ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4', 'wan4', 'tong6'], melds: [] },
    { hand: ['tong6', 'tong6', 'tong6'], melds: [] },
    { hand: [], melds: [] },
  ],
  melds: [[], [], [], []],
  discards: [[], [], [], []],
  turn: 0,
  dealer: 0,
  scores: [100, 100, 100, 100],
  wallTiles: [],
  passRecords: [],
};
assert.equal(rules.resolveDiscardWinner(responseState), 1);
assert.deepEqual(rules.getLegalActions(responseState, 2), ['pass']);

// The direct-chisel example is recognized from the real response hand.
const directChisel = rules.classifyDiscardKongClaim({
  hand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tiao1'],
  melds: [],
  discardTile: 'tong6',
  owner: 1,
});
assert.equal(directChisel.kind, 'directChisel');
assert.equal(directChisel.canDecline, true);

const directChiselState = {
  ...responseState,
  players: [
    { hand: [] },
    { hand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tiao1'], melds: [] },
    { hand: [], melds: [] },
    { hand: [], melds: [] },
  ],
};
assert.deepEqual(rules.getLegalActions(directChiselState, 1), ['pong', 'directChisel', 'pass']);

const deferredState = {
  ...responseState,
  phase: 'discarding',
  currentPlayer: 1,
  newDrawnTile: 'tong6',
  players: [{ hand: [] }, { hand: ['tong6', 'wan1'], melds: [tong6Peng] }, { hand: [] }, { hand: [] }],
  kongResources: [resource],
};
assert.deepEqual(rules.getLegalActions(deferredState, 1), ['discard', 'addedKong', 'deferredForcedRunKong']);
assert.equal(rules.consumeKongResource(resource).status, 'consumed');
assert.equal(rules.invalidateKongResource(resource).status, 'invalidated');
assert.equal(rules.transitionKongResource(resource, { type: 'discard', player: 2, tile: 'tong6' }).status, 'active');
assert.equal(rules.transitionKongResource(resource, { type: 'discard', player: 1, tile: 'tong6' }).status, 'invalidated');
assert.equal(rules.transitionKongResource(resource, { type: 'declareKong', player: 1 }).status, 'consumed');
assert.equal(rules.transitionKongResource(resource, { type: 'roundEnd' }).status, 'invalidated');

// Rob-kong uses the same clockwise-nearest rule before any kong consumption or draw.
const robKongState = {
  ...responseState,
  players: [
    { hand: [] },
    { hand: ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4', 'wan4', 'tong6'], melds: [] },
    { hand: ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4', 'wan4', 'tong6'], melds: [] },
    { hand: [], melds: [] },
  ],
};
assert.equal(rules.resolveRobKongWinner(robKongState, 0, 'tong6'), 1);

// Forced-run success is distinct from direct chisel and settles as fake win.
for (const drawTile of ['tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao9']) {
  const forcedRun = resolveKongDraw({
    kind: 'forcedRunImmediate',
    resource,
    handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
    melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
    drawTile,
  });
  assert.equal(forcedRun.outcome, 'forcedRunGangKaiFakeWin', `expected ${drawTile} to run successfully`);
  assert.equal(forcedRun.mustDiscard, false);
  assert.equal(forcedRun.evaluation.classification?.selectedDecomposition?.signature, forcedRun.evaluation.decomposition?.signature);
}

for (const drawTile of ['tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao9']) {
  const forcedRun = resolveKongDraw({
    kind: 'forcedRunImmediate',
    resource,
    handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao3', 'tiao4', 'tiao7', 'tiao8'],
    melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
    drawTile,
  });
  assert.equal(forcedRun.outcome, 'forcedRunGangKaiFakeWin', `expected ${drawTile} to run successfully`);
  assert.equal(forcedRun.mustDiscard, false);
  assert.equal(forcedRun.evaluation.classification?.selectedDecomposition?.signature, forcedRun.evaluation.decomposition?.signature);
}

const delayedResourceA = resolveKongDraw({
  kind: 'forcedRunDeferred',
  resource,
  handAfterKong: ['fa', 'fa', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao8', 'dong'],
  melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
  drawTile: 'fa',
});
assert.equal(delayedResourceA.outcome, 'forcedRunGangKaiFakeWin');
assert.equal(delayedResourceA.mustDiscard, false);

// Game 25 equivalent: a deferred forced run may end in a real standard hand.
// The real hand must not be mislabeled or settled as a resource-only fake win.
const game25Resource = rules.createKongResource({
  owner: 0,
  tile: 'tiao6',
  pongMeld: { type: 'peng', tiles: ['tiao6', 'tiao6', 'tiao6'], fromPlayer: 1 },
  source: 'pong',
});
const game25Action = {
  kind: 'forcedRunDeferred',
  owner: 0,
  resource: game25Resource,
  preKongHand: ['tiao6', 'wan9', 'tiao8', 'xi', 'wan8', 'bei', 'nan', 'wan7'],
  handAfterKong: ['wan9', 'tiao8', 'xi', 'wan8', 'bei', 'nan', 'wan7'],
  melds: [
    { type: 'mingGang', tiles: ['tiao6', 'tiao6', 'tiao6', 'tiao6'], fromPlayer: 1 },
    { type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 3 },
  ],
  drawTile: 'tiao8',
};
const game25Resolution = rules.resolveKongDraw(game25Action);
assert.equal(game25Resolution.outcome, 'forcedRunGangKaiTrueWin');
assert.equal(game25Resolution.mustDiscard, false);
assert.deepEqual(game25Resolution.evaluation.classification.handTypes, ['平胡']);
assert.equal(
  game25Resolution.evaluation.classification.decompositionSignature,
  'pair=tiao8,tiao8|groups=nan,xi,bei;wan7,wan8,wan9|melds=mingGang:tiao6,tiao6,tiao6,tiao6;peng:tiao9,tiao9,tiao9|resource=none|remainder=none',
);
const game25Settlement = rules.scoreKongSettlement({
  action: game25Action,
  winner: 0,
  scores: [100, 100, 100, 100],
});
assert.deepEqual(game25Settlement.payments, [0, 4, 4, 4]);
assert.deepEqual(game25Settlement.delta, [12, -4, -4, -4]);

for (const drawTile of ['fa', 'tiao6', 'tiao9']) {
  const delayedResourceB = resolveKongDraw({
    kind: 'forcedRunDeferred',
    resource,
    handAfterKong: ['fa', 'fa', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao7', 'tiao8'],
    melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
    drawTile,
  });
  const expectedOutcome = rules.canWin(
    ['fa', 'fa', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao7', 'tiao8', drawTile],
    { melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }] },
  ).canWin ? 'forcedRunGangKaiTrueWin' : 'forcedRunGangKaiFakeWin';
  assert.equal(delayedResourceB.outcome, expectedOutcome, `expected delayed ${drawTile} to preserve its real/fake win classification`);
  assert.equal(delayedResourceB.mustDiscard, false);
}

const forcedRunFailure = resolveKongDraw({
  kind: 'forcedRunImmediate',
  resource,
  handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
  drawTile: 'zhong',
});
assert.equal(forcedRunFailure.outcome, 'forcedRunFailureDiscard');
assert.equal(forcedRunFailure.mustDiscard, true);

const deferredForcedRunFailure = resolveKongDraw({
  kind: 'forcedRunDeferred',
  resource,
  handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  melds: [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
  drawTile: 'zhong',
});
assert.equal(deferredForcedRunFailure.outcome, 'forcedRunFailureDiscard');
assert.equal(deferredForcedRunFailure.mustDiscard, true);

// The legal highest-scoring decomposition must include peng-peng-hu when available.
const multiDecomposition = rules.classifyHand(
  ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4'],
  [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
);
assert.deepEqual(multiDecomposition.handTypes, ['碰碰胡']);
assert.equal(multiDecomposition.baseScore, 2);
const shuffledMultiDecomposition = rules.classifyHand(
  ['wan4', 'wan2', 'wan1', 'wan3', 'wan3', 'wan2', 'wan1', 'wan3', 'wan2', 'wan1', 'wan4'],
  [{ type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 }],
);
assert.equal(multiDecomposition.decompositionSignature, shuffledMultiDecomposition.decompositionSignature);
assert.match(multiDecomposition.decompositionSignature, /^pair=wan4,wan4\|groups=/);

// Each payer is capped after all multipliers, never by winner total.
const capHand = ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4'];
const capResource = rules.createKongResource({
  owner: 0,
  tile: 'wan6',
  pongMeld: { type: 'peng', tiles: ['wan6', 'wan6', 'wan6'], fromPlayer: 1 },
  source: 'pong',
});
const capContext = {
  owner: 0,
  resource: capResource,
  preKongHand: ['wan6', ...capHand],
  hand: capHand,
  melds: [{ type: 'mingGang', tiles: ['wan6', 'wan6', 'wan6', 'wan6'], fromPlayer: 1 }],
  allowFakeWinRemainder: false,
};
const capEvaluation = rules.evaluateKongResource(capContext);
const capAction = {
  kind: 'directChisel',
  owner: 0,
  resource: capResource,
  preKongHand: ['wan6', 'wan6', 'wan6', ...capHand.slice(0, -1)],
  handAfterKong: capHand.slice(0, -1),
  melds: capContext.melds,
  drawTile: 'wan4',
};
const capped = rules.scoreKongSettlement({
  action: capAction,
  winner: 0,
  pointKongPlayer: 1,
  scores: [100, 100, 100, 100],
  context: capContext,
});
assert.deepEqual(capped.delta, [48, -16, -16, -16]);
assert.deepEqual(capped.payments, [0, 16, 16, 16]);
const forgedClassificationIgnored = rules.scoreKongSettlement({
  action: capAction,
  event: 'directChiselFakeWin',
  winner: 0,
  pointKongPlayer: 1,
  scores: [100, 100, 100, 100],
  context: capContext,
  evaluation: {
    ...capEvaluation,
    decomposition: multiDecomposition.selectedDecomposition,
  },
});
assert.deepEqual(forgedClassificationIgnored.delta, capped.delta, 'settlement must recompute and ignore forged classification data');
assert.deepEqual(forgedClassificationIgnored.handTypes, capped.handTypes);

// Direct chisel first verifies pre-draw eligibility. Its score classification is
// then rebuilt from the supplement draw, which changes clear one suit to mixed.
const directResource = rules.createKongResource({
  owner: 1,
  tile: 'wan9',
  pongMeld: { type: 'peng', tiles: ['wan9', 'wan9', 'wan9'], fromPlayer: 0 },
  source: 'pong',
});
const directHandAfterKong = ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan7', 'wan7', 'wan8'];
const directPreKongHand = ['wan9', 'wan9', 'wan9', ...directHandAfterKong];
const directMelds = [{ type: 'mingGang', tiles: ['wan9', 'wan9', 'wan9', 'wan9'], fromPlayer: 0 }];
const directResolution = rules.resolveKongDraw({
  kind: 'directChisel',
  owner: 1,
  resource: directResource,
  preKongHand: directPreKongHand,
  handAfterKong: directHandAfterKong,
  melds: directMelds,
  drawTile: 'zhong',
});
assert.equal(directResolution.outcome, 'directChiselFakeWin');
assert.equal(directResolution.resourceAfterKong.status, 'consumed');
assert.deepEqual(directResolution.evaluation.classification.handTypes, ['混一色']);
const directFinalContext = {
  owner: 1,
  resource: directResource,
  preKongHand: directPreKongHand,
  hand: directHandAfterKong.concat('zhong'),
  melds: directMelds,
  allowFakeWinRemainder: true,
};
const directFinalSettlement = rules.scoreKongSettlement({
  action: {
    kind: 'directChisel',
    owner: 1,
    resource: directResource,
    preKongHand: directPreKongHand,
    handAfterKong: directHandAfterKong,
    melds: directMelds,
    drawTile: 'zhong',
  },
  event: 'directChiselTrueWin',
  winner: 1,
  pointKongPlayer: 0,
  scores: [100, 100, 100, 100],
});
assert.deepEqual(directFinalSettlement.payments, [8, 0, 4, 4]);
assert.deepEqual(directFinalSettlement.delta, [-8, 16, -4, -4]);
assert.equal(directFinalSettlement.event, 'directChiselFakeWin', 'a forged direct true event must not alter the derived fake settlement');

// Product-review regressions: conditional resources are owner-bound and may not
// rewrite unrelated tiles or manufacture a pair from unrelated singletons.
const kongMeld = { type: 'mingGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'], fromPlayer: 0 };
const resourceContext = {
  owner: 1,
  resource,
  preKongHand: ['tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  melds: [kongMeld],
  allowFakeWinRemainder: true,
};
const resourceWitness = rules.evaluateKongResource({
  ...resourceContext,
  hand: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9', 'tiao4'],
});
assert.equal(resourceWitness.canComplete, true);
assert.equal(resourceWitness.reason, 'resource-conditional-structure');
assert.deepEqual(resourceWitness.decomposition.resourceUse, { sourceTile: 'tong6', role: 'pair', asTile: 'tiao8' });
assert.equal(resourceWitness.decomposition.fakeWinRemainder, 'tiao9');
assert.equal(resourceWitness.witnesses.length, 2, 'the fixture has two equal-score resource witnesses');
const shuffledEqualScoreWitness = rules.evaluateKongResource({
  ...resourceContext,
  hand: ['tiao4', 'tiao9', 'wan6', 'wan5', 'wan4', 'wan3', 'wan2', 'wan1', 'tiao8', 'tiao6', 'tiao5'],
});
assert.equal(resourceWitness.classification.decompositionSignature, shuffledEqualScoreWitness.classification.decompositionSignature);

// Resource witnesses must be enumerated before scoring. This state has both a
// plain-sequence witness and a higher-scoring peng-peng-hu witness.
const multiWitnessInput = {
  ...resourceContext,
  hand: ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan9'],
};
const multiWitnessEvaluation = rules.evaluateKongResource(multiWitnessInput);
assert.equal(multiWitnessEvaluation.canComplete, true);
assert.ok(multiWitnessEvaluation.witnesses.length >= 2);
assert.deepEqual(multiWitnessEvaluation.classification.handTypes, ['碰碰胡']);
assert.equal(multiWitnessEvaluation.classification.selectedDecomposition.signature, multiWitnessEvaluation.decomposition.signature);
const shuffledMultiWitnessEvaluation = rules.evaluateKongResource({
  ...multiWitnessInput,
  hand: ['wan9', 'wan4', 'wan3', 'wan2', 'wan1', 'wan3', 'wan2', 'wan1', 'wan3', 'wan2', 'wan1'],
});
assert.equal(
  multiWitnessEvaluation.classification.decompositionSignature,
  shuffledMultiWitnessEvaluation.classification.decompositionSignature,
  'equal-score candidates must use a canonical signature independent of input order',
);

const forcedRunAction = {
  kind: 'forcedRunImmediate',
  owner: 1,
  resource,
  preKongHand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'],
  melds: [kongMeld],
  drawTile: 'tiao4',
};
const forcedRunSettlement = rules.scoreKongSettlement({
  action: forcedRunAction,
  event: 'directChiselTrueWin',
  winner: 1,
  scores: [100, 100, 100, 100],
  context: multiWitnessInput,
});
assert.equal(forcedRunSettlement.event, 'forcedRunGangKaiFakeWin', 'forced runs must always derive the fake-win event');
assert.throws(
  () => rules.scoreKongSettlement({ ...forcedRunSettlement, action: { ...forcedRunAction, kind: 'directChisel' } }),
  /invalid direct chisel context/,
  'a forced-run state may not claim direct chisel responsibility',
);
assert.throws(
  () => rules.scoreKongSettlement({ winner: 0, pointKongPlayer: 1, scores: [100, 100, 100, 100], action: { ...capAction, kind: 'forcedRunImmediate' } }),
  /direct-chisel-available/,
  'a direct-chisel state may not claim forced-run responsibility',
);

// Chain kong replays a real second-kong declaration. The original pong resource
// was consumed by the first direct chisel; the second kong is four real wan1.
const chainAction = {
  kind: 'chainKong',
  owner: 1,
  resource: rules.consumeKongResource(resource),
  preKongHand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
  initialHandAfterKong: ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
  initialMelds: [kongMeld],
  firstDrawTile: 'wan1',
  secondKongTile: 'wan1',
  secondKongMeld: { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 },
  handBeforeKong: ['wan1', 'wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
  handAfterKong: ['wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4'],
  melds: [kongMeld, { type: 'mingGang', tiles: ['wan1', 'wan1', 'wan1', 'wan1'], fromPlayer: 1 }],
  drawTile: 'wan9',
};
const chainBeforeRob = JSON.stringify(chainAction);
const { kind: _chainKind, handAfterKong: _chainHandAfterKong, melds: _chainMelds, drawTile: _chainDrawTile, ...chainDeclaration } = chainAction;
const preparedChainKong = rules.prepareChainKongDeclaration(chainDeclaration);
assert.equal(preparedChainKong.canDeclare, true);
assert.equal(preparedChainKong.reason, 'ok');
assert.deepEqual(preparedChainKong.handAfterKong, chainAction.handAfterKong);
assert.deepEqual(
  rules.prepareChainKongDeclaration({ ...chainDeclaration, resource }),
  { canDeclare: false, reason: 'initial-resource-not-consumed' },
  'a chain kong may not reuse the active first-kong resource',
);
const secondKongRobState = {
  ...responseState,
  players: [
    { hand: [] },
    { hand: chainAction.handBeforeKong, melds: [kongMeld] },
    { hand: ['wan1', 'wan2', 'wan2', 'wan3', 'wan3', 'wan4', 'wan4', 'wan5', 'wan5', 'tong1', 'tong1', 'tong2', 'tong2'], melds: [] },
    { hand: [], melds: [] },
  ],
};
assert.equal(rules.resolveRobKongWinner(secondKongRobState, 1, 'wan1'), 2);
assert.equal(JSON.stringify(chainAction), chainBeforeRob, 'a robbed second kong must not consume tiles or draw a supplement');
const chainResolution = rules.resolveKongDraw(chainAction);
assert.equal(chainResolution.resourceAfterKong.status, 'consumed');
assert.equal(chainResolution.outcome, 'directChiselChainFakeWin');
assert.equal(rules.evaluateKongResource({
  ...resourceContext,
  hand: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9', 'zhong'],
}).canComplete, false, 'unrelated tile replacement must not make a kong win');
assert.equal(rules.evaluateKongResource({
  ...resourceContext,
  hand: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao1', 'tiao4', 'tiao7', 'dong', 'bei'],
}).canComplete, false, 'two unrelated singletons must not become a pair');
assert.equal(rules.evaluateKongResource({
  ...resourceContext,
  owner: 2,
  hand: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9', 'tiao4'],
}).canComplete, false, 'another player cannot consume this resource');
assert.equal(rules.evaluateKongResource({
  ...resourceContext,
  resource: rules.consumeKongResource(resource),
  hand: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9', 'tiao4'],
}).canComplete, false, 'inactive resources must not complete a kong win');

// A chi meld categorically disqualifies peng-peng-hu even when the concealed
// tiles can otherwise decompose into triplets and a pair.
const chiExcluded = rules.classifyHand(
  ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4'],
  [{ type: 'chi', tiles: ['tong1', 'tong2', 'tong3'], fromPlayer: 0 }],
);
assert.equal(chiExcluded.handTypes.includes('碰碰胡'), false);

// The selected decomposition and its signature must witness the actual groups
// and pair, and must be stable across enumeration/input order.
assert.ok(multiDecomposition.selectedDecomposition);
assert.match(multiDecomposition.decompositionSignature, /pair=/);
assert.match(multiDecomposition.decompositionSignature, /groups=/);
assert.equal(multiDecomposition.selectedDecomposition.signature, multiDecomposition.decompositionSignature);

// End-to-end chain-kong case: real initial resource -> manual second kong ->
// final draw -> highest-score decomposition -> settlement.
const chainEndToEnd = rules.scoreKongSettlement({
  action: chainAction,
  event: 'directChiselChainTrueWin',
  winner: 1,
  pointKongPlayer: 0,
  scores: [100, 100, 100, 100],
});
assert.deepEqual(chainEndToEnd.delta, [-16, 32, -8, -8]);
assert.deepEqual(chainEndToEnd.payments, [16, 0, 8, 8]);
assert.equal(chainEndToEnd.event, 'directChiselChainFakeWin', 'a forged chain true event must not alter the replayed fake settlement');
assert.equal(chainEndToEnd.handTypes.includes('碰碰胡'), true);

console.log('P0 kong resource rules regression: passed');
