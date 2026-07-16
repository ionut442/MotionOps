# P0-007 Manual Track Replacement Verification

Status: DONE - investigation complete; strict ID-preservation contract disproven for edited timing keyframes; safe subset and limitations recorded.

P0-007 verifies whether `applyManualKeyframeTrack(field, track)` can safely replace a complete existing manual track while preserving exposed track and keyframe IDs.

## Current State

- P0-006 prerequisite is complete: `p006-mrin2zvh-ac0f05`.
- P0-007 harness is implemented in the lab UI.
- Evidence schema version: `1`.
- Authoritative live run `p007-mriq1s7l-2b2f3c` exists. Its manifest remains `accepted: false`; that is correct evidence that the original strict success contract failed.
- P0-007 is closed as a completed investigation, not as full strict ID-preservation support.
- Context7 was requested but no callable Context7 tool was exposed in this Codex session; official Figma docs and installed `@figma/plugin-typings` were used.

## Live Workflow

```bash
npm run build:lab
npm run lab:collector
```

In Figma Desktop:

1. Reload MotionOps from `manifest.json`.
2. Click `Create/Refresh P0-007 Fixtures`.
3. Click `Verify P0-007 target pipeline`.
4. Confirm eight requested/resolved/read targets.
5. Click `Run P0-007 Write Cases`.
6. Wait for `test-results/p007-*.json` files and a `p007-*.manifest.json`.

Do not use Playwright or unit tests as replacement evidence.

## Latest Live Run

- Run ID: `p007-mriq1s7l-2b2f3c`
- Manifest: `test-results/p007-mriq1s7l-2b2f3c.manifest.json`
- Evidence schema: `1`
- Manifest accepted: no
- Evidence files: 8 canonical W01-W08 files
- Manifest SHA-256: `b8e06c1020535078344fc1f28d44964f10d2c95cbe8ed5c4598c79e18d2cbf57`
- Combined evidence SHA-256: `ed292b626651f250c4ced379c663ca61348940f69dc0b335cedf19c91f954bbc`
- Accepted P0-006 manifest SHA-256: `edf01b79d6c546694f06e349c30664bf62b21657bc4d10e524f4698925e99edd`

Observed behavior:

- Track IDs were exposed and preserved in W01-W08.
- Keyframe IDs were exposed, but W02 regenerated the edited middle keyframe ID from `6389:165` to `6389:256`.
- W04 accepted `LINEAR`, but the re-read easing also included `easingFunctionCubicBezier.x2 = 1`, which is an unexpected diff from the planned payload.
- No duplicate tracks were detected.
- W06 sibling `TRANSLATION_X` track stayed unchanged.
- W08 restored the original payload after mutation.

P0-007 is complete because the live run conclusively defines the safe subset and limitations. No P0-007 rerun is required.

## Safe Manual-Write Contract

- Manual full-track replacement is feasible for the tested OPACITY and TRANSLATION_X shapes.
- Track IDs were stable.
- Unedited keyframe IDs were stable in the tested cases.
- An edited timing keyframe ID may be regenerated.
- Re-read verification is mandatory.
- Post-write snapshots must replace pre-write identity assumptions.
- Easing verification must be semantic rather than raw-object equality.
- No duplicate or sibling-track mutation was observed.
- This does not verify undo behavior, style writes, timeline writes, or component/instance restrictions.
