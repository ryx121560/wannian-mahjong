import { createHash } from 'node:crypto';
import { hashStage8OfflineIdentity } from './offline-action-identity';

export const STAGE8_BC_OPERATIONAL_INTERRUPTION_EVIDENCE_VERSION =
  'stage8-bc-operational-interruption-evidence-v1';
export const STAGE8_BC_OPERATIONAL_INTERRUPTION_EMIT_AUTHORIZATION_VERSION =
  'stage8-bc-operational-interruption-emit-authorization-v1';
export const STAGE8_BC_OPERATIONAL_INTERRUPTION_EMIT_SCOPE =
  'bc-operational-interruption-evidence-emit';
export const STAGE8_BC_PREDECESSOR_RUN_ID = 'formal-bc-corpus-pilot-20260910';
export const STAGE8_BC_PREDECESSOR_QUARANTINE_RELATIVE_PATH =
  `${STAGE8_BC_PREDECESSOR_RUN_ID}.partial.quarantine`;
export const STAGE8_BC_OPERATIONAL_INTERRUPTION_REASON =
  'operational-interruption-codex-usage-limit';

export interface Stage8BcOperationalInterruptionExpectedIdentity {
  predecessorRunId: string;
  sourceCommit: string;
  sourceBundleSha256: string;
  artifactControlFileSha256: string;
  corpusControlFileSha256: string;
  authorizationFileSha256: string;
  quarantineRelativePath: string;
  markerSha256: string;
  completedShardCount: number;
  totalRecords: number;
  totalBytes: number;
  lastWriteTimeUtc: string;
  shardAggregateSha256: string;
}

export const STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY = Object.freeze({
  predecessorRunId: STAGE8_BC_PREDECESSOR_RUN_ID,
  sourceCommit: 'd5356b80895904d80663ab77eafdbbb63e35419d',
  sourceBundleSha256: '1f09edf9f489880967ab2bb2a6c6d1c84fcd526bc65f167c04a1da8d5dae01cc',
  artifactControlFileSha256: 'fff8d2320a0a0604cf0b5b15013e9ba620ab848ae1fec23a91f5b29f3434cbd6',
  corpusControlFileSha256: '3d72b5580b530781653425bfb820c4264b91046271682b915682a2fb166bc219',
  authorizationFileSha256: '149b83d470cf8b91776cb11c11b8fca67bd614e894e8eb58e684e922855377d3',
  quarantineRelativePath: STAGE8_BC_PREDECESSOR_QUARANTINE_RELATIVE_PATH,
  markerSha256: 'da53bc0fd81f8b1b99d08cfefbbf0c02cca9d4abf1a95851c4242a01a63027a0',
  completedShardCount: 32,
  totalRecords: 5179,
  totalBytes: 13344052,
  lastWriteTimeUtc: '2026-09-11T02:49:24.253Z',
  shardAggregateSha256: 'b970f3e31146c04979a84d247c1a420beac7c3e1e0280a48be636990ae3f8660',
} satisfies Stage8BcOperationalInterruptionExpectedIdentity);

export interface Stage8BcOperationalInterruptionShardIdentity {
  relativePath: string;
  bytes: number;
  records: number;
  sha256: string;
}

export interface Stage8BcOperationalInterruptionEvidence {
  protocolVersion: typeof STAGE8_BC_OPERATIONAL_INTERRUPTION_EVIDENCE_VERSION;
  predecessorRunId: string;
  sourceCommit: string;
  sourceBundleSha256: string;
  artifactControlFileSha256: string;
  corpusControlFileSha256: string;
  authorizationFileSha256: string;
  quarantine: {
    relativePath: string;
    markerSha256: string;
    completedShardCount: number;
    shards: Stage8BcOperationalInterruptionShardIdentity[];
    shardAggregateSha256: string;
    totalRecords: number;
    totalBytes: number;
    lastWriteTimeUtc: string;
  };
  interruption: {
    classification: 'external-operational-interruption';
    classificationBasis: 'codex-task-usage-limit-terminated-host-process';
    reason: typeof STAGE8_BC_OPERATIONAL_INTERRUPTION_REASON;
    runnerTerminalResultObserved: false;
  };
  commitments: {
    finalCommitted: false;
    corpusManifestCommitted: false;
    replayCommitted: false;
    checkpointCommitted: false;
    trainingCommitted: false;
    automaticRetries: 0;
    seedOverrides: 0;
  };
  evidenceSha256: string;
}

export interface Stage8BcOperationalInterruptionEmitAuthorization {
  protocolVersion: typeof STAGE8_BC_OPERATIONAL_INTERRUPTION_EMIT_AUTHORIZATION_VERSION;
  predecessorRunId: string;
  evidenceSha256: string;
  approvalId: string;
  granted: boolean;
  scope: typeof STAGE8_BC_OPERATIONAL_INTERRUPTION_EMIT_SCOPE;
  authorizationSha256: string;
}

export type Stage8BcOperationalInterruptionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{2,127}$/i.test(value);
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizedSha256(value: string): string {
  return value.toLowerCase();
}

function validRelativePath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 240
    && !value.includes('\\')
    && !value.startsWith('/')
    && !/^[a-z]:/i.test(value)
    && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function shardBatchNumber(relativePath: string): number | null {
  const match = /^batches\/batch-(\d{6})\/[^/]+\.json\.gz$/.exec(relativePath);
  return match ? Number(match[1]) : null;
}

export function hashStage8BcOperationalInterruptionShardAggregate(
  shards: readonly Pick<Stage8BcOperationalInterruptionShardIdentity, 'relativePath' | 'sha256'>[],
): string {
  const lines = [...shards]
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map((shard) => `${shard.relativePath}|${normalizedSha256(shard.sha256)}`);
  return createHash('sha256').update(`${lines.join('\n')}\n`, 'utf8').digest('hex');
}

export function hashStage8BcOperationalInterruptionEvidencePayload(
  input: Omit<Stage8BcOperationalInterruptionEvidence, 'evidenceSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

function sameExpectedValue(
  value: string | number,
  expected: string | number,
): boolean {
  return typeof value === 'string' && typeof expected === 'string'
    ? value.toLowerCase() === expected.toLowerCase()
    : value === expected;
}

export function createStage8BcOperationalInterruptionEvidence(input: {
  identity: Stage8BcOperationalInterruptionExpectedIdentity;
  shards: readonly Stage8BcOperationalInterruptionShardIdentity[];
}): Stage8BcOperationalInterruptionResult<Stage8BcOperationalInterruptionEvidence> {
  const expected = input.identity;
  const identityHashes = [
    expected.sourceBundleSha256,
    expected.artifactControlFileSha256,
    expected.corpusControlFileSha256,
    expected.authorizationFileSha256,
    expected.markerSha256,
    expected.shardAggregateSha256,
  ];
  if (!validId(expected.predecessorRunId)
    || !/^[a-f0-9]{40}$/i.test(expected.sourceCommit)
    || identityHashes.some((value) => !isSha256(value))
    || !validRelativePath(expected.quarantineRelativePath)
    || !Number.isInteger(expected.completedShardCount) || expected.completedShardCount <= 0
    || !Number.isInteger(expected.totalRecords) || expected.totalRecords <= 0
    || !Number.isInteger(expected.totalBytes) || expected.totalBytes <= 0
    || !Number.isFinite(Date.parse(expected.lastWriteTimeUtc))) {
    return { ok: false, reason: 'bc-operational-interruption-expected-identity-invalid' };
  }
  const shards = input.shards.map((shard) => ({
    relativePath: shard.relativePath,
    bytes: shard.bytes,
    records: shard.records,
    sha256: normalizedSha256(shard.sha256),
  })).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (shards.length !== expected.completedShardCount
    || new Set(shards.map((shard) => shard.relativePath)).size !== shards.length
    || shards.some((shard) => !exactKeys(shard, ['relativePath','bytes','records','sha256'])
      || !validRelativePath(shard.relativePath)
      || !isSha256(shard.sha256)
      || !Number.isInteger(shard.bytes) || shard.bytes <= 0
      || !Number.isInteger(shard.records) || shard.records <= 0)) {
    return { ok: false, reason: 'bc-operational-interruption-shard-schema-invalid' };
  }
  const batchNumbers = shards.map((shard) => shardBatchNumber(shard.relativePath));
  if (batchNumbers.some((value) => value === null)
    || batchNumbers.some((value, index) => value !== index + 1)) {
    return { ok: false, reason: 'bc-operational-interruption-shard-sequence-invalid' };
  }
  const totalRecords = shards.reduce((sum, shard) => sum + shard.records, 0);
  const totalBytes = shards.reduce((sum, shard) => sum + shard.bytes, 0);
  const shardAggregateSha256 = hashStage8BcOperationalInterruptionShardAggregate(shards);
  if (totalRecords !== expected.totalRecords
    || totalBytes !== expected.totalBytes
    || shardAggregateSha256 !== normalizedSha256(expected.shardAggregateSha256)) {
    return { ok: false, reason: 'bc-operational-interruption-shard-aggregate-mismatch' };
  }
  const payload: Omit<Stage8BcOperationalInterruptionEvidence, 'evidenceSha256'> = {
    protocolVersion: STAGE8_BC_OPERATIONAL_INTERRUPTION_EVIDENCE_VERSION,
    predecessorRunId: expected.predecessorRunId,
    sourceCommit: expected.sourceCommit.toLowerCase(),
    sourceBundleSha256: normalizedSha256(expected.sourceBundleSha256),
    artifactControlFileSha256: normalizedSha256(expected.artifactControlFileSha256),
    corpusControlFileSha256: normalizedSha256(expected.corpusControlFileSha256),
    authorizationFileSha256: normalizedSha256(expected.authorizationFileSha256),
    quarantine: {
      relativePath: expected.quarantineRelativePath,
      markerSha256: normalizedSha256(expected.markerSha256),
      completedShardCount: expected.completedShardCount,
      shards,
      shardAggregateSha256,
      totalRecords,
      totalBytes,
      lastWriteTimeUtc: expected.lastWriteTimeUtc,
    },
    interruption: {
      classification: 'external-operational-interruption',
      classificationBasis: 'codex-task-usage-limit-terminated-host-process',
      reason: STAGE8_BC_OPERATIONAL_INTERRUPTION_REASON,
      runnerTerminalResultObserved: false,
    },
    commitments: {
      finalCommitted: false,
      corpusManifestCommitted: false,
      replayCommitted: false,
      checkpointCommitted: false,
      trainingCommitted: false,
      automaticRetries: 0,
      seedOverrides: 0,
    },
  };
  return {
    ok: true,
    value: { ...payload, evidenceSha256: hashStage8BcOperationalInterruptionEvidencePayload(payload) },
  };
}

export function validateStage8BcOperationalInterruptionEvidence(
  evidence: Stage8BcOperationalInterruptionEvidence,
  expected: Stage8BcOperationalInterruptionExpectedIdentity = STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY,
): Stage8BcOperationalInterruptionResult<{ evidenceSha256: string }> {
  if (!exactKeys(evidence, [
    'protocolVersion','predecessorRunId','sourceCommit','sourceBundleSha256','artifactControlFileSha256',
    'corpusControlFileSha256','authorizationFileSha256','quarantine','interruption','commitments','evidenceSha256',
  ]) || !exactKeys(evidence?.quarantine, [
    'relativePath','markerSha256','completedShardCount','shards','shardAggregateSha256','totalRecords','totalBytes',
    'lastWriteTimeUtc',
  ]) || !exactKeys(evidence?.interruption, [
    'classification','classificationBasis','reason','runnerTerminalResultObserved',
  ]) || !exactKeys(evidence?.commitments, [
    'finalCommitted','corpusManifestCommitted','replayCommitted','checkpointCommitted','trainingCommitted',
    'automaticRetries','seedOverrides',
  ]) || !Array.isArray(evidence?.quarantine?.shards)
    || evidence.quarantine.shards.some((shard) => !exactKeys(shard, ['relativePath','bytes','records','sha256']))) {
    return { ok: false, reason: 'bc-operational-interruption-evidence-schema-invalid' };
  }
  if (evidence.protocolVersion !== STAGE8_BC_OPERATIONAL_INTERRUPTION_EVIDENCE_VERSION
    || evidence.interruption.classification !== 'external-operational-interruption'
    || evidence.interruption.classificationBasis !== 'codex-task-usage-limit-terminated-host-process'
    || evidence.interruption.reason !== STAGE8_BC_OPERATIONAL_INTERRUPTION_REASON
    || evidence.interruption.runnerTerminalResultObserved !== false
    || Object.values(evidence.commitments).some((value) => value !== false && value !== 0)) {
    return { ok: false, reason: 'bc-operational-interruption-evidence-boundary-invalid' };
  }
  const expectedChecks: Array<[string | number, string | number]> = [
    [evidence.predecessorRunId, expected.predecessorRunId],
    [evidence.sourceCommit, expected.sourceCommit],
    [evidence.sourceBundleSha256, expected.sourceBundleSha256],
    [evidence.artifactControlFileSha256, expected.artifactControlFileSha256],
    [evidence.corpusControlFileSha256, expected.corpusControlFileSha256],
    [evidence.authorizationFileSha256, expected.authorizationFileSha256],
    [evidence.quarantine.relativePath, expected.quarantineRelativePath],
    [evidence.quarantine.markerSha256, expected.markerSha256],
    [evidence.quarantine.completedShardCount, expected.completedShardCount],
    [evidence.quarantine.shardAggregateSha256, expected.shardAggregateSha256],
    [evidence.quarantine.totalRecords, expected.totalRecords],
    [evidence.quarantine.totalBytes, expected.totalBytes],
    [evidence.quarantine.lastWriteTimeUtc, expected.lastWriteTimeUtc],
  ];
  if (expectedChecks.some(([actual, frozen]) => !sameExpectedValue(actual, frozen))) {
    return { ok: false, reason: 'bc-operational-interruption-frozen-identity-mismatch' };
  }
  const rebuilt = createStage8BcOperationalInterruptionEvidence({ identity: expected, shards: evidence.quarantine.shards });
  if (!rebuilt.ok) return rebuilt;
  const { evidenceSha256: _evidenceSha256, ...payload } = evidence;
  if (!isSha256(evidence.evidenceSha256)
    || evidence.evidenceSha256 !== hashStage8BcOperationalInterruptionEvidencePayload(payload)
    || evidence.evidenceSha256 !== rebuilt.value.evidenceSha256) {
    return { ok: false, reason: 'bc-operational-interruption-evidence-hash-mismatch' };
  }
  return { ok: true, value: { evidenceSha256: evidence.evidenceSha256 } };
}

export function hashStage8BcOperationalInterruptionEmitAuthorization(
  input: Omit<Stage8BcOperationalInterruptionEmitAuthorization, 'authorizationSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function validateStage8BcOperationalInterruptionEmitAuthorization(
  input: Stage8BcOperationalInterruptionEmitAuthorization,
  evidenceSha256: string,
): Stage8BcOperationalInterruptionResult<{ approvalId: string }> {
  if (!exactKeys(input, [
    'protocolVersion','predecessorRunId','evidenceSha256','approvalId','granted','scope','authorizationSha256',
  ])) return { ok: false, reason: 'bc-operational-interruption-emit-authorization-schema-invalid' };
  const { authorizationSha256: _authorizationSha256, ...payload } = input;
  if (input.protocolVersion !== STAGE8_BC_OPERATIONAL_INTERRUPTION_EMIT_AUTHORIZATION_VERSION
    || input.predecessorRunId !== STAGE8_BC_PREDECESSOR_RUN_ID
    || input.evidenceSha256 !== evidenceSha256
    || !validId(input.approvalId)
    || input.granted !== true
    || input.scope !== STAGE8_BC_OPERATIONAL_INTERRUPTION_EMIT_SCOPE
    || input.authorizationSha256 !== hashStage8BcOperationalInterruptionEmitAuthorization(payload)) {
    return { ok: false, reason: 'bc-operational-interruption-emit-authorization-invalid' };
  }
  return { ok: true, value: { approvalId: input.approvalId } };
}
