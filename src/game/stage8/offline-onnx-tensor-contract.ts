import type { Tile } from '../rules';
import {
  STAGE8_ACTION_SPACE_V2_VERSION,
  STAGE8_V2_TILE_KEYS,
  type CanonicalStage8V2Action,
  type Stage8V2ActionType,
} from './action-registry-v2';
import { hashStage8OfflineIdentity, sortStage8CanonicalActions, stage8CanonicalActionKey } from './offline-action-identity';
import type { Stage8OfflineVisibleState } from './offline-round-adapter';

export const STAGE8_ONNX_TENSOR_CONTRACT_VERSION = 'stage8-onnx-tensor-contract-v1';
export const STAGE8_ONNX_RUNTIME_PACKAGE = 'onnxruntime-node';
export const STAGE8_ONNX_RUNTIME_VERSION = '1.27.0';
export const STAGE8_ONNX_EXECUTION_PROVIDER = 'cpu';
export const STAGE8_ONNX_VISIBLE_STATE_INPUT = 'visible_state';
export const STAGE8_ONNX_CANONICAL_ACTION_INPUT = 'canonical_actions';
export const STAGE8_ONNX_LEGAL_ACTION_MASK_INPUT = 'legal_action_mask';
export const STAGE8_ONNX_POLICY_LOGITS_OUTPUT = 'policy_logits';
export const STAGE8_ONNX_VALUE_DELTA_OUTPUT = 'value_delta';

export const STAGE8_ONNX_ACTION_TYPES: readonly Stage8V2ActionType[] = Object.freeze([
  'pass', 'discard', 'pong', 'win', 'directChisel', 'forcedRunImmediate', 'forcedRunDeferred',
  'addedKong', 'chainKong', 'normalConcealedKong', 'forcedRunConcealed',
  'postPongCandidateConcealedKong', 'doublePongForcedRun', 'declineKong',
]);
export const STAGE8_ONNX_DECLARATION_WINDOWS = Object.freeze([
  'discard-response', 'self-draw-discard', 'post-pong-discard', 'chain-kong',
] as const);
export const STAGE8_ONNX_PHASES = Object.freeze(['drawing', 'discarding', 'responding', 'ended', 'idle'] as const);

export const STAGE8_ONNX_VISIBLE_FEATURE_COUNT = 5577;
export const STAGE8_ONNX_ACTION_FEATURE_COUNT = 181;

export const STAGE8_ONNX_SESSION_OPTIONS = Object.freeze({
  executionProviders: Object.freeze([STAGE8_ONNX_EXECUTION_PROVIDER]),
  graphOptimizationLevel: 'all',
  executionMode: 'sequential',
  enableCpuMemArena: true,
  enableMemPattern: true,
  intraOpNumThreads: 1,
  interOpNumThreads: 1,
} as const);

export interface Stage8OnnxTensorBatch {
  contractSha256: string;
  visibleStateSha256: string;
  legalActionSetSha256: string;
  legalActionKeys: string[];
  canonicalActions: CanonicalStage8V2Action[];
  visibleState: Float32Array;
  canonicalActionFeatures: Float32Array;
  legalActionMask: Float32Array;
  visibleStateDimensions: [1, typeof STAGE8_ONNX_VISIBLE_FEATURE_COUNT];
  canonicalActionDimensions: [1, number, typeof STAGE8_ONNX_ACTION_FEATURE_COUNT];
  legalActionMaskDimensions: [1, number];
}

const tileIndex = new Map<Tile, number>(STAGE8_V2_TILE_KEYS.map((tile, index) => [tile, index]));

function exactKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return required.every((key) => keys.includes(key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function validPlayer(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 4;
}

function validTile(value: unknown): value is Tile {
  return typeof value === 'string' && tileIndex.has(value as Tile);
}

function validTileList(value: unknown): value is Tile[] {
  return Array.isArray(value) && value.every(validTile);
}

function assertVisibleState(value: Stage8OfflineVisibleState): void {
  const required = ['actor', 'ownHand', 'publicMelds', 'publicDiscards', 'scores', 'dealer', 'turn', 'phase', 'currentPlayer', 'wallRemainingCount'];
  if (!exactKeys(value, required, ['lastDiscard', 'lastDiscardPlayer'])) throw new Error('stage8-onnx-visible-state-schema-invalid');
  if (!validPlayer(value.actor) || !validPlayer(value.dealer) || !validPlayer(value.currentPlayer)) throw new Error('stage8-onnx-visible-player-invalid');
  if (!validTileList(value.ownHand) || value.ownHand.length > 18) throw new Error('stage8-onnx-visible-own-hand-invalid');
  if (!Array.isArray(value.publicMelds) || value.publicMelds.length !== 4) throw new Error('stage8-onnx-visible-melds-invalid');
  for (const melds of value.publicMelds) {
    if (!Array.isArray(melds) || melds.length > 4) throw new Error('stage8-onnx-visible-melds-invalid');
    for (const meld of melds) {
      if (!exactKeys(meld, ['type', 'tiles'], ['fromPlayer']) || !['peng', 'mingGang', 'anGang', 'zhiChan', 'chi'].includes(String(meld.type)) || !validTileList(meld.tiles)) throw new Error('stage8-onnx-visible-meld-invalid');
      if (meld.fromPlayer != null && !validPlayer(meld.fromPlayer)) throw new Error('stage8-onnx-visible-meld-source-invalid');
    }
  }
  if (!Array.isArray(value.publicDiscards) || value.publicDiscards.length !== 4 || !value.publicDiscards.every((discards) => validTileList(discards) && discards.length <= 34)) throw new Error('stage8-onnx-visible-discards-invalid');
  if (!Array.isArray(value.scores) || value.scores.length !== 4 || !value.scores.every(Number.isFinite)) throw new Error('stage8-onnx-visible-scores-invalid');
  if (!Number.isInteger(value.turn) || value.turn < 0 || !Number.isInteger(value.wallRemainingCount) || value.wallRemainingCount < 0 || value.wallRemainingCount > 136) throw new Error('stage8-onnx-visible-round-invalid');
  if (!STAGE8_ONNX_PHASES.includes(value.phase as (typeof STAGE8_ONNX_PHASES)[number])) throw new Error('stage8-onnx-visible-phase-invalid');
  if (value.lastDiscard != null && !validTile(value.lastDiscard)) throw new Error('stage8-onnx-visible-last-discard-invalid');
  if (value.lastDiscardPlayer != null && !validPlayer(value.lastDiscardPlayer)) throw new Error('stage8-onnx-visible-last-discard-player-invalid');
}

function pushOneHot(output: number[], index: number, width: number): void {
  for (let current = 0; current < width; current += 1) output.push(current === index ? 1 : 0);
}

function pushTileCounts(output: number[], tiles: readonly Tile[]): void {
  const counts = Array<number>(STAGE8_V2_TILE_KEYS.length).fill(0);
  for (const tile of tiles) counts[tileIndex.get(tile)!] += 1;
  output.push(...counts.map((count) => count / 4));
}

function encodeVisibleState(value: Stage8OfflineVisibleState): Float32Array {
  assertVisibleState(value);
  const features: number[] = [];
  pushOneHot(features, value.actor, 4);
  pushTileCounts(features, value.ownHand);
  const meldTypes = ['peng', 'mingGang', 'anGang', 'zhiChan', 'chi'];
  for (const melds of value.publicMelds) {
    for (let slot = 0; slot < 4; slot += 1) {
      const meld = melds[slot];
      features.push(meld ? 1 : 0);
      pushOneHot(features, meld ? meldTypes.indexOf(meld.type) : -1, meldTypes.length);
      pushTileCounts(features, meld ? meld.tiles.filter((tile): tile is Tile => Boolean(tile)) : []);
      features.push(meld?.fromPlayer == null ? 0 : 1);
      pushOneHot(features, meld?.fromPlayer ?? -1, 4);
    }
  }
  for (const discards of value.publicDiscards) {
    for (let slot = 0; slot < 34; slot += 1) {
      const tile = discards[slot];
      features.push(tile ? 1 : 0);
      pushOneHot(features, tile ? tileIndex.get(tile)! : -1, STAGE8_V2_TILE_KEYS.length);
    }
  }
  features.push(...value.scores.map((score) => Math.tanh(score / 100)));
  pushOneHot(features, value.dealer, 4);
  features.push(Math.min(value.turn, 10000) / 10000);
  pushOneHot(features, STAGE8_ONNX_PHASES.indexOf(value.phase as (typeof STAGE8_ONNX_PHASES)[number]), STAGE8_ONNX_PHASES.length);
  pushOneHot(features, value.currentPlayer, 4);
  features.push(value.lastDiscard ? 1 : 0);
  pushOneHot(features, value.lastDiscard ? tileIndex.get(value.lastDiscard)! : -1, STAGE8_V2_TILE_KEYS.length);
  features.push(value.lastDiscardPlayer == null ? 0 : 1);
  pushOneHot(features, value.lastDiscardPlayer ?? -1, 4);
  features.push(value.wallRemainingCount / 136);
  if (features.length !== STAGE8_ONNX_VISIBLE_FEATURE_COUNT || !features.every(Number.isFinite)) throw new Error('stage8-onnx-visible-feature-contract-invalid');
  return Float32Array.from(features);
}

function hashLanes(value: string): number[] {
  const hash = hashStage8OfflineIdentity(value);
  return [0, 8, 16, 24].map((offset) => Number.parseInt(hash.slice(offset, offset + 8), 16) / 0xffffffff);
}

function assertCanonicalAction(action: CanonicalStage8V2Action): void {
  if (!exactKeys(action, ['actionSpaceVersion', 'actionType', 'actionId', 'context'], ['tile']) || action.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION) throw new Error('stage8-onnx-canonical-action-schema-invalid');
  if (!STAGE8_ONNX_ACTION_TYPES.includes(action.actionType) || !Number.isInteger(action.actionId) || action.actionId < 0 || action.actionId > 2500) throw new Error('stage8-onnx-canonical-action-identity-invalid');
  if (action.tile != null && !validTile(action.tile)) throw new Error('stage8-onnx-canonical-action-tile-invalid');
  if (!exactKeys(action.context, ['actor', 'declarationWindow', 'robKongWindow'], ['ownTileCount', 'resourceSignature']) || !validPlayer(action.context.actor) || !STAGE8_ONNX_DECLARATION_WINDOWS.includes(action.context.declarationWindow)) throw new Error('stage8-onnx-canonical-action-context-invalid');
  if (typeof action.context.robKongWindow !== 'boolean') throw new Error('stage8-onnx-canonical-action-rob-window-invalid');
  if (action.context.ownTileCount != null && (!Number.isInteger(action.context.ownTileCount) || action.context.ownTileCount < 0 || action.context.ownTileCount > 4)) throw new Error('stage8-onnx-canonical-action-tile-count-invalid');
  if (action.context.resourceSignature != null && (typeof action.context.resourceSignature !== 'string' || !action.context.resourceSignature || action.context.resourceSignature.length > 512)) throw new Error('stage8-onnx-canonical-action-resource-invalid');
}

function encodeAction(action: CanonicalStage8V2Action): number[] {
  assertCanonicalAction(action);
  const features: number[] = [];
  pushOneHot(features, STAGE8_ONNX_ACTION_TYPES.indexOf(action.actionType), STAGE8_ONNX_ACTION_TYPES.length);
  features.push(action.actionId / 2500);
  features.push(action.tile ? 1 : 0);
  pushOneHot(features, action.tile ? tileIndex.get(action.tile)! : -1, STAGE8_V2_TILE_KEYS.length);
  pushOneHot(features, action.context.actor, 4);
  pushOneHot(features, STAGE8_ONNX_DECLARATION_WINDOWS.indexOf(action.context.declarationWindow), STAGE8_ONNX_DECLARATION_WINDOWS.length);
  features.push(action.context.ownTileCount == null ? 0 : 1, (action.context.ownTileCount ?? 0) / 4);
  features.push(action.context.robKongWindow ? 1 : 0);
  const signature = action.context.resourceSignature;
  const tokens = signature ? signature.split(/[:|>]/) : [];
  const owners = tokens.filter((token) => /^[0-3]$/.test(token)).map(Number).slice(0, 2);
  const resourceTiles = tokens.filter(validTile).slice(0, 3);
  features.push(signature ? 1 : 0);
  for (let slot = 0; slot < 2; slot += 1) {
    features.push(owners[slot] == null ? 0 : 1);
    pushOneHot(features, owners[slot] ?? -1, 4);
  }
  for (let slot = 0; slot < 3; slot += 1) {
    const tile = resourceTiles[slot];
    features.push(tile ? 1 : 0);
    pushOneHot(features, tile ? tileIndex.get(tile)! : -1, STAGE8_V2_TILE_KEYS.length);
  }
  features.push(...(signature ? hashLanes(signature) : [0, 0, 0, 0]));
  if (features.length !== STAGE8_ONNX_ACTION_FEATURE_COUNT || !features.every(Number.isFinite)) throw new Error('stage8-onnx-action-feature-contract-invalid');
  return features;
}

export function hashStage8OnnxTensorContract(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_ONNX_TENSOR_CONTRACT_VERSION,
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    inputs: [
      { name: STAGE8_ONNX_VISIBLE_STATE_INPUT, type: 'float32', dimensions: [1, STAGE8_ONNX_VISIBLE_FEATURE_COUNT] },
      { name: STAGE8_ONNX_CANONICAL_ACTION_INPUT, type: 'float32', dimensions: [1, 'legal-action-count', STAGE8_ONNX_ACTION_FEATURE_COUNT] },
      { name: STAGE8_ONNX_LEGAL_ACTION_MASK_INPUT, type: 'float32', dimensions: [1, 'legal-action-count'], semantics: 'complete-canonical-legal-set-all-ones' },
    ],
    outputs: [
      { name: STAGE8_ONNX_POLICY_LOGITS_OUTPUT, type: 'float32', dimensions: [1, 'legal-action-count'] },
      { name: STAGE8_ONNX_VALUE_DELTA_OUTPUT, type: 'float32', dimensions: [1, 4], semantics: 'finite-near-zero-sum-seat-delta' },
    ],
    visibleSchema: 'strict-recursive-allowlist-v1',
    actionOrdering: 'stage8CanonicalActionKey-lexical',
    visibleLayout: 'own-multiset-public-meld-slots-with-type-source-public-discard-order-four-seats',
    canonicalContextLayout: 'typed-action-tile-actor-window-count-rob-resource-owner-and-ordered-tiles-plus-identity-hash',
    normalization: 'tile-count-div4-score-tanh100-turn-cap10000-wall-div136-action-id-div2500',
    hiddenInformation: 'opponent-hands-and-wall-order-forbidden',
  });
}

export function hashStage8OnnxSessionOptions(): string {
  return hashStage8OfflineIdentity({
    runtimePackage: STAGE8_ONNX_RUNTIME_PACKAGE,
    runtimeVersion: STAGE8_ONNX_RUNTIME_VERSION,
    options: STAGE8_ONNX_SESSION_OPTIONS,
    pathRead: 'forbidden-session-created-from-verified-immutable-bytes',
  });
}

export function encodeStage8OnnxTensorBatch(input: {
  visibleState: Stage8OfflineVisibleState;
  legalActions: readonly CanonicalStage8V2Action[];
}): Stage8OnnxTensorBatch {
  const canonicalActions = sortStage8CanonicalActions(input.legalActions);
  const legalActionKeys = canonicalActions.map(stage8CanonicalActionKey);
  if (!legalActionKeys.length || new Set(legalActionKeys).size !== legalActionKeys.length) throw new Error('stage8-onnx-legal-actions-invalid');
  const visibleState = encodeVisibleState(input.visibleState);
  const actionFeatures = canonicalActions.flatMap(encodeAction);
  const actionCount = canonicalActions.length;
  return {
    contractSha256: hashStage8OnnxTensorContract(),
    visibleStateSha256: hashStage8OfflineIdentity(input.visibleState),
    legalActionSetSha256: hashStage8OfflineIdentity(legalActionKeys),
    legalActionKeys,
    canonicalActions,
    visibleState,
    canonicalActionFeatures: Float32Array.from(actionFeatures),
    legalActionMask: Float32Array.from({ length: actionCount }, () => 1),
    visibleStateDimensions: [1, STAGE8_ONNX_VISIBLE_FEATURE_COUNT],
    canonicalActionDimensions: [1, actionCount, STAGE8_ONNX_ACTION_FEATURE_COUNT],
    legalActionMaskDimensions: [1, actionCount],
  };
}
