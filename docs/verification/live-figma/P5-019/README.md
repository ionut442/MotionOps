# P5-019 Live Figma Verification Procedure

Status: BLOCKED. No live Figma plugin session was available on 2026-07-14.

Use this exact procedure when live access is available:

1. Run `rtk npm run build:lab`.
2. Start the collector with `rtk npm run lab:collector` if evidence capture is required.
3. Load `D:\Down\CODE\MotionOps\manifest.json` in Figma Desktop.
4. Create or reuse representative fixtures for opacity, translation X/Y, rotation, scale X/Y, width/height, corner radius, stroke weight, path trim, mixed manual/style, component, component set, instance, nested instance, and timeline-extension behavior.
5. Confirm Scope with source and destination targets in the intended order.
6. Open Edit -> Copy/Paste.
7. For each case, copy the source using complete, timing-only, easing-only, and selected-track modes where applicable.
8. Build paste previews for replace, merge-compatible, add-missing-only, preserve-timing, preserve-easing, one-to-many, scope-order multi-source, fixed offset, and fixed interval.
9. Record compatibility summary, preview mutations/skips/warnings, Apply result, re-read result, native Undo behavior, and any stale/mismatch/writer failure.
10. Classify every case as PASS, PARTIAL, BLOCKED, or NOT_APPLICABLE.

Required cases:

| Case | Status |
|---|---|
| Opacity | BLOCKED |
| Translation X/Y | BLOCKED |
| Rotation | BLOCKED |
| Scale | BLOCKED |
| Width/height | BLOCKED |
| Corner radius | BLOCKED |
| Stroke weight | BLOCKED |
| Path trim | BLOCKED |
| Replace | BLOCKED |
| Merge | BLOCKED |
| Add missing | BLOCKED |
| Timing only | BLOCKED |
| Easing only | BLOCKED |
| One-to-many | BLOCKED |
| Mixed manual/style | BLOCKED |
| Component and instance restrictions | BLOCKED |
| Timeline extension behavior | BLOCKED |
| Re-read verification | BLOCKED |
| Native Undo | BLOCKED |

Do not update `docs/implementation/API_CAPABILITY_MATRIX.md` or mark P5-020 started until this live evidence exists.
