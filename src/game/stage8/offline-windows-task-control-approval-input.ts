import path from 'node:path';
import { hashStage8OfflineIdentity } from './offline-action-identity';
import {
  STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
  STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE,
  STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_VERSION,
  collectStage8WindowsTaskControlApprovalSignerIdentity,
  deriveStage8WindowsTaskControlApprovalId,
  hashStage8WindowsTaskControlApprovalInput,
  validateStage8WindowsTaskControlApprovalInput,
  type Stage8WindowsTaskControlApprovalInput,
  type Stage8WindowsTaskControlApprovalResult,
} from './offline-windows-task-control-approval';
import {
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME,
  type Stage8WindowsTaskDiagnosticIdentityBundle,
} from './offline-windows-task-diagnostic-identity';

export const STAGE8_WINDOWS_TASK_CONTROL_PRODUCT_DECISION_VERSION = 'stage8-windows-task-control-product-decision-v1';
export const STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_RELEASE = '5a2c0bd302f09c94881a4b717644b117a8091a98';
export const STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_FILES = Object.freeze([
  { path: 'scripts/stage8-windows-task-control-approval.mjs', sha256: '0ae259f975596b42ddbe089d8fd7fca5358fe12d057d5d8a626632b0e046b483' },
  { path: 'src/game/stage8/offline-windows-task-control-approval.ts', sha256: '6deb3d60a1e3a308e73402fed8b33c398dce6b7753830d31845cf7ca57a0d49a' },
]);
export const STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_SOURCE_BUNDLE_SHA256 = '22c326b4dae937f851aba374815996d1db59f1509b3f8a213174f33fc914d5c3';

export interface Stage8WindowsTaskControlProductDecision {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_CONTROL_PRODUCT_DECISION_VERSION;
  scope: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE;
  granted: true;
  checkOnly: true;
  identitySha256: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256;
  signerReleaseCommit: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_RELEASE;
  runtimeReleaseCommit: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  targetRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID;
  taskName: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME;
  phaseAuthorizations: {
    'materials-emit': false;
    register: false;
    run: false;
    verify: false;
    delete: false;
  };
  decisionSha256: string;
}

function fail<T = never>(reason: string): Stage8WindowsTaskControlApprovalResult<T> {
  return { ok: false, reason };
}

function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function decisionPayload(
  decision: Stage8WindowsTaskControlProductDecision,
): Omit<Stage8WindowsTaskControlProductDecision, 'decisionSha256'> {
  const { decisionSha256: ignored, ...payload } = decision;
  void ignored;
  return payload;
}

export function hashStage8WindowsTaskControlProductDecision(
  decision: Omit<Stage8WindowsTaskControlProductDecision, 'decisionSha256'>,
): string {
  return hashStage8OfflineIdentity(decision);
}

export function validateStage8WindowsTaskControlProductDecision(
  input: unknown,
): Stage8WindowsTaskControlApprovalResult<Stage8WindowsTaskControlProductDecision> {
  if (!exactKeys(input, [
    'protocolVersion','scope','granted','checkOnly','identitySha256','signerReleaseCommit','runtimeReleaseCommit',
    'hostRunId','targetRunId','taskName','phaseAuthorizations','decisionSha256',
  ])) return fail('windows-task-control-product-decision-schema-invalid');
  const decision = input as Stage8WindowsTaskControlProductDecision;
  if (!exactKeys(decision.phaseAuthorizations, ['materials-emit','register','run','verify','delete'])) {
    return fail('windows-task-control-product-decision-phase-schema-invalid');
  }
  if (decision.protocolVersion !== STAGE8_WINDOWS_TASK_CONTROL_PRODUCT_DECISION_VERSION
    || decision.scope !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE
    || decision.granted !== true
    || decision.checkOnly !== true
    || decision.identitySha256 !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256
    || decision.signerReleaseCommit !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_RELEASE
    || decision.runtimeReleaseCommit !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT
    || decision.hostRunId !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID
    || decision.targetRunId !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_TARGET_RUN_ID
    || decision.taskName !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_TASK_NAME
    || Object.values(decision.phaseAuthorizations).some((authorized) => authorized !== false)) {
    return fail('windows-task-control-product-decision-policy-drift');
  }
  if (decision.decisionSha256 !== hashStage8WindowsTaskControlProductDecision(decisionPayload(decision))) {
    return fail('windows-task-control-product-decision-hash-mismatch');
  }
  return { ok: true, value: decision };
}

export function createStage8WindowsTaskControlApprovalInput(input: {
  decision: unknown;
  identityBundle: unknown;
  signerProjectRoot: string;
  expectedOsTempRoot: string;
  inspectSignerCheckout(projectRoot: string): { headCommit: string; clean: boolean };
  readSignerFile(absolutePath: string): Uint8Array;
  validateIdentityBundle(bundle: unknown): Stage8WindowsTaskControlApprovalResult<{ identitySha256: string }>;
}): Stage8WindowsTaskControlApprovalResult<Stage8WindowsTaskControlApprovalInput> {
  const decision = validateStage8WindowsTaskControlProductDecision(input.decision);
  if (decision.ok === false) return fail(decision.reason);
  const bundle = input.identityBundle as Stage8WindowsTaskDiagnosticIdentityBundle;
  const identityValidation = input.validateIdentityBundle(input.identityBundle);
  if (identityValidation.ok === false
    || identityValidation.value.identitySha256 !== decision.value.identitySha256
    || bundle?.identitySha256 !== decision.value.identitySha256
    || bundle.request?.hostRunId !== decision.value.hostRunId
    || bundle.request?.targetRunId !== decision.value.targetRunId
    || bundle.request?.taskName !== decision.value.taskName
    || bundle.request?.releaseCommit !== decision.value.runtimeReleaseCommit) {
    return fail('windows-task-control-approval-input-identity-invalid');
  }
  const signer = collectStage8WindowsTaskControlApprovalSignerIdentity({
    projectRoot: input.signerProjectRoot,
    releaseCommit: decision.value.signerReleaseCommit,
    inspectCheckout: input.inspectSignerCheckout,
    readFile: input.readSignerFile,
  });
  if (signer.ok === false) return fail(signer.reason);
  if (signer.value.sourceBundleSha256 !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_SOURCE_BUNDLE_SHA256
    || signer.value.files.length !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_FILES.length
    || signer.value.files.some((file, index) => file.path !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_FILES[index].path
      || file.sha256 !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_INPUT_SIGNER_FILES[index].sha256)) {
    return fail('windows-task-control-approval-input-signer-source-drift');
  }
  const controlTemplateSha256 = hashStage8OfflineIdentity(bundle.controlTemplate);
  const approvalId = deriveStage8WindowsTaskControlApprovalId({
    identitySha256: decision.value.identitySha256,
    controlTemplateSha256,
    hostRunId: decision.value.hostRunId,
    targetRunId: decision.value.targetRunId,
    taskName: decision.value.taskName,
    runtimeReleaseCommit: decision.value.runtimeReleaseCommit,
    signerReleaseCommit: signer.value.releaseCommit,
    signerSourceBundleSha256: signer.value.sourceBundleSha256,
  });
  const payload: Omit<Stage8WindowsTaskControlApprovalInput, 'authorizationInputSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_VERSION,
    scope: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_SCOPE,
    approvalId,
    granted: true,
    identitySha256: decision.value.identitySha256,
    controlTemplateSha256,
    hostRunId: decision.value.hostRunId,
    targetRunId: decision.value.targetRunId,
    taskName: decision.value.taskName,
    runtimeReleaseCommit: decision.value.runtimeReleaseCommit,
    signer: signer.value,
    outputRoot: path.win32.join(
      path.win32.resolve(input.expectedOsTempRoot),
      'WannianMahjong',
      'Stage8',
      decision.value.hostRunId,
      'control-approval',
    ),
  };
  const authorization: Stage8WindowsTaskControlApprovalInput = {
    ...payload,
    authorizationInputSha256: hashStage8WindowsTaskControlApprovalInput(payload),
  };
  const validated = validateStage8WindowsTaskControlApprovalInput({
    authorization,
    identityBundle: input.identityBundle,
    expectedOsTempRoot: input.expectedOsTempRoot,
    inspectSignerCheckout: input.inspectSignerCheckout,
    readSignerFile: input.readSignerFile,
    validateIdentityBundle: input.validateIdentityBundle,
  });
  if (validated.ok === false) return fail(validated.reason);
  return { ok: true, value: validated.value };
}
