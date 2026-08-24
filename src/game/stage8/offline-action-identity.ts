import { createHash } from 'node:crypto';
import type { CanonicalStage8V2Action } from './action-registry-v2';

export const STAGE8_OFFLINE_ACTION_IDENTITY_VERSION = 'stage8-offline-action-identity-v1';

function canonicalize(value: unknown, seen: Set<unknown>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('stage8-offline-identity-non-finite-number');
    return JSON.stringify(value);
  }
  if (typeof value === 'undefined') return '"__undefined__"';
  if (typeof value !== 'object') throw new Error('stage8-offline-identity-unsupported-value');
  if (seen.has(value)) throw new Error('stage8-offline-identity-cycle');
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, seen)).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`).join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalizeStage8OfflineIdentity(value: unknown): string {
  return canonicalize(value, new Set());
}

export function hashStage8OfflineIdentity(value: unknown): string {
  return createHash('sha256').update(canonicalizeStage8OfflineIdentity(value)).digest('hex');
}

export function stage8CanonicalActionKey(action: CanonicalStage8V2Action): string {
  return `${STAGE8_OFFLINE_ACTION_IDENTITY_VERSION}:${action.actionType}:${action.actionId}:${hashStage8OfflineIdentity(action)}`;
}

export function sortStage8CanonicalActions(actions: readonly CanonicalStage8V2Action[]): CanonicalStage8V2Action[] {
  return actions.slice().sort((left, right) => stage8CanonicalActionKey(left).localeCompare(stage8CanonicalActionKey(right)));
}

export function hashStage8CanonicalActionSet(actions: readonly CanonicalStage8V2Action[]): string {
  return hashStage8OfflineIdentity(sortStage8CanonicalActions(actions).map(stage8CanonicalActionKey));
}
