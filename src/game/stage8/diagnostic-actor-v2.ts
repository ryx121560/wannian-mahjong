import { createHash } from 'node:crypto';

import type { Tile } from '../rules';
import {
  STAGE8_ACTION_REGISTRY_V2,
  STAGE8_ACTION_SPACE_V2_VERSION,
  STAGE8_V2_TILE_KEYS,
  stage8V2TileIndex,
} from './action-registry-v2';
import type {
  CanonicalStage8V2Action,
  Stage8V2ActionType,
} from './action-registry-v2';

export const STAGE8_C4_DIAGNOSTIC_ACTOR = Object.freeze({
  actorId: 'c4-diagnostic-v2-canonical-sampler',
  actorVersion: 'stage8-c4-diagnostic-v2-actor-v1',
  observationSchemaVersion: 'stage8-c4-diagnostic-actor-observation-v1',
  authorizationSchemaVersion: 'stage8-c4-rule-authorized-actions-v1',
  decisionSchemaVersion: 'stage8-c4-diagnostic-actor-decision-v1',
  actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
  rootSeed: 2026080901,
  seedDomain: 'stage8-c4-diagnostic-v2-actor-v1',
  seedDerivation: 'sha256(domain\\0rootSeed\\0gameId\\0decisionIndex\\0actorSeat)',
  actionOrdering: 'canonical-action-id-ascending',
  seedFingerprint: '2B96C862E701479246B432F7F1941AC14AC96B6DFBDD4F5A1A7A5D7188FA3A91',
  plannedConfigFingerprint: '008CF41F524E1336E47308CAF957625240F5F191A3CA7A9CD63F6F7C39C33C68',
});

const forbiddenInputFields = new Set([
  'GameState', 'gameState', 'state', 'wallTiles', 'wallTop', 'futureWall',
  'opponentHands', 'hiddenHand', 'hiddenState', 'hiddenSimulationState',
  'policyLogits', 'c3PolicyLogits', 'v1ActionIds', 'v1ActionId',
  'v1ActionSpaceVersion', 'replay', 'replayCursor', 'checkpoint', 'model',
  'manifest', 'workRoot', 'userRecords',
]);

const observationSourceKeys = new Set([
  'actorSeat', 'actorOwnVisibleHand', 'publicMelds', 'publicDiscards', 'scores',
  'turn', 'phase', 'publicLastDiscard', 'actorOwnedPublicResourceSummaries',
  'wallRemainingCount',
]);
const observationKeys = new Set([
  'schemaVersion', 'actionSpaceVersion', ...observationSourceKeys,
]);
const canonicalActionKeys = new Set(['actionSpaceVersion', 'actionType', 'actionId', 'tile', 'context']);
const canonicalContextKeys = new Set([
  'actor', 'declarationWindow', 'ownTileCount', 'robKongWindow', 'resourceSignature',
]);
const declarationWindows = new Set(['discard-response', 'self-draw-discard', 'post-pong-discard', 'chain-kong']);
const actionTypes = new Set(Object.keys(STAGE8_ACTION_REGISTRY_V2) as Stage8V2ActionType[]);
const trustedAuthorizations = new WeakSet<object>();

export interface Stage8C4DiagnosticPublicMeld {
  owner: number;
  type: string;
  tiles: Tile[];
  fromPlayer?: number;
}

export interface Stage8C4DiagnosticPublicDiscards {
  owner: number;
  tiles: Tile[];
}

export interface Stage8C4DiagnosticResourceSummary {
  resourceType: string;
  tile: Tile;
  status: string;
  signature: string;
}

export interface Stage8C4DiagnosticActorObservationSource {
  actorSeat: number;
  actorOwnVisibleHand: Tile[];
  publicMelds: Stage8C4DiagnosticPublicMeld[];
  publicDiscards: Stage8C4DiagnosticPublicDiscards[];
  scores: number[];
  turn: number;
  phase: string;
  publicLastDiscard: { player: number; tile: Tile } | null;
  actorOwnedPublicResourceSummaries: Stage8C4DiagnosticResourceSummary[];
  wallRemainingCount: number;
}

export interface Stage8C4DiagnosticActorObservation extends Stage8C4DiagnosticActorObservationSource {
  schemaVersion: typeof STAGE8_C4_DIAGNOSTIC_ACTOR.observationSchemaVersion;
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
}

export type Stage8C4RulePriority =
  | { kind: 'normal' }
  | { kind: 'win' | 'rob-kong'; winnerSeat: number };

export interface Stage8C4RuleAuthorizationInput {
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
  actorSeat: number;
  priority: Stage8C4RulePriority;
  canonicalLegalActions: CanonicalStage8V2Action[];
}

export interface Stage8C4RuleAuthorizedActions {
  schemaVersion: typeof STAGE8_C4_DIAGNOSTIC_ACTOR.authorizationSchemaVersion;
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
  actorSeat: number;
  priority: Stage8C4RulePriority;
  canonicalLegalActions: readonly CanonicalStage8V2Action[];
}

export interface Stage8C4DiagnosticActorInput {
  actorVersion: typeof STAGE8_C4_DIAGNOSTIC_ACTOR.actorVersion;
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
  rootSeed: number;
  gameId: string;
  decisionIndex: number;
  actorSeat: number;
  observation: Stage8C4DiagnosticActorObservation;
  authorizedActions: Stage8C4RuleAuthorizedActions;
}

export interface Stage8C4DiagnosticActorDecision {
  schemaVersion: typeof STAGE8_C4_DIAGNOSTIC_ACTOR.decisionSchemaVersion;
  actorId: typeof STAGE8_C4_DIAGNOSTIC_ACTOR.actorId;
  actorVersion: typeof STAGE8_C4_DIAGNOSTIC_ACTOR.actorVersion;
  actionSpaceVersion: typeof STAGE8_ACTION_SPACE_V2_VERSION;
  actorSeat: number;
  actionId: number;
  actionType: Stage8V2ActionType;
  candidateCount: number;
  selectionProbability: number;
  decisionDigestSha256: string;
  legalActionIdsSha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertPlainDataContainer(value: object, label: string): void {
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new Error(`${label} plain data object required`);
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} plain data object required`);
  }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  assertPlainDataContainer(value, label);
}

function ownEnumerableDataEntries(value: object, label: string): Array<[string, unknown]> {
  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length > 0) throw new Error(`${label} symbol actor field rejected`);
  const entries: Array<[string, unknown]> = [];
  for (const key of Object.getOwnPropertyNames(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) throw new Error(`${label} property descriptor unavailable: ${key}`);
    if (!descriptor.enumerable) throw new Error(`non-enumerable actor field rejected: ${key}`);
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new Error(`accessor actor field rejected: ${key}`);
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function scanForbiddenFields(value: unknown, visited = new Set<unknown>()): void {
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  assertPlainDataContainer(value, 'external actor input');
  visited.add(value);
  for (const [key, child] of ownEnumerableDataEntries(value, 'external actor input')) {
    if (forbiddenInputFields.has(key)) throw new Error(`forbidden actor field rejected: ${key}`);
    scanForbiddenFields(child, visited);
  }
}

function assertExactKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  assertPlainDataContainer(value, label);
  const names = ownEnumerableDataEntries(value, label).map(([key]) => key);
  for (const key of names) {
    if (!allowed.has(key)) throw new Error(`${label} unapproved field: ${key}`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key) && !['tile', 'fromPlayer', 'ownTileCount', 'resourceSignature'].includes(key)) {
      throw new Error(`${label} missing field: ${key}`);
    }
  }
}

function assertSeat(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 3) throw new Error(`${label} must be a seat from 0 to 3`);
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`);
}

function assertFiniteScores(value: unknown): asserts value is number[] {
  if (!Array.isArray(value) || value.length !== 4 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new Error('scores must contain four finite values');
  }
}

function assertTile(value: unknown, label: string): asserts value is Tile {
  if (!STAGE8_V2_TILE_KEYS.includes(value as Tile)) throw new Error(`${label} must be a canonical tile`);
}

function assertTileArray(value: unknown, label: string): asserts value is Tile[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  value.forEach((tile, index) => assertTile(tile, `${label}[${index}]`));
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
}

function freezeDeep<T>(value: T, visited = new Set<unknown>()): T {
  if (!value || typeof value !== 'object' || visited.has(value)) return value;
  visited.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child, visited);
  return Object.freeze(value);
}

function validateObservationShape(value: unknown): asserts value is Stage8C4DiagnosticActorObservation {
  scanForbiddenFields(value);
  assertRecord(value, 'diagnostic actor observation');
  assertExactKeys(value, observationKeys, 'diagnostic actor observation');
  if (value.schemaVersion !== STAGE8_C4_DIAGNOSTIC_ACTOR.observationSchemaVersion) throw new Error('diagnostic actor observation schema required');
  if (value.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION) throw new Error('stage8-action-space-v2 observation required');
  assertSeat(value.actorSeat, 'actorSeat');
  assertTileArray(value.actorOwnVisibleHand, 'actorOwnVisibleHand');
  assertFiniteScores(value.scores);
  assertNonNegativeInteger(value.turn, 'turn');
  assertNonEmptyString(value.phase, 'phase');
  assertNonNegativeInteger(value.wallRemainingCount, 'wallRemainingCount');

  if (!Array.isArray(value.publicMelds)) throw new Error('publicMelds must be an array');
  for (const [index, meldValue] of value.publicMelds.entries()) {
    assertRecord(meldValue, `publicMelds[${index}]`);
    assertExactKeys(meldValue, new Set(['owner', 'type', 'tiles', 'fromPlayer']), `publicMelds[${index}]`);
    assertSeat(meldValue.owner, `publicMelds[${index}].owner`);
    assertNonEmptyString(meldValue.type, `publicMelds[${index}].type`);
    assertTileArray(meldValue.tiles, `publicMelds[${index}].tiles`);
    if (meldValue.fromPlayer != null) assertSeat(meldValue.fromPlayer, `publicMelds[${index}].fromPlayer`);
  }

  if (!Array.isArray(value.publicDiscards)) throw new Error('publicDiscards must be an array');
  for (const [index, discardValue] of value.publicDiscards.entries()) {
    assertRecord(discardValue, `publicDiscards[${index}]`);
    assertExactKeys(discardValue, new Set(['owner', 'tiles']), `publicDiscards[${index}]`);
    assertSeat(discardValue.owner, `publicDiscards[${index}].owner`);
    assertTileArray(discardValue.tiles, `publicDiscards[${index}].tiles`);
  }

  if (value.publicLastDiscard != null) {
    assertRecord(value.publicLastDiscard, 'publicLastDiscard');
    assertExactKeys(value.publicLastDiscard, new Set(['player', 'tile']), 'publicLastDiscard');
    assertSeat(value.publicLastDiscard.player, 'publicLastDiscard.player');
    assertTile(value.publicLastDiscard.tile, 'publicLastDiscard.tile');
  }

  if (!Array.isArray(value.actorOwnedPublicResourceSummaries)) throw new Error('actorOwnedPublicResourceSummaries must be an array');
  for (const [index, resourceValue] of value.actorOwnedPublicResourceSummaries.entries()) {
    assertRecord(resourceValue, `actorOwnedPublicResourceSummaries[${index}]`);
    assertExactKeys(resourceValue, new Set(['resourceType', 'tile', 'status', 'signature']), `actorOwnedPublicResourceSummaries[${index}]`);
    assertNonEmptyString(resourceValue.resourceType, `actorOwnedPublicResourceSummaries[${index}].resourceType`);
    assertTile(resourceValue.tile, `actorOwnedPublicResourceSummaries[${index}].tile`);
    assertNonEmptyString(resourceValue.status, `actorOwnedPublicResourceSummaries[${index}].status`);
    assertNonEmptyString(resourceValue.signature, `actorOwnedPublicResourceSummaries[${index}].signature`);
  }
}

export function projectStage8C4DiagnosticActorObservation(
  input: Stage8C4DiagnosticActorObservationSource,
): Stage8C4DiagnosticActorObservation {
  scanForbiddenFields(input);
  assertRecord(input, 'diagnostic actor observation source');
  assertExactKeys(input, observationSourceKeys, 'diagnostic actor observation source');
  const projected = {
    schemaVersion: STAGE8_C4_DIAGNOSTIC_ACTOR.observationSchemaVersion,
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    actorSeat: input.actorSeat,
    actorOwnVisibleHand: input.actorOwnVisibleHand.slice(),
    publicMelds: input.publicMelds.map((meld) => ({
      owner: meld.owner,
      type: meld.type,
      tiles: meld.tiles.slice(),
      ...(meld.fromPlayer == null ? {} : { fromPlayer: meld.fromPlayer }),
    })),
    publicDiscards: input.publicDiscards.map((entry) => ({ owner: entry.owner, tiles: entry.tiles.slice() })),
    scores: input.scores.slice(),
    turn: input.turn,
    phase: input.phase,
    publicLastDiscard: input.publicLastDiscard == null ? null : { ...input.publicLastDiscard },
    actorOwnedPublicResourceSummaries: input.actorOwnedPublicResourceSummaries.map((resource) => ({ ...resource })),
    wallRemainingCount: input.wallRemainingCount,
  };
  validateObservationShape(projected);
  return freezeDeep(projected) as Stage8C4DiagnosticActorObservation;
}

function validateCanonicalAction(action: unknown, actorSeat: number): CanonicalStage8V2Action {
  assertRecord(action, 'canonical action');
  assertExactKeys(action, canonicalActionKeys, 'canonical action');
  if (action.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION) throw new Error('non-canonical v2 action version');
  if (!actionTypes.has(action.actionType as Stage8V2ActionType)) throw new Error(`non-canonical action type: ${String(action.actionType)}`);
  if (!Number.isInteger(action.actionId)) throw new Error('non-canonical action id');
  assertRecord(action.context, 'canonical action context');
  assertExactKeys(action.context, canonicalContextKeys, 'canonical action context');
  assertSeat(action.context.actor, 'canonical action actor');
  if (action.context.actor !== actorSeat) throw new Error('canonical action actor mismatch');
  if (!declarationWindows.has(String(action.context.declarationWindow))) throw new Error('non-canonical declaration window');
  if (typeof action.context.robKongWindow !== 'boolean') throw new Error('non-canonical robKongWindow');
  if (action.context.ownTileCount != null) assertNonNegativeInteger(action.context.ownTileCount, 'canonical ownTileCount');
  if (action.context.resourceSignature != null) assertNonEmptyString(action.context.resourceSignature, 'canonical resourceSignature');

  const actionType = action.actionType as Stage8V2ActionType;
  const registry = STAGE8_ACTION_REGISTRY_V2[actionType];
  let expectedActionId = registry.baseId;
  if ('tiled' in registry && registry.tiled) {
    assertTile(action.tile, 'canonical action tile');
    expectedActionId += stage8V2TileIndex(action.tile);
  } else if ('parameterized' in registry && registry.parameterized) {
    if (action.tile != null) throw new Error('non-canonical parameterized action tile');
    const signature = String(action.context.resourceSignature || '');
    const match = /^\d+:([^|]+)\|\d+:(.+)$/.exec(signature);
    if (!match) throw new Error('non-canonical double-pong resource signature');
    assertTile(match[1], 'double-pong selected tile');
    assertTile(match[2], 'double-pong conditional tile');
    expectedActionId += stage8V2TileIndex(match[1]) * STAGE8_V2_TILE_KEYS.length + stage8V2TileIndex(match[2]);
  } else if (action.tile != null) {
    throw new Error('non-canonical untiled action');
  }
  if (action.actionId !== expectedActionId) throw new Error('canonical action mismatch: non-canonical actionId');
  return freezeDeep({
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    actionType,
    actionId: action.actionId,
    ...(action.tile == null ? {} : { tile: action.tile as Tile }),
    context: {
      actor: action.context.actor,
      declarationWindow: action.context.declarationWindow as CanonicalStage8V2Action['context']['declarationWindow'],
      ...(action.context.ownTileCount == null ? {} : { ownTileCount: action.context.ownTileCount }),
      robKongWindow: action.context.robKongWindow,
      ...(action.context.resourceSignature == null ? {} : { resourceSignature: action.context.resourceSignature }),
    },
  });
}

function validateSortedCanonicalActions(actions: unknown, actorSeat: number): readonly CanonicalStage8V2Action[] {
  if (!Array.isArray(actions) || actions.length === 0) throw new Error('rule-authorized canonical actions must not be empty');
  const validated = actions.map((action) => validateCanonicalAction(action, actorSeat));
  for (let index = 1; index < validated.length; index += 1) {
    if (validated[index].actionId === validated[index - 1].actionId) throw new Error(`duplicate canonical actionId: ${validated[index].actionId}`);
    if (validated[index].actionId < validated[index - 1].actionId) throw new Error('canonical actions must be strictly sorted by actionId');
  }
  return freezeDeep(validated.slice());
}

function validatePriority(priority: unknown, actorSeat: number, actions: readonly CanonicalStage8V2Action[]): Stage8C4RulePriority {
  assertRecord(priority, 'rule priority');
  if (priority.kind === 'normal') {
    assertExactKeys(priority, new Set(['kind']), 'rule priority');
    if (actions.some((action) => action.actionType === 'win')) throw new Error('priority violation: win requires resolved winner priority');
    return freezeDeep({ kind: 'normal' as const });
  }
  if (priority.kind === 'win' || priority.kind === 'rob-kong') {
    assertExactKeys(priority, new Set(['kind', 'winnerSeat']), 'rule priority');
    assertSeat(priority.winnerSeat, 'priority winnerSeat');
    if (priority.winnerSeat !== actorSeat) throw new Error('priority winner must equal actor seat');
    const illegal = actions.find((action) => action.actionType !== 'win' && action.actionType !== 'pass');
    if (illegal) throw new Error(`priority violation: ${illegal.actionType} suppressed by ${priority.kind}`);
    if (!actions.some((action) => action.actionType === 'win')) throw new Error('priority violation: resolved winner has no win action');
    return freezeDeep({ kind: priority.kind, winnerSeat: priority.winnerSeat });
  }
  throw new Error(`unsupported rule priority: ${String(priority.kind)}`);
}

export function authorizeStage8C4RuleActions(input: Stage8C4RuleAuthorizationInput): Stage8C4RuleAuthorizedActions {
  scanForbiddenFields(input);
  assertRecord(input, 'rule authorization input');
  assertExactKeys(input, new Set(['actionSpaceVersion', 'actorSeat', 'priority', 'canonicalLegalActions']), 'rule authorization input');
  if (input.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION) throw new Error('stage8-action-space-v2 rule authorization required');
  assertSeat(input.actorSeat, 'actorSeat');
  const actions = validateSortedCanonicalActions(input.canonicalLegalActions, input.actorSeat);
  const priority = validatePriority(input.priority, input.actorSeat, actions);
  const authorization = freezeDeep({
    schemaVersion: STAGE8_C4_DIAGNOSTIC_ACTOR.authorizationSchemaVersion,
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    actorSeat: input.actorSeat,
    priority,
    canonicalLegalActions: actions,
  }) as Stage8C4RuleAuthorizedActions;
  trustedAuthorizations.add(authorization);
  return authorization;
}

function sha256(value: string): { hex: string; unsigned64: bigint } {
  const digest = createHash('sha256').update(value, 'utf8').digest();
  return { hex: digest.toString('hex').toUpperCase(), unsigned64: digest.readBigUInt64BE(0) };
}

export function selectStage8C4DiagnosticAction(input: Stage8C4DiagnosticActorInput): Stage8C4DiagnosticActorDecision {
  scanForbiddenFields(input);
  assertRecord(input, 'diagnostic actor input');
  assertExactKeys(input, new Set([
    'actorVersion', 'actionSpaceVersion', 'rootSeed', 'gameId', 'decisionIndex',
    'actorSeat', 'observation', 'authorizedActions',
  ]), 'diagnostic actor input');
  if (input.actorVersion !== STAGE8_C4_DIAGNOSTIC_ACTOR.actorVersion) throw new Error('frozen diagnostic actor version required');
  if (input.actionSpaceVersion !== STAGE8_ACTION_SPACE_V2_VERSION) throw new Error('stage8-action-space-v2 actor input required');
  if (input.rootSeed !== STAGE8_C4_DIAGNOSTIC_ACTOR.rootSeed) throw new Error('frozen rootSeed required');
  assertNonEmptyString(input.gameId, 'gameId');
  assertNonNegativeInteger(input.decisionIndex, 'decisionIndex');
  assertSeat(input.actorSeat, 'actorSeat');
  validateObservationShape(input.observation);
  if (input.observation.actorSeat !== input.actorSeat) throw new Error('observation actor seat mismatch');
  if (!trustedAuthorizations.has(input.authorizedActions)) throw new Error('trusted rule authorization required');
  if (input.authorizedActions.actorSeat !== input.actorSeat) throw new Error('authorized actor seat mismatch');
  const actions = validateSortedCanonicalActions(input.authorizedActions.canonicalLegalActions, input.actorSeat);

  const seedInput = [
    STAGE8_C4_DIAGNOSTIC_ACTOR.seedDomain,
    String(input.rootSeed),
    input.gameId,
    String(input.decisionIndex),
    String(input.actorSeat),
  ].join('\0');
  const decisionDigest = sha256(seedInput);
  const selectedIndex = Number(decisionDigest.unsigned64 % BigInt(actions.length));
  const selected = actions[selectedIndex];
  const legalActionIdsSha256 = sha256(actions.map((action) => action.actionId).join(',')).hex;
  return freezeDeep({
    schemaVersion: STAGE8_C4_DIAGNOSTIC_ACTOR.decisionSchemaVersion,
    actorId: STAGE8_C4_DIAGNOSTIC_ACTOR.actorId,
    actorVersion: STAGE8_C4_DIAGNOSTIC_ACTOR.actorVersion,
    actionSpaceVersion: STAGE8_ACTION_SPACE_V2_VERSION,
    actorSeat: input.actorSeat,
    actionId: selected.actionId,
    actionType: selected.actionType,
    candidateCount: actions.length,
    selectionProbability: 1 / actions.length,
    decisionDigestSha256: decisionDigest.hex,
    legalActionIdsSha256,
  });
}