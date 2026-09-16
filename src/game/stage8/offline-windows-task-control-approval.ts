import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  canonicalizeStage8OfflineIdentity,
  hashStage8OfflineIdentity,
} from './offline-action-identity';
import {
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME,
  validateStage8WindowsTaskDiagnosticIdentityBundle,
  type Stage8WindowsTaskDiagnosticIdentityBundle,
} from './offline-windows-task-diagnostic-identity';
import {
  hashStage8WindowsTaskHostControlAuthorization,
  hashStage8WindowsTaskHostControlPayload,
  validateStage8WindowsTaskHostControl,
  type Stage8WindowsTaskHostControl,
} from './offline-windows-task-host-control';

export const STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_VERSION = 'stage8-windows-task-control-approval-v1';
export const STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_EVIDENCE_VERSION = 'stage8-windows-task-control-approval-evidence-v1';
export const STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE = 'stage8-windows-task-host-control';
export const STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256 = 'd4166d519f323f289faec84ff53b87a24aa5798af5e16fd16bc3a765997075fd';
export const STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SIGNER_FILES = Object.freeze([
  'scripts/stage8-windows-task-control-approval.mjs',
  'src/game/stage8/offline-windows-task-control-approval.ts',
].sort());

export interface Stage8WindowsTaskControlApprovalInput {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_VERSION;
  scope: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE;
  approvalId: string;
  granted: true;
  identitySha256: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256;
  controlTemplateSha256: string;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  targetRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID;
  taskName: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME;
  runtimeReleaseCommit: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT;
  signer: {
    projectRoot: string;
    releaseCommit: string;
    files: Array<{ path: string; sha256: string }>;
    sourceBundleSha256: string;
  };
  outputRoot: string;
  authorizationInputSha256: string;
}

export interface Stage8WindowsTaskControlApprovalEvidence {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_EVIDENCE_VERSION;
  scope: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE;
  approvalId: string;
  identitySha256: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256;
  controlTemplateSha256: string;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  targetRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID;
  taskName: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME;
  runtimeReleaseCommit: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT;
  signerReleaseCommit: string;
  signerSourceBundleSha256: string;
  authorizationInputSha256: string;
  controlManifestSha256: string;
  phaseAuthorizationsIssued: 0;
  scheduledTasksMutated: 0;
  servicesMutated: 0;
  formalPathsRead: 0;
  formalPilotGamesCredited: 0;
  control: Stage8WindowsTaskHostControl;
  evidenceSha256: string;
}

export type Stage8WindowsTaskControlApprovalResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function fail<T = never>(reason: string): Stage8WindowsTaskControlApprovalResult<T> {
  return { ok: false, reason };
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
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

function authorizationInputPayload(input: Stage8WindowsTaskControlApprovalInput): Omit<Stage8WindowsTaskControlApprovalInput, 'authorizationInputSha256'> {
  const { authorizationInputSha256: ignored, ...payload } = input;
  void ignored;
  return payload;
}

export function hashStage8WindowsTaskControlApprovalInput(
  input: Omit<Stage8WindowsTaskControlApprovalInput, 'authorizationInputSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function hashStage8WindowsTaskControlApprovalEvidence(
  input: Omit<Stage8WindowsTaskControlApprovalEvidence, 'evidenceSha256'>,
): string {
  return hashStage8OfflineIdentity(input);
}

export function hashStage8WindowsTaskControlApprovalSignerIdentity(input: {
  releaseCommit: string;
  files: Array<{ path: string; sha256: string }>;
}): string {
  return hashStage8OfflineIdentity({
    protocolVersion: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_VERSION,
    releaseCommit: input.releaseCommit,
    files: input.files,
  });
}

export function deriveStage8WindowsTaskControlApprovalId(input: {
  identitySha256: string;
  controlTemplateSha256: string;
  hostRunId: string;
  targetRunId: string;
  taskName: string;
  runtimeReleaseCommit: string;
  signerReleaseCommit: string;
  signerSourceBundleSha256: string;
}): string {
  const digest = hashStage8OfflineIdentity(input);
  return `stage8-windows-task-control-${digest.slice(0, 40)}`;
}

export function collectStage8WindowsTaskControlApprovalSignerIdentity(input: {
  projectRoot: string;
  releaseCommit: string;
  inspectCheckout(projectRoot: string): { headCommit: string; clean: boolean };
  readFile(absolutePath: string): Uint8Array;
}): Stage8WindowsTaskControlApprovalResult<Stage8WindowsTaskControlApprovalInput['signer']> {
  if (!path.win32.isAbsolute(input.projectRoot) || !/^[a-f0-9]{40}$/.test(input.releaseCommit)) return fail('windows-task-control-approval-signer-input-invalid');
  let checkout: { headCommit: string; clean: boolean };
  try { checkout = input.inspectCheckout(input.projectRoot); } catch { return fail('windows-task-control-approval-signer-inspection-failed'); }
  if (!checkout.clean || checkout.headCommit.toLowerCase() !== input.releaseCommit) return fail('windows-task-control-approval-signer-release-drift');
  const files: Array<{ path: string; sha256: string }> = [];
  try {
    for (const relativePath of STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SIGNER_FILES) {
      files.push({ path: relativePath, sha256: sha256(input.readFile(path.win32.join(input.projectRoot, relativePath))) });
    }
  } catch {
    return fail('windows-task-control-approval-signer-source-read-failed');
  }
  return {
    ok: true,
    value: {
      projectRoot: path.win32.resolve(input.projectRoot),
      releaseCommit: input.releaseCommit,
      files,
      sourceBundleSha256: hashStage8WindowsTaskControlApprovalSignerIdentity({ releaseCommit: input.releaseCommit, files }),
    },
  };
}

export function validateStage8WindowsTaskControlApprovalInput(input: {
  authorization: unknown;
  identityBundle: unknown;
  expectedOsTempRoot: string;
  inspectSignerCheckout(projectRoot: string): { headCommit: string; clean: boolean };
  readSignerFile(absolutePath: string): Uint8Array;
  validateIdentityBundle(bundle: unknown): Stage8WindowsTaskControlApprovalResult<{ identitySha256: string }>;
}): Stage8WindowsTaskControlApprovalResult<Stage8WindowsTaskControlApprovalInput> {
  if (!exactKeys(input.authorization, ['protocolVersion','scope','approvalId','granted','identitySha256','controlTemplateSha256','hostRunId','targetRunId','taskName','runtimeReleaseCommit','signer','outputRoot','authorizationInputSha256'])) return fail('windows-task-control-approval-schema-invalid');
  const authorization = input.authorization as Stage8WindowsTaskControlApprovalInput;
  if (!exactKeys(authorization.signer, ['projectRoot','releaseCommit','files','sourceBundleSha256'])
    || !Array.isArray(authorization.signer.files)
    || authorization.signer.files.some((entry) => !exactKeys(entry, ['path','sha256']))) return fail('windows-task-control-approval-signer-schema-invalid');
  if (authorization.protocolVersion !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_VERSION
    || authorization.scope !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE
    || authorization.granted !== true
    || authorization.identitySha256 !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256
    || authorization.hostRunId !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID
    || authorization.targetRunId !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID
    || authorization.taskName !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME
    || authorization.runtimeReleaseCommit !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT
    || !sha(authorization.controlTemplateSha256)
    || !sha(authorization.signer.sourceBundleSha256)
    || !sha(authorization.authorizationInputSha256)) return fail('windows-task-control-approval-identity-invalid');
  const bundle = input.identityBundle as Stage8WindowsTaskDiagnosticIdentityBundle;
  if (!bundle || bundle.identitySha256 !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256
    || bundle.request?.hostRunId !== authorization.hostRunId
    || bundle.request?.targetRunId !== authorization.targetRunId
    || bundle.request?.taskName !== authorization.taskName
    || bundle.request?.releaseCommit !== authorization.runtimeReleaseCommit
    || hashStage8OfflineIdentity(bundle.controlTemplate) !== authorization.controlTemplateSha256) return fail('windows-task-control-approval-diagnostic-identity-mismatch');
  const identityValidation = input.validateIdentityBundle(input.identityBundle);
  if (!identityValidation.ok || identityValidation.value.identitySha256 !== authorization.identitySha256) return fail('windows-task-control-approval-diagnostic-validation-failed');
  const signer = collectStage8WindowsTaskControlApprovalSignerIdentity({
    projectRoot: authorization.signer.projectRoot,
    releaseCommit: authorization.signer.releaseCommit,
    inspectCheckout: input.inspectSignerCheckout,
    readFile: input.readSignerFile,
  });
  if (signer.ok === false) return fail(signer.reason);
  if (canonicalizeStage8OfflineIdentity(signer.value) !== canonicalizeStage8OfflineIdentity(authorization.signer)) return fail('windows-task-control-approval-signer-identity-mismatch');
  const expectedApprovalId = deriveStage8WindowsTaskControlApprovalId({
    identitySha256: authorization.identitySha256,
    controlTemplateSha256: authorization.controlTemplateSha256,
    hostRunId: authorization.hostRunId,
    targetRunId: authorization.targetRunId,
    taskName: authorization.taskName,
    runtimeReleaseCommit: authorization.runtimeReleaseCommit,
    signerReleaseCommit: authorization.signer.releaseCommit,
    signerSourceBundleSha256: authorization.signer.sourceBundleSha256,
  });
  if (authorization.approvalId !== expectedApprovalId) return fail('windows-task-control-approval-id-mismatch');
  if (authorization.authorizationInputSha256 !== hashStage8WindowsTaskControlApprovalInput(authorizationInputPayload(authorization))) return fail('windows-task-control-approval-input-hash-mismatch');
  const expectedRoot = path.win32.join(path.win32.resolve(input.expectedOsTempRoot), 'WannianMahjong', 'Stage8', authorization.hostRunId, 'control-approval');
  if (!path.win32.isAbsolute(authorization.outputRoot) || !samePath(authorization.outputRoot, expectedRoot)
    || isInside(authorization.signer.projectRoot, authorization.outputRoot)
    || !isInside(input.expectedOsTempRoot, authorization.outputRoot)) return fail('windows-task-control-approval-output-root-forbidden');
  return { ok: true, value: authorization };
}

export function createStage8WindowsTaskControlApprovalEvidence(input: {
  authorization: unknown;
  identityBundle: unknown;
  expectedOsTempRoot: string;
  inspectSignerCheckout(projectRoot: string): { headCommit: string; clean: boolean };
  readSignerFile(absolutePath: string): Uint8Array;
  validateIdentityBundle(bundle: unknown): Stage8WindowsTaskControlApprovalResult<{ identitySha256: string }>;
}): Stage8WindowsTaskControlApprovalResult<Stage8WindowsTaskControlApprovalEvidence> {
  const validated = validateStage8WindowsTaskControlApprovalInput(input);
  if (validated.ok === false) return fail(validated.reason);
  const authorization = validated.value;
  const bundle = input.identityBundle as Stage8WindowsTaskDiagnosticIdentityBundle;
  const unsignedControl = structuredClone(bundle.controlTemplate) as Record<string, unknown>;
  const authorizationPayload = {
    scope: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE as typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE,
    approvalId: authorization.approvalId,
    granted: true as const,
    hostRunId: authorization.hostRunId,
    releaseCommit: authorization.runtimeReleaseCommit,
  };
  const controlAuthorization = {
    scope: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE,
    approvalId: authorization.approvalId,
    granted: true as const,
    authorizationSha256: hashStage8WindowsTaskHostControlAuthorization(authorizationPayload),
  };
  const controlPayload = { ...unsignedControl, authorization: controlAuthorization } as Omit<Stage8WindowsTaskHostControl, 'manifestSha256'>;
  delete (controlPayload as Record<string, unknown>).manifestSha256;
  const control: Stage8WindowsTaskHostControl = { ...controlPayload, manifestSha256: hashStage8WindowsTaskHostControlPayload(controlPayload) };
  try { validateStage8WindowsTaskHostControl(control, { osTempRoot: input.expectedOsTempRoot }); } catch { return fail('windows-task-control-approval-final-control-invalid'); }
  const payload: Omit<Stage8WindowsTaskControlApprovalEvidence, 'evidenceSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_EVIDENCE_VERSION,
    scope: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE,
    approvalId: authorization.approvalId,
    identitySha256: authorization.identitySha256,
    controlTemplateSha256: authorization.controlTemplateSha256,
    hostRunId: authorization.hostRunId,
    targetRunId: authorization.targetRunId,
    taskName: authorization.taskName,
    runtimeReleaseCommit: authorization.runtimeReleaseCommit,
    signerReleaseCommit: authorization.signer.releaseCommit,
    signerSourceBundleSha256: authorization.signer.sourceBundleSha256,
    authorizationInputSha256: authorization.authorizationInputSha256,
    controlManifestSha256: control.manifestSha256,
    phaseAuthorizationsIssued: 0,
    scheduledTasksMutated: 0,
    servicesMutated: 0,
    formalPathsRead: 0,
    formalPilotGamesCredited: 0,
    control,
  };
  return { ok: true, value: { ...payload, evidenceSha256: hashStage8WindowsTaskControlApprovalEvidence(payload) } };
}

export function validateStage8WindowsTaskControlApprovalEvidence(input: {
  evidence: unknown;
  authorization: unknown;
  identityBundle: unknown;
  expectedOsTempRoot: string;
  inspectSignerCheckout(projectRoot: string): { headCommit: string; clean: boolean };
  readSignerFile(absolutePath: string): Uint8Array;
  validateIdentityBundle(bundle: unknown): Stage8WindowsTaskControlApprovalResult<{ identitySha256: string }>;
}): Stage8WindowsTaskControlApprovalResult<{ controlManifestSha256: string; evidenceSha256: string }> {
  if (!exactKeys(input.evidence, ['protocolVersion','scope','approvalId','identitySha256','controlTemplateSha256','hostRunId','targetRunId','taskName','runtimeReleaseCommit','signerReleaseCommit','signerSourceBundleSha256','authorizationInputSha256','controlManifestSha256','phaseAuthorizationsIssued','scheduledTasksMutated','servicesMutated','formalPathsRead','formalPilotGamesCredited','control','evidenceSha256'])) return fail('windows-task-control-approval-evidence-schema-invalid');
  const recreated = createStage8WindowsTaskControlApprovalEvidence(input);
  if (!recreated.ok) return recreated;
  const evidence = input.evidence as Stage8WindowsTaskControlApprovalEvidence;
  if (canonicalizeStage8OfflineIdentity(evidence) !== canonicalizeStage8OfflineIdentity(recreated.value)) return fail('windows-task-control-approval-evidence-drift');
  return { ok: true, value: { controlManifestSha256: evidence.controlManifestSha256, evidenceSha256: evidence.evidenceSha256 } };
}
