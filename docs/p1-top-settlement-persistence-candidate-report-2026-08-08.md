# P1 Top Settlement Persistence Candidate Report

Status: candidate only; not merged, pushed, or deployed.

## Scope

- Keeps the visible recent settlement independent from `GS._lastResult`, which remains current-game state.
- Persists only minimal structured settlement metadata after a trusted, zero-sum four-seat delta is available.
- New games and idle state keep the previous summary. A later trusted settlement replaces it.
- Session snapshots optionally carry the same minimal summary; old snapshots safely use totals-only display.

## Exclusions

- No changes to score calculation, score API, rule engine, AI, Stage8, P2 export, or browser storage outside the dedicated top-summary key.
- No access to 18768 or user browser data.

## Verification

- `npm.cmd run test:p1-top-settlement-persistence`
- `npm.cmd run test:p1-statusbar`
- `npm.cmd run test:response-phase`
- `npm.cmd run test:response-restore-revalidation`
- `npm.cmd run test:p0-kong-page-persistence`
- `npm.cmd run test:rules` (472/472)
- `npm.cmd run test:recommendation` (100/100)
- `npx.cmd tsc --noEmit`
- `npm.cmd run build`
