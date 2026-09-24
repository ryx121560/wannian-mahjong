import { hashStage8OfflineIdentity } from './offline-action-identity';
import type { Tile } from '../rules';
import { STAGE8_V2_TILE_KEYS } from './action-registry-v2';
import {
  STAGE8_OFFLINE_SMOKE_CURRICULUM,
  STAGE8_OFFLINE_SMOKE_GAMES_PER_CANDIDATE_SEAT,
  STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT,
} from './offline-selfplay-control';

export const STAGE8_FIXED_CURRICULUM_VERSION = 'stage8-fixed-curriculum-kong-zhichan-chain-v2';
export const STAGE8_FIXED_CURRICULUM_WALL_RECIPE_VERSION = 'stage8-fixed-curriculum-full-wall-recipe-v1';

export type Stage8FixedCourseScenario = 'forcedRunKong' | 'zhichan' | 'chainKong';

export interface Stage8FixedCourseGamePlan {
  gameIndex: number;
  gameId: string;
  fixedSeed: number;
  candidateSeat: 0 | 1 | 2 | 3;
  scenario: Stage8FixedCourseScenario;
  dealerSeat: 0 | 1 | 2 | 3;
  leadDiscardTile: Tile;
  wallRecipeSha256: string;
}

export interface Stage8FixedCurriculumPlan {
  version: typeof STAGE8_FIXED_CURRICULUM_VERSION;
  curriculum: typeof STAGE8_OFFLINE_SMOKE_CURRICULUM;
  baseSeed: number;
  games: Stage8FixedCourseGamePlan[];
  planSha256: string;
}

const SCENARIO_CYCLE: readonly Stage8FixedCourseScenario[] = [
  'forcedRunKong', 'forcedRunKong', 'zhichan', 'zhichan', 'chainKong',
];

export interface Stage8FixedCurriculumWallRecipe {
  version: typeof STAGE8_FIXED_CURRICULUM_WALL_RECIPE_VERSION;
  scenario: Stage8FixedCourseScenario;
  candidateSeat: 0 | 1 | 2 | 3;
  dealerSeat: 0 | 1 | 2 | 3;
  leadDiscardTile: Tile;
  firstSupplementTile: Tile;
  wallTiles: Tile[];
  wallRecipeSha256: string;
}

const SUITS = ['wan', 'tong', 'tiao'] as const;

function rotateTile(tile: Tile, offset: number): Tile {
  const match = /^(wan|tong|tiao)([1-9])$/.exec(tile);
  if (!match) return tile;
  const suit = SUITS[(SUITS.indexOf(match[1] as typeof SUITS[number]) + offset) % SUITS.length];
  return `${suit}${match[2]}` as Tile;
}

function seededShuffle<T>(values: readonly T[], seed: number): T[] {
  const output = values.slice();
  let state = seed >>> 0;
  const next = (): number => {
    state = Math.imul(state ^ state >>> 15, state | 1) + 0x6d2b79f5;
    return (state >>> 0) / 4294967296;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function removeReserved(pool: Tile[], tiles: readonly Tile[]): void {
  for (const tile of tiles) {
    const index = pool.indexOf(tile);
    if (index < 0) throw new Error('stage8-fixed-course-wall-template-overuses-tile');
    pool.splice(index, 1);
  }
}

function baseCandidateHand(scenario: Stage8FixedCourseScenario): Tile[] {
  if (scenario === 'zhichan') {
    return ['wan9','wan9','wan9','tong3','tong3','wan4','wan5','tiao2','tiao3','tiao4','tiao6','tiao7','tiao8'];
  }
  if (scenario === 'forcedRunKong') {
    return ['wan9','wan9','wan9','wan1','wan1','wan3','wan5','tong1','tong4','tong7','tiao1','tiao4','bei'];
  }
  return ['wan1','wan1','wan1','wan2','wan2','wan2','tong3','tong3','tiao2','tiao3','tiao4','tiao6','tiao7'];
}

/**
 * Builds a complete deterministic wall recipe. The recipe only changes the full
 * wall order; game execution and every opportunity remain rules-derived.
 */
export function createStage8FixedCurriculumWallRecipe(input: {
  fixedSeed: number;
  candidateSeat: 0 | 1 | 2 | 3;
  scenario: Stage8FixedCourseScenario;
}): Stage8FixedCurriculumWallRecipe {
  const dealerSeat = ((input.candidateSeat + 3) % 4) as 0 | 1 | 2 | 3;
  const suitOffset = input.fixedSeed % SUITS.length;
  const map = (tile: Tile): Tile => rotateTile(tile, suitOffset);
  const baseLeadDiscardTile: Tile = input.scenario === 'chainKong' ? 'bei' : 'wan9';
  const leadDiscardTile = map(baseLeadDiscardTile);
  const candidateHand = baseCandidateHand(input.scenario).map(map);
  const dealerHandBase: Tile[] = [
    baseLeadDiscardTile, 'dong','nan','xi','bei','zhong','bai','fa','wan1','wan2','wan3','tong1','tong2','tiao1',
  ];
  const dealerHand = dealerHandBase.map(map);
  const firstSupplementTile = map(input.scenario === 'chainKong' ? 'wan4' : 'tong9');
  const pool = STAGE8_V2_TILE_KEYS.flatMap((tile) => [tile, tile, tile, tile]);
  removeReserved(pool, candidateHand);
  removeReserved(pool, dealerHand);
  removeReserved(pool, [firstSupplementTile]);
  const shuffled = seededShuffle(pool, input.fixedSeed ^ 0xa5a5a5a5);
  const hands: Tile[][] = Array.from({ length: 4 }, () => []);
  hands[input.candidateSeat] = candidateHand.slice();
  hands[dealerSeat] = dealerHand.slice();
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat === input.candidateSeat || seat === dealerSeat) continue;
    hands[seat] = shuffled.splice(-13, 13);
  }
  const dealSequence = hands.flatMap((hand) => hand.slice(0, 13)).concat(dealerHand[13]);
  const wallTiles = shuffled.concat([firstSupplementTile], dealSequence.slice().reverse());
  const payload: Omit<Stage8FixedCurriculumWallRecipe, 'wallRecipeSha256'> = {
    version: STAGE8_FIXED_CURRICULUM_WALL_RECIPE_VERSION,
    scenario: input.scenario,
    candidateSeat: input.candidateSeat,
    dealerSeat,
    leadDiscardTile,
    firstSupplementTile,
    wallTiles,
  };
  return { ...payload, wallRecipeSha256: hashStage8OfflineIdentity(payload) };
}

export function hashStage8FixedCurriculumDefinition(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_FIXED_CURRICULUM_VERSION,
    curriculum: STAGE8_OFFLINE_SMOKE_CURRICULUM,
    scenarioCycle: SCENARIO_CYCLE,
    wallRecipeVersion: STAGE8_FIXED_CURRICULUM_WALL_RECIPE_VERSION,
    plannedGames: STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT,
    gamesPerCandidateSeat: STAGE8_OFFLINE_SMOKE_GAMES_PER_CANDIDATE_SEAT,
  });
}

function deriveSeed(baseSeed: number, gameIndex: number): number {
  let value = (baseSeed ^ Math.imul(gameIndex + 1, 0x9e3779b1)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function planPayload(plan: Omit<Stage8FixedCurriculumPlan, 'planSha256'>): unknown {
  return { version: plan.version, curriculum: plan.curriculum, baseSeed: plan.baseSeed, games: plan.games };
}

/** Builds only an in-memory deterministic schedule. It never starts games or writes artifacts. */
export function createStage8FixedCurriculumPlan(baseSeed: number): Stage8FixedCurriculumPlan {
  if (!Number.isInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xffffffff) throw new Error('stage8-fixed-course-base-seed-invalid');
  const games: Stage8FixedCourseGamePlan[] = Array.from({ length: STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT }, (_, gameIndex) => {
    const fixedSeed = deriveSeed(baseSeed, gameIndex);
    const candidateSeat = (gameIndex % 4) as 0 | 1 | 2 | 3;
    const scenario = SCENARIO_CYCLE[gameIndex % SCENARIO_CYCLE.length];
    const recipe = createStage8FixedCurriculumWallRecipe({ fixedSeed, candidateSeat, scenario });
    return {
      gameIndex,
      gameId: `fixed-course-game-${String(gameIndex + 1).padStart(4, '0')}`,
      fixedSeed,
      candidateSeat,
      scenario,
      dealerSeat: recipe.dealerSeat,
      leadDiscardTile: recipe.leadDiscardTile,
      wallRecipeSha256: recipe.wallRecipeSha256,
    };
  });
  const payload: Omit<Stage8FixedCurriculumPlan, 'planSha256'> = {
    version: STAGE8_FIXED_CURRICULUM_VERSION,
    curriculum: STAGE8_OFFLINE_SMOKE_CURRICULUM,
    baseSeed,
    games,
  };
  return { ...payload, planSha256: hashStage8OfflineIdentity(planPayload(payload)) };
}

export function validateStage8FixedCurriculumPlan(plan: Stage8FixedCurriculumPlan): { ok: true } | { ok: false; reason: string } {
  if (plan.version !== STAGE8_FIXED_CURRICULUM_VERSION || plan.curriculum !== STAGE8_OFFLINE_SMOKE_CURRICULUM) return { ok: false, reason: 'fixed-course-version-invalid' };
  if (!Number.isInteger(plan.baseSeed) || plan.baseSeed < 0 || plan.baseSeed > 0xffffffff || plan.games.length !== STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT) return { ok: false, reason: 'fixed-course-size-invalid' };
  const expected = createStage8FixedCurriculumPlan(plan.baseSeed);
  if (hashStage8OfflineIdentity(plan.games) !== hashStage8OfflineIdentity(expected.games) || plan.planSha256 !== expected.planSha256) return { ok: false, reason: 'fixed-course-plan-identity-mismatch' };
  const seats = [0, 0, 0, 0];
  const scenarios: Record<Stage8FixedCourseScenario, number> = { forcedRunKong: 0, zhichan: 0, chainKong: 0 };
  for (const game of plan.games) { seats[game.candidateSeat] += 1; scenarios[game.scenario] += 1; }
  if (seats.some((count) => count !== STAGE8_OFFLINE_SMOKE_GAMES_PER_CANDIDATE_SEAT)) return { ok: false, reason: 'fixed-course-seat-balance-invalid' };
  if (scenarios.forcedRunKong !== 400 || scenarios.zhichan !== 400 || scenarios.chainKong !== 200) return { ok: false, reason: 'fixed-course-ratio-invalid' };
  return { ok: true };
}
