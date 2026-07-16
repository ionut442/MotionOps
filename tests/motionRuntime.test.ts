import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryMotionLogger,
  checkMotionStateGuard,
  createFigmaMotionAdapter,
  createMotionStateGuard,
  normalizeMotionSnapshot,
  secondsToMilliseconds,
  verifyMotionWrite
} from "../src/plugin/motion";
import {
  animationStyleNode,
  capabilityDowngradeNode,
  clone,
  componentChildNode,
  componentPropertyNode,
  componentRootNode,
  componentSetNode,
  cp09BooleanScenario,
  cubicBezierEasing,
  duplicateKeyframeTimesNode,
  fractionalTimingNode,
  hiddenAnimatedNode,
  instanceDescendantNode,
  instanceRootNode,
  linearEasing,
  lockedAnimatedNode,
  manualOpacityNode,
  manualReplacementScenario,
  malformedRawShapeNode,
  mixedMotionNode,
  multipleManualTracksNode,
  multipleStyleInstancesNode,
  multipleTimelinesNode,
  nestedDescendantNode,
  nestedInstanceNode,
  noMotionNode,
  nodeChangedAfterGuardNode,
  oneTimelineNode,
  parent,
  pathTrimTrackNode,
  presetEasing,
  rawKeyframe,
  rawTimeline,
  regeneratedStyleInstanceNode,
  rotationTrackNode,
  scaleTrackNode,
  sizeTrackNode,
  springEasing,
  staleGuardScenario,
  strokeWeightTrackNode,
  styleRemoveReapplyScenario,
  timelineUpdateScenario,
  translationXTrackNode,
  translationYTrackNode,
  unknownBetaFieldNode,
  unknownEasing,
  unsupportedComponentPropertyMotionTrackNode,
  variantComponentNode
} from "./helpers/figma-runtime/motion-builders";
import { FigmaRuntime, withFigmaRuntime } from "./helpers/figma-runtime/runtime";

describe("Figma Motion test runtime", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "figma");
  });

  it("creates isolated runtime state per test and performs async node lookup", async () => {
    const first = new FigmaRuntime([manualOpacityNode()]);
    const second = new FigmaRuntime([noMotionNode()]);
    const adapter = createFigmaMotionAdapter();

    const firstRead = await withFigmaRuntime(first, () => adapter.readMotionSnapshot("node-1"));
    const secondRead = await withFigmaRuntime(second, () => adapter.readMotionSnapshot("node-1"));

    expect(firstRead).toMatchObject({ ok: true, value: { sources: { kind: "manual" } } });
    expect(secondRead).toMatchObject({ ok: true, value: { sources: { kind: "none" } } });
    expect(first.history()).toMatchObject([{ kind: "get-node", success: true }]);
    expect(second.history()).toMatchObject([{ kind: "get-node", success: true }]);
  });

  it("models node-not-found, page-not-loaded, page-load success, page-load failure, and API unavailable", async () => {
    await withFigmaRuntime(new FigmaRuntime([]), async () => {
      await expect(createFigmaMotionAdapter().readMotionSnapshot("missing")).resolves.toMatchObject({ ok: false, error: { code: "NODE_NOT_FOUND" } });
    });

    await withFigmaRuntime(new FigmaRuntime([manualOpacityNode()], { loaded: false }), async () => {
      await expect(createFigmaMotionAdapter().readMotionSnapshot("node-1")).resolves.toMatchObject({ ok: false, error: { code: "PAGE_NOT_LOADED" } });
    });

    const loadable = new FigmaRuntime([manualOpacityNode()], { loaded: false });
    loadable.install();
    await loadable.createGlobal().loadAllPagesAsync();
    await expect(createFigmaMotionAdapter().readMotionSnapshot("node-1")).resolves.toMatchObject({ ok: true });
    loadable.uninstall();

    const failingLoad = new FigmaRuntime([], { failures: [{ stage: "page-load" }] });
    await withFigmaRuntime(failingLoad, async () => {
      await expect(failingLoad.createGlobal().loadAllPagesAsync()).rejects.toThrow("Page load failed");
    });

    await withFigmaRuntime(new FigmaRuntime([manualOpacityNode()], { failures: [{ stage: "api-unavailable" }] }), async () => {
      await expect(createFigmaMotionAdapter().readMotionSnapshot("node-1")).resolves.toMatchObject({ ok: false, error: { code: "API_UNAVAILABLE" } });
    });
  });

  it("returns fresh wrappers over shared state and invalidates old wrappers after write", async () => {
    const runtime = new FigmaRuntime([manualOpacityNode()]);
    runtime.install();
    const figma = runtime.createGlobal();
    const first = await figma.getNodeByIdAsync("node-1");
    const second = await figma.getNodeByIdAsync("node-1");
    expect(first).not.toBe(second);

    await createFigmaMotionAdapter().setTimelineDuration("node-1", "timeline-1", secondsToMilliseconds(0.75));
    expect(() => {
      (first as { setTimelineDuration(id: string, duration: number): void }).setTimelineDuration("timeline-1", 1);
    }).toThrow("invalidated");
    await expect(createFigmaMotionAdapter().readMotionSnapshot("node-1")).resolves.toMatchObject({
      ok: true,
      value: { timelines: [expect.objectContaining({ durationMs: secondsToMilliseconds(0.75) })] }
    });
  });

  it("records deterministic call history without forbidden raw content", async () => {
    const runtime = new FigmaRuntime([manualOpacityNode()]);
    await withFigmaRuntime(runtime, async () => {
      await createFigmaMotionAdapter().replaceManualTrack("node-1", manualReplacementScenario().replacement);
    });
    expect(runtime.history().map((call) => call.kind)).toEqual(["get-node", "apply-manual-track", "get-node"]);
    const serialized = JSON.stringify(runtime.history());
    expect(serialized).not.toContain("FLOAT");
    expect(serialized).not.toContain("Motion Node");
  });

  it("supports manual-track replacement, ID preservation, regenerated IDs, and failure injection", async () => {
    const scenario = manualReplacementScenario();
    const runtime = new FigmaRuntime([scenario.baseline]);
    await withFigmaRuntime(runtime, async () => {
      const result = await createFigmaMotionAdapter().replaceManualTrack("node-1", scenario.replacement);
      expect(result).toMatchObject({ ok: true });
    });
    expect(runtime.rawNode("node-1")?.manualKeyframeTracks?.OPACITY).toMatchObject({ id: "OPACITY-track" });

    const regenerating = new FigmaRuntime([scenario.baseline], { regenerateManualKeyframeIds: true });
    await withFigmaRuntime(regenerating, async () => {
      await createFigmaMotionAdapter().replaceManualTrack("node-1", scenario.replacement);
    });
    expect(requireRuntimeManualTrack(regenerating, "OPACITY").keyframes?.map((keyframe) => keyframe.id)).toEqual([
      "OPACITY-regen-1",
      "OPACITY-regen-2"
    ]);

    await withFigmaRuntime(new FigmaRuntime([scenario.baseline], { failures: [{ stage: "manual-track-write" }] }), async () => {
      await expect(createFigmaMotionAdapter().replaceManualTrack("node-1", scenario.replacement)).resolves.toMatchObject({
        ok: false,
        error: { code: "TRACK_WRITE_FAILED" }
      });
    });
  });

  it("supports style remove/reapply ordering, ID regeneration, duplication, and failures", async () => {
    const scenario = styleRemoveReapplyScenario();
    const runtime = new FigmaRuntime([scenario.baseline], { regenerateAppliedStyleInstanceId: true });
    await withFigmaRuntime(runtime, async () => {
      await createFigmaMotionAdapter().removeAndReapplyStyle("node-1", scenario);
    });
    expect(runtime.history().map((call) => call.kind)).toEqual(["get-node", "remove-style", "apply-style", "get-node"]);
    expect(runtime.rawNode("node-1")?.animationStyles?.[0]?.id).toContain("available-1-applied");

    const duplicateRuntime = new FigmaRuntime([multipleStyleInstancesNode()], { duplicateStyleApplications: true });
    await withFigmaRuntime(duplicateRuntime, async () => {
      const node = await duplicateRuntime.createGlobal().getNodeByIdAsync("node-1");
      (node as { applyAnimationStyle(styleId: string): void }).applyAnimationStyle("Scale");
    });
    expect(duplicateRuntime.rawNode("node-1")?.animationStyles?.length).toBe(3);

    for (const stage of ["style-removal", "style-reapply"] as const) {
      await withFigmaRuntime(new FigmaRuntime([scenario.baseline], { failures: [{ stage }] }), async () => {
        await expect(createFigmaMotionAdapter().removeAndReapplyStyle("node-1", scenario)).resolves.toMatchObject({ ok: false, error: { code: "WRITE_FAILED" } });
      });
    }
  });

  it("supports timeline duration raw seconds and failure injection", async () => {
    const scenario = timelineUpdateScenario(secondsToMilliseconds(0.75));
    const runtime = new FigmaRuntime([scenario.baseline]);
    await withFigmaRuntime(runtime, async () => {
      await createFigmaMotionAdapter().setTimelineDuration("node-1", scenario.timelineId, scenario.durationMs);
    });
    expect(runtime.rawNode("node-1")?.timelines?.[0]).toMatchObject({ duration: scenario.expectedRawSeconds });

    await withFigmaRuntime(new FigmaRuntime([scenario.baseline], { failures: [{ stage: "timeline-write" }] }), async () => {
      await expect(createFigmaMotionAdapter().setTimelineDuration("node-1", scenario.timelineId, scenario.durationMs)).resolves.toMatchObject({
        ok: false,
        error: { code: "TIMELINE_WRITE_FAILED" }
      });
    });
  });

  it("supports CP09 BOOLEAN writes, failure injection, and rejects component-property Motion-track writes", async () => {
    const scenario = cp09BooleanScenario();
    const runtime = new FigmaRuntime([scenario.baseline]);
    await withFigmaRuntime(runtime, async () => {
      await createFigmaMotionAdapter().setComponentPropertyValue("node-1", scenario.propertyKey, scenario.requestedValue);
    });
    expect(runtime.rawNode("node-1")?.componentProperties?.[scenario.propertyKey]?.value).toBe(false);
    expect(runtime.history().map((call) => call.kind)).toContain("set-properties");

    await withFigmaRuntime(new FigmaRuntime([scenario.baseline], { failures: [{ stage: "component-property-write" }] }), async () => {
      await expect(createFigmaMotionAdapter().setComponentPropertyValue("node-1", scenario.propertyKey, false)).resolves.toMatchObject({
        ok: false,
        error: { code: "WRITE_FAILED" }
      });
    });

    await withFigmaRuntime(new FigmaRuntime([unsupportedComponentPropertyMotionTrackNode()]), async () => {
      await expect(createFigmaMotionAdapter().setComponentPropertyValue("node-1", "Label", true)).resolves.toMatchObject({
        ok: false,
        error: { code: "UNSUPPORTED_PROPERTY" }
      });
    });
  });

  it("supports node disappearance, post-write read failure, capability downgrade, verification, stale guards, and logging", async () => {
    const disappearing = new FigmaRuntime([oneTimelineNode()], { failures: [{ stage: "post-write-read" }] });
    await withFigmaRuntime(disappearing, async () => {
      await expect(createFigmaMotionAdapter().setTimelineDuration("node-1", "timeline-1", secondsToMilliseconds(0.7))).resolves.toMatchObject({
        ok: false,
        error: { code: "REREAD_FAILED" }
      });
    });

    const baseline = normalizeMotionSnapshot(oneTimelineNode());
    const downgraded = normalizeMotionSnapshot(capabilityDowngradeNode());
    const verification = await verifyMotionWrite(
      { operation: "timeline-duration-update", nodeId: "node-1", timelineId: "timeline-1", expectedDurationMs: secondsToMilliseconds(0.5) },
      { actualSnapshot: downgraded }
    );
    expect(verification).toMatchObject({ ok: true, value: { status: "partial" } });

    const guardResult = createMotionStateGuard(baseline, { operation: "timeline-duration-update", timelineId: "timeline-1" });
    expect(guardResult.ok).toBe(true);
    if (guardResult.ok) {
      const stale = await checkMotionStateGuard(guardResult.value, { adapter: { readMotionSnapshot: () => Promise.resolve({ ok: true, value: normalizeMotionSnapshot(nodeChangedAfterGuardNode()) }) } });
      expect(stale).toMatchObject({ ok: true, value: { status: "stale" } });
    }

    const logger = new InMemoryMotionLogger();
    await withFigmaRuntime(new FigmaRuntime([oneTimelineNode()]), async () => {
      await createFigmaMotionAdapter({ logger, operationId: "runtime-log" }).readMotionSnapshot("node-1");
    });
    expect(logger.events.map((event) => event.name)).toEqual(["motion.read.started", "motion.read.completed"]);
  });

  it("provides compact fixture builders for accepted Motion shapes and categories", () => {
    const fixtures = [
      noMotionNode(),
      manualOpacityNode(),
      translationXTrackNode(),
      translationYTrackNode(),
      rotationTrackNode(),
      scaleTrackNode(),
      sizeTrackNode(),
      strokeWeightTrackNode(),
      pathTrimTrackNode(),
      multipleManualTracksNode(),
      duplicateKeyframeTimesNode(),
      animationStyleNode(),
      regeneratedStyleInstanceNode(),
      mixedMotionNode(),
      multipleTimelinesNode(),
      fractionalTimingNode(),
      hiddenAnimatedNode(),
      lockedAnimatedNode(),
      componentRootNode(),
      componentChildNode(),
      componentSetNode(),
      variantComponentNode(),
      instanceRootNode(),
      instanceDescendantNode(),
      nestedInstanceNode(),
      nestedDescendantNode(),
      componentPropertyNode(),
      unknownBetaFieldNode(),
      malformedRawShapeNode()
    ];
    expect(fixtures.map((fixture) => fixture.id).every((id) => id === "node-1")).toBe(true);
    expect(normalizeMotionSnapshot(duplicateKeyframeTimesNode()).manualTracks[0].keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, 500, 500]);
    expect(normalizeMotionSnapshot(multipleTimelinesNode()).timelines.map((timeline) => timeline.timelineId)).toEqual(["timeline-a", "timeline-b"]);
    expect(parent("INSTANCE")).toEqual({ type: "INSTANCE", parent: null });
  });

  it("keeps fixture inputs isolated, deterministic, and raw seconds separate from normalized milliseconds", () => {
    const first = manualOpacityNode();
    const second = manualOpacityNode();
    requireKeyframes(requireRawManualTrack(first, "OPACITY"))[0].id = "mutated";
    expect(requireKeyframes(requireRawManualTrack(second, "OPACITY"))[0].id).toBe("OPACITY-a");
    expect(clone(second.manualKeyframeTracks)).toEqual(second.manualKeyframeTracks);
    expect(rawKeyframe({ easing: linearEasing() }).easing).toEqual(linearEasing());
    expect([presetEasing("EASE_IN"), cubicBezierEasing(), springEasing(), unknownEasing()]).toHaveLength(4);
    expect(rawTimeline("timeline-1", 0.3334).duration).toBe(0.3334);
    expect(normalizeMotionSnapshot(fractionalTimingNode()).timelines[0].durationMs).toBe(secondsToMilliseconds(0.3334));
  });

  it("supports higher-level stale-guard scenarios", async () => {
    const scenario = staleGuardScenario();
    const guardResult = createMotionStateGuard(normalizeMotionSnapshot(scenario.baseline), { operation: "timeline-duration-update", timelineId: "timeline-1" });
    expect(guardResult.ok).toBe(true);
    if (!guardResult.ok) {
      throw new Error(guardResult.error.message);
    }
    const unchanged = await checkMotionStateGuard(guardResult.value, { adapter: { readMotionSnapshot: () => Promise.resolve({ ok: true, value: normalizeMotionSnapshot(scenario.unchanged) }) } });
    const changed = await checkMotionStateGuard(guardResult.value, { adapter: { readMotionSnapshot: () => Promise.resolve({ ok: true, value: normalizeMotionSnapshot(scenario.changedRelevant) }) } });
    const downgraded = await checkMotionStateGuard(guardResult.value, { adapter: { readMotionSnapshot: () => Promise.resolve({ ok: true, value: normalizeMotionSnapshot(scenario.capabilityDowngrade) }) } });
    expect(unchanged).toMatchObject({ ok: true, value: { status: "current" } });
    expect(changed).toMatchObject({ ok: true, value: { status: "stale" } });
    expect(downgraded).toMatchObject({ ok: true, value: { status: "stale" } });
  });

  it("keeps runtime helpers out of production, Phase 0 evidence, UI, network, and Playwright boundaries", async () => {
    const productionFiles = await filesUnder(join(process.cwd(), "src"));
    const productionOffenders: string[] = [];
    for (const file of productionFiles) {
      const normalized = relative(process.cwd(), file).split(sep).join("/");
      const text = await readFile(file, "utf8");
      if (/tests\/helpers|figma-runtime|motion-builders/.test(text)) {
        productionOffenders.push(normalized);
      }
    }
    expect(productionOffenders).toEqual([]);

    const helperFiles = await filesUnder(join(process.cwd(), "tests", "helpers", "figma-runtime"));
    const helperOffenders: string[] = [];
    for (const file of helperFiles) {
      const normalized = relative(process.cwd(), file).split(sep).join("/");
      const text = await readFile(file, "utf8");
      if (/p00\d|Evidence|collector|src\/ui|ui\/App|playwright|fetch\(|XMLHttpRequest|navigator\.sendBeacon|\bany\b/.test(text)) {
        helperOffenders.push(normalized);
      }
    }
    expect(helperOffenders).toEqual([]);
  }, 15000);
});

const filesUnder = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return await filesUnder(fullPath);
      }
      return entry.isFile() && (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) ? [fullPath] : [];
    })
  );
  return nested.flat();
};

const requireRuntimeManualTrack = (runtime: FigmaRuntime, property: string) => {
  const node = runtime.rawNode("node-1");
  if (node === null) {
    throw new Error("Expected node-1 to exist.");
  }
  return requireRawManualTrack(node, property);
};

const requireRawManualTrack = (node: ReturnType<typeof manualOpacityNode>, property: string) => {
  const track = node.manualKeyframeTracks?.[property];
  if (track === undefined || "tracks" in track) {
    throw new Error(`Expected one manual track for ${property}.`);
  }
  return track;
};

const requireKeyframes = (track: ReturnType<typeof requireRawManualTrack>) => {
  if (track.keyframes === undefined) {
    throw new Error("Expected manual track keyframes.");
  }
  return track.keyframes;
};
