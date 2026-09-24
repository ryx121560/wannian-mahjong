import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const root = process.cwd();
const sourceDir = path.join(root, 'src/game/rules');
const compiledDir = path.join(os.tmpdir(), `wannian-normal-concealed-kong-${process.pid}`);
const require = createRequire(import.meta.url);

function loadRules() {
  fs.rmSync(compiledDir, { recursive: true, force: true });
  fs.mkdirSync(compiledDir, { recursive: true });
  for (const file of fs.readdirSync(sourceDir).filter((name) => name.endsWith('.ts'))) {
    const sourcePath = path.join(sourceDir, file);
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true },
      fileName: sourcePath,
    }).outputText;
    fs.writeFileSync(path.join(compiledDir, file.replace(/\.ts$/, '.js')), output);
  }
  return require(path.join(compiledDir, 'index.js'));
}

const rules = loadRules();
const scores = [100, 100, 100, 100];
const winner = 0;
const anGang = { type: 'anGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'] };
const reconstructedHandAfterKong = [
  'wan4', 'wan4', 'wan4',
  'wan8', 'wan8',
  'tiao2', 'tiao3', 'tiao4',
  'tong5', 'tong5',
];
const preKongHand = ['tong6', 'tong6', 'tong6', 'tong6', ...reconstructedHandAfterKong];

function resolve(drawTile) {
  return rules.resolveConcealedKongDraw({
    owner: winner,
    kongTile: 'tong6',
    preKongHand,
    handAfterKong: reconstructedHandAfterKong,
    melds: [anGang],
    drawTile,
  });
}

function settle(drawTile) {
  return rules.scoreConcealedKongSettlement({
    action: {
      owner: winner,
      kongTile: 'tong6',
      preKongHand,
      handAfterKong: reconstructedHandAfterKong,
      melds: [anGang],
      drawTile,
    },
    winner,
    scores,
  });
}

// Product-confirmed replay: supplement wan6 is a normal concealed-kong fake
// win. It never becomes a forced run or a discard state.
const fake = resolve('wan6');
assert.equal(fake.outcome, 'concealedKongFakeWin');
assert.equal(fake.mustDiscard, false);
assert.equal(fake.robKongWindow, false);
assert.deepEqual(settle('wan6').delta, [12, -4, -4, -4]);

for (const drawTile of ['wan8', 'tong5']) {
  const trueWin = resolve(drawTile);
  assert.equal(trueWin.outcome, 'concealedKongTrueWin', `${drawTile} must be a normal concealed-kong true win`);
  assert.equal(trueWin.mustDiscard, false);
  assert.equal(trueWin.robKongWindow, false);
  assert.deepEqual(settle(drawTile).delta, [24, -8, -8, -8]);
}

// Game 29 equivalent: after a legal tong9 concealed kong, nan can replace the
// unpaired tiao7 and completes 456-tiao plus nan-nan as a resource fake win.
const game29Action = {
  owner: 2,
  kongTile: 'tong9',
  preKongHand: ['tong9', 'tong9', 'tong9', 'tong9', 'tiao4', 'tiao5', 'tiao6', 'tiao7'],
  handAfterKong: ['tiao4', 'tiao5', 'tiao6', 'tiao7'],
  melds: [
    { type: 'peng', tiles: ['bai', 'bai', 'bai'] },
    { type: 'peng', tiles: ['tong3', 'tong3', 'tong3'] },
    { type: 'anGang', tiles: ['tong9', 'tong9', 'tong9', 'tong9'] },
  ],
  drawTile: 'nan',
};
const game29Fake = rules.resolveConcealedKongDraw(game29Action);
assert.equal(game29Fake.outcome, 'concealedKongFakeWin');
assert.equal(game29Fake.mustDiscard, false);
assert.deepEqual(game29Fake.fakeWinReplacement, { originalTile: 'tiao7', replacedBy: 'nan' });
assert.deepEqual(rules.scoreConcealedKongSettlement({ action: game29Action, winner: 2, scores }).payments, [4, 4, 0, 4]);
assert.deepEqual(rules.scoreConcealedKongSettlement({ action: game29Action, winner: 2, scores }).delta, [-4, -4, 12, -4]);
for (const drawTile of ['tiao4', 'tiao7']) {
  const trueAction = { ...game29Action, drawTile };
  assert.equal(rules.resolveConcealedKongDraw(trueAction).outcome, 'concealedKongTrueWin');
  assert.deepEqual(rules.scoreConcealedKongSettlement({ action: trueAction, winner: 2, scores }).delta, [-8, -8, 24, -8]);
}
const nonResourceAction = {
  owner: 0,
  kongTile: 'tong9',
  preKongHand: ['tong9', 'tong9', 'tong9', 'tong9', 'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao1', 'tiao3', 'tong5', 'tong7'],
  handAfterKong: ['wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'tiao1', 'tiao3', 'tong5', 'tong7'],
  melds: [{ type: 'anGang', tiles: ['tong9', 'tong9', 'tong9', 'tong9'] }],
  drawTile: 'dong',
};
assert.equal(rules.resolveConcealedKongDraw(nonResourceAction).outcome, 'concealedKongFailureDiscard');
assert.equal(rules.resolveConcealedKongDraw(nonResourceAction).mustDiscard, true);
assert.throws(() => rules.scoreConcealedKongSettlement({ action: nonResourceAction, winner: 0, scores }), /cannot settle/);

// Payment caps apply independently after all hand-type multipliers.
const capHandAfterKong = ['wan1', 'wan1', 'wan1', 'wan2', 'wan2', 'wan2', 'wan3', 'wan3', 'wan3', 'wan4'];
const capAction = {
  owner: winner,
  kongTile: 'wan6',
  preKongHand: ['wan6', 'wan6', 'wan6', 'wan6', ...capHandAfterKong],
  handAfterKong: capHandAfterKong,
  melds: [{ type: 'anGang', tiles: ['wan6', 'wan6', 'wan6', 'wan6'] }],
  drawTile: 'wan4',
};
const capped = rules.scoreConcealedKongSettlement({ action: capAction, winner, scores });
assert.equal(capped.event, 'concealedKongTrueWin');
assert.deepEqual(capped.payments, [0, 16, 16, 16]);
assert.deepEqual(capped.delta, [48, -16, -16, -16]);
assert.throws(
  () => rules.resolveConcealedKongDraw({
    owner: winner,
    kongTile: 'wan6',
    preKongHand,
    handAfterKong: reconstructedHandAfterKong,
    melds: [anGang],
    drawTile: 'wan6',
  }),
  /concealed-kong-meld-required/,
  'the declared concealed-kong tile must bind to the real four-tile meld',
);

const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

const selfKongExecutor = extractFunction('doSelfKong');
assert.match(selfKongExecutor, /applyPageNormalConcealedKongAction\(p,info\)/, 'ordinary concealed kong must use the core-backed immediate settlement path');
const normalConcealedExecutor = extractFunction('applyPageNormalConcealedKongAction');
assert.match(normalConcealedExecutor, /RULE_ENGINE\.resolveConcealedKongDraw\(/, 'page must derive the outcome from the rule core');
assert.match(normalConcealedExecutor, /RULE_ENGINE\.scoreConcealedKongSettlement\(/, 'page must use core-derived payments');
assert.match(normalConcealedExecutor, /completePageKongSettlement\(p,\{kind:'concealedKong'\}/, 'page must send the trusted core result to the shared settlement path');
assert.match(normalConcealedExecutor, /settlement=resolution\.mustDiscard\?null/, 'ordinary concealed kong must only skip settlement for a core-declared discard result');
assert.match(normalConcealedExecutor, /GS\.phase='discarding'/, 'a core-declared non-resource supplement must continue through the legal discard branch');

const settlementExecutor = extractFunction('completePageKongSettlement');
assert.match(settlementExecutor, /action\.kind==='concealedKong'\?'concealed-kong-settled':'kong-settled'/, 'settled ordinary concealed kong must persist its trusted summary');

const pageContext = {
  RULE_ENGINE: rules,
  GS: {
    players: [{ hand: preKongHand.map((key) => ({ k: key })), melds: [], score: 100 }],
    wall: [{ k: 'wan9' }, { k: 'wan6' }],
    newDrawnTile: { k: 'wan4' },
    newDrawnIdx: 13,
    _kc: [0],
  },
  kt: (key) => (typeof key === 'string' ? { k: key } : key),
  tkey: (tile) => (typeof tile === 'string' ? tile : tile.k),
  ruleTiles: (hand) => hand.map((tile) => (typeof tile === 'string' ? tile : tile.k)),
  teq: (left, right) => left.k === right.k,
  ruleMeldsForPlayer: () => [],
  logEvent: (...args) => pageContext.events.push(args),
  events: [],
  completePageKongSettlement: (...args) => { pageContext.settlementArgs = args; return true; },
  settlementArgs: null,
};
vm.createContext(pageContext);
vm.runInContext(extractFunction('removePageTiles'), pageContext, { filename: 'page-remove-tiles.js' });
vm.runInContext(normalConcealedExecutor, pageContext, { filename: 'page-normal-concealed-kong.js' });
assert.equal(pageContext.applyPageNormalConcealedKongAction(0, { type: 'concealed', tile: { k: 'tong6' } }), true);
assert.equal(pageContext.GS.wall.length, 1, 'page must consume one supplement only after core resolution succeeds');
assert.equal(pageContext.GS.players[0].melds[0].concealed, true, 'page must persist an actual concealed meld rather than a synthetic wild marker');
assert.equal(pageContext.events.length, 2, 'page must export auditable ordinary concealed-kong and supplement events');
assert.equal(pageContext.settlementArgs[1].kind, 'concealedKong', 'page must persist the trusted normal concealed-kong settlement category');
assert.equal(pageContext.settlementArgs[2].resolution.outcome, 'concealedKongFakeWin');

function runPageConcealedKong({ hand, melds, wall, tile: kongTile, human = false }) {
  const calls = { settlement: 0, timer: 0, discard: 0, snapshot: 0 };
  const context = {
    RULE_ENGINE: rules,
    GS: {
      phase: 'discarding', cur: 2, players: [
        { name: 'P0', human: true, hand: [], melds: [], score: 100 },
        { name: 'P1', human: false, hand: [], melds: [], score: 100 },
        { name: 'AI对家', human, hand: hand.map((key) => ({ k: key })), melds, score: 100 },
        { name: 'P3', human: false, hand: [], melds: [], score: 100 },
      ],
      wall: wall.map((key) => ({ k: key })), newDrawnTile: { k: kongTile }, newDrawnIdx: hand.length - 1, _kc: [0, 0, 0],
    },
    kt: (key) => (typeof key === 'string' ? { k: key } : key), tkey: (tile) => (typeof tile === 'string' ? tile : tile.k),
    ruleTiles: (tiles) => tiles.map((tile) => (typeof tile === 'string' ? tile : tile.k)), teq: (left, right) => left.k === right.k,
    ruleMeldsForPlayer: (player) => context.GS.players[player].melds.map((meld) => ({ type: meld.count === 4 && meld.concealed ? 'anGang' : 'peng', tiles: Array(meld.count).fill(meld.tile.k) })),
    logEvent: (...args) => context.events.push(args), events: [], completePageKongSettlement: (...args) => { calls.settlement += 1; context.settlementArgs = args; context.GS.phase = 'ended'; return true; },
    settlementArgs: null, resetPageKongResponseState: () => {}, collectPageKongDeclarations: () => [], setMsg: () => {}, render: () => {}, updateBtns: () => {}, updateSuggestion: () => {},
    saveGameSnapshot: () => { calls.snapshot += 1; }, clearTimeout: () => {}, gameSetTimeout: () => { calls.timer += 1; return 0; }, aiDiscard: () => { calls.discard += 1; },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('removePageTiles'), context);
  vm.runInContext(normalConcealedExecutor, context);
  assert.equal(context.applyPageNormalConcealedKongAction(2, { type: 'concealed', tile: { k: kongTile } }), true);
  return { context, calls };
}

const game29Page = runPageConcealedKong({
  hand: game29Action.preKongHand,
  melds: [{ tile: { k: 'bai' }, count: 3 }, { tile: { k: 'tong3' }, count: 3 }],
  wall: ['nan'],
  tile: 'tong9',
});
assert.equal(game29Page.context.GS.phase, 'ended', 'AI resource fake win must end immediately');
assert.equal(game29Page.calls.settlement, 1);
assert.equal(game29Page.calls.timer, 0, 'settled AI resource fake win must not schedule an AI discard');
assert.equal(game29Page.context.settlementArgs[2].settlement.delta[2], 12);
assert.equal(game29Page.context.settlementArgs[2].resolution.outcome, 'concealedKongFakeWin');

const nonResourcePage = runPageConcealedKong({ hand: nonResourceAction.preKongHand, melds: [], wall: ['dong'], tile: 'tong9' });
assert.equal(nonResourcePage.context.GS.phase, 'discarding');
assert.equal(nonResourcePage.calls.settlement, 0, 'non-resource supplement must not settle');
assert.equal(nonResourcePage.calls.timer, 1, 'AI non-resource supplement must schedule one legal discard');
assert.equal(nonResourcePage.context.GS.players[2].score, 100);
assert.equal(nonResourcePage.context.GS.wall.length, 0);
assert.equal(nonResourcePage.context.GS.players[2].melds[0].concealed, true);
assert.deepEqual(JSON.parse(JSON.stringify(nonResourcePage.context.GS.players[2].hand.map((tile) => tile.k).sort())), nonResourceAction.handAfterKong.concat('dong').sort());

console.log('normal concealed kong regression: passed');
