# P1 Topbar Score Settlement Summary Candidate

Status: candidate only; not merged, pushed, or deployed.

## Scope

- Keep `#bar` as the only visible top bar.
- Always render the four current totals in fixed seat order.
- Append one structured previous-settlement line only when `GS._lastResult.scoreDeltas` contains four finite values.
- The settlement line contains the winner or draw, the hu or kong-open type, and four per-seat deltas.
- Do not render turn, response, self-play, log, or recommendation text in `#bar`.

## Data Contract And Snapshot Compatibility

- Win, draw, and kong-open settlement paths now store explicit `scoreDeltas` in `GS._lastResult` from their existing trusted settlement inputs. A normal win freezes its delta before `persistSettledScores()` can apply a bankruptcy reset.
- `GameSessionSnapshot` already clones `lastResult` on create and restore, so the structured summary survives a safe snapshot refresh without a new storage slot.
- Older snapshots without `scoreDeltas` use the totals-only view. The UI does not infer deltas from log text or display text.
- A bankruptcy reset therefore updates current totals without replacing the completed round's zero-sum deltas in the summary.

## Layout

- The fixed top bar supports a stable two-line layout and remains input-transparent.
- The board and recommendation panel reserve additional top space for the second line.
- Desktop and narrow viewport assertions cover 1366x768, 1920x1080, 320x568, 375x667, and 390x844.

## Verification

- `npm.cmd run test:p1-statusbar`
- `npm.cmd run test:rules` (472 passed)
- `npm.cmd run test:recommendation` (100 passed)
- `npm.cmd run test:p0-kong-page-persistence`
- `npm.cmd run test:response-real-meld-context`
- `npm.cmd run test:response-restore-revalidation`
- `node_modules/.bin/tsc.cmd --noEmit`
- `npm.cmd run verify:browser-rules`
- `npm.cmd run verify:recommendation`
- `npm.cmd run build`
- `git diff --check`

Build-generated browser bundles and `tsconfig.tsbuildinfo` were restored or removed after verification and are excluded from this candidate.
