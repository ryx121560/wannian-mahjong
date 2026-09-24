import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'scripts', 'next-with-port.mjs'), 'utf8');

assert.match(
  source,
  /Number\.isInteger\(portWindow\)\s*&&\s*portWindow\s*>=\s*0\s*\?\s*portWindow\s*:\s*10/,
  'PORT_WINDOW=0 must retain an exact-port window instead of silently falling back to ten ports',
);

const server = net.createServer();
await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve));
const occupiedPort = server.address().port;
try {
  const result = spawnSync(process.execPath, ['scripts/next-with-port.mjs', 'dev'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(occupiedPort), PORT_WINDOW: '0', CLEAN_NEXT_CACHE: '0' },
    encoding: 'utf8',
  });
  assert.equal(result.error, undefined, `exact-port launch must start Node successfully: ${result.error?.message || 'unknown spawn error'}`);
  assert.notEqual(result.status, 0, 'exact-port launch must fail while its only permitted port is occupied');
  assert.match(
    `${result.stdout || ''}\n${result.stderr || ''}`,
    new RegExp(`No available port from ${occupiedPort} to ${occupiedPort}`),
    'launch failure must report the exact configured port instead of selecting a fallback port',
  );
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log('Production exact-port window regression passed');
