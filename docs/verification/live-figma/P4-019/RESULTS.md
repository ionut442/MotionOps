# P4-019 Live Figma Verification

Date: 2026-07-14

Status: BLOCKED

## Blocker

No live Figma plugin session was available during this batch. Automated mocks and standalone UI tests were not used as substitutes for P4-019 evidence.

## Required Procedure

1. Open the production MotionOps plugin in Figma with a document containing representative manual, multi-keyframe, easing, delay, and mixed manual/style Motion fixtures.
2. Confirm Scope for the fixture target(s), open Edit, wait for normalized Motion data to load, and run one case at a time through: configure, Build plan, preview, Apply, re-read result, native Figma Undo, re-read after Undo.
3. Record each required case with fixture, environment/date, initial values, operation, preview result, apply result, re-read result, native Undo result, status, and evidence path.
4. For stale preview, build a preview, change the relevant Motion state before Apply, then confirm Apply is blocked before any write.
5. Use the same live session to record representative P3-012 Inspector cases only where actually checked; do not mark unobserved cases PASS.

## Required Cases

| Case | Status | Notes |
| --- | --- | --- |
| Manual opacity duration change preserving start | BLOCKED | Requires live Figma. |
| Manual duration change preserving end | BLOCKED | Requires live Figma. |
| Multiple-keyframe proportional scaling | BLOCKED | Requires live Figma. |
| Valid cubic-bezier replacement | BLOCKED | Requires live Figma. |
| Invalid cubic-bezier blocked before write | BLOCKED | Requires live Figma. |
| Add delay | BLOCKED | Requires live Figma. |
| Remove or replace delay | BLOCKED | Requires live Figma. |
| Overall timing scale | BLOCKED | Requires live Figma. |
| Mixed manual/style node with style skipped/read-only | BLOCKED | Requires live Figma. |
| Stale preview blocked before write | BLOCKED | Requires live Figma. |
| Re-read actual result matches plan | BLOCKED | Requires live Figma. |
| One user Apply creates expected undo boundary; one native Undo restores readable state subject to Phase 0 limitation | BLOCKED | Requires live Figma. |

## Scope Boundary

P4-019 remains blocked. P4-020 was not started because capability matrix updates require observed live evidence.
