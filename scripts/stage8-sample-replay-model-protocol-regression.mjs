import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd(); const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-sample-protocol-')); const require = createRequire(import.meta.url); const hash = (value) => crypto.createHash('sha256').update(value).digest('hex'); const h = hash('identity');
try {
  for (const file of ['artifact-root-preflight.ts','training-control-protocol.ts','sample-replay-model-protocol.ts']) { const source = path.join(root, 'src/game/stage8', file); const output = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: source }).outputText; fs.writeFileSync(path.join(temp, file.replace('.ts','.js')), output); }
  const control = require(path.join(temp, 'training-control-protocol.js')); const protocol = require(path.join(temp, 'sample-replay-model-protocol.js'));
  const artifactRoot = { environment: { STAGE8_ARTIFACT_ROOT: 'E:\\stage8-artifacts' }, projectRoots: ['C:\\repo'], exists: (value) => value === 'E:\\stage8-artifacts', isDirectory: (value) => value === 'E:\\stage8-artifacts' };
  const identity = { runId: 'candidate-5', runDomainSha256: h, rulesSha256: h, actionSpaceSha256: h, legalActionMaskSha256: h, featureSha256: h, visibleInformationSha256: h, curriculumSha256: h, explorationSha256: h, modelSha256: h, sampleSchemaSha256: h, trainingControlSourceSha256: h, trainingControlFingerprint: h, selfplayRuntimeSourceSha256: h, selfplayRuntimeFingerprint: h, arenaRuntimeFingerprint: h };
  const manifestPayload = { protocolVersion: control.STAGE8_TRAINING_CONTROL_VERSION, identity, authorization: { approvalId: 'approval-sample-protocol', granted: true }, maxSteps: 315, phase: 'bootstrap', allowSmoke: false, allowPilot: false, allowArena: false, allowChampion: false, allowRuntime: false }; const manifest = { ...manifestPayload, manifestSha256: control.hashStage8TrainingManifestPayload(manifestPayload) };
  const visibleState = { actor: 0, ownHand: ['wan1'], publicMelds: [[],[],[],[]], publicDiscards: [[],[],[],[]], scores: [0,0,0,0], dealer: 0, turn: 1, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 69 };
  const legalActionIds = ['discard','selfwin']; const action = { legalActionIds, legalActionSetSha256: hash(JSON.stringify(legalActionIds)), candidateActionIds: legalActionIds, mctsDistribution: { discard: 0.4, selfwin: 0.6 }, behaviorActionDistribution: { discard: 0.25, selfwin: 0.75 }, selectedActionId: 'selfwin', behaviorActionProbability: 0.75, behaviorActionSource: 'mcts', exploration: false };
  const replayPayload = { fixedSeed: 20260824, canonicalActionId: 'selfwin', preStateSha256: h, postStateSha256: h, publicEventSha256: h, executionDomainSha256: h, visibleStateSha256: protocol.hashStage8VisibleSampleState(visibleState), episodeReward: { terminal: true, terminalDelta: [6,-2,-2,-2] } };
  const sample = { sampleId: 'sample-000001', batchId: 'candidate-5-batch-000001', manifest, model: { modelFileSha256: h, onnxBinarySha256: h, modelManifestSha256: h, versionedExternalUri: 'https://models.example.test/stage8/v1/model.onnx' }, visibleState, action, replay: { ...replayPayload, replaySha256: protocol.hashStage8ReplayEnvelopePayload(replayPayload) } };
  const validate = (value) => protocol.validateStage8OfflineSample({ sample: value, artifactRoot }); const rehashManifest = (changes) => { const payload = { ...manifestPayload, ...changes }; return { ...payload, manifestSha256: control.hashStage8TrainingManifestPayload(payload) }; };
  const valid = validate(sample); assert.equal(valid.ok, true, valid.ok ? '' : valid.decision.reason); assert.equal(validate(sample).value.sampleSha256, valid.value.sampleSha256, 'stable sample identity');
  assert.equal(validate({ ...sample, manifest: rehashManifest({ allowSmoke: true }) }).decision.reason, 'sample-training-control-training-downstream-flow-forbidden');
  assert.equal(validate({ ...sample, manifest: rehashManifest({ authorization: { approvalId: 'approval-sample-protocol', granted: false } }) }).decision.reason, 'sample-training-control-training-authorization-required');
  assert.equal(validate({ ...sample, manifest: rehashManifest({ phase: 'training' }) }).decision.reason, 'sample-training-control-training-phase-invalid');
  assert.equal(validate({ ...sample, manifest: rehashManifest({ maxSteps: 316 }) }).decision.reason, 'sample-training-control-training-step-limit-invalid');
  assert.equal(validate({ ...sample, action: { ...action, candidateActionIds: ['selfwin'] } }).decision.reason, 'sample-candidate-action-set-mismatch');
  assert.equal(validate({ ...sample, action: { ...action, mctsDistribution: { selfwin: 1 } } }).decision.reason, 'sample-action-distribution-invalid');
  assert.equal(validate({ ...sample, action: { ...action, behaviorActionDistribution: { discard: Number.NaN, selfwin: 1 } } }).decision.reason, 'sample-action-distribution-invalid');
  assert.equal(validate({ ...sample, action: { ...action, behaviorActionProbability: 0.6 } }).decision.reason, 'sample-selected-action-invalid');
  assert.equal(validate({ ...sample, model: { ...sample.model, onnxBinarySha256: '' } }).decision.reason, 'sample-model-package-identity-invalid');
  assert.equal(validate({ ...sample, model: { ...sample.model, versionedExternalUri: 'https://models.example.test/model.onnx' } }).decision.reason, 'sample-model-package-identity-invalid');
  assert.equal(validate({ ...sample, model: { ...sample.model, modelFileSha256: hash('other-model') } }).decision.reason, 'sample-model-manifest-incompatible');
  assert.equal(validate({ ...sample, batchId: 'other-run-batch-000001' }).decision.reason, 'sample-batch-manifest-incompatible');
  assert.equal(validate({ ...sample, visibleState: { ...visibleState, opponentHand: ['wan9'] } }).decision.reason, 'sample-visible-state-schema-invalid');
  assert.equal(validate({ ...sample, replay: { ...sample.replay, episodeReward: { terminal: true, terminalDelta: [1,0,0,0] } } }).decision.reason, 'sample-terminal-reward-invalid');
  assert.equal(validate({ ...sample, replay: { ...sample.replay, episodeReward: { terminal: false, episodeId: 'episode-1', terminalRewardReferenceSha256: '' } } }).decision.reason, 'sample-terminal-reward-reference-invalid');
  assert.equal(validate({ ...sample, replay: { ...sample.replay, executionDomainSha256: hash('other') } }).decision.reason, 'sample-replay-identity-invalid');
  console.log(JSON.stringify({ passed: true, controls: ['complete-legal-action-set','dual-distribution','selected-probability','visible-schema','model-onnx-manifest-identity','terminal-reward','replay-envelope','training-control-delegation','pure-fuse'], selfplayStarted: false, artifactsWritten: false }, null, 2));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
