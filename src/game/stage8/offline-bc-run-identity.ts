import { createHash } from 'node:crypto';
import {
  STAGE8_BC_ARTIFACT_CONTROL_PREDECESSOR_VERSION,
  STAGE8_BC_ARTIFACT_CONTROL_VERSION,
  STAGE8_BC_ARTIFACT_SCOPE,
  STAGE8_BC_MAX_SAMPLES_PER_SHARD,
  STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES,
  hashStage8BcArtifactControlManifestPayload,
  validateStage8BcArtifactControlManifest,
  type Stage8BcArtifactControlManifest,
} from './offline-bc-artifact-control';
import {
  STAGE8_BC_CONTROL_VERSION,
  STAGE8_BC_TEACHER_TEMPERATURE,
  hashStage8BcControlManifestPayload,
  validateStage8BcControlManifest,
  type Stage8BcControlManifest,
} from './offline-bc-control';
import {
  STAGE8_BC_CORPUS_BASE_SEED,
  STAGE8_BC_CORPUS_CONTROL_PREDECESSOR_VERSION,
  STAGE8_BC_CORPUS_CONTROL_SUPERVISED_VERSION,
  STAGE8_BC_CORPUS_CONTROL_VERSION,
  STAGE8_BC_CORPUS_GAME_COUNT,
  STAGE8_BC_CORPUS_MAX_RUN_BYTES,
  STAGE8_BC_CORPUS_MAX_TRANSITIONS,
  STAGE8_BC_CORPUS_SCOPE,
  STAGE8_BC_CORPUS_WORKERS,
  hashStage8BcCorpusControlPayload,
  validateStage8BcCorpusControlManifest,
  type Stage8BcCorpusControlManifest,
} from './offline-bc-corpus-control';
import { hashStage8BcCorpusManifestDefinition } from './offline-bc-corpus-manifest';
import {
  hashStage8BcCheckpointDefinition,
  hashStage8BcModelDefinition,
  hashStage8BcOnnxExportDefinition,
  hashStage8BcParityDefinition,
  hashStage8BcTrainingDefinition,
} from './offline-bc-model-lifecycle-protocol';
import { hashStage8BcSampleProtocolDefinition } from './offline-bc-sample-protocol';
import { hashStage8BcArtifactWriterDefinition } from './offline-bc-sample-writer';
import { hashStage8BcTeacherDefinition } from './offline-bc-teacher';
import { hashStage8OfflineIdentity } from './offline-action-identity';
import { hashStage8OnnxTensorContract } from './offline-onnx-tensor-contract';
import {
  STAGE8_BC_PREDECESSOR_RUN_ID,
  STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY,
  validateStage8BcOperationalInterruptionEvidence,
  type Stage8BcOperationalInterruptionExpectedIdentity,
  type Stage8BcOperationalInterruptionEvidence,
} from './offline-bc-operational-interruption';
import {
  STAGE8_BC_HEARTBEAT_INTERVAL_MS,
  STAGE8_BC_HEARTBEAT_STALE_MS,
  STAGE8_BC_MAX_OPERATIONAL_INTERRUPTION_COUNT,
  STAGE8_BC_PRIOR_OPERATIONAL_INTERRUPTION_COUNT,
  STAGE8_BC_SUPERVISION_CONTROL_VERSION,
  STAGE8_BC_SUPERVISION_SCOPE,
  STAGE8_BC_SUPERVISION_WORKERS,
  hashStage8BcSupervisionControlPayload,
  hashStage8BcSupervisionDefinition,
  validateStage8BcSupervisionControlManifest,
  type Stage8BcSupervisionControlManifest,
} from './offline-bc-supervision-control';

export const STAGE8_BC_RUN_IDENTITY_VERSION = 'stage8-bc-run-identity-v3';
export const STAGE8_BC_RUN_AUTHORIZATION_VERSION = 'stage8-bc-run-authorization-v3';
export const STAGE8_BC_FORMAL_RUN_ID = 'formal-bc-corpus-pilot-20260913';
export const STAGE8_BC_LEGACY_FORMAL_RUN_ID = STAGE8_BC_PREDECESSOR_RUN_ID;
export const STAGE8_BC_RUN_IDENTITY_EMIT_SCOPE = 'bc-formal-run-identity-material-emit';

export const STAGE8_BC_RUN_SOURCE_FILES = Object.freeze([
  'docs/rules.md',
  'public/game/rule_engine.js',
  'scripts/stage8-bc-corpus-runner.mjs',
  'scripts/stage8-bc-corpus-supervised-launch.mjs',
  'scripts/stage8-bc-corpus-supervisor.mjs',
  'scripts/stage8-bc-corpus-verify.py',
  'scripts/stage8-bc-operational-interruption-evidence.mjs',
  'src/game/mcts/mcts-enhancement-engine.ts',
  'src/game/rules/added-kong.ts',
  'src/game/rules/concealed-kong.ts',
  'src/game/rules/hand-evaluator.ts',
  'src/game/rules/index.ts',
  'src/game/rules/kong-resource.ts',
  'src/game/rules/meld-validator.ts',
  'src/game/rules/round-transition.ts',
  'src/game/rules/rule-config.ts',
  'src/game/rules/score-calculator.ts',
  'src/game/rules/special-kong.ts',
  'src/game/rules/tile-utils.ts',
  'src/game/rules/types.ts',
  'src/game/rules/wildcard-resolver.ts',
  'src/game/strong-rule-ai/ai-decision-engine.ts',
  'src/game/strong-rule-ai/attack-defense-fsm.ts',
  'src/game/strong-rule-ai/dalan-router.ts',
  'src/game/strong-rule-ai/decision-logger.ts',
  'src/game/strong-rule-ai/defense-basic.ts',
  'src/game/strong-rule-ai/defense-engine.ts',
  'src/game/strong-rule-ai/defense-signal-processor.ts',
  'src/game/strong-rule-ai/hand-value-evaluator.ts',
  'src/game/strong-rule-ai/index.ts',
  'src/game/strong-rule-ai/kong-zhichan-analyzer.ts',
  'src/game/strong-rule-ai/opponent-modeler.ts',
  'src/game/strong-rule-ai/phase-detector.ts',
  'src/game/strong-rule-ai/position-adjuster.ts',
  'src/game/strong-rule-ai/safety-evaluator.ts',
  'src/game/strong-rule-ai/speed-evaluator.ts',
  'src/game/strong-rule-ai/structure-penalty.ts',
  'src/game/strong-rule-ai/types.ts',
  'src/game/strong-rule-ai/utils.ts',
  'src/game/strong-rule-ai/wait-quality-evaluator.ts',
  'src/game/stage8/action-registry-v2.ts',
  'src/game/stage8/action-space-v2.ts',
  'src/game/stage8/artifact-root-preflight.ts',
  'src/game/stage8/diagnostic-actor-v2.ts',
  'src/game/stage8/offline-action-identity.ts',
  'src/game/stage8/offline-bc-artifact-control.ts',
  'src/game/stage8/offline-bc-control.ts',
  'src/game/stage8/offline-bc-corpus-control.ts',
  'src/game/stage8/offline-bc-corpus-manifest.ts',
  'src/game/stage8/offline-bc-corpus-runner.ts',
  'src/game/stage8/offline-bc-model-lifecycle-protocol.ts',
  'src/game/stage8/offline-bc-operational-interruption.ts',
  'src/game/stage8/offline-bc-sample-probe-control.ts',
  'src/game/stage8/offline-bc-sample-probe-runner.ts',
  'src/game/stage8/offline-bc-sample-protocol.ts',
  'src/game/stage8/offline-bc-sample-writer.ts',
  'src/game/stage8/offline-bc-supervision-control.ts',
  'src/game/stage8/offline-bc-teacher.ts',
  'src/game/stage8/offline-behavior-distribution.ts',
  'src/game/stage8/offline-canonical-mcts-provider.ts',
  'src/game/stage8/offline-curriculum-kong-zhichan-chain.ts',
  'src/game/stage8/offline-episode-context.ts',
  'src/game/stage8/offline-frozen-model-inference.ts',
  'src/game/stage8/offline-onnx-inference-adapter.ts',
  'src/game/stage8/offline-onnx-tensor-contract.ts',
  'src/game/stage8/offline-round-adapter.ts',
  'src/game/stage8/offline-selfplay-control.ts',
  'src/game/stage8/offline-selfplay-engine.ts',
  'src/game/stage8/offline-smoke-runner.ts',
  'src/game/stage8/offline-smoke-runtime-preflight.ts',
  'src/game/stage8/offline-trajectory-executor.ts',
  'src/game/stage8/page-semantics-adapter-v2.ts',
  'src/game/stage8/python/stage8_bc/__init__.py',
  'src/game/stage8/python/stage8_bc/contracts.py',
  'src/game/stage8/python/stage8_bc/dataset.py',
  'src/game/stage8/python/stage8_bc/export_onnx.py',
  'src/game/stage8/python/stage8_bc/model.py',
  'src/game/stage8/python/stage8_bc/training.py',
  'src/game/stage8/round-engine-v2.ts',
  'src/game/stage8/rule-semantics-adapter-v2.ts',
  'src/game/stage8/v2-visible-state.ts',
].sort());

type Approval = { approvalId: string; granted: boolean; scope: string };

export interface Stage8BcRunAuthorizationInput {
  protocolVersion: typeof STAGE8_BC_RUN_AUTHORIZATION_VERSION;
  runId: typeof STAGE8_BC_FORMAL_RUN_ID;
  sourceCommit: string;
  predecessor: {
    runId: typeof STAGE8_BC_PREDECESSOR_RUN_ID;
    evidenceSha256: string;
  };
  approvals: {
    bc: Approval;
    artifact: Approval;
    corpus: Approval;
    emit: Approval;
    supervision: Approval;
  };
  authorizationSha256: string;
}

export interface Stage8BcRunSourceIdentity {
  protocolVersion: typeof STAGE8_BC_RUN_IDENTITY_VERSION;
  sourceCommit: string;
  files: Array<{ path: string; sha256: string }>;
  sourceBundleSha256: string;
  rulesSha256: string;
  browserRulesSha256: string;
  actionSpaceSha256: string;
  featureSha256: string;
  trajectoryDefinitionSha256: string;
  pythonDatasetDefinitionSha256: string;
  capacityPreflightSha256: string;
  supervisionDefinitionSha256: string;
}

export type Stage8BcRunIdentityResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export interface Stage8BcRunIdentityMaterials {
  source: Stage8BcRunSourceIdentity;
  bcControl: Stage8BcControlManifest;
  artifactControl: Stage8BcArtifactControlManifest;
  corpusControl: Stage8BcCorpusControlManifest;
  supervisionControl: Stage8BcSupervisionControlManifest;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
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

function authorizationPayload(input: Stage8BcRunAuthorizationInput): Omit<Stage8BcRunAuthorizationInput, 'authorizationSha256'> {
  const { authorizationSha256: _authorizationSha256, ...payload } = input;
  return payload;
}

export function hashStage8BcRunAuthorizationInput(
  input: Omit<Stage8BcRunAuthorizationInput, 'authorizationSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function validateStage8BcRunAuthorizationInput(
  input: Stage8BcRunAuthorizationInput,
): Stage8BcRunIdentityResult<{ sourceCommit: string; predecessorEvidenceSha256: string }> {
  if (!exactKeys(input, ['protocolVersion','runId','sourceCommit','predecessor','approvals','authorizationSha256'])
    || !exactKeys(input?.predecessor, ['runId','evidenceSha256'])
    || !exactKeys(input?.approvals, ['bc','artifact','corpus','emit','supervision'])
    || !Object.values(input?.approvals ?? {}).every((approval) => exactKeys(approval, ['approvalId','granted','scope']))) {
    return { ok: false, reason: 'bc-run-authorization-schema-invalid' };
  }
  if (input.protocolVersion !== STAGE8_BC_RUN_AUTHORIZATION_VERSION
    || input.runId !== STAGE8_BC_FORMAL_RUN_ID
    || !/^[a-f0-9]{40}$/i.test(input.sourceCommit)
    || input.predecessor.runId !== STAGE8_BC_PREDECESSOR_RUN_ID
    || !/^[a-f0-9]{64}$/i.test(input.predecessor.evidenceSha256)) {
    return { ok: false, reason: 'bc-run-authorization-identity-invalid' };
  }
  const expectedScopes = {
    bc: 'bc-teacher-protocol-preflight',
    artifact: STAGE8_BC_ARTIFACT_SCOPE,
    corpus: STAGE8_BC_CORPUS_SCOPE,
    emit: STAGE8_BC_RUN_IDENTITY_EMIT_SCOPE,
    supervision: STAGE8_BC_SUPERVISION_SCOPE,
  };
  for (const key of Object.keys(expectedScopes) as Array<keyof typeof expectedScopes>) {
    const approval = input.approvals[key];
    if (approval.granted !== true || !validId(approval.approvalId) || approval.scope !== expectedScopes[key]) {
      return { ok: false, reason: `bc-run-${key}-authorization-required` };
    }
  }
  if (input.authorizationSha256 !== hashStage8BcRunAuthorizationInput(authorizationPayload(input))) {
    return { ok: false, reason: 'bc-run-authorization-hash-mismatch' };
  }
  return {
    ok: true,
    value: {
      sourceCommit: input.sourceCommit.toLowerCase(),
      predecessorEvidenceSha256: input.predecessor.evidenceSha256.toLowerCase(),
    },
  };
}

function bundle(files: readonly { path: string; sha256: string }[], prefix: string): string {
  return hashStage8OfflineIdentity({ version: STAGE8_BC_RUN_IDENTITY_VERSION, prefix, files });
}

export function collectStage8BcRunSourceIdentity(input: {
  sourceCommit: string;
  readFile(relativePath: string): Uint8Array;
}): Stage8BcRunIdentityResult<Stage8BcRunSourceIdentity> {
  if (!/^[a-f0-9]{40}$/i.test(input.sourceCommit)) return { ok: false, reason: 'bc-run-source-commit-invalid' };
  const files: Array<{ path: string; sha256: string }> = [];
  try {
    for (const relativePath of STAGE8_BC_RUN_SOURCE_FILES) {
      files.push({ path: relativePath, sha256: sha256(input.readFile(relativePath)) });
    }
  } catch {
    return { ok: false, reason: 'bc-run-source-file-read-failed' };
  }
  const sourceCommit = input.sourceCommit.toLowerCase();
  const sourceBundleSha256 = hashStage8OfflineIdentity({
    version: STAGE8_BC_RUN_IDENTITY_VERSION,
    sourceCommit,
    files,
  });
  const select = (predicate: (relativePath: string) => boolean) => files.filter((entry) => predicate(entry.path));
  return {
    ok: true,
    value: {
      protocolVersion: STAGE8_BC_RUN_IDENTITY_VERSION,
      sourceCommit,
      files,
      sourceBundleSha256,
      rulesSha256: bundle(select((value) => value === 'docs/rules.md' || value.startsWith('src/game/rules/')), 'rules'),
      browserRulesSha256: files.find((entry) => entry.path === 'public/game/rule_engine.js')!.sha256,
      actionSpaceSha256: bundle(select((value) => /action-registry-v2|action-space-v2|rule-semantics-adapter-v2|round-engine-v2/.test(value)), 'action-space-and-mask'),
      featureSha256: bundle(select((value) => /v2-visible-state|offline-onnx-tensor-contract|offline-bc-teacher/.test(value)), 'feature-and-visible-information'),
      trajectoryDefinitionSha256: bundle(select((value) => /offline-trajectory-executor|offline-round-adapter|round-transition/.test(value)), 'trajectory'),
      pythonDatasetDefinitionSha256: bundle(select((value) => /python\/stage8_bc\/(contracts|dataset)\.py$/.test(value)), 'python-dataset'),
      capacityPreflightSha256: bundle(select((value) => value === 'scripts/stage8-bc-corpus-runner.mjs'), 'capacity-preflight'),
      supervisionDefinitionSha256: hashStage8BcSupervisionDefinition(),
    },
  };
}

export function createStage8BcRunIdentityMaterials(input: {
  authorization: Stage8BcRunAuthorizationInput;
  predecessorEvidence: Stage8BcOperationalInterruptionEvidence;
  expectedPredecessorIdentity?: Stage8BcOperationalInterruptionExpectedIdentity;
  readFile(relativePath: string): Uint8Array;
}): Stage8BcRunIdentityResult<Stage8BcRunIdentityMaterials> {
  const authorization = validateStage8BcRunAuthorizationInput(input.authorization);
  if (!authorization.ok) return authorization;
  const expectedPredecessorIdentity = input.expectedPredecessorIdentity ?? STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY;
  const predecessor = validateStage8BcOperationalInterruptionEvidence(
    input.predecessorEvidence,
    expectedPredecessorIdentity,
  );
  if (!predecessor.ok) return predecessor;
  if (predecessor.value.evidenceSha256 !== authorization.value.predecessorEvidenceSha256) {
    return { ok: false, reason: 'bc-run-authorization-predecessor-evidence-mismatch' };
  }
  const source = collectStage8BcRunSourceIdentity({ sourceCommit: authorization.value.sourceCommit, readFile: input.readFile });
  if (!source.ok) return source;
  const identity = source.value;
  const bcPayload: Omit<Stage8BcControlManifest, 'manifestSha256'> = {
    protocolVersion: STAGE8_BC_CONTROL_VERSION,
    identity: {
      runId: STAGE8_BC_FORMAL_RUN_ID,
      sourceBundleSha256: identity.sourceBundleSha256,
      rulesSha256: identity.rulesSha256,
      browserRulesSha256: identity.browserRulesSha256,
      actionSpaceSha256: identity.actionSpaceSha256,
      legalActionMaskSha256: identity.actionSpaceSha256,
      featureSha256: identity.featureSha256,
      visibleInformationSha256: identity.featureSha256,
      tensorContractSha256: hashStage8OnnxTensorContract(),
      teacherDefinitionSha256: hashStage8BcTeacherDefinition(),
      sampleSchemaSha256: hashStage8BcSampleProtocolDefinition(),
    },
    authorization: { ...input.authorization.approvals.bc, scope: 'bc-teacher-protocol-preflight' },
    teacherTemperature: STAGE8_BC_TEACHER_TEMPERATURE,
    allowSampleGeneration: false,
    allowPythonRuntime: false,
    allowTraining: false,
    allowModelCreation: false,
    allowOnnxExport: false,
    allowArtifactWrite: false,
    allowSmoke: false,
    allowRuntime: false,
  };
  const bcControl: Stage8BcControlManifest = { ...bcPayload, manifestSha256: hashStage8BcControlManifestPayload(bcPayload) };
  const artifactPayload: Omit<Stage8BcArtifactControlManifest, 'manifestSha256'> = {
    protocolVersion: STAGE8_BC_ARTIFACT_CONTROL_PREDECESSOR_VERSION,
    identity: {
      runId: STAGE8_BC_FORMAL_RUN_ID,
      predecessorRunId: STAGE8_BC_PREDECESSOR_RUN_ID,
      predecessorEvidenceSha256: predecessor.value.evidenceSha256,
      runAuthorizationSha256: input.authorization.authorizationSha256,
      sourceBundleSha256: identity.sourceBundleSha256,
      bcControlManifestSha256: bcControl.manifestSha256,
      sampleSchemaSha256: hashStage8BcSampleProtocolDefinition(),
      tensorContractSha256: hashStage8OnnxTensorContract(),
      writerDefinitionSha256: hashStage8BcArtifactWriterDefinition(),
      pythonDatasetDefinitionSha256: identity.pythonDatasetDefinitionSha256,
      modelDefinitionSha256: hashStage8BcModelDefinition(),
      trainingDefinitionSha256: hashStage8BcTrainingDefinition(),
      checkpointDefinitionSha256: hashStage8BcCheckpointDefinition(),
      onnxExportDefinitionSha256: hashStage8BcOnnxExportDefinition(),
      parityDefinitionSha256: hashStage8BcParityDefinition(),
    },
    bcControl,
    authorization: { ...input.authorization.approvals.artifact, scope: STAGE8_BC_ARTIFACT_SCOPE },
    limits: {
      maxSamplesPerShard: STAGE8_BC_MAX_SAMPLES_PER_SHARD,
      maxUncompressedShardBytes: STAGE8_BC_MAX_UNCOMPRESSED_SHARD_BYTES,
    },
    allowSampleGeneration: true,
    allowArtifactWrite: true,
    allowPythonRuntime: false,
    allowTraining: false,
    allowModelCreation: false,
    allowCheckpointWrite: false,
    allowOnnxExport: false,
    allowSmoke: false,
    allowRuntime: false,
  };
  const artifactControl: Stage8BcArtifactControlManifest = {
    ...artifactPayload,
    manifestSha256: hashStage8BcArtifactControlManifestPayload(artifactPayload),
  };
  const corpusPayload: Omit<Stage8BcCorpusControlManifest, 'manifestSha256'> = {
    protocolVersion: STAGE8_BC_CORPUS_CONTROL_SUPERVISED_VERSION,
    identity: {
      runId: STAGE8_BC_FORMAL_RUN_ID,
      predecessorRunId: STAGE8_BC_PREDECESSOR_RUN_ID,
      predecessorEvidenceSha256: predecessor.value.evidenceSha256,
      runAuthorizationSha256: input.authorization.authorizationSha256,
      sourceBundleSha256: identity.sourceBundleSha256,
      artifactControlManifestSha256: artifactControl.manifestSha256,
      bcControlManifestSha256: bcControl.manifestSha256,
      rulesSha256: identity.rulesSha256,
      browserRulesSha256: identity.browserRulesSha256,
      actionSpaceSha256: identity.actionSpaceSha256,
      legalActionMaskSha256: identity.actionSpaceSha256,
      featureSha256: identity.featureSha256,
      visibleInformationSha256: identity.featureSha256,
      tensorContractSha256: hashStage8OnnxTensorContract(),
      teacherDefinitionSha256: hashStage8BcTeacherDefinition(),
      sampleSchemaSha256: hashStage8BcSampleProtocolDefinition(),
      writerDefinitionSha256: hashStage8BcArtifactWriterDefinition(),
      trajectoryDefinitionSha256: identity.trajectoryDefinitionSha256,
      pythonDatasetDefinitionSha256: identity.pythonDatasetDefinitionSha256,
      corpusManifestDefinitionSha256: hashStage8BcCorpusManifestDefinition(),
      capacityPreflightSha256: identity.capacityPreflightSha256,
      supervisionDefinitionSha256: identity.supervisionDefinitionSha256,
    },
    authorization: { ...input.authorization.approvals.corpus, scope: STAGE8_BC_CORPUS_SCOPE },
    plan: {
      baseSeed: STAGE8_BC_CORPUS_BASE_SEED,
      seedDerivation: 'base-plus-game-index-v1',
      gameCount: STAGE8_BC_CORPUS_GAME_COUNT,
      candidateSeatDerivation: 'game-index-modulo-four-v1',
      candidateSeatGames: [16,16,16,16],
      workers: STAGE8_BC_CORPUS_WORKERS,
      curriculum: 'normal-full-rules',
      exploration: false,
      modelLoading: false,
      recordAllSeats: true,
      maxSuccessfulTransitionsPerGame: STAGE8_BC_CORPUS_MAX_TRANSITIONS,
      splitUnit: 'episode-seed-group',
      splitCounts: { train: 48, validation: 8, finalTest: 8 },
      splitAssignment: 'game-index-ranges-v1',
      crossRunPolicy: 'single-run-only',
      supervisedExecutionRequired: true,
      priorOperationalInterruptions: 1,
      maxOperationalInterruptions: 1,
      automaticRetries: 0,
      seedOverrides: 0,
    },
    capacity: {
      maxRunBytes: STAGE8_BC_CORPUS_MAX_RUN_BYTES,
      rootHardLimitBytes: 68719476736,
      rootFusePercent: 80,
      preflightBeforeRun: true,
      preflightBeforeEachBatchCommit: true,
    },
    allowCorpusPilotExecution: true,
    allowArtifactWrite: true,
    allowCrossRun: false,
    allowTraining: false,
    allowValidationSamplingForTraining: false,
    allowFinalTestSamplingForTraining: false,
    allowModelLoading: false,
    allowExploration: false,
    allowSmoke: false,
    allowSelfplay: false,
    allowOnnxExport: false,
    allowRuntime: false,
  };
  const corpusControl: Stage8BcCorpusControlManifest = {
    ...corpusPayload,
    manifestSha256: hashStage8BcCorpusControlPayload(corpusPayload),
  };
  const sourceSha = (relativePath: string) => identity.files.find((entry) => entry.path === relativePath)!.sha256;
  const supervisionPayload: Omit<Stage8BcSupervisionControlManifest, 'manifestSha256'> = {
    protocolVersion: STAGE8_BC_SUPERVISION_CONTROL_VERSION,
    identity: {
      runId: STAGE8_BC_FORMAL_RUN_ID,
      sourceCommit: identity.sourceCommit,
      sourceBundleSha256: identity.sourceBundleSha256,
      runAuthorizationSha256: input.authorization.authorizationSha256,
      artifactControlManifestSha256: artifactControl.manifestSha256,
      corpusControlManifestSha256: corpusControl.manifestSha256,
      predecessorEvidenceSha256: predecessor.value.evidenceSha256,
      supervisionDefinitionSha256: identity.supervisionDefinitionSha256,
      launcherSourceSha256: sourceSha('scripts/stage8-bc-corpus-supervised-launch.mjs'),
      supervisorSourceSha256: sourceSha('scripts/stage8-bc-corpus-supervisor.mjs'),
      runnerSourceSha256: sourceSha('scripts/stage8-bc-corpus-runner.mjs'),
    },
    authorization: {
      approvalId: input.authorization.approvals.supervision.approvalId,
      granted: true,
      scope: STAGE8_BC_SUPERVISION_SCOPE,
    },
    policy: {
      workers: STAGE8_BC_SUPERVISION_WORKERS,
      priorOperationalInterruptions: STAGE8_BC_PRIOR_OPERATIONAL_INTERRUPTION_COUNT,
      maxOperationalInterruptions: STAGE8_BC_MAX_OPERATIONAL_INTERRUPTION_COUNT,
      automaticRetries: 0,
      seedOverrides: 0,
      allowThirdAttempt: false,
      windowsHide: true,
      detachedSupervisor: true,
      shell: false,
      heartbeatIntervalMs: STAGE8_BC_HEARTBEAT_INTERVAL_MS,
      heartbeatStaleMs: STAGE8_BC_HEARTBEAT_STALE_MS,
    },
  };
  const supervisionControl: Stage8BcSupervisionControlManifest = {
    ...supervisionPayload,
    manifestSha256: hashStage8BcSupervisionControlPayload(supervisionPayload),
  };
  const materials = { source: identity, bcControl, artifactControl, corpusControl, supervisionControl };
  const verified = validateStage8BcRunIdentityMaterials({
    sourceCommit: identity.sourceCommit,
    readFile: input.readFile,
    authorization: input.authorization,
    predecessorEvidence: input.predecessorEvidence,
    expectedPredecessorIdentity,
    artifactControl,
    corpusControl,
    supervisionControl,
  });
  return verified.ok ? { ok: true, value: materials } : verified;
}

export function validateStage8BcRunIdentityMaterials(input: {
  sourceCommit: string;
  readFile(relativePath: string): Uint8Array;
  authorization: Stage8BcRunAuthorizationInput;
  predecessorEvidence: Stage8BcOperationalInterruptionEvidence;
  expectedPredecessorIdentity?: Stage8BcOperationalInterruptionExpectedIdentity;
  artifactControl: Stage8BcArtifactControlManifest;
  corpusControl: Stage8BcCorpusControlManifest;
  supervisionControl: Stage8BcSupervisionControlManifest;
}): Stage8BcRunIdentityResult<{ source: Stage8BcRunSourceIdentity }> {
  const authorization = validateStage8BcRunAuthorizationInput(input.authorization);
  if (!authorization.ok) return authorization;
  const predecessor = validateStage8BcOperationalInterruptionEvidence(
    input.predecessorEvidence,
    input.expectedPredecessorIdentity ?? STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY,
  );
  if (!predecessor.ok) return predecessor;
  if (input.sourceCommit.toLowerCase() !== authorization.value.sourceCommit
    || authorization.value.predecessorEvidenceSha256 !== predecessor.value.evidenceSha256) {
    return { ok: false, reason: 'bc-run-authorization-or-predecessor-identity-mismatch' };
  }
  const bc = validateStage8BcControlManifest(input.artifactControl?.bcControl);
  if (!bc.ok) return { ok: false, reason: bc.decision.reason };
  const artifact = validateStage8BcArtifactControlManifest(input.artifactControl);
  if (!artifact.ok) return { ok: false, reason: artifact.decision.reason };
  const corpus = validateStage8BcCorpusControlManifest(input.corpusControl);
  if (!corpus.ok) return { ok: false, reason: corpus.decision.reason };
  const supervision = validateStage8BcSupervisionControlManifest(input.supervisionControl);
  if (!supervision.ok) return supervision;
  const source = collectStage8BcRunSourceIdentity({ sourceCommit: input.sourceCommit, readFile: input.readFile });
  if (!source.ok) return source;
  const expected = source.value;
  const bcControl = input.artifactControl.bcControl;
  const corpusIdentity = input.corpusControl.identity;
  const sharedChecks = [
    bcControl.identity.sourceBundleSha256 === expected.sourceBundleSha256,
    input.artifactControl.identity.sourceBundleSha256 === expected.sourceBundleSha256,
    corpusIdentity.sourceBundleSha256 === expected.sourceBundleSha256,
    bcControl.identity.rulesSha256 === expected.rulesSha256,
    corpusIdentity.rulesSha256 === expected.rulesSha256,
    bcControl.identity.browserRulesSha256 === expected.browserRulesSha256,
    corpusIdentity.browserRulesSha256 === expected.browserRulesSha256,
    bcControl.identity.actionSpaceSha256 === expected.actionSpaceSha256,
    corpusIdentity.actionSpaceSha256 === expected.actionSpaceSha256,
    bcControl.identity.featureSha256 === expected.featureSha256,
    corpusIdentity.featureSha256 === expected.featureSha256,
    bcControl.identity.tensorContractSha256 === hashStage8OnnxTensorContract(),
    corpusIdentity.tensorContractSha256 === hashStage8OnnxTensorContract(),
    bcControl.identity.teacherDefinitionSha256 === hashStage8BcTeacherDefinition(),
    corpusIdentity.teacherDefinitionSha256 === hashStage8BcTeacherDefinition(),
    bcControl.identity.sampleSchemaSha256 === hashStage8BcSampleProtocolDefinition(),
    input.artifactControl.identity.sampleSchemaSha256 === hashStage8BcSampleProtocolDefinition(),
    corpusIdentity.sampleSchemaSha256 === hashStage8BcSampleProtocolDefinition(),
    input.artifactControl.identity.writerDefinitionSha256 === hashStage8BcArtifactWriterDefinition(),
    corpusIdentity.writerDefinitionSha256 === hashStage8BcArtifactWriterDefinition(),
    input.artifactControl.identity.pythonDatasetDefinitionSha256 === expected.pythonDatasetDefinitionSha256,
    corpusIdentity.pythonDatasetDefinitionSha256 === expected.pythonDatasetDefinitionSha256,
    input.artifactControl.identity.modelDefinitionSha256 === hashStage8BcModelDefinition(),
    input.artifactControl.identity.trainingDefinitionSha256 === hashStage8BcTrainingDefinition(),
    input.artifactControl.identity.checkpointDefinitionSha256 === hashStage8BcCheckpointDefinition(),
    input.artifactControl.identity.onnxExportDefinitionSha256 === hashStage8BcOnnxExportDefinition(),
    input.artifactControl.identity.parityDefinitionSha256 === hashStage8BcParityDefinition(),
    corpusIdentity.trajectoryDefinitionSha256 === expected.trajectoryDefinitionSha256,
    corpusIdentity.corpusManifestDefinitionSha256 === hashStage8BcCorpusManifestDefinition(),
    corpusIdentity.capacityPreflightSha256 === expected.capacityPreflightSha256,
    corpusIdentity.supervisionDefinitionSha256 === expected.supervisionDefinitionSha256,
    input.artifactControl.manifestSha256 === corpusIdentity.artifactControlManifestSha256,
    bcControl.manifestSha256 === corpusIdentity.bcControlManifestSha256,
    input.artifactControl.identity.predecessorRunId === STAGE8_BC_PREDECESSOR_RUN_ID,
    corpusIdentity.predecessorRunId === STAGE8_BC_PREDECESSOR_RUN_ID,
    input.artifactControl.identity.predecessorEvidenceSha256 === predecessor.value.evidenceSha256,
    corpusIdentity.predecessorEvidenceSha256 === predecessor.value.evidenceSha256,
    input.artifactControl.identity.runAuthorizationSha256 === input.authorization.authorizationSha256,
    corpusIdentity.runAuthorizationSha256 === input.authorization.authorizationSha256,
    input.supervisionControl.identity.runId === STAGE8_BC_FORMAL_RUN_ID,
    input.supervisionControl.identity.sourceCommit === expected.sourceCommit,
    input.supervisionControl.identity.sourceBundleSha256 === expected.sourceBundleSha256,
    input.supervisionControl.identity.runAuthorizationSha256 === input.authorization.authorizationSha256,
    input.supervisionControl.identity.artifactControlManifestSha256 === input.artifactControl.manifestSha256,
    input.supervisionControl.identity.corpusControlManifestSha256 === input.corpusControl.manifestSha256,
    input.supervisionControl.identity.predecessorEvidenceSha256 === predecessor.value.evidenceSha256,
    input.supervisionControl.identity.supervisionDefinitionSha256 === expected.supervisionDefinitionSha256,
    input.supervisionControl.identity.launcherSourceSha256 === expected.files.find((entry) => entry.path === 'scripts/stage8-bc-corpus-supervised-launch.mjs')?.sha256,
    input.supervisionControl.identity.supervisorSourceSha256 === expected.files.find((entry) => entry.path === 'scripts/stage8-bc-corpus-supervisor.mjs')?.sha256,
    input.supervisionControl.identity.runnerSourceSha256 === expected.files.find((entry) => entry.path === 'scripts/stage8-bc-corpus-runner.mjs')?.sha256,
  ];
  if (input.corpusControl.identity.runId !== STAGE8_BC_FORMAL_RUN_ID
    || input.artifactControl.identity.runId !== STAGE8_BC_FORMAL_RUN_ID
    || bcControl.identity.runId !== STAGE8_BC_FORMAL_RUN_ID
    || sharedChecks.some((value) => !value)) {
    return { ok: false, reason: 'bc-run-source-or-control-identity-mismatch' };
  }
  return { ok: true, value: { source: expected } };
}
