# Phase 8 Verification - Standards And Motion QA

Status: INCOMPLETE because live Figma verification P8-022 is BLOCKED.

## Automated Scope

P8-001 through P8-021 are implemented and covered by automated checks. The standards model is `src/domain/standards.ts`; pure token matching is `src/domain/standardsMatching.ts`; modular QA rules are `src/domain/qa.ts`; plugin-owned storage is `src/plugin/standardsStorage.ts`; Review UI is `src/ui/ReviewWorkspace.tsx`.

## Standards And Storage

- Schema version 1 supports duration, delay, easing, stagger, spring, and interaction-category tokens.
- Standards serialize deterministically and validate with typed errors/warnings.
- Schema 0 or missing schema payloads migrate to schema 1; unsupported future versions fail safely.
- Unknown fields are not preserved and are reported by warning policy.
- Personal standards use plugin-owned `clientStorage`; file standards use root plugin data.
- Personal and file standards are separate, and active source is explicit.
- Stored content excludes Motion snapshots, Scope state, QA results, screenshots, raw Figma objects, file/page/layer content, callbacks, React nodes, cloud IDs, and user-account identifiers.

## Matching And QA Rules

- Token matching keeps exact and nearest matches distinct. Nearest suggestions never count as compliance.
- Timing comparisons use integer milliseconds. Cubic-bezier comparison uses deterministic tolerance from standards thresholds.
- Unknown easing or spring shapes remain unmatched and can produce explicit unknown/not-evaluated issues.
- QA rules are pure deterministic functions over normalized Motion snapshots, Scope metadata, capability state, optional standards, and exception/review state.
- Rule categories cover timing, easing, layer state, keyframe/track structure, property values, standards compliance, capabilities, and unknown input.
- Issue IDs are based on semantic identity, and reruns reconcile ignored, reviewed, excepted, and resolved statuses deterministically.

## Safe Fix Boundary

Safe fixes are descriptors only until routed through the existing P4 engine. Review builds a normal typed Motion operation, requests a `ChangePlan` from the plugin process, shows the existing `ChangePreview`, and requires explicit Apply. Stale checks, writer dispatch, undo transaction behavior, reread verification, and apply results remain owned by P4.

No write occurs while selecting an issue, running QA, ignoring, reviewing, adding an exception, importing JSON, or building a preview. Unsafe fixes are not exposed for duplicate deletion, ambiguous conflicts, unknown properties, unverified style timing/easing, layout judgment warnings, component restrictions, or unsupported paint/effect structures.

## Review UI

The Review workspace now has Standards and QA tabs. Standards exposes active source, editable metadata, JSON import/export, validation summary, explicit personal save, and explicit file save. QA exposes Run QA, active-standard summary, severity totals, filters, issue list, issue details, node reveal, ignore once, mark reviewed, add exception, and safe-fix preview where available.

The UI consumes active confirmed Scope node IDs and requests normalized Motion snapshots through the existing plugin boundary. It does not trigger implicit full-document scans and does not implement Handoff/reporting.

## Performance Evidence

Automated property/focused tests include a large 2,000-keyframe QA execution case and large standards input. Performance is treated as report-only in this phase to avoid flaky CI thresholds; the pure QA engine is deterministic and does not include Figma API latency.

## Test Evidence

- `rtk npm run typecheck` - PASS.
- `rtk npx vitest run tests/phase8StandardsQa.test.ts tests/phase8Storage.test.ts tests/reviewWorkspace.test.tsx tests/messages.test.ts` - PASS, 18 tests.

Final full verification commands are recorded in the session summary. Live Figma behavior is not claimed from these automated tests.

## Live Blocker

No live Figma plugin session was available during this batch. P8-022 is BLOCKED and must be completed with the procedure in `docs/verification/live-figma/P8-022/README.md` before Phase 8 can be marked complete or before capability claims change.

## Scope Exclusions

P9-001 is NOT_STARTED. No Handoff/reporting implementation, general design-system audit, accessibility audit, analytics, licensing, backend, network behavior, cloud storage, team accounts, user accounts, or API capability matrix changes were added.
