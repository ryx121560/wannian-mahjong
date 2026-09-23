import { createHash } from 'node:crypto';
import {
  STAGE8_WINDOWS_TASK_HOST_DEMAND_CONTROL_VERSION,
  validateStage8WindowsTaskHostControl,
  validateStage8WindowsTaskHostMaterial,
  validateStage8WindowsTaskHostPhaseAuthorization,
  type Stage8WindowsTaskHostControl,
  type Stage8WindowsTaskHostMaterial,
  type Stage8WindowsTaskHostPhaseAuthorization,
} from './offline-windows-task-host-control';
import { validateStage8WindowsTaskRegisterCanonicalXml } from './offline-windows-task-register-approval';
import { validateStage8WindowsTaskRegisterExecutionXmlIdentity } from './offline-windows-task-register-execution';

export const STAGE8_WINDOWS_TASK_DEMAND_REGISTRATION_VERSION = 'stage8-windows-task-demand-registration-v2';

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function validateStage8WindowsTaskDemandRegistrationCandidate(input: {
  control: unknown;
  materialsAuthorization: unknown;
  registerAuthorization: unknown;
  runAuthorization: unknown;
  material: unknown;
  taskXmlBytes: Uint8Array;
  exportedTaskXml: Uint8Array | string;
  renderTaskXmlBytes(control: Stage8WindowsTaskHostControl): Uint8Array;
  registeredTask: {
    taskPath: string;
    taskName: string;
    state: string;
    runningInstances: number;
    lastTaskResult: number | null;
  };
  osTempRoot: string;
}): {
  protocolVersion: typeof STAGE8_WINDOWS_TASK_DEMAND_REGISTRATION_VERSION;
  control: Stage8WindowsTaskHostControl;
  material: Stage8WindowsTaskHostMaterial;
  registerAuthorization: Stage8WindowsTaskHostPhaseAuthorization;
  taskXmlSha256: string;
  normalizedExportedXmlSha256: string;
  taskState: 'Ready';
  runningInstances: 0;
  lastTaskResult: null;
} {
  const control = validateStage8WindowsTaskHostControl(input.control, { osTempRoot: input.osTempRoot });
  if (control.protocolVersion !== STAGE8_WINDOWS_TASK_HOST_DEMAND_CONTROL_VERSION
    || control.task.trigger.type !== 'on-demand-only'
    || control.task.settings.allowDemandStart !== true) {
    throw new Error('windows-task-demand-old-or-automatic-control-forbidden');
  }
  if (input.runAuthorization !== null) throw new Error('windows-task-demand-run-phase-inheritance-forbidden');
  const materialsAuthorization = validateStage8WindowsTaskHostPhaseAuthorization(
    input.materialsAuthorization, control, 'materials-emit',
  );
  const registerAuthorization = validateStage8WindowsTaskHostPhaseAuthorization(
    input.registerAuthorization, control, 'register',
  );
  const material = validateStage8WindowsTaskHostMaterial(input.material, control, materialsAuthorization);
  const formalXml = validateStage8WindowsTaskRegisterCanonicalXml(input.taskXmlBytes);
  if (sha256(input.taskXmlBytes) !== material.taskXmlSha256
    || !Buffer.from(input.taskXmlBytes).equals(Buffer.from(input.renderTaskXmlBytes(control)))) {
    throw new Error('windows-task-demand-task-material-xml-drift');
  }
  if (/<Triggers(?:\s|>)|<\/?(?:TimeTrigger|CalendarTrigger|BootTrigger|LogonTrigger|RegistrationTrigger|EventTrigger|IdleTrigger|SessionStateChangeTrigger)(?:\s|>)/i.test(formalXml)
    || !formalXml.includes('<AllowStartOnDemand>true</AllowStartOnDemand>')
    || !formalXml.includes('<StartWhenAvailable>false</StartWhenAvailable>')
    || !formalXml.includes('<Enabled>true</Enabled>')) {
    throw new Error('windows-task-demand-automatic-trigger-or-policy-drift');
  }
  const xmlIdentity = validateStage8WindowsTaskRegisterExecutionXmlIdentity({
    taskXmlBytes: input.taskXmlBytes,
    exportedTaskXml: input.exportedTaskXml,
    control,
    material,
  });
  const state = input.registeredTask;
  if (state.taskPath !== control.task.taskPath
    || state.taskName !== control.task.taskName
    || state.state !== 'Ready'
    || state.runningInstances !== 0
    || state.lastTaskResult !== null) {
    throw new Error('windows-task-demand-registered-task-state-drift');
  }
  return {
    protocolVersion: STAGE8_WINDOWS_TASK_DEMAND_REGISTRATION_VERSION,
    control,
    material,
    registerAuthorization,
    taskXmlSha256: material.taskXmlSha256,
    normalizedExportedXmlSha256: xmlIdentity.normalizedXmlSha256,
    taskState: 'Ready',
    runningInstances: 0,
    lastTaskResult: null,
  };
}
