import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const root = process.cwd();
const compiledDir = path.join(os.tmpdir(), `wannian-p0-visible-declarations-${process.pid}`);
const require = createRequire(import.meta.url);

function compileRules(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    if (!name.endsWith('.ts')) continue;
    const from = path.join(source, name);
    const output = ts.transpileModule(fs.readFileSync(from, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true },
      fileName: from,
    }).outputText;
    fs.writeFileSync(path.join(destination, name.replace(/\.ts$/, '.js')), output);
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production function ${name}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

try {
  compileRules(path.join(root, 'src/game/rules'), compiledDir);
  const rules = require(path.join(compiledDir, 'index.js'));
  assert.equal(typeof rules.canDeclareSpecialKongAction, 'function', 'rule core must expose a draw-free special-kong declaration validator');

  const visibleForcedDeclaration = {
    kind: 'forcedRunConcealed',
    input: {
      owner: 0,
      kongTile: 'tong6',
      preKongHand: ['tong6', 'tong6', 'tong6', 'tong6', 'wan4', 'wan4', 'wan4', 'wan8', 'wan8', 'tiao2', 'tiao3', 'tiao4', 'tong5', 'tong5'],
      handAfterKong: ['wan4', 'wan4', 'wan4', 'wan8', 'wan8', 'tiao2', 'tiao3', 'tiao4', 'tong5', 'tong5'],
      melds: [{ type: 'anGang', tiles: ['tong6', 'tong6', 'tong6', 'tong6'] }],
    },
  };
  assert.equal(rules.canDeclareSpecialKongAction(visibleForcedDeclaration), true, 'forced-run declaration must be derived from visible pre-kong state only');
  for (const drawTile of ['wan6', 'wan8']) {
    assert.doesNotThrow(
      () => rules.resolveForcedRunConcealed({ ...visibleForcedDeclaration.input, drawTile }),
      `wall-top ${drawTile} may change outcome but must not invalidate a declared forced run`,
    );
  }

  const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
  for (const name of ['pageSpecialActionCanDeclare', 'collectPageSpecialKongChoices', 'canSelfKong', 'preparePageChainKongAction', 'preparePageAddedKongChainAction']) {
    const body = extractFunction(html, name);
    assert.doesNotMatch(body, /(?:GS\.)?wall|preflightPage(?:Special)?KongResolution/, `${name} declaration path must not inspect the wall or execute preflight`);
  }

  const context = {
    GS: null,
    ruleTiles: (hand) => hand.map((tile) => (typeof tile === 'string' ? tile : tile.k)),
    ruleMeldsForPlayer: () => [],
    pageCandidateKongResources: () => [],
    pageKongResources: () => [],
    hasPageRuleMeld: () => true,
    candidateKongChoiceKey: (kind, tile, sourceTile) => [kind, tile || '', sourceTile || ''].join(':'),
    pageSpecialActionCanDeclare: (action) => action.kind === 'forcedRunConcealed',
    RULE_ENGINE: { canAnGang: () => ['tong6'] },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(html, 'collectPageSpecialKongChoices'), context, { filename: 'page-special-kong-visible-declarations.js' });
  const visibleState = {
    cur: 0, phase: 'discarding', newDrawnTile: { k: 'dong' },
    players: [{ hand: visibleForcedDeclaration.input.preKongHand.map((k) => ({ k })), melds: [] }],
  };
  const choicesByWall = [];
  for (const wall of [[{ k: 'wan6' }], [{ k: 'wan8' }]]) {
    context.GS = { ...visibleState, wall };
    choicesByWall.push(JSON.parse(JSON.stringify(context.collectPageSpecialKongChoices(0))).map((choice) => ({ kind: choice.kind, tile: choice.tile, key: choice.key })));
  }
  assert.deepEqual(choicesByWall[0], choicesByWall[1], 'same visible state must yield an identical special-kong menu regardless of the hidden wall top');
  assert.match(extractFunction(html, 'collectPageSpecialKongChoices'), /pageSpecialActionCanDeclare\(action\)/, 'the menu must call the draw-free declaration validator');
  const protectedState = { ...visibleState };
  Object.defineProperty(protectedState, 'wall', { get() { throw new Error('declaration path must not access wall'); } });
  context.GS = protectedState;
  assert.doesNotThrow(() => context.collectPageSpecialKongChoices(0), 'the declaration menu must remain usable when the hidden wall is inaccessible');

  console.log('P0 special-kong visible declaration regression: passed');
} finally {
  fs.rmSync(compiledDir, { recursive: true, force: true });
}