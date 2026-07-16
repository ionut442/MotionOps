# P0-012 Evidence Inventory

Status: pending live evidence.

Expected retained files:

- `test-results/p012-<runId>.manifest.json`
- `test-results/p012-<runId>-CP01-discover-definitions.json`
- `test-results/p012-<runId>-CP02-read-instance-state.json`
- `test-results/p012-<runId>-CP03-boolean-motion-discovery.json`
- `test-results/p012-<runId>-CP04-text-motion-discovery.json`
- `test-results/p012-<runId>-CP05-instance-swap-motion-discovery.json`
- `test-results/p012-<runId>-CP06-variant-motion-discovery.json`
- `test-results/p012-<runId>-CP07-write-probe.json`
- `test-results/p012-<runId>-CP08-unsupported-read-only-classification.json`
- `test-results/p012-<runId>-CP09-undo-behavior.json`
- `test-results/p012-<runId>-CP10-cross-node-isolation.json`

After a conclusive run, create `.cache/p012-pre-inventory.json`, run the full verification gate once, then create `.cache/p012-post-inventory.json`.
