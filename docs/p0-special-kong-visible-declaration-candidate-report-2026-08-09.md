# P0 Special Kong Visible Declaration Candidate Report

Status: candidate complete, awaiting product acceptance; not merged, pushed, deployed, or used by Stage8.

## Baseline and scope

- Base commit: `632ad66846b6a9b14fa08e3d47feea9b6615632a`.
- Changed runtime surfaces: special-kong rule declaration validation, page special-kong choice generation, and the generated browser rule bundle.
- Changed verification surfaces: special-kong rules regression and a dedicated visible-declaration regression.
- Excluded: Stage8 v2 modules, selfplay, replay, models, ONNX, training, Arena, runtime release, browser storage, and port 18768.

## Fix

Special-kong declarations now use `canDeclareSpecialKongAction`, a pure rule-core validation path based only on the declaring player's pre-kong hand, real melds, public resources, and declaration context. The page's choice collector calls this declaration validator and does not preflight the wall-top supplement.

Wall-top consumption remains in the explicit execution preflight. The selected action is then resolved by the existing rule core as a settlement or a failure-discard path; execution retains its existing atomic rejection behavior when no supplement is available or a rule resolution fails.

For forced concealed runs, the non-normal restriction is evaluated from the pre-kong context. A later supplement can change the execution outcome but cannot retroactively remove a visible declaration option.

## Evidence

- The visible-declaration regression compares the same visible special-kong state with wall tops `wan6` and `wan8`; the menu is identical.
- The regression statically rejects wall or preflight access in page declaration functions and dynamically exposes a throwing `GS.wall` getter while collecting choices.
- The rule regression verifies a draw-free declaration, and verifies that both supplements execute through the rule-core path rather than rejecting the prior declaration.

## Verification

Passed:

- `npm.cmd run test:p0-special-kong-visible-declarations`
- `npm.cmd run test:p0-special-kong-rules`
- `npm.cmd run test:p0-special-kong-page-phase2`
- `npm.cmd run test:p0-kong-page-persistence`
- `npm.cmd run test:response-phase`
- `npm.cmd run test:response-real-meld-context`
- `npm.cmd run test:response-restore-revalidation`
- `npm.cmd run test:rules` (472 passed, 0 failed)
- `npm.cmd run test:recommendation` (100 passed, 0 failed)
- `npm.cmd run verify:mcts`
- `npm.cmd run verify:strong-ai`
- `npm.cmd run test:stage7-recommendation` (320 passed, 0 failed)
- `npm.cmd run test:stage7-ai-unified` (58 passed, 0 failed)
- `npx.cmd tsc --noEmit --incremental false`
- `npm.cmd run verify:browser-rules`
- `npm.cmd run verify:recommendation`
- `npm.cmd run build`
- `git diff --check`

## Candidate file list

- `package.json`
- `public/game/rule_engine.js`
- `public/game/wannian-mahjong.html`
- `src/game/rules/special-kong.ts`
- `scripts/p0-special-kong-rules-stage1-regression.mjs`
- `scripts/p0-special-kong-visible-declarations-regression.mjs`
- `docs/p0-special-kong-visible-declaration-candidate-report-2026-08-09.md`

The browser MCTS, recommendation, and strong-rule bundles were generated during broad verification, audited, and restored to the candidate baseline because they are outside this change.