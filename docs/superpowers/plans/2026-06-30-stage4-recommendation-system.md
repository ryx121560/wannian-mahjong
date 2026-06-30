# Stage 4 Recommendation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Stage 4 AI recommendation foundation from `万年麻将阶段四PRD-AI推荐系统基础能力-codex.md`, using option B: extract a browser recommendation module and wire it into the current game runtime.

**Architecture:** Add `src/game/recommendation/recommendation-engine.ts` as the product-facing recommendation layer. It consumes the existing HTML runtime state snapshot, strong-rule AI decision output, public discard/meld information, and response-action flags, then returns structured sections for the long recommendation panel and a durable per-game recommendation record. Add a browser bundle `public/game/recommendation_engine.js`, load it before the main HTML script, and keep `public/game/wannian-mahjong.html` responsible only for state extraction, rendering, event hooks, and persistence.

**Tech Stack:** Existing TypeScript transpilation, browser IIFE bundle, localStorage, existing rule/strong-rule AI bundles, Node.js verification scripts, no new dependencies, no database changes.

---

### File Structure

- Create: `src/game/recommendation/recommendation-engine.ts`
  - Exports `buildDiscardRecommendation`, `buildClickAnalysis`, `buildRiverAnalysis`, `buildAiDiscardInterpretation`, `buildResponseRecommendation`, `buildRoundReview`, `buildGameSummary`, `createRecommendationRecord`, and `buildPanelHtml`.
- Create: `scripts/build-browser-recommendation-engine.mjs`
  - Transpiles the recommendation TypeScript module to `public/game/recommendation_engine.js`.
- Modify: `package.json`
  - Add the recommendation bundle build to `predev` and `prebuild`.
- Modify: `public/game/wannian-mahjong.html`
  - Load `recommendation_engine.js`.
  - Replace the current monolithic suggestion HTML path with calls to `WannianRecommendationEngine`.
  - Keep system recommendation stable while selected-tile click analysis changes.
  - Add same-tile public highlight and remaining-count rendering.
  - Record active recommendations, responses, AI interpretations, round reviews, and game summaries into the existing game log.
- Create: `scripts/generate-stage4-recommendation-cases.mjs`
  - Generates 100 deterministic Stage 4 recommendation cases matching the PRD distribution.
- Create: `docs/stage4-recommendation-cases.json`
  - Generated fixture file.
- Create: `scripts/stage4-recommendation-regression.mjs`
  - Loads the browser module logic in Node-compatible mode and validates section presence, system/click separation, public-only analysis, response coverage, and summary fields.
- Modify: `package.json`
  - Add `test:recommendation`.
- Create: `docs/stage4-recommendation-acceptance-report.md`
  - Records PRD requirement mapping and fresh verification evidence.

### Task 1: Recommendation Engine Contract

**Files:**
- Create: `src/game/recommendation/recommendation-engine.ts`

- [ ] **Step 1: Define input and output shapes**

Create plain TypeScript interfaces:

```typescript
export interface TileView { key: string; label: string; suit?: string; value?: number; isHonor?: boolean }
export interface CandidateView {
  tile: string;
  tileLabel: string;
  totalScore: number;
  shantenAfter: number;
  route: string;
  speedScore?: number;
  handValueScore?: number;
  waitQualityScore?: number;
  kongZhichanScore?: number;
  dalanRouteScore?: number;
  defenseScore?: number;
  positionAdjustment?: number;
  structurePenalty?: number;
  waitCount?: number;
  waitRemaining?: number;
  waitTiles?: { tile: string; remaining: number }[];
  breaksMeld?: boolean;
  breaksPair?: boolean;
  breaksTaatsu?: boolean;
}
export interface RecommendationContext {
  turn: number;
  phaseLabel: string;
  currentPlayer: number;
  hand: string[];
  handLabels: Record<string, string>;
  selectedTile?: string | null;
  systemRecommendation?: CandidateView | null;
  candidates: CandidateView[];
  discards: string[][];
  melds: { player: number; tile: string; count: number; type?: string }[];
  scores: number[];
  aiLastDiscard?: { player: number; playerName: string; tile: string; tileLabel: string } | null;
  responseEvent?: { fromPlayer: number; fromName: string; tile: string; tileLabel: string; actions: string[] } | null;
  previousRound?: RecommendationRecord | null;
}
export interface RecommendationRecord {
  id: string;
  type: 'discard' | 'response' | 'ai-discard' | 'round-review' | 'summary';
  turn: number;
  confidence: '高' | '中' | '低';
  recommendedAction: string;
  actualAction?: string | null;
  adopted?: boolean | null;
  strategyGap?: string;
  reasons: string[];
  sections: RecommendationSection[];
}
export interface RecommendationSection { title: string; html: string; text: string }
export interface RecommendationPanel { sections: RecommendationSection[]; records: RecommendationRecord[]; selectedTileKey?: string | null }
```

- [ ] **Step 2: Implement scoring helpers**

Implement:
- `toDisplayScore(value, min, max)` maps internal score to `0..100`.
- `confidenceFor(candidates)` returns high when first-best gap is >= 8, medium when >= 3, else low.
- `candidateTag(candidate, index)` returns one of PRD tags: 推荐, 可选, 一般, 不建议, 危险, 破坏结构, 防守优先.
- `countVisible(tile, context)` counts only public discards/melds plus own hand count.

- [ ] **Step 3: Implement section builders**

Functions must return PRD section titles exactly:
1. `一、系统推荐`
2. `二、详细推荐理由`
3. `三、候选牌排序原因`
4. `四、点击分析`
5. `五、同牌高亮与剩余枚数`
6. `六、牌河与对手分析`
7. `七、AI 玩家出牌解读`
8. `八、响应阶段推荐`
9. `九、本轮推荐复盘`
10. `十、本局推荐总结`

Every section should include readable Chinese text and no raw field names like `speedScore`.

### Task 2: Browser Bundle

**Files:**
- Create: `scripts/build-browser-recommendation-engine.mjs`
- Modify: `package.json`
- Modify: `public/game/wannian-mahjong.html`

- [ ] **Step 1: Add bundle script**

Create an IIFE bundle writer that compiles `src/game/recommendation/recommendation-engine.ts` and assigns:

```javascript
global.WannianRecommendationEngine = module.exports;
```

- [ ] **Step 2: Add package scripts**

Update:

```json
"predev": "node scripts/build-browser-rule-engine.mjs && node scripts/build-browser-strong-rule-ai.mjs && node scripts/build-browser-recommendation-engine.mjs",
"prebuild": "node scripts/build-browser-rule-engine.mjs && node scripts/build-browser-strong-rule-ai.mjs && node scripts/build-browser-recommendation-engine.mjs && node scripts/clean-next-cache.mjs",
"verify:recommendation": "node scripts/build-browser-recommendation-engine.mjs && node scripts/verify-browser-recommendation-engine.mjs",
"test:recommendation": "node scripts/stage4-recommendation-regression.mjs"
```

- [ ] **Step 3: Load bundle in HTML**

Add:

```html
<script src="recommendation_engine.js"></script>
```

Require it in the runtime:

```javascript
const RECOMMENDATION_ENGINE=window.WannianRecommendationEngine;
if(!RECOMMENDATION_ENGINE)throw new Error('Wannian recommendation engine failed to load');
```

### Task 3: HTML Integration

**Files:**
- Modify: `public/game/wannian-mahjong.html`

- [ ] **Step 1: Add recommendation state**

Extend `GS` with:

```javascript
_recommendation:{current:null,records:[],lastFinished:null,selectedTileKey:null,lastAiInterpretation:null,lastRoundReview:null}
```

- [ ] **Step 2: Build context adapter**

Create `buildRecommendationContext(kind)` in HTML that extracts:
- current hand tile keys and labels
- candidate top five from existing `candDetails` or strong-rule `allCandidates`
- public discards and public melds only
- scores and phase label
- selected tile
- response event when phase is responding
- last AI discard interpretation
- last round review

- [ ] **Step 3: Replace `updateSuggestion` rendering**

Keep the existing evaluation code for choosing the best discard, but send normalized candidates to the recommendation module and render:

```javascript
const panel=RECOMMENDATION_ENGINE.buildPanel(context);
body.innerHTML=panel.sections.map(renderSection).join('');
```

The system recommendation object must be cached after draw/river updates and reused when only `GS.selectedTile` changes.

- [ ] **Step 4: Same-tile highlight**

Update `drawTile` calls for discards and melds:

```javascript
const selectedKey=GS._recommendation&&GS._recommendation.selectedTileKey;
drawTile(x,y,tile,{small:true,match:selectedKey&&tkey(tile)===selectedKey});
```

In `drawTile`, render a yellow border when `opts.match` is true.

### Task 4: Records, Review, Summary, Export

**Files:**
- Modify: `public/game/wannian-mahjong.html`

- [ ] **Step 1: Reuse existing game log and keep only one game**

Keep `LOG_KEY='mahjong_gamelogs'` as the only export/storage pipeline. Change the existing game-log retention from 3 games to 1 game:

```javascript
if(logs.length>1)logs=logs.slice(0,1);
```

Do not add a parallel `RECOMMENDATION_LOG_KEY`. Store Stage 4 recommendation data directly on `GS._gameLog`:

```javascript
GS._gameLog.recommendationRecords = GS._gameLog.recommendationRecords || [];
GS._gameLog.recommendationSummary = GS._gameLog.recommendationSummary || null;
```

- [ ] **Step 2: Record discard recommendation**

When a player reaches discard phase, write or update a `discard` record. After `doDiscard`, fill `actualAction`, `adopted`, and `strategyGap`, then add a `round-review` record.

- [ ] **Step 3: Record response recommendation**

When `GS.phase === 'responding'`, write a `response` record with available actions, recommended action, confidence, risks, and overwater text. On click `胡/碰/杠/过`, fill actual action and review.

- [ ] **Step 4: Record AI interpretation**

After each AI discard, append an `ai-discard` record using public information only.

- [ ] **Step 5: Game summary**

In `applyWin` and `drawGame`, create a `summary` record and place it first in the panel after the game ends.

- [ ] **Step 6: Export the latest one-game complete record**

Keep `exportGameLogs()` as the single authoritative export action. It should export the current in-progress game when present, otherwise the latest finished game only. The game object should include:

```javascript
recommendationRecords: GS._gameLog.recommendationRecords || []
recommendationSummary: GS._gameLog.recommendationSummary || null
```

The exported JSON should no longer include older second/third games.

### Task 5: Recommendation Case Set and Regression

**Files:**
- Create: `scripts/generate-stage4-recommendation-cases.mjs`
- Create: `docs/stage4-recommendation-cases.json`
- Create: `scripts/stage4-recommendation-regression.mjs`
- Create: `scripts/verify-browser-recommendation-engine.mjs`

- [ ] **Step 1: Generate 100 cases**

Create categories and counts:
- active-explanation: 15
- candidate-ranking: 10
- click-analysis: 10
- same-tile-visible-count: 10
- river-opponent-analysis: 15
- ai-discard-interpretation: 10
- response-recommendation: 15
- round-review: 10
- game-summary: 5

- [ ] **Step 2: Regression checks**

For every case, assert:
- required PRD section exists
- no raw engineering field names appear
- click analysis does not change system recommendation
- river analysis only uses public discards/melds/own hand
- response cases include 胡, 碰, 杠, 直铲, 过 coverage
- summary cases include counts and topic distribution

Target: `>= 85%` pass.

### Task 6: Verification and Report

**Files:**
- Create: `docs/stage4-recommendation-acceptance-report.md`

- [ ] **Step 1: Run verification**

Commands:

```powershell
node scripts/generate-stage4-recommendation-cases.mjs
npm.cmd run test:recommendation
npm.cmd run verify:recommendation
npm.cmd run test:strong-ai -- --report json
npm.cmd run test:rules -- --level L1 --report json
npm.cmd run build
```

- [ ] **Step 2: Write acceptance report**

The report must map PRD R1-R10, record/export requirements, case count, pass rate, and known limitations. It must explicitly state that the existing exported game record retention changed from 3 games to 1 game, and that no new dependencies and no DB changes were introduced.
