import { honorMap, suitMap } from "@/game/constants/tiles";
import type { Tile } from "@/types";

const HONOR_KEYS = new Set(["dong", "nan", "xi", "bei", "zhong", "fa", "bai"]);
const SUIT_KEYS = new Set(["wan", "tong", "tiao"]);

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
  if (!key) throw new Error("kt: empty key");
  if (HONOR_KEYS.has(key)) {
    return { k: key, t: "honor", s: key, v: 0 };
  }

  const suit = key.slice(0, key.length - 1);
  const value = Number.parseInt(key.slice(-1), 10);
  if (!SUIT_KEYS.has(suit) || !Number.isInteger(value) || value < 1 || value > 9) {
    throw new Error(`kt: invalid key "${key}"`);
  }

  return {
    k: key,
    t: "num",
    s: suit,
    v: value,
  };
}
