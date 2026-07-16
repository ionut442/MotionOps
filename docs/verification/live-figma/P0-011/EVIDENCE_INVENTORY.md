# P0-011 Evidence Inventory

Status: pending live evidence.

Expected retained files:

- `test-results/p011-<runId>.manifest.json`
- `test-results/p011-<runId>-C01-control-frame-baseline.json`
- `test-results/p011-<runId>-C02-main-component-root.json`
- `test-results/p011-<runId>-C03-main-component-child.json`
- `test-results/p011-<runId>-C04-component-set-container.json`
- `test-results/p011-<runId>-C05-variant-component.json`
- `test-results/p011-<runId>-C06-direct-instance-root.json`
- `test-results/p011-<runId>-C07-direct-instance-descendant.json`
- `test-results/p011-<runId>-C08-nested-instance-root.json`
- `test-results/p011-<runId>-C09-nested-instance-descendant.json`
- `test-results/p011-<runId>-C10-source-sibling-isolation.json`
- `test-results/p011-<runId>-C11-safe-style-path-by-category.json`
- `test-results/p011-<runId>-C12-restoration-undo-boundary.json`

After a conclusive run, create `.cache/p011-pre-inventory.json`, run the full verification gate once, then create `.cache/p011-post-inventory.json`.
