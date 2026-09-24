# Stage 8 Windows Task control-only approval signer candidate

Date: 2026-09-16  
Status: candidate only; uncommitted, unpublished, and not authorized for a real emit

## Decision

The repository did not contain a safe signer for the single `stage8-windows-task-host-control` scope. This candidate adds a default-deny signer and validator without creating a real authorization.

The candidate is intentionally unable to authorize itself. A usable approval input must be supplied externally after this signer is published from a clean checkout, and it must bind the published signer commit and the exact bytes of the two signer source files.

## Fixed authority boundary

- Allowed scope: `stage8-windows-task-host-control` only.
- Diagnostic identity SHA-256: `d4166d519f323f289faec84ff53b87a24aa5798af5e16fd16bc3a765997075fd`.
- Diagnostic runtime release: `fae72b67b297672960d49361e6252c7e022d9040`.
- Host run: `stage8-disposable-diagnostic-20260916`.
- Target run: `stage8-disposable-diagnostic-20260916-diagnostic`.
- Task name: `Stage8-Host-stage8-disposable-diagnostic-20260916`.
- Output root: the exact OS-temporary `WannianMahjong\\Stage8\\<host>\\control-approval` directory.
- Explicitly not authorized: `materials-emit`, `register`, `run`, `verify`, `delete`, formal pilot, third pilot, training, smoke, self-play, replay, or model reads.

## Candidate files

1. `src/game/stage8/offline-windows-task-control-approval.ts`
2. `scripts/stage8-windows-task-control-approval.mjs`
3. `scripts/stage8-windows-task-control-approval-regression.mjs`
4. `package.json`
5. `docs/stage8-windows-task-control-approval-candidate-report-2026-09-16.md`

The signer source identity covers only the first two files. The external approval input binds their future published release commit, individual SHA-256 values, and aggregate source bundle SHA-256.

## Protocol controls

- Exact schemas reject missing and additional fields.
- The approval ID binds the diagnostic identity, unsigned control template, host/target/task, diagnostic runtime release, signer release, and signer source bundle.
- The approval input has its own canonical SHA-256.
- The final host control uses the existing host-control protocol validator and canonical manifest hash.
- Evidence reports `phaseAuthorizationsIssued: 0`, `scheduledTasksMutated: 0`, `servicesMutated: 0`, `formalPathsRead: 0`, and `formalPilotGamesCredited: 0`.
- `--check` is read-only.
- `--emit` requires the explicit `STAGE8_WINDOWS_TASK_CONTROL_APPROVAL_EMIT=1` gate, uses exclusive writes through the exact validated staging directory, writes exactly `host-control.json` and `control-approval-evidence.json`, and atomically renames only after both roundtrip checks pass.
- Any write, roundtrip, or rename failure removes only the exact staging directory. Parent cleanup is limited to directories created by that invocation, in reverse order, with non-recursive empty-directory removal; no failure path deletes `outputRoot` or an untracked directory.
- Failure evidence reports historical `filesWritten`, current `filesRemaining`, created/remaining directories, `outputRootExists`, `stagingExists`, cleanup errors, and rename completion. A cleanup failure is explicitly labeled as a residual failure instead of reporting zero side effects.
- A pre-existing output or staging directory is rejected before mutation and identified as pre-existing in failure evidence.
- `--verify` accepts exactly those two files and performs no writes.

## Validation performed

`npm run test:stage8-windows-task-control-approval` passed using only an isolated OS-temporary fixture. The test covered valid creation/verification, exact scope, identity and template drift, host/target/task/runtime drift, signer commit/cleanliness/source drift, approval ID and input hash drift, missing/additional fields, relative/project/formal output roots, emit gating, duplicate protection, exact output file set, and zero phase authorization.

Fault injection also passed for first-file write failure, second-file write failure, roundtrip mismatch, rename failure, staging cleanup failure, and parent-directory cleanup failure. Cleanable failures proved that both output and staging were absent with zero remaining files. Injected cleanup failures returned explicit cleanup/residual evidence with the real historical write count; they never issued a phase authorization or touched Task Scheduler or services.

The host protocol regression, diagnostic identity regression, both new script syntax checks, targeted strict TypeScript check, and `git diff --check` also passed.

The regression's temporary emit wrote two disposable fixture files and removed the fixture afterward. This was not a real authorization or formal emit. It did not read or write formal Stage 8 paths, inspect or mutate Task Scheduler, inspect or mutate services, run diagnostics, or credit pilot games.

## Remaining publication gate

No real approval can be emitted from this candidate state. After a separate product decision publishes these five files, an external approval author must provide an exact input bound to that clean published commit and signer source identity. That future approval remains limited to host control and cannot authorize any downstream phase.
