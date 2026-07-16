# P6-024 Live Figma Sequencer Verification

Status: BLOCKED - no live Figma plugin session was available on 2026-07-14.

This procedure must be run in a live Figma document. Automated mocks and standalone browser UI tests are not enough to claim native timeline correctness.

## Fixture

Record:

- Figma editor surface and version/date.
- MotionOps build SHA or local build timestamp.
- Fixture node names, IDs if safe, and Scope order.
- Initial normalized Motion values for manual tracks, style instances, timelines, keyframes, and capabilities.
- Whether the fixture includes mixed manual/style sources.

## Required Cases

For every case below, record initial values, operation, local draft result, preview `ChangePlan`, apply result, native timeline result, normalized re-read, native Undo result, status, and evidence file/screenshot references.

| Case | Operation | Required proof |
|---|---|---|
| S01 | Manual bar move | Draft changes locally; no write before Apply; native timeline matches after Apply. |
| S02 | Multi-selection move | Relative offsets are preserved; unsupported/read-only members are skipped explicitly. |
| S03 | Resize duration | Supported manual duration resizes with proportional intermediate keyframes. |
| S04 | Keyboard nudge | Forward and backward by the same amount restores the draft before Apply. |
| S05 | Snapping | Snap interval is honored when enabled and exact unsnapped values remain possible when disabled. |
| S06 | Align starts | Start alignment preserves durations and skips read-only items. |
| S07 | Align ends | End alignment preserves durations and reports skipped items. |
| S08 | Distribution | Starts/ends/centers or gaps distribute deterministically and monotonically. |
| S09 | Fit to duration | Preserve-duration impossibility is explicit; scale mode follows documented anchoring. |
| S10 | Trim/padding | Timeline does not shorten below final keyframe/end; padding is validated. |
| S11 | Mixed manual/style restrictions | Style-generated details are read-only and not presented as manual keyframes. |
| S12 | Stale draft blocking | Source Motion change after draft creation blocks Apply until rescan/rebuild. |
| S13 | Preview | Existing `ChangePreview` shows manual/style/timeline/skipped/warnings accurately. |
| S14 | Apply | Existing guarded execution engine writes only after explicit Apply. |
| S15 | Native timeline result | Native Figma timeline reflects the Sequencer result after Apply. |
| S16 | Re-read verification | Normalized re-read matches expected postconditions or reports mismatch explicitly. |
| S17 | Native Undo | Native Undo restores expected Motion state; any redo/partial warning is recorded. |

## Evidence Requirements

- Use sanitized output only; do not include secrets or unrelated document content.
- Keep raw mock/standalone UI evidence separate from live Figma evidence.
- Record exact blocker strings and result statuses.
- Do not mark P6-024 DONE unless native timeline result, re-read verification, and native Undo evidence are present.

## Completion Rule

- If all required live cases pass or are classified with accepted warnings, update `docs/verification/PHASE-06.md` and `docs/implementation/TASK_LEDGER.md`.
- Only update `docs/implementation/API_CAPABILITY_MATRIX.md` if the live evidence establishes new capability conclusions.
