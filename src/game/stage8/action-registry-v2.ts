import type { Tile } from '../rules';

export const STAGE8_ACTION_SPACE_V2_VERSION = 'stage8-action-space-v2';

export const STAGE8_V2_TILE_KEYS: Tile[] = [
  'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9',
  'tong1', 'tong2', 'tong3', 'tong4', 'tong5', 'tong6', 'tong7', 'tong8', 'tong9',
  'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao9',
  'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai',
];

export type Stage8V2ActionType =
  | 'pass'
  | 'discard'
  | 'pong'
  | 'win'
  | 'directChisel'
  | 'forcedRunImmediate'
  | 'forcedRunDeferred'
  | 'addedKong'
  | 'chainKong'
  | 'normalConcealedKong'
  | 'forcedRunConcealed'
  | 'postPongCandidateConcealedKong'
  | 'doublePongForcedRun'
  | 'declineKong';

export const STAGE8_ACTION_REGISTRY_V2 = Object.freeze({
  pass: Object.freeze({ baseId: 100, tiled: false }),
  discard: Object.freeze({ baseId: 200, tiled: true }),
  pong: Object.freeze({ baseId: 300, tiled: true }),
  win: Object.freeze({ baseId: 400, tiled: false }),
  directChisel: Object.freeze({ baseId: 500, tiled: true }),
  forcedRunImmediate: Object.freeze({ baseId: 600, tiled: true }),
  forcedRunDeferred: Object.freeze({ baseId: 700, tiled: true }),
  addedKong: Object.freeze({ baseId: 800, tiled: true }),
  chainKong: Object.freeze({ baseId: 900, tiled: true }),
  normalConcealedKong: Object.freeze({ baseId: 1000, tiled: true }),
  forcedRunConcealed: Object.freeze({ baseId: 1100, tiled: true }),
  postPongCandidateConcealedKong: Object.freeze({ baseId: 1200, tiled: true }),
  doublePongForcedRun: Object.freeze({ baseId: 1300, parameterized: true, width: 1156 }),
  declineKong: Object.freeze({ baseId: 2500, tiled: false }),
});

export interface Stage8V2ProtocolInput {
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
}

export interface Stage8V2RawAction {
  actionType: Stage8V2ActionType;
  actor: number;
  declarationWindow: 'discard-response' | 'self-draw-discard' | 'post-pong-discard' | 'chain-kong';
  tile?: Tile;
  selectedTile?: Tile;
  conditionalTile?: Tile;
  ownTileCount?: number;
  robKongWindow: boolean;
  resourceSignature?: string;
}

export interface CanonicalStage8V2Action {
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
  actionType: Stage8V2ActionType;
  actionId: number;
  tile?: Tile;
  context: {
    actor: number;
    declarationWindow: Stage8V2RawAction['declarationWindow'];
    ownTileCount?: number;
    robKongWindow: boolean;
    resourceSignature?: string;
  };
}

const forbiddenV1Fields = new Set([
  'replayCursor', 'checkpoint', 'model', 'manifest', 'workRoot', 'v1ActionId', 'v1ActionSpaceVersion',
]);

export function assertStage8V2Protocol(input: Record<string, unknown>): void {
  if (input.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION) {
    throw new Error('stage8-action-space-v2 protocol required');
  }
  const visited = new Set<unknown>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenV1Fields.has(key)) throw new Error(`v1 artifact field rejected: ${key}`);
      visit(child);
    }
  };
  visit(input);
}

export function stage8V2TileIndex(tile: Tile): number {
  const index = STAGE8_V2_TILE_KEYS.indexOf(tile);
  if (index < 0) throw new Error(`unknown stage8 v2 tile: ${tile}`);
  return index;
}

export function canonicalizeStage8V2Action(raw: Stage8V2RawAction): CanonicalStage8V2Action {
  const registry = STAGE8_ACTION_REGISTRY_V2[raw.actionType];
  let actionId = registry.baseId;
  if ('tiled' in registry && registry.tiled) {
    if (!raw.tile) throw new Error(`stage8 v2 tile required for ${raw.actionType}`);
    actionId += stage8V2TileIndex(raw.tile);
  } else if ('parameterized' in registry && registry.parameterized) {
    if (!raw.selectedTile || !raw.conditionalTile) throw new Error('doublePongForcedRun requires selected and conditional tiles');
    actionId += stage8V2TileIndex(raw.selectedTile) * STAGE8_V2_TILE_KEYS.length + stage8V2TileIndex(raw.conditionalTile);
  }
  return {
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    actionType: raw.actionType,
    actionId,
    ...(raw.tile ? { tile: raw.tile } : {}),
    context: {
      actor: raw.actor,
      declarationWindow: raw.declarationWindow,
      ...(raw.ownTileCount == null ? {} : { ownTileCount: raw.ownTileCount }),
      robKongWindow: raw.robKongWindow,
      ...(raw.resourceSignature ? { resourceSignature: raw.resourceSignature } : {}),
    },
  };
}