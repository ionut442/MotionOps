# P0-012 Results

Status: DONE.

Implemented harness:

- `src/shared/p012Registry.ts`
- `src/shared/p012Evidence.ts`
- `src/plugin/diagnostics/p012Fixtures.ts`
- P0-012 UI runner above P0-011
- collector support for `p012-*` evidence and manifests

Automated verification completed before live interaction:

| Command | Result |
|---|---|
| `rtk npm run typecheck` | PASS |
| `rtk npm run lint` | PASS |
| `rtk npm run test -- tests/p012Evidence.test.ts tests/p012FixtureConstruction.test.mjs tests/p012Cp09Harness.test.mjs` | PASS |
| `rtk npm run lab:collector:test` | PASS |
| `rtk npm run test:ui` | PASS |
| `rtk npm run test:build-artifacts` | PASS |
| `rtk npm run build:lab` | PASS |

Retained live evidence:

- `test-results/p012-mrj6qxvi-217610-CP09-undo-behavior.json`
- `test-results/p012-mrj6qxvi-217610.manifest.json`

Focused manifest:

- `accepted: true`
- `classification: mixed`
- evidence files: `p012-mrj6qxvi-217610-CP09-undo-behavior.json`

CP09 result:

- property: `ShowBadge#6426:3`
- property type: `BOOLEAN`
- target node type: `INSTANCE`
- motion source: `manualKeyframeTracks`
- semantic classification: `component-property-track`
- write probe: `WRITE_SUPPORTED`
- `propertyValue.before: true`
- `propertyValue.planned: false`
- `propertyValue.after: false`
- `propertyValue.restored: null`
- terminal classification: `PARTIAL`
- status: `PARTIAL`
- errors: none

Undo behavior:

- Ordering used: `commitUndo() -> write`.
- The write succeeded and re-read correctly.
- `figma.triggerUndo()` did not restore readable semantic state. Re-read APIs reported stale/missing target and sibling nodes, including `in get_componentProperties: The node with id "6426:74" does not exist`.
- This is a conclusive supported-with-warning/partial Undo finding, not a harness error.
- Redo remains untested because plugin typings expose `triggerUndo()` but no plugin-side `triggerRedo()` API.

Negative capability findings retained:

- CP01: READ_ONLY. Component-property definitions are exposed through the property API only.
- CP02: READ_ONLY. Instance component-property state is readable through the property API only.
- CP08: UNSUPPORTED/not-exposed. Some component-property kinds are not exposed as writable Motion tracks.
