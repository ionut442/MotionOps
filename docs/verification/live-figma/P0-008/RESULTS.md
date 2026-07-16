# P0-008 Results

Status: DONE - live behavior is conclusive partial support.

## Run Summary

| Field | Value |
|---|---|
| Run ID | `p008-mriu1fap-25c85d` |
| Manifest | `test-results/p008-mriu1fap-25c85d.manifest.json` |
| Schema | `1` |
| Accepted in emitted manifest | `true` |
| Manifest classification | `mixed` |
| Audited classification | `mixed: S01-S05 partial, S06 supported` |
| Started | `2026-07-13T06:19:39.313Z` |
| Finished | `2026-07-13T06:19:42.452Z` |
| Manifest SHA-256 | `1aafad028d51ad3120be5e0a25048c2f21f521e3d20a9fc86d4f6396d96588e8` |

The emitted manifest is accepted. The six evidence files are conclusive: each fixture had one readable applied style instance before the operation, every API operation started and completed, and each case re-read `node.animationStyles`.

## Case Results

| Case | Status | Classification | Available/applicable styles | Fixture styles | Application ID | Applied reference ID | Before/after count | Conclusion |
|---|---|---|---:|---:|---|---|---|---|
| S01 | PARTIAL | partial | 6/6 | 1 | `Scale` | `CodeComponentId:6373:83` | 1/2 | No-op reapply duplicates the style instance. |
| S02 | PARTIAL | partial | 6/6 | 1 | `Scale` | `CodeComponentId:6373:83` | 1/2 | Configuration change applies an additional instance. |
| S03 | PARTIAL | partial | 6/6 | 1 | `Scale` | `CodeComponentId:6373:83` | 1/3 | Repeated reapply accumulates duplicates. |
| S04 | PARTIAL | partial | 6/6 | 1 | `Scale` | `CodeComponentId:6373:83` | 1/2 | Target duplicates; sibling/manual/timeline fingerprints stayed stable. |
| S05 | PARTIAL | partial | 6/6 | 1 | `Scale` | `CodeComponentId:6373:83` | 1/2 | Mutation/restoration path duplicates instead of updating in place. |
| S06 | PASS | supported | 6/6 | 1 | `Scale` | `CodeComponentId:6373:83` | 1/1 | Removing by applied instance ID, then reapplying by application ID, leaves one style instance. |

## Behavior Audit

- Fixture readiness: PASS. Every case began with `fixtureStyleCount=1`, a readable applied `AnimationPresetId:*` instance, and selected application ID `Scale`.
- ID separation: PASS. The harness applied by available application ID `Scale` and removed by applied instance ID. It did not reuse `CodeComponentId:6373:83` as the application ID.
- Direct no-op reapply: PARTIAL. Reapply adds a duplicate instance.
- Configuration change: PARTIAL. Applying changed duration/timelineOffset creates an additional instance rather than updating in place.
- Repeated reapply: PARTIAL. Two reapplies produced three total instances.
- Sibling isolation: PARTIAL with isolation support. Target duplicated; unrelated sibling/manual/timeline fingerprints stayed unchanged.
- Restoration: PARTIAL. Restore path duplicated and did not prove safe update-in-place semantics.
- Remove/reapply: SUPPORTED. S06 removed the actual applied instance ID and re-applied the valid application ID, ending with one applied style instance.
- Direct update in place: UNSUPPORTED by observed behavior and installed typings. Typings expose no update-in-place API; direct apply/reapply accumulates instances.

## Capability Classification

| Capability | State | Evidence |
|---|---|---|
| Read available animation styles | supported | `availableStyleCount=6`, `applicableStyleCount=6`; selected application ID was `Scale`. |
| Read applied animation-style instances | supported | Every case began with `fixtureStyleCount=1` and an applied `AnimationPresetId:*` instance. |
| Apply a style | supported-with-warning | `applyAnimationStyle("Scale", config)` completed and was readable after re-read. |
| Direct reapply of an already-applied style | partial | S01 created a duplicate, 1 -> 2. |
| Direct update in place | unsupported | No update API in typings; S02/S05 apply paths duplicated. |
| Change duration/timelineOffset by reapply | partial | The new applied instance can carry changed config, but existing instance is not updated in place. |
| Remove one applied style instance | supported | S06 removed the applied `AnimationPresetId:*` instance. |
| Remove/reapply safely | supported | S06 ended with one replacement instance and no duplicate. |
| Preserve applied-instance ID | unsupported for remove/reapply | S06 intentionally changed instance ID after removal/reapply. |
| Repeated application without duplication | unsupported | S03 ended 1 -> 3. |
| Sibling isolation | supported-with-warning | S04 target duplicated, but unrelated source fingerprints stayed stable. |
| Restoration via direct reapply | partial | Restoration did not update in place and left duplicates. |

## Conclusion

P0-008 is DONE as an investigation. Product code must not use direct `applyAnimationStyle` as an update-in-place operation. A safer style-write path, if needed later, must remove the applied instance ID first and then reapply the available application ID, with mandatory re-read and duplicate checks.
