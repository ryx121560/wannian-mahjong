# Stage 8 Windows Task control approval orchestrator candidate

Date: 2026-09-16
Status: candidate only; uncommitted, unpublished, and no formal emit performed

## Capability audit

The published primitives at `ff57f3601f5bd5ca740a6c4f9e60df3275502387` were individually safe but did not provide a complete in-memory orchestration entry point. The approval-input CLI returned only a sanitized check summary, while the signer required the identity bundle and approval input to be supplied by its caller. A caller therefore could not safely compose build, atomic emit, and verify without reimplementing material generation or persisting sensitive inputs.

This candidate exposes the existing gated in-memory material builder to same-process callers and adds one orchestrator with only two modes:

- `--check`: build the unique control-only materials in memory and call the published signer check interface.
- `--emit-and-verify`: require a separate orchestrator emit gate, build the same materials in memory, call the published signer's atomic emit, then immediately call its validator against the exact output root.

There is no emit-only or verify-only orchestrator mode. The identity bundle and approval input are never written by the orchestrator.

## Fixed output and authority boundary

The future production output root remains the exact OS-temporary location:

`%TEMP%\WannianMahjong\Stage8\stage8-disposable-diagnostic-20260916\control-approval`

Successful emit permits exactly:

1. `host-control.json`
2. `control-approval-evidence.json`

The only authorization scope is `stage8-windows-task-host-control`. The diagnostic bundle's five signing requests remain unsigned: `materials-emit`, `register`, `run`, `verify`, and `delete` each retain `approval=null`, and orchestration results fix `phaseAuthorizationsIssued=0`.

## Formal zero-write check

The candidate orchestrator was run only in `--check` mode against the clean published runtime and signer roots. The orchestrator emit gate was explicitly absent.

- Identity SHA-256: `d4166d519f323f289faec84ff53b87a24aa5798af5e16fd16bc3a765997075fd`.
- Control template SHA-256: `71cb438ca6c0a4016f934fb43c4b838c046fe2959c6549b840b1bdfe85e55da8`.
- Signer release: `5a2c0bd302f09c94881a4b717644b117a8091a98`.
- Signer source bundle SHA-256: `22c326b4dae937f851aba374815996d1db59f1509b3f8a213174f33fc914d5c3`.
- Product decision SHA-256: `95b907c78516a20e43669f94082841dc59832d0e676e26e3a45f5f22aaa6fe92`.
- Approval ID: `stage8-windows-task-control-c445f54579f61216a535b3c7e0a2221c0d2e58f8`.
- Authorization input SHA-256: `8ef76eead825b25aa3cbf749a4933722ab82c0fde514bbec477b4c266dc92de8`.
- In-memory control manifest SHA-256: `6649c4ae0fa36a0acfccd70aec514e6f2624ea8fe5dbf6760f48fcdc25b788f9`.
- In-memory evidence SHA-256: `a9ed4714d6c4f2f1de08be72cbedf5c5221d984227fecd1bdc248e0cd3f702b9`.

Formal check counters:

- `filesWritten=0`
- `filesVerified=0`
- `identityBundlesPersisted=0`
- `approvalInputsPersisted=0`
- `phaseAuthorizationsIssued=0`
- `scheduledTasksRead=0`
- `scheduledTasksMutated=0`
- `servicesRead=0`
- `servicesMutated=0`
- `targetRootReadsDuringBuild=0`
- `formalPathsRead=0`
- `formalPilotGamesCredited=0`

## Temporary regression evidence

The dedicated regression used only an isolated OS-temporary fixture. It successfully exercised in-memory build, atomic emit, and immediate verify, then confirmed exactly two output files, no `.partial`, matching control/evidence hashes, no persisted identity bundle or approval input, and zero phase authorizations. The fixture was removed in `finally`.

RED coverage includes missing product gate, missing orchestrator emit gate, unsupported emit-only mode, duplicate output without mutation, and verify rejection after injecting a third unexpected file. Verify failure evidence reports the historical two writes and the actual three remaining files; it does not delete or disguise the emitted evidence.

## Candidate files

1. `package.json`
2. `scripts/stage8-windows-task-control-approval-input.mjs`
3. `scripts/stage8-windows-task-control-orchestrator.mjs`
4. `scripts/stage8-windows-task-control-orchestrator-regression.mjs`
5. `docs/stage8-windows-task-control-orchestrator-candidate-report-2026-09-16.md`

## Not authorized or executed

- No formal `--emit-and-verify` execution.
- No formal output-root or `.partial` creation, read, or mutation.
- No persisted identity bundle or approval input.
- No phase authorization issuance.
- No Task Scheduler or service read/mutation.
- No task XML generation.
- No diagnostic, Pilot, training, Smoke, selfplay, replay, or model execution.
- No deployment, port 18768 operation, or user-data access.
