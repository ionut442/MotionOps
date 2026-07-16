# P0-006 Evidence Inventory

Date analyzed: 2026-07-13

Inventory source: `test-results/p006-mrin2zvh-ac0f05.manifest.json`

Status: DONE.

Accepted run:

- Run ID: `p006-mrin2zvh-ac0f05`
- Manifest path: `test-results/p006-mrin2zvh-ac0f05.manifest.json`
- Evidence schema version: `2`
- Figma run window: `2026-07-13T03:04:55.325Z` to `2026-07-13T03:04:57.003Z`
- Evidence write time: 2026-07-13 06:04:57 local time
- Build: `lab`
- Manifest accepted: yes

The earlier `p006-mrilvxco-96cd19` run was observed but deleted by Playwright output cleanup and is not accepted. The Playwright output directory is now `.playwright-test-results`, and the accepted run survived the full verification gate unchanged.

## Integrity Summary

| Metric | Result |
|---|---:|
| Manifest evidence files | 80 |
| Registry evidence files expected | 80 |
| Registry evidence files found | 80 |
| Missing registry files | 0 |
| Unexpected registry files | 0 |
| Parse failures | 0 |
| Run ID mismatches | 0 |
| Schema mismatches | 0 |
| Target provenance mismatches | 0 |
| Evidence accepted for P0-006 Motion read verification | Yes |

## Retention Summary

| Check | Pre-verification | Post-verification |
|---|---|---|
| Manifest size | 4834 bytes | 4834 bytes |
| Manifest SHA-256 | `edf01b79d6c546694f06e349c30664bf62b21657bc4d10e524f4698925e99edd` | `edf01b79d6c546694f06e349c30664bf62b21657bc4d10e524f4698925e99edd` |
| Evidence file count | 80 | 80 |
| Evidence combined SHA-256 | `28a3ccab5196e2ef99fecae676f5c8d0a6c7af67c87ecb5899b2d58a8261a5ca` | `28a3ccab5196e2ef99fecae676f5c8d0a6c7af67c87ecb5899b2d58a8261a5ca` |
| Playwright output | `.playwright-test-results/.last-run.json` | `.playwright-test-results/.last-run.json` |
| Motion evidence retained | Yes | Yes |

## Target Pipeline

| Check | Result |
|---|---:|
| Requested | 2 |
| Resolved | 2 |
| Read | 2 |
| Status | PASS |

## Case Matrix

| Case | Variant | Target mode | Requested | Resolved | Read | Motion observations | Result |
|---|---|---|---:|---:|---:|---|---|
| R01 | empty-selection | EMPTY | 0 | 0 | 0 | Empty-target safety only | PASS |
| R02 | no-motion | EXPLICIT_NODE_IDS | 1 | 1 | 1 | No manual/style/derived Motion data; timeline present | PASS |
| R03 | generated-opacity | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Manual opacity track, derived animation, timeline present | PASS |
| R04 | multi-property | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Manual translation Y, rotation, and scale X tracks; derived animations; timeline present | PASS |
| R05 | native-style | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Native animation style, derived animations, timeline present; manual tracks empty | PASS |
| R06 | mixed-style-manual | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Native animation style plus manual translation X; derived animations; timeline present | PASS |
| R07 | parent-only | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Parent manual track, derived animation, timeline present | PASS |
| R07 | child-only | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Child manual track, derived animation, timeline present | PASS |
| R07 | parent-and-child-explicit-targets | EXPLICIT_NODE_IDS | 2 | 2 | 2 | Parent and child explicit targets read together in order | PASS |
| R08 | parent-selected | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Parent has no manual/style/derived Motion data; timeline present | PASS |
| R08 | children-selected | EXPLICIT_NODE_IDS | 3 | 3 | 3 | Three children expose manual tracks, derived animations, timelines | PASS |
| R08 | child-1-selected | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Child manual tracks, derived animations, timeline present | PASS |
| R08 | child-2-selected | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Child manual tracks, derived animations, timeline present | PASS |
| R08 | child-3-selected | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Child manual tracks, derived animations, timeline present | PASS |
| R09 | extended-timeline | EXPLICIT_NODE_IDS | 1 | 1 | 1 | Manual opacity track and timeline present | PASS |
| R10 | mixed-selection | EXPLICIT_NODE_IDS | 3 | 3 | 3 | Manual, style, and no-Motion nodes read together with per-node empty/populated fields | PASS |

## R07 Explicit Multi-Node Proof

The corrected R07 subcase is `parent-and-child-explicit-targets`. All five files for that variant requested two explicit node IDs, resolved the same two IDs, and raw diagnostic node records appeared in the same requested order. This proves explicit multi-node diagnostic targeting. It does not claim Figma canvas selection simultaneously selected a parent and child.

## Canonical Evidence Files

The manifest references exactly the 80 registry files produced by `src/shared/p006Registry.ts`. Complete per-file hashes are stored in `.cache/p006-pre-inventory.json`; post-gate comparison is stored in `.cache/p006-post-inventory.json`.
