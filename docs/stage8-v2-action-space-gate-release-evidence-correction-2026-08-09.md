# Stage8 v2 Action-Space Gate Release Evidence Correction

Status: released and HTTP-only verified; training and all downstream capability workflows remain unauthorized.

## Purpose

This document corrects the post-release evidence record without modifying the original candidate report. The candidate report remains a pre-release point-in-time artifact and therefore still states that it had not yet been merged, pushed, or deployed.

## Immutable Candidate Evidence

- Candidate report: `docs/stage8-v2-action-space-gate-candidate-report-2026-08-09.md`
- SHA-256 computed from the file in the released worktree: `212A10CBFB7A1E3562930B2B37D3B5AD98F1517F341E458B9B5912C7DE47428C`
- The previously reported `ED5D...` value was incorrect and must not be used as an acceptance binding.
- The original candidate report is unchanged by this correction.

## Release Identity

- Release commit: `a3ba905b52c80aa61bbdf04a09f1655b3faa6d67`
- Parent commit: `539782b187cda8cbff16c18b2fc6331c8641c0cb`
- Commit message: `feat(stage8): 接入v2动作空间三层门禁`
- Push mode: ordinary non-force fast-forward to `origin/main`
- Verified remote head after push: `a3ba905b52c80aa61bbdf04a09f1655b3faa6d67`

## Exact 18-File Release Scope

1. `docs/stage8-v2-action-space-gate-candidate-report-2026-08-09.md`
2. `package.json`
3. `public/game/rule_engine.js`
4. `public/game/wannian-mahjong.html`
5. `scripts/stage8-v2-action-space-gate-regression.mjs`
6. `scripts/stage8-v2-added-kong-page-adapter-regression.mjs`
7. `scripts/stage8-v2-added-kong-resolution-regression.mjs`
8. `scripts/stage8-v2-added-kong-round-engine-regression.mjs`
9. `scripts/stage8-v2-kong-execution-gate-regression.mjs`
10. `scripts/stage8-v2-normal-concealed-kong-regression.mjs`
11. `src/game/rules/added-kong.ts`
12. `src/game/rules/index.ts`
13. `src/game/stage8/action-registry-v2.ts`
14. `src/game/stage8/action-space-v2.ts`
15. `src/game/stage8/page-semantics-adapter-v2.ts`
16. `src/game/stage8/round-engine-v2.ts`
17. `src/game/stage8/rule-semantics-adapter-v2.ts`
18. `src/game/stage8/v2-visible-state.ts`

Intermediate addedKong reports, Superpowers plans, generated browser-bundle noise, `tsconfig.tsbuildinfo`, training data, replay, checkpoints, models, and ONNX artifacts were excluded.

## Fresh Integration Verification

The clean integration worktree passed:

- `test:stage8-v2-action-space`
- `test:stage8-v2-kong-execution`
- `test:stage8-v2-added-kong-resolution`
- `test:stage8-v2-added-kong-page`
- `test:stage8-v2-added-kong-round`
- `test:stage8-v2-normal-concealed-kong`
- `test:p0-special-kong-rules`
- `test:p0-special-kong-page-phase2`
- `test:p0-special-kong-visible-declarations`
- rules: 472/472
- recommendation: 100/100
- MCTS: 154/154
- strong AI: 391/391
- Stage7 recommendation: 320/320
- Stage7 unified AI: 58/58
- response real-meld and restore-revalidation regressions
- TypeScript no-emit check
- browser rule and recommendation verification
- production build
- `git diff --check`

Build-generated changes to `strong_rule_ai.js`, `mcts_enhancement_engine.js`, and `recommendation_engine.js`, plus any `tsconfig.tsbuildinfo`, were restored or removed before commit.

## HTTP-Only Production Acceptance

- Runtime worktree: `C:\Users\Administrator\Documents\NEW\.worktrees\codex-runtime-stage8-v2-gate-20260809`
- Runtime HEAD: `a3ba905b52c80aa61bbdf04a09f1655b3faa6d67`
- Runtime Git status: clean
- Port 18768 listener PID at acceptance time: `14140`
- Page: HTTP 200
- `rule_engine.js`: HTTP 200
- `/api/rl/load_rl`: HTTP 200 and matched the explicitly approved file in memory without recording raw values
- `resolveAddedKongDraw` and the page addedKong settlement bridge were present
- Port 18769 had no listener
- No browser page, LocalStorage, user game, selfplay, replay, model, training, or Arena workflow was accessed or started

## Boundary

This release establishes the Stage8 v2 protocol and three-layer pre-training gate only. It does not authorize Candidate-4 creation, calibration corpus generation, selfplay, replay, model or ONNX generation, training, Smoke, Pilot, Arena, Champion, or runtime candidate promotion.

The SHA-256 of this correction document is computed only after the file is written and is reported with the correction commit evidence; it is intentionally not self-embedded.
