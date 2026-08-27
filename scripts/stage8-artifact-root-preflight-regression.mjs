import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd(); const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-artifact-preflight-')); const require = createRequire(import.meta.url);
try {
  const source = path.join(root, 'src/game/stage8/artifact-root-preflight.ts'); const output = ts.transpileModule(fs.readFileSync(source, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: source }).outputText; fs.writeFileSync(path.join(temp, 'artifact-root-preflight.js'), output);
  const { preflightStage8ArtifactRoot, deriveStage8ForbiddenProjectRoots } = require(path.join(temp, 'artifact-root-preflight.js')); const project = 'C:\\repo'; const existing = new Set(['E:\\stage8-artifacts', 'E:\\repo-alias']); const input = (value, extra = {}) => ({ environment: value == null ? {} : { STAGE8_ARTIFACT_ROOT: value }, projectRoots: [project, 'C:\\repo\\.worktrees\\candidate'], exists: (candidate) => existing.has(candidate), isDirectory: (candidate) => existing.has(candidate), ...extra });
  assert.equal(preflightStage8ArtifactRoot(input()).reason, 'stage8-artifact-root-required'); assert.equal(preflightStage8ArtifactRoot(input('relative')).reason, 'stage8-artifact-root-must-be-absolute'); assert.equal(preflightStage8ArtifactRoot(input('C:\\repo\\out')).reason, 'stage8-artifact-root-project-tree-forbidden'); assert.equal(preflightStage8ArtifactRoot(input('C:\\repo\\.worktrees\\candidate\\out')).reason, 'stage8-artifact-root-project-tree-forbidden'); assert.equal(preflightStage8ArtifactRoot(input('E:\\missing')).reason, 'stage8-artifact-root-missing'); assert.deepEqual(preflightStage8ArtifactRoot(input('E:\\stage8-artifacts')), { ok: true, artifactRoot: 'E:\\stage8-artifacts' });
  const derived = deriveStage8ForbiddenProjectRoots({ currentRoot: 'C:\\repo\\.worktrees\\candidate', gitFileContent: 'gitdir: C:/repo/.git/worktrees/candidate' });
  assert.deepEqual(derived, ['C:\\repo\\.worktrees\\candidate', 'C:\\repo']);
  assert.equal(preflightStage8ArtifactRoot(input('C:\\repo\\.worktrees\\sibling\\artifacts', { projectRoots: derived })).reason, 'stage8-artifact-root-project-tree-forbidden');
  assert.equal(preflightStage8ArtifactRoot(input('E:\\repo-alias', { resolvePath: (candidate) => candidate === 'E:\\repo-alias' ? 'C:\\repo\\artifacts' : candidate })).reason, 'stage8-artifact-root-project-tree-forbidden');
  assert.equal(preflightStage8ArtifactRoot(input('E:\\stage8-artifacts', { resolvePath: () => { throw new Error('resolution denied'); } })).reason, 'stage8-artifact-root-resolution-failed');
  console.log('stage8 artifact root preflight regression: passed');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
