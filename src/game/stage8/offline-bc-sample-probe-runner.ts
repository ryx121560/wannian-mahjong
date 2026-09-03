import { transitionRound, type GameState, type RoundPublicEvent, type Tile } from '../rules';
import { STAGE8_V2_TILE_KEYS } from './action-registry-v2';
import {
  hashStage8CanonicalActionSet,
  hashStage8OfflineIdentity,
  stage8CanonicalActionKey,
} from './offline-action-identity';
import {
  advanceStage8OfflineEpisodeContext,
  createStage8OfflineEpisodeContext,
  type Stage8OfflineEpisodeContext,
} from './offline-episode-context';
import {
  deriveStage8OfflineActions,
  executeStage8OfflineCanonicalAction,
  projectStage8OfflineVisibleState,
} from './offline-round-adapter';
import {
  executeStage8OfflineTrajectory,
  hashStage8OfflineLegalActionSet,
  hashStage8OfflineVisibleState,
} from './offline-trajectory-executor';
import {
  evaluateStage8BcTeacher,
  type Stage8BcTeacherEvidence,
  type Stage8BcTeacherResult,
} from './offline-bc-teacher';
import {
  hashStage8BcReplayPayload,
  hashStage8BcSamplePayload,
  STAGE8_BC_SAMPLE_PROTOCOL_VERSION,
  type Stage8BcEpisodeReward,
  type Stage8BcSampleEnvelope,
} from './offline-bc-sample-protocol';
import { hashStage8BcTerminalReward } from './offline-bc-sample-writer';
import {
  deriveStage8BcSampleProbeSeed,
  STAGE8_BC_SAMPLE_PROBE_GAME_COUNT,
  STAGE8_BC_SAMPLE_PROBE_MAX_TRANSITIONS,
  validateStage8BcSampleProbeControl,
  type Stage8BcSampleProbeControlManifest,
} from './offline-bc-sample-probe-control';

export const STAGE8_BC_SAMPLE_PROBE_RUNNER_VERSION = 'stage8-bc-sample-probe-runner-v1';

export interface Stage8BcSampleProbeTransitionLedger {
  transitionIndex: number;
  decisionIndex: number | null;
  actor: number;
  actionKey: string | null;
  actionType: string;
  preStateSha256: string;
  postStateSha256: string;
  publicEventSha256: string;
  settlementSha256: string;
  episodeContextBeforeSha256: string;
  episodeContextAfterSha256: string;
  transitionSha256: string;
}

export interface Stage8BcSampleProbeGameLedger {
  gameIndex: number;
  gameId: string;
  fixedSeed: number;
  candidateSeat: 0 | 1 | 2 | 3;
  workerSlot: 0;
  decisionCount: number;
  transitionCount: number;
  terminalCount: 1;
  endType: 'win' | 'wallExhausted';
  terminalStateSha256: string;
  terminalEventSha256: string;
  terminalSettlementSha256: string;
  terminalDelta: [number, number, number, number];
  traceSha256: string;
  transitions: Stage8BcSampleProbeTransitionLedger[];
  samples: Stage8BcSampleEnvelope[];
  semanticSha256: string;
}

export type Stage8BcSampleProbeGameResult =
  | { ok: true; ledger: Stage8BcSampleProbeGameLedger }
  | { ok: false; decision: { status: 'fused'; reason: string; isolationId: string } };

export type Stage8BcSampleProbeRunResult =
  | {
    ok: true;
    value: {
      status: 'validated-in-memory';
      runId: string;
      gameCount: 4;
      workerCount: 1;
      candidateSeats: [0, 1, 2, 3];
      games: Stage8BcSampleProbeGameLedger[];
      sampleCount: number;
      semanticSha256: string;
      artifactsWritten: 0;
      formalSmokeGamesExecuted: 0;
      trainingStarted: false;
      modelLoaded: false;
    };
  }
  | { ok: false; decision: { status: 'fused'; reason: string; isolationId: string }; artifactsWritten: 0 };

export interface Stage8BcSampleProbeCapacityEvidence {
  ok: boolean;
  stage: 'before-run' | 'before-batch-commit';
  batchIndex: number | null;
  requestedBytes: number;
  availableBytes: number;
  identitySha256: string;
}

export interface Stage8BcSampleProbeTransactionPort {
  capacityPreflight(input: {
    stage: Stage8BcSampleProbeCapacityEvidence['stage'];
    batchIndex: number | null;
    requestedBytes: number;
  }): Stage8BcSampleProbeCapacityEvidence;
  commitBatch(input: { batchIndex: number; game: Stage8BcSampleProbeGameLedger }): { ok: true; artifactSha256: string } | { ok: false; reason: string };
  commitRun(input: { semanticSha256: string; artifactSha256List: string[] }): { ok: true } | { ok: false; reason: string };
  quarantineRun(reason: string): void;
}

export type Stage8BcSampleProbeTransactionResult =
  | { ok: true; status: 'committed'; semanticSha256: string; artifactsWritten: 4; capacityChecks: 5 }
  | { ok: false; status: 'fused'; reason: string; isolationId: string; artifactsWritten: 0 };

type ValidatedProbeRun = Extract<Stage8BcSampleProbeRunResult, { ok: true }>['value'];

interface DecisionDraft {
  visibleState: ReturnType<typeof projectStage8OfflineVisibleState>;
  canonicalActions: ReturnType<typeof deriveStage8OfflineActions>;
  teacherEvidence: Stage8BcTeacherEvidence;
  selectedActionKey: string;
  traceStep: number;
  preStateSha256: string;
  postStateSha256: string;
  publicEventSha256: string;
  episodeContextSha256: string;
}

export type Stage8BcSampleProbeTeacherEvaluator = (input: Parameters<typeof evaluateStage8BcTeacher>[0]) => Stage8BcTeacherResult;

function fail(runId: string, reason: string): Stage8BcSampleProbeRunResult {
  return {
    ok: false,
    decision: { status: 'fused', reason, isolationId: `${runId || 'invalid-bc-probe-run'}-isolation` },
    artifactsWritten: 0,
  };
}

function gameFail(gameId: string, reason: string): Stage8BcSampleProbeGameResult {
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${gameId}-isolation` } };
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

/** Creates the same complete 136-tile initial round without policy or file I/O. */
export function createStage8BcSampleProbeInitialState(seed: number): GameState {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('bc-probe-seed-invalid');
  const wallTiles = createWall(seed);
  const players = Array.from({ length: 4 }, () => ({ hand: [] as Tile[], melds: [], score: 0 }));
  for (const player of players) {
    for (let index = 0; index < 13; index += 1) player.hand.push(wallTiles.pop()!);
  }
  players[0].hand.push(wallTiles.pop()!);
  return {
    phase: 'discarding', currentPlayer: 0, newDrawnTile: players[0].hand.at(-1), players,
    melds: [[],[],[],[]], discards: [[],[],[],[]], turn: 0, dealer: 0,
    scores: [0,0,0,0], wallTiles, passRecords: [], kongResources: [],
  };
}

function stateIntegrity(state: GameState): string | null {
  if (!state.players || state.players.length !== 4 || state.melds.length !== 4
    || state.discards.length !== 4 || state.scores.length !== 4) return 'bc-probe-four-player-state-invalid';
  const counts = new Map<Tile, number>();
  const add = (tile: Tile): void => { counts.set(tile, (counts.get(tile) || 0) + 1); };
  state.wallTiles.forEach(add);
  state.players.flatMap((player) => player.hand).forEach(add);
  state.discards.flat().forEach(add);
  state.melds.flat().flatMap((meld) => meld.tiles)
    .filter((tile): tile is Tile => Boolean(tile))
    .forEach(add);
  if ([...counts.values()].reduce((sum, count) => sum + count, 0) !== 136) return 'bc-probe-tile-total-invalid';
  if (STAGE8_V2_TILE_KEYS.some((tile) => counts.get(tile) !== 4)) return 'bc-probe-tile-multiplicity-invalid';
  if (!state.scores.every(Number.isFinite) || Math.abs(state.scores.reduce((sum, score) => sum + score, 0)) > 1e-12) {
    return 'bc-probe-score-invariant-invalid';
  }
  if (state.players.some((player, index) => player.score != null && player.score !== state.scores[index])) {
    return 'bc-probe-player-score-mirror-invalid';
  }
  return null;
}

function transitionLedger(input: {
  transitionIndex: number;
  decisionIndex: number | null;
  actor: number;
  actionKey: string | null;
  actionType: string;
  before: GameState;
  after: GameState;
  event: RoundPublicEvent;
  settlement: unknown;
  contextBefore: Stage8OfflineEpisodeContext;
  contextAfter: Stage8OfflineEpisodeContext;
}): Stage8BcSampleProbeTransitionLedger {
  const payload = {
    transitionIndex: input.transitionIndex,
    decisionIndex: input.decisionIndex,
    actor: input.actor,
    actionKey: input.actionKey,
    actionType: input.actionType,
    preStateSha256: hashStage8OfflineIdentity(input.before),
    postStateSha256: hashStage8OfflineIdentity(input.after),
    publicEventSha256: hashStage8OfflineIdentity(input.event),
    settlementSha256: hashStage8OfflineIdentity(input.settlement ?? null),
    episodeContextBeforeSha256: input.contextBefore.identitySha256,
    episodeContextAfterSha256: input.contextAfter.identitySha256,
  };
  return { ...payload, transitionSha256: hashStage8OfflineIdentity(payload) };
}

function buildSamples(input: {
  control: Stage8BcSampleProbeControlManifest;
  gameIndex: number;
  fixedSeed: number;
  terminalDelta: [number, number, number, number];
  decisions: DecisionDraft[];
  sampleOffset: number;
}): Stage8BcSampleEnvelope[] {
  const runId = input.control.identity.runId;
  const episodeId = `${runId}-episode-${String(input.gameIndex + 1).padStart(6, '0')}`;
  const batchId = `${runId}-batch-${String(input.gameIndex + 1).padStart(6, '0')}`;
  const terminalReference = hashStage8BcTerminalReward({ episodeId, terminalDelta: input.terminalDelta });
  return input.decisions.map((decision, index) => {
    const terminal = index === input.decisions.length - 1;
    const episodeReward: Stage8BcEpisodeReward = terminal
      ? { terminal: true, terminalDelta: input.terminalDelta }
      : { terminal: false, episodeId, terminalRewardReferenceSha256: terminalReference };
    const replayPayload = {
      fixedSeed: input.fixedSeed,
      episodeId,
      traceStep: decision.traceStep,
      selectedActionKey: decision.selectedActionKey,
      preStateSha256: decision.preStateSha256,
      postStateSha256: decision.postStateSha256,
      publicEventSha256: decision.publicEventSha256,
      episodeContextSha256: decision.episodeContextSha256,
      visibleStateSha256: decision.teacherEvidence.visibleStateSha256,
      legalActionSetSha256: decision.teacherEvidence.legalActionSetSha256,
      teacherEvidenceSha256: decision.teacherEvidence.evidenceSha256,
      episodeReward,
    };
    const replay = { ...replayPayload, replaySha256: hashStage8BcReplayPayload(replayPayload) };
    const samplePayload: Omit<Stage8BcSampleEnvelope, 'sampleSha256'> = {
      protocolVersion: STAGE8_BC_SAMPLE_PROTOCOL_VERSION,
      sampleId: `${runId}-sample-${String(input.sampleOffset + index + 1).padStart(6, '0')}`,
      batchId,
      control: input.control.artifactControl.bcControl,
      visibleState: decision.visibleState,
      canonicalActions: decision.canonicalActions,
      completeLegalActionSetSha256: decision.teacherEvidence.legalActionSetSha256,
      teacherEvidence: decision.teacherEvidence,
      replay,
    };
    return { ...samplePayload, sampleSha256: hashStage8BcSamplePayload(samplePayload) };
  });
}

function validateTraceChain(transitions: readonly Stage8BcSampleProbeTransitionLedger[]): boolean {
  return transitions.length > 0 && transitions.every((entry, index) => entry.transitionIndex === index + 1
    && (index === 0 || transitions[index - 1].postStateSha256 === entry.preStateSha256)
    && entry.transitionSha256 === hashStage8OfflineIdentity({
      transitionIndex: entry.transitionIndex, decisionIndex: entry.decisionIndex, actor: entry.actor,
      actionKey: entry.actionKey, actionType: entry.actionType, preStateSha256: entry.preStateSha256,
      postStateSha256: entry.postStateSha256, publicEventSha256: entry.publicEventSha256,
      settlementSha256: entry.settlementSha256, episodeContextBeforeSha256: entry.episodeContextBeforeSha256,
      episodeContextAfterSha256: entry.episodeContextAfterSha256,
    }));
}

/** Executes one full in-memory game with the frozen BC teacher selecting every real seat decision. */
export function executeStage8BcSampleProbeGame(input: {
  control: Stage8BcSampleProbeControlManifest;
  gameIndex: number;
  sampleOffset: number;
  teacherEvaluator?: Stage8BcSampleProbeTeacherEvaluator;
}): Stage8BcSampleProbeGameResult {
  const control = validateStage8BcSampleProbeControl(input.control);
  const runId = input.control?.identity?.runId ?? 'invalid-bc-probe-run';
  if (!control.ok) return gameFail(runId, control.decision.reason);
  if (!Number.isInteger(input.gameIndex) || input.gameIndex < 0 || input.gameIndex >= STAGE8_BC_SAMPLE_PROBE_GAME_COUNT) {
    return gameFail(runId, 'bc-probe-game-index-invalid');
  }
  const fixedSeed = deriveStage8BcSampleProbeSeed(input.control.plan.baseSeed, input.gameIndex);
  const gameId = `${runId}-game-${String(input.gameIndex + 1).padStart(6, '0')}`;
  let state = createStage8BcSampleProbeInitialState(fixedSeed);
  let context = createStage8OfflineEpisodeContext();
  const transitions: Stage8BcSampleProbeTransitionLedger[] = [];
  const decisions: DecisionDraft[] = [];
  let terminalCount = 0;
  while (state.phase !== 'ended') {
    const integrity = stateIntegrity(state);
    if (integrity) return gameFail(gameId, integrity);
    if (transitions.length >= STAGE8_BC_SAMPLE_PROBE_MAX_TRANSITIONS) {
      return gameFail(gameId, 'bc-probe-transition-limit-exceeded');
    }
    if (state.phase === 'drawing') {
      const before = state;
      const contextBefore = context;
      const result = transitionRound(before, { type: 'draw', actor: before.currentPlayer });
      if (!result.ok) return gameFail(gameId, `bc-probe-system-draw-${result.reason}`);
      context = advanceStage8OfflineEpisodeContext({ context, before, action: null, after: result.state, event: result.event });
      transitions.push(transitionLedger({
        transitionIndex: transitions.length + 1, decisionIndex: null, actor: before.currentPlayer,
        actionKey: null, actionType: 'systemDraw', before, after: result.state, event: result.event,
        settlement: result.settlement, contextBefore, contextAfter: context,
      }));
      state = result.state;
      if (state.phase === 'ended') terminalCount += 1;
      continue;
    }
    if (state.phase !== 'discarding' && state.phase !== 'responding') return gameFail(gameId, 'bc-probe-phase-invalid');
    const actor = state.currentPlayer;
    const visibleState = projectStage8OfflineVisibleState(state, actor);
    const legalActions = deriveStage8OfflineActions({
      state, actor, candidateKongResources: context.candidateKongResources,
      addedKongChainWindows: context.addedKongChainWindows,
    });
    if (!legalActions.length) return gameFail(gameId, 'bc-probe-legal-action-set-empty');
    const legalActionSetSha256 = hashStage8CanonicalActionSet(legalActions);
    const teacher = (input.teacherEvaluator ?? evaluateStage8BcTeacher)({
      control: input.control.artifactControl.bcControl,
      visibleState,
      legalActions,
      completeLegalActionSetSha256: legalActionSetSha256,
    });
    if (!teacher.ok) return gameFail(gameId, teacher.decision.reason);
    const before = state;
    const contextBefore = context;
    const selectedAction = teacher.value.selectedAction;
    const preview = executeStage8OfflineCanonicalAction({
      state: before,
      action: selectedAction,
      candidateKongResources: context.candidateKongResources,
      addedKongChainWindows: context.addedKongChainWindows,
    });
    if (!preview.ok) return gameFail(gameId, `bc-probe-canonical-preview-${preview.reason}`);
    const trajectory = executeStage8OfflineTrajectory({
      initialState: before,
      episodeContext: context,
      steps: [{
        action: selectedAction,
        visibleStateHash: hashStage8OfflineVisibleState(visibleState),
        legalActionIds: legalActions.map((action) => action.actionId),
        legalActionSetHash: hashStage8OfflineLegalActionSet(legalActions.map((action) => action.actionId)),
        legalActionKeys: legalActions.map(stage8CanonicalActionKey).sort(),
        canonicalLegalActionSetHash: legalActionSetSha256,
      }],
    });
    if (!trajectory.ok || trajectory.records.length !== 1) {
      return gameFail(gameId, trajectory.ok ? 'bc-probe-trajectory-record-count-invalid' : trajectory.reason);
    }
    if (hashStage8OfflineIdentity(preview.state) !== hashStage8OfflineIdentity(trajectory.state)
      || hashStage8OfflineIdentity(preview.event) !== hashStage8OfflineIdentity(trajectory.records[0].publicEvent)) {
      return gameFail(gameId, 'bc-probe-canonical-preview-trajectory-mismatch');
    }
    state = trajectory.state;
    context = trajectory.context;
    const record = trajectory.records[0];
    const actionKey = stage8CanonicalActionKey(selectedAction);
    transitions.push(transitionLedger({
      transitionIndex: transitions.length + 1, decisionIndex: decisions.length + 1, actor,
      actionKey, actionType: selectedAction.actionType, before, after: state,
      event: record.publicEvent, settlement: preview.settlement, contextBefore, contextAfter: context,
    }));
    decisions.push({
      visibleState: structuredClone(visibleState),
      canonicalActions: structuredClone(teacher.value.legalActions),
      teacherEvidence: structuredClone(teacher.value.evidence),
      selectedActionKey: actionKey,
      traceStep: decisions.length + 1,
      preStateSha256: hashStage8OfflineIdentity(before),
      postStateSha256: hashStage8OfflineIdentity(state),
      publicEventSha256: hashStage8OfflineIdentity(record.publicEvent),
      episodeContextSha256: contextBefore.identitySha256,
    });
    if (state.phase === 'ended') terminalCount += 1;
  }
  const integrity = stateIntegrity(state);
  if (integrity) return gameFail(gameId, integrity);
  if (terminalCount !== 1 || !decisions.length || !validateTraceChain(transitions)) {
    return gameFail(gameId, 'bc-probe-terminal-or-trace-invalid');
  }
  const terminalTransition = transitions.at(-1)!;
  const terminalDelta = state.scores.slice() as [number, number, number, number];
  const samples = buildSamples({
    control: input.control, gameIndex: input.gameIndex, fixedSeed, terminalDelta,
    decisions, sampleOffset: input.sampleOffset,
  });
  const endType: Stage8BcSampleProbeGameLedger['endType'] = terminalTransition.actionType === 'systemDraw'
    ? 'wallExhausted'
    : 'win';
  const base = {
    gameIndex: input.gameIndex,
    gameId,
    fixedSeed,
    candidateSeat: input.gameIndex as 0 | 1 | 2 | 3,
    workerSlot: 0 as const,
    decisionCount: decisions.length,
    transitionCount: transitions.length,
    terminalCount: 1 as const,
    endType,
    terminalStateSha256: hashStage8OfflineIdentity(state),
    terminalEventSha256: terminalTransition.publicEventSha256,
    terminalSettlementSha256: terminalTransition.settlementSha256,
    terminalDelta,
    traceSha256: hashStage8OfflineIdentity(transitions.map((entry) => entry.transitionSha256)),
    transitions,
    samples,
  };
  return { ok: true, ledger: { ...base, semanticSha256: hashStage8OfflineIdentity(base) } };
}

/** Runs and replays all four games in memory. It never creates a directory or file. */
export function runStage8BcSampleProbeInMemory(
  controlManifest: Stage8BcSampleProbeControlManifest,
  teacherEvaluator: Stage8BcSampleProbeTeacherEvaluator = evaluateStage8BcTeacher,
): Stage8BcSampleProbeRunResult {
  const control = validateStage8BcSampleProbeControl(controlManifest);
  const runId = controlManifest?.identity?.runId ?? 'invalid-bc-probe-run';
  if (!control.ok) return fail(runId, control.decision.reason);
  const games: Stage8BcSampleProbeGameLedger[] = [];
  let sampleOffset = 0;
  for (let gameIndex = 0; gameIndex < STAGE8_BC_SAMPLE_PROBE_GAME_COUNT; gameIndex += 1) {
    const first = executeStage8BcSampleProbeGame({ control: controlManifest, gameIndex, sampleOffset, teacherEvaluator });
    if (!first.ok) return fail(runId, first.decision.reason);
    const replay = executeStage8BcSampleProbeGame({ control: controlManifest, gameIndex, sampleOffset, teacherEvaluator });
    if (!replay.ok || replay.ledger.semanticSha256 !== first.ledger.semanticSha256) {
      return fail(runId, replay.ok ? `bc-probe-deterministic-sample-replay-mismatch-game-${gameIndex + 1}` : replay.decision.reason);
    }
    games.push(first.ledger);
    sampleOffset += first.ledger.samples.length;
  }
  const semanticSha256 = hashStage8OfflineIdentity(games.map((game) => game.semanticSha256));
  return {
    ok: true,
    value: {
      status: 'validated-in-memory', runId, gameCount: 4, workerCount: 1,
      candidateSeats: [0,1,2,3], games, sampleCount: sampleOffset, semanticSha256,
      artifactsWritten: 0, formalSmokeGamesExecuted: 0, trainingStarted: false, modelLoaded: false,
    },
  };
}

function validCapacityEvidence(input: {
  evidence: Stage8BcSampleProbeCapacityEvidence;
  control: Stage8BcSampleProbeControlManifest;
  stage: Stage8BcSampleProbeCapacityEvidence['stage'];
  batchIndex: number | null;
  requestedBytes: number;
}): boolean {
  const evidence = input.evidence;
  return evidence.ok === true
    && evidence.stage === input.stage
    && evidence.batchIndex === input.batchIndex
    && evidence.requestedBytes === input.requestedBytes
    && Number.isFinite(evidence.availableBytes)
    && evidence.availableBytes >= input.requestedBytes
    && evidence.identitySha256 === input.control.identity.capacityPreflightSha256;
}

/** Commits only after all four games replay and validate in memory; any failure quarantines the whole run. */
export function executeStage8BcSampleProbeTransaction(input: {
  control: Stage8BcSampleProbeControlManifest;
  port: Stage8BcSampleProbeTransactionPort;
  teacherEvaluator?: Stage8BcSampleProbeTeacherEvaluator;
}): Stage8BcSampleProbeTransactionResult {
  const runId = input.control?.identity?.runId ?? 'invalid-bc-probe-run';
  const control = validateStage8BcSampleProbeControl(input.control);
  if (!control.ok) return { ok: false, status: 'fused', reason: control.decision.reason, isolationId: `${runId}-isolation`, artifactsWritten: 0 };
  let beforeRun: Stage8BcSampleProbeCapacityEvidence;
  try {
    beforeRun = input.port.capacityPreflight({
      stage: 'before-run', batchIndex: null, requestedBytes: input.control.capacity.maxRunBytes,
    });
  } catch {
    return { ok: false, status: 'fused', reason: 'bc-probe-capacity-preflight-failed', isolationId: `${runId}-isolation`, artifactsWritten: 0 };
  }
  if (!validCapacityEvidence({
    evidence: beforeRun, control: input.control, stage: 'before-run', batchIndex: null,
    requestedBytes: input.control.capacity.maxRunBytes,
  })) return { ok: false, status: 'fused', reason: 'bc-probe-capacity-before-run-invalid', isolationId: `${runId}-isolation`, artifactsWritten: 0 };

  const memory = runStage8BcSampleProbeInMemory(input.control, input.teacherEvaluator ?? evaluateStage8BcTeacher);
  if (!memory.ok) return { ok: false, status: 'fused', reason: memory.decision.reason, isolationId: memory.decision.isolationId, artifactsWritten: 0 };
  return commitStage8BcSampleProbeValidatedRun({ control: input.control, validated: memory.value, port: input.port });
}

/** Commits a caller-retained validated value; it never bypasses per-batch capacity or atomic-run checks. */
export function commitStage8BcSampleProbeValidatedRun(input: {
  control: Stage8BcSampleProbeControlManifest;
  validated: ValidatedProbeRun;
  port: Stage8BcSampleProbeTransactionPort;
}): Stage8BcSampleProbeTransactionResult {
  const runId = input.control?.identity?.runId ?? 'invalid-bc-probe-run';
  if (input.validated.status !== 'validated-in-memory'
    || input.validated.runId !== runId
    || input.validated.gameCount !== 4
    || input.validated.games.length !== 4
    || input.validated.artifactsWritten !== 0
    || input.validated.formalSmokeGamesExecuted !== 0
    || input.validated.trainingStarted !== false
    || input.validated.modelLoaded !== false
    || input.validated.semanticSha256 !== hashStage8OfflineIdentity(input.validated.games.map((game) => game.semanticSha256))) {
    return { ok: false, status: 'fused', reason: 'bc-probe-validated-run-identity-invalid', isolationId: `${runId}-isolation`, artifactsWritten: 0 };
  }
  const artifactSha256List: string[] = [];
  const perBatchBytes = Math.floor(input.control.capacity.maxRunBytes / STAGE8_BC_SAMPLE_PROBE_GAME_COUNT);
  try {
    for (let batchIndex = 0; batchIndex < input.validated.games.length; batchIndex += 1) {
      const evidence = input.port.capacityPreflight({ stage: 'before-batch-commit', batchIndex, requestedBytes: perBatchBytes });
      if (!validCapacityEvidence({
        evidence, control: input.control, stage: 'before-batch-commit', batchIndex, requestedBytes: perBatchBytes,
      })) throw new Error('bc-probe-capacity-before-batch-invalid');
      const committed = input.port.commitBatch({ batchIndex, game: input.validated.games[batchIndex] });
      if (!committed.ok || !/^[a-f0-9]{64}$/i.test(committed.artifactSha256)) {
        throw new Error(committed.ok ? 'bc-probe-batch-artifact-identity-invalid' : committed.reason);
      }
      artifactSha256List.push(committed.artifactSha256);
    }
    const committed = input.port.commitRun({ semanticSha256: input.validated.semanticSha256, artifactSha256List });
    if (!committed.ok) throw new Error(committed.reason);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'bc-probe-batch-commit-failed';
    try { input.port.quarantineRun(reason); } catch { /* The fused identity still names the whole run for operator isolation. */ }
    return { ok: false, status: 'fused', reason, isolationId: `${runId}-isolation`, artifactsWritten: 0 };
  }
  return { ok: true, status: 'committed', semanticSha256: input.validated.semanticSha256, artifactsWritten: 4, capacityChecks: 5 };
}
