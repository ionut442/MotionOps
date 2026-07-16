import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import type { MotionSnapshot, NormalizedManualTrack } from "../src/domain/motion";
import {
  alignSelection,
  buildSequencerChangeOperation,
  createSequencerDraft,
  createViewport,
  distributeSelection,
  fitSelectionToDuration,
  offsetSelection,
  pixelToTime,
  resizeSelection,
  selectSequencerItems,
  snapTime,
  staggerSelection,
  timeToPixel,
  trimAndPadTimeline,
  updateSequencerViewport
} from "../src/domain/sequencer";

beforeAll(() => {
  fc.configureGlobal({ seed: 406021, numRuns: 80 });
});

const track = (property: string, times: readonly number[]): NormalizedManualTrack => ({
  trackId: `${property.toLowerCase()}-track`,
  property,
  propertyClassification: property.toLowerCase(),
  write: { status: "supported", reason: "test writer" },
  warnings: [],
  keyframes: times.map((timeMs, index) => ({
    keyframeId: `${property}-kf-${String(index)}`,
    ordinal: index,
    timeMs: timeMs as never,
    value: { index },
    easing: { kind: "linear" },
    valueClassification: "number"
  }))
});

const snapshot = (tracks: readonly NormalizedManualTrack[]): MotionSnapshot => ({
  nodeId: "node-a",
  nodeType: "RECTANGLE",
  sources: {
    kind: "mixed",
    hasDerivedAnimations: true,
    hasManualTracks: tracks.length > 0,
    hasStyleInstances: true,
    hasTimelines: true
  },
  timelines: [{ timelineId: "timeline-a", durationMs: 1000 as never, tracks: tracks.map((item) => item.property) }],
  manualTracks: [...tracks],
  styleInstances: [{ availableAnimationStyleId: "style-app", appliedStyleInstanceId: "style-applied", name: "Pop", warnings: [] }],
  componentProperties: {
    definitions: [],
    currentState: [],
    motionTracks: [],
    writeability: { status: "read-only", reason: "not under test" },
    warnings: []
  },
  derivedAnimations: [{ property: "OPACITY", valueClassification: "number", timelineDurationMs: 1000 as never }],
  capabilities: {
    derivedAnimationReads: { status: "supported", reason: "test" },
    manualTrackReads: { status: "supported", reason: "test" },
    manualTrackReplacement: { status: "supported", reason: "test" },
    styleInstanceReads: { status: "supported", reason: "test" },
    styleRemoveReapply: { status: "read-only", reason: "style timing read-only" },
    directStyleReapply: { status: "read-only", reason: "style timing read-only" },
    timelineReads: { status: "supported", reason: "test" },
    timelineDurationWrites: { status: "supported", reason: "test" },
    componentPropertyReads: { status: "read-only", reason: "test" },
    componentPropertyMotionTrackReads: { status: "read-only", reason: "test" },
    componentPropertyWrites: { status: "read-only", reason: "test" },
    componentRoots: { status: "unknown", reason: "test" },
    componentChildren: { status: "unknown", reason: "test" },
    componentSets: { status: "unknown", reason: "test" },
    variantComponents: { status: "unknown", reason: "test" },
    instanceRoots: { status: "unknown", reason: "test" },
    instanceDescendants: { status: "unknown", reason: "test" },
    nestedInstances: { status: "unknown", reason: "test" },
    nestedDescendants: { status: "unknown", reason: "test" }
  },
  warnings: []
});

const draftFrom = (tracks: readonly NormalizedManualTrack[]) =>
  createSequencerDraft({
    snapshots: [snapshot(tracks)],
    scopeOrder: [{ nodeId: "node-a", label: "Layer A" }],
    baseSnapshotId: "base-a",
    baseFingerprints: { "node-a": "fingerprint-a" }
  });

const selectedAll = (tracks: readonly NormalizedManualTrack[]) => {
  const draft = draftFrom(tracks);
  return selectSequencerItems(draft, draft.rows.flatMap((row) => row.items.filter((item) => item.source === "manual").map((item) => item.id)));
};

const manualItems = (draft: ReturnType<typeof draftFrom>) =>
  draft.rows.flatMap((row) => row.items).filter((item) => item.source === "manual");

describe("sequencer draft model and operations", () => {
  it("creates deterministic immutable rows from normalized Motion without mutating the source", () => {
    const source = snapshot([track("OPACITY", [0, 500])]);
    const before = structuredClone(source);
    const draft = createSequencerDraft({
      snapshots: [source],
      scopeOrder: [{ nodeId: "node-a", label: "Layer A" }],
      baseSnapshotId: "base-a",
      baseFingerprints: { "node-a": "fingerprint-a" },
      nowMs: () => 42
    });

    expect(source).toEqual(before);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(draft.rows[0].label).toBe("Layer A");
    expect(draft.rows[0].items.map((item) => item.source)).toEqual(["manual", "style"]);
    expect(draft.rows[0].items[0]).toMatchObject({ startMs: 0, endMs: 500, capability: "editable" });
    expect(draft.rows[0].items[1]).toMatchObject({ source: "style", capability: "read-only" });
  });

  it("converts viewport pixels and time deterministically with clamped zoom and pan", () => {
    const viewport = createViewport({ widthPx: 500, timelineEndMs: 2_000 as never, zoomPxPerMs: 0.5, panMs: 200 as never });
    expect(timeToPixel(300 as never, viewport)).toBe(50);
    expect(pixelToTime(50, viewport)).toBe(300);
    const zoomed = updateSequencerViewport(draftFrom([track("OPACITY", [0, 100])]), { zoomPxPerMs: 100, panMs: 20_000 as never });
    expect(zoomed.viewport.zoomPxPerMs).toBe(4);
    expect(zoomed.viewport.panMs).toBeLessThanOrEqual(zoomed.timelineEndMs);
  });

  it("offsets, nudges, resizes, aligns, distributes, fits, trims, pads, and serializes changed tracks", () => {
    let draft = selectedAll([
      track("OPACITY", [0, 100]),
      track("X", [200, 300]),
      track("Y", [500, 600])
    ]);

    draft = offsetSelection(draft, 25 as never);
    expect(manualItems(draft).map((item) => item.startMs)).toEqual([25, 225, 525]);

    draft = offsetSelection(draft, -25 as never);
    expect(manualItems(draft).map((item) => item.startMs)).toEqual([0, 200, 500]);

    draft = resizeSelection(selectSequencerItems(draft, [manualItems(draft)[0].id]), "end", 50 as never);
    expect(manualItems(draft)[0].durationMs).toBe(150);

    draft = selectSequencerItems(draft, manualItems(draft).map((item) => item.id));
    draft = alignSelection(draft, "start", { kind: "earliest" });
    expect(manualItems(draft).map((item) => item.startMs)).toEqual([0, 0, 0]);

    draft = distributeSelection(draft, "starts");
    expect(manualItems(draft).map((item) => item.startMs)).toEqual([0, 0, 0]);

    draft = fitSelectionToDuration(draft, 900 as never, "scale-all");
    expect(Math.max(...manualItems(draft).map((item) => item.endMs))).toBeLessThanOrEqual(900);

    draft = staggerSelection(draft, {
      kind: "stagger",
      timingMode: "fixed-interval",
      durationPolicy: "preserve",
      anchor: "preserve-first-start",
      intervalMs: 75 as never
    });
    expect(manualItems(draft).map((item) => item.startMs)).toEqual([0, 75, 150]);

    draft = trimAndPadTimeline(draft, { trimStart: true, trimEnd: true, paddingEndMs: 100 as never });
    expect(draft.timelineEndMs).toBeGreaterThanOrEqual(Math.max(...manualItems(draft).map((item) => item.endMs)));

    const operation = buildSequencerChangeOperation(draft);
    expect(operation.kind).toBe("sequencer-draft");
    expect(operation.manualTracks.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(operation))).toEqual(operation);
  });

  it("preserves IDs, values, relative offsets, and input immutability for offset operations", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5000 }), { minLength: 2, maxLength: 6 }).map((times) => [...times].sort((a, b) => a - b)),
        fc.integer({ min: 0, max: 500 }),
        (times, delta) => {
          const source = draftFrom([track("OPACITY", times)]);
          const selected = selectSequencerItems(source, [source.rows[0].items[0].id]);
          const before = structuredClone(selected);
          const moved = offsetSelection(selected, delta as never);
          expect(selected).toEqual(before);
          const beforeItem = manualItems(selected)[0];
          const afterItem = manualItems(moved)[0];
          expect(afterItem.id).toBe(beforeItem.id);
          expect(afterItem.keyframes.map((keyframe) => keyframe.id)).toEqual(beforeItem.keyframes.map((keyframe) => keyframe.id));
          expect(afterItem.keyframes.map((keyframe) => keyframe.value)).toEqual(beforeItem.keyframes.map((keyframe) => keyframe.value));
          expect(afterItem.keyframes.map((keyframe) => keyframe.timeMs - afterItem.startMs)).toEqual(
            beforeItem.keyframes.map((keyframe) => keyframe.timeMs - beforeItem.startMs)
          );
          expect(afterItem.keyframes.every((keyframe) => Number.isInteger(keyframe.timeMs))).toBe(true);
        }
      )
    );
  });

  it("snaps deterministically and leaves exact values possible when disabled", () => {
    expect(snapTime(124 as never, { enabled: true, intervalMs: 25 as never })).toBe(125);
    expect(snapTime(124 as never, { enabled: false, intervalMs: 25 as never })).toBe(124);
  });
});
