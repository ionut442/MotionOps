# P7-015 Live Figma Verification Procedure

Status: BLOCKED until a live Figma plugin session is available.

## Purpose

Verify the production Stagger Builder against native Figma Motion behavior without relying on mocks or standalone browser tests.

## Required cases

- Fixed interval
- Total duration
- Fixed overlap
- Sequential after end
- Start before previous end
- Preserve duration
- Scale to fit
- Layer-panel, reverse, top-to-bottom, bottom-to-top, left-to-right, right-to-left, center-outward, edges-inward, and custom order where practical
- Clone-reference-and-stagger from Edit
- Sequencer draft stagger
- Mixed manual/style restrictions
- Timeline extension warning and planned result
- Reread verification
- Native Undo

## Record per case

- Fixture name and node IDs
- Environment and date
- Initial timing and resolved target order
- Stagger configuration
- Preview mutations, skips, warnings, and timeline changes
- Apply result
- Native Motion result after reread
- Native Undo result after reread
- Classification: PASS, PARTIAL, BLOCKED, or NOT_APPLICABLE

## Fixtures

Use deterministic fixtures covering horizontal auto-layout children, vertical auto-layout children, grid-like layouts, identical centers, missing geometry, mixed sizes, hidden or locked targets, manual/style/mixed Motion sources, and custom Scope order.

Do not add live Motion claims to fixture metadata until the actual case is run and retained.

## Current blocker

No live Figma session was available in this implementation batch, so P7-015 remains BLOCKED and Phase 7 remains INCOMPLETE.
