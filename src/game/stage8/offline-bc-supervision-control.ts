import { hashStage8OfflineIdentity } from './offline-action-identity';

export const STAGE8_BC_SUPERVISION_PROTOCOL_VERSION = 'stage8-bc-supervision-v1';
export const STAGE8_BC_SUPERVISION_CONTROL_VERSION = 'stage8-bc-supervision-control-v1';
export const STAGE8_BC_SUPERVISION_SCOPE = 'bc-formal-pilot-supervision';
export const STAGE8_BC_SUPERVISION_WORKERS = 1;
export const STAGE8_BC_PRIOR_OPERATIONAL_INTERRUPTION_COUNT = 1;
export const STAGE8_BC_MAX_OPERATIONAL_INTERRUPTION_COUNT = 1;
export const STAGE8_BC_HEARTBEAT_INTERVAL_MS = 2_000;
export const STAGE8_BC_HEARTBEAT_STALE_MS = 15_000;

export type Stage8BcSupervisionState = 'starting' | 'running' | 'completed' | 'failed' | 'interrupted';
export type Stage8BcSupervisionTerminalState =
  | 'committed'
  | 'quarantined'
  | 'fused'
  | 'operational-interruption-limit-reached';

export interface Stage8BcSupervisionControlManifest {
  protocolVersion: typeof STAGE8_BC_SUPERVISION_CONTROL_VERSION;
  identity: {
    runId: string;
    sourceCommit: string;
    sourceBundleSha256: string;
    runAuthorizationSha256: string;
    artifactControlManifestSha256: string;
    corpusControlManifestSha256: string;
    predecessorEvidenceSha256: string;
    supervisionDefinitionSha256: string;
    launcherSourceSha256: string;
    supervisorSourceSha256: string;
    runnerSourceSha256: string;
  };
  authorization: { approvalId: string; granted: true; scope: typeof STAGE8_BC_SUPERVISION_SCOPE };
  policy: {
    workers: 1;
    priorOperationalInterruptions: 1;
    maxOperationalInterruptions: 1;
    automaticRetries: 0;
    seedOverrides: 0;
    allowThirdAttempt: false;
    windowsHide: true;
    detachedSupervisor: true;
    shell: false;
    heartbeatIntervalMs: number;
    heartbeatStaleMs: number;
  };
  manifestSha256: string;
}

export interface Stage8BcSupervisionStatus {
  protocolVersion: typeof STAGE8_BC_SUPERVISION_PROTOCOL_VERSION;
  runId: string;
  supervisionManifestSha256: string;
  sourceCommit: string;
  sourceBundleSha256: string;
  predecessorEvidenceSha256: string;
  launchNonce: string;
  sequence: number;
  previousStatusSha256: string | null;
  state: Stage8BcSupervisionState;
  launcherPid: number;
  supervisorPid: number;
  workerPid: number;
  supervisorStartedAt: string;
  workerStartedAt: string;
  heartbeatAt: string;
  progress: { completedGames: number; completedShards: number; lastGameIndex: number | null };
  commandIdentity: {
    executableSha256: string;
    argvSha256: string;
    environmentAllowlistSha256: string;
    cwdSha256: string;
  };
  exitCode: number | null;
  signal: string | null;
  terminalState: Stage8BcSupervisionTerminalState | null;
  automaticRetries: 0;
  seedOverrides: 0;
  statusSha256: string;
}

export type Stage8BcSupervisionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{2,127}$/i.test(value);
}

function positivePid(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function hashStage8BcSupervisionDefinition(): string {
  return hashStage8OfflineIdentity({
    protocolVersion: STAGE8_BC_SUPERVISION_PROTOCOL_VERSION,
    controlVersion: STAGE8_BC_SUPERVISION_CONTROL_VERSION,
    states: ['starting','running','completed','failed','interrupted'],
    terminals: ['committed','quarantined','fused','operational-interruption-limit-reached'],
    workers: STAGE8_BC_SUPERVISION_WORKERS,
    priorOperationalInterruptions: STAGE8_BC_PRIOR_OPERATIONAL_INTERRUPTION_COUNT,
    maxOperationalInterruptions: STAGE8_BC_MAX_OPERATIONAL_INTERRUPTION_COUNT,
    automaticRetries: 0,
    seedOverrides: 0,
  });
}

export function hashStage8BcSupervisionControlPayload(
  input: Omit<Stage8BcSupervisionControlManifest, 'manifestSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function validateStage8BcSupervisionControlManifest(
  manifest: Stage8BcSupervisionControlManifest,
): Stage8BcSupervisionResult<{ identitySha256: string }> {
  if (!exactKeys(manifest, ['protocolVersion','identity','authorization','policy','manifestSha256'])
    || !exactKeys(manifest?.identity, [
      'runId','sourceCommit','sourceBundleSha256','runAuthorizationSha256','artifactControlManifestSha256',
      'corpusControlManifestSha256','predecessorEvidenceSha256','supervisionDefinitionSha256',
      'launcherSourceSha256','supervisorSourceSha256','runnerSourceSha256',
    ]) || !exactKeys(manifest?.authorization, ['approvalId','granted','scope'])
    || !exactKeys(manifest?.policy, [
      'workers','priorOperationalInterruptions','maxOperationalInterruptions','automaticRetries','seedOverrides',
      'allowThirdAttempt','windowsHide','detachedSupervisor','shell','heartbeatIntervalMs','heartbeatStaleMs',
    ])) return { ok: false, reason: 'bc-supervision-control-schema-invalid' };
  const identity = manifest.identity;
  if (manifest.protocolVersion !== STAGE8_BC_SUPERVISION_CONTROL_VERSION || !id(identity.runId)
    || !/^[a-f0-9]{40}$/i.test(identity.sourceCommit)
    || Object.entries(identity).some(([key, value]) => !['runId','sourceCommit'].includes(key) && !sha(value))) {
    return { ok: false, reason: 'bc-supervision-control-identity-invalid' };
  }
  if (!manifest.authorization.granted || !id(manifest.authorization.approvalId)
    || manifest.authorization.scope !== STAGE8_BC_SUPERVISION_SCOPE) {
    return { ok: false, reason: 'bc-supervision-control-authorization-required' };
  }
  const policy = manifest.policy;
  if (policy.workers !== STAGE8_BC_SUPERVISION_WORKERS
    || policy.priorOperationalInterruptions !== STAGE8_BC_PRIOR_OPERATIONAL_INTERRUPTION_COUNT
    || policy.maxOperationalInterruptions !== STAGE8_BC_MAX_OPERATIONAL_INTERRUPTION_COUNT
    || policy.automaticRetries !== 0 || policy.seedOverrides !== 0 || policy.allowThirdAttempt !== false
    || policy.windowsHide !== true || policy.detachedSupervisor !== true || policy.shell !== false
    || policy.heartbeatIntervalMs !== STAGE8_BC_HEARTBEAT_INTERVAL_MS
    || policy.heartbeatStaleMs !== STAGE8_BC_HEARTBEAT_STALE_MS
    || identity.supervisionDefinitionSha256 !== hashStage8BcSupervisionDefinition()) {
    return { ok: false, reason: 'bc-supervision-control-policy-invalid' };
  }
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  if (manifest.manifestSha256 !== hashStage8BcSupervisionControlPayload(payload)) {
    return { ok: false, reason: 'bc-supervision-control-hash-mismatch' };
  }
  return { ok: true, value: { identitySha256: hashStage8OfflineIdentity(identity) } };
}

export function hashStage8BcSupervisionStatusPayload(
  input: Omit<Stage8BcSupervisionStatus, 'statusSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function validateStage8BcSupervisionStatus(input: {
  status: Stage8BcSupervisionStatus;
  control: Stage8BcSupervisionControlManifest;
  previous?: Stage8BcSupervisionStatus;
  expectedCommandIdentity?: Stage8BcSupervisionStatus['commandIdentity'];
}): Stage8BcSupervisionResult<{ terminal: boolean }> {
  const { status, control, previous } = input;
  const validated = validateStage8BcSupervisionControlManifest(control);
  if (!validated.ok) return validated;
  if (!exactKeys(status, [
    'protocolVersion','runId','supervisionManifestSha256','sourceCommit','sourceBundleSha256',
    'predecessorEvidenceSha256','launchNonce','sequence','previousStatusSha256','state','launcherPid',
    'supervisorPid','workerPid','supervisorStartedAt','workerStartedAt','heartbeatAt','progress',
    'commandIdentity','exitCode','signal','terminalState','automaticRetries','seedOverrides','statusSha256',
  ]) || !exactKeys(status?.progress, ['completedGames','completedShards','lastGameIndex'])
    || !exactKeys(status?.commandIdentity, ['executableSha256','argvSha256','environmentAllowlistSha256','cwdSha256'])) {
    return { ok: false, reason: 'bc-supervision-status-schema-invalid' };
  }
  if (status.protocolVersion !== STAGE8_BC_SUPERVISION_PROTOCOL_VERSION
    || status.runId !== control.identity.runId
    || status.supervisionManifestSha256 !== control.manifestSha256
    || status.sourceCommit !== control.identity.sourceCommit
    || status.sourceBundleSha256 !== control.identity.sourceBundleSha256
    || status.predecessorEvidenceSha256 !== control.identity.predecessorEvidenceSha256
    || !sha(status.launchNonce) || !Number.isInteger(status.sequence) || status.sequence < 0
    || !positivePid(status.launcherPid) || !positivePid(status.supervisorPid) || !positivePid(status.workerPid)
    || !validTime(status.supervisorStartedAt) || !validTime(status.workerStartedAt) || !validTime(status.heartbeatAt)
    || Object.values(status.commandIdentity).some((value) => !sha(value))
    || status.automaticRetries !== 0 || status.seedOverrides !== 0) {
    return { ok: false, reason: 'bc-supervision-status-identity-invalid' };
  }
  if (!Number.isInteger(status.progress.completedGames) || status.progress.completedGames < 0 || status.progress.completedGames > 64
    || !Number.isInteger(status.progress.completedShards) || status.progress.completedShards < 0 || status.progress.completedShards > 64
    || (status.progress.lastGameIndex !== null && (!Number.isInteger(status.progress.lastGameIndex)
      || status.progress.lastGameIndex < 0 || status.progress.lastGameIndex > 63))) {
    return { ok: false, reason: 'bc-supervision-status-progress-invalid' };
  }
  const terminal = ['completed','failed','interrupted'].includes(status.state);
  if ((!terminal && (status.exitCode !== null || status.signal !== null || status.terminalState !== null))
    || (terminal && status.terminalState === null)
    || (status.state === 'completed' && (status.exitCode !== 0 || status.terminalState !== 'committed'))
    || (status.state === 'interrupted' && status.terminalState !== 'operational-interruption-limit-reached')) {
    return { ok: false, reason: 'bc-supervision-status-terminal-invalid' };
  }
  if (previous) {
    if (status.sequence !== previous.sequence + 1 || status.previousStatusSha256 !== previous.statusSha256
      || status.launchNonce !== previous.launchNonce || previous.terminalState !== null
      || status.progress.completedGames < previous.progress.completedGames
      || status.progress.completedShards < previous.progress.completedShards) {
      return { ok: false, reason: 'bc-supervision-status-chain-invalid' };
    }
  } else if (status.sequence !== 0 || status.previousStatusSha256 !== null || status.state !== 'starting') {
    return { ok: false, reason: 'bc-supervision-status-initial-invalid' };
  }
  if (input.expectedCommandIdentity && Object.keys(status.commandIdentity).some((key) =>
    status.commandIdentity[key as keyof Stage8BcSupervisionStatus['commandIdentity']]
      !== input.expectedCommandIdentity![key as keyof Stage8BcSupervisionStatus['commandIdentity']])) {
    return { ok: false, reason: 'bc-supervision-status-command-identity-mismatch' };
  }
  const { statusSha256: _statusSha256, ...payload } = status;
  if (status.statusSha256 !== hashStage8BcSupervisionStatusPayload(payload)) {
    return { ok: false, reason: 'bc-supervision-status-hash-mismatch' };
  }
  return { ok: true, value: { terminal } };
}
