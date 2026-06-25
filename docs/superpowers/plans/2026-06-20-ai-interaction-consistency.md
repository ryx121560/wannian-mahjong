# AI Interaction Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/ai-interaction-consistency-spec.md` in its required P0-P4 order, beginning with object-identity-based player selection and ending with full interaction and AI regression evidence.

**Architecture:** Keep `aiChooseDiscard` and `aiRespond` as the existing runtime AI entrypoints. Replace the player UI's display-index selection contract with a `selectedTile` object reference, and validate that reference at every render and analysis boundary. Reuse the existing AI rule core, decision log, standard cases, and defense model for P1-P4 instead of duplicating them.

**Tech Stack:** Existing HTML5 Canvas game runtime, browser JavaScript, Next.js 15 host, existing browser acceptance harness. No new dependencies.

---

### Task 1: Establish the P0 failing baseline

**Files:**
- Read: `docs/ai-interaction-consistency-spec.md`
- Read: `public/game/wannian-mahjong.html`
- Test: live page at `/game/wannian-mahjong.html`

- [x] **Step 1: Reproduce the display-index mismatch**

Open an active human discard turn, click the left-most sorted tile, and compare the lifted tile with the `弃 X` line in the suggestion panel.

- [x] **Step 2: Verify the failure is caused by mixed index semantics**

Confirm that `render()` stores sorted display index in `GS.selected`, while `updateSuggestion()` reads the same index from `effectiveHand(0)`.

Expected baseline: the lifted tile and click-analysis tile can differ.

### Task 2: Replace display-index selection with object identity

**Files:**
- Modify: `public/game/wannian-mahjong.html`

- [x] **Step 1: Define the selected object state and helpers**

Add `selectedTile:null` to `GS`. Add helpers that clear selection and return the selected tile only when the exact object is still present in the current human hand.

- [x] **Step 2: Render selection by object identity**

Use `GS.selectedTile===tile` for ordinary and newly drawn tiles. Keep hot-zone indices as layout metadata only.

- [x] **Step 3: Select and discard the hot-zone tile object**

On first click, store `z.t`. On second click of the same object, pass that object into `doDiscard`. Remove tile-key fallback removal so duplicate tiles cannot substitute for the selected object.

- [x] **Step 4: Analyze the selected object**

Build click analysis from the exact `selectedTile` reference and remove only that object from the simulated hand. Render it under a distinct `点击分析：` label while preserving the independent `系统推荐：` result.

### Task 3: Enforce selection lifecycle cleanup

**Files:**
- Modify: `public/game/wannian-mahjong.html`

- [x] **Step 1: Clear selection on discard, turn change, and new game**

Call the shared clear helper from `doDiscard`, `nextTurn`, `doDraw`, and `newGame`.

- [x] **Step 2: Clear selection after hand-structure changes**

Call the helper from `doPong`, `doKong`, `doSelfKong`, `applyWin`, and `drawGame` before rendering or updating suggestions.

- [x] **Step 3: Clear selection when self-play changes mode**

Clear selection on both self-play enable and disable paths.

- [x] **Step 4: Ignore stale references defensively**

Have render and suggestion boundaries clear a selected object that is no longer present in the active human hand.

### Task 4: Verify P1-P4 remain unified

**Files:**
- Read: `public/game/wannian-mahjong.html`
- Read: `public/game/ai/rule_core.js`
- Read: `docs/ai-standard-cases.json`
- Modify: `docs/ai-discard-implementation-status.md`

- [x] **Step 1: Verify runtime entrypoints**

Confirm one `aiChooseDiscard` definition, one `aiRespond` definition, active entry audit, and ordinary MCTS/RL defaults set to `false`.

- [x] **Step 2: Verify shared evaluation and explanations**

Confirm player recommendations and AI discards both use the same rule evaluation path and that decision logs contain shanten, candidates, defense score, and final reason.

- [x] **Step 3: Run all 20 standard AI cases**

Expected result: `20/20` with no failed case IDs.

- [x] **Step 4: Update implementation evidence**

Record P0 interaction evidence separately from the existing AI-discard P0-P4 evidence so the two specs cannot be conflated again.

### Task 5: Final verification

**Files:**
- Test: `public/game/wannian-mahjong.html`
- Test: `public/game/ai/rule_core.js`
- Test: Next.js production build

- [x] **Step 1: Run P0 browser acceptance scenarios**

Verify ordinary tile, new-drawn tile, duplicate tile identity, sorted consecutive selection, second-click discard, turn cleanup, pong/kong/win cleanup, and self-play cleanup.

- [x] **Step 2: Run syntax checks**

Run `node --check public/game/ai/rule_core.js` and parse every inline script in the HTML with `vm.Script`.

- [x] **Step 3: Run production build**

Run `npm.cmd run build` only after stopping the dev server, then restart the server on port `18768`.

- [x] **Step 4: Verify HTTP endpoints**

Require HTTP 200 from `/`, `/game/wannian-mahjong.html`, and `/game/ai/rule_core.js`.
