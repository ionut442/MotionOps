# P0-006 Results

Status: DONE.

Fresh live Figma evidence from run `p006-mrin2zvh-ac0f05` verifies read-only access to `animations`, `manualKeyframeTracks`, `animationStyles`, and `timelines` through explicit diagnostic targets.

## Accepted Live Evidence

| Evidence | Result |
|---|---|
| Run ID | `p006-mrin2zvh-ac0f05` |
| Manifest | `test-results/p006-mrin2zvh-ac0f05.manifest.json` |
| Evidence schema version | 2 |
| Manifest accepted | Yes |
| Registry evidence envelopes | 80 |
| Registry files missing | 0 |
| Parse failures | 0 |
| Target provenance mismatches | 0 |
| Target pipeline | Requested 2, Resolved 2, Read 2 |
| Retention gate | Manifest and all 80 evidence files unchanged after `npm run verify` |

Every R02-R10 evidence file uses `target.mode: "EXPLICIT_NODE_IDS"`. Raw diagnostics agree with envelope requested IDs, resolved IDs, and node read counts. R01 uses `target.mode: "EMPTY"` and proves only empty-target safety.

## Motion Field Results

## `manualKeyframeTracks`

- LIVE_VERIFIED: Manual tracks can be read from explicit target nodes.
- R03 exposes an opacity manual track.
- R04 exposes translation Y, rotation, and scale X manual tracks.
- R06 exposes manual translation X while also having a native animation style.
- R07 reads parent and child manual tracks separately and together.
- R08 child targets expose opacity and translation Y tracks; the auto-layout parent has no Motion tracks.
- R09 exposes a manual opacity track.
- R10 reads a mixed set where the manual node has opacity, the style node has no manual track, and the no-Motion node is empty.

## `animationStyles`

- LIVE_VERIFIED: Native animation style instances can be read from explicit target nodes.
- R05 exposes a native animation style with fields including `id`, `styleId`, `name`, `duration`, `timelineOffset`, and `props`.
- R06 verifies a native style can coexist with a manual track on the same fixture.
- R10 verifies per-node style presence in a mixed explicit target set.
- R02, R03, R04, R07, R08, and R09 correctly report empty style data for fixtures without native styles.

## `animations`

- LIVE_VERIFIED: Derived `animations` can be read from explicit target nodes.
- Manual tracks appear in derived animations for R03, R04, R07, R08, R09, and R10.
- Native-style generated animations appear in R05, R06, and the style node in R10.
- R10 proves populated and empty derived animation data can be isolated per node in one explicit multi-node read.

## `timelines`

- LIVE_VERIFIED: `timelines` can be read from explicit target nodes.
- Timeline records include `id` and `duration`.
- Timelines are present even for no-Motion or parent-only fixtures such as R02 and the R08 parent.
- Timeline writes remain unverified and are still scoped to P0-009.

## Retention Result

The accepted evidence survived the full non-manual gate:

- Pre/post manifest SHA-256: `edf01b79d6c546694f06e349c30664bf62b21657bc4d10e524f4698925e99edd`
- Pre/post evidence count: 80
- Pre/post combined evidence SHA-256: `28a3ccab5196e2ef99fecae676f5c8d0a6c7af67c87ecb5899b2d58a8261a5ca`
- Playwright output remained under `.playwright-test-results/`.

## Superseded Runs

- The 2026-07-12 selection-zero run is invalid because raw diagnostics read zero selected nodes.
- Run `p006-mrilvxco-96cd19` was observed valid but deleted by Playwright output cleanup and is not accepted.

## Remaining Risks

- Figma's Motion API is Beta; unknown fields and shape drift remain possible.
- Generated fixture writes are development infrastructure only and do not verify P0-007, P0-008, or P0-009 write behavior.
- Sanitized regression fixtures are still a future follow-up; this run accepts the live evidence but does not add product write support.
