import type { Meld, Tile } from "./tile";

export interface Player {
  name: string;
  hand: Tile[];
  human: boolean;
  score: number;
  melds: Meld[];
}
