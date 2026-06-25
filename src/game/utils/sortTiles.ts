import { honorOrder, suitOrder } from "@/game/constants/tiles";
import type { Tile } from "@/types";

export function tcmp(a: Tile, b: Tile): number {
  if (a.t !== b.t) return a.t === "honor" ? 1 : -1;
  if (a.t === "honor") return honorOrder[a.s] - honorOrder[b.s];
  return a.s !== b.s ? suitOrder[a.s] - suitOrder[b.s] : a.v - b.v;
}
