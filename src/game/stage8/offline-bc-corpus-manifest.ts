import { STAGE8_ACTION_REGISTRY_V2, type Stage8V2ActionType } from './action-registry-v2';
import { hashStage8OfflineIdentity } from './offline-action-identity';
import {
  deriveStage8BcCorpusSeed,
  deriveStage8BcCorpusSplit,
  validateStage8BcCorpusControlManifest,
  type Stage8BcCorpusControlManifest,
  type Stage8BcCorpusControlResult,
} from './offline-bc-corpus-control';

export const STAGE8_BC_CORPUS_MANIFEST_VERSION = 'stage8-bc-corpus-manifest-v1';
export const STAGE8_BC_CORPUS_TRAINING_BINDING_VERSION = 'stage8-bc-corpus-training-binding-v1';
export const STAGE8_BC_CORPUS_TRAINING_BINDING_SCOPE = 'bc-corpus-training-input-binding';
export const STAGE8_BC_CORPUS_ACTION_TYPES = Object.freeze(
  Object.keys(STAGE8_ACTION_REGISTRY_V2).sort() as Stage8V2ActionType[],
);

export type Stage8BcCorpusSplit = 'train' | 'validation' | 'final-test';
export interface Stage8BcCorpusActionCounter {
  legalOpportunities: number;
  positiveProbability: number;
  selected: number;
}
export type Stage8BcCorpusActionCoverage = Record<Stage8V2ActionType, Stage8BcCorpusActionCounter>;

export interface Stage8BcCorpusShardDescriptor {
  relativePath: string;
  fileSha256: string;
  payloadSha256: string;
  runId: string;
  batchId: string;
  shardId: string;
  gameIndex: number;
  fixedSeed: number;
  candidateSeat: 0 | 1 | 2 | 3;
  split: Stage8BcCorpusSplit;
  artifactControlManifestSha256: string;
  bcControlManifestSha256: string;
  sourceBundleSha256: string;
  sampleSchemaSha256: string;
  tensorContractSha256: string;
  teacherDefinitionSha256: string;
  sampleCount: number;
  episodeCount: 1;
  episodeId: string;
  episodeSha256: string;
  sampleIds: string[];
  terminalDelta: [number, number, number, number];
  actionCoverage: Stage8BcCorpusActionCoverage;
}

export interface Stage8BcCorpusSplitManifest {
  gameIndexes: number[];
  shardIds: string[];
  episodeIds: string[];
  payloadSetSha256: string;
  splitSha256: string;
}

export interface Stage8BcCorpusManifest {
  protocolVersion: typeof STAGE8_BC_CORPUS_MANIFEST_VERSION;
  corpusId: string;
  runId: string;
  control: Stage8BcCorpusControlManifest;
  sourceRunPolicy: 'single-run-only';
  sourceRunIds: [string];
  shards: Stage8BcCorpusShardDescriptor[];
  splits: {
    train: Stage8BcCorpusSplitManifest;
    validation: Stage8BcCorpusSplitManifest;
    finalTest: Stage8BcCorpusSplitManifest;
  };
  totals: {
    shardCount: 64;
    episodeCount: 64;
    sampleCount: number;
    datasetPayloadSetSha256: string;
    trainingDatasetPayloadSetSha256: string;
  };
  actionCoverage: Stage8BcCorpusActionCoverage;
  anomalies: {
    illegalActions: 0;
    hiddenInformationLeaks: 0;
    nonFiniteValues: 0;
    nonZeroSumSettlements: 0;
    replayMismatches: 0;
    duplicateSamples: 0;
    duplicateEpisodes: 0;
    splitLeaks: 0;
    incompatibleIdentities: 0;
  };
  manifestSha256: string;
}

export interface Stage8BcCorpusTrainingBinding {
  protocolVersion: typeof STAGE8_BC_CORPUS_TRAINING_BINDING_VERSION;
  corpusId: string;
  corpusManifestSha256: string;
  corpusRunId: string;
  trainingRunId: string;
  trainingLifecycleManifestSha256: string;
  trainingDatasetPayloadSetSha256: string;
  trainSplitSha256: string;
  trainShardIdsSha256: string;
  authorization: {
    approvalId: string;
    granted: boolean;
    scope: typeof STAGE8_BC_CORPUS_TRAINING_BINDING_SCOPE;
  };
  allowTrainSplit: true;
  allowValidationSplit: false;
  allowFinalTestSplit: false;
  bindingSha256: string;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{2,127}$/i.test(value);
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
function fail(runId: unknown, reason: string): Stage8BcCorpusControlResult<never> {
  const safe = validId(runId) ? runId : 'invalid-bc-corpus-run';
  return { ok: false, decision: { status: 'fused', reason, isolationId: `${safe}-isolation` } };
}
function validRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(value)
    || value.startsWith('/') || value.includes('\\')) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
function validCounter(value: unknown): value is Stage8BcCorpusActionCounter {
  if (!exactKeys(value, ['legalOpportunities','positiveProbability','selected'])) return false;
  const counter = value as Stage8BcCorpusActionCounter;
  return [counter.legalOpportunities,counter.positiveProbability,counter.selected].every((item) => Number.isInteger(item) && item >= 0)
    && counter.selected <= counter.positiveProbability && counter.positiveProbability <= counter.legalOpportunities;
}
function validCoverage(value: unknown): value is Stage8BcCorpusActionCoverage {
  return exactKeys(value, STAGE8_BC_CORPUS_ACTION_TYPES) && STAGE8_BC_CORPUS_ACTION_TYPES.every((key) => validCounter((value as Stage8BcCorpusActionCoverage)[key]));
}
function sumCoverage(shards: readonly Stage8BcCorpusShardDescriptor[]): Stage8BcCorpusActionCoverage {
  return Object.fromEntries(STAGE8_BC_CORPUS_ACTION_TYPES.map((type) => [type, shards.reduce((sum, shard) => ({
    legalOpportunities: sum.legalOpportunities + shard.actionCoverage[type].legalOpportunities,
    positiveProbability: sum.positiveProbability + shard.actionCoverage[type].positiveProbability,
    selected: sum.selected + shard.actionCoverage[type].selected,
  }), { legalOpportunities: 0, positiveProbability: 0, selected: 0 })])) as Stage8BcCorpusActionCoverage;
}
function coverageEqual(left: Stage8BcCorpusActionCoverage, right: Stage8BcCorpusActionCoverage): boolean {
  return STAGE8_BC_CORPUS_ACTION_TYPES.every((type) => ['legalOpportunities','positiveProbability','selected']
    .every((key) => left[type][key as keyof Stage8BcCorpusActionCounter] === right[type][key as keyof Stage8BcCorpusActionCounter]));
}
function splitPayload(input: Stage8BcCorpusSplitManifest): Omit<Stage8BcCorpusSplitManifest, 'splitSha256'> {
  const { splitSha256: _splitSha256, ...payload } = input;
  return payload;
}

function createSplitManifest(
  split: Stage8BcCorpusSplit,
  shards: readonly Stage8BcCorpusShardDescriptor[],
): Stage8BcCorpusSplitManifest {
  const payload = {
    gameIndexes: shards.map((shard) => shard.gameIndex),
    shardIds: shards.map((shard) => shard.shardId),
    episodeIds: shards.map((shard) => shard.episodeId),
    payloadSetSha256: hashStage8OfflineIdentity(shards.map((shard) => shard.payloadSha256).sort()),
  };
  return { ...payload, splitSha256: hashStage8OfflineIdentity({ split, ...payload }) };
}

/** Builds the only accepted formal corpus manifest from committed shard descriptors. */
export function buildStage8BcCorpusManifest(input: {
  corpusId: string;
  control: Stage8BcCorpusControlManifest;
  shards: readonly Stage8BcCorpusShardDescriptor[];
}): Stage8BcCorpusControlResult<Stage8BcCorpusManifest> {
  const runId = input.control?.identity?.runId;
  const control = validateStage8BcCorpusControlManifest(input.control);
  if (!control.ok) return fail(runId, control.decision.reason);
  if (!validId(input.corpusId) || !Array.isArray(input.shards) || input.shards.length !== 64) {
    return fail(runId, 'bc-corpus-build-input-invalid');
  }
  const shards = input.shards.slice().sort((left, right) => left.gameIndex - right.gameIndex)
    .map((shard) => structuredClone(shard));
  const train = shards.filter((shard) => shard.split === 'train');
  const validation = shards.filter((shard) => shard.split === 'validation');
  const finalTest = shards.filter((shard) => shard.split === 'final-test');
  const splits = {
    train: createSplitManifest('train', train),
    validation: createSplitManifest('validation', validation),
    finalTest: createSplitManifest('final-test', finalTest),
  };
  const payload: Omit<Stage8BcCorpusManifest, 'manifestSha256'> = {
    protocolVersion: STAGE8_BC_CORPUS_MANIFEST_VERSION,
    corpusId: input.corpusId,
    runId,
    control: structuredClone(input.control),
    sourceRunPolicy: 'single-run-only',
    sourceRunIds: [runId],
    shards,
    splits,
    totals: {
      shardCount: 64,
      episodeCount: 64,
      sampleCount: shards.reduce((sum, shard) => sum + shard.sampleCount, 0),
      datasetPayloadSetSha256: hashStage8OfflineIdentity(shards.map((shard) => shard.payloadSha256).sort()),
      trainingDatasetPayloadSetSha256: splits.train.payloadSetSha256,
    },
    actionCoverage: sumCoverage(shards),
    anomalies: {
      illegalActions: 0,
      hiddenInformationLeaks: 0,
      nonFiniteValues: 0,
      nonZeroSumSettlements: 0,
      replayMismatches: 0,
      duplicateSamples: 0,
      duplicateEpisodes: 0,
      splitLeaks: 0,
      incompatibleIdentities: 0,
    },
  };
  const manifest: Stage8BcCorpusManifest = {
    ...payload,
    manifestSha256: hashStage8BcCorpusManifestPayload(payload),
  };
  const validationResult = validateStage8BcCorpusManifest(manifest);
  return validationResult.ok ? { ok: true, value: manifest } : validationResult;
}

export function hashStage8BcCorpusManifestDefinition(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_BC_CORPUS_MANIFEST_VERSION,
    source: 'single-run-only-explicit-shard-file-payload-control-and-episode-identities',
    split: 'episode-seed-group-fixed-48-8-8-no-cross-split-leak',
    uniqueness: 'global-sample-id-and-episode-id',
    coverage: 'all-canonical-action-types-legal-positive-selected-report-only',
    training: 'separate-explicit-lifecycle-binding-train-split-only',
    failure: 'fused-zero-side-effect',
  });
}
export function hashStage8BcCorpusManifestPayload(input: Omit<Stage8BcCorpusManifest, 'manifestSha256'>): string {
  return hashStage8OfflineIdentity(input);
}
export function hashStage8BcCorpusTrainingBindingPayload(input: Omit<Stage8BcCorpusTrainingBinding, 'bindingSha256'>): string {
  return hashStage8OfflineIdentity(input);
}

function validateSplit(
  split: Stage8BcCorpusSplit,
  value: Stage8BcCorpusSplitManifest,
  expectedShards: Stage8BcCorpusShardDescriptor[],
): boolean {
  if (!exactKeys(value, ['gameIndexes','shardIds','episodeIds','payloadSetSha256','splitSha256'])) return false;
  const indexes = expectedShards.map((shard) => shard.gameIndex);
  const shardIds = expectedShards.map((shard) => shard.shardId);
  const episodeIds = expectedShards.map((shard) => shard.episodeId);
  return value.gameIndexes.join(',') === indexes.join(',') && value.shardIds.join(',') === shardIds.join(',')
    && value.episodeIds.join(',') === episodeIds.join(',')
    && value.payloadSetSha256 === hashStage8OfflineIdentity(expectedShards.map((shard) => shard.payloadSha256).sort())
    && value.splitSha256 === hashStage8OfflineIdentity({ split, ...splitPayload(value) });
}

/** Validates a completed formal corpus manifest without opening a shard file. */
export function validateStage8BcCorpusManifest(
  manifest: Stage8BcCorpusManifest,
): Stage8BcCorpusControlResult<{ corpusManifestSha256: string; trainingDatasetPayloadSetSha256: string }> {
  const runId = manifest?.runId;
  if (!exactKeys(manifest, [
    'protocolVersion','corpusId','runId','control','sourceRunPolicy','sourceRunIds','shards','splits','totals',
    'actionCoverage','anomalies','manifestSha256',
  ]) || !exactKeys(manifest.splits, ['train','validation','finalTest'])
    || !exactKeys(manifest.totals, ['shardCount','episodeCount','sampleCount','datasetPayloadSetSha256','trainingDatasetPayloadSetSha256'])
    || !exactKeys(manifest.anomalies, [
      'illegalActions','hiddenInformationLeaks','nonFiniteValues','nonZeroSumSettlements','replayMismatches',
      'duplicateSamples','duplicateEpisodes','splitLeaks','incompatibleIdentities',
    ])) return fail(runId, 'bc-corpus-manifest-schema-invalid');
  if (manifest.protocolVersion !== STAGE8_BC_CORPUS_MANIFEST_VERSION || !validId(manifest.corpusId) || !validId(runId)) {
    return fail(runId, 'bc-corpus-manifest-identity-invalid');
  }
  const control = validateStage8BcCorpusControlManifest(manifest.control);
  if (!control.ok) return fail(runId, `bc-corpus-${control.decision.reason}`);
  if (manifest.control.identity.runId !== runId || manifest.control.identity.corpusManifestDefinitionSha256 !== hashStage8BcCorpusManifestDefinition()) {
    return fail(runId, 'bc-corpus-manifest-control-identity-mismatch');
  }
  if (manifest.sourceRunPolicy !== 'single-run-only' || manifest.sourceRunIds.length !== 1 || manifest.sourceRunIds[0] !== runId) {
    return fail(runId, 'bc-corpus-cross-run-forbidden');
  }
  if (!Array.isArray(manifest.shards) || manifest.shards.length !== 64) return fail(runId, 'bc-corpus-shard-count-invalid');
  const sampleIds = new Set<string>();
  const episodeIds = new Set<string>();
  const filePaths = new Set<string>();
  const fileHashes = new Set<string>();
  const payloadHashes = new Set<string>();
  for (let index = 0; index < manifest.shards.length; index += 1) {
    const shard = manifest.shards[index];
    if (!exactKeys(shard, [
      'relativePath','fileSha256','payloadSha256','runId','batchId','shardId','gameIndex','fixedSeed','candidateSeat',
      'split','artifactControlManifestSha256','bcControlManifestSha256','sourceBundleSha256','sampleSchemaSha256',
      'tensorContractSha256','teacherDefinitionSha256','sampleCount','episodeCount','episodeId','episodeSha256',
      'sampleIds','terminalDelta','actionCoverage',
    ]) || !validRelativePath(shard.relativePath) || ![shard.fileSha256,shard.payloadSha256,shard.artifactControlManifestSha256,
      shard.bcControlManifestSha256,shard.sourceBundleSha256,shard.sampleSchemaSha256,shard.tensorContractSha256,
      shard.teacherDefinitionSha256,shard.episodeSha256].every(isSha256)
      || shard.runId !== runId || !validId(shard.batchId) || !validId(shard.shardId)
      || shard.gameIndex !== index || shard.fixedSeed !== deriveStage8BcCorpusSeed(index)
      || shard.candidateSeat !== index % 4 || shard.split !== deriveStage8BcCorpusSplit(index)
      || shard.sourceBundleSha256 !== manifest.control.identity.sourceBundleSha256
      || shard.artifactControlManifestSha256 !== manifest.control.identity.artifactControlManifestSha256
      || shard.bcControlManifestSha256 !== manifest.control.identity.bcControlManifestSha256
      || shard.sampleSchemaSha256 !== manifest.control.identity.sampleSchemaSha256
      || shard.tensorContractSha256 !== manifest.control.identity.tensorContractSha256
      || shard.teacherDefinitionSha256 !== manifest.control.identity.teacherDefinitionSha256
      || !Number.isInteger(shard.sampleCount) || shard.sampleCount < 1 || shard.sampleIds.length !== shard.sampleCount
      || shard.episodeCount !== 1 || !validId(shard.episodeId)
      || shard.episodeSha256 !== hashStage8OfflineIdentity({
        episodeId: shard.episodeId, fixedSeed: shard.fixedSeed, sampleIds: shard.sampleIds, terminalDelta: shard.terminalDelta,
      })
      || shard.sampleIds.some((id) => !validId(id)) || !Array.isArray(shard.terminalDelta)
      || shard.terminalDelta.length !== 4 || shard.terminalDelta.some((value) => !Number.isFinite(value))
      || Math.abs(shard.terminalDelta.reduce((sum, value) => sum + value, 0)) > 1e-12
      || !validCoverage(shard.actionCoverage)
      || STAGE8_BC_CORPUS_ACTION_TYPES.reduce((sum, type) => sum + shard.actionCoverage[type].selected, 0) !== shard.sampleCount) {
      return fail(runId, 'bc-corpus-shard-identity-or-result-invalid');
    }
    if (filePaths.has(shard.relativePath) || fileHashes.has(shard.fileSha256) || payloadHashes.has(shard.payloadSha256)) {
      return fail(runId, 'bc-corpus-shard-duplicate');
    }
    filePaths.add(shard.relativePath); fileHashes.add(shard.fileSha256); payloadHashes.add(shard.payloadSha256);
    if (episodeIds.has(shard.episodeId)) return fail(runId, 'bc-corpus-episode-duplicate');
    episodeIds.add(shard.episodeId);
    for (const sampleId of shard.sampleIds) {
      if (sampleIds.has(sampleId)) return fail(runId, 'bc-corpus-sample-duplicate');
      sampleIds.add(sampleId);
    }
  }
  const train = manifest.shards.filter((shard) => shard.split === 'train');
  const validation = manifest.shards.filter((shard) => shard.split === 'validation');
  const finalTest = manifest.shards.filter((shard) => shard.split === 'final-test');
  if (train.length !== 48 || validation.length !== 8 || finalTest.length !== 8
    || !validateSplit('train', manifest.splits.train, train)
    || !validateSplit('validation', manifest.splits.validation, validation)
    || !validateSplit('final-test', manifest.splits.finalTest, finalTest)) return fail(runId, 'bc-corpus-split-invalid');
  const allSplitEpisodes = [...manifest.splits.train.episodeIds,...manifest.splits.validation.episodeIds,...manifest.splits.finalTest.episodeIds];
  if (new Set(allSplitEpisodes).size !== 64) return fail(runId, 'bc-corpus-split-leak');
  const allCoverage = sumCoverage(manifest.shards);
  if (!validCoverage(manifest.actionCoverage) || !coverageEqual(manifest.actionCoverage, allCoverage)) {
    return fail(runId, 'bc-corpus-action-coverage-invalid');
  }
  if (Object.values(manifest.anomalies).some((value) => value !== 0)) return fail(runId, 'bc-corpus-hard-anomaly');
  const datasetPayloadSetSha256 = hashStage8OfflineIdentity(manifest.shards.map((shard) => shard.payloadSha256).sort());
  const sampleCount = manifest.shards.reduce((sum, shard) => sum + shard.sampleCount, 0);
  if (manifest.totals.shardCount !== 64 || manifest.totals.episodeCount !== 64 || manifest.totals.sampleCount !== sampleCount
    || manifest.totals.datasetPayloadSetSha256 !== datasetPayloadSetSha256
    || manifest.totals.trainingDatasetPayloadSetSha256 !== manifest.splits.train.payloadSetSha256) {
    return fail(runId, 'bc-corpus-total-identity-invalid');
  }
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  if (manifest.manifestSha256 !== hashStage8BcCorpusManifestPayload(payload)) return fail(runId, 'bc-corpus-manifest-hash-mismatch');
  return { ok: true, value: { corpusManifestSha256: manifest.manifestSha256, trainingDatasetPayloadSetSha256: manifest.splits.train.payloadSetSha256 } };
}

/** Binds an independently authorized training lifecycle ticket to this corpus train split only. */
export function validateStage8BcCorpusTrainingBinding(input: {
  corpus: Stage8BcCorpusManifest;
  binding: Stage8BcCorpusTrainingBinding;
  trainingTicket: { runId: string; lifecycleManifestSha256: string; datasetPayloadSetSha256: string };
}): Stage8BcCorpusControlResult<{ trainShardIds: string[] }> {
  const corpus = validateStage8BcCorpusManifest(input.corpus);
  const runId = input.binding?.trainingRunId;
  if (!corpus.ok) return fail(runId, `bc-corpus-binding-${corpus.decision.reason}`);
  const binding = input.binding;
  if (!exactKeys(binding, [
    'protocolVersion','corpusId','corpusManifestSha256','corpusRunId','trainingRunId','trainingLifecycleManifestSha256',
    'trainingDatasetPayloadSetSha256','trainSplitSha256','trainShardIdsSha256','authorization','allowTrainSplit',
    'allowValidationSplit','allowFinalTestSplit','bindingSha256',
  ]) || !exactKeys(binding.authorization, ['approvalId','granted','scope'])) return fail(runId, 'bc-corpus-training-binding-schema-invalid');
  if (binding.protocolVersion !== STAGE8_BC_CORPUS_TRAINING_BINDING_VERSION || !validId(binding.trainingRunId)
    || !validId(binding.authorization.approvalId) || !binding.authorization.granted
    || binding.authorization.scope !== STAGE8_BC_CORPUS_TRAINING_BINDING_SCOPE
    || ![binding.corpusManifestSha256,binding.trainingLifecycleManifestSha256,binding.trainingDatasetPayloadSetSha256,
      binding.trainSplitSha256,binding.trainShardIdsSha256].every(isSha256)
    || binding.corpusId !== input.corpus.corpusId || binding.corpusManifestSha256 !== input.corpus.manifestSha256
    || binding.corpusRunId !== input.corpus.runId || binding.trainingRunId !== input.trainingTicket.runId
    || binding.trainingLifecycleManifestSha256 !== input.trainingTicket.lifecycleManifestSha256
    || binding.trainingDatasetPayloadSetSha256 !== input.trainingTicket.datasetPayloadSetSha256
    || binding.trainingDatasetPayloadSetSha256 !== input.corpus.splits.train.payloadSetSha256
    || binding.trainSplitSha256 !== input.corpus.splits.train.splitSha256
    || binding.trainShardIdsSha256 !== hashStage8OfflineIdentity(input.corpus.splits.train.shardIds)
    || binding.allowTrainSplit !== true || binding.allowValidationSplit !== false || binding.allowFinalTestSplit !== false) {
    return fail(runId, 'bc-corpus-training-binding-identity-invalid');
  }
  const { bindingSha256: _bindingSha256, ...payload } = binding;
  if (binding.bindingSha256 !== hashStage8BcCorpusTrainingBindingPayload(payload)) {
    return fail(runId, 'bc-corpus-training-binding-hash-mismatch');
  }
  return { ok: true, value: { trainShardIds: input.corpus.splits.train.shardIds.slice() } };
}
