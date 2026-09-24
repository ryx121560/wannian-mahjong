import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wannian-game-export-e2e-'));
const standaloneServer = path.join(root, '.next', 'standalone', path.relative(path.resolve(root, '..', '..'), root), 'server.js');
const exportDir = path.join(tempRoot, 'approved-exports');
const otherDir = path.join(tempRoot, 'other-exports');
fs.mkdirSync(exportDir);
fs.mkdirSync(otherDir);

const record = {
  gameId: 'game-e2e-20260808-001',
  gameSequence: 41,
  startTime: '2026-08-08T00:00:00.000Z',
  players: ['你', 'AI下家', 'AI对家', 'AI上家'],
  dealer: 0,
  events: [],
  trainingDataIncluded: false,
};
const payload = {
  schemaVersion: 'wannian-game-record-export-v2',
  gameSequence: record.gameSequence,
  gameId: record.gameId,
  record,
};

function nextFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function childEnvironment(overrides) {
  const env = { ...process.env, NODE_ENV: 'production', PORT_WINDOW: '0' };
  delete env.GAME_EXPORT_DIR;
  delete env.APPROVED_GAME_EXPORT_DIR;
  delete env.GAME_EXPORT_REQUIRE_APPROVED;
  return { ...env, ...overrides };
}

async function startServer(overrides) {
  const port = await nextFreePort();
  const output = [];
  const child = spawn(process.execPath, [standaloneServer], {
    cwd: root,
    env: childEnvironment({ ...overrides, PORT: String(port) }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`test server exited: ${output.join('')}`);
    try {
      const response = await fetch(`${baseUrl}/api/game/export`);
      if (response.status === 405) return { baseUrl, child, output };
    } catch {
      // The standalone server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`timed out starting test server: ${output.join('')}`);
}

async function stopServer(server) {
  if (server.child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.child.kill('SIGKILL');
      resolve();
    }, 5_000);
    server.child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    server.child.kill();
  });
}

async function postExport(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/game/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, json: await response.json() };
}

async function withServer(overrides, callback) {
  const server = await startServer(overrides);
  try {
    await callback(server.baseUrl);
  } finally {
    await stopServer(server);
  }
}

assert.equal(fs.existsSync(standaloneServer), true, 'run npm.cmd run build before the E2E export regression');

await withServer({
  GAME_EXPORT_DIR: exportDir,
  APPROVED_GAME_EXPORT_DIR: exportDir,
  GAME_EXPORT_REQUIRE_APPROVED: '1',
}, async (baseUrl) => {
  const first = await postExport(baseUrl, payload);
  assert.equal(first.response.status, 201, 'valid export must reach the production route');
  assert.equal(first.json.filename, '万年麻将_第41局_game-e2e-20260808-001.json');
  assert.deepEqual(fs.readdirSync(exportDir), [first.json.filename], 'only the approved temporary directory may receive the first export');

  const second = await postExport(baseUrl, payload);
  assert.equal(second.response.status, 201, 'a repeated export must still succeed');
  assert.equal(second.json.filename, '万年麻将_第41局_game-e2e-20260808-001_导出2.json');
  assert.deepEqual(fs.readdirSync(exportDir).sort(), [first.json.filename, second.json.filename].sort(), 'repeated exports must not overwrite the first file');

  const beforeInvalid = fs.readdirSync(exportDir).sort();
  const topLevelPath = await postExport(baseUrl, { ...payload, outputPath: '..\\outside.json' });
  assert.equal(topLevelPath.response.status, 400, 'top-level client path fields must be rejected by the route');
  const nestedPath = await postExport(baseUrl, { ...payload, record: { ...record, directory: '..\\outside' } });
  assert.equal(nestedPath.response.status, 400, 'nested client path fields must be rejected by the route');
  assert.deepEqual(fs.readdirSync(exportDir).sort(), beforeInvalid, 'invalid path requests must not create files');
});

await withServer({}, async (baseUrl) => {
  const missing = await postExport(baseUrl, payload);
  assert.equal(missing.response.status, 503, 'missing approved export configuration must fail closed');
  assert.deepEqual(fs.readdirSync(exportDir).sort(), ['万年麻将_第41局_game-e2e-20260808-001.json', '万年麻将_第41局_game-e2e-20260808-001_导出2.json'].sort(), 'missing configuration must not write files');
});

await withServer({
  GAME_EXPORT_DIR: exportDir,
  APPROVED_GAME_EXPORT_DIR: otherDir,
  GAME_EXPORT_REQUIRE_APPROVED: '1',
}, async (baseUrl) => {
  const mismatch = await postExport(baseUrl, payload);
  assert.equal(mismatch.response.status, 503, 'mismatched export configuration must fail closed');
  assert.deepEqual(fs.readdirSync(otherDir), [], 'mismatched configuration must not write to the approved directory');
});

console.log('P2 game export E2E regression: passed');
