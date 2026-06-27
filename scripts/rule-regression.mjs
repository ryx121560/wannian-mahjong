import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/rules/index.ts');
const casesPath = path.join(root, 'docs/rule-standard-cases.json');
const require = createRequire(import.meta.url);

function loadRuleEngine() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true },
    fileName: sourcePath,
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} }, require };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: sourcePath });
  return sandbox.module.exports;
}

function sameArray(actual, expected) {
  return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function includesAll(actual, expected) {
  return expected.every((value) => actual.includes(value));
}

function excludesAll(actual, expected) {
  return expected.every((value) => !actual.includes(value));
}

function check(condition, message, failures) {
  if (!condition) failures.push(message);
}

const rules = loadRuleEngine();
const data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const failed = [];
let passed = 0;

for (const testCase of data.cases) {
  const failures = [];
  const expected = testCase.expected || {};
  try {
    if (testCase.hand && ('canWin' in expected || expected.route || expected.handType)) {
      const result = rules.canWin(testCase.hand, testCase.context || {});
      if ('canWin' in expected) check(result.canWin === expected.canWin, `canWin expected ${expected.canWin}, actual ${result.canWin}`, failures);
      if (expected.route) check(result.route === expected.route, `route expected ${expected.route}, actual ${result.route}`, failures);
      if (expected.handType) check(result.handType === expected.handType, `handType expected ${expected.handType}, actual ${result.handType}`, failures);
    }
    if (testCase.hand && expected.recommendedRoute) {
      const result = rules.getShanten(testCase.hand, testCase.context || {});
      check(result.recommendedRoute === expected.recommendedRoute, `recommendedRoute expected ${expected.recommendedRoute}, actual ${result.recommendedRoute}`, failures);
    }
    if (testCase.settlement) {
      const result = rules.scoreSettlement({ ...testCase.settlement, hand: testCase.hand });
      if (expected.scoreDelta) check(sameArray(result.delta, expected.scoreDelta), `scoreDelta expected ${JSON.stringify(expected.scoreDelta)}, actual ${JSON.stringify(result.delta)}`, failures);
      if ('payer' in expected) check(result.payer === expected.payer, `payer expected ${expected.payer}, actual ${result.payer}`, failures);
      if (expected.handType) check(result.handType === expected.handType, `handType expected ${expected.handType}, actual ${result.handType}`, failures);
    }
    if (testCase.state) {
      const actions = rules.getLegalActions(testCase.state, 0);
      if (expected.legalActions) check(includesAll(actions, expected.legalActions), `legalActions expected ${JSON.stringify(expected.legalActions)}, actual ${JSON.stringify(actions)}`, failures);
      if (expected.notLegalActions) check(excludesAll(actions, expected.notLegalActions), `notLegalActions expected absent ${JSON.stringify(expected.notLegalActions)}, actual ${JSON.stringify(actions)}`, failures);
    }
  } catch (error) {
    failures.push(error && error.stack ? error.stack : String(error));
  }

  if (failures.length) failed.push({ id: testCase.id, title: testCase.title, failures });
  else passed += 1;
}

console.log('Rule regression completed');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed.length}`);

if (failed.length) {
  console.log('\nFailed cases:');
  for (const item of failed) {
    console.log(`- ${item.id} ${item.title}`);
    for (const failure of item.failures) console.log(`  ${failure}`);
  }
  process.exit(1);
}
