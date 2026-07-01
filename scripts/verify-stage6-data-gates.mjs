import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/stage6-training-data-manifest.json');
const casesPath = path.join(root, 'docs/stage6-data-model-cases.json');
const metricsPath = path.join(root, 'docs/stage6-selfplay-metrics-comparison.json');

const failures = [];

if (!fs.existsSync(manifestPath)) failures.push('stage6 training data manifest missing');
if (!fs.existsSync(casesPath)) failures.push('stage6 data model cases missing');

const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const cases = fs.existsSync(casesPath) ? JSON.parse(fs.readFileSync(casesPath, 'utf8')) : {};
const metrics = fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : {};

if (manifest.schemaVersion !== 'stage6-training-data-manifest-v1') failures.push('wrong manifest schema');
if (!manifest.trainingDataVersion) failures.push('trainingDataVersion missing');
if ((manifest.selfPlayGames || 0) < 50000) failures.push('selfPlayGames must be at least 50000');
if (manifest.personalExportRecordsIncluded !== false) failures.push('personal exported records must not be included');
if (manifest.onlinePlayerDataIncluded !== false) failures.push('online player data must not be included');
if (manifest.ruleGateRequiredBeforeGeneration !== true) failures.push('rule gate must be required before generation');

for (const field of ['modelVersion', 'ruleEngineVersion', 'mctsVersion', 'strongRuleVersion', 'modelDecisionSchemaVersion']) {
  if (!manifest.boundVersions || !manifest.boundVersions[field]) failures.push(`missing bound version ${field}`);
}

const expectedDistribution = cases.distribution || {};
const manifestCoverage = manifest.scenarioCoverage || {};
for (const [category, count] of Object.entries(expectedDistribution)) {
  if (manifestCoverage[category] !== count) failures.push(`scenario coverage ${category}: ${manifestCoverage[category] || 0}, expected ${count}`);
}

if (!Array.isArray(cases.cases) || cases.cases.length !== 150) failures.push('stage6 standard cases must contain 150 cases');
if (!Array.isArray(manifest.ruleGateReports) || manifest.ruleGateReports.length < 7) failures.push('rule gate reports are incomplete');
for (const command of ['verify:stage6-random-invariants', 'verify:stage6-replay', 'compare:stage6-selfplay-metrics']) {
  if (!manifest.ruleGateReports.some((item) => item.includes(command))) failures.push(`missing rule gate command ${command}`);
}

const evidenceFiles = manifest.evidenceFiles || {};
for (const [name, relativePath] of Object.entries(evidenceFiles)) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`missing evidence file ${name}: ${relativePath}`);
}

if (metricsPath && !fs.existsSync(metricsPath)) failures.push('stage6 selfplay metrics report missing');
if (fs.existsSync(metricsPath)) {
  if (metrics.pass !== true) failures.push('stage6 selfplay metrics did not pass');
  if (metrics.acceptance?.averageScoreNotLower !== true) failures.push('average score metric failed');
  if (metrics.acceptance?.dealInNotSignificantlyHigher !== true) failures.push('deal-in risk metric failed');
  if (metrics.acceptance?.illegalRecommendationBlocked !== true) failures.push('illegal block metric failed');
}

console.log(JSON.stringify({
  pass: failures.length === 0,
  selfPlayGames: manifest.selfPlayGames || 0,
  trainingDataVersion: manifest.trainingDataVersion || null,
  cases: Array.isArray(cases.cases) ? cases.cases.length : 0,
  evidenceFiles: Object.keys(evidenceFiles).length,
  selfplayMetricsPass: metrics.pass === true,
  failures,
}, null, 2));

if (failures.length) process.exit(1);
