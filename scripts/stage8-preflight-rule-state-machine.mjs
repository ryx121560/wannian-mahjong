import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-preflight-state-machine-'));
const TILE_KEYS = ['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8','wan9','tong1','tong2','tong3','tong4','tong5','tong6','tong7','tong8','tong9','tiao1','tiao2','tiao3','tiao4','tiao5','tiao6','tiao7','tiao8','tiao9','dong','nan','xi','bei','zhong','fa','bai'];
const FIXED_SEEDS = Array.from({ length: 24 }, (_, index) => 2026082401 + index);

function compileTree(sourceDir, outputDir) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const outputPath = path.join(outputDir, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) { fs.mkdirSync(outputPath, { recursive: true }); compileTree(sourcePath, outputPath); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: sourcePath });
    fs.writeFileSync(outputPath, output.outputText, 'utf8');
  }
}
function randomFor(seed) { return () => { let value = seed += 0x6D2B79F5; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; }; }
function wallFor(random) { const wall = TILE_KEYS.flatMap((tile) => [tile,tile,tile,tile]); for (let index = wall.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [wall[index], wall[swap]] = [wall[swap], wall[index]]; } return wall; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function makeState(seed) {
  const random = randomFor(seed); const wallTiles = wallFor(random); const players = Array.from({ length: 4 }, () => ({ hand: [], melds: [], score: 0 }));
  for (const player of players) for (let index = 0; index < 13; index += 1) player.hand.push(wallTiles.pop());
  players[0].hand.push(wallTiles.pop());
  return { random, state: { phase: 'discarding', currentPlayer: 0, newDrawnTile: players[0].hand.at(-1), lastDiscard: undefined, lastDiscardPlayer: undefined, players, melds: players.map((player) => player.melds), discards: [[], [], [], []], turn: 0, dealer: 0, scores: [0,0,0,0], wallTiles, passRecords: [], kongResources: [] } };
}
function countTiles(state) { const counts = new Map(); const add = (tile) => counts.set(tile, (counts.get(tile) || 0) + 1); state.wallTiles.forEach(add); state.players.flatMap((player) => player.hand).forEach(add); state.discards.flat().forEach(add); state.melds.flat().flatMap((meld) => meld.tiles).forEach(add); return counts; }
function assertInvariants(state, label) { const counts = countTiles(state); assert.equal([...counts.values()].reduce((sum, value) => sum + value, 0), 136, `${label}: tile total`); for (const tile of TILE_KEYS) assert.equal(counts.get(tile), 4, `${label}: ${tile} conservation`); assert.ok(state.scores.every(Number.isFinite), `${label}: no NaN score`); assert.equal(state.scores.reduce((sum, value) => sum + value, 0), 0, `${label}: zero-sum score`); }
function actionByType(actions, type) { return actions.find((action) => action.actionType === type); }
function drawForCurrent(state) { const draw = state.wallTiles.pop(); assert.ok(draw, 'wall exhausted before draw'); state.players[state.currentPlayer].hand.push(draw); state.newDrawnTile = draw; }
function applyDiscard(v2, registry, state, action, trace) { const available = v2.deriveStage8V2RoundEngineActions({ actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION, state, playerId: state.currentPlayer }); assert.ok(available.some((candidate) => candidate.actionId === action.actionId), 'discard must be in Stage8 v2 action set'); const player = state.players[action.context.actor]; const index = player.hand.indexOf(action.tile); assert.ok(index >= 0, 'selected discard tile must be held'); player.hand.splice(index, 1); state.discards[action.context.actor].push(action.tile); state.lastDiscard = action.tile; state.lastDiscardPlayer = action.context.actor; state.phase = 'responding'; trace.push(`discard:${action.context.actor}:${action.tile}`); }
function applyPong(v2, registry, rules, state, actor, trace) { const available = v2.deriveStage8V2RoundEngineActions({ actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION, state, playerId: actor }); const action = actionByType(available, 'pong'); assert.ok(action, 'pong must be in Stage8 v2 action set'); assert.ok(rules.getLegalActions(state, actor).includes('pong'), 'pong must remain rule-legal at execution'); const hand = state.players[actor].hand; for (let count = 0; count < 2; count += 1) hand.splice(hand.indexOf(state.lastDiscard), 1); state.discards[state.lastDiscardPlayer].pop(); const meld = { type: 'peng', tiles: [state.lastDiscard, state.lastDiscard, state.lastDiscard], fromPlayer: state.lastDiscardPlayer }; state.players[actor].melds.push(meld); state.melds[actor] = state.players[actor].melds; state.currentPlayer = actor; state.phase = 'discarding'; state.newDrawnTile = undefined; trace.push(`pong:${actor}:${state.lastDiscard}`); }
function applyPass(v2, registry, rules, state, actor, trace) { const available = v2.deriveStage8V2RoundEngineActions({ actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION, state, playerId: actor }); assert.ok(actionByType(available, 'pass'), 'pass must be in Stage8 v2 action set'); assert.ok(rules.getLegalActions(state, actor).includes('pass'), 'pass must remain rule-legal at execution'); state.currentPlayer = (state.lastDiscardPlayer + 1) % 4; state.phase = 'discarding'; drawForCurrent(state); trace.push(`pass:${actor}`); }
function runBatch(v2, registry, rules, seed) {
  const { random, state } = makeState(seed); const trace = []; let step = 0;
  while (state.wallTiles.length > 0 && step < 72) {
    assertInvariants(state, `seed=${seed} step=${step}`);
    const discardActions = v2.deriveStage8V2RoundEngineActions({ actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION, state, playerId: state.currentPlayer }).filter((action) => action.actionType === 'discard');
    assert.ok(discardActions.length > 0, `seed=${seed} step=${step}: no legal discard action`);
    applyDiscard(v2, registry, state, discardActions[Math.floor(random() * discardActions.length)], trace);
    const responder = (state.lastDiscardPlayer + 1) % 4;
    const legal = rules.getLegalActions(state, responder);
    if (legal.includes('pong') && random() < 0.35) applyPong(v2, registry, rules, state, responder, trace); else applyPass(v2, registry, rules, state, responder, trace);
    step += 1;
  }
  assertInvariants(state, `seed=${seed} wall-exhausted-or-budget`);
  return { hash: crypto.createHash('sha256').update(JSON.stringify({ trace, state })).digest('hex'), trace };
}
function kongState(owner, hand, drawTile) { const players = Array.from({ length: 4 }, (_, index) => ({ hand: index === owner ? hand.slice() : [], melds: [], score: 0 })); return { phase: 'responding', currentPlayer: 0, newDrawnTile: undefined, lastDiscard: 'tong6', lastDiscardPlayer: 0, players, melds: players.map((player) => player.melds), discards: [['tong6'],[],[],[]], turn: 1, dealer: 0, scores: [0,0,0,0], wallTiles: [drawTile], passRecords: [], kongResources: [] }; }
function runKongMatrix(v2, registry, rules) {
  const resource = rules.createKongResource({ owner: 1, tile: 'tong6', pongMeld: { type: 'peng', tiles: ['tong6','tong6','tong6'], fromPlayer: 0 }, source: 'pong' });
  const directPre = ['tong6','tong6','tong6','wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8','wan9','tiao1'];
  const directAction = { kind: 'directChisel', owner: 1, resource, preKongHand: directPre, handAfterKong: directPre.slice(3), melds: [{ type: 'mingGang', tiles: ['tong6','tong6','tong6','tong6'], fromPlayer: 0 }] };
  const forcedPre = ['tong6','tong6','tong6','wan1','wan2','wan3','wan4','wan5','wan6','tiao5','tiao6','tiao8','tiao9'];
  const forcedAction = { kind: 'forcedRunImmediate', owner: 1, resource, preKongHand: forcedPre, handAfterKong: forcedPre.slice(3), melds: [{ type: 'mingGang', tiles: ['tong6','tong6','tong6','tong6'], fromPlayer: 0 }] };
  const cases = [['directChisel', directAction, 'zhong', 'directChiselFakeWin', false], ['forcedRunSuccess', forcedAction, 'tiao4', 'forcedRunGangKaiFakeWin', false], ['forcedRunFailureDiscard', forcedAction, 'zhong', 'forcedRunFailureDiscard', true]];
  const trace = [];
  for (const [id, claimAction, drawTile, outcome, mustDiscard] of cases) {
    const state = kongState(1, claimAction.preKongHand, drawTile);
    const selectedAction = registry.canonicalizeStage8V2Action({ actionType: id === 'directChisel' ? 'directChisel' : 'forcedRunImmediate', actor: 1, declarationWindow: 'discard-response', tile: 'tong6', ownTileCount: 3, robKongWindow: true });
    const result = v2.executeStage8V2RoundKongAction({ actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION, state, selectedAction, claim: { family: 'kongResource', pointKongPlayer: 0, action: clone(claimAction) } });
    assert.equal(result.outcome, outcome, `${id}: real round executor outcome`); assert.equal(result.mustDiscard, mustDiscard, `${id}: mustDiscard`); assert.equal(result.wallConsumed, 1, `${id}: real executor wall consumption`);
    if (!mustDiscard) { assert.ok(result.settlement, `${id}: real settlement required`); assert.equal(result.settlement.delta.reduce((sum, value) => sum + value, 0), 0, `${id}: settlement zero-sum`); }
    trace.push(`${id}:${result.outcome}:${result.settlement ? result.settlement.delta.join(',') : 'none'}`);
  }
  return trace;
}
function runNormalWinMatrix(v2, registry, rules) {
  const hand = ['wan1','wan1','wan1','wan2','wan2','wan2','wan3','wan3','wan3','wan4','wan4','wan4','tong6','tong6'];
  const state = { phase: 'discarding', currentPlayer: 0, newDrawnTile: 'tong6', players: [{ hand, melds: [], score: 0 }, { hand: [], melds: [], score: 0 }, { hand: [], melds: [], score: 0 }, { hand: [], melds: [], score: 0 }], melds: [[],[],[],[]], discards: [[],[],[],[]], turn: 0, dealer: 0, scores: [0,0,0,0], wallTiles: ['bai'], passRecords: [], kongResources: [] };
  const actions = v2.deriveStage8V2RoundEngineActions({ actionSpaceVersion: registry.STAGE8_ACTION_SPACE_V2_VERSION, state, playerId: 0 });
  assert.ok(actionByType(actions, 'win'), 'normal self-win must be exposed by the Stage8 v2 round action set');
  assert.equal(rules.canWin(hand, { melds: [] }).canWin, true, 'normal self-win must be rule-legal at execution');
  const settlement = rules.scoreSettlement({ hand, winType: '自摸', winner: 0, scores: state.scores });
  assert.equal(settlement.delta.reduce((sum, value) => sum + value, 0), 0, 'normal self-win settlement must be zero-sum');
  return `normalWin:${settlement.winType}:${settlement.delta.join(',')}`;
}

try {
  compileTree(path.join(root, 'src/game/rules'), path.join(tempRoot, 'rules')); compileTree(path.join(root, 'src/game/stage8'), path.join(tempRoot, 'stage8'));
  const rules = require(path.join(tempRoot, 'rules/index.js')); const v2 = require(path.join(tempRoot, 'stage8/round-engine-v2.js')); const registry = require(path.join(tempRoot, 'stage8/action-registry-v2.js')); const hashes = {}; const batchActionTypes = new Set();
  for (const seed of FIXED_SEEDS) { const first = runBatch(v2, registry, rules, seed); const replay = runBatch(v2, registry, rules, seed); assert.equal(replay.hash, first.hash, `seed=${seed}: replay mismatch`); first.trace.forEach((entry) => batchActionTypes.add(entry.split(':')[0])); hashes[seed] = first.hash; }
  for (const actionType of ['discard', 'pong', 'pass']) assert.ok(batchActionTypes.has(actionType), `batch must actually execute ${actionType}`);
  const matrixTrace = [runNormalWinMatrix(v2, registry, rules), ...runKongMatrix(v2, registry, rules)];
  console.log(JSON.stringify({ passed: true, samples: FIXED_SEEDS.length, seeds: FIXED_SEEDS, batchCoverage: ['canonical-discard','canonical-pong','canonical-pass','tile-conservation','zero-sum','replay'], directedCoverage: ['normalWin','directChisel','forcedRunSuccess','forcedRunFailureDiscard'], wallExhaustion: 'not-ended: no rules-core draw settlement executor is exposed; this gate does not synthesize ended', matrixTrace, replayHashes: hashes }, null, 2));
} finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }
