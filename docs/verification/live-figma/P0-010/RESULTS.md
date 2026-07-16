# P0-010 Results

Status: DONE - live Figma evidence is conclusive mixed support.

Fresh terminal run set captured on 2026-07-13 09:02:07Z through 09:04:48Z. The harness recorded native redo confirmation for every U01-U10 case. Figma exposes `figma.triggerUndo()` but no plugin-side redo API, so redo evidence is captured after the user performs native Figma Redo and clicks `I Performed Redo`.

| Case | File | Manifest | Accepted | Strategy | Audited classification | Conclusion | Undo | Redo | Notes |
|---|---|---|---:|---|---|---|---:|---:|---|
| U01 | `p010-mrizu52k-5b81a6-U01-one-manual-write-one-undo.json` | `p010-mrizu52k-5b81a6.manifest.json` | yes | `C_INITIAL_BOUNDARY_WRITE_COMMIT` | PASS | supported | yes | yes | Undo/redo behavior reached expected semantic states. |
| U02 | `p010-mrizut2e-5abffd-U02-multi-manual-grouping.json` | `p010-mrizut2e-5abffd.manifest.json` | yes | `A_WRITE_THEN_COMMIT` | PASS | supported | yes | yes | Undo/redo behavior reached expected semantic states. |
| U03 | `p010-mrizv3pr-231f67-U03-style-remove-reapply-grouping.json` | `p010-mrizv3pr-231f67.manifest.json` | yes | `A_WRITE_THEN_COMMIT` | PARTIAL | supported-with-warning | yes | no | Undo restored original; native redo did not restore applied state. |
| U04 | `p010-mrizvdlr-354441-U04-timeline-duration-one-undo.json` | `p010-mrizvdlr-354441.manifest.json` | yes | `A_WRITE_THEN_COMMIT` | PASS | supported | yes | yes | Undo/redo behavior reached expected semantic states. |
| U05 | `p010-mrizvp6w-422153-U05-mixed-source-grouping.json` | `p010-mrizvp6w-422153.manifest.json` | yes | `A_WRITE_THEN_COMMIT` | PARTIAL | supported-with-warning | yes | no | Undo restored original; native redo did not restore applied state. |
| U06 | `p010-mrizw2z7-545f3b-U06-separate-apply-actions.json` | `p010-mrizw2z7-545f3b.manifest.json` | yes | `A_WRITE_THEN_COMMIT` | PASS | supported | two-step | no | Two separate apply actions required two native undo steps; one redo did not restore the full final state. |
| U07 | `p010-mrizwhqr-1ba384-U07-noop-apply-history.json` | `p010-mrizwhqr-1ba384.manifest.json` | yes | `A_WRITE_THEN_COMMIT` | PASS | supported | yes | yes | Undo/redo behavior reached expected semantic states. |
| U08 | `p010-mrizx0su-b6764f-U08-partial-failure-rollback.json` | `p010-mrizx0su-b6764f.manifest.json` | no | `D_WRITE_COMMIT_FAILURE_TRIGGER_UNDO` | PASS | supported-with-warning | yes | yes | Controlled failure rolled back with `triggerUndo()`; redo restored applied state. Manifest was emitted by the older fatal-error rule for intentional failures. |
| U09 | `p010-mrizxaoz-3ccda8-U09-async-boundary.json` | `p010-mrizxaoz-3ccda8.manifest.json` | yes | `A_WRITE_THEN_COMMIT` | PASS | supported | yes | yes | Undo/redo behavior reached expected semantic states. |
| U10 | `p010-mrizxnmu-107e8d-U10-repeated-transaction-stability.json` | `p010-mrizxnmu-107e8d.manifest.json` | yes | `B_COMMIT_WRITE_COMMIT` | PASS | supported | yes | yes | Undo/redo behavior reached expected semantic states. |

## Conclusions

- One-write manual transactions should use `commitUndo() -> write`, proven by U01 Strategy C. The earlier `write -> commitUndo()` U01 record remained applied after native Undo and is retained as a failed ordering probe.
- Standard `A_WRITE_THEN_COMMIT` grouping is supported for U02, U04, U07, U09, and the separate-action ordering check in U06.
- Native Redo is not uniformly reliable for style-involved paths: U03 and U05 reverted successfully with Undo but did not restore the applied semantic state with one native Redo.
- `triggerUndo()` is safe as a rollback tool for the controlled U08 partial failure. The latest U08 evidence reports no partial writes remaining after rollback and native Redo restored the applied state.

Collector health during the audit:

- PID: `16540`
- Health: `{"ok":true,"service":"motion-evidence-collector","outputDir":"test-results"}`
