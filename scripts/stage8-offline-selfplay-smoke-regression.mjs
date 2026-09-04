import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-offline-selfplay-smoke-'));
const require = createRequire(import.meta.url);
function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name); const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); compileTree(from, to); }
    else if (entry.name.endsWith('.ts')) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: from }).outputText); }
  }
}
try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const identityTools = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const behavior = require(path.join(temp, 'game/stage8/offline-behavior-distribution.js'));
  const curriculum = require(path.join(temp, 'game/stage8/offline-curriculum-kong-zhichan-chain.js'));
  const control = require(path.join(temp, 'game/stage8/offline-selfplay-control.js'));
  const engine = require(path.join(temp, 'game/stage8/offline-selfplay-engine.js'));
  const h = (value) => crypto.createHash('sha256').update(value).digest('hex'); const fixed = h('fixed-identity');
  const plan = curriculum.createStage8FixedCurriculumPlan(20260824);
  const smokeIdentity = { runId: 'candidate-smoke', runDomainSha256: fixed, rulesSha256: fixed, actionSpaceSha256: fixed, legalActionMaskSha256: fixed, featureSha256: fixed, visibleInformationSha256: fixed, sampleProtocolSha256: fixed, trajectoryExecutorSha256: fixed, selfplayRuntimeSha256: fixed, mctsProviderSha256: fixed, modelFileSha256: fixed, onnxBinarySha256: fixed, modelManifestSha256: fixed, curriculumSha256: curriculum.hashStage8FixedCurriculumDefinition(), explorationSha256: behavior.hashStage8OfflineExplorationDefinition(), seedPlanSha256: plan.planSha256, versionedModelUri: 'https://models.example.test/stage8/v1/model.onnx' };
  const payload = { protocolVersion: control.STAGE8_OFFLINE_SMOKE_CONTROL_VERSION, identity: smokeIdentity, authorization: { approvalId: 'approval-smoke-regression', granted: true, scope: 'fixed-course-smoke-preflight' }, curriculum: 'kong-zhichan-chain', plannedGames: 1000, candidateSeatGames: [250,250,250,250], scenarioRatio: { forcedRunKong: 2, zhichan: 2, chainKong: 1 }, targetedExplorationRate: 0.2, allowFixedCourseSmoke: true, allowTraining: false, allowSelfplayRuntime: false, allowReplayRuntime: false, allowModelRuntime: false, allowOnnxRuntime: false, allowCheckpoint: false, allowPilot: false, allowArena: false, allowChampion: false, allowProductionRuntime: false };
  const smokeControl = { ...payload, manifestSha256: control.hashStage8OfflineSmokeControlManifestPayload(payload) };
  const artifactRoot = { environment: { STAGE8_ARTIFACT_ROOT: 'E:\\stage8-artifacts' }, projectRoots: [root], exists: (value) => value === 'E:\\stage8-artifacts', isDirectory: (value) => value === 'E:\\stage8-artifacts' };
  const state = { phase: 'discarding', currentPlayer: 0, players: [{ hand: ['fa','fa','wan1','wan1','wan1','wan1','wan4','wan5','wan6','tiao5','tiao6','tong5','tong6','dong'], melds: [] }, { hand: ['wan9'], melds: [] }, { hand: ['tong9'], melds: [] }, { hand: ['tiao9'], melds: [] }], melds: [[],[],[],[]], discards: [[],[],[],[]], turn: 0, dealer: 0, scores: [0,0,0,0], wallTiles: ['tiao4'], passRecords: [], kongResources: [] };
  const original = JSON.stringify(state); let providerCalls = 0;
  const uniformProvider = async (request) => {
    providerCalls += 1;
    const serialized = JSON.stringify(request);
    assert.equal(serialized.includes('wallTiles'), false, 'provider cannot see wall order');
    assert.equal(serialized.includes('wan9'), false, 'provider cannot see opponent concealed hand');
    assert.equal(serialized.includes('tong9'), false, 'provider cannot see opponent concealed hand');
    assert.equal(serialized.includes('tiao9'), false, 'provider cannot see opponent concealed hand');
    const keys = request.legalActions.map(identityTools.stage8CanonicalActionKey).sort();
    return behavior.createStage8OfflineRawDistributionResult({ request, providerVersion: 'stage8-test-uniform-v1', distribution: Object.fromEntries(keys.map((key) => [key, 1 / keys.length])), details: { kind: 'uniform' } });
  };
  const cursor = engine.createStage8OfflineSelfplayCursor(state); const game = plan.games[0];
  const declineGame = plan.games.find((entry) => entry.candidateSeat !== 0);
  assert.ok(declineGame, 'fixture requires a non-actor candidate seat so targeted exploration does not override declineKong');
  const declineProvider = async (request) => {
    const selected = request.legalActions.find((action) => action.actionType === 'declineKong') || request.legalActions.find((action) => action.actionType === 'discard');
    assert.ok(selected, 'decline flow must offer declineKong first and a true-source discard second');
    const selectedKey = identityTools.stage8CanonicalActionKey(selected);
    const keys = request.legalActions.map(identityTools.stage8CanonicalActionKey).sort();
    return behavior.createStage8OfflineRawDistributionResult({ request, providerVersion: 'stage8-test-decline-v1', distribution: Object.fromEntries(keys.map((key) => [key, key === selectedKey ? 1 : 0])), details: { kind: 'decline-then-discard' } });
  };
  const declineFirst = await engine.executeStage8OfflineSelfplayDecision({ cursor, plan, game: declineGame, smokeControl, artifactRoot, rawDistributionProvider: declineProvider, providerIdentitySha256: fixed });
  assert.equal(declineFirst.ok, true, declineFirst.ok ? '' : declineFirst.reason);
  assert.equal(declineFirst.evidence.behavior.selectedAction.actionType, 'declineKong');
  assert.equal(JSON.stringify(declineFirst.cursor.state), original, 'selfplay decline changes only episode context');
  assert.ok(declineFirst.cursor.context.pendingKongDecline);
  const declineSecond = await engine.executeStage8OfflineSelfplayDecision({ cursor: declineFirst.cursor, plan, game: declineGame, smokeControl, artifactRoot, rawDistributionProvider: declineProvider, providerIdentitySha256: fixed });
  assert.equal(declineSecond.ok, true, declineSecond.ok ? '' : declineSecond.reason);
  assert.equal(declineSecond.evidence.behavior.legalActions.every((action) => action.actionType === 'discard'), true);
  assert.equal(declineSecond.evidence.behavior.selectedAction.actionType, 'discard');
  assert.equal(declineSecond.cursor.context.pendingKongDecline, null);
  const first = await engine.executeStage8OfflineSelfplayDecision({ cursor, plan, game, smokeControl, artifactRoot, rawDistributionProvider: uniformProvider, providerIdentitySha256: fixed });
  assert.equal(first.ok, true, first.ok ? '' : first.reason); assert.equal(first.status === 'advanced' || first.status === 'ended', true); assert.ok(first.evidence); assert.equal(providerCalls, 1); assert.equal(JSON.stringify(state), original, 'engine input state remains immutable');
  const forcedKeys = first.evidence.behavior.legalActions.filter((action) => ['forcedRunImmediate','forcedRunDeferred','forcedRunConcealed','doublePongForcedRun'].includes(action.actionType)).map(identityTools.stage8CanonicalActionKey);
  assert.ok(forcedKeys.length > 0, 'directed fixture exposes forced-run action');
  const rawProbability = 1 / first.evidence.behavior.legalActionKeys.length; const targetedProbability = 1 / forcedKeys.length;
  assert.equal(first.evidence.behavior.behaviorActionDistribution[forcedKeys[0]], 0.8 * rawProbability + 0.2 * targetedProbability, 'candidate target action receives exact 20% mixture');
  const replay = await engine.executeStage8OfflineSelfplayDecision({ cursor: engine.createStage8OfflineSelfplayCursor(structuredClone(state)), plan, game, smokeControl, artifactRoot, rawDistributionProvider: uniformProvider, providerIdentitySha256: fixed });
  assert.equal(replay.ok, true); assert.equal(replay.cursor.traceHash, first.cursor.traceHash); assert.equal(replay.evidence.behavior.selectedActionKey, first.evidence.behavior.selectedActionKey, 'same seed and identities select exactly the same action');
  const badProvider = async (request) => behavior.createStage8OfflineRawDistributionResult({ request, providerVersion: 'stage8-test-invalid-v1', distribution: { [identityTools.stage8CanonicalActionKey(request.legalActions[0])]: 1 }, details: { kind: 'incomplete' } });
  const fused = await engine.executeStage8OfflineSelfplayDecision({ cursor, plan, game, smokeControl, artifactRoot, rawDistributionProvider: badProvider, providerIdentitySha256: fixed });
  assert.equal(fused.ok, false); assert.equal(fused.reason, 'behavior-mcts-distribution-invalid'); assert.equal(JSON.stringify(fused.cursor.state), original, 'fused decision has zero state side effects');
  const deniedPayload = { ...payload, authorization: { ...payload.authorization, granted: false } }; const deniedControl = { ...deniedPayload, manifestSha256: control.hashStage8OfflineSmokeControlManifestPayload(deniedPayload) };
  const denied = await engine.executeStage8OfflineSelfplayDecision({ cursor, plan, game, smokeControl: deniedControl, artifactRoot, rawDistributionProvider: uniformProvider, providerIdentitySha256: fixed }); assert.equal(denied.ok, false); assert.equal(denied.reason, 'smoke-explicit-authorization-required');
  const chainAction = { actionSpaceVersion: 'stage8-action-space-v2', actionType: 'chainKong', actionId: 900, tile: 'wan1', context: { actor: 0, declarationWindow: 'chain-kong', ownTileCount: 1, robKongWindow: true, resourceSignature: '0:wan2>wan1' } }; const discardAction = { actionSpaceVersion: 'stage8-action-space-v2', actionType: 'discard', actionId: 200, tile: 'wan1', context: { actor: 0, declarationWindow: 'self-draw-discard', ownTileCount: 1, robKongWindow: false } }; const chainKeys = [chainAction, discardAction].map(identityTools.stage8CanonicalActionKey).sort(); const raw = Object.fromEntries(chainKeys.map((key) => [key, 0.5])); const chainSelection = await behavior.selectStage8OfflineBehaviorAction({ visibleState: { actor: 0 }, legalActions: [chainAction,discardAction], rawDistributionProvider: async (request) => behavior.createStage8OfflineRawDistributionResult({ request, providerVersion: 'stage8-test-chain-v1', distribution: raw, details: { kind: 'chain' } }), providerIdentitySha256: fixed, decisionIdentity: fixed, scenario: 'chainKong', candidateSeat: 0, actor: 0 }); assert.equal(chainSelection.ok, true); assert.deepEqual(chainSelection.value.behaviorActionDistribution, raw, 'chain is report-only and does not receive targeted mixing'); assert.equal(chainSelection.value.exploration, false);
  const coveredSeat = { forcedRunKong: { legalOpportunities: 5, positiveBehavior: 1, selected: 1, reportOnly: false }, zhichan: { legalOpportunities: 5, positiveBehavior: 1, selected: 1, reportOnly: false }, chainKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: true } }; const coverageLedger = { completedGames: 1000, candidateSeatGames: [250,250,250,250], byCandidateSeat: [coveredSeat,coveredSeat,coveredSeat,coveredSeat] }; const coverageDecision = engine.evaluateStage8OfflineSmokeCoverage(coverageLedger); assert.equal(coverageDecision.ok, true, coverageDecision.ok ? '' : coverageDecision.reason); assert.equal(coverageDecision.aggregate.chainKong.legalOpportunities, 0, 'chain remains report-only and cannot block'); const belowThreshold = structuredClone(coverageLedger); belowThreshold.byCandidateSeat[0].forcedRunKong.legalOpportunities = 0; assert.equal(engine.evaluateStage8OfflineSmokeCoverage(belowThreshold).reason, 'smoke-coverage-forcedRunKong-legal-opportunity-below-20');
  console.log(JSON.stringify({ passed: true, deterministicDecisions: 2, formalSmokeGamesExecuted: 0, controls: ['explicit-control','artifact-preflight','visible-only-provider-input','full-raw-distribution','candidate-only-20-percent-mixture','forced-run-and-zhichan-hard-thresholds','chain-report-only','true-source-trajectory','replay-stability','fuse-zero-side-effect'], selfplayStarted: false, artifactsWritten: false }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
