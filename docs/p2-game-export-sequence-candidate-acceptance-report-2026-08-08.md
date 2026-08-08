# P2 Game Record Export Candidate Acceptance Report

Status: candidate only; not merged, pushed, or deployed.

## Scope

- Allocates a persistent positive `gameSequence` when a new game starts and stores it in the active game log and session snapshot.
- Exports through `POST /api/game/export` first. The server validates the record, chooses the filename, and writes only to the configured directory.
- Uses `万年麻将_第{gameSequence}局_{gameId}.json` for the first export and `_导出N` for later exports of the same game.
- Keeps browser download only as an explicit user-confirmed fallback after server export failure. It is not presented as a controlled-directory export.
- Requires production startup to receive matching absolute `GAME_EXPORT_DIR` and `APPROVED_GAME_EXPORT_DIR` values.

## Security Boundary

- Clients cannot select output paths. Top-level and nested `outputPath`, `filePath`, `directory`, and `exportDir` fields are rejected.
- Production rejects missing, relative, nonexistent, unwritable, or unapproved export directories.
- The server writes using a temporary file plus an atomic no-overwrite hard-link commit in the approved directory. Existing exports are never overwritten.
- Tests use only a disposable system temporary directory. This candidate did not inspect or write `C:\Users\Administrator\Desktop\workspace\json`.

## TDD Evidence

The initial `test:p2-game-export` run failed because the production export module did not exist. The implemented regression now covers directory approval, record validation, client path rejection, stable sequence filenames, duplicate exports, deterministic file contents, and real snapshot create/restore behavior. A legacy snapshot without `gameSequence` restores with a safe null default.

## Isolated End-to-End Evidence

`test:p2-game-export-e2e` starts the final Next standalone build on a randomly selected temporary port with only disposable temporary directories.

- A valid `POST /api/game/export` with matching approved environment values returns HTTP 201 and writes only `万年麻将_第41局_game-e2e-20260808-001.json` to the temporary approved directory.
- A second identical POST returns HTTP 201 with `_导出2`; the first file remains intact.
- Top-level and nested client path fields return HTTP 400 and create no file.
- Missing or mismatched approved-directory environment values return HTTP 503 and create no file.
- The test starts the standalone server directly and verifies it exits without leaving a listener or Node child process.

## Verification

- `npm.cmd run test:p2-game-export`
- `npm.cmd run test:p2-game-export-e2e` (after final production build)
- `npm.cmd run test:production-launch`
- `npm.cmd run test:response-phase`
- `npm.cmd run test:response-real-meld-context`
- `npm.cmd run test:response-restore-revalidation`
- `npm.cmd run test:p0-kong-page-persistence`
- `npm.cmd run test:rules` (472/472)
- `npm.cmd run test:recommendation` (100/100)
- `npx.cmd tsc --noEmit`
- `npm.cmd run verify:browser-rules`
- `npm.cmd run verify:recommendation`
- `npm.cmd run build`
- `git diff --check`

## Release Plan After Product Acceptance

1. Audit the latest `origin/main` and create a clean integration worktree.
2. Integrate only the P2 files and rerun the listed regressions.
3. Commit and push through the standard non-force release process.
4. Start the clean production worktree with `PORT=18768`, both approved RL weights variables, and matching explicit export-directory variables set to the approved desktop directory.
5. Verify only via HTTP; do not access browser storage.
