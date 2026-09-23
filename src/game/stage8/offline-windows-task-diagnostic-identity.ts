import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  canonicalizeStage8OfflineIdentity,
  hashStage8OfflineIdentity,
} from './offline-action-identity';
import {
  STAGE8_WINDOWS_TASK_HOST_CONTROL_VERSION,
  STAGE8_WINDOWS_TASK_HOST_DEMAND_CONTROL_VERSION,
  STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS,
  STAGE8_WINDOWS_TASK_HOST_EXECUTION_LIMIT_MS,
  hashStage8WindowsTaskHostSourceBundle,
} from './offline-windows-task-host-control';

export const STAGE8_WINDOWS_TASK_DEMAND_IDENTITY_VERSION = 'stage8-windows-task-demand-identity-v2';

export function buildStage8WindowsTaskDemandIdentityTemplate(options: {
  releaseCommit: string;
  hostRunId: string;
  projectRoot: string;
  nodeExecutablePath: string;
  osTempRoot: string;
  userSid: string;
  readFile(absolutePath: string): Uint8Array;
}): { protocolVersion: typeof STAGE8_WINDOWS_TASK_DEMAND_IDENTITY_VERSION; controlTemplate: Record<string, unknown>; controlTemplateSha256: string } {
  if (!/^[a-f0-9]{40}$/.test(options.releaseCommit)
    || !/^[a-z0-9][a-z0-9-]{7,95}$/.test(options.hostRunId)
    || !options.hostRunId.includes('-demand-')
    || !/^S-\d-\d+(?:-\d+)+$/.test(options.userSid)) {
    throw new Error('windows-task-demand-identity-input-invalid');
  }
  for (const value of [options.projectRoot, options.nodeExecutablePath, options.osTempRoot]) {
    if (!path.win32.isAbsolute(value)) throw new Error('windows-task-demand-identity-path-invalid');
  }
  const projectRoot = path.win32.resolve(options.projectRoot);
  const runRoot = path.win32.join(options.osTempRoot, 'WannianMahjong', 'Stage8', options.hostRunId);
  const sourcePaths = {
    hostRunner: path.win32.join(projectRoot, STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.hostRunner),
    diagnostic: path.win32.join(projectRoot, STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.diagnostic),
    controlProtocol: path.win32.join(projectRoot, STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.controlProtocol),
    identity: path.win32.join(projectRoot, STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.identity),
  };
  const commandArguments = [sourcePaths.diagnostic, '--duration-ms', String(STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS)] as const;
  const sourceIdentity = {
    releaseCommit: options.releaseCommit,
    nodeExecutableSha256: sha256(options.readFile(options.nodeExecutablePath)),
    hostRunnerSourceSha256: sha256(options.readFile(sourcePaths.hostRunner)),
    targetSourceSha256: sha256(options.readFile(sourcePaths.diagnostic)),
    controlProtocolSourceSha256: sha256(options.readFile(sourcePaths.controlProtocol)),
    identitySourceSha256: sha256(options.readFile(sourcePaths.identity)),
    argumentsSha256: hashStage8OfflineIdentity(commandArguments),
    workingDirectorySha256: hashStage8OfflineIdentity(projectRoot),
    environmentSha256: hashStage8OfflineIdentity([]),
  };
  const controlTemplate = {
    protocolVersion: STAGE8_WINDOWS_TASK_HOST_DEMAND_CONTROL_VERSION,
    hostRunId: options.hostRunId,
    targetRunId: `${options.hostRunId}-diagnostic`,
    identity: { ...sourceIdentity, sourceBundleSha256: hashStage8WindowsTaskHostSourceBundle(sourceIdentity) },
    authorization: { scope: 'stage8-windows-task-host-control', approvalId: null, granted: false, authorizationSha256: null },
    task: {
      provider: 'windows-task-scheduler', taskPath: '\\WannianMahjong\\Stage8\\', taskName: `Stage8-Host-${options.hostRunId}`,
      trigger: { type: 'on-demand-only', automatic: false },
      principal: { userSid: options.userSid, logonType: 'S4U', runLevel: 'Limited', storePassword: false, interactive: false },
      settings: {
        multipleInstances: 'IgnoreNew', restartCount: 0, allowDemandStart: true, startWhenAvailable: false,
        runOnlyIfNetworkAvailable: false, runOnlyIfIdle: false, wakeToRun: false,
        executionTimeLimitMs: STAGE8_WINDOWS_TASK_HOST_EXECUTION_LIMIT_MS, deleteExpiredTaskAfterMs: null,
      },
    },
    command: {
      executablePath: path.win32.resolve(options.nodeExecutablePath),
      hostRunnerPath: sourcePaths.hostRunner,
      targetScriptPath: sourcePaths.diagnostic,
      controlProtocolPath: sourcePaths.controlProtocol,
      identitySourcePath: sourcePaths.identity,
      arguments: commandArguments,
      workingDirectory: projectRoot,
      environment: [],
      shell: false, detached: false, windowsHide: true,
    },
    paths: {
      controlPath: path.win32.join(runRoot, 'control', 'host-control.json'),
      runAuthorizationPath: path.win32.join(runRoot, 'authorizations', 'run.json'),
      evidenceRoot: path.win32.join(runRoot, 'evidence'),
      stdoutPath: path.win32.join(runRoot, 'evidence', 'stdout.log'),
      stderrPath: path.win32.join(runRoot, 'evidence', 'stderr.log'),
    },
    workload: {
      kind: 'disposable-diagnostic', durationMs: STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS, selfTerminate: true,
      allowFormalPilot: false, allowTraining: false, allowSmoke: false, allowSelfPlay: false, allowReplay: false, allowModelRead: false,
    },
    capacity: { maxRunBytes: 5 * 1024 ** 3, rootHardLimitBytes: 64 * 1024 ** 3, rootFusePercent: 80, maxStdoutBytes: 4 * 1024 ** 2, maxStderrBytes: 4 * 1024 ** 2, maxEvidenceBytes: 16 * 1024 ** 2 },
    cleanup: { mode: 'disable-then-delete', automatic: false, requiresAuthorization: true, preserveEvidence: true },
    manifestSha256: null,
  };
  return {
    protocolVersion: STAGE8_WINDOWS_TASK_DEMAND_IDENTITY_VERSION,
    controlTemplate,
    controlTemplateSha256: hashStage8OfflineIdentity(controlTemplate),
  };
}

export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_IDENTITY_VERSION = 'stage8-windows-task-diagnostic-identity-v1';
export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_REQUEST_VERSION = 'stage8-windows-task-diagnostic-request-v1';
export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_SIGNING_REQUEST_VERSION = 'stage8-windows-task-diagnostic-signing-request-v1';
export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT = 'fae72b67b297672960d49361e6252c7e022d9040';
export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID = 'stage8-disposable-diagnostic-20260916';
export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID = `${STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID}-diagnostic`;
export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME = `Stage8-Host-${STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID}`;
export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_START_UTC = '2026-09-17T02:00:00.000Z';
export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_END_UTC = '2026-09-17T02:30:00.000Z';

export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS = Object.freeze({
  hostRunner: 'scripts/stage8-windows-task-host-runner.mjs',
  diagnostic: 'scripts/stage8-windows-task-host-diagnostic.mjs',
  controlProtocol: 'src/game/stage8/offline-windows-task-host-control.ts',
  identity: 'src/game/stage8/offline-action-identity.ts',
});

export type Stage8WindowsTaskDiagnosticPhase = 'materials-emit' | 'register' | 'run' | 'verify' | 'delete';

export const STAGE8_WINDOWS_TASK_DIAGNOSTIC_PHASE_SCOPES: Record<Stage8WindowsTaskDiagnosticPhase, string> = Object.freeze({
  'materials-emit': 'stage8-windows-task-host:materials-emit',
  register: 'stage8-windows-task-host:register',
  run: 'stage8-windows-task-host:run',
  verify: 'stage8-windows-task-host:verify',
  delete: 'stage8-windows-task-host:delete',
});

export interface Stage8WindowsTaskDiagnosticIdentityInput {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_REQUEST_VERSION;
  releaseCommit: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  targetRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID;
  taskName: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME;
  projectRoot: string;
  nodeExecutablePath: string;
  osTempRoot: string;
  sourcePaths: {
    hostRunnerPath: string;
    diagnosticPath: string;
    controlProtocolPath: string;
    identityPath: string;
  };
  command: {
    arguments: readonly [string, '--duration-ms', string];
    workingDirectory: string;
    environment: readonly [];
    shell: false;
    detached: false;
    windowsHide: true;
  };
  task: {
    taskPath: '\\WannianMahjong\\Stage8\\';
    userSid: string;
    startBoundaryUtc: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_START_UTC;
    endBoundaryUtc: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_END_UTC;
    logonType: 'S4U';
    runLevel: 'Limited';
    storePassword: false;
    interactive: false;
    multipleInstances: 'IgnoreNew';
    restartCount: 0;
    allowDemandStart: false;
    startWhenAvailable: false;
  };
  paths: {
    controlPath: string;
    evidenceRoot: string;
    stdoutPath: string;
    stderrPath: string;
    phaseAuthorizationPaths: Record<Stage8WindowsTaskDiagnosticPhase, string>;
  };
  workload: {
    kind: 'disposable-diagnostic';
    durationMs: typeof STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS;
    selfTerminate: true;
    allowFormalPilot: false;
    allowThirdPilot: false;
    allowTraining: false;
    allowSmoke: false;
    allowSelfPlay: false;
    allowReplay: false;
    allowModelRead: false;
  };
  requestSha256: string;
}

export interface Stage8WindowsTaskDiagnosticSigningRequest {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_SIGNING_REQUEST_VERSION;
  requestId: string;
  action: 'control' | Stage8WindowsTaskDiagnosticPhase;
  scope: string;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  releaseCommit: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT;
  controlTemplateSha256: string;
  controlManifestSha256: null;
  approval: null;
}

export interface Stage8WindowsTaskDiagnosticIdentityBundle {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_IDENTITY_VERSION;
  request: Stage8WindowsTaskDiagnosticIdentityInput;
  sourceIdentity: {
    releaseCommit: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT;
    nodeExecutableSha256: string;
    files: Array<{ role: keyof typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS; path: string; sha256: string }>;
    sourceBundleSha256: string;
  };
  controlTemplate: Record<string, unknown>;
  controlAuthorizationRequest: Stage8WindowsTaskDiagnosticSigningRequest;
  phaseAuthorizationRequests: Stage8WindowsTaskDiagnosticSigningRequest[];
  effects: {
    filesWritten: 0;
    scheduledTasksRead: 0;
    scheduledTasksMutated: 0;
    servicesRead: 0;
    servicesMutated: 0;
    targetRootReads: 0;
    formalPathsRead: 0;
    formalPilotGamesCredited: 0;
  };
  identitySha256: string;
}

export type Stage8WindowsTaskDiagnosticIdentityResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function fail<T = never>(reason: string): Stage8WindowsTaskDiagnosticIdentityResult<T> {
  return { ok: false, reason };
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function samePath(left: string, right: string): boolean {
  return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase();
}

function isInside(parent: string, child: string): boolean {
  const normalizedParent = path.win32.resolve(parent).toLowerCase();
  const normalizedChild = path.win32.resolve(child).toLowerCase();
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${path.win32.sep}`);
}

function inputPayload(input: Stage8WindowsTaskDiagnosticIdentityInput): Omit<Stage8WindowsTaskDiagnosticIdentityInput, 'requestSha256'> {
  const { requestSha256: ignored, ...payload } = input;
  void ignored;
  return payload;
}

export function hashStage8WindowsTaskDiagnosticIdentityInput(
  input: Omit<Stage8WindowsTaskDiagnosticIdentityInput, 'requestSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function buildStage8WindowsTaskDiagnosticIdentityInput(options: {
  projectRoot: string;
  nodeExecutablePath: string;
  osTempRoot: string;
  userSid: string;
}): Stage8WindowsTaskDiagnosticIdentityInput {
  const projectRoot = path.win32.resolve(options.projectRoot);
  const nodeExecutablePath = path.win32.resolve(options.nodeExecutablePath);
  const osTempRoot = path.win32.resolve(options.osTempRoot);
  const runRoot = path.win32.join(osTempRoot, 'WannianMahjong', 'Stage8', STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID);
  const sourcePaths = {
    hostRunnerPath: path.win32.join(projectRoot, STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.hostRunner),
    diagnosticPath: path.win32.join(projectRoot, STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.diagnostic),
    controlProtocolPath: path.win32.join(projectRoot, STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.controlProtocol),
    identityPath: path.win32.join(projectRoot, STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS.identity),
  };
  const phaseAuthorizationPaths = Object.fromEntries(
    (Object.keys(STAGE8_WINDOWS_TASK_DIAGNOSTIC_PHASE_SCOPES) as Stage8WindowsTaskDiagnosticPhase[])
      .map((action) => [action, path.win32.join(runRoot, 'authorizations', `${action}.json`)]),
  ) as Record<Stage8WindowsTaskDiagnosticPhase, string>;
  const payload: Omit<Stage8WindowsTaskDiagnosticIdentityInput, 'requestSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_DIAGNOSTIC_REQUEST_VERSION,
    releaseCommit: STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
    hostRunId: STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
    targetRunId: STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID,
    taskName: STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME,
    projectRoot,
    nodeExecutablePath,
    osTempRoot,
    sourcePaths,
    command: {
      arguments: [sourcePaths.diagnosticPath, '--duration-ms', String(STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS)],
      workingDirectory: projectRoot,
      environment: [],
      shell: false,
      detached: false,
      windowsHide: true,
    },
    task: {
      taskPath: '\\WannianMahjong\\Stage8\\',
      userSid: options.userSid,
      startBoundaryUtc: STAGE8_WINDOWS_TASK_DIAGNOSTIC_START_UTC,
      endBoundaryUtc: STAGE8_WINDOWS_TASK_DIAGNOSTIC_END_UTC,
      logonType: 'S4U',
      runLevel: 'Limited',
      storePassword: false,
      interactive: false,
      multipleInstances: 'IgnoreNew',
      restartCount: 0,
      allowDemandStart: false,
      startWhenAvailable: false,
    },
    paths: {
      controlPath: path.win32.join(runRoot, 'control', 'host-control.json'),
      evidenceRoot: path.win32.join(runRoot, 'evidence'),
      stdoutPath: path.win32.join(runRoot, 'evidence', 'stdout.log'),
      stderrPath: path.win32.join(runRoot, 'evidence', 'stderr.log'),
      phaseAuthorizationPaths,
    },
    workload: {
      kind: 'disposable-diagnostic',
      durationMs: STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS,
      selfTerminate: true,
      allowFormalPilot: false,
      allowThirdPilot: false,
      allowTraining: false,
      allowSmoke: false,
      allowSelfPlay: false,
      allowReplay: false,
      allowModelRead: false,
    },
  };
  return { ...payload, requestSha256: hashStage8WindowsTaskDiagnosticIdentityInput(payload) };
}

export function validateStage8WindowsTaskDiagnosticIdentityInput(
  input: unknown,
  expected: { projectRoot: string; nodeExecutablePath: string; osTempRoot: string },
): Stage8WindowsTaskDiagnosticIdentityResult<Stage8WindowsTaskDiagnosticIdentityInput> {
  if (!exactKeys(input, ['protocolVersion','releaseCommit','hostRunId','targetRunId','taskName','projectRoot','nodeExecutablePath','osTempRoot','sourcePaths','command','task','paths','workload','requestSha256'])) return fail('windows-task-diagnostic-input-schema-invalid');
  const candidate = input as Stage8WindowsTaskDiagnosticIdentityInput;
  if (!exactKeys(candidate.sourcePaths, ['hostRunnerPath','diagnosticPath','controlProtocolPath','identityPath'])
    || !exactKeys(candidate.command, ['arguments','workingDirectory','environment','shell','detached','windowsHide'])
    || !exactKeys(candidate.task, ['taskPath','userSid','startBoundaryUtc','endBoundaryUtc','logonType','runLevel','storePassword','interactive','multipleInstances','restartCount','allowDemandStart','startWhenAvailable'])
    || !exactKeys(candidate.paths, ['controlPath','evidenceRoot','stdoutPath','stderrPath','phaseAuthorizationPaths'])
    || !exactKeys(candidate.paths.phaseAuthorizationPaths, ['materials-emit','register','run','verify','delete'])
    || !exactKeys(candidate.workload, ['kind','durationMs','selfTerminate','allowFormalPilot','allowThirdPilot','allowTraining','allowSmoke','allowSelfPlay','allowReplay','allowModelRead'])) {
    return fail('windows-task-diagnostic-input-nested-schema-invalid');
  }
  if (!/^S-\d-\d+(?:-\d+)+$/.test(candidate.task.userSid)) return fail('windows-task-diagnostic-user-sid-invalid');
  const expectedInput = buildStage8WindowsTaskDiagnosticIdentityInput({
    projectRoot: expected.projectRoot,
    nodeExecutablePath: expected.nodeExecutablePath,
    osTempRoot: expected.osTempRoot,
    userSid: candidate.task.userSid,
  });
  if (!samePath(candidate.projectRoot, expected.projectRoot)
    || !samePath(candidate.nodeExecutablePath, expected.nodeExecutablePath)
    || !samePath(candidate.osTempRoot, expected.osTempRoot)) return fail('windows-task-diagnostic-runtime-path-drift');
  if (isInside(candidate.projectRoot, candidate.paths.evidenceRoot)
    || !isInside(candidate.osTempRoot, candidate.paths.evidenceRoot)) return fail('windows-task-diagnostic-evidence-root-forbidden');
  if (candidate.requestSha256 !== hashStage8WindowsTaskDiagnosticIdentityInput(inputPayload(candidate))) return fail('windows-task-diagnostic-request-hash-mismatch');
  if (canonicalizeStage8OfflineIdentity(candidate) !== canonicalizeStage8OfflineIdentity(expectedInput)) return fail('windows-task-diagnostic-input-policy-drift');
  return { ok: true, value: candidate };
}

function signingRequest(action: 'control' | Stage8WindowsTaskDiagnosticPhase, scope: string, controlTemplateSha256: string): Stage8WindowsTaskDiagnosticSigningRequest {
  return {
    protocolVersion: STAGE8_WINDOWS_TASK_DIAGNOSTIC_SIGNING_REQUEST_VERSION,
    requestId: `${STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID}-${action}-signing-request`,
    action,
    scope,
    hostRunId: STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
    releaseCommit: STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
    controlTemplateSha256,
    controlManifestSha256: null,
    approval: null,
  };
}

export function createStage8WindowsTaskDiagnosticIdentityBundle(input: {
  request: Stage8WindowsTaskDiagnosticIdentityInput;
  expected: { projectRoot: string; nodeExecutablePath: string; osTempRoot: string };
  inspectCheckout(projectRoot: string): { headCommit: string; clean: boolean };
  readFile(absolutePath: string): Uint8Array;
}): Stage8WindowsTaskDiagnosticIdentityResult<Stage8WindowsTaskDiagnosticIdentityBundle> {
  const validated = validateStage8WindowsTaskDiagnosticIdentityInput(input.request, input.expected);
  if (!validated.ok) return validated;
  let checkout: { headCommit: string; clean: boolean };
  try { checkout = input.inspectCheckout(validated.value.projectRoot); } catch { return fail('windows-task-diagnostic-checkout-inspection-failed'); }
  if (checkout.headCommit.toLowerCase() !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT || !checkout.clean) return fail('windows-task-diagnostic-checkout-not-clean-release');
  let nodeExecutableSha256: string;
  const sourceEntries: Stage8WindowsTaskDiagnosticIdentityBundle['sourceIdentity']['files'] = [];
  try {
    nodeExecutableSha256 = sha256(input.readFile(validated.value.nodeExecutablePath));
    const sourceByRole = {
      hostRunner: validated.value.sourcePaths.hostRunnerPath,
      diagnostic: validated.value.sourcePaths.diagnosticPath,
      controlProtocol: validated.value.sourcePaths.controlProtocolPath,
      identity: validated.value.sourcePaths.identityPath,
    } as const;
    for (const role of Object.keys(sourceByRole) as Array<keyof typeof sourceByRole>) {
      sourceEntries.push({ role, path: sourceByRole[role], sha256: sha256(input.readFile(sourceByRole[role])) });
    }
  } catch {
    return fail('windows-task-diagnostic-source-read-failed');
  }
  const sourceHashes = Object.fromEntries(sourceEntries.map((entry) => [entry.role, entry.sha256])) as Record<keyof typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_SOURCE_PATHS, string>;
  const identityCore = {
    releaseCommit: STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
    nodeExecutableSha256,
    hostRunnerSourceSha256: sourceHashes.hostRunner,
    targetSourceSha256: sourceHashes.diagnostic,
    controlProtocolSourceSha256: sourceHashes.controlProtocol,
    identitySourceSha256: sourceHashes.identity,
    argumentsSha256: hashStage8OfflineIdentity(validated.value.command.arguments),
    workingDirectorySha256: hashStage8OfflineIdentity(validated.value.command.workingDirectory),
    environmentSha256: hashStage8OfflineIdentity(validated.value.command.environment),
  };
  const sourceBundleSha256 = hashStage8WindowsTaskHostSourceBundle(identityCore);
  const controlTemplate = {
    protocolVersion: STAGE8_WINDOWS_TASK_HOST_CONTROL_VERSION,
    hostRunId: validated.value.hostRunId,
    targetRunId: validated.value.targetRunId,
    identity: { ...identityCore, sourceBundleSha256 },
    authorization: { scope: 'stage8-windows-task-host-control', approvalId: null, granted: false, authorizationSha256: null },
    task: {
      provider: 'windows-task-scheduler',
      taskPath: validated.value.task.taskPath,
      taskName: validated.value.taskName,
      trigger: { type: 'time-once', startBoundaryUtc: validated.value.task.startBoundaryUtc, endBoundaryUtc: validated.value.task.endBoundaryUtc, repetition: false },
      principal: { userSid: validated.value.task.userSid, logonType: validated.value.task.logonType, runLevel: validated.value.task.runLevel, storePassword: false, interactive: false },
      settings: {
        multipleInstances: 'IgnoreNew', restartCount: 0, allowDemandStart: false, startWhenAvailable: false,
        runOnlyIfNetworkAvailable: false, runOnlyIfIdle: false, wakeToRun: false,
        executionTimeLimitMs: STAGE8_WINDOWS_TASK_HOST_EXECUTION_LIMIT_MS, deleteExpiredTaskAfterMs: null,
      },
    },
    command: {
      executablePath: validated.value.nodeExecutablePath,
      hostRunnerPath: validated.value.sourcePaths.hostRunnerPath,
      targetScriptPath: validated.value.sourcePaths.diagnosticPath,
      controlProtocolPath: validated.value.sourcePaths.controlProtocolPath,
      identitySourcePath: validated.value.sourcePaths.identityPath,
      arguments: validated.value.command.arguments,
      workingDirectory: validated.value.command.workingDirectory,
      environment: validated.value.command.environment,
      shell: false, detached: false, windowsHide: true,
    },
    paths: {
      controlPath: validated.value.paths.controlPath,
      runAuthorizationPath: validated.value.paths.phaseAuthorizationPaths.run,
      evidenceRoot: validated.value.paths.evidenceRoot,
      stdoutPath: validated.value.paths.stdoutPath,
      stderrPath: validated.value.paths.stderrPath,
    },
    workload: {
      kind: 'disposable-diagnostic', durationMs: STAGE8_WINDOWS_TASK_HOST_DIAGNOSTIC_DURATION_MS, selfTerminate: true,
      allowFormalPilot: false, allowTraining: false, allowSmoke: false, allowSelfPlay: false, allowReplay: false, allowModelRead: false,
    },
    capacity: { maxRunBytes: 5 * 1024 ** 3, rootHardLimitBytes: 64 * 1024 ** 3, rootFusePercent: 80, maxStdoutBytes: 4 * 1024 ** 2, maxStderrBytes: 4 * 1024 ** 2, maxEvidenceBytes: 16 * 1024 ** 2 },
    cleanup: { mode: 'disable-then-delete', automatic: false, requiresAuthorization: true, preserveEvidence: true },
    manifestSha256: null,
  };
  const controlTemplateSha256 = hashStage8OfflineIdentity(controlTemplate);
  const phaseAuthorizationRequests = (Object.keys(STAGE8_WINDOWS_TASK_DIAGNOSTIC_PHASE_SCOPES) as Stage8WindowsTaskDiagnosticPhase[])
    .map((action) => signingRequest(action, STAGE8_WINDOWS_TASK_DIAGNOSTIC_PHASE_SCOPES[action], controlTemplateSha256));
  const payload: Omit<Stage8WindowsTaskDiagnosticIdentityBundle, 'identitySha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_DIAGNOSTIC_IDENTITY_VERSION,
    request: validated.value,
    sourceIdentity: { releaseCommit: STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT, nodeExecutableSha256, files: sourceEntries, sourceBundleSha256 },
    controlTemplate,
    controlAuthorizationRequest: signingRequest('control', 'stage8-windows-task-host-control', controlTemplateSha256),
    phaseAuthorizationRequests,
    effects: { filesWritten: 0, scheduledTasksRead: 0, scheduledTasksMutated: 0, servicesRead: 0, servicesMutated: 0, targetRootReads: 0, formalPathsRead: 0, formalPilotGamesCredited: 0 },
  };
  return { ok: true, value: { ...payload, identitySha256: hashStage8OfflineIdentity(payload) } };
}

export function validateStage8WindowsTaskDiagnosticIdentityBundle(input: {
  bundle: unknown;
  expected: { projectRoot: string; nodeExecutablePath: string; osTempRoot: string };
  inspectCheckout(projectRoot: string): { headCommit: string; clean: boolean };
  readFile(absolutePath: string): Uint8Array;
}): Stage8WindowsTaskDiagnosticIdentityResult<{ identitySha256: string }> {
  if (!exactKeys(input.bundle, ['protocolVersion','request','sourceIdentity','controlTemplate','controlAuthorizationRequest','phaseAuthorizationRequests','effects','identitySha256'])) return fail('windows-task-diagnostic-bundle-schema-invalid');
  const bundle = input.bundle as Stage8WindowsTaskDiagnosticIdentityBundle;
  if (!exactKeys(bundle.effects, ['filesWritten','scheduledTasksRead','scheduledTasksMutated','servicesRead','servicesMutated','targetRootReads','formalPathsRead','formalPilotGamesCredited'])
    || Object.values(bundle.effects).some((value) => value !== 0)) return fail('windows-task-diagnostic-bundle-effects-invalid');
  const recreated = createStage8WindowsTaskDiagnosticIdentityBundle({ request: bundle.request, expected: input.expected, inspectCheckout: input.inspectCheckout, readFile: input.readFile });
  if (!recreated.ok) return recreated;
  if (canonicalizeStage8OfflineIdentity(bundle) !== canonicalizeStage8OfflineIdentity(recreated.value)) return fail('windows-task-diagnostic-bundle-identity-drift');
  return { ok: true, value: { identitySha256: bundle.identitySha256 } };
}
