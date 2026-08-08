import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');
const ruleBundle = fs.readFileSync(path.join(root, 'public/game/rule_engine.js'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production function ${name}`);
  let depth = 0;
  for (let index = html.indexOf('{', start); index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}' && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`unterminated production function ${name}`);
}

function loadRules() {
  const context = { window: {} };
  vm.runInNewContext(ruleBundle, context, { filename: 'rule_engine.js' });
  return context.window.WannianRuleEngine;
}

function gameMelds(tiles = ['tong7', 'tong3', 'tong5']) {
  return tiles.map((tile) => ({ tile, count: 3 }));
}

function ruleMelds(melds) {
  return melds.map((meld) => ({
    type: 'peng',
    tiles: [meld.tile, meld.tile, meld.tile]
  }));
}

function createResponseRuntime(melds) {
  const events = [];
  const context = {
    RULE_ENGINE: loadRules(),
    GS: {
      phase: 'responding',
      cur: 2,
      lastDiscard: 'zhong',
      lastDiscardP: 2,
      turn: 107,
      passRecords: [],
      players: [
        { human: true, hand: ['nan', 'xi', 'xi', 'bei'], melds },
        { human: false, hand: [], melds: [] },
        { human: false, hand: [], melds: [] },
        { human: false, hand: [], melds: [] }
      ]
    },
    tkey: (tile) => tile,
    meetsThresh: () => true,
    canWinAfterPassRuntime: () => true,
    canPongChk: () => false,
    canKongChk: () => false,
    ruleMeldsByCount: (count) => Array.from({ length: count || 0 }, () => ({ type: 'peng', tiles: ['dong', 'dong', 'dong'] })),
    setMsg: (message) => events.push(['message', message]),
    render: () => events.push(['render']),
    updateBtns: () => events.push(['buttons']),
    updateSuggestion: () => events.push(['suggestion']),
    saveGameSnapshot: (reason) => events.push(['snapshot', reason]),
    clearTimeout: () => {},
    gameSetTimeout: () => 0,
    aiRespond: () => events.push(['aiRespond']),
    console: { log: () => {}, error: () => {} }
  };
  vm.createContext(context);
  for (const name of ['ruleTiles', 'normalizedRuleMelds', 'ruleMeldsFromPlayer', 'pageRuleState', 'canHuNormal', 'canWinAfterPassForState', 'canPongChk', 'canKongChk', 'responseResolutionState', 'resolveDiscardResponses', 'checkResponses']) {
    vm.runInContext(extractFunction(name), context, { filename: `runtime-${name}.js` });
  }
  return { context, events };
}

function listWaitsWithRealMelds(melds) {
  const context = {
    RULE_ENGINE: loadRules(),
    ALL_KEYS: ['zhong'],
    tkey: (tile) => tile,
    kt: (tile) => tile,
    aiRemainingCountForWait: () => 1
  };
  vm.createContext(context);
  for (const name of ['normalizedRuleMelds', 'canHuNormal', 'listWaitsWithMelds']) {
    vm.runInContext(extractFunction(name), context, { filename: `wait-${name}.js` });
  }
  return context.listWaitsWithMelds(['nan', 'xi', 'xi', 'bei'], 0, ruleMelds(melds));
}

function runFinalAudit(melds) {
  const failures = [];
  const context = {
    RULE_ENGINE: loadRules(),
    GS: {
      turn: 107,
      lastDiscard: 'zhong',
      lastDiscardP: 2,
      newDrawnTile: null,
      phase: 'responding',
      cur: 2,
      wall: [],
      players: [
        { human: true, score: 100, hand: ['nan', 'xi', 'xi', 'bei'], melds },
        { score: 100, hand: [], melds: [] },
        { score: 100, hand: [], melds: [] },
        { score: 100, hand: [], melds: [] }
      ]
    },
    _selfPlay: { audit: null },
    tkey: (tile) => tile,
    ruleTiles: (hand) => hand.map((tile) => tile),
    ruleWinMethod: () => '点炮',
    console: { error: (...args) => failures.push(args), warn: () => {} }
  };
  vm.createContext(context);
  for (const name of ['ruleMeldsFromPlayer', 'ruleMeldsForPlayer', 'concealedHand', 'selfPlayAudit', 'auditWinHand', 'winAuditSnapshot', 'auditFinalWinBeforeSettlement']) {
    vm.runInContext(extractFunction(name), context, { filename: `audit-${name}.js` });
  }
  return { result: context.auditFinalWinBeforeSettlement(0, '点炮'), audit: context._selfPlay.audit, failures };
}

const rules = loadRules();
const concealedWithDiscard = ['nan', 'xi', 'xi', 'bei', 'zhong'];
const nonHonorMelds = gameMelds();
const eastMelds = gameMelds(['dong', 'dong', 'dong']);

assert.equal(rules.canWin(concealedWithDiscard, { melds: ruleMelds(nonHonorMelds), winTile: 'zhong', winType: '点炮' }).canWin, false, '107 hand with real tong pongs must not win');
assert.deepEqual(
  Array.from(rules.getLegalActions({
    phase: 'responding',
    currentPlayer: 2,
    lastDiscard: 'zhong',
    lastDiscardPlayer: 2,
    players: [{ hand: ['nan', 'xi', 'xi', 'bei'], melds: ruleMelds(nonHonorMelds) }]
  }, 0)),
  ['pass'],
  '107 hand must not expose a win legal action'
);

const negativeRuntime = createResponseRuntime(nonHonorMelds);
negativeRuntime.context.checkResponses();
assert.equal(negativeRuntime.context.GS.canW, false, 'checkResponses must not enable human win for the 107 hand');
assert.notEqual(negativeRuntime.context.GS._responseKind, 'win', 'checkResponses must not select a human win response for the 107 hand');
assert.equal(negativeRuntime.events.some((event) => event[0] === 'snapshot' && event[1] === 'human-win-response'), false, '107 hand must not persist a human win response');

assert.equal(rules.canWin(concealedWithDiscard, { melds: ruleMelds(eastMelds), winTile: 'zhong', winType: '点炮' }).canWin, true, 'real east pongs must retain the all-honor positive case');
const positiveRuntime = createResponseRuntime(eastMelds);
positiveRuntime.context.checkResponses();
assert.equal(positiveRuntime.context.GS.canW, true, 'real east pongs must enable the human win response');
assert.equal(positiveRuntime.context.GS._responseKind, 'win', 'real east pongs must select a win response');

assert.deepEqual(Array.from(listWaitsWithRealMelds(nonHonorMelds)), [], 'wait enumeration must reject the 107 hand with real tong pongs');
assert.deepEqual(Array.from(listWaitsWithRealMelds(eastMelds)), ['zhong'], 'wait enumeration must retain the real east-pong all-honor wait');

const finalAudit = runFinalAudit(nonHonorMelds);
assert.equal(finalAudit.result.ok, false, 'final audit must still block a forced false win');
assert.equal(finalAudit.audit.invalidWins, 1, 'final audit must record invalidWins for a forced false win');
assert.equal(finalAudit.failures.length, 1, 'final audit must emit one invalid-win log');

assert.match(extractFunction('resolveDiscardResponses'), /RULE_ENGINE\.getLegalActions\(pageRuleState\(state\),i\)/, 'response legality must be sourced from the rule-core action list built with real melds');
assert.doesNotMatch(html, /canHuNormal\(handOnly,false,preMl,t\)/, 'response win classification must not receive a meld count');
assert.doesNotMatch(html, /function ruleMeldsByCount\(/, 'rule classification must not synthesize meld tiles from a count');
assert.doesNotMatch(html, /function listWaitsForMeldCount\(/, 'wait enumeration must not classify with a meld count');
assert.match(extractFunction('doKong'), /RULE_ENGINE\.resolveRobKongWinner\(pageRuleState\(GS\),p,tkey\(GS\.lastDiscard\)\)/, 'rob-kong checks must use the core with real meld tiles');
assert.match(extractFunction('applyInitialPageKongAction'), /preflightPageKongResolution\(/, 'kong draw must use the shared core-backed atomic preflight');
assert.match(extractFunction('preflightPageKongResolution'), /resolvePageKongAction\(/, 'the atomic preflight must retain the core-backed settlement bridge');
assert.match(html, /return canSelfWin\(concealedHand\(playerIdx\),winTile,winType,ruleMeldsForPlayer\(playerIdx\)\)/, 'self-draw checks must receive real meld tiles');
assert.match(html, /canHuNormal\(testHand,false,ruleMelds,winTile,'自摸'\)/, 'wait enumeration must receive real meld tiles');

console.log('response real meld context regression: passed');
