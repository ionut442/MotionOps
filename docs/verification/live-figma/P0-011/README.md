# P0-011 Component/Instance Verification

Status: IN_PROGRESS - harness implemented, awaiting live Figma evidence.

P0-011 investigates Motion behavior for component roots, component children, component-set containers, variants, direct instances, direct-instance descendants, nested instances, nested descendants, source/sibling isolation, style remove/reapply, timeline writes, and representative undo restoration.

This is not product component support. Unsupported, read-only, partial, or mixed behavior is a valid terminal result when target provenance and isolation evidence are conclusive.

## Runner

- Fixture command: `Create/Refresh P0-011 Fixtures`
- Pipeline command: `Verify P0-011 target pipeline`
- Run command: `Run P0-011 Component/Instance Cases`
- Collector command: `TEST_COMPONENT_INSTANCE_MATRIX`
- Evidence filenames: `test-results/p011-<runId>-C01..C12-<slug>.json`
- Manifest: `test-results/p011-<runId>.manifest.json`

## Safety

- Never detach instances.
- Never mutate a source component except source-targeting cases.
- Never infer capability from typings alone.
- Use safe P0-008 style remove/reapply only.
- Use P0-007 through P0-010 semantic fingerprints and re-read after writes.
- Keep component-property keyframe tracks for P0-012.
