import type { MctsActionType, MctsCandidate, MctsDecisionContext } from '../mcts/mcts-enhancement-engine';
import { scoreMctsCandidateValues } from '../mcts/mcts-enhancement-engine';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import { hashStage8OfflineIdentity, sortStage8CanonicalActions, stage8CanonicalActionKey } from './offline-action-identity';
import { createStage8OfflineRawDistributionResult, type Stage8OfflineRawDistributionProvider, type Stage8OfflineRawDistributionRequest } from './offline-behavior-distribution';
import {
  executeStage8FrozenModelInference,
  hashStage8FrozenModelInferenceContract,
  type Stage8FrozenModelIdentityPackage,
  type Stage8FrozenModelInferencePort,
} from './offline-frozen-model-inference';
import type { Stage8OfflineVisibleState } from './offline-round-adapter';

export const STAGE8_CANONICAL_MCTS_PROVIDER_VERSION = 'stage8-canonical-mcts-provider-v2';

const VISIBLE_KEYS = [
  'actor', 'ownHand', 'publicMelds', 'publicDiscards', 'scores', 'dealer', 'turn',
  'phase', 'currentPlayer', 'lastDiscard', 'lastDiscardPlayer', 'wallRemainingCount',
] as const;

export interface Stage8CanonicalMctsProviderConfig {
  providerIdentitySha256: string;
  behaviorTemperature: number;
  modelPolicyWeight: number;
  modelIdentity: Stage8FrozenModelIdentityPackage;
  modelInference: Stage8FrozenModelInferencePort;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function isVisibleState(value: unknown): value is Stage8OfflineVisibleState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (Object.keys(state).some((key) => !VISIBLE_KEYS.includes(key as typeof VISIBLE_KEYS[number]))) return false;
  return Number.isInteger(state.actor)
    && Array.isArray(state.ownHand)
    && Array.isArray(state.publicMelds)
    && Array.isArray(state.publicDiscards)
    && Array.isArray(state.scores)
    && (state.scores as unknown[]).length === 4
    && (state.scores as unknown[]).every((score) => typeof score === 'number' && Number.isFinite(score))
    && Number.isInteger(state.dealer)
    && Number.isInteger(state.turn)
    && Number.isInteger(state.currentPlayer)
    && Number.isInteger(state.wallRemainingCount)
    && ['discarding', 'responding'].includes(String(state.phase));
}

function mctsAction(action: CanonicalStage8V2Action): MctsActionType {
  if (action.actionType === 'discard') return 'discard';
  if (action.actionType === 'pong') return 'pong';
  if (action.actionType === 'win') return 'win';
  if (action.actionType === 'pass' || action.actionType === 'declineKong') return 'pass';
  return 'kong';
}

function publicSeenCount(state: Stage8OfflineVisibleState, tile: string | undefined): number {
  if (!tile) return 0;
  const discards = state.publicDiscards.flat().filter((value) => value === tile).length;
  const melds = state.publicMelds.flat().flatMap((meld) => meld.tiles).filter((value) => value === tile).length;
  return discards + melds;
}

function toMctsCandidate(action: CanonicalStage8V2Action, state: Stage8OfflineVisibleState): MctsCandidate {
  const mapped = mctsAction(action);
  const kong = mapped === 'kong';
  return {
    id: stage8CanonicalActionKey(action),
    action: mapped,
    ...(action.tile ? { tile: action.tile, tileLabel: action.tile } : {}),
    legal: true,
    baseScore: 0,
    scoreImpact: action.actionType === 'directChisel' || action.actionType.startsWith('forcedRun') ? 4 : kong ? 2 : 0,
    kongRisk: kong ? (action.context.robKongWindow ? 0.35 : 0.1) : 0,
    publicSeenCount: publicSeenCount(state, action.tile),
  };
}

function toMctsContext(state: Stage8OfflineVisibleState, actions: readonly CanonicalStage8V2Action[]): MctsDecisionContext {
  return {
    turn: state.turn,
    player: state.actor,
    phase: state.phase as 'discarding' | 'responding',
    scores: state.scores.slice(),
    dealer: state.dealer,
    wallRemaining: state.wallRemainingCount,
    discards: state.publicDiscards.map((tiles) => tiles.slice()),
    melds: state.publicMelds.flatMap((melds, player) => melds.map((meld) => ({
      player,
      tile: meld.tiles[0],
      count: meld.tiles.length,
      type: meld.type,
    }))),
    handSummary: state.ownHand.slice(),
    strongRuleAction: null,
    candidates: actions.map((action) => toMctsCandidate(action, state)),
  };
}

function normalizedSoftmax(values: readonly number[], temperature: number): number[] {
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw new Error('canonical-mcts-score-invalid');
  const maximum = Math.max(...values);
  const weights = values.map((value) => Math.exp((value - maximum) / temperature));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('canonical-mcts-normalization-invalid');
  return weights.map((value) => value / total);
}

function standardized(values: readonly number[]): number[] {
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw new Error('canonical-mcts-standardization-invalid');
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  return deviation <= 1e-12 ? values.map(() => 0) : values.map((value) => (value - mean) / deviation);
}

export function hashStage8CanonicalMctsProviderDefinition(input: {
  behaviorTemperature: number;
  modelPolicyWeight: number;
  modelManifestSha256: string;
  inferenceContractSha256: string;
}): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_CANONICAL_MCTS_PROVIDER_VERSION,
    behaviorTemperature: input.behaviorTemperature,
    modelPolicyWeight: input.modelPolicyWeight,
    modelManifestSha256: input.modelManifestSha256,
    inferenceContractSha256: input.inferenceContractSha256,
    input: 'strict-stage8-visible-state',
    legalActionMapping: 'complete-canonical-set-to-existing-mcts-score-surface',
    modelPolicy: 'complete-canonical-logits',
    modelValue: 'validated-zero-sum-audit-only-until-leaf-search',
    fusion: 'zscore-mcts-plus-zscore-policy-then-stable-softmax',
  });
}

/** Combines the existing MCTS score surface with a verified frozen-model policy head. */
export function createStage8CanonicalMctsProvider(config: Stage8CanonicalMctsProviderConfig): Stage8OfflineRawDistributionProvider {
  if (!isSha256(config.providerIdentitySha256)) throw new Error('canonical-mcts-provider-identity-invalid');
  if (!Number.isFinite(config.behaviorTemperature) || config.behaviorTemperature <= 0 || config.behaviorTemperature > 100) throw new Error('canonical-mcts-temperature-invalid');
  if (!Number.isFinite(config.modelPolicyWeight) || config.modelPolicyWeight <= 0 || config.modelPolicyWeight > 1) throw new Error('canonical-mcts-model-policy-weight-invalid');
  if (config.modelIdentity.inferenceContractSha256 !== hashStage8FrozenModelInferenceContract()) throw new Error('canonical-mcts-inference-contract-mismatch');
  if (typeof config.modelInference !== 'function') throw new Error('canonical-mcts-model-inference-required');
  return async (request: Stage8OfflineRawDistributionRequest) => {
    if (request.identitySha256 !== config.providerIdentitySha256) throw new Error('canonical-mcts-request-identity-mismatch');
    if (!isVisibleState(request.visibleState)) throw new Error('canonical-mcts-visible-state-invalid');
    const legalActions = sortStage8CanonicalActions(request.legalActions);
    if (!legalActions.length) throw new Error('canonical-mcts-legal-actions-empty');
    const keys = legalActions.map(stage8CanonicalActionKey);
    if (new Set(keys).size !== keys.length) throw new Error('canonical-mcts-action-identity-duplicate');
    const scored = scoreMctsCandidateValues(toMctsContext(request.visibleState, legalActions));
    const byId = new Map(scored.map((candidate) => [candidate.id, candidate.value]));
    if (byId.size !== keys.length || keys.some((key) => !byId.has(key))) throw new Error('canonical-mcts-action-score-incomplete');
    const inference = await executeStage8FrozenModelInference({
      model: config.modelIdentity,
      visibleState: request.visibleState,
      legalActions,
      inference: config.modelInference,
    });
    const mctsScores = keys.map((key) => byId.get(key)! as number);
    const modelLogits = keys.map((key) => inference.policyLogits[key]);
    const standardizedMcts = standardized(mctsScores);
    const standardizedPolicy = standardized(modelLogits);
    const combinedScores = keys.map((_, index) => (1 - config.modelPolicyWeight) * standardizedMcts[index]
      + config.modelPolicyWeight * standardizedPolicy[index]);
    const probabilities = normalizedSoftmax(combinedScores, config.behaviorTemperature);
    const distribution = Object.fromEntries(keys.map((key, index) => [key, probabilities[index]]));
    return createStage8OfflineRawDistributionResult({
      request,
      providerVersion: STAGE8_CANONICAL_MCTS_PROVIDER_VERSION,
      distribution,
      details: {
        modelInference: inference,
        mctsScores: Object.fromEntries(keys.map((key, index) => [key, mctsScores[index]])),
        combinedScores: Object.fromEntries(keys.map((key, index) => [key, combinedScores[index]])),
        fusion: {
          mctsWeight: 1 - config.modelPolicyWeight,
          modelPolicyWeight: config.modelPolicyWeight,
          behaviorTemperature: config.behaviorTemperature,
          formula: 'zscore-mcts-plus-zscore-policy-then-stable-softmax',
          valueUsage: 'validated-zero-sum-audit-only-until-leaf-search',
        },
      },
    });
  };
}
