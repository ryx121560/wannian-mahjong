import { baseScoreForHandType, classifyHand, getPrimaryHandType } from './hand-evaluator';
import { resolveKongDraw } from './kong-resource';
import { DEFAULT_RULES } from './rule-config';
import { isArrow, isHonor, tileSuit } from './tile-utils';
import type { HandType, KongResourceSettlementInput, KongSettlementInput, KongSettlementResult, KongWinEvent, Meld, MeldType, SettlementInput, SettlementResult, Tile, WinMethod } from './types';

export function applyCap(scorePerPlayer: number[], cap = DEFAULT_RULES.capAmount): number[] {
  return scorePerPlayer.map((score) => Math.min(score, cap));
}

export function checkNoColor(hand: Tile[], _melds: Meld[] = [], gangDrawTile?: Tile, handTypes: HandType[] = []): boolean {
  if (!gangDrawTile) return false;
  if (!handTypes.includes('清一色') && !handTypes.includes('混一色')) return false;
  const numberSuits = Array.from(new Set(hand.filter((tile) => !isHonor(tile)).map(tileSuit)));
  if (numberSuits.length !== 1) return false;
  return isHonor(gangDrawTile) || isArrow(gangDrawTile) || tileSuit(gangDrawTile) === numberSuits[0];
}

export function calculateScore(params: {
  handTypes: HandType[];
  baseScore?: number;
  winMethod: WinMethod;
  gangType?: MeldType;
  noColorBonus?: boolean;
  isTrueWin?: boolean;
  trueWinBonus?: boolean;
  lianGangCount?: number;
  zhiChanFromPlayer?: number;
  currentPlayer: number;
  payer?: number;
}): { scorePerPlayer: number[]; winnerGain: number; capped: boolean } {
  const noColorBonus = params.noColorBonus ?? false;
  const isTrueWin = params.isTrueWin ?? true;
  const lianGangCount = params.lianGangCount ?? 0;
  const baseScore = params.baseScore ?? params.handTypes.reduce((product, item) => product * baseScoreForHandType(item), 1);
  let score = baseScore;
  if (params.winMethod === '杠开') score *= 2;
  if (params.gangType === 'anGang') score *= 2;
  if (noColorBonus) score *= 2;
  if (noColorBonus && isTrueWin) score *= 2;
  if (params.trueWinBonus) score *= 2;
  if (!isTrueWin) score *= 2;
  if (lianGangCount > 0) score *= 2 ** lianGangCount;
  if (params.winMethod === '抢杠') score = 6;
  if (params.winMethod === '天胡' || params.winMethod === '地胡') score = 4;
  const cappedScore = Math.min(score, DEFAULT_RULES.capAmount);
  let capped = score >= DEFAULT_RULES.capAmount;
  const scorePerPlayer = [0, 0, 0, 0];
  if (params.zhiChanFromPlayer != null) {
    const zhiChanPayerRaw = score * 2;
    const otherPayerRaw = score;
    capped = capped || zhiChanPayerRaw >= DEFAULT_RULES.capAmount || otherPayerRaw >= DEFAULT_RULES.capAmount;
    scorePerPlayer[params.zhiChanFromPlayer] = Math.min(zhiChanPayerRaw, DEFAULT_RULES.capAmount);
    for (let i = 0; i < 4; i += 1) if (i !== params.currentPlayer && i !== params.zhiChanFromPlayer) scorePerPlayer[i] = Math.min(otherPayerRaw, DEFAULT_RULES.capAmount);
  } else if (params.winMethod === '点炮' || params.winMethod === '抢杠') {
    scorePerPlayer.fill(0);
    const payer = params.payer ?? (params.currentPlayer + 1) % 4;
    scorePerPlayer[payer] = params.winMethod === '点炮' ? Math.min(score * 2, DEFAULT_RULES.capAmount) : cappedScore;
  } else {
    for (let i = 0; i < 4; i += 1) if (i !== params.currentPlayer) scorePerPlayer[i] = cappedScore;
  }
  return { scorePerPlayer, winnerGain: scorePerPlayer.reduce((sum, item) => sum + item, 0), capped };
}

function multiplierForHandTypes(handTypes: HandType[]): number {
  return handTypes.reduce((product, handType) => product * baseScoreForHandType(handType), 1);
}

function basePaymentsForKongEvent(event: KongWinEvent, winner: number, pointKongPlayer?: number): number[] {
  const payments = [0, 0, 0, 0];
  if (event === 'forcedRunGangKaiFakeWin') {
    for (let playerId = 0; playerId < payments.length; playerId += 1) if (playerId !== winner) payments[playerId] = 2;
    return payments;
  }
  if (pointKongPlayer == null || pointKongPlayer === winner) throw new Error('pointKongPlayer required for direct chisel kong settlement');
  const isTrue = event === 'directChiselTrueWin' || event === 'directChiselChainTrueWin';
  const isChain = event === 'directChiselChainTrueWin' || event === 'directChiselChainFakeWin';
  const pointKongBase = isChain ? (isTrue ? 16 : 8) : (isTrue ? 8 : 4);
  const otherBase = isChain ? (isTrue ? 8 : 4) : (isTrue ? 4 : 2);
  for (let playerId = 0; playerId < payments.length; playerId += 1) {
    if (playerId === winner) continue;
    payments[playerId] = playerId === pointKongPlayer ? pointKongBase : otherBase;
  }
  return payments;
}

export function scoreKongSettlement(input: KongSettlementInput): KongSettlementResult {
  const resolution = resolveKongDraw(input.action);
  if (resolution.outcome === 'forcedRunFailureDiscard') {
    throw new Error('failed forced run cannot settle');
  }
  const evaluation = resolution.evaluation;
  if (!evaluation.canComplete || !evaluation.classification || !evaluation.decomposition) {
    throw new Error('completed kong resource evaluation required for settlement');
  }
  if (evaluation.classification.selectedDecomposition?.signature !== evaluation.decomposition.signature) {
    throw new Error('kong resource classification must bind the selected decomposition');
  }
  const event = resolution.outcome;
  const before = input.scores.slice();
  const multiplier = multiplierForHandTypes(evaluation.classification.handTypes);
  const rawPayments = basePaymentsForKongEvent(event, input.winner, input.pointKongPlayer)
    .map((payment) => payment * multiplier);
  const payments = applyCap(rawPayments);
  const after = before.slice();
  const winnerGain = payments.reduce((total, payment) => total + payment, 0);
  after[input.winner] += winnerGain;
  for (let playerId = 0; playerId < after.length; playerId += 1) after[playerId] -= payments[playerId];
  return {
    before,
    after,
    delta: after.map((score, index) => score - before[index]),
    payments,
    winner: input.winner,
    event,
    handTypes: evaluation.classification.handTypes,
    multiplier,
    capped: rawPayments.some((payment) => payment > DEFAULT_RULES.capAmount),
  };
}

export function scoreKongResourceSettlement(input: KongResourceSettlementInput): KongSettlementResult {
  return scoreKongSettlement(input);
}

function pointsFor(hand: Tile[], winType: WinMethod): number {
  const classification = classifyHand(hand);
  const base = classification.baseScore || baseScoreForHandType(classification.primaryType);
  if (winType === '点炮') return Math.min(base * 2, DEFAULT_RULES.capAmount);
  if (winType === '抢杠') return 6;
  if (winType === '天胡' || winType === '地胡') return 4;
  if (winType === '杠开') return Math.min(base * 2, DEFAULT_RULES.capAmount);
  return Math.min(base, DEFAULT_RULES.capAmount);
}

export function scoreSettlement(input: SettlementInput): SettlementResult {
  const before = input.scores.slice();
  const after = before.slice();
  const points = pointsFor(input.hand, input.winType);
  let payer: number | 'all' | null = null;
  if (input.winType === '点炮' || input.winType === '抢杠') {
    payer = input.winType === '抢杠' ? input.robKongTarget ?? input.payer ?? null : input.payer ?? null;
    if (typeof payer !== 'number') throw new Error('payer required for point win or rob kong');
    after[input.winner] += points;
    after[payer] -= points;
  } else {
    payer = 'all';
    after[input.winner] += points * 3;
    for (let i = 0; i < after.length; i += 1) if (i !== input.winner) after[i] -= points;
  }
  const delta = after.map((score, index) => score - before[index]);
  const classification = classifyHand(input.hand);
  const handType = getPrimaryHandType(input.hand);
  return { before, after, delta, payer, winner: input.winner, winType: input.winType, handType, handTypes: classification.handTypes, baseScore: classification.baseScore, points, reason: `${handType} ${input.winType} 结算` };
}
