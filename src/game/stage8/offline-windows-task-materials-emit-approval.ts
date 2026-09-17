import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  canonicalizeStage8OfflineIdentity,
  hashStage8OfflineIdentity,
} from './offline-action-identity';
import {
  STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
  hashStage8WindowsTaskControlApprovalEvidence,
} from './offline-windows-task-control-approval';
import {
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_PHASE_SCOPES,
  STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
  buildStage8WindowsTaskDiagnosticIdentityInput,
} from './offline-windows-task-diagnostic-identity';
import {
  STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION,
  hashStage8WindowsTaskHostPhaseAuthorizationPayload,
  validateStage8WindowsTaskHostControl,
  validateStage8WindowsTaskHostPhaseAuthorization,
  type Stage8WindowsTaskHostControl,
  type Stage8WindowsTaskHostPhaseAuthorization,
} from './offline-windows-task-host-control';

export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_VERSION = 'stage8-windows-task-materials-emit-approval-v1';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_DECISION_VERSION = 'stage8-windows-task-materials-emit-decision-v1';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE = 'stage8-windows-task-host:materials-emit';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION = 'materials-emit';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_REQUEST_ID = `${STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID}-materials-emit-signing-request`;
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256 = '6649c4ae0fa36a0acfccd70aec514e6f2624ea8fe5dbf6760f48fcdc25b788f9';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256 = 'a9ed4714d6c4f2f1de08be72cbedf5c5221d984227fecd1bdc248e0cd3f702b9';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_FILE_SHA256 = 'd852b69ed7c087ed9ecbe640f6a4b2113215db8110e47ed09cdc331166854a8c';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_EVIDENCE_FILE_SHA256 = 'e7cdb65cf6461727c6e4769aa24b77b9f9150946F8F0DE04C76F0A9AC66C6C36'.toLowerCase();
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_RUNTIME_SOURCE_BUNDLE_SHA256 = 'b3c46af312bbb1ef966db49daaef6217effa8e08910a63d5377bfbf231a16ce3';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_SIGNER_SOURCE_BUNDLE_SHA256 = '22c326b4dae937f851aba374815996d1db59f1509b3f8a213174f33fc914d5c3';
export const STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SIGNER_FILES = Object.freeze([
  'scripts/stage8-windows-task-materials-emit-approval.mjs',
  'src/game/stage8/offline-windows-task-materials-emit-approval.ts',
].sort());

export interface Stage8WindowsTaskMaterialsEmitTargets {
  authorizationPath: string;
  materialsOutputDirectory: string;
  taskDefinitionPath: string;
  taskMaterialsPath: string;
}

export interface Stage8WindowsTaskMaterialsEmitSignerIdentity {
  projectRoot: string;
  releaseCommit: string;
  files: Array<{ path: string; sha256: string }>;
  sourceBundleSha256: string;
}

export interface Stage8WindowsTaskMaterialsEmitProductDecision {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_DECISION_VERSION;
  scope: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE;
  action: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION;
  requestId: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_REQUEST_ID;
  granted: true;
  checkOnly: true;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  diagnosticIdentitySha256: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256;
  controlManifestSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256;
  controlEvidenceSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256;
  runtimeReleaseCommit: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT;
  runtimeSourceBundleSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_RUNTIME_SOURCE_BUNDLE_SHA256;
  signerReleaseCommit: string;
  signerSourceBundleSha256: string;
  targets: Stage8WindowsTaskMaterialsEmitTargets;
  phaseApprovals: { 'materials-emit': null; register: null; run: null; verify: null; delete: null };
  decisionSha256: string;
}

export interface Stage8WindowsTaskMaterialsEmitApprovalInput {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_VERSION;
  scope: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE;
  action: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION;
  requestId: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_REQUEST_ID;
  approvalId: string;
  granted: true;
  hostRunId: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID;
  diagnosticIdentitySha256: typeof STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256;
  controlManifestSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256;
  controlEvidenceSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256;
  controlFileSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_FILE_SHA256;
  evidenceFileSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_EVIDENCE_FILE_SHA256;
  runtimeReleaseCommit: typeof STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT;
  runtimeSourceBundleSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_RUNTIME_SOURCE_BUNDLE_SHA256;
  controlSignerSourceBundleSha256: typeof STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_SIGNER_SOURCE_BUNDLE_SHA256;
  signer: Stage8WindowsTaskMaterialsEmitSignerIdentity;
  targets: Stage8WindowsTaskMaterialsEmitTargets;
  productDecisionSha256: string;
  authorizationInputSha256: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

function fail<T = never>(reason: string): Result<T> { return { ok: false, reason }; }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function isSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function exactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function samePath(left: string, right: string): boolean { return path.win32.resolve(left).toLowerCase() === path.win32.resolve(right).toLowerCase(); }
function isInside(parent: string, child: string): boolean {
  const root = path.win32.resolve(parent).toLowerCase();
  const target = path.win32.resolve(child).toLowerCase();
  return target === root || target.startsWith(`${root}${path.win32.sep}`);
}

export function deriveStage8WindowsTaskMaterialsEmitFormalRoot(osTempRoot: string): string {
  return path.win32.join(path.win32.resolve(osTempRoot), 'WannianMahjong', 'Stage8', STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID, 'control-approval');
}

export function deriveStage8WindowsTaskMaterialsEmitTargets(
  control: Stage8WindowsTaskHostControl,
  osTempRoot: string,
): Stage8WindowsTaskMaterialsEmitTargets {
  const request = buildStage8WindowsTaskDiagnosticIdentityInput({
    projectRoot: control.command.workingDirectory,
    nodeExecutablePath: control.command.executablePath,
    osTempRoot,
    userSid: control.task.principal.userSid,
  });
  if (!samePath(request.paths.controlPath, control.paths.controlPath)) throw new Error('windows-task-materials-emit-control-path-drift');
  const authorizationPath = request.paths.phaseAuthorizationPaths['materials-emit'];
  const runRoot = path.win32.dirname(path.win32.dirname(authorizationPath));
  const materialsOutputDirectory = path.win32.join(runRoot, 'materials');
  const targets = {
    authorizationPath,
    materialsOutputDirectory,
    taskDefinitionPath: path.win32.join(materialsOutputDirectory, 'task-definition.xml'),
    taskMaterialsPath: path.win32.join(materialsOutputDirectory, 'task-materials.json'),
  };
  if (!isInside(osTempRoot, authorizationPath) || !isInside(osTempRoot, materialsOutputDirectory)
    || isInside(control.command.workingDirectory, authorizationPath) || isInside(control.command.workingDirectory, materialsOutputDirectory)) {
    throw new Error('windows-task-materials-emit-target-outside-os-temp');
  }
  return targets;
}

export function hashStage8WindowsTaskMaterialsEmitSignerIdentity(input: { releaseCommit: string; files: Array<{ path: string; sha256: string }> }): string {
  return hashStage8OfflineIdentity({ protocolVersion: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_VERSION, ...input });
}

export function collectStage8WindowsTaskMaterialsEmitSignerIdentity(input: {
  projectRoot: string;
  inspectCheckout(projectRoot: string): { headCommit: string; clean: boolean; sourceReleaseCommit?: string };
  readFile(absolutePath: string): Uint8Array;
}): Result<Stage8WindowsTaskMaterialsEmitSignerIdentity> {
  if (!path.win32.isAbsolute(input.projectRoot)) return fail('windows-task-materials-emit-signer-root-invalid');
  let checkout: { headCommit: string; clean: boolean; sourceReleaseCommit?: string };
  try { checkout = input.inspectCheckout(input.projectRoot); } catch { return fail('windows-task-materials-emit-signer-inspection-failed'); }
  const releaseCommit = checkout.sourceReleaseCommit ?? checkout.headCommit;
  if (!checkout.clean || !/^[a-f0-9]{40}$/.test(checkout.headCommit) || !/^[a-f0-9]{40}$/.test(releaseCommit)) return fail('windows-task-materials-emit-signer-release-drift');
  const files: Array<{ path: string; sha256: string }> = [];
  try {
    for (const relativePath of STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SIGNER_FILES) {
      files.push({ path: relativePath, sha256: sha256(input.readFile(path.win32.join(input.projectRoot, relativePath))) });
    }
  } catch { return fail('windows-task-materials-emit-signer-source-read-failed'); }
  return { ok: true, value: {
    projectRoot: path.win32.resolve(input.projectRoot),
    releaseCommit,
    files,
    sourceBundleSha256: hashStage8WindowsTaskMaterialsEmitSignerIdentity({ releaseCommit, files }),
  } };
}

export function validateStage8WindowsTaskMaterialsEmitFormalPair(input: {
  controlBytes: Uint8Array;
  evidenceBytes: Uint8Array;
  osTempRoot: string;
}): Result<{ control: Stage8WindowsTaskHostControl; targets: Stage8WindowsTaskMaterialsEmitTargets }> {
  if (sha256(input.controlBytes) !== STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_FILE_SHA256
    || sha256(input.evidenceBytes) !== STAGE8_WINDOWS_TASK_MATERIALS_EMIT_EVIDENCE_FILE_SHA256) return fail('windows-task-materials-emit-formal-file-hash-drift');
  let control: Stage8WindowsTaskHostControl;
  let evidence: Record<string, unknown>;
  try {
    control = validateStage8WindowsTaskHostControl(JSON.parse(Buffer.from(input.controlBytes).toString('utf8')), { osTempRoot: input.osTempRoot });
    evidence = JSON.parse(Buffer.from(input.evidenceBytes).toString('utf8')) as Record<string, unknown>;
  } catch { return fail('windows-task-materials-emit-formal-json-invalid'); }
  if (control.manifestSha256 !== STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256
    || control.hostRunId !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID
    || control.identity.releaseCommit !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT
    || control.identity.sourceBundleSha256 !== STAGE8_WINDOWS_TASK_MATERIALS_EMIT_RUNTIME_SOURCE_BUNDLE_SHA256) return fail('windows-task-materials-emit-control-identity-drift');
  const evidenceKeys = ['protocolVersion','scope','approvalId','identitySha256','controlTemplateSha256','hostRunId','targetRunId','taskName','runtimeReleaseCommit','signerReleaseCommit','signerSourceBundleSha256','authorizationInputSha256','controlManifestSha256','phaseAuthorizationsIssued','scheduledTasksMutated','servicesMutated','formalPathsRead','formalPilotGamesCredited','control','evidenceSha256'];
  if (!exactKeys(evidence, evidenceKeys)) return fail('windows-task-materials-emit-evidence-schema-invalid');
  const evidenceSha256 = evidence.evidenceSha256;
  if (evidenceSha256 !== STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256 || !isSha(evidenceSha256)) return fail('windows-task-materials-emit-evidence-identity-drift');
  const { evidenceSha256: ignored, ...evidencePayload } = evidence;
  void ignored;
  if (hashStage8WindowsTaskControlApprovalEvidence(evidencePayload as never) !== evidenceSha256
    || canonicalizeStage8OfflineIdentity(evidence.control) !== canonicalizeStage8OfflineIdentity(control)) return fail('windows-task-materials-emit-evidence-hash-drift');
  if (evidence.identitySha256 !== STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256
    || evidence.runtimeReleaseCommit !== STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT
    || evidence.signerSourceBundleSha256 !== STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_SIGNER_SOURCE_BUNDLE_SHA256
    || evidence.controlManifestSha256 !== control.manifestSha256
    || evidence.phaseAuthorizationsIssued !== 0 || evidence.scheduledTasksMutated !== 0 || evidence.servicesMutated !== 0
    || evidence.formalPathsRead !== 0 || evidence.formalPilotGamesCredited !== 0) return fail('windows-task-materials-emit-control-evidence-drift');
  try { return { ok: true, value: { control, targets: deriveStage8WindowsTaskMaterialsEmitTargets(control, input.osTempRoot) } }; }
  catch { return fail('windows-task-materials-emit-target-derivation-failed'); }
}

function decisionPayload(value: Stage8WindowsTaskMaterialsEmitProductDecision): Omit<Stage8WindowsTaskMaterialsEmitProductDecision, 'decisionSha256'> {
  const { decisionSha256: ignored, ...payload } = value; void ignored; return payload;
}
function inputPayload(value: Stage8WindowsTaskMaterialsEmitApprovalInput): Omit<Stage8WindowsTaskMaterialsEmitApprovalInput, 'authorizationInputSha256'> {
  const { authorizationInputSha256: ignored, ...payload } = value; void ignored; return payload;
}
export function hashStage8WindowsTaskMaterialsEmitProductDecision(value: Omit<Stage8WindowsTaskMaterialsEmitProductDecision, 'decisionSha256'>): string { return hashStage8OfflineIdentity(value); }
export function hashStage8WindowsTaskMaterialsEmitApprovalInput(value: Omit<Stage8WindowsTaskMaterialsEmitApprovalInput, 'authorizationInputSha256'>): string { return hashStage8OfflineIdentity(value); }
export function hashStage8WindowsTaskMaterialsEmitTargets(value: Stage8WindowsTaskMaterialsEmitTargets): string { return hashStage8OfflineIdentity(value); }

export function createStage8WindowsTaskMaterialsEmitProductDecision(input: {
  signer: Stage8WindowsTaskMaterialsEmitSignerIdentity;
  targets: Stage8WindowsTaskMaterialsEmitTargets;
}): Stage8WindowsTaskMaterialsEmitProductDecision {
  const payload: Omit<Stage8WindowsTaskMaterialsEmitProductDecision, 'decisionSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_DECISION_VERSION,
    scope: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE,
    action: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION,
    requestId: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_REQUEST_ID,
    granted: true,
    checkOnly: true,
    hostRunId: STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
    diagnosticIdentitySha256: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
    controlManifestSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256,
    controlEvidenceSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256,
    runtimeReleaseCommit: STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
    runtimeSourceBundleSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_RUNTIME_SOURCE_BUNDLE_SHA256,
    signerReleaseCommit: input.signer.releaseCommit,
    signerSourceBundleSha256: input.signer.sourceBundleSha256,
    targets: input.targets,
    phaseApprovals: { 'materials-emit': null, register: null, run: null, verify: null, delete: null },
  };
  return { ...payload, decisionSha256: hashStage8WindowsTaskMaterialsEmitProductDecision(payload) };
}

export function validateStage8WindowsTaskMaterialsEmitProductDecision(value: unknown, signer: Stage8WindowsTaskMaterialsEmitSignerIdentity, targets: Stage8WindowsTaskMaterialsEmitTargets): Result<Stage8WindowsTaskMaterialsEmitProductDecision> {
  const expected = createStage8WindowsTaskMaterialsEmitProductDecision({ signer, targets });
  if (!exactKeys(value, Object.keys(expected)) || !exactKeys((value as Stage8WindowsTaskMaterialsEmitProductDecision)?.phaseApprovals, ['materials-emit','register','run','verify','delete'])
    || !exactKeys((value as Stage8WindowsTaskMaterialsEmitProductDecision)?.targets, ['authorizationPath','materialsOutputDirectory','taskDefinitionPath','taskMaterialsPath'])) return fail('windows-task-materials-emit-decision-schema-invalid');
  if (canonicalizeStage8OfflineIdentity(value) !== canonicalizeStage8OfflineIdentity(expected)) return fail('windows-task-materials-emit-decision-policy-drift');
  return { ok: true, value: value as Stage8WindowsTaskMaterialsEmitProductDecision };
}

export function createStage8WindowsTaskMaterialsEmitApprovalInput(input: {
  decision: unknown;
  signer: Stage8WindowsTaskMaterialsEmitSignerIdentity;
  targets: Stage8WindowsTaskMaterialsEmitTargets;
}): Result<Stage8WindowsTaskMaterialsEmitApprovalInput> {
  const decision = validateStage8WindowsTaskMaterialsEmitProductDecision(input.decision, input.signer, input.targets);
  if (!decision.ok) return fail(decision.reason);
  const approvalId = `stage8-windows-task-materials-emit-${hashStage8OfflineIdentity({
    requestId: decision.value.requestId,
    controlManifestSha256: decision.value.controlManifestSha256,
    controlEvidenceSha256: decision.value.controlEvidenceSha256,
    signerReleaseCommit: input.signer.releaseCommit,
    signerSourceBundleSha256: input.signer.sourceBundleSha256,
    targets: input.targets,
    productDecisionSha256: decision.value.decisionSha256,
  }).slice(0, 40)}`;
  const payload: Omit<Stage8WindowsTaskMaterialsEmitApprovalInput, 'authorizationInputSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_APPROVAL_VERSION,
    scope: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_SCOPE,
    action: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION,
    requestId: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_REQUEST_ID,
    approvalId,
    granted: true,
    hostRunId: STAGE8_WINDOWS_TASK_DIAGNOSTIC_HOST_RUN_ID,
    diagnosticIdentitySha256: STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_IDENTITY_SHA256,
    controlManifestSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_MANIFEST_SHA256,
    controlEvidenceSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_EVIDENCE_SHA256,
    controlFileSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_FILE_SHA256,
    evidenceFileSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_EVIDENCE_FILE_SHA256,
    runtimeReleaseCommit: STAGE8_WINDOWS_TASK_DIAGNOSTIC_RELEASE_COMMIT,
    runtimeSourceBundleSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_RUNTIME_SOURCE_BUNDLE_SHA256,
    controlSignerSourceBundleSha256: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_CONTROL_SIGNER_SOURCE_BUNDLE_SHA256,
    signer: input.signer,
    targets: input.targets,
    productDecisionSha256: decision.value.decisionSha256,
  };
  return { ok: true, value: { ...payload, authorizationInputSha256: hashStage8WindowsTaskMaterialsEmitApprovalInput(payload) } };
}

export function validateStage8WindowsTaskMaterialsEmitApprovalInput(value: unknown, input: {
  decision: unknown;
  signer: Stage8WindowsTaskMaterialsEmitSignerIdentity;
  targets: Stage8WindowsTaskMaterialsEmitTargets;
}): Result<Stage8WindowsTaskMaterialsEmitApprovalInput> {
  const recreated = createStage8WindowsTaskMaterialsEmitApprovalInput(input);
  if (!recreated.ok) return recreated;
  if (!exactKeys(value, Object.keys(recreated.value))
    || !exactKeys((value as Stage8WindowsTaskMaterialsEmitApprovalInput)?.signer, ['projectRoot','releaseCommit','files','sourceBundleSha256'])
    || !Array.isArray((value as Stage8WindowsTaskMaterialsEmitApprovalInput)?.signer?.files)
    || (value as Stage8WindowsTaskMaterialsEmitApprovalInput).signer.files.some((entry) => !exactKeys(entry, ['path','sha256']))
    || !exactKeys((value as Stage8WindowsTaskMaterialsEmitApprovalInput)?.targets, ['authorizationPath','materialsOutputDirectory','taskDefinitionPath','taskMaterialsPath'])) return fail('windows-task-materials-emit-input-schema-invalid');
  if (canonicalizeStage8OfflineIdentity(value) !== canonicalizeStage8OfflineIdentity(recreated.value)) return fail('windows-task-materials-emit-input-drift');
  return { ok: true, value: value as Stage8WindowsTaskMaterialsEmitApprovalInput };
}

export function checkStage8WindowsTaskMaterialsEmitApproval(input: {
  authorization: unknown;
  decision: unknown;
  signer: Stage8WindowsTaskMaterialsEmitSignerIdentity;
  formal: { control: Stage8WindowsTaskHostControl; targets: Stage8WindowsTaskMaterialsEmitTargets };
}): Result<{ approvalId: string; authorizationInputSha256: string; authorizationSha256: string; checkIdentitySha256: string }> {
  const validated = validateStage8WindowsTaskMaterialsEmitApprovalInput(input.authorization, {
    decision: input.decision,
    signer: input.signer,
    targets: input.formal.targets,
  });
  if (!validated.ok) return fail(validated.reason);
  if (validated.value.controlManifestSha256 !== input.formal.control.manifestSha256) return fail('windows-task-materials-emit-control-hash-drift');
  const payload: Omit<Stage8WindowsTaskHostPhaseAuthorization, 'authorizationSha256'> = {
    protocolVersion: STAGE8_WINDOWS_TASK_HOST_AUTHORIZATION_VERSION,
    action: STAGE8_WINDOWS_TASK_MATERIALS_EMIT_ACTION,
    scope: STAGE8_WINDOWS_TASK_DIAGNOSTIC_PHASE_SCOPES['materials-emit'],
    approvalId: validated.value.approvalId,
    granted: true,
    hostRunId: validated.value.hostRunId,
    controlManifestSha256: validated.value.controlManifestSha256,
  };
  const candidate = { ...payload, authorizationSha256: hashStage8WindowsTaskHostPhaseAuthorizationPayload(payload) };
  try { validateStage8WindowsTaskHostPhaseAuthorization(candidate, input.formal.control, 'materials-emit'); }
  catch { return fail('windows-task-materials-emit-phase-authorization-invalid'); }
  return { ok: true, value: {
    approvalId: validated.value.approvalId,
    authorizationInputSha256: validated.value.authorizationInputSha256,
    authorizationSha256: candidate.authorizationSha256,
    checkIdentitySha256: hashStage8OfflineIdentity({
      productDecisionSha256: validated.value.productDecisionSha256,
      authorizationInputSha256: validated.value.authorizationInputSha256,
      authorizationSha256: candidate.authorizationSha256,
      controlManifestSha256: validated.value.controlManifestSha256,
      controlEvidenceSha256: validated.value.controlEvidenceSha256,
      signerSourceBundleSha256: validated.value.signer.sourceBundleSha256,
      targets: validated.value.targets,
    }),
  } };
}
