# Live Test Runner Removal

The live runner is temporary release-candidate infrastructure. Remove it only after the final live campaign evidence has been accepted or the campaign strategy changes.

## Removal Procedure

1. Remove the live-verification build target from `package.json`.
2. Remove `__MOTIONOPS_LIVE_TEST_RUNNER_ENABLED__` from `vite.config.ts`, `vite.plugin.config.ts`, and `src/shared/env.d.ts`.
3. Remove the header integration point in `src/ui/components/GlobalHeader.tsx`.
4. Remove `src/ui/components/LiveTestRunnerControl.tsx`.
5. Remove `src/testing/live-runner/`.
6. Remove runner-only tests from `tests/liveRunner.test.ts`.
7. Remove or archive this runner documentation.
8. Rebuild the normal release package.
9. Run full verification.
10. Confirm `Run all tests` is absent from production UI artifacts.
11. Confirm production bundles contain no `LIVE_TEST_RUNNER_START`, `__MOTIONOPS_LIVE_TEST_SANDBOX__`, or `liveTestRegistry` markers.

## Semantic Production Guard

Keep a production artifact test equivalent to:

- normal release build does not render `Run all tests`;
- normal release plugin bundle does not contain the live-test registry or runner markers;
- normal release package contains only `manifest.json`, `dist/plugin.js`, and `dist/index.html`.

Do not rely only on a visual check.
