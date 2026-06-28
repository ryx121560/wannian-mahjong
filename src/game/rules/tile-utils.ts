import type { Meld, Mod3Group, NumberSuit, Suit, Tile } from './types';

export const NUMBER_SUITS: NumberSuit[] = ['wan', 'tong', 'tiao'];
export const WIND_TILES: Tile[] = ['dong', 'nan', 'xi', 'bei'];
export const ARROW_TILES: Tile[] = ['zhong', 'fa', 'bai'];
export const HONOR_TILES: Tile[] = [...WIND_TILES, ...ARROW_TILES];
export const ALL_TILE_KEYS: Tile[] = [
  ...NUMBER_SUITS.flatMap((suit) => Array.from({ length: 9 }, (_, index) => `${suit}${index + 1}` as Tile)),
  ...HONOR_TILES,
];

export function tileValue(tile: Tile): number {
  if (isHonor(tile)) return 0;
  return Number(tile.slice(-1));
}

export function tileSuit(tile: Tile): Suit {
  if (isWind(tile)) return 'feng';
  if (isArrow(tile)) return 'jian';
  return tile.slice(0, -1) as NumberSuit;
}

export function isNumberTile(tile: Tile): boolean {
  return NUMBER_SUITS.includes(tile.slice(0, -1) as NumberSuit);
}

export function isHonor(tile: Tile): boolean {
  return HONOR_TILES.includes(tile);
}

export function isWind(tile: Tile): boolean {
  return WIND_TILES.includes(tile);
}

export function isArrow(tile: Tile): boolean {
  return ARROW_TILES.includes(tile);
}

export function sortTiles(tiles: Tile[]): Tile[] {
  const suitOrder: Record<Suit, number> = { wan: 0, tong: 1, tiao: 2, feng: 3, jian: 4 };
  const honorOrder = new Map(HONOR_TILES.map((tile, index) => [tile, index]));
  return tiles.slice().sort((a, b) => {
    const suitDiff = suitOrder[tileSuit(a)] - suitOrder[tileSuit(b)];
    if (suitDiff) return suitDiff;
    if (isHonor(a) || isHonor(b)) return (honorOrder.get(a) ?? 0) - (honorOrder.get(b) ?? 0);
    return tileValue(a) - tileValue(b);
  });
}

export function groupBySuit(tiles: Tile[]): Map<Suit, Tile[]> {
  const grouped = new Map<Suit, Tile[]>();
  for (const tile of tiles) {
    const suit = tileSuit(tile);
    grouped.set(suit, [...(grouped.get(suit) || []), tile]);
  }
  return grouped;
}

export function countTiles(tiles: Tile[]): Map<Tile, number> {
  const counts = new Map<Tile, number>();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) || 0) + 1);
  return counts;
}

export function countTileRecord(tiles: Tile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tile of tiles) counts[tile] = (counts[tile] || 0) + 1;
  return counts;
}

export function getRemainingCount(tile: Tile, hand: Tile[], discards: Tile[][] = [], melds: Meld[][] = []): number {
  let visible = hand.filter((item) => item === tile).length;
  for (const row of discards) visible += row.filter((item) => item === tile).length;
  for (const playerMelds of melds) {
    for (const meld of playerMelds) visible += meld.tiles.filter((item) => item === tile).length;
  }
  return Math.max(0, 4 - visible);
}

export function isShunzi(a: Tile, b: Tile, c: Tile): boolean {
  if (!isNumberTile(a) || !isNumberTile(b) || !isNumberTile(c)) return false;
  const suits = [tileSuit(a), tileSuit(b), tileSuit(c)];
  if (new Set(suits).size !== 1) return false;
  const values = [tileValue(a), tileValue(b), tileValue(c)].sort((x, y) => x - y);
  return values[0] + 1 === values[1] && values[1] + 1 === values[2];
}

export function isKezi(a: Tile, b: Tile, c: Tile): boolean {
  return a === b && b === c;
}

export function isDuizi(a: Tile, b: Tile): boolean {
  return a === b;
}

export function isWindShunzi(a: Tile, b: Tile, c: Tile): boolean {
  const tiles = [a, b, c];
  return (tiles.every(isWind) || tiles.every(isArrow)) && new Set(tiles).size === 3;
}

export function isYaoJiu(tile: Tile): boolean {
  return isHonor(tile) || tileValue(tile) === 1 || tileValue(tile) === 9;
}

export function isZhongZhang(tile: Tile): boolean {
  return isNumberTile(tile) && tileValue(tile) >= 2 && tileValue(tile) <= 8;
}

export function tileMod3Group(tile: Tile): Mod3Group {
  if (!isNumberTile(tile)) return 0;
  const mod = tileValue(tile) % 3;
  if (mod === 1) return 147;
  if (mod === 2) return 258;
  return 369;
}

export function uniqueTiles(tiles: Tile[]): Tile[] {
  return Array.from(new Set(tiles));
}
