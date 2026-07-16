import { describe, expect, test } from "vitest";
import { isPluginToUiMessage, isUiToPluginMessage } from "../src/shared/messages";
import { isScopeScanResult } from "../src/domain/scopeScan";
import { scanScope, type ScopeScannerFigmaAdapter, type ScopeScannerNode } from "../src/plugin/scopeScanner";

interface MockNode extends ScopeScannerNode {
  readonly children?: readonly MockNode[];
  loadCount: number;
}

const node = (
  id: string,
  name: string,
  type: string,
  options: {
    parent?: MockNode | null;
    visible?: boolean;
    locked?: boolean;
    children?: MockNode[];
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  } = {}
): MockNode => {
  const created: MockNode = {
    id,
    name,
    type,
    parent: options.parent ?? null,
    visible: options.visible,
    locked: options.locked,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    children: options.children ?? [],
    loadCount: 0,
    loadAsync: async () => {
      await Promise.resolve();
      created.loadCount += 1;
    }
  };

  for (const child of created.children ?? []) {
    Object.defineProperty(child, "parent", { value: created, configurable: true });
  }

  Object.defineProperty(created, "manualTracks", {
    get: () => {
      throw new Error("Motion fields must not be read by Scope scanner.");
    }
  });

  return created;
};

const fixture = () => {
  const leafA = node("leaf-a", "Leaf A", "RECTANGLE", { visible: false, x: 10, y: 20, width: 30, height: 40 });
  const leafB = node("leaf-b", "Leaf B", "TEXT", { locked: true, x: 80, y: 20, width: 10, height: 10 });
  const group = node("group", "Group", "GROUP", { children: [leafA, leafB], x: 0, y: 0, width: 100, height: 80 });
  const frame = node("frame", "Frame", "FRAME", { children: [group], x: 0, y: 0, width: 200, height: 120 });
  const sibling = node("sibling", "Sibling", "ELLIPSE", { x: 240, y: 10, width: 20, height: 20 });
  const allNodes = [frame, group, leafA, leafB, sibling];

  return {
    frame,
    group,
    leafA,
    leafB,
    sibling,
    adapter: (selection: readonly MockNode[]): ScopeScannerFigmaAdapter => ({
      currentPage: {
        selection,
        loadAsync: async () => {
          await Promise.resolve();
        }
      },
      getNodeByIdAsync: async (id) => {
        await Promise.resolve();
        return allNodes.find((candidate) => candidate.id === id) ?? null;
      }
    })
  };
};

describe("Scope scanner", () => {
  test("returns an explicit issue for empty non-manual selection", async () => {
    const { adapter } = fixture();
    const result = await scanScope(adapter([]), { mode: "current-selection" });
    expect(result.nodes).toEqual([]);
    expect(result.issues).toMatchObject([{ code: "empty_selection" }]);
  });

  test("scans one selected root for current selection", async () => {
    const { adapter, frame } = fixture();
    const result = await scanScope(adapter([frame]), { mode: "current-selection" });
    expect(result.roots).toEqual(["frame"]);
    expect(result.nodes.map((scanNode) => scanNode.id)).toEqual(["frame"]);
    expect(result.nodes[0]).toMatchObject({
      depth: 0,
      hasChildren: true,
      childrenIncluded: false
    });
  });

  test("scans multiple selected roots deterministically", async () => {
    const { adapter, frame, sibling } = fixture();
    const result = await scanScope(adapter([sibling, frame]), { mode: "current-selection" });
    expect(result.roots).toEqual(["sibling", "frame"]);
    expect(result.nodes.map((scanNode) => scanNode.id)).toEqual(["sibling", "frame"]);
  });

  test("direct children mode returns eligible direct children only", async () => {
    const { adapter, frame } = fixture();
    const result = await scanScope(adapter([frame]), { mode: "direct-children" });
    expect(result.nodes.map((scanNode) => scanNode.id)).toEqual(["group"]);
    expect(result.nodes[0]).toMatchObject({ depth: 1, parentId: "frame" });
  });

  test("all descendants traverses document order and preserves hidden and locked facts", async () => {
    const { adapter, frame } = fixture();
    const result = await scanScope(adapter([frame]), { mode: "all-descendants" });
    expect(result.nodes.map((scanNode) => scanNode.id)).toEqual(["frame", "group", "leaf-a", "leaf-b"]);
    expect(result.nodes.map((scanNode) => scanNode.traversalIndex)).toEqual([0, 1, 2, 3]);
    expect(result.nodes.find((scanNode) => scanNode.id === "leaf-a")?.visible).toBe(false);
    expect(result.nodes.find((scanNode) => scanNode.id === "leaf-b")?.locked).toBe(true);
    expect(result.nodes.find((scanNode) => scanNode.id === "leaf-a")?.geometry).toMatchObject({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      centerX: 25,
      centerY: 40
    });
  });

  test("depth-limited descendants respect maximum depth", async () => {
    const { adapter, frame } = fixture();
    const result = await scanScope(adapter([frame]), { mode: "depth-limited", maxDepth: 1 });
    expect(result.nodes.map((scanNode) => scanNode.id)).toEqual(["frame", "group"]);
    expect(result.nodes[1]).toMatchObject({ hasChildren: true, childrenIncluded: false });
  });

  test("overlapping roots and duplicate descendants are deduplicated deterministically", async () => {
    const { adapter, frame, group } = fixture();
    const result = await scanScope(adapter([frame, group]), { mode: "all-descendants" });
    expect(result.roots).toEqual(["frame", "group"]);
    expect(result.nodes.map((scanNode) => scanNode.id)).toEqual(["frame", "group", "leaf-a", "leaf-b"]);
    expect(result.nodes.find((scanNode) => scanNode.id === "group")?.rootIds).toEqual(["frame", "group"]);
  });

  test("manual mode resolves requested IDs asynchronously and reports missing IDs", async () => {
    const { adapter } = fixture();
    const result = await scanScope(adapter([]), {
      mode: "manual",
      nodeIds: ["leaf-b", "missing", "leaf-b"]
    });
    expect(result.roots).toEqual(["leaf-b"]);
    expect(result.nodes.map((scanNode) => scanNode.id)).toEqual(["leaf-b"]);
    expect(result.issues).toMatchObject([{ code: "missing_node", nodeId: "missing" }]);
  });

  test("uses dynamic-page-safe async loads and emits serializable results", async () => {
    const { adapter, frame } = fixture();
    const result = await scanScope(adapter([frame]), { mode: "all-descendants" });
    expect(frame.loadCount).toBeGreaterThan(0);
    expect(isScopeScanResult(JSON.parse(JSON.stringify(result)))).toBe(true);
  });

  test("message validators accept scope request and matching response", async () => {
    const { adapter, frame } = fixture();
    const result = await scanScope(adapter([frame]), { mode: "current-selection" });

    expect(
      isUiToPluginMessage({
        type: "SCOPE_SCAN_REQUEST",
        requestId: "scope-1",
        scope: { mode: "current-selection" }
      })
    ).toBe(true);
    expect(
      isPluginToUiMessage({
        type: "SCOPE_SCAN_RESULT",
        requestId: "scope-1",
        result
      })
    ).toBe(true);
    expect(
      isPluginToUiMessage({
        type: "SCOPE_SCAN_PROGRESS",
        requestId: "scope-1",
        progress: { requestId: "scope-1", visited: 2, indeterminate: true }
      })
    ).toBe(true);
    expect(isUiToPluginMessage({ type: "SCOPE_SCAN_CANCEL", requestId: "scope-1" })).toBe(true);
    expect(
      isUiToPluginMessage({ type: "SCOPE_REVEAL_NODE_REQUEST", requestId: "scope-2", nodeId: "frame" })
    ).toBe(true);
    expect(
      isPluginToUiMessage({
        type: "SCOPE_SELECTION_CHANGED",
        selectionIds: ["frame", "group"]
      })
    ).toBe(true);
    expect(
      isPluginToUiMessage({
        type: "SCOPE_REVEAL_NODE_RESULT",
        requestId: "scope-2",
        result: {
          ok: true,
          nodeId: "frame",
          status: "selected",
          message: "Scope node selected and revealed."
        }
      })
    ).toBe(true);
  });

  test("emits throttled progress and returns a terminal cancelled result", async () => {
    const { adapter, frame } = fixture();
    const progress: number[] = [];
    let calls = 0;
    const result = await scanScope(adapter([frame]), { mode: "all-descendants" }, {
      requestId: "scope-cancel",
      progressInterval: 1,
      isCancelled: () => {
        calls += 1;
        return calls > 3;
      },
      onProgress: (event) => {
        progress.push(event.visited);
      }
    });

    expect(progress.length).toBeGreaterThan(0);
    expect(result.issues).toMatchObject([{ code: "cancelled" }]);
  });
});
