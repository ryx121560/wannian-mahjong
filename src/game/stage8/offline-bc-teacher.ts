import { makeDecision, type CandidateScore, type StrongAIGameState } from '../strong-rule-ai';
import type { CanonicalStage8V2Action } from './action-registry-v2';
import {
  STAGE8_BC_TEACHER_TEMPERATURE,
  validateStage8BcControlManifest,
  type Stage8BcControlManifest,
  type Stage8BcFusedDecision,
} from './offline-bc-control';
import {
  isStage8CanonicalMctsVisibleState,
  normalizeStage8CanonicalMctsScores,
  scoreStage8CanonicalMctsSurface,
  type Stage8CanonicalMctsCandidateSignal,
} from './offline-canonical-mcts-provider';
import {
  hashStage8CanonicalActionSet,
  hashStage8OfflineIdentity,
  sortStage8CanonicalActions,
  stage8CanonicalActionKey,
} from './offline-action-identity';
import { encodeStage8OnnxTensorBatch, hashStage8OnnxTensorContract } from './offline-onnx-tensor-contract';
import type { Stage8OfflineVisibleState } from './offline-round-adapter';

export const STAGE8_BC_TEACHER_VERSION = 'stage8-bc-stage7-search-teacher-v1';

export interface Stage8BcTeacherEvidence {
  protocolVersion: typeof STAGE8_BC_TEACHER_VERSION;
  controlManifestSha256: string;
  teacherDefinitionSha256: string;
  visibleStateSha256: string;
  legalActionSetSha256: string;
  tensorContractSha256: string;
  legalActionKeys: string[];
  rawScores: Record<string, number>;
  teacherDistribution: Record<string, number>;
  selectedActionKey: string;
  selectedActionIdentitySha256: string;
  decisionActor: number;
  visibleCurrentPlayer: number;
  visiblePhase: 'discarding' | 'responding';
  stage7StrongRuleActionKey: string | null;
  stage7ReasoningSha256: string | null;
  modelFusion: false;
  temperature: typeof STAGE8_BC_TEACHER_TEMPERATURE;
  evidenceSha256: string;
}

export type Stage8BcTeacherResult =
  | { ok: true; value: { legalActions: CanonicalStage8V2Action[]; selectedAction: CanonicalStage8V2Action; evidence: Stage8BcTeacherEvidence } }
  | { ok: false; decision: Stage8BcFusedDecision };

function fail(runId: unknown, reason: string): Stage8BcTeacherResult {
  const safe = typeof runId === 'string' && /^[a-z][a-z0-9-]{2,127}$/i.test(runId) ? runId : 'invalid-bc-run';
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${safe}-isolation` } };
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function strongRuleState(visibleState: Stage8OfflineVisibleState): StrongAIGameState {
  return {
    hand: visibleState.ownHand.slice(),
    melds: visibleState.publicMelds.map((melds) => melds.map((meld) => ({
      ...meld,
      tiles: meld.tiles.slice() as typeof meld.tiles,
    }))),
    discards: visibleState.publicDiscards.map((discards) => discards.slice()),
    turn: Math.max(1, visibleState.turn),
    dealer: visibleState.dealer,
    currentPlayer: visibleState.currentPlayer,
    scores: visibleState.scores.slice(),
    wallRemaining: visibleState.wallRemainingCount,
  };
}

function signalFromCandidate(candidate: CandidateScore, selectedTile: string): Stage8CanonicalMctsCandidateSignal {
  const defense = candidate.metadata.defense;
  const safetyScore = defense?.safetyPerTile.get(candidate.tile)?.safetyScore;
  return {
    baseScore: candidate.totalScore,
    shantenAfter: candidate.metadata.shantenAfter,
    route: candidate.metadata.isDalanRoute ? 'dalan' : 'normal',
    breaksRoute: candidate.breakdown.structurePenalty < 0,
    defenseRisk: defense ? Math.max(0, Math.min(1, 1 - (defense.defenseScore + 2) / 2)) : 0,
    dealInRisk: Number.isFinite(safetyScore) ? Math.max(0, Math.min(1, 1 - Number(safetyScore))) : 0,
    scoreImpact: candidate.metadata.expectedBaseScore,
    waitCount: candidate.metadata.isTenpaiAfter ? Math.max(1, candidate.metadata.effectiveCount) : 0,
    waitRemaining: candidate.metadata.isTenpaiAfter ? Math.max(1, candidate.metadata.effectiveCount) : 0,
    coreSequenceBreak: candidate.metadata.destroyedStructureType === 'mianzi',
    breaksPair: candidate.metadata.breaksPair,
    dragonComboBreak: candidate.metadata.dragonComboBreak,
    isolatedDiscardPriority: candidate.metadata.isolatedDiscardPriority,
    mixedRouteType: candidate.metadata.mixedRoute?.type || null,
    mixedRouteReason: candidate.metadata.mixedRoute?.reason || null,
    isStrongRuleChoice: candidate.tile === selectedTile,
  };
}

export function hashStage8BcTeacherDefinition(): string {
  return hashStage8OfflineIdentity({
    protocolVersion: STAGE8_BC_TEACHER_VERSION,
    stage7UnifiedDecisionVersion: 'stage7-unified-decision-v1',
    strongRuleVersion: 'strong-rule-ai-stage3-v1',
    searchEnhancementVersion: 'stage5-mcts-enhancement-v1',
    scoreSurface: 'complete-canonical-deterministic-score-surface',
    modelFusion: false,
    temperature: STAGE8_BC_TEACHER_TEMPERATURE as typeof STAGE8_BC_TEACHER_TEMPERATURE,
    selection: 'maximum-probability-then-canonical-key',
    input: 'strict-stage8-visible-projection-and-complete-canonical-legal-set',
  });
}

function validateEvidenceShape(evidence: Stage8BcTeacherEvidence): boolean {
  if (!exactKeys(evidence, ['protocolVersion','controlManifestSha256','teacherDefinitionSha256','visibleStateSha256','legalActionSetSha256','tensorContractSha256','legalActionKeys','rawScores','teacherDistribution','selectedActionKey','selectedActionIdentitySha256','decisionActor','visibleCurrentPlayer','visiblePhase','stage7StrongRuleActionKey','stage7ReasoningSha256','modelFusion','temperature','evidenceSha256'])) return false;
  if (!evidence || evidence.protocolVersion !== STAGE8_BC_TEACHER_VERSION || evidence.modelFusion !== false) return false;
  if (evidence.temperature !== STAGE8_BC_TEACHER_TEMPERATURE || evidence.teacherDefinitionSha256 !== hashStage8BcTeacherDefinition()) return false;
  if (evidence.tensorContractSha256 !== hashStage8OnnxTensorContract()) return false;
  if (![evidence.controlManifestSha256,evidence.visibleStateSha256,evidence.legalActionSetSha256,evidence.selectedActionIdentitySha256,evidence.evidenceSha256].every(isSha256)) return false;
  if (!Number.isInteger(evidence.decisionActor) || evidence.decisionActor < 0 || evidence.decisionActor > 3
    || !Number.isInteger(evidence.visibleCurrentPlayer) || evidence.visibleCurrentPlayer < 0 || evidence.visibleCurrentPlayer > 3
    || !['discarding','responding'].includes(evidence.visiblePhase)) return false;
  if (evidence.visiblePhase === 'discarding' && evidence.decisionActor !== evidence.visibleCurrentPlayer) return false;
  const keys = evidence.legalActionKeys;
  if (!Array.isArray(keys) || !keys.length || keys.some((key, index) => typeof key !== 'string' || (index > 0 && keys[index - 1] >= key))) return false;
  const scoreKeys = Object.keys(evidence.rawScores).sort();
  const distributionKeys = Object.keys(evidence.teacherDistribution).sort();
  if (scoreKeys.some((key, index) => key !== keys[index]) || scoreKeys.length !== keys.length) return false;
  if (distributionKeys.some((key, index) => key !== keys[index]) || distributionKeys.length !== keys.length) return false;
  if (keys.some((key) => !Number.isFinite(evidence.rawScores[key]))) return false;
  const probabilities = keys.map((key) => evidence.teacherDistribution[key]);
  if (probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return false;
  if (Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) > 1e-12) return false;
  if (!keys.includes(evidence.selectedActionKey)) return false;
  if (evidence.stage7StrongRuleActionKey != null && !keys.includes(evidence.stage7StrongRuleActionKey)) return false;
  if (evidence.stage7ReasoningSha256 != null && !isSha256(evidence.stage7ReasoningSha256)) return false;
  const { evidenceSha256: _evidenceSha256, ...payload } = evidence;
  return evidence.evidenceSha256 === hashStage8OfflineIdentity(payload);
}

export function validateStage8BcTeacherEvidence(evidence: Stage8BcTeacherEvidence): boolean {
  return validateEvidenceShape(evidence);
}

/** Evaluates one in-memory teacher decision without model inference, page code, files, or runtime side effects. */
export function evaluateStage8BcTeacher(input: {
  control: Stage8BcControlManifest;
  visibleState: Stage8OfflineVisibleState;
  legalActions: readonly CanonicalStage8V2Action[];
  completeLegalActionSetSha256: string;
}): Stage8BcTeacherResult {
  const runId = input.control?.identity?.runId;
  const control = validateStage8BcControlManifest(input.control);
  if (!control.ok) return { ok: false, decision: control.decision };
  if (input.control.identity.teacherDefinitionSha256 !== hashStage8BcTeacherDefinition()) return fail(runId, 'bc-teacher-definition-identity-mismatch');
  if (input.control.identity.tensorContractSha256 !== hashStage8OnnxTensorContract()) return fail(runId, 'bc-teacher-tensor-contract-mismatch');
  if (!isStage8CanonicalMctsVisibleState(input.visibleState)) return fail(runId, 'bc-teacher-visible-state-invalid');
  const visiblePhase = input.visibleState.phase;
  if (visiblePhase !== 'discarding' && visiblePhase !== 'responding') return fail(runId, 'bc-teacher-visible-phase-invalid');
  if (visiblePhase === 'discarding' && input.visibleState.actor !== input.visibleState.currentPlayer) return fail(runId, 'bc-teacher-discarding-seat-mismatch');
  const legalActions = sortStage8CanonicalActions(input.legalActions);
  if (!legalActions.length) return fail(runId, 'bc-teacher-legal-actions-empty');
  if (legalActions.some((action) => action.context.actor !== input.visibleState.actor)) return fail(runId, 'bc-teacher-legal-action-actor-mismatch');
  const legalActionSetSha256 = hashStage8CanonicalActionSet(legalActions);
  if (input.completeLegalActionSetSha256 !== legalActionSetSha256) return fail(runId, 'bc-teacher-complete-legal-action-set-mismatch');
  try {
    encodeStage8OnnxTensorBatch({ visibleState: input.visibleState, legalActions });
  } catch {
    return fail(runId, 'bc-teacher-visible-or-action-schema-invalid');
  }

  const signals: Record<string, Stage8CanonicalMctsCandidateSignal> = {};
  let stage7StrongRuleActionKey: string | null = null;
  let stage7ReasoningSha256: string | null = null;
  const discardActions = legalActions.filter((action) => action.actionType === 'discard');
  if (visiblePhase === 'discarding' && discardActions.length) {
    let decision;
    try {
      decision = makeDecision(strongRuleState(input.visibleState));
    } catch {
      return fail(runId, 'bc-teacher-stage7-decision-failed');
    }
    const byTile = new Map(decision.allCandidates.map((candidate) => [candidate.tile, candidate]));
    if (discardActions.some((action) => !action.tile || !byTile.has(action.tile))) return fail(runId, 'bc-teacher-stage7-candidate-incomplete');
    const selected = discardActions.find((action) => action.tile === decision.selectedTile);
    if (!selected) return fail(runId, 'bc-teacher-stage7-selected-action-illegal');
    stage7StrongRuleActionKey = stage8CanonicalActionKey(selected);
    stage7ReasoningSha256 = hashStage8OfflineIdentity(decision.reasoning);
    for (const action of discardActions) {
      signals[stage8CanonicalActionKey(action)] = signalFromCandidate(byTile.get(action.tile!)!, decision.selectedTile);
    }
  }

  let surface;
  try {
    surface = scoreStage8CanonicalMctsSurface({ visibleState: input.visibleState, legalActions, candidateSignals: signals });
  } catch {
    return fail(runId, 'bc-teacher-score-surface-invalid');
  }
  const rawValues = surface.legalActionKeys.map((key) => surface.scores[key]);
  let probabilities: number[];
  try {
    probabilities = normalizeStage8CanonicalMctsScores(rawValues, STAGE8_BC_TEACHER_TEMPERATURE);
  } catch {
    return fail(runId, 'bc-teacher-distribution-invalid');
  }
  const teacherDistribution = Object.fromEntries(surface.legalActionKeys.map((key, index) => [key, probabilities[index]]));
  const selectedActionKey = surface.legalActionKeys.slice().sort((left, right) => {
    const probabilityDifference = teacherDistribution[right] - teacherDistribution[left];
    return probabilityDifference || left.localeCompare(right);
  })[0];
  const selectedAction = surface.legalActions.find((action) => stage8CanonicalActionKey(action) === selectedActionKey);
  if (!selectedAction) return fail(runId, 'bc-teacher-selected-action-illegal');
  const payload = {
    protocolVersion: STAGE8_BC_TEACHER_VERSION as typeof STAGE8_BC_TEACHER_VERSION,
    controlManifestSha256: input.control.manifestSha256,
    teacherDefinitionSha256: hashStage8BcTeacherDefinition(),
    visibleStateSha256: hashStage8OfflineIdentity(input.visibleState),
    legalActionSetSha256,
    tensorContractSha256: hashStage8OnnxTensorContract(),
    legalActionKeys: surface.legalActionKeys,
    rawScores: surface.scores,
    teacherDistribution,
    selectedActionKey,
    selectedActionIdentitySha256: hashStage8OfflineIdentity(selectedAction),
    decisionActor: input.visibleState.actor,
    visibleCurrentPlayer: input.visibleState.currentPlayer,
    visiblePhase,
    stage7StrongRuleActionKey,
    stage7ReasoningSha256,
    modelFusion: false as const,
    temperature: STAGE8_BC_TEACHER_TEMPERATURE as typeof STAGE8_BC_TEACHER_TEMPERATURE,
  };
  const evidence: Stage8BcTeacherEvidence = { ...payload, evidenceSha256: hashStage8OfflineIdentity(payload) };
  if (!validateEvidenceShape(evidence)) return fail(runId, 'bc-teacher-evidence-invalid');
  return { ok: true, value: { legalActions: surface.legalActions, selectedAction, evidence } };
}
