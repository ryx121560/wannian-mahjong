# Game Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every P0-P2 and acceptance requirement in `docs/game-session-persistence-spec.md` so refresh restores a valid game exactly, invalid snapshots fall back to idle without resetting scores, and only bankruptcy resets all scores.

**Architecture:** Add a dependency-free browser module that owns snapshot versioning, serialization, validation, storage, and object-reference reconstruction. Keep lifecycle orchestration in the existing game HTML: it creates/restores `GS`, saves after state transitions, and schedules exactly one continuation based on restored phase. Continue using the existing score API as cumulative score persistence.

**Tech Stack:** Browser JavaScript, `localStorage`, existing Next.js score API, HTML5 Canvas. No new dependencies, database changes, or persistent unit-test files.

---

### Task 1: Establish the failing contract

**Files:**
- Read: `docs/game-session-persistence-spec.md`
- Read: `public/game/wannian-mahjong.html`

- [x] **Step 1: Confirm initialization violates section 8**

Verify the final initialization chain calls `newGame()` after loading scores, regardless of snapshot state.

- [x] **Step 2: Confirm snapshot capabilities are absent**

Verify there is no versioned game snapshot key, validator, restore path, phase continuation scheduler, or critical-action snapshot save.

Expected baseline: page load always deals a game and cannot restore a previous unfinished or ended state.

### Task 2: Build the versioned snapshot core

**Files:**
- Create: `public/game/session_snapshot.js`
- Modify: `public/game/wannian-mahjong.html`

- [x] **Step 1: Define the v1 schema contract**

Expose a frozen `window.GameSessionSnapshot` with `version`, `storageKey`, `create`, `validate`, `restore`, `load`, `save`, and `clear` APIs. Use the storage key `wannian_game_snapshot_v1` and support only version `1`; unsupported versions are invalidated.

- [x] **Step 2: Serialize only business state**

Store tile keys for wall, hands, melds, discards, player discard rows, last discard, and new drawn tile. Store players, scores, dealer/current player, turn, phase, action flags, response context, kong context, game log, last result, and total games. Do not store DOM, hot zones, timers, animation frames, or `selectedTile`.

- [x] **Step 3: Validate before restoration**

Require four complete players, finite scores, valid player indexes, supported phases, valid tile keys, valid arrays, and a supported version. Invalid JSON or schema data must be removed from storage and return a structured warning result.

- [x] **Step 4: Reconstruct tile identity**

Restore each tile through the existing `kt` factory. Rebind `newDrawnTile` to the matching hand object at `newDrawnIdx`, and rebind `lastDiscard` to the matching last discard-row object where possible.

### Task 3: Replace automatic new game with deterministic initialization

**Files:**
- Modify: `public/game/wannian-mahjong.html`

- [x] **Step 1: Add idle-state initialization**

Create four empty players using loaded cumulative scores, set phase to `idle`, render the empty board and buttons, and show `点击「新游戏」开始`. Do not shuffle or deal.

- [x] **Step 2: Restore a valid snapshot**

Apply restored business state, set global scores and total games from the snapshot, clear transient selection/animation/timers, render, update buttons and score UI, and display phase-appropriate status text.

- [x] **Step 3: Rewrite the page bootstrap**

After tile resources and cumulative scores load, call one initializer that either restores a valid snapshot or enters idle. The bootstrap must contain no direct or indirect automatic `newGame()` call.

- [x] **Step 4: Keep new game explicit**

The New Game button clears the previous snapshot, calls `newGame()`, preserves cumulative scores, and immediately saves the freshly dealt state. Self-play may continue calling `newGame()` through its existing explicit flow.

### Task 4: Save every critical state transition

**Files:**
- Modify: `public/game/wannian-mahjong.html`

- [x] **Step 1: Add resilient snapshot wrappers**

Add `saveGameSnapshot(reason)` and `clearGameSnapshot(reason)` wrappers. Failures log `[session snapshot]` with the action and reason but never throw into game flow.

- [x] **Step 2: Save draw and discard transitions**

Save after human/AI draw, after human/AI discard and response calculation, and after current player or phase changes.

- [x] **Step 3: Save calls and responses**

Save after pong, open kong, concealed/add kong, explicit pass, and response-context creation. Persist response type, responder, available actions, and candidate responses.

- [x] **Step 4: Save mode and terminal transitions**

Save after self-play identity/phase changes, win settlement, draw settlement, bankruptcy reset, and new-game deal completion.

### Task 5: Resume phases exactly once

**Files:**
- Modify: `public/game/wannian-mahjong.html`

- [x] **Step 1: Add a single-use restore scheduler**

Clear all transient timers and allow `resumeRestoredGame()` to run once per page initialization. Scheduled callbacks must re-check the current phase and player identity before changing state.

- [x] **Step 2: Resume drawing and discarding**

For AI `drawing`, schedule one `aiTurn`; for human `drawing`, schedule one restored draw; for AI `discarding`, schedule one `aiDiscard`; for human `discarding`, wait without scheduling.

- [x] **Step 3: Resume responding**

For a human responder, restore buttons and start a fresh 30-second timeout. For an AI win response, schedule one settlement. For AI pong/kong/pass candidates, schedule one `aiRespond` using the restored context.

- [x] **Step 4: Keep idle and ended inert**

Do not schedule actions for `idle` or `ended`. Ended restoration displays the prior result state and never calls settlement functions again.

### Task 6: Enforce score and bankruptcy rules

**Files:**
- Modify: `public/game/wannian-mahjong.html`

- [x] **Step 1: Centralize score synchronization**

Copy player scores to the global cumulative score array only after settlement. New games initialize players from this array and never replace it with `[100,100,100,100]`.

- [x] **Step 2: Reset both score sources only on bankruptcy**

When any score is `<= 0`, set the global score array and all four player scores to `100`, persist scores, save the ended snapshot, and show the bankrupt player message.

- [x] **Step 3: Preserve scores on invalid snapshot fallback**

Snapshot invalidation enters idle with scores returned by the score API. It must not invoke bankruptcy checks or default valid loaded scores to 100.

### Task 7: Verify the complete spec

**Files:**
- Test: temporary local VM/browser harness, removed after verification
- Test: `public/game/session_snapshot.js`
- Test: `public/game/wannian-mahjong.html`
- Modify: `docs/game-session-persistence-implementation-status.md`
- Modify: `README.md`

- [x] **Step 1: Run snapshot-core red/green checks**

Before implementation, verify the expected API is missing. After implementation, verify valid round-trip, unsupported version, malformed JSON, invalid players/indexes/phases/tiles/scores, new-drawn object identity, and last-discard restoration.

- [x] **Step 2: Run lifecycle acceptance checks**

Verify idle first visit, explicit new game, unfinished human turn refresh, cleared selection, consecutive refresh stability, ended refresh, invalid snapshot with preserved scores, and no bootstrap `newGame()`.

- [x] **Step 3: Run AI/response and anti-duplicate checks**

Verify restored AI drawing/discarding schedules one action, restored human and AI response stages continue once, and ended restoration never repeats settlement or total-game increments.

- [x] **Step 4: Run score-rule checks**

Verify normal settlement/new game/refresh retain scores, positive scores do not reset, bankruptcy resets both globals and players to 100, and invalid snapshots do not reset scores.

- [x] **Step 5: Run regression and production checks**

Run JS syntax checks, 20 standard AI cases, Next.js production build, HTTP 200 checks for home/game/snapshot core/rule core, and inspect runtime error logs. Restart the development server on port `18768` after the build.

- [x] **Step 6: Record requirement-level evidence**

Create a dedicated implementation-status document mapping sections 4-12 to current code and fresh verification output. Link it from README without conflating it with AI implementation status.

## Spec Coverage Matrix

| Spec requirement | Plan evidence |
| --- | --- |
| 4.1 首次访问 | Task 3 Step 1, Task 7 Step 2 |
| 4.2 刷新页面 | Task 3 Step 2, Task 5 Steps 1-3, Task 7 Step 2 |
| 4.3 已结束牌局刷新 | Task 5 Step 4, Task 7 Steps 2-3 |
| 4.4 点击新游戏 | Task 3 Step 4, Task 7 Step 2 |
| 4.5 破产重置 | Task 6 Steps 1-3, Task 7 Step 4 |
| 5 两层持久化方案 | Task 2, Task 6 |
| 6 游戏快照结构 | Task 2 Steps 1-4 |
| 7 保存时机 | Task 4 Steps 1-4 |
| 8 页面初始化流程 | Task 3 Steps 1-3 |
| 9 AI 与计时器恢复 | Task 5 Steps 1-4, Task 7 Step 3 |
| 10 数据校验与异常处理 | Task 2 Step 3, Task 6 Step 3, Task 7 Step 1 |
| 11.1 刷新恢复 | Task 7 Steps 2-3 |
| 11.2 新游戏 | Task 7 Step 2 |
| 11.3 积分 | Task 7 Step 4 |
| 11.4 防重复 | Task 5, Task 7 Step 3 |
| 12 P0/P1/P2 | Tasks 2-7 |
