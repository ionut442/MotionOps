import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { millisecondsToSeconds, secondsToMilliseconds } from "../src/domain/time";
import {
  createFigmaMotionAdapter,
  easingSemanticallyEqual,
  manualTrackSemanticFingerprint,
  normalizeEasing,
  normalizeMotionSnapshot,
  type MotionSceneNode
} from "../src/plugin/motion";
import { manualOpacityNode, manualReplacementScenario } from "./helpers/figma-runtime/motion-builders";
import { FigmaRuntime, withFigmaRuntime } from "./helpers/figma-runtime/runtime";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const parent = (type: string, next: MotionSceneNode["parent"] = null): MotionSceneNode["parent"] => ({ type, parent: next });

const manualTrack = (property = "OPACITY", overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  [property]: {
    id: `${property}-track`,
    baseValue: { type: "FLOAT", value: 0.2 },
    keyframes: [
      { id: `${property}-b`, timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } },
      {
        id: `${property}-a`,
        timelinePosition: 0,
        value: { type: "FLOAT", value: 0.2 },
        easing: { type: "LINEAR", easingFunctionCubicBezier: { x1: 0, y1: 0, x2: 1, y2: 1 } }
      },
      { id: `${property}-duplicate`, timelinePosition: 0.5, value: { type: "FLOAT", value: 0.8 }, easing: { beta: true } }
    ],
    ...overrides
  }
});

const node = (overrides: Record<string, unknown> = {}): FakeNode => ({
  id: "node-1",
  name: "Motion Node",
  type: "INSTANCE",
  parent: null,
  manualKeyframeTracks: manualTrack(),
  animationStyles: [{ id: "applied-1", styleId: "available-1", name: "Bounce" }],
  animations: { OPACITY: { timelineDuration: 0.5, betaField: { kept: true } } },
  timelines: [{ id: "timeline-1", duration: 0.5 }],
  componentProperties: { "ShowBadge#1:2": { type: "BOOLEAN", value: true } },
  componentPropertyDefinitions: {
    "ShowBadge#1:2": { type: "BOOLEAN", defaultValue: true, stableIdentifier: "1:2", displayName: "ShowBadge" }
  },
  applyManualKeyframeTrack: vi.fn(),
  removeAnimationStyle: vi.fn(),
  applyAnimationStyle: vi.fn(),
  setTimelineDuration: vi.fn(),
  setProperties: vi.fn(),
  ...overrides
});

const adapterWithNodes = (nodes: unknown[]): ReturnType<typeof createFigmaMotionAdapter> => {
  const getNodeByIdAsync = vi.fn(() => Promise.resolve(nodes.shift() ?? null));
  vi.stubGlobal("figma", { getNodeByIdAsync });
  return createFigmaMotionAdapter();
};

describe("normalized Figma Motion adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes a node with no Motion without implying editability", () => {
    const snapshot = normalizeMotionSnapshot(node({ manualKeyframeTracks: {}, animationStyles: [], animations: {}, timelines: [] }));

    expect(snapshot.sources.kind).toBe("none");
    expect(snapshot.manualTracks).toEqual([]);
    expect(snapshot.styleInstances).toEqual([]);
    expect(snapshot.capabilities.directStyleReapply.status).toBe("unsupported");
  });

  it("normalizes one manual track with ordered keyframes and duplicate-time preservation", () => {
    const snapshot = normalizeMotionSnapshot(node({ animationStyles: [] }));

    expect(snapshot.sources.kind).toBe("manual");
    expect(snapshot.manualTracks[0].trackId).toBe("OPACITY-track");
    expect(snapshot.manualTracks[0].propertyClassification).toBe("transform-or-opacity");
    expect(snapshot.manualTracks[0].keyframes.map((keyframe) => [keyframe.keyframeId, keyframe.timeMs])).toEqual([
      ["OPACITY-a", 0],
      ["OPACITY-b", 500],
      ["OPACITY-duplicate", 500]
    ]);
    expect(snapshot.manualTracks[0].warnings.map((warning) => warning.code)).toContain("UNKNOWN_EASING");
  });

  it("normalizes multiple manual tracks and multiple timelines deterministically", () => {
    const snapshot = normalizeMotionSnapshot(
      node({
        manualKeyframeTracks: { ...manualTrack("TRANSLATION_X"), ...manualTrack("OPACITY") },
        timelines: [
          { id: "timeline-b", duration: 1.25 },
          { id: "timeline-a", duration: 0.3334 }
        ]
      })
    );

    expect(snapshot.manualTracks.map((track) => track.property)).toEqual(["OPACITY", "TRANSLATION_X"]);
    expect(snapshot.timelines.map((timeline) => [timeline.timelineId, timeline.durationMs])).toEqual([
      ["timeline-a", 333],
      ["timeline-b", 1250]
    ]);
    expect(snapshot.timelines[0].diagnostics).toEqual({ rawDurationSeconds: 0.3334 });
  });

  it("distinguishes style-only and mixed sources", () => {
    expect(normalizeMotionSnapshot(node({ manualKeyframeTracks: {} })).sources.kind).toBe("style");
    expect(normalizeMotionSnapshot(node()).sources.kind).toBe("mixed");
  });

  it("preserves derived animation unknown beta fields only in diagnostics", () => {
    const snapshot = normalizeMotionSnapshot(node());

    expect(snapshot.derivedAnimations[0]).toMatchObject({
      property: "OPACITY",
      valueClassification: "object",
      timelineDurationMs: 500,
      diagnostics: { rawUnsupported: { timelineDuration: 0.5, betaField: { kept: true } } }
    });
  });

  it("canonicalizes accepted easing shapes and unknown beta fields", () => {
    expect(normalizeEasing({ type: "LINEAR", easingFunctionCubicBezier: { x1: 0, y1: 0, x2: 1, y2: 1 } })).toEqual({
      kind: "linear"
    });
    expect(normalizeEasing({ type: "EASE_IN" })).toEqual({ kind: "preset", name: "EASE_IN" });
    expect(normalizeEasing({ type: "CUSTOM", easingFunctionCubicBezier: { x1: 0.2, y1: 0, x2: 0.4, y2: 1 } })).toEqual({
      kind: "cubic-bezier",
      x1: 0.2,
      y1: 0,
      x2: 0.4,
      y2: 1
    });
    expect(normalizeEasing({ type: "SPRING", stiffness: 10, damping: 2 })).toMatchObject({
      kind: "spring",
      stiffness: 10,
      damping: 2
    });
    expect(normalizeEasing({ betaCurve: true })).toEqual({ kind: "unknown", raw: { betaCurve: true } });
  });

  it("uses numeric semantic easing comparison instead of raw object identity", () => {
    expect(
      easingSemanticallyEqual(
        { kind: "cubic-bezier", x1: 0.2000001, y1: 0, x2: 0.4, y2: 1 },
        { kind: "cubic-bezier", x1: 0.2000002, y1: 0, x2: 0.4, y2: 1 },
        { cubicBezierPrecision: 5 }
      )
    ).toBe(true);
  });

  it("keeps style application ID and applied instance ID separate", () => {
    const snapshot = normalizeMotionSnapshot(node({ animationStyles: [{ id: "AnimationPresetId:applied", styleId: "Scale" }] }));

    expect(snapshot.styleInstances[0]).toEqual({
      appliedStyleInstanceId: "AnimationPresetId:applied",
      availableAnimationStyleId: "Scale",
      name: undefined,
      warnings: []
    });
  });

  it("represents component property definitions, state, exposure, writeability, and CP09 undo warning separately", () => {
    const snapshot = normalizeMotionSnapshot(node());

    expect(snapshot.componentProperties.definitions[0].stableIdentifier).toBe("1:2");
    expect(snapshot.componentProperties.currentState[0]).toMatchObject({ propertyKey: "ShowBadge#1:2", type: "BOOLEAN", value: true });
    expect(snapshot.componentProperties.motionTracks[0]).toMatchObject({
      propertyKey: "ShowBadge#1:2",
      exposedTrackProperties: [],
      write: { status: "read-only" }
    });
    expect(snapshot.componentProperties.writeability.status).toBe("supported-with-warning");
    expect(snapshot.componentProperties.warnings.map((warning) => warning.code)).toEqual([
      "COMPONENT_PROPERTY_MOTION_TRACK_NOT_EXPOSED",
      "COMPONENT_PROPERTY_UNDO_PARTIAL"
    ]);
  });

  it("does not broaden unsupported component-property Motion-track writes", () => {
    const snapshot = normalizeMotionSnapshot(node({ componentProperties: { LabelText: { type: "TEXT", value: "Alpha" } } }));

    expect(snapshot.componentProperties.writeability.status).toBe("read-only");
    expect(snapshot.capabilities.componentPropertyWrites.status).toBe("read-only");
  });

  it.each([
    ["COMPONENT", null, "componentRoots", "read-only"],
    ["RECTANGLE", parent("COMPONENT"), "componentChildren", "read-only"],
    ["COMPONENT_SET", null, "componentSets", "read-only"],
    ["COMPONENT", parent("COMPONENT_SET"), "variantComponents", "read-only"],
    ["INSTANCE", null, "instanceRoots", "read-only"],
    ["RECTANGLE", parent("INSTANCE"), "instanceDescendants", "read-only"],
    ["INSTANCE", parent("INSTANCE"), "nestedInstances", "read-only"],
    ["RECTANGLE", parent("INSTANCE", parent("INSTANCE")), "nestedDescendants", "read-only"]
  ] as const)("classifies %s category capability %s as %s", (type, parentNode, capability, status) => {
    const snapshot = normalizeMotionSnapshot(node({ type, parent: parentNode }));
    expect(snapshot.capabilities[capability].status).toBe(status);
  });

  it("reads a fresh normalized snapshot and converts raw API exceptions", async () => {
    await withFigmaRuntime(new FigmaRuntime([manualOpacityNode()]), async () => {
      const result = await createFigmaMotionAdapter().readMotionSnapshot("node-1");
      expect(result.ok).toBe(true);
    });

    vi.unstubAllGlobals();
    vi.stubGlobal("figma", { getNodeByIdAsync: vi.fn(() => Promise.reject(new Error("Page not loaded under dynamic-page"))) });
    const failed = await createFigmaMotionAdapter().readMotionSnapshot("node-1");
    expect(failed).toMatchObject({ ok: false, error: { code: "PAGE_NOT_LOADED" } });
  });

  it("returns typed errors for missing and unknown-shape nodes", async () => {
    expect(await adapterWithNodes([null]).readMotionSnapshot("missing")).toEqual({
      ok: false,
      error: { code: "NODE_NOT_FOUND", message: "No node found for missing.", nodeId: "missing" }
    });

    vi.unstubAllGlobals();
    expect(await adapterWithNodes([{ type: 123 }]).readMotionSnapshot("odd")).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN_API_SHAPE", nodeId: "odd" }
    });
  });

  it("manual-track semantic equality is independent of keyframe IDs", () => {
    const left = normalizeMotionSnapshot(node()).manualTracks[0];
    const right = normalizeMotionSnapshot(
      node({ manualKeyframeTracks: manualTrack("OPACITY", { keyframes: [{ id: "new-id", timelinePosition: 0, value: { type: "FLOAT", value: 0.2 }, easing: { type: "LINEAR" } }, { id: "other-id", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }, { id: "third-id", timelinePosition: 0.5, value: { type: "FLOAT", value: 0.8 }, easing: { beta: true } }] }) })
    ).manualTracks[0];

    expect(manualTrackSemanticFingerprint(left)).toBe(manualTrackSemanticFingerprint(right));
  });

  it("re-reads after manual track replacement and uses complete Figma field shape", async () => {
    const scenario = manualReplacementScenario();
    const runtime = new FigmaRuntime([scenario.baseline]);

    await withFigmaRuntime(runtime, async () => {
      const result = await createFigmaMotionAdapter().replaceManualTrack("node-1", scenario.replacement);
      expect(result.ok).toBe(true);
    });

    expect(runtime.history().map((call) => call.kind)).toEqual(["get-node", "apply-manual-track", "get-node"]);
    expect(runtime.rawNode("node-1")?.manualKeyframeTracks?.OPACITY).toMatchObject({
      id: "OPACITY-track",
      keyframes: [expect.objectContaining({ id: "OPACITY-a", timelinePosition: 0 }), expect.objectContaining({ id: "OPACITY-b", timelinePosition: 0.5 })]
    });
  });

  it("rejects incomplete manual replacement before mutation and converts write failures", async () => {
    const fakeNode = node({ applyManualKeyframeTrack: vi.fn(() => { throw new Error("track rejected"); }) });
    const adapter = adapterWithNodes([fakeNode]);

    const invalid = await adapter.replaceManualTrack("node-1", { property: "OPACITY", keyframes: [] });
    expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(fakeNode.applyManualKeyframeTrack).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    const failed = await adapterWithNodes([fakeNode]).replaceManualTrack("node-1", {
      property: "OPACITY",
      trackId: "track",
      keyframes: [{ keyframeId: "kf", timeMs: secondsToMilliseconds(0), value: 1 }]
    });
    expect(failed).toMatchObject({ ok: false, error: { code: "TRACK_WRITE_FAILED", causeMessage: "track rejected" } });
  });

  it("style remove/reapply succeeds only with distinct identities and re-reads", async () => {
    const fakeNode = node();
    const adapter = adapterWithNodes([fakeNode, fakeNode]);

    expect(await adapter.removeAndReapplyStyle("node-1", { appliedStyleInstanceId: "same", availableAnimationStyleId: "same" })).toMatchObject({
      ok: false,
      error: { code: "STYLE_EDIT_RESTRICTED" }
    });

    const result = await adapter.removeAndReapplyStyle("node-1", {
      appliedStyleInstanceId: "applied-1",
      availableAnimationStyleId: "available-1"
    });
    expect(result.ok).toBe(true);
    expect(fakeNode.removeAnimationStyle).toHaveBeenCalledWith("applied-1");
    expect(fakeNode.applyAnimationStyle).toHaveBeenCalledWith("available-1");
  });

  it("timeline duration writes seconds at final boundary and reports failures", async () => {
    const fakeNode = node();
    const adapter = adapterWithNodes([fakeNode, fakeNode]);
    expect(await adapter.setTimelineDuration("node-1", "timeline-1", secondsToMilliseconds(1.25))).toMatchObject({ ok: true });
    expect(fakeNode.setTimelineDuration).toHaveBeenCalledWith("timeline-1", 1.25);

    vi.unstubAllGlobals();
    const failingNode = node({ setTimelineDuration: vi.fn(() => { throw new Error("duration rejected"); }) });
    expect(await adapterWithNodes([failingNode]).setTimelineDuration("node-1", "timeline-1", secondsToMilliseconds(1))).toMatchObject({
      ok: false,
      error: { code: "TIMELINE_WRITE_FAILED", path: "timeline-1" }
    });
  });

  it("component-property writes are limited to CP09 BOOLEAN state and re-read", async () => {
    const fakeNode = node();
    const adapter = adapterWithNodes([fakeNode, fakeNode]);
    expect(await adapter.setComponentPropertyValue("node-1", "ShowBadge#1:2", false)).toMatchObject({ ok: true });
    expect(fakeNode.setProperties).toHaveBeenCalledWith({ "ShowBadge#1:2": false });

    vi.unstubAllGlobals();
    const textNode = node({ componentProperties: { Label: { type: "TEXT", value: "Alpha" } } });
    expect(await adapterWithNodes([textNode]).setComponentPropertyValue("node-1", "Label", true)).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_PROPERTY", path: "Label" }
    });
  });

  it("centralizes time conversion policy", () => {
    expect(secondsToMilliseconds(0)).toBe(0);
    expect(secondsToMilliseconds(0.00049)).toBe(0);
    expect(secondsToMilliseconds(0.0005)).toBe(1);
    expect(secondsToMilliseconds(123456.789)).toBe(123456789);
    expect(millisecondsToSeconds(1250)).toBe(1.25);
    expect(() => millisecondsToSeconds(1.5)).toThrow("Time milliseconds must be an integer");
    expect(() => secondsToMilliseconds(Number.NaN)).toThrow("Figma seconds must be finite");

    let current = secondsToMilliseconds(0.3);
    for (let index = 0; index < 100; index += 1) {
      current = secondsToMilliseconds(millisecondsToSeconds(current));
    }
    expect(current).toBe(300);
  });

  it("keeps production Motion adapter isolated from Phase 0 lab modules and raw access outside boundaries", async () => {
    const sourceFiles = await filesUnder(join(process.cwd(), "src"));
    const rawMotionPattern = /\.(?:animations|manualKeyframeTracks|animationStyles|timelines)\b|applyManualKeyframeTrack|removeAnimationStyle|applyAnimationStyle|setTimelineDuration|figma\.motion/;
    const illegalRawAccess: string[] = [];
    const illegalImports: string[] = [];

    for (const file of sourceFiles) {
      const normalized = relative(process.cwd(), file).split(sep).join("/");
      const text = await readFile(file, "utf8");
      const isAllowedRawBoundary =
        normalized.startsWith("src/plugin/motion/") ||
        normalized.startsWith("src/plugin/diagnostics/") ||
        normalized === "src/domain/motion.ts" ||
        normalized === "src/domain/inspector.ts" ||
        normalized === "src/shared/messages.ts" ||
        /^src\/shared\/p\d{3}Evidence\.ts$/.test(normalized) ||
        normalized === "src/shared/diagnostics.ts";

      if (!isAllowedRawBoundary && rawMotionPattern.test(text)) {
        illegalRawAccess.push(normalized);
      }
      if (normalized.startsWith("src/plugin/motion/") && /^import .*["].*(diagnostic|p00\d|fixture|collector|labConfig|ui\/App)/m.test(text)) {
        illegalImports.push(normalized);
      }
    }

    expect(illegalRawAccess).toEqual([]);
    expect(illegalImports).toEqual([]);
  });
});

const filesUnder = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return await filesUnder(fullPath);
      }
      return entry.isFile() && fullPath.endsWith(".ts") ? [fullPath] : [];
    })
  );
  return nested.flat();
};
