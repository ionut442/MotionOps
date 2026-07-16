# MotionOps for Figma
## Complete Codex Implementation Plan

**Document type:** Engineering implementation specification  
**Audience:** Codex and human reviewers  
**Status:** Source of truth for implementation  
**Target:** One complete product release; phases define implementation order, not separate product versions  
**Primary environment:** Figma plugin using the current Motion Plugin API  
**Last updated:** 2026-07-12

---

# 0. How Codex Must Use This Document

This document defines the complete product. Do not interpret later phases as optional versions or future roadmap items. The phases exist only to control dependencies, reduce implementation risk, and make testing manageable.

Codex must:

1. Read this document, the task ledger, the decision log, and the API capability matrix before changing code.
2. Work on one ledger task at a time unless two tasks are inseparable.
3. Inspect the existing repository before choosing frameworks, file locations, or architecture.
4. Reuse the existing stack where reasonable instead of rebuilding the project unnecessarily.
5. Implement complete vertical slices, not disconnected placeholders.
6. Add or update tests with every behavior change.
7. Run the required verification commands before marking a task complete.
8. Record exact verification evidence in the task ledger.
9. Update the decision log whenever an API uncertainty or architectural decision is resolved.
10. Never claim that a feature works unless it has automated tests and/or documented verification in Figma.
11. Never silently skip unsupported nodes, tracks, or properties. Return a clear compatibility result.
12. Never perform broad full-document scans implicitly.
13. Never send design-file content to a backend or analytics service.
14. Never commit or push unless the user explicitly requests it.
15. Keep all implementation generic. Do not add fixes that work only for a single test file, node name, or animation example.

---

# 1. Product Definition

## 1.1 Core promise

> Help designers inspect, target, edit, sequence, standardize, QA, and hand off native Figma Motion animations.

The product is a workflow layer on top of native Figma Motion. It does not replace Figma Motion and does not maintain a separate animation format.

## 1.2 Complete workflow

A user should be able to:

1. Select a frame, component, instance, group, or set of layers in Figma.
2. Define exactly which parent, children, or descendants belong to the operation.
3. Inspect every native Motion animation in that target scope.
4. Understand properties, keyframes, duration, delay, easing, source type, and warnings.
5. Batch-edit timings and easing.
6. Copy complete Motion, timing only, easing only, or selected tracks.
7. Apply copied Motion to one or many compatible targets.
8. Arrange animations in a custom sequencer.
9. Nudge, offset, align, distribute, scale, and stagger animations.
10. Apply changes to native Figma Motion data.
11. Preview the result in Figma’s native Motion environment.
12. Run configurable Motion QA.
13. Compare the work against motion standards and tokens.
14. Export a Markdown or JSON handoff and QA report.

## 1.3 Product boundaries

MotionOps is not:

- A general design-system auditor.
- A generic accessibility checker.
- A replacement for Figma’s native Motion timeline or playback.
- A separate animation engine.
- An AI animation generator.
- A preset marketplace.
- A Lottie, After Effects, Rive, or Jitter converter.
- A code-export product.
- A cloud crawler for Figma files.
- A video editor.
- A general prototyping toolkit.

---

# 2. Current Figma API Baseline

The implementation must be based on the current official Figma Plugin API, not memory or assumptions.

Verified baseline:

- The Motion API is available in beta and may change.
- `figma.motion` exposes Motion animation-style access and Motion helpers.
- Nodes expose `animationStyles`, `animations`, `manualKeyframeTracks`, and `timelines`.
- Nodes can apply/remove animation styles and apply/remove manual keyframe tracks.
- Timeline duration can be updated.
- Motion time values are expressed in seconds at the Figma API boundary.
- New plugins require `"documentAccess": "dynamic-page"`.
- Dynamic-page plugins must use async access patterns and explicitly load pages when needed.
- Full-document scans can be expensive and must be explicit.
- `figma.commitUndo()` exists and must be investigated and wrapped in a verified transaction strategy.
- Manual track editing is expected to read the full track, preserve track/keyframe IDs, and replace the full track.
- Native style-driven animation and manual keyframe animation require separate editing strategies.

Official references:

- [Motion API overview](https://developers.figma.com/docs/plugins/api/Motion/)
- [`figma.motion`](https://developers.figma.com/docs/plugins/api/figma-motion/)
- [Motion Plugin API release update](https://developers.figma.com/docs/plugins/updates/2026/06/23/version-1-update-127/)
- [`applyManualKeyframeTrack`](https://developers.figma.com/docs/plugins/api/properties/nodes-applymanualkeyframetrack/)
- [`animations`](https://developers.figma.com/docs/plugins/api/properties/nodes-animations/)
- [`animationStyles`](https://developers.figma.com/docs/plugins/api/properties/nodes-animationstyles/)
- [`timelines`](https://developers.figma.com/docs/plugins/api/properties/nodes-timelines/)
- [`setTimelineDuration`](https://developers.figma.com/docs/plugins/api/properties/nodes-settimelineduration)
- [Dynamic-page migration](https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/)
- [Accessing the document](https://developers.figma.com/docs/plugins/accessing-document/)
- [`figma.commitUndo`](https://developers.figma.com/docs/plugins/api/properties/figma-commitundo/)

## 2.1 Mandatory time-unit boundary

All user-facing values are shown in milliseconds.

All domain logic uses integer milliseconds.

Only the Figma adapter converts between seconds and milliseconds.

Required helpers:

```ts
type TimeMs = number & { readonly __brand: "TimeMs" };
type TimeSeconds = number & { readonly __brand: "TimeSeconds" };

function secondsToMs(value: number): TimeMs;
function msToSeconds(value: TimeMs): number;
```

Rules:

- Round incoming seconds to the nearest integer millisecond.
- Never perform timeline math in raw floating-point seconds.
- Never expose raw seconds to feature modules.
- Add unit tests for rounding, proportional scaling, repeated transforms, and boundary cases.
- Use one conversion module only; do not duplicate conversion logic.

## 2.2 Mandatory source-type split

Every normalized track and animation must identify its source:

```ts
type MotionSourceType = "manual" | "style" | "mixed";
```

Manual and style-driven changes must use separate strategies:

- **Manual tracks:** read complete track, preserve IDs, transform keyframes, replace complete track.
- **Style instances:** edit only supported style configuration such as duration, offset, easing, or exposed props using the verified safe API path.
- **Mixed nodes:** plan and apply each source independently, then report combined results.

The UI may present one coherent workflow, but the write engine must never pretend the two source types are equivalent.

---

# 3. Complete Product Feature Set

All features in this section belong to the final product and must be implemented through the phases later in this document.

## 3.1 Animation Scope and Targeting

Users can define the target set for every operation.

Scope modes:

- Selected object only.
- Current multi-selection.
- Direct children.
- All descendants.
- Descendants to a chosen depth.
- Manually checked layers in a hierarchy tree.
- Animated descendants only.
- Unanimated descendants only when an operation can create/apply Motion.
- Visible layers only.
- Unlocked layers only.
- Filter by node type.
- Filter by layer name.
- Exclude backgrounds.
- Exclude hidden layers.
- Exclude locked layers.
- Exclude selected layers manually.

Target-order modes:

- Layer-panel order.
- Reverse layer-panel order.
- Top to bottom.
- Bottom to top.
- Left to right.
- Right to left.
- Center outward.
- Edges inward.
- Custom drag-and-drop order.

The same target scope is reused by Inspect, Edit, Sequence, QA, and Handoff.

## 3.2 Animation Inspector

- Show every animated layer in the target scope.
- Show parent hierarchy and target membership.
- Show layer type, visibility, lock state, and source type.
- Show every animated property.
- Show manual tracks and native style instances separately.
- Show start time, end time, duration, delay/offset, and easing.
- Show all manual keyframes and style-generated animation data available through the API.
- Show property start and end values.
- Show track and keyframe IDs in an advanced debug view.
- Search and filter by layer, property, source type, and warning.
- Select and reveal a node in Figma from the Inspector.
- Show unusual or missing values.
- Show unsupported or partially supported tracks without hiding them.

## 3.3 Batch Editing

- Set exact duration across selected animations.
- Set duration while preserving start.
- Set duration while preserving end.
- Scale intermediate keyframes proportionally.
- Replace easing across selections.
- Replace one easing value with another.
- Apply cubic-bezier values.
- Apply supported spring values.
- Copy easing from a reference animation.
- Scale all timings by a percentage.
- Add a fixed delay.
- Remove delay.
- Replace delay with an exact value.
- Apply incremental delay.
- Apply a basic or advanced stagger.
- Preview all affected, partially affected, and skipped targets.
- Apply changes with a verified undo boundary.
- Re-read changed nodes and compare actual output with the planned output.

## 3.4 Copy/Paste Motion

Copy modes:

- Complete animation.
- Timing only.
- Easing only.
- Selected property tracks only.

Paste modes:

- Replace existing animation.
- Merge compatible tracks.
- Add only missing tracks.
- Paste timing while preserving values.
- Paste easing while preserving timing and values.
- Paste with an offset.
- Paste with a stagger.
- Paste one source to one target.
- Paste one source to multiple targets.
- Map multiple sources to multiple targets where a deterministic mapping exists.

Initial safe property allowlist:

- Opacity.
- Translation X.
- Translation Y.
- Rotation.
- Scale X.
- Scale Y.
- Width.
- Height.
- Corner radius.
- Stroke weight.
- Path trim.

Additional API-exposed properties may be supported after capability tests prove safe behavior.

Compatibility analysis must detect:

- Unsupported property.
- Node type does not support the property.
- Missing paint or effect index.
- Auto-layout mismatch.
- Existing conflicting track.
- Native-style/manual-track conflict.
- Instance or component restriction.
- Timeline too short.
- Partial compatibility.

## 3.5 Motion Sequencer

MotionOps includes its own custom timeline interface for editing native Figma Motion data.

The sequencer does not create a separate animation format. It:

1. Reads native Motion data.
2. Builds a local draft representation.
3. Lets users manipulate timing visually.
4. Generates an immutable change plan.
5. Writes the plan back to native Motion.
6. Re-reads and verifies the result.

Sequencer capabilities:

- Layer rows.
- Expandable property-track rows.
- Timeline ruler in milliseconds.
- Zoom and horizontal pan.
- Animation bars.
- Manual keyframe diamonds.
- Native style-instance bars.
- Multi-select.
- Box selection where practical.
- Drag to move.
- Drag edges to resize duration.
- Snapping.
- Configurable snap interval.
- Keyboard nudging.
- Start and end alignment.
- Distribution.
- Fit to duration.
- Timeline trimming.
- Stagger controls.
- Read-only representation for style-generated details that cannot be directly edited.
- Clear manual/style/mixed visual indicators.
- Draft reset.
- Change summary.
- Apply button.
- Native-preview guidance after apply.

The sequencer does not control Figma playback, playhead position, or canvas scrubbing.

## 3.6 Timeline Utilities

- Nudge by 10, 25, 50, 100, or custom milliseconds.
- Offset selected animations.
- Align starts to earliest, latest, exact time, or reference.
- Align ends to earliest, latest, exact time, or reference.
- Preserve duration or scale duration during alignment.
- Distribute starts evenly.
- Distribute ends evenly.
- Distribute animation centers.
- Distribute gaps evenly.
- Fit a sequence into an exact duration.
- Preserve durations while redistributing gaps.
- Scale durations and gaps together.
- Trim empty timeline time.
- Add timeline padding.
- Extend timeline when operations require it.

## 3.7 Stagger Builder

Staggering is a first-class feature shared by Edit and Sequence.

Order options:

- Layer-panel order.
- Reverse layer-panel order.
- Canvas spatial orders.
- Center outward.
- Edges inward.
- Custom order.

Timing options:

- Fixed interval.
- Fit within total duration.
- Fixed overlap.
- Start after previous animation ends.
- Start before previous animation ends.
- Preserve each duration.
- Scale durations to fit.
- Preserve first start.
- Preserve last end.
- Extend timeline automatically.

Stagger can operate on:

- Existing animations.
- Selected tracks only.
- Pasted animations applied to multiple targets.
- A reference animation cloned to a target scope.

## 3.8 Motion QA

QA categories:

### Timing

- Inconsistent duration.
- Duration outliers.
- Extremely short duration.
- Extremely long duration.
- Excessive delay.
- Negative or invalid timing.
- Keyframe beyond timeline.
- Empty timeline space.
- Inconsistent sequence gaps.
- Inconsistent stagger.

### Easing

- Mixed easing within one interaction.
- Mixed easing across equivalent layers.
- Custom easing where an approved token exists.
- Disallowed linear easing.
- Spring outside approved range.
- Missing or invalid easing.

### Layer state

- Animated hidden layer.
- Animated locked layer.
- Animated zero-size layer.
- Layer invisible for the full sequence where detectable.
- Layer outside intended scope.
- Unsupported node or property.
- Restricted component/instance case.

### Keyframes and tracks

- Duplicate keyframe times.
- Conflicting keyframes.
- Unordered keyframes.
- Redundant identical consecutive values.
- Single-keyframe track where start/end are expected.
- Manual track conflicting with a style-generated property.
- Multiple tracks attempting to animate the same property.
- Missing start or end state where a rule requires one.

### Values

- Extreme translation.
- Extreme scale.
- Zero or negative scale where inappropriate.
- Opacity outside the allowed range.
- Unexpected rotation.
- Unsupported paint/effect configuration.
- Layout animation likely to produce unexpected behavior.

### Standards

- Duration is not an approved token.
- Easing is not an approved token.
- Stagger interval is not approved.
- Interaction exceeds maximum duration.
- Interaction lacks a category.
- Required reduced-motion note is missing.
- Required handoff metadata is missing.

Severity:

- Error.
- Warning.
- Suggestion.
- Information.

Issue actions:

- Select affected layer.
- Open affected track.
- Apply a safe automatic fix.
- Open the relevant Edit or Sequence control.
- Ignore once.
- Add a file exception.
- Mark reviewed.

## 3.9 Motion Standards and Tokens

Token types:

- Duration.
- Easing.
- Delay.
- Stagger.
- Spring.
- Interaction category.

Standards support:

- Personal standards stored locally.
- File-level standards stored in plugin data.
- Import and export as JSON.
- Named standard sets.
- Rule thresholds.
- Interaction-category rules.
- Approved/disallowed values.
- Reduced-motion notes.
- Exceptions.
- Standard version metadata.
- Comparison of current values with the active standard.

No cloud backend is required for the initial complete implementation. File-level storage and JSON exchange provide team sharing without unnecessary infrastructure.

## 3.10 Handoff and Reports

- Animation summary by frame or interaction.
- Animated layers and properties.
- Start/end values.
- Keyframe times.
- Duration, delay, easing, and stagger.
- Native style instances.
- Manual tracks.
- Motion tokens used.
- Closest token for custom values.
- Differences from active standards.
- QA summary and issue list.
- Exceptions.
- Scope metadata.
- Plugin and standard version.
- Export as Markdown.
- Export as JSON.
- Copy to clipboard.
- Human-readable developer specification.

Code generation is explicitly excluded because native Figma functionality already covers that area.

---

# 4. Features Explicitly Excluded

Do not implement:

- Native Motion style creation, publishing, or team-library authoring.
- Replacement of Figma’s native playback engine.
- Control of the native playhead.
- Native play, pause, or scrub control.
- A custom canvas animation preview engine.
- Custom transform anchor or pivot editing.
- Wrapper-frame anchor simulation as a normal product feature.
- Arbitrary vector path morphing.
- After Effects import/export.
- Lottie import/export.
- Rive or Jitter conversion.
- CSS, React, Framer Motion, SwiftUI, Android Compose, or other code generation.
- AI-generated animation.
- Generic animation preset marketplace.
- General design-system audits.
- General accessibility audits unrelated to Motion.
- General layout, typography, or component cleanup.
- Automatic background file monitoring.
- Automatic cloud scanning.
- Full-document scan on plugin open.
- Full Motion backup and restoration.
- Editing from Dev Mode if the current API does not allow writes.
- Sending design content to analytics.
- A required SaaS backend for core functionality.

---

# 5. UI and Interaction Architecture

## 5.1 Core principle

The UI must follow the designer’s workflow rather than mirror the code modules.

Use five primary workspaces:

1. **Scope**
2. **Inspect**
3. **Edit**
4. **Sequence**
5. **Review**

Standards, Settings, Help, and Debug are secondary destinations.

This avoids presenting users with a long list of disconnected tools.

## 5.2 Recommended plugin window

Default:

- Width: approximately 1040–1200 px.
- Height: approximately 700–820 px.
- Resizable.
- Minimum usable width: approximately 760 px.
- Minimum usable height: approximately 560 px.

The exact values must be tested in Figma desktop and browser environments.

## 5.3 Global layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ Header: file scope · target count · rescan · standards · status   │
├───────────────┬──────────────────────────────────────┬─────────────┤
│ Workspace nav │ Main workspace                       │ Context /   │
│               │                                      │ change      │
│ Scope         │                                      │ preview     │
│ Inspect       │                                      │ drawer      │
│ Edit          │                                      │             │
│ Sequence      │                                      │             │
│ Review        │                                      │             │
├───────────────┴──────────────────────────────────────┴─────────────┤
│ Footer: sync state · warnings · keyboard help · apply/reset        │
└────────────────────────────────────────────────────────────────────┘
```

The context drawer may collapse on narrow widths.

## 5.4 Header

Header contents:

- Product name.
- Current Figma selection breadcrumb.
- Active scope label.
- Number of targets.
- Animated target count.
- Rescan button.
- Selection-sync toggle.
- Active standards set.
- Document state:
  - Synced.
  - Draft changes.
  - Applying.
  - Stale.
  - Error.
- Settings menu.

## 5.5 Workspace 1: Scope

Purpose:

Define exactly what the rest of the plugin operates on.

Layout:

### Scope-mode toolbar

- Selected object.
- Direct children.
- All descendants.
- Depth.
- Manual.

### Hierarchy tree

Each row shows:

- Checkbox.
- Layer icon.
- Layer name.
- Node type.
- Animated badge.
- Source badge.
- Hidden indicator.
- Locked indicator.
- Compatibility warning.

### Filters

- Search.
- Visible only.
- Unlocked only.
- Animated only.
- Node types.
- Exclusions.

### Order panel

- Current target order.
- Order mode.
- Custom drag-and-drop reorder.
- Reset order.

Primary action:

- Confirm scope.

The selected scope remains active across all workspaces until the user changes it or the document becomes stale.

## 5.6 Workspace 2: Inspect

Purpose:

Understand the selected Motion data before changing it.

Layout:

### Left portion

- Target list.
- Search and filters.
- Collapsible layer rows.

### Main detail panel

- Summary.
- Style instances.
- Manual tracks.
- Property rows.
- Keyframe table.
- Easing details.
- Timeline membership.
- Warnings.

### Detail modes

- Compact.
- Detailed.
- Debug.

Debug mode is hidden behind a developer setting and can show raw IDs and normalized JSON.

Primary actions:

- Edit selected.
- Copy Motion.
- Open in Sequence.
- Run QA.
- Select in Figma.

## 5.7 Workspace 3: Edit

Purpose:

Perform precise non-visual batch operations and copy/paste.

Use four internal tabs:

1. Timing
2. Easing
3. Copy/Paste
4. Stagger

### Timing tab

- Set duration.
- Preserve start/end.
- Scale timings.
- Delay.
- Reference animation.
- Affected source types.

### Easing tab

- Current-value summary.
- Replace mode.
- Approved tokens.
- Cubic-bezier editor.
- Spring editor where supported.
- Copy from reference.

### Copy/Paste tab

- Motion clipboard.
- Source summary.
- Track selector.
- Paste mode.
- Compatibility preview.
- Target mapping.
- Offset/stagger options.

### Stagger tab

- Target order.
- Timing mode.
- Interval/total duration.
- Preserve/scale behavior.
- Proposed timeline summary.

Every edit operation follows:

1. Configure.
2. Preview.
3. Validate.
4. Apply.
5. Verify.
6. Show result.

## 5.8 Workspace 4: Sequence

Purpose:

Visually arrange timing across many native Motion animations.

Layout:

### Sequencer toolbar

- Zoom.
- Snap toggle and interval.
- Nudge controls.
- Align.
- Distribute.
- Stagger.
- Fit.
- Trim.
- Reset draft.

### Layer/track column

- Layer rows.
- Expand/collapse properties.
- Source-type icon.
- Visibility of affected tracks.
- Lock unsupported tracks.

### Timeline canvas

- Millisecond ruler.
- Animation bars.
- Manual keyframes.
- Style bars.
- Selection outlines.
- Snap guides.
- QA markers.
- Timeline-end marker.

### Properties drawer

- Exact start.
- End.
- Duration.
- Delay.
- Easing.
- Selected keyframe value where editable.
- Compatibility/source limitations.

### Bottom change bar

- Number of pending changes.
- Number of warnings.
- Reset.
- Apply to Figma.

Important behavior:

- Dragging modifies local draft state only.
- No Figma writes occur during pointer movement.
- Apply generates one change plan and one verified operation group.
- If Figma data changed since the draft snapshot, mark the draft stale and require rescan or controlled rebase.
- After apply, tell the user to preview through native Figma Motion.

## 5.9 Workspace 5: Review

Use three internal tabs:

1. QA
2. Standards
3. Handoff

### QA tab

- Severity summary.
- Issue list.
- Filters.
- Node navigation.
- Safe auto-fixes.
- Exceptions.
- Passed checks.

### Standards tab

- Active standard set.
- Token tables.
- Interaction categories.
- Thresholds.
- Import/export.
- File/personal storage.
- Standard comparison.

### Handoff tab

- Scope summary.
- Animation report.
- Tokens.
- Deviations.
- QA results.
- Markdown preview.
- JSON preview.
- Copy/export actions.

## 5.10 Global change-preview drawer

Every write operation must use a common preview component.

Show:

- Operation name.
- Target count.
- Track count.
- Manual changes.
- Style changes.
- Timeline changes.
- Skipped targets.
- Warnings.
- Before/after examples.
- Apply button.

No operation may silently proceed when it has skipped or partially compatible targets.

## 5.11 Empty, loading, stale, and error states

Required states:

- No selection.
- Unsupported editor surface.
- Selection has no Motion.
- No eligible descendants.
- Scanning.
- Page not loaded.
- Draft is stale.
- Partial write.
- Verification mismatch.
- Unsupported API capability.
- No QA issues.
- No standard selected.
- Empty clipboard.

Every state must explain the next useful action.

## 5.12 Accessibility and usability

- Full keyboard navigation for ordinary controls.
- Visible focus indicators.
- Labels for icons.
- Sufficient contrast.
- No color-only meaning.
- Tooltip for source-type and compatibility badges.
- Keyboard nudge in the sequencer.
- Respect reduced-motion preference inside the plugin UI.
- Avoid animating the plugin UI unnecessarily.

---

# 6. Technical Architecture

## 6.1 Process separation

Figma plugin code runs in two environments:

### Main/plugin process

Owns:

- Figma API access.
- Selection reading.
- Page loading.
- Node lookup.
- Motion writes.
- Plugin-data storage.
- Undo management.
- Re-read verification.
- Figma notifications.

### UI process

Owns:

- React or existing UI framework.
- Workspace navigation.
- Draft state.
- Sequencer rendering.
- Forms.
- Preview.
- QA presentation.
- Reports.
- User interaction.

### Shared pure domain code

Owns:

- Normalized Motion model.
- Time transformations.
- Operation planning.
- Compatibility rules.
- QA rules.
- Standards matching.
- Report generation.
- Serializable message types.

Do not call the Figma API from UI feature components.

## 6.2 Typed message protocol

Use discriminated unions and request IDs.

Example:

```ts
type UiToPluginMessage =
  | { type: "SCAN_SCOPE"; requestId: string; payload: ScanScopeRequest }
  | { type: "SELECT_NODE"; requestId: string; payload: { nodeId: string } }
  | { type: "APPLY_CHANGE_PLAN"; requestId: string; payload: SerializedChangePlan }
  | { type: "LOAD_STANDARDS"; requestId: string }
  | { type: "SAVE_STANDARDS"; requestId: string; payload: StandardsSet };

type PluginToUiMessage =
  | { type: "SCAN_SCOPE_RESULT"; requestId: string; payload: ScopeSnapshot }
  | { type: "CHANGE_PLAN_RESULT"; requestId: string; payload: ApplyResult }
  | { type: "DOCUMENT_STALE"; payload: StaleReason }
  | { type: "ERROR"; requestId?: string; payload: SerializableError };
```

Requirements:

- Runtime schema validation at the process boundary.
- No `any`.
- Exhaustive switch statements.
- Serializable payloads only.
- Standard error codes.
- Request cancellation where practical.
- Ignore stale responses using request IDs.

## 6.3 Recommended source layout

Adapt to the existing repository, but preserve equivalent boundaries.

```text
src/
  plugin/
    index.ts
    messaging/
    document/
    motion/
      figma-motion-adapter.ts
      manual-track-writer.ts
      style-animation-writer.ts
      timeline-writer.ts
      undo-transaction.ts
      verification-reader.ts
    storage/
    selection/
  ui/
    app/
    workspaces/
      scope/
      inspect/
      edit/
      sequence/
      review/
    components/
    state/
    messaging/
  domain/
    motion-model/
    time/
    operations/
    compatibility/
    qa/
    standards/
    handoff/
  shared/
    contracts/
    errors/
    logging/
    utils/
tests/
  unit/
  integration/
  ui/
  fixtures/
  property/
docs/
  implementation/
  verification/
scripts/
```

## 6.4 Normalized domain model

Minimum model:

```ts
type NormalizedMotionDocument = {
  snapshotId: string;
  editorType: string;
  pageId: string;
  scope: ScopeDefinition;
  timeline: NormalizedTimeline | null;
  nodes: NormalizedMotionNode[];
  createdAt: number;
};

type NormalizedMotionNode = {
  id: string;
  name: string;
  nodeType: string;
  parentId?: string;
  depth: number;
  visible: boolean;
  locked: boolean;
  sourceType: MotionSourceType;
  styleInstances: NormalizedStyleInstance[];
  manualTracks: NormalizedManualTrack[];
  derivedAnimations: NormalizedDerivedAnimation[];
  timelines: NormalizedTimelineRef[];
  capabilities: NodeMotionCapabilities;
  warnings: NormalizationWarning[];
};

type NormalizedManualTrack = {
  id?: string;
  property: NormalizedMotionProperty;
  keyframes: NormalizedKeyframe[];
  editable: boolean;
};

type NormalizedKeyframe = {
  id?: string;
  timeMs: TimeMs;
  value: NormalizedMotionValue;
  easing?: NormalizedEasing;
};

type NormalizedStyleInstance = {
  instanceId: string;
  styleId: string;
  name?: string;
  durationMs: TimeMs;
  offsetMs: TimeMs;
  props: Record<string, unknown>;
  editableFields: StyleEditableFields;
};

type NormalizedTimeline = {
  id: string;
  durationMs: TimeMs;
};
```

## 6.5 Capability model

Do not infer editability from the presence of data alone.

```ts
type CapabilityState =
  | { kind: "supported" }
  | { kind: "supported-with-warning"; warning: string }
  | { kind: "read-only"; reason: string }
  | { kind: "unsupported"; reason: string }
  | { kind: "unknown"; investigationId: string };
```

Capabilities exist at:

- Node level.
- Property level.
- Source-type level.
- Operation level.
- Target/source pair for copy/paste.

## 6.6 Immutable change planning

All writes must be planned before execution.

```ts
type ChangePlan = {
  id: string;
  baseSnapshotId: string;
  operation: MotionOperation;
  mutations: PlannedMutation[];
  skipped: SkippedMutation[];
  warnings: PlanWarning[];
  expectedResult: ExpectedResultSummary;
};
```

Flow:

1. Read snapshot.
2. Build command.
3. Produce pure `ChangePlan`.
4. Present preview.
5. Revalidate against current Figma state.
6. Apply through source-specific writers.
7. Commit a verified undo boundary.
8. Re-read.
9. Diff expected and actual.
10. Return result.

## 6.7 Operation model

Operations should be composable and serializable.

```ts
type MotionOperation =
  | SetDurationOperation
  | ReplaceEasingOperation
  | ScaleTimingOperation
  | SetDelayOperation
  | OffsetOperation
  | AlignOperation
  | DistributeOperation
  | StaggerOperation
  | PasteMotionOperation
  | SetTimelineDurationOperation
  | AutoFixQaOperation;
```

No feature component should directly mutate normalized tracks.

## 6.8 Undo transaction strategy

Create one centralized `UndoTransaction` abstraction.

Phase 0 must verify the exact correct ordering of `figma.commitUndo()` calls in a persistent plugin session.

Requirements:

- One user-confirmed apply action equals one undoable operation group.
- A partially failed operation must not leave unrelated uncommitted writes.
- If rollback through `figma.triggerUndo()` is safe and verified, use it for failed atomic operations.
- Otherwise, apply mutations in a controlled order and report partial success.
- Record the verified strategy in `docs/implementation/DECISIONS.md`.
- Add a manual Figma verification case for every writer type.

## 6.9 Stale-data protection

Create a stable snapshot fingerprint based on relevant Motion data.

Before applying:

- Re-read affected nodes.
- Compare track/style/timeline fingerprints.
- If changed, stop and report stale data.
- Offer:
  - Rescan.
  - Rebuild plan.
  - Cancel.
- Do not overwrite changes made after the preview was generated.

## 6.10 Error model

Standard error categories:

- `API_UNAVAILABLE`
- `PAGE_NOT_LOADED`
- `NODE_NOT_FOUND`
- `NODE_CHANGED`
- `UNSUPPORTED_NODE`
- `UNSUPPORTED_PROPERTY`
- `STYLE_EDIT_RESTRICTED`
- `TRACK_WRITE_FAILED`
- `TIMELINE_WRITE_FAILED`
- `VERIFICATION_MISMATCH`
- `PARTIAL_SUCCESS`
- `INVALID_TIME`
- `INVALID_EASING`
- `STORAGE_FAILED`
- `UNKNOWN_API_SHAPE`

Errors must be serializable and user-readable.

## 6.11 Logging

Development logs may include:

- Operation IDs.
- Node IDs.
- Track IDs.
- Counts.
- Error codes.
- Timing metrics.

Production analytics must not include:

- File names.
- Layer names.
- Text contents.
- Raw design values.
- Screenshots.
- Client identifiers.

---

# 7. Testing and Verification Strategy

## 7.1 Required test layers

### Unit tests

Test all pure logic:

- Seconds/milliseconds conversion.
- Normalization.
- Duration changes.
- Timing scaling.
- Delay changes.
- Nudge.
- Alignment.
- Distribution.
- Stagger.
- Fit-to-duration.
- Timeline trimming.
- Easing replacement.
- Token matching.
- QA rules.
- Report generation.
- Compatibility decisions.

### Property-based tests

Use property-based testing for timing transformations.

Required invariants:

- Relative order is preserved when expected.
- IDs are preserved.
- No negative time unless explicitly allowed.
- Timeline end is not before any keyframe.
- Scaling by 100% is identity.
- Offset by 0 is identity.
- Nudge forward then backward by the same value restores the original.
- Distribute produces monotonic order.
- Stagger produces the requested interval within rounding tolerance.
- Repeated serialization does not accumulate float drift.

### Adapter tests

Use realistic API-shape fixtures for:

- Manual tracks.
- Style instances.
- Mixed nodes.
- Multiple timelines.
- Unsupported properties.
- Missing optional fields.
- New unknown beta fields.

### Plugin integration tests

Use a typed mock Figma runtime to test:

- Selection scanning.
- Async node lookup.
- Page loading.
- Message flow.
- Writer dispatch.
- Re-read verification.
- Stale detection.
- Undo wrapper behavior where mockable.
- Storage.

### UI tests

Test:

- Workspace navigation.
- Scope hierarchy.
- Checkbox selection.
- Filters.
- Inspector rendering.
- Batch forms.
- Compatibility preview.
- Sequencer interactions.
- QA filtering.
- Handoff export preview.
- Empty/loading/stale/error states.
- Keyboard accessibility.

### Browser UI tests

If the UI can run in a standalone development shell:

- Use Playwright for major workflows.
- Do not pretend this verifies Figma API writes.
- Mock plugin messages deterministically.

### Manual Figma verification

Required for API behavior that cannot be proven in mocks.

Every phase that writes Motion data must include:

- Fixture description.
- Exact steps.
- Expected result.
- Actual result.
- Figma environment.
- Date.
- Screenshots or structured notes if appropriate.
- Regression status.

## 7.2 Fixture matrix

Create deterministic fixtures for:

1. No Motion.
2. One manual opacity track.
3. Translation X/Y tracks.
4. Rotation.
5. Scale.
6. Width and height.
7. Corner radius.
8. Stroke weight.
9. Path trim.
10. Multiple keyframes.
11. Different easing per keyframe.
12. Native style instance.
13. Mixed native style and manual tracks.
14. Multiple animated children in auto layout.
15. Parent animation plus child animations.
16. Hidden animated layer.
17. Locked animated layer.
18. Duplicate keyframe times.
19. Timeline shorter than final keyframe.
20. Component.
21. Component set.
22. Instance.
23. Nested instance.
24. Unsupported paint/effect case.
25. Unknown beta property.
26. Large frame with at least 200 animated nodes.
27. Stress case with at least 2,000 keyframes.
28. Fractional-second source values.
29. Multiple selected roots.
30. Changed document after preview.

Where possible, build a development-only fixture generator command so the plugin can create repeatable test scenes.

## 7.3 Standard verification commands

Codex must inspect the existing project and define equivalent scripts.

Target scripts:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:coverage
npm run test:ui
npm run test:e2e
npm run build
npm run verify
```

`npm run verify` should run all non-manual release gates.

A task cannot be marked `DONE` while required verification is failing.

## 7.4 Coverage expectations

Prioritize behavior coverage over a vanity percentage.

Minimum goals:

- Domain time/operation logic: 95%+ branch coverage.
- QA rule engine: 90%+ branch coverage.
- Compatibility engine: 90%+ branch coverage.
- Plugin writers: all supported branches covered by integration tests plus manual verification.
- UI: all critical user paths covered.

## 7.5 Performance budgets

Measure, do not guess.

Initial targets for a modern desktop:

- Scan 100 animated nodes: under 500 ms where API loading permits.
- Normalize 2,000 keyframes: under 100 ms in pure domain code.
- Recompute a sequencer draft with 2,000 keyframes: under 50 ms.
- Pointer-drag visual feedback: target 60 fps.
- QA on 2,000 keyframes: under 200 ms in domain code.
- UI remains responsive during explicit page scans.

If API access exceeds these budgets, show progress and allow cancellation.

---

# 8. Project Control Files

Codex must create and maintain:

```text
docs/implementation/MOTIONOPS_IMPLEMENTATION_PLAN.md
docs/implementation/TASK_LEDGER.md
docs/implementation/DECISIONS.md
docs/implementation/API_CAPABILITY_MATRIX.md
docs/implementation/KNOWN_LIMITATIONS.md
docs/verification/
```

## 8.1 Task ledger format

`TASK_LEDGER.md` must contain:

```md
| ID | Phase | Task | Dependencies | Status | Files/Areas | Tests | Verification evidence | Notes |
|---|---|---|---|---|---|---|---|---|
```

Allowed statuses:

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `DONE`

Rules:

- Only one task should normally be `IN_PROGRESS`.
- A task is not `DONE` without verification evidence.
- Blocked tasks must name the blocker and next action.
- Split tasks that become too large.
- Do not mark an entire phase complete because the UI exists; all phase gates must pass.

## 8.2 Decision log format

Every material decision records:

```md
## DEC-XXX: Title

- Date:
- Status: Proposed | Accepted | Reversed
- Context:
- Options considered:
- Decision:
- Consequences:
- Evidence:
- Related tasks:
```

## 8.3 API capability matrix

Required columns:

```md
| Node type | Property/source | Read | Write | Copy | Batch | Sequence | QA | Verified in Figma | Notes |
```

No editing feature may claim support before the corresponding matrix entry is verified.

## 8.4 Verification records

For each phase:

```text
docs/verification/PHASE-00.md
docs/verification/PHASE-01.md
...
```

Each record contains:

- Commit or working-tree reference if available.
- Tasks verified.
- Commands run.
- Results.
- Manual Figma cases.
- Failures.
- Remaining risks.

---

# 9. Codex Work Protocol

For every task:

1. Read the task and dependencies.
2. Inspect relevant code and tests.
3. Mark the task `IN_PROGRESS`.
4. State the smallest complete implementation slice.
5. Implement domain behavior first where applicable.
6. Add tests.
7. Implement adapters/UI.
8. Run targeted tests.
9. Run the phase verification subset.
10. Perform manual Figma verification when required.
11. Update capability matrix and decisions.
12. Record exact evidence.
13. Mark `DONE`.
14. Select the next unblocked task.

When a test fails:

- Investigate the root cause.
- Do not weaken the assertion merely to make the suite green.
- Do not add fixture-specific branches.
- Record genuine API limitations.
- Prefer a clear unsupported result over risky behavior.

---

# 10. Logical Implementation Phases

These phases are implementation order only. The product is complete only after all phases and final gates pass.

---

## Phase 0 — Repository Baseline and API Feasibility

### Goal

Establish the real repository state and prove the risky Figma Motion behaviors before building product UI around assumptions.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P0-001 | Inspect repository, stack, manifest, scripts, and current functionality | None |
| P0-002 | Run and record baseline typecheck, lint, tests, and build | P0-001 |
| P0-003 | Create project control files and initial task ledger | P0-001 |
| P0-004 | Confirm `documentAccess: "dynamic-page"` and async API usage | P0-001 |
| P0-005 | Create Motion API capability spike harness | P0-002 |
| P0-006 | Verify reading `animations`, `manualKeyframeTracks`, `animationStyles`, and `timelines` | P0-005 |
| P0-007 | Verify manual track replacement with IDs preserved | P0-006 |
| P0-008 | Verify style-instance update/reapply behavior without duplication | P0-006 |
| P0-009 | Verify timeline-duration writes | P0-006 |
| P0-010 | Verify correct `commitUndo()` transaction boundaries | P0-007 |
| P0-011 | Verify component, component-set, instance, and nested-instance behavior | P0-006 |
| P0-012 | Investigate component-property keyframe tracks | P0-006 |
| P0-013 | Investigate gradient/paint/effect track shapes and safe support | P0-006 |
| P0-014 | Verify dynamic-page scanning and cancellation behavior | P0-004 |
| P0-015 | Build initial API capability matrix | P0-006 to P0-014 |
| P0-016 | Record accepted architecture decisions | P0-015 |

### Phase gate

- Baseline is documented.
- Every risky API assumption has evidence or is explicitly marked unsupported/unknown.
- Manual and style write strategies are known.
- Undo behavior is verified.
- Capability matrix exists.
- No product feature code depends on an unrecorded assumption.

---

## Phase 1 — Engineering Foundation

### Goal

Build the shared architecture required by every feature.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P1-001 | Establish typed UI/plugin message protocol | P0 |
| P1-002 | Add runtime message validation | P1-001 |
| P1-003 | Implement branded millisecond time model and conversion boundary | P0 |
| P1-004 | Implement normalized Motion domain types | P1-003 |
| P1-005 | Implement Figma-to-domain normalization | P1-004 |
| P1-006 | Implement source-type and capability classification | P1-005 |
| P1-007 | Implement standard error model | P1-001 |
| P1-008 | Implement immutable snapshot IDs and fingerprints | P1-005 |
| P1-009 | Implement change-plan types | P1-004 |
| P1-010 | Implement source-specific writer interfaces | P0, P1-009 |
| P1-011 | Implement undo transaction abstraction | P0-010 |
| P1-012 | Implement re-read verification and expected/actual diff | P1-010 |
| P1-013 | Implement stale-data detection | P1-008, P1-012 |
| P1-014 | Implement structured development logging | P1-007 |
| P1-015 | Create Figma runtime mock and realistic fixtures | P1-004 |
| P1-016 | Create unified verification script | P1-015 |

### Phase gate

- All Figma data enters through one adapter.
- All time math is integer milliseconds.
- All writes go through planned source-specific writers.
- Re-read verification and stale protection work.
- Foundation tests pass.

---

## Phase 2 — UI Shell, State Machine, and Scope

### Goal

Create the final UI framework and the shared target-selection workflow.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P2-001 | Implement resizable plugin shell | P1 |
| P2-002 | Implement five-workspace navigation | P2-001 |
| P2-003 | Implement application state machine | P2-001 |
| P2-004 | Implement global header and document status | P2-003 |
| P2-005 | Implement context/change-preview drawer shell | P2-001 |
| P2-006 | Implement scope definition domain model | P1 |
| P2-007 | Implement async selection and subtree scanner | P2-006 |
| P2-008 | Implement scope hierarchy tree | P2-007 |
| P2-009 | Implement scope modes | P2-008 |
| P2-010 | Implement filters and exclusions | P2-008 |
| P2-011 | Implement target ordering modes | P2-008 |
| P2-012 | Implement custom target order | P2-011 |
| P2-013 | Implement selection sync and node reveal | P2-007 |
| P2-014 | Implement scan cancellation and progress | P2-007 |
| P2-015 | Implement empty/loading/stale/error states | P2-003 |
| P2-016 | Add scope UI and integration tests | P2-008 to P2-015 |

### Phase gate

- User can select any supported scope.
- Target order is deterministic.
- Scans are async and cancelable.
- Large scopes do not freeze the UI.
- All other workspaces consume the same confirmed target set.

---

## Phase 3 — Animation Inspector

### Goal

Provide complete, trustworthy visibility into native Motion data.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P3-001 | Implement Inspector target list | P2 |
| P3-002 | Implement property and track grouping | P1, P3-001 |
| P3-003 | Render manual tracks and keyframes | P3-002 |
| P3-004 | Render native style instances and derived animation data | P3-002 |
| P3-005 | Render timing, delay, duration, and easing | P3-003, P3-004 |
| P3-006 | Implement compact/detailed/debug modes | P3-005 |
| P3-007 | Implement Inspector search and filters | P3-001 |
| P3-008 | Implement unusual-value detectors | P3-005 |
| P3-009 | Implement unsupported/partial-support indicators | P1-006 |
| P3-010 | Implement select/reveal in Figma | P2-013 |
| P3-011 | Add Inspector unit, UI, and integration tests | P3-001 to P3-010 |
| P3-012 | Manually verify Inspector against fixture matrix | P3-011 |

### Phase gate

- Inspector displays all API-exposed Motion data without silently dropping unknown fields.
- Manual/style/mixed sources are obvious.
- Values match native Figma data.
- Node navigation works.
- Fixture matrix is verified.

---

## Phase 4 — Editing Engine and Batch Editing

### Goal

Implement safe, previewable batch changes using separate manual and style strategies.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P4-001 | Implement generic operation planner | P1 |
| P4-002 | Implement manual-track transformation strategy | P4-001 |
| P4-003 | Implement native-style transformation strategy | P4-001, P0-008 |
| P4-004 | Implement mixed-source planner | P4-002, P4-003 |
| P4-005 | Implement duration operation | P4-004 |
| P4-006 | Implement preserve-start/preserve-end behavior | P4-005 |
| P4-007 | Implement proportional keyframe scaling | P4-002 |
| P4-008 | Implement easing replacement | P4-004 |
| P4-009 | Implement cubic-bezier validation | P4-008 |
| P4-010 | Implement spring handling where capability is verified | P4-008 |
| P4-011 | Implement delay operation | P4-004 |
| P4-012 | Implement overall timing-scale operation | P4-004 |
| P4-013 | Implement common change-preview component | P4-001 |
| P4-014 | Implement apply/verify/result workflow | P1-011 to P1-013 |
| P4-015 | Implement Edit Timing UI | P4-005 to P4-012 |
| P4-016 | Implement Edit Easing UI | P4-008 to P4-010 |
| P4-017 | Add property-based tests for timing operations | P4-005 to P4-012 |
| P4-018 | Add writer integration tests | P4-014 |
| P4-019 | Manually verify undo and re-read behavior | P4-014 |
| P4-020 | Update capability matrix | P4-019 |

### Phase gate

- Duration, easing, delay, and proportional scaling work for verified source types.
- IDs are preserved.
- One apply action has a verified undo behavior.
- Verification mismatch is handled safely.
- No skipped target is hidden.

---

## Phase 5 — Copy/Paste Motion and Compatibility Engine

### Goal

Reuse Motion safely across one or many targets.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P5-001 | Define serializable Motion clipboard model | P3 |
| P5-002 | Implement complete-animation copy | P5-001 |
| P5-003 | Implement timing-only copy | P5-001 |
| P5-004 | Implement easing-only copy | P5-001 |
| P5-005 | Implement selected-track copy | P5-001 |
| P5-006 | Implement property capability registry | P1-006 |
| P5-007 | Implement source-target compatibility engine | P5-006 |
| P5-008 | Implement replace paste | P5-002, P5-007 |
| P5-009 | Implement merge-compatible paste | P5-007 |
| P5-010 | Implement add-missing-only paste | P5-007 |
| P5-011 | Implement paste with timing preservation | P5-003 |
| P5-012 | Implement paste with easing preservation | P5-004 |
| P5-013 | Implement one-to-many mapping | P5-008 |
| P5-014 | Implement deterministic multi-source mapping | P5-013 |
| P5-015 | Implement offset and stagger options | P5-013 |
| P5-016 | Implement clipboard and paste UI | P5-002 to P5-015 |
| P5-017 | Add compatibility matrix tests | P5-007 |
| P5-018 | Add copy/paste integration tests | P5-008 to P5-015 |
| P5-019 | Manually verify safe property allowlist | P5-018 |
| P5-020 | Update capability matrix and limitations | P5-019 |

### Phase gate

- Complete, timing-only, easing-only, and selected-track copy work.
- One source can be applied to many targets.
- Compatibility is explicit.
- Partial success is safe and reported.
- Safe property allowlist is verified in Figma.

---

## Phase 6 — Motion Sequencer and Timeline Utilities

### Goal

Build the custom visual sequencing interface for native Motion data.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P6-001 | Define sequencer draft model | P1, P3 |
| P6-002 | Implement sequencer viewport, ruler, zoom, and pan | P6-001 |
| P6-003 | Implement layer and track rows | P6-001 |
| P6-004 | Render manual animation bars and keyframes | P6-002, P6-003 |
| P6-005 | Render native style bars and read-only generated details | P6-002, P6-003 |
| P6-006 | Implement selection and multi-selection | P6-004, P6-005 |
| P6-007 | Implement drag-to-move draft behavior | P6-006 |
| P6-008 | Implement drag-to-resize supported animations | P6-006 |
| P6-009 | Implement snapping and guides | P6-007, P6-008 |
| P6-010 | Implement keyboard nudge | P6-006 |
| P6-011 | Implement offset operation | P4-001 |
| P6-012 | Implement align-start operation | P4-001 |
| P6-013 | Implement align-end operation | P4-001 |
| P6-014 | Implement distribute operation | P4-001 |
| P6-015 | Implement fit-to-duration operation | P4-001 |
| P6-016 | Implement timeline trim/padding operation | P4-001 |
| P6-017 | Implement sequencer property drawer | P6-006 |
| P6-018 | Implement draft reset and stale handling | P1-013, P6-001 |
| P6-019 | Implement sequencer change-plan generation | P6-007 to P6-016 |
| P6-020 | Implement apply/verify workflow | P4-014, P6-019 |
| P6-021 | Add property-based timeline-operation tests | P6-011 to P6-016 |
| P6-022 | Add UI interaction tests | P6-002 to P6-018 |
| P6-023 | Add performance benchmarks | P6-002 to P6-019 |
| P6-024 | Manually verify native timeline results | P6-020 |

### Phase gate

- Sequencer edits native Motion data through a draft/apply workflow.
- No write occurs during drag.
- Timeline operations are deterministic.
- Style and manual restrictions are visible.
- Large fixture remains usable.
- Native Figma timeline reflects applied changes.

---

## Phase 7 — Stagger Builder

### Goal

Provide robust target ordering and sequencing automation across Edit and Sequence.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P7-001 | Define stagger operation and invariants | P4, P6 |
| P7-002 | Implement fixed-interval stagger | P7-001 |
| P7-003 | Implement total-duration stagger | P7-001 |
| P7-004 | Implement overlap-based stagger | P7-001 |
| P7-005 | Implement sequential-after-end stagger | P7-001 |
| P7-006 | Implement preserve-duration behavior | P7-002 to P7-005 |
| P7-007 | Implement scale-to-fit behavior | P7-002 to P7-005 |
| P7-008 | Implement all target-order modes | P2-011 |
| P7-009 | Implement center-outward and edge-inward ordering | P7-008 |
| P7-010 | Implement clone-reference-and-stagger workflow | P5, P7-002 |
| P7-011 | Implement Stagger UI in Edit | P7-002 to P7-010 |
| P7-012 | Integrate stagger into Sequencer toolbar | P7-002 to P7-010 |
| P7-013 | Add property-based stagger tests | P7-002 to P7-010 |
| P7-014 | Add auto-layout and spatial-order fixtures | P7-008 |
| P7-015 | Manually verify stagger results in native Motion | P7-011, P7-012 |

### Phase gate

- All promised order modes and timing modes work.
- Auto-layout children can be targeted predictably.
- Target order is shown before apply.
- Native Motion data reflects the exact planned stagger.

---

## Phase 8 — Standards and Motion QA

### Goal

Turn raw animation data into repeatable quality and consistency workflows.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P8-001 | Define standards and token schema | P1 |
| P8-002 | Implement personal storage | P8-001 |
| P8-003 | Implement file-level storage | P8-001 |
| P8-004 | Implement JSON import/export and schema migration | P8-001 |
| P8-005 | Implement token matching | P8-001 |
| P8-006 | Implement interaction-category rules | P8-001 |
| P8-007 | Implement modular QA rule interface | P3 |
| P8-008 | Implement timing rules | P8-007 |
| P8-009 | Implement easing rules | P8-007 |
| P8-010 | Implement layer-state rules | P8-007 |
| P8-011 | Implement keyframe/track rules | P8-007 |
| P8-012 | Implement property-value rules | P8-007 |
| P8-013 | Implement standards-compliance rules | P8-005, P8-006, P8-007 |
| P8-014 | Implement severity and issue grouping | P8-007 |
| P8-015 | Implement safe auto-fix framework | P4-001, P8-007 |
| P8-016 | Implement exceptions and ignore behavior | P8-007 |
| P8-017 | Implement Standards UI | P8-001 to P8-006 |
| P8-018 | Implement QA UI | P8-007 to P8-016 |
| P8-019 | Implement node/track navigation from issues | P3-010 |
| P8-020 | Add unit tests for every QA rule | P8-008 to P8-013 |
| P8-021 | Add storage and migration tests | P8-002 to P8-004 |
| P8-022 | Manually verify safe auto-fixes | P8-015 |

### Phase gate

- Every QA rule has tests.
- Safe fixes use the same planned-write engine as manual edits.
- Standards can be stored, shared through the file, imported, and exported.
- Unknown API data does not cause false “pass” results.
- Exceptions are explicit and reportable.

---

## Phase 9 — Handoff and Reporting

### Goal

Produce clear, deterministic reports based on the same normalized data and standards.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P9-001 | Define report domain model | P3, P8 |
| P9-002 | Implement animation summary generation | P9-001 |
| P9-003 | Implement token and standards-deviation summary | P8-005, P9-001 |
| P9-004 | Implement QA report integration | P8, P9-001 |
| P9-005 | Implement Markdown renderer | P9-002 to P9-004 |
| P9-006 | Implement JSON renderer and schema version | P9-002 to P9-004 |
| P9-007 | Implement clipboard export | P9-005 |
| P9-008 | Implement file export | P9-005, P9-006 |
| P9-009 | Implement Handoff UI and preview | P9-005 to P9-008 |
| P9-010 | Add golden-file report tests | P9-005, P9-006 |
| P9-011 | Verify reports against fixture matrix | P9-010 |

### Phase gate

- Markdown and JSON are deterministic.
- Reports include scope, animations, tokens, deviations, QA, and exceptions.
- No code generation is included.
- Export does not require a backend.

---

## Phase 10 — Integration, Hardening, and Release Readiness

### Goal

Make the complete product reliable, understandable, and releasable.

### Tasks

| ID | Task | Dependencies |
|---|---|---|
| P10-001 | Complete cross-workspace integration flows | P2 to P9 |
| P10-002 | Implement global keyboard and accessibility review | P2 to P9 |
| P10-003 | Implement performance profiling and optimizations | P2 to P9 |
| P10-004 | Implement cancellation for long scans and plans | P2 to P9 |
| P10-005 | Implement unknown-beta-field resilience tests | P1 |
| P10-006 | Run complete fixture matrix | P3 to P9 |
| P10-007 | Run destructive-operation regression suite | P4 to P8 |
| P10-008 | Verify undo across every write operation | P4 to P8 |
| P10-009 | Verify dynamic-page behavior in large files | P2 |
| P10-010 | Verify browser and desktop Figma environments | P2 to P9 |
| P10-011 | Finalize help text and limitation explanations | P3 to P9 |
| P10-012 | Finalize privacy-safe analytics abstraction or disable analytics | P1 |
| P10-013 | Add license/feature-gating abstraction without coupling core logic | P2 to P9 |
| P10-014 | Build release package | P10-001 to P10-013 |
| P10-015 | Run full `npm run verify` and document results | P10-014 |
| P10-016 | Produce final known-limitations and support matrix | P10-015 |

### Final product gate

The product is complete only when:

- All ledger tasks are `DONE` or explicitly removed from scope by a recorded user decision.
- All automated verification passes.
- Manual Figma fixture matrix passes.
- Undo behavior is verified.
- No data-loss issue is open.
- No unsupported case is silently handled.
- All five workspaces are connected.
- All included features are implemented.
- Excluded features have not leaked into scope.
- API capability and known-limitations documents are current.

---

# 11. Critical End-to-End Acceptance Scenarios

## Scenario A — Auto-layout child targeting and stagger

1. User selects an auto-layout list containing ten cards.
2. Scope defaults to selected parent.
3. User switches to direct children.
4. User excludes one hidden card.
5. User chooses top-to-bottom order.
6. User copies Motion from one reference card.
7. User pastes it to the remaining cards.
8. User applies a 40 ms stagger.
9. Compatibility preview shows all affected tracks.
10. User applies.
11. Figma native Motion timeline shows the expected offsets.
12. One undo restores the prior state.

## Scenario B — Mixed style/manual batch edit

1. User selects a frame containing style-driven and manual animations.
2. Inspector identifies source types.
3. User sets duration to 300 ms.
4. Preview separates style-instance updates from manual-track scaling.
5. Unsupported style props are reported.
6. User applies.
7. Writers use separate strategies.
8. Re-read verification matches the plan.
9. One undo restores all changes.

## Scenario C — Custom sequence editing

1. User opens Sequence for a selected interaction.
2. Sequencer renders layers, bars, and keyframes.
3. User multi-selects five animations.
4. User drags them 100 ms later.
5. User aligns ends.
6. User fits the sequence to 900 ms.
7. No document write occurs while dragging.
8. User applies the draft.
9. Figma native timeline reflects the final sequence.
10. QA reruns and reports no timeline overflow.

## Scenario D — Motion QA and auto-fix

1. User scans a frame with mixed easing and duplicate keyframe times.
2. QA reports both issues with appropriate severity.
3. User selects the affected node from the issue.
4. User applies a safe easing-token fix.
5. Fix uses the standard change-plan engine.
6. QA reruns.
7. Resolved issue disappears.
8. Duplicate-keyframe issue remains until manually reviewed.

## Scenario E — Standards and handoff

1. User imports a standards JSON file.
2. User assigns an interaction category.
3. QA compares current Motion with the active standard.
4. User accepts one file-level exception.
5. Handoff includes tokens, deviations, QA, and exception.
6. Markdown and JSON export successfully.
7. No design content leaves the plugin without explicit export.

## Scenario F — Stale-document protection

1. User creates a batch-edit preview.
2. The Figma document changes before apply.
3. Plugin detects fingerprint mismatch.
4. Apply is blocked.
5. User rescans.
6. Plan is rebuilt against current data.
7. No newer work is overwritten.

---

# 12. Definition of Done for Every Feature

A feature is done only when:

- Domain behavior is implemented.
- UI behavior is implemented.
- Error, empty, loading, and partial-success states exist.
- Automated tests cover normal and edge cases.
- Figma API behavior is manually verified when relevant.
- Accessibility is checked.
- Capability matrix is updated.
- Known limitations are documented.
- Task ledger includes exact evidence.
- No TODO or placeholder blocks core behavior.
- No hidden fallback silently changes user data.

---

# 13. Initial Decisions Codex Must Not Reopen Without Evidence

1. Internal time unit is integer milliseconds.
2. Figma seconds are confined to the adapter boundary.
3. Manual and style-driven writes use different strategies.
4. Scope is selection-first.
5. Full-page/file scans are explicit and cancelable.
6. Sequencer edits a local draft and writes only on Apply.
7. Native Figma Motion remains the source of truth.
8. The plugin does not implement playback.
9. The plugin does not generate implementation code.
10. Core functionality does not require a backend.
11. QA auto-fixes use the same safe write engine as manual edits.
12. Unsupported data is visible, not discarded.
13. No operation is considered successful until re-read verification passes.

---

# 14. Investigations That Must Be Resolved in Phase 0

Codex must investigate and record evidence for:

- Exact safe method for reconfiguring an existing native animation-style instance.
- Whether style reapplication creates duplicate instances.
- Correct `figma.commitUndo()` placement for one operation per undo.
- Whether rollback with `figma.triggerUndo()` is safe after partial failure.
- Exact component, component-set, instance, and nested-instance restrictions.
- Component-property keyframe track support.
- Gradient-stop track support.
- Paint/effect index compatibility behavior.
- Maximum practical operation size.
- Unknown Motion beta fields and forward-compatible normalization.
- Dev Mode read/write behavior if the plugin supports a Dev Mode surface.

If an investigation fails:

- Record the limitation.
- Set the capability to read-only or unsupported.
- Keep the rest of the product functional.
- Do not add a risky workaround unless the user explicitly approves it.

---

# 15. Final Product Summary

MotionOps should feel like one coherent workflow:

## Scope

Choose what should be inspected or animated.

## Inspect

Understand every native Motion layer, property, keyframe, timing, easing, and source.

## Edit

Batch-change timing and easing, then copy or apply Motion safely.

## Sequence

Arrange native Motion visually with a custom timeline, alignment, distribution, offset, fit, and stagger tools.

## Review

Validate against QA and motion standards, then export a clear handoff.

The implementation is complete only when all five workspaces operate on the same normalized data, use the same compatibility and write engines, and produce verified changes in native Figma Motion.
