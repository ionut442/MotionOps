# Final Live Figma Campaign

This campaign is the single live session plan for closing prior live gates plus the Phase 10 live-only blockers. Reuse fixtures and evidence records where one observation explicitly satisfies multiple tasks.

## Gates Covered

- P3-012 Inspector fixture verification
- P4-019 Edit/undo verification
- P4-020 capability-matrix update
- P5-019 Copy/Paste verification
- P5-020 capability-matrix update
- P6-024 Sequencer verification
- P7-015 Stagger verification
- P8-022 QA safe-fix/storage verification
- P10-006 complete live fixture matrix
- P10-008 native Undo matrix
- P10-009 dynamic-page large-file verification
- P10-010 final live verification campaign

## Setup

Use a fresh lab build and collector, preserving existing `test-results/` evidence. Record build timestamp, plugin version, Figma app/browser version, file key redaction status, current page, selected roots, collector URL, and manifest run ID.

For the final automated live campaign, use the live-verification build instead of the normal release-candidate package:

- Build command: `npm run build:live-verification`
- Import path: `dist/live-verification/motionops-plugin/manifest.json`
- Temporary UI: `Run all tests` appears in the global header.
- Evidence export: use `View results`, `Copy JSON`, and `Copy Markdown` after the run.

The live-verification build uses the production app and production Motion code paths, with the temporary runner enabled only by `__MOTIONOPS_LIVE_TEST_RUNNER_ENABLED__`. The normal release-candidate package must continue to omit the button and runner code.

Run the campaign in both supported Figma surfaces when available:

- Figma Desktop app with the locally loaded plugin.
- Figma browser/editor session with the locally loaded plugin, if plugin loading is available in that surface.

Record surface-specific differences separately. A PASS in one surface does not imply PASS in the other unless the evidence record explicitly covers both.

Do not update the API capability matrix during the live run unless the evidence record for the relevant gate is accepted, complete, and explicitly supports the capability conclusion.

## Recommended Order

1. Read-only Inspector verification.
2. Manual Edit operations and native Undo.
3. Copy/Paste property matrix.
4. Sequencer and timeline utilities.
5. Stagger workflows.
6. QA safe fixes and storage.
7. Complete integrated fixture passes.
8. Full native Undo matrix.
9. Large-file and dynamic-page behavior.
10. P4-020 and P5-020 capability-matrix classification from accepted P4-019/P5-019 evidence.
11. Capability-matrix and known-limitations updates.

## Shared Evidence Rules

Each evidence record must include:

- Task IDs satisfied.
- Fixture ID and fixture description.
- Initial readable Motion state.
- Scope roots, target IDs, and confirmed target order.
- Preview/build action.
- Apply action when applicable.
- Reread result.
- Native Undo result when applicable.
- Sibling and outside-Scope preservation checks.
- Unsupported/read-only/no-write assertions.
- Error strings or partial-result strings exactly as surfaced.
- Final classification: PASS, PARTIAL, BLOCKED, or NOT_APPLICABLE.

One evidence record may satisfy multiple tasks only when every required observation is present in that record.

## P10-006 Live Fixture Matrix

Run representative live fixtures for all categories in the automated matrix:

1. No Motion
2. Manual opacity
3. Translation X/Y
4. Rotation
5. Scale
6. Width/height
7. Corner radius
8. Stroke weight
9. Path trim
10. Multiple keyframes
11. Different easing
12. Style instance
13. Mixed manual/style
14. Auto-layout children
15. Parent plus child
16. Hidden animated layer
17. Locked animated layer
18. Duplicate keyframe times
19. Timeline shorter than final keyframe
20. Component
21. Component set
22. Instance
23. Nested instance
24. Paint/effect limitations
25. Unknown beta property
26. 200 animated nodes
27. 2,000 keyframes
28. Fractional source seconds
29. Multiple selected roots
30. Document changed after preview

For each fixture, exercise applicable Scope, Inspect, Edit, Copy/Paste, Sequence, Stagger, QA/Standards, and Handoff workflows.

## P10-008 Native Undo Matrix

For every supported write workflow:

1. Record initial readable Motion state.
2. Build preview.
3. Apply once.
4. Confirm reread result.
5. Invoke native Figma Undo once.
6. Reread target and relevant siblings/timeline.
7. Record restoration result.

Minimum cases:

- Manual duration
- Preserve start
- Preserve end
- Easing
- Delay
- Timing scale
- Replace paste
- Merge paste
- Add-missing paste
- Timing-only paste
- Easing-only paste
- Sequencer move
- Sequencer resize
- Offset
- Align start/end
- Distribution
- Fit
- Trim/padding
- Fixed stagger
- Total-duration stagger
- Overlap/sequential stagger
- QA safe fixes

Distinguish user-invoked native Undo from plugin `triggerUndo()` rollback behavior.

## P10-009 Dynamic-Page Large-File Checks

Use a large multi-page Figma file with unloaded pages where practical. Verify:

- Plugin opens without implicit full-document traversal.
- Current-page Scope only scans intended targets.
- Multiple selected roots work.
- Explicit manual node resolution works.
- Large descendant scans show progress and can cancel.
- Cancelled scans stop reasonably and do not replace newer results.
- Selection sync and node reveal work on current intended targets.
- Motion inspection handles missing, page-not-loaded, and unsupported surfaces distinctly.
- UI remains responsive and memory usage is acceptable.
- No Motion writes occur outside intended targets.

## P10-010 Final Environment Campaign

For each available Figma surface, verify:

- Plugin startup and UI load with the production shell.
- Scope scan, Inspect refresh, Edit preview/apply, Copy/Paste preview/apply, Sequencer preview/apply, Stagger preview/apply, Standards/QA, safe fix preview/apply, and Handoff preview/export.
- Help and limitations drawer opens, focuses, closes, and does not obscure required workflow controls.
- Unsupported/read-only capability states remain visible and conservative.
- No lab-only controls or API-lab collector messaging appears in the production package.

The automated runner discovers the existing `test 1` through `test 20` fixtures on `MotionOps API Verification`, validates `TEST SUBJECT` and locked `[INSTRUCTIONS - DO NOT SELECT]` structure, runs production-path read/scope/fingerprint checks, isolates destructive probes in `__MOTIONOPS_LIVE_TEST_SANDBOX__`, attempts cleanup, and exports Markdown/JSON evidence. It does not replace manual Desktop/Browser checks and never converts manual checks into automatic PASS.

Complete `MANUAL-ENVIRONMENT-FEEDBACK.md` after the automated runner has been imported and run in the available environments.

If neither a desktop nor browser Figma plugin session is available, classify P10-010 as BLOCKED and do not update final release status.

## P4-020 And P5-020 Classification

P4-020 and P5-020 are documentation/capability updates, not separate sources of capability truth.

- Mark P4-020 DONE only after P4-019 accepted evidence supports each Edit capability conclusion being changed.
- Mark P5-020 DONE only after P5-019 accepted evidence supports each Copy/Paste capability conclusion being changed.
- If live P4-019 or P5-019 evidence is absent, incomplete, or rejected, keep the matching capability-matrix update BLOCKED or NOT_STARTED and make no `API_CAPABILITY_MATRIX.md` changes.

## Closeout

After accepted evidence exists, update the specific live gate result files first. Then update `docs/implementation/API_CAPABILITY_MATRIX.md` only for conclusions directly supported by accepted live evidence. Finally update `docs/implementation/KNOWN_LIMITATIONS.md`, `docs/verification/PHASE-10.md`, and `docs/implementation/TASK_LEDGER.md`.

Runner readiness is not live campaign completion. P10-010 remains BLOCKED until accepted live Figma evidence exists and the manual environment feedback is complete.

## Fixture Inventory

Fixture construction page:

- File key: `YL5z9BqfSaWmwNqlbzavXE`
- Page ID: `6371:10`
- Page name: `MotionOps API Verification`
- Construction method: official Figma MCP only
- MotionOps plugin usage during construction: none
- Live verification status: not recorded in this inventory

| Test | Purpose | Frame ID | TEST SUBJECT ID | Main fixture node IDs | Related tasks | Provisioning |
| --- | --- | --- | --- | --- | --- | --- |
| test 1 | Startup, shell, navigation, empty states | `6448:10` | `6448:12` | `6448:16`, `6448:20`, `6448:21` | P10-010, P10-006 | READY |
| test 2 | Scope hierarchy, filtering, target ordering | `6448:29` | `6448:31` | `6448:34`, `6448:35`, `6448:39`, `6448:43`, `6448:44`, `6448:45`, `6448:46`, `6448:47`, `6448:48`, `6448:52`, `6448:53`, `6448:55`, `6448:59` | P3-012, P10-006, P10-009, P10-010 | READY |
| test 3 | Inspector manual-property matrix | `6448:64` | `6448:66` | `6448:69`, `6448:74`, `6448:78`, `6448:83`, `6448:87`, `6448:92`, `6448:96`, `6448:101`, `6448:105`, `6448:110`, `6448:114` | P3-012, P5-019, P10-006 | READY |
| test 4 | Manual, style, mixed, restricted, unsupported sources | `6448:120` | `6448:122` | `6448:125`, `6448:129`, `6448:132`, `6448:137`, `6448:139`, `6448:143` | P3-012, P4-020, P5-020, P10-006, P10-016 | MANUAL_PREPARATION_REQUIRED |
| test 5 | Batch timing and easing editing | `6449:10` | `6449:12` | `6449:15`, `6449:22`, `6449:29`, `6449:37` | P4-019, P4-020, P10-006, P10-008 | READY |
| test 6 | Mixed-source edit, stale protection, Undo | `6449:45` | `6449:47` | `6449:50`, `6449:55`, `6449:59`, `6449:61`, `6449:62`, `6449:66`, `6449:67` | P4-019, P4-020, P10-008 | READY |
| test 7 | Copy/Paste one-to-one compatibility | `6449:72` | `6449:74` | `6449:77`, `6449:96`, `6449:97`, `6449:98`, `6449:99`, `6449:100`, `6449:104`, `6449:105`, `6449:106` | P5-019, P5-020, P10-006, P10-008 | READY |
| test 8 | Copy/Paste one-to-many deterministic mapping | `6449:108` | `6449:110` | `6449:113`, `6449:117`, `6449:121`, `6449:122`, `6449:126`, `6449:127`, `6449:128`, `6449:129`, `6449:130`, `6449:131` | P5-019, P5-020, P7-015, P10-008 | READY |
| test 9 | Sequencer manual-track editing | `6450:10` | `6450:12` | `6450:15`, `6450:25`, `6450:35`, `6450:45`, `6450:55`, `6450:65` | P6-024, P10-006, P10-008 | READY |
| test 10 | Sequencer utilities and timeline writes | `6450:76` | `6450:78` | `6450:81`, `6450:85`, `6450:87`, `6450:92` | P6-024, P10-006, P10-008 | MANUAL_PREPARATION_REQUIRED |
| test 11 | Stagger in auto-layout | `6450:94` | `6450:96` | `6450:99`, `6450:100`, `6450:104`, `6450:108`, `6450:112`, `6450:116`, `6450:120`, `6450:121`, `6450:125`, `6450:129`, `6450:133` | P7-015, P10-006, P10-008 | READY |
| test 12 | Spatial and custom stagger order | `6450:138` | `6450:140` | `6450:143`, `6450:147`, `6450:151`, `6450:155`, `6450:159`, `6450:163`, `6450:167`, `6450:171`, `6450:175` | P7-015, P10-006 | READY |
| test 13 | QA timing, easing, keyframe defects | `6451:10` | `6451:12` | `6451:15`, `6451:20`, `6451:25`, `6451:30`, `6451:34`, `6451:39`, `6451:45`, `6451:49`, `6451:54`, `6451:60`, `6451:65`, `6451:70` | P8-022, P10-006 | READY |
| test 14 | QA layer state, values, conflicts, safe fixes | `6451:76` | `6451:78` | `6451:81`, `6451:85`, `6451:89`, `6451:93`, `6451:97`, `6451:101`, `6451:105`, `6451:109`, `6451:114`, `6451:118`, `6451:122` | P8-022, P10-006, P10-008 | MANUAL_PREPARATION_REQUIRED |
| test 15 | Standards and tokens | `6451:127` | `6451:129` | `6451:132`, `6451:136`, `6451:140`, `6451:144` | P8-022, P10-006, P10-010 | READY |
| test 16 | Handoff Markdown and JSON | `6451:149` | `6451:151` | `6451:154`, `6451:155`, `6451:159`, `6451:161`, `6451:166`, `6451:170` | P10-006, P10-010, P10-016 | READY |
| test 17 | Components, component sets, instances, nested instances | `6453:10` | `6453:12` | `6453:15`, `6453:21`, `6453:22`, `6453:24`, `6453:25`, `6453:27`, `6453:29`, `6453:31` | P3-012, P5-019, P5-020, P10-006, P10-016 | MANUAL_PREPARATION_REQUIRED |
| test 18 | Multi-selection, multiple roots, dynamic-page behavior | `6453:37` | `6453:39` | `6453:42`, `6453:43`, `6453:47`, `6453:51`, `6453:55`, `6453:59`, `6453:60`, `6453:64`, `6453:68`, `6453:72`, `6453:76`, `6453:77`, `6453:81`, `6453:85`, `6453:89`, `6453:93` | P10-006, P10-009, P10-010 | READY |
| test 19 | Large-file and keyframe stress fixture | `6453:95` | `6453:97` | Stress subject `6453:100`; stress nodes `STRESS 001` to `STRESS 200`; first `6453:101`; last `6453:2489` | P10-006, P10-009, P10-010 | READY |
| test 20 | Final cross-workspace acceptance campaign | `6453:2502` | `6453:2504` | `6453:2507`, `6453:2508`, `6453:2509`, `6453:2510`, `6453:2514`, `6453:2516`, `6453:2521`, `6453:2525`, `6453:2527` | P3-012, P4-019, P4-020, P5-019, P5-020, P6-024, P7-015, P8-022, P10-006, P10-008, P10-009, P10-010, P10-016 | READY |

### Manual Preparation Requirements

- test 4: `UNKNOWN BETA PROPERTY - manual preparation required` is structurally prepared, but arbitrary unknown beta Motion properties are not exposed through the current public Motion MCP surface.
- test 10: the timeline-shorter-than-final-keyframe invalid state was not forced; create it manually only if the native Figma UI/API safely permits it.
- test 14: duplicate same-property tracks are not representable through the public `manualKeyframeTracks` object model, which stores one track per property.
- test 17: Figma rejected direct Motion writes to `COMPONENT WITH MANUAL MOTION` with `Cannot write animations to product components via the plugin API`; instance Motion is prepared instead.

### Structural Validation

- Exactly 20 top-level frames exist: `test 1` through `test 20`.
- Each frame contains exactly `TEST SUBJECT` and `[INSTRUCTIONS - DO NOT SELECT]`.
- Every instruction panel is locked.
- No top-level test frames overlap.
- No instruction text is clipped.
- Every test includes numbered steps, expected results, evidence placeholders, and related task IDs.
- No generic fixture node names matching default Figma names were found.
- Hidden fixture count: 5.
- Locked fixture count: 5.
- Real component count: 4.
- Real component set count: 1.
- Real instance count: 5.
- Native manual Motion nodes reread through MCP: 307.
- Native style Motion nodes reread through MCP: 12.
- Stress fixture count: 200 animated nodes and 2,000 keyframes.

### Screenshots Captured

- Full page, downscaled: `https://www.figma.com/api/mcp/asset/2a6b5c76-1330-490b-84b9-0bfa936dc587`
- Full page, natural resolution: `https://www.figma.com/api/mcp/asset/cd1f9f35-5e4c-4add-bb9b-b5c175ccc58e`
- Component/instance fixture, test 17: `https://www.figma.com/api/mcp/asset/5a053d45-fee1-49dd-990d-e845b51066b9`
- Stress fixture, test 19: `https://www.figma.com/api/mcp/asset/001a3d6f-d093-450b-9fbc-7553280e05e0`
- Final acceptance fixture, test 20: `https://www.figma.com/api/mcp/asset/9975dbad-8105-4934-9abe-9740ea1611fd`
