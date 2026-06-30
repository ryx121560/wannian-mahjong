import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const bundlePath = path.join(root, 'public/game/recommendation_engine.js');
const code = fs.readFileSync(bundlePath, 'utf8');
const sandbox = { console, globalThis: {} };
sandbox.window = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: bundlePath });

const engine = sandbox.globalThis.WannianRecommendationEngine;
if (!engine || typeof engine.buildPanel !== 'function' || typeof engine.buildPanelHtml !== 'function') {
  throw new Error('WannianRecommendationEngine API missing');
}

const context = {
  turn: 8,
  phaseLabel: 'discarding',
  currentPlayer: 0,
  hand: ['wan3', 'wan4', 'wan5', 'tong3'],
  handLabels: { wan3: '三万', wan4: '四万', wan5: '五万', tong3: '三筒' },
  selectedTile: 'wan3',
  candidates: [
    { tile: 'wan3', tileLabel: '三万', totalScore: 12, shantenAfter: 1, route: 'norm', speedScore: 1, defenseScore: 0.2 },
    { tile: 'tong3', tileLabel: '三筒', totalScore: 5, shantenAfter: 2, route: 'norm', speedScore: -1, defenseScore: 0.5 },
  ],
  discards: [[], ['wan3'], [], []],
  melds: [],
  scores: [100, 100, 100, 100],
  records: [],
};

const panel = engine.buildPanel(context);
if (!panel || !Array.isArray(panel.sections) || panel.sections.length !== 10) {
  throw new Error(`Recommendation panel section count invalid: ${panel?.sections?.length}`);
}
const html = engine.buildPanelHtml(context);
for (const title of ['系统推荐', '点击分析', '响应阶段推荐', '本局推荐总结']) {
  if (!html.includes(title)) throw new Error(`Recommendation html missing ${title}`);
}

console.log('Browser recommendation engine verified: 10 sections available');
