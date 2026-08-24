import * as path from 'node:path';

export interface Stage8ArtifactRootPreflightInput {
  environment: Record<string, string | undefined>;
  projectRoots: string[];
  exists: (candidate: string) => boolean;
  isDirectory: (candidate: string) => boolean;
}

export type Stage8ArtifactRootPreflight =
  | { ok: true; artifactRoot: string }
  | { ok: false; reason: string };

function normalize(candidate: string): string {
  return path.win32.normalize(candidate).replace(/[\\/]+$/, '').toLowerCase();
}
function isSameOrChild(candidate: string, root: string): boolean {
  const normalizedCandidate = normalize(candidate); const normalizedRoot = normalize(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
}

/** Validates only. It never creates or writes an artifact directory. */
export function preflightStage8ArtifactRoot(input: Stage8ArtifactRootPreflightInput): Stage8ArtifactRootPreflight {
  const configured = input.environment.STAGE8_ARTIFACT_ROOT;
  if (!configured) return { ok: false, reason: 'stage8-artifact-root-required' };
  if (!path.win32.isAbsolute(configured)) return { ok: false, reason: 'stage8-artifact-root-must-be-absolute' };
  if (input.projectRoots.some((root) => isSameOrChild(configured, root))) return { ok: false, reason: 'stage8-artifact-root-project-tree-forbidden' };
  if (!input.exists(configured)) return { ok: false, reason: 'stage8-artifact-root-missing' };
  if (!input.isDirectory(configured)) return { ok: false, reason: 'stage8-artifact-root-not-directory' };
  return { ok: true, artifactRoot: path.win32.normalize(configured) };
}
