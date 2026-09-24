import fs from "fs";
import path from "path";

type Environment = Record<string, string | undefined>;

function canonicalPath(value: string): string {
  const normalized = path.normalize(value);
  return fs.existsSync(normalized) ? fs.realpathSync.native(normalized) : normalized;
}

export function resolveRlWeightsFile(env: Environment = process.env): string {
  const approved = env.APPROVED_RL_WEIGHTS_FILE;
  if (!approved) {
    throw new Error("APPROVED_RL_WEIGHTS_FILE is required; refusing to use the process working directory");
  }
  if (!path.isAbsolute(approved)) {
    throw new Error("APPROVED_RL_WEIGHTS_FILE must be an absolute path");
  }
  const resolved = canonicalPath(approved);
  const configured = env.RL_WEIGHTS_FILE;
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error("RL_WEIGHTS_FILE must be an absolute path");
    }
    if (canonicalPath(configured) !== resolved) {
      throw new Error("RL_WEIGHTS_FILE does not match APPROVED_RL_WEIGHTS_FILE");
    }
  }
  return resolved;
}

export function requireExistingRlWeightsFile(env: Environment = process.env): string {
  const resolved = resolveRlWeightsFile(env);
  if (!fs.existsSync(resolved)) {
    throw new Error("APPROVED_RL_WEIGHTS_FILE does not exist");
  }
  if (!fs.statSync(resolved).isFile()) {
    throw new Error("APPROVED_RL_WEIGHTS_FILE must reference a file");
  }
  return resolved;
}
