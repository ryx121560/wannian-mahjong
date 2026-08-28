import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-teacher-'));
const require = createRequire(import.meta.url);

function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      compileTree(from, to);
    } else if (entry.name.endsWith('.ts')) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: from,
      }).outputText);
    }
  }
}

function rehashControl(controlTools, manifest, changes) {
  const payload = { ...manifest, ...changes };
  delete payload.manifestSha256;
  return { ...payload, manifestSha256: controlTools.hashStage8BcControlManifestPayload(payload) };
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const actions = require(path.join(temp, 'game/stage8/action-registry-v2.js'));
  const identities = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const tensor = require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js'));
  const rules = require(path.join(temp, 'game/rules/index.js'));
  const controlTools = require(path.join(temp, 'game/stage8/offline-bc-control.js'));
  const teacher = require(path.join(temp, 'game/stage8/offline-bc-teacher.js'));
  const sampleProtocol = require(path.join(temp, 'game/stage8/offline-bc-sample-protocol.js'));
  const hand = ['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8','wan9','tong1','tong2','tong3','tong4','tong5'];
  const visibleState = {
    actor: 0, ownHand: hand, publicMelds: [[],[],[],[]], publicDiscards: [[],['tiao1'],['nan'],['bai']],
    scores: [0,0,0,0], dealer: 0, turn: 18, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 70,
  };
  const legalActions = identities.sortStage8CanonicalActions(hand.map((tile) => actions.canonicalizeStage8V2Action({
    actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile, ownTileCount: 1, robKongWindow: false,
  })));
  const sha = (value) => identities.hashStage8OfflineIdentity(value);
  const controlPayload = {
    protocolVersion: controlTools.STAGE8_BC_CONTROL_VERSION,
    identity: {
      runId: 'bc-candidate-one', sourceBundleSha256: sha('source-bundle'), rulesSha256: sha('rules'), browserRulesSha256: sha('browser-rules'),
      actionSpaceSha256: sha('action-space'), legalActionMaskSha256: sha('legal-mask'), featureSha256: sha('features'),
      visibleInformationSha256: sha('visible-information'), tensorContractSha256: tensor.hashStage8OnnxTensorContract(),
      teacherDefinitionSha256: teacher.hashStage8BcTeacherDefinition(), sampleSchemaSha256: sampleProtocol.hashStage8BcSampleProtocolDefinition(),
    },
    authorization: { approvalId: 'bc-protocol-approval', granted: true, scope: 'bc-teacher-protocol-preflight' },
    teacherTemperature: controlTools.STAGE8_BC_TEACHER_TEMPERATURE,
    allowSampleGeneration: false, allowPythonRuntime: false, allowTraining: false, allowModelCreation: false,
    allowOnnxExport: false, allowArtifactWrite: false, allowSmoke: false, allowRuntime: false,
  };
  const control = { ...controlPayload, manifestSha256: controlTools.hashStage8BcControlManifestPayload(controlPayload) };
  const completeLegalActionSetSha256 = identities.hashStage8CanonicalActionSet(legalActions);
  const input = { control, visibleState, legalActions, completeLegalActionSetSha256 };
  const first = teacher.evaluateStage8BcTeacher(input);
  const second = teacher.evaluateStage8BcTeacher(structuredClone(input));
  assert.equal(first.ok, true, first.ok ? '' : first.decision.reason);
  assert.deepEqual(second, first, 'same frozen input must produce byte-stable evidence');
  assert.equal(first.value.evidence.modelFusion, false);
  assert.equal(first.value.evidence.temperature, 1);
  assert.equal(first.value.evidence.legalActionKeys.length, legalActions.length);
  assert.equal(Object.keys(first.value.evidence.rawScores).length, legalActions.length);
  assert.equal(Object.keys(first.value.evidence.teacherDistribution).length, legalActions.length);
  assert.ok(first.value.evidence.stage7StrongRuleActionKey, 'discarding teacher must bind the Stage7 decision');
  assert.ok(first.value.evidence.legalActionKeys.includes(first.value.evidence.stage7StrongRuleActionKey));
  assert.ok(first.value.evidence.legalActionKeys.includes(first.value.evidence.selectedActionKey));
  assert.equal(first.value.evidence.decisionActor, 0);
  assert.equal(first.value.evidence.visibleCurrentPlayer, 0);
  assert.equal(first.value.evidence.visiblePhase, 'discarding');
  const probabilities = Object.values(first.value.evidence.teacherDistribution);
  assert.ok(probabilities.every((value) => Number.isFinite(value) && value > 0));
  assert.ok(Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) <= 1e-12);
  assert.equal(teacher.validateStage8BcTeacherEvidence(first.value.evidence), true);

  const respondingClaimHand = ['wan8','wan8','wan8','wan1','wan2','wan3','tong1','tong2','tong3','tiao1','tiao2','tiao3','dong'];
  const respondingVisibleState = {
    actor: 1,
    ownHand: respondingClaimHand,
    publicMelds: [[],[],[],[]],
    publicDiscards: [[],[],['wan8'],[]],
    scores: [0,0,0,0],
    dealer: 0,
    turn: 19,
    phase: 'responding',
    currentPlayer: 2,
    lastDiscard: 'wan8',
    lastDiscardPlayer: 2,
    wallRemainingCount: 69,
  };
  const respondingRulesState = {
    players: [
      { hand: [], melds: [] },
      { hand: respondingClaimHand, melds: [] },
      { hand: [], melds: [] },
      { hand: [], melds: [] },
    ],
    melds: [[],[],[],[]], discards: [[],[],['wan8'],[]], turn: 19, dealer: 0, currentPlayer: 2,
    scores: [0,0,0,0], wallTiles: [], passRecords: [], phase: 'responding', lastDiscard: 'wan8', lastDiscardPlayer: 2,
  };
  const respondingRuleActions = rules.getLegalActions(respondingRulesState, 1).slice().sort();
  assert.deepEqual(respondingRuleActions, ['directChisel','pass','pong'], 'claim fixture must come from the rules true source');
  const respondingActions = identities.sortStage8CanonicalActions([
    actions.canonicalizeStage8V2Action({ actionType: 'pass', actor: 1, declarationWindow: 'discard-response', robKongWindow: false }),
    actions.canonicalizeStage8V2Action({ actionType: 'pong', actor: 1, declarationWindow: 'discard-response', tile: 'wan8', ownTileCount: 2, robKongWindow: false }),
    actions.canonicalizeStage8V2Action({ actionType: 'directChisel', actor: 1, declarationWindow: 'discard-response', tile: 'wan8', ownTileCount: 3, robKongWindow: false }),
  ]);
  const respondingInput = { control, visibleState: respondingVisibleState, legalActions: respondingActions, completeLegalActionSetSha256: identities.hashStage8CanonicalActionSet(respondingActions) };
  const responding = teacher.evaluateStage8BcTeacher(respondingInput);
  assert.equal(responding.ok, true, responding.ok ? '' : responding.decision.reason);
  assert.deepEqual(responding.value.evidence.legalActionKeys, respondingActions.map(identities.stage8CanonicalActionKey));
  assert.equal(responding.value.evidence.stage7StrongRuleActionKey, null, 'responding actions use the pure canonical MCTS score surface');
  assert.equal(responding.value.evidence.decisionActor, 1);
  assert.equal(responding.value.evidence.visibleCurrentPlayer, 2, 'responding actor may differ from the discarding player');
  assert.equal(responding.value.evidence.visiblePhase, 'responding');
  const respondingProbabilities = Object.values(responding.value.evidence.teacherDistribution);
  assert.equal(respondingProbabilities.length, 3);
  assert.ok(respondingProbabilities.every((value) => Number.isFinite(value) && value > 0));
  assert.ok(Math.abs(respondingProbabilities.reduce((sum, value) => sum + value, 0) - 1) <= 1e-12);
  const respondingMissingCandidate = teacher.evaluateStage8BcTeacher({ ...respondingInput, legalActions: respondingActions.slice(1) });
  assert.equal(respondingMissingCandidate.ok, false);
  assert.equal(respondingMissingCandidate.decision.reason, 'bc-teacher-complete-legal-action-set-mismatch');

  const respondingWinHand = ['wan8','wan8','wan8','wan7','wan9','wan1','wan2','wan3','tong1','tong2','tong3','dong','dong'];
  const respondingWinVisibleState = { ...respondingVisibleState, ownHand: respondingWinHand };
  const respondingWinRulesState = {
    ...respondingRulesState,
    players: respondingRulesState.players.map((player, index) => index === 1 ? { hand: respondingWinHand, melds: [] } : player),
  };
  const respondingWinResult = rules.canWin(respondingWinHand.concat('wan8'), { winTile: 'wan8', winType: '点炮', melds: [] });
  assert.equal(respondingWinResult.canWin, true, 'win fixture must be proven by rules canWin');
  const respondingWinRuleActions = rules.getLegalActions(respondingWinRulesState, 1).slice().sort();
  assert.deepEqual(respondingWinRuleActions, ['pass','win'], 'win priority must preserve the rules-derived complete response set');
  const respondingWinActions = identities.sortStage8CanonicalActions([
    actions.canonicalizeStage8V2Action({ actionType: 'pass', actor: 1, declarationWindow: 'discard-response', robKongWindow: false }),
    actions.canonicalizeStage8V2Action({ actionType: 'win', actor: 1, declarationWindow: 'discard-response', robKongWindow: false }),
  ]);
  const respondingWinInput = { control, visibleState: respondingWinVisibleState, legalActions: respondingWinActions, completeLegalActionSetSha256: identities.hashStage8CanonicalActionSet(respondingWinActions) };
  const respondingWin = teacher.evaluateStage8BcTeacher(respondingWinInput);
  assert.equal(respondingWin.ok, true, respondingWin.ok ? '' : respondingWin.decision.reason);
  assert.equal(respondingWin.value.evidence.decisionActor, 1);
  assert.equal(respondingWin.value.evidence.visibleCurrentPlayer, 2);
  assert.equal(respondingWin.value.evidence.visiblePhase, 'responding');
  const respondingWinProbabilities = Object.values(respondingWin.value.evidence.teacherDistribution);
  assert.equal(respondingWinProbabilities.length, 2);
  assert.ok(respondingWinProbabilities.every((value) => Number.isFinite(value) && value > 0));
  assert.ok(Math.abs(respondingWinProbabilities.reduce((sum, value) => sum + value, 0) - 1) <= 1e-12);

  const hiddenTopLevel = teacher.evaluateStage8BcTeacher({ ...input, visibleState: { ...visibleState, opponentHands: [['wan9']] } });
  assert.equal(hiddenTopLevel.ok, false);
  assert.match(hiddenTopLevel.decision.reason, /visible/);
  const hiddenNested = teacher.evaluateStage8BcTeacher({ ...input, visibleState: { ...visibleState, publicMelds: [[{ type: 'peng', tiles: ['wan1','wan1','wan1'], hiddenOwnerHand: ['wan9'] }],[],[],[]] } });
  assert.equal(hiddenNested.ok, false);
  assert.equal(hiddenNested.decision.reason, 'bc-teacher-visible-or-action-schema-invalid');
  const discardingSeatMismatch = teacher.evaluateStage8BcTeacher({ ...input, visibleState: { ...visibleState, currentPlayer: 1 } });
  assert.equal(discardingSeatMismatch.ok, false);
  assert.equal(discardingSeatMismatch.decision.reason, 'bc-teacher-discarding-seat-mismatch');
  const missingCandidate = teacher.evaluateStage8BcTeacher({ ...input, legalActions: legalActions.slice(1) });
  assert.equal(missingCandidate.ok, false);
  assert.equal(missingCandidate.decision.reason, 'bc-teacher-complete-legal-action-set-mismatch');
  const actionsWithoutStage7Selection = legalActions.filter((action) => identities.stage8CanonicalActionKey(action) !== first.value.evidence.stage7StrongRuleActionKey);
  const illegalStage7Selection = teacher.evaluateStage8BcTeacher({ ...input, legalActions: actionsWithoutStage7Selection, completeLegalActionSetSha256: identities.hashStage8CanonicalActionSet(actionsWithoutStage7Selection) });
  assert.equal(illegalStage7Selection.ok, false);
  assert.ok(['bc-teacher-stage7-selected-action-illegal','bc-teacher-stage7-candidate-incomplete'].includes(illegalStage7Selection.decision.reason));
  const nanInput = teacher.evaluateStage8BcTeacher({ ...input, visibleState: { ...visibleState, scores: [Number.NaN,0,0,0] } });
  assert.equal(nanInput.ok, false);
  assert.match(nanInput.decision.reason, /visible/);
  const unauthorized = teacher.evaluateStage8BcTeacher({ ...input, control: rehashControl(controlTools, control, { authorization: { ...control.authorization, granted: false } }) });
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.decision.reason, 'bc-control-authorization-required');
  const sideEffectEnabled = teacher.evaluateStage8BcTeacher({ ...input, control: rehashControl(controlTools, control, { allowSampleGeneration: true }) });
  assert.equal(sideEffectEnabled.ok, false);
  assert.equal(sideEffectEnabled.decision.reason, 'bc-control-side-effect-boundary-invalid');
  const sideEffectMalformed = teacher.evaluateStage8BcTeacher({ ...input, control: rehashControl(controlTools, control, { allowTraining: null }) });
  assert.equal(sideEffectMalformed.ok, false);
  assert.equal(sideEffectMalformed.decision.reason, 'bc-control-side-effect-boundary-invalid');
  const authorizationMalformed = teacher.evaluateStage8BcTeacher({ ...input, control: rehashControl(controlTools, control, { authorization: { ...control.authorization, granted: 1 } }) });
  assert.equal(authorizationMalformed.ok, false);
  assert.equal(authorizationMalformed.decision.reason, 'bc-control-authorization-required');
  const identityTampered = teacher.evaluateStage8BcTeacher({ ...input, control: rehashControl(controlTools, control, { identity: { ...control.identity, rulesSha256: sha('other-rules') } }) });
  assert.equal(identityTampered.ok, true, 'a fully rehashed control identity remains explicit and auditable');
  assert.notEqual(identityTampered.value.evidence.controlManifestSha256, first.value.evidence.controlManifestSha256);
  const malformedEvidence = structuredClone(first.value.evidence);
  malformedEvidence.teacherDistribution[malformedEvidence.legalActionKeys[0]] = Number.NaN;
  assert.equal(teacher.validateStage8BcTeacherEvidence(malformedEvidence), false, 'NaN teacher probability must fail closed');
  const seatTamperedEvidence = structuredClone(first.value.evidence);
  seatTamperedEvidence.visibleCurrentPlayer = 1;
  const { evidenceSha256: _seatHash, ...seatPayload } = seatTamperedEvidence;
  seatTamperedEvidence.evidenceSha256 = sha(seatPayload);
  assert.equal(teacher.validateStage8BcTeacherEvidence(seatTamperedEvidence), false, 'self-consistent discarding seat mismatch must fail closed');
  assert.equal(teacher.validateStage8BcTeacherEvidence({ ...first.value.evidence, hiddenStateSha256: sha('forbidden') }), false, 'extra evidence fields must fail closed');

  const teacherSource = fs.readFileSync(path.join(root, 'src/game/stage8/offline-bc-teacher.ts'), 'utf8');
  assert.equal(/aiChooseDiscard|aiRespond|createStage8CanonicalMctsProvider|executeStage8FrozenModelInference/.test(teacherSource), false);
  console.log(JSON.stringify({ passed: true, discardCanonicalCandidates: legalActions.length, respondingCanonicalFixtures: 2,
    respondingCanonicalCandidateCounts: [respondingActions.length, respondingWinActions.length],
    respondingActionTypes: ['pass','pong','win','directChisel'], rulesDerivedRespondingSets: true,
    completeCandidateCoverage: true, discardingSeatIdentityBound: true,
    stage7DeterministicSearchEnhanced: true, modelFusion: false, strictVisibleProjection: true, deterministicEvidence: true,
    sampleFilesWritten: 0, pythonProcessesStarted: 0, trainingStarted: false, smokeGamesExecuted: 0 }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
