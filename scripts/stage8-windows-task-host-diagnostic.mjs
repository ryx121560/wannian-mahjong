import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIAGNOSTIC_DURATION_MS = 12 * 60 * 1000;
export const DIAGNOSTIC_HEARTBEAT_MS = 30 * 1000;

export async function runStage8WindowsTaskHostDiagnostic(options = {}) {
  const durationMs = options.durationMs ?? DIAGNOSTIC_DURATION_MS;
  const heartbeatMs = options.heartbeatMs ?? DIAGNOSTIC_HEARTBEAT_MS;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
  const allowedDurationMs = options.allowedDurationMs ?? DIAGNOSTIC_DURATION_MS;
  if (durationMs !== allowedDurationMs || !Number.isSafeInteger(heartbeatMs) || heartbeatMs <= 0 || heartbeatMs > durationMs) {
    throw new Error('stage8-windows-task-host-diagnostic-policy');
  }
  const startedAt = now();
  let elapsedMs = 0;
  write(JSON.stringify({ event: 'diagnostic-started', elapsedMs, formalPathsRead: 0, formalPilotGamesCredited: 0 }));
  while (elapsedMs < durationMs) {
    await wait(Math.min(heartbeatMs, durationMs - elapsedMs));
    elapsedMs = Math.min(durationMs, Math.max(elapsedMs + heartbeatMs, now() - startedAt));
    write(JSON.stringify({ event: elapsedMs >= durationMs ? 'diagnostic-completed' : 'diagnostic-heartbeat', elapsedMs, formalPathsRead: 0, formalPilotGamesCredited: 0 }));
  }
  return { ok: true, elapsedMs, selfTerminated: true, formalPathsRead: 0, formalPilotGamesCredited: 0 };
}

export function parseStage8WindowsTaskHostDiagnosticArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--duration-ms' || argv[1] !== String(DIAGNOSTIC_DURATION_MS)) {
    throw new Error('usage: node stage8-windows-task-host-diagnostic.mjs --duration-ms 720000');
  }
  return { durationMs: DIAGNOSTIC_DURATION_MS };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const options = parseStage8WindowsTaskHostDiagnosticArgs(process.argv.slice(2));
    await runStage8WindowsTaskHostDiagnostic(options);
  } catch (error) {
    console.error(JSON.stringify({ event: 'diagnostic-failed', error: error instanceof Error ? error.message : String(error), formalPathsRead: 0, formalPilotGamesCredited: 0 }));
    process.exitCode = 1;
  }
}
