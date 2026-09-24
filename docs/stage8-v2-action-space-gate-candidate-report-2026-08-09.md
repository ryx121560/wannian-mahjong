# Stage8 v2 Action-Space Three-Layer Gate Candidate Report

Status: product review passed; hygiene and clean integration authorized. Not yet merged, pushed, deployed, or used for training.

## Identity And Scope

- Candidate base: 539782b187cda8cbff16c18b2fc6331c8641c0cb.
- Candidate branch: codex/stage8-v2-gate-20260809-r2.
- The previously accepted addedKong bridge remains a retained component gate.
- This candidate adds the remaining independent rule, browser-page semantic, and Stage8 round-engine v2 execution adapters and same-fixture gates.
- No v1 action identity, replay, checkpoint, model, manifest, or work-root is accepted by any public v2 entry.


## Public Entry Review Correction

Product review found that the generic deriveStage8V2Actions entry still returned only normalConcealedKong and could produce an incomplete policy mask.

This candidate applies option A:

1. deriveStage8V2Actions is deprecated and fails closed after protocol and v1-artifact validation. Its error requires callers to choose deriveStage8V2RuleActions, deriveStage8V2PageSemanticActions, or deriveStage8V2RoundEngineActions.
2. The former normal-concealed regression now calls the explicit rule-semantic entry.
3. A public-entry regression enumerates the complete canonical action set across audited mutually exclusive fixtures and requires all 14 action types.
4. Every special action has at least one real rule fixture, and the explicit rule entry directly rejects v1 fields.
5. normalConcealedKong remains available beside forcedRunConcealed when both are legal; they retain distinct canonical IDs and explicit user choice.
6. rule, page-semantic, and round-engine adapters independently add declineKong whenever a kong choice exists. They do not share one derive implementation.

TDD red evidence:

- Before the fail-closed change, the new regression failed with: Missing expected exception: the incomplete generic v2 action entry must fail closed.
- After the first correction, the complete-set regression exposed missing normalConcealedKong in the rule/page/round adapters and then missing declineKong.
- After the independent adapter corrections, the complete public-entry and three-layer assertions pass.

## Canonical Registry

The versioned v2 registry assigns stable, non-overlapping canonical identities for:

- pass, discard, pong, and win;
- directChisel;
- forcedRunImmediate and forcedRunDeferred;
- chainKong;
- addedKong;
- normalConcealedKong;
- forcedRunConcealed;
- postPongCandidateConcealedKong;
- doublePongForcedRun;
- explicit decline.

The regression enumerates every action type and tile-bearing combination and rejects duplicate IDs or unstable parameter signatures.

## Independent Three-Layer Boundaries

1. The rule adapter calls only TypeScript pure rule-core APIs.
2. The page adapter calls only the injected published browser RULE_ENGINE facade and consumes a visible page-state projection. It does not import HTML or GS.
3. The round-engine v2 entry independently consumes v2 state and pure rule-core APIs. It does not import HTML or page adapters.
4. The three adapters do not call one another and do not share one derive function.

Basic pass, discard, pong, and win are covered at canonical declaration and priority level. This candidate does not invent or replace their established game execution semantics.

## Execution Fixtures

The complete public execution comparison covers:

- direct chisel fake-win settlement;
- immediate forced-run success and failure-discard;
- deferred forced-run success;
- manual direct-chisel chain settlement;
- concealed forced-run success with no rob-kong window;
- post-pong candidate concealed-kong settlement;
- double-pong selective forced-run success and resource lifecycle;
- ordinary added-kong robbed, continue-discard, immediate-win, and chain-window outcomes;
- added-kong chain true-win settlement;
- explicit decline with zero wall consumption;
- nearest legal rob-kong winner priority with zero mutation before resolution.

Each wall-consuming fixture compares outcome, wall consumption, resulting hand and melds, resource lifecycle, settlement delta and payments, handTypes, decompositionSignature, and public log summary.

## Declaration, Determinism, And Privacy

- Declaration derives only from visible pre-action state and is invariant under different future wall tops.
- Wall consumption occurs only after explicit action execution.
- Inputs and returned state are replayable and deterministic.
- Public summaries exclude opponent concealed hands, future wall, user records, browser storage, and model internals.
- Actual public derive, prepare, and execute entries reject v1 IDs and artifact fields.

## Verification

Fresh candidate verification covers:

- Stage8 v2 action-space declaration gate.
- Stage8 v2 special-kong execution gate.
- Added-kong pure resolution, page commit, and round-engine gates.
- Normal concealed-kong v2 regression.
- P0 special-kong rules, page phase2, and visible-declaration regressions.
- Shared rules, response, recommendation, MCTS, strong-AI, and Stage7 regressions.
- TypeScript no-emit check, browser rule and recommendation verification, production build, and git diff check.

Build-generated browser bundle noise was restored to the candidate baseline and is excluded.

## Candidate Files

- package.json
- public/game/rule_engine.js
- public/game/wannian-mahjong.html
- src/game/rules/index.ts
- src/game/rules/added-kong.ts
- src/game/stage8/action-space-v2.ts
- src/game/stage8/action-registry-v2.ts
- src/game/stage8/v2-visible-state.ts
- src/game/stage8/rule-semantics-adapter-v2.ts
- src/game/stage8/page-semantics-adapter-v2.ts
- src/game/stage8/round-engine-v2.ts
- scripts/stage8-v2-action-space-gate-regression.mjs
- scripts/stage8-v2-kong-execution-gate-regression.mjs
- scripts/stage8-v2-normal-concealed-kong-regression.mjs
- scripts/stage8-v2-added-kong-resolution-regression.mjs
- scripts/stage8-v2-added-kong-page-adapter-regression.mjs
- scripts/stage8-v2-added-kong-round-engine-regression.mjs
- docs/stage8-v2-added-kong-resolution-candidate-report-2026-08-09.md
- docs/stage8-v2-action-space-gate-candidate-report-2026-08-09.md
- docs/superpowers/plans/2026-08-09-stage8-v2-three-layer-gate.md

## Explicit Exclusions

No selfplay, replay write, model, ONNX, checkpoint, manifest, Candidate-4, training, Smoke, Pilot, Arena, Champion, runtime deployment, 18768 access, or browser-storage access occurred.

## Product Boundary

This package is submitted only for the complete Stage8 v2 protocol and three-layer action-space gate review. It does not authorize Candidate-4 creation, training, selfplay, replay, model export, Arena, runtime, or deployment.
