# P0-006 Live Figma Motion Read Verification

P0-006 verifies read-only access to Figma Motion data in a disposable live Figma file. Browser tests and documentation are useful setup evidence, but they are not live Figma Motion API evidence.

## Current Status

Status: DONE.

Accepted live run:

- Run ID: `p006-mrin2zvh-ac0f05`
- Manifest path: `test-results/p006-mrin2zvh-ac0f05.manifest.json`
- Evidence schema version: `2`
- Figma environment: Figma Desktop, disposable `MotionOps API Verification` page, MotionOps lab build
- Verification date: 2026-07-13

The previous 2026-07-12 selection-zero run is superseded. Run `p006-mrilvxco-96cd19` was observed but deleted by Playwright output cleanup and is not accepted. The accepted run survived `npm run verify` unchanged because Playwright output is now isolated in `.playwright-test-results/`.

See `EVIDENCE_INVENTORY.md` and `RESULTS.md`.

## Accepted Automated Flow

1. Run `npm run build:lab`.
2. Run `npm run lab:collector`.
3. Reload MotionOps in Figma Desktop.
4. Open Motion API Lab.
5. Click `Create/Refresh All Test Frames`.
6. Click `Verify target pipeline`.
7. Confirm the UI reports Requested `2`, Resolved `2`, Read `2`.
8. Click `Run All Tests`.
9. Analyze only the latest run manifest and schema-v2 evidence files.
10. Confirm the manifest and all referenced evidence files remain present after `npm run verify`.

The accepted manifest is `test-results/p006-mrin2zvh-ac0f05.manifest.json`.

## Acceptance Checks

Accepted evidence satisfies:

- The manifest and referenced files exist after the final verification gate.
- The file parses as one JSON object.
- `filename`, `testCaseId`, `subcaseId`, and `command` match `src/shared/p006Registry.ts`.
- `evidenceSchemaVersion` is `2`.
- All files share run ID `p006-mrin2zvh-ac0f05`.
- R01 uses `target.mode: "EMPTY"` with 0 requested, 0 resolved, and 0 read.
- R02-R10 use `target.mode: "EXPLICIT_NODE_IDS"`.
- `target.requestedNodeIds`, `target.resolvedNodeIds`, raw diagnostic target IDs, and raw node result IDs agree.
- `diagnostic.nodesReadCount` equals resolved target count.
- `canvasState.canvasSelectionCount` is informational only and is not used as proof of read success.
- R07 `parent-and-child-explicit-targets` reads two explicit nodes and does not claim Figma canvas parent+child multi-selection.

## Evidence Boundaries

- Live evidence means JSON exported by Motion API Lab while running inside Figma Desktop against the disposable test file.
- Documentation evidence means official Figma docs describing expected API types or supported node properties.
- Playwright evidence means standalone UI behavior only. It must not be used as proof of Figma Plugin API behavior.
- Generated fixture writes are development infrastructure for read verification; they do not verify production write behavior.

## Official Documentation Checked

- Figma Motion API: `https://developers.figma.com/docs/plugins/api/Motion/`
- `animations`: `https://developers.figma.com/docs/plugins/api/properties/nodes-animations/`
- `animationStyles`: `https://developers.figma.com/docs/plugins/api/properties/nodes-animationstyles/`
- `manualKeyframeTracks`: `https://developers.figma.com/docs/plugins/api/properties/nodes-manualkeyframetracks/`
- `timelines`: `https://developers.figma.com/docs/plugins/api/properties/nodes-timelines/`

Documentation says Motion API is Beta. The accepted run confirms read access for the P0-006 fixtures, but future phases must still tolerate shape drift and unknown fields.
