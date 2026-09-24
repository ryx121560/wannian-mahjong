import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-added-kong-browser-parity-'));

function compileTree(sourceDir, outputDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const outputPath = path.join(outputDir, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) {
      fs.mkdirSync(outputPath, { recursive: true });
      compileTree(sourcePath, outputPath);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: sourcePath,
    });
    fs.writeFileSync(outputPath, output.outputText, 'utf8');
  }
}

function normalizeWildcard(result) {
  return JSON.parse(JSON.stringify(result));
}

try {
  const browserPath = path.join(root, 'public/game/rule_engine.js');
  const browserSource = fs.readFileSync(browserPath, 'utf8');
  const browserHash = crypto.createHash('sha256').update(browserSource).digest('hex');
  assert.match(browserSource, /if \(hand\[i\] !== zhiChanDrawTile\)\s*continue;/, 'browser rule bundle must retain the reverse wildcard replacement guard');
  assert.match(browserSource, /for \(const replacement of tile_utils_1\.ALL_TILE_KEYS\)/, 'browser rule bundle must retain the reverse wildcard replacement candidates');

  compileTree(path.join(root, 'src/game/rules'), path.join(tempRoot, 'rules'));
  const sourceRules = require(path.join(tempRoot, 'rules/index.js'));
  const browserContext = {};
  vm.createContext(browserContext);
  vm.runInContext(browserSource, browserContext, { filename: browserPath });
  const browserRules = browserContext.WannianRuleEngine;
  assert.ok(browserRules, 'browser rule bundle must expose WannianRuleEngine');

  const forward = {
    hand: ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7', 'wan6', 'wan7', 'wan8', 'dong', 'bai'],
    melds: [],
    drawTile: 'dong',
    expected: { isTrueWin: false, isFakeWin: true, fakeWinReplacement: { originalTile: 'bai', replacedBy: 'dong' } },
  };
  const reverse = {
    hand: ['tong3', 'tiao8', 'tiao4', 'tong3', 'tong5', 'tiao3', 'tong7', 'tiao6', 'tiao2', 'tiao7', 'tiao5'],
    melds: [{ type: 'mingGang', tiles: ['tiao9', 'tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }],
    drawTile: 'tiao5',
    expected: { isTrueWin: false, isFakeWin: true, fakeWinReplacement: { originalTile: 'tiao5', replacedBy: 'tong6' } },
  };
  for (const fixture of [forward, reverse]) {
    const sourceResult = normalizeWildcard(sourceRules.resolveWildcard(fixture.hand, fixture.melds, fixture.drawTile));
    const browserResult = normalizeWildcard(browserRules.resolveWildcard(fixture.hand, fixture.melds, fixture.drawTile));
    assert.deepEqual(sourceResult, fixture.expected, 'source resolver must preserve the expected wildcard direction');
    assert.deepEqual(browserResult, sourceResult, 'browser resolver must exactly match source resolver');
  }

  const addedKongInput = {
    owner: 0,
    kongTile: 'tiao9',
    preKongHand: ['tong3', 'tiao8', 'tiao4', 'tong3', 'tong5', 'tiao3', 'tong7', 'tiao6', 'tiao2', 'tiao7', 'tiao9'],
    melds: [{ type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }],
    drawTile: 'tiao5',
    scores: [100, 100, 100, 100],
    robKongState: { phase: 'discarding', currentPlayer: 0, players: [{ hand: ['tong3', 'tiao8', 'tiao4', 'tong3', 'tong5', 'tiao3', 'tong7', 'tiao6', 'tiao2', 'tiao7', 'tiao9'], melds: [{ type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }] }, { hand: [], melds: [] }, { hand: [], melds: [] }, { hand: [], melds: [] }], melds: [[{ type: 'peng', tiles: ['tiao9', 'tiao9', 'tiao9'], fromPlayer: 2 }], [], [], []], discards: [[], [], [], []], turn: 0, dealer: 0, scores: [100, 100, 100, 100], wallTiles: [], passRecords: [] },
  };
  const sourceAddedKong = sourceRules.resolveAddedKongDraw(addedKongInput);
  const browserAddedKong = browserRules.resolveAddedKongDraw(addedKongInput);
  assert.equal(sourceAddedKong.outcome, 'addedKongFakeWin');
  assert.deepEqual(JSON.parse(JSON.stringify(browserAddedKong)), JSON.parse(JSON.stringify(sourceAddedKong)), 'browser added-kong result must match the source core');
  assert.deepEqual(browserAddedKong.settlement.delta, [6, -2, -2, -2]);
  assert.ok(browserAddedKong.handAfterDraw.includes('tiao5'));
  assert.equal(browserAddedKong.handAfterDraw.includes('tong6'), false);

  console.log(`p0 added-kong wildcard browser parity regression: passed (${browserHash})`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
