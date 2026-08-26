import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage8-canonical-mcts-'));
const require = createRequire(import.meta.url);

function compileTree(source, output) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(output, entry.name.replace(/\.ts$/, '.js'));
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      compileTree(from, to);
    } else if (entry.name.endsWith('.ts')) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, ts.transpileModule(fs.readFileSync(from, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: from,
      }).outputText);
    }
  }
}

try {
  compileTree(path.join(root, 'src/game'), path.join(temp, 'game'));
  const providerTools = require(path.join(temp, 'game/stage8/offline-canonical-mcts-provider.js'));
  const actions = require(path.join(temp, 'game/stage8/action-registry-v2.js'));
  const identities = require(path.join(temp, 'game/stage8/offline-action-identity.js'));
  const mcts = require(path.join(temp, 'game/mcts/mcts-enhancement-engine.js'));
  const identity = identities.hashStage8OfflineIdentity('canonical-mcts-source-bundle');
  const visibleState = {
    actor: 0,
    ownHand: ['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8','wan9','tong1','tong2','tong3','tong4','tong5'],
    publicMelds: [[],[],[],[]],
    publicDiscards: [[],['wan1'],['tong9'],['nan']],
    scores: [0,0,0,0],
    dealer: 0,
    turn: 18,
    phase: 'discarding',
    currentPlayer: 0,
    wallRemainingCount: 70,
  };
  const legalActions = [
    ...['wan1','wan2','wan3','wan4','wan5','wan6','wan7','wan8'].map((tile) => actions.canonicalizeStage8V2Action({ actionType: 'discard', actor: 0, declarationWindow: 'self-draw-discard', tile, ownTileCount: 1, robKongWindow: false })),
    actions.canonicalizeStage8V2Action({ actionType: 'win', actor: 0, declarationWindow: 'self-draw-discard', robKongWindow: false }),
    actions.canonicalizeStage8V2Action({ actionType: 'normalConcealedKong', actor: 0, declarationWindow: 'self-draw-discard', tile: 'wan9', ownTileCount: 4, robKongWindow: false }),
  ];
  const provider = providerTools.createStage8CanonicalMctsProvider({ providerIdentitySha256: identity, behaviorTemperature: 1.25 });
  const request = { visibleState, legalActions, identitySha256: identity };
  const first = provider(request);
  const second = provider(structuredClone(request));
  const keys = legalActions.map(identities.stage8CanonicalActionKey).sort();
  assert.deepEqual(Object.keys(first).sort(), keys, 'all canonical candidates must be represented');
  assert.ok(keys.length > 6, 'regression exceeds the production summary top-six surface');
  assert.ok(Object.values(first).every((value) => Number.isFinite(value) && value > 0));
  assert.ok(Math.abs(Object.values(first).reduce((sum, value) => sum + value, 0) - 1) <= 1e-12);
  assert.deepEqual(second, first, 'same visible input and identity must be deterministic');
  const mctsContext = {
    turn: visibleState.turn, player: 0, phase: 'discarding', scores: visibleState.scores,
    discards: visibleState.publicDiscards, melds: [], handSummary: visibleState.ownHand,
    candidates: legalActions.map((action) => ({ id: identities.stage8CanonicalActionKey(action), action: action.actionType === 'discard' ? 'discard' : action.actionType === 'win' ? 'win' : 'kong', tile: action.tile, legal: true, baseScore: 0 })),
  };
  assert.equal(mcts.scoreMctsCandidateValues(mctsContext).length, legalActions.length, 'existing MCTS exports every legal score');
  assert.throws(() => provider({ ...request, identitySha256: identities.hashStage8OfflineIdentity('wrong') }), /identity-mismatch/);
  assert.throws(() => provider({ ...request, visibleState: { ...visibleState, opponentHands: [['bai']] } }), /visible-state-invalid/, 'hidden fields fail closed');
  assert.equal(providerTools.hashStage8CanonicalMctsProviderDefinition({ behaviorTemperature: 1.25 }), providerTools.hashStage8CanonicalMctsProviderDefinition({ behaviorTemperature: 1.25 }));
  console.log(JSON.stringify({
    passed: true,
    canonicalCandidates: keys.length,
    distributionSum: Object.values(first).reduce((sum, value) => sum + value, 0),
    existingMctsFullScoreSurface: true,
    productionDecisionSemanticsChanged: false,
    formalSmokeGamesExecuted: 0,
    artifactsWritten: false,
  }, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
