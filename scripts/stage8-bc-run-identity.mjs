import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);

function loadTypeScriptModuleReadOnly(entryPath) {
  const previous = require.extensions['.ts'];
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText, filename);
  try { return require(entryPath); } finally {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  }
}

function requiredFile(name, environment) {
  const value = environment[name];
  if (!value || !path.win32.isAbsolute(value) || !fs.existsSync(value) || !fs.statSync(value).isFile()) {
    throw new Error(`${name} must be an absolute existing file`);
  }
  return value;
}

function requiredDirectory(name, environment) {
  const value = environment[name];
  if (!value || !path.win32.isAbsolute(value) || !fs.existsSync(value) || !fs.statSync(value).isDirectory()) {
    throw new Error(`${name} must be an absolute existing directory`);
  }
  return value;
}

function normalize(value) {
  return path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function isDirectChild(value, parent) {
  return normalize(path.win32.dirname(path.win32.normalize(value))) === normalize(parent)
    && normalize(value) !== normalize(parent);
}

function inspectGitCheckout(checkoutRoot) {
  const run = (args) => spawnSync('git', ['-c', `safe.directory=${checkoutRoot.replace(/\\/g, '/')}`, ...args], {
    cwd: checkoutRoot, encoding: 'utf8', windowsHide: true,
  });
  const head = run(['rev-parse', 'HEAD']);
  const status = run(['status', '--porcelain=v1', '--untracked-files=all']);
  if (head.status !== 0 || status.status !== 0) throw new Error('bc-run-git-inspection-failed');
  return { sourceCommit: head.stdout.trim().toLowerCase(), clean: status.stdout.trim() === '' };
}

function fused(reason) {
  return { ok: false, status: 'fused', reason, filesWritten: 0 };
}

function parseJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export async function runStage8BcRunIdentityCli(options = {}) {
  const environment = options.environment ?? process.env;
  const args = options.args ?? process.argv.slice(2);
  const mode = args.length === 0 || (args.length === 1 && args[0] === '--check') ? 'check'
    : args.length === 1 && args[0] === '--emit' ? 'emit' : null;
  if (!mode) return fused('bc-run-identity-cli-arguments-invalid');
  const created = [];
  try {
    const authorizationPath = requiredFile('STAGE8_BC_RUN_AUTHORIZATION', environment);
    const authorization = (options.readAuthorization ?? parseJsonFile)(authorizationPath);
    const checkout = (options.inspectCheckout ?? inspectGitCheckout)(root);
    if (!checkout.clean) return fused('bc-run-checkout-not-clean');
    if (authorization?.sourceCommit?.toLowerCase() !== checkout.sourceCommit) return fused('bc-run-checkout-commit-mismatch');
    const identityTools = options.identityTools ?? loadTypeScriptModuleReadOnly(
      path.join(root, 'src/game/stage8/offline-bc-run-identity.ts'),
    );
    const readSourceFile = options.readSourceFile ?? ((relativePath) => fs.readFileSync(path.join(root, ...relativePath.split('/'))));
    const built = identityTools.createStage8BcRunIdentityMaterials({ authorization, readFile: readSourceFile });
    if (!built.ok) return fused(built.reason);
    const summary = {
      protocolVersion: built.value.source.protocolVersion,
      runId: built.value.corpusControl.identity.runId,
      sourceCommit: built.value.source.sourceCommit,
      sourceBundleSha256: built.value.source.sourceBundleSha256,
      sourceFiles: built.value.source.files,
      bcControlManifestSha256: built.value.bcControl.manifestSha256,
      artifactControlManifestSha256: built.value.artifactControl.manifestSha256,
      corpusControlManifestSha256: built.value.corpusControl.manifestSha256,
    };
    if (mode === 'check') return { ok: true, status: 'checked', filesWritten: 0, summary };
    if (environment.STAGE8_BC_RUN_IDENTITY_EMIT !== '1') return fused('bc-run-identity-emit-authorization-required');
    const artifactRoot = requiredDirectory('STAGE8_ARTIFACT_ROOT', environment);
    const controlDirectory = requiredDirectory('STAGE8_BC_CONTROL_DIRECTORY', environment);
    const rootTools = options.rootTools ?? loadTypeScriptModuleReadOnly(path.join(root, 'src/game/stage8/artifact-root-preflight.ts'));
    const gitFile = path.join(root, '.git');
    const rootValidation = rootTools.preflightStage8ArtifactRoot({
      environment: { STAGE8_ARTIFACT_ROOT: artifactRoot },
      projectRoots: rootTools.deriveStage8ForbiddenProjectRoots({
        currentRoot: root,
        gitFileContent: fs.existsSync(gitFile) && fs.statSync(gitFile).isFile() ? fs.readFileSync(gitFile, 'utf8') : undefined,
      }),
      exists: fs.existsSync,
      isDirectory: (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
      resolvePath: options.resolvePath ?? fs.realpathSync.native,
    });
    if (!rootValidation.ok) return fused(rootValidation.reason);
    const resolvedRoot = (options.resolvePath ?? fs.realpathSync.native)(artifactRoot);
    const resolvedControl = (options.resolvePath ?? fs.realpathSync.native)(controlDirectory);
    if (!isDirectChild(resolvedControl, resolvedRoot)
      || path.win32.basename(path.win32.normalize(resolvedControl)) !== `${identityTools.STAGE8_BC_FORMAL_RUN_ID}-control`
      || /\.partial(?:\.quarantine)?$/i.test(resolvedControl)
      || fs.lstatSync(controlDirectory).isSymbolicLink()
      || fs.readdirSync(controlDirectory).length !== 0) {
      return fused('bc-run-control-directory-invalid');
    }
    const artifactFinal = path.join(controlDirectory, 'artifact-control.json');
    const corpusFinal = path.join(controlDirectory, 'corpus-control.json');
    const artifactPartial = `${artifactFinal}.partial`;
    const corpusPartial = `${corpusFinal}.partial`;
    const cleanup = () => {
      for (const candidate of [artifactPartial,corpusPartial,artifactFinal,corpusFinal]) {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
    };
    try {
      fs.writeFileSync(artifactPartial, `${JSON.stringify(built.value.artifactControl)}\n`, { encoding: 'utf8', flag: 'wx' });
      created.push(artifactPartial);
      fs.writeFileSync(corpusPartial, `${JSON.stringify(built.value.corpusControl)}\n`, { encoding: 'utf8', flag: 'wx' });
      created.push(corpusPartial);
      const artifactRead = parseJsonFile(artifactPartial);
      const corpusRead = parseJsonFile(corpusPartial);
      const verified = identityTools.validateStage8BcRunIdentityMaterials({
        sourceCommit: checkout.sourceCommit,
        readFile: readSourceFile,
        artifactControl: artifactRead,
        corpusControl: corpusRead,
      });
      if (!verified.ok
        || fs.readFileSync(artifactPartial, 'utf8') !== `${JSON.stringify(built.value.artifactControl)}\n`
        || fs.readFileSync(corpusPartial, 'utf8') !== `${JSON.stringify(built.value.corpusControl)}\n`) {
        throw new Error(verified.ok ? 'bc-run-control-byte-roundtrip-invalid' : verified.reason);
      }
      fs.renameSync(artifactPartial, artifactFinal);
      fs.renameSync(corpusPartial, corpusFinal);
      const finalVerified = identityTools.validateStage8BcRunIdentityMaterials({
        sourceCommit: checkout.sourceCommit,
        readFile: readSourceFile,
        artifactControl: parseJsonFile(artifactFinal),
        corpusControl: parseJsonFile(corpusFinal),
      });
      if (!finalVerified.ok) throw new Error(finalVerified.reason);
    } catch (error) {
      cleanup();
      return fused(error instanceof Error ? error.message : String(error));
    }
    return {
      ok: true,
      status: 'emitted',
      filesWritten: 2,
      files: [artifactFinal, corpusFinal],
      summary,
    };
  } catch (error) {
    for (const candidate of created) {
      try { if (fs.existsSync(candidate)) fs.unlinkSync(candidate); } catch { /* fail closed below */ }
    }
    return fused(error instanceof Error ? error.message : String(error));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runStage8BcRunIdentityCli();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
