# P0-008 Test Matrix

Status: DONE by conclusive live run `p008-mriu1fap-25c85d`.

| Case | Purpose | Required proof | Run result | Conclusion |
|---|---|---|---|---|
| S01 | No-op style reapply | Existing applied style instance, same style/config reapplied, final count and identity recorded | 1 -> 2 applied instances | PARTIAL: direct reapply duplicates. |
| S02 | Configuration change | Field under test, planned value, readback value, duplicate/identity behavior | 1 -> 2 applied instances | PARTIAL: changed config is applied as another instance. |
| S03 | Repeated reapply | Count and identity after each operation, duplicate accumulation state | 1 -> 3 applied instances | PARTIAL: repeated reapply accumulates duplicates. |
| S04 | Sibling isolation | Target style operation plus stable sibling/manual/timeline source fingerprints | 1 -> 2 on target; unrelated fingerprints stable | PARTIAL: duplicate on target, isolation preserved. |
| S05 | Restoration | Original config captured, mutated, restored, no unwanted duplicate | 1 -> 2 after mutation/restoration path | PARTIAL: restoration by reapply is not safe update-in-place. |
| S06 | Remove and reapply | Intended instance removed, one replacement applied, final count and identity recorded | 1 -> 1 with changed instance ID | PASS: remove applied instance ID, then reapply available style ID. |

The matrix proves direct style reapply/update is not duplicate-safe. Remove/reapply is the only verified style-instance mutation shape from P0-008.
