export interface Tile {
  k: string;
  t: "num" | "honor";
  s: string;
  v: number;
}

export interface Meld {
  type: "peng" | "gang" | "an_gang" | "chi";
  tile: Tile;
  count: number;
  tiles?: Tile[];
  from?: number;
}

export type PathType =
  | "norm"
  | "7p"
  | "dalan"
  | "quanzheng"
  | "banzheng"
  | "clear"
  | "mixed";
