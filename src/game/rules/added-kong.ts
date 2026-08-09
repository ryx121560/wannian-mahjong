import { canWin, classifyHand } from './hand-evaluator';
import { resolveRobKongWinner, transitionKongResource } from './kong-resource';
import { scoreSettlement } from './score-calculator';
import { prepareAddedKongChainWindow } from './special-kong';
import { sortTiles } from './tile-utils';
import type { GameState, HandClassification, KongResource, Meld, SettlementResult, Tile } from './types';

export type AddedKongDrawOutcome =
  | 'addedKongRobbed'
  | 'addedKongChainWindow'
  | 'addedKongImmediateWin'
  | 'addedKongContinueDiscard';

export interface AddedKongDrawInput {
  owner: number;
  kongTile: Tile;
  preKongHand: Tile[];
  melds: Meld[];
  drawTile: Tile;
  scores: number[];
  robKongState: GameState;
  resource?: KongResource;
}

export interface AddedKongChainWindow {
  owner: number;
  initialResource: KongResource;
  chainPongMeld: Meld;
  preKongHand: Tile[];
  initialHandAfterKong: Tile[];
  initialMelds: Meld[];
  firstDrawTile: Tile;
}

export interface AddedKongDrawResolution {
  outcome: AddedKongDrawOutcome;
  mustDiscard: boolean;
  robKongWindow: boolean;
  handAfterDraw: Tile[];
  melds: Meld[];
  robKongWinner?: number;
  resourceAfterKong?: KongResource;
  chainWindow?: AddedKongChainWindow;
  classification?: HandClassification;
  settlement?: SettlementResult;
  publicLog: {
    action: 'addedKong';
    outcome: AddedKongDrawOutcome;
    owner: number;
    kongTile: Tile;
    drawTile?: Tile;
    decompositionSignature?: string;
    handTypes?: string[];
  };
}

function sameTiles(left: Tile[], right: Tile[]): boolean {
  const sortedLeft = sortTiles(left);
  const sortedRight = sortTiles(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((tile, index) => tile === sortedRight[index]);
}

function removeOneTile(hand: Tile[], tile: Tile): Tile[] | null {
  const remaining = hand.slice();
  const index = remaining.indexOf(tile);
  if (index < 0) return null;
  remaining.splice(index, 1);
  return remaining;
}

function isExactPeng(meld: Meld, tile: Tile): boolean {
  return meld.type === 'peng'
    && meld.tiles.length === 3
    && meld.tiles.every((meldTile) => meldTile === tile);
}

function sameMeld(left: Meld, right: Meld): boolean {
  return left.type === right.type
    && left.fromPlayer === right.fromPlayer
    && left.tiles.length === right.tiles.length
    && left.tiles.every((tile, index) => tile === right.tiles[index]);
}

function upgradePeng(melds: Meld[], tile: Tile): Meld[] {
  let upgraded = false;
  return melds.map((meld) => {
    if (!upgraded && isExactPeng(meld, tile)) {
      upgraded = true;
      return { type: 'mingGang', tiles: [tile, tile, tile, tile], fromPlayer: meld.fromPlayer };
    }
    return meld;
  });
}

function effectivePageHand(hand: Tile[], melds: Meld[]): Tile[] {
  return hand.concat(melds.flatMap((meld) => meld.tiles.slice(0, 3).filter((tile): tile is Tile => tile != null)));
}

function validateInput(input: AddedKongDrawInput): { handAfterKong: Tile[]; meldsAfterKong: Meld[]; upgradedPeng: Meld } {
  if (!Number.isInteger(input.owner) || input.owner < 0 || input.owner >= input.scores.length) {
    throw new Error('added-kong-owner-invalid');
  }
  const upgradedPeng = input.melds.find((meld) => isExactPeng(meld, input.kongTile));
  if (!upgradedPeng) throw new Error('added-kong-peng-required');
  const handAfterKong = removeOneTile(input.preKongHand, input.kongTile);
  if (!handAfterKong) throw new Error('added-kong-fourth-tile-required');
  const meldsAfterKong = upgradePeng(input.melds, input.kongTile);
  if (!meldsAfterKong.some((meld) => meld.type === 'mingGang' && meld.tiles.every((tile) => tile === input.kongTile))) {
    throw new Error('added-kong-upgrade-failed');
  }
  if (input.resource) {
    const resourceMatches = input.resource.owner === input.owner
      && input.resource.status === 'active'
      && input.resource.tile === input.kongTile
      && sameMeld(input.resource.pongMeld, upgradedPeng);
    if (!resourceMatches) throw new Error('added-kong-resource-invalid');
  }
  return { handAfterKong, meldsAfterKong, upgradedPeng };
}

function publicLog(input: AddedKongDrawInput, outcome: AddedKongDrawOutcome, classification?: HandClassification): AddedKongDrawResolution['publicLog'] {
  return {
    action: 'addedKong',
    outcome,
    owner: input.owner,
    kongTile: input.kongTile,
    drawTile: outcome === 'addedKongRobbed' ? undefined : input.drawTile,
    decompositionSignature: classification?.decompositionSignature,
    handTypes: classification?.handTypes,
  };
}

export function resolveAddedKongDraw(input: AddedKongDrawInput): AddedKongDrawResolution {
  const { handAfterKong, meldsAfterKong } = validateInput(input);
  const robKongWinner = resolveRobKongWinner(input.robKongState, input.owner, input.kongTile);
  if (robKongWinner != null) {
    return {
      outcome: 'addedKongRobbed',
      mustDiscard: false,
      robKongWindow: true,
      handAfterDraw: input.preKongHand.slice(),
      melds: input.melds.slice(),
      robKongWinner,
      publicLog: publicLog(input, 'addedKongRobbed'),
    };
  }

  const handAfterDraw = handAfterKong.concat(input.drawTile);
  if (input.resource) {
    const chainPongMeld = meldsAfterKong.find((meld) => (
      isExactPeng(meld, input.drawTile) && meld.tiles[0] !== input.kongTile
    ));
    if (chainPongMeld) {
      const chainWindow: AddedKongChainWindow = {
        owner: input.owner,
        initialResource: input.resource,
        chainPongMeld,
        preKongHand: input.preKongHand.slice(),
        initialHandAfterKong: handAfterKong.slice(),
        initialMelds: meldsAfterKong,
        firstDrawTile: input.drawTile,
      };
      const declaration = prepareAddedKongChainWindow(chainWindow);
      if (declaration.canDeclare) {
        const resourceAfterKong = transitionKongResource(input.resource, { type: 'declareKong', player: input.owner });
        return {
          outcome: 'addedKongChainWindow',
          mustDiscard: false,
          robKongWindow: false,
          handAfterDraw,
          melds: meldsAfterKong,
          resourceAfterKong,
          chainWindow,
          publicLog: publicLog(input, 'addedKongChainWindow'),
        };
      }
    }
  }

  const win = canWin(handAfterDraw, { melds: meldsAfterKong, winTile: input.drawTile, winType: '杠开' });
  if (win.canWin) {
    const classification = classifyHand(handAfterDraw, meldsAfterKong, input.drawTile, '杠开');
    const settlement = scoreSettlement({
      winner: input.owner,
      winType: '杠开',
      hand: effectivePageHand(handAfterDraw, meldsAfterKong),
      scores: input.scores,
    });
    return {
      outcome: 'addedKongImmediateWin',
      mustDiscard: false,
      robKongWindow: false,
      handAfterDraw,
      melds: meldsAfterKong,
      classification,
      settlement,
      publicLog: publicLog(input, 'addedKongImmediateWin', classification),
    };
  }

  if (!sameTiles(handAfterDraw, handAfterKong.concat(input.drawTile))) throw new Error('added-kong-hand-after-draw-invalid');
  return {
    outcome: 'addedKongContinueDiscard',
    mustDiscard: true,
    robKongWindow: false,
    handAfterDraw,
    melds: meldsAfterKong,
    publicLog: publicLog(input, 'addedKongContinueDiscard'),
  };
}
