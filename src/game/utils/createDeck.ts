import type { Tile } from "@/types";

export function createTiles(): Tile[] {
  const tiles: Tile[] = [];
  const suits = ["wan", "tong", "tiao"];

  for (const suit of suits) {
    for (let value = 1; value <= 9; value++) {
      for (let count = 0; count < 4; count++) {
        tiles.push({ k: `${suit}${value}`, t: "num", s: suit, v: value });
      }
    }
  }

  for (const honor of ["dong", "nan", "xi", "bei", "zhong", "fa", "bai"]) {
    for (let count = 0; count < 4; count++) {
      tiles.push({ k: honor, t: "honor", s: honor, v: 0 });
    }
  }

  return tiles;
}

export const TILES = createTiles();
