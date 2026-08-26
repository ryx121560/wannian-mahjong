import type { GameState, Tile } from '../rules';
import { STAGE8_V2_TILE_KEYS } from './action-registry-v2';
import type { Stage8ArtifactRootPreflightInput } from './artifact-root-preflight';
import type { Stage8OfflineRawDistributionProvider } from './offline-behavior-distribution';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import {
  createStage8FixedCurriculumPlan,
  validateStage8FixedCurriculumPlan,
  type Stage8FixedCourseGamePlan,
  type Stage8FixedCurriculumPlan,
} from './offline-curriculum-kong-zhichan-chain';
import { hashStage8OfflineIdentity, stage8CanonicalActionKey } from './offline-action-identity';
import {
  createStage8OfflineSelfplayCursor,
  evaluateStage8OfflineSmokeCoverage,
  executeStage8OfflineSelfplayDecision,
  type Stage8OfflineActionCoverage,
  type Stage8OfflineSmokeCoverageLedger,
} from './offline-selfplay-engine';
import type { Stage8OfflineSmokeControlManifest } from './offline-selfplay-control';
import type { Stage8OfflineTrajectoryRecord } from './offline-trajectory-executor';
import {
  preflightStage8FormalSmokeRuntime,
  type Stage8FormalSmokeRuntimeManifest,
  type Stage8SmokeRuntimeFileSystem,
} from './offline-smoke-runtime-preflight';

export const STAGE8_FORMAL_SMOKE_RUNNER_VERSION = 'stage8-formal-smoke-runner-v1';
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

export interface Stage8FormalSmokeDecisionLedger {
  traceStepBefore: number;
  decisionIdentitySha256: string;
  visibleStateSha256: string;
  episodeContextSha256: string;
  legalActionSetSha256: string;
  legalActionKeys: string[];
  canonicalActions: CanonicalStage8V2Action[];
  mctsDistribution: Record<string, number>;
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
  fixedCurriculumSelfplayFingerprint: string;
  planSha256: string;
  baseSeed: number;
  batchSize: number;
  workers: number;
  completedGames: 1000;
  candidateSeatGames: [250, 250, 250, 250];
  coverage: Stage8OfflineSmokeCoverageLedger;
  semanticResultsSha256: string;
  games: Stage8FormalSmokeGameLedger[];
  hardAnomalies: 0;
  fusedGames: 0;
  quarantinedGames: 0;
  ledgerSha256: string;
}

export interface Stage8FormalSmokeWriter {
  writeImmutable(relativeName: 'smoke-ledger.json' | 'smoke-quarantine.json', content: string): void;
}

export type Stage8FormalSmokeGameResult =
  | { ok: true; ledger: Stage8FormalSmokeGameLedger }
  | { ok: false; reason: string; gameId: string; isolationId: string };

export type Stage8FormalSmokeRunResult =
  | { ok: true; status: 'completed'; ledger: Stage8FormalSmokeLedger; artifactsWritten: 1 }
  | { ok: false; status: 'fused'; reason: string; isolationId: string; artifactsWritten: 0 | 1 };

function emptyCoverage(): Stage8OfflineActionCoverage {
  return {
    forcedRunKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: false },
    zhichan: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: false },
    chainKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: true },
  };
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ state >>> 15, state | 1) + 0x6d2b79f5;
    return (state >>> 0) / 4294967296;
  };
}

function createWall(seed: number): Tile[] {
  const wall = STAGE8_V2_TILE_KEYS.flatMap((tile) => [tile, tile, tile, tile]);
  const next = random(seed);
  for (let index = wall.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [wall[index], wall[swap]] = [wall[swap], wall[index]];
  }
  return wall;
}

/** Creates one complete 136-tile round; it has no I/O or hidden policy projection. */
export function createStage8FormalSmokeInitialState(seed: number): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('formal-smoke-seed-invalid');
  const wallTiles = createWall(seed);
  const players = Array.from({ length: 4 }, () => ({ hand: [] as Tile[], melds: [], score: 0 }));
  for (const player of players) {
    for (let index = 0; index < 13; index += 1) player.hand.push(wallTiles.pop()!);
  }
  players[0].hand.push(wallTiles.pop()!);
  return {
    phase: 'discarding',
    currentPlayer: 0,
    newDrawnTile: players[0].hand.at(-1),
    players,
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    turn: 0,
    dealer: 0,
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
    return { gameIndex: game.gameIndex, gameId: game.gameId, fixedSeed: game.fixedSeed, batchIndex, workerSlot: batchIndex % workers };
  });
}

function semanticGameIdentity(game: Stage8FormalSmokeGameLedger): unknown {
  return {
    gameIndex: game.gameIndex,
    gameId: game.gameId,
    fixedSeed: game.fixedSeed,
    candidateSeat: game.candidateSeat,
    scenario: game.scenario,
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
export function executeStage8FormalSmokeGame(input: {
  plan: Stage8FixedCurriculumPlan;
  game: Stage8FixedCourseGamePlan;
  assignment: Stage8FormalSmokeAssignment;
  smokeControl: Stage8OfflineSmokeControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  rawDistributionProvider: Stage8OfflineRawDistributionProvider;
  providerIdentitySha256: string;
}): Stage8FormalSmokeGameResult {
  let cursor = createStage8OfflineSelfplayCursor(createStage8FormalSmokeInitialState(input.game.fixedSeed));
  const canonicalActionCounts: Record<string, number> = {};
  const decisions: Stage8FormalSmokeDecisionLedger[] = [];
  for (let decision = 0; decision < STAGE8_FORMAL_SMOKE_MAX_TRANSITIONS_PER_GAME && cursor.state.phase !== 'ended'; decision += 1) {
    const integrity = inventoryError(cursor.state);
    if (integrity) return { ok: false, reason: integrity, gameId: input.game.gameId, isolationId: `${input.game.gameId}-isolation` };
    const traceStepBefore = cursor.traceStep;
    const next = executeStage8OfflineSelfplayDecision({
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

function validDecision(decision: Stage8FormalSmokeDecisionLedger): boolean {
  const sortedKeys = decision.legalActionKeys.slice().sort();
  const canonicalKeys = decision.canonicalActions.map(stage8CanonicalActionKey).sort();
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
    && validDistribution(decision.legalActionKeys, decision.behaviorActionDistribution)
    && decision.legalActionKeys.includes(decision.selectedActionKey)
    && stage8CanonicalActionKey(decision.selectedAction) === decision.selectedActionKey
    && Number.isFinite(decision.behaviorActionProbability)
    && decision.behaviorActionProbability === decision.behaviorActionDistribution[decision.selectedActionKey]
    && decision.exploration === (decision.behaviorActionSource === 'curriculum-exploration')
    && decision.records.length > 0
    && decision.decisionSha256 === hashStage8FormalSmokeDecisionLedger(decision);
}

/** Builds the immutable ledger only after all 1000 indexed game results are present and valid. */
export function assembleStage8FormalSmokeLedger(input: {
  control: Stage8OfflineSmokeControlManifest;
  runtime: Stage8FormalSmokeRuntimeManifest;
  plan: Stage8FixedCurriculumPlan;
  games: Stage8FormalSmokeGameLedger[];
}): { ok: true; ledger: Stage8FormalSmokeLedger } | { ok: false; reason: string } {
  if (input.games.length !== 1000) return { ok: false, reason: 'formal-smoke-ledger-game-count-invalid' };
  const games = input.games.slice().sort((left, right) => left.gameIndex - right.gameIndex);
  const assignments = createStage8FormalSmokeAssignments(input.plan, input.runtime.batchSize, input.runtime.workers);
  const seen = new Set<number>();
  const byCandidateSeat = [emptyCoverage(), emptyCoverage(), emptyCoverage(), emptyCoverage()] as Stage8OfflineSmokeCoverageLedger['byCandidateSeat'];
  const candidateSeatGames = [0, 0, 0, 0] as [number, number, number, number];
  for (const game of games) {
    const planned = input.plan.games[game.gameIndex];
    const assignment = assignments[game.gameIndex];
    if (!planned || !assignment || seen.has(game.gameIndex)) return { ok: false, reason: 'formal-smoke-ledger-game-index-invalid' };
    seen.add(game.gameIndex);
    if (game.gameId !== planned.gameId || game.fixedSeed !== planned.fixedSeed || game.candidateSeat !== planned.candidateSeat || game.scenario !== planned.scenario || game.batchIndex !== assignment.batchIndex || game.workerSlot !== assignment.workerSlot) return { ok: false, reason: 'formal-smoke-ledger-plan-identity-mismatch' };
    if (!Number.isInteger(game.transitions) || game.transitions < 1 || game.transitions > STAGE8_FORMAL_SMOKE_MAX_TRANSITIONS_PER_GAME || !/^[a-f0-9]{64}$/i.test(game.traceHash) || !/^[a-f0-9]{64}$/i.test(game.terminalStateSha256) || game.terminalDelta.length !== 4 || !game.terminalDelta.every(Number.isFinite) || game.terminalDelta.reduce((sum, value) => sum + value, 0) !== 0 || !game.decisions.length || !game.decisions.every(validDecision) || game.semanticResultSha256 !== hashStage8FormalSmokeGameSemanticResult(game)) return { ok: false, reason: 'formal-smoke-ledger-game-evidence-invalid' };
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
    fixedCurriculumSelfplayFingerprint: input.runtime.fixedCurriculumSelfplayFingerprint,
    planSha256: input.plan.planSha256,
    baseSeed: input.plan.baseSeed,
    batchSize: input.runtime.batchSize,
    workers: input.runtime.workers,
    completedGames: 1000 as const,
    candidateSeatGames: candidateSeatGames as [250, 250, 250, 250],
    coverage,
    semanticResultsSha256: hashStage8FormalSmokeSemanticResults(games),
    games,
    hardAnomalies: 0 as const,
    fusedGames: 0 as const,
    quarantinedGames: 0 as const,
  };
  return { ok: true, ledger: { ...base, ledgerSha256: hashStage8OfflineIdentity(base) } };
}

function quarantinePayload(runId: string, reason: string, completedGames: Stage8FormalSmokeGameLedger[]): string {
  const payload = {
    version: STAGE8_FORMAL_SMOKE_RUNNER_VERSION,
    runId,
    status: 'quarantined',
    reason,
    completedGameCount: completedGames.length,
    completedSemanticResultsSha256: hashStage8FormalSmokeSemanticResults(completedGames),
  };
  return JSON.stringify({ ...payload, quarantineSha256: hashStage8OfflineIdentity(payload) }, null, 2);
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
  const completed: Stage8FormalSmokeGameLedger[] = [];
  const lanes = Array.from({ length: input.runtime.workers }, (_, workerSlot) => assignments.filter((assignment) => assignment.workerSlot === workerSlot));
  const failures: Array<Extract<Stage8FormalSmokeGameResult, { ok: false }>> = [];
  await Promise.all(lanes.map(async (lane) => {
    for (const assignment of lane) {
      if (failures.length) return;
      const game = plan.games[assignment.gameIndex];
      const result = executeStage8FormalSmokeGame({ plan, game, assignment, smokeControl: input.control, artifactRoot: input.artifactRoot, rawDistributionProvider: input.rawDistributionProvider, providerIdentitySha256: input.control.identity.mctsProviderSha256 });
      if (!result.ok) { failures.push(result); return; }
      completed.push(result.ledger);
      await Promise.resolve();
    }
  }));
  const failure = failures[0];
  if (failure) {
    try {
      input.writer.writeImmutable('smoke-quarantine.json', quarantinePayload(input.control.identity.runId, failure.reason, completed));
      return { ok: false, status: 'fused', reason: failure.reason, isolationId: failure.isolationId, artifactsWritten: 1 };
    } catch {
      return { ok: false, status: 'fused', reason: 'formal-smoke-quarantine-write-failed', isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten: 0 };
    }
  }
  const assembled = assembleStage8FormalSmokeLedger({ control: input.control, runtime: input.runtime, plan, games: completed });
  if (!assembled.ok) {
    try {
      input.writer.writeImmutable('smoke-quarantine.json', quarantinePayload(input.control.identity.runId, assembled.reason, completed));
      return { ok: false, status: 'fused', reason: assembled.reason, isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten: 1 };
    } catch {
      return { ok: false, status: 'fused', reason: 'formal-smoke-quarantine-write-failed', isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten: 0 };
    }
  }
  try {
    input.writer.writeImmutable('smoke-ledger.json', JSON.stringify(assembled.ledger, null, 2));
  } catch {
    return { ok: false, status: 'fused', reason: 'formal-smoke-ledger-write-failed', isolationId: `${input.control.identity.runId}-isolation`, artifactsWritten: 0 };
  }
  return { ok: true, status: 'completed', ledger: assembled.ledger, artifactsWritten: 1 };
}
