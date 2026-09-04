import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import vm from 'node:vm';

const root = process.cwd();
const compiledDir = path.join(os.tmpdir(), `wannian-stage8-v2-gate-${process.pid}`);
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

const expectedTypes = [
  'pass', 'discard', 'pong', 'win', 'directChisel', 'forcedRunImmediate',
  'forcedRunDeferred', 'addedKong', 'chainKong', 'normalConcealedKong', 'forcedRunConcealed',
  'postPongCandidateConcealedKong', 'doublePongForcedRun', 'declineKong',
];

assert.equal(typeof v2.canonicalizeStage8V2Action, 'function', 'v2 must expose a canonical action registry entry point');
assert.equal(typeof v2.assertStage8V2Protocol, 'function', 'v2 must expose a protocol guard');
for (const actionType of expectedTypes) {
  assert.ok(v2.STAGE8_ACTION_REGISTRY_V2[actionType], `registry must include ${actionType}`);
}

const seen = new Set();
for (const actionType of expectedTypes) {
  const entry = v2.STAGE8_ACTION_REGISTRY_V2[actionType];
  const width = entry.tiled ? 34 : entry.parameterized ? entry.width : 1;
  for (let offset = 0; offset < width; offset += 1) {
    assert.ok(!seen.has(entry.baseId + offset), `registry action id collision at ${entry.baseId + offset}`);
    seen.add(entry.baseId + offset);
  }
}

assert.throws(
  () => v2.assertStage8V2Protocol({ actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION, manifest: 'v1' }),
  /v1 artifact field rejected: manifest/,
);

assert.equal(typeof v2.deriveStage8V2RuleActions, 'function', 'rules must expose an independent v2 semantic adapter');
assert.equal(typeof v2.deriveStage8V2PageSemanticActions, 'function', 'page semantics must expose an independent v2 adapter');
assert.equal(typeof v2.deriveStage8V2RoundEngineActions, 'function', 'round engine must expose an independent v2 adapter');
assert.equal(typeof v2.compareStage8V2CanonicalActions, 'function', 'gate must compare independent canonical action sets');

const browserContext = { globalThis: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/game/rule_engine.js'), 'utf8'), browserContext, { filename: 'rule_engine.js' });
const browserRuleEngine = browserContext.globalThis.WannianRuleEngine;
assert.equal(typeof browserRuleEngine.getLegalActions, 'function', 'published browser rule bundle must expose getLegalActions');

const responseState = {
  phase: 'responding', currentPlayer: 0, newDrawnTile: undefined,
  lastDiscard: 'tong6', lastDiscardPlayer: 0,
  players: [
    { hand: ['wan1'], melds: [] },
    { hand: ['tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tiao1', 'tiao2'], melds: [] },
    { hand: [], melds: [] }, { hand: [], melds: [] },
  ],
  melds: [[], [], [], []], discards: [['tong6'], [], [], []], turn: 1, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['wan9'], passRecords: [], kongResources: [],
};
const responseProtocol = { actionSpaceVersion: v2.STAGE8_ACTION_SPACE_V2_VERSION };
const ruleActions = v2.deriveStage8V2RuleActions({ ...responseProtocol, state: responseState, playerId: 1 });
const pageActions = v2.deriveStage8V2PageSemanticActions({ ...responseProtocol, state: responseState, playerId: 1, browserRuleEngine });
const roundActions = v2.deriveStage8V2RoundEngineActions({ ...responseProtocol, state: responseState, playerId: 1 });
assert.ok(ruleActions.some((action) => action.actionType === 'pong'), 'rule adapter must expose legal pong');
assert.ok(ruleActions.some((action) => action.actionType === 'pass'), 'rule adapter must expose pass');
assert.equal(ruleActions.some((action) => action.actionType === 'declineKong'), false, 'discard response must use pass/pong/win/kong choices without a separate declineKong');
assert.equal(pageActions.some((action) => action.actionType === 'declineKong'), false, 'page discard response must not synthesize declineKong');
assert.equal(roundActions.some((action) => action.actionType === 'declineKong'), false, 'round-engine discard response must not synthesize declineKong');
assert.deepEqual(v2.compareStage8V2CanonicalActions(ruleActions, pageActions), { equal: true, leftOnly: [], rightOnly: [] }, 'browser facade actions must match rule actions');
assert.deepEqual(v2.compareStage8V2CanonicalActions(ruleActions, roundActions), { equal: true, leftOnly: [], rightOnly: [] }, 'round-engine actions must match rule actions');

const concealedForcedState = {
  phase: 'discarding', currentPlayer: 0, newDrawnTile: 'dong',
  players: [{ hand: ['tong6', 'tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan7', 'wan9', 'tiao1', 'tiao3', 'tiao5'], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
  melds: [[], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['wan9', 'tiao4'], passRecords: [], kongResources: [],
};
const forcedRuleActions = v2.deriveStage8V2RuleActions({ ...responseProtocol, state: concealedForcedState, playerId: 0 });
const forcedPageActions = v2.deriveStage8V2PageSemanticActions({ ...responseProtocol, state: concealedForcedState, playerId: 0, browserRuleEngine });
const forcedRoundActions = v2.deriveStage8V2RoundEngineActions({ ...responseProtocol, state: concealedForcedState, playerId: 0 });
assert.ok(forcedRuleActions.some((action) => action.actionType === 'forcedRunConcealed'), 'non-complete four-tile concealed kong must expose forcedRunConcealed');
assert.ok(forcedRuleActions.some((action) => action.actionType === 'declineKong' && action.context.declarationWindow === 'self-draw-discard'), 'self-draw kong choice must expose one explicit declineKong');
const forcedNormalAction = forcedRuleActions.find((action) => action.actionType === 'normalConcealedKong');
const forcedAlternativeAction = forcedRuleActions.find((action) => action.actionType === 'forcedRunConcealed');
assert.ok(forcedNormalAction, 'normal concealed kong must remain available beside the optional forced-run declaration');
assert.notEqual(forcedNormalAction.actionId, forcedAlternativeAction.actionId, 'normal concealed kong and forced run must remain distinct canonical choices');
assert.deepEqual(v2.compareStage8V2CanonicalActions(forcedRuleActions, forcedPageActions), { equal: true, leftOnly: [], rightOnly: [] });
assert.deepEqual(v2.compareStage8V2CanonicalActions(forcedRuleActions, forcedRoundActions), { equal: true, leftOnly: [], rightOnly: [] });

const eastPong = { type: 'peng', tiles: ['dong', 'dong', 'dong'], fromPlayer: 3 };
const candidateResource = browserRuleEngine.createCandidateConcealedKongResource({ owner: 0, pongMeld: eastPong, candidateKongTile: 'wan1' });
const postPongCandidateState = {
  phase: 'discarding', currentPlayer: 0, newDrawnTile: undefined,
  players: [{ hand: ['wan1', 'wan1', 'wan1', 'wan1', 'wan5', 'wan5', 'wan5', 'bai', 'bai', 'tiao9', 'tiao9'], melds: [eastPong] }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
  melds: [[eastPong], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['wan9', 'wan8'], passRecords: [], kongResources: [],
};
const candidateInput = { ...responseProtocol, state: postPongCandidateState, playerId: 0, candidateKongResources: [candidateResource] };
const candidateRuleActions = v2.deriveStage8V2RuleActions(candidateInput);
const candidatePageActions = v2.deriveStage8V2PageSemanticActions({ ...candidateInput, browserRuleEngine });
const candidateRoundActions = v2.deriveStage8V2RoundEngineActions(candidateInput);
assert.ok(candidateRuleActions.some((action) => action.actionType === 'postPongCandidateConcealedKong'), 'active candidate resource must expose post-pong concealed kong');
assert.deepEqual(v2.compareStage8V2CanonicalActions(candidateRuleActions, candidatePageActions), { equal: true, leftOnly: [], rightOnly: [] });
assert.deepEqual(v2.compareStage8V2CanonicalActions(candidateRuleActions, candidateRoundActions), { equal: true, leftOnly: [], rightOnly: [] });

const pong1 = { type: 'peng', tiles: ['wan1', 'wan1', 'wan1'], fromPlayer: 1 };
const pong2 = { type: 'peng', tiles: ['wan2', 'wan2', 'wan2'], fromPlayer: 2 };
const resource1 = browserRuleEngine.createKongResource({ owner: 0, tile: 'wan1', pongMeld: pong1, source: 'pong' });
const resource2 = browserRuleEngine.createKongResource({ owner: 0, tile: 'wan2', pongMeld: pong2, source: 'pong' });
const doublePongState = {
  phase: 'discarding', currentPlayer: 0, newDrawnTile: 'dong',
  players: [{ hand: ['wan1', 'wan2', 'zhong', 'zhong', 'tong5', 'tong6', 'tiao5', 'tiao6', 'dong'], melds: [pong1, pong2] }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
  melds: [[pong1, pong2], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['wan9', 'tong4'], passRecords: [], kongResources: [resource1, resource2],
};
const doubleInput = { ...responseProtocol, state: doublePongState, playerId: 0 };
const doubleRuleActions = v2.deriveStage8V2RuleActions(doubleInput);
const doublePageActions = v2.deriveStage8V2PageSemanticActions({ ...doubleInput, browserRuleEngine });
const doubleRoundActions = v2.deriveStage8V2RoundEngineActions(doubleInput);
assert.ok(doubleRuleActions.some((action) => action.actionType === 'doublePongForcedRun'), 'two active pong resources must expose doublePongForcedRun');
assert.deepEqual(v2.compareStage8V2CanonicalActions(doubleRuleActions, doublePageActions), { equal: true, leftOnly: [], rightOnly: [] });
assert.deepEqual(v2.compareStage8V2CanonicalActions(doubleRuleActions, doubleRoundActions), { equal: true, leftOnly: [], rightOnly: [] });

const chainBase = {
  owner: 0,
  initialResource: resource2,
  chainPongMeld: pong1,
  preKongHand: ['wan2', 'zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  initialHandAfterKong: ['zhong', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'],
  initialMelds: [{ type: 'mingGang', tiles: ['wan2', 'wan2', 'wan2', 'wan2'], fromPlayer: 2 }, pong1],
  firstDrawTile: 'wan1',
};
const chainState = {
  phase: 'discarding', currentPlayer: 0, newDrawnTile: 'wan1',
  players: [{ hand: ['zhong', 'wan1', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8'], melds: chainBase.initialMelds }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
  melds: [chainBase.initialMelds, [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['wan9', 'zhong'], passRecords: [], kongResources: [resource2],
};
const chainInput = { ...responseProtocol, state: chainState, playerId: 0, addedKongChainWindows: [chainBase] };
const chainRuleActions = v2.deriveStage8V2RuleActions(chainInput);
const chainPageActions = v2.deriveStage8V2PageSemanticActions({ ...chainInput, browserRuleEngine });
const chainRoundActions = v2.deriveStage8V2RoundEngineActions(chainInput);
assert.ok(chainRuleActions.some((action) => action.actionType === 'chainKong' && action.context.robKongWindow), 'matching first draw must expose a separately robbable chainKong action');
assert.deepEqual(v2.compareStage8V2CanonicalActions(chainRuleActions, chainPageActions), { equal: true, leftOnly: [], rightOnly: [] });
assert.deepEqual(v2.compareStage8V2CanonicalActions(chainRuleActions, chainRoundActions), { equal: true, leftOnly: [], rightOnly: [] });


const alternateWallState = { ...concealedForcedState, wallTiles: ['wan9', 'zhong'] };
for (const [name, derive, extra] of [
  ['rule', v2.deriveStage8V2RuleActions, {}],
  ['page', v2.deriveStage8V2PageSemanticActions, { browserRuleEngine }],
  ['round', v2.deriveStage8V2RoundEngineActions, {}],
]) {
  const first = derive({ ...responseProtocol, state: concealedForcedState, playerId: 0, ...extra });
  const alternate = derive({ ...responseProtocol, state: alternateWallState, playerId: 0, ...extra });
  assert.deepEqual(alternate, first, name + ' declaration adapter must not read or infer the future wall top');
  assert.throws(
    () => derive({ ...responseProtocol, state: concealedForcedState, playerId: 0, ...extra, manifest: 'v1' }),
    /v1 artifact field rejected: manifest/,
    name + ' declaration entry must reject v1 artifacts directly',
  );
}

assert.throws(
  () => v2.deriveStage8V2Actions({ ...responseProtocol, state: concealedForcedState, playerId: 0 }),
  /ambiguous v2 action entry disabled.*deriveStage8V2RuleActions|deriveStage8V2PageSemanticActions|deriveStage8V2RoundEngineActions/,
  'the incomplete generic v2 action entry must fail closed and require an explicit semantic adapter',
);

const directState = {
  phase: 'responding', currentPlayer: 0, newDrawnTile: undefined,
  lastDiscard: 'tong6', lastDiscardPlayer: 0,
  players: [
    { hand: ['wan9'], melds: [] },
    { hand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tiao1'], melds: [] },
    { hand: [], melds: [] }, { hand: [], melds: [] },
  ],
  melds: [[], [], [], []], discards: [['tong6'], [], [], []], turn: 1, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['zhong'], passRecords: [], kongResources: [],
};
const directRuleActions = v2.deriveStage8V2RuleActions({ ...responseProtocol, state: directState, playerId: 1 });
const directPageActions = v2.deriveStage8V2PageSemanticActions({ ...responseProtocol, state: directState, playerId: 1, browserRuleEngine });
const directRoundActions = v2.deriveStage8V2RoundEngineActions({ ...responseProtocol, state: directState, playerId: 1 });
assert.ok(directRuleActions.some((action) => action.actionType === 'directChisel'), 'rule entry must expose directChisel from a real discard-response fixture');
assert.equal(directRuleActions.some((action) => action.actionType === 'declineKong'), false, 'rule response adapter must not synthesize declineKong beside directChisel');
assert.equal(directPageActions.some((action) => action.actionType === 'declineKong'), false, 'page response adapter must not synthesize declineKong beside directChisel');
assert.equal(directRoundActions.some((action) => action.actionType === 'declineKong'), false, 'round response adapter must not synthesize declineKong beside directChisel');
assert.deepEqual(v2.compareStage8V2CanonicalActions(directRuleActions, directPageActions), { equal: true, leftOnly: [], rightOnly: [] });
assert.deepEqual(v2.compareStage8V2CanonicalActions(directRuleActions, directRoundActions), { equal: true, leftOnly: [], rightOnly: [] });

const immediateState = {
  ...directState,
  players: [
    { hand: ['wan9'], melds: [] },
    { hand: ['tong6', 'tong6', 'tong6', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao5', 'tiao6', 'tiao8', 'tiao9'], melds: [] },
    { hand: [], melds: [] }, { hand: [], melds: [] },
  ],
};
const immediateRuleActions = v2.deriveStage8V2RuleActions({ ...responseProtocol, state: immediateState, playerId: 1 });
assert.ok(immediateRuleActions.some((action) => action.actionType === 'forcedRunImmediate'), 'rule entry must expose forcedRunImmediate from a real discard-response fixture');

const winState = {
  ...directState,
  lastDiscard: 'tong6',
  players: [
    { hand: ['wan9'], melds: [] },
    { hand: ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4', 'wan4', 'wan4', 'tong6'], melds: [] },
    { hand: [], melds: [] }, { hand: [], melds: [] },
  ],
  discards: [['tong6'], [], [], []],
};
const winRuleActions = v2.deriveStage8V2RuleActions({ ...responseProtocol, state: winState, playerId: 1 });
assert.ok(winRuleActions.some((action) => action.actionType === 'win'), 'rule entry must expose win from a real response fixture');

const normalState = {
  phase: 'discarding', currentPlayer: 0, newDrawnTile: 'wan4',
  players: [{
    hand: ['tong6', 'tong6', 'tong6', 'tong6', 'wan4', 'wan4', 'wan4', 'wan8', 'wan8', 'tiao2', 'tiao3', 'tiao4', 'tong5', 'tong5'],
    melds: [],
  }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
  melds: [[], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['wan9', 'wan6'], passRecords: [], kongResources: [],
};
const normalRuleActions = v2.deriveStage8V2RuleActions({ ...responseProtocol, state: normalState, playerId: 0 });
assert.ok(normalRuleActions.some((action) => action.actionType === 'discard'), 'rule entry must expose discard');
assert.ok(normalRuleActions.some((action) => action.actionType === 'normalConcealedKong'), 'rule entry must expose normalConcealedKong');

const addedPong = { type: 'peng', tiles: ['wan3', 'wan3', 'wan3'], fromPlayer: 2 };
const addedState = {
  phase: 'discarding', currentPlayer: 0, newDrawnTile: 'dong',
  players: [{ hand: ['wan3', 'wan1', 'wan2', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tong1', 'tong2'], melds: [addedPong] }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
  melds: [[addedPong], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['bai'], passRecords: [], kongResources: [],
};
const addedRuleActions = v2.deriveStage8V2RuleActions({ ...responseProtocol, state: addedState, playerId: 0 });
assert.ok(addedRuleActions.some((action) => action.actionType === 'addedKong'), 'rule entry must expose addedKong');

const deferredPong = { type: 'peng', tiles: ['wan4', 'wan4', 'wan4'], fromPlayer: 2 };
const deferredResource = browserRuleEngine.createKongResource({ owner: 0, tile: 'wan4', pongMeld: deferredPong, source: 'pong' });
const deferredState = {
  phase: 'discarding', currentPlayer: 0, newDrawnTile: 'wan4',
  players: [{ hand: ['wan4', 'wan1', 'wan2', 'wan3', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9', 'tong1', 'tong2'], melds: [deferredPong] }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }],
  melds: [[deferredPong], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0,
  scores: [100, 100, 100, 100], wallTiles: ['bai'], passRecords: [], kongResources: [deferredResource],
};
const deferredRuleActions = v2.deriveStage8V2RuleActions({ ...responseProtocol, state: deferredState, playerId: 0 });
assert.ok(deferredRuleActions.some((action) => action.actionType === 'forcedRunDeferred'), 'rule entry must expose forcedRunDeferred only when the current draw is the active resource tile');

const completeRuleActionTypes = new Set([
  ...ruleActions,
  ...forcedRuleActions,
  ...candidateRuleActions,
  ...doubleRuleActions,
  ...chainRuleActions,
  ...directRuleActions,
  ...immediateRuleActions,
  ...winRuleActions,
  ...normalRuleActions,
  ...addedRuleActions,
  ...deferredRuleActions,
].map((action) => action.actionType));
assert.deepEqual(
  [...completeRuleActionTypes].sort(),
  expectedTypes.slice().sort(),
  'the explicit rule-semantic public entry must cover the complete canonical v2 action set across audited fixtures',
);
assert.throws(
  () => v2.deriveStage8V2RuleActions({ ...responseProtocol, state: normalState, playerId: 0, replayCursor: 1 }),
  /v1 artifact field rejected: replayCursor/,
  'the complete rule-semantic public entry must reject v1 fields itself',
);

console.log('stage8 v2 action-space gate registry regression: passed');
