import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const compiledDir = path.join(os.tmpdir(), `wannian-stage8-c4-diagnostic-actor-${process.pid}`);
const require = createRequire(import.meta.url);

function compileTree(sourceDir, destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) compileTree(sourcePath, destinationPath);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, strict: true },
      fileName: sourcePath,
    }).outputText;
    fs.writeFileSync(destinationPath.replace(/\.ts$/, '.js'), output);
  }
}

fs.rmSync(compiledDir, { recursive: true, force: true });
compileTree(path.join(root, 'src/game/rules'), path.join(compiledDir, 'rules'));
compileTree(path.join(root, 'src/game/stage8'), path.join(compiledDir, 'stage8'));
const registry = require(path.join(compiledDir, 'stage8/action-registry-v2.js'));
const actor = require(path.join(compiledDir, 'stage8/diagnostic-actor-v2.js'));
const actorSource = fs.readFileSync(path.join(root, 'src/game/stage8/diagnostic-actor-v2.ts'), 'utf8');
assert.doesNotMatch(actorSource, /import(?: type)? \{[^}]*GameState|from ['"]\.\/v2-visible-state['"]/, 'actor module must not import GameState or the broad visible-state contract');

const expectedTypes = [
  'pass', 'discard', 'pong', 'win', 'directChisel', 'forcedRunImmediate',
  'forcedRunDeferred', 'addedKong', 'chainKong', 'normalConcealedKong',
  'forcedRunConcealed', 'postPongCandidateConcealedKong', 'doublePongForcedRun', 'declineKong',
];
assert.equal(actor.STAGE8_C4_DIAGNOSTIC_ACTOR.actorId, 'c4-diagnostic-v2-canonical-sampler');
assert.equal(actor.STAGE8_C4_DIAGNOSTIC_ACTOR.actorVersion, 'stage8-c4-diagnostic-v2-actor-v1');
assert.equal(actor.STAGE8_C4_DIAGNOSTIC_ACTOR.rootSeed, 2026080901);
assert.equal(actor.STAGE8_C4_DIAGNOSTIC_ACTOR.seedDomain, 'stage8-c4-diagnostic-v2-actor-v1');
assert.equal(actor.STAGE8_C4_DIAGNOSTIC_ACTOR.seedFingerprint, '2B96C862E701479246B432F7F1941AC14AC96B6DFBDD4F5A1A7A5D7188FA3A91');

const visibleSource = {
  actorSeat: 0,
  actorOwnVisibleHand: ['wan1', 'wan2', 'wan3'],
  publicMelds: [{ owner: 1, type: 'peng', tiles: ['tong6', 'tong6', 'tong6'], fromPlayer: 2 }],
  publicDiscards: [{ owner: 0, tiles: ['dong'] }, { owner: 1, tiles: ['nan'] }],
  scores: [100, 100, 100, 100],
  turn: 12,
  phase: 'discarding',
  publicLastDiscard: { player: 1, tile: 'nan' },
  actorOwnedPublicResourceSummaries: [{ resourceType: 'kongResource', tile: 'tong6', status: 'active', signature: '0:tong6' }],
  wallRemainingCount: 61,
};
const observation = actor.projectStage8C4DiagnosticActorObservation(visibleSource);
assert.deepEqual(observation.actorOwnVisibleHand, visibleSource.actorOwnVisibleHand);
assert.equal(observation.wallRemainingCount, 61);
assert.equal(Object.isFrozen(observation), true, 'projected observation must be immutable');

for (const forbiddenFixture of [
  { wallTiles: ['wan9'] }, { wallTop: 'wan9' }, { opponentHands: [['wan9']] },
  { hiddenState: { futureWall: ['wan9'] } }, { hiddenSimulationState: { wallTop: 'wan9' } },
  { policyLogits: [0.1] }, { c3PolicyLogits: [0.1] }, { replay: 'v1' }, { checkpoint: 'v1' },
  { model: 'v1' }, { manifest: 'v1' }, { workRoot: 'v1' }, { v1ActionId: 7 },
  { v1ActionSpaceVersion: 'stage8-action-space-v1' }, { userRecords: ['private'] }, { state: { phase: 'discarding' } },
]) {
  const key = Object.keys(forbiddenFixture)[0];
  assert.throws(
    () => actor.projectStage8C4DiagnosticActorObservation({ ...visibleSource, nested: forbiddenFixture }),
    new RegExp(`(?:forbidden|unapproved).*${key}|${key}.*(?:forbidden|unapproved)`),
    `${key} must be rejected recursively`,
  );
}

const topLevelNonEnumerable = { ...visibleSource };
Object.defineProperty(topLevelNonEnumerable, 'wallTop', { value: 'wan9', enumerable: false });
assert.throws(
  () => actor.projectStage8C4DiagnosticActorObservation(topLevelNonEnumerable),
  /non-enumerable actor field rejected: wallTop/,
  'top-level non-enumerable forbidden fields must be rejected',
);

const nestedNonEnumerable = {
  ...visibleSource,
  publicMelds: [{ ...visibleSource.publicMelds[0] }],
};
Object.defineProperty(nestedNonEnumerable.publicMelds[0], 'opponentHands', { value: [['wan9']], enumerable: false });
assert.throws(
  () => actor.projectStage8C4DiagnosticActorObservation(nestedNonEnumerable),
  /non-enumerable actor field rejected: opponentHands/,
  'nested non-enumerable forbidden fields must be rejected',
);

const nonEnumerableAllowed = { ...visibleSource };
Object.defineProperty(nonEnumerableAllowed, 'actorSeat', { value: 0, enumerable: false });
assert.throws(
  () => actor.projectStage8C4DiagnosticActorObservation(nonEnumerableAllowed),
  /non-enumerable actor field rejected: actorSeat/,
  'allowlisted fields must still be enumerable plain data',
);

const inheritedForbidden = Object.assign(Object.create({ wallTop: 'wan9' }), visibleSource);
assert.throws(
  () => actor.projectStage8C4DiagnosticActorObservation(inheritedForbidden),
  /plain data object required/,
  'objects with inherited forbidden fields must fail the plain-object boundary',
);

const symbolField = { ...visibleSource };
symbolField[Symbol('hidden')] = 'wan9';
assert.throws(
  () => actor.projectStage8C4DiagnosticActorObservation(symbolField),
  /symbol actor field rejected/,
  'top-level symbol fields must be rejected',
);

const nestedSymbolField = {
  ...visibleSource,
  actorOwnedPublicResourceSummaries: [{ ...visibleSource.actorOwnedPublicResourceSummaries[0] }],
};
nestedSymbolField.actorOwnedPublicResourceSummaries[0][Symbol('hidden-resource')] = 'wan9';
assert.throws(
  () => actor.projectStage8C4DiagnosticActorObservation(nestedSymbolField),
  /symbol actor field rejected/,
  'nested symbol fields must be rejected recursively',
);

const nullPrototypeArray = ['wan1'];
Object.setPrototypeOf(nullPrototypeArray, null);
assert.throws(
  () => actor.projectStage8C4DiagnosticActorObservation({
    ...visibleSource,
    actorOwnVisibleHand: nullPrototypeArray,
  }),
  /plain data object required/,
  'arrays with a null prototype must be rejected at the projection boundary',
);

const customArrayPrototype = Object.create(Array.prototype);
const customPrototypeArray = ['wan1'];
Object.setPrototypeOf(customPrototypeArray, customArrayPrototype);
assert.throws(
  () => actor.projectStage8C4DiagnosticActorObservation({
    ...visibleSource,
    actorOwnVisibleHand: customPrototypeArray,
  }),
  /plain data object required/,
  'arrays with a custom prototype must be rejected at the projection boundary',
);

function rawAction(actionType) {
  const base = {
    actionType,
    actor: 0,
    declarationWindow: actionType === 'chainKong' ? 'chain-kong' : 'self-draw-discard',
    robKongWindow: ['directChisel', 'forcedRunImmediate', 'forcedRunDeferred', 'addedKong', 'chainKong', 'doublePongForcedRun'].includes(actionType),
  };
  if (actionType === 'pass' || actionType === 'win' || actionType === 'declineKong') return base;
  if (actionType === 'doublePongForcedRun') {
    return { ...base, selectedTile: 'wan1', conditionalTile: 'wan2', resourceSignature: '0:wan1|0:wan2' };
  }
  return { ...base, tile: 'wan1', ownTileCount: ['normalConcealedKong', 'forcedRunConcealed', 'postPongCandidateConcealedKong'].includes(actionType) ? 4 : 1 };
}
const actionByType = Object.fromEntries(expectedTypes.map((actionType) => [actionType, registry.canonicalizeStage8V2Action(rawAction(actionType))]));
const sorted = (actions) => actions.slice().sort((left, right) => left.actionId - right.actionId);
function authorize(actions, priority = { kind: 'normal' }) {
  return actor.authorizeStage8C4RuleActions({
    actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION,
    actorSeat: 0,
    priority,
    canonicalLegalActions: sorted(actions),
  });
}
function decide(authorizedActions, gameId, overrides = {}) {
  return actor.selectStage8C4DiagnosticAction({
    actorVersion: actor.STAGE8_C4_DIAGNOSTIC_ACTOR.actorVersion,
    actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION,
    rootSeed: actor.STAGE8_C4_DIAGNOSTIC_ACTOR.rootSeed,
    gameId,
    decisionIndex: 17,
    actorSeat: 0,
    observation,
    authorizedActions,
    ...overrides,
  });
}

const normalAuthorized = authorize([actionByType.pass, actionByType.pong]);
const first = decide(normalAuthorized, 'c4-diagnostic-determinism');
assert.deepEqual(decide(normalAuthorized, 'c4-diagnostic-determinism'), first, 'same identity must select identically');
assert.equal(first.decisionDigestSha256, 'EE2B767417FFC43016A355D49D90D6CF1B200B97C47ABA6594DCD14C69441E5F', 'seed derivation must remain frozen');
assert.deepEqual(Object.keys(first).sort(), [
  'actionId', 'actionSpaceVersion', 'actionType', 'actorId', 'actorSeat', 'actorVersion', 'candidateCount',
  'decisionDigestSha256', 'legalActionIdsSha256', 'schemaVersion', 'selectionProbability',
].sort(), 'decision output must remain summary-only');
assert.equal(first.selectionProbability, 0.5);
assert.equal(first.candidateCount, 2);

const originalRandom = Math.random;
let randomCalls = 0;
Math.random = () => { randomCalls += 1; throw new Error('actor must not consume ambient or observer randomness'); };
try { decide(normalAuthorized, 'c4-no-random-stream'); } finally { Math.random = originalRandom; }
assert.equal(randomCalls, 0, 'actor must not consume Math.random');
assert.throws(() => decide(normalAuthorized, 'c4-observer-extra', { observerRandomState: 1 }), /unapproved.*observerRandomState|observerRandomState.*unapproved/);
assert.throws(() => decide(normalAuthorized, 'c4-c3-logits', { c3PolicyLogits: [1] }), /forbidden actor field rejected: c3PolicyLogits/);
assert.throws(() => decide(normalAuthorized, 'c4-v1-input', { replayCursor: 1 }), /forbidden actor field rejected: replayCursor/);

assert.throws(() => actor.authorizeStage8C4RuleActions({
  actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION,
  actorSeat: 0,
  priority: { kind: 'normal' },
  canonicalLegalActions: [actionByType.pong, actionByType.pass],
}), /strictly sorted.*actionId|actionId.*strictly sorted/);
assert.throws(() => authorize([actionByType.pass, actionByType.pass]), /duplicate.*actionId|actionId.*duplicate/);
assert.throws(() => authorize([{ ...actionByType.pong, actionId: actionByType.pong.actionId + 1 }, actionByType.pass]), /non-canonical|canonical action mismatch/);
assert.throws(() => actor.authorizeStage8C4RuleActions({
  actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION,
  actorSeat: 0,
  priority: { kind: 'normal' },
  canonicalLegalActions: [],
  manifest: 'v1',
}), /v1 artifact field rejected: manifest|forbidden.*manifest/);
assert.throws(() => authorize([actionByType.pass, actionByType.win]), /priority violation.*win|win.*priority violation/);
assert.throws(() => authorize([actionByType.pass, actionByType.pong], { kind: 'win', winnerSeat: 0 }), /priority violation.*pong|pong.*priority violation/);
assert.throws(() => authorize([actionByType.pass, actionByType.win], { kind: 'rob-kong', winnerSeat: 1 }), /winner.*actor|actor.*winner/);
assert.throws(() => decide({
  actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION,
  actorSeat: 0,
  priority: { kind: 'normal' },
  canonicalLegalActions: sorted([actionByType.pass, actionByType.pong]),
}, 'plain-untrusted-envelope'), /trusted rule authorization required/);

function competingAuthorization(actionType) {
  if (actionType === 'win') return authorize([actionByType.pass, actionByType.win], { kind: 'win', winnerSeat: 0 });
  if (actionType === 'pass') return authorize([actionByType.pass, actionByType.pong]);
  return authorize([actionByType.pass, actionByType[actionType]]);
}
function findSelection(authorizedActions, targetActionId, shouldSelect) {
  for (let index = 0; index < 2048; index += 1) {
    const decision = decide(authorizedActions, `c4-${targetActionId}-${shouldSelect}-${index}`);
    if ((decision.actionId === targetActionId) === shouldSelect) return decision;
  }
  throw new Error(`unable to find deterministic ${shouldSelect ? 'selected' : 'non-selected'} fixture for ${targetActionId}`);
}
for (const actionType of expectedTypes) {
  const authorizedActions = competingAuthorization(actionType);
  const targetActionId = actionByType[actionType].actionId;
  const selected = findSelection(authorizedActions, targetActionId, true);
  const nonSelected = findSelection(authorizedActions, targetActionId, false);
  assert.equal(selected.actionType, actionType, `${actionType} must be selectable under competition`);
  assert.notEqual(nonSelected.actionId, targetActionId, `${actionType} must also lose under competition`);
}
assert.throws(() => decide(normalAuthorized, 'wrong-root', { rootSeed: 1 }), /frozen rootSeed required/);
assert.throws(() => decide(normalAuthorized, 'wrong-version', { actionSpaceVersion: 'stage8-action-space-v1' }), /stage8-action-space-v2/);

console.log(JSON.stringify({
  status: 'passed', actorId: actor.STAGE8_C4_DIAGNOSTIC_ACTOR.actorId,
  actorVersion: actor.STAGE8_C4_DIAGNOSTIC_ACTOR.actorVersion,
  actionTypesCovered: expectedTypes.length, observerRandomCalls: randomCalls,
  corpusCreated: false, c3OnnxLoaded: false, observerDryRunExecuted: false, trainingAuthorized: false,
}));
fs.rmSync(compiledDir, { recursive: true, force: true });