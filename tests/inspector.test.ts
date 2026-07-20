import { describe, expect, test, vi, afterEach } from "vitest";
import {
  buildInspectorTargets,
  capabilityLabel,
  collectInspectorProperties,
  createDefaultInspectorFilters,
  detectInspectorWarnings,
  filterInspectorTargets,
  formatEasing,
  formatMilliseconds,
  formatMotionValue,
  formatValue,
  groupInspectorTarget,
  nodeTypeLabel,
  trackTiming
} from "../src/domain/inspector";
import { normalizeMotionSnapshot, type MotionSceneNode } from "../src/plugin/motion";
import { inspectMotionTargets } from "../src/plugin/inspector";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const node = (overrides: Record<string, unknown> = {}): FakeNode => ({
  id: "node-1",
  name: "Mixed Motion",
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: "opacity-track",
      keyframes: [
        { id: "kf-2", time: 0.5, value: { type: "FLOAT", value: 1 }, easing: { beta: true } },
        { id: "kf-1", time: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
        { id: "kf-dup", time: 0.5, value: { type: "FLOAT", value: 0.75 }, easing: { type: "EASE_IN" } }
      ]
    }
  },
  animationStyles: [{ id: "applied-style", styleId: "available-style", name: "Pulse" }],
  animations: { OPACITY: { timelineDuration: 0.25, beta: { preserved: true } } },
  timelines: [{ id: "timeline-a", duration: 0.25 }],
  applyManualKeyframeTrack: vi.fn(),
  removeAnimationStyle: vi.fn(),
  applyAnimationStyle: vi.fn(),
  setTimelineDuration: vi.fn(),
  ...overrides
});

describe("Inspector presentation", () => {
  test("groups manual, style, derived, timeline, and capability data deterministically", () => {
    const snapshot = normalizeMotionSnapshot(node());
    const groups = groupInspectorTarget(snapshot);

    expect(groups.sourceKind).toBe("mixed");
    expect(groups.manualGroups.map((group) => group.property)).toEqual(["OPACITY"]);
    expect(groups.manualGroups[0].tracks[0].keyframes.map((keyframe) => keyframe.keyframeId)).toEqual([
      "kf-1",
      "kf-2",
      "kf-dup"
    ]);
    expect(groups.styleGroups[0].instance.name).toBe("Pulse");
    expect(groups.derivedAnimations.map((animation) => animation.property)).toEqual(["OPACITY"]);
    expect(groups.timelines[0].timelineId).toBe("timeline-a");
    expect(groups.capabilities.map(([name]) => name)).toContain("manualTrackReads");
  });

  test("formats timing, property-aware values, easing, and capability labels without raw seconds", () => {
    expect(formatMilliseconds(250)).toBe("250 ms");
    expect(formatMilliseconds(0)).toBe("0 ms");
    expect(formatMotionValue("OPACITY", { type: "FLOAT", value: 0.3 })).toBe("30%");
    expect(formatMotionValue("OPACITY", { type: "FLOAT", value: 1 })).toBe("100%");
    expect(formatMotionValue("ROTATION", { type: "FLOAT", value: 45 })).toBe("45°");
    expect(formatMotionValue("TRANSLATION_X", { type: "FLOAT", value: -20 })).toBe("-20 px");
    expect(formatMotionValue("WIDTH", { type: "FLOAT", value: 240 })).toBe("240 px");
    expect(formatMotionValue("HEIGHT", { type: "FLOAT", value: 120.5 })).toBe("120.5 px");
    expect(formatMotionValue("SCALE", { type: "FLOAT", value: 1.2 })).toBe("120%");
    expect(formatMotionValue("CORNER_RADIUS", { type: "FLOAT", value: 12 })).toBe("12 px");
    expect(formatMotionValue("STROKE_WEIGHT", { type: "FLOAT", value: 2 })).toBe("2 px");
    expect(formatMotionValue("FILL", { type: "PAINT", value: { color: "red" } })).toBe("Paint value");
    expect(formatMotionValue("BETA", { type: "BETA" })).toBe("Beta value");
    expect(formatValue({ type: "FLOAT", value: 1 })).toBe("{ type: FLOAT, value: 1 }");
    expect(formatEasing({ kind: "cubic-bezier", x1: 0, y1: 0.2, x2: 1, y2: 0.8 })).toBe(
      "Cubic bezier (0, 0.2, 1, 0.8)"
    );
    expect(capabilityLabel("supported-with-warning")).toBe("Partially editable");
  });

  test("formats Inspect node types in sentence case", () => {
    expect(nodeTypeLabel("RECTANGLE")).toBe("Rectangle");
    expect(nodeTypeLabel("FRAME")).toBe("Frame");
    expect(nodeTypeLabel("COMPONENT")).toBe("Component");
    expect(nodeTypeLabel("COMPONENT_SET")).toBe("Component set");
    expect(nodeTypeLabel("INSTANCE")).toBe("Instance");
  });

  test("derives track timing from first and last keyframes", () => {
    const snapshot = normalizeMotionSnapshot(node());
    expect(trackTiming(snapshot.manualTracks[0])).toEqual({
      startMs: 0,
      endMs: 500,
      durationMs: 500,
      keyframeCount: 3
    });

    const delayed = normalizeMotionSnapshot(node({
      manualKeyframeTracks: {
        TRANSLATION_X: {
          id: "delayed",
          keyframes: [
            { id: "a", time: 0.2, value: { type: "FLOAT", value: 10 }, easing: { type: "LINEAR" } },
            { id: "b", time: 0.55, value: { type: "FLOAT", value: 30 }, easing: { type: "LINEAR" } }
          ]
        }
      }
    }));
    expect(trackTiming(delayed.manualTracks[0])).toMatchObject({ startMs: 200, endMs: 550, durationMs: 350 });
  });

  test("classifies actionable warnings separately from limitations and information", () => {
    const warnings = detectInspectorWarnings(normalizeMotionSnapshot(node()));

    expect(warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_KEYFRAME_TIME",
        "TIMELINE_SHORTER_THAN_KEYFRAME",
        "UNKNOWN_EASING",
        "UNKNOWN_EASING_SHAPE",
        "MIXED_SOURCE_PROPERTY"
      ])
    );
    expect(warnings.find((warning) => warning.code === "UNKNOWN_DERIVED_SHAPE")).toMatchObject({
      category: "limitation",
      title: "Some opacity details are read-only"
    });
    expect(warnings.find((warning) => warning.code === "MIXED_SOURCE_PROPERTY")).toMatchObject({
      category: "information"
    });
    expect(warnings.find((warning) => warning.code === "DUPLICATE_KEYFRAME_TIME")).toMatchObject({
      category: "warning"
    });
  });

  test("builds target rows, preserves order, and filters locally", () => {
    const mixed = normalizeMotionSnapshot(node());
    const plain = normalizeMotionSnapshot(node({ id: "plain", name: "Plain", manualKeyframeTracks: {}, animationStyles: [], animations: {}, timelines: [] }));
    const targets = buildInspectorTargets(
      [
        { id: "plain", name: "Plain", type: "FRAME", depth: 0, visible: true, locked: false },
        { id: "node-1", name: "Mixed Motion", type: "RECTANGLE", depth: 1, visible: false, locked: true },
        { id: "missing", name: "Missing", type: "GROUP", depth: 2, visible: true, locked: false }
      ],
      [mixed, plain],
      [{ nodeId: "missing", message: "Node removed." }]
    );

    expect(targets.map((target) => target.nodeId)).toEqual(["plain", "node-1", "missing"]);
    expect(targets.map((target) => target.sourceKind)).toEqual(["none", "mixed", "none"]);
    expect(collectInspectorProperties(targets)).toEqual(["OPACITY"]);
    expect(
      filterInspectorTargets(targets, {
        ...createDefaultInspectorFilters(),
        sourceKind: "mixed",
        property: "OPACITY"
      }).map((target) => target.nodeId)
    ).toEqual(["node-1"]);
    expect(targets.find((target) => target.nodeId === "node-1")?.limitations.map((item) => item.code)).toContain("UNKNOWN_DERIVED_SHAPE");
    expect(filterInspectorTargets(targets, { ...createDefaultInspectorFilters(), warningsOnly: true }).map((target) => target.nodeId)).toEqual([
      "node-1",
      "missing"
    ]);

    const cleanOpacity = normalizeMotionSnapshot(node({ id: "clean", animations: { OPACITY: { timelineDuration: 2 } }, timelines: [{ id: "long", duration: 2 }] }));
    const [cleanTarget] = buildInspectorTargets(
      [{ id: "clean", name: "Clean opacity", type: "RECTANGLE", depth: 0, visible: true, locked: false }],
      [cleanOpacity],
      []
    );
    expect(cleanTarget.warnings.map((warning) => warning.code)).not.toContain("UNKNOWN_DERIVED_SHAPE");
    expect(cleanTarget.limitations.map((warning) => warning.code)).toContain("UNKNOWN_DERIVED_SHAPE");
    expect(filterInspectorTargets(targets, { ...createDefaultInspectorFilters(), animationState: "animated" }).map((target) => target.nodeId)).toEqual([
      "node-1"
    ]);
  });
});

describe("Inspector plugin reader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reads only requested node IDs and returns partial failures", async () => {
    const getNodeByIdAsync = vi.fn((nodeId: string) => Promise.resolve(nodeId === "node-1" ? node() : null));
    vi.stubGlobal("figma", { getNodeByIdAsync });

    const result = await inspectMotionTargets(["node-1", "missing"], { requestId: "inspect-1" });

    expect(getNodeByIdAsync).toHaveBeenCalledTimes(2);
    expect(getNodeByIdAsync).toHaveBeenNthCalledWith(1, "node-1");
    expect(result?.snapshots.map((snapshot) => snapshot.nodeId)).toEqual(["node-1"]);
    expect(result?.failures).toMatchObject([{ nodeId: "missing", code: "NODE_NOT_FOUND" }]);
  });

  test("stops before posting stale results", async () => {
    vi.stubGlobal("figma", { getNodeByIdAsync: vi.fn(() => Promise.resolve(node())) });

    const result = await inspectMotionTargets(["node-1"], {
      requestId: "inspect-2",
      isStale: () => true
    });

    expect(result).toBeNull();
  });
});
