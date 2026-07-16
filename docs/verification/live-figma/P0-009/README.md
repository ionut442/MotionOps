# P0-009 Timeline Duration Verification

Status: DONE - investigation complete; timeline-duration write, boundary, isolation, and restoration behavior recorded.

P0-009 verifies `node.setTimelineDuration(timeline.id, duration)` behavior on disposable generated fixtures. This is a Phase 0 capability investigation only, not the production timeline writer.

## API Contract From Installed Typings

Installed `@figma/plugin-typings` 1.130.0 exposes:

- Method: `MotionNodeMixin.setTimelineDuration`
- Signature: `setTimelineDuration(id: string, duration: number): void`
- Invoked on: the Motion node
- Timeline ID source: `node.timelines[].id`
- Duration units: seconds
- Return value: `void`
- Async behavior: synchronous
- Documented range: duration must be greater than zero

The installed typings do not define beta behavior for durations below final keyframes, multi-timeline identity changes, clamping, or normalization. The live matrix records that behavior instead of guessing.

## Retained Live Run

- Run ID: `p009-mrivc1j7-56e68c`
- Manifest: `test-results/p009-mrivc1j7-56e68c.manifest.json`
- Schema: `1`
- Emitted manifest accepted: `false`
- Emitted manifest classification: `mixed`
- Audited classification: supported with warning for below-final-keyframe and derived-animation duration readback
- Manifest SHA-256: `e0d9c55a2732bfecf54f23aee72d91944ad44d639ba6ef0ae12aed43fcb850d0`
- Combined P0-009 hash: `340f3bb532460272f5f0a7b5b5caab5597b93cb005f7ac5d9350210d6fec86bc`

The emitted manifest is not accepted because the initial harness treated `derivedAnimations.TRANSLATION_X.timelineDuration` changes as unrelated mutation. Manual tracks, keyframes, animation styles, timeline identity/count, and restoration were stable. The derived animation change mirrors the written timeline duration and is recorded as supported-with-warning behavior.

## Harness

- Registry: `src/shared/p009Registry.ts`
- Evidence schema: `src/shared/p009Evidence.ts`
- Fixture/runner: `src/plugin/diagnostics/p009Fixtures.ts`
- UI runner: `src/ui/App.tsx`
- Collector: `scripts/motion-evidence-collector.mjs`
- Output manifest: `test-results/p009-<runId>.manifest.json`

## Required Figma Buttons

1. `Create/Refresh P0-009 Fixtures`
2. `Verify P0-009 target pipeline`
3. `Run P0-009 Timeline Cases`

## Verification

The full post-live gate passed after this run:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:coverage`
- `npm run build:lab`
- `npm run lab:collector:test`
- `npm run test:ui`
- `npm run build`
- `npm run test:build-artifacts`
- `npm run verify`

Pre/post inventory confirmed the P0-009 manifest, evidence count, per-file hashes, combined hash, and retained P0-006/P0-007/P0-008 manifest hashes were unchanged.

P0-009 does not verify undo grouping.
