import { countTiles } from './tile-utils';
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
