# P0-009 Results

Status: DONE - investigation complete; timeline-duration write, boundary, isolation, and restoration behavior recorded.

## Run Summary

| Field | Value |
|---|---|
| Run ID | `p009-mrivc1j7-56e68c` |
| Manifest | `test-results/p009-mrivc1j7-56e68c.manifest.json` |
| Schema | `1` |
| Emitted manifest accepted | `false` |
| Emitted manifest classification | `mixed` |
| Audited classification | `supported-with-warning` |
| Started | `2026-07-13T06:55:54.308Z` |
| Finished | `2026-07-13T06:55:55.142Z` |
| Manifest SHA-256 | `e0d9c55a2732bfecf54f23aee72d91944ad44d639ba6ef0ae12aed43fcb850d0` |

The emitted manifest is accepted=false because the initial harness incorrectly classified expected derived animation `timelineDuration` readback changes as unrelated mutation. The live evidence is still conclusive: writes completed, re-read was immediate, exact planned durations were observed, no manual tracks/keyframes/styles were mutated, and restoration returned the original semantic state.

| Capability | State |
|---|---|
| Timeline reads | supported |
| No-op write | supported |
| Extend duration | supported |
| Shorten above final keyframe | supported |
| Shorten below final keyframe | supported-with-warning |
| Repeated writes | supported |
| Restoration | supported |
| Timeline identity preservation | supported |
| Manual-track isolation | supported |
| Style-instance isolation | supported |
| Derived-animation behavior | supported-with-warning |

## Behavior

- `setTimelineDuration` writes are immediately readable from `node.timelines`.
- Timeline ID stayed `6399:10` and timeline count stayed `1` for T01-T06.
- T04 was not rejected, clamped, or auto-extended. Figma accepted `0.55s` even though the final keyframe time was `0.75s`.
- Manual-track keyframes and IDs stayed unchanged.
- Animation styles stayed unchanged.
- Derived animation readback updated only `TRANSLATION_X.timelineDuration` to match the written timeline duration.
- Restoration returned each fixture to `2s` and semantic equality passed.

## Verification Commands

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | PASS, 12 files / 66 tests |
| `npm run test:coverage` | PASS, 12 files / 66 tests |
| `npm run build:lab` | PASS |
| `npm run lab:collector:test` | PASS, 8 tests |
| `npm run test:ui` | PASS, 8 Chromium tests |
| `npm run build` | PASS |
| `npm run test:build-artifacts` | PASS |
| `npm run verify` | PASS |

P0-009 does not verify undo grouping.
