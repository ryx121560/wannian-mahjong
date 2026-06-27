export type TileSuit = 'wan' | 'tong' | 'tiao';
export type HonorSuit = 'dong' | 'nan' | 'xi' | 'bei' | 'zhong' | 'fa' | 'bai';
export type TileKey = `${TileSuit}${number}` | HonorSuit;
export type WinType = '自摸' | '点炮' | '抢杠' | '杠开' | '天胡' | '地胡';
export type HandRoute = 'normal' | 'sevenPairs' | 'dalan' | 'banzhengzong' | 'quanzhengzong' | 'allHonor';
export type HandType = '平胡' | '七对' | '打烂' | '半正宗' | '全正宗' | '七字半正宗' | '七字全正宗' | '全风向' | '碰碰胡' | '混一色' | '清一色';
export type LegalAction = 'win' | 'selfWin' | 'pong' | 'openKong' | 'concealedKong' | 'addedKong' | 'pass' | 'discard';

export interface RuleContext {
  winTile?: TileKey;
  winType?: WinType;
  preMelds?: number;
  useWild?: boolean;
}

export interface WinResult {
  canWin: boolean;
  route: HandRoute | null;
  handType: HandType | null;
  useWild: boolean;
  reason: string;
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

export interface PlayerState {
  hand: TileKey[];
  melds?: Array<{ tile: TileKey; count: number; type?: string }>;
  score?: number;
}

export interface ActionState {
  players: PlayerState[];
  currentPlayer: number;
  phase: 'drawing' | 'discarding' | 'responding' | 'ended' | 'idle';
  lastDiscard?: TileKey;
  lastDiscardPlayer?: number;
  newDrawnTile?: TileKey;
}

export interface SettlementInput {
  winner: number;
  winType: WinType;
  hand: TileKey[];
  scores: number[];
  payer?: number;
  robKongTarget?: number;
}

export interface SettlementResult {
  before: number[];
  after: number[];
  delta: number[];
  payer: number | 'all' | null;
  winner: number;
  winType: WinType;
  handType: HandType;
  points: number;
  reason: string;
}

const HONORS: HonorSuit[] = ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai'];
const SUITS: TileSuit[] = ['wan', 'tong', 'tiao'];

function isHonor(tile: TileKey): tile is HonorSuit {
  return (HONORS as string[]).includes(tile);
}

function tileSuit(tile: TileKey): TileSuit | null {
  if (isHonor(tile)) return null;
  const suit = tile.slice(0, -1) as TileSuit;
  return SUITS.includes(suit) ? suit : null;
}

function tileValue(tile: TileKey): number {
  if (isHonor(tile)) return 0;
  return Number(tile.slice(-1));
}

function countTiles(hand: TileKey[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tile of hand) counts[tile] = (counts[tile] || 0) + 1;
  return counts;
}

function uniqueTiles(hand: TileKey[]): TileKey[] {
  return Array.from(new Set(hand));
}

function isSevenPairs(hand: TileKey[]): boolean {
  if (hand.length !== 14) return false;
  return Object.values(countTiles(hand)).every((count) => count === 2);
}

function isAllHonor(hand: TileKey[]): boolean {
  return hand.length > 0 && hand.every(isHonor);
}

function isDalan(hand: TileKey[]): boolean {
  if (hand.length !== 14) return false;
  const unique = uniqueTiles(hand);
  if (unique.length !== hand.length) return false;
  if (HONORS.filter((tile) => unique.includes(tile)).length < 5) return false;
  for (const suit of SUITS) {
    const values = unique
      .filter((tile) => tileSuit(tile) === suit)
      .map(tileValue)
      .sort((a, b) => a - b);
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] - values[i - 1] < 3) return false;
    }
  }
  return true;
}

function isQizi(hand: TileKey[]): boolean {
  return HONORS.every((tile) => hand.includes(tile));
}

function groupOf(tile: TileKey): number | null {
  if (isHonor(tile)) return null;
  const value = tileValue(tile);
  if (value < 1 || value > 9) return null;
  return value % 3;
}

function isQuanzhengzong(hand: TileKey[]): boolean {
  if (!isDalan(hand)) return false;
  const groups = uniqueTiles(hand)
    .filter((tile) => !isHonor(tile))
    .map(groupOf)
    .filter((group): group is number => group !== null);
  return groups.length > 0 && new Set(groups).size === 1;
}

function isBanzhengzong(hand: TileKey[]): boolean {
  if (!isDalan(hand)) return false;
  const perSuit: Record<TileSuit, Set<number>> = { wan: new Set(), tong: new Set(), tiao: new Set() };
  for (const tile of uniqueTiles(hand)) {
    const suit = tileSuit(tile);
    const group = groupOf(tile);
    if (suit && group !== null) perSuit[suit].add(group);
  }
  if (Object.values(perSuit).some((groups) => groups.size > 1)) return false;
  return new Set(Object.values(perSuit).flatMap((groups) => Array.from(groups))).size > 1;
}

function removeSet(counts: Record<string, number>, tiles: TileKey[]): Record<string, number> | null {
  const next = { ...counts };
  for (const tile of tiles) {
    if (!next[tile]) return null;
    next[tile] -= 1;
  }
  return next;
}

function groupsOk(counts: Record<string, number>): boolean {
  const active = Object.keys(counts).filter((tile) => counts[tile] > 0) as TileKey[];
  if (active.length === 0) return true;
  const tile = active[0];
  if (counts[tile] >= 3) {
    const next = removeSet(counts, [tile, tile, tile]);
    if (next && groupsOk(next)) return true;
  }
  const suit = tileSuit(tile);
  const value = tileValue(tile);
  if (suit && value <= 7) {
    const next = removeSet(counts, [tile, `${suit}${value + 1}` as TileKey, `${suit}${value + 2}` as TileKey]);
    if (next && groupsOk(next)) return true;
  }
  return false;
}

function isNormalWin(hand: TileKey[], preMelds = 0): boolean {
  const totalLength = hand.length + preMelds * 3;
  if (totalLength % 3 !== 2) return false;
  const counts = countTiles(hand);
  for (const tile of Object.keys(counts) as TileKey[]) {
    if (counts[tile] >= 2) {
      const rest = removeSet(counts, [tile, tile]);
      if (rest && groupsOk(rest)) return true;
    }
  }
  return false;
}

function routeFor(hand: TileKey[], preMelds = 0): HandRoute | null {
  if (isAllHonor(hand)) return 'allHonor';
  if (preMelds === 0) {
    if (isQizi(hand) && isQuanzhengzong(hand)) return 'quanzhengzong';
    if (isQizi(hand) && isBanzhengzong(hand)) return 'banzhengzong';
    if (isQuanzhengzong(hand)) return 'quanzhengzong';
    if (isBanzhengzong(hand)) return 'banzhengzong';
    if (isSevenPairs(hand)) return 'sevenPairs';
    if (isDalan(hand)) return 'dalan';
  }
  if (isNormalWin(hand, preMelds)) return 'normal';
  return null;
}

export function classifyHand(hand: TileKey[], context: RuleContext = {}): HandType {
  const route = routeFor(hand, context.preMelds || 0);
  if (route === 'allHonor') return '全风向';
  if (isQizi(hand) && isQuanzhengzong(hand)) return '七字全正宗';
  if (isQizi(hand) && isBanzhengzong(hand)) return '七字半正宗';
  if (route === 'quanzhengzong') return '全正宗';
  if (route === 'banzhengzong') return '半正宗';
  if (route === 'sevenPairs') return '七对';
  if (route === 'dalan') return '打烂';
  const suits = new Set(hand.map(tileSuit).filter(Boolean));
  const hasHonor = hand.some(isHonor);
  if (suits.size === 1 && !hasHonor) return '清一色';
  if (suits.size === 1 && hasHonor) return '混一色';
  if (Object.values(countTiles(hand)).filter((count) => count >= 3).length === 4) return '碰碰胡';
  return '平胡';
}

function isSpecial(hand: TileKey[]): boolean {
  return isSevenPairs(hand) || isAllHonor(hand) || isDalan(hand);
}

function meetsThreshold(hand: TileKey[], winTile?: TileKey): boolean {
  if (isSpecial(hand)) return true;
  if (!winTile || isHonor(winTile)) return true;
  return tileValue(winTile) >= 5;
}

export function canWin(hand: TileKey[], context: RuleContext = {}): WinResult {
  const route = routeFor(hand, context.preMelds || 0);
  if (!route) return { canWin: false, route: null, handType: null, useWild: false, reason: 'hand-not-complete' };
  if (!meetsThreshold(hand, context.winTile)) {
    return { canWin: false, route, handType: classifyHand(hand, context), useWild: false, reason: 'win-tile-below-threshold' };
  }
  return { canWin: true, route, handType: classifyHand(hand, context), useWild: false, reason: 'ok' };
}

function shantenSevenPairs(hand: TileKey[]): number {
  const counts = Object.values(countTiles(hand));
  const pairs = counts.filter((count) => count >= 2).length;
  const unique = counts.length;
  return Math.max(0, 6 - pairs + Math.max(0, 7 - unique));
}

function shantenDalan(hand: TileKey[]): number {
  const unique = uniqueTiles(hand);
  let issues = hand.length - unique.length;
  issues += Math.max(0, 5 - HONORS.filter((tile) => unique.includes(tile)).length);
  for (const suit of SUITS) {
    const values = unique.filter((tile) => tileSuit(tile) === suit).map(tileValue).sort((a, b) => a - b);
    for (let i = 1; i < values.length; i += 1) if (values[i] - values[i - 1] < 3) issues += 1;
  }
  return issues;
}

function shantenZhengzong(hand: TileKey[], unified: boolean): number {
  let issues = shantenDalan(hand);
  const groupsBySuit: Record<TileSuit, Set<number>> = { wan: new Set(), tong: new Set(), tiao: new Set() };
  for (const tile of hand) {
    const suit = tileSuit(tile);
    const group = groupOf(tile);
    if (suit && group !== null) groupsBySuit[suit].add(group);
  }
  const allGroups = new Set<number>();
  for (const groups of Object.values(groupsBySuit)) {
    const values = Array.from(groups);
    values.forEach((group) => allGroups.add(group));
    issues += Math.max(0, values.length - 1);
  }
  if (unified) issues += Math.max(0, allGroups.size - 1);
  return issues;
}

function shantenNormalApprox(hand: TileKey[], preMelds = 0): number {
  if (isNormalWin(hand, preMelds)) return 0;
  const counts = countTiles(hand);
  const triplets = Object.values(counts).filter((count) => count >= 3).length;
  const pairs = Object.values(counts).filter((count) => count >= 2).length;
  let sequences = 0;
  for (const suit of SUITS) {
    for (let value = 1; value <= 7; value += 1) {
      if (counts[`${suit}${value}`] && counts[`${suit}${value + 1}`] && counts[`${suit}${value + 2}`]) sequences += 1;
    }
  }
  const melds = Math.min(4, preMelds + triplets + sequences);
  return Math.max(0, 4 - melds + (pairs > 0 ? 0 : 1));
}

export function getShanten(hand: TileKey[], context: RuleContext = {}): ShantenResult {
  const normal = shantenNormalApprox(hand, context.preMelds || 0);
  const sevenPairs = context.preMelds ? 99 : shantenSevenPairs(hand);
  const dalan = context.preMelds ? 99 : shantenDalan(hand);
  const banzhengzong = context.preMelds ? 99 : shantenZhengzong(hand, false);
  const quanzhengzong = context.preMelds ? 99 : shantenZhengzong(hand, true);
  const entries: Array<[Exclude<HandRoute, 'allHonor'>, number]> = [
    ['quanzhengzong', quanzhengzong],
    ['banzhengzong', banzhengzong],
    ['dalan', dalan],
    ['sevenPairs', sevenPairs],
    ['normal', normal],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return { shanten: entries[0][1], normal, sevenPairs, dalan, banzhengzong, quanzhengzong, recommendedRoute: entries[0][0] };
}

export function getLegalActions(state: ActionState, playerId: number): LegalAction[] {
  const player = state.players[playerId];
  if (!player) return [];
  const actions = new Set<LegalAction>();
  if (state.phase === 'discarding' && state.currentPlayer === playerId) {
    actions.add('discard');
    if (canWin(player.hand, { winType: '自摸' }).canWin) actions.add('selfWin');
    for (const count of Object.values(countTiles(player.hand))) if (count === 4) actions.add('concealedKong');
  }
  if (state.phase === 'responding' && state.lastDiscard && state.lastDiscardPlayer !== playerId) {
    const handWithDiscard = player.hand.concat(state.lastDiscard);
    if (canWin(handWithDiscard, { winTile: state.lastDiscard, winType: '点炮', preMelds: player.melds?.length || 0 }).canWin) actions.add('win');
    const sameCount = player.hand.filter((tile) => tile === state.lastDiscard).length;
    if (sameCount >= 2) actions.add('pong');
    if (sameCount >= 3) actions.add('openKong');
    actions.add('pass');
  }
  return Array.from(actions);
}

function calcPoints(hand: TileKey[], winType: WinType): number {
  const handType = classifyHand(hand);
  const table: Record<HandType, { zm: number; dp: number }> = {
    平胡: { zm: 1, dp: 2 },
    七对: { zm: 2, dp: 4 },
    打烂: { zm: 1, dp: 2 },
    半正宗: { zm: 2, dp: 4 },
    全正宗: { zm: 4, dp: 8 },
    七字半正宗: { zm: 4, dp: 8 },
    七字全正宗: { zm: 8, dp: 16 },
    碰碰胡: { zm: 2, dp: 4 },
    混一色: { zm: 2, dp: 4 },
    清一色: { zm: 4, dp: 8 },
    全风向: { zm: 16, dp: 16 },
  };
  const base = table[handType] || table.平胡;
  if (winType === '点炮') return base.dp;
  if (winType === '抢杠') return base.dp * 3;
  if (winType === '天胡' || winType === '地胡') return 4;
  if (winType === '杠开') return base.zm * 2;
  return base.zm;
}

export function scoreSettlement(input: SettlementInput): SettlementResult {
  const before = input.scores.slice();
  const after = before.slice();
  const points = calcPoints(input.hand, input.winType);
  let payer: number | 'all' | null = null;
  if (input.winType === '点炮' || input.winType === '抢杠') {
    payer = input.winType === '抢杠' ? input.robKongTarget ?? input.payer ?? null : input.payer ?? null;
    if (typeof payer !== 'number') throw new Error('payer required for point win or rob kong');
    after[input.winner] += points;
    after[payer] -= points;
  } else {
    payer = 'all';
    after[input.winner] += points * 3;
    for (let i = 0; i < after.length; i += 1) if (i !== input.winner) after[i] -= points;
  }
  const delta = after.map((score, index) => score - before[index]);
  return {
    before,
    after,
    delta,
    payer,
    winner: input.winner,
    winType: input.winType,
    handType: classifyHand(input.hand),
    points,
    reason: `${classifyHand(input.hand)} ${input.winType} 结算`,
  };
}
