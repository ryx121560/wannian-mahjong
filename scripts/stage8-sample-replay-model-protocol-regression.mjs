import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-sample-protocol-'));
const require = createRequire(import.meta.url);
const h = crypto.createHash('sha256').update('identity').digest('hex');

try {
  for (const file of ['artifact-root-preflight.ts','action-registry-v2.ts','offline-action-identity.ts','offline-selfplay-control.ts','training-control-protocol.ts','sample-replay-model-protocol.ts']) {
    const source = path.join(root, 'src/game/stage8', file);
    const output = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: source }).outputText;
    fs.writeFileSync(path.join(temp, file.replace('.ts','.js')), output);
  }
  const identityTools = require(path.join(temp, 'offline-action-identity.js'));
  const smoke = require(path.join(temp, 'offline-selfplay-control.js'));
  const control = require(path.join(temp, 'training-control-protocol.js'));
  const protocol = require(path.join(temp, 'sample-replay-model-protocol.js'));
  const artifactRoot = { environment: { STAGE8_ARTIFACT_ROOT: 'E:\\stage8-artifacts' }, projectRoots: ['C:\\repo'], exists: (value) => value === 'E:\\stage8-artifacts', isDirectory: (value) => value === 'E:\\stage8-artifacts' };
  const identity = { runId: 'candidate-5', runDomainSha256: h, rulesSha256: h, actionSpaceSha256: h, legalActionMaskSha256: h, featureSha256: h, visibleInformationSha256: h, curriculumSha256: h, explorationSha256: h, modelSha256: h, sampleSchemaSha256: h, trainingControlSourceSha256: h, trainingControlFingerprint: h, selfplayRuntimeSourceSha256: h, selfplayRuntimeFingerprint: h, arenaRuntimeFingerprint: h };
  const manifestPayload = { protocolVersion: control.STAGE8_TRAINING_CONTROL_VERSION, identity, authorization: { approvalId: 'approval-sample-protocol', granted: true }, maxSteps: 315, phase: 'bootstrap', allowSmoke: false, allowPilot: false, allowArena: false, allowChampion: false, allowRuntime: false };
  const manifest = { ...manifestPayload, manifestSha256: control.hashStage8TrainingManifestPayload(manifestPayload) };
  const smokeIdentity = { runId: identity.runId, runDomainSha256: h, rulesSha256: h, actionSpaceSha256: h, legalActionMaskSha256: h, featureSha256: h, visibleInformationSha256: h, sampleProtocolSha256: h, trajectoryExecutorSha256: h, selfplayRuntimeSha256: h, mctsProviderSha256: h, modelFileSha256: h, onnxBinarySha256: h, modelManifestSha256: h, curriculumSha256: h, explorationSha256: h, seedPlanSha256: h, versionedModelUri: 'https://models.example.test/stage8/v1/model.onnx' };
  const smokePayload = { protocolVersion: smoke.STAGE8_OFFLINE_SMOKE_CONTROL_VERSION, identity: smokeIdentity, authorization: { approvalId: 'approval-fixed-course-smoke', granted: true, scope: 'fixed-course-smoke-preflight' }, curriculum: 'kong-zhichan-chain', plannedGames: 1000, candidateSeatGames: [250,250,250,250], scenarioRatio: { forcedRunKong: 2, zhichan: 2, chainKong: 1 }, targetedExplorationRate: 0.2, allowFixedCourseSmoke: true, allowTraining: false, allowSelfplayRuntime: false, allowReplayRuntime: false, allowModelRuntime: false, allowOnnxRuntime: false, allowCheckpoint: false, allowPilot: false, allowArena: false, allowChampion: false, allowProductionRuntime: false };
  const smokeControl = { ...smokePayload, manifestSha256: smoke.hashStage8OfflineSmokeControlManifestPayload(smokePayload) };
  const visibleState = { actor: 0, ownHand: ['wan1'], publicMelds: [[],[],[],[]], publicDiscards: [[],[],[],[]], scores: [0,0,0,0], dealer: 0, turn: 1, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 69 };
  const canonicalActions = [
    { actionSpaceVersion: 'stage8-action-space-v2', actionType: 'discard', actionId: 200, tile: 'wan1', context: { actor: 0, declarationWindow: 'self-draw-discard', ownTileCount: 1, robKongWindow: false } },
    { actionSpaceVersion: 'stage8-action-space-v2', actionType: 'pass', actionId: 100, context: { actor: 0, declarationWindow: 'discard-response', robKongWindow: false } },
  ].sort((left, right) => identityTools.stage8CanonicalActionKey(left).localeCompare(identityTools.stage8CanonicalActionKey(right)));
  const legalActionIds = canonicalActions.map(identityTools.stage8CanonicalActionKey);
  const selectedCanonicalAction = canonicalActions[1]; const selectedActionId = legalActionIds[1];
  const action = { legalActionIds, legalActionSetSha256: identityTools.hashStage8OfflineIdentity(legalActionIds), candidateActionIds: legalActionIds, canonicalActions, mctsDistribution: { [legalActionIds[0]]: 0.4, [legalActionIds[1]]: 0.6 }, behaviorActionDistribution: { [legalActionIds[0]]: 0.25, [legalActionIds[1]]: 0.75 }, selectedActionId, selectedCanonicalAction, selectedActionIdentitySha256: identityTools.hashStage8OfflineIdentity(selectedCanonicalAction), behaviorActionProbability: 0.75, behaviorActionSource: 'mcts', exploration: false };
  const replayPayload = { fixedSeed: 20260824, canonicalActionId: selectedActionId, preStateSha256: h, postStateSha256: h, publicEventSha256: h, executionDomainSha256: h, visibleStateSha256: protocol.hashStage8VisibleSampleState(visibleState), smokeControlSha256: smokeControl.manifestSha256, episodeContextSha256: h, traceStep: 1, episodeReward: { terminal: true, terminalDelta: [6,-2,-2,-2] } };
  const sample = { sampleId: 'sample-000001', batchId: 'candidate-5-batch-000001', manifest, smokeControl, model: { modelFileSha256: h, onnxBinarySha256: h, modelManifestSha256: h, versionedExternalUri: 'https://models.example.test/stage8/v1/model.onnx' }, visibleState, action, replay: { ...replayPayload, replaySha256: protocol.hashStage8ReplayEnvelopePayload(replayPayload) } };
  const validate = (value) => protocol.validateStage8OfflineSample({ sample: value, artifactRoot });
  const rehashManifest = (changes) => { const payload = { ...manifestPayload, ...changes }; return { ...payload, manifestSha256: control.hashStage8TrainingManifestPayload(payload) }; };
  const rehashSmoke = (changes) => { const payload = { ...smokePayload, ...changes }; return { ...payload, manifestSha256: smoke.hashStage8OfflineSmokeControlManifestPayload(payload) }; };
  const valid = validate(sample); assert.equal(valid.ok, true, valid.ok ? '' : valid.decision.reason); assert.equal(validate(sample).value.sampleSha256, valid.value.sampleSha256, 'stable sample identity');
  assert.equal(sample.model.modelFileSha256, smokeControl.identity.modelFileSha256, 'sample and Smoke bind the same frozen model identity');
  assert.equal(sample.model.onnxBinarySha256, smokeControl.identity.onnxBinarySha256, 'sample and Smoke bind the same ONNX identity');
  assert.equal(sample.model.modelManifestSha256, smokeControl.identity.modelManifestSha256, 'sample and Smoke bind the same manifest identity');
  assert.equal(validate({ ...sample, manifest: rehashManifest({ allowSmoke: true }) }).decision.reason, 'sample-training-control-training-downstream-flow-forbidden');
  assert.equal(validate({ ...sample, manifest: rehashManifest({ authorization: { approvalId: 'approval-sample-protocol', granted: false } }) }).decision.reason, 'sample-training-control-training-authorization-required');
  assert.equal(validate({ ...sample, smokeControl: rehashSmoke({ authorization: { ...smokePayload.authorization, granted: false } }) }).decision.reason, 'sample-smoke-explicit-authorization-required');
  assert.equal(validate({ ...sample, smokeControl: rehashSmoke({ allowTraining: true }) }).decision.reason, 'sample-smoke-downstream-flow-forbidden');
  assert.equal(validate({ ...sample, action: { ...action, candidateActionIds: [legalActionIds[1]] } }).decision.reason, 'sample-candidate-action-set-mismatch');
  assert.equal(validate({ ...sample, action: { ...action, canonicalActions: [canonicalActions[1]] } }).decision.reason, 'sample-canonical-action-set-mismatch');
  assert.equal(validate({ ...sample, action: { ...action, mctsDistribution: { [legalActionIds[1]]: 1 } } }).decision.reason, 'sample-action-distribution-invalid');
  assert.equal(validate({ ...sample, action: { ...action, behaviorActionDistribution: { [legalActionIds[0]]: Number.NaN, [legalActionIds[1]]: 1 } } }).decision.reason, 'sample-action-distribution-invalid');
  assert.equal(validate({ ...sample, action: { ...action, behaviorActionProbability: 0.6 } }).decision.reason, 'sample-selected-action-invalid');
  assert.equal(validate({ ...sample, action: { ...action, selectedCanonicalAction: canonicalActions[0] } }).decision.reason, 'sample-selected-action-invalid');
  assert.equal(validate({ ...sample, model: { ...sample.model, onnxBinarySha256: '' } }).decision.reason, 'sample-model-package-identity-invalid');
  assert.equal(validate({ ...sample, model: { ...sample.model, modelFileSha256: crypto.createHash('sha256').update('other-model').digest('hex') } }).decision.reason, 'sample-model-manifest-incompatible');
  assert.equal(validate({ ...sample, model: { ...sample.model, modelManifestSha256: crypto.createHash('sha256').update('other-manifest').digest('hex') } }).decision.reason, 'sample-smoke-model-package-incompatible');
  assert.equal(validate({ ...sample, model: { ...sample.model, versionedExternalUri: 'https://models.example.test/stage8/v2/model.onnx' } }).decision.reason, 'sample-smoke-model-package-incompatible');
  assert.equal(validate({ ...sample, visibleState: { ...visibleState, opponentHand: ['wan9'] } }).decision.reason, 'sample-visible-state-schema-invalid');
  assert.equal(validate({ ...sample, replay: { ...sample.replay, episodeReward: { terminal: true, terminalDelta: [1,0,0,0] } } }).decision.reason, 'sample-terminal-reward-invalid');
  assert.equal(validate({ ...sample, replay: { ...sample.replay, executionDomainSha256: crypto.createHash('sha256').update('other').digest('hex') } }).decision.reason, 'sample-replay-identity-invalid');
  console.log(JSON.stringify({ passed: true, controls: ['smoke-control-delegation','complete-canonical-action-set','dual-distribution','selected-probability','visible-schema','frozen-model-onnx-manifest-uri-identity','terminal-reward','replay-envelope','pure-fuse'], selfplayStarted: false, artifactsWritten: false }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
