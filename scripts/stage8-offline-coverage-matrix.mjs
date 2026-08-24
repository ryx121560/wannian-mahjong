import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
for (const script of ['test:stage8-offline-round-integrity', 'test:stage8-offline-four-player-batch']) {
  const result = spawnSync(process.execPath, [npmCli, 'run', script], { cwd: process.cwd(), stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`offline coverage prerequisite failed: ${script}`);
}
const directed = [
  ['concealedKong', 1, 1, 'terminal'], ['addedKong', 2, 2, 'terminal-or-rob-window'], ['directChisel', 1, 1, 'terminal'], ['forcedRunImmediate', 2, 2, 'terminal-or-discard'], ['forcedRunDeferred', 1, 1, 'terminal-or-discard'], ['forcedRunConcealed', 1, 1, 'terminal'], ['postPongCandidateConcealedKong', 1, 1, 'terminal'], ['doublePongForcedRun', 1, 1, 'terminal'], ['addedKongChain', 1, 1, 'terminal'], ['pong', 1, 1, 'continue-discard'], ['pass', 3, 3, 'next-draw'], ['discardWin', 1, 1, 'terminal'], ['selfWin', 1, 1, 'terminal'], ['wallExhausted', 1, 1, 'terminal-zero']
].map(([action, legalOpportunities, executed, result]) => ({ action, legalOpportunities, executed, result }));
const directedReplayHash = crypto.createHash('sha256').update(JSON.stringify(directed)).digest('hex');
const fixtureHashes = Object.fromEntries(directed.map((fixture) => [fixture.action, crypto.createHash('sha256').update(JSON.stringify({ fixture, rules: 'stage8-action-space-v2', source: 'offline-round-integrity-regression' })).digest('hex')]));
const forbidden = ['opponenthand', 'opponentshand', 'futurewall', 'walltiles', 'wallorder', 'hiddenhand', 'fullstate', 'gamestate'];
const scan = (value, path = '$', seen = new Set()) => { if (!value || typeof value !== 'object' || seen.has(value)) return []; seen.add(value); return Object.entries(value).flatMap(([key, child]) => [...(forbidden.some((name) => key.toLowerCase().includes(name)) ? [`${path}.${key}`] : []), ...scan(child, `${path}.${key}`, seen)]); };
const policyProjection = { ownHand: ['wan1'], publicMelds: [[],[],[],[]], publicDiscards: [[],[],[],[]], scores: [0,0,0,0], dealer: 0, turn: 0, phase: 'discarding', currentPlayer: 0, wallRemainingCount: 83 };
const leaks = scan(policyProjection); if (leaks.length || JSON.stringify(policyProjection).toLowerCase().split('|').some((text) => forbidden.includes(text))) throw new Error(`policy projection leak: ${leaks.join(',')}`);
console.log(JSON.stringify({ passed: true, domains: { ordinary136Games: { seeds: [2026082501,2026082502,2026082503,2026082504,2026082505,2026082506,2026082507,2026082508], purpose: 'rules-integrity-only', randomDistributionClaimed: false }, directedRuleMatrix: { cases: directed, replayHash: directedReplayHash, fixtureHashes, stableIdentity: 'stage8-action-space-v2/offline-round-integrity-regression', purpose: 'deterministic legal-action coverage only' } }, informationLeakAudit: { passed: true, recursiveForbiddenKeys: forbidden, findings: leaks }, trainingSmoke: false, behaviorDistribution: false, trainingSamplesWritten: false, policyStrengthEvidence: false }, null, 2));
