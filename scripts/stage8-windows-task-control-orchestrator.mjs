import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStage8WindowsTaskControlApprovalInputMaterials,
} from './stage8-windows-task-control-approval-input.mjs';
import {
  runStage8WindowsTaskControlApproval,
  serializeStage8WindowsTaskControlApprovalFailure,
} from './stage8-windows-task-control-approval.mjs';

const scriptPath = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  if (argv.length !== 8
    || !['--check', '--emit-and-verify'].includes(argv[0])
    || argv[1] !== '--runtime-root'
    || argv[3] !== '--signer-root'
    || argv[5] !== '--user-sid'
    || argv[7] !== '--product-approved-control-only') {
    throw new Error('usage: node stage8-windows-task-control-orchestrator.mjs --check|--emit-and-verify --runtime-root <clean-fae-root> --signer-root <clean-5a2-root> --user-sid <sid> --product-approved-control-only');
  }
  return { mode: argv[0], builderArgv: ['--check', ...argv.slice(1)] };
}

function signerDependencies(materials, dependencies, environment) {
  return {
    identityBundle: materials.identityBundle,
    authorization: materials.authorization,
    osTempRoot: materials.osTempRoot,
    inspectCheckout: materials.inspectCheckout,
    readFile: materials.readFile,
    validateIdentityBundle: materials.validateIdentityBundle,
    environment,
    ...(dependencies.fileSystem ? { fileSystem: dependencies.fileSystem } : {}),
  };
}

function summary(materials, result, overrides) {
  const effects = materials.effects();
  return {
    ok: true,
    status: overrides.status,
    scope: materials.authorization.scope,
    identitySha256: materials.authorization.identitySha256,
    controlTemplateSha256: materials.authorization.controlTemplateSha256,
    signerReleaseCommit: materials.authorization.signer.releaseCommit,
    signerSourceBundleSha256: materials.authorization.signer.sourceBundleSha256,
    productDecisionSha256: materials.decision.decisionSha256,
    approvalId: materials.authorization.approvalId,
    authorizationInputSha256: materials.authorization.authorizationInputSha256,
    controlManifestSha256: result.controlManifestSha256,
    evidenceSha256: result.evidenceSha256,
    filesWritten: overrides.filesWritten,
    filesVerified: overrides.filesVerified,
    identityBundlesPersisted: 0,
    approvalInputsPersisted: 0,
    phaseAuthorizationsIssued: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    targetRootReadsDuringBuild: effects.targetRootReads,
    formalPathsRead: effects.formalPathsRead,
    formalPilotGamesCredited: 0,
  };
}

export function runStage8WindowsTaskControlOrchestrator(argv = process.argv.slice(2), dependencies = {}) {
  const parsed = parseArgs(argv);
  const environment = dependencies.environment ?? process.env;
  if (parsed.mode === '--emit-and-verify' && environment.STAGE8_WINDOWS_TASK_CONTROL_ORCHESTRATOR_EMIT !== '1') {
    throw new Error('windows-task-control-orchestrator-emit-gate-required');
  }
  const materials = (dependencies.buildMaterials ?? buildStage8WindowsTaskControlApprovalInputMaterials)(parsed.builderArgv, dependencies);
  const runSigner = dependencies.runSigner ?? runStage8WindowsTaskControlApproval;
  if (parsed.mode === '--check') {
    const checked = runSigner([
      '--check', 'C:\\in-memory-diagnostic-identity.json', 'C:\\in-memory-control-approval-input.json',
    ], signerDependencies(materials, dependencies, environment));
    return summary(materials, checked, { status: 'checked', filesWritten: 0, filesVerified: 0 });
  }
  let emitted;
  try {
    emitted = runSigner([
      '--emit', 'C:\\in-memory-diagnostic-identity.json', 'C:\\in-memory-control-approval-input.json',
    ], signerDependencies(materials, dependencies, {
      ...environment,
      STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_EMIT: '1',
    }));
  } catch (error) {
    throw error;
  }
  try {
    const verified = runSigner([
      '--verify', materials.authorization.outputRoot,
      'C:\\in-memory-diagnostic-identity.json', 'C:\\in-memory-control-approval-input.json',
    ], signerDependencies(materials, dependencies, environment));
    if (verified.controlManifestSha256 !== emitted.controlManifestSha256
      || verified.evidenceSha256 !== emitted.evidenceSha256) {
      throw new Error('windows-task-control-orchestrator-emit-verify-hash-drift');
    }
    return summary(materials, verified, { status: 'emitted-and-verified', filesWritten: 2, filesVerified: 2 });
  } catch (error) {
    const outputRootExists = fs.existsSync(materials.authorization.outputRoot);
    const stagingExists = fs.existsSync(`${materials.authorization.outputRoot}.partial`);
    let filesRemaining = null;
    try {
      filesRemaining = (outputRootExists ? fs.readdirSync(materials.authorization.outputRoot).length : 0)
        + (stagingExists ? fs.readdirSync(`${materials.authorization.outputRoot}.partial`).length : 0);
    } catch {
      filesRemaining = null;
    }
    const failure = new Error(`windows-task-control-orchestrator-verify-failed:${error instanceof Error ? error.message : String(error)}`);
    failure.failureEvidence = {
      filesWritten: 2,
      filesRemaining,
      outputRootExists,
      stagingExists,
      verificationCompleted: false,
      identityBundlesPersisted: 0,
      approvalInputsPersisted: 0,
      phaseAuthorizationsIssued: 0,
      scheduledTasksRead: 0,
      scheduledTasksMutated: 0,
      servicesRead: 0,
      servicesMutated: 0,
      formalPathsRead: materials.effects().formalPathsRead,
      formalPilotGamesCredited: 0,
    };
    throw failure;
  }
}

export function serializeStage8WindowsTaskControlOrchestratorFailure(error) {
  const signerFailure = serializeStage8WindowsTaskControlApprovalFailure(error);
  return {
    ...signerFailure,
    identityBundlesPersisted: signerFailure.identityBundlesPersisted ?? 0,
    approvalInputsPersisted: signerFailure.approvalInputsPersisted ?? 0,
    phaseAuthorizationsIssued: 0,
    scheduledTasksRead: 0,
    scheduledTasksMutated: 0,
    servicesRead: 0,
    servicesMutated: 0,
    formalPilotGamesCredited: 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(`${JSON.stringify(runStage8WindowsTaskControlOrchestrator(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeStage8WindowsTaskControlOrchestratorFailure(error), null, 2)}\n`);
    process.exitCode = 1;
  }
}
