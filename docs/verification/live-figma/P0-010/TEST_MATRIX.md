# P0-010 Test Matrix

| Case | Strategy | Sources | Native Undo | Redo | Purpose |
| --- | --- | --- | --- | --- | --- |
| U01 | A_WRITE_THEN_COMMIT | manual-track | yes | yes | One manual-track write reverts with one undo. |
| U02 | A_WRITE_THEN_COMMIT | manual-track | yes | yes | Multiple manual mutations group into one undo. |
| U03 | A_WRITE_THEN_COMMIT | style-instance | yes | yes | Safe style remove/reapply groups into one undo. |
| U04 | A_WRITE_THEN_COMMIT | timeline | yes | yes | Timeline-duration write and derived readback revert together. |
| U05 | A_WRITE_THEN_COMMIT | manual-track, style-instance, timeline | yes | yes | Mixed-source operation groups into one undo. |
| U06 | A_WRITE_THEN_COMMIT | manual-track | yes, twice | yes | Two separate apply actions create two undo steps. |
| U07 | A_WRITE_THEN_COMMIT | no-op | yes | yes | No-op apply history behavior is classified. |
| U08 | D_WRITE_COMMIT_FAILURE_TRIGGER_UNDO | partial-failure, manual-track | triggerUndo | yes | Controlled partial failure rollback probe. |
| U09 | A_WRITE_THEN_COMMIT | manual-track | yes | yes | Awaited async boundary does or does not split grouping. |
| U10 | B_COMMIT_WRITE_COMMIT | manual-track, timeline | yes | yes | Repeated transaction stability. |

Installed Figma typings expose no plugin-side redo trigger. Redo means native Figma Redo followed by the `I Performed Redo` capture button.

Focused strategy search is now prepared before any full rerun:

| Probe | Ordering | Expansion rule |
| --- | --- | --- |
| Test U01 Strategy A | write -> commitUndo() | Expand only if one Undo restores original and one Redo restores applied. |
| Test U01 Strategy B | commitUndo() -> write -> commitUndo() | Expand only if one Undo restores original and one Redo restores applied. |
| Test U01 Strategy C | commitUndo() -> write | Expand only if one Undo restores original and one Redo restores applied. |

Final outcomes:

| Case | Outcome |
| --- | --- |
| U01 | Supported with Strategy C, `commitUndo() -> write`. |
| U02 | Supported with one native Undo and one native Redo. |
| U03 | Supported-with-warning: Undo restored original; Redo did not restore applied style state. |
| U04 | Supported with one native Undo and one native Redo. |
| U05 | Supported-with-warning: Undo restored original; Redo did not restore the mixed applied state. |
| U06 | Supported separate-action ordering: two native Undo actions restore original. One Redo after two Undos does not restore the final state. |
| U07 | Supported no-op behavior for the tested fixture. |
| U08 | Supported-with-warning: `triggerUndo()` rolled back the controlled partial failure; native Redo restored applied state in latest evidence. |
| U09 | Supported across the awaited async boundary. |
| U10 | Supported for repeated transaction stability with Strategy B. |

Terminal classifications: PASS, PARTIAL, UNSUPPORTED, BLOCKED_PRECONDITION, FAIL, ERROR.
