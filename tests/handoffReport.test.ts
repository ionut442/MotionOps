import { describe, expect, it } from "vitest";
import { buildHandoffReport, renderHandoffJson, renderHandoffMarkdown } from "../src/domain/handoffReport";
import { runMotionQa } from "../src/domain/qa";
import type { ScopeScanResult } from "../src/domain/scopeScan";
import { createDefaultStandards } from "../src/domain/standards";
import { normalizeMotionSnapshot, type MotionSceneNode } from "../src/plugin/motion";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const scope: ScopeScanResult = {
  roots: ["node-a", "node-b"],
  nodes: [
    { id: "node-a", parentId: null, name: "Layer | A", type: "RECTANGLE", depth: 0, childIds: [], visible: true, locked: false, hasChildren: false, childrenIncluded: false, rootIds: ["node-a"], traversalIndex: 0 },
    { id: "node-b", parentId: null, name: "Layer B", type: "INSTANCE", depth: 0, childIds: [], visible: false, locked: true, hasChildren: false, childrenIncluded: false, rootIds: ["node-b"], traversalIndex: 1 }
  ],
  issues: []
};

const node = (id: string, overrides: Record<string, unknown> = {}): FakeNode => ({
  id,
  name: id,
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: `${id}-opacity`,
      keyframes: [
        { id: `${id}-a`, time: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
        { id: `${id}-b`, time: 0.25, value: { type: "FLOAT", value: 1 }, easing: { type: "LINEAR" } }
      ]
    }
  },
  animations: { OPACITY: { timelineDuration: 0.25 } },
  animationStyles: [],
  timelines: [{ id: `${id}-timeline`, duration: 0.25 }],
  applyManualKeyframeTrack: () => undefined,
  ...overrides
});

describe("Phase 9 handoff report", () => {
  it("builds deterministic immutable Markdown and JSON from canonical Scope, Motion, standards, and QA", () => {
    const standards = createDefaultStandards(10);
    const snapshots = [normalizeMotionSnapshot(node("node-a")), normalizeMotionSnapshot(node("node-b", { animationStyles: [{ id: "applied", styleId: "available", name: "Native style" }] }))];
    const qaResult = runMotionQa({ snapshots, scope, standards, exceptions: [], ignoredIssueIds: [], reviewedIssueIds: [] });
    const first = buildHandoffReport({ pluginVersion: "9.0.0", scope, snapshots, standards, qaResult, exceptions: [{ id: "ex-a", scope: "rule", ruleId: "timing", reason: "Approved." }] });
    const second = buildHandoffReport({ pluginVersion: "9.0.0", scope, snapshots: [...snapshots].reverse(), standards, qaResult, exceptions: [{ id: "ex-a", scope: "rule", ruleId: "timing", reason: "Approved." }] });

    expect(first.scope.confirmedOrder).toEqual(["node-a", "node-b"]);
    expect(renderHandoffJson(first)).toBe(renderHandoffJson(second));
    expect(renderHandoffMarkdown(first)).toContain("## Tokens And Standards");
    expect(renderHandoffMarkdown(first)).toContain("Layer \\| A");
    expect(renderHandoffJson(first)).not.toMatch(/undefined|Infinity|stack|\\[object Object\\]/);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("keeps no-standard and partial Motion states explicit", () => {
    const snapshot = normalizeMotionSnapshot(node("node-a", { manualKeyframeTracks: { FILL: { id: "fill", keyframes: [{ id: "fill-a", time: 0, value: { paint: "unsupported" }, easing: { type: "UNKNOWN_BETA" } }] } } }));
    const qaResult = runMotionQa({ snapshots: [snapshot], scope, standards: null, exceptions: [], ignoredIssueIds: [], reviewedIssueIds: [] });
    const report = buildHandoffReport({ pluginVersion: "9.0.0", scope, snapshots: [snapshot], standards: null, qaResult, exceptions: [] });

    expect(report.scope.staleState).toBe("partial-motion");
    expect(report.interaction.notEvaluated).toContain("standards-compliance:no-standard");
    expect(report.limitations.some((item) => item.kind === "not-evaluated")).toBe(true);
    expect(renderHandoffMarkdown(report)).toContain("No token evaluation is available.");
  });
});
