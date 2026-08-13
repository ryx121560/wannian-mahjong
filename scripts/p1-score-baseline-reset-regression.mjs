import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public/game/wannian-mahjong.html'), 'utf8');

function extractFunction(name) {
  const functionStart = html.indexOf(`function ${name}(`);
  assert.notEqual(functionStart, -1, `missing production function ${name}`);
  const start = html.slice(Math.max(0, functionStart - 6), functionStart) === 'async ' ? functionStart - 6 : functionStart;
  let depth = 0;
  for (let index = html.indexOf('{', start); index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}' && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`unterminated production function ${name}`);
}

assert.match(html, /const SCORE_BASELINE=50;/, 'the page must define one authoritative score baseline');
assert.match(html, /let scores\s*=\s*createBaselineScores\(\)/, 'new sessions must start from the 50-point baseline');
assert.match(extractFunction('loadScores'), /return createBaselineScores\(\)/, 'missing or invalid persistence must fall back to 50');
assert.doesNotMatch(extractFunction('loadScores'), /map\([^)]*=>\s*50\)|scores\s*=\s*createBaselineScores/, 'valid persisted scores must not be migrated at runtime');

const loadContext = {
  fetch: async () => ({ json: async () => ({ scores: [71, 62, 53, 44], totalGames: 19 }) }),
  console,
  Number,
  Array,
  totalGamesPlayed: 0,
  _authoritativeScoresLoaded: false,
  SCORE_BASELINE: 50,
};
vm.createContext(loadContext);
vm.runInContext(extractFunction('createBaselineScores'), loadContext);
vm.runInContext(extractFunction('loadScores'), loadContext);
assert.deepEqual(Array.from(await loadContext.loadScores()), [71, 62, 53, 44], 'valid persisted scores must be loaded unchanged');
assert.equal(loadContext.totalGamesPlayed, 19, 'loading scores must retain totalGames');
assert.equal(loadContext._authoritativeScoresLoaded, true, 'valid persisted scores must mark the authoritative source as loaded');

const failedLoadContext = {
  fetch: async () => { throw new Error('offline'); },
  console,
  Number,
  Array,
  totalGamesPlayed: 0,
  _authoritativeScoresLoaded: false,
  SCORE_BASELINE: 50,
};
vm.createContext(failedLoadContext);
vm.runInContext(extractFunction('createBaselineScores'), failedLoadContext);
vm.runInContext(extractFunction('loadScores'), failedLoadContext);
assert.deepEqual(Array.from(await failedLoadContext.loadScores()), [50, 50, 50, 50], 'failed score loading keeps the existing fallback for idle startup');
assert.equal(failedLoadContext._authoritativeScoresLoaded, false, 'failed score loading must not mark fallback scores as authoritative');

function runRestoreFixture(authoritativeScores, authoritativeLoaded, snapshotScores) {
  const topSettlement = { type: 'discardWin', winner: 2, scoreDeltas: [-8, 0, 8, 0] };
  const restoredState = {
    phase: 'discarding', cur: 0, dealer: 2, turn: 9,
    wall: [{ k: 'wan9' }], discards: [], playerDiscards: [[], [], [], []],
    players: snapshotScores.map((score, seat) => ({ name: `P${seat}`, score, human: seat === 0, hand: [{ k: `wan${seat + 1}` }], melds: [] })),
    _gameLog: { gameSequence: 41 }, _gameSequence: 41, _lastResult: null,
  };
  const elements = { 'bt-selfplay': { textContent: '' }, suggest: { style: {} }, bar: { textContent: '' } };
  const context = {
    GAME_SESSION: { restore: () => ({ ok: true, state: restoredState, gameSequence: 41, topSettlement, totalGames: 77, selfPlayRunning: false, savedAt: '2026-08-13T00:00:00.000Z' }) },
    kt: (tile) => tile,
    GS: { players: [] },
    scores: authoritativeScores.slice(),
    _authoritativeScoresLoaded: authoritativeLoaded,
    _topSettlementSummary: null,
    totalGamesPlayed: 0,
    _selfPlay: { running: false, count: 0 },
    _sessionResumeScheduled: false,
    clearGameTimers() {},
    revalidateRestoredResponseState: () => ({ applied: false }),
    revalidateRestoredKongState: () => ({ applied: false }),
    configureAiLearning() {},
    document: { getElementById: (id) => elements[id] || { textContent: '', style: {} } },
    currentTopSettlementSummary() { return context._topSettlementSummary; },
    setSelfPlayUiState() {}, restoredPhaseMessage() {}, render() {}, updateBtns() {}, updateSuggestion() {}, resumeRestoredGame() {},
    clearGameSnapshot() { throw new Error('valid restore must not clear the snapshot'); },
    saveCalls: 0, saveScores() { context.saveCalls += 1; },
    console,
    Array,
    Number,
    Object,
  };
  vm.createContext(context);
  vm.runInContext(extractFunction('restoreGameSession'), context);
  for (const name of ['currentGameSequence', 'formatCurrentGameLabel', 'formatTopSettlementSummary', 'updateTopScoreBar']) vm.runInContext(extractFunction(name), context);
  assert.equal(context.restoreGameSession({}), true, 'valid in-progress snapshot must restore');
  context.updateTopScoreBar();
  context.topBarText = elements.bar.textContent;
  return context;
}

const migratedRestore = runRestoreFixture([50, 50, 50, 50], true, [103, 95, 90, 108]);
assert.deepEqual(migratedRestore.GS.players.map((player) => player.score), [50, 50, 50, 50], 'authoritative migrated scores must override stale snapshot totals');
assert.deepEqual(Array.from(migratedRestore.scores), [50, 50, 50, 50], 'snapshot restore must not overwrite authoritative migrated totals');
assert.equal(migratedRestore.GS.phase, 'discarding', 'snapshot restore must retain the in-progress phase');
assert.equal(migratedRestore.GS._gameSequence, 41, 'snapshot restore must retain the current game sequence');
assert.match(migratedRestore.topBarText, /^第41局 \| P0:50 \| P1:50 \| P2:50 \| P3:50/, 'restored top bar must retain the game number while showing authoritative migrated totals');
assert.deepEqual(migratedRestore._topSettlementSummary, { type: 'discardWin', winner: 2, scoreDeltas: [-8, 0, 8, 0] }, 'snapshot restore must retain the trusted recent settlement summary');
assert.equal(migratedRestore.saveCalls, 0, 'snapshot restoration must never persist stale or authoritative scores');

const existingAuthorityRestore = runRestoreFixture([71, 62, 53, 44], true, [9, 8, 7, 6]);
assert.deepEqual(existingAuthorityRestore.GS.players.map((player) => player.score), [71, 62, 53, 44], 'runtime restore must preserve valid non-baseline authoritative scores without migration');
assert.equal(existingAuthorityRestore.saveCalls, 0, 'valid non-baseline authority must not be rewritten during restore');

const unavailableAuthorityRestore = runRestoreFixture([50, 50, 50, 50], false, [81, 72, 63, 54]);
assert.deepEqual(unavailableAuthorityRestore.GS.players.map((player) => player.score), [81, 72, 63, 54], 'without a loaded authority, restore must retain validated snapshot scores instead of inventing an authoritative baseline');
assert.deepEqual(Array.from(unavailableAuthorityRestore.scores), [81, 72, 63, 54], 'without a loaded authority, runtime totals must follow the validated snapshot without saving');
assert.equal(unavailableAuthorityRestore.saveCalls, 0, 'authority load failure must not write fallback or snapshot totals');

const bankruptcyContext={scores:[51,0,49,50],GS:{players:[{score:51},{score:0},{score:49},{score:50}]},SCORE_BASELINE:50,_selfPlay:{running:false},document:{getElementById(){return {textContent:''};}},alert(){},saveCalls:0,saveScores(){bankruptcyContext.saveCalls+=1;}};
vm.createContext(bankruptcyContext);
for(const name of ['createBaselineScores','bankruptScoreResetNotice','persistSettledScores'])vm.runInContext(extractFunction(name),bankruptcyContext);
assert.equal(bankruptcyContext.persistSettledScores(),1,'bankruptcy must report the real bankrupt seat');
assert.deepEqual(Array.from(bankruptcyContext.scores),[50,50,50,50],'bankruptcy must reset persisted totals to 50');
assert.deepEqual(bankruptcyContext.GS.players.map(function(player){return player.score;}),[50,50,50,50],'bankruptcy must reset visible totals to 50');
assert.equal(bankruptcyContext.saveCalls,1,'bankruptcy must persist the reset once');

const persistSource = extractFunction('persistSettledScores');
assert.match(persistSource, /scores=createBaselineScores\(\)/, 'bankruptcy must reset all seats to the common baseline');
assert.match(persistSource, /player\.score=SCORE_BASELINE/, 'bankruptcy must update all visible seat totals to 50');
assert.match(persistSource, /bankruptScoreResetNotice\(/, 'bankruptcy messaging must use the common baseline');
assert.doesNotMatch(persistSource, /\[100,100,100,100\]|score=100|重置为 100/, 'bankruptcy must not retain the old 100-point baseline');

for (const settlementName of ['applyWin', 'completePageKongSettlement']) {
  const source = extractFunction(settlementName);
  assert.match(source, /scoreDeltas/, `${settlementName} must retain structured settlement deltas`);
  assert.match(source, /persistSettledScores\(\)/, `${settlementName} must retain bankruptcy persistence`);
}

assert.match(html, /<button[^>]+id="bt-reset-scores"[^>]*>重置积分<\/button>/, 'reset scores must be next to the export controls');
assert.match(html, /id="bt-export"[\s\S]{0,240}id="bt-reset-scores"/, 'reset scores must follow the export button');
assert.match(html, /#btns\{[^}]*flex-wrap:wrap[^}]*max-width:/s, 'desktop controls must wrap within a stable maximum width');
assert.match(html, /@media\s*\(max-width:600px\)\{[\s\S]*#btns\{[^}]*width:calc\(100vw - 16px\)[^}]*gap:/s, 'mobile controls must fit the viewport without covering adjacent controls');

const resetContext = {
  confirmResult: false,
  saveCalls: 0,
  saveResult: false,
  newGameCalls: [],
  clearCalls: 0,
  alerts: [],
  scores: [71, 62, 53, 44],
  GS: { players: [{ score: 71 }, { score: 62 }, { score: 53 }, { score: 44 }] },
  SCORE_BASELINE: 50,
  confirm() { return resetContext.confirmResult; },
  alert(message) { resetContext.alerts.push(message); },
  createBaselineScores() { return [50, 50, 50, 50]; },
  async saveScores(next) { resetContext.saveCalls += 1; resetContext.saved = next.slice(); return resetContext.saveResult; },
  clearGameSnapshot() { resetContext.clearCalls += 1; },
  newGame(options) { resetContext.newGameCalls.push(options); return true; },
};
vm.createContext(resetContext);
vm.runInContext(extractFunction('resetScoresManually'), resetContext);
assert.equal(await resetContext.resetScoresManually(), false, 'cancelling confirmation must cancel reset');
assert.equal(resetContext.saveCalls, 0, 'cancelling must not persist scores');
assert.equal(resetContext.clearCalls, 0, 'cancelling must not clear the current snapshot');
assert.equal(resetContext.newGameCalls.length, 0, 'cancelling must not start a new game');

resetContext.confirmResult = true;
assert.equal(await resetContext.resetScoresManually(), false, 'failed persistence must fail closed');
assert.equal(resetContext.saveCalls, 1, 'failed persistence must make one controlled save attempt');
assert.equal(resetContext.clearCalls, 0, 'failed persistence must preserve the current snapshot');
assert.equal(resetContext.newGameCalls.length, 0, 'failed persistence must not start a game');
assert.deepEqual(Array.from(resetContext.scores), [71, 62, 53, 44], 'failed persistence must preserve runtime totals');
resetContext.saveResult = true;
assert.equal(await resetContext.resetScoresManually(), true, 'confirmed reset must complete after persistence succeeds');
assert.equal(resetContext.saveCalls, 2, 'successful retry must make one additional save attempt');
assert.deepEqual(resetContext.saved, [50, 50, 50, 50], 'confirmed reset must persist the baseline');
assert.deepEqual(Array.from(resetContext.scores), [50, 50, 50, 50], 'confirmed reset must update runtime totals');
assert.equal(resetContext.clearCalls, 1, 'confirmed reset must clear the unfinished snapshot');
assert.deepEqual(JSON.parse(JSON.stringify(resetContext.newGameCalls)), [{ dealer: 0, snapshotAlreadyCleared: true }], 'confirmed reset must start one seat-zero-dealer game');

const topContext = {
  document: { bar: { textContent: '' }, getElementById(id) { assert.equal(id, 'bar'); return this.bar; } },
  GS: { phase: 'idle', _gameSequence: null, _gameLog: null, players: [] },
  Number,
};
topContext.currentTopSettlementSummary = () => null;
vm.createContext(topContext);
for (const name of ['currentGameSequence', 'formatCurrentGameLabel', 'formatTopSettlementSummary', 'updateTopScoreBar']) vm.runInContext(extractFunction(name), topContext);
topContext.updateTopScoreBar();
assert.match(topContext.document.bar.textContent, /^未开始 \| 你:-/, 'idle top bar must explicitly say the game has not started');
topContext.GS = { phase: 'discarding', _gameSequence: 42, _gameLog: { gameSequence: 42 }, players: [
  { name: '你', score: 50 }, { name: 'AI下家', score: 50 }, { name: 'AI对家', score: 50 }, { name: 'AI上家', score: 50 },
] };
topContext.updateTopScoreBar();
assert.match(topContext.document.bar.textContent, /^第42局 \| 你:50 \| AI下家:50/, 'active top bar must use persisted gameSequence instead of totalGames');

const newGameSource = extractFunction('newGame');
assert.match(newGameSource, /options\s*=\s*options\|\|\{\}/, 'newGame must accept controlled reset options');
assert.match(newGameSource, /options\.dealer===0\?0:resolveNextDealer\(GS\)/, 'manual reset must force seat zero without changing normal dealer continuity');
assert.match(newGameSource, /snapshotAlreadyCleared/, 'manual reset must avoid ambiguous repeated snapshot clearing');
assert.match(newGameSource, /allocateGameSequence\(localStorage\)/, 'every new game, including reset, must allocate the next stable sequence');
assert.doesNotMatch(extractFunction('resetScoresManually'), /TOP_SETTLEMENT_KEY|_topSettlementSummary\s*=\s*null|totalGamesPlayed\s*=|GAME_SEQUENCE_KEY/, 'manual reset must preserve recent settlement, totalGames, and sequence history');
assert.match(html, /document\.getElementById\('bt-reset-scores'\)\.onclick=resetScoresManually/, 'the reset button must use the audited handler');

console.log('P1 score baseline/reset/game number regression passed');
