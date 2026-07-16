# Phase 00 Verification

Date: 2026-07-12

## Repository State Before Changes

- Working directory: `D:\Down\CODE\MotionOps`
- Initial files: `MOTIONOPS_CODEX_IMPLEMENTATION_PLAN.md`
- Git state: not a Git repository; `git status` returned `fatal: not a git repository (or any of the parent directories): .git`
- Existing package/build/test scripts: none
- Existing Figma manifest: none
- Existing plugin/UI entry points: none

## Files Added Or Changed

- Added TypeScript, Vite, React, ESLint, Vitest, and Playwright scaffold.
- Added `manifest.json` with `"documentAccess": "dynamic-page"`.
- Added plugin main entry at `src/plugin/main.ts`.
- Added UI entry at `src/ui/index.tsx` and shell in `src/ui/App.tsx`.
- Added shared typed message contracts in `src/shared/messages.ts`.
- Added internal time conversion module in `src/domain/time.ts`.
- Added unit tests and standalone Playwright smoke test.
- Added project control files under `docs/implementation/` and this verification record.
- Added `.gitignore`.
- Added `.codebase-memory/graph.db.zst` via codebase-memory indexing.

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `rtk powershell -NoProfile -Command "Get-ChildItem -Force | Select-Object Mode,Length,LastWriteTime,Name"` | PASS | Initial inventory showed only implementation plan before scaffold plus generated codebase-memory artifact after indexing. |
| `rtk powershell -NoProfile -Command "git status --short --branch"` | FAIL | Repository was not initialized yet. |
| `codebase-memory-mcp index_repository` | PASS | Indexed `D-Down-CODE-MotionOps`; artifact written. |
| `npm view @figma/plugin-typings version` | PASS | Current observed version: `1.130.0`. |
| `node_repl` message-shape experiment | PASS | Confirmed simple ready/ping/pong payload shape before permanent tests. |
| `rtk powershell -NoProfile -Command "git init"` | PASS | Initialized Git repository; no commit made. |
| `rtk powershell -NoProfile -Command "npm install"` | PASS | Dependencies installed; 0 vulnerabilities. npm warned about transitive deprecations for `glob@10.5.0` and `whatwg-encoding@3.1.1`. |
| `npm run typecheck` | PASS | `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.plugin.json`. |
| `npm run lint` | PASS | `eslint .`. |
| `npm run test` | PASS | Vitest: 2 files passed, 10 tests passed. |
| `npm run test:coverage` | PASS | Vitest coverage: 2 files passed, 10 tests passed; all-files coverage 21.45% statements, 55.55% branches, 60% functions, 21.45% lines. |
| `npm run build` | PASS | Built `dist/plugin.js` plus Vite UI assets. |
| `npm run test:ui` | PASS | Playwright: 1 Chromium smoke test passed. |
| `npm run verify` | PASS | Ran typecheck, lint, coverage, build, and Playwright UI smoke successfully. |

## Documentation Findings

- Official Figma manifest docs say new plugins require `documentAccess: "dynamic-page"`.
- Official Figma dynamic-loading docs say dynamic-page avoids preloading every page and requires compatible async access patterns.
- Official Figma UI docs describe `figma.showUI`, `figma.ui.postMessage`, and `figma.ui.onmessage` for plugin/UI communication.
- Official Figma `commitUndo()` docs describe undo-history grouping, but the exact MotionOps strategy still needs persistent-session verification.
- Official Figma Motion docs mark Motion API as Beta and describe animation styles, timelines, animations, and manual keyframe tracks.

## Warnings And Unverified Behavior

- Context7 was requested but not exposed as a callable tool; official Figma docs were used instead.
- No Figma runtime session was available in this run.
- No Motion write capability is marked verified.
- No `figma.commitUndo()` grouping behavior is marked verified.
- Browser UI smoke tests must not be treated as Figma Plugin API verification.

## Remaining Phase 0 Tasks

- P0-012 is the final Phase 0 task.
- After conclusive P0-012 live evidence is audited and documented, the next eligible task is P1-011 - Implement the normalized Figma Motion adapter.
- Update `API_CAPABILITY_MATRIX.md` after those investigations.

## Next Recommended Ledger Task

`P0-006`

## P0-005 Motion API Capability Spike Harness

### Files Added Or Changed

- `src/shared/diagnostics.ts`
- `src/shared/diagnosticSerializer.ts`
- `src/shared/labConfig.ts`
- `src/shared/env.d.ts`
- `src/shared/messages.ts`
- `src/plugin/main.ts`
- `src/plugin/diagnostics/diagnosticRunner.ts`
- `src/plugin/diagnostics/featureDetection.ts`
- `src/plugin/diagnostics/fixture.ts`
- `src/plugin/diagnostics/fixtureRegistry.ts`
- `src/ui/App.tsx`
- `src/ui/styles.css`
- `tests/diagnostics.test.ts`
- `tests/diagnosticSerializer.test.ts`
- `tests/ui/motion-api-lab.spec.ts`
- `tests/ui/smoke.spec.ts`
- `package.json`
- `playwright.config.ts`
- `vite.config.ts`
- `vite.plugin.config.ts`

### Diagnostic Commands Implemented

- `GET_ENVIRONMENT`
- `READ_CURRENT_SELECTION`
- `READ_MOTION_DATA`
- `READ_MANUAL_TRACKS`
- `READ_ANIMATION_STYLES`
- `READ_DERIVED_ANIMATIONS`
- `READ_TIMELINES`
- `CREATE_DISPOSABLE_FIXTURE`
- `CLEAR_DISPOSABLE_FIXTURE`
- `EXPORT_LAST_RESULT`

Future destructive/write commands are represented as `NOT_TESTED` and remain disabled for later Phase 0 tasks.

### Safety Controls

- Motion API Lab is enabled only in Vite `lab` mode through `npm run dev:lab` or `npm run build:lab`.
- Normal `npm run build` disables the lab through `__MOTIONOPS_ENABLE_API_LAB__`.
- Figma API access remains in `src/plugin/`.
- UI sends typed diagnostic commands and never calls Figma globals.
- Fixture cleanup uses stored node IDs in `figma.clientStorage`; it does not remove nodes merely because names match `__MOTIONOPS_API_LAB__`.
- Read commands may inspect normal selection; fixture write/cleanup commands are explicit.

### Automated Tests

- Diagnostic message validation.
- Request/result shape validation.
- Capability-state classification.
- Defensive serializer coverage for nested objects, arrays, unknown fields, circular references, truncation, undefined, accessor skipping, fractional time, keyframe/track IDs, and empty Motion data.
- Method feature detection.
- Empty/unsupported node shape handling.
- Fixture ownership registry.
- Production lab exclusion config.
- UI rendering, command triggering, loading state, supported/partial result display, and dev-only fixture controls.

### Verification Results

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `npm run lint` | PASS | ESLint passed. |
| `npm run test` | PASS | Vitest: 4 files passed, 23 tests passed. |
| `npm run test:coverage` | PASS | Vitest coverage: 4 files passed, 23 tests passed; all-files coverage 26.71% statements, 76.92% branches, 77.14% functions, 26.71% lines. |
| `npm run build` | PASS | Production build completed with lab disabled. |
| `npm run test:ui` | PASS | Playwright lab mode: 3 Chromium tests passed. |
| `npm run verify` | PASS | Ran typecheck, lint, coverage, production build, and Playwright lab smoke successfully. |

### Behaviors Still Requiring Live Figma

- Reading actual `animations`, `manualKeyframeTracks`, `animationStyles`, and `timelines` from selected nodes.
- Verifying manual-track replacement and ID preservation.
- Verifying native animation-style update/reapply behavior.
- Verifying timeline-duration writes.
- Verifying `figma.commitUndo()` and `figma.triggerUndo()` transaction behavior.
- Verifying component, instance, component-property, paint, gradient, effect, and dynamic-page scan behavior.

### Exact Next Task

`P0-006`

## P0-005 Blank Figma Lab UI Regression Fix

### Problem

Figma Desktop opened the MotionOps plugin window, proving `figma.showUI()` ran, but the plugin body was blank after `npm run build:lab`.

### Root Cause

Vite emitted `dist/index.html` with external `/assets/...js` and `/assets/...css` references. Figma loads `__html__` as the UI HTML string, so those emitted asset files were not available inside the plugin iframe.

### Fix

- Added `scripts/inline-figma-ui.mjs`.
- Updated `npm run build` and `npm run build:lab` to inline UI JavaScript and CSS into `dist/index.html` after Vite builds.
- Added `tests/inlineFigmaUi.test.mjs` to prove external Vite asset references become inline script/style content while preserving the UI root.

### Verification

| Command | Result | Notes |
|---|---|---|
| `rtk npm run build:lab` | PASS | Final lab `dist/index.html` contains inline script/style and no `/assets` `src`/`href` references. |
| `rtk npm run verify` | PASS | Typecheck, lint, coverage, production build, and Playwright UI tests passed. |
| `node_repl` final HTML inspection | PASS | Confirmed `hasExternalAssetSrc=false`, `hasExternalAssetHref=false`, `hasInlineScript=true`, `hasInlineStyle=true`, `hasRoot=true`, `hasLabText=true`. |

### Boundary

This was a P0-005 diagnostic-interface regression fix only. No P0-006 live Motion API verification was started.

## P0-006 Live Figma Motion Read Verification

Status: SUPERSEDED - initially blocked before live exports were available.

### Files Added Or Changed

- `docs/verification/live-figma/P0-006/README.md`
- `docs/verification/live-figma/P0-006/TEST_MATRIX.md`
- `docs/verification/live-figma/P0-006/RESULTS.md`
- `docs/verification/live-figma/P0-006/raw/.gitkeep`
- `docs/verification/live-figma/P0-006/sanitized/.gitkeep`
- `docs/implementation/TASK_LEDGER.md`
- `docs/implementation/API_CAPABILITY_MATRIX.md`
- `docs/implementation/KNOWN_LIMITATIONS.md`
- `docs/implementation/DECISIONS.md`

### Environment Used

- Date: 2026-07-12
- Local workspace: `D:\Down\CODE\MotionOps`
- Figma desktop/browser: Not available in this Codex session.
- Live Figma file: Not available.

### Cases Completed

None. No live Figma exports were collected.

### Evidence Files

- Workflow: `docs/verification/live-figma/P0-006/README.md`
- Matrix: `docs/verification/live-figma/P0-006/TEST_MATRIX.md`
- Results placeholder and blocker: `docs/verification/live-figma/P0-006/RESULTS.md`
- Raw exports: none yet.
- Sanitized exports: none yet.

### API Shapes Confirmed

None by live Figma. Documentation-only findings remain recorded in the P0-006 results file and API capability matrix.

### Automated Commands

| Command | Result | Notes |
|---|---|---|
| `rtk npm run build:lab` | PASS | Built plugin and UI in lab mode. |
| `rtk powershell -NoProfile -Command "Get-Process -Name Figma -ErrorAction SilentlyContinue \| Select-Object Id,ProcessName,MainWindowTitle"` | NO RUNNING FIGMA PROCESS | No interactive Figma Desktop boundary available. |
| `node_repl` evidence directory inspection | PASS | Confirmed `raw/` and `sanitized/` contain only `.gitkeep`; no live JSON exports. |
| `rtk npm run verify` | PASS | Typecheck, lint, coverage, production build, and Playwright UI tests passed. |

### Remaining Unknowns

- Actual live shapes for `manualKeyframeTracks`, `animationStyles`, `animations`, and `timelines`.
- Empty-array versus absent-property behavior.
- Track IDs, keyframe IDs, property identifiers, easing shapes, and timeline references.
- Parent/child, auto-layout, multi-select, and mixed-source read behavior.
- Whether R06 mixed style plus manual track is allowed by the Figma UI.

### Manual Unblock Checklist

1. Run `npm run build:lab`.
2. Open Figma Desktop.
3. Open or create a disposable design file with no confidential work.
4. Import `D:\Down\CODE\MotionOps\manifest.json` from Plugins -> Development if needed.
5. Run MotionOps and open Motion API Lab.
6. Create page `MotionOps API Verification`.
7. Execute R01-R10 from `docs/verification/live-figma/P0-006/TEST_MATRIX.md`.
8. Save raw exports in `docs/verification/live-figma/P0-006/raw/`.
9. Save structure-preserving sanitized exports in `docs/verification/live-figma/P0-006/sanitized/`.

### Exact Next Task

Superseded by the durable acceptance entry below: run `p006-mrin2zvh-ac0f05` later completed P0-006.

## P0-006 Automated Fixture And Evidence Workflow

Status: SUPERSEDED - automation was pending live Figma run at this point.

### Existing R02/R03 Evidence Assessment

- `test-results/R02-no-motion-read-motion-data.json` contains five concatenated live diagnostic envelopes for `READ_MOTION_DATA`, `READ_MANUAL_TRACKS`, `READ_ANIMATION_STYLES`, `READ_DERIVED_ANIMATIONS`, and `READ_TIMELINES`.
- `test-results/R03-opacity-read-manual-tracks.json` contains the same five-envelope command set.
- Both files identify page `6371:10` (`MotionOps API Verification`) and preserve real selected-node Motion read/write surface detection.
- They are useful live baseline captures, but they are not single valid JSON documents. New automated evidence writes one canonical JSON object per file.

### Automation Locations

- Fixture generator: `src/plugin/diagnostics/p006Fixtures.ts`
- Test registry and filename generator: `src/shared/p006Registry.ts`
- Lab UI runner: `src/ui/App.tsx`
- Local collector: `scripts/motion-evidence-collector.mjs`
- Collector tests: `tests/motion-evidence-collector.test.mjs`

### Collector Command

`npm run lab:collector`

Output location: `test-results/`

### Fixture Root Identifiers

- Generated root name: `__MOTIONOPS_P0_006_FIXTURES__`
- Client storage key: `motionops.apiLab.p006Registry`
- Plugin data owner: `motionops.apiLab.owner = P0-006`
- Plugin data test case: `motionops.apiLab.testCase`
- Plugin data role: `motionops.apiLab.role`

### Current P0-006 State

- Local collector implemented and tested.
- Declarative R01-R10 registry implemented and tested.
- Generated fixture creation/refresh/clear implemented.
- Lab UI now exposes collector status, Create/Refresh All Test Frames, Run All Tests, Clear Generated Test Frames, and one Run Test button per case.
- Production build remains separate from the collector and lab runner.
- Superseded: live generated frames and JSON outputs were later produced in run `p006-mrilvxco-96cd19`, then deleted by Playwright output cleanup before closeout. Durable run `p006-mrin2zvh-ac0f05` later completed P0-006.

### Remaining Manual Verification

1. Run `npm run build:lab`.
2. Run `npm run lab:collector`.
3. Reload MotionOps in Figma Desktop.
4. Open page `MotionOps API Verification`.
5. Open Motion API Lab.
6. Confirm collector is online.
7. Click `Create/Refresh All Test Frames`.
8. Visually confirm generated frames and animations.
9. Click `Run All Tests`.
10. Return after files appear in `test-results/` so evidence can be analyzed.

### Exact Next Action

Superseded: the four-button live flow was later completed in run `p006-mrilvxco-96cd19`, but the evidence was deleted before closeout. Durable run `p006-mrin2zvh-ac0f05` later completed P0-006.

## P0-006 Live Evidence Analysis After Automated Run

Status: SUPERSEDED - invalid selection-zero run remains rejected.

### Evidence Inventory

- `test-results/` contains 81 JSON files.
- 80 files are canonical P0-006 collector envelopes.
- `.last-run.json` is collector state, not evidence.
- All registry-expected R01-R10 evidence files are present.
- No evidence file failed JSON parsing.
- No selected-node Motion read capability is accepted from this run.

### Critical Finding

R02-R10 selected-node envelopes record fixture node IDs and roles, but the nested raw diagnostic results report `raw.environment.selectionCount: 0`. This means the raw commands did not inspect the intended selected nodes.

Examples:

| File | Envelope selected nodes | Raw selected nodes | Result |
|---|---:|---:|---|
| `test-results/R04-multi-property-read-motion-data.json` | 1 | 0 | Invalid for Motion shape verification |
| `test-results/R08-children-selected-read-motion-data.json` | 3 | 0 | Invalid for stagger/multi-selection verification |
| `test-results/R10-mixed-selection-read-current-selection.json` | 3 | 0 | Invalid for mixed-selection verification |

### Files Added Or Changed

- `docs/verification/live-figma/P0-006/EVIDENCE_INVENTORY.md`
- `docs/verification/live-figma/P0-006/README.md`
- `docs/verification/live-figma/P0-006/TEST_MATRIX.md`
- `docs/verification/live-figma/P0-006/RESULTS.md`
- `docs/implementation/API_CAPABILITY_MATRIX.md`
- `docs/implementation/KNOWN_LIMITATIONS.md`
- `docs/implementation/DECISIONS.md`
- `docs/implementation/TASK_LEDGER.md`

### Sanitized Evidence And Fixtures

No sanitized Motion-read fixtures were created. The current selected-node evidence would sanitize misleading empty arrays produced by raw empty selection, not by the intended Motion fixtures.

### Automated Commands

| Command | Result | Notes |
|---|---|---|
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | Vitest: 6 files passed, 29 tests passed. |
| `rtk npm run test:coverage` | PASS | Vitest coverage command passed. |
| `rtk npm run build` | PASS | Production build completed and inlined UI assets. |
| `rtk npm run build:lab` | PASS | Lab build completed and inlined UI assets. |
| `rtk npm run lab:collector:test` | PASS | Node test runner: 4 collector tests passed. |
| `rtk npm run test:build-artifacts` | PASS AFTER PRODUCTION REBUILD | First run after `build:lab` failed because `dist/plugin.js` was lab-flavored; rerunning `npm run build` first made the production artifact check pass. |
| `rtk npm run test:ui` | PASS | Playwright: 4 Chromium tests passed. |
| `rtk npm run verify` | PASS | Typecheck, lint, coverage, production build, artifact test, and Playwright passed. |

### Exact Next Task

Superseded by schema-v2 run `p006-mrilvxco-96cd19`; that run was observed valid but is not durable because the files were deleted during verification. Durable run `p006-mrin2zvh-ac0f05` later completed P0-006.

## P0-006 Explicit Target Runner Correction

Status: SUPERSEDED - corrected live Figma rerun completed and passed.

### Confirmed Root Cause

`runP006Test` looked up intended fixture nodes and wrote those IDs into the evidence envelope, but `runMotionDiagnostic` independently read `figma.currentPage.selection`. At command execution time the raw diagnostic environment reported `selectionCount: 0`, so Motion reads inspected empty selection. The mismatch was caused by using canvas selection as diagnostic input.

### Correction

- Added explicit target specs: `EXPLICIT_NODE_IDS`, `CURRENT_SELECTION`, and `EMPTY`.
- Manual Advanced Lab commands use `CURRENT_SELECTION`.
- P0-006 automated runner uses `EXPLICIT_NODE_IDS` for R02-R10 and `EMPTY` for R01.
- Added resolver using `getNodeByIdAsync`, deterministic de-duplication, requested-order preservation, per-node failure isolation, and wrong-page checks.
- Motion readers iterate over resolved target nodes, not `figma.currentPage.selection`.
- Reveal is best effort and does not control diagnostic truth.
- Added target-pipeline verification command and UI button.
- Run All is disabled until target pipeline verifies Requested `2`, Resolved `2`, Read `2`.
- Added evidence schema version `2`, `runId`, explicit `target`, separate `canvasState`, and `diagnostic.nodesReadCount`.
- Added run manifest support in the collector.
- Corrected R07 to `parent-and-child-explicit-targets`, not canvas multi-selection.

### Files Added Or Changed

- `src/shared/diagnostics.ts`
- `src/shared/messages.ts`
- `src/shared/p006Registry.ts`
- `src/plugin/main.ts`
- `src/plugin/diagnostics/diagnosticRunner.ts`
- `src/plugin/diagnostics/p006Fixtures.ts`
- `src/plugin/diagnostics/targetResolver.ts`
- `src/ui/App.tsx`
- `scripts/motion-evidence-collector.mjs`
- `tests/targetResolver.test.ts`
- `tests/diagnostics.test.ts`
- `tests/p006Registry.test.ts`
- `tests/motion-evidence-collector.test.mjs`
- `tests/ui/motion-api-lab.spec.ts`
- P0-006 and implementation docs.

### Automated Commands

| Command | Result | Notes |
|---|---|---|
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | Vitest: 7 files passed, 33 tests passed. |
| `rtk npm run test:coverage` | PASS | Vitest coverage: 7 files passed, 33 tests passed. |
| `rtk npm run build` | PASS | Production plugin/UI build completed. |
| `rtk npm run build:lab` | PASS | Lab plugin/UI build completed. |
| `rtk npm run lab:collector:test` | PASS | Node test runner: 5 collector tests passed. |
| `rtk npm run test:build-artifacts` | PASS | Passed after production rebuild, as expected. |
| `rtk npm run test:ui` | PASS | Playwright: 4 Chromium tests passed. |
| `rtk npm run verify` | PASS | Typecheck, lint, coverage, production build, artifact check, and UI tests passed. |

### Exact Live Rerun Steps

1. Run `npm run build:lab`.
2. Run `npm run lab:collector`.
3. Reload MotionOps in Figma Desktop.
4. Click `Create/Refresh All Test Frames`.
5. Click `Verify target pipeline`.
6. Confirm Requested `2`, Resolved `2`, Read `2`; canvas selection count is informational.
7. Click `Run All Tests`.
8. Analyze the latest `<runId>.manifest.json` and schema v2 evidence files.

### Exact Next Task

Superseded by durable run `p006-mrin2zvh-ac0f05`; P0-007 is now eligible but not started.

## P0-006 Explicit-Target Durable Live Evidence Acceptance

Status: DONE

### Accepted Run

- Run ID: `p006-mrin2zvh-ac0f05`
- Manifest: `test-results/p006-mrin2zvh-ac0f05.manifest.json`
- Evidence schema version: `2`
- Figma environment: Figma Desktop, disposable `MotionOps API Verification` page, MotionOps lab build
- Verification date: 2026-07-13
- Manifest time: `2026-07-13T03:04:55.325Z` to `2026-07-13T03:04:57.003Z`

This run was present before verification and remained present after the final gate.

### Evidence Integrity

- Manifest references exactly 80 registry evidence files.
- R01-R10 are all present.
- Every evidence file parses as one JSON object.
- Every evidence file uses run ID `p006-mrin2zvh-ac0f05` and schema version `2`.
- Manifest filenames and internal envelope filenames agree.
- No stale evidence from the old selection-zero run is included.
- Target pipeline is PASS with Requested `2`, Resolved `2`, Read `2`.

Pre/post manifest SHA-256: `edf01b79d6c546694f06e349c30664bf62b21657bc4d10e524f4698925e99edd`.

Pre/post evidence combined SHA-256: `28a3ccab5196e2ef99fecae676f5c8d0a6c7af67c87ecb5899b2d58a8261a5ca`.

### Target Provenance

- R01 uses `EMPTY`, requested 0, resolved 0, read 0.
- R02-R10 use `EXPLICIT_NODE_IDS`.
- For every R02-R10 evidence file, envelope requested IDs, envelope resolved IDs, raw diagnostic target IDs, raw node result IDs, and `diagnostic.nodesReadCount` agree.
- Canvas selection is recorded only in `canvasState`; it is not used as diagnostic provenance.
- R07 `parent-and-child-explicit-targets` requests two nodes, resolves two nodes, reads two nodes, preserves order, and does not claim simultaneous Figma canvas selection of a parent and child.

### Motion Read Capabilities Accepted

- `manualKeyframeTracks`: readable for manual opacity, translation, rotation, scale, parent/child, staggered child, and mixed explicit target fixtures.
- `animationStyles`: readable for native style fixtures; empty where the fixture legitimately has no style.
- `animations`: readable as derived Motion data for manual tracks and native styles.
- `timelines`: readable with `id` and `duration` fields across fixtures, including no-Motion or parent-only cases.

### Retention Fix

Playwright's default output directory was `test-results/`, the same directory used by the Motion evidence collector. Running `npm run test:ui` / `npm run verify` cleared the live evidence and wrote `.last-run.json`.

`playwright.config.ts` now sets `outputDir: ".playwright-test-results"`. A sentinel file under `test-results/` survived `npm run test:ui`, and accepted run `p006-mrin2zvh-ac0f05` survived `npm run verify` unchanged.

### Remaining Scope

- Generated fixture writes are development infrastructure only.
- P0-007 manual-track replacement is eligible but not started.

## P0-007 Manual Track Replacement Harness

Status: BLOCKED pending live Figma write evidence.

### Added

- `src/shared/p007Registry.ts` defines W01-W08.
- `src/shared/p007Evidence.ts` provides clone, mutation, ID comparison, diff, duplicate, and schema helpers.
- `src/plugin/diagnostics/p007Fixtures.ts` creates disposable P0-007 fixtures and runs complete-track replacements through `applyManualKeyframeTrack`.
- `src/ui/App.tsx` exposes P0-007 fixture, target-pipeline, run-all, and per-case controls.
- `scripts/motion-evidence-collector.mjs` accepts schema-1 `p007-*` evidence and manifests.

### Automated Verification

| Command | Result | Notes |
|---|---|---|
| `rtk npm run typecheck` | PASS | App/test and plugin TypeScript configs passed. |
| `rtk npm run lint` | PASS | ESLint passed. |
| `rtk npm run test` | PASS | Vitest: 8 files passed, 39 tests passed. |
| `rtk npm run lab:collector:test` | PASS | Node test runner: 6 collector tests passed. |
| `rtk npm run test:ui` | PASS | Playwright: 4 Chromium tests passed. |
| `rtk npm run build:lab` | PASS | Lab plugin/UI build completed and UI assets were inlined. |

### Remaining Blocker

Fresh manual Figma Desktop run `p007-mriq1s7l-2b2f3c` produced retained schema-1 W01-W08 evidence. The manifest remains `accepted=false`, correctly proving the original strict contract failed. P0-007 is DONE as a completed investigation: W02 regenerated edited keyframe ID `6389:165` as `6389:256`, and W04 re-read planned `LINEAR` easing with an extra cubic-bezier field. Track IDs were preserved, duplicate detection passed, W06 sibling isolation passed, W07 repeated replacement kept one logical track, and W08 restoration passed. No P0-007 rerun is required.

## P0-008 Style Instance Harness

Status: DONE

- `src/shared/p008Registry.ts` defines S01-S06 style-instance cases.
- `src/shared/p008Evidence.ts` defines schema-1 style evidence, duplicate detection, style-instance comparison, sibling/timeline fingerprints, classification, and manifest shape.
- `src/plugin/diagnostics/p008Fixtures.ts` creates disposable P0-008 fixtures from `figma.motion.figmaAnimationStyles()` and runs apply/reapply/remove cases.
- `src/ui/App.tsx` exposes P0-008 fixture, target-pipeline, run-all, and per-case controls.
- `scripts/motion-evidence-collector.mjs` accepts `S01`-`S06`, `TEST_STYLE_UPDATE`, and `p008-*.manifest.json`.

Retained live run `p008-mriu1fap-25c85d` produced a manifest and six S01-S06 evidence files, and no case remained `Missing` or `Running`. The run is conclusive partial behavior: every fixture began with one readable applied style instance, S01-S05 direct reapply/update paths duplicated applied style instances, and S06 removed the actual applied instance ID before reapplying the available application ID and ended with one style instance.

## P0-009 Timeline Duration Harness

Status: DONE

- `src/shared/p009Registry.ts` defines T01-T06 timeline-duration cases.
- `src/shared/p009Evidence.ts` defines schema-1 duration, identity, isolation, normalization, and restoration evidence.
- `src/plugin/diagnostics/p009Fixtures.ts` creates disposable P0-009 fixtures and invokes `node.setTimelineDuration(timeline.id, duration)`.
- `src/ui/App.tsx` exposes P0-009 fixture, target-pipeline, run-all, and per-case controls above P0-008.
- `scripts/motion-evidence-collector.mjs` accepts `T01`-`T06`, `TEST_TIMELINE_DURATION`, and `p009-*.manifest.json`.

Retained live run `p009-mrivc1j7-56e68c` produced a manifest and six T01-T06 evidence files. The run proves exact seconds duration writes, immediate re-read, stable timeline identity/count, stable manual tracks/keyframes/styles, accepted below-final-keyframe duration, and restoration. The emitted manifest is accepted=false because the initial harness treated derived animation `timelineDuration` readback as unrelated mutation; the audited behavior is conclusive supported-with-warning. P0-009 does not verify undo grouping.

## P0-010 Undo Boundary Harness

Status: DONE - live behavior is conclusive mixed support.

- `src/shared/p010Registry.ts` defines U01-U10 and the A/B/C strategy IDs.
- `src/shared/p010Evidence.ts` records semantic before/apply/undo/redo snapshots, settled Undo/Redo observations, transaction strategy, source types, counts, fingerprints, rollback result, and terminal classification.
- `src/plugin/diagnostics/p010Fixtures.ts` creates disposable P0-010 fixtures, verifies U03/U05 style readiness with separate application style and applied instance IDs, and runs guided apply/readback actions.
- `src/ui/App.tsx` exposes P0-010 controls above P0-009, including U01 Strategy A/B/C buttons, style readiness, settled Undo/Redo diagnostics, undo confirmation, second-undo confirmation, redo confirmation, and explicit trigger-undo buttons.
- `scripts/motion-evidence-collector.mjs` accepts U01-U10, `TEST_UNDO_BOUNDARY`, and `p010-*.manifest.json`.

Fresh live run set `p010-mriz*` captured U01-U10 with native Redo confirmation. U01 Strategy C proves `commitUndo() -> write` for a one-write manual transaction. U02/U04/U07/U09 and U10 are supported for the tested fixture shapes. U03/U05 are supported-with-warning because native Undo restored original state but one native Redo did not restore the applied style/mixed state. U06 proves separate apply actions require two Undo steps. U08 proves `triggerUndo()` rollback for a controlled partial failure.

## P0-011 Component/Instance Harness

Status: IN_PROGRESS - retained full-run evidence audited but not accepted.

- `src/shared/p011Registry.ts` defines C01-C12.
- `src/shared/p011Evidence.ts` records target provenance, node category, ancestor types, component/variant/instance relationships, source and sibling fingerprints, override/linkage state, capability attempts, and terminal classification.
- `src/plugin/diagnostics/p011Fixtures.ts` creates disposable control, component, component-set, variant, direct-instance, sibling-instance, nested-instance, and style fixtures.
- `src/ui/App.tsx` exposes P0-011 above P0-010 with Create/Refresh, target-pipeline verification, Run All, and per-case buttons.
- `scripts/motion-evidence-collector.mjs` accepts C01-C12, `TEST_COMPONENT_INSTANCE_MATRIX`, and `p011-*.manifest.json`.

Automated checks passed before live interaction: `npm run typecheck`, `npm run lint`, `npm run test -- tests/p011Evidence.test.ts`, `npm run lab:collector:test`, `npm run test:ui`, `npm run test:build-artifacts`, and `npm run build:lab`.

Retained local audit note: full-run manifests `p011-mrj3hhmp-8c99a4` and `p011-mrj3rp4v-d9f405` are rejected because at least one case ended ERROR. Accepted retained manifests are single-case runs only, so P0-011 is not marked DONE from local evidence in this closeout pass.

P0-011 does not investigate component-property keyframe tracks.

## P0-012 Component Property Track Discovery

Status: DONE - focused CP09 live evidence accepted; Phase 0 is complete for starting production adapter work.

- `src/shared/p012Registry.ts` defines CP01-CP10.
- `src/shared/p012Evidence.ts` records source definitions, instance values, stable identifiers, raw Motion/property shapes, semantic classification, writeability, source/sibling/nested/unrelated fingerprints, linkage, restoration, and undo/redo results.
- `src/plugin/diagnostics/p012Fixtures.ts` creates disposable component-property fixtures with boolean, text, instance-swap, variant, target, sibling, nested/control, source, and unrelated Motion nodes.
- `src/ui/App.tsx` exposes P0-012 above P0-011 with Create/Refresh, target-pipeline verification, Run All, and per-case buttons.
- `scripts/motion-evidence-collector.mjs` accepts CP01-CP10, `TEST_COMPONENT_PROPERTY_TRACK`, and `p012-*.manifest.json`.

Automated checks passed before live interaction: `npm run typecheck`, `npm run lint`, `npm run test -- tests/p012Evidence.test.ts tests/p012FixtureConstruction.test.mjs tests/p012Cp09Harness.test.mjs`, `npm run lab:collector:test`, `npm run test:ui`, `npm run test:build-artifacts`, and `npm run build:lab`.

Accepted live manifest:

- `test-results/p012-mrj6qxvi-217610.manifest.json`
- `accepted: true`
- `classification: mixed`
- CP09 terminal classification: `PARTIAL`
- CP09 status: `PARTIAL`
- CP09 errors: none

CP09 proves BOOLEAN component-property write support with partial Undo behavior: `commitUndo() -> write` succeeds and re-reads correctly, while `figma.triggerUndo()` invalidates target/sibling reads instead of restoring semantic state. This is a conclusive supported-with-warning finding, not a harness error.

P0-012 is the final Phase 0 task. Next eligible task: P1-011 - Implement the normalized Figma Motion adapter.
