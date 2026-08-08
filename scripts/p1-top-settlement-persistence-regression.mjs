import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'public', 'game', 'wannian-mahjong.html'), 'utf8');
const snapshotSource = fs.readFileSync(path.join(root, 'public', 'game', 'session_snapshot.js'), 'utf8');

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

assert.match(html, /const TOP_SETTLEMENT_KEY=/, 'a recent-settlement record needs independent persistence');
for (const name of ['loadTopSettlementSummary', 'commitTopSettlementSummary', 'currentTopSettlementSummary']) {
  assert.match(html, new RegExp(`function ${name}\\(`), `${name} must exist as a side-effect-contained helper`);
}
assert.doesNotMatch(extractFunction('newGame'), /_topSettlementSummary\s*=\s*null/, 'new games must not erase the latest settled summary');
assert.doesNotMatch(extractFunction('enterIdleState'), /_topSettlementSummary\s*=\s*null/, 'idle state must not erase the latest settled summary');
assert.match(extractFunction('updateTopScoreBar'), /currentTopSettlementSummary\(\)/, 'the visible bar must read the independent summary instead of current game state');
assert.match(snapshotSource, /topSettlement:/, 'snapshots must carry the minimal persisted summary when present');

const storageData = new Map();
const context = {
  localStorage: {
    getItem: (key) => storageData.has(key) ? storageData.get(key) : null,
    setItem: (key, value) => storageData.set(key, value),
  },
  JSON,
  Number,
  Array,
  Math,
  GS: { players: [{ name: '你' }, { name: 'AI下家' }, { name: 'AI对家' }, { name: 'AI上家' }] },
  _topSettlementSummary: null,
  TOP_SETTLEMENT_KEY: 'wannian_top_settlement_summary_v1',
};
vm.createContext(context);
for (const name of ['isTrustedTopSettlementSummary', 'normalizeTopSettlementSummary', 'commitTopSettlementSummary', 'loadTopSettlementSummary', 'currentTopSettlementSummary']) {
  vm.runInContext(extractFunction(name), context, { filename: `${name}.js` });
}
const first = context.commitTopSettlementSummary({ type: '点炮', huType: '碰碰胡', winner: 0, scoreDeltas: [6, -6, 0, 0] });
assert.deepEqual(JSON.parse(JSON.stringify(first.scoreDeltas)), [6, -6, 0, 0], 'trusted zero-sum settlement must persist');
context.GS._lastResult = null;
assert.equal(context.currentTopSettlementSummary().huType, '碰碰胡', 'new game state must keep the prior settlement summary');
context._topSettlementSummary = null;
assert.equal(context.loadTopSettlementSummary().huType, '碰碰胡', 'refresh must restore the independent summary');
const next = context.commitTopSettlementSummary({ type: '杠开', huType: '清一色', winner: 1, scoreDeltas: [-8, 24, -8, -8] });
assert.equal(next.huType, '清一色', 'only a later trusted settlement may replace the summary');
assert.equal(context.commitTopSettlementSummary({ type: '流局', scoreDeltas: [1, 0, 0, 0] }), null, 'non-zero-sum or untrusted deltas must not replace the summary');

console.log('P1 top settlement persistence regression: passed');
