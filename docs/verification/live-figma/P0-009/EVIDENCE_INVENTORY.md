# P0-009 Evidence Inventory

Status: retained and DONE.

## Inventory

- Run ID: `p009-mrivc1j7-56e68c`
- Manifest: `test-results/p009-mrivc1j7-56e68c.manifest.json`
- Manifest SHA-256: `e0d9c55a2732bfecf54f23aee72d91944ad44d639ba6ef0ae12aed43fcb850d0`
- Combined P0-009 SHA-256: `340f3bb532460272f5f0a7b5b5caab5597b93cb005f7ac5d9350210d6fec86bc`

| File | SHA-256 |
|---|---|
| `test-results/p009-mrivc1j7-56e68c-T01-noop-duration-write.json` | `136059cff62f1ef4eddb8196042699c7a1657f01289c126ea805e8ae5dbc62dc` |
| `test-results/p009-mrivc1j7-56e68c-T02-extend-duration.json` | `ac60a4dd573089a597554a233e4786298b9c511bbf004c91d6a64d29e39a42f5` |
| `test-results/p009-mrivc1j7-56e68c-T03-shorten-safely.json` | `d60e47798ea7b6fd976e17400ffbbdfed41bf89118e75806e7c9636149557e0b` |
| `test-results/p009-mrivc1j7-56e68c-T04-shorten-below-final-keyframe.json` | `ff6f4c4b98b1d7d6c7448576c9ae6d4438c2c77371dd5f26b4970c4b30c4905e` |
| `test-results/p009-mrivc1j7-56e68c-T05-repeated-writes.json` | `0fc55491c0fb72d8ff4888780ee020a82476a1eba303073edc4c31126cd8596e` |
| `test-results/p009-mrivc1j7-56e68c-T06-restore-original-duration.json` | `447ef73812d8a0080bfecd19b2cf736f0a933d7bb6d3b95181f4ad9fc3bbdb9e` |

## Retained Prior Evidence

| Run | Manifest SHA-256 | Evidence count |
|---|---|---:|
| `p006-mrin2zvh-ac0f05` | `edf01b79d6c546694f06e349c30664bf62b21657bc4d10e524f4698925e99edd` | 80 |
| `p007-mriq1s7l-2b2f3c` | `b8e06c1020535078344fc1f28d44964f10d2c95cbe8ed5c4598c79e18d2cbf57` | 8 |
| `p008-mriu1fap-25c85d` | `1aafad028d51ad3120be5e0a25048c2f21f521e3d20a9fc86d4f6396d96588e8` | 6 |

Pre-gate inventory: `.cache/p009-pre-inventory.json`.
Post-gate inventory: `.cache/p009-post-inventory.json`.

Post-gate comparison:

- P0-009 manifest unchanged: PASS.
- Evidence count unchanged: PASS.
- Missing files: none.
- Per-file hash differences: none.
- Combined hash unchanged: PASS.
- Retained P0-006/P0-007/P0-008 manifest hashes unchanged: PASS.
