import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const require = createRequire(import.meta.url);
require(path.join(root, 'public/game/rule_engine.js'));
const rules = globalThis.WannianRuleEngine;

if (!rules) throw new Error('WannianRuleEngine is not available. Run npm.cmd run verify:browser-rules first.');

const ALL_TILES = [
  'wan1', 'wan2', 'wan3', 'wan4', 'wan5', 'wan6', 'wan7', 'wan8', 'wan9',
  'tong1', 'tong2', 'tong3', 'tong4', 'tong5', 'tong6', 'tong7', 'tong8', 'tong9',
  'tiao1', 'tiao2', 'tiao3', 'tiao4', 'tiao5', 'tiao6', 'tiao7', 'tiao8', 'tiao9',
  'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai',
];
const FIXED_REGRESSION_IDS = [
  'recommendation-isolated-edge-visible-count-001',
  'recommendation-pong-8tong-protect-567tong-001',
  'recommendation-pong-8tong-discard-3tong-tenpai-5wan-001',
  'recommendation-draw-8wan-keep-56tong-001',
  'ai-discard-low-threat-do-not-break-56tong-for-safety-001',
];

function parseArgs(argv) {
  const args = { games: 1000, seed: 20260704, report: 'json', output: '', stopOnFirstError: false, maxTurns: 240, batchSize: 1000 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--games') { args.games = Number(value); i += 1; }
    else if (key === '--seed') { args.seed = Number(value); i += 1; }
    else if (key === '--report') { args.report = value || 'json'; i += 1; }
    else if (key === '--output') { args.output = value || ''; i += 1; }
    else if (key === '--stopOnFirstError') { args.stopOnFirstError = value === 'true'; i += 1; }
    else if (key === '--maxTurns') { args.maxTurns = Number(value); i += 1; }
    else if (key === '--batchSize') { args.batchSize = Number(value); i += 1; }
  }
  if (!Number.isInteger(args.games) || args.games <= 0) throw new Error('--games must be a positive integer');
  if (!Number.isInteger(args.seed)) throw new Error('--seed must be an integer');
  if (!Number.isInteger(args.batchSize) || args.batchSize <= 0) throw new Error('--batchSize must be a positive integer');
  return args;
}

function makeRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffledWall(rng) {
  const wall = ALL_TILES.flatMap((tile) => [tile, tile, tile, tile]);
  for (let i = wall.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

function emptySummary(args) {
  return {
    games: args.games,
    completed: 0,
    crashes: 0,
    illegalActions: 0,
    invalidWins: 0,
    suspiciousWins: 0,
    settlementErrors: 0,
    missingLogFields: 0,
    stateInvariantErrors: 0,
    timeoutGames: 0,
    candidateMisses: 0,
    obviousBadDiscards: 0,
    fixedRegressionFailures: 0,
    fixedRegression: { total: FIXED_REGRESSION_IDS.length, passed: 0, failed: FIXED_REGRESSION_IDS.length, failedCases: FIXED_REGRESSION_IDS.slice() },
    batchReports: [],
    passed: false,
    failures: [],
  };
}

function countTiles(state) {
  const counts = new Map();
  const add = (tile) => counts.set(tile, (counts.get(tile) || 0) + 1);
  state.wall.forEach(add);
  state.players.forEach((player) => {
    player.hand.forEach(add);
    player.melds.flatMap((meld) => meld.tiles || []).forEach(add);
  });
  state.discards.flat().forEach(add);
  return counts;
}

function snapshot(state, player = -1) {
  return {
    gameId: state.gameId,
    turn: state.turn,
    currentPlayer: state.currentPlayer,
    wall: state.wall.length,
    lastDiscard: state.lastDiscard,
    lastDiscardPlayer: state.lastDiscardPlayer,
    scores: state.players.map((item) => item.score),
    player,
    hand: player >= 0 ? state.players[player].hand.slice() : undefined,
    melds: player >= 0 ? state.players[player].melds.slice() : undefined,
  };
}

function addFailure(summary, state, type, message, player = -1, extra = {}) {
  const stateSnapshot = { ...snapshot(state, player), ...extra };
  summary.failures.push({
    gameIndex: state.index,
    gameId: state.gameId,
    turn: state.turn,
    type,
    failureType: type,
    player,
    message,
    snapshot: stateSnapshot,
    stateSnapshot,
    lastEvents: state.events.slice(-10),
    decisionLog: state.decisions.slice(-5),
  });
}

function validateInvariant(summary, state) {
  const counts = countTiles(state);
  for (const [tile, count] of counts.entries()) {
    if (count > 4) {
      summary.stateInvariantErrors += 1;
      addFailure(summary, state, 'stateInvariant', `tile ${tile} appears ${count} times`);
      return false;
    }
  }
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  if (total !== 136) {
    summary.stateInvariantErrors += 1;
    addFailure(summary, state, 'stateInvariant', `tile total expected 136, actual ${total}`);
    return false;
  }
  if (state.wall.length < 0 || state.currentPlayer < 0 || state.currentPlayer > 3) {
    summary.stateInvariantErrors += 1;
    addFailure(summary, state, 'stateInvariant', 'invalid wall length or current player');
    return false;
  }
  return true;
}

function validateLog(summary, state, result) {
  const required = ['gameId', 'startTime', 'players', 'dealer', 'aiEngine', 'events', 'finalScores', 'endedReason'];
  for (const field of required) {
    if (result[field] == null) {
      summary.missingLogFields += 1;
      addFailure(summary, state, 'missingLogField', `missing game log field ${field}`);
    }
  }
  for (const decision of state.decisions) {
    const fields = ['turn', 'player', 'decisionType', 'handSummary', 'melds', 'discards', 'legalActions', 'candidates', 'selectedAction', 'reason', 'shantenBefore', 'shantenAfter', 'route', 'mctsSummary', 'modelSummary', 'scoreSituation'];
    for (const field of fields) {
      if (decision[field] == null) {
        summary.missingLogFields += 1;
        addFailure(summary, state, 'missingLogField', `missing decision field ${field}`, decision.player);
        return;
      }
    }
  }
}

function chooseDiscard(state, player, rng) {
  const hand = state.players[player].hand;
  const preferred = hand
    .map((tile, index) => ({ tile, index }))
    .filter((item) => /^(wan|tong|tiao)(1|9)$/.test(item.tile) || ['dong', 'nan', 'xi', 'bei'].includes(item.tile));
  if (preferred.length) return preferred[Math.floor(rng() * preferred.length)];
  const index = Math.floor(rng() * hand.length);
  return { tile: hand[index], index };
}

function smokeShanten(_hand) {
  return 0;
}

function verifyWin(summary, state, winner, hand, winTile, winType, payer = null) {
  const ruleResult = rules.canWin(hand, { winTile, winType, melds: state.players[winner].melds });
  if (!ruleResult || !ruleResult.canWin) {
    summary.invalidWins += 1;
    addFailure(summary, state, 'invalidWin', 'Game declared win, but rule engine canWin=false', winner, {
      hand: hand.slice(),
      melds: state.players[winner].melds.slice(),
      winTile,
      winType,
      lastDiscardPlayer: state.lastDiscardPlayer,
      ruleResult,
    });
    return null;
  }
  const tileCount = hand.length + state.players[winner].melds.length * 3;
  if (tileCount !== 14 || !winTile || ((winType === '点炮' || winType === '抢杠') && payer == null)) {
    summary.suspiciousWins += 1;
    addFailure(summary, state, 'suspiciousWin', 'Win passed rule engine but context is incomplete or abnormal', winner, {
      hand: hand.slice(),
      melds: state.players[winner].melds.slice(),
      winTile,
      winType,
      lastDiscardPlayer: state.lastDiscardPlayer,
      ruleResult,
    });
  }
  return ruleResult;
}

function settle(summary, state, winner, winType, winTile, payer = null) {
  const before = state.players.map((item) => item.score);
  const hand = state.players[winner].hand.slice();
  const ruleResult = verifyWin(summary, state, winner, hand, winTile, winType, payer);
  if (!ruleResult) return false;
  const score = rules.calculateScore({
    handTypes: ruleResult.handTypes || [ruleResult.handType],
    baseScore: ruleResult.baseScore || 1,
    winMethod: winType,
    currentPlayer: winner,
    payer,
  });
  if (!score || !Array.isArray(score.scorePerPlayer) || score.scorePerPlayer.length !== 4) {
    summary.settlementErrors += 1;
    addFailure(summary, state, 'missingSettlement', 'rule engine did not return complete settlement', winner);
    return false;
  }
  if (winType === '点炮') {
    if (payer == null || payer === winner) {
      summary.settlementErrors += 1;
      addFailure(summary, state, 'invalidPayer', 'point win payer is invalid', winner);
      return false;
    }
    const points = score.scorePerPlayer[payer] || score.winnerGain || 0;
    state.players[winner].score += points;
    state.players[payer].score -= points;
  } else {
    const points = Math.max(...score.scorePerPlayer);
    state.players[winner].score += score.winnerGain || points * 3;
    for (let i = 0; i < 4; i += 1) if (i !== winner) state.players[i].score -= score.scorePerPlayer[i] || points;
  }
  const after = state.players.map((item) => item.score);
  const delta = after.map((value, index) => value - before[index]);
  if (delta.some((value) => !Number.isFinite(value)) || delta.reduce((sum, value) => sum + value, 0) !== 0) {
    summary.settlementErrors += 1;
    addFailure(summary, state, 'scoreNotConserved', 'settlement delta is invalid', winner, { before, after, delta });
    return false;
  }
  if (after.some((value) => !Number.isFinite(value))) {
    summary.settlementErrors += 1;
    addFailure(summary, state, 'invalidScoreValue', 'score contains invalid numeric value', winner, { before, after });
    return false;
  }
  state.endedReason = 'win';
  state.winner = winner;
  state.winType = winType;
  state.finalScores = after.slice();
  return true;
}

function createState(index, seed, rng, scores) {
  const wall = shuffledWall(rng);
  const players = Array.from({ length: 4 }, (_, player) => ({ name: player === 0 ? '你' : `AI${player}`, hand: [], melds: [], score: scores[player] }));
  for (let round = 0; round < 13; round += 1) for (let player = 0; player < 4; player += 1) players[player].hand.push(wall.pop());
  return {
    index,
    gameId: `selfplay-${index}`,
    startTime: new Date(seed + index).toISOString(),
    dealer: index % 4,
    currentPlayer: index % 4,
    turn: 0,
    wall,
    players,
    discards: [[], [], [], []],
    events: [],
    decisions: [],
    lastDiscard: null,
    lastDiscardPlayer: -1,
    endedReason: null,
    winner: null,
    winType: null,
    finalScores: null,
  };
}

function runGame(summary, index, args, scores) {
  const rng = makeRng(args.seed + index * 9973);
  const state = createState(index, args.seed, rng, scores);
  validateInvariant(summary, state);
  while (!state.endedReason) {
    if (state.turn > args.maxTurns) {
      summary.timeoutGames += 1;
      addFailure(summary, state, 'timeoutGame', `game exceeded max turns ${args.maxTurns}`);
      state.endedReason = 'timeout';
      break;
    }
    const player = state.currentPlayer;
    if (!state.wall.length) {
      state.endedReason = 'draw';
      state.finalScores = state.players.map((item) => item.score);
      break;
    }
    const drawn = state.wall.pop();
    state.players[player].hand.push(drawn);
    state.events.push({ turn: state.turn, player, type: 'draw', tile: drawn });
    if (!validateInvariant(summary, state)) break;
    const selfWin = rules.canWin(state.players[player].hand, { winTile: drawn, winType: '自摸', melds: state.players[player].melds });
    if (selfWin && selfWin.canWin) {
      state.events.push({ turn: state.turn, player, type: 'win', tile: drawn, winType: '自摸' });
      settle(summary, state, player, '自摸', drawn);
      break;
    }
    const shantenBefore = smokeShanten(state.players[player].hand);
    const discard = chooseDiscard(state, player, rng);
    if (!discard || !state.players[player].hand.includes(discard.tile)) {
      summary.illegalActions += 1;
      addFailure(summary, state, 'illegalDiscard', 'player tried to discard a tile not in hand', player);
      break;
    }
    state.players[player].hand.splice(discard.index, 1);
    state.discards[player].push(discard.tile);
    state.lastDiscard = discard.tile;
    state.lastDiscardPlayer = player;
    const shantenAfter = smokeShanten(state.players[player].hand);
    state.decisions.push({
      turn: state.turn,
      player,
      decisionType: 'discard',
      handSummary: state.players[player].hand.slice(),
      melds: state.players[player].melds.slice(),
      discards: state.discards[player].slice(),
      legalActions: ['discard'],
      candidates: state.players[player].hand.slice(),
      selectedAction: `打${discard.tile}`,
      reason: 'smoke deterministic discard',
      shantenBefore,
      shantenAfter,
      route: 'smoke',
      mctsSummary: {},
      modelSummary: {},
      scoreSituation: state.players.map((item) => item.score),
    });
    state.events.push({ turn: state.turn, player, type: 'discard', tile: discard.tile });
    if (!validateInvariant(summary, state)) break;
    let claimed = false;
    for (let offset = 1; offset < 4; offset += 1) {
      const responder = (player + offset) % 4;
      const claimHand = state.players[responder].hand.concat(discard.tile);
      const pointWin = rules.canWin(claimHand, { winTile: discard.tile, winType: '点炮', melds: state.players[responder].melds });
      if (pointWin && pointWin.canWin) {
        state.discards[player].pop();
        state.players[responder].hand.push(discard.tile);
        state.events.push({ turn: state.turn, player: responder, type: 'win', tile: discard.tile, winType: '点炮', from: player });
        settle(summary, state, responder, '点炮', discard.tile, player);
        claimed = true;
        break;
      }
    }
    if (claimed) break;
    state.currentPlayer = (player + 1) % 4;
    state.turn += 1;
  }
  if (state.endedReason === 'win' || state.endedReason === 'draw') summary.completed += 1;
  const result = {
    gameId: state.gameId,
    startTime: state.startTime,
    players: state.players.map((item) => item.name),
    dealer: state.dealer,
    aiEngine: { mode: 'selfplay-smoke', ruleEngine: 'WannianRuleEngine' },
    events: state.events,
    finalScores: state.finalScores || state.players.map((item) => item.score),
    endedReason: state.endedReason,
    winner: state.winner,
    turnCount: state.turn,
    decisions: state.decisions,
  };
  validateLog(summary, state, result);
  return result.finalScores;
}

function runFixedRegressions(summary) {
  const regressionSource = fs.readFileSync(path.join(root, 'scripts/stage4-recommendation-regression.mjs'), 'utf8');
  const missingIds = FIXED_REGRESSION_IDS.filter((id) => !regressionSource.includes(id));
  if (missingIds.length) {
    summary.candidateMisses += missingIds.length;
    summary.fixedRegressionFailures += missingIds.length;
    summary.fixedRegression = {
      total: FIXED_REGRESSION_IDS.length,
      passed: FIXED_REGRESSION_IDS.length - missingIds.length,
      failed: missingIds.length,
      failedCases: missingIds,
    };
    summary.failures.push({
      gameIndex: -1,
      gameId: 'fixed-regressions',
      turn: -1,
      type: 'candidateMiss',
      failureType: 'candidateMiss',
      player: -1,
      message: 'fixed recommendation regression ids are missing',
      snapshot: { missingIds },
      stateSnapshot: { missingIds },
      lastEvents: [],
      decisionLog: [],
    });
    return summary.fixedRegression;
  }
  const result = spawnSync(process.execPath, ['scripts/stage4-recommendation-regression.mjs'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    summary.candidateMisses += 1;
    summary.fixedRegressionFailures += 1;
    summary.fixedRegression = { total: FIXED_REGRESSION_IDS.length, passed: 0, failed: FIXED_REGRESSION_IDS.length, failedCases: FIXED_REGRESSION_IDS.slice() };
    summary.failures.push({
      gameIndex: -1,
      gameId: 'fixed-regressions',
      turn: -1,
      type: 'fixedRegressionFailure',
      failureType: 'fixedRegressionFailure',
      player: -1,
      message: 'fixed recommendation regression suite failed',
      snapshot: { stdout: result.stdout, stderr: result.stderr },
      stateSnapshot: { stdout: result.stdout, stderr: result.stderr },
      lastEvents: [],
      decisionLog: [],
    });
    return summary.fixedRegression;
  }
  summary.fixedRegression = { total: FIXED_REGRESSION_IDS.length, passed: FIXED_REGRESSION_IDS.length, failed: 0, failedCases: [] };
  return summary.fixedRegression;
}

function counterSnapshot(summary) {
  return {
    completed: summary.completed,
    invalidWins: summary.invalidWins,
    suspiciousWins: summary.suspiciousWins,
    illegalActions: summary.illegalActions,
    stateInvariantErrors: summary.stateInvariantErrors,
    settlementErrors: summary.settlementErrors,
    missingLogFields: summary.missingLogFields,
    candidateMisses: summary.candidateMisses,
    obviousBadDiscards: summary.obviousBadDiscards,
    crashes: summary.crashes,
    timeoutGames: summary.timeoutGames,
  };
}

function pushBatchReport(summary, batchStart, batchEnd, before, fixedRegression) {
  const field = (name) => summary[name] - before[name];
  const report = {
    batchGames: batchEnd - batchStart + 1,
    totalGames: batchEnd,
    completed: field('completed'),
    invalidWins: field('invalidWins'),
    suspiciousWins: field('suspiciousWins'),
    illegalActions: field('illegalActions'),
    stateInvariantErrors: field('stateInvariantErrors'),
    settlementErrors: field('settlementErrors'),
    missingLogFields: field('missingLogFields'),
    candidateMisses: field('candidateMisses'),
    obviousBadDiscards: field('obviousBadDiscards'),
    crashes: field('crashes'),
    timeoutGames: field('timeoutGames'),
    fixedRegression,
  };
  report.passed = report.completed === report.batchGames
    && report.invalidWins === 0
    && report.suspiciousWins === 0
    && report.illegalActions === 0
    && report.stateInvariantErrors === 0
    && report.settlementErrors === 0
    && report.missingLogFields === 0
    && report.candidateMisses === 0
    && report.obviousBadDiscards === 0
    && report.crashes === 0
    && report.timeoutGames === 0
    && fixedRegression.failed === 0;
  summary.batchReports.push(report);
}

const args = parseArgs(process.argv.slice(2));
const summary = emptySummary(args);
let scores = [100, 100, 100, 100];
let batchStart = 1;
let batchBefore = counterSnapshot(summary);
for (let i = 1; i <= args.games; i += 1) {
  try {
    scores = runGame(summary, i, args, scores);
    if (scores.some((score) => score <= 0)) scores = [100, 100, 100, 100];
  } catch (error) {
    summary.crashes += 1;
    summary.failures.push({
      gameIndex: i,
      gameId: `selfplay-${i}`,
      turn: -1,
      type: 'crash',
      failureType: 'crash',
      player: -1,
      message: error && error.stack ? error.stack : String(error),
      snapshot: {},
      stateSnapshot: {},
      lastEvents: [],
      decisionLog: [],
    });
  }
  if (args.stopOnFirstError && summary.failures.length) break;
  if (i % args.batchSize === 0 || i === args.games) {
    const fixedRegression = runFixedRegressions(summary);
    pushBatchReport(summary, batchStart, i, batchBefore, fixedRegression);
    batchStart = i + 1;
    batchBefore = counterSnapshot(summary);
  }
}

summary.passed = summary.completed === args.games
  && summary.crashes === 0
  && summary.illegalActions === 0
  && summary.invalidWins === 0
  && summary.suspiciousWins === 0
  && summary.settlementErrors === 0
  && summary.missingLogFields === 0
  && summary.stateInvariantErrors === 0
  && summary.timeoutGames === 0
  && summary.candidateMisses === 0
  && summary.obviousBadDiscards === 0
  && summary.fixedRegressionFailures === 0;

const json = `${JSON.stringify(summary, null, 2)}\n`;
if (args.output) {
  fs.mkdirSync(path.dirname(path.resolve(root, args.output)), { recursive: true });
  fs.writeFileSync(path.resolve(root, args.output), json, 'utf8');
}
if (args.report === 'json') process.stdout.write(json);
else console.log(summary.passed ? 'selfplay smoke passed' : 'selfplay smoke failed');
if (!summary.passed) process.exit(1);
