import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { runStage8BcRunIdentityCli } from './stage8-bc-run-identity.mjs';
import {
  inspectStage8BcOperationalInterruptionQuarantine,
  runStage8BcOperationalInterruptionEvidenceCli,
} from './stage8-bc-operational-interruption-evidence.mjs';

const root = process.cwd();
const require = createRequire(import.meta.url);
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

try {
  const identity = require('../src/game/stage8/offline-bc-run-identity.ts');
  const evidenceTools = require('../src/game/stage8/offline-bc-operational-interruption.ts');
  const artifactTools = require('../src/game/stage8/offline-bc-artifact-control.ts');
  const corpusTools = require('../src/game/stage8/offline-bc-corpus-control.ts');
  const sourceCommit = 'c'.repeat(40);
  assert.equal(identity.STAGE8_BC_FORMAL_RUN_ID, 'formal-bc-corpus-pilot-20260913');
  assert.equal(evidenceTools.STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY.completedShardCount, 32);
  assert.equal(evidenceTools.STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY.totalRecords, 5179);
  assert.equal(evidenceTools.STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY.totalBytes, 13344052);
  assert.equal(evidenceTools.STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY.shardAggregateSha256,
    'b970f3e31146c04979a84d247c1a420beac7c3e1e0280a48be636990ae3f8660');

  function createIncidentFixture(parent) {
    const artifactRoot = path.join(parent, 'artifacts');
    const quarantine = path.join(artifactRoot, evidenceTools.STAGE8_BC_PREDECESSOR_QUARANTINE_RELATIVE_PATH);
    const batches = path.join(quarantine, 'batches');
    fs.mkdirSync(batches, { recursive: true });
    const fixedTime = new Date('2026-09-11T02:49:24.000Z');
    const shards = [];
    for (let index = 0; index < 2; index += 1) {
      const serial = String(index + 1).padStart(6, '0');
      const batchDirectory = path.join(batches, `batch-${serial}`);
      fs.mkdirSync(batchDirectory);
      const records = Array.from({ length: index + 2 }, (_, recordIndex) => ({ id: `${serial}-${recordIndex}` }));
      const bytes = zlib.gzipSync(Buffer.from(JSON.stringify({ protocolVersion: 'fixture-v1', records }), 'utf8'));
      const shardPath = path.join(batchDirectory, `fixture-${serial}.json.gz`);
      fs.writeFileSync(shardPath, bytes);
      fs.utimesSync(shardPath, fixedTime, fixedTime);
      shards.push({
        relativePath: path.relative(quarantine, shardPath).replace(/\\/g, '/'),
        bytes: bytes.length,
        records: records.length,
        sha256: sha256(bytes),
      });
    }
    const markerBytes = Buffer.from(`${JSON.stringify({
      status: 'quarantined',
      reason: evidenceTools.STAGE8_BC_OPERATIONAL_INTERRUPTION_REASON,
      completedShardCount: 2,
      automaticRetries: 0,
      seedOverrides: 0,
    })}\n`, 'utf8');
    fs.writeFileSync(path.join(quarantine, 'QUARANTINED.json'), markerBytes);
    const artifactControlBytes = Buffer.from('{"fixture":"artifact-control"}\n');
    const corpusControlBytes = Buffer.from('{"fixture":"corpus-control"}\n');
    const predecessorAuthorizationBytes = Buffer.from('{"fixture":"authorization"}\n');
    const artifactControlPath = path.join(parent, 'predecessor-artifact-control.json');
    const corpusControlPath = path.join(parent, 'predecessor-corpus-control.json');
    const predecessorAuthorizationPath = path.join(parent, 'predecessor-authorization.json');
    fs.writeFileSync(artifactControlPath, artifactControlBytes);
    fs.writeFileSync(corpusControlPath, corpusControlBytes);
    fs.writeFileSync(predecessorAuthorizationPath, predecessorAuthorizationBytes);
    const expectedIdentity = {
      predecessorRunId: evidenceTools.STAGE8_BC_PREDECESSOR_RUN_ID,
      sourceCommit: evidenceTools.STAGE8_BC_FORMAL_INTERRUPTION_IDENTITY.sourceCommit,
      sourceBundleSha256: sha256('fixture-source-bundle'),
      artifactControlFileSha256: sha256(artifactControlBytes),
      corpusControlFileSha256: sha256(corpusControlBytes),
      authorizationFileSha256: sha256(predecessorAuthorizationBytes),
      quarantineRelativePath: evidenceTools.STAGE8_BC_PREDECESSOR_QUARANTINE_RELATIVE_PATH,
      markerSha256: sha256(markerBytes),
      completedShardCount: 2,
      totalRecords: shards.reduce((sum, shard) => sum + shard.records, 0),
      totalBytes: shards.reduce((sum, shard) => sum + shard.bytes, 0),
      lastWriteTimeUtc: fixedTime.toISOString(),
      shardAggregateSha256: evidenceTools.hashStage8BcOperationalInterruptionShardAggregate(shards),
    };
    const inspected = inspectStage8BcOperationalInterruptionQuarantine({ artifactRoot, expectedIdentity, evidenceTools });
    assert.equal(inspected.ok, true, inspected.reason);
    return {
      artifactRoot,
      expectedIdentity,
      evidence: inspected.value,
      artifactControlPath,
      corpusControlPath,
      predecessorAuthorizationPath,
    };
  }

  function resignEvidence(evidence) {
    const payload = structuredClone(evidence);
    delete payload.evidenceSha256;
    return { ...payload, evidenceSha256: evidenceTools.hashStage8BcOperationalInterruptionEvidencePayload(payload) };
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-bc-run-identity-v2-'));
  try {
    const incident = createIncidentFixture(temporary);
    const evidencePath = path.join(temporary, 'predecessor-evidence.json');
    fs.writeFileSync(evidencePath, `${JSON.stringify(incident.evidence)}\n`);
    const evidenceEnvironment = {
      STAGE8_ARTIFACT_ROOT: incident.artifactRoot,
      STAGE8_BC_PREDECESSOR_ARTIFACT_CONTROL_MANIFEST: incident.artifactControlPath,
      STAGE8_BC_PREDECESSOR_CORPUS_CONTROL_MANIFEST: incident.corpusControlPath,
      STAGE8_BC_PREDECESSOR_RUN_AUTHORIZATION: incident.predecessorAuthorizationPath,
    };
    const checkedEvidence = await runStage8BcOperationalInterruptionEvidenceCli({
      environment: evidenceEnvironment,
      args: ['--check'],
      evidenceTools,
      expectedIdentity: incident.expectedIdentity,
    });
    assert.equal(checkedEvidence.ok, true, checkedEvidence.reason);
    assert.equal(checkedEvidence.filesWritten, 0);
    const deniedEvidence = await runStage8BcOperationalInterruptionEvidenceCli({
      environment: evidenceEnvironment,
      args: ['--emit'],
      evidenceTools,
      expectedIdentity: incident.expectedIdentity,
    });
    assert.equal(deniedEvidence.reason, 'bc-operational-interruption-emit-authorization-required');
    const emitPayload = {
      protocolVersion: evidenceTools.STAGE8_BC_OPERATIONAL_INTERRUPTION_EMIT_AUTHORIZATION_VERSION,
      predecessorRunId: evidenceTools.STAGE8_BC_PREDECESSOR_RUN_ID,
      evidenceSha256: incident.evidence.evidenceSha256,
      approvalId: 'product-operational-evidence-fixture',
      granted: true,
      scope: evidenceTools.STAGE8_BC_OPERATIONAL_INTERRUPTION_EMIT_SCOPE,
    };
    const emitAuthorization = {
      ...emitPayload,
      authorizationSha256: evidenceTools.hashStage8BcOperationalInterruptionEmitAuthorization(emitPayload),
    };
    const emitAuthorizationPath = path.join(temporary, 'evidence-emit-authorization.json');
    fs.writeFileSync(emitAuthorizationPath, JSON.stringify(emitAuthorization));
    const emittedEvidencePath = path.join(
      incident.artifactRoot,
      `${evidenceTools.STAGE8_BC_PREDECESSOR_RUN_ID}-operational-interruption-evidence.json`,
    );
    const emittedEvidence = await runStage8BcOperationalInterruptionEvidenceCli({
      environment: {
        ...evidenceEnvironment,
        STAGE8_BC_OPERATIONAL_EVIDENCE_EMIT: '1',
        STAGE8_BC_OPERATIONAL_EVIDENCE_EMIT_AUTHORIZATION: emitAuthorizationPath,
        STAGE8_BC_OPERATIONAL_EVIDENCE_OUTPUT: emittedEvidencePath,
      },
      args: ['--emit'],
      evidenceTools,
      expectedIdentity: incident.expectedIdentity,
    });
    assert.equal(emittedEvidence.ok, true, emittedEvidence.reason);
    assert.equal(emittedEvidence.filesWritten, 1);
    assert.equal(fs.existsSync(`${emittedEvidencePath}.partial`), false);
    assert.equal(fs.readFileSync(emittedEvidencePath, 'utf8'), `${JSON.stringify(incident.evidence)}\n`);

    const copiedRoot = path.join(temporary, 'second-root');
    fs.cpSync(incident.artifactRoot, copiedRoot, { recursive: true });
    for (const batchName of fs.readdirSync(path.join(copiedRoot, incident.expectedIdentity.quarantineRelativePath, 'batches'))) {
      const batchDirectory = path.join(copiedRoot, incident.expectedIdentity.quarantineRelativePath, 'batches', batchName);
      for (const name of fs.readdirSync(batchDirectory)) {
        fs.utimesSync(path.join(batchDirectory, name), new Date(incident.expectedIdentity.lastWriteTimeUtc), new Date(incident.expectedIdentity.lastWriteTimeUtc));
      }
    }
    const copied = inspectStage8BcOperationalInterruptionQuarantine({
      artifactRoot: copiedRoot,
      expectedIdentity: incident.expectedIdentity,
      evidenceTools,
    });
    assert.equal(copied.ok, true, copied.reason);
    assert.equal(copied.value.evidenceSha256, incident.evidence.evidenceSha256, 'absolute roots must not affect evidence identity');

    for (const mutate of [
      (value) => { value.interruption.reason = 'other-reason'; },
      (value) => { value.quarantine.completedShardCount = 3; },
      (value) => { value.quarantine.totalRecords += 1; },
      (value) => { value.quarantine.totalBytes += 1; },
      (value) => { value.quarantine.markerSha256 = '1'.repeat(64); },
      (value) => { value.quarantine.shardAggregateSha256 = '2'.repeat(64); },
      (value) => { value.quarantine.shards[0].sha256 = '3'.repeat(64); },
      (value) => { value.quarantine.shards[0].relativePath = 'C:/absolute/shard.json.gz'; },
    ]) {
      const tampered = structuredClone(incident.evidence);
      mutate(tampered);
      assert.equal(evidenceTools.validateStage8BcOperationalInterruptionEvidence(
        resignEvidence(tampered),
        incident.expectedIdentity,
      ).ok, false, 'self-consistent interruption evidence tamper must fail');
    }

    const approvalPayload = {
      protocolVersion: identity.STAGE8_BC_RUN_AUTHORIZATION_VERSION,
      runId: identity.STAGE8_BC_FORMAL_RUN_ID,
      sourceCommit,
      predecessor: {
        runId: evidenceTools.STAGE8_BC_PREDECESSOR_RUN_ID,
        evidenceSha256: incident.evidence.evidenceSha256,
      },
      approvals: {
        bc: { approvalId: 'product-bc-control-20260913', granted: true, scope: 'bc-teacher-protocol-preflight' },
        artifact: { approvalId: 'product-bc-artifact-20260913', granted: true, scope: 'bc-sample-artifact-write' },
        corpus: { approvalId: 'product-bc-corpus-20260913', granted: true, scope: 'bc-formal-corpus-pilot' },
        emit: { approvalId: 'product-bc-material-emit-20260913', granted: true, scope: identity.STAGE8_BC_RUN_IDENTITY_EMIT_SCOPE },
        supervision: { approvalId: 'product-bc-supervision-20260914', granted: true, scope: 'bc-formal-pilot-supervision' },
      },
    };
    const authorization = {
      ...approvalPayload,
      authorizationSha256: identity.hashStage8BcRunAuthorizationInput(approvalPayload),
    };
    const sourceBytes = new Map(identity.STAGE8_BC_RUN_SOURCE_FILES.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(root, ...relativePath.split('/'))),
    ]));
    const reader = (relativePath) => Buffer.from(sourceBytes.get(relativePath));
    const built = identity.createStage8BcRunIdentityMaterials({
      authorization,
      predecessorEvidence: incident.evidence,
      expectedPredecessorIdentity: incident.expectedIdentity,
      readFile: reader,
    });
    assert.equal(built.ok, true, built.reason);
    assert.equal(built.value.artifactControl.protocolVersion, artifactTools.STAGE8_BC_ARTIFACT_CONTROL_PREDECESSOR_VERSION);
    assert.equal(built.value.corpusControl.protocolVersion, corpusTools.STAGE8_BC_CORPUS_CONTROL_SUPERVISED_VERSION);
    assert.equal(built.value.artifactControl.identity.predecessorEvidenceSha256, incident.evidence.evidenceSha256);
    assert.equal(built.value.corpusControl.identity.runAuthorizationSha256, authorization.authorizationSha256);
    assert.equal(identity.validateStage8BcRunIdentityMaterials({
      sourceCommit, readFile: reader, authorization, predecessorEvidence: incident.evidence,
      expectedPredecessorIdentity: incident.expectedIdentity,
      artifactControl: built.value.artifactControl, corpusControl: built.value.corpusControl,
      supervisionControl: built.value.supervisionControl,
    }).ok, true);

    const legacyArtifactPayload = structuredClone(built.value.artifactControl);
    delete legacyArtifactPayload.manifestSha256;
    legacyArtifactPayload.protocolVersion = artifactTools.STAGE8_BC_ARTIFACT_CONTROL_VERSION;
    delete legacyArtifactPayload.identity.predecessorRunId;
    delete legacyArtifactPayload.identity.predecessorEvidenceSha256;
    delete legacyArtifactPayload.identity.runAuthorizationSha256;
    const legacyArtifact = {
      ...legacyArtifactPayload,
      manifestSha256: artifactTools.hashStage8BcArtifactControlManifestPayload(legacyArtifactPayload),
    };
    const legacyCorpusPayload = structuredClone(built.value.corpusControl);
    delete legacyCorpusPayload.manifestSha256;
    legacyCorpusPayload.protocolVersion = corpusTools.STAGE8_BC_CORPUS_CONTROL_VERSION;
    legacyCorpusPayload.identity.artifactControlManifestSha256 = legacyArtifact.manifestSha256;
    delete legacyCorpusPayload.identity.predecessorRunId;
    delete legacyCorpusPayload.identity.predecessorEvidenceSha256;
    delete legacyCorpusPayload.identity.runAuthorizationSha256;
    delete legacyCorpusPayload.identity.supervisionDefinitionSha256;
    delete legacyCorpusPayload.plan.supervisedExecutionRequired;
    delete legacyCorpusPayload.plan.priorOperationalInterruptions;
    delete legacyCorpusPayload.plan.maxOperationalInterruptions;
    delete legacyCorpusPayload.plan.automaticRetries;
    delete legacyCorpusPayload.plan.seedOverrides;
    const legacyCorpus = {
      ...legacyCorpusPayload,
      manifestSha256: corpusTools.hashStage8BcCorpusControlPayload(legacyCorpusPayload),
    };
    assert.equal(artifactTools.validateStage8BcArtifactControlManifest(legacyArtifact).ok, true);
    assert.equal(corpusTools.validateStage8BcCorpusControlManifest(legacyCorpus).ok, true);
    assert.equal(identity.validateStage8BcRunIdentityMaterials({
      sourceCommit, readFile: reader, authorization, predecessorEvidence: incident.evidence,
      expectedPredecessorIdentity: incident.expectedIdentity,
      artifactControl: legacyArtifact, corpusControl: legacyCorpus,
      supervisionControl: built.value.supervisionControl,
    }).reason, 'bc-run-source-or-control-identity-mismatch', 'legacy controls remain verifiable but cannot authorize the new run');

    const oldAuthorization = structuredClone(authorization);
    oldAuthorization.protocolVersion = 'stage8-bc-run-authorization-v1';
    delete oldAuthorization.predecessor;
    assert.equal(identity.createStage8BcRunIdentityMaterials({
      authorization: oldAuthorization, predecessorEvidence: incident.evidence,
      expectedPredecessorIdentity: incident.expectedIdentity, readFile: reader,
    }).reason, 'bc-run-authorization-schema-invalid');
    const wrongEvidencePayload = structuredClone(approvalPayload);
    wrongEvidencePayload.predecessor.evidenceSha256 = 'f'.repeat(64);
    const wrongEvidenceAuthorization = {
      ...wrongEvidencePayload,
      authorizationSha256: identity.hashStage8BcRunAuthorizationInput(wrongEvidencePayload),
    };
    assert.equal(identity.createStage8BcRunIdentityMaterials({
      authorization: wrongEvidenceAuthorization, predecessorEvidence: incident.evidence,
      expectedPredecessorIdentity: incident.expectedIdentity, readFile: reader,
    }).reason, 'bc-run-authorization-predecessor-evidence-mismatch');

    for (const tamperedPath of identity.STAGE8_BC_RUN_SOURCE_FILES) {
      const tamperedReader = (relativePath) => relativePath === tamperedPath
        ? Buffer.concat([Buffer.from(sourceBytes.get(relativePath)), Buffer.from('\nTAMPERED')])
        : reader(relativePath);
      assert.equal(identity.validateStage8BcRunIdentityMaterials({
        sourceCommit, readFile: tamperedReader, authorization, predecessorEvidence: incident.evidence,
        expectedPredecessorIdentity: incident.expectedIdentity,
        artifactControl: built.value.artifactControl, corpusControl: built.value.corpusControl,
        supervisionControl: built.value.supervisionControl,
      }).reason, 'bc-run-source-or-control-identity-mismatch', `source byte drift must fail: ${tamperedPath}`);
    }

    const authorizationPath = path.join(temporary, 'new-run-authorization.json');
    fs.writeFileSync(authorizationPath, JSON.stringify(authorization));
    const controlDirectory = path.join(incident.artifactRoot, `${identity.STAGE8_BC_FORMAL_RUN_ID}-control`);
    fs.mkdirSync(controlDirectory);
    const baseEnvironment = {
      STAGE8_BC_RUN_AUTHORIZATION: authorizationPath,
      STAGE8_BC_PREDECESSOR_EVIDENCE: evidencePath,
      STAGE8_ARTIFACT_ROOT: incident.artifactRoot,
      STAGE8_BC_CONTROL_DIRECTORY: controlDirectory,
    };
    const injected = {
      environment: baseEnvironment,
      inspectCheckout: () => ({ sourceCommit, clean: true }),
      readSourceFile: reader,
      expectedPredecessorIdentity: incident.expectedIdentity,
    };
    const checked = await runStage8BcRunIdentityCli({ ...injected, args: ['--check'] });
    assert.equal(checked.ok, true, checked.reason);
    assert.equal(checked.filesWritten, 0);
    assert.equal(fs.readdirSync(controlDirectory).length, 0);
    const emitDenied = await runStage8BcRunIdentityCli({ ...injected, args: ['--emit'] });
    assert.equal(emitDenied.reason, 'bc-run-identity-emit-authorization-required');
    const emitted = await runStage8BcRunIdentityCli({
      ...injected,
      args: ['--emit'],
      environment: { ...baseEnvironment, STAGE8_BC_RUN_IDENTITY_EMIT: '1' },
    });
    assert.equal(emitted.ok, true, emitted.reason);
    assert.equal(emitted.filesWritten, 3);
    assert.deepEqual(fs.readdirSync(controlDirectory).sort(), ['artifact-control.json','corpus-control.json','supervision-control.json']);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    passed: true,
    runId: identity.STAGE8_BC_FORMAL_RUN_ID,
    predecessorRunId: evidenceTools.STAGE8_BC_PREDECESSOR_RUN_ID,
    sourceFiles: identity.STAGE8_BC_RUN_SOURCE_FILES.length,
    formalPilotGamesExecuted: 0,
    realEvidenceFilesWritten: 0,
    realControlFilesWritten: 0,
    temporaryFixturesOnly: true,
    controls: ['frozen-interruption-facts','full-shard-identity-binding','self-consistent-tamper-rejection',
      'cross-worktree-stability','independent-evidence-emit-authorization','new-run-predecessor-binding',
      'readonly-check','atomic-evidence-and-control-emit','supervision-source-and-control-binding'],
  }));
} finally {
  if (previous) require.extensions['.ts'] = previous;
  else delete require.extensions['.ts'];
}
