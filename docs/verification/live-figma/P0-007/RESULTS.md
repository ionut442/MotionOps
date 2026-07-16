# P0-007 Results

Status: DONE - investigation complete; strict ID-preservation contract disproven for edited timing keyframes; safe subset and limitations recorded.

Fresh live Figma run `p007-mriq1s7l-2b2f3c` is the authoritative investigation run. Its manifest remains `accepted: false`, and that must not be rewritten: the original strict success contract failed. The investigation itself is complete because the run produced conclusive API behavior.

## API Shape Resolved Before Live Run

- `applyManualKeyframeTrack(field, track): void` applies or replaces a manual Motion keyframe track.
- `field` is a `KeyframeField`; current P0-007 fixtures use `{ type: "PROPERTY", name }`.
- `track` is `ManualKeyframeTrackInput`.
- `ManualKeyframeTrackInput` accepts optional `id`, optional `baseValue`, and a complete `keyframes` array.
- `ManualKeyframeInput` accepts optional `id`, `timelinePosition` in seconds, optional per-keyframe `easing`, and a `value`.
- Read `ManualKeyframeBinding` includes `id`, `baseValue`, and sorted `keyframes`.
- Motion API is beta, so observed live behavior must override assumptions.

## Live Run Summary

- Manifest: `test-results/p007-mriq1s7l-2b2f3c.manifest.json`
- Evidence schema: `1`
- Manifest accepted: no
- Rejection reason: `P0-007 live replacement evidence did not pass every case.`
- Evidence count: 8
- Figma environment: `editorType=figma`, `figmaMode=default`, page `MotionOps API Verification`
- Run timestamps: `2026-07-13T04:27:57.585Z` to `2026-07-13T04:27:58.411Z`
- Pre-inventory: `.cache/p007-pre-inventory.json`
- Manifest SHA-256: `b8e06c1020535078344fc1f28d44964f10d2c95cbe8ed5c4598c79e18d2cbf57`
- Combined evidence SHA-256: `ed292b626651f250c4ced379c663ca61348940f69dc0b335cedf19c91f954bbc`
- Accepted P0-006 manifest SHA-256: `edf01b79d6c546694f06e349c30664bf62b21657bc4d10e524f4698925e99edd`

## Case Results

| Case | Property | Original track ID | Actual track ID | Original keyframe IDs | Actual keyframe IDs | Tracks before/after | Isolation | Restoration | Result |
| ---- | -------- | ----------------- | --------------- | --------------------- | ------------------- | ------------------- | --------- | ----------- | ------ |
| W01 | OPACITY | `KeyframeTrackId:6389:150` | `KeyframeTrackId:6389:150` | `6389:151`, `6389:152` | `6389:151`, `6389:152` | 1/1 | PASS | N/A | PASS |
| W02 | TRANSLATION_X | `KeyframeTrackId:6389:163` | `KeyframeTrackId:6389:163` | `6389:164`, `6389:165`, `6389:166` | `6389:164`, `6389:256`, `6389:166` | 1/1 | PASS | N/A | FAIL |
| W03 | OPACITY | `KeyframeTrackId:6389:176` | `KeyframeTrackId:6389:176` | `6389:177`, `6389:178`, `6389:179` | `6389:177`, `6389:178`, `6389:179` | 1/1 | PASS | N/A | PASS |
| W04 | OPACITY | `KeyframeTrackId:6389:189` | `KeyframeTrackId:6389:189` | `6389:190`, `6389:191`, `6389:192` | `6389:190`, `6389:191`, `6389:192` | 1/1 | PASS | N/A | FAIL |
| W05 | OPACITY | `KeyframeTrackId:6389:202` | `KeyframeTrackId:6389:202` | `6389:203`, `6389:204`, `6389:205`, `6389:206` | `6389:203`, `6389:204`, `6389:205`, `6389:206` | 1/1 | PASS | N/A | PASS |
| W06 | OPACITY | `KeyframeTrackId:6389:216` | `KeyframeTrackId:6389:216` | `6389:217`, `6389:218`, `6389:219` | `6389:217`, `6389:218`, `6389:219` | 2/2 | PASS | N/A | PASS |
| W07 | TRANSLATION_X | `KeyframeTrackId:6389:233` | `KeyframeTrackId:6389:233` | `6389:234`, `6389:235`, `6389:236` | `6389:234`, `6389:235`, `6389:236` | 1/1 | PASS | N/A | PASS |
| W08 | OPACITY | `KeyframeTrackId:6389:246` | `KeyframeTrackId:6389:246` | `6389:247`, `6389:248`, `6389:249` | `6389:247`, `6389:248`, `6389:249` | 1/1 | PASS | PASS | PASS |

## Before / Planned / Actual Diffs

- W01: no-op; before, planned, and actual were semantically equal.
- W02: planned changed only keyframe 2 `timelinePosition` from `0.22` to `0.27`; actual also changed keyframe ID `6389:165` to `6389:256`.
- W03: planned and actual changed only keyframe 2 opacity value from `0.75` to `0.875`.
- W04: planned changed keyframe 2 easing type from `EASE_OUT` to `LINEAR`; actual matched `LINEAR` but also exposed `easingFunctionCubicBezier.x2 = 1`, which was not in the planned payload.
- W05: planned and actual changed only keyframe 2 opacity value from `0.45` to `0.575`; four keyframes stayed present and ordered.
- W06: planned and actual changed only keyframe 2 opacity value from `0.8` to `0.925`; sibling `TRANSLATION_X` fingerprint stayed unchanged.
- W07: planned and actual changed only keyframe 2 translation value from `44` to `44.25`; one logical `TRANSLATION_X` track remained.
- W08: planned and actual changed keyframe 2 opacity value from `0.65` to `0.775`; restoration re-read matched the original payload.

## Contract Classification

- Verified supported behavior: complete no-op replacement works; OPACITY value modification works; multi-keyframe tracks survive complete replacement; track IDs remained preserved in all tested cases; sibling manual tracks remained unchanged; repeated replacement continued to address one logical track; repeated replacement did not create duplicate tracks; restoration by reapplying original full payload worked; recorded animation-style and timeline fingerprints remained unchanged.
- Track ID behavior: preserved exactly for all W01-W08.
- Keyframe ID behavior: inconsistent. W01, W03, W04, W05, W06, W07, and W08 preserved exposed keyframe IDs; W02 regenerated the edited middle keyframe ID.
- Easing behavior: partial. W04 accepted the `LINEAR` easing type, but Figma re-read an additional cubic-bezier shape field.
- Unsupported/not verified by P0-007: style-instance reapplication, timeline writes, undo grouping, component/instance boundaries, and the future production writer.

## Verified Limitation: Timing Edits

W02 changed the intended TRANSLATION_X keyframe time successfully, but Figma regenerated the edited keyframe ID from `6389:165` to `6389:256`.

Therefore exact keyframe-ID preservation is unsupported for at least edited keyframe timing changes. The production writer must never assume that an edited keyframe keeps its old ID. After every timing write, the plugin must re-read the complete track, treat previous keyframe IDs as stale, and rebuild/remap keyframe correspondence from the verified re-read state. Track ID preservation does not imply keyframe ID preservation.

## Verified Limitation: Easing Readback

W04 accepted a `LINEAR` easing write, but the re-read result included additional cubic-bezier data.

Therefore raw easing-object equality is not a valid verification contract. The Figma API may normalize or retain additional easing fields. Future normalization must compare easing semantically, preserve the full raw readback for diagnostics, and never silently discard unknown easing fields. Manual easing replacement is supported-with-warning or partial until semantic canonicalization is implemented and verified.

No P0-007 rerun is required.
