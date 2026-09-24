import path from 'node:path';
import { hashStage8OfflineIdentity } from './offline-action-identity';

export const STAGE8_WINDOWS_TASK_HOST_CONTROL_VERSION = 'stage8-windows-task-host-control-v1';
export const STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION = 'stage8-windows-task-host-phase-authorization-v1';
export const STAGE8_WINDOWS_TASK_HOST_MATERIAL_VERSION = 'stage8-windows-task-host-material-v1';
export const STAGE8_WINDOWS_TASK_HOST_STATUS_VERSION = 'stage8-windows-task-host-status-v1';
export const STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION = 'stage8-windows-task-host-evidence-v1';
export const STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS = 12 * 60 * 1000;
export const STAGE8_WINDOWS_TASK_HOST_EXECUTION_LIMIT_MS = 15 * 60 * 1000;
export const STAGE8_WINDOWS_TASK_HOST_KNOWN_LEASE_MS = 10 * 60 * 1000;

export type Stage8WindowsTaskHostPhase = 'materials-emit' | 'register' | 'run' | 'verify' | 'delete';

const PHASE_SCOPES: Record<Stage8WindowsTaskHostPhase, string> = {
  'materials-emit': 'stage8-windows-task-host:materials-emit',
  register: 'stage8-windows-task-host:register',
  run: 'stage8-windows-task-host:run',
  verify: 'stage8-windows-task-host:verify',
  delete: 'stage8-windows-task-host:delete',
};

export interface Stage8WindowsTaskHostControl {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_HOST_CONTROL_VERSION;
  hostRunId: string;
  targetRunId: string;
  identity: {
    releaseCommit: string;
    sourceBundleSha256: string;
    nodeExecutableSha256: string;
    hostRunnerSourceSha256: string;
    targetSourceSha256: string;
    controlProtocolSourceSha256: string;
    identitySourceSha256: string;
    argumentsSha256: string;
    workingDirectorySha256: string;
    environmentSha256: string;
  };
  authorization: {
    scope: 'stage8-windows-task-host-control';
    approvalId: string;
    granted: true;
    authorizationSha256: string;
  };
  task: {
    provider: 'windows-task-scheduler';
    taskPath: '\\WannianMahjong\\Stage8\\';
    taskName: string;
    trigger: {
      type: 'time-once';
      startBoundaryUtc: string;
      endBoundaryUtc: string;
      repetition: false;
    };
    principal: {
      userSid: string;
      logonType: 'S4U';
      runLevel: 'Limited';
      storePassword: false;
      interactive: false;
    };
    settings: {
      multipleInstances: 'IgnoreNew';
      restartCount: 0;
      allowDemandStart: false;
      startWhenAvailable: false;
      runOnlyIfNetworkAvailable: false;
      runOnlyIfIdle: false;
      wakeToRun: false;
      executionTimeLimitMs: typeof STAGE8_WINDOWS_TASK_HOST_EXECUTION_LIMIT_MS;
      deleteExpiredTaskAfterMs: null;
    };
  };
  command: {
    executablePath: string;
    hostRunnerPath: string;
    targetScriptPath: string;
    controlProtocolPath: string;
    identitySourcePath: string;
    arguments: readonly [string, '--duration-ms', string];
    workingDirectory: string;
    environment: ReadonlyArray<{ name: string; value: string }>;
    shell: false;
    detached: false;
    windowsHide: true;
  };
  paths: {
    controlPath: string;
    runAuthorizationPath: string;
    evidenceRoot: string;
    stdoutPath: string;
    stderrPath: string;
  };
  workload: {
    kind: 'disposable-diagnostic';
    durationMs: typeof STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS;
    selfTerminate: true;
    allowFormalPilot: false;
    allowTraining: false;
    allowSmoke: false;
    allowSelfPlay: false;
    allowReplay: false;
    allowModelRead: false;
  };
  capacity: {
    maxRunBytes: 5368709120;
    rootHardLimitBytes: 68719476736;
    rootFusePercent: 80;
    maxStdoutBytes: 4194304;
    maxStderrBytes: 4194304;
    maxEvidenceBytes: 16777216;
  };
  cleanup: {
    mode: 'disable-then-delete';
    automatic: false;
    requiresAuthorization: true;
    preserveEvidence: true;
  };
  manifestSha256: string;
}

export interface Stage8WindowsTaskHostPhaseAuthorization {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION;
  action: Stage8WindowsTaskHostPhase;
  scope: string;
  approvalId: string;
  granted: true;
  hostRunId: string;
  controlManifestSha256: string;
  authorizationSha256: string;
}

export interface Stage8WindowsTaskHostMaterial {
  materialVersion: typeof STAGE8_WINDOWS_TASK_HOST_MATERIAL_VERSION;
  hostRunId: string;
  controlManifestSha256: string;
  taskPath: string;
  taskName: string;
  taskXmlSha256: string;
  materialsAuthorizationSha256: string | null;
  mutationCommandsIncluded: false;
  scheduledTasksMutated: 0;
  formalPilotGamesCredited: 0;
  materialSha256: string;
}

export interface Stage8WindowsTaskHostStatus {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_HOST_STATUS_VERSION;
  hostRunId: string;
  sequence: number;
  state: 'starting' | 'running' | 'completed' | 'failed' | 'timed-out';
  observedAtUtc: string;
  previousStatusSha256: string | null;
  hostPid: number;
  childPid: number | null;
  elapsedMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  exitCode: number | null;
  signal: string | null;
  automaticRetries: 0;
  formalPilotGamesCredited: 0;
  statusSha256: string;
}

export interface Stage8WindowsTaskHostCleanupEvidence {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION;
  kind: 'cleanup';
  hostRunId: string;
  taskPath: string;
  taskName: string;
  deleteAuthorizationSha256: string;
  attemptedAtUtc: string;
  state: 'completed' | 'failed';
  disabled: boolean;
  deleted: boolean;
  taskAbsent: boolean;
  reason: string | null;
  evidenceSha256: string;
}

export interface Stage8WindowsTaskHostRegistrationEvidence {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION;
  kind: 'registration';
  hostRunId: string;
  taskPath: string;
  taskName: string;
  controlManifestSha256: string;
  materialSha256: string;
  taskXmlSha256: string;
  exportedTaskXmlSha256: string;
  registerAuthorizationSha256: string;
  registeredAtUtc: string;
  taskState: 'Ready';
  runningInstances: 0;
  lastTaskResult: null;
  evidenceSha256: string;
}

export interface Stage8WindowsTaskHostVerificationEvidence {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION;
  kind: 'verification';
  hostRunId: string;
  verifyAuthorizationSha256: string;
  registrationEvidenceSha256: string;
  terminalStatusSha256: string;
  observedAtUtc: string;
  survivedHostLeaseMs: number;
  taskState: 'Ready';
  lastTaskResult: 0;
  runningInstances: 0;
  selfTerminated: true;
  residualHostProcesses: 0;
  residualChildProcesses: 0;
  formalPathsRead: 0;
  formalPilotGamesCredited: 0;
  evidenceSha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label}-not-object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label}-schema-mismatch`);
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label}-invalid-sha256`);
}

function assertIsoUtc(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label}-invalid-utc`);
  }
}

function assertAbsoluteWindowsPath(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !path.win32.isAbsolute(value) || /[%$]/.test(value)) throw new Error(`${label}-invalid-absolute-path`);
}

function isInside(parent: string, child: string): boolean {
  const normalizedParent = path.win32.resolve(parent).toLowerCase();
  const normalizedChild = path.win32.resolve(child).toLowerCase();
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${path.win32.sep}`);
}

function assertDirectChild(parent: string, child: string, label: string): void {
  if (path.win32.dirname(path.win32.resolve(child)).toLowerCase() !== path.win32.resolve(parent).toLowerCase()) {
    throw new Error(`${label}-not-direct-child`);
  }
}

export function hashStage8WindowsTaskHostControlPayload(control: Omit<Stage8WindowsTaskHostControl, 'manifestSha256'>): string {
  return hashStage8OfflineIdentity(control);
}

export function hashStage8WindowsTaskHostSourceBundle(identity: {
  releaseCommit: string;
  nodeExecutableSha256: string;
  hostRunnerSourceSha256: string;
  targetSourceSha256: string;
  controlProtocolSourceSha256: string;
  identitySourceSha256: string;
  argumentsSha256: string;
  workingDirectorySha256: string;
  environmentSha256: string;
}): string {
  return hashStage8OfflineIdentity({
    releaseCommit: identity.releaseCommit,
    nodeExecutableSha256: identity.nodeExecutableSha256,
    hostRunnerSourceSha256: identity.hostRunnerSourceSha256,
    targetSourceSha256: identity.targetSourceSha256,
    controlProtocolSourceSha256: identity.controlProtocolSourceSha256,
    identitySourceSha256: identity.identitySourceSha256,
    argumentsSha256: identity.argumentsSha256,
    workingDirectorySha256: identity.workingDirectorySha256,
    environmentSha256: identity.environmentSha256,
  });
}

export function hashStage8WindowsTaskHostControlAuthorization(input: {
  scope: 'stage8-windows-task-host-control';
  approvalId: string;
  granted: true;
  hostRunId: string;
  releaseCommit: string;
}): string {
  return hashStage8OfflineIdentity(input);
}

export function hashStage8WindowsTaskHostPhaseAuthorizationPayload(
  authorization: Omit<Stage8WindowsTaskHostPhaseAuthorization, 'authorizationSha256'>,
): string {
  return hashStage8OfflineIdentity(authorization);
}

export function hashStage8WindowsTaskHostMaterialPayload(material: Omit<Stage8WindowsTaskHostMaterial, 'materialSha256'>): string {
  return hashStage8OfflineIdentity(material);
}

export function validateStage8WindowsTaskHostMaterial(
  value: unknown,
  control: Stage8WindowsTaskHostControl,
  materialsAuthorization?: Stage8WindowsTaskHostPhaseAuthorization,
): Stage8WindowsTaskHostMaterial {
  if (materialsAuthorization) validateStage8WindowsTaskHostPhaseAuthorization(materialsAuthorization, control, 'materials-emit');
  assertExactKeys(value, ['materialVersion', 'hostRunId', 'controlManifestSha256', 'taskPath', 'taskName', 'taskXmlSha256', 'materialsAuthorizationSha256', 'mutationCommandsIncluded', 'scheduledTasksMutated', 'formalPilotGamesCredited', 'materialSha256'], 'stage8-windows-task-host-material');
  const material = value as unknown as Stage8WindowsTaskHostMaterial;
  if (material.materialVersion !== STAGE8_WINDOWS_TASK_HOST_MATERIAL_VERSION || material.hostRunId !== control.hostRunId || material.controlManifestSha256 !== control.manifestSha256 || material.taskPath !== control.task.taskPath || material.taskName !== control.task.taskName || material.mutationCommandsIncluded !== false || material.scheduledTasksMutated !== 0 || material.formalPilotGamesCredited !== 0) throw new Error('stage8-windows-task-host-material-identity');
  assertSha256(material.taskXmlSha256, 'stage8-windows-task-host-material-xml');
  if (materialsAuthorization ? material.materialsAuthorizationSha256 !== materialsAuthorization.authorizationSha256 : material.materialsAuthorizationSha256 !== null) throw new Error('stage8-windows-task-host-material-authorization');
  assertSha256(material.materialSha256, 'stage8-windows-task-host-material');
  const { materialSha256: ignored, ...payload } = material;
  void ignored;
  if (hashStage8WindowsTaskHostMaterialPayload(payload) !== material.materialSha256) throw new Error('stage8-windows-task-host-material-hash');
  return material;
}

export function validateStage8WindowsTaskHostPhaseAuthorization(
  value: unknown,
  control: Stage8WindowsTaskHostControl,
  expectedAction: Stage8WindowsTaskHostPhase,
): Stage8WindowsTaskHostPhaseAuthorization {
  assertExactKeys(value, ['protocolVersion', 'action', 'scope', 'approvalId', 'granted', 'hostRunId', 'controlManifestSha256', 'authorizationSha256'], 'stage8-windows-task-host-authorization');
  const authorization = value as unknown as Stage8WindowsTaskHostPhaseAuthorization;
  if (authorization.protocolVersion !== STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION) throw new Error('stage8-windows-task-host-authorization-version');
  if (authorization.action !== expectedAction || authorization.scope !== PHASE_SCOPES[expectedAction]) throw new Error('stage8-windows-task-host-authorization-scope');
  if (authorization.granted !== true || typeof authorization.approvalId !== 'string' || authorization.approvalId.length < 8) throw new Error('stage8-windows-task-host-authorization-denied');
  if (authorization.hostRunId !== control.hostRunId || authorization.controlManifestSha256 !== control.manifestSha256) throw new Error('stage8-windows-task-host-authorization-identity');
  assertSha256(authorization.authorizationSha256, 'stage8-windows-task-host-authorization');
  const { authorizationSha256: ignored, ...payload } = authorization;
  void ignored;
  if (hashStage8WindowsTaskHostPhaseAuthorizationPayload(payload) !== authorization.authorizationSha256) throw new Error('stage8-windows-task-host-authorization-hash');
  return authorization;
}

export function validateStage8WindowsTaskHostControl(value: unknown, options: { osTempRoot?: string } = {}): Stage8WindowsTaskHostControl {
  assertExactKeys(value, ['protocolVersion', 'hostRunId', 'targetRunId', 'identity', 'authorization', 'task', 'command', 'paths', 'workload', 'capacity', 'cleanup', 'manifestSha256'], 'stage8-windows-task-host-control');
  const control = value as unknown as Stage8WindowsTaskHostControl;
  if (control.protocolVersion !== STAGE8_WINDOWS_TASK_HOST_CONTROL_VERSION) throw new Error('stage8-windows-task-host-control-version');
  if (!/^[a-z0-9][a-z0-9-]{7,95}$/.test(control.hostRunId) || control.targetRunId !== `${control.hostRunId}-diagnostic`) throw new Error('stage8-windows-task-host-run-id');

  assertExactKeys(control.identity, ['releaseCommit', 'sourceBundleSha256', 'nodeExecutableSha256', 'hostRunnerSourceSha256', 'targetSourceSha256', 'controlProtocolSourceSha256', 'identitySourceSha256', 'argumentsSha256', 'workingDirectorySha256', 'environmentSha256'], 'stage8-windows-task-host-identity');
  if (!/^[a-f0-9]{40}$/.test(control.identity.releaseCommit)) throw new Error('stage8-windows-task-host-release-commit');
  for (const [key, digest] of Object.entries(control.identity)) if (key !== 'releaseCommit') assertSha256(digest, `stage8-windows-task-host-${key}`);

  assertExactKeys(control.authorization, ['scope', 'approvalId', 'granted', 'authorizationSha256'], 'stage8-windows-task-host-control-authorization');
  if (control.authorization.scope !== 'stage8-windows-task-host-control' || control.authorization.granted !== true || typeof control.authorization.approvalId !== 'string' || control.authorization.approvalId.length < 8) throw new Error('stage8-windows-task-host-control-authorization-denied');
  assertSha256(control.authorization.authorizationSha256, 'stage8-windows-task-host-control-authorization');
  if (control.authorization.authorizationSha256 !== hashStage8WindowsTaskHostControlAuthorization({
    scope: control.authorization.scope,
    approvalId: control.authorization.approvalId,
    granted: control.authorization.granted,
    hostRunId: control.hostRunId,
    releaseCommit: control.identity.releaseCommit,
  })) throw new Error('stage8-windows-task-host-control-authorization-hash');

  assertExactKeys(control.task, ['provider', 'taskPath', 'taskName', 'trigger', 'principal', 'settings'], 'stage8-windows-task-host-task');
  if (control.task.provider !== 'windows-task-scheduler' || control.task.taskPath !== '\\WannianMahjong\\Stage8\\' || control.task.taskName !== `Stage8-Host-${control.hostRunId}`) throw new Error('stage8-windows-task-host-task-identity');
  assertExactKeys(control.task.trigger, ['type', 'startBoundaryUtc', 'endBoundaryUtc', 'repetition'], 'stage8-windows-task-host-trigger');
  assertIsoUtc(control.task.trigger.startBoundaryUtc, 'stage8-windows-task-host-trigger-start');
  assertIsoUtc(control.task.trigger.endBoundaryUtc, 'stage8-windows-task-host-trigger-end');
  if (control.task.trigger.type !== 'time-once' || control.task.trigger.repetition !== false || Date.parse(control.task.trigger.endBoundaryUtc) <= Date.parse(control.task.trigger.startBoundaryUtc)) throw new Error('stage8-windows-task-host-trigger-policy');
  assertExactKeys(control.task.principal, ['userSid', 'logonType', 'runLevel', 'storePassword', 'interactive'], 'stage8-windows-task-host-principal');
  if (!/^S-\d-\d+(?:-\d+)+$/.test(control.task.principal.userSid) || control.task.principal.logonType !== 'S4U' || control.task.principal.runLevel !== 'Limited' || control.task.principal.storePassword !== false || control.task.principal.interactive !== false) throw new Error('stage8-windows-task-host-principal-policy');
  assertExactKeys(control.task.settings, ['multipleInstances', 'restartCount', 'allowDemandStart', 'startWhenAvailable', 'runOnlyIfNetworkAvailable', 'runOnlyIfIdle', 'wakeToRun', 'executionTimeLimitMs', 'deleteExpiredTaskAfterMs'], 'stage8-windows-task-host-settings');
  if (control.task.settings.multipleInstances !== 'IgnoreNew' || control.task.settings.restartCount !== 0 || control.task.settings.allowDemandStart !== false || control.task.settings.startWhenAvailable !== false || control.task.settings.runOnlyIfNetworkAvailable !== false || control.task.settings.runOnlyIfIdle !== false || control.task.settings.wakeToRun !== false || control.task.settings.executionTimeLimitMs !== STAGE8_WINDOWS_TASK_HOST_EXECUTION_LIMIT_MS || control.task.settings.deleteExpiredTaskAfterMs !== null) throw new Error('stage8-windows-task-host-settings-policy');

  assertExactKeys(control.command, ['executablePath', 'hostRunnerPath', 'targetScriptPath', 'controlProtocolPath', 'identitySourcePath', 'arguments', 'workingDirectory', 'environment', 'shell', 'detached', 'windowsHide'], 'stage8-windows-task-host-command');
  for (const [label, candidate] of [['executable', control.command.executablePath], ['host-runner', control.command.hostRunnerPath], ['target-script', control.command.targetScriptPath], ['control-protocol', control.command.controlProtocolPath], ['identity-source', control.command.identitySourcePath], ['working-directory', control.command.workingDirectory]] as const) assertAbsoluteWindowsPath(candidate, `stage8-windows-task-host-${label}`);
  if (control.command.shell !== false || control.command.detached !== false || control.command.windowsHide !== true) throw new Error('stage8-windows-task-host-command-policy');
  if (!Array.isArray(control.command.arguments) || control.command.arguments.length !== 3 || control.command.arguments[0] !== control.command.targetScriptPath || control.command.arguments[1] !== '--duration-ms' || control.command.arguments[2] !== String(STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS)) throw new Error('stage8-windows-task-host-command-arguments');
  if (!Array.isArray(control.command.environment)) throw new Error('stage8-windows-task-host-environment');
  const environmentNames = control.command.environment.map((entry) => {
    assertExactKeys(entry, ['name', 'value'], 'stage8-windows-task-host-environment-entry');
    if (typeof entry.name !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(entry.name) || typeof entry.value !== 'string') throw new Error('stage8-windows-task-host-environment-entry-value');
    if (/(PASSWORD|TOKEN|SECRET|KEY|CREDENTIAL)/.test(entry.name)) throw new Error('stage8-windows-task-host-environment-secret');
    return entry.name;
  });
  if (new Set(environmentNames).size !== environmentNames.length || [...environmentNames].sort().some((name, index) => name !== environmentNames[index])) throw new Error('stage8-windows-task-host-environment-order');
  if (hashStage8OfflineIdentity(control.command.arguments) !== control.identity.argumentsSha256 || hashStage8OfflineIdentity(control.command.workingDirectory) !== control.identity.workingDirectorySha256 || hashStage8OfflineIdentity(control.command.environment) !== control.identity.environmentSha256) throw new Error('stage8-windows-task-host-command-identity-drift');
  if (hashStage8WindowsTaskHostSourceBundle(control.identity) !== control.identity.sourceBundleSha256) throw new Error('stage8-windows-task-host-source-bundle-hash');

  assertExactKeys(control.paths, ['controlPath', 'runAuthorizationPath', 'evidenceRoot', 'stdoutPath', 'stderrPath'], 'stage8-windows-task-host-paths');
  for (const [label, candidate] of Object.entries(control.paths)) assertAbsoluteWindowsPath(candidate, `stage8-windows-task-host-${label}`);
  assertDirectChild(control.paths.evidenceRoot, control.paths.stdoutPath, 'stage8-windows-task-host-stdout');
  assertDirectChild(control.paths.evidenceRoot, control.paths.stderrPath, 'stage8-windows-task-host-stderr');
  if (options.osTempRoot) {
    assertAbsoluteWindowsPath(options.osTempRoot, 'stage8-windows-task-host-os-temp');
    for (const candidate of Object.values(control.paths)) if (!isInside(options.osTempRoot, candidate)) throw new Error('stage8-windows-task-host-path-outside-os-temp');
  }

  assertExactKeys(control.workload, ['kind', 'durationMs', 'selfTerminate', 'allowFormalPilot', 'allowTraining', 'allowSmoke', 'allowSelfPlay', 'allowReplay', 'allowModelRead'], 'stage8-windows-task-host-workload');
  if (control.workload.kind !== 'disposable-diagnostic' || control.workload.durationMs !== STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS || control.workload.selfTerminate !== true || control.workload.allowFormalPilot !== false || control.workload.allowTraining !== false || control.workload.allowSmoke !== false || control.workload.allowSelfPlay !== false || control.workload.allowReplay !== false || control.workload.allowModelRead !== false) throw new Error('stage8-windows-task-host-workload-policy');
  assertExactKeys(control.capacity, ['maxRunBytes', 'rootHardLimitBytes', 'rootFusePercent', 'maxStdoutBytes', 'maxStderrBytes', 'maxEvidenceBytes'], 'stage8-windows-task-host-capacity');
  if (control.capacity.maxRunBytes !== 5 * 1024 ** 3 || control.capacity.rootHardLimitBytes !== 64 * 1024 ** 3 || control.capacity.rootFusePercent !== 80 || control.capacity.maxStdoutBytes !== 4 * 1024 ** 2 || control.capacity.maxStderrBytes !== 4 * 1024 ** 2 || control.capacity.maxEvidenceBytes !== 16 * 1024 ** 2) throw new Error('stage8-windows-task-host-capacity-policy');
  assertExactKeys(control.cleanup, ['mode', 'automatic', 'requiresAuthorization', 'preserveEvidence'], 'stage8-windows-task-host-cleanup');
  if (control.cleanup.mode !== 'disable-then-delete' || control.cleanup.automatic !== false || control.cleanup.requiresAuthorization !== true || control.cleanup.preserveEvidence !== true) throw new Error('stage8-windows-task-host-cleanup-policy');

  assertSha256(control.manifestSha256, 'stage8-windows-task-host-manifest');
  const { manifestSha256: ignored, ...payload } = control;
  void ignored;
  if (hashStage8WindowsTaskHostControlPayload(payload) !== control.manifestSha256) throw new Error('stage8-windows-task-host-manifest-hash');
  return control;
}

export function hashStage8WindowsTaskHostStatusPayload(status: Omit<Stage8WindowsTaskHostStatus, 'statusSha256'>): string {
  return hashStage8OfflineIdentity(status);
}

export function validateStage8WindowsTaskHostStatusChain(values: readonly unknown[], control: Stage8WindowsTaskHostControl): Stage8WindowsTaskHostStatus[] {
  if (values.length < 2) throw new Error('stage8-windows-task-host-status-chain-too-short');
  let previous: Stage8WindowsTaskHostStatus | null = null;
  let terminalCount = 0;
  const statuses = values.map((value, index) => {
    assertExactKeys(value, ['protocolVersion', 'hostRunId', 'sequence', 'state', 'observedAtUtc', 'previousStatusSha256', 'hostPid', 'childPid', 'elapsedMs', 'stdoutBytes', 'stderrBytes', 'exitCode', 'signal', 'automaticRetries', 'formalPilotGamesCredited', 'statusSha256'], 'stage8-windows-task-host-status');
    const status = value as unknown as Stage8WindowsTaskHostStatus;
    if (status.protocolVersion !== STAGE8_WINDOWS_TASK_HOST_STATUS_VERSION || status.hostRunId !== control.hostRunId || status.sequence !== index + 1) throw new Error('stage8-windows-task-host-status-identity');
    if (status.previousStatusSha256 !== (previous?.statusSha256 ?? null)) throw new Error('stage8-windows-task-host-status-chain');
    assertIsoUtc(status.observedAtUtc, 'stage8-windows-task-host-status-time');
    if (!['starting', 'running', 'completed', 'failed', 'timed-out'].includes(status.state)) throw new Error('stage8-windows-task-host-status-state');
    if (previous && Date.parse(status.observedAtUtc) < Date.parse(previous.observedAtUtc)) throw new Error('stage8-windows-task-host-status-time-order');
    for (const numberValue of [status.hostPid, status.elapsedMs, status.stdoutBytes, status.stderrBytes]) if (!Number.isSafeInteger(numberValue) || numberValue < 0) throw new Error('stage8-windows-task-host-status-number');
    if (status.hostPid <= 0) throw new Error('stage8-windows-task-host-status-host-pid');
    if (status.childPid !== null && (!Number.isSafeInteger(status.childPid) || status.childPid <= 0)) throw new Error('stage8-windows-task-host-status-child-pid');
    if (status.automaticRetries !== 0 || status.formalPilotGamesCredited !== 0) throw new Error('stage8-windows-task-host-status-policy');
    if (status.stdoutBytes > control.capacity.maxStdoutBytes || status.stderrBytes > control.capacity.maxStderrBytes) throw new Error('stage8-windows-task-host-status-log-cap');
    if (status.state === 'starting' && (status.childPid !== null || status.exitCode !== null || status.signal !== null)) throw new Error('stage8-windows-task-host-status-starting-shape');
    if (status.state === 'running' && (status.childPid === null || status.exitCode !== null || status.signal !== null)) throw new Error('stage8-windows-task-host-status-running-shape');
    if (status.state === 'completed' && (status.childPid === null || status.exitCode !== 0 || status.signal !== null)) throw new Error('stage8-windows-task-host-status-completed-shape');
    if (['completed', 'failed', 'timed-out'].includes(status.state)) terminalCount += 1;
    if (terminalCount > 0 && index !== values.length - 1) throw new Error('stage8-windows-task-host-status-after-terminal');
    if (index > 0 && index < values.length - 1 && status.state !== 'running') throw new Error('stage8-windows-task-host-status-transition');
    assertSha256(status.statusSha256, 'stage8-windows-task-host-status');
    const { statusSha256: ignored, ...payload } = status;
    void ignored;
    if (hashStage8WindowsTaskHostStatusPayload(payload) !== status.statusSha256) throw new Error('stage8-windows-task-host-status-hash');
    previous = status;
    return status;
  });
  if (statuses[0]?.state !== 'starting' || terminalCount !== 1 || (statuses.at(-1)?.state === 'completed' && (statuses.length < 3 || statuses.at(-2)?.state !== 'running'))) throw new Error('stage8-windows-task-host-status-terminal-count');
  return statuses;
}

export function hashStage8WindowsTaskHostCleanupEvidencePayload(evidence: Omit<Stage8WindowsTaskHostCleanupEvidence, 'evidenceSha256'>): string {
  return hashStage8OfflineIdentity(evidence);
}

export function hashStage8WindowsTaskHostRegistrationEvidencePayload(evidence: Omit<Stage8WindowsTaskHostRegistrationEvidence, 'evidenceSha256'>): string {
  return hashStage8OfflineIdentity(evidence);
}

export function validateStage8WindowsTaskHostRegistrationEvidence(
  value: unknown,
  control: Stage8WindowsTaskHostControl,
  registerAuthorization: Stage8WindowsTaskHostPhaseAuthorization,
  material: Stage8WindowsTaskHostMaterial,
  materialsAuthorization: Stage8WindowsTaskHostPhaseAuthorization,
): Stage8WindowsTaskHostRegistrationEvidence {
  validateStage8WindowsTaskHostPhaseAuthorization(registerAuthorization, control, 'register');
  validateStage8WindowsTaskHostMaterial(material, control, materialsAuthorization);
  assertExactKeys(value, ['protocolVersion', 'kind', 'hostRunId', 'taskPath', 'taskName', 'controlManifestSha256', 'materialSha256', 'taskXmlSha256', 'exportedTaskXmlSha256', 'registerAuthorizationSha256', 'registeredAtUtc', 'taskState', 'runningInstances', 'lastTaskResult', 'evidenceSha256'], 'stage8-windows-task-host-registration-evidence');
  const evidence = value as unknown as Stage8WindowsTaskHostRegistrationEvidence;
  if (evidence.protocolVersion !== STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION || evidence.kind !== 'registration' || evidence.hostRunId !== control.hostRunId || evidence.taskPath !== control.task.taskPath || evidence.taskName !== control.task.taskName || evidence.controlManifestSha256 !== control.manifestSha256 || evidence.materialSha256 !== material.materialSha256 || evidence.taskXmlSha256 !== material.taskXmlSha256 || evidence.exportedTaskXmlSha256 !== material.taskXmlSha256 || evidence.registerAuthorizationSha256 !== registerAuthorization.authorizationSha256) throw new Error('stage8-windows-task-host-registration-identity');
  assertIsoUtc(evidence.registeredAtUtc, 'stage8-windows-task-host-registration-time');
  if (evidence.taskState !== 'Ready' || evidence.runningInstances !== 0 || evidence.lastTaskResult !== null) throw new Error('stage8-windows-task-host-registration-state');
  assertSha256(evidence.evidenceSha256, 'stage8-windows-task-host-registration-evidence');
  const { evidenceSha256: ignored, ...payload } = evidence;
  void ignored;
  if (hashStage8WindowsTaskHostRegistrationEvidencePayload(payload) !== evidence.evidenceSha256) throw new Error('stage8-windows-task-host-registration-evidence-hash');
  return evidence;
}

export function hashStage8WindowsTaskHostVerificationEvidencePayload(evidence: Omit<Stage8WindowsTaskHostVerificationEvidence, 'evidenceSha256'>): string {
  return hashStage8OfflineIdentity(evidence);
}

export function validateStage8WindowsTaskHostVerificationEvidence(
  value: unknown,
  control: Stage8WindowsTaskHostControl,
  verifyAuthorization: Stage8WindowsTaskHostPhaseAuthorization,
  registrationEvidence: Stage8WindowsTaskHostRegistrationEvidence,
  registerAuthorization: Stage8WindowsTaskHostPhaseAuthorization,
  material: Stage8WindowsTaskHostMaterial,
  materialsAuthorization: Stage8WindowsTaskHostPhaseAuthorization,
  statuses: readonly unknown[],
): Stage8WindowsTaskHostVerificationEvidence {
  validateStage8WindowsTaskHostPhaseAuthorization(verifyAuthorization, control, 'verify');
  validateStage8WindowsTaskHostRegistrationEvidence(registrationEvidence, control, registerAuthorization, material, materialsAuthorization);
  const validatedStatuses = validateStage8WindowsTaskHostStatusChain(statuses, control);
  assertExactKeys(value, ['protocolVersion', 'kind', 'hostRunId', 'verifyAuthorizationSha256', 'registrationEvidenceSha256', 'terminalStatusSha256', 'observedAtUtc', 'survivedHostLeaseMs', 'taskState', 'lastTaskResult', 'runningInstances', 'selfTerminated', 'residualHostProcesses', 'residualChildProcesses', 'formalPathsRead', 'formalPilotGamesCredited', 'evidenceSha256'], 'stage8-windows-task-host-verification-evidence');
  const evidence = value as unknown as Stage8WindowsTaskHostVerificationEvidence;
  const terminal = validatedStatuses.at(-1)!;
  if (terminal.state !== 'completed' || evidence.protocolVersion !== STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION || evidence.kind !== 'verification' || evidence.hostRunId !== control.hostRunId || evidence.verifyAuthorizationSha256 !== verifyAuthorization.authorizationSha256 || evidence.registrationEvidenceSha256 !== registrationEvidence.evidenceSha256 || evidence.terminalStatusSha256 !== terminal.statusSha256) throw new Error('stage8-windows-task-host-verification-identity');
  assertIsoUtc(evidence.observedAtUtc, 'stage8-windows-task-host-verification-time');
  if (!Number.isSafeInteger(evidence.survivedHostLeaseMs) || evidence.survivedHostLeaseMs <= STAGE8_WINDOWS_TASK_HOST_KNOWN_LEASE_MS || evidence.survivedHostLeaseMs > STAGE8_WINDOWS_TASK_HOST_EXECUTION_LIMIT_MS || terminal.elapsedMs < evidence.survivedHostLeaseMs || evidence.taskState !== 'Ready' || evidence.lastTaskResult !== 0 || evidence.runningInstances !== 0 || evidence.selfTerminated !== true || evidence.residualHostProcesses !== 0 || evidence.residualChildProcesses !== 0 || evidence.formalPathsRead !== 0 || evidence.formalPilotGamesCredited !== 0) throw new Error('stage8-windows-task-host-verification-policy');
  assertSha256(evidence.evidenceSha256, 'stage8-windows-task-host-verification-evidence');
  const { evidenceSha256: ignored, ...payload } = evidence;
  void ignored;
  if (hashStage8WindowsTaskHostVerificationEvidencePayload(payload) !== evidence.evidenceSha256) throw new Error('stage8-windows-task-host-verification-evidence-hash');
  return evidence;
}

export function validateStage8WindowsTaskHostCleanupEvidence(value: unknown, control: Stage8WindowsTaskHostControl, deleteAuthorization: Stage8WindowsTaskHostPhaseAuthorization): Stage8WindowsTaskHostCleanupEvidence {
  validateStage8WindowsTaskHostPhaseAuthorization(deleteAuthorization, control, 'delete');
  assertExactKeys(value, ['protocolVersion', 'kind', 'hostRunId', 'taskPath', 'taskName', 'deleteAuthorizationSha256', 'attemptedAtUtc', 'state', 'disabled', 'deleted', 'taskAbsent', 'reason', 'evidenceSha256'], 'stage8-windows-task-host-cleanup-evidence');
  const evidence = value as unknown as Stage8WindowsTaskHostCleanupEvidence;
  if (evidence.protocolVersion !== STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION || evidence.kind !== 'cleanup' || evidence.hostRunId !== control.hostRunId || evidence.taskPath !== control.task.taskPath || evidence.taskName !== control.task.taskName || evidence.deleteAuthorizationSha256 !== deleteAuthorization.authorizationSha256) throw new Error('stage8-windows-task-host-cleanup-identity');
  assertIsoUtc(evidence.attemptedAtUtc, 'stage8-windows-task-host-cleanup-time');
  if (evidence.state === 'completed') {
    if (!evidence.disabled || !evidence.deleted || !evidence.taskAbsent || evidence.reason !== null) throw new Error('stage8-windows-task-host-cleanup-incomplete');
  } else if (evidence.state === 'failed') {
    if (typeof evidence.reason !== 'string' || evidence.reason.length < 3 || (evidence.disabled && evidence.deleted && evidence.taskAbsent)) throw new Error('stage8-windows-task-host-cleanup-failure-evidence');
  } else throw new Error('stage8-windows-task-host-cleanup-state');
  assertSha256(evidence.evidenceSha256, 'stage8-windows-task-host-cleanup-evidence');
  const { evidenceSha256: ignored, ...payload } = evidence;
  void ignored;
  if (hashStage8WindowsTaskHostCleanupEvidencePayload(payload) !== evidence.evidenceSha256) throw new Error('stage8-windows-task-host-cleanup-evidence-hash');
  return evidence;
}
