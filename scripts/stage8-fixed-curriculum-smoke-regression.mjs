import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd(); const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-fixed-course-')); const require = createRequire(import.meta.url);
try {
  for (const file of ['artifact-root-preflight.ts','offline-action-identity.ts','offline-selfplay-control.ts','offline-curriculum-kong-zhichan-chain.ts']) {
    const source = path.join(root, 'src/game/stage8', file); const output = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: source }).outputText; fs.writeFileSync(path.join(temp, file.replace('.ts','.js')), output);
  }
  const identityTools = require(path.join(temp, 'offline-action-identity.js')); const control = require(path.join(temp, 'offline-selfplay-control.js')); const curriculum = require(path.join(temp, 'offline-curriculum-kong-zhichan-chain.js'));
  const first = curriculum.createStage8FixedCurriculumPlan(20260824); const second = curriculum.createStage8FixedCurriculumPlan(20260824); assert.deepEqual(first, second, 'fixed seed creates byte-identical in-memory plan'); assert.equal(curriculum.validateStage8FixedCurriculumPlan(first).ok, true); assert.equal(first.games.length, 1000); assert.equal(new Set(first.games.map((game) => game.gameId)).size, 1000); assert.equal(new Set(first.games.map((game) => game.fixedSeed)).size, 1000);
  const seats = [0,0,0,0]; const scenarios = { forcedRunKong: 0, zhichan: 0, chainKong: 0 }; const perSeat = Array.from({ length: 4 }, () => ({ forcedRunKong: 0, zhichan: 0, chainKong: 0 }));
  for (const game of first.games) { seats[game.candidateSeat] += 1; scenarios[game.scenario] += 1; perSeat[game.candidateSeat][game.scenario] += 1; }
  assert.deepEqual(seats, [250,250,250,250]); assert.deepEqual(scenarios, { forcedRunKong: 400, zhichan: 400, chainKong: 200 }); for (const row of perSeat) assert.deepEqual(row, { forcedRunKong: 100, zhichan: 100, chainKong: 50 });
  const tampered = structuredClone(first); tampered.games[0].candidateSeat = 3; assert.equal(curriculum.validateStage8FixedCurriculumPlan(tampered).reason, 'fixed-course-plan-identity-mismatch');
  const h = crypto.createHash('sha256').update('identity').digest('hex'); const identity = { runId: 'candidate-smoke', runDomainSha256: h, rulesSha256: h, actionSpaceSha256: h, legalActionMaskSha256: h, featureSha256: h, visibleInformationSha256: h, sampleProtocolSha256: h, trajectoryExecutorSha256: h, selfplayRuntimeSha256: h, mctsProviderSha256: h, modelFileSha256: h, onnxBinarySha256: h, modelManifestSha256: h, curriculumSha256: curriculum.hashStage8FixedCurriculumDefinition(), explorationSha256: h, seedPlanSha256: first.planSha256, versionedModelUri: 'https://models.example.test/stage8/v1/model.onnx' };
  const payload = { protocolVersion: control.STAGE8_OFFLINE_SMOKE_CONTROL_VERSION, identity, authorization: { approvalId: 'approval-fixed-course', granted: true, scope: 'fixed-course-smoke-preflight' }, curriculum: 'kong-zhichan-chain', plannedGames: 1000, candidateSeatGames: [250,250,250,250], scenarioRatio: { forcedRunKong: 2, zhichan: 2, chainKong: 1 }, targetedExplorationRate: 0.2, allowFixedCourseSmoke: true, allowTraining: false, allowSelfplayRuntime: false, allowReplayRuntime: false, allowModelRuntime: false, allowOnnxRuntime: false, allowCheckpoint: false, allowPilot: false, allowArena: false, allowChampion: false, allowProductionRuntime: false }; const manifest = { ...payload, manifestSha256: control.hashStage8OfflineSmokeControlManifestPayload(payload) }; const validRoot = { environment: { STAGE8_ARTIFACT_ROOT: 'E:\\stage8-artifacts' }, projectRoots: [root], exists: (value) => value === 'E:\\stage8-artifacts', isDirectory: (value) => value === 'E:\\stage8-artifacts' };
  assert.equal(control.validateStage8OfflineSmokeControl({ manifest, artifactRoot: validRoot }).ok, true);
  const noAuthorizationPayload = { ...payload, authorization: { ...payload.authorization, granted: false } }; const noAuthorization = { ...noAuthorizationPayload, manifestSha256: control.hashStage8OfflineSmokeControlManifestPayload(noAuthorizationPayload) }; assert.equal(control.validateStage8OfflineSmokeControl({ manifest: noAuthorization, artifactRoot: validRoot }).decision.reason, 'smoke-explicit-authorization-required');
  assert.equal(control.validateStage8OfflineSmokeControl({ manifest, artifactRoot: { ...validRoot, environment: {} } }).decision.reason, 'smoke-stage8-artifact-root-required');
  assert.equal(control.validateStage8OfflineSmokeControl({ manifest, artifactRoot: { ...validRoot, environment: { STAGE8_ARTIFACT_ROOT: path.join(root, 'artifacts') }, exists: () => true, isDirectory: () => true } }).decision.reason, 'smoke-stage8-artifact-root-project-tree-forbidden');
  assert.equal(identityTools.hashStage8OfflineIdentity(first.games), identityTools.hashStage8OfflineIdentity(second.games));
  console.log(JSON.stringify({ passed: true, plannedGames: 1000, executedGames: 0, candidateSeatGames: seats, scenarioCounts: scenarios, perSeat, controls: ['2:2:1-fixed-course','four-seats-250-each','fixed-seed-identity','tamper-rejected','explicit-authorization','artifact-root-reused','default-reject'], selfplayStarted: false, artifactsWritten: false }, null, 2));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
