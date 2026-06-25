import { honorMap, suitMap } from "@/game/constants/tiles";
import type { Tile } from "@/types";

export function lbl(tile: Tile): string {
  if (tile.t === "num") return tile.v + suitMap[tile.s];
  return honorMap[tile.s] || tile.s;
}

export function tkey(tile: Tile): string {
  return tile.k;
}

export function teq(a: Tile, b: Tile): boolean {
  return a.k === b.k;
}

export function kt(key: string): Tile {
  if ("dongnanxibeizhongfabai".includes(key)) {
    return { k: key, t: "honor", s: key, v: 0 };
  }

  const suit = key.slice(0, key.length - 1);
  return {
    k: key,
    t: "num",
    s: suit,
    v: Number.parseInt(key.slice(-1), 10),
  };
}
