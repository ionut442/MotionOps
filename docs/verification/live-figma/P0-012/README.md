# P0-012 Component Property Track Discovery

Status: IN_PROGRESS - harness implemented and ready for live Figma evidence.

P0-012 investigates whether boolean, text, instance-swap, and variant component-property changes appear as Motion tracks, component-property state, variant instance state, or unsupported/read-only behavior.

This is discovery only. It does not implement the production adapter.

## Runner

- Fixture command: `Create/Refresh P0-012 Fixtures`
- Pipeline command: `Verify P0-012 target pipeline`
- Run command: `Run P0-012 Component Property Cases`
- Collector command: `TEST_COMPONENT_PROPERTY_TRACK`
- Evidence filenames: `test-results/p012-<runId>-CP01..CP10-<slug>.json`
- Manifest: `test-results/p012-<runId>.manifest.json`

## Fixture Family

The disposable fixture creates:

- one source component with boolean, text, and instance-swap component properties where supported,
- one component set with a variant property,
- target, sibling, nested/control, variant, source, and unrelated Motion nodes,
- source and sibling fingerprints for isolation checks,
- component-property references on visible, characters, and mainComponent sublayer fields where the live API permits them.

Unsupported property creation is recorded as terminal evidence instead of failing the whole run.

## Safety

- Never detach instances.
- Use `InstanceNode.setProperties()` only on disposable target instances.
- Use `figma.commitUndo()` before the CP09 write.
- Restore changed target values when possible.
- Treat absent Motion component-property tracks as conclusive `UNSUPPORTED` or `READ_ONLY` evidence.
