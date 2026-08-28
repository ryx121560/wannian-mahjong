import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-sample-'));
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

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const actions = require(path.join(temp, 'game/stage8/action-registry-v2.js'));
  const identities = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const tensor = require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js'));
  const controlTools = require(path.join(temp, 'game/stage8/offline-bc-control.js'));
  const teacher = require(path.join(temp, 'game/stage8/offline-bc-teacher.js'));
  const protocol = require(path.join(temp, 'game/stage8/offline-bc-sample-protocol.js'));
  const sha = (value) => identities.hashStage8OfflineIdentity(value);
  const hand = ['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8','wan9','tong1','tong2','tong3','tong4','tong5'];
  const visibleState = { actor: 0, ownHand: hand, publicMelds: [[],[],[],[]], publicDiscards: [[],['tiao1'],['nan'],['bai']], scores: [0,0,0,0], dealer: 0, turn: 18, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 70 };
  const canonicalActions = identities.sortStage8CanonicalActions(hand.map((tile) => actions.canonicalizeStage8V2Action({ actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile, ownTileCount: 1, robKongWindow: false })));
  const controlPayload = {
    protocolVersion: controlTools.STAGE8_BC_CONTROL_VERSION,
    identity: {
      runId: 'bc-candidate-one', sourceBundleSha256: sha('source'), rulesSha256: sha('rules'), browserRulesSha256: sha('browser-rules'),
      actionSpaceSha256: sha('actions'), legalActionMaskSha256: sha('mask'), featureSha256: sha('features'), visibleInformationSha256: sha('visible'),
      tensorContractSha256: tensor.hashStage8OnnxTensorContract(), teacherDefinitionSha256: teacher.hashStage8BcTeacherDefinition(), sampleSchemaSha256: protocol.hashStage8BcSampleProtocolDefinition(),
    },
    authorization: { approvalId: 'bc-protocol-approval', granted: true, scope: 'bc-teacher-protocol-preflight' },
    teacherTemperature: 1,
    allowSampleGeneration: false, allowPythonRuntime: false, allowTraining: false, allowModelCreation: false,
    allowOnnxExport: false, allowArtifactWrite: false, allowSmoke: false, allowRuntime: false,
  };
  const control = { ...controlPayload, manifestSha256: controlTools.hashStage8BcControlManifestPayload(controlPayload) };
  const completeLegalActionSetSha256 = identities.hashStage8CanonicalActionSet(canonicalActions);
  const decision = teacher.evaluateStage8BcTeacher({ control, visibleState, legalActions: canonicalActions, completeLegalActionSetSha256 });
  assert.equal(decision.ok, true, decision.ok ? '' : decision.decision.reason);
  const replayPayload = {
    fixedSeed: 20260827, episodeId: 'bc-candidate-one-episode-one', traceStep: 18,
    selectedActionKey: decision.value.evidence.selectedActionKey,
    preStateSha256: sha('pre-state'), postStateSha256: sha('post-state'), publicEventSha256: sha('public-event'),
    episodeContextSha256: sha('episode-context'), visibleStateSha256: decision.value.evidence.visibleStateSha256,
    legalActionSetSha256: decision.value.evidence.legalActionSetSha256, teacherEvidenceSha256: decision.value.evidence.evidenceSha256,
    episodeReward: { terminal: true, terminalDelta: [6,-2,-2,-2] },
  };
  const replay = { ...replayPayload, replaySha256: protocol.hashStage8BcReplayPayload(replayPayload) };
  const samplePayload = {
    protocolVersion: protocol.STAGE8_BC_SAMPLE_PROTOCOL_VERSION,
    sampleId: 'bc-candidate-one-sample-000001', batchId: 'bc-candidate-one-batch-000001', control, visibleState,
    canonicalActions, completeLegalActionSetSha256, teacherEvidence: decision.value.evidence, replay,
  };
  const sample = { ...samplePayload, sampleSha256: protocol.hashStage8BcSamplePayload(samplePayload) };
  const validate = (value) => protocol.validateStage8BcSampleEnvelope(value);
  const rehashReplay = (base, changes) => {
    const payload = { ...base, ...changes };
    delete payload.replaySha256;
    return { ...payload, replaySha256: protocol.hashStage8BcReplayPayload(payload) };
  };
  const rehashSample = (base, changes) => {
    const payload = { ...base, ...changes };
    delete payload.sampleSha256;
    return { ...payload, sampleSha256: protocol.hashStage8BcSamplePayload(payload) };
  };
  const valid = validate(sample);
  assert.equal(valid.ok, true, valid.ok ? '' : valid.decision.reason);
  assert.deepEqual(validate(structuredClone(sample)), valid, 'sample validation must be deterministic');

  const missingActions = canonicalActions.slice(1);
  assert.equal(validate(rehashSample(sample, { canonicalActions: missingActions })).decision.reason, 'bc-sample-complete-legal-action-set-invalid');
  assert.equal(validate(rehashSample(sample, { canonicalActions: canonicalActions.slice().reverse() })).decision.reason, 'bc-sample-legal-actions-not-canonical');
  assert.match(validate(rehashSample(sample, { visibleState: { ...visibleState, opponentHands: [['wan9']] } })).decision.reason, /visible/);
  assert.match(validate({ ...sample, visibleState: { ...visibleState, scores: [Number.NaN,0,0,0] } }).decision.reason, /visible/);
  const probabilityTampered = structuredClone(decision.value.evidence);
  probabilityTampered.teacherDistribution[probabilityTampered.legalActionKeys[0]] = Number.NaN;
  assert.equal(validate({ ...sample, teacherEvidence: probabilityTampered }).decision.reason, 'bc-sample-teacher-evidence-mismatch');
  const illegalSelection = structuredClone(decision.value.evidence);
  illegalSelection.selectedActionKey = 'stage8-action-space-v2|999999|win|none|0|self-draw-discard|none|0|none';
  const { evidenceSha256: _illegalSelectionHash, ...selectionPayload } = illegalSelection;
  illegalSelection.evidenceSha256 = sha(selectionPayload);
  assert.equal(validate(rehashSample(sample, { teacherEvidence: illegalSelection })).decision.reason, 'bc-sample-teacher-evidence-mismatch');
  const identityPayload = { ...controlPayload, identity: { ...control.identity, rulesSha256: sha('other-rules') } };
  const changedControl = { ...identityPayload, manifestSha256: controlTools.hashStage8BcControlManifestPayload(identityPayload) };
  assert.equal(validate(rehashSample(sample, { control: changedControl })).decision.reason, 'bc-sample-teacher-evidence-mismatch');
  const nonZeroReplay = rehashReplay(replay, { episodeReward: { terminal: true, terminalDelta: [1,0,0,0] } });
  assert.equal(validate(rehashSample(sample, { replay: nonZeroReplay })).decision.reason, 'bc-sample-terminal-reward-invalid');
  const wrongActionKey = canonicalActions.map(identities.stage8CanonicalActionKey).find((key) => key !== replay.selectedActionKey);
  const wrongActionReplay = rehashReplay(replay, { selectedActionKey: wrongActionKey });
  assert.equal(validate(rehashSample(sample, { replay: wrongActionReplay })).decision.reason, 'bc-sample-replay-identity-invalid');
  const nonterminalReplay = rehashReplay(replay, { episodeReward: { terminal: false, episodeId: replay.episodeId, terminalRewardReferenceSha256: sha('terminal-reward') } });
  assert.equal(validate(rehashSample(sample, { replay: nonterminalReplay })).ok, true, 'nonterminal steps must bind the same episode terminal reward identity');
  const wrongEpisodeReplay = rehashReplay(replay, { episodeReward: { terminal: false, episodeId: 'bc-candidate-one-episode-other', terminalRewardReferenceSha256: sha('terminal-reward') } });
  assert.equal(validate(rehashSample(sample, { replay: wrongEpisodeReplay })).decision.reason, 'bc-sample-terminal-reward-episode-mismatch');
  assert.equal(validate({ ...sample, model: { modelFileSha256: sha('forbidden') } }).decision.reason, 'bc-sample-schema-invalid', 'pre-model BC samples reject model fields');
  assert.equal(validate({ ...sample, sampleSha256: sha('wrong') }).decision.reason, 'bc-sample-hash-mismatch');

  console.log(JSON.stringify({ passed: true, sampleEnvelopesWritten: 0, inMemoryEnvelopeValidations: 13,
    completeCanonicalSetBound: true, teacherEvidenceRecomputed: true, replayIdentityBound: true,
    terminalRewardZeroSum: true, nonterminalRewardReferenceBound: true, modelFieldsBeforeTrainingRejected: true,
    pythonProcessesStarted: 0, trainingStarted: false, smokeGamesExecuted: 0 }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
