# P0-008 Evidence Inventory

Status: retained and DONE.

## Inventory

- Run ID: `p008-mriu1fap-25c85d`
- Manifest: `test-results/p008-mriu1fap-25c85d.manifest.json`
- Manifest SHA-256: `1aafad028d51ad3120be5e0a25048c2f21f521e3d20a9fc86d4f6396d96588e8`

| File | SHA-256 |
|---|---|
| `test-results/p008-mriu1fap-25c85d-S01-noop-reapply.json` | `795a4d9c8fce7172fb0adade650f1275c61560bb5986f0a26e0291bcbdfe3a6e` |
| `test-results/p008-mriu1fap-25c85d-S02-configuration-change.json` | `175ee594030b9ed97ac3fc557417b16fc9b27bea1957b97eaef7ebeadec460fd` |
| `test-results/p008-mriu1fap-25c85d-S03-repeated-reapply.json` | `5f1f2fc9cd6c213bc7af78ff89cf6a3f6c7e24d9ac8f46095a249b3cd5b0e435` |
| `test-results/p008-mriu1fap-25c85d-S04-sibling-isolation.json` | `655ba3c5819e041a5200d04240da8442d71cdb07681ba3ad321b3db95c0c357b` |
| `test-results/p008-mriu1fap-25c85d-S05-restoration.json` | `7338f48d89a2515ad7a67985d2984a9da797d592d6cdb9f406e5451a571219a9` |
| `test-results/p008-mriu1fap-25c85d-S06-remove-and-reapply.json` | `0fa1f8a2c0fd68642c65daec27cd586447fc49bc5e526eb1577349c66a7ee4e8` |

## Validation

- Manifest parsed: PASS.
- Run ID matches all six evidence files: PASS.
- Schema version is `1`: PASS.
- S01-S06 present exactly once: PASS.
- Referenced files exist under `D:\Down\CODE\MotionOps\test-results`: PASS.
- Filenames/internal metadata agree: PASS.
- Terminal status exists for every case: PASS.
- No case remained `Missing` or `Running`: PASS.
- Fixture precondition satisfied: PASS. Every case recorded `fixtureStyleCount=1`.
- Behavior distinguishable: PASS. Direct reapply/update duplicates; remove/reapply is supported.
