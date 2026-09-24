import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  canonicalizeStage8OfflineIdentity,
  hashStage8OfflineIdentity,
} from './offline-action-identity';
import {
  STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
} from './offline-windows-task-control-approval';
import {
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_PHASE_SCOPES,
  buildStage8WindowsTaskDiagnosticIdentityInput,
} from './offline-windows-task-diagnostic-identity';
import {
  STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION,
  hashStage8WindowsTaskHostPhaseAuthorizationPayload,
  validateStage8WindowsTaskHostMaterial,
  validateStage8WindowsTaskHostPhaseAuthorization,
  type Stage8WindowsTaskHostControl,
  type Stage8WindowsTaskHostMaterial,
  type Stage8WindowsTaskHostPhaseAuthorization,
} from './offline-windows-task-host-control';
import {
  STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256,
  STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_FILE_SHA256,
  STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256,
  STAGE8_WINDOWS_TASK_MATERIALS_EMIT_EVIDENCE_FILE_SHA256,
  deriveStage8WindowsTaskMaterialsEmitFormalRoot,
  deriveStage8WindowsTaskMaterialsEmitTargets,
  validateStage8WindowsTaskMaterialsEmitFormalPair,
} from './offline-windows-task-materials-emit-approval';

export const STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_VERSION = 'stage8-windows-task-register-approval-v1';
export const STAGE8_WINDOWS_TASK_REGISTER_DECISION_VERSION = 'stage8-windows-task-register-decision-v1';
export const STAGE8_WINDOWS_TASK_REGISTER_SCOPE = 'stage8-windows-task-host:register';
export const STAGE8_WINDOWS_TASK_REGISTER_ACTION = 'register';
export const STAGE8_WINDOWS_TASK_REGISTER_REQUEST_ID = `${STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID}-register-signing-request`;
export const STAGE8_WINDOWS_TASK_REGISTER_MATERIALS_AUTHORIZATION_SHA256 = 'c9c328380beee30e7cbd2954f95c6573aad4925f1dce7869f0f16673bf32dca2';
export const STAGE8_WINDOWS_TASK_REGISTER_MATERIALS_AUTHORIZATION_FILE_SHA256 = '21261a79224b296f27d43f9cacc8d7c8721781f2f6a748db218f4506f76f849d';
export const STAGE8_WINDOWS_TASK_REGISTER_TASK_XML_SHA256 = 'd39998594b98998a78d8e0b9547f374d898568a54bf1daefcb362e03fba21eb5';
export const STAGE8_WINDOWS_TASK_REGISTER_TASK_MATERIALS_FILE_SHA256 = 'ea19a8711a9866a712e8ec67d977f5b83de2e38f8ee493e3972cf72bea5e7aeb';
export const STAGE8_WINDOWS_TASK_REGISTER_MATERIAL_IDENTITY_SHA256 = 'b712fa4ac5a8779ea5c8aae8ac4f420d54f40c69b1dedb1e10d8f3e53bb0b4c7';
export const STAGE8_WINDOWS_TASK_REGISTER_SIGNER_FILES = Object.freeze([
  'scripts/stage8-windows-task-register-approval.mjs',
  'src/game/stage8/offline-windows-task-register-approval.ts',
].sort());

export interface Stage8WindowsTaskRegisterFormalPaths {
  controlPath: string;
  evidencePath: string;
  authorizationDirectory: string;
  materialsAuthorizationPath: string;
  registerAuthorizationPath: string;
  materialsDirectory: string;
  taskDefinitionPath: string;
  taskMaterialsPath: string;
}

export interface Stage8WindowsTaskRegisterDirectoryEntry {
  name: string;
  kind: 'file' | 'directory' | 'symbolic-link' | 'other';
}

export interface Stage8WindowsTaskRegisterTargets {
  registerAuthorizationPath: string;
  materialsAuthorizationPath: string;
  materialsDirectory: string;
  taskDefinitionPath: string;
  taskMaterialsPath: string;
  taskPath: string;
  taskName: string;
}

export interface Stage8WindowsTaskRegisterFormalBindings {
  diagnosticIdentitySha256: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256;
  controlManifestSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256;
  controlEvidenceSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256;
  controlFileSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_FILE_SHA256;
  evidenceFileSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_EVIDENCE_FILE_SHA256;
  materialsAuthorizationSha256: typeof STAGE8_WINDOWS_TASK_REGISTER_MATERIALS_AUTHORIZATION_SHA256;
  materialsAuthorizationFileSha256: typeof STAGE8_WINDOWS_TASK_REGISTER_MATERIALS_AUTHORIZATION_FILE_SHA256;
  taskXmlSha256: typeof STAGE8_WINDOWS_TASK_REGISTER_TASK_XML_SHA256;
  taskMaterialsFileSha256: typeof STAGE8_WINDOWS_TASK_REGISTER_TASK_MATERIALS_FILE_SHA256;
  materialSha256: typeof STAGE8_WINDOWS_TASK_REGISTER_MATERIAL_IDENTITY_SHA256;
}

export interface Stage8WindowsTaskRegisterSchedulerInspection {
  provider: 'windows-task-scheduler';
  querySucceeded: true;
  queriedTaskPath: string;
  queriedTaskName: string;
  exists: false;
  taskPath: null;
  taskName: null;
}

export interface Stage8WindowsTaskRegisterSignerIdentity {
  projectRoot: string;
  releaseCommit: string;
  files: Array<{ path: string; sha256: string }>;
  sourceBundleSha256: string;
}

export interface Stage8WindowsTaskRegisterFormalState {
  control: Stage8WindowsTaskHostControl;
  materialsAuthorization: Stage8WindowsTaskHostPhaseAuthorization;
  material: Stage8WindowsTaskHostMaterial;
  targets: Stage8WindowsTaskRegisterTargets;
  bindings: Stage8WindowsTaskRegisterFormalBindings;
}

export interface Stage8WindowsTaskRegisterProductDecision {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_REGISTER_DECISION_VERSION;
  scope: typeof STAGE8_WINDOWS_TASK_REGISTER_SCOPE;
  action: typeof STAGE8_WINDOWS_TASK_REGISTER_ACTION;
  requestId: typeof STAGE8_WINDOWS_TASK_REGISTER_REQUEST_ID;
  granted: true;
  checkOnly: true;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  signerReleaseCommit: string;
  signerSourceBundleSha256: string;
  bindings: Stage8WindowsTaskRegisterFormalBindings;
  targets: Stage8WindowsTaskRegisterTargets;
  schedulerInspection: Stage8WindowsTaskRegisterSchedulerInspection;
  phaseApprovals: { 'materials-emit': null; register: null; run: null; verify: null; delete: null };
  decisionSha256: string;
}

export interface Stage8WindowsTaskRegisterApprovalInput {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_VERSION;
  scope: typeof STAGE8_WINDOWS_TASK_REGISTER_SCOPE;
  action: typeof STAGE8_WINDOWS_TASK_REGISTER_ACTION;
  requestId: typeof STAGE8_WINDOWS_TASK_REGISTER_REQUEST_ID;
  approvalId: string;
  granted: true;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  signer: Stage8WindowsTaskRegisterSignerIdentity;
  bindings: Stage8WindowsTaskRegisterFormalBindings;
  targets: Stage8WindowsTaskRegisterTargets;
  schedulerInspection: Stage8WindowsTaskRegisterSchedulerInspection;
  productDecisionSha256: string;
  authorizationInputSha256: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

function fail<T = never>(reason: string): Result<T> { return { ok: false, reason }; }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function samePath(left: string, right: string): boolean { return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase(); }
function isInside(parent: string, child: string): boolean {
  const root = path.win32.resolve(parent).toLowerCase();
  const target = path.win32.resolve(child).toLowerCase();
  return target === root || target.startsWith(`${root}${path.win32.sep}`);
}
function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function deriveStage8WindowsTaskRegisterFormalPaths(osTempRoot: string): Stage8WindowsTaskRegisterFormalPaths {
  const controlRoot = deriveStage8WindowsTaskMaterialsEmitFormalRoot(osTempRoot);
  const runRoot = path.win32.dirname(controlRoot);
  const authorizationDirectory = path.win32.join(runRoot, 'authorizations');
  const materialsDirectory = path.win32.join(runRoot, 'materials');
  return {
    controlPath: path.win32.join(controlRoot, 'host-control.json'),
    evidencePath: path.win32.join(controlRoot, 'control-approval-evidence.json'),
    authorizationDirectory,
    materialsAuthorizationPath: path.win32.join(authorizationDirectory, 'materials-emit.json'),
    registerAuthorizationPath: path.win32.join(authorizationDirectory, 'register.json'),
    materialsDirectory,
    taskDefinitionPath: path.win32.join(materialsDirectory, 'task-definition.xml'),
    taskMaterialsPath: path.win32.join(materialsDirectory, 'task-materials.json'),
  };
}

export function deriveStage8WindowsTaskRegisterTargets(
  control: Stage8WindowsTaskHostControl,
  osTempRoot: string,
): Stage8WindowsTaskRegisterTargets {
  const request = buildStage8WindowsTaskDiagnosticIdentityInput({
    projectRoot: control.command.workingDirectory,
    nodeExecutablePath: control.command.executablePath,
    osTempRoot,
    userSid: control.task.principal.userSid,
  });
  const materialsTargets = deriveStage8WindowsTaskMaterialsEmitTargets(control, osTempRoot);
  const registerAuthorizationPath = request.paths.phaseAuthorizationPaths.register;
  const materialsAuthorizationPath = request.paths.phaseAuthorizationPaths['materials-emit'];
  if (!samePath(request.paths.controlPath, control.paths.controlPath)
    || !samePath(materialsAuthorizationPath, materialsTargets.authorizationPath)) {
    throw new Error('windows-task-register-target-control-drift');
  }
  const targets = {
    registerAuthorizationPath,
    materialsAuthorizationPath,
    materialsDirectory: materialsTargets.materialsOutputDirectory,
    taskDefinitionPath: materialsTargets.taskDefinitionPath,
    taskMaterialsPath: materialsTargets.taskMaterialsPath,
    taskPath: control.task.taskPath,
    taskName: control.task.taskName,
  };
  if (!path.win32.isAbsolute(registerAuthorizationPath)
    || !isInside(osTempRoot, registerAuthorizationPath)
    || isInside(control.command.workingDirectory, registerAuthorizationPath)
    || path.win32.basename(registerAuthorizationPath).toLowerCase() !== 'register.json') {
    throw new Error('windows-task-register-target-path-drift');
  }
  return targets;
}

export function validateStage8WindowsTaskRegisterTargetPolicy(
  targets: Stage8WindowsTaskRegisterTargets,
  signerRoot: string,
  osTempRoot: string,
): void {
  if (!path.win32.isAbsolute(signerRoot)
    || !path.win32.isAbsolute(targets.registerAuthorizationPath)
    || !isInside(osTempRoot, targets.registerAuthorizationPath)
    || isInside(signerRoot, targets.registerAuthorizationPath)
    || path.win32.basename(targets.registerAuthorizationPath).toLowerCase() !== 'register.json') {
    throw new Error('windows-task-register-authorization-target-policy-drift');
  }
}

function validateDirectoryEntries(
  value: readonly Stage8WindowsTaskRegisterDirectoryEntry[],
  expectedNames: readonly string[],
  label: string,
): void {
  if (!Array.isArray(value)
    || value.some((entry) => !exactKeys(entry, ['name', 'kind']) || entry.kind !== 'file')) {
    throw new Error(`windows-task-register-${label}-entry-invalid`);
  }
  const actual = value.map((entry) => entry.name).sort();
  const expected = [...expectedNames].sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error(`windows-task-register-${label}-contents-drift`);
  }
}

export function validateStage8WindowsTaskRegisterCanonicalXml(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xfe || buffer.length % 2 !== 0) {
    throw new Error('windows-task-register-task-xml-encoding-invalid');
  }
  const text = buffer.subarray(2).toString('utf16le');
  const declaration = '<?xml version="1.0" encoding="UTF-16"?>';
  if (!text.startsWith(declaration) || text.includes('\u0000') || text.includes('\ufffd') || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text)) {
    throw new Error('windows-task-register-task-xml-declaration-invalid');
  }
  const body = text.slice(declaration.length);
  const tagPattern = /<\/?([A-Za-z_][A-Za-z0-9_.:-]*)(?:\s[^<>]*?)?\s*\/?>/g;
  const stack: string[] = [];
  let cursor = 0;
  let root: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(body)) !== null) {
    if (/[<>]/.test(body.slice(cursor, match.index))) throw new Error('windows-task-register-task-xml-token-invalid');
    const token = match[0];
    const name = match[1];
    const closing = token.startsWith('</');
    const selfClosing = token.endsWith('/>');
    if (closing) {
      if (stack.pop() !== name) throw new Error('windows-task-register-task-xml-nesting-invalid');
    } else if (!selfClosing) {
      if (stack.length === 0) {
        if (root !== null) throw new Error('windows-task-register-task-xml-root-invalid');
        root = name;
      }
      stack.push(name);
    }
    cursor = tagPattern.lastIndex;
  }
  if (/[<>]/.test(body.slice(cursor)) || stack.length !== 0 || root !== 'Task') {
    throw new Error('windows-task-register-task-xml-structure-invalid');
  }
  return text;
}

export function validateStage8WindowsTaskRegisterFormalState(input: {
  controlBytes: Uint8Array;
  evidenceBytes: Uint8Array;
  materialsAuthorizationBytes: Uint8Array;
  taskXmlBytes: Uint8Array;
  taskMaterialsBytes: Uint8Array;
  authorizationDirectoryEntries: readonly Stage8WindowsTaskRegisterDirectoryEntry[];
  materialsDirectoryEntries: readonly Stage8WindowsTaskRegisterDirectoryEntry[];
  osTempRoot: string;
  renderTaskXmlBytes(control: Stage8WindowsTaskHostControl): Uint8Array;
}): Result<Stage8WindowsTaskRegisterFormalState> {
  try {
    validateDirectoryEntries(input.authorizationDirectoryEntries, ['materials-emit.json'], 'authorization-directory');
    validateDirectoryEntries(input.materialsDirectoryEntries, ['task-definition.xml', 'task-materials.json'], 'materials-directory');
  } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }

  const pair = validateStage8WindowsTaskMaterialsEmitFormalPair({
    controlBytes: input.controlBytes,
    evidenceBytes: input.evidenceBytes,
    osTempRoot: input.osTempRoot,
  });
  if (!pair.ok) return fail(pair.reason.replace('materials-emit', 'register'));

  const formalPaths = deriveStage8WindowsTaskRegisterFormalPaths(input.osTempRoot);
  let targets: Stage8WindowsTaskRegisterTargets;
  try { targets = deriveStage8WindowsTaskRegisterTargets(pair.value.control, input.osTempRoot); }
  catch { return fail('windows-task-register-target-derivation-failed'); }
  if (!samePath(targets.materialsAuthorizationPath, formalPaths.materialsAuthorizationPath)
    || !samePath(targets.registerAuthorizationPath, formalPaths.registerAuthorizationPath)
    || !samePath(targets.materialsDirectory, formalPaths.materialsDirectory)
    || !samePath(targets.taskDefinitionPath, formalPaths.taskDefinitionPath)
    || !samePath(targets.taskMaterialsPath, formalPaths.taskMaterialsPath)) return fail('windows-task-register-formal-path-drift');

  if (sha256(input.materialsAuthorizationBytes) !== STAGE8_WINDOWS_TASK_REGISTER_MATERIALS_AUTHORIZATION_FILE_SHA256) {
    return fail('windows-task-register-materials-authorization-file-hash-drift');
  }
  let materialsAuthorization: Stage8WindowsTaskHostPhaseAuthorization;
  try {
    materialsAuthorization = validateStage8WindowsTaskHostPhaseAuthorization(
      JSON.parse(Buffer.from(input.materialsAuthorizationBytes).toString('utf8')),
      pair.value.control,
      'materials-emit',
    );
  } catch { return fail('windows-task-register-materials-authorization-invalid'); }
  if (materialsAuthorization.authorizationSha256 !== STAGE8_WINDOWS_TASK_REGISTER_MATERIALS_AUTHORIZATION_SHA256) {
    return fail('windows-task-register-materials-authorization-identity-drift');
  }

  if (sha256(input.taskXmlBytes) !== STAGE8_WINDOWS_TASK_REGISTER_TASK_XML_SHA256) {
    return fail('windows-task-register-task-xml-file-hash-drift');
  }
  try { validateStage8WindowsTaskRegisterCanonicalXml(input.taskXmlBytes); }
  catch { return fail('windows-task-register-task-xml-invalid'); }
  let expectedXmlBytes: Uint8Array;
  try { expectedXmlBytes = input.renderTaskXmlBytes(pair.value.control); }
  catch { return fail('windows-task-register-task-xml-render-failed'); }
  if (!Buffer.from(input.taskXmlBytes).equals(Buffer.from(expectedXmlBytes))) return fail('windows-task-register-task-xml-render-drift');

  if (sha256(input.taskMaterialsBytes) !== STAGE8_WINDOWS_TASK_REGISTER_TASK_MATERIALS_FILE_SHA256) {
    return fail('windows-task-register-task-materials-file-hash-drift');
  }
  let material: Stage8WindowsTaskHostMaterial;
  try {
    material = validateStage8WindowsTaskHostMaterial(
      JSON.parse(Buffer.from(input.taskMaterialsBytes).toString('utf8')),
      pair.value.control,
      materialsAuthorization,
    );
  } catch { return fail('windows-task-register-task-material-invalid'); }
  if (material.taskXmlSha256 !== STAGE8_WINDOWS_TASK_REGISTER_TASK_XML_SHA256
    || material.materialSha256 !== STAGE8_WINDOWS_TASK_REGISTER_MATERIAL_IDENTITY_SHA256
    || material.mutationCommandsIncluded !== false
    || material.scheduledTasksMutated !== 0
    || material.formalPilotGamesCredited !== 0
    || material.taskPath !== targets.taskPath
    || material.taskName !== targets.taskName) return fail('windows-task-register-task-material-identity-drift');

  return { ok: true, value: {
    control: pair.value.control,
    materialsAuthorization,
    material,
    targets,
    bindings: {
      diagnosticIdentitySha256: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
      controlManifestSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256,
      controlEvidenceSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256,
      controlFileSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_FILE_SHA256,
      evidenceFileSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_EVIDENCE_FILE_SHA256,
      materialsAuthorizationSha256: STAGE8_WINDOWS_TASK_REGISTER_MATERIALS_AUTHORIZATION_SHA256,
      materialsAuthorizationFileSha256: STAGE8_WINDOWS_TASK_REGISTER_MATERIALS_AUTHORIZATION_FILE_SHA256,
      taskXmlSha256: STAGE8_WINDOWS_TASK_REGISTER_TASK_XML_SHA256,
      taskMaterialsFileSha256: STAGE8_WINDOWS_TASK_REGISTER_TASK_MATERIALS_FILE_SHA256,
      materialSha256: STAGE8_WINDOWS_TASK_REGISTER_MATERIAL_IDENTITY_SHA256,
    },
  } };
}

export function validateStage8WindowsTaskRegisterSchedulerInspection(
  value: unknown,
  targets: Stage8WindowsTaskRegisterTargets,
): Result<Stage8WindowsTaskRegisterSchedulerInspection> {
  if (!exactKeys(value, ['provider','querySucceeded','queriedTaskPath','queriedTaskName','exists','taskPath','taskName'])) {
    return fail('windows-task-register-scheduler-inspection-schema-invalid');
  }
  const inspection = value as Stage8WindowsTaskRegisterSchedulerInspection;
  if (inspection.provider !== 'windows-task-scheduler' || inspection.querySucceeded !== true) {
    return fail('windows-task-register-scheduler-query-failed');
  }
  if (inspection.queriedTaskPath !== targets.taskPath || inspection.queriedTaskName !== targets.taskName) {
    return fail('windows-task-register-scheduler-query-identity-drift');
  }
  if (inspection.exists !== false || inspection.taskPath !== null || inspection.taskName !== null) {
    return fail('windows-task-register-task-already-exists');
  }
  return { ok: true, value: inspection };
}

export function hashStage8WindowsTaskRegisterSignerIdentity(input: {
  releaseCommit: string;
  files: Array<{ path: string; sha256: string }>;
}): string {
  return hashStage8OfflineIdentity({ protocolVersion: STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_VERSION, ...input });
}

export function collectStage8WindowsTaskRegisterSignerIdentity(input: {
  projectRoot: string;
  inspectCheckout(projectRoot: string): { headCommit: string; clean: boolean; sourceReleaseCommit?: string };
  readFile(absolutePath: string): Uint8Array;
}): Result<Stage8WindowsTaskRegisterSignerIdentity> {
  if (!path.win32.isAbsolute(input.projectRoot)) return fail('windows-task-register-signer-root-invalid');
  let checkout: { headCommit: string; clean: boolean; sourceReleaseCommit?: string };
  try { checkout = input.inspectCheckout(input.projectRoot); }
  catch { return fail('windows-task-register-signer-inspection-failed'); }
  const releaseCommit = checkout.sourceReleaseCommit ?? checkout.headCommit;
  if (!checkout.clean || !/^[a-f0-9]{40}$/.test(checkout.headCommit) || !/^[a-f0-9]{40}$/.test(releaseCommit)) {
    return fail('windows-task-register-signer-release-drift');
  }
  const files: Array<{ path: string; sha256: string }> = [];
  try {
    for (const relativePath of STAGE8_WINDOWS_TASK_REGISTER_SIGNER_FILES) {
      files.push({ path: relativePath, sha256: sha256(input.readFile(path.win32.join(input.projectRoot, relativePath))) });
    }
  } catch { return fail('windows-task-register-signer-source-read-failed'); }
  return { ok: true, value: {
    projectRoot: path.win32.resolve(input.projectRoot),
    releaseCommit,
    files,
    sourceBundleSha256: hashStage8WindowsTaskRegisterSignerIdentity({ releaseCommit, files }),
  } };
}

function decisionPayload(value: Stage8WindowsTaskRegisterProductDecision): Omit<Stage8WindowsTaskRegisterProductDecision, 'decisionSha256'> {
  const { decisionSha256: ignored, ...payload } = value; void ignored; return payload;
}
function approvalPayload(value: Stage8WindowsTaskRegisterApprovalInput): Omit<Stage8WindowsTaskRegisterApprovalInput, 'authorizationInputSha256'> {
  const { authorizationInputSha256: ignored, ...payload } = value; void ignored; return payload;
}

export function hashStage8WindowsTaskRegisterProductDecision(
  value: Omit<Stage8WindowsTaskRegisterProductDecision, 'decisionSha256'>,
): string { return hashStage8OfflineIdentity(value); }
export function hashStage8WindowsTaskRegisterApprovalInput(
  value: Omit<Stage8WindowsTaskRegisterApprovalInput, 'authorizationInputSha256'>,
): string { return hashStage8OfflineIdentity(value); }
export function hashStage8WindowsTaskRegisterTargets(value: Stage8WindowsTaskRegisterTargets): string {
  return hashStage8OfflineIdentity(value);
}

export function createStage8WindowsTaskRegisterProductDecision(input: {
  signer: Stage8WindowsTaskRegisterSignerIdentity;
  formal: Stage8WindowsTaskRegisterFormalState;
  schedulerInspection: Stage8WindowsTaskRegisterSchedulerInspection;
}): Stage8WindowsTaskRegisterProductDecision {
  const payload: Omit<Stage8WindowsTaskRegisterProductDecision, 'decisionSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_REGISTER_DECISION_VERSION,
    scope: STAGE8_WINDOWS_TASK_REGISTER_SCOPE,
    action: STAGE8_WINDOWS_TASK_REGISTER_ACTION,
    requestId: STAGE8_WINDOWS_TASK_REGISTER_REQUEST_ID,
    granted: true,
    checkOnly: true,
    hostRunId: STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
    signerReleaseCommit: input.signer.releaseCommit,
    signerSourceBundleSha256: input.signer.sourceBundleSha256,
    bindings: input.formal.bindings,
    targets: input.formal.targets,
    schedulerInspection: input.schedulerInspection,
    phaseApprovals: { 'materials-emit': null, register: null, run: null, verify: null, delete: null },
  };
  return { ...payload, decisionSha256: hashStage8WindowsTaskRegisterProductDecision(payload) };
}

export function validateStage8WindowsTaskRegisterProductDecision(value: unknown, input: {
  signer: Stage8WindowsTaskRegisterSignerIdentity;
  formal: Stage8WindowsTaskRegisterFormalState;
  schedulerInspection: Stage8WindowsTaskRegisterSchedulerInspection;
}): Result<Stage8WindowsTaskRegisterProductDecision> {
  const expected = createStage8WindowsTaskRegisterProductDecision(input);
  if (!exactKeys(value, Object.keys(expected))
    || !exactKeys((value as Stage8WindowsTaskRegisterProductDecision)?.bindings, Object.keys(expected.bindings))
    || !exactKeys((value as Stage8WindowsTaskRegisterProductDecision)?.targets, Object.keys(expected.targets))
    || !exactKeys((value as Stage8WindowsTaskRegisterProductDecision)?.schedulerInspection, Object.keys(expected.schedulerInspection))
    || !exactKeys((value as Stage8WindowsTaskRegisterProductDecision)?.phaseApprovals, ['materials-emit','register','run','verify','delete'])) {
    return fail('windows-task-register-decision-schema-invalid');
  }
  if (canonicalizeStage8OfflineIdentity(value) !== canonicalizeStage8OfflineIdentity(expected)) {
    return fail('windows-task-register-decision-policy-drift');
  }
  return { ok: true, value: value as Stage8WindowsTaskRegisterProductDecision };
}

export function createStage8WindowsTaskRegisterApprovalInput(input: {
  decision: unknown;
  signer: Stage8WindowsTaskRegisterSignerIdentity;
  formal: Stage8WindowsTaskRegisterFormalState;
  schedulerInspection: Stage8WindowsTaskRegisterSchedulerInspection;
}): Result<Stage8WindowsTaskRegisterApprovalInput> {
  const decision = validateStage8WindowsTaskRegisterProductDecision(input.decision, input);
  if (!decision.ok) return fail(decision.reason);
  const approvalId = `stage8-windows-task-register-${hashStage8OfflineIdentity({
    requestId: decision.value.requestId,
    signerReleaseCommit: input.signer.releaseCommit,
    signerSourceBundleSha256: input.signer.sourceBundleSha256,
    bindings: input.formal.bindings,
    targets: input.formal.targets,
    schedulerInspection: input.schedulerInspection,
    productDecisionSha256: decision.value.decisionSha256,
  }).slice(0, 40)}`;
  const payload: Omit<Stage8WindowsTaskRegisterApprovalInput, 'authorizationInputSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_REGISTER_APPROVAL_VERSION,
    scope: STAGE8_WINDOWS_TASK_REGISTER_SCOPE,
    action: STAGE8_WINDOWS_TASK_REGISTER_ACTION,
    requestId: STAGE8_WINDOWS_TASK_REGISTER_REQUEST_ID,
    approvalId,
    granted: true,
    hostRunId: STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
    signer: input.signer,
    bindings: input.formal.bindings,
    targets: input.formal.targets,
    schedulerInspection: input.schedulerInspection,
    productDecisionSha256: decision.value.decisionSha256,
  };
  return { ok: true, value: { ...payload, authorizationInputSha256: hashStage8WindowsTaskRegisterApprovalInput(payload) } };
}

export function validateStage8WindowsTaskRegisterApprovalInput(value: unknown, input: {
  decision: unknown;
  signer: Stage8WindowsTaskRegisterSignerIdentity;
  formal: Stage8WindowsTaskRegisterFormalState;
  schedulerInspection: Stage8WindowsTaskRegisterSchedulerInspection;
}): Result<Stage8WindowsTaskRegisterApprovalInput> {
  const recreated = createStage8WindowsTaskRegisterApprovalInput(input);
  if (!recreated.ok) return recreated;
  if (!exactKeys(value, Object.keys(recreated.value))
    || !exactKeys((value as Stage8WindowsTaskRegisterApprovalInput)?.signer, ['projectRoot','releaseCommit','files','sourceBundleSha256'])
    || !Array.isArray((value as Stage8WindowsTaskRegisterApprovalInput)?.signer?.files)
    || (value as Stage8WindowsTaskRegisterApprovalInput).signer.files.some((entry) => !exactKeys(entry, ['path','sha256']))
    || !exactKeys((value as Stage8WindowsTaskRegisterApprovalInput)?.bindings, Object.keys(recreated.value.bindings))
    || !exactKeys((value as Stage8WindowsTaskRegisterApprovalInput)?.targets, Object.keys(recreated.value.targets))
    || !exactKeys((value as Stage8WindowsTaskRegisterApprovalInput)?.schedulerInspection, Object.keys(recreated.value.schedulerInspection))) {
    return fail('windows-task-register-input-schema-invalid');
  }
  if (canonicalizeStage8OfflineIdentity(value) !== canonicalizeStage8OfflineIdentity(recreated.value)) {
    return fail('windows-task-register-input-drift');
  }
  return { ok: true, value: value as Stage8WindowsTaskRegisterApprovalInput };
}

export function checkStage8WindowsTaskRegisterApproval(input: {
  authorization: unknown;
  decision: unknown;
  signer: Stage8WindowsTaskRegisterSignerIdentity;
  formal: Stage8WindowsTaskRegisterFormalState;
  schedulerInspection: Stage8WindowsTaskRegisterSchedulerInspection;
}): Result<{ approvalId: string; authorizationInputSha256: string; authorizationSha256: string; checkIdentitySha256: string }> {
  const validated = validateStage8WindowsTaskRegisterApprovalInput(input.authorization, input);
  if (!validated.ok) return fail(validated.reason);
  if (validated.value.bindings.controlManifestSha256 !== input.formal.control.manifestSha256
    || validated.value.bindings.materialsAuthorizationSha256 !== input.formal.materialsAuthorization.authorizationSha256
    || validated.value.bindings.materialSha256 !== input.formal.material.materialSha256) {
    return fail('windows-task-register-formal-binding-drift');
  }
  const payload: Omit<Stage8WindowsTaskHostPhaseAuthorization, 'authorizationSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION,
    action: STAGE8_WINDOWS_TASK_REGISTER_ACTION,
    scope: STAGE8_WINDOWS_TASK_DIAGNOSTIC_PHASE_SCOPES.register,
    approvalId: validated.value.approvalId,
    granted: true,
    hostRunId: validated.value.hostRunId,
    controlManifestSha256: validated.value.bindings.controlManifestSha256,
  };
  const candidate = { ...payload, authorizationSha256: hashStage8WindowsTaskHostPhaseAuthorizationPayload(payload) };
  try { validateStage8WindowsTaskHostPhaseAuthorization(candidate, input.formal.control, 'register'); }
  catch { return fail('windows-task-register-phase-authorization-invalid'); }
  return { ok: true, value: {
    approvalId: validated.value.approvalId,
    authorizationInputSha256: validated.value.authorizationInputSha256,
    authorizationSha256: candidate.authorizationSha256,
    checkIdentitySha256: hashStage8OfflineIdentity({
      productDecisionSha256: validated.value.productDecisionSha256,
      authorizationInputSha256: validated.value.authorizationInputSha256,
      authorizationSha256: candidate.authorizationSha256,
      signerSourceBundleSha256: validated.value.signer.sourceBundleSha256,
      bindings: validated.value.bindings,
      targets: validated.value.targets,
      schedulerInspection: validated.value.schedulerInspection,
    }),
  } };
}

export function rebuildStage8WindowsTaskRegisterDecisionHash(value: Stage8WindowsTaskRegisterProductDecision): string {
  return hashStage8WindowsTaskRegisterProductDecision(decisionPayload(value));
}

export function rebuildStage8WindowsTaskRegisterApprovalHash(value: Stage8WindowsTaskRegisterApprovalInput): string {
  return hashStage8WindowsTaskRegisterApprovalInput(approvalPayload(value));
}
