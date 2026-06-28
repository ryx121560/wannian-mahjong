export * from './types';
export * from './rule-config';
export * from './tile-utils';
export * from './meld-validator';
export * from './hand-evaluator';
export * from './score-calculator';
export * from './wildcard-resolver';

import { canPeng, canAnGang, canMingGang } from './meld-validator';
import { canWin } from './hand-evaluator';
import type { GameState, LegalAction } from './types';

export function getLegalActions(state: GameState, playerId: number): LegalAction[] {
  const players = state.players || [];
  const player = players[playerId] || { hand: state.hand || [], melds: [] };
  const actions = new Set<LegalAction>();
  if (state.phase === 'discarding' && state.currentPlayer === playerId) {
    actions.add('discard');
    if (canWin(player.hand, { winType: '自摸', melds: player.melds || [] }).canWin) actions.add('selfWin');
    if (canAnGang(player.hand).length) actions.add('concealedKong');
    for (const meld of player.melds || []) if (canMingGang(player.hand, [meld], meld.tiles[0])) actions.add('addedKong');
  }
  if (state.phase === 'responding' && state.lastDiscard && state.lastDiscardPlayer !== playerId) {
    const handWithDiscard = player.hand.concat(state.lastDiscard);
    if (canWin(handWithDiscard, { winTile: state.lastDiscard, winType: '点炮', melds: player.melds || [] }).canWin) actions.add('win');
    if (canPeng(player.hand, state.lastDiscard)) actions.add('pong');
    if (player.hand.filter((tile) => tile === state.lastDiscard).length >= 3) actions.add('openKong');
    actions.add('pass');
  }
  return Array.from(actions);
}

export function canWinAfterPass(input: { passRecords: { player: number; tile: string; round: number }[]; player: number; tile: string; round: number }): boolean {
  return !input.passRecords.some((record) => record.player === input.player && record.tile === input.tile && record.round === input.round);
}
