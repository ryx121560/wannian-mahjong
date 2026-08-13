# Candidate-4 v2 Diagnostic Canonical Sampler Candidate Report

- Status: `implementation-candidate-passed-product-acceptance-pending`
- Source baseline: `64def8ccfd8596c4542cda35a0a271bb1c169215`
- Branch: `codex/c4-v2-diagnostic-actor-implementation-20260809`
- Actor ID: `c4-diagnostic-v2-canonical-sampler`
- Actor version: `stage8-c4-diagnostic-v2-actor-v1`
- Implementation fingerprint: `29B6C4E12901A88B73272DF307DA281EE81E90993F175ED6C6A566460E73C3AF`

## Scope

This candidate implements only the product-authorized diagnostic actor boundary. It is a deterministic coverage sampler, not a capability policy and not Candidate-4 training.

Implemented:

- Strict `Stage8C4DiagnosticActorObservation` allowlist projection with recursive hidden/v1 field rejection.
- External records require `Object.prototype` or `null`; arrays require exactly `Array.prototype`.
- Non-enumerable own fields, symbol fields, accessors, custom/inherited object prototypes, null array prototypes, and custom array prototypes fail closed at every recursive level.
- Actor API has no `GameState`, HTML, page state, observer, C3 logits, wall tiles, wall top, opponent hands, replay, checkpoint, model, manifest, or work-root input.
- Trusted rule authorization envelope owns win/rob-kong priority validation and canonical legal-action authorization.
- Canonical actions must be non-empty, strictly sorted by `actionId`, unique, v2-only, actor-bound, and registry-valid.
- Deterministic uniform selection uses the frozen SHA256 domain/root seed/game identity and canonical action ID order.
- Decision output is restricted to identity, selected canonical action, candidate count/probability, and SHA256 summaries.
- All 14 v2 action classes have competing selected and non-selected fixtures.

Explicitly not performed:

- No diagnostic root or corpus was created.
- No C3 ONNX/model/policy logits were loaded or executed.
- No observer on/off dry-run was executed.
- No selfplay, replay, checkpoint, model, ONNX, Candidate-4, training, Smoke, Pilot, Arena, Champion, runtime, service, or 18768 operation occurred.

## Frozen Identity

- Root seed: `2026080901`
- Seed domain: `stage8-c4-diagnostic-v2-actor-v1`
- Derivation: `sha256(domain\0rootSeed\0gameId\0decisionIndex\0actorSeat)`
- Action order: `canonical-action-id-ascending`
- Seed fingerprint: `2B96C862E701479246B432F7F1941AC14AC96B6DFBDD4F5A1A7A5D7188FA3A91`
- Fixed fixture digest: `EE2B767417FFC43016A355D49D90D6CF1B200B97C47ABA6594DCD14C69441E5F`
- Actor source SHA256: `ECAE188F99F8089AA6084B927789AA64515897E5CA552C9179C743FEA5F2E037`
- Registry source SHA256: `DE8F2B28F785F8E26A621F27B4403A5DE1B91788DC757423E28D9221C0790753`
- Regression source SHA256: `84BC1E6E3A52D6A92C4C9E8D099D6F04DCBD56D4EDDDEF07970850FCE3587472`

## TDD Evidence

Initial red phase:

- `npm.cmd run test:stage8-c4-diagnostic-actor`
- Failed because `stage8/diagnostic-actor-v2.js` did not exist.

P0 recursive-field review red phase:

- A non-enumerable top-level `wallTop` passed the original `Object.entries` scan, producing `Missing expected exception`.
- Additional red fixtures cover nested non-enumerable `opponentHands`, a non-enumerable allowlisted field, inherited forbidden data, and top-level/nested symbols.

P1 array-prototype review red phase:

- `Object.setPrototypeOf([], null)` reached projection copying and failed with `slice is not a function` instead of the required plain-data boundary error.
- A custom array prototype fixture was added alongside the null-prototype fixture; both now fail at projection before tile-array processing.

Green phase and final verification:

- `npm.cmd run test:stage8-c4-diagnostic-actor`: passed; 14 action classes covered; observer random calls `0`; all downstream flags false.
- `npm.cmd run test:stage8-v2-action-space`: passed.
- `npm.cmd run test:stage8-v2-kong-execution`: passed.
- `npm.cmd run test:stage8-v2-normal-concealed-kong`: passed.
- `npm.cmd run test:stage8-v2-added-kong-resolution`: passed.
- `npm.cmd run test:stage8-v2-added-kong-page`: passed.
- `npm.cmd run test:stage8-v2-added-kong-round`: passed.
- `npm.cmd run test:rules`: `472/472` passed.
- `npm.cmd run test:recommendation`: `100/100` passed.
- `npx.cmd tsc --noEmit --incremental false`: passed.
- `git diff --check`: passed.

## Candidate Files

Production/test changes:

- `package.json`
- `src/game/stage8/diagnostic-actor-v2.ts`
- `scripts/stage8-c4-diagnostic-actor-runtime-regression.mjs`

Accepted preregistration materials, copied byte-for-byte:

- `docs/stage8/candidate-4-v2-actor-runtime-source-audit-2026-08-09.md`
- `docs/stage8/candidate-4-v2-actor-runtime-proposal-v1.json`
- `docs/superpowers/plans/2026-08-09-c4-v2-diagnostic-actor-runtime.md`
- `docs/stage8/candidate-4-v2-actor-runtime-audit-index-2026-08-09.json`

No files were committed, pushed, deployed, or merged. Product acceptance is required before any next stage.