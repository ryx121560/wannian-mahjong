export type Suit = 'wan' | 'tong' | 'tiao' | 'feng' | 'jian';
export type NumberSuit = 'wan' | 'tong' | 'tiao';
export type WindTile = 'dong' | 'nan' | 'xi' | 'bei';
export type ArrowTile = 'zhong' | 'fa' | 'bai';
export type HonorTile = WindTile | ArrowTile;
export type Tile = `${NumberSuit}${number}` | HonorTile;
export type Mod3Group = 147 | 258 | 369 | 0;

export type MeldType = 'peng' | 'mingGang' | 'anGang' | 'zhiChan';
export interface Meld {
  type: MeldType;
  tiles: [Tile, Tile, Tile, Tile?];
  fromPlayer?: number;
}

export type HandType =
  | '平胡'
  | '碰碰胡'
  | '清一色'
  | '混一色'
  | '七对'
  | '全风向'
  | '打烂'
  | '半正宗'
  | '全正宗'
  | '七字半正宗'
  | '七字全正宗';

export type WinMethod = '自摸' | '点炮' | '抢杠' | '杠开' | '连杠' | '天胡' | '地胡';
export type HandRoute = 'normal' | 'sevenPairs' | 'dalan' | 'banzhengzong' | 'quanzhengzong' | 'allHonor';
export type LegalAction = 'win' | 'selfWin' | 'pong' | 'openKong' | 'concealedKong' | 'addedKong' | 'pass' | 'discard';

export interface GameState {
  hand?: Tile[];
  melds: Meld[][];
  discards: Tile[][];
  turn: number;
  dealer: number;
  currentPlayer: number;
  scores: number[];
  wallTiles: Tile[];
  passRecords: { player: number; tile: Tile; round: number }[];
  players?: Array<{ hand: Tile[]; melds?: Meld[]; score?: number }>;
  phase?: 'drawing' | 'discarding' | 'responding' | 'ended' | 'idle';
  lastDiscard?: Tile;
  lastDiscardPlayer?: number;
  newDrawnTile?: Tile;
}

export interface WinContext {
  winTile?: Tile;
  winType?: WinMethod;
  preMelds?: number;
  melds?: Meld[];
  useWild?: boolean;
}

export interface CanWinResult {
  canWin: boolean;
  route: HandRoute | null;
  handType: HandType | null;
  handTypes?: HandType[];
  baseScore?: number;
  useWild: boolean;
  reason: string;
}

export interface HandClassification {
  handTypes: HandType[];
  primaryType: HandType;
  baseScore: number;
  route: HandRoute | null;
  isDalan: boolean;
}

export interface ShantenResult {
  shanten: number;
  normal: number;
  sevenPairs: number;
  dalan: number;
  banzhengzong: number;
  quanzhengzong: number;
  recommendedRoute: Exclude<HandRoute, 'allHonor'>;
}

export interface TenpaiResult {
  isTenpai: boolean;
  waitingTiles: Tile[];
  waitingDetails: {
    tile: Tile;
    remaining: number;
    handTypeIfWin: HandType;
    baseScoreIfWin: number;
  }[];
}

export interface SettlementInput {
  winner: number;
  winType: WinMethod;
  hand: Tile[];
  scores: number[];
  payer?: number;
  robKongTarget?: number;
  lianGangCount?: number;
  noColorBonus?: boolean;
  isTrueWin?: boolean;
  gangType?: MeldType;
}

export interface SettlementResult {
  before: number[];
  after: number[];
  delta: number[];
  payer: number | 'all' | null;
  winner: number;
  winType: WinMethod;
  handType: HandType;
  handTypes?: HandType[];
  baseScore?: number;
  points: number;
  reason: string;
}
