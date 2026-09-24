# Stage 8 Windows Task control approval input candidate

Date: 2026-09-16  
Status: candidate only; uncommitted and unpublished

## Outcome

The product-authorized `stage8-windows-task-host-control` approval input was generated only in memory and immediately passed to the published signer's `--check` interface. The check ran twice and produced byte-identical sanitized results. No identity bundle, approval input, host control, or evidence file was persisted.

The published signer did not already contain an approval-input generator. This candidate therefore adds a separate check-only builder. It requires an explicit product gate and an exact-schema decision that fixes the single control scope, the published signer/runtime/diagnostic identity, and `false` for all five downstream phase authorizations.

## Authoritative bindings

- Signer release: `5a2c0bd302f09c94881a4b717644b117a8091a98`.
- Runtime release: `fae72b67b297672960d49361e6252c7e022d9040`.
- Diagnostic identity SHA-256: `d4166d519f323f289faec84ff53b87a24aa5798af5e16fd16bc3a765997075fd`.
- Host: `stage8-disposable-diagnostic-20260916`.
- Target: `stage8-disposable-diagnostic-20260916-diagnostic`.
- Task: `Stage8-Host-stage8-disposable-diagnostic-20260916`.
- Scope: `stage8-windows-task-host-control` only.
- Signer CLI SHA-256: `0ae259f975596b42ddbe089d8fd7fca5358fe12d057d5d8a626632b0e046b483`.
- Signer core SHA-256: `6deb3d60a1e3a308e73402fed8b33c398dce6b7753830d31845cf7ca57a0d49a`.
- Signer source bundle SHA-256: `22c326b4dae937f851aba374815996d1db59f1509b3f8a213174f33fc914d5c3`.

The signer source hashes are fixed expectations, not merely hashes of whichever bytes are currently readable. Clean-commit checks and byte checks must both pass.

## Formal check result

- Product decision SHA-256: `95b907c78516a20e43669f94082841dc59832d0e676e26e3a45f5f22aaa6fe92`.
- Control template SHA-256: `71cb438ca6c0a4016f934fb43c4b838c046fe2959c6549b840b1bdfe85e55da8`.
- Approval ID: `stage8-windows-task-control-c445f54579f61216a535b3c7e0a2221c0d2e58f8`.
- Authorization input SHA-256: `8ef76eead825b25aa3cbf749a4933722ab82c0fde514bbec477b4c266dc92de8`.
- In-memory control manifest SHA-256: `6649c4ae0fa36a0acfccd70aec514e6f2624ea8fe5dbf6760f48fcdc25b788f9`.
- In-memory evidence SHA-256: `a9ed4714d6c4f2f1de08be72cbedf5c5221d984227fecd1bdc248e0cd3f702b9`.
- Formal check identity SHA-256: `dde7352721f8629a9b2fae44ab73e6c44b7f0e5f746df4e6889b1575fd703710`.
- Repeated check byte-identical: true.

Side-effect counters:

- `filesWritten=0`
- `phaseAuthorizationsIssued=0`
- `scheduledTasksRead=0`
- `scheduledTasksMutated=0`
- `servicesRead=0`
- `servicesMutated=0`
- `targetRootReads=0`
- `formalPathsRead=0`
- `formalPilotGamesCredited=0`

The first sandboxed attempt fused before checkout inspection because child Git was denied. The first elevated attempt fused during source reads because the allowlist initially classified the explicitly bound Node executable as a formal path. Both failures reported all counters as zero. The allowlist was corrected to admit exact bound paths before rejecting any other formal path; the successful formal check then produced the hashes above.

## Candidate files

1. `package.json`
2. `src/game/stage8/offline-windows-task-control-approval-input.ts`
3. `scripts/stage8-windows-task-control-approval-input.mjs`
4. `scripts/stage8-windows-task-control-approval-input-regression.mjs`
5. `docs/stage8-windows-task-control-approval-input-candidate-report-2026-09-16.md`

## Failure controls

Regression fixtures use only an isolated OS-temporary tree. They cover wrong or dirty signer commit, signer source-byte drift, diagnostic identity/control template/host/target/task/runtime/output-root drift, old Pilot identifiers, extra scope, any of the five phase authorizations, missing/additional fields, and decision/input hash or approval-ID drift. Every case fails closed.

The CLI reads only the explicitly bound Node executable, four runtime source files, and two signer source files. Any target-root read, non-allowlisted formal path, or non-allowlisted checkout is rejected. The production command exposes only `--check`; it has no emit or verify mode.

## Not authorized or executed

- No real `--emit` or `--verify` output.
- No persisted approval input, host control, evidence, task XML, or phase authorization.
- No `materials-emit`, `register`, `run`, `verify`, or `delete` authority.
- No Task Scheduler or service read/mutation.
- No diagnostic, Pilot, training, Smoke, selfplay, replay, or model execution.
- No deployment, port 18768 operation, or user-data access.
