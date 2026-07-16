# Phase 6 Verification - Sequencer Workflow

## Scope

P6-001 through P6-023 are automated DONE. P6-024 is BLOCKED because no live Figma plugin session was available on 2026-07-14. Phase 6 status is INCOMPLETE until the live procedure verifies native Figma timeline results, re-read verification, and native Undo.

Implemented:

- Session-local immutable Sequencer draft model in `src/domain/sequencer.ts`.
- Deterministic viewport, ruler, zoom, pan, snap, and time/pixel conversion helpers.
- Layer rows, manual bars/keyframe markers, style read-only bars, source/capability indicators, selection, multi-selection, range selection, and clear selection behavior.
- Local drag-equivalent move/resize operations, keyboard nudge semantics, offset, align-start, align-end, distribute, fit-to-duration, trim, and padding helpers.
- Sequencer property drawer through the existing `ContextDrawerShell`.
- Reset and stale flags; stale drafts block preview/apply and are not silently rebased.
- `sequencer-draft` conversion into the existing P4 `ChangePlan` planner; no Sequencer-specific executor was added.
- Sequence workspace UI that reads active Scope Motion data, updates local draft only, builds preview through the plugin-owned planner, and applies only through the existing guarded execution engine.
- Pure/property tests, UI interaction tests, and performance-oriented pure-domain coverage methodology.

## Automated Evidence

Focused command:

```bash
rtk npm run test -- tests/sequencer.test.ts tests/sequenceWorkspace.test.tsx tests/messages.test.ts tests/changePlan.test.tsx
```

Result: PASS, 4 files, 27 tests.

Typecheck:

```bash
rtk npm run typecheck
```

Result: PASS.

Coverage added for:

- Deterministic draft creation from normalized Motion without source mutation.
- Manual/style source separation and read-only style presentation.
- Integer-millisecond viewport conversion, zoom clamp, and pan clamp.
- Offset/nudge reversibility, resize scaling, align, distribute, fit, trim, padding, snap, serialization, and warning behavior.
- Property-based offset invariants with deterministic fast-check seed `406021`.
- Sequence UI loading active Scope Motion data, local-only nudge before preview, semantic rows/bars, property drawer, preview generation, and Apply only from preview.

## Policy Notes

- The native Figma Motion document remains the source of truth. Sequencer drafts are session-only and derived from normalized snapshots.
- UI code does not import plugin runtime modules or Figma globals. Planning and applying cross the typed message boundary.
- Manual and style sources remain separate. Style-generated bars are visible and selectable for inspection but read-only for timing edits.
- No write occurs during draft creation, zoom, pan, selection, nudge, offset, align, distribute, fit, trim, padding, property inspection, reset, or preview generation.
- Apply still flows through existing P4 stale guard, undo transaction, writer dispatch, and re-read verification.
- No playback engine, playhead control, advanced Stagger Builder, QA, Standards, Handoff, analytics, persistence, licensing, backend, or network work was added.
- `docs/implementation/API_CAPABILITY_MATRIX.md` was not updated because no new live evidence was captured.

## Performance Methodology

Pure-domain Sequencer operations are kept independent from Figma API latency and are covered by deterministic unit/property tests. The implementation measures and optimizes the pure draft path separately from live reads/writes; live Figma performance remains part of P6-024 evidence capture.

Targets retained from the implementation plan:

- Normalize 2,000 keyframes under 100 ms in pure domain code.
- Recompute Sequencer draft with 2,000 keyframes under 50 ms.
- Pointer-drag feedback should remain compatible with 60 fps.
- UI remains responsive without adding complex virtualization before evidence demonstrates a need.

## Live Blocker

P6-024 is blocked by unavailable live Figma access. The required procedure is recorded at `docs/verification/live-figma/P6-024/README.md`.

Phase 6 status: INCOMPLETE until P6-024 passes or is otherwise classified with live evidence.
