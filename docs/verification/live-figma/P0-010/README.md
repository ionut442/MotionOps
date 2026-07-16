# P0-010 Undo Boundary Verification

Status: DONE - live behavior is conclusive mixed support.

P0-010 verifies `figma.commitUndo()` transaction boundaries, native undo grouping, `figma.triggerUndo()` rollback behavior, no-op history behavior, async-boundary grouping, partial failure behavior, and repeated transaction stability.

This is a Phase 0 capability investigation only. It does not implement the production `UndoTransaction` abstraction.

## API Contract

- Installed typings: `@figma/plugin-typings` 1.130.0.
- `figma.commitUndo(): void` is synchronous and returns `void`.
- `figma.triggerUndo(): void` is synchronous and returns `void`.
- Installed typings expose no `figma.triggerRedo()` or equivalent plugin-side redo API.
- Official docs say `commitUndo()` commits actions to undo history and does not trigger undo.
- Official docs say `triggerUndo()` reverts to the last `commitUndo()` state.
- Final live evidence uses native redo confirmation across U01-U10. Installed typings expose no plugin-side redo API, so redo is captured by a user native Redo action followed by `I Performed Redo`.
- U01 proved `C_INITIAL_BOUNDARY_WRITE_COMMIT` (`commitUndo() -> write`) as the safe one-write ordering. The expanded matrix is conclusive for Phase 0.

## Live Protocol

The lab UI exposes guided P0-010 case cards. The user clicked named buttons plus Figma native undo/redo when each card asked for it. Redo cannot be triggered by plugin API in the installed typings, so the harness records native redo through the `I Performed Redo` confirmation step for every case.

Final accepted evidence set:

- U01, U02, U04, U07, U09, U10: supported undo and redo behavior for the tested fixture shapes.
- U06: supported two-step undo ordering for separate apply actions; one redo after two undos does not restore the full final state.
- U03 and U05: supported-with-warning. Native Undo restored original state, but native Redo did not restore the applied style/mixed semantic state.
- U08: supported-with-warning. The controlled partial failure rolled back with `triggerUndo()`, and native Redo restored the applied state. Its retained manifest is not accepted only because it was emitted before the classifier stopped treating the intentional `P010_CONTROLLED_PARTIAL_FAILURE` as fatal.

## Harness Corrections

- Native Undo and Redo confirmation now use bounded settled-state observation instead of one immediate re-read.
- Evidence records capture read count, timeout status, first detected change time, final settled fingerprint, and optional document-change event observation.
- Semantic restoration ignores regenerated manual track/keyframe IDs and style instance IDs while preserving raw IDs for diagnostics.
- Easing comparison is semantic by easing type and cubic-bezier payload.
- Timeline duration and derived animation `timelineDuration` are compared as expected coupled state.
- P0-010 style fixtures now reuse the P0-008 safe prerequisites: selected available application style ID, one readable applied style instance, applied instance ID, no duplicate initial styles.
