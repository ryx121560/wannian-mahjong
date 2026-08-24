import type { CanonicalStage8V2Action } from './action-registry-v2';
import { hashStage8OfflineIdentity, sortStage8CanonicalActions, stage8CanonicalActionKey } from './offline-action-identity';
import type { Stage8FixedCourseScenario } from './offline-curriculum-kong-zhichan-chain';
import { STAGE8_OFFLINE_SMOKE_EXPLORATION_RATE } from './offline-selfplay-control';

export const STAGE8_OFFLINE_BEHAVIOR_DISTRIBUTION_VERSION = 'stage8-offline-behavior-distribution-v1';

export function hashStage8OfflineExplorationDefinition(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_OFFLINE_BEHAVIOR_DISTRIBUTION_VERSION,
    targetedExplorationRate: STAGE8_OFFLINE_SMOKE_EXPLORATION_RATE,
    targetedScenarios: ['forcedRunKong', 'zhichan'],
    reportOnlyScenarios: ['chainKong'],
    scope: 'candidate-seat-only',
  });
}

export interface Stage8OfflineRawDistributionRequest {
  readonly visibleState: unknown;
  readonly legalActions: readonly CanonicalStage8V2Action[];
  readonly identitySha256: string;
}

export type Stage8OfflineRawDistributionProvider = (
  request: Stage8OfflineRawDistributionRequest,
) => Readonly<Record<string, number>>;

export interface Stage8OfflineBehaviorSelection {
  legalActions: CanonicalStage8V2Action[];
  legalActionKeys: string[];
  legalActionSetSha256: string;
  mctsDistribution: Record<string, number>;
  behaviorActionDistribution: Record<string, number>;
  selectedAction: CanonicalStage8V2Action;
  selectedActionKey: string;
  behaviorActionProbability: number;
  behaviorActionSource: 'mcts' | 'curriculum-exploration';
  exploration: boolean;
  targetLegalActionKeys: string[];
}

export type Stage8OfflineBehaviorResult =
  | { ok: true; value: Stage8OfflineBehaviorSelection }
  | { ok: false; reason: string };

function actionMatchesScenario(action: CanonicalStage8V2Action, scenario: Stage8FixedCourseScenario): boolean {
  if (scenario === 'zhichan') return action.actionType === 'directChisel';
  if (scenario === 'chainKong') return action.actionType === 'chainKong';
  return action.actionType === 'forcedRunImmediate'
    || action.actionType === 'forcedRunDeferred'
    || action.actionType === 'forcedRunConcealed'
    || action.actionType === 'doublePongForcedRun';
}

function deterministicUnit(identity: unknown): number {
  return Number.parseInt(hashStage8OfflineIdentity(identity).slice(0, 13), 16) / 0x10000000000000;
}

function sampleKey(keys: string[], distribution: Record<string, number>, unit: number): string {
  let cumulative = 0;
  for (const key of keys) {
    cumulative += distribution[key];
    if (unit < cumulative + Number.EPSILON) return key;
  }
  return keys[keys.length - 1];
}

function validDistribution(keys: string[], distribution: Readonly<Record<string, number>>): boolean {
  const actualKeys = Object.keys(distribution).sort();
  if (actualKeys.length !== keys.length || actualKeys.some((key, index) => key !== keys[index])) return false;
  const values = keys.map((key) => distribution[key]);
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 1e-12;
}

/** Applies the PRD fixed-course 20% targeted mixture to an injected full raw distribution. */
export function selectStage8OfflineBehaviorAction(input: {
  visibleState: unknown;
  legalActions: readonly CanonicalStage8V2Action[];
  rawDistributionProvider: Stage8OfflineRawDistributionProvider;
  providerIdentitySha256: string;
  decisionIdentity: string;
  scenario: Stage8FixedCourseScenario;
  candidateSeat: number;
  actor: number;
}): Stage8OfflineBehaviorResult {
  if (!/^[a-f0-9]{64}$/i.test(input.providerIdentitySha256)) return { ok: false, reason: 'behavior-provider-identity-invalid' };
  const legalActions = sortStage8CanonicalActions(input.legalActions);
  if (legalActions.length === 0) return { ok: false, reason: 'behavior-legal-action-set-empty' };
  const legalActionKeys = legalActions.map(stage8CanonicalActionKey);
  if (new Set(legalActionKeys).size !== legalActionKeys.length) return { ok: false, reason: 'behavior-canonical-action-identity-duplicate' };
  const request: Stage8OfflineRawDistributionRequest = Object.freeze({
    visibleState: structuredClone(input.visibleState),
    legalActions: Object.freeze(legalActions.map((action) => Object.freeze(structuredClone(action)))),
    identitySha256: input.providerIdentitySha256,
  });
  let provided: Readonly<Record<string, number>>;
  try { provided = input.rawDistributionProvider(request); } catch { return { ok: false, reason: 'behavior-provider-failed' }; }
  if (!validDistribution(legalActionKeys, provided)) return { ok: false, reason: 'behavior-mcts-distribution-invalid' };
  const mctsDistribution = Object.fromEntries(legalActionKeys.map((key) => [key, provided[key]]));
  const targetLegalActionKeys = input.actor === input.candidateSeat
    ? legalActions.filter((action) => actionMatchesScenario(action, input.scenario)).map(stage8CanonicalActionKey)
    : [];
  const explorationEligible = input.scenario !== 'chainKong' && targetLegalActionKeys.length > 0;
  const behaviorActionDistribution: Record<string, number> = {};
  for (const key of legalActionKeys) {
    const targeted = explorationEligible && targetLegalActionKeys.includes(key) ? 1 / targetLegalActionKeys.length : 0;
    behaviorActionDistribution[key] = explorationEligible
      ? (1 - STAGE8_OFFLINE_SMOKE_EXPLORATION_RATE) * mctsDistribution[key] + STAGE8_OFFLINE_SMOKE_EXPLORATION_RATE * targeted
      : mctsDistribution[key];
  }
  const chooseExploration = explorationEligible && deterministicUnit([input.decisionIdentity, 'mixture']) < STAGE8_OFFLINE_SMOKE_EXPLORATION_RATE;
  let selectedActionKey: string;
  if (chooseExploration) {
    const targetedDistribution = Object.fromEntries(targetLegalActionKeys.map((key) => [key, 1 / targetLegalActionKeys.length]));
    selectedActionKey = sampleKey(targetLegalActionKeys, targetedDistribution, deterministicUnit([input.decisionIdentity, 'target']));
  } else {
    selectedActionKey = sampleKey(legalActionKeys, mctsDistribution, deterministicUnit([input.decisionIdentity, 'raw']));
  }
  const selectedAction = legalActions[legalActionKeys.indexOf(selectedActionKey)];
  return {
    ok: true,
    value: {
      legalActions, legalActionKeys,
      legalActionSetSha256: hashStage8OfflineIdentity(legalActionKeys),
      mctsDistribution, behaviorActionDistribution,
      selectedAction, selectedActionKey,
      behaviorActionProbability: behaviorActionDistribution[selectedActionKey],
      behaviorActionSource: chooseExploration ? 'curriculum-exploration' : 'mcts',
      exploration: chooseExploration,
      targetLegalActionKeys,
    },
  };
}
