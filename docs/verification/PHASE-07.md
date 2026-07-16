# Phase 7 Verification - Stagger Builder

Status: INCOMPLETE because live Figma verification P7-015 is BLOCKED.

## Automated scope

P7-001 through P7-014 are implemented and covered by automated checks. The shared Stagger Builder is `src/domain/stagger.ts`; Edit clone-reference-and-stagger routes through the existing Phase 5 clipboard/paste planner; Sequencer stagger routes through the existing draft model and P4 preview/apply workflow.

## Timing semantics

- Fixed interval: each ordered target start differs by `intervalMs`.
- Total duration: preserve-duration distributes gaps inside the requested total and rejects impossible configurations; scale-to-fit proportionally maps start/end ranges into the requested total.
- Fixed overlap: positive `overlapMs` means the next target starts before the previous target ends.
- Sequential after end: each next target starts at previous end plus `gapMs`.
- Start before previous end: positive `overlapMs` means the next target starts before the previous target end.

All values are integer milliseconds. Invalid negative, non-integer, zero-duration scale-to-fit, and impossible preserve-duration configurations return typed failures.

## Ordering

Edit Stagger reuses P2 `orderScopeNodes` for layer-panel, reverse layer-panel, top-to-bottom, bottom-to-top, left-to-right, right-to-left, center-outward, edges-inward, and custom Scope order. Missing geometry and ties follow the existing traversal-index fallback. No second spatial ordering implementation was added.

## Test evidence

- `rtk npm run typecheck` - PASS.
- `rtk npx vitest run tests/stagger.test.ts tests/phase5ClipboardPaste.test.ts tests/sequencer.test.ts tests/messages.test.ts` - PASS, 22 tests.

Final full verification commands are recorded in the session summary. Live Figma behavior is not claimed from these automated tests.

## Live blocker

No live Figma plugin session was available during this batch. P7-015 is BLOCKED and must be completed with the procedure in `docs/verification/live-figma/P7-015/README.md` before Phase 7 can be marked complete or before the API capability matrix changes.

## Scope exclusions

P8-001 is NOT_STARTED. No QA, Standards, Handoff, analytics, persistence, licensing, backend, network, unsupported style write, or API capability matrix work was performed.
