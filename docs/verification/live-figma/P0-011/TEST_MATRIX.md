# P0-011 Test Matrix

| Case | Target | Purpose | Expected terminal states |
|---|---|---|---|
| C01 | Control frame child | Prove harness read/write/timeline/undo baseline. | PASS, PARTIAL, READ_ONLY, ERROR |
| C02 | Main component root | Probe root Motion read/write/style/timeline restrictions. | PASS, PARTIAL, READ_ONLY, UNSUPPORTED |
| C03 | Child inside main component | Probe child writes and propagation into instances. | PASS, PARTIAL, READ_ONLY, UNSUPPORTED |
| C04 | Component-set container | Determine whether set container exposes or accepts Motion data. | PARTIAL, READ_ONLY, UNSUPPORTED |
| C05 | Variant component | Probe variant-level writes and sibling variant isolation. | PASS, PARTIAL, READ_ONLY, UNSUPPORTED |
| C06 | Direct instance root | Probe instance-root writes, overrides, source/sibling preservation, linkage. | PASS, PARTIAL, READ_ONLY, UNSUPPORTED |
| C07 | Direct instance descendant | Probe descendant targeting and override behavior. | PASS, PARTIAL, READ_ONLY, UNSUPPORTED |
| C08 | Nested instance root | Probe nested instance targeting without source mutation. | PASS, PARTIAL, READ_ONLY, UNSUPPORTED |
| C09 | Nested instance descendant | Probe nested descendant write acceptance or rejection. | PASS, PARTIAL, READ_ONLY, UNSUPPORTED |
| C10 | Source and sibling isolation | Fingerprint source, direct instance, sibling instance, and target. | PASS, PARTIAL, FAIL |
| C11 | Safe style path by category | Remove applied instance ID and reapply application style ID when available. | PASS, PARTIAL, BLOCKED_PRECONDITION |
| C12 | Restoration and undo boundary | Use representative `commitUndo() -> write`, then restoration probe. | PASS, PARTIAL, READ_ONLY |

Run All must terminate and emit a manifest even when one or more cases reject writes.
