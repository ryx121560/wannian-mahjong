import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { buildManifest } from './stage8-bc-sample-probe-control-regression.mjs';
import { runStage8BcSampleProbeCli } from './stage8-bc-sample-probe-runner.mjs';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-probe-cli-'));
const compiled = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-probe-cli-manifest-'));
const require = createRequire(import.meta.url);

function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) { fs.mkdirSync(to, { recursive: true }); compileTree(from, to); }
    else if (entry.name.endsWith('.ts')) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: from,
      }).outputText);
    }
  }
}

try {
  compileTree(path.join(root, 'src/game'), path.join(compiled, 'game'));
  const modules = {
    identity: require(path.join(compiled, 'game/stage8/offline-action-identity.js')),
    bc: require(path.join(compiled, 'game/stage8/offline-bc-control.js')),
    teacher: require(path.join(compiled, 'game/stage8/offline-bc-teacher.js')),
    sample: require(path.join(compiled, 'game/stage8/offline-bc-sample-protocol.js')),
    tensor: require(path.join(compiled, 'game/stage8/offline-onnx-tensor-contract.js')),
    writer: require(path.join(compiled, 'game/stage8/offline-bc-sample-writer.js')),
    artifact: require(path.join(compiled, 'game/stage8/offline-bc-artifact-control.js')),
    probe: require(path.join(compiled, 'game/stage8/offline-bc-sample-probe-control.js')),
  };
  const manifest = buildManifest(modules);
  const artifactRoot = path.join(temp, 'artifacts');
  fs.mkdirSync(artifactRoot);
  const controlPath = path.join(temp, 'probe-control.json');
  fs.writeFileSync(controlPath, JSON.stringify(manifest));
  const pythonPath = 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
  assert.equal(fs.existsSync(pythonPath), true, 'stdlib Python must exist for the read-only parse gate');

  let unauthorizedTemps = 0;
  const unauthorized = structuredClone(manifest);
  unauthorized.authorization.granted = false;
  const unauthorizedPayload = { ...unauthorized };
  delete unauthorizedPayload.manifestSha256;
  unauthorized.manifestSha256 = modules.probe.hashStage8BcSampleProbeControlPayload(unauthorizedPayload);
  const unauthorizedPath = path.join(temp, 'unauthorized.json');
  fs.writeFileSync(unauthorizedPath, JSON.stringify(unauthorized));
  const rejected = await runStage8BcSampleProbeCli({
    environment: {
      STAGE8_BC_PROBE_CONTROL_MANIFEST: unauthorizedPath,
      STAGE8_ARTIFACT_ROOT: artifactRoot,
      STAGE8_BC_PROBE_RUN_DIRECTORY: path.join(artifactRoot, 'rejected-run'),
      STAGE8_PYTHON: pythonPath,
    },
    createTemporaryDirectory: () => { unauthorizedTemps += 1; throw new Error('must-not-create-temp'); },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'bc-probe-control-authorization-required');
  assert.equal(unauthorizedTemps, 0);
  assert.equal(fs.existsSync(path.join(artifactRoot, 'rejected-run')), false);

  const finalRunDirectory = path.join(artifactRoot, 'candidate-temp-run');
  let pythonResult = null;
  const green = await runStage8BcSampleProbeCli({
    environment: {
      STAGE8_BC_PROBE_CONTROL_MANIFEST: controlPath,
      STAGE8_ARTIFACT_ROOT: artifactRoot,
      STAGE8_BC_PROBE_RUN_DIRECTORY: finalRunDirectory,
      STAGE8_PYTHON: pythonPath,
    },
    capacityPreflight: (_root, identitySha256, request) => ({
      ...request, ok: true, availableBytes: manifest.capacity.maxRunBytes * 2, identitySha256,
    }),
    resolveArtifactPath: (candidate) => path.resolve(candidate),
    verifyPython: (files) => {
      pythonResult = spawnSync(pythonPath, [path.join(root, 'scripts/stage8-bc-sample-probe-verify.py'), ...files], { encoding: 'utf8', windowsHide: true });
      return pythonResult;
    },
  });
  assert.equal(green.ok, true, green.ok ? '' : `${green.reason}: status=${pythonResult?.status}; error=${pythonResult?.error?.message || ''}; stderr=${pythonResult?.stderr || ''}; stdout=${pythonResult?.stdout || ''}`);
  assert.equal(green.artifactsWritten, 4);
  assert.equal(green.counters.batchCommits, 4);
  assert.equal(green.counters.finalCommits, 1);
  assert.equal(fs.existsSync(finalRunDirectory), true);
  assert.equal(fs.existsSync(`${finalRunDirectory}.partial-${manifest.identity.runId}`), false);
  const shards = fs.readdirSync(finalRunDirectory, { recursive: true }).filter((entry) => String(entry).endsWith('.json.gz'));
  assert.equal(shards.length, 4);
  assert.equal(fs.existsSync(path.join(finalRunDirectory, 'probe-ledger.json')), true);

  console.log(JSON.stringify({
    passed: true, unauthorizedPreflightTemporaryWrites: 0, temporaryFixtureGames: 4,
    nodeReadback: true, pythonStdlibReadback: true, pythonTorchImport: false,
    capacityChecksBeforeTemporaryCompile: true, batchCommits: 4, atomicRunCommit: true,
    eDriveWrites: 0, formalSamplesWritten: 0, formalSmokeGamesExecuted: 0,
    trainingStarted: false, modelLoaded: false, serviceStarted: false,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(compiled, { recursive: true, force: true });
}
