import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { normalizeMotionSnapshot, type MotionSceneNode } from "../src/plugin/motion";
import { createDefaultStandards, exportStandardsJson, parseStandardsJson, parseStandardsValue } from "../src/domain/standards";
import { matchDurationToken, matchEasingToken } from "../src/domain/standardsMatching";
import { runMotionQa } from "../src/domain/qa";
import type { ScopeScanResult } from "../src/domain/scopeScan";

beforeAll(() => {
  fc.configureGlobal({ seed: 8021, numRuns: 60 });
});

type FakeNode = MotionSceneNode & Record<string, unknown>;

const node = (overrides: Record<string, unknown> = {}): FakeNode => ({
  id: "node-a",
  name: "Layer A",
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: "opacity-track",
      keyframes: [
        { id: "a", time: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
        { id: "b", time: 1.5, value: { type: "FLOAT", value: 2 }, easing: { type: "EASE_OUT" } },
        { id: "c", time: 1.5, value: { type: "FLOAT", value: 2 }, easing: { type: "EASE_OUT" } }
      ]
    }
  },
  animations: { OPACITY: { timelineDuration: 1 } },
  animationStyles: [{ id: "applied", styleId: "available", name: "Opacity Style" }],
  timelines: [{ id: "timeline", duration: 1 }],
  applyManualKeyframeTrack: () => undefined,
  ...overrides
});

const scope: ScopeScanResult = {
  roots: ["node-a"],
  nodes: [{
    id: "node-a",
    parentId: null,
    name: "Layer A",
    type: "RECTANGLE",
    depth: 0,
    childIds: [],
    visible: false,
    locked: true,
    hasChildren: false,
    childrenIncluded: false,
    rootIds: ["node-a"],
    traversalIndex: 0,
    geometry: { x: 0, y: 0, width: 0, height: 40, centerX: 0, centerY: 20 }
  }],
  issues: []
};

describe("Phase 8 standards schema, matching, and QA", () => {
  it("serializes deterministically, validates, migrates v0 imports, and rejects corrupt JSON", () => {
    const standards = createDefaultStandards(10);
    const first = exportStandardsJson(standards);
    const second = exportStandardsJson(standards);
    expect(first).toBe(second);
    const parsed = parseStandardsJson(first);
    expect(parsed.ok).toBe(true);
    expect(parsed.standards).toEqual(standards);
    expect(parseStandardsJson("{nope")).toMatchObject({ ok: false });
    const migrated = parseStandardsValue({ id: "legacy", name: "Legacy", version: "0.1.0", tokens: [], approvedTokenIds: [], disallowedTokenIds: [] });
    expect(migrated.ok).toBe(true);
    expect(migrated.migrated).toBe(true);
  });

  it("keeps exact and nearest token matching distinct", () => {
    const standards = createDefaultStandards();
    expect(matchDurationToken(250 as never, standards)).toMatchObject({ exact: true, compliant: true, tokenId: "duration-250" });
    expect(matchDurationToken(251 as never, standards)).toMatchObject({ exact: false, compliant: false, tokenId: "duration-250" });
    expect(matchEasingToken({ kind: "unknown", raw: "beta" }, standards)).toMatchObject({ compliant: false });
  });

  it("evaluates modular QA rules without mutating inputs and exposes safe fixes only for writable deterministic cases", () => {
    const standards = createDefaultStandards();
    const snapshot = normalizeMotionSnapshot(node());
    const before = structuredClone(snapshot);
    const result = runMotionQa({
      snapshots: [snapshot],
      scope,
      standards,
      exceptions: [],
      ignoredIssueIds: [],
      reviewedIssueIds: []
    });
    expect(snapshot).toEqual(before);
    expect(result.issues.map((issue) => issue.category)).toEqual(expect.arrayContaining(["timing", "easing", "layer-state", "keyframe-track", "property-value", "standards", "capability"]));
    expect(result.issues.some((issue) => issue.safeFix?.operation.kind === "set-duration")).toBe(true);
    expect(result.summary.bySeverity.warning).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("marks no-standard state explicitly and reconciles ignore/review/exception status deterministically", () => {
    const snapshot = normalizeMotionSnapshot(node());
    const first = runMotionQa({ snapshots: [snapshot], scope, standards: null, exceptions: [], ignoredIssueIds: [], reviewedIssueIds: [] });
    expect(first.summary.notEvaluated).toContain("standards-compliance:no-standard");
    const target = first.issues.find((issue) => issue.nodeId === "node-a");
    expect(target).toBeTruthy();
    if (target === undefined) throw new Error("missing issue");
    const next = runMotionQa({
      snapshots: [snapshot],
      scope,
      standards: createDefaultStandards(),
      exceptions: [{ id: "ex", scope: "rule", ruleId: target.ruleId, nodeId: target.nodeId }],
      ignoredIssueIds: [target.id],
      reviewedIssueIds: []
    });
    expect(next.issues.find((issue) => issue.id === target.id)?.status).toBe("ignored-once");
  });

  it("handles large keyframe sets deterministically", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 20, maxLength: 120 }), (times) => {
        const sorted = [...times].sort((a, b) => a - b);
        const snapshot = normalizeMotionSnapshot(node({
          manualKeyframeTracks: {
            OPACITY: { id: "opacity-track", keyframes: sorted.map((time, index) => ({ id: `k${String(index)}`, time: time / 1000, value: { type: "FLOAT", value: index % 2 }, easing: { type: "LINEAR" } })) }
          },
          timelines: [{ id: "timeline", duration: 2 }]
        }));
        const result = runMotionQa({ snapshots: [snapshot], scope, standards: createDefaultStandards(), exceptions: [], ignoredIssueIds: [], reviewedIssueIds: [] });
        expect(result.issues.every((issue) => issue.id.startsWith("qa-"))).toBe(true);
      })
    );
  });
});
