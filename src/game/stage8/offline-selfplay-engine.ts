import { transitionRound, type GameState, type RoundPublicEvent } from '../rules';
import { deriveStage8OfflineActions, projectStage8OfflineVisibleState } from './offline-round-adapter';
import {
  hashStage8OfflineLegalActionSet,
  hashStage8OfflineVisibleState,
  executeStage8OfflineTrajectory,
  type Stage8OfflineTrajectoryRecord,
} from './offline-trajectory-executor';
import { hashStage8CanonicalActionSet, hashStage8OfflineIdentity, stage8CanonicalActionKey } from './offline-action-identity';
import {
  selectStage8OfflineBehaviorAction,
  hashStage8OfflineExplorationDefinition,
  type Stage8OfflineBehaviorSelection,
  type Stage8OfflineRawDistributionProvider,
} from './offline-behavior-distribution';
import {
  hashStage8FixedCurriculumDefinition,
  validateStage8FixedCurriculumPlan,
  type Stage8FixedCourseGamePlan,
  type Stage8FixedCourseScenario,
  type Stage8FixedCurriculumPlan,
} from './offline-curriculum-kong-zhichan-chain';
import { advanceStage8OfflineEpisodeContext, createStage8OfflineEpisodeContext, validateStage8OfflineEpisodeContext, type Stage8OfflineEpisodeContext } from './offline-episode-context';
import { validateStage8OfflineSmokeControl, type Stage8OfflineSmokeControlManifest } from './offline-selfplay-control';
import type { Stage8ArtifactRootPreflightInput } from './artifact-root-preflight';

export const STAGE8_OFFLINE_SELFPLAY_ENGINE_VERSION = 'stage8-offline-selfplay-engine-v2';

export interface Stage8OfflineActionCoverageCounter {
  legalOpportunities: number;
  positiveBehavior: number;
  selected: number;
  reportOnly: boolean;
}

export type Stage8OfflineActionCoverage = Record<Stage8FixedCourseScenario, Stage8OfflineActionCoverageCounter>;

export interface Stage8OfflineSmokeCoverageLedger {
  completedGames: number;
  candidateSeatGames: [number, number, number, number];
  byCandidateSeat: [Stage8OfflineActionCoverage, Stage8OfflineActionCoverage, Stage8OfflineActionCoverage, Stage8OfflineActionCoverage];
}

export type Stage8OfflineSmokeCoverageDecision =
  | { ok: true; aggregate: Stage8OfflineActionCoverage }
  | { ok: false; reason: string; aggregate: Stage8OfflineActionCoverage };

export interface Stage8OfflineDecisionEvidence {
  decisionIdentitySha256: string;
  visibleStateSha256: string;
  episodeContextSha256: string;
  behavior: Stage8OfflineBehaviorSelection;
  records: Stage8OfflineTrajectoryRecord[];
  publicEventSha256: string;
}

export interface Stage8OfflineSelfplayCursor {
  state: GameState;
  context: Stage8OfflineEpisodeContext;
  traceStep: number;
  traceHash: string;
  coverage: Stage8OfflineActionCoverage;
}

export type Stage8OfflineSelfplayDecisionResult =
  | { ok: true; status: 'advanced' | 'ended'; cursor: Stage8OfflineSelfplayCursor; evidence?: Stage8OfflineDecisionEvidence }
  | { ok: false; status: 'fused'; reason: string; isolationId: string; cursor: Stage8OfflineSelfplayCursor };

function emptyCoverage(): Stage8OfflineActionCoverage {
  return {
    forcedRunKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: false },
    zhichan: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: false },
    chainKong: { legalOpportunities: 0, positiveBehavior: 0, selected: 0, reportOnly: true },
  };
}

function aggregateCoverage(ledger: Stage8OfflineSmokeCoverageLedger): Stage8OfflineActionCoverage {
  const aggregate = emptyCoverage();
  for (const seat of ledger.byCandidateSeat) {
    for (const scenario of ['forcedRunKong','zhichan','chainKong'] as const) {
      aggregate[scenario].legalOpportunities += seat[scenario].legalOpportunities;
      aggregate[scenario].positiveBehavior += seat[scenario].positiveBehavior;
      aggregate[scenario].selected += seat[scenario].selected;
    }
  }
  return aggregate;
}

/** Evaluates a future 1000-game ledger; chain coverage is intentionally report-only. */
export function evaluateStage8OfflineSmokeCoverage(ledger: Stage8OfflineSmokeCoverageLedger): Stage8OfflineSmokeCoverageDecision {
  const aggregate = aggregateCoverage(ledger);
  if (ledger.completedGames !== 1000 || ledger.candidateSeatGames.some((count) => count !== 250)) return { ok: false, reason: 'smoke-coverage-course-incomplete', aggregate };
  for (const scenario of ['forcedRunKong','zhichan'] as const) {
    const counter = aggregate[scenario];
    if (counter.legalOpportunities < 20) return { ok: false, reason: `smoke-coverage-${scenario}-legal-opportunity-below-20`, aggregate };
    if (counter.positiveBehavior < 1) return { ok: false, reason: `smoke-coverage-${scenario}-positive-behavior-missing`, aggregate };
    if (counter.selected < 1) return { ok: false, reason: `smoke-coverage-${scenario}-selection-missing`, aggregate };
  }
  return { ok: true, aggregate };
}

export function createStage8OfflineSelfplayCursor(state: GameState, context = createStage8OfflineEpisodeContext()): Stage8OfflineSelfplayCursor {
  return { state, context, traceStep: 0, traceHash: hashStage8OfflineIdentity([]), coverage: emptyCoverage() };
}

function fail(cursor: Stage8OfflineSelfplayCursor, gameId: string, reason: string): Stage8OfflineSelfplayDecisionResult {
  return { ok: false, status: 'fused', reason, isolationId: `${gameId}-isolation`, cursor };
}

function actionsForScenario(actionTypes: readonly string[], scenario: Stage8FixedCourseScenario): boolean {
  if (scenario === 'zhichan') return actionTypes.includes('directChisel');
  if (scenario === 'chainKong') return actionTypes.includes('chainKong');
  return actionTypes.some((type) => ['forcedRunImmediate','forcedRunDeferred','forcedRunConcealed','doublePongForcedRun'].includes(type));
}

function updateCoverage(input: {
  coverage: Stage8OfflineActionCoverage;
  behavior: Stage8OfflineBehaviorSelection;
  actor: number;
  candidateSeat: number;
}): Stage8OfflineActionCoverage {
  const next = structuredClone(input.coverage) as Stage8OfflineActionCoverage;
  if (input.actor !== input.candidateSeat) return next;
  const legalTypes = input.behavior.legalActions.map((action) => action.actionType);
  for (const scenario of ['forcedRunKong','zhichan','chainKong'] as const) {
    if (!actionsForScenario(legalTypes, scenario)) continue;
    next[scenario].legalOpportunities += 1;
    const matchingKeys = input.behavior.legalActions
      .filter((action) => actionsForScenario([action.actionType], scenario))
      .map(stage8CanonicalActionKey);
    if (matchingKeys.reduce((sum, key) => sum + input.behavior.behaviorActionDistribution[key], 0) > 0) next[scenario].positiveBehavior += 1;
    if (actionsForScenario([input.behavior.selectedAction.actionType], scenario)) next[scenario].selected += 1;
  }
  return next;
}

function planGameMatches(plan: Stage8FixedCurriculumPlan, game: Stage8FixedCourseGamePlan): boolean {
  const expected = plan.games[game.gameIndex];
  return Boolean(expected) && hashStage8OfflineIdentity(expected) === hashStage8OfflineIdentity(game);
}

/** Executes one explicit in-memory decision through the true-source trajectory executor. */
export async function executeStage8OfflineSelfplayDecision(input: {
  cursor: Stage8OfflineSelfplayCursor;
  plan: Stage8FixedCurriculumPlan;
  game: Stage8FixedCourseGamePlan;
  smokeControl: Stage8OfflineSmokeControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  rawDistributionProvider: Stage8OfflineRawDistributionProvider;
  providerIdentitySha256: string;
}): Promise<Stage8OfflineSelfplayDecisionResult> {
  const original = input.cursor;
  const control = validateStage8OfflineSmokeControl({ manifest: input.smokeControl, artifactRoot: input.artifactRoot });
  if (!control.ok) return fail(original, input.game.gameId, control.decision.reason);
  const planValidation = validateStage8FixedCurriculumPlan(input.plan);
  if (!planValidation.ok || !planGameMatches(input.plan, input.game)) return fail(original, input.game.gameId, planValidation.ok ? 'selfplay-course-game-mismatch' : planValidation.reason);
  if (!validateStage8OfflineEpisodeContext(input.cursor.context)) return fail(original, input.game.gameId, 'selfplay-episode-context-invalid');
  const identity = input.smokeControl.identity;
  if (identity.seedPlanSha256 !== input.plan.planSha256 || identity.curriculumSha256 !== hashStage8FixedCurriculumDefinition() || identity.explorationSha256 !== hashStage8OfflineExplorationDefinition() || identity.mctsProviderSha256 !== input.providerIdentitySha256) return fail(original, input.game.gameId, 'selfplay-control-identity-mismatch');
  if (input.cursor.state.phase === 'ended') return { ok: true, status: 'ended', cursor: original };

  let decisionState = input.cursor.state;
  if (decisionState.phase === 'drawing') {
    const preview = transitionRound(decisionState, { type: 'draw', actor: decisionState.currentPlayer });
    if (!preview.ok) return fail(original, input.game.gameId, `selfplay-system-draw-${preview.reason}`);
    if (preview.state.phase === 'ended') {
      const context = advanceStage8OfflineEpisodeContext({ context: original.context, before: decisionState, action: null, after: preview.state, event: preview.event });
      const recordIdentity = { before: hashStage8OfflineIdentity(decisionState), after: hashStage8OfflineIdentity(preview.state), event: preview.event, settlement: preview.settlement?.delta || null };
      return { ok: true, status: 'ended', cursor: { ...original, state: preview.state, context, traceStep: original.traceStep + 1, traceHash: hashStage8OfflineIdentity([original.traceHash, recordIdentity]) } };
    }
    decisionState = preview.state;
  }
  const actor = decisionState.currentPlayer;
  const visibleState = projectStage8OfflineVisibleState(decisionState, actor);
  const legalActions = deriveStage8OfflineActions({ state: decisionState, actor, candidateKongResources: original.context.candidateKongResources, addedKongChainWindows: original.context.addedKongChainWindows });
  const decisionIdentity = hashStage8OfflineIdentity({ game: input.game, traceStep: original.traceStep + 1, visibleState, episodeContextSha256: original.context.identitySha256, legalActionSetSha256: hashStage8CanonicalActionSet(legalActions) });
  const selected = await selectStage8OfflineBehaviorAction({ visibleState, legalActions, rawDistributionProvider: input.rawDistributionProvider, providerIdentitySha256: input.providerIdentitySha256, decisionIdentity, scenario: input.game.scenario, candidateSeat: input.game.candidateSeat, actor });
  if (!selected.ok) return fail(original, input.game.gameId, selected.reason);
  const legalActionIds = legalActions.map((action) => action.actionId);
  const trajectory = executeStage8OfflineTrajectory({
    initialState: input.cursor.state,
    episodeContext: input.cursor.context,
    steps: [{
      action: selected.value.selectedAction,
      visibleStateHash: hashStage8OfflineVisibleState(visibleState),
      legalActionIds,
      legalActionSetHash: hashStage8OfflineLegalActionSet(legalActionIds),
      legalActionKeys: legalActions.map(stage8CanonicalActionKey).sort(),
      canonicalLegalActionSetHash: hashStage8CanonicalActionSet(legalActions),
    }],
  });
  if (!trajectory.ok) return fail(original, input.game.gameId, trajectory.reason);
  const coverage = updateCoverage({ coverage: original.coverage, behavior: selected.value, actor, candidateSeat: input.game.candidateSeat });
  const traceStep = original.traceStep + trajectory.records.length;
  const traceHash = hashStage8OfflineIdentity([original.traceHash, trajectory.traceHash]);
  const lastEvent: RoundPublicEvent | undefined = trajectory.records.at(-1)?.publicEvent;
  if (!lastEvent) return fail(original, input.game.gameId, 'selfplay-public-event-missing');
  const cursor: Stage8OfflineSelfplayCursor = { state: trajectory.state, context: trajectory.context, traceStep, traceHash, coverage };
  return {
    ok: true,
    status: trajectory.state.phase === 'ended' ? 'ended' : 'advanced',
    cursor,
    evidence: {
      decisionIdentitySha256: decisionIdentity,
      visibleStateSha256: hashStage8OfflineVisibleState(visibleState),
      episodeContextSha256: trajectory.context.identitySha256,
      behavior: selected.value,
      records: trajectory.records,
      publicEventSha256: hashStage8OfflineIdentity(lastEvent),
    },
  };
}
