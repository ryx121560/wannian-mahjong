import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wannian-game-export-'));
const compiledPath = path.join(tempDir, 'game-record-export.cjs');
const sourcePath = path.join(root, 'src', 'lib', 'game-record-export.ts');

assert.equal(fs.existsSync(sourcePath), true, 'missing production game-record export module');

const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
fs.writeFileSync(compiledPath, compiled, 'utf8');

const require = createRequire(import.meta.url);
const {
  resolveGameExportDirectory,
  validateGameRecordExport,
  writeValidatedGameExport,
} = require(compiledPath);

const exportDir = path.join(tempDir, 'exports');
const otherDir = path.join(tempDir, 'other');
fs.mkdirSync(exportDir);
fs.mkdirSync(otherDir);

assert.throws(
  () => resolveGameExportDirectory({}),
  /APPROVED_GAME_EXPORT_DIR is required/,
  'missing export directory must fail instead of falling back to cwd',
);
assert.throws(
  () => resolveGameExportDirectory({ APPROVED_GAME_EXPORT_DIR: 'exports' }),
  /must be an absolute path/,
  'relative approved export directories must be rejected',
);
assert.throws(
  () => resolveGameExportDirectory({
    GAME_EXPORT_DIR: otherDir,
    APPROVED_GAME_EXPORT_DIR: exportDir,
  }),
  /does not match APPROVED_GAME_EXPORT_DIR/,
  'approved export directory mismatch must be rejected',
);

assert.equal(
  resolveGameExportDirectory({
    APPROVED_GAME_EXPORT_DIR: exportDir,
  }),
  fs.realpathSync.native(exportDir),
  'approved export directory must resolve independently from cwd',
);

const record = {
  gameId: 'game-20260808-001',
  gameSequence: 35,
  startTime: '2026-08-08T00:00:00.000Z',
  players: ['你', 'AI下家', 'AI对家', 'AI上家'],
  dealer: 0,
  events: [],
  trainingDataIncluded: false,
};
const payload = {
  schemaVersion: 'wannian-game-record-export-v2',
  gameSequence: 35,
  gameId: record.gameId,
  record,
};

const validated = validateGameRecordExport(payload);
assert.equal(validated.gameSequence, 35, 'validated export must retain the stable game sequence');
assert.equal(validated.gameId, record.gameId, 'validated export must retain the game identity');
assert.throws(
  () => validateGameRecordExport({ ...payload, outputPath: 'C:\\outside.json' }),
  /client path fields are not allowed/,
  'the client must not choose an export path',
);
assert.throws(
  () => validateGameRecordExport({ ...payload, record: { ...record, directory: '..\\outside' } }),
  /client path fields are not allowed/,
  'the server must reject nested client-controlled directory fields',
);
assert.throws(
  () => validateGameRecordExport({ ...payload, record: { ...record, events: null } }),
  /invalid game record events/,
  'the server must reject records that fail the export structure contract',
);

const first = writeValidatedGameExport(exportDir, validated);
const second = writeValidatedGameExport(exportDir, validated);
assert.equal(first.filename, '万年麻将_第35局_game-20260808-001.json', 'first export filename must contain the stable game sequence');
assert.equal(second.filename, '万年麻将_第35局_game-20260808-001_导出2.json', 're-export must not overwrite the existing file');
assert.notEqual(first.filePath, second.filePath, 'duplicate exports must use different server-selected paths');
assert.deepEqual(JSON.parse(fs.readFileSync(first.filePath, 'utf8')), [record], 'server output must preserve the validated record payload');
assert.deepEqual(JSON.parse(fs.readFileSync(second.filePath, 'utf8')), [record], 're-export content must remain deterministic');

const pageSource = fs.readFileSync(path.join(root, 'public', 'game', 'wannian-mahjong.html'), 'utf8');
const snapshotSource = fs.readFileSync(path.join(root, 'public', 'game', 'session_snapshot.js'), 'utf8');
assert.match(pageSource, /const GAME_SEQUENCE_KEY=/, 'page must persist an independent game sequence counter');
assert.match(pageSource, /allocateGameSequence\(localStorage\)/, 'new game must allocate its sequence before creating the log');
assert.match(pageSource, /fetch\('\/api\/game\/export'/, 'page exports must use the controlled server endpoint first');
assert.match(snapshotSource, /gameSequence:/, 'snapshots must retain the current game sequence');
assert.match(pageSource, /confirm\(/, 'browser download must only occur after an explicit fallback confirmation');

const snapshotRuntime = { window: {} };
vm.runInNewContext(snapshotSource, snapshotRuntime, { filename: 'session_snapshot.js' });
const session = snapshotRuntime.window.GameSessionSnapshot;
const snapshotState = {
  wall: [],
  players: [0, 1, 2, 3].map((index) => ({ name: `P${index}`, human: index === 0, score: 100, hand: [], melds: [] })),
  discards: [],
  playerDiscards: [[], [], [], []],
  lastDiscard: null,
  lastDiscardP: -1,
  cur: 0,
  dealer: 0,
  turn: 0,
  phase: 'drawing',
  canP: false,
  canK: false,
  canW: false,
  canWS: false,
  _resp: null,
  _respP: -1,
  _responseKind: null,
  _kc: {},
  _hasWild: {},
  _kongResources: [],
  _kongActionWindow: null,
  newDrawnTile: null,
  newDrawnIdx: -1,
  _gameLog: { gameId: record.gameId, gameSequence: record.gameSequence },
  _lastResult: null,
};
const sequenceSnapshot = session.create(snapshotState, { totalGames: 0, selfPlayRunning: false, gameSequence: record.gameSequence }, (tile) => tile);
assert.equal(sequenceSnapshot.gameSequence, record.gameSequence, 'snapshot create must preserve the new game sequence');
const restoredSequenceSnapshot = session.restore(sequenceSnapshot, (tile) => tile);
assert.equal(restoredSequenceSnapshot.ok, true, 'snapshot containing a game sequence must restore');
assert.equal(restoredSequenceSnapshot.gameSequence, record.gameSequence, 'snapshot restore must preserve the game sequence');
assert.equal(restoredSequenceSnapshot.state._gameSequence, record.gameSequence, 'restored state must retain the game sequence');
const legacySnapshot = JSON.parse(JSON.stringify(sequenceSnapshot));
delete legacySnapshot.gameSequence;
const restoredLegacySnapshot = session.restore(legacySnapshot, (tile) => tile);
assert.equal(restoredLegacySnapshot.ok, true, 'legacy snapshots without gameSequence must remain restorable');
assert.equal(restoredLegacySnapshot.gameSequence, null, 'legacy snapshots must safely default the missing game sequence');

console.log('P2 game export regression: passed');
