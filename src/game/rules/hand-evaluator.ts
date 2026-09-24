import { ALL_TILE_KEYS, ARROW_TILES, HONOR_TILES, NUMBER_SUITS, WIND_TILES, countTileRecord, countTiles, isHonor, isNumberTile, sortTiles, tileMod3Group, tileSuit, tileValue, uniqueTiles } from './tile-utils';
import type { CanWinResult, HandClassification, HandDecomposition, HandRoute, HandType, Meld, ShantenResult, TenpaiResult, Tile, WinContext } from './types';

const SHANTEN_CACHE_LIMIT = 5000;
const shantenResultCache = new Map<string, ShantenResult>();

function isSevenPairs(hand: Tile[]): boolean {
  return hand.length === 14 && Array.from(countTiles(hand).values()).every((count) => count === 2);
}

function isAllHonor(hand: Tile[]): boolean {
  return hand.length > 0 && hand.every(isHonor);
}

function checkDalanBasic(hand: Tile[]): boolean {
  if (hand.length !== 14) return false;
  const unique = uniqueTiles(hand);
  if (unique.length !== hand.length) return false;
  if (HONOR_TILES.filter((tile) => unique.includes(tile)).length < 5) return false;
  for (const suit of NUMBER_SUITS) {
    const values = unique.filter((tile) => tileSuit(tile) === suit).map(tileValue).sort((a, b) => a - b);
    for (let i = 1; i < values.length; i += 1) if (values[i] - values[i - 1] < 3) return false;
  }
  return true;
}

function isQizi(hand: Tile[]): boolean {
  return HONOR_TILES.every((tile) => hand.includes(tile));
}

function isQuanzhengzong(hand: Tile[]): boolean {
  if (!checkDalanBasic(hand)) return false;
  const groups = uniqueTiles(hand).filter(isNumberTile).map(tileMod3Group);
  return groups.length > 0 && new Set(groups).size === 1;
}

function isBanzhengzong(hand: Tile[]): boolean {
  if (!checkDalanBasic(hand)) return false;
  const bySuit = { wan: new Set<number>(), tong: new Set<number>(), tiao: new Set<number>() };
  for (const tile of uniqueTiles(hand)) {
    const suit = tileSuit(tile);
    const group = tileMod3Group(tile);
    if (suit === 'wan' || suit === 'tong' || suit === 'tiao') bySuit[suit].add(group);
  }
  if (Object.values(bySuit).some((groups) => groups.size > 1)) return false;
  return new Set(Object.values(bySuit).flatMap((groups) => Array.from(groups))).size > 1;
}

function removeSet(counts: Record<string, number>, tiles: Tile[]): Record<string, number> | null {
  const next = { ...counts };
  for (const tile of tiles) {
    if (!next[tile]) return null;
    next[tile] -= 1;
  }
  return next;
}

function groupsOk(counts: Record<string, number>): boolean {
  const active = sortTiles(Object.keys(counts).filter((tile) => counts[tile] > 0) as Tile[]);
  if (!active.length) return true;
  const tile = active[0];
  if (counts[tile] >= 3) {
    const next = removeSet(counts, [tile, tile, tile]);
    if (next && groupsOk(next)) return true;
  }
  if (isNumberTile(tile) && tileValue(tile) <= 7) {
    const suit = tileSuit(tile);
    const value = tileValue(tile);
    const next = removeSet(counts, [tile, `${suit}${value + 1}` as Tile, `${suit}${value + 2}` as Tile]);
    if (next && groupsOk(next)) return true;
  }
  if (WIND_TILES.includes(tile)) {
    for (const combo of [
      ['dong', 'nan', 'xi'],
      ['dong', 'nan', 'bei'],
      ['dong', 'xi', 'bei'],
      ['nan', 'xi', 'bei'],
    ] as Tile[][]) {
      if (combo.includes(tile)) {
        const next = removeSet(counts, combo);
        if (next && groupsOk(next)) return true;
      }
    }
  }
  if (ARROW_TILES.includes(tile)) {
    const next = removeSet(counts, ['zhong', 'fa', 'bai']);
    if (next && groupsOk(next)) return true;
  }
  return false;
}

export function canFormMeldGroups(tiles: Tile[]): boolean {
  return groupsOk(countTileRecord(tiles));
}

function groupCandidatesFor(tile: Tile): Tile[][] {
  const candidates: Tile[][] = [[tile, tile, tile]];
  if (isNumberTile(tile) && tileValue(tile) <= 7) {
    const suit = tileSuit(tile);
    const value = tileValue(tile);
    candidates.push([tile, `${suit}${value + 1}` as Tile, `${suit}${value + 2}` as Tile]);
  }
  if (WIND_TILES.includes(tile)) {
    candidates.push(...[
      ['dong', 'nan', 'xi'],
      ['dong', 'nan', 'bei'],
      ['dong', 'xi', 'bei'],
      ['nan', 'xi', 'bei'],
    ].filter((group) => group.includes(tile)) as Tile[][]);
  }
  if (ARROW_TILES.includes(tile)) candidates.push(['zhong', 'fa', 'bai']);
  return candidates;
}

function enumerateGroups(counts: Record<string, number>): Tile[][][] {
  const active = sortTiles(Object.keys(counts).filter((tile) => counts[tile] > 0) as Tile[]);
  if (!active.length) return [[]];
  const first = active[0];
  const decompositions: Tile[][][] = [];
  for (const group of groupCandidatesFor(first)) {
    const next = removeSet(counts, group);
    if (!next) continue;
    for (const remainder of enumerateGroups(next)) decompositions.push([sortTiles(group), ...remainder]);
  }
  return decompositions;
}

function normalizeMelds(melds: Meld[]): string[] {
  return melds
    .map((meld) => `${meld.type}:${sortTiles(meld.tiles.filter((tile): tile is Tile => !!tile)).join(',')}`)
    .sort();
}

export function decompositionSignature(
  pair: [Tile, Tile],
  groups: Tile[][],
  melds: Meld[] = [],
  resourceUse?: HandDecomposition['resourceUse'],
  fakeWinRemainder?: Tile,
): string {
  const normalizedGroups = groups.map((group) => sortTiles(group).join(',')).sort().join(';');
  const resource = resourceUse ? `${resourceUse.sourceTile}:${resourceUse.role}:${resourceUse.asTile}` : 'none';
  return `pair=${sortTiles(pair).join(',')}|groups=${normalizedGroups}|melds=${normalizeMelds(melds).join(';')}|resource=${resource}|remainder=${fakeWinRemainder || 'none'}`;
}

export function enumerateStandardDecompositions(hand: Tile[], melds: Meld[] = []): HandDecomposition[] {
  const totalLength = hand.length + melds.length * 3;
  if (totalLength % 3 !== 2) return [];
  const counts = countTileRecord(hand);
  const decompositions: HandDecomposition[] = [];
  for (const tile of sortTiles(Object.keys(counts) as Tile[])) {
    if (counts[tile] < 2) continue;
    const rest = removeSet(counts, [tile, tile]);
    if (!rest) continue;
    for (const groups of enumerateGroups(rest)) {
      const pair: [Tile, Tile] = [tile, tile];
      const signature = decompositionSignature(pair, groups, melds);
      decompositions.push({ pair, groups, signature });
    }
  }
  return decompositions.sort((left, right) => left.signature.localeCompare(right.signature));
}

function hasTripletOnlyDecomposition(hand: Tile[], melds: Meld[]): boolean {
  if (melds.some((meld) => !['peng', 'mingGang', 'anGang', 'zhiChan'].includes(meld.type))) return false;
  return enumerateStandardDecompositions(hand, melds).some((decomposition) => (
    decomposition.groups.every((group) => group[0] === group[1] && group[1] === group[2])
  ));
}

export function checkStandardWin(hand: Tile[], melds: Meld[] = []): { canWin: boolean; handType: HandType } {
  return { canWin: enumerateStandardDecompositions(hand, melds).length > 0, handType: '平胡' };
}

export function checkSevenPairs(hand: Tile[], melds: Meld[] = []): boolean {
  return melds.length === 0 && isSevenPairs(hand);
}

export function checkAllWinds(hand: Tile[], melds: Meld[] = []): boolean {
  const meldTiles = melds.flatMap((meld) => meld.tiles.filter((tile): tile is Tile => !!tile));
  return hand.length + melds.length * 3 === 14 && hand.concat(meldTiles).every(isHonor);
}

export function checkDalan(hand: Tile[], melds: Meld[] = []): { isDalan: boolean; handType: HandType } {
  if (melds.length > 0 || !checkDalanBasic(hand)) return { isDalan: false, handType: '平胡' };
  if (isQizi(hand) && isQuanzhengzong(hand)) return { isDalan: true, handType: '七字全正宗' };
  if (isQizi(hand) && isBanzhengzong(hand)) return { isDalan: true, handType: '七字半正宗' };
  if (isQuanzhengzong(hand)) return { isDalan: true, handType: '全正宗' };
  if (isBanzhengzong(hand)) return { isDalan: true, handType: '半正宗' };
  return { isDalan: true, handType: '打烂' };
}

function routeFor(hand: Tile[], melds: Meld[] = []): HandRoute | null {
  if (checkAllWinds(hand, melds)) return 'allHonor';
  const dalan = checkDalan(hand, melds);
  if (dalan.isDalan) {
    if (dalan.handType === '全正宗' || dalan.handType === '七字全正宗') return 'quanzhengzong';
    if (dalan.handType === '半正宗' || dalan.handType === '七字半正宗') return 'banzhengzong';
    return 'dalan';
  }
  if (checkSevenPairs(hand, melds)) return 'sevenPairs';
  if (checkStandardWin(hand, melds).canWin) return 'normal';
  return null;
}

function colorHandTypes(hand: Tile[], melds: Meld[], dalan: { isDalan: boolean }): HandType[] {
  if (dalan.isDalan) return [];
  const allTiles = hand.concat(melds.flatMap((meld) => meld.tiles.filter((tile): tile is Tile => !!tile)));
  const suits = new Set(allTiles.filter(isNumberTile).map(tileSuit));
  const hasHonor = allTiles.some(isHonor);
  if (suits.size === 1 && !hasHonor) return ['清一色'];
  if (suits.size === 1 && hasHonor) return ['混一色'];
  return [];
}

export function classifyHandDecomposition(hand: Tile[], melds: Meld[], decomposition: HandDecomposition): HandClassification {
  const dalan = checkDalan(hand, melds);
  const handTypes = colorHandTypes(hand, melds, dalan);
  const tripletsOnly = melds.every((meld) => ['peng', 'mingGang', 'anGang', 'zhiChan'].includes(meld.type))
    && decomposition.groups.every((group) => group[0] === group[1] && group[1] === group[2]);
  if (tripletsOnly) handTypes.push('碰碰胡');
  if (!handTypes.length) handTypes.push('平胡');
  const primaryType = handTypes.reduce((best, item) => (
    baseScoreForHandType(item) > baseScoreForHandType(best) ? item : best
  ), handTypes[0]);
  return {
    handTypes,
    primaryType,
    baseScore: handTypes.reduce((product, item) => product * baseScoreForHandType(item), 1),
    route: 'normal',
    isDalan: false,
    decompositionSignature: decomposition.signature,
    selectedDecomposition: decomposition,
  };
}

function classifyNormalHand(hand: Tile[], melds: Meld[], route: HandRoute | null, dalan: { isDalan: boolean }): HandClassification | null {
  if (route !== 'normal' || dalan.isDalan) return null;
  const candidates = enumerateStandardDecompositions(hand, melds).map((decomposition) => {
    const handTypes = colorHandTypes(hand, melds, dalan);
    const tripletsOnly = melds.every((meld) => ['peng', 'mingGang', 'anGang', 'zhiChan'].includes(meld.type))
      && decomposition.groups.every((group) => group[0] === group[1] && group[1] === group[2]);
    if (tripletsOnly) handTypes.push('碰碰胡');
    if (!handTypes.length) handTypes.push('平胡');
    return {
      handTypes,
      baseScore: handTypes.reduce((product, item) => product * baseScoreForHandType(item), 1),
      decomposition,
    };
  }).sort((left, right) => (
    right.baseScore - left.baseScore || left.decomposition.signature.localeCompare(right.decomposition.signature)
  ));
  const selected = candidates[0];
  if (!selected) return null;
  const primaryType = selected.handTypes.reduce((best, item) => (
    baseScoreForHandType(item) > baseScoreForHandType(best) ? item : best
  ), selected.handTypes[0]);
  return {
    handTypes: selected.handTypes,
    primaryType,
    baseScore: selected.baseScore,
    route,
    isDalan: false,
    decompositionSignature: selected.decomposition.signature,
    selectedDecomposition: selected.decomposition,
  };
}

export function classifyHand(hand: Tile[], melds: Meld[] = [], _winTile?: Tile, _winMethod?: string): HandClassification {
  const route = routeFor(hand, melds);
  const dalan = checkDalan(hand, melds);
  const normalClassification = classifyNormalHand(hand, melds, route, dalan);
  if (normalClassification) return normalClassification;
  const handTypes: HandType[] = [];
  if (checkAllWinds(hand, melds)) handTypes.push('全风向');
  if (dalan.isDalan) handTypes.push(dalan.handType);
  if (!dalan.isDalan && checkSevenPairs(hand, melds)) handTypes.push('七对');
  const allTiles = hand.concat(melds.flatMap((meld) => meld.tiles.filter((tile): tile is Tile => !!tile)));
  const suits = new Set(allTiles.filter(isNumberTile).map(tileSuit));
  const hasHonor = allTiles.some(isHonor);
  if (!dalan.isDalan && suits.size === 1 && !hasHonor) handTypes.push('清一色');
  if (!dalan.isDalan && suits.size === 1 && hasHonor) handTypes.push('混一色');
  if (!dalan.isDalan && hasTripletOnlyDecomposition(hand, melds)) handTypes.push('碰碰胡');
  if (!handTypes.length) handTypes.push('平胡');
  const primaryType = handTypes.reduce((best, item) => (baseScoreForHandType(item) > baseScoreForHandType(best) ? item : best), handTypes[0]);
  const baseScore = handTypes.reduce((product, item) => product * baseScoreForHandType(item), 1);
  const normalizedMelds = melds.map((meld) => `${meld.type}:${sortTiles(meld.tiles.filter((tile): tile is Tile => !!tile)).join(',')}`).sort();
  const decompositionSignature = `${handTypes.slice().sort().join('+')}|${sortTiles(hand).join(',')}|${normalizedMelds.join(';')}`;
  return { handTypes, primaryType, baseScore, route, isDalan: dalan.isDalan, decompositionSignature };
}

export function getPrimaryHandType(hand: Tile[], melds: Meld[] = [], winTile?: Tile, winMethod?: string): HandType {
  return classifyHand(hand, melds, winTile, winMethod).primaryType;
}

function isSpecial(hand: Tile[]): boolean {
  return isSevenPairs(hand) || checkAllWinds(hand) || checkDalanBasic(hand);
}

function meetsThreshold(hand: Tile[], winTile?: Tile, winType?: string): boolean {
  if (isSpecial(hand)) return true;
  if (winType === '杠开') return true;
  if (!winTile || isHonor(winTile)) return true;
  return tileValue(winTile) >= 5;
}

export function canWin(hand: Tile[], context: WinContext = {}): CanWinResult {
  const melds = context.melds || [];
  const route = routeFor(hand, melds);
  if (!route) return { canWin: false, route: null, handType: null, useWild: false, reason: 'hand-not-complete' };
  const classification = classifyHand(hand, melds, context.winTile, context.winType);
  const handType = classification.primaryType;
  if (!meetsThreshold(hand, context.winTile, context.winType)) return { canWin: false, route, handType, useWild: false, reason: 'win-tile-below-threshold' };
  return { canWin: true, route, handType, handTypes: classification.handTypes, baseScore: classification.baseScore, useWild: false, reason: 'ok' };
}

function shantenSevenPairs(hand: Tile[]): number {
  const counts = Array.from(countTiles(hand).values());
  const pairs = counts.filter((count) => count >= 2).length;
  const unique = counts.length;
  return Math.max(0, 6 - pairs + Math.max(0, 7 - unique));
}

function shantenDalan(hand: Tile[]): number {
  const unique = uniqueTiles(hand);
  let issues = hand.length - unique.length;
  issues += Math.max(0, 5 - HONOR_TILES.filter((tile) => unique.includes(tile)).length);
  for (const suit of NUMBER_SUITS) {
    const values = unique.filter((tile) => tileSuit(tile) === suit).map(tileValue).sort((a, b) => a - b);
    for (let i = 1; i < values.length; i += 1) if (values[i] - values[i - 1] < 3) issues += 1;
  }
  return issues;
}

function shantenZhengzong(hand: Tile[], unified: boolean): number {
  let issues = shantenDalan(hand);
  const groupsBySuit = { wan: new Set<number>(), tong: new Set<number>(), tiao: new Set<number>() };
  for (const tile of hand) {
    const suit = tileSuit(tile);
    const group = tileMod3Group(tile);
    if (suit === 'wan' || suit === 'tong' || suit === 'tiao') groupsBySuit[suit].add(group);
  }
  const allGroups = new Set<number>();
  for (const groups of Object.values(groupsBySuit)) {
    Array.from(groups).forEach((group) => allGroups.add(group));
    issues += Math.max(0, groups.size - 1);
  }
  if (unified) issues += Math.max(0, allGroups.size - 1);
  return issues;
}

function shantenNormalApprox(hand: Tile[], melds: Meld[] = []): number {
  if (checkStandardWin(hand, melds).canWin) return -1;
  const baseCounts = countTileRecord(hand);
  const fixedMelds = melds.length;
  const memo = new Map<string, number>();
  let best = 8;

  function activeTiles(counts: Record<string, number>): Tile[] {
    return (Object.keys(counts) as Tile[]).filter((tile) => counts[tile] > 0);
  }

  function serialize(counts: Record<string, number>, madeMelds: number, pairs: number, taatsu: number): string {
    return `${madeMelds}|${pairs}|${taatsu}|${ALL_TILE_KEYS.map((tile) => counts[tile] || 0).join('')}`;
  }

  function applyTerminal(madeMelds: number, pairs: number, taatsu: number): void {
    const complete = Math.min(4, fixedMelds + madeMelds);
    const usableTaatsu = Math.min(4 - complete, taatsu);
    best = Math.min(best, 8 - complete * 2 - usableTaatsu - (pairs > 0 ? 1 : 0));
  }

  function completeGroups(tile: Tile): Tile[][] {
    const groups: Tile[][] = [[tile, tile, tile]];
    if (isNumberTile(tile) && tileValue(tile) <= 7) {
      const suit = tileSuit(tile);
      const value = tileValue(tile);
      groups.push([tile, `${suit}${value + 1}` as Tile, `${suit}${value + 2}` as Tile]);
    }
    if (WIND_TILES.includes(tile)) {
      groups.push(...[
        ['dong', 'nan', 'xi'],
        ['dong', 'nan', 'bei'],
        ['dong', 'xi', 'bei'],
        ['nan', 'xi', 'bei'],
      ].filter((group) => group.includes(tile)) as Tile[][]);
    }
    if (ARROW_TILES.includes(tile)) groups.push(['zhong', 'fa', 'bai']);
    return groups;
  }

  function incompleteGroups(tile: Tile): Tile[][] {
    const groups: Tile[][] = [[tile, tile]];
    if (isNumberTile(tile)) {
      const suit = tileSuit(tile);
      const value = tileValue(tile);
      if (value <= 8) groups.push([tile, `${suit}${value + 1}` as Tile]);
      if (value <= 7) groups.push([tile, `${suit}${value + 2}` as Tile]);
    }
    if (WIND_TILES.includes(tile)) {
      for (const group of [
        ['dong', 'nan', 'xi'],
        ['dong', 'nan', 'bei'],
        ['dong', 'xi', 'bei'],
        ['nan', 'xi', 'bei'],
      ] as Tile[][]) {
        if (group.includes(tile)) for (const other of group) if (other !== tile) groups.push([tile, other]);
      }
    }
    if (ARROW_TILES.includes(tile)) for (const other of ARROW_TILES) if (other !== tile) groups.push([tile, other]);
    return groups;
  }

  function dfs(counts: Record<string, number>, madeMelds: number, pairs: number, taatsu: number): void {
    const key = serialize(counts, madeMelds, pairs, taatsu);
    const cached = memo.get(key);
    if (cached !== undefined && cached <= best) return;
    memo.set(key, best);
    const active = activeTiles(counts);
    if (!active.length) {
      applyTerminal(madeMelds, pairs, taatsu);
      return;
    }
    const tile = active[0];
    for (const group of completeGroups(tile)) {
      const next = removeSet(counts, group);
      if (next) dfs(next, madeMelds + 1, pairs, taatsu);
    }
    if (pairs === 0) {
      const next = removeSet(counts, [tile, tile]);
      if (next) dfs(next, madeMelds, 1, taatsu);
    }
    for (const group of incompleteGroups(tile)) {
      const next = removeSet(counts, group);
      if (next) dfs(next, madeMelds, pairs, taatsu + 1);
    }
    const skipped = { ...counts, [tile]: counts[tile] - 1 };
    dfs(skipped, madeMelds, pairs, taatsu);
  }

  dfs(baseCounts, 0, 0, 0);
  return Math.max(0, best);
}

export function calcShanten(hand: Tile[], melds: Meld[] = []): number {
  return getShanten(hand, { melds }).shanten;
}

function shantenCacheKey(hand: Tile[], melds: Meld[]): string {
  const handKey = hand.slice().sort((a, b) => ALL_TILE_KEYS.indexOf(a) - ALL_TILE_KEYS.indexOf(b)).join(',');
  const meldKey = melds
    .map((meld) => `${meld.type}:${(meld.tiles || []).filter((tile): tile is Tile => !!tile).sort((a, b) => ALL_TILE_KEYS.indexOf(a) - ALL_TILE_KEYS.indexOf(b)).join(',')}`)
    .sort()
    .join('|');
  return `${handKey}#${meldKey}`;
}

export function getShanten(hand: Tile[], context: WinContext = {}): ShantenResult {
  const melds = context.melds || [];
  const cacheKey = shantenCacheKey(hand, melds);
  const cached = shantenResultCache.get(cacheKey);
  if (cached) return { ...cached };
  const normal = shantenNormalApprox(hand, melds);
  const sevenPairs = melds.length ? 99 : shantenSevenPairs(hand);
  const dalan = melds.length ? 99 : shantenDalan(hand);
  const banzhengzong = melds.length ? 99 : shantenZhengzong(hand, false);
  const quanzhengzong = melds.length ? 99 : shantenZhengzong(hand, true);
  const entries: Array<[Exclude<HandRoute, 'allHonor'>, number]> = [
    ['quanzhengzong', quanzhengzong],
    ['banzhengzong', banzhengzong],
    ['dalan', dalan],
    ['sevenPairs', sevenPairs],
    ['normal', normal],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  const result = { shanten: entries[0][1], normal, sevenPairs, dalan, banzhengzong, quanzhengzong, recommendedRoute: entries[0][0] };
  if (shantenResultCache.size >= SHANTEN_CACHE_LIMIT) shantenResultCache.clear();
  shantenResultCache.set(cacheKey, result);
  return { ...result };
}

export function checkTenpai(hand: Tile[], melds: Meld[] = []): TenpaiResult {
  const waitingDetails = ALL_TILE_KEYS.map((tile) => {
    const result = canWin(hand.concat(tile), { winTile: tile, melds });
    return result.canWin ? { tile, remaining: 4 - (countTiles(hand).get(tile) || 0), handTypeIfWin: result.handType || '平胡', baseScoreIfWin: result.baseScore || baseScoreForHandType(result.handType || '平胡') } : null;
  }).filter((item): item is TenpaiResult['waitingDetails'][number] => !!item);
  return { isTenpai: waitingDetails.length > 0, waitingTiles: waitingDetails.map((item) => item.tile), waitingDetails };
}

export function baseScoreForHandType(handType: HandType): number {
  const table: Record<HandType, number> = { 平胡: 1, 打烂: 1, 七对: 2, 碰碰胡: 2, 混一色: 2, 半正宗: 2, 清一色: 4, 全正宗: 4, 七字半正宗: 4, 七字全正宗: 8, 全风向: 16 };
  return table[handType];
}
