# Candidate-4 H-C4 value calibration readiness report

Date: 2026-08-09
Status: **fixture readiness passed; real offline gate blocked; not merged, pushed, deployed, or authorized for downstream execution**

## Scope

This candidate implements readiness/preflight controls for the product-accepted H-C4 post-training value-scale calibration design only. It does not create Candidate-4, generate a calibration corpus, open the real final-test split, fit a scale from real data, train, export a model, run self-play, write replay, run Smoke/Pilot/Arena, register a Champion, or change runtime/frontend behavior.

The implementation is isolated in `codex/h-c4-readiness-20260809` at base `e60dee4994e783eb49430085f4503b7d3d8448eb`. The release-evidence correction is a separate already-pushed document-only commit and is not part of this candidate.

## Frozen protocol

- Complete `gameId` SHA-256 grouping: buckets `0..799` training, `800..899` calibration, `900..999` final-test.
- Training rows are rejected by scale fitting; only calibration rows can fit one shared non-negative scalar `s`.
- `s` must be finite and at least `0.125`; zero and near-zero collapse are rejected.
- Labels are exactly `terminalScoreDeltas / 8`, four finite seats, with zero-sum tolerance `1e-6`.
- Raw value vectors must already be zero-sum. The gate never silently repairs them by centering.
- The calibration fit digest binds approved row content, source runtime fingerprints, and source shard hashes.
- Final-test evaluation is one-shot and fail-closed across processes: an immutable opened marker is written before evaluation, a failed evaluation leaves the marker, and a second run is rejected.
- The final-test gate requires MAE-improvement bootstrap 95% CI lower bound `> 0`, aggregate and per-seat same-sign non-degradation, at least 95% effective values at threshold `0.05`, and zero-sum residual within tolerance.
- Only visible numeric features are accepted. Hidden hands, future wall, full-information teacher, player exports, user records, v1 action IDs, replay, checkpoint, model, manifest, and work-root fields are rejected.
- `stage8-action-space-v2` registry SHA and its introducing commit are independently derived and compared; the config cannot self-attest lineage.

## TDD evidence

The regression sequence first failed for each missing control, then passed after the minimal implementation:

1. Missing readiness module and deterministic split/fit gates.
2. Missing immutable preflight CLI.
3. Missing cross-process final-test one-shot discipline.
4. Silent centering of non-zero-sum raw values and acceptance of degenerate scales.
5. Preflight without real regression evidence and self-referential lineage comparison.
6. Nested v1 artifact fields and a mismatched action-space gate commit not being rejected by the public preflight path.

Final focused results:

- `npm.cmd run test:stage8-c4-value-calibration-readiness`: passed.
- `npm.cmd run test:stage8-c4-value-calibration-preflight`: passed.
- `npm.cmd run test:stage8-v2-action-space`: passed.
- `npm.cmd run test:stage8-v2-kong-execution`: passed.

Shared results:

- `npm.cmd run test:rules`: 472 passed, 0 failed.
- `npm.cmd run test:recommendation`: 100 passed, 0 failed.
- `npx.cmd tsc --noEmit --incremental false`: passed.
- `npm.cmd run build`: passed.
- `git diff --check`: passed.

The build-generated browser bundles were restored to the candidate base. No generated browser bundle or `tsconfig.tsbuildinfo` remains in scope.

## Readiness result

The immutable preflight status is `fixture-readiness-passed-real-offline-gate-blocked`.

Passed readiness controls:

- deterministic 80/10/10 complete-game split;
- calibration-only scalar fitting and complete source binding;
- zero-sum label/raw-value validation;
- non-degenerate scale and same-sign gates;
- process-persistent final-test one-shot refusal;
- strict visible-state allowlist and privacy rejection;
- independent Stage8 v2 registry/commit lineage validation;
- downstream authorization refusal.

Blocking facts:

- `v2ValueModelAvailable=false`;
- `v2CalibrationCorpusAvailable=false`;
- `candidateCreated=false`;
- `corpusGenerated=false`;
- `finalTestOpened=false`;
- `trainingAuthorized=false`;
- `arenaAuthorized=false`;
- `runtimeAuthorized=false`.

Therefore no real offline H-C4 metric exists and no capability claim is made. A future real offline run requires separate product authorization and immutable v2 model/corpus lineage. Even if that gate later passes, it only permits a separate request for at most 50 steps / 5,000 games plus a 200-game development Arena; it does not authorize a default 315-step run.

## Primary evidence

- Accepted design SHA-256: `19F175F06DACE16C3D5B27D7BEAA423DAA2F589A94BC7FC07D32DDDA7A930FD3`
- Config SHA-256: `861414DB630FADE02DCED3449746AE55A4769F1E6452414438B053DD1502F7F6`
- Preflight SHA-256: `B0756563A4179C67511D8B0DB614C990209372C005FED12247F1E9542544A4E4`
- Readiness module SHA-256: `83B829B63C8F469244FEF8DC8DFBEB4AA90ED77E375372A44001ED376CB66CC5`
- Action registry SHA-256: `DE8F2B28F785F8E26A621F27B4403A5DE1B91788DC757423E28D9221C0790753`
- Action-space gate commit: `a3ba905b52c80aa61bbdf04a09f1655b3faa6d67`
- Original gate report actual SHA-256: `212A10CBFB7A1E3562930B2B37D3B5AD98F1517F341E458B9B5912C7DE47428C`
- Release-evidence correction commit: `e60dee4994e783eb49430085f4503b7d3d8448eb`
