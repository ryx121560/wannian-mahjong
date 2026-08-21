import { canWin, classifyHand } from './hand-evaluator';
import { scoreSettlement } from './score-calculator';
import type { GameState, Meld, SettlementResult, Tile } from './types';

export type AddedKongDrawOutcome = 'addedKongRobbed' | 'addedKongImmediateWin' | 'addedKongContinueDiscard';

export interface AddedKongDrawInput {
  owner: number;
  kongTile: Tile;
  preKongHand: Tile[];
  melds: Meld[];
  drawTile: Tile;
  scores: number[];
  robKongState: GameState;
}

export interface AddedKongDrawResolution {
  outcome: AddedKongDrawOutcome;
  mustDiscard: boolean;
  handAfterDraw: Tile[];
  melds: Meld[];
  robKongWinner?: number;
  settlement?: SettlementResult;
  handTypes?: string[];
  publicLog: {
    action: 'addedKong';
    outcome: AddedKongDrawOutcome;
    owner: number;
    kongTile: Tile;
    drawTile?: Tile;
    handTypes?: string[];
  };
}

function isPeng(meld: Meld, tile: Tile): boolean {
  return meld.type === 'peng' && meld.tiles.length === 3 && meld.tiles.every((item) => item === tile);
}

function removeOne(hand: Tile[], tile: Tile): Tile[] | null {
  const next = hand.slice();
  const index = next.indexOf(tile);
  if (index < 0) return null;
  next.splice(index, 1);
  return next;
}

function robKongWinner(state: GameState, owner: number, tile: Tile): number | undefined {
  const players = state.players || [];
  for (let offset = 1; offset < players.length; offset += 1) {
    const playerId = (owner + offset) % players.length;
    const player = players[playerId];
    if (player && canWin(player.hand.concat(tile), { melds: player.melds || state.melds[playerId] || [], winTile: tile, winType: '抢杠' }).canWin) return playerId;
  }
  return undefined;
}

export function resolveAddedKongDraw(input: AddedKongDrawInput): AddedKongDrawResolution {
  if (!Number.isInteger(input.owner) || input.owner < 0 || input.owner >= input.scores.length) throw new Error('added-kong-owner-invalid');
  const handAfterKong = removeOne(input.preKongHand, input.kongTile);
  if (!handAfterKong) throw new Error('added-kong-fourth-tile-required');
  const pengIndex = input.melds.findIndex((meld) => isPeng(meld, input.kongTile));
  if (pengIndex < 0) throw new Error('added-kong-peng-required');

  const robbed = robKongWinner(input.robKongState, input.owner, input.kongTile);
  if (robbed != null) {
    return {
      outcome: 'addedKongRobbed', mustDiscard: false, handAfterDraw: input.preKongHand.slice(), melds: input.melds.slice(), robKongWinner: robbed,
      publicLog: { action: 'addedKong', outcome: 'addedKongRobbed', owner: input.owner, kongTile: input.kongTile },
    };
  }

  const melds = input.melds.map((meld, index) => index === pengIndex
    ? { type: 'mingGang' as const, tiles: [input.kongTile, input.kongTile, input.kongTile, input.kongTile] as [Tile, Tile, Tile, Tile], fromPlayer: meld.fromPlayer }
    : meld);
  const handAfterDraw = handAfterKong.concat(input.drawTile);
  const win = canWin(handAfterDraw, { melds, winTile: input.drawTile, winType: '杠开' });
  if (!win.canWin) {
    return {
      outcome: 'addedKongContinueDiscard', mustDiscard: true, handAfterDraw, melds,
      publicLog: { action: 'addedKong', outcome: 'addedKongContinueDiscard', owner: input.owner, kongTile: input.kongTile, drawTile: input.drawTile },
    };
  }
  const classification = classifyHand(handAfterDraw, melds, input.drawTile, '杠开');
  const settlementHand = handAfterDraw.concat(melds.flatMap((meld) => meld.tiles.slice(0, 3).filter((tile): tile is Tile => tile != null)));
  const settlement = scoreSettlement({ winner: input.owner, winType: '杠开', hand: settlementHand, scores: input.scores });
  return {
    outcome: 'addedKongImmediateWin', mustDiscard: false, handAfterDraw, melds, settlement, handTypes: classification.handTypes,
    publicLog: { action: 'addedKong', outcome: 'addedKongImmediateWin', owner: input.owner, kongTile: input.kongTile, drawTile: input.drawTile, handTypes: classification.handTypes },
  };
}
