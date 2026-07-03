import { canWin, checkTenpai } from './hand-evaluator';
import { ALL_TILE_KEYS, countTiles } from './tile-utils';
import type { Meld, Tile } from './types';

export function canPeng(hand: Tile[], discardTile: Tile): boolean {
  return hand.filter((tile) => tile === discardTile).length >= 2;
}

export function canAnGang(hand: Tile[]): Tile[] {
  return Array.from(countTiles(hand).entries())
    .filter(([, count]) => count === 4)
    .map(([tile]) => tile);
}

export function canMingGang(hand: Tile[], melds: Meld[], selfDrawnTile: Tile): Tile | null {
  const hasPeng = melds.some((meld) => meld.type === 'peng' && meld.tiles[0] === selfDrawnTile);
  return hasPeng && hand.includes(selfDrawnTile) ? selfDrawnTile : null;
}

export function canQiangXingPaoGang(
  hand: Tile[],
  melds: Meld[],
  isTenpai: boolean,
  discardTile?: Tile,
): { canGang: boolean; gangTile: Tile | null; isPaoGang: boolean } {
  if (isTenpai) return { canGang: false, gangTile: null, isPaoGang: false };
  if (discardTile && hand.filter((tile) => tile === discardTile).length === 3) {
    return { canGang: true, gangTile: discardTile, isPaoGang: true };
  }
  const anGang = canAnGang(hand)[0];
  if (anGang) return { canGang: true, gangTile: anGang, isPaoGang: false };
  for (const meld of melds) {
    const tile = meld.tiles[0];
    if (meld.type === 'peng' && hand.includes(tile)) return { canGang: true, gangTile: tile, isPaoGang: false };
  }
  return { canGang: false, gangTile: null, isPaoGang: false };
}

export function canZhiChan(
  hand: Tile[],
  _melds: Meld[],
  isTenpai: boolean,
  discardTile: Tile,
  discardPlayer: number,
): { canZhiChan: boolean; discardPlayer?: number } {
  return { canZhiChan: isTenpai && hand.filter((tile) => tile === discardTile).length === 3, discardPlayer };
}

export function canLianGang(hand: Tile[], melds: Meld[], lastGangDrawTile: Tile): { canLianGang: boolean; gangTile: Tile | null } {
  const nextHand = hand.concat(lastGangDrawTile);
  const anGang = canAnGang(nextHand)[0];
  if (anGang) return { canLianGang: true, gangTile: anGang };
  const mingGang = canMingGang(nextHand, melds, lastGangDrawTile);
  return { canLianGang: !!mingGang, gangTile: mingGang };
}

export function getGangDrawTile(wallTiles: Tile[]): { drawTile: Tile; remainingWall: Tile[] } {
  if (!wallTiles.length) throw new Error('wallTiles is empty');
  return { drawTile: wallTiles[wallTiles.length - 1], remainingWall: wallTiles.slice(0, -1) };
}

function canWinWithWildcard(hand: Tile[], melds: Meld[], wildTile?: Tile): boolean {
  if (canWin(hand, { melds }).canWin) return true;
  if (!wildTile || !hand.includes(wildTile)) return false;
  const wildIndexes = hand.map((tile, index) => (tile === wildTile ? index : -1)).filter((index) => index >= 0);
  let found = false;
  const tryReplace = (source: Tile[], offset: number) => {
    if (found) return;
    if (offset >= wildIndexes.length) {
      found = canWin(source, { melds }).canWin;
      return;
    }
    const index = wildIndexes[offset];
    for (const tile of ALL_TILE_KEYS) {
      const next = source.slice();
      next[index] = tile;
      tryReplace(next, offset + 1);
      if (found) return;
    }
  };
  tryReplace(hand, 0);
  return found;
}

function checkTenpaiWithWildcard(hand: Tile[], melds: Meld[], wildTile?: Tile): boolean {
  if (checkTenpai(hand, melds).isTenpai) return true;
  return ALL_TILE_KEYS.some((tile) => canWinWithWildcard(hand.concat(tile), melds, wildTile));
}

export function checkQiangXingPaoGangResult(input: {
  beforeGangHand?: Tile[];
  afterGangHand?: Tile[];
  gangTile?: Tile;
  gangDrawTile: Tile;
  wildTile?: Tile;
  melds?: Meld[];
}): { isTenpai: boolean; paoGangSuccess: boolean } {
  const melds = input.melds || [];
  const afterGangHand = input.afterGangHand || [...(input.beforeGangHand || []), input.gangDrawTile];
  const candidates = afterGangHand.length % 3 === 2
    ? afterGangHand.map((_, index) => afterGangHand.filter((__, itemIndex) => itemIndex !== index))
    : [afterGangHand];
  const isTenpai = candidates.some((hand) => checkTenpaiWithWildcard(hand, melds, input.wildTile));
  return { isTenpai, paoGangSuccess: isTenpai };
}
