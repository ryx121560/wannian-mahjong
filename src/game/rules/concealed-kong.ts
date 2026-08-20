import { canWin, classifyHand } from './hand-evaluator';
import { sortTiles } from './tile-utils';
import type { HandClassification, Meld, Tile } from './types';
import { resolveWildcard } from './wildcard-resolver';

export type ConcealedKongOutcome = 'concealedKongTrueWin' | 'concealedKongFakeWin' | 'concealedKongFailureDiscard';

export interface ConcealedKongDrawInput {
  owner: number;
  kongTile: Tile;
  preKongHand: Tile[];
  handAfterKong: Tile[];
  melds: Meld[];
  drawTile: Tile;
}

export interface ConcealedKongDrawResolution {
  outcome: ConcealedKongOutcome;
  mustDiscard: boolean;
  robKongWindow: false;
  handAfterDraw: Tile[];
  classification: HandClassification;
  fakeWinReplacement?: { originalTile: Tile; replacedBy: Tile };
}

function sameTiles(left: Tile[], right: Tile[]): boolean {
  const sortedLeft = sortTiles(left);
  const sortedRight = sortTiles(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((tile, index) => tile === sortedRight[index]);
}

function removeTiles(hand: Tile[], tile: Tile, amount: number): Tile[] | null {
  const remaining = hand.slice();
  for (let index = 0; index < amount; index += 1) {
    const tileIndex = remaining.indexOf(tile);
    if (tileIndex < 0) return null;
    remaining.splice(tileIndex, 1);
  }
  return remaining;
}

function hasDeclaredConcealedKong(melds: Meld[], kongTile: Tile): boolean {
  return melds.some((meld) => (
    meld.type === 'anGang'
    && meld.tiles.length === 4
    && meld.tiles.every((tile) => tile === kongTile)
  ));
}

function validateInput(input: ConcealedKongDrawInput): string | null {
  if (!hasDeclaredConcealedKong(input.melds, input.kongTile)) return 'concealed-kong-meld-required';
  const expectedHand = removeTiles(input.preKongHand, input.kongTile, 4);
  if (!expectedHand || !sameTiles(expectedHand, input.handAfterKong)) return 'concealed-kong-hand-mismatch';
  return null;
}

export function resolveConcealedKongDraw(input: ConcealedKongDrawInput): ConcealedKongDrawResolution {
  const invalid = validateInput(input);
  if (invalid) throw new Error(`invalid concealed kong context: ${invalid}`);
  const handAfterDraw = input.handAfterKong.concat(input.drawTile);
  const trueWin = canWin(handAfterDraw, { melds: input.melds, winTile: input.drawTile, winType: '杠开' }).canWin;
  if (trueWin) {
    return {
      outcome: 'concealedKongTrueWin',
      mustDiscard: false,
      robKongWindow: false,
      handAfterDraw,
      classification: classifyHand(handAfterDraw, input.melds, input.drawTile, '杠开'),
    };
  }
  const wildcard = resolveWildcard(handAfterDraw, input.melds, input.drawTile);
  if (wildcard.isFakeWin && wildcard.fakeWinReplacement) {
    const replacementIndex = handAfterDraw.indexOf(wildcard.fakeWinReplacement.originalTile);
    const classifiedHand = handAfterDraw.slice();
    classifiedHand[replacementIndex] = wildcard.fakeWinReplacement.replacedBy;
    return {
      outcome: 'concealedKongFakeWin',
      mustDiscard: false,
      robKongWindow: false,
      handAfterDraw,
      classification: classifyHand(classifiedHand, input.melds, input.drawTile, '杠开'),
      fakeWinReplacement: wildcard.fakeWinReplacement,
    };
  }
  return {
    outcome: 'concealedKongFailureDiscard',
    mustDiscard: true,
    robKongWindow: false,
    handAfterDraw,
    classification: classifyHand(handAfterDraw, input.melds, input.drawTile, '杠开'),
  };
}
