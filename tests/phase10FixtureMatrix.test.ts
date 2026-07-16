import { describe, expect, it } from "vitest";
import {
  normalizeMotionSnapshot,
  planMotionOperation,
  executeChangePlan,
  type MotionSceneNode
} from "../src/plugin/motion";
import { createDefaultStandards } from "../src/domain/standards";
import { runMotionQa } from "../src/domain/qa";
import { buildHandoffReport } from "../src/domain/handoffReport";
import type { ScopeScanNode, ScopeScanResult } from "../src/domain/scopeScan";
import type { TimeMs } from "../src/domain/time";

type FakeNode = MotionSceneNode & Record<string, unknown>;

interface MatrixCase {
  readonly id: string;
  readonly label: string;
  readonly node: FakeNode;
  readonly expectedSource: "none" | "manual" | "style" | "mixed";
  readonly expectedWrite: "write" | "read-only";
}

const kf = (id: string, seconds: number, value: unknown, easing: unknown = { type: "LINEAR" }) => ({
  id,
  time: seconds,
  value,
  easing
});

const node = (id: string, overrides: Record<string, unknown> = {}): FakeNode => ({
  id,
  name: id,
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: `${id}-opacity`,
      keyframes: [
        kf(`${id}-a`, 0, { type: "FLOAT", value: 0 }),
        kf(`${id}-b`, 0.5, { type: "FLOAT", value: 1 })
      ]
    }
  },
  animations: { OPACITY: { timelineDuration: 0.5 } },
  timelines: [{ id: `${id}-timeline`, duration: 0.5 }],
  applyManualKeyframeTrack: () => undefined,
  ...overrides
});

const scopeFor = (ids: readonly string[]): ScopeScanResult => ({
  roots: ids.slice(0, 1),
  nodes: ids.map((id, index): ScopeScanNode => ({
    id,
    parentId: null,
    name: id,
    type: "RECTANGLE",
    depth: 0,
    childIds: [],
    visible: !id.includes("hidden"),
    locked: id.includes("locked"),
    hasChildren: id.includes("parent"),
    childrenIncluded: id.includes("parent"),
    rootIds: ids.slice(0, 1),
    traversalIndex: index,
    geometry: { x: index * 4, y: index * 8, width: 10, height: 10, centerX: index * 4 + 5, centerY: index * 8 + 5 }
  })),
  issues: []
});

const matrixCases: readonly MatrixCase[] = [
  { id: "F01", label: "No Motion", node: node("no-motion", { manualKeyframeTracks: {}, animations: {}, timelines: [] }), expectedSource: "none", expectedWrite: "read-only" },
  { id: "F02", label: "Manual opacity", node: node("manual-opacity"), expectedSource: "manual", expectedWrite: "write" },
  { id: "F03", label: "Translation X/Y", node: node("translation", { manualKeyframeTracks: { TRANSLATION_X: { id: "tx", keyframes: [kf("a", 0, 0), kf("b", 0.5, 20)] }, TRANSLATION_Y: { id: "ty", keyframes: [kf("c", 0, 0), kf("d", 0.5, 30)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F04", label: "Rotation", node: node("rotation", { manualKeyframeTracks: { ROTATION: { id: "rot", keyframes: [kf("a", 0, 0), kf("b", 0.5, 90)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F05", label: "Scale", node: node("scale", { manualKeyframeTracks: { SCALE: { id: "scale-track", keyframes: [kf("a", 0, 1), kf("b", 0.5, 2)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F06", label: "Width/height", node: node("size", { manualKeyframeTracks: { WIDTH: { id: "w", keyframes: [kf("a", 0, 10), kf("b", 0.5, 20)] }, HEIGHT: { id: "h", keyframes: [kf("c", 0, 10), kf("d", 0.5, 20)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F07", label: "Corner radius", node: node("radius", { manualKeyframeTracks: { CORNER_RADIUS: { id: "r", keyframes: [kf("a", 0, 0), kf("b", 0.5, 8)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F08", label: "Stroke weight", node: node("stroke", { manualKeyframeTracks: { STROKE_WEIGHT: { id: "s", keyframes: [kf("a", 0, 1), kf("b", 0.5, 4)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F09", label: "Path trim", node: node("path-trim", { manualKeyframeTracks: { PATH_TRIM: { id: "pt", keyframes: [kf("a", 0, 0), kf("b", 0.5, 1)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F10", label: "Multiple keyframes", node: node("multi-kf", { manualKeyframeTracks: { OPACITY: { id: "opacity", keyframes: [kf("a", 0, 0), kf("b", 0.25, 0.5), kf("c", 0.5, 1)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F11", label: "Different easing", node: node("easing", { manualKeyframeTracks: { OPACITY: { id: "opacity", keyframes: [kf("a", 0, 0, { type: "EASE_IN" }), kf("b", 0.5, 1, { type: "EASE_OUT" })] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F12", label: "Style instance", node: node("style", { manualKeyframeTracks: {}, animationStyles: [{ id: "applied", styleId: "available", name: "Fade" }] }), expectedSource: "style", expectedWrite: "read-only" },
  { id: "F13", label: "Mixed manual/style", node: node("mixed", { animationStyles: [{ id: "applied", styleId: "available", name: "Fade" }] }), expectedSource: "mixed", expectedWrite: "write" },
  { id: "F14", label: "Auto-layout children", node: node("auto-layout-child", { layoutMode: "VERTICAL" }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F15", label: "Parent plus child", node: node("parent-child"), expectedSource: "manual", expectedWrite: "write" },
  { id: "F16", label: "Hidden animated layer", node: node("hidden-layer", { visible: false }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F17", label: "Locked animated layer", node: node("locked-layer", { locked: true }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F18", label: "Duplicate keyframe times", node: node("duplicate-times", { manualKeyframeTracks: { OPACITY: { id: "opacity", keyframes: [kf("a", 0, 0), kf("b", 0.5, 1), kf("c", 0.5, 0.2)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F19", label: "Timeline shorter than final keyframe", node: node("short-timeline", { timelines: [{ id: "timeline", duration: 0.25 }] }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F20", label: "Component", node: node("component", { type: "COMPONENT" }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F21", label: "Component set", node: node("component-set", { type: "COMPONENT_SET" }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F22", label: "Instance", node: node("instance", { type: "INSTANCE" }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F23", label: "Nested instance", node: node("nested-instance", { type: "INSTANCE", parent: { type: "INSTANCE", parent: null } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F24", label: "Paint/effect limitations", node: node("paint-effect", { manualKeyframeTracks: { FILL: { id: "fill", keyframes: [kf("a", 0, { type: "PAINT" }), kf("b", 0.5, { type: "PAINT" })] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F25", label: "Unknown beta property", node: node("unknown-beta", { manualKeyframeTracks: { "BETA#MOTION": { id: "beta", keyframes: [kf("a", 0, { type: "BETA" }, { type: "FUTURE_EASING" }), kf("b", 0.5, { type: "BETA" })] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F26", label: "200 animated nodes representative", node: node("node-200"), expectedSource: "manual", expectedWrite: "write" },
  { id: "F27", label: "2,000 keyframes", node: node("keyframes-2000", { manualKeyframeTracks: { OPACITY: { id: "opacity", keyframes: Array.from({ length: 2_000 }, (_, index) => kf(`k${String(index)}`, index / 1000, index % 2)) } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F28", label: "Fractional source seconds", node: node("fractional", { manualKeyframeTracks: { OPACITY: { id: "opacity", keyframes: [kf("a", 0.125, 0), kf("b", 0.875, 1)] } } }), expectedSource: "manual", expectedWrite: "write" },
  { id: "F29", label: "Multiple selected roots", node: node("multi-root"), expectedSource: "manual", expectedWrite: "write" },
  { id: "F30", label: "Document changed after preview", node: node("changed-after-preview"), expectedSource: "manual", expectedWrite: "write" }
];

describe("Phase 10 automated fixture matrix", () => {
  it.each(matrixCases)("$id $label normalizes, plans, QA-checks, and reports safely", (item) => {
    const snapshot = normalizeMotionSnapshot(item.node);
    expect(snapshot.sources.kind).toBe(item.expectedSource);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);

    const plan = planMotionOperation({
      baseSnapshot: snapshot,
      operation: { kind: "set-duration", durationMs: 800 as TimeMs, anchor: "preserve-start" },
      idGenerator: () => `${item.id}-plan`,
      nowMs: () => 10
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.error.message);
    if (item.expectedWrite === "write" && snapshot.manualTracks.length > 0) {
      expect(plan.value.mutations.length).toBeGreaterThan(0);
    } else {
      expect(plan.value.mutations).toHaveLength(0);
    }

    const currentScope = scopeFor([item.node.id]);
    const qa = runMotionQa({
      snapshots: [snapshot],
      scope: currentScope,
      standards: createDefaultStandards(),
      exceptions: [],
      ignoredIssueIds: [],
      reviewedIssueIds: []
    });
    const handoff = buildHandoffReport({
      pluginVersion: "0.0.0",
      scope: currentScope,
      snapshots: [snapshot],
      standards: createDefaultStandards(),
      qaResult: qa,
      exceptions: [],
      generatedAtMs: 10
    });
    expect(handoff.scope.confirmedOrder).toEqual([item.node.id]);
    expect(handoff.qa.available).toBe(true);
  });

  it("blocks every write when the document changes after preview", async () => {
    const item = matrixCases.find((entry) => entry.id === "F30");
    if (item === undefined) throw new Error("missing F30");
    const base = normalizeMotionSnapshot(item.node);
    const changed = normalizeMotionSnapshot(node("changed-after-preview", {
      manualKeyframeTracks: {
        OPACITY: {
          id: "changed-after-preview-opacity",
          keyframes: [kf("a", 0, 0), kf("b", 1.25, 1)]
        }
      }
    }));
    const plan = planMotionOperation({
      baseSnapshot: base,
      operation: { kind: "set-duration", durationMs: 800 as TimeMs, anchor: "preserve-start" },
      targetIds: ["changed-after-preview-opacity"],
      idGenerator: () => "changed-plan",
      nowMs: () => 10
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.error.message);

    let writes = 0;
    const result = await executeChangePlan(plan.value, {
      requestId: "changed-apply",
      adapter: {
        readMotionSnapshot: () => Promise.resolve({ ok: true, value: changed }),
        replaceManualTrack: () => {
          writes += 1;
          return Promise.resolve({ ok: true, value: changed });
        },
        removeAndReapplyStyle: () => {
          writes += 1;
          return Promise.resolve({ ok: true, value: changed });
        },
        setTimelineDuration: () => {
          writes += 1;
          return Promise.resolve({ ok: true, value: changed });
        }
      }
    });
    expect(result.status).toBe("stale");
    expect(writes).toBe(0);
  });
});
