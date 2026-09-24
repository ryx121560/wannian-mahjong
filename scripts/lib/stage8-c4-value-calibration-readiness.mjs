import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const H_C4_PROTOCOL = Object.freeze({
  schemaVersion: 'stage8-c4-value-calibration-readiness-v1',
  splitVersion: 'stage8-c4-value-calibration-split-v1',
  splitPrefix: 'stage8-c4-value-calibration-v1:',
  sampleSchemaVersion: 'stage8-experience-v1',
  learningVersion: 'stage8-terminal-actor-critic-v1',
  labelField: 'terminalScoreDeltas',
  valueTargetTransformVersion: 'stage8-terminal-score-delta-over-value-scale-v1',
  valueScale: 8,
  zeroSumTolerance: 1e-6,
  actionSpaceVersion: 'stage8-action-space-v2',
  experienceProtocolVersion: 'stage8-c4-visible-value-readiness-v1',
  minimumScale: 0.125,
  signEpsilon: 1e-6,
  effectiveValueThreshold: 0.05,
  minimumEffectiveStateFraction: 0.95,
  bootstrapSeed: 2026073004,
  bootstrapReplicates: 10000,
  bootstrapVersion: 'stage8-c4-sha256-counter-bootstrap-v1',
  percentileVersion: 'stage8-c4-nearest-rank-percentile-v1',
});

const ROW_FIELDS = new Set([
  'gameId',
  'features',
  'rawValue',
  'terminalScoreDeltas',
  'sampleSchemaVersion',
  'learningVersion',
  'valueTargetTransformVersion',
  'actionSpaceVersion',
  'experienceProtocolVersion',
  'sourceRuntimeFingerprint',
  'sourceShardSha256',
]);

const FORBIDDEN_FIELDS = new Set([
  'hiddenHand',
  'hiddenHands',
  'opponentHand',
  'opponentHands',
  'futureWall',
  'wallTiles',
  'fullInformationTeacher',
  'teacherHiddenState',
  'playerExport',
  'userRecord',
  'replay',
  'replayCursor',
  'checkpoint',
  'model',
  'manifest',
  'workRoot',
  'v1ActionId',
  'v1ActionSpaceVersion',
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite canonical value');
  return value;
}

export function stableHc4Digest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function assertHex(value, field, length) {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-fA-F]{${length}}$`).test(value)) {
    throw new Error(`${field} must be ${length}-hex`);
  }
}

function assertFiniteVector(value, field, length = 4) {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => !Number.isFinite(item))) {
    throw new Error(length === 4 ? `${field} must contain four finite values` : `${field} must contain ${length} finite values`);
  }
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function center(values) {
  const mean = sum(values) / values.length;
  return values.map((value) => value - mean);
}

function assertZeroSum(values, field) {
  if (Math.abs(sum(values)) > H_C4_PROTOCOL.zeroSumTolerance) {
    throw new Error(`${field} must be zero-sum`);
  }
}

function scanForbiddenFields(value) {
  const visited = new Set();
  const visit = (current) => {
    if (!current || typeof current !== 'object' || visited.has(current)) return;
    visited.add(current);
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_FIELDS.has(key)) throw new Error(`v1 artifact field rejected: ${key}`);
      visit(child);
    }
  };
  visit(value);
}

export function assertHc4NoForbiddenFields(value) {
  scanForbiddenFields(value);
}

export function assignHc4GameSplit(gameId) {
  if (typeof gameId !== 'string' || gameId.length === 0) throw new Error('gameId must be a non-empty string');
  const digest = createHash('sha256').update(`${H_C4_PROTOCOL.splitPrefix}${gameId}`).digest('hex');
  const bucket = Number(BigInt(`0x${digest}`) % 1000n);
  const split = bucket < 800 ? 'training' : bucket < 900 ? 'calibration' : 'final-test';
  return { splitVersion: H_C4_PROTOCOL.splitVersion, bucket, split };
}

export function validateHc4VisibleRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('calibration row must be an object');
  for (const key of Object.keys(row)) {
    if (!ROW_FIELDS.has(key)) throw new Error(`unapproved field: ${key}`);
  }
  if (!Array.isArray(row.features) || row.features.some((value) => !Number.isFinite(value))) {
    throw new Error('features must be a finite numeric array');
  }
  assertFiniteVector(row.rawValue, 'rawValue');
  if (Math.abs(sum(row.rawValue)) > H_C4_PROTOCOL.zeroSumTolerance) {
    throw new Error('rawValue must already be zero-sum');
  }
  assertFiniteVector(row.terminalScoreDeltas, 'terminalScoreDeltas');
  assertZeroSum(row.terminalScoreDeltas, 'terminalScoreDeltas');
  if (row.sampleSchemaVersion !== H_C4_PROTOCOL.sampleSchemaVersion) throw new Error('sample schema mismatch');
  if (row.learningVersion !== H_C4_PROTOCOL.learningVersion) throw new Error('learning version mismatch');
  if (row.valueTargetTransformVersion !== H_C4_PROTOCOL.valueTargetTransformVersion) {
    throw new Error('value target transform mismatch');
  }
  if (row.actionSpaceVersion !== H_C4_PROTOCOL.actionSpaceVersion) throw new Error('stage8-action-space-v2 lineage required');
  if (row.experienceProtocolVersion !== H_C4_PROTOCOL.experienceProtocolVersion) {
    throw new Error('H-C4 visible experience protocol required');
  }
  assertHex(row.sourceRuntimeFingerprint, 'sourceRuntimeFingerprint', 64);
  assertHex(row.sourceShardSha256, 'sourceShardSha256', 64);
  const centeredRawValue = row.rawValue.slice();
  const targetValue = row.terminalScoreDeltas.map((value) => value / H_C4_PROTOCOL.valueScale);
  assertZeroSum(centeredRawValue, 'centeredRawValue');
  assertZeroSum(targetValue, 'targetValue');
  const assignment = assignHc4GameSplit(row.gameId);
  return {
    ...row,
    features: row.features.slice(),
    rawValue: row.rawValue.slice(),
    terminalScoreDeltas: row.terminalScoreDeltas.slice(),
    centeredRawValue,
    targetValue,
    ...assignment,
  };
}

export function fitHc4CalibrationScale(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('calibration rows required');
  const validated = rows.map(validateHc4VisibleRow);
  if (validated.some((row) => row.split !== 'calibration')) throw new Error('calibration split only');
  let numerator = 0;
  let denominator = 0;
  for (const row of validated) {
    for (let seat = 0; seat < 4; seat += 1) {
      numerator += row.centeredRawValue[seat] * row.targetValue[seat];
      denominator += row.centeredRawValue[seat] * row.centeredRawValue[seat];
    }
  }
  if (!Number.isFinite(denominator) || denominator <= 0) throw new Error('zero or non-finite calibration denominator');
  const unconstrainedScale = numerator / denominator;
  if (!Number.isFinite(unconstrainedScale)) throw new Error('non-finite calibration scale');
  const scale = Math.max(0, unconstrainedScale);
  if (scale < H_C4_PROTOCOL.minimumScale) throw new Error('fitted scale is degenerate');
  const gameIds = [...new Set(validated.map((row) => row.gameId))].sort();
  const calibrationRowDigests = validated.map((row) => stableHc4Digest({
    gameId: row.gameId,
    features: row.features,
    rawValue: row.rawValue,
    terminalScoreDeltas: row.terminalScoreDeltas,
    sampleSchemaVersion: row.sampleSchemaVersion,
    learningVersion: row.learningVersion,
    valueTargetTransformVersion: row.valueTargetTransformVersion,
    actionSpaceVersion: row.actionSpaceVersion,
    experienceProtocolVersion: row.experienceProtocolVersion,
    sourceRuntimeFingerprint: row.sourceRuntimeFingerprint,
    sourceShardSha256: row.sourceShardSha256,
  })).sort();
  const sourceRuntimeFingerprints = [...new Set(validated.map((row) => row.sourceRuntimeFingerprint))].sort();
  const sourceShardSha256 = [...new Set(validated.map((row) => row.sourceShardSha256))].sort();
  const fitDigest = stableHc4Digest({
    formulaVersion: 'stage8-c4-shared-nonnegative-scale-v1',
    splitVersion: H_C4_PROTOCOL.splitVersion,
    gameIds,
    sampleCount: validated.length,
    numerator,
    denominator,
    scale,
    calibrationRowDigests,
    sourceRuntimeFingerprints,
    sourceShardSha256,
  });
  return {
    scale,
    unconstrainedScale,
    nonDegenerate: true,
    gameCount: gameIds.length,
    sampleCount: validated.length,
    fitDigest,
  };
}

export function applyHc4ValueCalibration(input, scale) {
  if (!input || typeof input !== 'object') throw new Error('calibration input required');
  assertFiniteVector(input.rawValue, 'rawValue');
  if (Math.abs(sum(input.rawValue)) > H_C4_PROTOCOL.zeroSumTolerance) {
    throw new Error('rawValue must already be zero-sum');
  }
  if (!Number.isFinite(scale) || scale < H_C4_PROTOCOL.minimumScale) {
    throw new Error('non-degenerate calibration scale required');
  }
  const centeredRawValue = input.rawValue.slice();
  const value = centeredRawValue.map((item) => item * scale);
  assertZeroSum(centeredRawValue, 'centeredRawValue');
  assertZeroSum(value, 'calibratedValue');
  return {
    value,
    policyLogits: Array.isArray(input.policyLogits) ? input.policyLogits.slice() : input.policyLogits,
    legalActionMask: Array.isArray(input.legalActionMask) ? input.legalActionMask.slice() : input.legalActionMask,
    behaviorDistribution: Array.isArray(input.behaviorDistribution) ? input.behaviorDistribution.slice() : input.behaviorDistribution,
    behaviorActionProbability: input.behaviorActionProbability,
  };
}

export function verifyHc4V2Lineage(actual, expected) {
  if (!actual || typeof actual !== 'object' || !expected || typeof expected !== 'object') throw new Error('lineage objects required');
  scanForbiddenFields(actual);
  if (actual.actionSpaceVersion !== H_C4_PROTOCOL.actionSpaceVersion) throw new Error('stage8-action-space-v2 lineage required');
  if (actual.experienceProtocolVersion !== H_C4_PROTOCOL.experienceProtocolVersion) {
    throw new Error('H-C4 visible experience protocol required');
  }
  assertHex(actual.actionRegistrySourceSha256, 'actionRegistrySourceSha256', 64);
  assertHex(actual.actionSpaceGateCommit, 'actionSpaceGateCommit', 40);
  for (const key of ['actionSpaceVersion', 'experienceProtocolVersion', 'actionRegistrySourceSha256', 'actionSpaceGateCommit']) {
    if (actual[key] !== expected[key]) throw new Error(`lineage mismatch: ${key}`);
  }
  return {
    actionSpaceVersion: actual.actionSpaceVersion,
    experienceProtocolVersion: actual.experienceProtocolVersion,
    actionRegistrySourceSha256: actual.actionRegistrySourceSha256,
    actionSpaceGateCommit: actual.actionSpaceGateCommit,
  };
}

function sign(value) {
  if (value > H_C4_PROTOCOL.signEpsilon) return 1;
  if (value < -H_C4_PROTOCOL.signEpsilon) return -1;
  return 0;
}

function nearestRank(sorted, probability) {
  const rank = Math.max(1, Math.ceil(probability * sorted.length));
  return sorted[rank - 1];
}

function bootstrapIndex(gameCount, replicate, draw) {
  const digest = createHash('sha256')
    .update(`${H_C4_PROTOCOL.bootstrapVersion}:${H_C4_PROTOCOL.bootstrapSeed}:${replicate}:${draw}`)
    .digest('hex');
  return Number(BigInt(`0x${digest}`) % BigInt(gameCount));
}

function metricSummary(rows, scale) {
  let identityError = 0;
  let calibratedError = 0;
  let sameIdentity = 0;
  let sameCalibrated = 0;
  const seatCounts = Array.from({ length: 4 }, () => ({ identity: 0, calibrated: 0, total: 0 }));
  let zeroResidualTotal = 0;
  let zeroResidualMax = 0;
  let effectiveStates = 0;
  const games = new Map();
  for (const row of rows) {
    const calibratedValue = row.centeredRawValue.map((value) => value * scale);
    const zeroResidual = Math.abs(sum(calibratedValue));
    zeroResidualTotal += zeroResidual;
    zeroResidualMax = Math.max(zeroResidualMax, zeroResidual);
    if (Math.max(...calibratedValue.map(Math.abs)) >= H_C4_PROTOCOL.effectiveValueThreshold) effectiveStates += 1;
    const game = games.get(row.gameId) || { identityError: 0, calibratedError: 0, count: 0 };
    for (let seat = 0; seat < 4; seat += 1) {
      const identitySeatError = Math.abs(row.centeredRawValue[seat] - row.targetValue[seat]);
      const calibratedSeatError = Math.abs(calibratedValue[seat] - row.targetValue[seat]);
      identityError += identitySeatError;
      calibratedError += calibratedSeatError;
      game.identityError += identitySeatError;
      game.calibratedError += calibratedSeatError;
      game.count += 1;
      const targetSign = sign(row.targetValue[seat]);
      const identityMatch = sign(row.centeredRawValue[seat]) === targetSign;
      const calibratedMatch = sign(calibratedValue[seat]) === targetSign;
      if (identityMatch) sameIdentity += 1;
      if (calibratedMatch) sameCalibrated += 1;
      if (identityMatch) seatCounts[seat].identity += 1;
      if (calibratedMatch) seatCounts[seat].calibrated += 1;
      seatCounts[seat].total += 1;
    }
    games.set(row.gameId, game);
  }
  const valueCount = rows.length * 4;
  return {
    maeIdentity: identityError / valueCount,
    maeCalibrated: calibratedError / valueCount,
    maeImprovement: (identityError - calibratedError) / valueCount,
    sameSignIdentity: sameIdentity / valueCount,
    sameSignCalibrated: sameCalibrated / valueCount,
    sameSignBySeat: seatCounts.map((seat) => ({
      identity: seat.identity / seat.total,
      calibrated: seat.calibrated / seat.total,
    })),
    zeroSumResidualMean: zeroResidualTotal / rows.length,
    zeroSumResidualMax: zeroResidualMax,
    effectiveStateFraction: effectiveStates / rows.length,
    games: [...games.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([gameId, value]) => ({ gameId, ...value })),
  };
}

function bootstrapImprovement(games) {
  const improvements = [];
  for (let replicate = 0; replicate < H_C4_PROTOCOL.bootstrapReplicates; replicate += 1) {
    let identityError = 0;
    let calibratedError = 0;
    let count = 0;
    for (let draw = 0; draw < games.length; draw += 1) {
      const game = games[bootstrapIndex(games.length, replicate, draw)];
      identityError += game.identityError;
      calibratedError += game.calibratedError;
      count += game.count;
    }
    improvements.push((identityError - calibratedError) / count);
  }
  improvements.sort((left, right) => left - right);
  return {
    lower: nearestRank(improvements, 0.025),
    upper: nearestRank(improvements, 0.975),
    seed: H_C4_PROTOCOL.bootstrapSeed,
    replicates: H_C4_PROTOCOL.bootstrapReplicates,
    bootstrapVersion: H_C4_PROTOCOL.bootstrapVersion,
    percentileVersion: H_C4_PROTOCOL.percentileVersion,
  };
}

export function createHc4FinalTestLedger(config) {
  if (!config || typeof config !== 'object') throw new Error('final-test config required');
  if (config.bootstrapSeed !== H_C4_PROTOCOL.bootstrapSeed) throw new Error('bootstrap seed mismatch');
  if (config.bootstrapReplicates !== H_C4_PROTOCOL.bootstrapReplicates) throw new Error('bootstrap replicate mismatch');
  if (config.splitVersion !== H_C4_PROTOCOL.splitVersion) throw new Error('split version mismatch');
  if (!Number.isFinite(config.scale) || config.scale < H_C4_PROTOCOL.minimumScale) throw new Error('non-degenerate scale required');
  assertHex(config.fitDigest, 'fitDigest', 64);
  return {
    schemaVersion: 'stage8-c4-final-test-ledger-v1',
    scale: config.scale,
    fitDigest: config.fitDigest,
    bootstrapSeed: config.bootstrapSeed,
    bootstrapReplicates: config.bootstrapReplicates,
    splitVersion: config.splitVersion,
    consumed: false,
    state: 'sealed',
    resultDigest: null,
  };
}

export function evaluateHc4FinalTestOnce(ledger, rows) {
  if (!ledger || ledger.schemaVersion !== 'stage8-c4-final-test-ledger-v1') throw new Error('final-test ledger required');
  if (ledger.consumed) throw new Error('final-test already consumed');
  ledger.consumed = true;
  ledger.state = 'final-test-opened';
  try {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('final-test rows required');
    const validated = rows.map(validateHc4VisibleRow);
    if (validated.some((row) => row.split !== 'final-test')) throw new Error('final-test split only');
    const summary = metricSummary(validated, ledger.scale);
    const bootstrap95 = bootstrapImprovement(summary.games);
    const sameSignNotDegraded = summary.sameSignCalibrated >= summary.sameSignIdentity
      && summary.sameSignBySeat.every((seat) => seat.calibrated >= seat.identity);
    const gatePassed = bootstrap95.lower > 0
      && sameSignNotDegraded
      && summary.effectiveStateFraction >= H_C4_PROTOCOL.minimumEffectiveStateFraction
      && summary.zeroSumResidualMax <= H_C4_PROTOCOL.zeroSumTolerance;
    const metrics = {
      maeIdentity: summary.maeIdentity,
      maeCalibrated: summary.maeCalibrated,
      maeImprovement: summary.maeImprovement,
      relativeMaeImprovement: summary.maeIdentity === 0 ? 0 : summary.maeImprovement / summary.maeIdentity,
      sameSignIdentity: summary.sameSignIdentity,
      sameSignCalibrated: summary.sameSignCalibrated,
      sameSignBySeat: summary.sameSignBySeat,
      zeroSumResidualMean: summary.zeroSumResidualMean,
      zeroSumResidualMax: summary.zeroSumResidualMax,
      effectiveStateFraction: summary.effectiveStateFraction,
      bootstrap95,
      gameCount: summary.games.length,
      sampleCount: validated.length,
      scale: ledger.scale,
    };
    const evaluationDigest = stableHc4Digest({ fitDigest: ledger.fitDigest, metrics, gatePassed });
    ledger.state = 'completed';
    ledger.resultDigest = evaluationDigest;
    return { gatePassed, metrics, evaluationDigest };
  } catch (error) {
    ledger.state = 'failed-closed';
    throw error;
  }
}

function writeExclusiveJson(filePath, value, existingMessage) {
  const resolved = path.resolve(filePath);
  const directory = path.dirname(resolved);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error('final-test evidence directory missing');
  if (fs.existsSync(resolved)) throw new Error(existingMessage);
  try {
    fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(existingMessage);
    throw error;
  }
  return resolved;
}

export function evaluateHc4FinalTestWithFileDiscipline(input) {
  if (!input || typeof input !== 'object') throw new Error('file-discipline input required');
  assertHex(input.lineageDigest, 'lineageDigest', 64);
  assertHex(input.configDigest, 'configDigest', 64);
  const markerPath = path.resolve(input.markerPath);
  const completionPath = path.resolve(input.completionPath);
  if (markerPath === completionPath) throw new Error('marker and completion paths must differ');
  if (fs.existsSync(markerPath)) throw new Error('final-test marker already exists');
  if (fs.existsSync(completionPath)) throw new Error('final-test completion already exists');
  const ledger = createHc4FinalTestLedger(input.ledgerConfig);
  const marker = {
    schemaVersion: 'stage8-c4-final-test-opened-v1',
    state: 'final-test-opened',
    fitDigest: ledger.fitDigest,
    scale: ledger.scale,
    splitVersion: ledger.splitVersion,
    bootstrapSeed: ledger.bootstrapSeed,
    bootstrapReplicates: ledger.bootstrapReplicates,
    bootstrapVersion: H_C4_PROTOCOL.bootstrapVersion,
    percentileVersion: H_C4_PROTOCOL.percentileVersion,
    lineageDigest: input.lineageDigest.toUpperCase(),
    configDigest: input.configDigest.toUpperCase(),
  };
  writeExclusiveJson(markerPath, marker, 'final-test marker already exists');
  const markerSha256 = createHash('sha256').update(fs.readFileSync(markerPath)).digest('hex').toUpperCase();
  const evaluation = evaluateHc4FinalTestOnce(ledger, input.rows);
  const completion = {
    schemaVersion: 'stage8-c4-final-test-completed-v1',
    state: 'completed',
    markerSha256,
    evaluationDigest: evaluation.evaluationDigest,
    gatePassed: evaluation.gatePassed,
    metrics: evaluation.metrics,
  };
  writeExclusiveJson(completionPath, completion, 'final-test completion already exists');
  return evaluation;
}

export function buildHc4ReadinessPreflight(input) {
  if (!input || typeof input !== 'object') throw new Error('readiness input required');
  assertHex(input.designSha256, 'designSha256', 64);
  const verifiedLineage = verifyHc4V2Lineage(input.lineage, input.expectedLineage);
  const prerequisites = input.prerequisites || {};
  for (const key of ['p0RuleCoreAccepted', 'p0PageAccepted', 'stage8V2ThreeLayerGateAccepted']) {
    if (prerequisites[key] !== true) throw new Error(`required prerequisite failed: ${key}`);
  }
  const authorizations = input.authorizations || {};
  for (const key of ['candidateCreated', 'corpusGenerated', 'finalTestOpened', 'trainingAuthorized', 'arenaAuthorized', 'runtimeAuthorized']) {
    if (authorizations[key] !== false) throw new Error('readiness cannot authorize downstream actions');
  }
  const verificationEvidence = input.verificationEvidence;
  if (!verificationEvidence || typeof verificationEvidence !== 'object') throw new Error('verification evidence required');
  if (verificationEvidence.readinessRegressionPassed !== true) throw new Error('readiness regression evidence failed');
  if (verificationEvidence.stage8V2ActionSpaceGatePassed !== true) throw new Error('stage8 v2 action-space evidence failed');
  assertHex(verificationEvidence.readinessRegressionSha256, 'readinessRegressionSha256', 64);
  assertHex(verificationEvidence.stage8V2GateRegressionSha256, 'stage8V2GateRegressionSha256', 64);
  const implementationGates = {
    acceptedDesignBound: true,
    gameIdSplitDeterministic: verificationEvidence.readinessRegressionPassed,
    calibrationOnlyScaleFit: verificationEvidence.readinessRegressionPassed,
    finalTestOneShotFailClosed: verificationEvidence.readinessRegressionPassed,
    labelZeroSumValidated: verificationEvidence.readinessRegressionPassed,
    scaleNonDegeneracyFrozen: verificationEvidence.readinessRegressionPassed,
    sameSignNoDegradationFrozen: verificationEvidence.readinessRegressionPassed,
    privacyAllowlistStrict: verificationEvidence.readinessRegressionPassed,
    stage8V2LineageVerified: verificationEvidence.stage8V2ActionSpaceGatePassed,
    downstreamAuthorizationRefused: verificationEvidence.readinessRegressionPassed,
  };
  const executionPrerequisites = {
    p0RuleCoreAccepted: true,
    p0PageAccepted: true,
    stage8V2ThreeLayerGateAccepted: true,
    v2ValueModelAvailable: prerequisites.v2ValueModelAvailable === true,
    v2CalibrationCorpusAvailable: prerequisites.v2CalibrationCorpusAvailable === true,
  };
  const status = executionPrerequisites.v2ValueModelAvailable && executionPrerequisites.v2CalibrationCorpusAvailable
    ? 'fixture-readiness-passed-real-offline-gate-not-opened'
    : 'fixture-readiness-passed-real-offline-gate-blocked';
  const result = {
    schemaVersion: 'stage8-c4-value-calibration-readiness-preflight-v1',
    status,
    designSha256: input.designSha256.toUpperCase(),
    protocol: H_C4_PROTOCOL,
    lineage: verifiedLineage,
    verificationEvidence: { ...verificationEvidence },
    implementationGates,
    executionPrerequisites,
    authorizations: { ...authorizations },
  };
  return { ...result, preflightDigest: stableHc4Digest(result) };
}