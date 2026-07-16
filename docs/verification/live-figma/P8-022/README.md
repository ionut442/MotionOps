# P8-022 Live Figma Verification - Standards And QA

Status: BLOCKED as of 2026-07-14 because no live Figma plugin session was available in this batch.

## Goal

Verify the Phase 8 Standards and Motion QA workflow against a live Figma document, including plugin-owned personal storage, file-level plugin data, safe-fix Apply, reread verification, QA rerun, and native Undo behavior.

## Required Environment Record

Record:

- Date and timezone.
- Figma desktop/browser version.
- MotionOps plugin build identifier.
- Document name or sanitized fixture ID.
- Active page and selected fixture nodes.
- Active standards source, standards ID, schema version, and standards version.
- Whether personal standards and file standards existed before the run.

Do not include secrets, screenshots with private content, or raw design-file content beyond sanitized fixture IDs and node IDs needed for reproducibility.

## Fixture Matrix

Run representative fixtures for:

- Manual Motion tracks with duration, delay, easing, timeline, duplicate keyframe, and property-value cases.
- Native style Motion data and read-only style limitations.
- Mixed manual/style data on the same property.
- Unsupported or restricted component/instance cases.
- Large keyframe data where practical.
- Corrupt or unsupported personal/file standards payloads where safely testable.

## Procedure

1. Open the plugin from a fresh production build.
2. Select the prepared manual fixture nodes and confirm Scope membership.
3. Open Review, select or import the active standards set, and save it as personal standards.
4. Reopen the plugin and confirm personal standards load without design content leakage.
5. Save the same or a controlled variant as file-level standards.
6. Reopen the file/plugin and confirm file standards load separately from personal standards.
7. Run QA on manual fixtures and record issue totals, unknown/not-evaluated counts, and representative issue IDs.
8. Select a duration-token issue, build the safe-fix preview, confirm no write has occurred yet, Apply, reread, and rerun QA.
9. Select an easing-token issue, build the safe-fix preview, confirm no write has occurred yet, Apply, reread, and rerun QA.
10. Select a timeline-extension candidate if available, build preview, Apply, reread, and rerun QA.
11. Confirm unsupported, ambiguous, style read-only, layout judgment, component restriction, and unknown-property issues do not expose unsafe fixes.
12. Create a stale preview by changing the target Motion data outside the preview path, then Apply and confirm stale blocking.
13. Use native Undo after a successful safe fix and reread through the plugin to confirm the expected live state.
14. Add ignore-once, reviewed, and file-level exception states, rerun QA, and confirm status reconciliation.
15. Remove at least one exception and confirm the issue returns as open on rerun when still applicable.

## Evidence To Record

For each verified case, record:

- Fixture ID and sanitized node IDs.
- Active standard source and version.
- Issue ID, rule ID, severity, category, status, and affected node/track/property.
- Selected safe fix and generated operation summary.
- Preview summary and whether Apply was enabled.
- Apply result, reread result, QA rerun result, and Undo result.
- Storage action result for personal and file standards.
- Corrupt/unsupported storage behavior result if tested.
- PASS, FAIL, or BLOCKED with exact blocker text.

## Acceptance Criteria

P8-022 can move to DONE only when:

- QA runs successfully on live manual, style, and mixed fixtures.
- Duration and easing safe fixes apply only through preview and explicit Apply.
- Timeline-extension safe fix is verified or documented as unavailable in the fixture with reason.
- Unsupported and ambiguous issues expose no unsafe fix.
- Stale preview blocks before writing.
- Successful Apply is followed by reread verification and QA rerun.
- Native Undo is checked after at least one successful safe fix.
- Personal standards storage survives reopen.
- File-level standards storage survives reopen and remains distinct from personal storage.
- Exceptions persist where intended and ignore-once remains session-only.
- Corrupt or unsupported storage fails safely where tested.

Do not update `docs/implementation/API_CAPABILITY_MATRIX.md` or claim live auto-fix/plugin-data behavior until this procedure passes with retained evidence.
