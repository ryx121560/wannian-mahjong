import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_PORT = '18768';

function canonicalPath(value) {
  const normalized = path.normalize(value);
  return fs.existsSync(normalized) ? fs.realpathSync.native(normalized) : normalized;
}

function resolveApprovedExportDirectory(env) {
  const configured = env.GAME_EXPORT_DIR;
  if (!configured) throw new Error('GAME_EXPORT_DIR is required for production launch');
  if (!path.isAbsolute(configured)) throw new Error('GAME_EXPORT_DIR must be an absolute path for production launch');
  const approved = env.APPROVED_GAME_EXPORT_DIR;
  if (!approved) throw new Error('APPROVED_GAME_EXPORT_DIR is required for production launch');
  if (!path.isAbsolute(approved)) throw new Error('APPROVED_GAME_EXPORT_DIR must be an absolute path for production launch');
  const exportDirectory = canonicalPath(configured);
  const approvedExportDirectory = canonicalPath(approved);
  if (exportDirectory !== approvedExportDirectory) throw new Error('GAME_EXPORT_DIR does not match APPROVED_GAME_EXPORT_DIR');
  if (!fs.existsSync(exportDirectory) || !fs.statSync(exportDirectory).isDirectory()) {
    throw new Error('GAME_EXPORT_DIR must reference an existing directory for production launch');
  }
  fs.accessSync(exportDirectory, fs.constants.W_OK);
  return { exportDirectory, approvedExportDirectory };
}

export function resolveProductionLaunchConfig(env = process.env) {
  if (env.PORT !== PRODUCTION_PORT) {
    throw new Error(`Production launch requires PORT=${PRODUCTION_PORT}`);
  }
  const configured = env.RL_WEIGHTS_FILE;
  if (!configured) {
    throw new Error('RL_WEIGHTS_FILE is required for production launch');
  }
  if (!path.isAbsolute(configured)) {
    throw new Error('RL_WEIGHTS_FILE must be an absolute path for production launch');
  }
  const approved = env.APPROVED_RL_WEIGHTS_FILE;
  if (!approved) {
    throw new Error('APPROVED_RL_WEIGHTS_FILE is required for production launch');
  }
  if (!path.isAbsolute(approved)) {
    throw new Error('APPROVED_RL_WEIGHTS_FILE must be an absolute path for production launch');
  }

  const weightsFile = canonicalPath(configured);
  const approvedWeightsFile = canonicalPath(approved);
  if (weightsFile !== approvedWeightsFile) {
    throw new Error('RL_WEIGHTS_FILE does not match APPROVED_RL_WEIGHTS_FILE');
  }
  if (!fs.existsSync(weightsFile) || !fs.statSync(weightsFile).isFile()) {
    throw new Error('RL_WEIGHTS_FILE must reference an existing file for production launch');
  }
  const exportConfig = resolveApprovedExportDirectory(env);
  return {
    port: PRODUCTION_PORT,
    portWindow: '0',
    weightsFile,
    approvedWeightsFile,
    ...exportConfig,
  };
}

function start() {
  const config = resolveProductionLaunchConfig();
  console.log(`[production-game] Starting on ${config.port} with RL weights file ${config.weightsFile} and approved export directory ${config.exportDirectory}`);
  const child = spawn(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'next-with-port.mjs'), 'start'], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: config.port,
      PORT_WINDOW: config.portWindow,
      RL_WEIGHTS_FILE: config.weightsFile,
      APPROVED_RL_WEIGHTS_FILE: config.approvedWeightsFile,
      RL_WEIGHTS_REQUIRE_APPROVED: '1',
      GAME_EXPORT_DIR: config.exportDirectory,
      APPROVED_GAME_EXPORT_DIR: config.approvedExportDirectory,
      GAME_EXPORT_REQUIRE_APPROVED: '1',
    },
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    start();
  } catch (error) {
    console.error(`[production-game] ${error.message}`);
    process.exit(1);
  }
}
