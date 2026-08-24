import { hashStage8OfflineIdentity } from './offline-action-identity';
import {
  STAGE8_OFFLINE_SMOKE_CURRICULUM,
  STAGE8_OFFLINE_SMOKE_GAMES_PER_CANDIDATE_SEAT,
  STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT,
} from './offline-selfplay-control';

export const STAGE8_FIXED_CURRICULUM_VERSION = 'stage8-fixed-curriculum-kong-zhichan-chain-v1';

export type Stage8FixedCourseScenario = 'forcedRunKong' | 'zhichan' | 'chainKong';

export interface Stage8FixedCourseGamePlan {
  gameIndex: number;
  gameId: string;
  fixedSeed: number;
  candidateSeat: 0 | 1 | 2 | 3;
  scenario: Stage8FixedCourseScenario;
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

export function hashStage8FixedCurriculumDefinition(): string {
  return hashStage8OfflineIdentity({
    version: STAGE8_FIXED_CURRICULUM_VERSION,
    curriculum: STAGE8_OFFLINE_SMOKE_CURRICULUM,
    scenarioCycle: SCENARIO_CYCLE,
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
  const games: Stage8FixedCourseGamePlan[] = Array.from({ length: STAGE8_OFFLINE_SMOKE_PLAN_GAME_COUNT }, (_, gameIndex) => ({
    gameIndex,
    gameId: `fixed-course-game-${String(gameIndex + 1).padStart(4, '0')}`,
    fixedSeed: deriveSeed(baseSeed, gameIndex),
    candidateSeat: (gameIndex % 4) as 0 | 1 | 2 | 3,
    scenario: SCENARIO_CYCLE[gameIndex % SCENARIO_CYCLE.length],
  }));
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
