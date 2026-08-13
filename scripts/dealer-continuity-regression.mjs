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

const context = { Number };
vm.createContext(context);
vm.runInContext(extractFunction('resolveNextDealer'), context, { filename: 'resolveNextDealer.js' });

const decide = (state) => context.resolveNextDealer(state);
assert.equal(decide({ phase: 'ended', _lastResult: { winner: 2, bankrupt: -1 } }), 2, 'a valid winner inherits the dealer seat');
assert.equal(decide({ phase: 'ended', _lastResult: { winner: 3, bankrupt: false } }), 3, 'legacy non-bankrupt results remain compatible');
assert.equal(decide({ phase: 'ended', _lastResult: { winner: 1, bankrupt: 2 } }), 0, 'a numeric bankruptcy reset returns the dealer to seat zero');
assert.equal(decide({ phase: 'ended', _lastResult: { winner: 1, bankrupt: true } }), 0, 'a legacy boolean bankruptcy reset returns the dealer to seat zero');
assert.equal(decide({ phase: 'ended', _lastResult: { winner: 2 } }), 0, 'a result without trustworthy bankruptcy metadata fails closed');
assert.equal(decide({ phase: 'ended', _lastResult: { type: '流局', bankrupt: -1 } }), 0, 'a draw has no inheritable winner');
assert.equal(decide({ phase: 'discarding', _lastResult: { winner: 3, bankrupt: -1 } }), 0, 'an interrupted active game cannot reuse an older winner');
assert.equal(decide({ phase: 'ended', _lastResult: { winner: 4, bankrupt: -1 } }), 0, 'an out-of-range winner fails closed');
assert.equal(decide({ phase: 'ended', _lastResult: { winner: 1.5, bankrupt: -1 } }), 0, 'a non-integer winner fails closed');
assert.equal(decide({ phase: 'ended', _lastResult: null }), 0, 'an old snapshot without a result falls back to seat zero');
assert.equal(decide(null), 0, 'a missing previous state falls back to seat zero');

const newGame = extractFunction('newGame');
const decisionIndex = newGame.indexOf('const dealer=options.dealer===0?0:resolveNextDealer(GS);');
const assignmentIndex = newGame.indexOf('GS.dealer=dealer;GS.cur=dealer;');
const clearResultIndex = newGame.indexOf('GS._lastResult=null');
assert.notEqual(decisionIndex, -1, 'newGame must resolve the next dealer from the previous state');
assert.notEqual(assignmentIndex, -1, 'newGame must assign dealer and current seat from the resolved value');
assert.notEqual(clearResultIndex, -1, 'newGame must still clear the current-game result');
assert.ok(decisionIndex < assignmentIndex, 'dealer resolution must precede dealer assignment');
assert.ok(assignmentIndex < clearResultIndex, 'dealer and current seat must be assigned before the prior result is cleared');
assert.doesNotMatch(newGame, /GS\.dealer\s*=\s*Math\.floor\(Math\.random\(\)\s*\*\s*4\)/, 'newGame must not retain random dealer selection');

assert.match(snapshotSource, /lastResult:\s*clone\(state\._lastResult\)/, 'ended snapshots must preserve the result used for dealer continuity');
assert.match(snapshotSource, /_lastResult:\s*clone\(snapshot\.lastResult\)/, 'restored ended snapshots must restore the result used for dealer continuity');

const kongSettlement = extractFunction('completePageKongSettlement');
const persistIndex = kongSettlement.indexOf('const bankrupt=persistSettledScores();');
const bankruptcyMetadataIndex = kongSettlement.indexOf('GS._lastResult.bankrupt=bankrupt;');
const saveIndex = kongSettlement.indexOf('saveGameSnapshot(');
assert.notEqual(persistIndex, -1, 'kong settlement must retain the existing bankruptcy check');
assert.notEqual(bankruptcyMetadataIndex, -1, 'kong settlement must record bankruptcy metadata for dealer continuity');
assert.ok(persistIndex < bankruptcyMetadataIndex && bankruptcyMetadataIndex < saveIndex, 'kong bankruptcy metadata must be recorded after reset detection and before snapshot save');

console.log('dealer continuity regression: passed');
