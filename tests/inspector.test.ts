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
  formatValue,
  groupInspectorTarget
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

  test("formats timing, values, easing, and capability labels without raw seconds", () => {
    expect(formatMilliseconds(250)).toBe("250 ms");
    expect(formatMilliseconds(0)).toBe("0 ms");
    expect(formatValue({ type: "FLOAT", value: 1 })).toBe("{ type: FLOAT, value: 1 }");
    expect(formatEasing({ kind: "cubic-bezier", x1: 0, y1: 0.2, x2: 1, y2: 0.8 })).toBe(
      "Cubic bezier (0, 0.2, 1, 0.8)"
    );
    expect(capabilityLabel("supported-with-warning")).toBe("Supported with warning");
  });

  test("detects duplicate times, short timelines, unknown easing, mixed ownership, and adapter warnings", () => {
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
    expect(filterInspectorTargets(targets, { ...createDefaultInspectorFilters(), warningsOnly: true }).map((target) => target.nodeId)).toEqual([
      "plain",
      "node-1",
      "missing"
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
