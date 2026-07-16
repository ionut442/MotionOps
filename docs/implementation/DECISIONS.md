# MotionOps Decision Log

## DEC-001: Bootstrap Stack

- Status: Accepted
- Date: 2026-07-12
- Context: Repository contained only the implementation plan and no existing scaffold.
- Options considered: Preserve existing stack; create minimal TypeScript plugin scaffold; defer scaffold.
- Decision: Use TypeScript with Vite for plugin and UI builds.
- Consequences: Fast local build with strict typing; Figma-specific runtime behavior still requires manual Figma verification.
- Evidence: Repository inspection; official Figma docs for plugin manifest (`https://developers.figma.com/docs/plugins/manifest/`) and UI messaging (`https://developers.figma.com/docs/plugins/creating-ui/`); package metadata lookup for `@figma/plugin-typings`.
- Related tasks: P0-B01, P0-001, P0-002

## DEC-002: UI Framework

- Status: Accepted
- Date: 2026-07-12
- Context: No UI framework existed, and Phase 0 needs a minimal plugin shell plus Playwright smoke test.
- Options considered: Vanilla DOM; React; another framework.
- Decision: Use React for the plugin UI.
- Consequences: Small, familiar UI surface; future product phases can grow component structure without replacing the scaffold.
- Evidence: Empty repository baseline and bootstrap scope.
- Related tasks: P0-B01, P0-B02

## DEC-003: Test Stack

- Status: Accepted
- Date: 2026-07-12
- Context: Phase 0 requires automated typecheck, lint, unit tests, coverage, build, and UI smoke tests.
- Options considered: Vitest plus Playwright; Jest plus Playwright; no UI test until Figma.
- Decision: Use Vitest for unit tests and Playwright against the standalone Vite UI for UI smoke.
- Consequences: UI smoke does not claim Figma API behavior; Figma runtime tests remain manual/future harness work.
- Evidence: Phase 0 requirements and Playwright smoke test design.
- Related tasks: P0-B01, P0-B02

## DEC-004: Runtime Message Validation

- Status: Accepted
- Date: 2026-07-12
- Context: Plugin/UI messages cross a process boundary and must reject malformed payloads safely.
- Options considered: Hand-rolled type guards; schema library.
- Decision: Use small hand-rolled type guards for initial message contracts.
- Consequences: Minimal dependency surface for bootstrap; can migrate to a schema library if message complexity grows.
- Evidence: `src/shared/messages.ts` tests.
- Related tasks: P0-B01

## DEC-005: Standalone UI Development Strategy

- Status: Accepted
- Date: 2026-07-12
- Context: Playwright smoke tests must not require a live Figma session.
- Options considered: Mock in test page; build a separate demo app; reuse actual UI entry point.
- Decision: Reuse `src/ui/index.tsx` through Vite and drive deterministic plugin messages from Playwright.
- Consequences: The tested UI shell is the same entry point bundled for the plugin; Figma API behavior is not inferred from browser-only tests.
- Evidence: `tests/ui/smoke.spec.ts`.
- Related tasks: P0-B02

## DEC-006: Plugin/UI Process Boundary

- Status: Accepted
- Date: 2026-07-12
- Context: Figma API access must stay in the plugin main process.
- Options considered: UI direct Figma access; typed bridge.
- Decision: Keep Figma API usage in `src/plugin/` and communicate through discriminated union messages in `src/shared/`.
- Consequences: UI remains browser-testable and cannot directly mutate Figma documents.
- Evidence: `src/plugin/main.ts`, `src/ui/App.tsx`, `src/shared/messages.ts`.
- Related tasks: P0-B01

## DEC-007: Dynamic Page Manifest

- Status: Accepted
- Date: 2026-07-12
- Context: Official Figma docs require `documentAccess: "dynamic-page"` for new plugins and warn that some sync APIs fail under dynamic-page.
- Options considered: Omit documentAccess; use dynamic-page from the start.
- Decision: Set `"documentAccess": "dynamic-page"` in `manifest.json` and keep plugin architecture async-first.
- Consequences: Future discovery code must use dynamic-page-compatible async APIs and avoid broad implicit document scans.
- Evidence: Figma manifest documentation (`https://developers.figma.com/docs/plugins/manifest/`) and dynamic loading documentation (`https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/`).
- Related tasks: P0-004

## DEC-008: Git Initialization

- Status: Accepted
- Date: 2026-07-12
- Context: Repository was not a Git repository during initial inspection.
- Options considered: Leave uninitialized; initialize Git without committing.
- Decision: Initialize Git without committing or pushing.
- Consequences: Future sessions can inspect working-tree changes, but no history exists until a user-approved commit.
- Evidence: `git status` initially failed with `fatal: not a git repository`.
- Related tasks: P0-001, P0-B03

## DEC-009: Motion API Lab Activation

- Status: Accepted
- Date: 2026-07-12
- Context: P0-005 needs a developer-only diagnostic harness without exposing raw capability tests to normal users.
- Options considered: Hidden route; environment variable; Vite build mode.
- Decision: Enable the lab only in Vite `lab` mode via `__MOTIONOPS_ENABLE_API_LAB__`; use `npm run build:lab` or `npm run dev:lab` for diagnostic sessions.
- Consequences: Normal `npm run build` disables the lab; Playwright runs against lab mode for standalone diagnostics.
- Evidence: `src/shared/labConfig.ts`, Vite configs, `tests/diagnostics.test.ts`, `npm run verify`.
- Related tasks: P0-005

## DEC-010: Diagnostic Protocol

- Status: Accepted
- Date: 2026-07-12
- Context: Diagnostic commands cross the plugin/UI process boundary and must be strict, request-correlated, and serializable.
- Options considered: Reuse ping/pong messages; add typed diagnostic discriminated unions.
- Decision: Add `MOTION_DIAGNOSTIC_REQUEST` and `MOTION_DIAGNOSTIC_RESULT` with command, request ID, status, duration, environment, summary, capabilities, evidence, warnings, and errors.
- Consequences: Later Phase 0 tasks can add command execution without changing the bridge shape.
- Evidence: `src/shared/diagnostics.ts`, `tests/diagnostics.test.ts`.
- Related tasks: P0-005

## DEC-011: Diagnostic Serializer Strategy

- Status: Accepted
- Date: 2026-07-12
- Context: Figma API objects must not be sent directly to the UI, and Motion API beta fields must be retained safely.
- Options considered: `JSON.stringify` directly; defensive serializer with depth/array/key limits.
- Decision: Use a defensive diagnostic serializer that skips accessors, detects circular references, marks truncation, represents `undefined` and non-finite numbers, and preserves safe enumerable unknown fields.
- Consequences: Diagnostic raw output is safe for the lab but is not the future production Motion adapter.
- Evidence: `src/shared/diagnosticSerializer.ts`, `tests/diagnosticSerializer.test.ts`.
- Related tasks: P0-005, P0-006

## DEC-012: Fixture Ownership Strategy

- Status: Accepted
- Date: 2026-07-12
- Context: P0-005 needs disposable fixture support without risking user-created nodes.
- Options considered: Delete by fixture name; delete by stored IDs; delete by page scan.
- Decision: Store created fixture node IDs in `figma.clientStorage` and clean up only registered nodes/root, never nodes merely matching `__MOTIONOPS_API_LAB__` by name.
- Consequences: Fixture cleanup is explicit and ownership-based; future destructive diagnostics must target registered fixture nodes only.
- Evidence: `src/plugin/diagnostics/fixture.ts`, `src/plugin/diagnostics/fixtureRegistry.ts`, `tests/diagnostics.test.ts`.
- Related tasks: P0-005

## DEC-013: Result Truncation Limits

- Status: Accepted
- Date: 2026-07-12
- Context: Motion diagnostic payloads may include large or beta-shaped objects.
- Options considered: Unlimited raw dumps; fixed defensive limits.
- Decision: Default diagnostic serialization limits are depth 6, 25 array items, and 40 object keys, with explicit truncation markers and warnings.
- Consequences: UI results remain usable and serializable; large raw dumps require live follow-up with targeted commands.
- Evidence: `src/shared/diagnosticSerializer.ts`, `tests/diagnosticSerializer.test.ts`.
- Related tasks: P0-005

## DEC-014: P0-006 Evidence Storage Boundary

- Status: Accepted
- Date: 2026-07-12
- Context: P0-006 requires real Figma Motion API shapes without storing confidential file contents or overloading summary docs with raw dumps.
- Options considered: Store raw dumps only; store sanitized fixtures only; store paired raw and sanitized exports.
- Decision: Store raw disposable-file exports under `docs/verification/live-figma/P0-006/raw/` and sanitized structure-preserving exports under `docs/verification/live-figma/P0-006/sanitized/`.
- Consequences: Raw evidence remains inspectable for local verification, sanitized data can become regression fixtures, and summaries cite files instead of pasting complete dumps.
- Evidence: `docs/verification/live-figma/P0-006/README.md`, `docs/verification/live-figma/P0-006/TEST_MATRIX.md`, `docs/verification/live-figma/P0-006/RESULTS.md`.
- Related tasks: P0-006

## DEC-015: Figma UI Build Must Be Single-HTML

- Status: Accepted
- Date: 2026-07-12
- Context: Figma Desktop opened the plugin window but rendered a blank body after `npm run build:lab`.
- Options considered: Keep external Vite assets; use a dev server; inline UI JavaScript and CSS into `dist/index.html`.
- Decision: Run `scripts/inline-figma-ui.mjs` after UI builds so `dist/index.html` contains the UI script and stylesheet directly.
- Consequences: `figma.showUI(__html__)` receives a complete UI payload; standalone Playwright tests still serve the same built HTML.
- Evidence: `npm run build:lab` output shows one script and one stylesheet inlined; `tests/inlineFigmaUi.test.mjs`; `npm run verify` PASS.
- Related tasks: P0-005

## DEC-016: P0-006 Evidence Collection Boundary

- Status: Accepted
- Date: 2026-07-12
- Context: Figma plugins cannot write directly to the local filesystem, but P0-006 needs deterministic JSON files from live plugin runs.
- Options considered: Manual clipboard export; plugin UI download blobs; localhost collector.
- Decision: Use a development-only localhost collector at `http://localhost:3847/api/evidence`, enabled only by lab workflow and manifest `devAllowedDomains`.
- Consequences: Live Figma work becomes button-driven, while production builds remain independent from the collector.
- Evidence: `scripts/motion-evidence-collector.mjs`, `tests/motion-evidence-collector.test.mjs`, `manifest.json`.
- Related tasks: P0-006A

## DEC-017: P0-006 Fixture Ownership

- Status: Accepted
- Date: 2026-07-12
- Context: Generated live fixtures must be refreshable without deleting user-created R02/R03 evidence nodes.
- Options considered: Delete by frame name; delete by generated root registry; delete all matching page nodes.
- Decision: Store generated root/node IDs in `figma.clientStorage` and tag generated nodes with plugin data owner `P0-006`, test case, and role.
- Consequences: Create/Refresh removes only owned generated fixtures; manual R02/R03 nodes are preserved.
- Evidence: `src/plugin/diagnostics/p006Fixtures.ts`.
- Related tasks: P0-006C

## DEC-018: P0-006 Canonical Evidence Validation

- Status: Accepted
- Date: 2026-07-12
- Context: The automated live run produced all R01-R10 files under `test-results/`, but selected-node envelopes disagreed with raw diagnostic selection counts.
- Options considered: Accept empty Motion arrays as unsupported; accept only R01; require envelope/raw selection agreement before Motion conclusions.
- Decision: Superseded by DEC-020 and DEC-023. The original rule rejected the invalid selection-based run; accepted evidence now requires schema-v2 explicit target agreement between envelope, raw target summary, raw node results, and `diagnostic.nodesReadCount`.
- Consequences: The 2026-07-12 run remains rejected; the 2026-07-13 explicit-target run can be evaluated without depending on canvas selection.
- Evidence: `docs/verification/live-figma/P0-006/EVIDENCE_INVENTORY.md`.
- Related tasks: P0-006

## DEC-019: P0-006 Sanitized Fixture Boundary

- Status: Accepted
- Date: 2026-07-12
- Context: Sanitized fixtures must preserve real live structure, but the current selected-node captures came from raw empty selections.
- Options considered: Sanitize all current envelopes; create focused fixtures from empty arrays; wait for valid selected-node evidence.
- Decision: Do not create Motion read regression fixtures from the invalid selected-node run.
- Consequences: Regression fixtures remain blocked until a rerun captures raw diagnostics for the intended nodes.
- Evidence: `docs/verification/live-figma/P0-006/RESULTS.md`.
- Related tasks: P0-006

## DEC-020: P0-006 Explicit Target Diagnostics

- Status: Accepted
- Date: 2026-07-13
- Context: The 2026-07-12 live run recorded intended selected node IDs in envelopes, but raw diagnostics read `figma.currentPage.selection` and saw zero selected nodes.
- Options considered: Add selection-change waits; retry canvas selection; pass explicit node IDs into diagnostics.
- Decision: Automated P0-006 diagnostics use explicit target node IDs resolved with `getNodeByIdAsync`; canvas selection is only visual reveal.
- Consequences: Evidence success is based on requested/resolved/read counts, not `raw.environment.selectionCount`.
- Evidence: `src/plugin/diagnostics/targetResolver.ts`, `src/plugin/diagnostics/diagnosticRunner.ts`, `src/plugin/diagnostics/p006Fixtures.ts`.
- Related tasks: P0-006

## DEC-021: P0-006 Evidence Schema Version 2

- Status: Accepted
- Date: 2026-07-13
- Context: Older evidence mixed intended envelope selection with raw canvas selection, making acceptance ambiguous.
- Options considered: Keep old fields; add compatibility fields; replace with target/canvas/diagnostic sections.
- Decision: Future collector output uses `evidenceSchemaVersion: 2`, `runId`, `target`, `canvasState`, and `diagnostic.nodesReadCount`.
- Consequences: Analysis uses the latest run manifest and explicit target counts; old 2026-07-12 files remain invalid-run evidence.
- Evidence: `src/shared/diagnostics.ts`, `scripts/motion-evidence-collector.mjs`.
- Related tasks: P0-006

## DEC-022: R07 Parent/Child Explicit Multi-Target

- Status: Accepted
- Date: 2026-07-13
- Context: Figma canvas selection cannot reliably contain a parent and descendant simultaneously.
- Options considered: Force canvas multi-selection; split parent/child only; use explicit multi-target read.
- Decision: R07 uses `parent-only`, `child-only`, and `parent-and-child-explicit-targets`.
- Consequences: R07 no longer claims parent+child canvas multi-selection; it verifies multi-node diagnostic reads.
- Evidence: `src/shared/p006Registry.ts`, `tests/p006Registry.test.ts`.
- Related tasks: P0-006

## DEC-023: P0-006 Evidence Retention Boundary

- Status: Superseded by DEC-024
- Date: 2026-07-13
- Context: Fresh live Figma run `p006-mrilvxco-96cd19` produced schema-v2 evidence for all R01-R10 registry cases, but `npm run test:ui` / `npm run verify` deleted it because Playwright defaulted to `test-results/`.
- Options considered: Accept the in-memory audit anyway; manually recreate evidence files; keep P0-006 blocked and fix the output-directory collision.
- Decision: P0-006 stayed blocked at that point, and Playwright `outputDir` was set to `.playwright-test-results`.
- Consequences: Future full verification gates should not erase Motion evidence. The deleted run remains diagnostic-only and cannot close P0-006; DEC-024 accepts the later durable rerun.
- Evidence: `playwright.config.ts`, `docs/verification/live-figma/P0-006/EVIDENCE_INVENTORY.md`, current `test-results/.last-run.json`.
- Related tasks: P0-006

## DEC-024: P0-006 Durable Motion Read Evidence Accepted

- Status: Accepted
- Date: 2026-07-13
- Context: After the Playwright output directory was moved to `.playwright-test-results`, live Figma run `p006-mrin2zvh-ac0f05` produced a schema-v2 manifest and all 80 registry evidence files under `test-results/`.
- Options considered: Keep P0-006 blocked because a previous run was deleted; accept the durable rerun after pre/post inventory and full verification; start P0-007 immediately.
- Decision: Accept `p006-mrin2zvh-ac0f05` as the P0-006 read-verification run and stop before P0-007.
- Consequences: Read access to `animations`, `manualKeyframeTracks`, `animationStyles`, and `timelines` is live verified for the P0-006 fixtures. Motion writes, timeline mutation, undo grouping, component/instance boundaries, and sanitized regression fixtures remain future work.
- Evidence: `test-results/p006-mrin2zvh-ac0f05.manifest.json`, `.cache/p006-pre-inventory.json`, `.cache/p006-post-inventory.json`, `docs/verification/live-figma/P0-006/EVIDENCE_INVENTORY.md`.
- Related tasks: P0-006, P0-006E

## DEC-025: P0-007 Evidence Is Separate From P0-006 Read Evidence

- Status: Accepted
- Date: 2026-07-13
- Context: Manual-track replacement is a write-safety investigation and must not overload P0-006 schema-v2 read evidence.
- Options considered: Extend P0-006 files; add ad hoc write dumps; create a P0-007 schema and runner.
- Decision: Use a P0-007-specific registry, schema-1 evidence records, `p007-*` run IDs, and explicit write-case UI controls.
- Consequences: P0-007 can prove or reject replacement behavior case-by-case without changing the accepted P0-006 read run. The replacement contract itself remains undecided until live evidence is retained.
- Evidence: `src/shared/p007Registry.ts`, `src/shared/p007Evidence.ts`, `src/plugin/diagnostics/p007Fixtures.ts`, `tests/p007Evidence.test.ts`.
- Related tasks: P0-007

## DEC-026: P0-007 Strict Contract Failed But Investigation Completed

- Status: Accepted
- Date: 2026-07-13
- Context: Fresh live Figma run `p007-mriq1s7l-2b2f3c` produced schema-1 evidence for W01-W08 and retained the files under `test-results/`.
- Options considered: Require another P0-007 rerun; accept partial behavior as full success; close the investigation while preserving `accepted=false` as proof that the original strict contract failed.
- Decision: Mark P0-007 DONE as an investigation. The manifest remains accepted=false because W02 regenerated edited keyframe ID `6389:165` as `6389:256`, and W04 re-read a planned `LINEAR` easing with an additional cubic-bezier field.
- Consequences: Manual full-track replacement is feasible for tested OPACITY and TRANSLATION_X shapes only with mandatory post-write re-read/remap. Production code must not rely on edited keyframe-ID stability. Easing comparison must be semantic and preserve raw readback.
- Evidence: `test-results/p007-mriq1s7l-2b2f3c.manifest.json`, `.cache/p007-pre-inventory.json`, `docs/verification/live-figma/P0-007/RESULTS.md`.
- Related tasks: P0-007

## DEC-027: P0-008 Uses Apply/Remove Style Semantics

- Status: Accepted
- Date: 2026-07-13
- Context: Installed `@figma/plugin-typings` exposes native Motion style readback and apply/remove APIs, but no update-in-place method for an existing applied animation style instance.
- Options considered: Assume `applyAnimationStyle` updates an existing instance; attempt plugin-side native style creation; build a live matrix that classifies actual apply/reapply/remove behavior.
- Decision: Build P0-008 around `figma.motion.figmaAnimationStyles()`, `node.animationStyles`, `node.applyAnimationStyle(styleId, config)`, and `node.removeAnimationStyle(id)`. Do not attempt Motion style creation if unavailable. Treat duplication, read-only behavior, identity regeneration, unsupported behavior, or mixed outcomes as valid investigation conclusions when live evidence is conclusive.
- Consequences: P0-008 is DONE after retained live run `p008-mriu1fap-25c85d`: direct style reapply/update duplicates applied style instances, while removing the applied instance ID and reapplying the available application ID ends with one style instance. Product style-writing must use remove/reapply with re-read and duplicate checks if implemented later.
- Evidence: `src/shared/p008Registry.ts`, `src/shared/p008Evidence.ts`, `src/plugin/diagnostics/p008Fixtures.ts`, `tests/p008Evidence.test.ts`, `tests/p008Runner.test.mjs`, `docs/verification/live-figma/P0-008/README.md`, `test-results/p008-mriu1fap-25c85d.manifest.json`.
- Related tasks: P0-008

## DEC-028: P0-009 Timeline Duration Writes Require Re-Read And Max-Keyframe Policy

- Status: Accepted
- Date: 2026-07-13
- Context: Installed `@figma/plugin-typings` exposes `setTimelineDuration(id: string, duration: number): void` on Motion nodes. Retained live run `p009-mrivc1j7-56e68c` proves exact duration writes are immediately readable and restorable, including a below-final-keyframe write.
- Decision: Product timeline duration writes must use explicit target provenance, write seconds with `setTimelineDuration`, immediately re-read `node.timelines`, and enforce a product max-keyframe policy before allowing below-final-keyframe durations.
- Consequences: Timeline identity/count, manual tracks/keyframes, and animation styles were stable in P0-009. Derived animation `timelineDuration` changes with the timeline duration and must be treated as expected readback, not unrelated mutation. P0-009 does not verify undo grouping.
- Evidence: `src/shared/p009Registry.ts`, `src/shared/p009Evidence.ts`, `src/plugin/diagnostics/p009Fixtures.ts`, `tests/p009Evidence.test.ts`, `tests/p009Runner.test.mjs`, `docs/verification/live-figma/P0-009/README.md`, `test-results/p009-mrivc1j7-56e68c.manifest.json`.
- Related tasks: P0-009

## DEC-029: P0-010 Uses Guided Native Undo Evidence, Not A Production Abstraction

- Status: Accepted
- Date: 2026-07-13
- Context: `commitUndo()` and `triggerUndo()` have simple synchronous typings, but Motion-specific grouping, no-op, async, partial failure, and rollback safety require persistent Figma undo-stack evidence.
- Decision: Build P0-010 as a guided Phase 0 lab harness with disposable fixtures, semantic snapshots, explicit native undo/redo confirmation buttons, and a separate explicit `triggerUndo()` probe. Do not implement a production `UndoTransaction` abstraction in P0-010.
- Consequences: The user performs only named UI actions and native undo/redo when instructed. The resulting evidence can support, partially support, reject, or mark unsafe each undo behavior without starting P0-011 or Phase 1.
- Evidence: `src/shared/p010Registry.ts`, `src/shared/p010Evidence.ts`, `src/plugin/diagnostics/p010Fixtures.ts`, `tests/p010Evidence.test.ts`, `docs/verification/live-figma/P0-010/README.md`.
- Related tasks: P0-010

## DEC-030: P0-010 Must Resolve Commit Ordering Before Matrix Expansion

- Status: Accepted
- Date: 2026-07-13
- Context: The redo-enabled U01-U10 run showed U01/U02/U04/U06/U09/U10 staying at the applied semantic fingerprint after native Undo and second Undo. That points to wrong commit ordering or no created history entry for the tested ordering, not a full-matrix conclusion.
- Decision: Add bounded settled-state observation and test U01 Strategy A/B/C before asking for another matrix run. Expand to U02/U03/U04/U05/U06/U09/U10 only after U01 proves a safe ordering, or close P0-010 as unsupported/unsafe if all documented candidates fail.
- Consequences: This decision governed the corrected live rerun. Final `p010-mriz*` evidence resolved the ordering search and is captured by DEC-031.
- Evidence: `src/shared/p010Evidence.ts`, `src/plugin/diagnostics/p010Fixtures.ts`, `src/ui/App.tsx`, `tests/p010Evidence.test.ts`, `docs/verification/live-figma/P0-010/RESULTS.md`.
- Related tasks: P0-010

## DEC-031: Product Undo Must Preserve P0-010 Case-Specific Boundaries

- Status: Accepted
- Date: 2026-07-13
- Context: Final P0-010 live evidence `p010-mriz*` captured native Undo and native Redo across U01-U10 after the corrected Strategy C and redo-confirmation harness.
- Decision: Treat `commitUndo()` grouping as supported only with the case-specific evidence constraints: U01 one-write manual transactions use `commitUndo() -> write`; U02/U04/U07/U09 and U10 may use the proven tested orderings; U06 separate apply actions intentionally produce two undo steps; U03/U05 must carry redo warnings; U08 may use `triggerUndo()` as rollback for controlled partial failure.
- Consequences: Product code must re-read after Undo/Redo-sensitive paths and must not promise that style-involved Redo restores applied state. There is no plugin-side redo API in installed typings.
- Evidence: `docs/verification/live-figma/P0-010/RESULTS.md`, `docs/verification/live-figma/P0-010/EVIDENCE_INVENTORY.md`, `tests/p010Evidence.test.ts`.
- Related tasks: P0-010

## DEC-032: P0-011 Classifies Component And Instance Boundaries Without Product Support

- Status: Accepted
- Date: 2026-07-13
- Context: Component, component-set, instance, and nested-instance Motion behavior cannot be inferred from TypeScript structural compatibility. Live writes may be accepted, rejected, redirected, inherited, copied, or converted into local overrides depending on node category.
- Decision: Build P0-011 as a Phase 0 capability investigation with disposable fixtures and C01-C12 evidence. The runner records target provenance, ancestor types, source/variant/instance relationships, source and sibling fingerprints, override/linkage state, manual/style/timeline attempts, and representative undo restoration. It never detaches instances and treats read-only or unsupported behavior as conclusive when evidence terminates.
- Consequences: Product component support remains unimplemented. P0-011 can finish with supported, partial, read-only, unsupported, or mixed classifications. Component-property keyframe tracks stay out of scope for P0-012.
- Evidence: `src/shared/p011Registry.ts`, `src/shared/p011Evidence.ts`, `src/plugin/diagnostics/p011Fixtures.ts`, `tests/p011Evidence.test.ts`, `scripts/motion-evidence-collector.mjs`, `tests/ui/motion-api-lab.spec.ts`.
- Related tasks: P0-011, P0-012

## DEC-033: P0-012 Classifies Component Property Tracks Before Production Adapter Work

- Status: Accepted
- Date: 2026-07-13
- Context: Figma exposes component-property APIs in typings, but Motion track representation, stable property identifiers, writeability, overrides, undo behavior, and source/sibling isolation require live evidence.
- Decision: Build P0-012 as the final Phase 0 lab harness with disposable component-property fixtures and CP01-CP10 evidence. The runner records source definitions, target/sibling values, raw Motion/property shapes, semantic track classification, writeability, isolation fingerprints, linkage, restoration, and undo results. Unsupported or read-only property kinds terminate as evidence instead of blocking the whole run.
- Consequences: P1-011 does not begin until P0-012 live evidence is conclusive and Phase 0 is formally closed. The production normalized Figma Motion adapter must consume these limitations instead of inferring support from typings alone.
- Evidence: `src/shared/p012Registry.ts`, `src/shared/p012Evidence.ts`, `src/plugin/diagnostics/p012Fixtures.ts`, `tests/p012Evidence.test.ts`, `scripts/motion-evidence-collector.mjs`, `tests/ui/motion-api-lab.spec.ts`.
- Related tasks: P0-012, P1-011

## DEC-034: Production Motion Access Goes Through A Normalized Adapter

- Status: Accepted
- Date: 2026-07-13
- Context: Phase 0 proved Motion reads/writes have source-specific limitations, unstable keyframe IDs, style identity traps, timeline seconds at the Figma boundary, and partial component-property Undo behavior.
- Options considered: Let feature code read raw Motion fields; reuse Phase 0 diagnostic serializers; create a production adapter with normalized domain shapes.
- Decision: Add `src/plugin/motion/` as the production Figma Motion boundary. It resolves nodes asynchronously, normalizes `animations`, `manualKeyframeTracks`, `animationStyles`, `timelines`, and component-property data before returning snapshots, exposes granular capabilities and typed warnings, and keeps raw/unknown beta data only in explicit diagnostics.
- Consequences: Future product features must consume normalized snapshots and verified write primitives rather than raw Figma Motion objects. P1-011 returns post-write normalized actual state after re-read, but does not implement P1-012 expected/actual diff orchestration.
- Evidence: `src/plugin/motion/`, `tests/motionAdapter.test.ts`; validation passed with `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:build-artifacts`.
- Related tasks: P1-011

## DEC-035: Production Verification Uses Projection Expectations

- Status: Accepted
- Date: 2026-07-13
- Context: P1-011 write primitives already return fresh normalized post-write snapshots, but they did not compare intended postconditions against actual readback. Phase 0 also proved unstable keyframe IDs, unsafe direct style reapply, exact millisecond timeline rules, and CP09 Undo warnings.
- Options considered: Require callers to build full artificial snapshots; compare raw Figma objects; add a projection-based verification layer over normalized production data.
- Decision: Add projection-based `MotionWriteExpectation` contracts and a centralized `verifyMotionWrite()` report layer under `src/plugin/motion/`. It compares only normalized data, supports accepted write primitives, ignores unstable IDs as semantic identity, sorts differences/warnings deterministically, and lets callers pass an already fresh post-write snapshot when a write primitive just re-read.
- Consequences: Product callers can distinguish `verified`, `verified-with-warning`, `partial`, `mismatch`, and `unverifiable` without raw Figma access. Stale-data blocking, undo orchestration, UI, multi-operation planning, and unsupported writes remain separate future tasks.
- Evidence: `src/plugin/motion/expectations.ts`, `src/plugin/motion/semantic-equality.ts`, `src/plugin/motion/diff.ts`, `src/plugin/motion/verification.ts`, `tests/motionVerification.test.ts`; validation passed with focused verifier tests, typecheck, lint, full test suite, build, and build-artifact tests.
- Related tasks: P1-012

## DEC-036: Stale Protection Uses Semantic Guard Fingerprints, Not Snapshot IDs

- Status: Accepted
- Date: 2026-07-13
- Context: Future Motion writes need to know whether the relevant normalized state changed between preview and apply. P1-011 provides fresh normalized reads and P1-012 verifies expected post-write outcomes, but neither blocks a write prepared from stale input. Phase 0 also proved keyframe IDs and applied style-instance IDs are not stable semantic identity.
- Options considered: Treat matching snapshot IDs as freshness proof; fingerprint entire snapshots; fingerprint operation-specific normalized projections and keep operational IDs separate.
- Decision: Add `MotionStateGuard` and centralized stale checking under `src/plugin/motion/stale-detection.ts`. Guards fingerprint only operation-relevant normalized projections with canonical serialization and a deterministic non-secret hash. Snapshot IDs are recorded only for diagnostics; a new snapshot ID with identical relevant state remains current, and a matching snapshot ID is never sufficient proof of freshness.
- Consequences: Future write flows should preview, capture a guard, freshly check the guard before apply, block on stale/unverifiable state, then apply and use P1-012 verification. P1-013 does not apply writes, rescan, rebase, or implement UI. Keyframe IDs and applied style-instance IDs may produce warnings as execution-safety metadata but do not stale semantic guards by themselves.
- Evidence: `src/plugin/motion/fingerprint.ts`, `src/plugin/motion/stale-detection.ts`, `tests/motionStaleDetection.test.ts`; validation passed with focused stale tests, neighboring Motion tests, typecheck, lint, full test suite, build, and build-artifact tests.
- Related tasks: P1-013

## DEC-037: Motion Development Logs Are Structured, Sanitized, And Local Only

- Status: Accepted
- Date: 2026-07-13
- Context: P1-011 through P1-013 established production Motion boundaries for normalized adapter reads/writes, verification, and stale-data checks. These operations need diagnosis during development, but Motion snapshots, raw Figma objects, layer/page/text names, raw values, and expected/actual diff payloads can contain design-file content.
- Options considered: Let Motion code call `console` directly; reuse Phase 0 diagnostic evidence shapes; create a typed local logging abstraction with a strict sanitizer and no transport.
- Decision: Add `MotionLogger` and `MotionLogEvent` under `src/plugin/motion/log.ts`. Production Motion operations emit discriminated structured events for reads, writes, verification, and stale checks through injectable loggers. Events include operation IDs, request IDs, permitted node IDs, operation kind, counts, capability/source states, warning/difference/error codes, outcomes, and elapsed durations. Events do not include raw Motion values, complete snapshots, raw Figma objects, page/layer/text names, expected/actual values, stacks, or arbitrary caller objects.
- Consequences: The default logger is no-op, the development console logger emits compact JSON records, and the in-memory logger supports deterministic tests. Logger, clock, sanitizer, and serialization failures are best-effort and cannot break Motion operations. This boundary is suitable for a future privacy-safe analytics abstraction, but P1-014 adds no backend, network call, persistence layer, telemetry transport, or analytics SDK.
- Evidence: `src/plugin/motion/log.ts`, `src/plugin/motion/read.ts`, `src/plugin/motion/write.ts`, `src/plugin/motion/verification.ts`, `src/plugin/motion/stale-detection.ts`, `tests/motionLogging.test.ts`; validation passed with focused logging tests, neighboring Motion tests, typecheck, lint, full test suite, build, build-artifact tests, and compact Node REPL serialization/redaction checks.
- Related tasks: P1-014

## DEC-038: Motion Test Runtime Mocks The Production Boundary, Not Live Figma

- Status: Accepted
- Date: 2026-07-13
- Context: P1-011 through P1-014 production Motion code depends on async node resolution, normalized reads, accepted write primitives, fresh post-write re-reads, verification, stale guards, and structured logging. Existing tests duplicated ad hoc raw nodes and global `figma` stubs, which made fresh-reference and call-order assertions harder to maintain.
- Options considered: Keep per-test `figma` stubs; modify production adapter behavior to accept a runtime dependency; add a reusable typed test runtime that installs only the current production Figma boundary.
- Decision: Add `tests/helpers/figma-runtime/` with a typed `FigmaRuntime`, raw Motion builders, and scenario builders. The runtime installs an isolated test-only `figma` global, returns fresh wrappers over shared document state, records sanitized call history, supports deterministic failure injection, and models only the accepted production subset. Production code remains unchanged.
- Consequences: Motion integration tests can assert lookup/write/re-read ordering and failure behavior without broad monkey-patching or live Figma. The mock is not capability evidence and must not replace accepted Phase 0 live runs for beta API behavior, undo behavior, style duplication, component restrictions, or page-load performance.
- Evidence: `tests/helpers/figma-runtime/runtime.ts`, `tests/helpers/figma-runtime/motion-builders.ts`, `tests/motionRuntime.test.ts`, migrated assertions in `tests/motionAdapter.test.ts`; validation passed with focused runtime tests, affected Motion tests, typecheck, lint, full unit suite, build, and build-artifact tests.
- Related tasks: P1-015

## DEC-039: Phase 1 Verification Uses A Canonical Node Orchestrator

- Status: Accepted
- Date: 2026-07-13
- Context: `package.json` had a partial `verify` chain that mixed currently applicable production gates with coverage reporting and Playwright UI smoke. P1-016 needed one cross-platform command that runs the non-manual Phase 1 foundation gates in deterministic order, labels failures, stops on the first required failure, and remains suitable for future CI.
- Options considered: Keep a raw npm `&&` chain; add a third-party task runner; add a small Node orchestrator over existing package scripts.
- Decision: `npm run verify` invokes `node scripts/verify.mjs`. The script delegates to existing scripts for typecheck, lint, full automated tests, production build, and build-artifact validation. It runs child commands through argument arrays with `shell: false`, uses npm's own CLI path when invoked by npm, forwards stdout/stderr, records simple wall-clock timings, supports `--list` and `--from=<stage>`, and rejects duplicate, malformed, interactive, network, live-Figma, UI, or shell-specific stages.
- Consequences: Build-artifact validation always follows the production build from the same verification invocation. Coverage reporting remains excluded until accepted thresholds make it an enforceable gate. Playwright UI smoke and live Figma evidence remain outside the P1-016 verifier unless a later task explicitly promotes them to a non-manual gate.
- Evidence: `scripts/verify.mjs`, `tests/verifyScript.test.mjs`, `package.json`, `docs/verification/PHASE-01.md`; validation passed with focused verifier tests, typecheck, lint, full automated suite, production build, build-artifact tests, and final `npm run verify`.
- Related tasks: P1-016

## DEC-040: Production Shell Owns Layout While Plugin Owns Window Resizing

- Status: Accepted
- Date: 2026-07-13
- Context: P2-001 begins the production UI shell after the Phase 1 foundation gate. The existing UI was the Phase 0 lab surface, and `figma.showUI` still used a small bootstrap size.
- Options considered: Keep the lab surface; add a second shell around lab controls; replace the production surface with a reusable shell and keep resize as a typed plugin/UI contract.
- Decision: Use a `1080x760` default plugin window and `760x560` minimum. Centralize sizing and normalization in `src/shared/pluginWindow.ts`. The UI owns shell rendering, responsive layout, pointer interaction, and proposed dimensions. The plugin process owns `figma.showUI` and `figma.ui.resize`.
- Consequences: Future workspaces can occupy semantic header/navigation/main/context/footer regions without importing Figma globals into UI code. Resize messages are finite-number validated, rounded to integers, clamped to minimums, and request-correlated. No explicit maximum size is enforced in P2-001.
- Evidence: `src/shared/pluginWindow.ts`, `src/plugin/windowResize.ts`, `src/plugin/main.ts`, `src/ui/App.tsx`, `tests/pluginWindow.test.ts`, `tests/windowResize.test.ts`, `tests/ui/smoke.spec.ts`, `docs/verification/PHASE-02.md`.
- Related tasks: P2-001

## DEC-041: Workspace Navigation Is Local Accessible Tabs

- Status: Accepted
- Date: 2026-07-13
- Context: P2-002 establishes only top-level workspace navigation after the P2-001 shell. The UI must expose Scope, Inspect, Edit, Sequence, and Review without starting the P2-003 application state machine or any feature-specific Motion workflow.
- Options considered: Keep static shell placeholders; use landmark navigation with local active state; use ARIA tabs with roving tab stop and tab panels.
- Decision: Add `src/ui/workspaces.ts` as the single source of truth for workspace IDs, labels, order, stable tab IDs, and stable panel IDs. Render the workspaces as a vertical ARIA tab interface in the shell navigation region. Scope is the deterministic initial workspace. Selection follows keyboard focus for `ArrowDown`, `ArrowUp`, `ArrowRight`, `ArrowLeft`, `Home`, and `End`; arrow navigation wraps at both ends. `Enter` and `Space` activate the focused tab as a no-op-safe confirmation. Active workspace state remains local React state and resets to Scope on reload or plugin reopen.
- Consequences: P2-002 adds no plugin messages, Figma API access, Motion adapter import, persistence, analytics, network call, or feature state. Only the active neutral workspace panel is rendered and exposed to assistive technologies. Future workspace functionality can replace panel placeholders without changing workspace identity or order.
- Evidence: `src/ui/workspaces.ts`, `src/ui/App.tsx`, `src/ui/styles.css`, `tests/workspaces.test.ts`, `tests/ui/smoke.spec.ts`, `tests/buildArtifacts.test.mjs`, `docs/verification/PHASE-02.md`.
- Related tasks: P2-002

## DEC-042: Application Lifecycle State Is A Small Session-Only Machine

- Status: Accepted
- Date: 2026-07-14
- Context: P2-003 needs a shared global document/workflow lifecycle for later Phase 2 tasks without starting P2-004 header presentation, Scope scanning, Motion reads, editing, change plans, or feature-specific stores. P2-002 already established workspace navigation as local session state.
- Options considered: Add unrelated booleans to `App.tsx`; introduce a broad global store; add a small typed transition engine with a React provider.
- Decision: Add a pure discriminated-union lifecycle machine in `src/ui/applicationState.ts` and wrap the production UI with `ApplicationStateProvider`. The lifecycle states are `initializing`, `synced`, `draft`, `applying`, `stale`, and `error`. Events are a closed union for initialization, draft, apply, stale/sync, recovery, and reset. Invalid transitions return an explicit serializable `{ ok: false, state, error }` result and preserve the original state.
- Consequences: Lifecycle state is session-only and not persisted to local storage, plugin data, backend storage, or reopened plugin state. The machine stores only safe serializable error/stale projections and no raw Error, Figma object, Motion snapshot, selection/scope data, change plan, React node, callback, analytics, or network state. Workspace navigation remains independent: navigation changes do not alter lifecycle state, lifecycle events do not switch workspaces, and P2-003 renders no header status, badge, disabled workspace, or debug control.
- Evidence: `src/ui/applicationState.ts`, `src/ui/applicationStateContext.ts`, `src/ui/ApplicationStateProvider.tsx`, `src/ui/index.tsx`, `tests/applicationState.test.ts`, `tests/applicationStateProvider.test.tsx`, `tests/ui/smoke.spec.ts`, `docs/verification/PHASE-02.md`.
- Related tasks: P2-003, P2-004, P2-015

## DEC-043: Global Header Presents Only Reliable UI State

- Status: Accepted
- Date: 2026-07-14
- Context: P2-004 replaces the static production-shell header after P2-003. The header can reliably know only product identity, active workspace, and the session-local lifecycle state. Scope scanning, document names, selection breadcrumbs, target counts, standards, settings, Motion reads, and context drawer behavior are later tasks.
- Options considered: Keep the placeholder header; add visible disabled future controls; render a focused global header with only current state.
- Decision: Add `GlobalHeader`, `DocumentStatus`, and a pure `getDocumentStatusPresentation()` mapping. The header renders `MotionOps`, the active workspace label from `src/ui/workspaces.ts`, and lifecycle status from the P2-003 provider. Lifecycle states map exhaustively to Initializing, Synced, Draft changes, Applying, Stale, and Error with tones, descriptions, and busy semantics. Status uses text plus a marker/shape and accessible description, not color alone.
- Consequences: The header is presentational and sends no plugin messages. Workspace state remains owned by P2-002 navigation and lifecycle state remains owned by P2-003. Workspace changes update only workspace context; lifecycle changes update only document status. Error presentation uses only the safe lifecycle summary, stale presentation uses only safe category text, and ordinary UI never shows operation IDs, fingerprints, raw stale reports, raw Figma objects, raw Motion data, stack traces, page/layer/text data, or future-feature placeholders.
- Evidence: `src/ui/components/GlobalHeader.tsx`, `src/ui/components/DocumentStatus.tsx`, `src/ui/documentStatusPresentation.ts`, `src/ui/App.tsx`, `src/ui/styles.css`, `tests/globalHeader.test.tsx`, `tests/ui/smoke.spec.ts`, `tests/buildArtifacts.test.mjs`, `docs/verification/PHASE-02.md`.
- Related tasks: P2-004, P2-005, P2-015

## DEC-044: Context And Change Preview Share A Controlled Drawer Shell

- Status: Accepted
- Date: 2026-07-14
- Context: P2-005 needs the right-side context/change-preview infrastructure described by the global layout without starting P2-006 Scope modeling, actual change previews, Motion reads, compatibility results, apply workflows, or feature-owned panels. P2-001 already defined the shell regions, P2-002 owns local workspace navigation, P2-003 owns lifecycle state, and P2-004 owns the global header.
- Options considered: Keep the P2-001 placeholder context region; add a global imperative drawer store; add separate context and change-preview drawer systems; add one controlled presentational shell with an optional App integration slot.
- Decision: Add one `ContextDrawerShell` component and a closed `ContextDrawerMode` union with `context` and `change-preview` presentation modes. The drawer API is controlled by the caller with `open`, `mode`, `title`, optional `description`, content, optional `footer`, and `onClose`. `App` exposes only an optional drawer region and renders no region when no real drawer content is supplied. The shell handles structure, accessible title/description associations, named close control, Escape close, independent content scrolling, and responsive wide trailing-panel/narrow overlay styling.
- Consequences: Drawer state remains outside the P2-003 lifecycle machine and outside workspace navigation. P2-005 adds no global singleton, command bus, registry, store, persistence, plugin message, Figma global access, Motion adapter import, network call, analytics, Scope data, Motion snapshot, raw Figma object, change plan, compatibility result, Apply/Reset action, or feature payload. The production UI shows no empty drawer, no "Coming soon" placeholder, and no fake preview. Actual change-preview behavior is deferred to Phase 4; contextual feature contents remain deferred to their owning tasks.
- Evidence: `src/ui/components/ContextDrawerShell.tsx`, `src/ui/contextDrawerMode.ts`, `src/ui/App.tsx`, `src/ui/styles.css`, `tests/contextDrawerShell.test.tsx`, `tests/ui/smoke.spec.ts`, `tests/buildArtifacts.test.mjs`, `docs/verification/PHASE-02.md`.
- Related tasks: P2-005, P2-006, P4 common change preview tasks

## DEC-045: Scope Discovery Uses Layered Serializable State

- Status: Accepted
- Date: 2026-07-14
- Context: P2-006 through P2-010 need one Scope discovery and filtering slice without starting target ordering, selection synchronization, node reveal, Motion reads, apply workflows, persistence, or global stores. Existing architecture already separates the typed UI/plugin bridge, plugin-owned Figma access, local workspace navigation, and the P2-003 lifecycle machine.
- Options considered: Store Scope in the lifecycle machine; let the UI access Figma globals directly; build a mutable global Scope singleton; keep separate canonical domain, scanner, serializable result, local UI state, and pure filters.
- Decision: Add `src/domain/scope.ts` as the canonical immutable serializable Scope definition, `src/plugin/scopeScanner.ts` as the plugin-process Figma scanner, `src/domain/scopeScan.ts` as the serializable hierarchy result, `ScopeWorkspace` as feature-local session-only UI state, and `src/domain/scopeFilters.ts` as pure deterministic filtering. Scope scan messages extend the existing typed bridge with request IDs, and stale responses are ignored by the UI.
- Consequences: Raw Figma nodes and document access remain behind the plugin process. Scope mode, hierarchy expansion, checkbox membership, filters, and errors are not persisted and do not alter lifecycle state or workspace navigation. Filtering never causes a Figma rescan. The slice supports current selection, direct children, all descendants, depth-limited descendants, manual node IDs, hierarchy presentation, and safe non-Motion filters. Target ordering, custom ordering, selection synchronization, node reveal, final progress/cancellation UI, Motion reads, and Motion-specific filters remain deferred.
- Evidence: `src/domain/scope.ts`, `src/domain/scopeScan.ts`, `src/domain/scopeFilters.ts`, `src/plugin/scopeScanner.ts`, `src/shared/messages.ts`, `src/plugin/main.ts`, `src/ui/ScopeWorkspace.tsx`, `tests/scopeDomain.test.ts`, `tests/scopeScanner.test.ts`, `tests/scopeFilters.test.ts`, `tests/scopeWorkspace.test.tsx`, `docs/verification/PHASE-02.md`.
- Related tasks: P2-006, P2-007, P2-008, P2-009, P2-010, P2-011, P2-014, P2-015

## DEC-046: Scope Ordering, Sync, Reveal, Progress, And State Stay Feature-Local

- Status: Accepted
- Date: 2026-07-14
- Context: P2-011 through P2-016 complete the Phase 2 Scope workflow after discovery and filtering. The batch needed deterministic target ordering, custom session order, node reveal, selection sync, cancellation, progress, and complete Scope UI states without starting Phase 3, Motion reads/writes, Inspector/Edit/QA/Standards/Handoff/Sequencer behavior, persistence, analytics, or global lifecycle coupling.
- Options considered: Add ordering/filter/sync fields to the Scope definition; store Scope workflow state in the global lifecycle machine or header; add a broad drag-and-drop framework; use request IDs only for cancellation; expose raw Figma nodes or exceptions in reveal results.
- Decision: Add `src/domain/scopeOrdering.ts` as the pure serializable ordering layer separate from Scope membership. Automatic order tie-breakers are documented and deterministic: layer traversal order; exact reverse; vertical center then horizontal center then traversal; horizontal center then vertical center then traversal; aggregate-bounds-center distance ascending/descending then traversal. Missing geometry falls back to traversal order. Custom order is session-only node IDs, deduped, reconciled against current targets, and reset to the previously selected automatic mode. Scanner geometry projection is limited to x, y, width, height, and derived centers. Selection sync, rescan, stale, progress, cancel, custom movement, and reveal controls live in `ScopeWorkspace` because the existing global header does not own Scope feature state cleanly. The plugin process owns node lookup, selection, viewport reveal, selection-change events, progress emission, and request-scoped cooperative cancellation. Programmatic reveal suppresses its own selection-change notification to prevent feedback loops.
- Consequences: Filtering and ordering are local pure transformations over the latest scan result and do not rescan by themselves. Stale scan results/progress cannot replace newer requests. Cancelled scans return a safe terminal state or leave previous valid results visible. Scope states are represented by a feature-local discriminated union and remain independent from application lifecycle, workspace navigation, context drawer, resize, plugin data, local storage, and singleton state. UI code still does not access Figma globals. No Motion data is read or written.
- Evidence: `src/domain/scopeOrdering.ts`, `src/domain/scopeScan.ts`, `src/plugin/scopeScanner.ts`, `src/plugin/main.ts`, `src/shared/messages.ts`, `src/ui/ScopeWorkspace.tsx`, `tests/scopeOrdering.test.ts`, `tests/scopeScanner.test.ts`, `tests/scopeWorkspace.test.tsx`, `tests/ui/smoke.spec.ts`, `docs/verification/PHASE-02.md`.
- Related tasks: P2-011, P2-012, P2-013, P2-014, P2-015, P2-016

## DEC-047: Inspector Is Read-Only Presentation Over Active Scope And Normalized Motion

- Status: Accepted
- Date: 2026-07-14
- Context: Phase 3 needed a trustworthy Animation Inspector after Phase 2 Scope and Phase 1 normalization, without starting editing, change plans, QA, Sequencer, persistence, analytics, or any Motion write path.
- Options considered: Add a second Scope scanner for Inspect; let React components read Figma globals or normalize raw Motion data; merge manual/style data into a unified writable-looking track model; add Inspector state to the global lifecycle machine; create a new reveal implementation; update capability conclusions from UI renderability.
- Decision: `App` lifts the active serializable Scope result from `ScopeWorkspace` and passes it to `InspectWorkspace` as session-only feature state. Inspect sends a typed `MOTION_INSPECT_REQUEST` with only active Scope node IDs. The plugin process reads each requested node through the existing P1 `readMotionSnapshot()` path and returns normalized snapshots plus explicit partial failures. `src/domain/inspector.ts` owns pure grouping, formatting, filtering, warning detection, and capability labels. Manual tracks, style instances, derived animations, timelines, and capabilities remain separate sections. Compact, detailed, and debug modes are local UI projections and never trigger rereads when data is already available. Inspector filters are local projections and do not mutate Scope. Node reveal reuses the P2-013 typed reveal path.
- Consequences: Inspect does not access Figma globals, import the Motion adapter, pass raw Figma values, create a second normalization path, perform implicit full-document scans, write Motion data, create change plans, or infer editability from data presence. Unknown/beta and unsupported shapes remain visible as warnings, debug data, safe formatted values, or partial failures. Capability matrix entries change only after live evidence, not because the UI can render normalized data. Partial read success preserves successful targets and lists failures explicitly. P3-012 live fixture verification remains required before Phase 3 is complete.
- Evidence: `src/domain/inspector.ts`, `src/plugin/inspector.ts`, `src/shared/messages.ts`, `src/plugin/main.ts`, `src/ui/App.tsx`, `src/ui/ScopeWorkspace.tsx`, `src/ui/InspectWorkspace.tsx`, `tests/inspector.test.ts`, `tests/messages.test.ts`, `tests/inspectWorkspace.test.tsx`, `docs/verification/PHASE-03.md`.
- Related tasks: P3-001, P3-002, P3-003, P3-004, P3-005, P3-006, P3-007, P3-008, P3-009, P3-010, P3-011, P3-012

## DEC-048: Phase 4 Editing Engine Plans Before It Writes

- Status: Accepted
- Date: 2026-07-14
- Context: P4-001 through P4-014 need the safe editing engine beneath the future Edit UI without adding visible controls. Existing Phase 1 code already owns normalized Motion snapshots, integer-millisecond conversion, source-specific writers, semantic stale guards, expected/actual verification, and sanitized errors. Phase 0 evidence verifies manual-track replacement, style remove/reapply identity behavior, timeline-duration writes, commitUndo/triggerUndo constraints, and CP09 BOOLEAN component-property writes with warnings.
- Options considered: Add UI-local drafts; mutate normalized snapshots directly; build a broad new writer abstraction; use price/shape-like similarity between manual and style sources; build a conservative planner around existing P1 guards, writers, and verification.
- Decision: Add a pure `planMotionOperation()` engine that accepts a normalized snapshot, target selectors, typed operation, injected ID generator, and existing capability state. Plans are immutable serializable data with stable plan IDs, a base snapshot fingerprint, distinct manual/style/timeline mutation categories, skipped targets, warnings, and expected summaries. Manual timing and easing edits replace complete copied tracks through the existing manual writer. Native style timing/easing edits remain explicit read-only skips because no verified production writer exists for direct style field mutation. Mixed-source targets are planned per source and same-property manual/style conflicts are warnings/skips, not merged fake tracks. Duration, delay, and timing-scale math uses integer milliseconds and rejects negative/non-finite/unordered output instead of clamping. Cubic-bezier validation returns typed results. Spring editing is rejected/read-only until capability evidence verifies a writable shape.
- Consequences: Feature components must consume completed plans and never mutate normalized Motion data. The preview foundation consumes a completed plan in `ContextDrawerShell` but does not construct plans or apply writes. `executeChangePlan()` validates serialized plans, confirms base snapshot identity, re-reads current state, runs existing stale/fingerprint guards, begins a transaction with the documented `commitUndo() -> write` strategy, dispatches source-specific writers, re-verifies through normalized expected/actual comparison, and returns serializable success, stale, writer-failure, rollback, or mismatch results. Invalid and stale plans never write, unsupported mutations never write, partial success is never reported as full success, and duplicate apply request IDs are suppressed. No lifecycle, navigation, drawer singleton, persistence, analytics, backend, network, Edit controls, Copy/Paste, Stagger, Sequencer, QA, Standards, Handoff, or new live Figma evidence is added.
- Evidence: `src/plugin/motion/plan.ts`, `src/plugin/motion/operations.ts`, `src/plugin/motion/execute.ts`, `src/ui/components/ChangePreview.tsx`, `src/ui/styles.css`, `tests/changePlan.test.tsx`, `docs/verification/PHASE-04.md`.
- Related tasks: P4-001, P4-002, P4-003, P4-004, P4-005, P4-006, P4-007, P4-008, P4-009, P4-010, P4-011, P4-012, P4-013, P4-014

## DEC-049: Edit UI Owns Draft Workflow Locally And Uses Plugin-Owned Planning

- Status: Accepted
- Date: 2026-07-14
- Context: P4-015 through P4-018 needed visible Timing and Easing workflows without moving Motion planning into React, importing plugin Motion modules from UI code, adding fake future tabs, or claiming live Figma capability evidence.
- Options considered: Let UI import `src/plugin/motion/*`; store snapshots/plans in the lifecycle machine; add a global edit store; make Apply available from the initial form; add local feature state and route all engine work through typed messages.
- Decision: `EditWorkspace` owns feature-local tab, field, target-selection, preview, and apply-result state. It reads active confirmed Scope through the existing `MOTION_INSPECT_REQUEST` normalized read path for display, then sends typed `MOTION_PLAN_OPERATION_REQUEST` and `MOTION_APPLY_CHANGE_PLAN_REQUEST` messages to the plugin process. The plugin process re-reads normalized Motion before planning, calls `planMotionOperation()`, and applies only through `executeChangePlan()`. `ChangePreview` renders the completed plan inside the existing `ContextDrawerShell`; Apply exists only in the preview drawer. Lifecycle integration is boundary-only: preview creates draft, Apply starts applying, success syncs, stale marks stale, failures mark error, and dismissal clears draft. Lifecycle state stores no snapshots or plans.
- Consequences: UI code does not import plugin Motion modules or raw Figma objects. Planning does not write. Invalid integer-millisecond and cubic-bezier inputs stop before planning. Style timing/easing and spring remain read-only/skipped. Skipped-only plans return before any undo transaction or writer call. Timing and Easing are the only Edit tabs; Copy/Paste, Stagger, Sequencer, QA, Standards, and Handoff remain absent. Capability matrix conclusions still require P4-019 live evidence.
- Evidence: `src/ui/EditWorkspace.tsx`, `src/shared/messages.ts`, `src/plugin/main.ts`, `src/plugin/motion/execute.ts`, `src/ui/App.tsx`, `tests/editWorkspace.test.tsx`, `tests/messages.test.ts`, `tests/timingOperations.property.test.ts`, `tests/writerIntegration.test.ts`, `docs/verification/PHASE-04.md`.
- Related tasks: P4-015, P4-016, P4-017, P4-018, P4-019, P4-020

## DEC-050: Copy/Paste Motion Is A Session Clipboard Layer Over P4 Plans

- Status: Accepted
- Date: 2026-07-14
- Context: P5-001 through P5-018 need Copy/Paste Motion without a second Motion model, second operation planner, persistent clipboard, OS clipboard, network/backend behavior, or unsupported style-write claims. P4 already owns guarded `ChangePlan` preview/apply, stale checks, undo transaction, source-specific writers, and re-read verification.
- Options considered: Store raw normalized snapshots in UI; add a global mutable clipboard singleton; build a separate paste executor; infer destination matches by names/geometry; reuse P4 plans with a serializable session clipboard and pure compatibility/mapping layer.
- Decision: Add a versioned serializable clipboard model in `src/plugin/motion/clipboard.ts`, a canonical property registry in `src/plugin/motion/propertyRegistry.ts`, a pure compatibility engine in `src/plugin/motion/compatibility.ts`, and a paste planner in `src/plugin/motion/paste.ts`. Clipboard copies normalized manual and visible style data separately. Complete, timing-only, easing-only, and selected-track modes are explicit. Paste modes build ordinary P4 manual-track `ChangePlan` mutations and explicit skips/warnings. Mapping supports one-to-many, equal-count Scope order, and explicit pairs in the engine; ambiguous mappings fail typed. Offset and fixed interval are paste-only timing modifiers and reuse confirmed Scope order.
- Consequences: Copy and compatibility never write. The UI owns clipboard state locally for the plugin session and communicates through shared typed messages only; UI code does not import plugin Motion modules. Style data remains visible but read-only/skipped. Missing destination values, unknown properties, style-only sources, and unverified geometry/path properties are explicit skips or read-only results. Apply still flows through existing P4 preview drawer, stale guard, undo transaction, writer dispatch, and re-read verification. P5-019 live verification remains required before Phase 5 is complete or any capability matrix promotion is allowed.
- Evidence: `src/plugin/motion/clipboard.ts`, `src/plugin/motion/propertyRegistry.ts`, `src/plugin/motion/compatibility.ts`, `src/plugin/motion/paste.ts`, `src/shared/messages.ts`, `src/plugin/main.ts`, `src/ui/EditWorkspace.tsx`, `tests/phase5ClipboardPaste.test.ts`, `tests/messages.test.ts`, `tests/editWorkspace.test.tsx`, `docs/verification/PHASE-05.md`.
- Related tasks: P5-001 through P5-020

## DEC-051: Sequencer Drafts Are Session-Local Projections Over P4 Plans

- Status: Accepted
- Date: 2026-07-14
- Context: P6-001 through P6-023 needed a complete automatable Sequencer workflow without creating a second Motion source of truth, second writer, playback engine, native playhead control, persistent Sequencer state, or custom executor. P4 already owns guarded `ChangePlan` preview/apply, stale guards, undo transaction, writer dispatch, and re-read verification.
- Options considered: Store a mutable global Sequencer singleton; write during drag/resize; create a custom Sequencer executor; import plugin Motion modules into React UI; derive a session-only immutable draft and convert changed supported items into ordinary P4 operations.
- Decision: Add `src/domain/sequencer.ts` as the pure serializable draft and timeline-operation layer. Drafts are derived from normalized Motion snapshots, preserve Scope order, separate manual/style sources, keep stable row/item/keyframe IDs, and store only local timing changes plus base snapshot/fingerprint metadata. `sequencer-draft` operations extend the existing planner so changed manual tracks and explicit timeline changes become normal `ChangePlan` mutations. The Sequence workspace owns feature-local UI state and communicates only through shared typed messages.
- Consequences: Zoom, pan, selection, nudge, offset, align, distribute, fit, trim, padding, reset, property inspection, and preview do not write to Figma. Style-generated details remain visible/read-only and are not converted into manual keyframes. Stale drafts block preview/apply and are not silently rebased. Apply reuses the existing P4 execution engine; no Sequencer-specific executor or persistent state was added. P6-024 live Figma verification remains required before claiming native timeline correctness or updating the capability matrix.
- Evidence: `src/domain/sequencer.ts`, `src/plugin/motion/operations.ts`, `src/plugin/motion/plan.ts`, `src/shared/messages.ts`, `src/ui/SequenceWorkspace.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`, `tests/sequencer.test.ts`, `tests/sequenceWorkspace.test.tsx`, `docs/verification/PHASE-06.md`.
- Related tasks: P6-001 through P6-024

## DEC-052: Stagger Builder Is A Shared Pure Schedule Engine

- Status: Accepted
- Date: 2026-07-14
- Context: P7-001 through P7-014 needed fixed-interval, total-duration, overlap, sequential, and before-end stagger behavior across Edit, Copy/Paste, and Sequencer without adding a second writer, timing model, Motion format, or spatial-order system.
- Options considered: Add separate Edit and Sequencer stagger algorithms; extend only Phase 5 paste offsets; build a pure shared domain operation and adapt existing planners/drafts around it.
- Decision: Add `src/domain/stagger.ts` as the typed serializable Stagger Builder. It owns integer-ms validation, timing-mode semantics, preserve/scale policies, anchors, deterministic schedule generation, typed failures, keyframe-time mapping, and timeline-extension warnings. Edit clone-reference-and-stagger reuses the Phase 5 clipboard/paste engine and builds an ordinary P4 `ChangePlan`. Sequencer calls the same engine on selected editable draft bars and still writes only through Build Preview and Apply. Target ordering in Edit reuses P2 `orderScopeNodes`.
- Consequences: No Figma access exists in the stagger domain. Manual and style capabilities stay separate; style data remains visible/read-only unless future live evidence adds a safe writer. Unsupported or read-only destinations become explicit skips/warnings in existing planners. Form interaction and Sequencer toolbar interaction do not write. P7-015 live Figma verification remains required before Phase 7 completion or any API capability matrix update.
- Evidence: `src/domain/stagger.ts`, `src/plugin/motion/paste.ts`, `src/domain/sequencer.ts`, `src/ui/EditWorkspace.tsx`, `src/ui/SequenceWorkspace.tsx`, `tests/stagger.test.ts`, `tests/phase5ClipboardPaste.test.ts`, `tests/sequencer.test.ts`, `docs/verification/PHASE-07.md`.
- Related tasks: P7-001 through P7-015

## DEC-053: Standards And QA Are Pure Domain Engines With Plugin-Owned Storage

- Status: Accepted
- Date: 2026-07-14
- Context: P8-001 through P8-021 needed a complete automatable Standards and Motion QA workflow without adding a second Motion model, a second standards representation, a separate auto-fix executor, cloud storage, team accounts, analytics, backend behavior, general design-system auditing, accessibility auditing, or live capability claims from mocks.
- Options considered: Let Review own ad hoc standards JSON; store standards in browser local storage; evaluate QA directly in React; build a separate auto-fix executor; infer interaction categories from layer names; reuse the existing normalized Motion, plugin boundary, and P4 plan/apply workflow.
- Decision: Add `src/domain/standards.ts` as the canonical schema-v1 standards model, `src/domain/standardsMatching.ts` for pure exact/nearest token matching, `src/domain/qa.ts` for modular pure QA rules, and `src/plugin/standardsStorage.ts` for plugin-owned personal and file storage. Personal standards use `clientStorage`; file standards use root plugin data; imported standards remain explicit and are not silently activated. Review owns feature-local Standards/QA UI state and communicates through typed shared messages. Safe fixes are descriptors that build ordinary P4 Motion operations, then use the existing `ChangePlan`, `ChangePreview`, explicit Apply, stale guard, writer dispatch, undo transaction, reread, and verification path.
- Consequences: QA never accesses Figma directly, never writes during analysis or issue selection, and never treats unknown Motion data as a pass. Exact versus nearest token matches remain distinct. Exceptions, ignore-once, reviewed, and resolved status are serializable/reconciled issue state, not proof of compliance. Storage excludes Motion snapshots, Scope state, QA results, screenshots, raw Figma objects, document content, cloud IDs, and user-account identifiers. P8-022 live Figma verification remains required before claiming live plugin-data behavior, safe auto-fix behavior, or any capability matrix update.
- Evidence: `src/domain/standards.ts`, `src/domain/standardsMatching.ts`, `src/domain/qa.ts`, `src/plugin/standardsStorage.ts`, `src/shared/messages.ts`, `src/plugin/main.ts`, `src/ui/ReviewWorkspace.tsx`, `tests/phase8StandardsQa.test.ts`, `tests/phase8Storage.test.ts`, `tests/reviewWorkspace.test.tsx`, `docs/verification/PHASE-08.md`.
- Related tasks: P8-001 through P8-022

## DEC-054: Handoff Reports Are Pure Schema-Versioned Exports

- Status: Accepted
- Date: 2026-07-14
- Context: P9-001 through P9-011 needed deterministic Markdown and JSON handoff reports from the canonical Scope, normalized Motion, Standards, and QA state without creating a second Motion model, second QA model, backend export service, cloud storage, implementation code generation, or live API capability claims.
- Options considered: Generate reports ad hoc in React; export raw normalized snapshots; build a separate report normalization pipeline; reuse canonical domain state and render from one serializable report model.
- Decision: Add `src/domain/handoffReport.ts` as the only Phase 9 report model and renderer surface. The model is schema-versioned, immutable, deterministic, integer-ms based, and serializable. It summarizes Scope order, manual tracks, keyframes, native style instances, timelines, token matches, deviations, QA, exceptions, capabilities, limitations, and report/plugin/standards versions. Markdown and JSON render from the same model. Review owns only the Handoff UI controls and explicit copy/download actions through `src/ui/handoffExport.ts`.
- Consequences: Report generation is pure and does not reread Motion when snapshots already exist. UI code still does not access Figma globals. Handoff never runs safe fixes, writes to Figma, persists content, uses a backend, uploads files, or generates CSS/React/Framer/SwiftUI/Android implementation code. Report JSON is a handoff format, not a Motion backup or restoration format. P10 remains separate.
- Evidence: `src/domain/handoffReport.ts`, `src/ui/handoffExport.ts`, `src/ui/ReviewWorkspace.tsx`, `tests/handoffReport.test.ts`, `tests/handoffExport.test.ts`, `tests/reviewWorkspace.test.tsx`, `docs/verification/PHASE-09.md`.
- Related tasks: P9-001 through P9-011

## DEC-055: Phase 10 Hardening Uses Shared Cancellation And Automated Evidence Boundaries

- Status: Accepted
- Date: 2026-07-14
- Context: P10-001 through P10-009 needed cross-workspace production hardening without a live Figma session and without starting P10-010. Existing work already separates Scope, Inspect, Edit, Sequence, Review, Standards, QA, Handoff, lifecycle state, and P4 writer abstractions, but cancellation outside Scope was mostly replacement-request based and Phase 10 needed an explicit batch evidence boundary.
- Options considered: Leave cancellation as ad hoc refs in each handler; add UI-only cancel buttons without plugin semantics; introduce one shared typed cancellation coordinator and keep automated/live evidence separate.
- Decision: Add `src/shared/cancellation.ts` as the shared request coordinator for cancellable long-running operations, extend the typed message boundary with `MOTION_OPERATION_CANCEL_REQUEST`, and wire plugin-process Motion inspect, plan, clipboard copy, paste-plan, standards storage, and Scope scan replacement/cancel semantics through it. Automated Phase 10 evidence is captured in `tests/phase10ProductionHardening.test.ts` and `tests/phase10FixtureMatrix.test.ts`. The complete fixture matrix is represented deterministically in automated tests, while P10-006 remains blocked until the live fixture campaign runs. P10-008 and P10-009 remain blocked because native Undo and dynamic-page behavior require live Figma evidence.
- Consequences: Cancelled or replaced long-running read/plan/storage work cannot post stale results. Apply cancellation is intentionally not exposed after destructive writes begin, because partial write semantics must remain success/failure/rollback rather than "cancelled." Unknown beta fields remain serializable and conservative: unknown capability does not create write support, unknown data does not create false QA passes, and Handoff carries warning/not-evaluated state. No API capability matrix entries are promoted from automated tests.
- Evidence: `src/shared/cancellation.ts`, `src/shared/messages.ts`, `src/plugin/main.ts`, `tests/phase10ProductionHardening.test.ts`, `tests/phase10FixtureMatrix.test.ts`, `docs/verification/PHASE-10.md`, `docs/verification/live-figma/FINAL-LIVE-CAMPAIGN/README.md`.
- Related tasks: P10-001 through P10-009

## DEC-056: Release Candidate Stays Offline, Conservative, And Lab-Separated

- Status: Accepted
- Date: 2026-07-14
- Context: P10-010 through P10-016 needed final hardening and release preparation without a live Figma session, without promoting unsupported capabilities, and without adding backend, billing, account, cloud, upload, screenshot, or network analytics behavior.
- Options considered: Ship a final package from automated evidence only; add telemetry now; add licensing enforcement now; keep release packaging and user-facing limitations conservative until live evidence exists.
- Decision: Add static user-facing help/limitations content, a disabled no-op analytics boundary, and a pure local feature-access abstraction. Keep all current features available by default while unknown feature IDs fail closed. Split lab-only P0 diagnostics into a compile-time lab module so production builds exclude API-lab handlers and collector markers. Generate a release-candidate package containing only `manifest.json`, production `dist/plugin.js`, and inlined `dist/index.html`, with inventory and SHA256 checksums.
- Consequences: The product can be reviewed as a release candidate, but final release remains blocked by live Figma desktop/browser verification. Analytics do not collect or transmit data. Feature access does not contact billing/account/license services and does not restrict current features. The API capability matrix is unchanged because no new accepted live evidence exists.
- Evidence: `src/shared/helpContent.ts`, `src/ui/components/HelpDrawer.tsx`, `src/shared/analytics.ts`, `src/shared/featureAccess.ts`, `src/plugin/diagnostics/labHandlers.ts`, `scripts/build-release-package.mjs`, `tests/helpContent.test.ts`, `tests/analytics.test.ts`, `tests/featureAccess.test.ts`, `tests/releasePackage.node-test.mjs`, `docs/verification/FINAL-AUTOMATED-VERIFICATION.md`, `docs/verification/RELEASE-PACKAGE.md`, `docs/implementation/RELEASE-SUPPORT-MATRIX.md`.
- Related tasks: P10-010 through P10-016

## DEC-057: Final Live Campaign Uses A Temporary Verification Build

- Status: Accepted
- Date: 2026-07-14
- Context: P10-010 needs execution help inside real Figma without rebuilding the existing `MotionOps API Verification` fixtures, adding backend/network services, or shipping the runner in the normal release-candidate package.
- Options considered: Put a permanent runner in production; use Figma MCP to rebuild fixtures; rely only on manual checklist execution; add a separate live-verification build flag over the same production app and Motion engines.
- Decision: Add `__MOTIONOPS_LIVE_TEST_RUNNER_ENABLED__` and a separate `build:live-verification` package. The header shows `Run all tests` only in that build. The runner lives under `src/testing/live-runner/`, discovers existing `test 1` through `test 20` frames, validates fixture structure, invokes production read/scope/fingerprint paths, isolates destructive work in `__MOTIONOPS_LIVE_TEST_SANDBOX__`, records Markdown/JSON evidence, and leaves manual environment checks pending.
- Consequences: The normal release-candidate package remains runner-free and package scans assert the absence of runner markers. Runner readiness does not mark P10-010 or earlier live gates DONE. Browser/Desktop parity and visual/runtime checks still require `MANUAL-ENVIRONMENT-FEEDBACK.md`.
- Evidence: `src/testing/live-runner/`, `src/ui/components/LiveTestRunnerControl.tsx`, `src/plugin/main.ts`, `scripts/build-live-verification-package.mjs`, `tests/liveRunner.test.ts`, `tests/buildArtifacts.test.mjs`, `tests/releasePackage.node-test.mjs`, `docs/verification/live-figma/FINAL-LIVE-CAMPAIGN/`.
- Related tasks: P10-010 through P10-016
