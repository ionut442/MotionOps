# P0-007 Evidence Inventory

Accepted investigation evidence exists.

Fresh retained run `p007-mriq1s7l-2b2f3c` exists. Its manifest is not accepted under the original strict success contract, and that remains correct. P0-007 is DONE as a completed investigation because the retained evidence conclusively records the supported subset and limitations.

- Manifest: `test-results/p007-mriq1s7l-2b2f3c.manifest.json`
- Evidence schema: `1`
- Manifest accepted: no, by design
- Evidence count: 8
- Manifest SHA-256: `b8e06c1020535078344fc1f28d44964f10d2c95cbe8ed5c4598c79e18d2cbf57`
- Combined evidence SHA-256: `ed292b626651f250c4ced379c663ca61348940f69dc0b335cedf19c91f954bbc`
- Accepted P0-006 manifest SHA-256: `edf01b79d6c546694f06e349c30664bf62b21657bc4d10e524f4698925e99edd`
- Pre-inventory: `.cache/p007-pre-inventory.json`
- Post-inventory: not created during the prior strict-contract pass because the full acceptance gate was not run after the manifest failed.
- Playwright output: current output remains isolated under `.playwright-test-results/`; stale `test-results/.last-run.json` was removed after canonical evidence hashes were verified unchanged.

Retained files:

- `test-results/p007-mriq1s7l-2b2f3c-W01-noop-round-trip.json`
- `test-results/p007-mriq1s7l-2b2f3c-W02-timing-modification.json`
- `test-results/p007-mriq1s7l-2b2f3c-W03-value-modification.json`
- `test-results/p007-mriq1s7l-2b2f3c-W04-easing-modification.json`
- `test-results/p007-mriq1s7l-2b2f3c-W05-multi-keyframe-preservation.json`
- `test-results/p007-mriq1s7l-2b2f3c-W06-sibling-track-isolation.json`
- `test-results/p007-mriq1s7l-2b2f3c-W07-repeated-replacement.json`
- `test-results/p007-mriq1s7l-2b2f3c-W08-restore-original-payload.json`
- `test-results/p007-mriq1s7l-2b2f3c.manifest.json`

Limitation cases:

- W02: timing modification preserved the track ID and count, but regenerated edited keyframe ID `6389:165` as `6389:256`.
- W04: easing modification preserved IDs and count, but actual re-read included additional `easingFunctionCubicBezier.x2 = 1`.

Expected retained files after live run:

- `test-results/p007-<run>-W01-noop-round-trip.json`
- `test-results/p007-<run>-W02-timing-modification.json`
- `test-results/p007-<run>-W03-value-modification.json`
- `test-results/p007-<run>-W04-easing-modification.json`
- `test-results/p007-<run>-W05-multi-keyframe-preservation.json`
- `test-results/p007-<run>-W06-sibling-track-isolation.json`
- `test-results/p007-<run>-W07-repeated-replacement.json`
- `test-results/p007-<run>-W08-restore-original-payload.json`
- `test-results/p007-<run>.manifest.json`

The manifest is acceptable only if every case passes and the files survive the final verification gate unchanged.
