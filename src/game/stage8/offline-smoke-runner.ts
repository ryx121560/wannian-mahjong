import type { GameState, Tile } from '../rules';
import { STAGE8_V2_TILE_KEYS } from './action-registry-v2';
import type { Stage8ArtifactRootPreflightInput } from './artifact-root-preflight';
import {
  validateStage8OfflineRawDistributionEvidenceEnvelope,
  type Stage8OfflineRawDistributionEvidence,
  type Stage8OfflineRawDistributionProvider,
} from './offline-behavior-distribution';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import {
  createStage8FixedCurriculumPlan,
  createStage8FixedCurriculumWallRecipe,
  validateStage8FixedCurriculumPlan,
  type Stage8FixedCourseGamePlan,
  type Stage8FixedCurriculumPlan,
} from './offline-curriculum-kong-zhichan-chain';
import { hashStage8OfflineIdentity, stage8CanonicalActionKey } from './offline-action-identity';
import {
  hashStage8FrozenModelInferenceContract,
  validateStage8FrozenModelIdentityPackage,
  validateStage8FrozenModelInferenceEvidence,
  type Stage8FrozenModelIdentityPackage,
  type Stage8FrozenModelInferenceEvidence,
} from './offline-frozen-model-inference';
import {
  createStage8OfflineSelfplayCursor,
  evaluateStage8OfflineSmokeCoverage,
  executeStage8OfflineSelfplayDecision,
  type Stage8OfflineActionCoverage,
  type Stage8OfflineSmokeCoverageLedger,
} from './offline-selfplay-engine';
import {
  STAGE8_OFFLINE_SMOKE_MAX_RUN_BYTES,
  STAGE8_OFFLINE_SMOKE_MAX_VOLUME_USED_RATIO,
  type Stage8OfflineSmokeControlManifest,
} from './offline-selfplay-control';
import type { Stage8OfflineTrajectoryRecord } from './offline-trajectory-executor';
import {
  preflightStage8FormalSmokeRuntime,
  validateStage8FormalSmokeCapacity,
  type Stage8FormalSmokeCapacitySnapshot,
  type Stage8FormalSmokeRuntimeManifest,
  type Stage8SmokeRuntimeFileSystem,
} from './offline-smoke-runtime-preflight';

export const STAGE8_FORMAL_SMOKE_RUNNER_VERSION = 'stage8-formal-smoke-runner-v3';
export const STAGE8_FORMAL_SMOKE_MAX_TRANSITIONS_PER_GAME = 600;

export interface Stage8FormalSmokeAssignment {
  gameIndex: number;
  gameId: string;
  fixedSeed: number;
  batchIndex: number;
  workerSlot: number;
}

export interface Stage8FormalSmokeGameLedger {
  gameIndex: number;
  gameId: string;
  fixedSeed: number;
  candidateSeat: 0 | 1 | 2 | 3;
  scenario: Stage8FixedCourseGamePlan['scenario'];
  dealerSeat: 0 | 1 | 2 | 3;
  leadDiscardTile: Tile;
  wallRecipeSha256: string;
  initialStateSha256: string;
  batchIndex: number;
  workerSlot: number;
  transitions: number;
  traceHash: string;
  terminalStateSha256: string;
  terminalDelta: [number, number, number, number];
  coverage: Stage8OfflineActionCoverage;
  canonicalActionCounts: Record<string, number>;
  decisions: Stage8FormalSmokeDecisionLedger[];
  semanticResultSha256: string;
}

export interface Stage8FormalSmokeBatchLedger {
  version: typeof STAGE8_FORMAL_SMOKE_RUNNER_VERSION;
  runId: string;
  batchIndex: number;
  previousBatchSha256: string | null;
  controlManifestSha256: string;
  runtimeManifestSha256: string;
  providerIdentitySha256: string;
  providerSourceBundleSha256: string;
  runtimeSourceBundleSha256: string;
  modelId: string;
  modelFileSha256: string;
  onnxBinarySha256: string;
  modelManifestSha256: string;
  modelIdentitySha256: string;
  fixedCurriculumSelfplayFingerprint: string;
  planSha256: string;
  curriculumOverride: Stage8FormalSmokeRuntimeManifest['curriculumOverride'];
  behaviorTemperature: number;
  workers: number;
  firstGameIndex: number;
  lastGameIndex: number;
  fixedSeeds: number[];
  completedGames: number;
  semanticResultsSha256: string;
  games: Stage8FormalSmokeGameLedger[];
  batchSha256: string;
}

export interface Stage8FormalSmokeDecisionLedger {
  traceStepBefore: number;
  decisionIdentitySha256: string;
  visibleStateSha256: string;
  episodeContextSha256: string;
  legalActionSetSha256: string;
  legalActionKeys: string[];
  canonicalActions: CanonicalStage8V2Action[];
  mctsDistribution: Record<string, number>;
  rawDistributionEvidence: Stage8OfflineRawDistributionEvidence;
  behaviorActionDistribution: Record<string, number>;
  selectedActionKey: string;
  selectedAction: CanonicalStage8V2Action;
  behaviorActionProbability: number;
  behaviorActionSource: 'mcts' | 'curriculum-exploration';
  exploration: boolean;
  records: Stage8OfflineTrajectoryRecord[];
  publicEventSha256: string;
  decisionSha256: string;
}

export interface Stage8FormalSmokeLedger {
  version: typeof STAGE8_FORMAL_SMOKE_RUNNER_VERSION;
  runId: string;
  controlManifestSha256: string;
  runtimeManifestSha256: string;
  providerIdentitySha256: string;
  modelIdentitySha256: string;
  fixedCurriculumSelfplayFingerprint: string;
  planSha256: string;
  baseSeed: number;
  batchSize: number;
  workers: number;
  completedGames: 1000;
  candidateSeatGames: [250, 250, 250, 250];
  coverage: Stage8OfflineSmokeCoverageLedger;
  semanticResultsSha256: string;
  batchLedgerSha256s: string[];
  lastBatchSha256: string;
  games: Stage8FormalSmokeGameLedger[];
  hardAnomalies: 0;
  fusedGames: 0;
  quarantinedGames: 0;
  ledgerSha256: string;
}

export interface Stage8FormalSmokeWriter {
  inspectCapacity(): Stage8FormalSmokeCapacitySnapshot;
  writeImmutable(relativeName: string, content: string): void;
}

export type Stage8FormalSmokeGameResult =
  | { ok: true; ledger: Stage8FormalSmokeGameLedger }
  | { ok: false; reason: string; gameId: string; isolationId: string };

export type Stage8FormalSmokeRunResult =
  | { ok: true; status: 'completed'; ledger: Stage8FormalSmokeLedger; artifactsWritten: number }
  | { ok: false; status: 'fused'; reason: string; isolationId: string; artifactsWritten: number };

function emptyCoverage(): Stage8OfflineActionCoverage {
  return {
    forcedRunKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: false },
    zhichan: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: false },
    chainKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: true },
  };
}

/** Creates one complete 136-tile course round without exposing its wall to policy code. */
export function createStage8FormalSmokeInitialState(game: Stage8FixedCourseGamePlan): GameState {
  const recipe = createStage8FixedCurriculumWallRecipe(game);
  if (recipe.wallRecipeSha256 !== game.wallRecipeSha256 || recipe.dealerSeat !== game.dealerSeat || recipe.leadDiscardTile !== game.leadDiscardTile) throw new Error('formal-smoke-wall-recipe-identity-invalid');
  const wallTiles = recipe.wallTiles.slice();
  const players = Array.from({ length: 4 }, () => ({ hand: [] as Tile[], melds: [], score: 0 }));
  for (const player of players) {
    for (let index = 0; index < 13; index += 1) player.hand.push(wallTiles.pop()!);
  }
  players[game.dealerSeat].hand.push(wallTiles.pop()!);
  return {
    phase: 'discarding',
    currentPlayer: game.dealerSeat,
    newDrawnTile: players[game.dealerSeat].hand.at(-1),
    players,
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    turn: 0,
    dealer: game.dealerSeat,
    scores: [0, 0, 0, 0],
    wallTiles,
    passRecords: [],
    kongResources: [],
  };
}

function inventoryError(state: GameState): string | null {
  if (!state.players || state.players.length !== 4 || state.melds.length !== 4 || state.discards.length !== 4 || state.scores.length !== 4) return 'formal-smoke-four-player-state-invalid';
  const counts = new Map<Tile, number>();
  const add = (tile: Tile): void => { counts.set(tile, (counts.get(tile) || 0) + 1); };
  state.wallTiles.forEach(add);
  state.players.flatMap((player) => player.hand).forEach(add);
  state.discards.flat().forEach(add);
  state.melds.flat().flatMap((meld) => meld.tiles.filter((tile): tile is Tile => Boolean(tile))).forEach(add);
  if ([...counts.values()].reduce((sum, count) => sum + count, 0) !== 136) return 'formal-smoke-tile-total-invalid';
  if (STAGE8_V2_TILE_KEYS.some((tile) => counts.get(tile) !== 4)) return 'formal-smoke-tile-multiplicity-invalid';
  if (!state.scores.every(Number.isFinite)) return 'formal-smoke-score-non-finite';
  if (state.scores.reduce((sum, score) => sum + score, 0) !== 0) return 'formal-smoke-score-not-zero-sum';
  if (state.players.some((player, index) => player.score != null && player.score !== state.scores[index])) return 'formal-smoke-player-score-mirror-invalid';
  return null;
}

export function createStage8FormalSmokeAssignments(plan: Stage8FixedCurriculumPlan, batchSize: number, workers: number): Stage8FormalSmokeAssignment[] {
  const validation = validateStage8FixedCurriculumPlan(plan);
  if (!validation.ok) throw new Error(validation.reason);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000 || !Number.isInteger(workers) || workers < 1 || workers > 64) throw new Error('formal-smoke-worker-config-invalid');
  return plan.games.map((game) => {
    const batchIndex = Math.floor(game.gameIndex / batchSize);
    return { gameIndex: game.gameIndex, gameId: game.gameId, fixedSeed: game.fixedSeed, batchIndex, workerSlot: game.gameIndex % workers };
  });
}

function semanticGameIdentity(game: Stage8FormalSmokeGameLedger): unknown {
  return {
    gameIndex: game.gameIndex,
    gameId: game.gameId,
    fixedSeed: game.fixedSeed,
    candidateSeat: game.candidateSeat,
    scenario: game.scenario,
    dealerSeat: game.dealerSeat,
    leadDiscardTile: game.leadDiscardTile,
    wallRecipeSha256: game.wallRecipeSha256,
    initialStateSha256: game.initialStateSha256,
    transitions: game.transitions,
    traceHash: game.traceHash,
    terminalStateSha256: game.terminalStateSha256,
    terminalDelta: game.terminalDelta,
    coverage: game.coverage,
    canonicalActionCounts: game.canonicalActionCounts,
    decisions: game.decisions,
  };
}

function decisionIdentity(decision: Stage8FormalSmokeDecisionLedger): unknown {
  const { decisionSha256: _decisionSha256, ...payload } = decision;
  return payload;
}

export function hashStage8FormalSmokeDecisionLedger(decision: Stage8FormalSmokeDecisionLedger): string {
  return hashStage8OfflineIdentity(decisionIdentity(decision));
}

export function hashStage8FormalSmokeGameSemanticResult(game: Stage8FormalSmokeGameLedger): string {
  return hashStage8OfflineIdentity(semanticGameIdentity(game));
}

export function hashStage8FormalSmokeSemanticResults(games: readonly Stage8FormalSmokeGameLedger[]): string {
  return hashStage8OfflineIdentity(games.slice().sort((left, right) => left.gameIndex - right.gameIndex).map(semanticGameIdentity));
}

/** Executes one in-memory fixed-seed game through the published canonical trajectory true source. */
export async function executeStage8FormalSmokeGame(input: {
  plan: Stage8FixedCurriculumPlan;
  game: Stage8FixedCourseGamePlan;
  assignment: Stage8FormalSmokeAssignment;
  smokeControl: Stage8OfflineSmokeControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  rawDistributionProvider: Stage8OfflineRawDistributionProvider;
  providerIdentitySha256: string;
}): Promise<Stage8FormalSmokeGameResult> {
  const initialState = createStage8FormalSmokeInitialState(input.game);
  const initialStateSha256 = hashStage8OfflineIdentity(initialState);
  let cursor = createStage8OfflineSelfplayCursor(initialState);
  const canonicalActionCounts: Record<string, number> = {};
  const decisions: Stage8FormalSmokeDecisionLedger[] = [];
  for (let decision = 0; decision < STAGE8_FORMAL_SMOKE_MAX_TRANSITIONS_PER_GAME && cursor.state.phase !== 'ended'; decision += 1) {
    const integrity = inventoryError(cursor.state);
    if (integrity) return { ok: false, reason: integrity, gameId: input.game.gameId, isolationId: `${input.game.gameId}-isolation` };
    const traceStepBefore = cursor.traceStep;
    const next = await executeStage8OfflineSelfplayDecision({
      cursor,
      plan: input.plan,
      game: input.game,
      smokeControl: input.smokeControl,
      artifactRoot: input.artifactRoot,
      rawDistributionProvider: input.rawDistributionProvider,
      providerIdentitySha256: input.providerIdentitySha256,
    });
    if (!next.ok) return { ok: false, reason: next.reason, gameId: input.game.gameId, isolationId: next.isolationId };
    if (next.evidence) {
      next.evidence.records.forEach((record) => { canonicalActionCounts[record.actionType] = (canonicalActionCounts[record.actionType] || 0) + 1; });
      const evidence = next.evidence;
      const baseDecision = {
        traceStepBefore,
        decisionIdentitySha256: evidence.decisionIdentitySha256,
        visibleStateSha256: evidence.visibleStateSha256,
        episodeContextSha256: evidence.episodeContextSha256,
        legalActionSetSha256: evidence.behavior.legalActionSetSha256,
        legalActionKeys: evidence.behavior.legalActionKeys.slice(),
        canonicalActions: structuredClone(evidence.behavior.legalActions),
        mctsDistribution: { ...evidence.behavior.mctsDistribution },
        rawDistributionEvidence: structuredClone(evidence.behavior.rawDistributionEvidence),
        behaviorActionDistribution: { ...evidence.behavior.behaviorActionDistribution },
        selectedActionKey: evidence.behavior.selectedActionKey,
        selectedAction: structuredClone(evidence.behavior.selectedAction),
        behaviorActionProbability: evidence.behavior.behaviorActionProbability,
        behaviorActionSource: evidence.behavior.behaviorActionSource,
        exploration: evidence.behavior.exploration,
        records: structuredClone(evidence.records),
        publicEventSha256: evidence.publicEventSha256,
      };
      decisions.push({ ...baseDecision, decisionSha256: hashStage8OfflineIdentity(baseDecision) });
    }
    cursor = next.cursor;
  }
  if (cursor.state.phase !== 'ended') return { ok: false, reason: 'formal-smoke-transition-limit-exceeded', gameId: input.game.gameId, isolationId: `${input.game.gameId}-isolation` };
  const integrity = inventoryError(cursor.state);
  if (integrity) return { ok: false, reason: integrity, gameId: input.game.gameId, isolationId: `${input.game.gameId}-isolation` };
  const terminalDelta = cursor.state.scores.slice() as [number, number, number, number];
  const terminalStateSha256 = hashStage8OfflineIdentity(cursor.state);
  const base = {
    gameIndex: input.game.gameIndex,
    gameId: input.game.gameId,
    fixedSeed: input.game.fixedSeed,
    candidateSeat: input.game.candidateSeat,
    scenario: input.game.scenario,
    dealerSeat: input.game.dealerSeat,
    leadDiscardTile: input.game.leadDiscardTile,
    wallRecipeSha256: input.game.wallRecipeSha256,
    initialStateSha256,
    batchIndex: input.assignment.batchIndex,
    workerSlot: input.assignment.workerSlot,
    transitions: cursor.traceStep,
    traceHash: cursor.traceHash,
    terminalStateSha256,
    terminalDelta,
    coverage: cursor.coverage,
    canonicalActionCounts,
    decisions,
  };
  return { ok: true, ledger: { ...base, semanticResultSha256: hashStage8FormalSmokeGameSemanticResult({ ...base, semanticResultSha256: '' }) } };
}

function addCoverage(target: Stage8OfflineActionCoverage, source: Stage8OfflineActionCoverage): void {
  for (const scenario of ['forcedRunKong', 'zhichan', 'chainKong'] as const) {
    target[scenario].legalOpportunities += source[scenario].legalOpportunities;
    target[scenario].positiveBehavior += source[scenario].positiveBehavior;
    target[scenario].selected += source[scenario].selected;
  }
}

function validDistribution(keys: readonly string[], distribution: Readonly<Record<string, number>>): boolean {
  const actual = Object.keys(distribution).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) return false;
  const values = expected.map((key) => distribution[key]);
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 1e-12;
}

function validDecision(
  decision: Stage8FormalSmokeDecisionLedger,
  providerIdentitySha256: string,
  modelIdentity: Stage8FrozenModelIdentityPackage,
): boolean {
  const sortedKeys = decision.legalActionKeys.slice().sort();
  const canonicalKeys = decision.canonicalActions.map(stage8CanonicalActionKey).sort();
  const rawEvidencePayloadMatches = Boolean(decision.rawDistributionEvidence)
    && validateStage8OfflineRawDistributionEvidenceEnvelope({
      evidence: decision.rawDistributionEvidence,
      providerIdentitySha256,
      distribution: decision.mctsDistribution,
    });
  const modelInference = decision.rawDistributionEvidence?.details
    && typeof decision.rawDistributionEvidence.details === 'object'
    && !Array.isArray(decision.rawDistributionEvidence.details)
    ? (decision.rawDistributionEvidence.details as { modelInference?: Stage8FrozenModelInferenceEvidence }).modelInference
    : undefined;
  return Number.isInteger(decision.traceStepBefore)
    && decision.traceStepBefore >= 0
    && /^[a-f0-9]{64}$/i.test(decision.decisionIdentitySha256)
    && /^[a-f0-9]{64}$/i.test(decision.visibleStateSha256)
    && /^[a-f0-9]{64}$/i.test(decision.episodeContextSha256)
    && /^[a-f0-9]{64}$/i.test(decision.legalActionSetSha256)
    && /^[a-f0-9]{64}$/i.test(decision.publicEventSha256)
    && decision.legalActionKeys.length > 0
    && new Set(sortedKeys).size === sortedKeys.length
    && decision.canonicalActions.length === decision.legalActionKeys.length
    && canonicalKeys.every((key, index) => key === sortedKeys[index])
    && decision.legalActionSetSha256 === hashStage8OfflineIdentity(sortedKeys)
    && validDistribution(decision.legalActionKeys, decision.mctsDistribution)
    && Boolean(rawEvidencePayloadMatches)
    && Boolean(modelInference && validateStage8FrozenModelInferenceEvidence(modelInference, decision.legalActionKeys))
    && modelInference?.modelId === modelIdentity.modelId
    && modelInference?.modelFileSha256 === modelIdentity.modelFileSha256
    && modelInference?.onnxBinarySha256 === modelIdentity.onnxBinarySha256
    && modelInference?.modelManifestSha256 === modelIdentity.modelManifestSha256
    && modelInference?.inferenceContractSha256 === modelIdentity.inferenceContractSha256
    && modelInference?.visibleStateSha256 === decision.visibleStateSha256
    && modelInference?.legalActionSetSha256 === decision.legalActionSetSha256
    && validDistribution(decision.legalActionKeys, decision.behaviorActionDistribution)
    && decision.legalActionKeys.includes(decision.selectedActionKey)
    && stage8CanonicalActionKey(decision.selectedAction) === decision.selectedActionKey
    && Number.isFinite(decision.behaviorActionProbability)
    && decision.behaviorActionProbability === decision.behaviorActionDistribution[decision.selectedActionKey]
    && decision.exploration === (decision.behaviorActionSource === 'curriculum-exploration')
    && decision.records.length > 0
    && decision.decisionSha256 === hashStage8FormalSmokeDecisionLedger(decision);
}

function actionMatchesScenario(actionType: string, scenario: Stage8FixedCourseGamePlan['scenario']): boolean {
  if (scenario === 'zhichan') return actionType === 'directChisel';
  if (scenario === 'chainKong') return actionType === 'chainKong';
  return ['forcedRunImmediate', 'forcedRunDeferred', 'forcedRunConcealed', 'doublePongForcedRun'].includes(actionType);
}

/** Recomputes coverage only from the candidate seat's recorded canonical legal sets. */
export function deriveStage8FormalSmokeGameCoverage(
  candidateSeat: number,
  decisions: readonly Stage8FormalSmokeDecisionLedger[],
): Stage8OfflineActionCoverage {
  const coverage = emptyCoverage();
  for (const decision of decisions) {
    if (decision.selectedAction.context.actor !== candidateSeat) continue;
    for (const scenario of ['forcedRunKong', 'zhichan', 'chainKong'] as const) {
      const matching = decision.canonicalActions.filter((action) => actionMatchesScenario(action.actionType, scenario));
      if (!matching.length) continue;
      coverage[scenario].legalOpportunities += 1;
      const keys = matching.map(stage8CanonicalActionKey);
      if (keys.reduce((sum, key) => sum + (decision.behaviorActionDistribution[key] || 0), 0) > 0) coverage[scenario].positiveBehavior += 1;
      if (actionMatchesScenario(decision.selectedAction.actionType, scenario)) coverage[scenario].selected += 1;
    }
  }
  return coverage;
}

function modelIdentityMatchesControl(model: Stage8FrozenModelIdentityPackage, control: Stage8OfflineSmokeControlManifest): boolean {
  const identity = control.identity;
  return validateStage8FrozenModelIdentityPackage(model)
    && model.modelFileSha256 === identity.modelFileSha256
    && model.onnxBinarySha256 === identity.onnxBinarySha256
    && model.modelManifestSha256 === identity.modelManifestSha256
    && model.rulesSha256 === identity.rulesSha256
    && model.actionSpaceSha256 === identity.actionSpaceSha256
    && model.legalActionMaskSha256 === identity.legalActionMaskSha256
    && model.featureSha256 === identity.featureSha256
    && model.visibleInformationSha256 === identity.visibleInformationSha256
    && model.versionedModelUri === identity.versionedModelUri
    && model.inferenceContractSha256 === hashStage8FrozenModelInferenceContract();
}

function gameEvidenceError(input: {
  game: Stage8FormalSmokeGameLedger;
  planned: Stage8FixedCourseGamePlan | undefined;
  assignment: Stage8FormalSmokeAssignment | undefined;
  providerIdentitySha256: string;
  modelIdentity: Stage8FrozenModelIdentityPackage;
}): string | null {
  const { game, planned, assignment } = input;
  if (!planned || !assignment) return 'formal-smoke-ledger-game-index-invalid';
  if (game.gameId !== planned.gameId || game.fixedSeed !== planned.fixedSeed || game.candidateSeat !== planned.candidateSeat
    || game.scenario !== planned.scenario || game.dealerSeat !== planned.dealerSeat || game.leadDiscardTile !== planned.leadDiscardTile
    || game.wallRecipeSha256 !== planned.wallRecipeSha256 || game.batchIndex !== assignment.batchIndex || game.workerSlot !== assignment.workerSlot) {
    return 'formal-smoke-ledger-plan-identity-mismatch';
  }
  let expectedInitialStateSha256: string;
  try {
    expectedInitialStateSha256 = hashStage8OfflineIdentity(createStage8FormalSmokeInitialState(planned));
  } catch {
    return 'formal-smoke-ledger-wall-recipe-invalid';
  }
  const derivedCoverage = deriveStage8FormalSmokeGameCoverage(game.candidateSeat, game.decisions);
  if (game.initialStateSha256 !== expectedInitialStateSha256
    || hashStage8OfflineIdentity(game.coverage) !== hashStage8OfflineIdentity(derivedCoverage)
    || !Number.isInteger(game.transitions) || game.transitions < 1 || game.transitions > STAGE8_FORMAL_SMOKE_MAX_TRANSITIONS_PER_GAME
    || !/^[a-f0-9]{64}$/i.test(game.traceHash) || !/^[a-f0-9]{64}$/i.test(game.terminalStateSha256)
    || game.terminalDelta.length !== 4 || !game.terminalDelta.every(Number.isFinite)
    || game.terminalDelta.reduce((sum, value) => sum + value, 0) !== 0 || !game.decisions.length
    || !game.decisions.every((decision) => validDecision(decision, input.providerIdentitySha256, input.modelIdentity))
    || game.semanticResultSha256 !== hashStage8FormalSmokeGameSemanticResult(game)) return 'formal-smoke-ledger-game-evidence-invalid';
  return null;
}

function batchIdentity(batch: Stage8FormalSmokeBatchLedger): unknown {
  const { batchSha256: _batchSha256, ...payload } = batch;
  return payload;
}

export function hashStage8FormalSmokeBatchLedger(batch: Stage8FormalSmokeBatchLedger): string {
  return hashStage8OfflineIdentity(batchIdentity(batch));
}

/** Builds one immutable, hash-chained batch from actual game ledgers. */
export function assembleStage8FormalSmokeBatchLedger(input: {
  control: Stage8OfflineSmokeControlManifest;
  runtime: Stage8FormalSmokeRuntimeManifest;
  modelIdentity: Stage8FrozenModelIdentityPackage;
  plan: Stage8FixedCurriculumPlan;
  batchIndex: number;
  previousBatchSha256: string | null;
  games: Stage8FormalSmokeGameLedger[];
}): { ok: true; ledger: Stage8FormalSmokeBatchLedger } | { ok: false; reason: string } {
  if (!modelIdentityMatchesControl(input.modelIdentity, input.control)) return { ok: false, reason: 'formal-smoke-batch-model-identity-mismatch' };
  const assignments = createStage8FormalSmokeAssignments(input.plan, input.runtime.batchSize, input.runtime.workers);
  const expectedAssignments = assignments.filter((assignment) => assignment.batchIndex === input.batchIndex);
  const games = input.games.slice().sort((left, right) => left.gameIndex - right.gameIndex);
  if (!expectedAssignments.length || games.length !== expectedAssignments.length) return { ok: false, reason: 'formal-smoke-batch-size-invalid' };
  const seen = new Set<number>();
  for (const game of games) {
    if (seen.has(game.gameIndex)) return { ok: false, reason: 'formal-smoke-batch-game-duplicate' };
    seen.add(game.gameIndex);
    const error = gameEvidenceError({
      game,
      planned: input.plan.games[game.gameIndex],
      assignment: assignments[game.gameIndex],
      providerIdentitySha256: input.control.identity.mctsProviderSha256,
      modelIdentity: input.modelIdentity,
    });
    if (error) return { ok: false, reason: error };
    if (game.batchIndex !== input.batchIndex) return { ok: false, reason: 'formal-smoke-batch-index-mismatch' };
  }
  if (expectedAssignments.some((assignment, index) => assignment.gameIndex !== games[index].gameIndex)) return { ok: false, reason: 'formal-smoke-batch-game-range-invalid' };
  if (input.previousBatchSha256 !== null && !/^[a-f0-9]{64}$/i.test(input.previousBatchSha256)) return { ok: false, reason: 'formal-smoke-batch-previous-identity-invalid' };
  const base: Omit<Stage8FormalSmokeBatchLedger, 'batchSha256'> = {
    version: STAGE8_FORMAL_SMOKE_RUNNER_VERSION,
    runId: input.control.identity.runId,
    batchIndex: input.batchIndex,
    previousBatchSha256: input.previousBatchSha256,
    controlManifestSha256: input.control.manifestSha256,
    runtimeManifestSha256: input.runtime.manifestSha256,
    providerIdentitySha256: input.control.identity.mctsProviderSha256,
    providerSourceBundleSha256: input.runtime.providerSourceBundleSha256,
    runtimeSourceBundleSha256: input.runtime.runtimeSourceBundleSha256,
    modelId: input.modelIdentity.modelId,
    modelFileSha256: input.modelIdentity.modelFileSha256,
    onnxBinarySha256: input.modelIdentity.onnxBinarySha256,
    modelManifestSha256: input.modelIdentity.modelManifestSha256,
    modelIdentitySha256: hashStage8OfflineIdentity(input.modelIdentity),
    fixedCurriculumSelfplayFingerprint: input.runtime.fixedCurriculumSelfplayFingerprint,
    planSha256: input.plan.planSha256,
    curriculumOverride: input.runtime.curriculumOverride,
    behaviorTemperature: input.runtime.behaviorTemperature,
    workers: input.runtime.workers,
    firstGameIndex: games[0].gameIndex,
    lastGameIndex: games.at(-1)!.gameIndex,
    fixedSeeds: games.map((game) => game.fixedSeed),
    completedGames: games.length,
    semanticResultsSha256: hashStage8FormalSmokeSemanticResults(games),
    games,
  };
  return { ok: true, ledger: { ...base, batchSha256: hashStage8OfflineIdentity(base) } };
}

/** Builds the immutable ledger only after all 1000 indexed game results are present and valid. */
export function assembleStage8FormalSmokeLedger(input: {
  control: Stage8OfflineSmokeControlManifest;
  runtime: Stage8FormalSmokeRuntimeManifest;
  modelIdentity: Stage8FrozenModelIdentityPackage;
  plan: Stage8FixedCurriculumPlan;
  batches: Stage8FormalSmokeBatchLedger[];
}): { ok: true; ledger: Stage8FormalSmokeLedger } | { ok: false; reason: string } {
  const controlIdentity = input.control.identity;
  if (!modelIdentityMatchesControl(input.modelIdentity, input.control)) return { ok: false, reason: 'formal-smoke-ledger-model-identity-mismatch' };
  const expectedBatchCount = Math.ceil(input.plan.games.length / input.runtime.batchSize);
  const batches = input.batches.slice().sort((left, right) => left.batchIndex - right.batchIndex);
  if (batches.length !== expectedBatchCount) return { ok: false, reason: 'formal-smoke-ledger-batch-count-invalid' };
  let previousBatchSha256: string | null = null;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    if (batch.batchIndex !== index || batch.previousBatchSha256 !== previousBatchSha256
      || batch.batchSha256 !== hashStage8FormalSmokeBatchLedger(batch)
      || batch.controlManifestSha256 !== input.control.manifestSha256
      || batch.runtimeManifestSha256 !== input.runtime.manifestSha256
      || batch.providerIdentitySha256 !== controlIdentity.mctsProviderSha256
      || batch.providerSourceBundleSha256 !== input.runtime.providerSourceBundleSha256
      || batch.runtimeSourceBundleSha256 !== input.runtime.runtimeSourceBundleSha256
      || batch.modelId !== input.modelIdentity.modelId
      || batch.modelFileSha256 !== input.modelIdentity.modelFileSha256
      || batch.onnxBinarySha256 !== input.modelIdentity.onnxBinarySha256
      || batch.modelManifestSha256 !== input.modelIdentity.modelManifestSha256
      || batch.modelIdentitySha256 !== hashStage8OfflineIdentity(input.modelIdentity)
      || batch.fixedCurriculumSelfplayFingerprint !== input.runtime.fixedCurriculumSelfplayFingerprint
      || batch.planSha256 !== input.plan.planSha256 || batch.curriculumOverride !== input.runtime.curriculumOverride
      || batch.behaviorTemperature !== input.runtime.behaviorTemperature || batch.workers !== input.runtime.workers) return { ok: false, reason: 'formal-smoke-ledger-batch-chain-invalid' };
    const rebuilt = assembleStage8FormalSmokeBatchLedger({ control: input.control, runtime: input.runtime, modelIdentity: input.modelIdentity, plan: input.plan, batchIndex: index, previousBatchSha256, games: batch.games });
    if (!rebuilt.ok || rebuilt.ledger.batchSha256 !== batch.batchSha256) return { ok: false, reason: rebuilt.ok ? 'formal-smoke-ledger-batch-content-invalid' : rebuilt.reason };
    previousBatchSha256 = batch.batchSha256;
  }
  const games = batches.flatMap((batch) => batch.games).sort((left, right) => left.gameIndex - right.gameIndex);
  if (games.length !== 1000) return { ok: false, reason: 'formal-smoke-ledger-game-count-invalid' };
  const assignments = createStage8FormalSmokeAssignments(input.plan, input.runtime.batchSize, input.runtime.workers);
  const seen = new Set<number>();
  const byCandidateSeat = [emptyCoverage(), emptyCoverage(), emptyCoverage(), emptyCoverage()] as Stage8OfflineSmokeCoverageLedger['byCandidateSeat'];
  const candidateSeatGames = [0, 0, 0, 0] as [number, number, number, number];
  for (const game of games) {
    const planned = input.plan.games[game.gameIndex];
    const assignment = assignments[game.gameIndex];
    if (!planned || !assignment || seen.has(game.gameIndex)) return { ok: false, reason: 'formal-smoke-ledger-game-index-invalid' };
    seen.add(game.gameIndex);
    const error = gameEvidenceError({ game, planned, assignment, providerIdentitySha256: controlIdentity.mctsProviderSha256, modelIdentity: input.modelIdentity });
    if (error) return { ok: false, reason: error };
    candidateSeatGames[game.candidateSeat] += 1;
    addCoverage(byCandidateSeat[game.candidateSeat], game.coverage);
  }
  const coverage: Stage8OfflineSmokeCoverageLedger = { completedGames: 1000, candidateSeatGames, byCandidateSeat };
  const coverageDecision = evaluateStage8OfflineSmokeCoverage(coverage);
  if (!coverageDecision.ok) return { ok: false, reason: coverageDecision.reason };
  if (candidateSeatGames.some((count) => count !== 250)) return { ok: false, reason: 'formal-smoke-ledger-seat-balance-invalid' };
  const base = {
    version: STAGE8_FORMAL_SMOKE_RUNNER_VERSION as typeof STAGE8_FORMAL_SMOKE_RUNNER_VERSION,
    runId: input.control.identity.runId,
    controlManifestSha256: input.control.manifestSha256,
    runtimeManifestSha256: input.runtime.manifestSha256,
    providerIdentitySha256: controlIdentity.mctsProviderSha256,
    modelIdentitySha256: hashStage8OfflineIdentity(input.modelIdentity),
    fixedCurriculumSelfplayFingerprint: input.runtime.fixedCurriculumSelfplayFingerprint,
    planSha256: input.plan.planSha256,
    baseSeed: input.plan.baseSeed,
    batchSize: input.runtime.batchSize,
    workers: input.runtime.workers,
    completedGames: 1000 as const,
    candidateSeatGames: candidateSeatGames as [250, 250, 250, 250],
    coverage,
    semanticResultsSha256: hashStage8FormalSmokeSemanticResults(games),
    batchLedgerSha256s: batches.map((batch) => batch.batchSha256),
    lastBatchSha256: previousBatchSha256!,
    games,
    hardAnomalies: 0 as const,
    fusedGames: 0 as const,
    quarantinedGames: 0 as const,
  };
  return { ok: true, ledger: { ...base, ledgerSha256: hashStage8OfflineIdentity(base) } };
}

function quarantinePayload(runId: string, reason: string, completedGames: Stage8FormalSmokeGameLedger[], batches: readonly Stage8FormalSmokeBatchLedger[]): string {
  const payload = {
    version: STAGE8_FORMAL_SMOKE_RUNNER_VERSION,
    runId,
    status: 'quarantined',
    reason,
    completedGameCount: completedGames.length,
    completedSemanticResultsSha256: hashStage8FormalSmokeSemanticResults(completedGames),
    committedBatchSha256s: batches.map((batch) => batch.batchSha256),
  };
  return JSON.stringify({ ...payload, quarantineSha256: hashStage8OfflineIdentity(payload) }, null, 2);
}

function capacityError(writer: Stage8FormalSmokeWriter, pendingBytes: number): string | null {
  try {
    return validateStage8FormalSmokeCapacity({
      snapshot: writer.inspectCapacity(),
      pendingBytes,
      maxRunBytes: STAGE8_OFFLINE_SMOKE_MAX_RUN_BYTES,
      maxVolumeUsedRatio: STAGE8_OFFLINE_SMOKE_MAX_VOLUME_USED_RATIO,
    });
  } catch {
    return 'formal-smoke-capacity-inspection-failed';
  }
}

function batchFileName(batchIndex: number): string {
  return `smoke-batch-${String(batchIndex + 1).padStart(4, '0')}.json`;
}

/** Runs only after complete preflight; absent identities return before any writer call. */
export async function runStage8FormalSmoke(input: {
  control: Stage8OfflineSmokeControlManifest;
  runtime: Stage8FormalSmokeRuntimeManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  fileSystem: Stage8SmokeRuntimeFileSystem;
  rawDistributionProvider: Stage8OfflineRawDistributionProvider;
  writer: Stage8FormalSmokeWriter;
}): Promise<Stage8FormalSmokeRunResult> {
  const preflight = preflightStage8FormalSmokeRuntime({ control: input.control, runtime: input.runtime, artifactRoot: input.artifactRoot, fileSystem: input.fileSystem });
  if (!preflight.ok) return { ok: false, status: 'fused', reason: preflight.decision.reason, isolationId: preflight.decision.isolationId, artifactsWritten: 0 };
  const plan = createStage8FixedCurriculumPlan(input.runtime.baseSeed);
  if (plan.planSha256 !== input.control.identity.seedPlanSha256) return { ok: false, status: 'fused', reason: 'formal-smoke-seed-plan-control-mismatch', isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten: 0 };
  const assignments = createStage8FormalSmokeAssignments(plan, input.runtime.batchSize, input.runtime.workers);
  const initialCapacityError = capacityError(input.writer, 0);
  if (initialCapacityError) return { ok: false, status: 'fused', reason: initialCapacityError, isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten: 0 };
  const completed: Stage8FormalSmokeGameLedger[] = [];
  const batches: Stage8FormalSmokeBatchLedger[] = [];
  let previousBatchSha256: string | null = null;
  let artifactsWritten = 0;
  const writeQuarantine = (reason: string): Stage8FormalSmokeRunResult => {
    const content = quarantinePayload(input.control.identity.runId, reason, completed, batches);
    const pendingBytes = Buffer.byteLength(content, 'utf8');
    const error = capacityError(input.writer, pendingBytes);
    if (error) return { ok: false, status: 'fused', reason, isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten };
    try {
      input.writer.writeImmutable('smoke-quarantine.json', content);
      return { ok: false, status: 'fused', reason, isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten: artifactsWritten + 1 };
    } catch {
      return { ok: false, status: 'fused', reason: 'formal-smoke-quarantine-write-failed', isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten };
    }
  };
  const batchCount = Math.ceil(assignments.length / input.runtime.batchSize);
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const currentAssignments = assignments.filter((assignment) => assignment.batchIndex === batchIndex);
    const lanes = Array.from({ length: input.runtime.workers }, (_, workerSlot) => currentAssignments.filter((assignment) => assignment.workerSlot === workerSlot));
    const results: Stage8FormalSmokeGameResult[] = [];
    await Promise.all(lanes.map(async (lane) => {
      for (const assignment of lane) {
        const game = plan.games[assignment.gameIndex];
        results.push(await executeStage8FormalSmokeGame({ plan, game, assignment, smokeControl: input.control, artifactRoot: input.artifactRoot, rawDistributionProvider: input.rawDistributionProvider, providerIdentitySha256: input.control.identity.mctsProviderSha256 }));
        await Promise.resolve();
      }
    }));
    const failure = results.find((result): result is Extract<Stage8FormalSmokeGameResult, { ok: false }> => !result.ok);
    if (failure) return writeQuarantine(failure.reason);
    const games = results.filter((result): result is Extract<Stage8FormalSmokeGameResult, { ok: true }> => result.ok).map((result) => result.ledger).sort((left, right) => left.gameIndex - right.gameIndex);
    const assembledBatch = assembleStage8FormalSmokeBatchLedger({ control: input.control, runtime: input.runtime, modelIdentity: preflight.value.modelIdentity, plan, batchIndex, previousBatchSha256, games });
    if (!assembledBatch.ok) return writeQuarantine(assembledBatch.reason);
    const content = JSON.stringify(assembledBatch.ledger, null, 2);
    const error = capacityError(input.writer, Buffer.byteLength(content, 'utf8'));
    if (error) return writeQuarantine(error);
    try {
      input.writer.writeImmutable(batchFileName(batchIndex), content);
    } catch {
      return writeQuarantine('formal-smoke-batch-write-failed');
    }
    artifactsWritten += 1;
    batches.push(assembledBatch.ledger);
    completed.push(...games);
    previousBatchSha256 = assembledBatch.ledger.batchSha256;
  }
  const assembled = assembleStage8FormalSmokeLedger({ control: input.control, runtime: input.runtime, modelIdentity: preflight.value.modelIdentity, plan, batches });
  if (!assembled.ok) return writeQuarantine(assembled.reason);
  const ledgerContent = JSON.stringify(assembled.ledger, null, 2);
  const finalCapacityError = capacityError(input.writer, Buffer.byteLength(ledgerContent, 'utf8'));
  if (finalCapacityError) return writeQuarantine(finalCapacityError);
  try {
    input.writer.writeImmutable('smoke-ledger.json', ledgerContent);
  } catch {
    return { ok: false, status: 'fused', reason: 'formal-smoke-ledger-write-failed', isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten };
  }
  return { ok: true, status: 'completed', ledger: assembled.ledger, artifactsWritten: artifactsWritten + 1 };
}
