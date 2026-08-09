import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  H_C4_PROTOCOL,
  applyHc4ValueCalibration,
  assignHc4GameSplit,
  buildHc4ReadinessPreflight,
  createHc4FinalTestLedger,
  evaluateHc4FinalTestOnce,
  evaluateHc4FinalTestWithFileDiscipline,
  fitHc4CalibrationScale,
  validateHc4VisibleRow,
  verifyHc4V2Lineage,
} from './lib/stage8-c4-value-calibration-readiness.mjs';

function findGameId(split, start = 0) {
  for (let index = start; index < start + 100000; index += 1) {
    const gameId = `hc4-fixture-${index}`;
    if (assignHc4GameSplit(gameId).split === split) return gameId;
  }
  throw new Error(`unable to find ${split} fixture gameId`);
}

function makeRow(gameId, rawValue = [0.4, -0.4, 0.2, -0.2], scale = 0.5) {
  const mean = rawValue.reduce((sum, value) => sum + value, 0) / rawValue.length;
  const centered = rawValue.map((value) => value - mean);
  return {
    gameId,
    features: [0.1, 0.2, 0.3, 0.4],
    rawValue,
    terminalScoreDeltas: centered.map((value) => value * scale * H_C4_PROTOCOL.valueScale),
    sampleSchemaVersion: H_C4_PROTOCOL.sampleSchemaVersion,
    learningVersion: H_C4_PROTOCOL.learningVersion,
    valueTargetTransformVersion: H_C4_PROTOCOL.valueTargetTransformVersion,
    actionSpaceVersion: H_C4_PROTOCOL.actionSpaceVersion,
    experienceProtocolVersion: H_C4_PROTOCOL.experienceProtocolVersion,
    sourceRuntimeFingerprint: 'f'.repeat(64),
    sourceShardSha256: 'a'.repeat(64),
  };
}

const trainingId = findGameId('training');
const calibrationId = findGameId('calibration');
const finalId = findGameId('final-test');

assert.equal(assignHc4GameSplit(trainingId).split, 'training');
assert.equal(assignHc4GameSplit(calibrationId).split, 'calibration');
assert.equal(assignHc4GameSplit(finalId).split, 'final-test');
assert.deepEqual(assignHc4GameSplit(calibrationId), assignHc4GameSplit(calibrationId));
assert.equal(
  new Set([makeRow(calibrationId), makeRow(calibrationId, [0.6, -0.6, 0.1, -0.1])]
    .map((row) => assignHc4GameSplit(row.gameId).split)).size,
  1,
  'all states from one game must remain atomic',
);

const validated = validateHc4VisibleRow(makeRow(calibrationId));
assert.equal(validated.split, 'calibration');
assert.ok(Math.abs(validated.centeredRawValue.reduce((sum, value) => sum + value, 0)) <= H_C4_PROTOCOL.zeroSumTolerance);
assert.ok(Math.abs(validated.targetValue.reduce((sum, value) => sum + value, 0)) <= H_C4_PROTOCOL.zeroSumTolerance);
assert.throws(
  () => validateHc4VisibleRow({ ...makeRow(calibrationId), rawValue: [0.5, -0.4, 0.2, -0.2] }),
  /rawValue must already be zero-sum/,
);
assert.throws(() => validateHc4VisibleRow({ ...makeRow(calibrationId), hiddenHand: ['wan1'] }), /unapproved field: hiddenHand/);
assert.throws(
  () => validateHc4VisibleRow({ ...makeRow(calibrationId), features: { futureWall: ['wan1'] } }),
  /features must be a finite numeric array/,
);
assert.throws(
  () => validateHc4VisibleRow({ ...makeRow(calibrationId), terminalScoreDeltas: [1, 0, 0, 0] }),
  /terminalScoreDeltas must be zero-sum/,
);
assert.throws(
  () => validateHc4VisibleRow({ ...makeRow(calibrationId), rawValue: [0.4, Number.NaN, 0.2, -0.2] }),
  /rawValue must contain four finite values/,
);

const fit = fitHc4CalibrationScale([
  makeRow(calibrationId),
  makeRow(calibrationId, [0.8, -0.8, 0.4, -0.4]),
]);
assert.ok(Math.abs(fit.scale - 0.5) <= 1e-12, 'known calibration scale must be recovered');
assert.equal(fit.gameCount, 1);
assert.equal(fit.sampleCount, 2);
assert.throws(() => fitHc4CalibrationScale([makeRow(trainingId)]), /calibration split only/);
assert.throws(() => fitHc4CalibrationScale([makeRow(finalId)]), /calibration split only/);
assert.throws(
  () => fitHc4CalibrationScale([makeRow(calibrationId, [0, 0, 0, 0])]),
  /zero or non-finite calibration denominator/,
);
assert.throws(
  () => fitHc4CalibrationScale([makeRow(calibrationId, [0.4, -0.4, 0.2, -0.2], -0.5)]),
  /fitted scale is degenerate/,
);
const alternateSourceRow = { ...makeRow(calibrationId), sourceShardSha256: 'b'.repeat(64) };
const alternateSourceFit = fitHc4CalibrationScale([alternateSourceRow]);
assert.notEqual(alternateSourceFit.fitDigest, fitHc4CalibrationScale([makeRow(calibrationId)]).fitDigest);

const policyInput = {
  rawValue: [0.4, -0.4, 0.2, -0.2],
  policyLogits: [1.25, -0.5, 0.75],
  legalActionMask: [1, 0, 1],
  behaviorDistribution: [0.7, 0, 0.3],
  behaviorActionProbability: 0.7,
};
assert.throws(() => applyHc4ValueCalibration(policyInput, 0), /non-degenerate calibration scale required/);
assert.throws(() => applyHc4ValueCalibration({ ...policyInput, rawValue: [0.5, -0.4, 0.2, -0.2] }, fit.scale), /rawValue must already be zero-sum/);
const calibrated = applyHc4ValueCalibration(policyInput, fit.scale);
assert.deepEqual(calibrated.policyLogits, policyInput.policyLogits);
assert.deepEqual(calibrated.legalActionMask, policyInput.legalActionMask);
assert.deepEqual(calibrated.behaviorDistribution, policyInput.behaviorDistribution);
assert.equal(calibrated.behaviorActionProbability, policyInput.behaviorActionProbability);
assert.deepEqual(calibrated.value, [0.2, -0.2, 0.1, -0.1]);
assert.ok(Math.abs(calibrated.value.reduce((sum, value) => sum + value, 0)) <= H_C4_PROTOCOL.zeroSumTolerance);

const lineage = {
  actionSpaceVersion: H_C4_PROTOCOL.actionSpaceVersion,
  experienceProtocolVersion: H_C4_PROTOCOL.experienceProtocolVersion,
  actionRegistrySourceSha256: '1'.repeat(64),
  actionSpaceGateCommit: 'a3ba905b52c80aa61bbdf04a09f1655b3faa6d67',
};
assert.deepEqual(verifyHc4V2Lineage(lineage, lineage), lineage);
assert.throws(
  () => verifyHc4V2Lineage({ ...lineage, actionSpaceVersion: 'stage8-action-space-v1' }, lineage),
  /stage8-action-space-v2 lineage required/,
);
assert.throws(
  () => verifyHc4V2Lineage({ ...lineage, nested: { checkpoint: 'v1.pt' } }, lineage),
  /v1 artifact field rejected: checkpoint/,
);
assert.throws(
  () => verifyHc4V2Lineage({ ...lineage, actionRegistrySourceSha256: '2'.repeat(64) }, lineage),
  /lineage mismatch: actionRegistrySourceSha256/,
);

const finalRows = [];
for (let index = 0; finalRows.length < 12; index += 1) {
  const gameId = findGameId('final-test', index * 1000);
  if (!finalRows.some((row) => row.gameId === gameId)) finalRows.push(makeRow(gameId));
}
const ledger = createHc4FinalTestLedger({
  scale: fit.scale,
  fitDigest: fit.fitDigest,
  bootstrapSeed: H_C4_PROTOCOL.bootstrapSeed,
  bootstrapReplicates: H_C4_PROTOCOL.bootstrapReplicates,
  splitVersion: H_C4_PROTOCOL.splitVersion,
});
const evaluation = evaluateHc4FinalTestOnce(ledger, finalRows);
assert.equal(evaluation.gatePassed, true);
assert.ok(evaluation.metrics.maeImprovement > 0);
assert.ok(evaluation.metrics.bootstrap95.lower > 0);
assert.ok(evaluation.metrics.sameSignCalibrated >= evaluation.metrics.sameSignIdentity);
assert.ok(evaluation.metrics.sameSignBySeat.every((seat) => seat.calibrated >= seat.identity));
assert.ok(evaluation.metrics.effectiveStateFraction >= H_C4_PROTOCOL.minimumEffectiveStateFraction);
assert.equal(ledger.consumed, true);
assert.throws(() => evaluateHc4FinalTestOnce(ledger, finalRows), /final-test already consumed/);
assert.throws(
  () => createHc4FinalTestLedger({
    scale: fit.scale,
    fitDigest: fit.fitDigest,
    bootstrapSeed: 1,
    bootstrapReplicates: H_C4_PROTOCOL.bootstrapReplicates,
    splitVersion: H_C4_PROTOCOL.splitVersion,
  }),
  /bootstrap seed mismatch/,
);
const invalidLedger = createHc4FinalTestLedger({
  scale: fit.scale,
  fitDigest: fit.fitDigest,
  bootstrapSeed: H_C4_PROTOCOL.bootstrapSeed,
  bootstrapReplicates: H_C4_PROTOCOL.bootstrapReplicates,
  splitVersion: H_C4_PROTOCOL.splitVersion,
});
assert.throws(() => evaluateHc4FinalTestOnce(invalidLedger, [makeRow(calibrationId)]), /final-test split only/);
assert.equal(invalidLedger.consumed, true, 'opening final-test is fail-closed even when evaluation fails');

const preflight = buildHc4ReadinessPreflight({
  designSha256: '19F175F06DACE16C3D5B27D7BEAA423DAA2F589A94BC7FC07D32DDDA7A930FD3',
  lineage,
  expectedLineage: lineage,
  prerequisites: {
    p0RuleCoreAccepted: true,
    p0PageAccepted: true,
    stage8V2ThreeLayerGateAccepted: true,
    v2ValueModelAvailable: false,
    v2CalibrationCorpusAvailable: false,
  },
  verificationEvidence: {
    readinessRegressionPassed: true,
    stage8V2ActionSpaceGatePassed: true,
    readinessRegressionSha256: 'd'.repeat(64),
    stage8V2GateRegressionSha256: 'e'.repeat(64),
  },
  authorizations: {
    candidateCreated: false,
    corpusGenerated: false,
    finalTestOpened: false,
    trainingAuthorized: false,
    arenaAuthorized: false,
    runtimeAuthorized: false,
  },
});
assert.equal(preflight.status, 'fixture-readiness-passed-real-offline-gate-blocked');
assert.equal(preflight.verificationEvidence.readinessRegressionPassed, true);
assert.throws(
  () => buildHc4ReadinessPreflight({
    designSha256: '19F175F06DACE16C3D5B27D7BEAA423DAA2F589A94BC7FC07D32DDDA7A930FD3',
    lineage,
    expectedLineage: lineage,
    prerequisites: {
      p0RuleCoreAccepted: true,
      p0PageAccepted: true,
      stage8V2ThreeLayerGateAccepted: true,
      v2ValueModelAvailable: false,
      v2CalibrationCorpusAvailable: false,
    },
    authorizations: {
      candidateCreated: false,
      corpusGenerated: false,
      finalTestOpened: false,
      trainingAuthorized: false,
      arenaAuthorized: false,
      runtimeAuthorized: false,
    },
  }),
  /verification evidence required/,
);
assert.ok(Object.values(preflight.implementationGates).every(Boolean));
assert.equal(preflight.executionPrerequisites.v2ValueModelAvailable, false);
assert.equal(preflight.executionPrerequisites.v2CalibrationCorpusAvailable, false);
assert.equal(preflight.authorizations.trainingAuthorized, false);
assert.throws(
  () => buildHc4ReadinessPreflight({
    designSha256: '19F175F06DACE16C3D5B27D7BEAA423DAA2F589A94BC7FC07D32DDDA7A930FD3',
    lineage,
    expectedLineage: lineage,
    prerequisites: {
      p0RuleCoreAccepted: true,
      p0PageAccepted: true,
      stage8V2ThreeLayerGateAccepted: true,
      v2ValueModelAvailable: false,
      v2CalibrationCorpusAvailable: false,
    },
    verificationEvidence: {
      readinessRegressionPassed: true,
      stage8V2ActionSpaceGatePassed: true,
      readinessRegressionSha256: 'd'.repeat(64),
      stage8V2GateRegressionSha256: 'e'.repeat(64),
    },
    authorizations: {
      candidateCreated: false,
      corpusGenerated: false,
      finalTestOpened: false,
      trainingAuthorized: true,
      arenaAuthorized: false,
      runtimeAuthorized: false,
    },
  }),
  /readiness cannot authorize downstream actions/,
);

const disciplineRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-c4-final-test-'));
try {
  const markerPath = path.join(disciplineRoot, 'final-test-opened.json');
  const completionPath = path.join(disciplineRoot, 'final-test-completed.json');
  const fileEvaluation = evaluateHc4FinalTestWithFileDiscipline({
    markerPath,
    completionPath,
    ledgerConfig: {
      scale: fit.scale,
      fitDigest: fit.fitDigest,
      bootstrapSeed: H_C4_PROTOCOL.bootstrapSeed,
      bootstrapReplicates: H_C4_PROTOCOL.bootstrapReplicates,
      splitVersion: H_C4_PROTOCOL.splitVersion,
    },
    lineageDigest: 'b'.repeat(64),
    configDigest: 'c'.repeat(64),
    rows: finalRows,
  });
  assert.equal(fileEvaluation.gatePassed, true);
  assert.equal(JSON.parse(fs.readFileSync(markerPath, 'utf8')).state, 'final-test-opened');
  assert.equal(JSON.parse(fs.readFileSync(completionPath, 'utf8')).state, 'completed');
  assert.throws(
    () => evaluateHc4FinalTestWithFileDiscipline({
      markerPath,
      completionPath: path.join(disciplineRoot, 'second-completion.json'),
      ledgerConfig: {
        scale: fit.scale,
        fitDigest: fit.fitDigest,
        bootstrapSeed: H_C4_PROTOCOL.bootstrapSeed,
        bootstrapReplicates: H_C4_PROTOCOL.bootstrapReplicates,
        splitVersion: H_C4_PROTOCOL.splitVersion,
      },
      lineageDigest: 'b'.repeat(64),
      configDigest: 'c'.repeat(64),
      rows: finalRows,
    }),
    /final-test marker already exists/,
  );

  const failedMarker = path.join(disciplineRoot, 'failed-opened.json');
  const failedCompletion = path.join(disciplineRoot, 'failed-completed.json');
  assert.throws(
    () => evaluateHc4FinalTestWithFileDiscipline({
      markerPath: failedMarker,
      completionPath: failedCompletion,
      ledgerConfig: {
        scale: fit.scale,
        fitDigest: fit.fitDigest,
        bootstrapSeed: H_C4_PROTOCOL.bootstrapSeed,
        bootstrapReplicates: H_C4_PROTOCOL.bootstrapReplicates,
        splitVersion: H_C4_PROTOCOL.splitVersion,
      },
      lineageDigest: 'b'.repeat(64),
      configDigest: 'c'.repeat(64),
      rows: [makeRow(calibrationId)],
    }),
    /final-test split only/,
  );
  assert.equal(fs.existsSync(failedMarker), true, 'failed evaluation must retain opened marker');
  assert.equal(fs.existsSync(failedCompletion), false);
} finally {
  fs.rmSync(disciplineRoot, { recursive: true, force: true });
}

console.log('Stage8 H-C4 value calibration readiness regression: passed');