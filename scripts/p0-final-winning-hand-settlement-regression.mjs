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

function tile(key) {
  return { k: key };
}

const terminalKeys = [
  'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai',
  'wan3', 'wan6', 'wan9', 'tong9', 'tiao2', 'tiao5', 'tiao8',
];
const concealedKeys = terminalKeys.filter((key) => key !== 'dong');

function createSettlementRuntime(winType) {
  const savedLogs = [];
  const summaries = [];
  const snapshots = [];
  const payer = winType === '抢杠' ? 2 : 1;
  const context = {
    RULE_ENGINE: loadRules(),
    GS: {
      phase: 'responding', cur: 0, turn: 9, wall: [],
      players: Array.from({ length: 4 }, (_, index) => ({
        name: `P${index}`, human: index === 0, score: 100,
        hand: index === 0 ? concealedKeys.map(tile) : [], melds: [],
      })),
      lastDiscard: tile('dong'), lastDiscardP: winType === '抢杠' ? 1 : payer,
      newDrawnTile: null, newDrawnIdx: -1,
      _robKongTarget: winType === '抢杠' ? payer : null,
      _respTimer: null, _resp: null, _respP: 0, _responseKind: 'win',
      _kc: {}, _gameLog: { gameId: 'fixture', events: [] },
    },
    _selfPlay: { running: false, audit: null },
    window: {},
    document: { getElementById: () => ({ style: {}, textContent: '' }) },
    console: { error: () => {}, warn: () => {} },
    totalGamesPlayed: 0,
    tkey: (value) => value.k,
    clearTimeout: () => {}, clearSelectedTile: () => {},
    invalidatePageKongResources: () => {}, clearAllDrawMarkers: () => {},
    finalizeRecommendationSummary: () => {}, configureAiLearning: () => {},
    setSelfPlayUiState: () => {}, setMsg: () => {}, render: () => {},
    updateBtns: () => {}, saveGameSnapshot: (reason) => snapshots.push(reason),
    persistSettledScores: () => -1, logEvent: () => {},
    saveGameLog: (entry) => savedLogs.push(entry),
    renderFinalRecommendationPanel: () => {},
    commitTopSettlementSummary: (result) => summaries.push(result),
    _spOnGameEnd: () => {}, showWinDlg: () => {},
  };
  vm.createContext(context);
  for (const name of [
    'ruleTiles', 'ruleMeldsFromPlayer', 'ruleMeldsForPlayer', 'concealedHand',
    'effectiveHand', 'ruleWinMethod', 'ruleClassification', 'classifyWin',
    'calcScore', 'captureSettlementScoreDeltas', 'selfPlayAudit', 'auditWinHand',
    'winAuditSnapshot', 'auditFinalWinBeforeSettlement', 'formatWinSettlementText',
    'applyWin',
  ]) {
    vm.runInContext(extractFunction(name), context, { filename: `page-${name}.js` });
  }
  return { context, savedLogs, summaries, snapshots, payer };
}

function assertSpecialSettlement(winType) {
  const runtime = createSettlementRuntime(winType);
  const audit = runtime.context.auditFinalWinBeforeSettlement(0, winType);
  assert.equal(audit.ok, true, `${winType} final audit must accept the complete terminal hand`);
  assert.equal(audit.ruleResult.handType, '七字半正宗', `${winType} audit must classify the special hand`);
  assert.equal(audit.ruleResult.baseScore, 4, `${winType} audit must retain base score 4`);
  assert.equal(audit.hand.length, 14, `${winType} audit must expose the complete terminal hand to settlement`);
  assert.equal(audit.hand.filter((value) => value.k === 'dong').length, 1, `${winType} audit must include the winning tile exactly once`);
  assert.deepEqual(Array.from(audit.ruleMelds), [], `${winType} fixture must retain its real empty meld context`);

  runtime.context.applyWin(0, winType);

  const expectedPayment = winType === '抢杠' ? 6 : 8;
  const expectedScores = [100 + expectedPayment, 100, 100, 100];
  expectedScores[runtime.payer] = 100 - expectedPayment;
  assert.deepEqual(
    Array.from(runtime.context.GS.players, (player) => player.score),
    expectedScores,
    `${winType} settlement must preserve its existing payment rule`,
  );
  assert.equal(runtime.context.GS._lastResult.huType, '七字半正宗', `${winType} summary must use the audited classification`);
  assert.equal(runtime.context.GS._lastResult.pts, expectedPayment, `${winType} summary must report the special-hand payment`);
  assert.deepEqual(Array.from(runtime.context.GS._lastResult.scoreDeltas), expectedScores.map((score) => score - 100));
  assert.equal(runtime.savedLogs.length, 1, `${winType} must write one settlement log`);
  assert.equal(runtime.savedLogs[0].huType, '七字半正宗', `${winType} log classification must match the audit`);
  assert.equal(runtime.savedLogs[0].pts, expectedPayment, `${winType} log payment must match the audit`);
  const loggedHand = runtime.savedLogs[0].hand.split(',');
  assert.equal(loggedHand.length, 14, `${winType} log must contain the complete terminal hand`);
  assert.equal(loggedHand.filter((key) => key === 'dong').length, 1, `${winType} winning tile must be included exactly once`);
  assert.equal(runtime.summaries.length, 1, `${winType} must persist one trusted top summary`);
  assert.equal(runtime.snapshots.includes('win-settled'), true, `${winType} must persist the settled result`);
}

assertSpecialSettlement('点炮');
assertSpecialSettlement('抢杠');

console.log('P0 final winning-hand settlement regression passed (2/2).');
