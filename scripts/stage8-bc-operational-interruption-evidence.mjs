import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function normalize(value) {
  return path.win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function isDirectChild(value, parent) {
  return path.win32.dirname(normalize(value)) === normalize(parent);
}

function fused(reason) {
  return { ok: false, status: 'fused', reason, filesWritten: 0, trainingStarted: false };
}

function assertNoReparseEntries(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('bc-operational-interruption-reparse-entry-forbidden');
    if (entry.isDirectory()) assertNoReparseEntries(path.join(directory, entry.name));
  }
}

export function inspectStage8BcOperationalInterruptionQuarantine(options = {}) {
  const artifactRoot = options.artifactRoot;
  const tools = options.evidenceTools ?? loadTypeScriptModuleReadOnly(
    path.join(root, 'src/game/stage8/offline-bc-operational-interruption.ts'),
  );
  const expected = options.expectedIdentity ?? tools.STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY;
  const quarantineDirectory = path.join(artifactRoot, expected.quarantineRelativePath);
  const finalDirectory = path.join(artifactRoot, expected.predecessorRunId);
  if (!fs.existsSync(quarantineDirectory) || !fs.statSync(quarantineDirectory).isDirectory()
    || fs.lstatSync(quarantineDirectory).isSymbolicLink()
    || !isDirectChild(quarantineDirectory, artifactRoot)
    || fs.existsSync(finalDirectory)) {
    return { ok: false, reason: 'bc-operational-interruption-quarantine-boundary-invalid' };
  }
  try { assertNoReparseEntries(quarantineDirectory); } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  const markerPath = path.join(quarantineDirectory, 'QUARANTINED.json');
  const batchesRoot = path.join(quarantineDirectory, 'batches');
  if (!fs.existsSync(markerPath) || !fs.statSync(markerPath).isFile()
    || !fs.existsSync(batchesRoot) || !fs.statSync(batchesRoot).isDirectory()
    || fs.readdirSync(quarantineDirectory).sort().join(',') !== 'QUARANTINED.json,batches') {
    return { ok: false, reason: 'bc-operational-interruption-quarantine-layout-invalid' };
  }
  let marker;
  let markerBytes;
  try {
    markerBytes = fs.readFileSync(markerPath);
    marker = JSON.parse(markerBytes.toString('utf8'));
  } catch {
    return { ok: false, reason: 'bc-operational-interruption-marker-read-failed' };
  }
  if (sha256(markerBytes) !== expected.markerSha256
    || marker?.status !== 'quarantined'
    || marker?.reason !== tools.STAGE8_BC_OPERATIONAL_INTERRUPTION_REASON
    || marker?.completedShardCount !== expected.completedShardCount
    || marker?.automaticRetries !== 0
    || marker?.seedOverrides !== 0) {
    return { ok: false, reason: 'bc-operational-interruption-marker-identity-mismatch' };
  }
  const batchNames = fs.readdirSync(batchesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^batch-\d{6}$/.test(entry.name))
    .map((entry) => entry.name).sort();
  if (batchNames.length !== expected.completedShardCount
    || batchNames.some((name, index) => name !== `batch-${String(index + 1).padStart(6, '0')}`)) {
    return { ok: false, reason: 'bc-operational-interruption-batch-sequence-invalid' };
  }
  const shards = [];
  let lastWriteTimeMs = 0;
  try {
    for (const batchName of batchNames) {
      const batchDirectory = path.join(batchesRoot, batchName);
      const names = fs.readdirSync(batchDirectory);
      const gzipNames = names.filter((name) => name.endsWith('.json.gz'));
      if (names.length !== 1 || gzipNames.length !== 1) throw new Error('batch-layout');
      const shardPath = path.join(batchDirectory, gzipNames[0]);
      const bytes = fs.readFileSync(shardPath);
      const envelope = JSON.parse(zlib.gunzipSync(bytes).toString('utf8'));
      if (!Array.isArray(envelope?.records) || envelope.records.length === 0) throw new Error('records');
      const stat = fs.statSync(shardPath);
      lastWriteTimeMs = Math.max(lastWriteTimeMs, stat.mtimeMs);
      shards.push({
        relativePath: path.relative(quarantineDirectory, shardPath).replace(/\\/g, '/'),
        bytes: bytes.length,
        records: envelope.records.length,
        sha256: sha256(bytes),
      });
    }
  } catch {
    return { ok: false, reason: 'bc-operational-interruption-shard-read-failed' };
  }
  const prohibited = ['corpus-manifest.json','corpus-manifest.pending.json','corpus-ledger.json'];
  if (prohibited.some((name) => fs.existsSync(path.join(quarantineDirectory, name)))) {
    return { ok: false, reason: 'bc-operational-interruption-committed-output-present' };
  }
  const identity = { ...expected, lastWriteTimeUtc: new Date(lastWriteTimeMs).toISOString() };
  const built = tools.createStage8BcOperationalInterruptionEvidence({ identity, shards });
  if (!built.ok) return built;
  return { ok: true, value: built.value };
}

export function verifyStage8BcOperationalInterruptionQuarantine(options = {}) {
  const tools = options.evidenceTools ?? loadTypeScriptModuleReadOnly(
    path.join(root, 'src/game/stage8/offline-bc-operational-interruption.ts'),
  );
  const validated = tools.validateStage8BcOperationalInterruptionEvidence(
    options.evidence,
    options.expectedIdentity ?? tools.STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY,
  );
  if (!validated.ok) return validated;
  const observed = inspectStage8BcOperationalInterruptionQuarantine({ ...options, evidenceTools: tools });
  if (!observed.ok) return observed;
  if (observed.value.evidenceSha256 !== options.evidence.evidenceSha256
    || JSON.stringify(observed.value) !== JSON.stringify(options.evidence)) {
    return { ok: false, reason: 'bc-operational-interruption-quarantine-drift' };
  }
  return { ok: true, value: { evidenceSha256: observed.value.evidenceSha256 } };
}

export async function runStage8BcOperationalInterruptionEvidenceCli(options = {}) {
  const environment = options.environment ?? process.env;
  const args = options.args ?? process.argv.slice(2);
  const mode = args.length === 0 || (args.length === 1 && args[0] === '--check') ? 'check'
    : args.length === 1 && args[0] === '--emit' ? 'emit' : null;
  if (!mode) return fused('bc-operational-interruption-cli-arguments-invalid');
  let partialPath = null;
  try {
    const artifactRoot = requiredDirectory('STAGE8_ARTIFACT_ROOT', environment);
    const artifactControlPath = requiredFile('STAGE8_BC_PREDECESSOR_ARTIFACT_CONTROL_MANIFEST', environment);
    const corpusControlPath = requiredFile('STAGE8_BC_PREDECESSOR_CORPUS_CONTROL_MANIFEST', environment);
    const authorizationPath = requiredFile('STAGE8_BC_PREDECESSOR_RUN_AUTHORIZATION', environment);
    const tools = options.evidenceTools ?? loadTypeScriptModuleReadOnly(
      path.join(root, 'src/game/stage8/offline-bc-operational-interruption.ts'),
    );
    const rootTools = options.rootTools ?? loadTypeScriptModuleReadOnly(
      path.join(root, 'src/game/stage8/artifact-root-preflight.ts'),
    );
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
    const expected = options.expectedIdentity ?? tools.STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY;
    if (sha256(fs.readFileSync(artifactControlPath)) !== expected.artifactControlFileSha256
      || sha256(fs.readFileSync(corpusControlPath)) !== expected.corpusControlFileSha256
      || sha256(fs.readFileSync(authorizationPath)) !== expected.authorizationFileSha256) {
      return fused('bc-operational-interruption-predecessor-file-identity-mismatch');
    }
    const inspected = inspectStage8BcOperationalInterruptionQuarantine({
      artifactRoot,
      expectedIdentity: expected,
      evidenceTools: tools,
    });
    if (!inspected.ok) return fused(inspected.reason);
    const summary = {
      predecessorRunId: inspected.value.predecessorRunId,
      evidenceSha256: inspected.value.evidenceSha256,
      completedShardCount: inspected.value.quarantine.completedShardCount,
      totalRecords: inspected.value.quarantine.totalRecords,
      totalBytes: inspected.value.quarantine.totalBytes,
      shardAggregateSha256: inspected.value.quarantine.shardAggregateSha256,
      diagnosticOnly: true,
      formalPilotGamesCredited: 0,
    };
    if (mode === 'check') return { ok: true, status: 'checked', filesWritten: 0, summary };
    if (environment.STAGE8_BC_OPERATIONAL_EVIDENCE_EMIT !== '1') {
      return fused('bc-operational-interruption-emit-authorization-required');
    }
    const emitAuthorizationPath = requiredFile('STAGE8_BC_OPERATIONAL_EVIDENCE_EMIT_AUTHORIZATION', environment);
    const emitAuthorization = JSON.parse(fs.readFileSync(emitAuthorizationPath, 'utf8'));
    const authorized = tools.validateStage8BcOperationalInterruptionEmitAuthorization(
      emitAuthorization,
      inspected.value.evidenceSha256,
    );
    if (!authorized.ok) return fused(authorized.reason);
    const outputPath = environment.STAGE8_BC_OPERATIONAL_EVIDENCE_OUTPUT;
    const expectedName = `${expected.predecessorRunId}-operational-interruption-evidence.json`;
    if (!outputPath || !path.win32.isAbsolute(outputPath)
      || !isDirectChild(outputPath, artifactRoot)
      || path.win32.basename(outputPath) !== expectedName
      || fs.existsSync(outputPath) || fs.existsSync(`${outputPath}.partial`)) {
      return fused('bc-operational-interruption-output-path-invalid');
    }
    partialPath = `${outputPath}.partial`;
    const expectedBytes = Buffer.from(`${JSON.stringify(inspected.value)}\n`, 'utf8');
    fs.writeFileSync(partialPath, expectedBytes, { flag: 'wx' });
    if (!fs.readFileSync(partialPath).equals(expectedBytes)) throw new Error('bc-operational-interruption-byte-roundtrip-invalid');
    fs.renameSync(partialPath, outputPath);
    partialPath = null;
    const finalEvidence = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const finalValidation = tools.validateStage8BcOperationalInterruptionEvidence(finalEvidence, expected);
    if (!finalValidation.ok || finalValidation.value.evidenceSha256 !== inspected.value.evidenceSha256) {
      throw new Error(finalValidation.ok ? 'bc-operational-interruption-final-drift' : finalValidation.reason);
    }
    return { ok: true, status: 'emitted', filesWritten: 1, file: outputPath, summary };
  } catch (error) {
    if (partialPath) {
      try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch { /* Fail closed. */ }
    }
    return fused(error instanceof Error ? error.message : String(error));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runStage8BcOperationalInterruptionEvidenceCli();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
