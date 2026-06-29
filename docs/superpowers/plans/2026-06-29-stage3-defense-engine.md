# Stage 3 Defense Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Stage 3 opponent modeling and defense system from `万年麻将阶段三PRD-对手建模与防守系统.md`, integrate it into `makeDecision()`, and verify it with at least 120 L2 defense cases.

**Architecture:** Keep the Stage 2 `makeDecision(state, config?)` interface unchanged and replace only the defense dimension. Add focused TypeScript modules in `src/game/strong-rule-ai/` for opponent modeling, safety evaluation, attack/defense state, special signals, and orchestration. Keep browser bundling compatible with the existing flat strong-rule-ai build pipeline.

**Tech Stack:** TypeScript source transpiled by existing scripts, Node.js regression runner, JSON L2 case fixtures, no new dependencies.

---

### File Structure

- Create: `src/game/strong-rule-ai/opponent-modeler.ts`
  - Builds `OpponentModel[]`, estimates hand distributions, tenpai probability, route, expected value, meld analysis, and discard quality.
- Create: `src/game/strong-rule-ai/safety-evaluator.ts`
  - Implements genpai, suji, kabe, outer tile, wildcard modifier, per-opponent aggregation, danger levels, and reasons.
- Create: `src/game/strong-rule-ai/attack-defense-fsm.ts`
  - Implements attack, half-fold, and full-fold state transitions from shanten, tenpai, opponent threat, score position, and turn.
- Create: `src/game/strong-rule-ai/defense-signal-processor.ts`
  - Applies WanNian-specific defense signals: meld threat, quanfeng danger, wildcard invalidation, dalan relaxation, terminal/honor pong risk, and pass records.
- Create: `src/game/strong-rule-ai/defense-engine.ts`
  - Orchestrates model building, safety evaluation, signal processing, FSM, final `defenseScore`, and reasoning.
- Modify: `src/game/strong-rule-ai/types.ts`
  - Add Stage 3 types: `OpponentModel`, `SafetyReason`, `SafetyEvaluation`, `AttackDefenseState`, `AttackDefenseStatus`, `DefenseResult`, and optional state fields for `passRecords`.
- Modify: `src/game/strong-rule-ai/ai-decision-engine.ts`
  - Replace `evaluateDefenseBasic` with `evaluateDefense`, increase default defense weight from `0.4` to `0.8`, preserve return interface, and expose defense metadata.
- Modify: `src/game/strong-rule-ai/phase-detector.ts`
  - Set phase defense weights to early `0.3`, middle `0.8`, late `1.5`.
- Modify: `src/game/strong-rule-ai/index.ts`
  - Export the new defense modules.
- Create: `scripts/generate-l2-defense-cases.mjs`
  - Generate exactly 120 deterministic defense cases across the 12 PRD categories.
- Modify: `scripts/strong-ai-regression.mjs`
  - Load both existing `docs/strong-rule-ai-l2-cases.json` and new defense cases, pass `allMelds` and `passRecords`, check `expectedState` when present, and enforce 200ms for defense cases.
- Create: `docs/strong-rule-ai-l2-defense-cases.json`
  - Generated L2 defense fixture set with target consistency `0.85`.
- Modify: `public/game/strong_rule_ai.js`
  - Regenerated browser AI bundle after TypeScript source changes.

### Task 1: Add Stage 3 Public Types

**Files:**
- Modify: `src/game/strong-rule-ai/types.ts`

- [ ] **Step 1: Extend state and candidate metadata**

Add optional `passRecords` to `StrongAIGameState`:

```typescript
passRecords?: { player: number; tile: Tile; round: number }[];
```

Add optional defense metadata to `CandidateScore.metadata`:

```typescript
defense?: DefenseResult;
```

Add optional defense summary to `AIDecision.metadata`:

```typescript
defenseState?: AttackDefenseStatus;
```

- [ ] **Step 2: Add PRD data structures**

Add these exported types after `DefenseBasicResult`:

```typescript
export type RouteType = 'unknown' | 'qingyise' | 'hunyise' | 'pengpeng' | 'dalan' | 'quanfeng' | 'pinghu';
export type AttackDefenseState = 'attack' | 'half-fold' | 'full-fold';
export type DangerLevel = 'safe' | 'low' | 'medium' | 'high' | 'extreme';
export type SafetyReasonType = 'genpai' | 'suji' | 'kabe' | 'outer' | 'unused' | 'wildcard-risk' | 'late-danger' | 'special-signal';

export interface OpponentModel {
  playerIndex: number;
  handDistribution: Map<Tile, number>;
  tenpaiProbability: number;
  tenpaiConfidence: number;
  predictedRoute: { type: RouteType; confidence: number; evidence: string[] };
  expectedHandValue: number;
  melds: Meld[];
  meldCount: number;
  discardAnalysis: {
    sequence: Tile[];
    qualityChange: 'stable' | 'improving' | 'dropping';
    suitDistribution: { wan: number; tiao: number; tong: number; honor: number };
  };
}

export interface SafetyReason {
  type: SafetyReasonType;
  description: string;
  weight: number;
  perOpponent: { playerIndex: number; contribution: number }[];
}

export interface SafetyEvaluation {
  tile: Tile;
  safetyScore: number;
  dangerLevel: DangerLevel;
  reasons: SafetyReason[];
}

export interface AttackDefenseStatus {
  state: AttackDefenseState;
  reasoning: string;
  factors: {
    selfTenpai: boolean;
    selfShanten: number;
    maxOpponentTenpaiProb: number;
    scorePosition: 'bigLead' | 'smallLead' | 'even' | 'smallBehind' | 'bigBehind';
    turn: number;
  };
  offenseWeight: number;
  defenseWeight: number;
}

export interface DefenseResult {
  safetyPerTile: Map<Tile, SafetyEvaluation>;
  opponentModels: OpponentModel[];
  state: AttackDefenseStatus;
  defenseScore: number;
  reasoning: string;
}
```

- [ ] **Step 3: Run TypeScript syntax check through existing regression compile**

Run: `npm.cmd run test:strong-ai -- --category never-match --report json`

Expected: Command compiles strong-rule-ai and returns zero cases without TypeScript syntax errors.

### Task 2: Implement Opponent Modeling

**Files:**
- Create: `src/game/strong-rule-ai/opponent-modeler.ts`

- [ ] **Step 1: Implement discard analysis helpers**

Use existing helpers from `utils.ts` and rule tile helpers:

```typescript
import { isHonor, isNumberTile, tileSuit, tileValue } from '../rules';
import type { Meld, OpponentModel, RouteType, StrongAIGameState, Tile } from './types';
import { allTileKeys, clamp, getPlayerHand, remainingCount, roundScore } from './utils';
```

Implement:
- `analyzeDiscards(opponentIndex, state)`
- `estimateDiscardQuality(sequence)`
- `countDiscardSuits(sequence)`
- `hasWildcardAbility(melds)`

Discard quality rule:
- Last 3 discards containing central number tiles `4/5/6` after turn 7 means `dropping`.
- Last 3 discards mostly terminals/honors means `improving`.
- Otherwise `stable`.

- [ ] **Step 2: Implement `estimateHandDistribution`**

Algorithm:
- Start from `remainingCount(state, tile, ownHand) / unknownTileTotal`.
- If opponent discarded the exact tile, set probability near `0`.
- If opponent discarded the same suit, multiply that suit by `0.5`.
- If a suit appears under 20% in discards and opponent has a meld in that suit, multiply that suit by `1.4`.
- If tile was discarded by current player and opponent did not call a matching pong/kong, multiply by `0.3`.
- Normalize so the sum equals estimated concealed hand size `13 - meldTileCount`.

- [ ] **Step 3: Implement `estimateTenpaiProbability`**

Use the exact PRD table:
- `meldCount >= 3`: `0.90`
- `meldCount === 2 && turn >= 13`: `0.85`
- `meldCount === 2 && turn >= 7`: `0.65`
- `meldCount === 1 && turn < 7`: `0.20`
- `meldCount === 1 && turn <= 12`: `0.45`
- `meldCount === 1`: `0.75`
- `meldCount === 0 && turn < 7`: `0.05`
- `meldCount === 0 && turn <= 12`: `0.15`
- otherwise `0.35`

Then add `+0.2` for `dropping`, `-0.1` for `improving`, clamp to `0..1`, and set confidence `0.3..0.9` based on meld count and turn.

- [ ] **Step 4: Implement `predictRoute`**

Route priority:
1. `quanfeng`: no number discards and honor meld or many honor discards, expected value `16`.
2. `qingyise`: one number suit below 10% in discards and meld in that suit, expected value `4`.
3. `hunyise`: one number suit below 20% plus honor meld, expected value `2`.
4. `pengpeng`: two or more pong/kong melds and no chi meld, expected value `2`.
5. `dalan`: discards span at least 3 groups and few honors kept, expected value `1`.
6. `pinghu`: default with confidence `0.3`, expected value `1`.
7. `unknown`: insufficient early data with confidence `0.1`, expected value `2`.

- [ ] **Step 5: Export `buildOpponentModels`**

For each player except `currentPlayer`, return a full `OpponentModel`.

Expected behavior:
- Exactly 3 models in a 4-player game.
- No random values.
- All probabilities clamped and rounded.

### Task 3: Implement Safety Evaluator

**Files:**
- Create: `src/game/strong-rule-ai/safety-evaluator.ts`

- [ ] **Step 1: Implement basic checkers**

Exports:

```typescript
export function checkGenpai(tile: Tile, opponentIndex: number, state: StrongAIGameState): SafetySignal
export function checkSuji(tile: Tile, opponentIndex: number, state: StrongAIGameState): SafetySignal
export function checkKabe(tile: Tile, state: StrongAIGameState): SafetySignal
export function checkOuterTile(tile: Tile, opponent: OpponentModel): SafetySignal
export function applyWildcardModifier(signal: SafetySignal, opponent: OpponentModel): SafetySignal
export function evaluateSafety(tile: Tile, state: StrongAIGameState, opponentModels: OpponentModel[]): SafetyEvaluation
```

Use an internal `SafetySignal`:

```typescript
interface SafetySignal {
  type: SafetyReasonType;
  contribution: number;
  description: string;
}
```

- [ ] **Step 2: Implement PRD safety values**

Rules:
- Genpai: `+0.8`, downgraded to `+0.4` if opponent has kong/zhichan capability.
- Suji: complete `+0.5`, half `+0.3`, then multiply by `0.8` because WanNian has no chow.
- Kabe: visible 4 protects related tiles by `+0.4`.
- Outer: route mismatch gives `+0.3`.
- Unused: opponent discarded tile and did not call it gives `+0.2`.
- Late danger: unrevealed tile and turn `>= 13` gives `-0.2`.

- [ ] **Step 3: Aggregate with opponent tenpai probability**

For each opponent:
- Pick the strongest positive safety signal.
- Include late danger if no positive signal exists.
- Apply wildcard modifier per signal.

Aggregate:

```typescript
const risk = opponentModels.reduce((sum, opponent) => {
  const opponentSafety = perOpponentSafety.get(opponent.playerIndex) || 0;
  return sum + opponent.tenpaiProbability * (1 - opponentSafety);
}, 0);
const safetyScore = clamp(1 - risk, 0, 1);
```

Map danger levels:
- `>=0.8`: `safe`
- `>=0.5`: `low`
- `>=0.3`: `medium`
- `>=0.1`: `high`
- otherwise `extreme`

### Task 4: Implement Attack/Defense FSM

**Files:**
- Create: `src/game/strong-rule-ai/attack-defense-fsm.ts`

- [ ] **Step 1: Implement `determineState`**

Inputs match the PRD and use existing `analyzePosition(scores, currentPlayer)`.

Priority:
1. If `selfTenpai` or `position === 'bigBehind'`, return `attack`, offense `1.5`, defense `0.3`.
2. If `maxOppTenpai > 0.7 && selfShanten >= 3 && position in ['bigLead', 'smallLead']`, return `full-fold`, offense `0.2`, defense `2.0`.
3. If `maxOppTenpai > 0.5 && selfShanten >= 2`, return `half-fold`, offense `0.7`, defense `1.0`.
4. Return default `attack`, offense `1.0`, defense `1.0`.

### Task 5: Implement Special Signal Processor

**Files:**
- Create: `src/game/strong-rule-ai/defense-signal-processor.ts`

- [ ] **Step 1: Implement `processSpecialSignals`**

Inputs:

```typescript
export function processSpecialSignals(
  tile: Tile,
  state: StrongAIGameState,
  opponentModels: OpponentModel[],
  baseSafety: SafetyEvaluation
): { modifiedSafety: number; signals: string[] }
```

Rules:
- Opponent melds with related suit: `safety * 0.7`.
- `quanfeng`: honor tile `safety * 0.3`, number tile `safety * 1.1`.
- Wildcard ability: add signal text, core downgrade already handled in safety evaluator.
- `dalan`: `safety * 1.2`.
- `pengpeng` with terminal/honor candidate: `safety * 0.5`.
- `passRecords` for same player/tile/current turn: `safety + 0.3`.

Clamp final safety to `0..1`.

### Task 6: Implement Defense Engine and AI Integration

**Files:**
- Create: `src/game/strong-rule-ai/defense-engine.ts`
- Modify: `src/game/strong-rule-ai/ai-decision-engine.ts`
- Modify: `src/game/strong-rule-ai/phase-detector.ts`
- Modify: `src/game/strong-rule-ai/index.ts`

- [ ] **Step 1: Implement `evaluateDefense`**

Flow:
1. Build opponent models.
2. Evaluate candidate tile safety.
3. Process special signals.
4. Determine FSM state from `getShanten`, `checkTenpai`, `getPlayerHand`, and `getPlayerMelds`.
5. Calculate:

```typescript
let defenseScore = (modifiedSafety - 1.0) * fsmState.defenseWeight;
if (fsmState.state === 'attack') defenseScore *= 0.3;
if (fsmState.state === 'full-fold') defenseScore *= 1.5;
defenseScore = clamp(defenseScore, -2, 0);
```

6. Return `DefenseResult` with a `Map` containing the candidate tile safety.

- [ ] **Step 2: Replace Stage 2 defense-basic in `ai-decision-engine.ts`**

Change import:

```typescript
import { evaluateDefense } from './defense-engine';
```

Change default weight:

```typescript
defense: 0.8
```

Change candidate scoring:

```typescript
const defense = evaluateDefense(state, tile, currentPlayer);
```

Add candidate metadata:

```typescript
defense,
```

Add decision metadata:

```typescript
defenseState: selected.metadata.defense?.state,
```

- [ ] **Step 3: Adjust phase weights**

In `phase-detector.ts`, set defense weights:
- early `0.3`
- middle `0.8`
- late `1.5`

- [ ] **Step 4: Export modules**

In `index.ts`, export:

```typescript
export * from './opponent-modeler';
export * from './safety-evaluator';
export * from './attack-defense-fsm';
export * from './defense-signal-processor';
export * from './defense-engine';
```

### Task 7: Add 120 L2 Defense Cases

**Files:**
- Create: `scripts/generate-l2-defense-cases.mjs`
- Create: `docs/strong-rule-ai-l2-defense-cases.json`

- [ ] **Step 1: Create deterministic generator**

Generate cases by category:
- `defense-genpai`: 15
- `defense-suji`: 15
- `defense-kabe`: 10
- `defense-outer`: 10
- `defense-wildcard`: 15
- `defense-fsm`: 15
- `defense-quanfeng`: 10
- `defense-dalan`: 5
- `defense-pass`: 5
- `defense-late`: 10
- `defense-lead`: 5
- `defense-behind`: 5

Each case must include:
- `id`
- `level: "L2"`
- `category`
- `description`
- `hand`
- `melds`
- `discards`
- `allMelds`
- `scores`
- `turn`
- `currentPlayer`
- `dealer`
- `wallRemaining`
- `passRecords`
- `expected.bestDiscard`
- `expected.unacceptableDiscards`
- `expected.expectedState`
- `expected.reasoningKeywords`

- [ ] **Step 2: Generate fixture**

Run:

```powershell
node scripts/generate-l2-defense-cases.mjs
```

Expected:
- `docs/strong-rule-ai-l2-defense-cases.json` exists.
- `cases.length === 120`.
- Category counts match the PRD table.

### Task 8: Extend Strong AI Regression Runner

**Files:**
- Modify: `scripts/strong-ai-regression.mjs`

- [ ] **Step 1: Load both case files**

Load:
- `docs/strong-rule-ai-l2-cases.json`
- `docs/strong-rule-ai-l2-defense-cases.json` when it exists

Merge `cases` and use the max target consistency requirement from loaded files.

- [ ] **Step 2: Pass defense-specific state fields**

When building state:

```javascript
melds: testCase.allMelds || [testCase.melds || [], [], [], []],
passRecords: testCase.passRecords || [],
```

- [ ] **Step 3: Validate `expectedState`**

If `testCase.expected.expectedState` exists, compare it with:

```javascript
decision.metadata?.defenseState?.state
```

- [ ] **Step 4: Enforce defense latency**

For categories beginning with `defense-`, require decision duration `<= 200ms`. Keep existing `<= 500ms` for older Stage 2 cases.

### Task 9: Verify, Rebuild Browser Bundle, and Ask Before Push

**Files:**
- Modify: `public/game/strong_rule_ai.js`

- [ ] **Step 1: Run L2 generator**

Run:

```powershell
node scripts/generate-l2-defense-cases.mjs
```

- [ ] **Step 2: Run strong AI regression**

Run:

```powershell
npm.cmd run test:strong-ai -- --report json
```

Expected:
- Existing Stage 2 cases still pass target.
- Defense case consistency is at least 85%.
- No defense case latency above 200ms.

- [ ] **Step 3: Verify browser AI bundle**

Run:

```powershell
npm.cmd run verify:strong-ai
```

Expected: browser bundle builds and exports `makeDecision`.

- [ ] **Step 4: Run rule regression**

Run:

```powershell
npm.cmd run test:rules -- --level L1 --report json
```

Expected: all L1 rule cases pass.

- [ ] **Step 5: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected: Next.js build succeeds.

- [ ] **Step 6: Report scope and ask before push**

Report:
- Modified files.
- Verification commands and pass/fail evidence.
- Any PRD requirement intentionally deferred or adapted.

Then ask:

```text
自测核验已完成。是否需要我提交并 push 到 GitHub？
```
