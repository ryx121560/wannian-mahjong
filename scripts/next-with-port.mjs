import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'dev';
const allowedModes = new Set(['dev', 'start']);
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
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen({ port, host, exclusive: true });
  });
}

async function findPort() {
  const maxOffset = Number.isInteger(portWindow) && portWindow > 0 ? portWindow : 10;
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const port = preferredPort + offset;
    if (port > 65535) break;
    const ipv6Free = await canListen(port, '::');
    const ipv4Free = await canListen(port, '0.0.0.0');
    const localFree = await canListen(port, '127.0.0.1');
    if (ipv6Free && ipv4Free && localFree) return port;
  }
  throw new Error(`No available port from ${preferredPort} to ${preferredPort + maxOffset}`);
}

function resolveNextBin() {
  const binName = process.platform === 'win32' ? 'next.cmd' : 'next';
  const localBin = path.resolve(process.cwd(), 'node_modules', '.bin', binName);
  if (fs.existsSync(localBin)) return localBin;
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function resolveStartCommand(port) {
  const standaloneServer = path.resolve(process.cwd(), '.next', 'standalone', 'server.js');
  if (fs.existsSync(standaloneServer)) {
    return {
      command: process.execPath,
      args: [standaloneServer],
      env: { ...process.env, PORT: String(port) },
    };
  }

  const command = resolveNextBin();
  const usesNpx = path.basename(command).startsWith('npx');
  return {
    command,
    args: usesNpx ? ['next', 'start', '-p', String(port)] : ['start', '-p', String(port)],
    env: process.env,
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
        const command = resolveNextBin();
        const usesNpx = path.basename(command).startsWith('npx');
        return {
          command,
          args: usesNpx ? ['next', 'dev', '-p', String(port)] : ['dev', '-p', String(port)],
          env: process.env,
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
  console.error(`[next-with-port] ${error.message}`);
  process.exit(1);
}
