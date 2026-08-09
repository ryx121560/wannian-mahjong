export * from './types';
export * from './rule-config';
export * from './tile-utils';
export * from './meld-validator';
export * from './hand-evaluator';
export * from './score-calculator';
export * from './wildcard-resolver';
export * from './kong-resource';
export * from './concealed-kong';
export * from './added-kong';
export * from './special-kong';

import { canPeng, canAnGang, canMingGang } from './meld-validator';
import { canWin } from './hand-evaluator';
import { canUseDeferredForcedRun, classifyDiscardKongClaim, resolveDiscardWinner } from './kong-resource';
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
    if (canUseDeferredForcedRun(state, playerId)) actions.add('deferredForcedRunKong');
  }
  if (state.phase === 'responding' && state.lastDiscard && state.lastDiscardPlayer !== playerId) {
    const winner = resolveDiscardWinner(state);
    if (winner != null) {
      if (winner === playerId) actions.add('win');
      actions.add('pass');
      return Array.from(actions);
    }
    const handWithDiscard = player.hand.concat(state.lastDiscard);
    if (canWin(handWithDiscard, { winTile: state.lastDiscard, winType: '点炮', melds: player.melds || [] }).canWin) actions.add('win');
    if (canPeng(player.hand, state.lastDiscard)) actions.add('pong');
    const kongClaim = classifyDiscardKongClaim({
      hand: player.hand,
      melds: player.melds || [],
      discardTile: state.lastDiscard,
      owner: playerId,
      discardPlayer: state.lastDiscardPlayer,
    });
    if (kongClaim.kind === 'directChisel') actions.add('directChisel');
    if (kongClaim.kind === 'forcedRunImmediate') actions.add('forcedRunKong');
    actions.add('pass');
  }
  return Array.from(actions);
}

export function canWinAfterPass(input: { passRecords: { player: number; tile: string; round: number }[]; player: number; tile: string; round: number }): boolean {
  return !input.passRecords.some((record) => record.player === input.player && record.tile === input.tile && record.round === input.round);
}
