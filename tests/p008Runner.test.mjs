import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOrRefreshP008Fixtures,
  createP008RunManifest,
  runAllP008Cases,
  runP008Case
} from "../src/plugin/diagnostics/p008Fixtures";

const registry = {
  rootId: "root",
  nodeIds: ["root", "S01", "S02", "S03", "S04", "S05", "S06"],
  applicationStyleId: "StyleId:valid-1",
  appliedStyleReferenceId: "CodeComponentId:6373:83",
  appliedInstanceId: "S01-instance",
  styleName: "Fade",
  createdAt: "2026-07-13T00:00:00.000Z",
  readiness: {
    preflightStatus: "VALID_STYLE_SELECTED",
    availableCandidateCount: 1,
    applicableCandidateCount: 1,
    selectedStyleIdStatus: "present",
    selectedStyleIdPrefix: "StyleId",
    fixtureStyleCount: 6,
    appliedFixtureInstanceCount: 6,
    appliedInstanceIdStatus: "present",
    duplicateCount: 0,
    ready: true,
    rejectionCategories: [],
    candidates: []
  }
};

const makeNode = (id, caseId, parent, styles) => {
  const data = new Map([
    ["motionops.apiLab.owner", "P0-008"],
    ["motionops.apiLab.testCase", caseId],
    ["motionops.apiLab.role", "style-target"]
  ]);
  return {
    id,
    type: "RECTANGLE",
    visible: true,
    removed: false,
    parent,
    animationStyles: styles,
    manualKeyframeTracks: {},
    timelines: [],
    animations: [],
    getPluginData: (key) => data.get(key) ?? "",
    getSharedPluginData: (_namespace, key) => (key === "owner" ? "P0-008" : ""),
    applyAnimationStyle: vi.fn((styleId) => {
      if (styleId.startsWith("CodeComponentId:")) {
        throw new Error(`CodeComponentId leaked into applyAnimationStyle: ${styleId}`);
      }
      styles.splice(0, styles.length, { id: `${id}-new`, styleId: "CodeComponentId:6373:83", duration: 0.5 });
      return `${id}-new`;
    }),
    removeAnimationStyle: vi.fn((instanceId) => {
      const index = styles.findIndex((style) => style.id === instanceId);
      if (index !== -1) {
        styles.splice(index, 1);
      }
    })
  };
};

const installFigmaMock = (options = {}) => {
  const page = {
    id: "page",
    type: "PAGE",
    visible: true,
    removed: false,
    parent: null,
    animationStyles: [],
    manualKeyframeTracks: {},
    timelines: [],
    animations: [],
    getPluginData: () => "",
    getSharedPluginData: () => ""
  };
  const root = {
    id: "root",
    type: "FRAME",
    visible: true,
    removed: false,
    parent: page,
    animationStyles: [],
    manualKeyframeTracks: {},
    timelines: [],
    animations: [],
    getPluginData: (key) => (key === "motionops.apiLab.owner" ? "P0-008" : ""),
    getSharedPluginData: (_namespace, key) => (key === "owner" ? "P0-008" : ""),
    findAll: (predicate = () => true) => nodes.filter(predicate)
  };
  const nodes = ["S01", "S02", "S03", "S04", "S05", "S06"].map((id) =>
    makeNode(
      id,
      id,
      root,
      options.zeroStyles ? [] : [{ id: `${id}-instance`, styleId: "CodeComponentId:6373:83", duration: 0.5, timelineOffset: 0 }]
    )
  );
  const byId = new Map([["page", page], ["root", root], ...nodes.map((node) => [node.id, node])]);
  if (options.throwCase !== undefined) {
    byId.get(options.throwCase).applyAnimationStyle = vi.fn(() => {
      throw new Error("synthetic apply failure");
    });
  }
  globalThis.figma = {
    editorType: "figma",
    mode: "default",
    currentPage: { id: "page", name: "Page", selection: [] },
    viewport: { scrollAndZoomIntoView: vi.fn() },
    clientStorage: { getAsync: vi.fn(async () => options.registry ?? registry) },
    motion: {
      figmaAnimationStyles: vi.fn(() => (options.zeroStyles ? [] : [{ styleId: "StyleId:valid-1", name: "Fade" }]))
    },
    getNodeByIdAsync: vi.fn(async (id) => byId.get(id) ?? null)
  };
  return { nodes, root };
};

const makeCreateNode = (type, id) => {
  const data = new Map();
  return {
    id,
    type,
    name: "",
    removed: false,
    visible: true,
    parent: null,
    children: [],
    animationStyles: [],
    manualKeyframeTracks: {},
    timelines: [],
    animations: [],
    x: 0,
    y: 0,
    fills: [],
    layoutMode: "NONE",
    itemSpacing: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    resize: vi.fn(function resize(width, height) {
      this.width = width;
      this.height = height;
    }),
    appendChild: vi.fn(function appendChild(child) {
      child.parent = this;
      this.children.push(child);
    }),
    findAll: vi.fn(function findAll(predicate = () => true) {
      const descendants = [];
      const visit = (node) => {
        for (const child of node.children ?? []) {
          if (predicate(child)) {
            descendants.push(child);
          }
          visit(child);
        }
      };
      visit(this);
      return descendants;
    }),
    remove: vi.fn(function remove() {
      this.removed = true;
    }),
    setPluginData: vi.fn((key, value) => data.set(key, value)),
    getPluginData: vi.fn((key) => data.get(key) ?? ""),
    setSharedPluginData: vi.fn((_namespace, key, value) => data.set(`shared:${key}`, value)),
    getSharedPluginData: vi.fn((_namespace, key) => data.get(`shared:${key}`) ?? ""),
    applyAnimationStyle: vi.fn(function applyAnimationStyle(styleId) {
      if (styleId.startsWith("CodeComponentId:")) {
        throw new Error(`CodeComponentId leaked into fixture apply: ${styleId}`);
      }
      const instanceId = `AnimationPresetId:${id}`;
      this.animationStyles = [{ id: instanceId, styleId: "CodeComponentId:6373:83", duration: 0.5, timelineOffset: 0 }];
      return instanceId;
    }),
    removeAnimationStyle: vi.fn(),
    applyManualKeyframeTrack: vi.fn()
  };
};

const installFixtureCreationMock = (styles) => {
  let nextId = 1;
  const page = makeCreateNode("PAGE", "page");
  globalThis.figma = {
    editorType: "figma",
    mode: "default",
    currentPage: { id: "page", name: "Page", selection: [], appendChild: page.appendChild.bind(page) },
    viewport: { scrollAndZoomIntoView: vi.fn() },
    clientStorage: {
      getAsync: vi.fn(async () => null),
      setAsync: vi.fn(async () => undefined),
      deleteAsync: vi.fn(async () => undefined)
    },
    motion: { figmaAnimationStyles: vi.fn(() => styles) },
    createFrame: vi.fn(() => makeCreateNode("FRAME", `frame-${nextId++}`)),
    createRectangle: vi.fn(() => makeCreateNode("RECTANGLE", `rect-${nextId++}`)),
    createText: vi.fn(() => makeCreateNode("TEXT", `text-${nextId++}`)),
    loadFontAsync: vi.fn(async () => undefined),
    getNodeByIdAsync: vi.fn(async () => null)
  };
};

describe("P0-008 live runner termination", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("converts an S01 exception into terminal ERROR evidence", async () => {
    installFigmaMock({ throwCase: "S01" });
    const result = await runP008Case("S01", "p008-test-abcdef");
    expect(result.status).toBe("ERROR");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].result.status).toBe("ERROR");
    expect(result.evidence[0].errors[0].message).toContain("synthetic apply failure");
  });

  it("returns BLOCKED_PRECONDITION evidence when no native animation style exists", async () => {
    installFigmaMock({
      zeroStyles: true,
      registry: { ...registry, readiness: { ...registry.readiness, ready: false, fixtureStyleCount: 0 } }
    });
    const result = await runP008Case("S01", "p008-test-abcdef");
    expect(result.status).toBe("BLOCKED_PRECONDITION");
    expect(result.evidence[0].result.status).toBe("BLOCKED_PRECONDITION");
    expect(result.evidence[0].diagnostic.styleDiscovery.availableStyleCount).toBe(0);
    expect(result.evidence[0].diagnostic.styleDiscovery.manualActionRequired).toContain("Create or apply");
  });

  it("continues Run All after one failed case and finalizes a manifest", async () => {
    installFigmaMock({ throwCase: "S01" });
    const result = await runAllP008Cases("p008-test-abcdef");
    const manifest = createP008RunManifest(result);
    expect(result.evidence.map((record) => record.caseId)).toEqual(["S01", "S02", "S03", "S04", "S05", "S06"]);
    expect(result.evidence[0].result.status).toBe("ERROR");
    expect(result.evidence.slice(1).every((record) => record.result.status !== "ERROR")).toBe(true);
    expect(manifest.evidenceFiles).toHaveLength(6);
  });

  it("keeps available application id separate from applied readback CodeComponentId", async () => {
    const { nodes } = installFigmaMock();
    const result = await runP008Case("S01", "p008-test-abcdef");
    const manifest = createP008RunManifest(result);
    expect(result.status).toBe("PARTIAL");
    expect(manifest.accepted).toBe(true);
    expect(manifest.classification).toBe("supported-with-warning");
    expect(nodes[0].applyAnimationStyle).toHaveBeenCalledWith(
      "StyleId:valid-1",
      expect.objectContaining({ duration: 0.5 })
    );
    expect(result.evidence[0].fixture.applicationStyleId).toBe("StyleId:valid-1");
    expect(result.evidence[0].fixture.styleId).toBe("CodeComponentId:6373:83");
  });

  it("S06 removes the applied instance id before reapplying the application style id", async () => {
    const { nodes } = installFigmaMock();
    await runP008Case("S06", "p008-test-abcdef");
    expect(nodes[5].removeAnimationStyle).toHaveBeenCalledWith("S06-instance");
    expect(nodes[5].removeAnimationStyle).not.toHaveBeenCalledWith("CodeComponentId:6373:83");
    expect(nodes[5].applyAnimationStyle).toHaveBeenCalledWith(
      "StyleId:valid-1",
      expect.objectContaining({ duration: 0.5 })
    );
  });

  it("Run All cannot start S01-S06 from an invalid fixture", async () => {
    installFigmaMock({ registry: { ...registry, readiness: { ...registry.readiness, ready: false } } });
    const result = await runAllP008Cases("p008-test-abcdef");
    expect(result.status).toBe("BLOCKED_PRECONDITION");
    expect(result.evidence).toHaveLength(6);
    expect(result.evidence.every((record) => record.result.status === "BLOCKED_PRECONDITION")).toBe(true);
  });

  it("rejects CodeComponentId candidates before fixture apply", async () => {
    installFixtureCreationMock([{ styleId: "CodeComponentId:6373:83", name: "motion.preset_name.scale" }]);
    const result = await createOrRefreshP008Fixtures();
    expect(result.rootId).toBeNull();
    expect(result.p008Readiness.preflightStatus).toBe("NO_APPLICABLE_STYLE");
    expect(result.p008Readiness.applicableCandidateCount).toBe(0);
    expect(globalThis.figma.createFrame).not.toHaveBeenCalled();
  });

  it("creates a readable style-driven fixture from one valid candidate", async () => {
    installFixtureCreationMock([{ styleId: "StyleId:valid-1", name: "Fade", props: { direction: "right" } }]);
    const result = await createOrRefreshP008Fixtures();
    expect(result.rootId).toBe("frame-1");
    expect(result.p008Readiness.ready).toBe(true);
    expect(result.p008Readiness.fixtureStyleCount).toBe(6);
    expect(result.p008Readiness.appliedFixtureInstanceCount).toBe(6);
    expect(result.p008Readiness.selectedStyleIdPrefix).toBe("StyleId");
    expect(globalThis.figma.clientStorage.setAsync).toHaveBeenCalledWith(
      "motionops.apiLab.p008Registry",
      expect.objectContaining({
        applicationStyleId: "StyleId:valid-1",
        appliedStyleReferenceId: "CodeComponentId:6373:83",
        readiness: expect.objectContaining({ ready: true })
      })
    );
  });
});
