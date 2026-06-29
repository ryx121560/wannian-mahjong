import { isHonor, isNumberTile, tileSuit, tileValue } from '../rules';
import type { Meld, OpponentModel, RouteType, StrongAIGameState, Tile } from './types';
import { allTileKeys, clamp, getPlayerHand, remainingCount, roundScore } from './utils';

type DiscardQuality = OpponentModel['discardAnalysis']['qualityChange'];

const NUMBER_SUITS = ['wan', 'tiao', 'tong'] as const;

function opponentMelds(opponentIndex: number, state: StrongAIGameState): Meld[] {
  return (state.melds?.[opponentIndex] || state.players?.[opponentIndex]?.melds || []).slice();
}

function sequence(opponentIndex: number, state: StrongAIGameState): Tile[] {
  return (state.discards?.[opponentIndex] || []).slice();
}

function suitOf(tile: Tile): keyof OpponentModel['discardAnalysis']['suitDistribution'] {
  if (isHonor(tile)) return 'honor';
  return tileSuit(tile) as 'wan' | 'tiao' | 'tong';
}

function suitDistribution(discardSequence: Tile[]): OpponentModel['discardAnalysis']['suitDistribution'] {
  const result = { wan: 0, tiao: 0, tong: 0, honor: 0 };
  if (!discardSequence.length) return result;
  for (const tile of discardSequence) result[suitOf(tile)] += 1;
  return {
    wan: roundScore(result.wan / discardSequence.length),
    tiao: roundScore(result.tiao / discardSequence.length),
    tong: roundScore(result.tong / discardSequence.length),
    honor: roundScore(result.honor / discardSequence.length),
  };
}

function estimateDiscardQuality(discardSequence: Tile[], turn: number): DiscardQuality {
  if (discardSequence.length < 3) return 'stable';
  const recent = discardSequence.slice(-3);
  const central = recent.filter((tile) => isNumberTile(tile) && tileValue(tile) >= 4 && tileValue(tile) <= 6).length;
  const terminalOrHonor = recent.filter((tile) => isHonor(tile) || (isNumberTile(tile) && [1, 9].includes(tileValue(tile)))).length;
  if (turn >= 7 && central >= 2) return 'dropping';
  if (terminalOrHonor >= 2) return 'improving';
  return 'stable';
}

function meldHasSuit(meld: Meld, suit: string): boolean {
  return meld.tiles.some((tile) => !!tile && isNumberTile(tile) && tileSuit(tile) === suit);
}

function hasHonorMeld(melds: Meld[]): boolean {
  return melds.some((meld) => meld.tiles.some((tile) => !!tile && isHonor(tile)));
}

function pongLikeCount(melds: Meld[]): number {
  return melds.filter((meld) => meld.type === 'peng' || meld.type === 'mingGang' || meld.type === 'anGang' || meld.type === 'zhiChan').length;
}

function hasWildcardAbility(melds: Meld[]): boolean {
  return melds.some((meld) => meld.type === 'mingGang' || meld.type === 'anGang' || meld.type === 'zhiChan');
}

function discardedByCurrentWithoutCall(tile: Tile, opponentIndex: number, state: StrongAIGameState): boolean {
  const current = state.currentPlayer;
  if (!(state.discards?.[current] || []).includes(tile)) return false;
  return !opponentMelds(opponentIndex, state).some((meld) => meld.tiles.includes(tile));
}

export function analyzeDiscards(opponentIndex: number, state: StrongAIGameState): OpponentModel['discardAnalysis'] {
  const discardSequence = sequence(opponentIndex, state);
  return {
    sequence: discardSequence,
    qualityChange: estimateDiscardQuality(discardSequence, state.turn || 1),
    suitDistribution: suitDistribution(discardSequence),
  };
}

export function estimateHandDistribution(opponentIndex: number, state: StrongAIGameState): Map<Tile, number> {
  const ownHand = getPlayerHand(state);
  const discardSequence = sequence(opponentIndex, state);
  const analysis = analyzeDiscards(opponentIndex, state);
  const melds = opponentMelds(opponentIndex, state);
  const discarded = new Set(discardSequence);
  const unknownTotal = Math.max(1, allTileKeys().reduce((sum, tile) => sum + remainingCount(state, tile, ownHand), 0));
  const raw = new Map<Tile, number>();

  for (const tile of allTileKeys()) {
    let probability = remainingCount(state, tile, ownHand) / unknownTotal;
    if (discarded.has(tile)) probability *= 0.05;
    if (isNumberTile(tile) && analysis.suitDistribution[tileSuit(tile) as 'wan' | 'tiao' | 'tong'] > 0) probability *= 0.5;
    if (isNumberTile(tile) && analysis.suitDistribution[tileSuit(tile) as 'wan' | 'tiao' | 'tong'] < 0.2 && melds.some((meld) => meldHasSuit(meld, tileSuit(tile)))) probability *= 1.4;
    if (discardedByCurrentWithoutCall(tile, opponentIndex, state)) probability *= 0.3;
    raw.set(tile, Math.max(0, probability));
  }

  const concealedSize = Math.max(1, 13 - melds.reduce((sum, meld) => sum + meld.tiles.length, 0));
  const total = Math.max(0.0001, Array.from(raw.values()).reduce((sum, value) => sum + value, 0));
  const normalized = new Map<Tile, number>();
  for (const [tile, value] of raw.entries()) normalized.set(tile, roundScore(clamp((value / total) * concealedSize, 0, 1)));
  return normalized;
}

export function estimateTenpaiProbability(opponentIndex: number, state: StrongAIGameState): { probability: number; confidence: number } {
  const meldCount = opponentMelds(opponentIndex, state).length;
  const turn = state.turn || 1;
  let probability = 0.35;
  if (meldCount >= 3) probability = 0.9;
  else if (meldCount === 2 && turn >= 13) probability = 0.85;
  else if (meldCount === 2 && turn >= 7) probability = 0.65;
  else if (meldCount === 2) probability = 0.45;
  else if (meldCount === 1 && turn < 7) probability = 0.2;
  else if (meldCount === 1 && turn <= 12) probability = 0.45;
  else if (meldCount === 1) probability = 0.75;
  else if (turn < 7) probability = 0.05;
  else if (turn <= 12) probability = 0.15;

  const quality = analyzeDiscards(opponentIndex, state).qualityChange;
  if (quality === 'dropping') probability += 0.2;
  if (quality === 'improving') probability -= 0.1;

  const confidence = clamp(0.3 + meldCount * 0.15 + (turn >= 13 ? 0.15 : turn >= 7 ? 0.05 : 0), 0.3, 0.9);
  return { probability: roundScore(clamp(probability, 0, 1)), confidence: roundScore(confidence) };
}

function route(type: RouteType, confidence: number, expectedHandValue: number, evidence: string[]): ReturnType<typeof predictRoute> {
  return { type, confidence: roundScore(confidence), evidence, expectedHandValue };
}

export function predictRoute(opponentIndex: number, state: StrongAIGameState): {
  type: RouteType;
  confidence: number;
  evidence: string[];
  expectedHandValue: number;
} {
  const discards = sequence(opponentIndex, state);
  const melds = opponentMelds(opponentIndex, state);
  const analysis = analyzeDiscards(opponentIndex, state);
  const numberDiscards = discards.filter(isNumberTile);
  const honorDiscards = discards.filter(isHonor);

  if (discards.length <= 1 && !melds.length) return route('unknown', 0.1, 2, ['limited-info']);
  if (!numberDiscards.length && (hasHonorMeld(melds) || honorDiscards.length >= 2)) return route('quanfeng', 0.5, 16, ['honor-route']);

  for (const suit of NUMBER_SUITS) {
    if (analysis.suitDistribution[suit] < 0.1 && melds.some((meld) => meldHasSuit(meld, suit))) return route('qingyise', 0.7, 4, [`low-${suit}-discard`, `${suit}-meld`]);
  }

  for (const suit of NUMBER_SUITS) {
    if (analysis.suitDistribution[suit] < 0.2 && hasHonorMeld(melds)) return route('hunyise', 0.6, 2, [`low-${suit}-discard`, 'honor-meld']);
  }

  if (pongLikeCount(melds) >= 2) return route('pengpeng', 0.7, 2, ['multiple-pong-like-melds']);

  const distinctSuits = new Set(discards.map(suitOf));
  if (distinctSuits.size >= 3 && honorDiscards.length <= 2) return route('dalan', 0.4, 1, ['wide-discard-spread']);

  return route('pinghu', 0.3, 1, ['default-route']);
}

export function buildOpponentModel(opponentIndex: number, state: StrongAIGameState): OpponentModel {
  const melds = opponentMelds(opponentIndex, state);
  const tenpai = estimateTenpaiProbability(opponentIndex, state);
  const predicted = predictRoute(opponentIndex, state);
  return {
    playerIndex: opponentIndex,
    handDistribution: estimateHandDistribution(opponentIndex, state),
    tenpaiProbability: tenpai.probability,
    tenpaiConfidence: tenpai.confidence,
    predictedRoute: { type: predicted.type, confidence: predicted.confidence, evidence: predicted.evidence },
    expectedHandValue: predicted.expectedHandValue,
    melds,
    meldCount: melds.length,
    discardAnalysis: analyzeDiscards(opponentIndex, state),
  };
}

export function buildOpponentModels(state: StrongAIGameState, currentPlayer = state.currentPlayer): OpponentModel[] {
  const playerCount = Math.max(4, state.discards?.length || 0, state.melds?.length || 0, state.players?.length || 0);
  const models: OpponentModel[] = [];
  for (let player = 0; player < playerCount; player += 1) {
    if (player !== currentPlayer) models.push(buildOpponentModel(player, state));
  }
  return models;
}

export function opponentHasWildcardAbility(opponent: OpponentModel): boolean {
  return hasWildcardAbility(opponent.melds);
}
