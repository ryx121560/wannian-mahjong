import {
  STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES,
  validateStage8BcArtifactControlManifest,
  type Stage8BcArtifactControlManifest,
} from './offline-bc-artifact-control';
import {
  STAGE8_BC_CORPUS_GAME_COUNT,
  STAGE8_BC_CORPUS_MAX_TRANSITIONS,
  deriveStage8BcCorpusSeed,
  deriveStage8BcCorpusSplit,
  validateStage8BcCorpusControlManifest,
  type Stage8BcCorpusControlManifest,
} from './offline-bc-corpus-control';
import {
  STAGE8_BC_CORPUS_ACTION_TYPES,
  buildStage8BcCorpusManifest,
  type Stage8BcCorpusActionCoverage,
  type Stage8BcCorpusManifest,
  type Stage8BcCorpusShardDescriptor,
} from './offline-bc-corpus-manifest';
import { hashStage8OfflineIdentity, stage8CanonicalActionKey } from './offline-action-identity';
import {
  executeStage8BcTeacherGame,
  type Stage8BcSampleProbeGameLedger,
  type Stage8BcSampleProbeGameResult,
  type Stage8BcSampleProbeTeacherEvaluator,
  type Stage8BcTeacherGameExecutionInput,
} from './offline-bc-sample-probe-runner';

export const STAGE8_BC_CORPUS_RUNNER_VERSION = 'stage8-bc-corpus-runner-v1';
export const STAGE8_BC_CORPUS_FINAL_ARTIFACT_COUNT = 66;
export const STAGE8_BC_CORPUS_CAPACITY_CHECK_COUNT = 66;

export interface Stage8BcCorpusCapacityRequest {
  stage: 'before-run' | 'before-shard-commit' | 'before-final-commit';
  gameIndex: number | null;
  pendingBytes: number;
}

export interface Stage8BcCorpusCapacityEvidence extends Stage8BcCorpusCapacityRequest {
  ok: boolean;
  totalBytes: number;
  freeBytes: number;
  rootBytes: number;
  runBytes: number;
  identitySha256: string;
}

export interface Stage8BcCorpusCommittedShard {
  relativePath: string;
  fileSha256: string;
  payloadSha256: string;
  sampleCount: number;
  episodeCount: number;
}

export interface Stage8BcCorpusPythonEvidence {
  ok: boolean;
  corpusManifestSha256: string;
  shardCount: number;
  sampleCount: number;
  splitCounts: { train: number; validation: number; finalTest: number };
  fileSetSha256: string;
  torchImported: false;
}

export interface Stage8BcCorpusTransactionPort {
  capacityPreflight(request: Stage8BcCorpusCapacityRequest): Stage8BcCorpusCapacityEvidence;
  commitShard(input: {
    gameIndex: number;
    game: Stage8BcSampleProbeGameLedger;
    relativeDirectory: string;
    shardId: string;
  }): { ok: true; shard: Stage8BcCorpusCommittedShard } | { ok: false; reason: string };
  verifyPython(input: {
    manifest: Stage8BcCorpusManifest;
    shards: readonly Stage8BcCorpusCommittedShard[];
  }): Stage8BcCorpusPythonEvidence;
  commitRun(input: {
    manifest: Stage8BcCorpusManifest;
    ledger: Stage8BcCorpusRunLedger;
  }): { ok: true } | { ok: false; reason: string };
  quarantineRun(input: { reason: string; completedShardCount: number; ledgerSha256: string }): void;
}

export type Stage8BcCorpusGameExecutor = (
  input: Stage8BcTeacherGameExecutionInput,
) => Stage8BcSampleProbeGameResult;

export interface Stage8BcCorpusRunLedger {
  protocolVersion: typeof STAGE8_BC_CORPUS_RUNNER_VERSION;
  runId: string;
  corpusManifestSha256: string;
  gameSemanticSha256List: string[];
  shardFileSha256List: string[];
  actionCoverage: Stage8BcCorpusActionCoverage;
  pythonEvidenceSha256: string;
  capacityChecks: typeof STAGE8_BC_CORPUS_CAPACITY_CHECK_COUNT;
  automaticRetries: 0;
  seedOverrides: 0;
  ledgerSha256: string;
}

export type Stage8BcCorpusTransactionResult =
  | {
    ok: true;
    status: 'committed';
    manifest: Stage8BcCorpusManifest;
    ledger: Stage8BcCorpusRunLedger;
    artifactsWritten: typeof STAGE8_BC_CORPUS_FINAL_ARTIFACT_COUNT;
    pilotGamesExecuted: 64;
    trainingStarted: false;
  }
  | {
    ok: false;
    status: 'fused';
    reason: string;
    isolationId: string;
    artifactsWritten: 0;
    completedShardCount: number;
    trainingStarted: false;
  };

function formalRunId(value: unknown): value is string {
  return typeof value === 'string' && /^formal-bc-corpus-[a-z0-9-]{3,104}$/i.test(value)
    && !/(probe|diagnostic|rerun)/i.test(value);
}

function emptyCoverage(): Stage8BcCorpusActionCoverage {
  return Object.fromEntries(STAGE8_BC_CORPUS_ACTION_TYPES.map((type) => [type, {
    legalOpportunities: 0,
    positiveProbability: 0,
    selected: 0,
  }])) as Stage8BcCorpusActionCoverage;
}

function coverageForGame(game: Stage8BcSampleProbeGameLedger): Stage8BcCorpusActionCoverage | null {
  const coverage = emptyCoverage();
  for (const sample of game.samples) {
    const selectedKey = sample.teacherEvidence.selectedActionKey;
    let selectedFound = false;
    for (const action of sample.canonicalActions) {
      if (!STAGE8_BC_CORPUS_ACTION_TYPES.includes(action.actionType)) return null;
      const key = stage8CanonicalActionKey(action);
      const probability = sample.teacherEvidence.teacherDistribution[key];
      if (!Number.isFinite(probability) || probability < 0) return null;
      coverage[action.actionType].legalOpportunities += 1;
      if (probability > 0) coverage[action.actionType].positiveProbability += 1;
      if (key === selectedKey) {
        coverage[action.actionType].selected += 1;
        selectedFound = true;
      }
    }
    if (!selectedFound) return null;
  }
  return coverage;
}

function addCoverage(
  target: Stage8BcCorpusActionCoverage,
  source: Stage8BcCorpusActionCoverage,
): void {
  for (const type of STAGE8_BC_CORPUS_ACTION_TYPES) {
    target[type].legalOpportunities += source[type].legalOpportunities;
    target[type].positiveProbability += source[type].positiveProbability;
    target[type].selected += source[type].selected;
  }
}

function controlsMatch(
  corpus: Stage8BcCorpusControlManifest,
  artifact: Stage8BcArtifactControlManifest,
): boolean {
  const corpusIdentity = corpus.identity;
  const artifactIdentity = artifact.identity;
  const bcIdentity = artifact.bcControl.identity;
  return artifactIdentity.runId === corpusIdentity.runId
    && bcIdentity.runId === corpusIdentity.runId
    && artifact.manifestSha256 === corpusIdentity.artifactControlManifestSha256
    && artifact.bcControl.manifestSha256 === corpusIdentity.bcControlManifestSha256
    && artifactIdentity.sourceBundleSha256 === corpusIdentity.sourceBundleSha256
    && bcIdentity.sourceBundleSha256 === corpusIdentity.sourceBundleSha256
    && bcIdentity.rulesSha256 === corpusIdentity.rulesSha256
    && bcIdentity.browserRulesSha256 === corpusIdentity.browserRulesSha256
    && bcIdentity.actionSpaceSha256 === corpusIdentity.actionSpaceSha256
    && bcIdentity.legalActionMaskSha256 === corpusIdentity.legalActionMaskSha256
    && bcIdentity.featureSha256 === corpusIdentity.featureSha256
    && bcIdentity.visibleInformationSha256 === corpusIdentity.visibleInformationSha256
    && artifactIdentity.tensorContractSha256 === corpusIdentity.tensorContractSha256
    && bcIdentity.teacherDefinitionSha256 === corpusIdentity.teacherDefinitionSha256
    && artifactIdentity.sampleSchemaSha256 === corpusIdentity.sampleSchemaSha256
    && artifactIdentity.writerDefinitionSha256 === corpusIdentity.writerDefinitionSha256
    && artifactIdentity.pythonDatasetDefinitionSha256 === corpusIdentity.pythonDatasetDefinitionSha256;
}

function validCapacity(
  control: Stage8BcCorpusControlManifest,
  request: Stage8BcCorpusCapacityRequest,
  evidence: Stage8BcCorpusCapacityEvidence,
): boolean {
  if (!evidence || evidence.ok !== true || evidence.stage !== request.stage
    || evidence.gameIndex !== request.gameIndex || evidence.pendingBytes !== request.pendingBytes
    || evidence.identitySha256 !== control.identity.capacityPreflightSha256
    || ![evidence.totalBytes,evidence.freeBytes,evidence.rootBytes,evidence.runBytes,evidence.pendingBytes]
      .every(Number.isSafeInteger)
    || evidence.totalBytes <= 0 || evidence.freeBytes < 0 || evidence.freeBytes > evidence.totalBytes
    || evidence.rootBytes < 0 || evidence.runBytes < 0 || evidence.pendingBytes < 0) return false;
  if (evidence.runBytes + evidence.pendingBytes > control.capacity.maxRunBytes
    || evidence.rootBytes + evidence.pendingBytes > control.capacity.rootHardLimitBytes
    || evidence.pendingBytes > evidence.freeBytes) return false;
  return (evidence.totalBytes - evidence.freeBytes + evidence.pendingBytes) / evidence.totalBytes
    < control.capacity.rootFusePercent / 100;
}

function fail(
  runId: string,
  reason: string,
  completedShardCount: number,
  port: Stage8BcCorpusTransactionPort,
  semanticIds: readonly string[],
): Stage8BcCorpusTransactionResult {
  const ledgerSha256 = hashStage8OfflineIdentity({ runId, reason, completedShardCount, semanticIds });
  try { port.quarantineRun({ reason, completedShardCount, ledgerSha256 }); } catch { /* Remain fused. */ }
  return {
    ok: false,
    status: 'fused',
    reason,
    isolationId: `${formalRunId(runId) ? runId : 'invalid-formal-bc-corpus-run'}-isolation`,
    artifactsWritten: 0,
    completedShardCount,
    trainingStarted: false,
  };
}

function descriptorFor(input: {
  control: Stage8BcCorpusControlManifest;
  artifactControl: Stage8BcArtifactControlManifest;
  game: Stage8BcSampleProbeGameLedger;
  committed: Stage8BcCorpusCommittedShard;
  coverage: Stage8BcCorpusActionCoverage;
}): Stage8BcCorpusShardDescriptor | null {
  const { control, artifactControl, game, committed, coverage } = input;
  const episodeIds = new Set(game.samples.map((sample) => sample.replay.episodeId));
  const sampleIds = game.samples.map((sample) => sample.sampleId);
  const episodeId = episodeIds.size === 1 ? Array.from(episodeIds)[0] : null;
  if (!episodeId || committed.sampleCount !== sampleIds.length || committed.episodeCount !== 1) return null;
  return {
    relativePath: committed.relativePath,
    fileSha256: committed.fileSha256,
    payloadSha256: committed.payloadSha256,
    runId: control.identity.runId,
    batchId: game.samples[0]?.batchId ?? '',
    shardId: `formal-shard-${String(game.gameIndex + 1).padStart(6, '0')}`,
    gameIndex: game.gameIndex,
    fixedSeed: game.fixedSeed,
    candidateSeat: game.candidateSeat,
    split: deriveStage8BcCorpusSplit(game.gameIndex),
    artifactControlManifestSha256: artifactControl.manifestSha256,
    bcControlManifestSha256: artifactControl.bcControl.manifestSha256,
    sourceBundleSha256: control.identity.sourceBundleSha256,
    sampleSchemaSha256: control.identity.sampleSchemaSha256,
    tensorContractSha256: control.identity.tensorContractSha256,
    teacherDefinitionSha256: control.identity.teacherDefinitionSha256,
    sampleCount: sampleIds.length,
    episodeCount: 1,
    episodeId,
    episodeSha256: hashStage8OfflineIdentity({
      episodeId,
      fixedSeed: game.fixedSeed,
      sampleIds,
      terminalDelta: game.terminalDelta,
    }),
    sampleIds,
    terminalDelta: game.terminalDelta.slice() as [number, number, number, number],
    actionCoverage: coverage,
  };
}

/** Executes, replays, stages, verifies, and atomically publishes one authorized 64-game corpus. */
export function executeStage8BcCorpusTransaction(input: {
  corpusId: string;
  control: Stage8BcCorpusControlManifest;
  artifactControl: Stage8BcArtifactControlManifest;
  port: Stage8BcCorpusTransactionPort;
  gameExecutor?: Stage8BcCorpusGameExecutor;
  teacherEvaluator?: Stage8BcSampleProbeTeacherEvaluator;
}): Stage8BcCorpusTransactionResult {
  const runId = input.control?.identity?.runId ?? 'invalid-formal-bc-corpus-run';
  const control = validateStage8BcCorpusControlManifest(input.control);
  const artifact = validateStage8BcArtifactControlManifest(input.artifactControl);
  if (!formalRunId(runId)) return fail(runId, 'bc-corpus-formal-run-identity-invalid', 0, input.port, []);
  if (!control.ok) return fail(runId, control.decision.reason, 0, input.port, []);
  if (!artifact.ok) return fail(runId, artifact.decision.reason, 0, input.port, []);
  if (!controlsMatch(input.control, input.artifactControl)) {
    return fail(runId, 'bc-corpus-control-domain-identity-mismatch', 0, input.port, []);
  }
  const semanticIds: string[] = [];
  const descriptors: Stage8BcCorpusShardDescriptor[] = [];
  const committedShards: Stage8BcCorpusCommittedShard[] = [];
  const globalSamples = new Set<string>();
  const globalEpisodes = new Set<string>();
  const aggregateCoverage = emptyCoverage();
  const beforeRun = { stage: 'before-run', gameIndex: null, pendingBytes: input.control.capacity.maxRunBytes } as const;
  let evidence: Stage8BcCorpusCapacityEvidence;
  try { evidence = input.port.capacityPreflight(beforeRun); } catch {
    return fail(runId, 'bc-corpus-capacity-before-run-failed', 0, input.port, semanticIds);
  }
  if (!validCapacity(input.control, beforeRun, evidence)) {
    return fail(runId, 'bc-corpus-capacity-before-run-invalid', 0, input.port, semanticIds);
  }
  const execute = input.gameExecutor ?? executeStage8BcTeacherGame;
  let sampleOffset = 0;
  for (let gameIndex = 0; gameIndex < STAGE8_BC_CORPUS_GAME_COUNT; gameIndex += 1) {
    const executionInput: Stage8BcTeacherGameExecutionInput = {
      runId,
      bcControl: input.artifactControl.bcControl,
      gameIndex,
      gameCount: STAGE8_BC_CORPUS_GAME_COUNT,
      fixedSeed: deriveStage8BcCorpusSeed(gameIndex),
      candidateSeat: gameIndex % 4 as 0 | 1 | 2 | 3,
      sampleOffset,
      maxSuccessfulTransitions: STAGE8_BC_CORPUS_MAX_TRANSITIONS,
      teacherEvaluator: input.teacherEvaluator,
    };
    const first = execute(executionInput);
    const replay = execute(executionInput);
    if (!first.ok || !replay.ok || replay.ledger.semanticSha256 !== first.ledger.semanticSha256) {
      const reason = !first.ok ? first.decision.reason : !replay.ok ? replay.decision.reason : 'bc-corpus-game-replay-mismatch';
      return fail(runId, reason, descriptors.length, input.port, semanticIds);
    }
    const game = first.ledger;
    if (game.gameIndex !== gameIndex || game.fixedSeed !== executionInput.fixedSeed
      || game.candidateSeat !== executionInput.candidateSeat || game.terminalCount !== 1
      || game.transitions.length > STAGE8_BC_CORPUS_MAX_TRANSITIONS
      || game.terminalDelta.some((value) => !Number.isFinite(value))
      || Math.abs(game.terminalDelta.reduce((sum, value) => sum + value, 0)) > 1e-12) {
      return fail(runId, 'bc-corpus-game-ledger-invalid', descriptors.length, input.port, semanticIds);
    }
    const episodeIds = new Set(game.samples.map((sample) => sample.replay.episodeId));
    if (episodeIds.size !== 1 || Array.from(episodeIds).some((id) => globalEpisodes.has(id))
      || game.samples.some((sample) => globalSamples.has(sample.sampleId))) {
      return fail(runId, 'bc-corpus-global-sample-or-episode-duplicate', descriptors.length, input.port, semanticIds);
    }
    const coverage = coverageForGame(game);
    if (!coverage) return fail(runId, 'bc-corpus-game-action-coverage-invalid', descriptors.length, input.port, semanticIds);
    const capacityRequest = {
      stage: 'before-shard-commit' as const,
      gameIndex,
      pendingBytes: STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES,
    };
    try { evidence = input.port.capacityPreflight(capacityRequest); } catch {
      return fail(runId, 'bc-corpus-capacity-before-shard-failed', descriptors.length, input.port, semanticIds);
    }
    if (!validCapacity(input.control, capacityRequest, evidence)) {
      return fail(runId, 'bc-corpus-capacity-before-shard-invalid', descriptors.length, input.port, semanticIds);
    }
    const serial = String(gameIndex + 1).padStart(6, '0');
    const relativeDirectory = `${runId}/batches/batch-${serial}`;
    let committed: ReturnType<Stage8BcCorpusTransactionPort['commitShard']>;
    try {
      committed = input.port.commitShard({
        gameIndex,
        game,
        relativeDirectory,
        shardId: `formal-shard-${serial}`,
      });
    } catch {
      return fail(runId, 'bc-corpus-shard-commit-failed', descriptors.length, input.port, semanticIds);
    }
    if (!committed.ok) return fail(runId, committed.reason, descriptors.length, input.port, semanticIds);
    const descriptor = descriptorFor({
      control: input.control,
      artifactControl: input.artifactControl,
      game,
      committed: committed.shard,
      coverage,
    });
    if (!descriptor || !committed.shard.relativePath.startsWith(`${runId}/batches/batch-${serial}/`)) {
      return fail(runId, 'bc-corpus-committed-shard-identity-invalid', descriptors.length, input.port, semanticIds);
    }
    for (const sample of game.samples) globalSamples.add(sample.sampleId);
    for (const episodeId of episodeIds) globalEpisodes.add(episodeId);
    addCoverage(aggregateCoverage, coverage);
    descriptors.push(descriptor);
    committedShards.push(committed.shard);
    semanticIds.push(game.semanticSha256);
    sampleOffset += game.samples.length;
  }
  const manifestResult = buildStage8BcCorpusManifest({ corpusId: input.corpusId, control: input.control, shards: descriptors });
  if (!manifestResult.ok) return fail(runId, manifestResult.decision.reason, descriptors.length, input.port, semanticIds);
  const manifest = manifestResult.value;
  if (hashStage8OfflineIdentity(aggregateCoverage) !== hashStage8OfflineIdentity(manifest.actionCoverage)) {
    return fail(runId, 'bc-corpus-aggregate-action-coverage-mismatch', descriptors.length, input.port, semanticIds);
  }
  let python: Stage8BcCorpusPythonEvidence;
  try { python = input.port.verifyPython({ manifest, shards: committedShards }); } catch {
    return fail(runId, 'bc-corpus-python-verification-failed', descriptors.length, input.port, semanticIds);
  }
  const expectedFileSetSha256 = hashStage8OfflineIdentity(committedShards.map((shard) => shard.fileSha256).sort());
  if (!python.ok || python.corpusManifestSha256 !== manifest.manifestSha256
    || python.shardCount !== 64 || python.sampleCount !== manifest.totals.sampleCount
    || python.splitCounts.train !== 48 || python.splitCounts.validation !== 8 || python.splitCounts.finalTest !== 8
    || python.fileSetSha256 !== expectedFileSetSha256 || python.torchImported !== false) {
    return fail(runId, 'bc-corpus-python-evidence-invalid', descriptors.length, input.port, semanticIds);
  }
  const ledgerBase: Omit<Stage8BcCorpusRunLedger, 'ledgerSha256'> = {
    protocolVersion: STAGE8_BC_CORPUS_RUNNER_VERSION,
    runId,
    corpusManifestSha256: manifest.manifestSha256,
    gameSemanticSha256List: semanticIds,
    shardFileSha256List: committedShards.map((shard) => shard.fileSha256),
    actionCoverage: aggregateCoverage,
    pythonEvidenceSha256: hashStage8OfflineIdentity(python),
    capacityChecks: STAGE8_BC_CORPUS_CAPACITY_CHECK_COUNT,
    automaticRetries: 0 as const,
    seedOverrides: 0 as const,
  };
  const ledger: Stage8BcCorpusRunLedger = {
    ...ledgerBase,
    ledgerSha256: hashStage8OfflineIdentity(ledgerBase),
  };
  const finalPendingBytes = new TextEncoder().encode(`${JSON.stringify(manifest)}\n${JSON.stringify(ledger)}\n`).byteLength;
  const finalRequest = { stage: 'before-final-commit' as const, gameIndex: null, pendingBytes: finalPendingBytes };
  try { evidence = input.port.capacityPreflight(finalRequest); } catch {
    return fail(runId, 'bc-corpus-capacity-before-final-failed', descriptors.length, input.port, semanticIds);
  }
  if (!validCapacity(input.control, finalRequest, evidence)) {
    return fail(runId, 'bc-corpus-capacity-before-final-invalid', descriptors.length, input.port, semanticIds);
  }
  let committed: ReturnType<Stage8BcCorpusTransactionPort['commitRun']>;
  try { committed = input.port.commitRun({ manifest, ledger }); } catch {
    return fail(runId, 'bc-corpus-final-commit-failed', descriptors.length, input.port, semanticIds);
  }
  if (!committed.ok) return fail(runId, committed.reason, descriptors.length, input.port, semanticIds);
  return {
    ok: true,
    status: 'committed',
    manifest,
    ledger,
    artifactsWritten: STAGE8_BC_CORPUS_FINAL_ARTIFACT_COUNT,
    pilotGamesExecuted: 64,
    trainingStarted: false,
  };
}
