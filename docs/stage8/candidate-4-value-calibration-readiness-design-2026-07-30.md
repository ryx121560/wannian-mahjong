# Candidate-4 H-C4 Value Calibration Readiness Design

## Status and Scope

Status: product-accepted design/readiness only (2026-07-30). This document does not authorize an implementation, calibration-corpus generation, candidate creation, training, Smoke, Pilot, Arena, Champion registration, runtime manifest change, or frontend release. It remains blocked pending the independently accepted P0 pong-resource/direct-chisel/forced-run-kong state-machine work and a separate product authorization.

H-C4 validates value-scale calibration only. It does not claim that value calibration improves policy strength. Arena EV remains the only strategy-capability evidence.

The existing Candidate-3 Phase2 failure diagnosis is the baseline evidence. It found no hard integrity, deterministic, privacy, observer, or Arena-seat bias issue. Candidate-3 remained negative against Stage7 from step 50 through step 150. Its value MAE is therefore a calibration observation, not an established causal explanation for negative EV.

## Frozen Baseline

The future Candidate-4 lineage, if separately authorized, starts from the same frozen BC checkpoint as Candidate-3 and retains the same frozen BC reference for the discard/pass policy anchor. The only intended behavioral difference is the post-training value calibration layer described below.

The following remain unchanged:

- Policy anchor configuration: `kl-reference-to-current`, discard/pass only, at least two legal actions, constant weight `0.25`.
- Network architecture: the existing `Stage8PolicyValueNet` trunk, policy head, and four-seat value head.
- Rules, scoring, feature encoder, action space, MCTS implementation and parameters, guard, curriculum, directed exploration, behavior temperature, action sampling, seed derivation, and Arena configuration.
- Training reward: terminal score delta only.

Candidate-4 configuration, locks, fingerprints, model/manifest hashes, and a calibration artifact hash must be created only after all readiness gates below pass and a separate product authorization exists.

## Data Boundary and Split

The H-C4 readiness corpus must be produced by a separate, diagnostic-only fixed-model self-play run after its corpus config is frozen. It is not a replay source, training input, Smoke, Pilot, or Arena result. No game in this corpus may have been consumed by a model-training run. The final Candidate-3 step-150 model and manifest are the only permitted readiness model lineage; their hashes, the self-play runtime identity, root seed, game count, and corpus configuration hash must be frozen before the first game.

Only Stage8 self-play samples that already pass the current dataset validator may be considered. The calibration reader has an explicit allowlist:

- `gameId` for split assignment only;
- the existing visible-state `features` and associated model output;
- `terminalScoreDeltas` as a post-game value label;
- stable identity fields needed to verify the replay shard and configuration lineage.

The reader must reject player exports, opponent hidden-hand fields, future-wall fields, full-information teacher fields, and unknown decision-input fields. It must not write replay, checkpoints, samples, models, or training state.

The label contract is fixed and must be recorded verbatim in the calibration artifact and acceptance index:

```text
sampleSchemaVersion: stage8-experience-v1
learningVersion: stage8-terminal-actor-critic-v1
labelField: terminalScoreDeltas
valueTargetTransformVersion: stage8-terminal-score-delta-over-value-scale-v1
valueScale: 8
zeroSumTolerance: 1e-6
```

For each label vector `d`, the only target is `y = d / 8`. `d` must have four finite numeric entries and `abs(sum(d)) <= 1e-6`; the transformed target must also pass the same zero-sum tolerance. The artifact and acceptance index must bind the sample/learning/transform versions, `valueScale`, tolerance, and SHA-256 values for the dataset validator, value-target transform implementation, source replay index, and every source shard. A version, hash, scale, or tolerance mismatch rejects the run.

The split unit is the complete `gameId`, not a state, turn, seat, sample, shard, or replay cursor. Every sample from one game belongs to exactly one split. The pre-registered assignment is:

```text
bucket = SHA-256("stage8-c4-value-calibration-v1:" + gameId) interpreted modulo 1000
training:    000-799  (80%)
calibration: 800-899  (10%)
final-test:  900-999  (10%)
```

Training split samples are never used to fit `s`, choose thresholds, or calculate final-test metrics. The calibration split is used only to fit `s`. The final-test split is opened exactly once for evaluation after `s` is frozen; it must not be used to refit `s`, change a threshold, or redefine the split. The future Candidate-4 development run must apply the same game-level isolation: no held-out calibration or final-test game may enter its replay buffer, gradient batch, checkpoint, or policy-anchor calculation.

## Calibration Definition

The existing network emits a four-seat value vector and already enforces a zero mean per state. For each state, the calibration layer performs only:

```text
v0 = rawValue - mean(rawValue)
v  = s * v0
```

where one scalar `s >= 0` is shared by all seats and all states in the run. `s` is fitted on the calibration split only by constrained least squares against the fixed terminal zero-sum label `y`:

```text
s = max(0, sum(v0_i * y_i) / sum(v0_i * v0_i))
```

The fit is rejected if any value or label is non-finite, a label is not zero-sum under the fixed tolerance, the denominator is zero or non-finite, or the resulting `s` is non-finite or `s < 0.125`. The `0.125` lower bound is pre-registered from the current MCTS `minimumValueAdvantage=0.5`: it requires at least one quarter of that decision boundary to remain available in a value component whose unscaled fixed-fixture magnitude is at least `0.4`. It is far above Float32/fixture zero noise and cannot be tuned after the final test opens.

The calibration artifact stores `s`, the formula version, split version, label contract, calibration source identities, the non-degeneracy thresholds, and its SHA-256; it contains no raw states, hands, walls, game exports, or terminal records.

At any future inference point, the layer may transform only the four value outputs. It must not alter policy logits, legal masks, behavior distributions, `behaviorActionProbability`, policy-anchor computation, or MCTS code/parameters. MCTS may receive different value magnitudes and may therefore select a different final action; this design makes no byte-identical-final-action claim. The adapter must re-verify zero mean before and after scaling.

## Offline Readiness Metrics

The identity baseline is `s = 1`. On the final-test split, report:

- Seat-wise and aggregate MAE for `s = 1` and fitted `s`.
- Absolute and relative MAE improvement: `MAE(identity) - MAE(calibrated)`.
- A pre-registered game-cluster bootstrap 95% confidence interval for the MAE improvement. Resampling unit is complete game, never individual state. The readiness protocol fixes `bootstrapSeed=2026073004` and `bootstrapReplicates=10000`; any change creates a new diagnostic attempt.
- Seat-wise same-sign rate for identity and calibrated values, with the zero handling definition recorded in the report.
- Mean and maximum absolute zero-sum residual before and after calibration.
- The fraction of states whose calibrated maximum absolute seat value is at least `0.05`, where `0.05` is one tenth of the frozen MCTS `minimumValueAdvantage=0.5` and is materially above the `1e-6` Float32 zero threshold.
- Sample/game counts, split assignment hashes, label validation failures, and the fitted `s`.

For same-sign reporting, the sign is `+1` when value is greater than `1e-6`, `-1` when smaller than `-1e-6`, and `0` otherwise. A seat is same-sign only when predicted and terminal-label signs are equal; all four seats are included. This rule is frozen before final-test evaluation.

The offline gate passes only when all validation checks pass, the lower bound of the final-test MAE-improvement bootstrap 95% confidence interval is strictly greater than zero, final-test same-sign rate is no lower than the identity baseline, and at least 95% of final-test states meet the `maxAbs(calibratedValue) >= 0.05` non-degeneracy threshold. Otherwise H-C4 stops: no Candidate-4 identity, model artifact, training, Smoke, Pilot, Arena, Champion, runtime, or release may be created from this attempt.

Same-sign and zero-sum statistics are mandatory monitoring results. They are not silently optimized against the final-test set. Any additional threshold would require a new product decision and a new pre-registration before the final test is opened.

## Readiness Regression Design

The implementation, if later authorized, must first satisfy deterministic regressions covering:

1. Split determinism: the same `gameId` always maps to the same split; distinct invocations produce byte-identical assignments.
2. Game atomicity: all samples from one game share a split, and the three splits are disjoint and exhaustive.
3. Access control: fitting rejects training/final-test rows; final evaluation rejects calibration fitting calls and cannot modify `s` or split configuration.
4. Privacy boundary: input containing player-export, hidden-hand, future-wall, full-information-teacher, or an unapproved field is rejected before model evaluation.
5. Label integrity: non-finite and non-zero-sum terminal labels reject the run.
6. Constrained fit: a fixture with known scale recovers that scale; a negative unconstrained optimum clamps to zero; zero-variance raw values reject.
7. Four-seat invariants: output remains finite and zero-sum after scaling; every seat receives the same scalar.
8. Policy neutrality: before/after calibration policy logits, legal action masks, behavior distribution, and selected-action probability are byte-identical for a fixed fixture. The regression must not require final MCTS action equality, because calibrated values can legitimately change the MCTS result while its implementation and parameters remain unchanged.
9. Identity and lineage: the calibration artifact, BC initial/reference checkpoint, policy-anchor config, feature/action/rules versions, self-play runtime identity, and final model/manifest are all hash-bound; a mismatch rejects readiness.
10. Non-degeneracy: reject zero, non-finite, or `<0.125` scales; reject a final-test run with fewer than 95% state vectors at `maxAbs >= 0.05`; reject any final-test same-sign rate below the identity baseline. Fixtures must show the zero-sum residual remains within `1e-6`.
11. Final-test discipline: the pre-registered bootstrap seed/replicate count and split rule are immutable after the test begins; a second evaluation or changed split requires a new diagnostic attempt and cannot overwrite the first report.
12. Downstream refusal: passing the offline metric alone does not permit training or Arena. The launcher must reject unless the P0 state-machine implementation acceptance and page/rules/Stage8 action-space consistency audit are both hash-bound as passed, and a separate product authorization permits the 50-step development stage.

## Hard Prerequisites and Later Control

H-C4 is blocked from any training, Arena, Champion, runtime, or release action until all of the following are independently accepted:

1. The P0 pong-resource, direct-chisel, and forced-run-kong state-machine rule boundary is confirmed and implemented in its own workstream.
2. That P0 implementation has its own rule and page acceptance evidence.
3. A page, rules, and Stage8 simulation action-space consistency audit passes for those actions.
4. The H-C4 final-test offline gate above passes.
5. A separate product authorization approves a Candidate-4 development stage.

Even after all gates pass, the maximum initial authorization is step 50 / 5,000 games followed by a 200-game development Arena. Product review of its EV and confidence interval is required before any later stage. There is no default 315-step authorization.

## Required Readiness Evidence Package

The future readiness package must contain an immutable design/config snapshot, split-assignment digest, regression report, offline calibration report, calibration artifact hash, and an acceptance index binding:

- this design version and product authorization;
- the exact Candidate-3 diagnostic report used as baseline context;
- the independent diagnostic-only calibration-corpus configuration and its completed-game identity digest;
- frozen BC checkpoint and reference SHA-256;
- unchanged policy-anchor configuration hash;
- model/manifest, rules, feature, action-space, training-control, self-play-runtime, and Arena identities;
- P0 state-machine and action-space consistency gate status;
- explicit `trainingAuthorized: false`, `arenaAuthorized: false`, `runtimeAuthorized: false` until later approvals.
