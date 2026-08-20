import { ALL_TILE_KEYS, ARROW_TILES, WIND_TILES, isNumberTile, sortTiles, tileSuit, tileValue } from './tile-utils';
import { canWin, classifyHand, classifyHandDecomposition, decompositionSignature } from './hand-evaluator';
import type {
  GameState,
  HandDecomposition,
  KongClaimKind,
  ChainKongDeclarationInput,
  KongDrawResolutionInput,
  KongDrawOutcome,
  KongResource,
  ConditionalKongResourceEvaluationInput,
  KongResourceEvaluationInput,
  KongResourceEvaluationResult,
  Meld,
  Tile,
} from './types';

function removeTiles(hand: Tile[], tile: Tile, amount: number): Tile[] | null {
  const remaining = hand.slice();
  for (let index = 0; index < amount; index += 1) {
    const tileIndex = remaining.indexOf(tile);
    if (tileIndex < 0) return null;
    remaining.splice(tileIndex, 1);
  }
  return remaining;
}

function hasSameTiles(left: Tile[], right: Tile[]): boolean {
  return left.length === right.length && sortTiles(left).every((tile, index) => tile === sortTiles(right)[index]);
}

function countTile(hand: Tile[], tile: Tile): number {
  return hand.filter((item) => item === tile).length;
}

function removeCandidate(hand: Tile[], candidate: Tile[]): Tile[] | null {
  const remaining = hand.slice();
  for (const tile of candidate) {
    const index = remaining.indexOf(tile);
    if (index < 0) return null;
    remaining.splice(index, 1);
  }
  return remaining;
}

function gangMeld(tile: Tile, fromPlayer?: number): Meld {
  return { type: 'mingGang', tiles: [tile, tile, tile, tile], fromPlayer };
}

function allMeldGroups(): Tile[][] {
  const groups: Tile[][] = [];
  for (const tile of ALL_TILE_KEYS) {
    groups.push([tile, tile, tile]);
    if (isNumberTile(tile) && tileValue(tile) <= 7) {
      const suit = tileSuit(tile);
      const value = tileValue(tile);
      groups.push([tile, `${suit}${value + 1}` as Tile, `${suit}${value + 2}` as Tile]);
    }
  }
  groups.push(
    ['dong', 'nan', 'xi'],
    ['dong', 'nan', 'bei'],
    ['dong', 'xi', 'bei'],
    ['nan', 'xi', 'bei'],
    ['zhong', 'fa', 'bai'],
  );
  return groups;
}

const MELD_GROUPS = allMeldGroups();

function isExactPong(meld: Meld, tile: Tile): boolean {
  return meld.type === 'peng' && meld.tiles.length === 3 && meld.tiles.every((item) => item === tile);
}

function isMatchingGang(meld: Meld, tile: Tile): boolean {
  return (meld.type === 'mingGang' || meld.type === 'anGang' || meld.type === 'zhiChan')
    && meld.tiles.length === 4
    && meld.tiles.every((item) => item === tile);
}

function validateResourceContext(input: KongResourceEvaluationInput): string | null {
  const { resource } = input;
  if (resource.status !== 'active') return 'resource-not-active';
  if (resource.owner !== input.owner) return 'resource-owner-mismatch';
  if (resource.source !== 'pong' || !isExactPong(resource.pongMeld, resource.tile)) return 'resource-pong-invalid';
  if (!input.preKongHand.includes(resource.tile)) return 'resource-pre-kong-tile-missing';
  if (!input.melds.some((meld) => isMatchingGang(meld, resource.tile))) return 'resource-kong-meld-missing';
  return null;
}

function makeDecomposition(
  pair: [Tile, Tile],
  groups: Tile[][],
  melds: Meld[],
  resourceUse?: HandDecomposition['resourceUse'],
  fakeWinRemainder?: Tile,
): HandDecomposition {
  return {
    pair,
    groups: groups.map((group) => sortTiles(group)),
    resourceUse,
    fakeWinRemainder,
    signature: decompositionSignature(pair, groups, melds, resourceUse, fakeWinRemainder),
  };
}

function findConditionalResourceWitnesses(input: ConditionalKongResourceEvaluationInput): HandDecomposition[] {
  const expectedGroups = 4 - input.melds.length;
  if (expectedGroups < 0) return [];
  const witnesses = new Map<string, HandDecomposition>();

  function buildGroups(
    remaining: Tile[],
    groups: Tile[][],
    resourceUse: HandDecomposition['resourceUse'] | undefined,
    pair: [Tile, Tile],
    fakeWinRemainder?: Tile,
  ): void {
    if (groups.length === expectedGroups) {
      const sortedRemainder = sortTiles(remaining);
      if (!resourceUse) return;
      if (sortedRemainder.length === 0) {
        const witness = makeDecomposition(pair, groups, input.melds, resourceUse, fakeWinRemainder);
        witnesses.set(witness.signature, witness);
        return;
      }
      if (input.allowFakeWinRemainder && !fakeWinRemainder && sortedRemainder.length === 1) {
        const witness = makeDecomposition(pair, groups, input.melds, resourceUse, sortedRemainder[0]);
        witnesses.set(witness.signature, witness);
      }
      return;
    }
    const first = sortTiles(remaining)[0];
    if (!first) return;

    for (const group of MELD_GROUPS) {
      if (!group.includes(first)) continue;
      const next = removeCandidate(remaining, group);
      if (!next) continue;
      buildGroups(next, groups.concat([group]), resourceUse, pair, fakeWinRemainder);
    }

    if (input.allowFakeWinRemainder && !fakeWinRemainder) {
      const next = removeCandidate(remaining, [first]);
      if (next) buildGroups(next, groups, resourceUse, pair, first);
    }
    if (resourceUse) return;
    for (const group of MELD_GROUPS) {
      if (!group.includes(first)) continue;
      for (let resourceIndex = 0; resourceIndex < group.length; resourceIndex += 1) {
        const physicalTiles = group.filter((_, index) => index !== resourceIndex);
        const next = removeCandidate(remaining, physicalTiles);
        if (!next) continue;
        buildGroups(next, groups.concat([group]), {
          sourceTile: input.sourceTile,
          role: 'group',
          asTile: group[resourceIndex],
        }, pair, fakeWinRemainder);
      }
    }
  }

  const pairTiles = sortTiles(Array.from(new Set(input.hand)));
  for (const tile of pairTiles) {
    const pair: [Tile, Tile] = [tile, tile];
    const afterPair = removeCandidate(input.hand, pair);
    if (!afterPair) continue;
    buildGroups(afterPair, [], undefined, pair);
  }
  for (const tile of pairTiles) {
    const afterPair = removeCandidate(input.hand, [tile]);
    if (!afterPair) continue;
    const pair: [Tile, Tile] = [tile, tile];
    buildGroups(afterPair, [], {
      sourceTile: input.sourceTile,
      role: 'pair',
      asTile: tile,
    }, pair);
  }
  return Array.from(witnesses.values()).sort((left, right) => left.signature.localeCompare(right.signature));
}

export function evaluateConditionalKongResource(input: ConditionalKongResourceEvaluationInput): KongResourceEvaluationResult {
  const normal = canWin(input.hand, { melds: input.melds });
  if (normal.canWin) {
    const classification = classifyHand(input.hand, input.melds);
    const witnesses = classification.selectedDecomposition ? [classification.selectedDecomposition] : [];
    return {
      canComplete: true,
      reason: 'real-structure',
      decomposition: classification.selectedDecomposition,
      witnesses,
      classification,
    };
  }
  const hand = input.consumeSourceTileFromHand
    ? removeTiles(input.hand, input.sourceTile, 1)
    : input.hand;
  if (!hand) return { canComplete: false, reason: 'conditional-resource-source-tile-missing', witnesses: [] };
  const witnesses = findConditionalResourceWitnesses({ ...input, hand });
  if (!witnesses.length) return { canComplete: false, reason: 'resource-cannot-complete-legal-structure', witnesses: [] };
  const candidates = witnesses.map((decomposition) => ({
    decomposition,
    classification: classifyHandDecomposition(input.hand, input.melds, decomposition),
  })).sort((left, right) => (
    right.classification.baseScore - left.classification.baseScore
      || left.classification.decompositionSignature.localeCompare(right.classification.decompositionSignature)
  ));
  const selected = candidates[0];
  return {
    canComplete: true,
    reason: 'resource-conditional-structure',
    decomposition: selected.decomposition,
    witnesses,
    classification: selected.classification,
  };
}

export function evaluateKongResource(input: KongResourceEvaluationInput): KongResourceEvaluationResult {
  const contextError = validateResourceContext(input);
  if (contextError) return { canComplete: false, reason: contextError };
  return evaluateConditionalKongResource({
    sourceTile: input.resource.tile,
    hand: input.hand,
    melds: input.melds,
    allowFakeWinRemainder: input.allowFakeWinRemainder,
    consumeSourceTileFromHand: false,
  });
}

export function createKongResource(input: {
  owner: number;
  tile: Tile;
  pongMeld: Meld;
  source: 'pong';
}): KongResource {
  if (!isExactPong(input.pongMeld, input.tile)) throw new Error('KongResource requires an exact real pong meld');
  return { ...input, status: 'active' };
}

export function consumeKongResource(resource: KongResource): KongResource {
  return { ...resource, status: 'consumed' };
}

export function invalidateKongResource(resource: KongResource): KongResource {
  return { ...resource, status: 'invalidated' };
}

export function transitionKongResource(
  resource: KongResource,
  event:
    | { type: 'declareKong'; player: number }
    | { type: 'discard'; player: number; tile: Tile }
    | { type: 'roundEnd' },
): KongResource {
  if (resource.status !== 'active') return resource;
  if (event.type === 'declareKong' && event.player === resource.owner) return consumeKongResource(resource);
  if (event.type === 'discard' && event.player === resource.owner && event.tile === resource.tile) return invalidateKongResource(resource);
  if (event.type === 'roundEnd') return invalidateKongResource(resource);
  return resource;
}

export function classifyDiscardKongClaim(input: {
  hand: Tile[];
  melds: Meld[];
  discardTile: Tile;
  owner: number;
  discardPlayer?: number;
}): { kind: KongClaimKind | null; canDecline: boolean } {
  if (input.hand.filter((tile) => tile === input.discardTile).length < 3) return { kind: null, canDecline: false };
  const handAfterKong = removeTiles(input.hand, input.discardTile, 3);
  if (!handAfterKong) return { kind: null, canDecline: false };
  const resource = createKongResource({
    owner: input.owner,
    tile: input.discardTile,
    pongMeld: { type: 'peng', tiles: [input.discardTile, input.discardTile, input.discardTile], fromPlayer: input.discardPlayer },
    source: 'pong',
  });
  const meldsAfterKong = input.melds.concat(gangMeld(input.discardTile, input.discardPlayer));
  const directChiselReady = evaluateKongResource({
    owner: input.owner,
    resource,
    preKongHand: input.hand,
    hand: handAfterKong,
    melds: meldsAfterKong,
    allowFakeWinRemainder: false,
  }).canComplete;
  return { kind: directChiselReady ? 'directChisel' : 'forcedRunImmediate', canDecline: true };
}

export function canUseDeferredForcedRun(state: GameState, playerId: number): boolean {
  if (state.phase !== 'discarding' || state.currentPlayer !== playerId) return false;
  const player = state.players?.[playerId] || { hand: state.hand || [] };
  return (state.kongResources || []).some((resource) => (
    resource.owner === playerId
      && resource.status === 'active'
      && !!state.newDrawnTile
      && player.hand.includes(state.newDrawnTile)
      && player.hand.includes(resource.tile)
      && !evaluateConditionalKongResource({
        sourceTile: resource.tile,
        hand: player.hand,
        melds: player.melds || [],
        allowFakeWinRemainder: false,
        consumeSourceTileFromHand: true,
      }).canComplete
  ));
}

function activeResourceSnapshot(resource: KongResource): KongResource {
  return { ...resource, status: 'active' };
}

function validateInitialKongDeclaration(input: Extract<KongDrawResolutionInput, { kind: Exclude<KongClaimKind, 'chainKong'> }>): string | null {
  const requiredCount = input.kind === 'forcedRunDeferred' ? 1 : 3;
  if (input.resource.status !== 'active') return 'resource-not-active-for-initial-kong';
  if (countTile(input.preKongHand, input.resource.tile) !== requiredCount) return 'pre-kong-resource-count-mismatch';
  const expectedHandAfterKong = removeTiles(input.preKongHand, input.resource.tile, requiredCount);
  if (!expectedHandAfterKong || !hasSameTiles(expectedHandAfterKong, input.handAfterKong)) return 'hand-after-kong-mismatch';
  if (input.handAfterKong.includes(input.resource.tile)) return 'resource-tile-remains-after-kong';
  if (!input.melds.some((meld) => isMatchingGang(meld, input.resource.tile))) return 'declared-kong-meld-missing';
  return null;
}

function validateChainKongDeclaration(input: ChainKongDeclarationInput): string | null {
  if (input.resource.status !== 'consumed') return 'initial-resource-not-consumed';
  if (countTile(input.preKongHand, input.resource.tile) !== 3) return 'initial-pre-kong-resource-count-mismatch';
  const expectedInitialHand = removeTiles(input.preKongHand, input.resource.tile, 3);
  if (!expectedInitialHand || !hasSameTiles(expectedInitialHand, input.initialHandAfterKong)) return 'initial-hand-after-kong-mismatch';
  if (!input.initialMelds.some((meld) => isMatchingGang(meld, input.resource.tile))) return 'initial-kong-meld-missing';
  const activeResource = activeResourceSnapshot(input.resource);
  const initialEligibility = evaluateKongResource({
    owner: input.owner,
    resource: activeResource,
    preKongHand: input.preKongHand,
    hand: input.initialHandAfterKong,
    melds: input.initialMelds,
    allowFakeWinRemainder: false,
  });
  if (!initialEligibility.canComplete) return `initial-direct-chisel-invalid:${initialEligibility.reason}`;
  if (!hasSameTiles(input.handBeforeKong, input.initialHandAfterKong.concat(input.firstDrawTile))) return 'chain-hand-before-kong-mismatch';
  if (input.secondKongTile === input.resource.tile) return 'chain-kong-must-use-second-tile';
  if (input.initialMelds.some((meld) => isMatchingGang(meld, input.secondKongTile))) return 'second-kong-already-declared';
  if (countTile(input.handBeforeKong, input.secondKongTile) !== 4) return 'second-kong-tile-count-mismatch';
  if (!isMatchingGang(input.secondKongMeld, input.secondKongTile)) return 'second-kong-meld-invalid';
  return null;
}

export function prepareChainKongDeclaration(input: ChainKongDeclarationInput): {
  canDeclare: boolean;
  reason: string;
  handAfterKong?: Tile[];
  secondKongMeld?: Meld;
} {
  const reason = validateChainKongDeclaration(input);
  if (reason) return { canDeclare: false, reason };
  const handAfterKong = removeTiles(input.handBeforeKong, input.secondKongTile, 4);
  if (!handAfterKong) return { canDeclare: false, reason: 'chain-hand-after-kong-mismatch' };
  return { canDeclare: true, reason: 'ok', handAfterKong, secondKongMeld: input.secondKongMeld };
}

export function resolveKongDraw(input: KongDrawResolutionInput): {
  outcome: KongDrawOutcome;
  mustDiscard: boolean;
  evaluation: KongResourceEvaluationResult;
  resourceAfterKong: KongResource;
} {
  if (input.kind === 'chainKong') {
    const declaration = prepareChainKongDeclaration(input);
    if (!declaration.canDeclare) throw new Error(`invalid chain kong context: ${declaration.reason}`);
    if (!declaration.handAfterKong || !hasSameTiles(declaration.handAfterKong, input.handAfterKong)) {
      throw new Error('invalid chain kong context: chain-hand-after-kong-mismatch');
    }
    if (!input.melds.some((meld) => isMatchingGang(meld, input.resource.tile))) {
      throw new Error('invalid chain kong context: chain-initial-kong-meld-missing');
    }
    if (!input.melds.some((meld) => isMatchingGang(meld, input.secondKongTile))) {
      throw new Error('invalid chain kong context: chain-second-kong-meld-missing');
    }
    const handAfterDraw = input.handAfterKong.concat(input.drawTile);
    const finalEvaluation = evaluateKongResource({
      owner: input.owner,
      resource: activeResourceSnapshot(input.resource),
      preKongHand: input.preKongHand,
      hand: handAfterDraw,
      melds: input.melds,
      allowFakeWinRemainder: true,
    });
    if (!finalEvaluation.canComplete) throw new Error(`invalid chain kong draw context: ${finalEvaluation.reason}`);
    return {
      outcome: canWin(handAfterDraw, { melds: input.melds }).canWin ? 'directChiselChainTrueWin' : 'directChiselChainFakeWin',
      mustDiscard: false,
      evaluation: finalEvaluation,
      resourceAfterKong: input.resource,
    };
  }

  const declarationError = validateInitialKongDeclaration(input);
  if (declarationError) throw new Error(`invalid kong declaration: ${declarationError}`);
  const context = {
    owner: input.owner,
    resource: input.resource,
    preKongHand: input.preKongHand,
    melds: input.melds,
  };
  const directEligibility = evaluateKongResource({ ...context, hand: input.handAfterKong, allowFakeWinRemainder: false });
  if (input.kind === 'directChisel' && !directEligibility.canComplete) {
    throw new Error(`invalid direct chisel context: ${directEligibility.reason}`);
  }
  if (input.kind === 'forcedRunImmediate' && directEligibility.canComplete) {
    throw new Error('invalid forced run context: direct-chisel-available');
  }
  const handAfterDraw = input.handAfterKong.concat(input.drawTile);
  const finalEvaluation = evaluateKongResource({ ...context, hand: handAfterDraw, allowFakeWinRemainder: true });
  const resourceAfterKong = transitionKongResource(input.resource, { type: 'declareKong', player: input.owner });
  if (input.kind === 'directChisel') {
    if (!finalEvaluation.canComplete) throw new Error(`invalid direct chisel draw context: ${finalEvaluation.reason}`);
    return {
      outcome: canWin(handAfterDraw, { melds: input.melds }).canWin ? 'directChiselTrueWin' : 'directChiselFakeWin',
      mustDiscard: false,
      evaluation: finalEvaluation,
      resourceAfterKong,
    };
  }
  if (!finalEvaluation.canComplete) return { outcome: 'forcedRunFailureDiscard', mustDiscard: true, evaluation: finalEvaluation, resourceAfterKong };
  return {
    outcome: canWin(handAfterDraw, { melds: input.melds }).canWin ? 'forcedRunGangKaiTrueWin' : 'forcedRunGangKaiFakeWin',
    mustDiscard: false,
    evaluation: finalEvaluation,
    resourceAfterKong,
  };
}

function resolveNearestWinner(state: GameState, sourcePlayer: number, winTile: Tile, winType: '点炮' | '抢杠'): number | null {
  const players = state.players || [];
  for (let offset = 1; offset < 4; offset += 1) {
    const playerId = (sourcePlayer + offset) % 4;
    const player = players[playerId];
    if (!player) continue;
    const canClaimWin = canWin(player.hand.concat(winTile), {
      winTile,
      winType,
      melds: player.melds || state.melds[playerId] || [],
    }).canWin;
    if (canClaimWin) return playerId;
  }
  return null;
}

export function resolveDiscardWinner(state: GameState): number | null {
  if (state.phase !== 'responding' || !state.lastDiscard || state.lastDiscardPlayer == null) return null;
  return resolveNearestWinner(state, state.lastDiscardPlayer, state.lastDiscard, '点炮');
}

export function resolveRobKongWinner(state: GameState, kongOwner: number, kongTile: Tile): number | null {
  return resolveNearestWinner(state, kongOwner, kongTile, '抢杠');
}
