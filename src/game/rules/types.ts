export type Suit = 'wan' | 'tong' | 'tiao' | 'feng' | 'jian';
export type NumberSuit = 'wan' | 'tong' | 'tiao';
export type WindTile = 'dong' | 'nan' | 'xi' | 'bei';
export type ArrowTile = 'zhong' | 'fa' | 'bai';
export type HonorTile = WindTile | ArrowTile;
export type Tile = `${NumberSuit}${number}` | HonorTile;
export type Mod3Group = 147 | 258 | 369 | 0;

export type MeldType = 'peng' | 'mingGang' | 'anGang' | 'zhiChan' | 'chi';
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
export type LegalAction =
  | 'win'
  | 'selfWin'
  | 'pong'
  | 'openKong'
  | 'concealedKong'
  | 'addedKong'
  | 'directChisel'
  | 'forcedRunKong'
  | 'deferredForcedRunKong'
  | 'pass'
  | 'discard';

export type KongResourceStatus = 'active' | 'consumed' | 'invalidated';
export interface KongResource {
  owner: number;
  tile: Tile;
  pongMeld: Meld;
  source: 'pong';
  status: KongResourceStatus;
}

export type KongClaimKind = 'directChisel' | 'forcedRunImmediate' | 'forcedRunDeferred' | 'chainKong';
export type KongDrawOutcome = 'directChiselTrueWin' | 'directChiselFakeWin' | 'forcedRunGangKaiTrueWin' | 'forcedRunGangKaiFakeWin' | 'forcedRunFailureDiscard' | 'directChiselChainTrueWin' | 'directChiselChainFakeWin';
export type KongWinEvent = Extract<KongDrawOutcome, 'directChiselTrueWin' | 'directChiselFakeWin' | 'forcedRunGangKaiTrueWin' | 'forcedRunGangKaiFakeWin' | 'directChiselChainTrueWin' | 'directChiselChainFakeWin'>;

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
  kongResources?: KongResource[];
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
  decompositionSignature: string;
  selectedDecomposition?: HandDecomposition;
}

export interface HandDecomposition {
  pair: [Tile, Tile];
  groups: Tile[][];
  signature: string;
  resourceUse?: {
    sourceTile: Tile;
    role: 'pair' | 'group';
    asTile: Tile;
  };
  fakeWinRemainder?: Tile;
}

export interface KongResourceEvaluationInput {
  owner: number;
  resource: KongResource;
  preKongHand: Tile[];
  hand: Tile[];
  melds: Meld[];
  allowFakeWinRemainder: boolean;
}

export interface ConditionalKongResourceEvaluationInput {
  sourceTile: Tile;
  hand: Tile[];
  melds: Meld[];
  allowFakeWinRemainder: boolean;
  consumeSourceTileFromHand?: boolean;
}

export interface KongResourceEvaluationResult {
  canComplete: boolean;
  reason: string;
  decomposition?: HandDecomposition;
  witnesses?: HandDecomposition[];
  classification?: HandClassification;
}

export interface BaseKongDrawInput {
  kind: Exclude<KongClaimKind, 'chainKong'>;
  owner: number;
  resource: KongResource;
  preKongHand: Tile[];
  handAfterKong: Tile[];
  melds: Meld[];
  drawTile: Tile;
}

export interface ChainKongDeclarationInput {
  owner: number;
  resource: KongResource;
  preKongHand: Tile[];
  initialHandAfterKong: Tile[];
  initialMelds: Meld[];
  firstDrawTile: Tile;
  secondKongTile: Tile;
  secondKongMeld: Meld;
  handBeforeKong: Tile[];
}

export interface ChainKongDrawInput extends ChainKongDeclarationInput {
  kind: 'chainKong';
  handAfterKong: Tile[];
  melds: Meld[];
  drawTile: Tile;
}

export type KongDrawResolutionInput = BaseKongDrawInput | ChainKongDrawInput;

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

export interface KongSettlementInput {
  action: KongDrawResolutionInput;
  winner: number;
  scores: number[];
  pointKongPlayer?: number;
}

export interface KongSettlementResult {
  before: number[];
  after: number[];
  delta: number[];
  payments: number[];
  winner: number;
  event: KongWinEvent;
  handTypes: HandType[];
  multiplier: number;
  capped: boolean;
}

export interface KongResourceSettlementInput {
  action: KongSettlementInput['action'];
  winner: KongSettlementInput['winner'];
  scores: KongSettlementInput['scores'];
  pointKongPlayer?: KongSettlementInput['pointKongPlayer'];
}
