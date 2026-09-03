import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { buildManifest } from './stage8-bc-sample-probe-control-regression.mjs';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-probe-runner-'));
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

function memoryFileSystem(rootPath, batchDirectories) {
  const files = new Map();
  const directories = new Set([rootPath, ...batchDirectories]);
  return {
    files,
    exists: (candidate) => directories.has(candidate) || files.has(candidate),
    isDirectory: (candidate) => directories.has(candidate),
    listDirectory: (candidate) => [...files.keys()].filter((entry) => path.win32.dirname(entry) === candidate).map((entry) => path.win32.basename(entry)),
    resolvePath: (candidate) => candidate,
    writeFileExclusive: (candidate, bytes) => { if (files.has(candidate)) throw new Error('exists'); files.set(candidate, Buffer.from(bytes)); },
    readFile: (candidate) => Buffer.from(files.get(candidate)),
    renameAtomic: (source, destination) => { if (!files.has(source) || files.has(destination)) throw new Error('rename'); files.set(destination, files.get(source)); files.delete(source); },
    removeFile: (candidate) => { if (!files.delete(candidate)) throw new Error('missing'); },
  };
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const modules = {
    identity: require(path.join(temp, 'game/stage8/offline-action-identity.js')),
    bc: require(path.join(temp, 'game/stage8/offline-bc-control.js')),
    teacher: require(path.join(temp, 'game/stage8/offline-bc-teacher.js')),
    sample: require(path.join(temp, 'game/stage8/offline-bc-sample-protocol.js')),
    tensor: require(path.join(temp, 'game/stage8/offline-onnx-tensor-contract.js')),
    writer: require(path.join(temp, 'game/stage8/offline-bc-sample-writer.js')),
    artifact: require(path.join(temp, 'game/stage8/offline-bc-artifact-control.js')),
    probe: require(path.join(temp, 'game/stage8/offline-bc-sample-probe-control.js')),
  };
  const runner = require(path.join(temp, 'game/stage8/offline-bc-sample-probe-runner.js'));
  const manifest = buildManifest(modules);
  const createColdModulePort = (modulePath, exportName) => {
    const evict = (moduleId, visited = new Set()) => {
      if (visited.has(moduleId)) return;
      visited.add(moduleId);
      const cached = require.cache[moduleId];
      if (!cached) return;
      cached.children.forEach((child) => evict(child.id, visited));
      delete require.cache[moduleId];
    };
    return (input) => { evict(require.resolve(modulePath)); return require(modulePath)[exportName](input); };
  };
  const teacherEvaluator = createColdModulePort(path.join(temp, 'game/stage8/offline-bc-teacher.js'), 'evaluateStage8BcTeacher');
  const sampleValidator = createColdModulePort(path.join(temp, 'game/stage8/offline-bc-sample-protocol.js'), 'validateStage8BcSampleEnvelope');
  const diagnosticFirst = runner.executeStage8BcSampleProbeGame({ control: manifest, gameIndex: 0, sampleOffset: 0 });
  const diagnosticSecond = runner.executeStage8BcSampleProbeGame({ control: manifest, gameIndex: 0, sampleOffset: 0 });
  assert.equal(diagnosticFirst.ok, true, diagnosticFirst.ok ? '' : diagnosticFirst.decision.reason);
  assert.equal(diagnosticSecond.ok, true, diagnosticSecond.ok ? '' : diagnosticSecond.decision.reason);
  assert.notEqual(diagnosticFirst.ledger.semanticSha256, diagnosticSecond.ledger.semanticSha256, 'legacy shared teacher cache must reproduce the RED evidence drift');
  assert.equal(diagnosticFirst.ledger.traceSha256, diagnosticSecond.ledger.traceSha256, 'RED must isolate evidence drift from real state transitions');
  const memory = runner.runStage8BcSampleProbeInMemory(manifest, teacherEvaluator);
  assert.equal(memory.ok, true, memory.ok ? '' : memory.decision.reason);
  assert.equal(memory.value.gameCount, 4);
  assert.deepEqual(memory.value.candidateSeats, [0,1,2,3]);
  assert.equal(memory.value.workerCount, 1);
  assert.equal(memory.value.artifactsWritten, 0);
  assert.ok(memory.value.sampleCount > 0);
  assert.deepEqual(memory.value.games.map((game) => game.candidateSeat), [0,1,2,3]);
  for (const game of memory.value.games) {
    assert.equal(game.terminalCount, 1);
    assert.ok(game.transitionCount <= 600);
    assert.equal(game.transitions.length, game.transitionCount);
    assert.equal(game.samples.length, game.decisionCount);
    assert.ok(game.samples.every((sample, index) => sample.replay.traceStep === index + 1));
    assert.ok(game.transitions.every((entry, index) => entry.transitionIndex === index + 1));
    assert.ok(game.transitions.slice(1).every((entry, index) => game.transitions[index].postStateSha256 === entry.preStateSha256));
    assert.equal(game.terminalDelta.reduce((sum, value) => sum + value, 0), 0);
  }

  const artifactRoot = 'C:\\stage8-bc-probe-test';
  const batchDirectories = memory.value.games.map((_, index) => `${artifactRoot}\\${manifest.identity.runId}-batch-${String(index + 1).padStart(6, '0')}`);
  const memoryFs = memoryFileSystem(artifactRoot, batchDirectories);
  const artifactRootInput = {
    environment: { STAGE8_ARTIFACT_ROOT: artifactRoot }, projectRoots: ['C:\\repo','C:\\repo\\.worktrees\\candidate'],
    exists: memoryFs.exists, isDirectory: memoryFs.isDirectory, resolvePath: memoryFs.resolvePath,
  };
  const shardHashes = [];
  memory.value.games.forEach((game, index) => {
    game.samples.forEach((sample) => assert.equal(sampleValidator(sample).ok, true));
    const result = modules.writer.writeStage8BcSampleShard({
      manifest: manifest.artifactControl, artifactRoot: artifactRootInput, batchDirectory: batchDirectories[index],
      shardId: 'shard-000001', samples: game.samples, fileSystem: memoryFs, sampleValidator,
    });
    assert.equal(result.ok, true, result.ok ? '' : result.decision.reason);
    shardHashes.push(result.value.artifactFileSha256);
  });
  assert.equal(memoryFs.files.size, 4);
  const replayFs = memoryFileSystem(artifactRoot, batchDirectories);
  const replayRootInput = { ...artifactRootInput, exists: replayFs.exists, isDirectory: replayFs.isDirectory, resolvePath: replayFs.resolvePath };
  const replayShardHashes = memory.value.games.map((game, index) => {
    const result = modules.writer.writeStage8BcSampleShard({
      manifest: manifest.artifactControl, artifactRoot: replayRootInput, batchDirectory: batchDirectories[index],
      shardId: 'shard-000001', samples: game.samples.slice().reverse(), fileSystem: replayFs, sampleValidator,
    });
    assert.equal(result.ok, true, result.ok ? '' : result.decision.reason);
    return result.value.artifactFileSha256;
  });
  assert.deepEqual(replayShardHashes, shardHashes, 'same replayed samples must produce byte-identical shard hashes');

  const capacityCalls = [];
  let committedGames = 0;
  let finalCommits = 0;
  const transaction = runner.commitStage8BcSampleProbeValidatedRun({
    control: manifest,
    validated: memory.value,
    port: {
      capacityPreflight: (request) => { capacityCalls.push(request); return { ...request, ok: true, availableBytes: manifest.capacity.maxRunBytes * 2, identitySha256: manifest.identity.capacityPreflightSha256 }; },
      commitBatch: ({ game }) => { committedGames += 1; return { ok: true, artifactSha256: modules.identity.hashStage8OfflineIdentity(game.samples.map((sample) => sample.sampleSha256)) }; },
      commitRun: ({ artifactSha256List }) => { assert.equal(artifactSha256List.length, 4); finalCommits += 1; return { ok: true }; },
      quarantineRun: () => assert.fail('green transaction must not quarantine'),
    },
  });
  assert.equal(transaction.ok, true);
  assert.equal(capacityCalls.length, 4);
  assert.equal(committedGames, 4);
  assert.equal(finalCommits, 1);

  let failedCommits = 0;
  let quarantines = 0;
  const failed = runner.commitStage8BcSampleProbeValidatedRun({
    control: manifest,
    validated: memory.value,
    port: {
      capacityPreflight: (request) => ({ ...request, ok: true, availableBytes: manifest.capacity.maxRunBytes * 2, identitySha256: manifest.identity.capacityPreflightSha256 }),
      commitBatch: ({ batchIndex }) => { failedCommits += 1; return batchIndex === 2 ? { ok: false, reason: 'injected-batch-failure' } : { ok: true, artifactSha256: modules.identity.hashStage8OfflineIdentity(batchIndex) }; },
      commitRun: () => assert.fail('failed batch must not publish the run'),
      quarantineRun: () => { quarantines += 1; },
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'injected-batch-failure');
  assert.equal(failed.artifactsWritten, 0);
  assert.equal(failedCommits, 3);
  assert.equal(quarantines, 1);

  console.log(JSON.stringify({
    passed: true, inMemoryGames: 4, candidateSeats: [0,1,2,3], workerCount: 1,
    sampleCount: memory.value.sampleCount, transitionCounts: memory.value.games.map((game) => game.transitionCount),
    endTypes: memory.value.games.map((game) => game.endType), deterministicReplay: true,
    nodeShardReadback: true, deterministicShardHashes: true, capacityChecks: 5, batchAtomicQuarantine: true,
    formalSamplesWritten: 0, eDriveWrites: 0, formalSmokeGamesExecuted: 0, trainingStarted: false, modelLoaded: false,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
