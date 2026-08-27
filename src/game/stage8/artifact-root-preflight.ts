import * as path from 'node:path';

export interface Stage8ArtifactRootPreflightInput {
  environment: Record<string, string | undefined>;
  projectRoots: string[];
  exists: (candidate: string) => boolean;
  isDirectory: (candidate: string) => boolean;
  resolvePath?: (candidate: string) => string;
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

/** Derives the primary repository root from a linked-worktree .git file without invoking Git. */
export function deriveStage8ForbiddenProjectRoots(input: { currentRoot: string; gitFileContent?: string }): string[] {
  const currentRoot = path.win32.normalize(input.currentRoot);
  const roots = [currentRoot];
  const match = typeof input.gitFileContent === 'string' ? /^gitdir:\s*(.+)\s*$/im.exec(input.gitFileContent) : null;
  if (!match) return roots;
  const gitDirectory = path.win32.isAbsolute(match[1]) ? path.win32.normalize(match[1]) : path.win32.resolve(currentRoot, match[1]);
  const marker = `${path.win32.sep}.git${path.win32.sep}worktrees${path.win32.sep}`.toLowerCase();
  const index = gitDirectory.toLowerCase().indexOf(marker);
  if (index > 0) roots.push(gitDirectory.slice(0, index));
  return Array.from(new Set(roots.map((root) => path.win32.normalize(root))));
}

/** Validates only. It never creates or writes an artifact directory. */
export function preflightStage8ArtifactRoot(input: Stage8ArtifactRootPreflightInput): Stage8ArtifactRootPreflight {
  const configured = input.environment.STAGE8_ARTIFACT_ROOT;
  if (!configured) return { ok: false, reason: 'stage8-artifact-root-required' };
  if (!path.win32.isAbsolute(configured)) return { ok: false, reason: 'stage8-artifact-root-must-be-absolute' };
  let resolvedConfigured = configured;
  let resolvedRoots = input.projectRoots;
  try {
    if (input.resolvePath) {
      resolvedConfigured = input.resolvePath(configured);
      resolvedRoots = input.projectRoots.map((root) => input.resolvePath!(root));
    }
  } catch {
    return { ok: false, reason: 'stage8-artifact-root-resolution-failed' };
  }
  if (resolvedRoots.some((root) => isSameOrChild(resolvedConfigured, root))) return { ok: false, reason: 'stage8-artifact-root-project-tree-forbidden' };
  if (!input.exists(configured)) return { ok: false, reason: 'stage8-artifact-root-missing' };
  if (!input.isDirectory(configured)) return { ok: false, reason: 'stage8-artifact-root-not-directory' };
  return { ok: true, artifactRoot: path.win32.normalize(configured) };
}
