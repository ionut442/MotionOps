# P0-008 Style Instance Verification

Status: DONE - conclusive partial live behavior recorded.

P0-008 verifies native Motion animation style instance reapply/update behavior without assuming ideal write support. A conclusive supported, supported-with-warning, read-only, unsupported, partial, or mixed result completes the investigation. Run `p008-mriu1fap-25c85d` meets that bar.

## Retained Live Run

- Run ID: `p008-mriu1fap-25c85d`
- Manifest: `test-results/p008-mriu1fap-25c85d.manifest.json`
- Schema: `1`
- Emitted manifest accepted: `true`
- Manifest classification: `mixed`
- Audited classification: `mixed: S01-S05 partial, S06 supported`
- Manifest SHA-256: `1aafad028d51ad3120be5e0a25048c2f21f521e3d20a9fc86d4f6396d96588e8`

The emitted manifest says `accepted=true` with `classification="mixed"`. S01-S05 prove direct reapply/update duplicates style instances, and S06 proves remove-by-applied-instance then reapply-by-available-style keeps one style instance.

## API Shape

Installed `@figma/plugin-typings` 1.130.0 exposes:

- `figma.motion.figmaAnimationStyles(): AvailableAnimationStyle[]`
- `node.animationStyles: AppliedAnimationStyle[]`
- `node.applyAnimationStyle(styleId, animationStyleData?): string`
- `node.removeAnimationStyle(id): void`

`AvailableAnimationStyle.styleId` is the application ID for `applyAnimationStyle`. `AppliedAnimationStyle.id` is the instance ID for `removeAnimationStyle`. P0-008 keeps those separate: selected application ID `Scale`; applied style reference ID `CodeComponentId:6373:83`; applied instance IDs `AnimationPresetId:*`.

## Result

- Direct reapply/update: partial/unsafe because it duplicates applied style instances.
- Repeated reapply: unsupported for no-duplicate semantics.
- Sibling isolation: unrelated fingerprints stayed stable, but target duplicated.
- Restoration via reapply: partial/unsafe because it leaves duplicates.
- Remove/reapply: supported when removing the applied instance ID and reapplying the available application ID.

Do not implement product style updates as direct `applyAnimationStyle` reapply. Future style-writing work must use remove/reapply with mandatory re-read and duplicate checks.
