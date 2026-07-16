import { afterEach, describe, expect, it } from "vitest";
import {
  resolveDiagnosticTargets,
  revealDiagnosticTargets
} from "../src/plugin/diagnostics/targetResolver.ts";

const createFigmaMock = (nodes, selection = []) => {
  const currentPage = nodes.page;
  if (currentPage === undefined) {
    throw new Error("page missing");
  }
  Object.defineProperty(globalThis, "figma", {
    value: {
      currentPage: {
        id: currentPage.id,
        name: currentPage.name,
        get selection() {
          return selection;
        },
        set selection(value) {
          selection.splice(0, selection.length, ...value);
        }
      },
      getNodeByIdAsync: async (id) => nodes[id] ?? null,
      viewport: { scrollAndZoomIntoView: () => undefined }
    },
    configurable: true
  });
  return { selection };
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "figma");
});

describe("resolveDiagnosticTargets", () => {
  it("preserves requested order and de-duplicates explicit IDs", async () => {
    const page = { id: "page", type: "PAGE", name: "Page", parent: null };
    const one = { id: "1:1", type: "RECTANGLE", name: "One", visible: true, parent: page };
    const two = { id: "1:2", type: "RECTANGLE", name: "Two", visible: true, parent: page };
    createFigmaMock({ page, [one.id]: one, [two.id]: two });

    const resolved = await resolveDiagnosticTargets({
      mode: "EXPLICIT_NODE_IDS",
      nodeIds: [two.id, one.id, two.id]
    });

    expect(resolved.requestedNodeIds).toEqual([two.id, one.id]);
    expect(resolved.resolvedNodeIds).toEqual([two.id, one.id]);
    expect(resolved.failed).toEqual([]);
  });

  it("isolates missing, non-scene, removed, and wrong-page failures", async () => {
    const page = { id: "page", type: "PAGE", name: "Page", parent: null };
    const otherPage = { id: "other", type: "PAGE", name: "Other", parent: null };
    const ok = { id: "ok", type: "RECTANGLE", name: "OK", visible: true, parent: page };
    const removed = { id: "removed", type: "RECTANGLE", name: "Removed", visible: true, removed: true, parent: page };
    const document = { id: "doc", type: "DOCUMENT", name: "Doc", parent: null };
    const wrong = { id: "wrong", type: "RECTANGLE", name: "Wrong", visible: true, parent: otherPage };
    createFigmaMock({ page, other: otherPage, ok, removed, doc: document, wrong });

    const resolved = await resolveDiagnosticTargets({
      mode: "EXPLICIT_NODE_IDS",
      nodeIds: ["missing", "ok", "removed", "doc", "wrong"]
    });

    expect(resolved.resolvedNodeIds).toEqual(["ok"]);
    expect(resolved.failed.map((failure) => failure.reason)).toEqual([
      "NOT_FOUND",
      "REMOVED",
      "NOT_SCENE_NODE",
      "WRONG_PAGE"
    ]);
  });

  it("supports empty and current-selection modes", async () => {
    const page = { id: "page", type: "PAGE", name: "Page", parent: null };
    const selected = { id: "selected", type: "RECTANGLE", name: "Selected", visible: true, parent: page };
    createFigmaMock({ page, selected }, [selected]);

    await expect(resolveDiagnosticTargets({ mode: "EMPTY" })).resolves.toMatchObject({
      requestedNodeIds: [],
      resolvedNodeIds: []
    });
    await expect(resolveDiagnosticTargets({ mode: "CURRENT_SELECTION" })).resolves.toMatchObject({
      requestedNodeIds: ["selected"],
      resolvedNodeIds: ["selected"]
    });
  });
});

describe("revealDiagnosticTargets", () => {
  it("does not force parent and descendant into the same canvas selection", async () => {
    const page = { id: "page", type: "PAGE", name: "Page", parent: null };
    const parent = { id: "parent", type: "FRAME", name: "Parent", visible: true, parent: page };
    const child = { id: "child", type: "RECTANGLE", name: "Child", visible: true, parent };
    const { selection } = createFigmaMock({ page, parent, child });

    const reveal = await revealDiagnosticTargets(["parent", "child"]);

    expect(reveal.selectedNodeIds).toEqual(["parent"]);
    expect(selection.map((node) => node.id)).toEqual(["parent"]);
    expect(reveal.warnings[0]).toContain("Parent/descendant");
  });
});
