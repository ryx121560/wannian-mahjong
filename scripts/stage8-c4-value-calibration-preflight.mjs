import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  H_C4_PROTOCOL,
  assertHc4NoForbiddenFields,
  buildHc4ReadinessPreflight,
} from './lib/stage8-c4-value-calibration-readiness.mjs';

const root = path.resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('usage: --config <path> --output <path>');
    result[key.slice(2)] = value;
  }
  if (!result.config || !result.output) throw new Error('usage: --config <path> --output <path>');
  return result;
}

function sha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex').toUpperCase();
}

function runVerification(scriptPath, label) {
  const run = spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: 'utf8' });
  if (run.error || run.status !== 0) {
    throw new Error(`${label} failed: ${run.error?.message || run.stderr || run.stdout || `exit ${run.status}`}`);
  }
  return {
    passed: true,
    scriptSha256: sha256(scriptPath),
    outputSha256: sha256Text(`${run.stdout || ''}\n${run.stderr || ''}`),
  };
}

function deriveActionSpaceGateCommit(registryPath) {
  const relativePath = path.relative(root, registryPath).replaceAll('\\', '/');
  const run = spawnSync('git', ['log', '-1', '--format=%H', '--', relativePath], { cwd: root, encoding: 'utf8' });
  if (run.error || run.status !== 0) throw new Error(`unable to derive action-space gate commit: ${run.error?.message || run.stderr}`);
  const commit = run.stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error('unable to derive action-space gate commit');
  return commit;
}

function resolveRepoFile(relativePath, label) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error(`${label} path must be repo-relative`);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${label} path escapes repository`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`${label} file missing`);
  return resolved;
}

function assertHash(filePath, expected, label) {
  const actual = sha256(filePath);
  if (actual !== String(expected).toUpperCase()) throw new Error(`hash mismatch: ${label}`);
  return actual;
}

function assertProtocol(protocol) {
  const expected = {
    splitVersion: H_C4_PROTOCOL.splitVersion,
    splitPrefix: H_C4_PROTOCOL.splitPrefix,
    trainingBuckets: [0, 799],
    calibrationBuckets: [800, 899],
    finalTestBuckets: [900, 999],
    sampleSchemaVersion: H_C4_PROTOCOL.sampleSchemaVersion,
    learningVersion: H_C4_PROTOCOL.learningVersion,
    labelField: H_C4_PROTOCOL.labelField,
    valueTargetTransformVersion: H_C4_PROTOCOL.valueTargetTransformVersion,
    valueScale: H_C4_PROTOCOL.valueScale,
    zeroSumTolerance: H_C4_PROTOCOL.zeroSumTolerance,
    minimumScale: H_C4_PROTOCOL.minimumScale,
    signEpsilon: H_C4_PROTOCOL.signEpsilon,
    effectiveValueThreshold: H_C4_PROTOCOL.effectiveValueThreshold,
    minimumEffectiveStateFraction: H_C4_PROTOCOL.minimumEffectiveStateFraction,
    bootstrapSeed: H_C4_PROTOCOL.bootstrapSeed,
    bootstrapReplicates: H_C4_PROTOCOL.bootstrapReplicates,
    bootstrapVersion: H_C4_PROTOCOL.bootstrapVersion,
    percentileVersion: H_C4_PROTOCOL.percentileVersion,
    sameSignGate: 'aggregate-and-each-seat-no-degradation',
  };
  if (JSON.stringify(protocol) !== JSON.stringify(expected)) throw new Error('readiness protocol config mismatch');
}

function writeImmutableJson(outputPath, value) {
  const directory = path.dirname(outputPath);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error('output directory must already exist');
  if (fs.existsSync(outputPath)) throw new Error('output already exists');
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

try {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(args.config);
  const outputPath = path.resolve(args.output);
  if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) throw new Error('config file missing');
  if (fs.existsSync(outputPath)) throw new Error('output already exists');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.schemaVersion !== 'stage8-c4-value-calibration-readiness-config-v1') throw new Error('config schema mismatch');
  assertHc4NoForbiddenFields(config);
  assertProtocol(config.protocol);

  const designPath = resolveRepoFile(config.design.path, 'design');
  const registryPath = resolveRepoFile(config.lineage.actionRegistrySourcePath, 'actionRegistry');
  const gateReportPath = resolveRepoFile(config.lineage.actionSpaceGateReportPath, 'actionSpaceGateReport');
  const designSha256 = assertHash(designPath, config.design.sha256, 'design');
  const registrySha256 = assertHash(registryPath, config.lineage.actionRegistrySourceSha256, 'actionRegistry');
  const gateReportSha256 = assertHash(gateReportPath, config.lineage.actionSpaceGateReportSha256, 'actionSpaceGateReport');
  const expectedLineage = {
    actionSpaceVersion: H_C4_PROTOCOL.actionSpaceVersion,
    experienceProtocolVersion: H_C4_PROTOCOL.experienceProtocolVersion,
    actionRegistrySourceSha256: sha256(registryPath),
    actionSpaceGateCommit: deriveActionSpaceGateCommit(registryPath),
  };

  const lineage = {
    actionSpaceVersion: config.lineage.actionSpaceVersion,
    experienceProtocolVersion: config.lineage.experienceProtocolVersion,
    actionRegistrySourceSha256: registrySha256,
    actionSpaceGateCommit: config.lineage.actionSpaceGateCommit,
  };
  const modulePath = path.join(root, 'scripts', 'lib', 'stage8-c4-value-calibration-readiness.mjs');
  const regressionPath = path.join(root, 'scripts', 'stage8-c4-value-calibration-readiness-regression.mjs');
  const stage8V2GateRegressionPath = path.join(root, 'scripts', 'stage8-v2-action-space-gate-regression.mjs');
  const readinessVerification = runVerification(regressionPath, 'readiness regression');
  const stage8V2Verification = runVerification(stage8V2GateRegressionPath, 'stage8 v2 action-space regression');
  const verificationEvidence = {
    readinessRegressionPassed: readinessVerification.passed,
    stage8V2ActionSpaceGatePassed: stage8V2Verification.passed,
    readinessRegressionSha256: readinessVerification.scriptSha256,
    stage8V2GateRegressionSha256: stage8V2Verification.scriptSha256,
    readinessRegressionOutputSha256: readinessVerification.outputSha256,
    stage8V2GateRegressionOutputSha256: stage8V2Verification.outputSha256,
  };
  const preflight = buildHc4ReadinessPreflight({
    designSha256,
    lineage,
    expectedLineage,
    prerequisites: config.prerequisites,
    verificationEvidence,
    authorizations: config.authorizations,
  });
  const result = {
    ...preflight,
    evidence: {
      config: { path: path.relative(root, configPath).replaceAll('\\', '/'), sha256: sha256(configPath) },
      design: { path: config.design.path, sha256: designSha256 },
      actionRegistry: { path: config.lineage.actionRegistrySourcePath, sha256: registrySha256 },
      actionSpaceGateReport: { path: config.lineage.actionSpaceGateReportPath, sha256: gateReportSha256 },
      readinessModule: { path: path.relative(root, modulePath).replaceAll('\\', '/'), sha256: sha256(modulePath) },
      readinessRegression: { path: path.relative(root, regressionPath).replaceAll('\\', '/'), sha256: sha256(regressionPath) },
      stage8V2GateRegression: { path: path.relative(root, stage8V2GateRegressionPath).replaceAll('\\', '/'), sha256: sha256(stage8V2GateRegressionPath) },
    },
    releaseCorrectionCommit: config.lineage.releaseCorrectionCommit,
    offlineEvaluation: {
      calibrationCorpusGenerated: false,
      scaleFittedFromRealCorpus: false,
      finalTestOpened: false,
      finalTestMetricsProduced: false,
    },
  };
  writeImmutableJson(outputPath, result);
  console.log(JSON.stringify({ output: outputPath, sha256: sha256(outputPath), status: result.status }));
} catch (error) {
  console.error(`[stage8-c4-readiness] ${error.message}`);
  process.exit(1);
}