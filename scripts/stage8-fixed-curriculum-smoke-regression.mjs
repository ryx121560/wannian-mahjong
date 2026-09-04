import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-fixed-course-'));
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
  const identityTools = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const control = require(path.join(temp, 'game/stage8/offline-selfplay-control.js'));
  const curriculum = require(path.join(temp, 'game/stage8/offline-curriculum-kong-zhichan-chain.js'));
  const runner = require(path.join(temp, 'game/stage8/offline-smoke-runner.js'));
  const adapter = require(path.join(temp, 'game/stage8/offline-round-adapter.js'));
  const registry = require(path.join(temp, 'game/stage8/action-registry-v2.js'));

  const first = curriculum.createStage8FixedCurriculumPlan(20260824);
  const second = curriculum.createStage8FixedCurriculumPlan(20260824);
  assert.deepEqual(first, second, 'fixed seed creates byte-identical in-memory plan');
  assert.equal(curriculum.validateStage8FixedCurriculumPlan(first).ok, true);
  assert.equal(first.games.length, 1000);
  assert.equal(new Set(first.games.map((game) => game.gameId)).size, 1000);
  assert.equal(new Set(first.games.map((game) => game.fixedSeed)).size, 1000);

  const seats = [0, 0, 0, 0];
  const scenarios = { forcedRunKong: 0, zhichan: 0, chainKong: 0 };
  const perSeat = Array.from({ length: 4 }, () => ({ forcedRunKong: 0, zhichan: 0, chainKong: 0 }));
  const recipeHashes = new Set();
  for (const game of first.games) {
    seats[game.candidateSeat] += 1;
    scenarios[game.scenario] += 1;
    perSeat[game.candidateSeat][game.scenario] += 1;
    const recipe = curriculum.createStage8FixedCurriculumWallRecipe(game);
    assert.equal(recipe.wallRecipeSha256, game.wallRecipeSha256);
    assert.equal(recipe.wallTiles.length, 136);
    const counts = Object.fromEntries(registry.STAGE8_V2_TILE_KEYS.map((tile) => [tile, 0]));
    recipe.wallTiles.forEach((tile) => { counts[tile] += 1; });
    assert.ok(Object.values(counts).every((count) => count === 4), `complete four-copy wall: ${game.gameId}`);
    const initial = runner.createStage8FormalSmokeInitialState(game);
    assert.ok(initial.players[game.dealerSeat].hand.includes(game.leadDiscardTile), `dealer owns declared lead tile: ${game.gameId}`);
    recipeHashes.add(recipe.wallRecipeSha256);
  }
  assert.deepEqual(seats, [250, 250, 250, 250]);
  assert.deepEqual(scenarios, { forcedRunKong: 400, zhichan: 400, chainKong: 200 });
  for (const row of perSeat) assert.deepEqual(row, { forcedRunKong: 100, zhichan: 100, chainKong: 50 });
  assert.equal(recipeHashes.size, 1000, 'every planned game has a stable full-wall recipe identity');

  function proveRulesDerivedOpportunity(scenario, expectedActionType) {
    const game = first.games.find((entry) => entry.scenario === scenario);
    const initial = runner.createStage8FormalSmokeInitialState(game);
    assert.equal(initial.wallTiles.length, 83);
    const dealerActions = adapter.deriveStage8OfflineActions({ state: initial, actor: game.dealerSeat });
    const leadDiscard = dealerActions.find((action) => action.actionType === 'discard' && action.tile === game.leadDiscardTile);
    assert.ok(leadDiscard, `${scenario} dealer lead discard must be canonical`);
    const response = adapter.executeStage8OfflineCanonicalAction({ state: initial, action: leadDiscard });
    assert.equal(response.ok, true, response.ok ? '' : response.reason);
    assert.equal(response.state.phase, 'responding');
    assert.equal(response.state.currentPlayer, game.candidateSeat);
    const legal = adapter.deriveStage8OfflineActions({ state: response.state, actor: game.candidateSeat });
    const target = legal.find((action) => action.actionType === expectedActionType);
    assert.ok(target, `${scenario} opportunity must come from the canonical rules action set`);
    const keys = legal.map(identityTools.stage8CanonicalActionKey);
    const distribution = Object.fromEntries(keys.map((key) => [key, 1 / keys.length]));
    const coverage = runner.deriveStage8FormalSmokeGameCoverage(game.candidateSeat, [{
      canonicalActions: legal,
      behaviorActionDistribution: distribution,
      selectedAction: target,
    }]);
    assert.equal(coverage[scenario].legalOpportunities, 1);
    assert.equal(coverage[scenario].positiveBehavior, 1);
    assert.equal(coverage[scenario].selected, 1);
    return { gameId: game.gameId, canonicalActionTypes: legal.map((action) => action.actionType) };
  }

  const zhichanEvidence = proveRulesDerivedOpportunity('zhichan', 'directChisel');
  const forcedRunEvidence = proveRulesDerivedOpportunity('forcedRunKong', 'forcedRunImmediate');
  const chainGame = first.games.find((entry) => entry.scenario === 'chainKong');
  assert.equal(curriculum.createStage8FixedCurriculumWallRecipe(chainGame).wallRecipeSha256, chainGame.wallRecipeSha256);

  const tampered = structuredClone(first);
  tampered.games[0].wallRecipeSha256 = crypto.createHash('sha256').update('tampered').digest('hex');
  assert.equal(curriculum.validateStage8FixedCurriculumPlan(tampered).reason, 'fixed-course-plan-identity-mismatch');
  const h = crypto.createHash('sha256').update('identity').digest('hex');
  const identity = {
    runId: 'candidate-smoke', runDomainSha256: h, rulesSha256: h, actionSpaceSha256: h,
    legalActionMaskSha256: h, featureSha256: h, visibleInformationSha256: h, sampleProtocolSha256: h,
    trajectoryExecutorSha256: h, selfplayRuntimeSha256: h, mctsProviderSha256: h, modelFileSha256: h,
    onnxBinarySha256: h, modelManifestSha256: h,
    curriculumSha256: curriculum.hashStage8FixedCurriculumDefinition(), explorationSha256: h,
    seedPlanSha256: first.planSha256, versionedModelUri: 'https://models.example.test/stage8/v1/model.onnx',
  };
  const payload = {
    protocolVersion: control.STAGE8_OFFLINE_SMOKE_CONTROL_VERSION, identity,
    authorization: { approvalId: 'approval-fixed-course', granted: true, scope: 'fixed-course-smoke-preflight' },
    curriculum: 'kong-zhichan-chain', plannedGames: 1000, candidateSeatGames: [250, 250, 250, 250],
    scenarioRatio: { forcedRunKong: 2, zhichan: 2, chainKong: 1 }, targetedExplorationRate: 0.2,
    allowFixedCourseSmoke: true, allowTraining: false, allowSelfplayRuntime: false, allowReplayRuntime: false,
    allowModelRuntime: false, allowOnnxRuntime: false, allowCheckpoint: false, allowPilot: false,
    allowArena: false, allowChampion: false, allowProductionRuntime: false,
  };
  const manifest = { ...payload, manifestSha256: control.hashStage8OfflineSmokeControlManifestPayload(payload) };
  const validRoot = {
    environment: { STAGE8_ARTIFACT_ROOT: 'E:\\stage8-artifacts' }, projectRoots: [root],
    exists: (value) => value === 'E:\\stage8-artifacts', isDirectory: (value) => value === 'E:\\stage8-artifacts',
  };
  assert.equal(control.validateStage8OfflineSmokeControl({ manifest, artifactRoot: validRoot }).ok, true);
  const noAuthorizationPayload = { ...payload, authorization: { ...payload.authorization, granted: false } };
  const noAuthorization = { ...noAuthorizationPayload, manifestSha256: control.hashStage8OfflineSmokeControlManifestPayload(noAuthorizationPayload) };
  assert.equal(control.validateStage8OfflineSmokeControl({ manifest: noAuthorization, artifactRoot: validRoot }).decision.reason, 'smoke-explicit-authorization-required');
  assert.equal(control.validateStage8OfflineSmokeControl({ manifest, artifactRoot: { ...validRoot, environment: {} } }).decision.reason, 'smoke-stage8-artifact-root-required');
  assert.equal(control.validateStage8OfflineSmokeControl({ manifest, artifactRoot: { ...validRoot, environment: { STAGE8_ARTIFACT_ROOT: path.join(root, 'artifacts') }, exists: () => true, isDirectory: () => true } }).decision.reason, 'smoke-stage8-artifact-root-project-tree-forbidden');
  assert.equal(identityTools.hashStage8OfflineIdentity(first.games), identityTools.hashStage8OfflineIdentity(second.games));
  console.log(JSON.stringify({
    passed: true,
    plannedGames: 1000,
    executedGames: 0,
    candidateSeatGames: seats,
    scenarioCounts: scenarios,
    perSeat,
    fullWallRecipeIdentities: recipeHashes.size,
    rulesDerivedOpportunities: { zhichan: zhichanEvidence, forcedRunKong: forcedRunEvidence, chainKong: 'report-only' },
    controls: ['2:2:1-fixed-course', 'four-seats-250-each', '136-tile-four-copy-wall', 'recipe-identity', 'rules-derived-opportunity', 'tamper-rejected', 'explicit-authorization', 'artifact-root-reused', 'default-reject'],
    selfplayStarted: false,
    artifactsWritten: false,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
