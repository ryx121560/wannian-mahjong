import { createHash } from 'node:crypto';
import {
  hashStage8OfflineIdentity,
} from './offline-action-identity';
import {
  STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION,
  hashStage8WindowsTaskHostRegistrationEvidencePayload,
  validateStage8WindowsTaskHostPhaseAuthorization,
  validateStage8WindowsTaskHostRegistrationEvidence,
  type Stage8WindowsTaskHostControl,
  type Stage8WindowsTaskHostMaterial,
  type Stage8WindowsTaskHostPhaseAuthorization,
  type Stage8WindowsTaskHostRegistrationEvidence,
} from './offline-windows-task-host-control';
import {
  validateStage8WindowsTaskRegisterFormalState,
  type Stage8WindowsTaskRegisterDirectoryEntry,
  type Stage8WindowsTaskRegisterFormalState,
} from './offline-windows-task-register-approval';

export const STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_VERSION = 'stage8-windows-task-register-execution-v1';
export const STAGE8_WINDOWS_TASK_REGISTER_AUTHORIZATION_SHA256 = '8200af1cc16cfa280c12bdf446591b3efd72e6fbaf879c3e6fac8964f41672b9';
export const STAGE8_WINDOWS_TASK_REGISTER_AUTHORIZATION_FILE_SHA256 = 'fc26aa3ab8796b6ef77a6566d9f2e81ac07a2995567265a618aa403b1ca66744';
export const STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER = '\\WannianMahjong\\';
export const STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER = '\\WannianMahjong\\Stage8\\';

export interface Stage8WindowsTaskRegisterExecutionFormalState extends Stage8WindowsTaskRegisterFormalState {
  registerAuthorization: Stage8WindowsTaskHostPhaseAuthorization;
}

export interface Stage8WindowsTaskRegisterExecutionFolderInspection {
  path: string;
  exists: boolean;
}

export interface Stage8WindowsTaskRegisterExecutionTaskInspection {
  queriedTaskPath: string;
  queriedTaskName: string;
  exists: boolean;
  taskPath: string | null;
  taskName: string | null;
  state: string | null;
  runningInstances: number | null;
  lastTaskResult: number | null;
}

export interface Stage8WindowsTaskRegisterExecutionSchedulerInspection {
  provider: 'windows-task-scheduler';
  querySucceeded: true;
  folders: readonly Stage8WindowsTaskRegisterExecutionFolderInspection[];
  task: Stage8WindowsTaskRegisterExecutionTaskInspection;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

function fail<T = never>(reason: string): Result<T> { return { ok: false, reason }; }
function sha256(bytes: Uint8Array | string): string { return createHash('sha256').update(bytes).digest('hex'); }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function sameTaskPath(left: string, right: string): boolean {
  const normalize = (value: string) => `\\${value.split('\\').filter(Boolean).join('\\')}\\`.toLowerCase();
  return normalize(left) === normalize(right);
}

function validateDirectoryEntries(
  value: readonly Stage8WindowsTaskRegisterDirectoryEntry[],
  expectedNames: readonly string[],
  label: string,
): void {
  if (!Array.isArray(value)
    || value.some((entry) => !exactKeys(entry, ['name', 'kind']) || entry.kind !== 'file')) {
    throw new Error(`windows-task-register-execution-${label}-entry-invalid`);
  }
  const actual = value.map((entry) => entry.name).sort();
  const expected = [...expectedNames].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error(`windows-task-register-execution-${label}-contents-drift`);
  }
}

export function validateStage8WindowsTaskRegisterExecutionFormalState(input: {
  controlBytes: Uint8Array;
  evidenceBytes: Uint8Array;
  materialsAuthorizationBytes: Uint8Array;
  registerAuthorizationBytes: Uint8Array;
  taskXmlBytes: Uint8Array;
  taskMaterialsBytes: Uint8Array;
  authorizationDirectoryEntries: readonly Stage8WindowsTaskRegisterDirectoryEntry[];
  materialsDirectoryEntries: readonly Stage8WindowsTaskRegisterDirectoryEntry[];
  osTempRoot: string;
  renderTaskXmlBytes(control: Stage8WindowsTaskHostControl): Uint8Array;
}): Result<Stage8WindowsTaskRegisterExecutionFormalState> {
  try {
    validateDirectoryEntries(input.authorizationDirectoryEntries, ['materials-emit.json', 'register.json'], 'authorization-directory');
    validateDirectoryEntries(input.materialsDirectoryEntries, ['task-definition.xml', 'task-materials.json'], 'materials-directory');
  } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }

  const base = validateStage8WindowsTaskRegisterFormalState({
    ...input,
    authorizationDirectoryEntries: [{ name: 'materials-emit.json', kind: 'file' }],
  });
  if (!base.ok) return fail(base.reason.replace('windows-task-register-', 'windows-task-register-execution-'));
  if (sha256(input.registerAuthorizationBytes) !== STAGE8_WINDOWS_TASK_REGISTER_AUTHORIZATION_FILE_SHA256) {
    return fail('windows-task-register-execution-register-authorization-file-hash-drift');
  }

  let registerAuthorization: Stage8WindowsTaskHostPhaseAuthorization;
  try {
    registerAuthorization = validateStage8WindowsTaskHostPhaseAuthorization(
      JSON.parse(Buffer.from(input.registerAuthorizationBytes).toString('utf8')),
      base.value.control,
      'register',
    );
  } catch { return fail('windows-task-register-execution-register-authorization-invalid'); }
  if (registerAuthorization.authorizationSha256 !== STAGE8_WINDOWS_TASK_REGISTER_AUTHORIZATION_SHA256) {
    return fail('windows-task-register-execution-register-authorization-identity-drift');
  }
  return { ok: true, value: { ...base.value, registerAuthorization } };
}

export function validateStage8WindowsTaskRegisterExecutionPreInspection(
  value: unknown,
  formal: Stage8WindowsTaskRegisterExecutionFormalState,
): Result<Stage8WindowsTaskRegisterExecutionSchedulerInspection> {
  const parsed = validateSchedulerInspection(value, formal);
  if (!parsed.ok) return parsed;
  if (parsed.value.task.exists
    || parsed.value.task.taskPath !== null
    || parsed.value.task.taskName !== null
    || parsed.value.task.state !== null
    || parsed.value.task.runningInstances !== null
    || parsed.value.task.lastTaskResult !== null) {
    return fail('windows-task-register-execution-task-already-exists');
  }
  if (parsed.value.folders.some((folder) => folder.exists)) {
    return fail('windows-task-register-execution-folder-already-exists');
  }
  return parsed;
}

export function validateStage8WindowsTaskRegisterExecutionPostInspection(
  value: unknown,
  formal: Stage8WindowsTaskRegisterExecutionFormalState,
): Result<Stage8WindowsTaskRegisterExecutionSchedulerInspection> {
  const parsed = validateSchedulerInspection(value, formal);
  if (!parsed.ok) return parsed;
  const task = parsed.value.task;
  if (!parsed.value.folders.every((folder) => folder.exists)) {
    return fail('windows-task-register-execution-created-folder-missing');
  }
  if (!task.exists || task.taskPath === null || task.taskName === null
    || !sameTaskPath(task.taskPath, formal.targets.taskPath)
    || task.taskName !== formal.targets.taskName) {
    return fail('windows-task-register-execution-registered-task-identity-drift');
  }
  if (task.state !== 'Ready' || task.runningInstances !== 0 || task.lastTaskResult !== null) {
    return fail('windows-task-register-execution-registered-task-state-drift');
  }
  return parsed;
}

function validateSchedulerInspection(
  value: unknown,
  formal: Stage8WindowsTaskRegisterExecutionFormalState,
): Result<Stage8WindowsTaskRegisterExecutionSchedulerInspection> {
  if (!exactKeys(value, ['provider', 'querySucceeded', 'folders', 'task'])) {
    return fail('windows-task-register-execution-scheduler-inspection-schema-invalid');
  }
  const inspection = value as unknown as Stage8WindowsTaskRegisterExecutionSchedulerInspection;
  if (inspection.provider !== 'windows-task-scheduler' || inspection.querySucceeded !== true) {
    return fail('windows-task-register-execution-scheduler-query-failed');
  }
  if (!Array.isArray(inspection.folders)
    || inspection.folders.length !== 2
    || inspection.folders.some((folder) => !exactKeys(folder, ['path', 'exists']) || typeof folder.exists !== 'boolean')) {
    return fail('windows-task-register-execution-folder-inspection-schema-invalid');
  }
  const expectedFolders = [STAGE8_WINDOWS_TASK_REGISTER_PARENT_FOLDER, STAGE8_WINDOWS_TASK_REGISTER_TARGET_FOLDER];
  const actualFolders = inspection.folders.map((folder) => folder.path);
  if (actualFolders.some((folder, index) => !sameTaskPath(folder, expectedFolders[index]))) {
    return fail('windows-task-register-execution-folder-query-identity-drift');
  }
  if (!exactKeys(inspection.task, ['queriedTaskPath','queriedTaskName','exists','taskPath','taskName','state','runningInstances','lastTaskResult'])) {
    return fail('windows-task-register-execution-task-inspection-schema-invalid');
  }
  const task = inspection.task;
  if (!sameTaskPath(task.queriedTaskPath, formal.targets.taskPath) || task.queriedTaskName !== formal.targets.taskName) {
    return fail('windows-task-register-execution-task-query-identity-drift');
  }
  if (typeof task.exists !== 'boolean'
    || (task.taskPath !== null && typeof task.taskPath !== 'string')
    || (task.taskName !== null && typeof task.taskName !== 'string')
    || (task.state !== null && typeof task.state !== 'string')
    || (task.runningInstances !== null && (!Number.isSafeInteger(task.runningInstances) || task.runningInstances < 0))
    || (task.lastTaskResult !== null && !Number.isSafeInteger(task.lastTaskResult))) {
    return fail('windows-task-register-execution-task-inspection-value-invalid');
  }
  return { ok: true, value: inspection };
}

function decodeXml(value: Uint8Array | string): string {
  if (typeof value === 'string') return value.replace(/^\ufeff/u, '');
  const bytes = Buffer.from(value);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3).toString('utf8');
  return bytes.toString('utf8');
}

export function normalizeStage8WindowsTaskRegisterExecutionXml(value: Uint8Array | string): string {
  const text = decodeXml(value).replace(/\r\n?/g, '\n').trim();
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text)) {
    throw new Error('windows-task-register-execution-task-xml-forbidden-token');
  }
  return text
    .replace(/^<\?xml[^>]*\?>\s*/i, '')
    .replace(/>\s+</g, '><')
    .replace(/<([^!?/][^<>]*?)\s+>/g, '<$1>')
    .trim();
}

export function validateStage8WindowsTaskRegisterExecutionXmlIdentity(input: {
  taskXmlBytes: Uint8Array;
  exportedTaskXml: Uint8Array | string;
  control: Stage8WindowsTaskHostControl;
  material: Stage8WindowsTaskHostMaterial;
}): { normalizedXmlSha256: string; taskXmlSha256: string } {
  const formalXml = normalizeStage8WindowsTaskRegisterExecutionXml(input.taskXmlBytes);
  const exportedXml = normalizeStage8WindowsTaskRegisterExecutionXml(input.exportedTaskXml);
  if (formalXml !== exportedXml) throw new Error('windows-task-register-execution-exported-task-xml-drift');
  const required = [
    /<LogonType>S4U<\/LogonType>/,
    /<RunLevel>LeastPrivilege<\/RunLevel>/,
    /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/,
    /<StartWhenAvailable>false<\/StartWhenAvailable>/,
    /<ExecutionTimeLimit>PT15M<\/ExecutionTimeLimit>/,
  ];
  if (required.some((pattern) => !pattern.test(exportedXml))
    || /<RestartOnFailure>/i.test(exportedXml)
    || /<Repetition>/i.test(exportedXml)) {
    throw new Error('windows-task-register-execution-exported-task-policy-drift');
  }
  const taskXmlSha256 = sha256(input.taskXmlBytes);
  if (taskXmlSha256 !== input.material.taskXmlSha256
    || input.control.task.principal.logonType !== 'S4U'
    || input.control.task.principal.runLevel !== 'Limited'
    || input.control.task.settings.multipleInstances !== 'IgnoreNew'
    || input.control.task.settings.restartCount !== 0
    || input.control.task.settings.startWhenAvailable !== false
    || input.control.task.settings.executionTimeLimitMs !== 15 * 60 * 1000) {
    throw new Error('windows-task-register-execution-material-policy-drift');
  }
  return { normalizedXmlSha256: sha256(exportedXml), taskXmlSha256 };
}

export function createStage8WindowsTaskRegisterExecutionEvidence(input: {
  formal: Stage8WindowsTaskRegisterExecutionFormalState;
  registeredAtUtc: string;
}): Stage8WindowsTaskHostRegistrationEvidence {
  const payload = {
    protocolVersion: STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION as typeof STAGE8_WINDOWS_TASK_HOST_EVIDENCE_VERSION,
    kind: 'registration' as const,
    hostRunId: input.formal.control.hostRunId,
    taskPath: input.formal.targets.taskPath,
    taskName: input.formal.targets.taskName,
    controlManifestSha256: input.formal.control.manifestSha256,
    materialSha256: input.formal.material.materialSha256,
    taskXmlSha256: input.formal.material.taskXmlSha256,
    exportedTaskXmlSha256: input.formal.material.taskXmlSha256,
    registerAuthorizationSha256: input.formal.registerAuthorization.authorizationSha256,
    registeredAtUtc: input.registeredAtUtc,
    taskState: 'Ready' as const,
    runningInstances: 0 as const,
    lastTaskResult: null,
  };
  const evidence = {
    ...payload,
    evidenceSha256: hashStage8WindowsTaskHostRegistrationEvidencePayload(payload),
  };
  return validateStage8WindowsTaskHostRegistrationEvidence(
    evidence,
    input.formal.control,
    input.formal.registerAuthorization,
    input.formal.material,
    input.formal.materialsAuthorization,
  );
}

export function hashStage8WindowsTaskRegisterExecutionCheckIdentity(input: {
  controlManifestSha256: string;
  materialSha256: string;
  registerAuthorizationSha256: string;
  taskPath: string;
  taskName: string;
  foldersAbsent: true;
  taskAbsent: true;
}): string {
  return hashStage8OfflineIdentity({
    protocolVersion: STAGE8_WINDOWS_TASK_REGISTER_EXECUTION_VERSION,
    ...input,
  });
}
