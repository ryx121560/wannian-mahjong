import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/stage6-training-data-manifest.json');
const casesPath = path.join(root, 'docs/stage6-data-model-cases.json');

const failures = [];

if (!fs.existsSync(manifestPath)) failures.push('stage6 training data manifest missing');
if (!fs.existsSync(casesPath)) failures.push('stage6 data model cases missing');

const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const cases = fs.existsSync(casesPath) ? JSON.parse(fs.readFileSync(casesPath, 'utf8')) : {};

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
if (!Array.isArray(manifest.ruleGateReports) || manifest.ruleGateReports.length < 4) failures.push('rule gate reports are incomplete');

console.log(JSON.stringify({
  pass: failures.length === 0,
  selfPlayGames: manifest.selfPlayGames || 0,
  trainingDataVersion: manifest.trainingDataVersion || null,
  cases: Array.isArray(cases.cases) ? cases.cases.length : 0,
  failures,
}, null, 2));

if (failures.length) process.exit(1);
