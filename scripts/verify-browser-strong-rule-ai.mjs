import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('public/game/strong_rule_ai.js', 'utf8');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(source, context);

const ai = context.window.WannianStrongRuleAI;
if (!ai || typeof ai.makeDecision !== 'function') throw new Error('WannianStrongRuleAI.makeDecision missing');
const decision = ai.makeDecision({
  hand: ['wan1', 'wan4', 'wan8', 'tiao2', 'tiao6', 'tong3', 'tong7', 'dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'],
  melds: [[], [], [], []],
  discards: [[], [], [], []],
  scores: [100, 100, 100, 100],
  turn: 3,
  currentPlayer: 0,
  dealer: 0,
  wallRemaining: 80,
});
if (!decision.selectedTile || !decision.allCandidates?.length || !decision.reasoning) throw new Error(`Invalid strong AI decision: ${JSON.stringify(decision)}`);
console.log('Browser strong rule AI verified');
