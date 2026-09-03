import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  preflightStage8BcArtifactWrite,
  type Stage8BcArtifactControlManifest,
  type Stage8BcArtifactControlResult,
  type Stage8BcArtifactPathFileSystem,
} from './offline-bc-artifact-control';
import type { Stage8ArtifactRootPreflightInput } from './artifact-root-preflight';
import {
  canonicalizeStage8OfflineIdentity,
  hashStage8OfflineIdentity,
} from './offline-action-identity';
import {
  validateStage8BcSampleEnvelope,
  type Stage8BcSampleEnvelope,
} from './offline-bc-sample-protocol';
import { encodeStage8OnnxTensorBatch } from './offline-onnx-tensor-contract';

export const STAGE8_BC_ARTIFACT_SHARD_VERSION = 'stage8-bc-artifact-shard-v1';
export const STAGE8_BC_TERMINAL_REWARD_VERSION = 'stage8-bc-terminal-reward-v1';

export interface Stage8BcAtomicArtifactFileSystem extends Stage8BcArtifactPathFileSystem {
  writeFileExclusive(candidate: string, bytes: Uint8Array): void;
  readFile(candidate: string): Uint8Array;
  renameAtomic(source: string, destination: string): void;
  removeFile(candidate: string): void;
}

export interface Stage8BcArtifactTensorRecord {
  tensorContractSha256: string;
  visibleStateSha256: string;
  legalActionSetSha256: string;
  legalActionKeys: string[];
  encoding: 'little-endian-base64';
  visibleStateFloat32Base64: string;
  canonicalActionFeaturesFloat32Base64: string;
  legalActionMaskFloat32Base64: string;
  visibleStateDimensions: [1, number];
  canonicalActionDimensions: [1, number, number];
  legalActionMaskDimensions: [1, number];
  teacherDistributionFloat64Base64: string;
  selectedActionIndex: number;
  resolvedTerminalDeltaFloat32Base64: string;
  terminalRewardReferenceSha256: string;
  tensorRecordSha256: string;
}

export interface Stage8BcArtifactShardRecord {
  sample: Stage8BcSampleEnvelope;
  tensors: Stage8BcArtifactTensorRecord;
}

export interface Stage8BcArtifactShardManifestBase {
  runId: string;
  batchId: string;
  shardId: string;
  artifactControlManifestSha256: string;
  bcControlManifestSha256: string;
  sampleSchemaSha256: string;
  tensorContractSha256: string;
  writerDefinitionSha256: string;
  sampleCount: number;
  episodeCount: number;
  sampleIds: string[];
  episodeRewardReferences: Array<{
    episodeId: string;
    terminalDelta: [number, number, number, number];
    terminalRewardReferenceSha256: string;
  }>;
}

export interface Stage8BcArtifactShard {
  protocolVersion: typeof STAGE8_BC_ARTIFACT_SHARD_VERSION;
  manifest: Stage8BcArtifactShardManifestBase & { payloadSha256: string };
  records: Stage8BcArtifactShardRecord[];
}

export type Stage8BcArtifactWriteResult = Stage8BcArtifactControlResult<{
  status: 'committed';
  artifactPath: string;
  artifactFileSha256: string;
  payloadSha256: string;
  sampleCount: number;
  episodeCount: number;
  artifactsWritten: 1;
}>;

export type Stage8BcSampleEnvelopeValidator = typeof validateStage8BcSampleEnvelope;

function bytesSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(runId: string, reason: string): { ok: false; decision: { status: 'fused'; reason: string; isolationId: string } } {
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${runId}-isolation` } };
}

function validId(value: string): boolean {
  return /^[a-z][a-z0-9-]{2,127}$/i.test(value);
}

function rewardReference(episodeId: string, terminalDelta: readonly number[]): string {
  return hashStage8OfflineIdentity({
    protocolVersion: STAGE8_BC_TERMINAL_REWARD_VERSION,
    episodeId,
    terminalDelta,
  });
}

function float32Base64(values: readonly number[]): string {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer.toString('base64');
}

function float64Base64(values: readonly number[]): string {
  const buffer = Buffer.alloc(values.length * 8);
  values.forEach((value, index) => buffer.writeDoubleLE(value, index * 8));
  return buffer.toString('base64');
}

export function hashStage8BcArtifactWriterDefinition(): string {
  return hashStage8OfflineIdentity({
    protocolVersion: STAGE8_BC_ARTIFACT_SHARD_VERSION,
    validation: 'recompute-every-bc-envelope-before-any-write',
    reward: 'exactly-one-real-terminal-zero-sum-result-per-episode',
    tensors: 'frozen-visible-complete-canonical-actions-and-teacher-distribution',
    serialization: 'canonical-json-utf8-deterministic-gzip-mtime-zero',
    commit: 'exclusive-partial-write-readback-hash-atomic-rename',
    failure: 'remove-or-quarantine-partial-never-publish-invalid-final',
  });
}

export function hashStage8BcTerminalReward(input: {
  episodeId: string;
  terminalDelta: readonly number[];
}): string {
  return rewardReference(input.episodeId, input.terminalDelta);
}

function prepareRecords(input: {
  manifest: Stage8BcArtifactControlManifest;
  shardId: string;
  samples: readonly Stage8BcSampleEnvelope[];
  sampleValidator: Stage8BcSampleEnvelopeValidator;
}): Stage8BcArtifactControlResult<{
  batchId: string;
  records: Stage8BcArtifactShardRecord[];
  rewards: Stage8BcArtifactShardManifestBase['episodeRewardReferences'];
}> {
  const runId = input.manifest.identity.runId;
  if (!validId(input.shardId) || !input.samples.length
    || input.samples.length > input.manifest.limits.maxSamplesPerShard) return fail(runId, 'bc-artifact-shard-size-invalid');
  const samples = input.samples.slice().sort((left, right) => {
    const episode = left.replay.episodeId.localeCompare(right.replay.episodeId);
    return episode || left.replay.traceStep - right.replay.traceStep || left.sampleId.localeCompare(right.sampleId);
  });
  const batchId = samples[0]?.batchId;
  if (!validId(batchId) || samples.some((sample) => sample.batchId !== batchId
    || sample.control.manifestSha256 !== input.manifest.bcControl.manifestSha256)) return fail(runId, 'bc-artifact-sample-control-or-batch-mismatch');
  const sampleIds = new Set<string>();
  const episodes = new Map<string, Stage8BcSampleEnvelope[]>();
  for (const sample of samples) {
    const validation = input.sampleValidator(sample);
    if (!validation.ok) return fail(runId, `bc-artifact-${validation.decision.reason}`);
    if (sampleIds.has(sample.sampleId)) return fail(runId, 'bc-artifact-sample-id-duplicate');
    sampleIds.add(sample.sampleId);
    const group = episodes.get(sample.replay.episodeId) ?? [];
    group.push(sample);
    episodes.set(sample.replay.episodeId, group);
  }
  const rewardByEpisode = new Map<string, { terminalDelta: [number, number, number, number]; reference: string }>();
  for (const [episodeId, episodeSamples] of episodes) {
    const terminals = episodeSamples.filter((sample) => sample.replay.episodeReward.terminal);
    if (terminals.length !== 1) return fail(runId, 'bc-artifact-terminal-result-count-invalid');
    const terminal = terminals[0];
    const lastTraceStep = Math.max(...episodeSamples.map((sample) => sample.replay.traceStep));
    if (terminal.replay.traceStep !== lastTraceStep) return fail(runId, 'bc-artifact-terminal-result-order-invalid');
    if (!terminal.replay.episodeReward.terminal) return fail(runId, 'bc-artifact-terminal-result-invalid');
    const terminalDelta = terminal.replay.episodeReward.terminalDelta.slice() as [number, number, number, number];
    const reference = rewardReference(episodeId, terminalDelta);
    if (episodeSamples.some((sample) => !sample.replay.episodeReward.terminal
      && sample.replay.episodeReward.terminalRewardReferenceSha256 !== reference)) return fail(runId, 'bc-artifact-terminal-reference-unresolved');
    const traceSteps = episodeSamples.map((sample) => sample.replay.traceStep);
    if (new Set(traceSteps).size !== traceSteps.length) return fail(runId, 'bc-artifact-trace-step-duplicate');
    rewardByEpisode.set(episodeId, { terminalDelta, reference });
  }
  const records: Stage8BcArtifactShardRecord[] = [];
  for (const sample of samples) {
    const reward = rewardByEpisode.get(sample.replay.episodeId)!;
    let batch;
    try {
      batch = encodeStage8OnnxTensorBatch({ visibleState: sample.visibleState, legalActions: sample.canonicalActions });
    } catch {
      return fail(runId, 'bc-artifact-tensor-encoding-failed');
    }
    if (batch.visibleStateSha256 !== sample.teacherEvidence.visibleStateSha256
      || batch.legalActionSetSha256 !== sample.completeLegalActionSetSha256
      || batch.legalActionKeys.some((key, index) => key !== sample.teacherEvidence.legalActionKeys[index])) return fail(runId, 'bc-artifact-tensor-identity-mismatch');
    const teacherDistribution = batch.legalActionKeys.map((key) => sample.teacherEvidence.teacherDistribution[key]);
    const selectedActionIndex = batch.legalActionKeys.indexOf(sample.teacherEvidence.selectedActionKey);
    if (selectedActionIndex < 0 || teacherDistribution.some((value) => !Number.isFinite(value))) return fail(runId, 'bc-artifact-teacher-target-invalid');
    const tensorPayload = {
      tensorContractSha256: batch.contractSha256,
      visibleStateSha256: batch.visibleStateSha256,
      legalActionSetSha256: batch.legalActionSetSha256,
      legalActionKeys: batch.legalActionKeys,
      encoding: 'little-endian-base64' as const,
      visibleStateFloat32Base64: float32Base64(Array.from(batch.visibleState)),
      canonicalActionFeaturesFloat32Base64: float32Base64(Array.from(batch.canonicalActionFeatures)),
      legalActionMaskFloat32Base64: float32Base64(Array.from(batch.legalActionMask)),
      visibleStateDimensions: batch.visibleStateDimensions,
      canonicalActionDimensions: batch.canonicalActionDimensions,
      legalActionMaskDimensions: batch.legalActionMaskDimensions,
      teacherDistributionFloat64Base64: float64Base64(teacherDistribution),
      selectedActionIndex,
      resolvedTerminalDeltaFloat32Base64: float32Base64(reward.terminalDelta),
      terminalRewardReferenceSha256: reward.reference,
    };
    records.push({
      sample,
      tensors: { ...tensorPayload, tensorRecordSha256: hashStage8OfflineIdentity(tensorPayload) },
    });
  }
  const rewards = Array.from(rewardByEpisode, ([episodeId, reward]) => ({
    episodeId,
    terminalDelta: reward.terminalDelta,
    terminalRewardReferenceSha256: reward.reference,
  })).sort((left, right) => left.episodeId.localeCompare(right.episodeId));
  return { ok: true, value: { batchId, records, rewards } };
}

function quarantineCandidate(input: {
  fileSystem: Stage8BcAtomicArtifactFileSystem;
  candidatePath: string;
  quarantinePath: string;
}): void {
  try {
    if (!input.fileSystem.exists(input.candidatePath)) return;
    try {
      input.fileSystem.removeFile(input.candidatePath);
    } catch {
      input.fileSystem.renameAtomic(input.candidatePath, input.quarantinePath);
    }
  } catch {
    // The caller reports a fused decision; an operator must inspect this exact batch directory.
  }
}

/** Commits one deterministic shard only after every control, sample, reward, and tensor check succeeds. */
export function writeStage8BcSampleShard(input: {
  manifest: Stage8BcArtifactControlManifest;
  artifactRoot: Stage8ArtifactRootPreflightInput;
  batchDirectory: string;
  shardId: string;
  samples: readonly Stage8BcSampleEnvelope[];
  fileSystem: Stage8BcAtomicArtifactFileSystem;
  sampleValidator?: Stage8BcSampleEnvelopeValidator;
}): Stage8BcArtifactWriteResult {
  const runId = input.manifest?.identity?.runId ?? 'invalid-bc-artifact-run';
  const preflight = preflightStage8BcArtifactWrite({
    manifest: input.manifest,
    artifactRoot: input.artifactRoot,
    batchDirectory: input.batchDirectory,
    fileSystem: input.fileSystem,
  });
  if (!preflight.ok) return preflight;
  if (input.manifest.identity.writerDefinitionSha256 !== hashStage8BcArtifactWriterDefinition()) return fail(runId, 'bc-artifact-writer-definition-mismatch');
  const prepared = prepareRecords({
    manifest: input.manifest,
    shardId: input.shardId,
    samples: input.samples,
    sampleValidator: input.sampleValidator ?? validateStage8BcSampleEnvelope,
  });
  if (!prepared.ok) return prepared;
  const manifestBase: Stage8BcArtifactShardManifestBase = {
    runId,
    batchId: prepared.value.batchId,
    shardId: input.shardId,
    artifactControlManifestSha256: input.manifest.manifestSha256,
    bcControlManifestSha256: input.manifest.bcControl.manifestSha256,
    sampleSchemaSha256: input.manifest.identity.sampleSchemaSha256,
    tensorContractSha256: input.manifest.identity.tensorContractSha256,
    writerDefinitionSha256: input.manifest.identity.writerDefinitionSha256,
    sampleCount: prepared.value.records.length,
    episodeCount: prepared.value.rewards.length,
    sampleIds: prepared.value.records.map((record) => record.sample.sampleId),
    episodeRewardReferences: prepared.value.rewards,
  };
  const payloadSha256 = hashStage8OfflineIdentity({
    protocolVersion: STAGE8_BC_ARTIFACT_SHARD_VERSION,
    manifest: {
      ...manifestBase,
      episodeRewardReferences: manifestBase.episodeRewardReferences.map(({ episodeId, terminalRewardReferenceSha256 }) => ({
        episodeId,
        terminalRewardReferenceSha256,
      })),
    },
    recordIdentities: prepared.value.records.map((record) => ({
      sampleId: record.sample.sampleId,
      sampleSha256: record.sample.sampleSha256,
      tensorRecordSha256: record.tensors.tensorRecordSha256,
    })),
  });
  const shard: Stage8BcArtifactShard = {
    protocolVersion: STAGE8_BC_ARTIFACT_SHARD_VERSION,
    manifest: { ...manifestBase, payloadSha256 },
    records: prepared.value.records,
  };
  const uncompressed = Buffer.from(`${canonicalizeStage8OfflineIdentity(shard)}\n`, 'utf8');
  if (uncompressed.byteLength > input.manifest.limits.maxUncompressedShardBytes) return fail(runId, 'bc-artifact-shard-byte-limit-exceeded');
  const compressed = gzipSync(uncompressed, { level: 9 });
  const artifactFileSha256 = bytesSha256(compressed);
  const fileName = `${prepared.value.batchId}-${input.shardId}-${payloadSha256.slice(0, 16)}.json.gz`;
  const artifactPath = path.win32.join(preflight.value.batchDirectory, fileName);
  const partialPath = `${artifactPath}.partial`;
  const partialQuarantinePath = `${artifactPath}.${runId}-partial-isolation.quarantine`;
  const finalQuarantinePath = `${artifactPath}.${runId}-final-isolation.quarantine`;
  if ([artifactPath,partialPath,partialQuarantinePath,finalQuarantinePath].some((candidate) => input.fileSystem.exists(candidate))) return fail(runId, 'bc-artifact-target-already-exists');
  try {
    input.fileSystem.writeFileExclusive(partialPath, compressed);
    if (bytesSha256(input.fileSystem.readFile(partialPath)) !== artifactFileSha256) throw new Error('bc-artifact-partial-readback-mismatch');
    input.fileSystem.renameAtomic(partialPath, artifactPath);
    if (bytesSha256(input.fileSystem.readFile(artifactPath)) !== artifactFileSha256) throw new Error('bc-artifact-final-readback-mismatch');
  } catch {
    quarantineCandidate({ fileSystem: input.fileSystem, candidatePath: partialPath, quarantinePath: partialQuarantinePath });
    quarantineCandidate({ fileSystem: input.fileSystem, candidatePath: artifactPath, quarantinePath: finalQuarantinePath });
    return fail(runId, 'bc-artifact-atomic-commit-failed');
  }
  return {
    ok: true,
    value: {
      status: 'committed',
      artifactPath,
      artifactFileSha256,
      payloadSha256,
      sampleCount: prepared.value.records.length,
      episodeCount: prepared.value.rewards.length,
      artifactsWritten: 1,
    },
  };
}
