import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'dev';
const allowedModes = new Set(['dev', 'start']);
const loopbackHost = '127.0.0.1';
const require = createRequire(import.meta.url);
const preferredPort = Number.parseInt(process.env.PORT || '18765', 10);
const portWindow = Number.parseInt(process.env.PORT_WINDOW || '10', 10);

if (!allowedModes.has(mode)) {
  console.error(`[next-with-port] Unsupported mode: ${mode}`);
  process.exit(1);
}

if (!Number.isInteger(preferredPort) || preferredPort <= 0 || preferredPort > 65535) {
  console.error(`[next-with-port] Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

function cleanDevCache() {
  if (mode !== 'dev' || process.env.CLEAN_NEXT_CACHE === '0') return;
  const cacheDir = path.resolve(process.cwd(), '.next');
  fs.rmSync(cacheDir, { recursive: true, force: true });
  console.log('[next-with-port] Removed .next cache before dev startup');
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const finish = (available) => {
      if (settled) return;
      settled = true;
      resolve(available);
    };
    server.once('error', () => finish(false));
    server.once('listening', () => {
      server.close((error) => finish(!error));
    });
    try {
      server.listen({ port, host, exclusive: true });
    } catch {
      finish(false);
    }
  });
}

async function findPort() {
  const maxOffset = Number.isInteger(portWindow) && portWindow >= 0 ? portWindow : 10;
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const port = preferredPort + offset;
    if (port > 65535) break;
    if (await canListen(port, loopbackHost)) return port;
  }
  throw new Error(`No available port from ${preferredPort} to ${preferredPort + maxOffset}`);
}

function resolveNextCli() {
  return require.resolve('next/dist/bin/next');
}

function syncDirForStandalone(source, target) {
  if (!fs.existsSync(source)) return false;
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  return true;
}

function ensureStandaloneAssets() {
  const standaloneDir = path.resolve(process.cwd(), '.next', 'standalone');
  const publicSource = path.resolve(process.cwd(), 'public');
  const publicTarget = path.join(standaloneDir, 'public');
  const staticSource = path.resolve(process.cwd(), '.next', 'static');
  const staticTarget = path.join(standaloneDir, '.next', 'static');
  const copiedPublic = syncDirForStandalone(publicSource, publicTarget);
  const copiedStatic = syncDirForStandalone(staticSource, staticTarget);
  if (copiedPublic || copiedStatic) {
    console.log(`[next-with-port] Synced standalone assets: public=${copiedPublic} static=${copiedStatic}`);
  }
}

function resolveStartCommand(port) {
  const standaloneServer = path.resolve(process.cwd(), '.next', 'standalone', 'server.js');
  if (fs.existsSync(standaloneServer)) {
    ensureStandaloneAssets();
    return {
      command: process.execPath,
      args: [standaloneServer],
      env: { ...process.env, PORT: String(port), HOSTNAME: loopbackHost },
    };
  }

  return {
    command: process.execPath,
    args: [resolveNextCli(), 'start', '-p', String(port), '-H', loopbackHost],
    env: { ...process.env, HOSTNAME: loopbackHost },
  };
}

function quoteWindowsArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

try {
  cleanDevCache();
  const port = await findPort();
  if (port !== preferredPort) {
    console.log(`[next-with-port] Port ${preferredPort} is unavailable, using ${port}`);
  }

  const startCommand = mode === 'start'
    ? resolveStartCommand(port)
    : (() => {
        return {
          command: process.execPath,
          args: [resolveNextCli(), 'dev', '-p', String(port), '-H', loopbackHost],
          env: { ...process.env, HOSTNAME: loopbackHost },
        };
      })();

  const child = process.platform === 'win32'
    ? spawn([startCommand.command, ...startCommand.args].map(quoteWindowsArg).join(' '), {
        stdio: 'inherit',
        shell: true,
        env: startCommand.env,
      })
    : spawn(startCommand.command, startCommand.args, {
        stdio: 'inherit',
        shell: false,
        env: startCommand.env,
      });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[next-with-port] ${message}`);
  process.exit(1);
}
