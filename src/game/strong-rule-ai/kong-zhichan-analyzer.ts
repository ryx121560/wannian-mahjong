import { checkNoColor, countTiles } from '../rules';
import type { KongZhichanPotential, Meld, Tile } from './types';
import { clamp, roundScore } from './utils';

export function analyzeKongZhichan(hand: Tile[], melds: Meld[], isTenpai: boolean, handTypes: string[] = [], wallRemaining = 70): KongZhichanPotential {
  const counts = countTiles(hand);
  const anGangOpportunities: KongZhichanPotential['anGangOpportunities'] = [];
  const zhiChanOpportunities: KongZhichanPotential['zhiChanOpportunities'] = [];
  const paoGangOpportunities: KongZhichanPotential['paoGangOpportunities'] = [];
  for (const [tile, count] of counts.entries()) {
    if (count >= 4) anGangOpportunities.push({ tile: tile as Tile, probability: 1, expectedGain: 2, robRisk: isTenpai ? 0 : 0.1 });
    if (count === 3 && isTenpai) {
      const probability = clamp(((4 - count) / Math.max(1, wallRemaining)) * 3 * 0.5);
      zhiChanOpportunities.push({ keziTile: tile as Tile, probability: roundScore(probability), expectedGain: 2, interceptRisk: 0.05 });
    }
    if (count === 3 && !isTenpai) {
      const successProbability = clamp((4 - count) / Math.max(1, wallRemaining));
      paoGangOpportunities.push({ tile: tile as Tile, successProbability: roundScore(successProbability), expectedGain: 2, failCost: 1 });
    }
  }
  const lianGangPotential = { probability: anGangOpportunities.length > 0 ? 0.15 : 0, extraMultiplier: anGangOpportunities.length > 0 ? 2 : 1 };
  const noColorPossible = checkNoColor(hand, melds, undefined, handTypes as never[]);
  const noColorPotential = { isPossible: noColorPossible || handTypes.includes('清一色') || handTypes.includes('混一色'), probability: noColorPossible ? 0.5 : handTypes.includes('清一色') || handTypes.includes('混一色') ? 0.25 : 0, bonusMultiplier: 2 };
  const raw = anGangOpportunities.reduce((sum, item) => sum + item.probability * (item.expectedGain - item.robRisk * 6), 0)
    + zhiChanOpportunities.reduce((sum, item) => sum + item.probability * (item.expectedGain - item.interceptRisk), 0)
    + paoGangOpportunities.reduce((sum, item) => sum + item.successProbability * item.expectedGain - (1 - item.successProbability) * item.failCost, 0)
    + lianGangPotential.probability * lianGangPotential.extraMultiplier
    + noColorPotential.probability * noColorPotential.bonusMultiplier;
  return { anGangOpportunities, zhiChanOpportunities, paoGangOpportunities, lianGangPotential, noColorPotential, kongZhichanScore: roundScore(clamp(raw / 6)) };
}
