import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createP009RunManifest,
  runAllP009Cases,
  runP009Case
} from "../src/plugin/diagnostics/p009Fixtures";

const registry = {
  rootId: "root",
  nodeIds: ["root", "T01", "T02", "T03", "T04", "T05", "T06"],
  createdAt: "2026-07-13T00:00:00.000Z"
};

const makeNode = (id, caseId, parent, options = {}) => {
  const data = new Map([
    ["motionops.apiLab.owner", "P0-009"],
    ["motionops.apiLab.testCase", caseId],
    ["motionops.apiLab.role", "timeline-target"]
  ]);
  const node = {
    id,
    type: "RECTANGLE",
    visible: true,
    removed: false,
    parent,
    timelines: [{ id: `${id}-timeline`, duration: 1.2 }],
    manualKeyframeTracks: {
      TRANSLATION_X: {
        tracks: [{ keyframes: [{ id: "kf-1", timelinePosition: 0 }, { id: "kf-2", timelinePosition: 0.75 }] }]
      }
    },
    animationStyles: [],
    animations: [],
    getPluginData: (key) => data.get(key) ?? "",
    getSharedPluginData: (_namespace, key) => (key === "owner" ? "P0-009" : ""),
    setTimelineDuration: vi.fn((timelineId, duration) => {
      if (options.throwWrite) {
        throw new Error("synthetic duration failure");
      }
      const timeline = node.timelines.find((entry) => entry.id === timelineId);
      if (timeline !== undefined) {
        timeline.duration = options.clampBelow && duration < 0.75 ? 0.75 : duration;
      }
    })
  };
  return node;
};

const installFigmaMock = (options = {}) => {
  const page = {
    id: "page",
    type: "PAGE",
    visible: true,
    removed: false,
    parent: null,
    getPluginData: () => "",
    getSharedPluginData: () => ""
  };
  const root = {
    id: "root",
    type: "FRAME",
    visible: true,
    removed: false,
    parent: page,
    getPluginData: (key) => (key === "motionops.apiLab.owner" ? "P0-009" : ""),
    getSharedPluginData: (_namespace, key) => (key === "owner" ? "P0-009" : ""),
    findAll: (predicate = () => true) => nodes.filter(predicate)
  };
  const nodes = ["T01", "T02", "T03", "T04", "T05", "T06"].map((id) =>
    makeNode(id, id, root, { throwWrite: options.throwCase === id, clampBelow: options.clampBelow })
  );
  const byId = new Map([["page", page], ["root", root], ...nodes.map((node) => [node.id, node])]);
  globalThis.figma = {
    editorType: "figma",
    mode: "default",
    currentPage: { id: "page", name: "Page", selection: [] },
    viewport: { scrollAndZoomIntoView: vi.fn() },
    clientStorage: { getAsync: vi.fn(async () => (Object.hasOwn(options, "registry") ? options.registry : registry)) },
    getNodeByIdAsync: vi.fn(async (id) => byId.get(id) ?? null)
  };
  return { nodes };
};

describe("P0-009 live runner termination", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs T02 extension with explicit target provenance", async () => {
    const { nodes } = installFigmaMock();
    const result = await runP009Case("T02", "p009-test-abcdef");
    expect(result.status).toBe("PASS");
    expect(nodes[1].setTimelineDuration).toHaveBeenCalledWith("T02-timeline", 1.45);
    expect(result.evidence[0].targetProvenance.requestedNodeIds).toEqual(["T02"]);
    expect(result.evidence[0].durationComparison.durationMatchesPlan).toBe(true);
  });

  it("records clamping or normalization for below-keyframe duration", async () => {
    installFigmaMock({ clampBelow: true });
    const result = await runP009Case("T04", "p009-test-abcdef");
    expect(result.status).toBe("PARTIAL");
    expect(result.evidence[0].normalizationOrClamping.detected).toBe(true);
    expect(result.evidence[0].terminalClassification).toBe("supported-with-warning");
  });

  it("converts duration write exceptions into terminal unsupported evidence", async () => {
    installFigmaMock({ throwCase: "T04" });
    const result = await runP009Case("T04", "p009-test-abcdef");
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.evidence[0].result.status).toBe("UNSUPPORTED");
    expect(result.evidence[0].errors[0].message).toContain("synthetic duration failure");
  });

  it("continues Run All after one failed case and finalizes a mixed manifest", async () => {
    installFigmaMock({ throwCase: "T04" });
    const result = await runAllP009Cases("p009-test-abcdef");
    const manifest = createP009RunManifest(result);
    expect(result.evidence.map((record) => record.caseId)).toEqual(["T01", "T02", "T03", "T04", "T05", "T06"]);
    expect(manifest.evidenceFiles).toHaveLength(6);
    expect(manifest.classification).toBe("mixed");
  });

  it("returns terminal ERROR when fixtures are missing", async () => {
    installFigmaMock({ registry: null });
    const result = await runP009Case("T01", "p009-test-abcdef");
    expect(result.status).toBe("ERROR");
    expect(result.evidence[0].result.status).toBe("ERROR");
  });
});
