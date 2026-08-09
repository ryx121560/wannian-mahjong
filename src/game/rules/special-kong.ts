import { canWin, classifyHand } from './hand-evaluator';
import { consumeKongResource, evaluateConditionalKongResource } from './kong-resource';
import { sortTiles } from './tile-utils';
import type {
  HandClassification,
  KongResource,
  KongResourceEvaluationResult,
  Meld,
  Tile,
} from './types';

export type CandidateConcealedKongResourceStatus = 'active' | 'consumed' | 'invalidated';

export interface CandidateConcealedKongResource {
  owner: number;
  pongMeld: Meld;
  candidateKongTile: Tile;
  status: CandidateConcealedKongResourceStatus;
}

export interface ForcedRunConcealedInput {
  owner: number;
  kongTile: Tile;
  preKongHand: Tile[];
  handAfterKong: Tile[];
  melds: Meld[];
  drawTile: Tile;
}

export interface PostPongCandidateConcealedKongInput {
  owner: number;
  resource: CandidateConcealedKongResource;
  preKongHand: Tile[];
  handAfterKong: Tile[];
  melds: Meld[];
  drawTile: Tile;
}

export interface DoublePongForcedRunInput {
  owner: number;
  selectedResource: KongResource;
  conditionalResource: KongResource;
  preKongHand: Tile[];
  handAfterKong: Tile[];
  melds: Meld[];
  drawTile: Tile;
}

export interface AddedKongChainInput {
  owner: number;
  initialResource: KongResource;
  chainPongMeld: Meld;
  preKongHand: Tile[];
  initialHandAfterKong: Tile[];
  initialMelds: Meld[];
  firstDrawTile: Tile;
  handBeforeChainKong: Tile[];
  handAfterChainKong: Tile[];
  melds: Meld[];
  drawTile: Tile;
}

export interface AddedKongChainWindowInput {
  owner: number;
  initialResource: KongResource;
  chainPongMeld: Meld;
  preKongHand: Tile[];
  initialHandAfterKong: Tile[];
  initialMelds: Meld[];
  firstDrawTile: Tile;
}

export type SpecialKongAction =
  | { kind: 'forcedRunConcealed'; input: ForcedRunConcealedInput }
  | { kind: 'postPongCandidateConcealedKong'; input: PostPongCandidateConcealedKongInput }
  | { kind: 'doublePongForcedRun'; input: DoublePongForcedRunInput }
  | { kind: 'addedKongChain'; input: AddedKongChainInput };

export type SpecialKongOutcome =
  | 'forcedRunConcealedFakeWin'
  | 'forcedRunConcealedFailureDiscard'
  | 'postPongCandidateConcealedTrueWin'
  | 'postPongCandidateConcealedFakeWin'
  | 'doublePongForcedRunFakeWin'
  | 'doublePongForcedRunFailureDiscard'
  | 'addedKongChainTrueWin'
  | 'addedKongChainFakeWin';

export interface SpecialKongResolution {
  action: SpecialKongAction;
  outcome: SpecialKongOutcome;
  mustDiscard: boolean;
  robKongWindow: boolean;
  evaluation: KongResourceEvaluationResult;
  eligibility?: KongResourceEvaluationResult;
  resourceAfterKong?: CandidateConcealedKongResource | KongResource | { selected: KongResource; conditional: KongResource; initial: KongResource };
}

function sameTiles(left: Tile[], right: Tile[]): boolean {
  const sortedLeft = sortTiles(left);
  const sortedRight = sortTiles(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((tile, index) => tile === sortedRight[index]);
}

function countTiles(hand: Tile[], tile: Tile): number {
  return hand.filter((item) => item === tile).length;
}

function removeTiles(hand: Tile[], tile: Tile, amount: number): Tile[] | null {
  const remaining = hand.slice();
  for (let index = 0; index < amount; index += 1) {
    const tileIndex = remaining.indexOf(tile);
    if (tileIndex < 0) return null;
    remaining.splice(tileIndex, 1);
  }
  return remaining;
}

function isExactPong(meld: Meld, tile?: Tile): boolean {
  return meld.type === 'peng'
    && meld.tiles.length === 3
    && meld.tiles.every((item) => item === meld.tiles[0])
    && (tile == null || meld.tiles[0] === tile);
}

function isMatchingGang(meld: Meld, tile: Tile, expectedType?: 'anGang' | 'mingGang'): boolean {
  return (expectedType == null || meld.type === expectedType)
    && (meld.type === 'anGang' || meld.type === 'mingGang' || meld.type === 'zhiChan')
    && meld.tiles.length === 4
    && meld.tiles.every((item) => item === tile);
}

function sameMeld(left: Meld, right: Meld): boolean {
  return left.type === right.type
    && left.fromPlayer === right.fromPlayer
    && left.tiles.length === right.tiles.length
    && left.tiles.every((tile, index) => tile === right.tiles[index]);
}

function requireValid(condition: boolean, reason: string): void {
  if (!condition) throw new Error(`invalid special kong context: ${reason}`);
}

function classifyFallback(hand: Tile[], melds: Meld[]): KongResourceEvaluationResult {
  const classification = classifyHand(hand, melds);
  return {
    canComplete: false,
    reason: 'conditional-resource-cannot-complete-legal-structure',
    classification,
    decomposition: classification.selectedDecomposition,
    witnesses: classification.selectedDecomposition ? [classification.selectedDecomposition] : [],
  };
}

function evaluateWithSource(
  sourceTile: Tile,
  hand: Tile[],
  melds: Meld[],
  allowFakeWinRemainder: boolean,
  consumeSourceTileFromHand = false,
): KongResourceEvaluationResult {
  const evaluation = evaluateConditionalKongResource({
    sourceTile,
    hand,
    melds,
    allowFakeWinRemainder,
    consumeSourceTileFromHand,
  });
  return evaluation.canComplete ? evaluation : classifyFallback(hand, melds);
}

function validatePongResource(resource: KongResource, owner: number): void {
  requireValid(resource.status === 'active', 'resource-not-active');
  requireValid(resource.owner === owner, 'resource-owner-mismatch');
  requireValid(resource.source === 'pong' && isExactPong(resource.pongMeld, resource.tile), 'resource-pong-invalid');
}

export function createCandidateConcealedKongResource(input: {
  owner: number;
  pongMeld: Meld;
  candidateKongTile: Tile;
}): CandidateConcealedKongResource {
  if (!isExactPong(input.pongMeld)) throw new Error('candidate concealed kong requires a real pong meld');
  return { ...input, status: 'active' };
}

export function enumeratePostPongCandidateConcealedKongs(input: {
  owner: number;
  pongMeld: Meld;
  hand: Tile[];
}): CandidateConcealedKongResource[] {
  if (!isExactPong(input.pongMeld)) return [];
  return Array.from(new Set(input.hand))
    .filter((tile) => countTiles(input.hand, tile) === 4)
    .sort()
    .map((candidateKongTile) => createCandidateConcealedKongResource({
      owner: input.owner,
      pongMeld: input.pongMeld,
      candidateKongTile,
    }));
}

export function transitionCandidateConcealedKongResource(
  resource: CandidateConcealedKongResource,
  event:
    | { type: 'decline' }
    | { type: 'declareCandidateKong'; player: number; tile: Tile }
    | { type: 'discard'; player: number; tile: Tile }
    | { type: 'roundEnd' },
): CandidateConcealedKongResource {
  if (resource.status !== 'active' || event.type === 'decline') return resource;
  if (event.type === 'roundEnd') return { ...resource, status: 'invalidated' };
  if (event.player !== resource.owner || event.tile !== resource.candidateKongTile) return resource;
  return { ...resource, status: event.type === 'declareCandidateKong' ? 'consumed' : 'invalidated' };
}
export function resolveForcedRunConcealed(input: ForcedRunConcealedInput): SpecialKongResolution {
  requireValid(countTiles(input.preKongHand, input.kongTile) === 4, 'concealed-forced-run-pre-kong-count');
  const expectedHand = removeTiles(input.preKongHand, input.kongTile, 4);
  requireValid(expectedHand != null && sameTiles(expectedHand, input.handAfterKong), 'concealed-forced-run-hand-after-kong');
  requireValid(input.melds.some((meld) => isMatchingGang(meld, input.kongTile, 'anGang')), 'concealed-forced-run-meld');
  requireValid(!canWin(input.handAfterKong.concat(input.drawTile), { melds: input.melds }).canWin, 'normal-concealed-kong-available');
  const evaluation = evaluateWithSource(input.kongTile, input.handAfterKong.concat(input.drawTile), input.melds, true);
  const complete = evaluation.canComplete;
  return {
    action: { kind: 'forcedRunConcealed', input },
    outcome: complete ? 'forcedRunConcealedFakeWin' : 'forcedRunConcealedFailureDiscard',
    mustDiscard: !complete,
    robKongWindow: false,
    evaluation,
  };
}

export function resolvePostPongCandidateConcealedKong(input: PostPongCandidateConcealedKongInput): SpecialKongResolution {
  requireValid(input.resource.status === 'active', 'candidate-resource-not-active');
  requireValid(input.resource.owner === input.owner, 'candidate-resource-owner-mismatch');
  requireValid(isExactPong(input.resource.pongMeld), 'candidate-resource-pong-invalid');
  requireValid(countTiles(input.preKongHand, input.resource.candidateKongTile) === 4, 'candidate-pre-kong-count');
  const expectedHand = removeTiles(input.preKongHand, input.resource.candidateKongTile, 4);
  requireValid(expectedHand != null && sameTiles(expectedHand, input.handAfterKong), 'candidate-hand-after-kong');
  requireValid(input.melds.some((meld) => sameMeld(meld, input.resource.pongMeld)), 'candidate-pong-meld-missing');
  requireValid(input.melds.some((meld) => isMatchingGang(meld, input.resource.candidateKongTile, 'anGang')), 'candidate-kong-meld-missing');
  const eligibility = evaluateWithSource(input.resource.candidateKongTile, input.handAfterKong, input.melds, false);
  requireValid(eligibility.canComplete, 'candidate-conditional-eligibility-failed');
  const handAfterDraw = input.handAfterKong.concat(input.drawTile);
  const evaluation = evaluateWithSource(input.resource.candidateKongTile, handAfterDraw, input.melds, true);
  const trueWin = canWin(handAfterDraw, { melds: input.melds, winTile: input.drawTile }).canWin;
  return {
    action: { kind: 'postPongCandidateConcealedKong', input },
    outcome: trueWin ? 'postPongCandidateConcealedTrueWin' : 'postPongCandidateConcealedFakeWin',
    mustDiscard: false,
    robKongWindow: false,
    eligibility,
    evaluation,
    resourceAfterKong: transitionCandidateConcealedKongResource(input.resource, {
      type: 'declareCandidateKong', player: input.owner, tile: input.resource.candidateKongTile,
    }),
  };
}

export function resolveDoublePongForcedRun(input: DoublePongForcedRunInput): SpecialKongResolution {
  validatePongResource(input.selectedResource, input.owner);
  validatePongResource(input.conditionalResource, input.owner);
  requireValid(input.selectedResource.tile !== input.conditionalResource.tile, 'double-pong-resource-must-differ');
  requireValid(countTiles(input.preKongHand, input.selectedResource.tile) === 1, 'selected-resource-pre-kong-count');
  requireValid(countTiles(input.preKongHand, input.conditionalResource.tile) >= 1, 'conditional-resource-pre-kong-count');
  const expectedHand = removeTiles(input.preKongHand, input.selectedResource.tile, 1);
  requireValid(expectedHand != null && sameTiles(expectedHand, input.handAfterKong), 'double-pong-hand-after-kong');
  requireValid(input.melds.some((meld) => isMatchingGang(meld, input.selectedResource.tile, 'mingGang')), 'selected-resource-kong-meld-missing');
  requireValid(input.melds.some((meld) => sameMeld(meld, input.conditionalResource.pongMeld)), 'conditional-resource-pong-meld-missing');
  const evaluation = evaluateWithSource(
    input.conditionalResource.tile,
    input.handAfterKong.concat(input.drawTile),
    input.melds,
    true,
    true,
  );
  const complete = evaluation.canComplete;
  return {
    action: { kind: 'doublePongForcedRun', input },
    outcome: complete ? 'doublePongForcedRunFakeWin' : 'doublePongForcedRunFailureDiscard',
    mustDiscard: !complete,
    robKongWindow: true,
    evaluation,
    resourceAfterKong: {
      selected: consumeKongResource(input.selectedResource),
      conditional: input.conditionalResource,
      initial: input.selectedResource,
    },
  };
}

function validateAddedKongChainWindow(input: AddedKongChainWindowInput): string | null {
  try {
    validatePongResource(input.initialResource, input.owner);
  } catch {
    return 'initial-resource-invalid';
  }
  if (!isExactPong(input.chainPongMeld)) return 'chain-pong-invalid';
  if (input.chainPongMeld.tiles[0] === input.initialResource.tile) return 'chain-pong-must-differ';
  if (countTiles(input.preKongHand, input.initialResource.tile) !== 1) return 'added-kong-pre-kong-count';
  const expectedInitialHand = removeTiles(input.preKongHand, input.initialResource.tile, 1);
  if (!expectedInitialHand || !sameTiles(expectedInitialHand, input.initialHandAfterKong)) return 'added-kong-hand-after-kong';
  if (!input.initialMelds.some((meld) => isMatchingGang(meld, input.initialResource.tile, 'mingGang'))) return 'added-kong-meld-missing';
  if (!input.initialMelds.some((meld) => sameMeld(meld, input.chainPongMeld))) return 'chain-pong-meld-missing';
  if (input.firstDrawTile !== input.chainPongMeld.tiles[0]) return 'first-draw-does-not-match-real-pong';
  return null;
}

export function prepareAddedKongChainWindow(input: AddedKongChainWindowInput): {
  canDeclare: boolean;
  reason: string;
  chainKongTile?: Tile;
  robKongWindow: boolean;
} {
  const reason = validateAddedKongChainWindow(input);
  if (reason) return { canDeclare: false, reason, robKongWindow: false };
  return {
    canDeclare: true,
    reason: 'matching-real-pong-fourth-tile',
    chainKongTile: input.chainPongMeld.tiles[0],
    robKongWindow: true,
  };
}

function validateAddedKongChain(input: AddedKongChainInput): void {
  const window = prepareAddedKongChainWindow(input);
  requireValid(window.canDeclare, window.reason);
  requireValid(sameTiles(input.handBeforeChainKong, input.initialHandAfterKong.concat(input.firstDrawTile)), 'chain-hand-before-kong');
  requireValid(countTiles(input.handBeforeChainKong, input.chainPongMeld.tiles[0]) === 1, 'chain-second-kong-count');
  const expectedChainHand = removeTiles(input.handBeforeChainKong, input.chainPongMeld.tiles[0], 1);
  requireValid(expectedChainHand != null && sameTiles(expectedChainHand, input.handAfterChainKong), 'chain-hand-after-kong');
  requireValid(input.melds.some((meld) => isMatchingGang(meld, input.initialResource.tile, 'mingGang')), 'chain-initial-kong-meld-missing');
  requireValid(input.melds.some((meld) => isMatchingGang(meld, input.chainPongMeld.tiles[0], 'mingGang')), 'chain-second-kong-meld-missing');
}

export function resolveAddedKongChain(input: AddedKongChainInput): SpecialKongResolution {
  validateAddedKongChain(input);
  const finalHand = input.handAfterChainKong.concat(input.drawTile);
  const trueEvaluation = evaluateWithSource(input.initialResource.tile, finalHand, input.melds, false);
  const evaluation = trueEvaluation.canComplete
    ? trueEvaluation
    : evaluateWithSource(input.initialResource.tile, finalHand, input.melds, true);
  return {
    action: { kind: 'addedKongChain', input },
    outcome: trueEvaluation.canComplete ? 'addedKongChainTrueWin' : 'addedKongChainFakeWin',
    mustDiscard: false,
    robKongWindow: true,
    evaluation,
    resourceAfterKong: consumeKongResource(input.initialResource),
  };
}

export function resolveSpecialKongAction(action: SpecialKongAction): SpecialKongResolution {
  if (action.kind === 'forcedRunConcealed') return resolveForcedRunConcealed(action.input);
  if (action.kind === 'postPongCandidateConcealedKong') return resolvePostPongCandidateConcealedKong(action.input);
  if (action.kind === 'doublePongForcedRun') return resolveDoublePongForcedRun(action.input);
  return resolveAddedKongChain(action.input);
}

export function specialKongClassification(resolution: SpecialKongResolution): HandClassification {
  if (!resolution.evaluation.classification) throw new Error('special kong evaluation classification required');
  return resolution.evaluation.classification;
}
