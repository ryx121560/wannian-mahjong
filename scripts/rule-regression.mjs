import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const sourcePath = path.join(root, 'src/game/rules/index.ts');
const sourceDir = path.dirname(sourcePath);
const compiledDir = path.join(os.tmpdir(), `wannian-rule-regression-cjs-${process.pid}`);
const casesPath = path.join(root, 'docs/rule-standard-cases.json');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const options = {
  level: readArg('--level'),
  category: readArg('--category'),
  report: readArg('--report') || 'text',
};

function readArg(name) {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function loadRuleEngine() {
  fs.rmSync(compiledDir, { recursive: true, force: true });
  fs.mkdirSync(compiledDir, { recursive: true });
  for (const file of fs.readdirSync(sourceDir).filter((name) => name.endsWith('.ts'))) {
    const filePath = path.join(sourceDir, file);
    const source = fs.readFileSync(filePath, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true },
      fileName: filePath,
    }).outputText;
    fs.writeFileSync(path.join(compiledDir, file.replace(/\.ts$/, '.js')), compiled);
  }
  return require(path.join(compiledDir, 'index.js'));
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

function sameValue(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const rules = loadRuleEngine();
const data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const failed = [];
let passed = 0;
const byCategory = {};
const extraCases = [
  {
    id: 'rule-no-cross-suit-pair-win-001',
    level: 'L1',
    category: 'bug-regression',
    hand: ['tong2', 'tong3', 'tong4', 'tong5', 'tong6', 'tong7', 'tong8', 'dong', 'nan', 'bei', 'tiao8'],
    context: { melds: [{ type: 'angang', tiles: ['wan7', 'wan7', 'wan7', 'wan7'] }], winTile: 'tiao8', winType: '自摸' },
    expected: { canWin: false },
  },
  {
    id: 'rule-same-tile-pair-win-001',
    level: 'L1',
    category: 'bug-regression',
    hand: ['tong2', 'tong3', 'tong4', 'tong5', 'tong6', 'tong7', 'tong8', 'dong', 'nan', 'bei', 'tong8'],
    context: { melds: [{ type: 'angang', tiles: ['wan7', 'wan7', 'wan7', 'wan7'] }], winTile: 'tong8', winType: '自摸' },
    expected: { canWin: true },
  },
];

const cases = data.cases.concat(extraCases).filter((testCase) => {
  if (options.level && testCase.level !== options.level) return false;
  if (options.category && !(testCase.category || 'uncategorized').includes(options.category)) return false;
  return true;
});

for (const testCase of cases) {
  const failures = [];
  const expected = testCase.expected || {};
  const category = testCase.category || 'uncategorized';
  byCategory[category] = byCategory[category] || { total: 0, passed: 0 };
  byCategory[category].total += 1;
  try {
    if (testCase.hand && ('canWin' in expected || expected.route || expected.handType)) {
      const result = rules.canWin(testCase.hand, testCase.context || {});
      if ('canWin' in expected) check(result.canWin === expected.canWin, `canWin expected ${expected.canWin}, actual ${result.canWin}`, failures);
      if (expected.route) check(result.route === expected.route, `route expected ${expected.route}, actual ${result.route}`, failures);
      if (expected.handType) check(result.handType === expected.handType, `handType expected ${expected.handType}, actual ${result.handType}`, failures);
    }
    if (testCase.hand && (expected.handTypes || 'baseScore' in expected)) {
      const result = rules.classifyHand(testCase.hand, testCase.context?.melds || [], testCase.context?.winTile, testCase.context?.winType);
      if (expected.handTypes) check(includesAll(result.handTypes, expected.handTypes), `handTypes expected include ${JSON.stringify(expected.handTypes)}, actual ${JSON.stringify(result.handTypes)}`, failures);
      if ('baseScore' in expected) check(result.baseScore === expected.baseScore, `baseScore expected ${expected.baseScore}, actual ${result.baseScore}`, failures);
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
    if (testCase.scoreCalc) {
      const result = rules.calculateScore(testCase.scoreCalc);
      if ('winnerGain' in expected) check(result.winnerGain === expected.winnerGain, `winnerGain expected ${expected.winnerGain}, actual ${result.winnerGain}`, failures);
      if ('scorePerPlayer' in expected) check(sameArray(result.scorePerPlayer, expected.scorePerPlayer), `scorePerPlayer expected ${JSON.stringify(expected.scorePerPlayer)}, actual ${JSON.stringify(result.scorePerPlayer)}`, failures);
      if ('capped' in expected) check(result.capped === expected.capped, `capped expected ${expected.capped}, actual ${result.capped}`, failures);
    }
    if (testCase.state) {
      const actions = rules.getLegalActions(testCase.state, 0);
      if (expected.legalActions) check(includesAll(actions, expected.legalActions), `legalActions expected ${JSON.stringify(expected.legalActions)}, actual ${JSON.stringify(actions)}`, failures);
      if (expected.notLegalActions) check(excludesAll(actions, expected.notLegalActions), `notLegalActions expected absent ${JSON.stringify(expected.notLegalActions)}, actual ${JSON.stringify(actions)}`, failures);
    }
    if (testCase.tileUtil) {
      const { fn, args } = testCase.tileUtil;
      let value;
      if (fn === 'isWindArrowPair') value = { isWind: rules.isWind(args[0]), isArrow: rules.isArrow(args[0]) };
      else value = rules[fn](...(Array.isArray(args) ? args : [args]));
      if ('value' in expected) check(sameValue(value, expected.value), `${fn} expected ${JSON.stringify(expected.value)}, actual ${JSON.stringify(value)}`, failures);
      if ('isWind' in expected) check(value.isWind === expected.isWind && value.isArrow === expected.isArrow, `${fn} expected ${JSON.stringify(expected)}, actual ${JSON.stringify(value)}`, failures);
    }
    if (testCase.meldCheck) {
      const { fn, input } = testCase.meldCheck;
      let value;
      if (fn === 'canPeng') value = rules.canPeng(input.hand, input.discardTile);
      if (fn === 'canAnGang') value = rules.canAnGang(input.hand);
      if (fn === 'canMingGang') value = rules.canMingGang(input.hand, input.melds, input.selfDrawnTile);
      if (fn === 'canZhiChan') value = rules.canZhiChan(input.hand, input.melds, input.isTenpai, input.discardTile, input.discardPlayer).canZhiChan;
      if (fn === 'canLianGang') value = rules.canLianGang(input.hand, input.melds, input.lastGangDrawTile).canLianGang;
      if (fn === 'canQiangXingPaoGang') value = rules.canQiangXingPaoGang(input.hand, input.melds || [], input.isTenpai, input.discardTile);
      if (fn === 'checkQiangXingPaoGangResult') value = rules.checkQiangXingPaoGangResult(input);
      if (fn === 'getGangDrawTile') value = rules.getGangDrawTile(input.wallTiles).drawTile;
      check(sameValue(value, expected.value), `${fn} expected ${JSON.stringify(expected.value)}, actual ${JSON.stringify(value)}`, failures);
    }
    if (testCase.wildcard) {
      const result = rules.resolveWildcard(testCase.wildcard.hand, testCase.wildcard.melds || [], testCase.wildcard.drawTile);
      if ('isTrueWin' in expected) check(result.isTrueWin === expected.isTrueWin, `isTrueWin expected ${expected.isTrueWin}, actual ${result.isTrueWin}`, failures);
      if ('isFakeWin' in expected) check(result.isFakeWin === expected.isFakeWin, `isFakeWin expected ${expected.isFakeWin}, actual ${result.isFakeWin}`, failures);
      if (expected.fakeWinReplacement) check(sameValue(result.fakeWinReplacement, expected.fakeWinReplacement), `fakeWinReplacement expected ${JSON.stringify(expected.fakeWinReplacement)}, actual ${JSON.stringify(result.fakeWinReplacement)}`, failures);
    }
    if (testCase.noColor) {
      const value = rules.checkNoColor(testCase.noColor.hand, testCase.noColor.melds || [], testCase.noColor.drawTile, testCase.noColor.handTypes || []);
      check(value === expected.value, `noColor expected ${expected.value}, actual ${value}`, failures);
    }
    if (testCase.passRule) {
      const value = rules.canWinAfterPass ? rules.canWinAfterPass(testCase.passRule) : !testCase.passRule.passRecords.some((record) => record.player === testCase.passRule.player && record.tile === testCase.passRule.tile && record.round === testCase.passRule.round);
      check(value === expected.canWinAfterPass, `canWinAfterPass expected ${expected.canWinAfterPass}, actual ${value}`, failures);
    }
    if (testCase.tenpai) {
      const result = rules.checkTenpai(testCase.tenpai.hand, testCase.tenpai.melds || []);
      check(result.isTenpai === expected.isTenpai, `isTenpai expected ${expected.isTenpai}, actual ${result.isTenpai}`, failures);
      if (expected.waitingTiles) check(includesAll(result.waitingTiles, expected.waitingTiles), `waitingTiles expected include ${JSON.stringify(expected.waitingTiles)}, actual ${JSON.stringify(result.waitingTiles)}`, failures);
      if ('minWaitCount' in expected) check(result.waitingTiles.length >= expected.minWaitCount, `waitingTiles length expected >= ${expected.minWaitCount}, actual ${result.waitingTiles.length}`, failures);
    }
    if (testCase.shanten) {
      const result = rules.getShanten(testCase.shanten.hand, testCase.shanten.context || {});
      check(result.shanten <= expected.maxShanten, `shanten expected <= ${expected.maxShanten}, actual ${result.shanten}`, failures);
      if ('exactShanten' in expected) check(result.shanten === expected.exactShanten, `shanten expected ${expected.exactShanten}, actual ${result.shanten}`, failures);
    }
    if (testCase.purity) {
      const stable = Array.from({ length: testCase.purity.repeat || 100 }, () => JSON.stringify(rules.canWin(testCase.purity.hand, testCase.purity.context || {})));
      check(new Set(stable).size === 1, `purity expected stable result, actual unique count ${new Set(stable).size}`, failures);
    }
    if (testCase.performance) {
      const start = Date.now();
      const fn = testCase.performance.fn || 'canWin';
      for (let i = 0; i < (testCase.performance.repeat || 100); i += 1) {
        if (fn === 'getShanten') rules.getShanten(testCase.performance.hand, testCase.performance.context || {});
        else rules.canWin(testCase.performance.hand, testCase.performance.context || {});
      }
      const avg = (Date.now() - start) / (testCase.performance.repeat || 100);
      check(avg <= expected.maxMs, `${fn} performance expected <= ${expected.maxMs}ms, actual ${avg}ms`, failures);
    }
  } catch (error) {
    failures.push(error && error.stack ? error.stack : String(error));
  }

  if (failures.length) failed.push({ id: testCase.id, title: testCase.title || testCase.description, failures });
  else {
    passed += 1;
    byCategory[category].passed += 1;
  }
}

const report = {
  timestamp: new Date().toISOString(),
  totalCases: cases.length,
  passed,
  failed: failed.length,
  passRate: cases.length ? `${Math.round((passed / cases.length) * 10000) / 100}%` : '0%',
  byCategory,
  failedCases: failed,
};

if (options.report === 'json') {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Rule regression completed');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed.length}`);
}

if (failed.length) {
  if (options.report !== 'json') {
    console.log('\nFailed cases:');
    for (const item of failed) {
      console.log(`- ${item.id} ${item.title}`);
      for (const failure of item.failures) console.log(`  ${failure}`);
    }
  }
  process.exit(1);
}
