import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const bundlePath = path.join(process.cwd(), 'public/game/rule_engine.js');
if (!fs.existsSync(bundlePath)) {
  throw new Error('public/game/rule_engine.js is missing');
}

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(fs.readFileSync(bundlePath, 'utf8'), sandbox, { filename: bundlePath });

const engine = sandbox.window.WannianRuleEngine;
if (!engine) throw new Error('window.WannianRuleEngine is missing');

const hand = ['wan2', 'wan3', 'wan4', 'tong3', 'tong4', 'tong5', 'tiao5', 'tiao6', 'tiao7', 'wan6', 'wan7', 'wan8', 'dong', 'dong'];
const win = engine.canWin(hand, { winType: '自摸' });
if (!win || win.canWin !== true || win.handType !== '平胡') {
  throw new Error(`canWin browser bundle mismatch: ${JSON.stringify(win)}`);
}

const settlement = engine.scoreSettlement({ winner: 3, winType: '自摸', scores: [99, 97, 99, 103], hand });
if (JSON.stringify(settlement.delta) !== JSON.stringify([-1, -1, -1, 3])) {
  throw new Error(`scoreSettlement browser bundle mismatch: ${JSON.stringify(settlement.delta)}`);
}

console.log('Browser rule engine verified');
