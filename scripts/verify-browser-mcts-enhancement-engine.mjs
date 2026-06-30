import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const bundlePath = path.join(root, 'public/game/mcts_enhancement_engine.js');
const code = fs.readFileSync(bundlePath, 'utf8');
const sandbox = { console, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: bundlePath });

const engine = sandbox.globalThis.WannianMctsEnhancement;
if (!engine || typeof engine.decideWithMcts !== 'function') {
  throw new Error('WannianMctsEnhancement API missing');
}

function base(candidates) {
  return {
    turn: 20,
    player: 1,
    phase: 'responding',
    timeLimitMs: 10000,
    scores: [100, 100, 100, 100],
    discards: [[], [], [], []],
    melds: [],
    handSummary: ['wan3', 'wan4'],
    opponentThreats: [],
    candidates,
  };
}

const win = engine.decideWithMcts(base([
  { id: 'win', action: 'win', legal: true, baseScore: 1, isStrongRuleChoice: true },
  { id: 'pass', action: 'pass', legal: true, baseScore: 9 },
]));
if (win.finalAction !== '胡') throw new Error(`win priority failed: ${win.finalAction}`);

const stable = engine.decideWithMcts({ ...base([
  { id: 'discard-a', action: 'discard', tile: 'wan3', tileLabel: '三万', legal: true, baseScore: 10, isStrongRuleChoice: true },
  { id: 'discard-b', action: 'discard', tile: 'wan4', tileLabel: '四万', legal: true, baseScore: 10.7 },
]), strongRuleAction: '打三万' });
if (stable.finalAction !== '打三万' || stable.overridden) throw new Error('weak gap should keep strong-rule action');

const kong = engine.decideWithMcts({ ...base([
  { id: 'kong', action: 'kong', tile: 'dong', tileLabel: '东风', legal: true, baseScore: 8, kongRisk: 0.9 },
  { id: 'pass', action: 'pass', legal: true, baseScore: 5, isStrongRuleChoice: true },
]), opponentThreats: [{ player: 0, tenpaiRisk: 0.8, dalanRisk: 0.8, honorRisk: 0.8 }], strongRuleAction: '过' });
if (kong.finalAction !== '过') throw new Error(`risky honor kong should be rejected: ${kong.finalAction}`);

const invalidWait = engine.decideWithMcts({ ...base([
  { id: 'discard-nan', action: 'discard', tile: 'nan', tileLabel: '南', legal: true, baseScore: 8, shantenAfter: 0, waitCount: 0, isStrongRuleChoice: true },
  { id: 'discard-tong2', action: 'discard', tile: 'tong2', tileLabel: '2筒', legal: true, baseScore: 7.2, shantenAfter: 0, waitCount: 1 },
]), strongRuleAction: '打南' });
if (invalidWait.finalAction !== '打2筒' || !invalidWait.overridden) {
  throw new Error(`invalid low-wait strong rule should be overridden: ${invalidWait.finalAction}`);
}

console.log('Browser MCTS enhancement engine verified');
