import { describe, expect, test } from "vitest";
import {
  normalizeCustomOrder,
  orderScopeNodes,
  orderScopeResult,
  type ScopeOrderDefinition
} from "../src/domain/scopeOrdering";
import type { ScopeScanNode, ScopeScanResult } from "../src/domain/scopeScan";

const node = (
  id: string,
  traversalIndex: number,
  geometry?: { readonly x: number; readonly y: number; readonly width?: number; readonly height?: number }
): ScopeScanNode => ({
  id,
  parentId: null,
  name: id,
  type: "FRAME",
  depth: 0,
  childIds: [],
  visible: true,
  locked: false,
  hasChildren: false,
  childrenIncluded: false,
  rootIds: [id],
  traversalIndex,
  ...(geometry === undefined
    ? {}
    : {
        geometry: {
          x: geometry.x,
          y: geometry.y,
          width: geometry.width ?? 10,
          height: geometry.height ?? 10,
          centerX: geometry.x + (geometry.width ?? 10) / 2,
          centerY: geometry.y + (geometry.height ?? 10) / 2
        }
      })
});

const ids = (nodes: readonly ScopeScanNode[]): readonly string[] => nodes.map((item) => item.id);

describe("Scope target ordering", () => {
  const nodes = [
    node("middle", 0, { x: 50, y: 50 }),
    node("top-left", 1, { x: 0, y: 0 }),
    node("bottom-right", 2, { x: 100, y: 100 }),
    node("missing", 3)
  ];

  test.each<[ScopeOrderDefinition, readonly string[]]>([
    [{ mode: "layer-panel" }, ["middle", "top-left", "bottom-right", "missing"]],
    [{ mode: "reverse-layer-panel" }, ["missing", "bottom-right", "top-left", "middle"]],
    [{ mode: "top-to-bottom" }, ["top-left", "middle", "bottom-right", "missing"]],
    [{ mode: "bottom-to-top" }, ["bottom-right", "middle", "top-left", "missing"]],
    [{ mode: "left-to-right" }, ["top-left", "middle", "bottom-right", "missing"]],
    [{ mode: "right-to-left" }, ["bottom-right", "middle", "top-left", "missing"]],
    [{ mode: "center-outward" }, ["middle", "top-left", "bottom-right", "missing"]],
    [{ mode: "edges-inward" }, ["top-left", "bottom-right", "middle", "missing"]],
    [{ mode: "custom", customNodeIds: ["bottom-right", "middle"] }, ["bottom-right", "middle", "top-left", "missing"]]
  ])("orders %o deterministically", (order, expected) => {
    expect(ids(orderScopeNodes(nodes, order))).toEqual(expected);
  });

  test("uses traversal index as the documented tie-breaker without mutating input", () => {
    const tied = [node("late", 2, { x: 0, y: 0 }), node("early", 1, { x: 0, y: 0 })];
    const original = ids(tied);
    expect(ids(orderScopeNodes(tied, { mode: "top-to-bottom" }))).toEqual(["early", "late"]);
    expect(ids(tied)).toEqual(original);
  });

  test("normalizes custom order by deduping, removing missing nodes, and appending new nodes", () => {
    expect(normalizeCustomOrder(["b", "missing", "a", "b"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  test("orders a scan result without destroying roots or issues", () => {
    const result: ScopeScanResult = {
      roots: ["middle", "top-left"],
      nodes,
      issues: [{ code: "missing_geometry", message: "One node had no geometry.", nodeId: "missing" }]
    };
    const ordered = orderScopeResult(result, { mode: "left-to-right" });
    expect(ids(ordered.nodes)).toEqual(["top-left", "middle", "bottom-right", "missing"]);
    expect(ordered.roots).toEqual(["middle", "top-left"]);
    expect(ordered.issues).toEqual(result.issues);
    expect(ids(result.nodes)).toEqual(["middle", "top-left", "bottom-right", "missing"]);
  });
});
