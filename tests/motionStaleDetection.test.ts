import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertMotionStateCurrent,
  canonicalMotionJson,
  checkMotionStateGuard,
  createMotionStateGuard,
  motionStateFingerprint,
  normalizeMotionSnapshot,
  type MotionGuardTarget,
  type MotionSnapshot,
  type MotionStateGuard
} from "../src/plugin/motion";
import type { MotionSceneNode } from "../src/plugin/motion/types";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const defaultKeyframes = (property = "OPACITY"): unknown[] => [
  { id: `${property}-a`, timelinePosition: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
  { id: `${property}-b`, timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
];

const manualTrack = (property = "OPACITY", keyframes: unknown[] = defaultKeyframes(property)): Record<string, unknown> => ({
  [property]: { id: `${property}-track`, keyframes }
});

const node = (overrides: Record<string, unknown> = {}): FakeNode => ({
  id: "node-1",
  name: "Motion Node",
  type: "INSTANCE",
  parent: null,
  manualKeyframeTracks: manualTrack(),
  animationStyles: [{ id: "applied-1", styleId: "Scale", name: "Scale" }],
  animations: { OPACITY: { timelineDuration: 0.5 } },
  timelines: [{ id: "timeline-1", duration: 0.5 }],
  componentProperties: { "ShowBadge#1:2": { type: "BOOLEAN", value: true } },
  componentPropertyDefinitions: {
    "ShowBadge#1:2": { type: "BOOLEAN", defaultValue: true, stableIdentifier: "1:2", displayName: "ShowBadge" }
  },
  applyManualKeyframeTrack: () => undefined,
  removeAnimationStyle: () => undefined,
  applyAnimationStyle: () => undefined,
  setTimelineDuration: () => undefined,
  setProperties: () => undefined,
  ...overrides
});

const snapshot = (overrides: Record<string, unknown> = {}): MotionSnapshot => normalizeMotionSnapshot(node(overrides));

const guard = (target: MotionGuardTarget, base = snapshot()): MotionStateGuard => {
  const result = createMotionStateGuard(base, target);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const check = async (stateGuard: MotionStateGuard, current = snapshot()) => {
  const result = await checkMotionStateGuard(stateGuard, {
    adapter: { readMotionSnapshot: () => Promise.resolve({ ok: true, value: current }) }
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const manualGuard = (options: Partial<Extract<MotionGuardTarget, { operation: "manual-track-replacement" }>> = {}, base = snapshot()) =>
  guard({ operation: "manual-track-replacement", property: "OPACITY", ...options }, base);

type StyleGuardOptions = Partial<{
  operation: "animation-style-remove-reapply" | "direct-animation-style-reapply";
  availableAnimationStyleId: string;
  preserveUnrelatedStyleInstances: boolean;
  createdFromSnapshotId: string;
}>;

const styleGuard = (options: StyleGuardOptions = {}, base = snapshot()) =>
  guard({ operation: "animation-style-remove-reapply", availableAnimationStyleId: "Scale", ...options }, base);

const timelineGuard = (base = snapshot()) => guard({ operation: "timeline-duration-update", timelineId: "timeline-1" }, base);

const cpGuard = (base = snapshot()) => guard({ operation: "component-property-boolean-write", propertyKey: "ShowBadge#1:2" }, base);

const statusCodes = (result: Awaited<ReturnType<typeof check>>) =>
  result.status === "current" ? [] : result.differences.map((difference) => difference.code);

describe("Motion stale-data detection", () => {
  it("returns current for the same relevant manual track", async () => {
    expect((await check(manualGuard())).status).toBe("current");
  });

  it("keeps changed keyframe IDs current", async () => {
    const result = await check(
      manualGuard(),
      snapshot({
        manualKeyframeTracks: manualTrack("OPACITY", [
          { id: "new-a", timelinePosition: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
          { id: "new-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
        ])
      })
    );
    expect(result.status).toBe("current");
    expect(result.warnings.map((warning) => warning.code)).toContain("KEYFRAME_ID_DRIFT");
  });

  it("detects changed keyframe time as stale", async () => {
    const result = await check(manualGuard(), snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.6, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
    ]) }));
    expect(result.status).toBe("stale");
    expect(statusCodes(result)).toContain("KEYFRAME_TIME_CHANGED");
  });

  it("detects changed keyframe value as stale", async () => {
    const result = await check(manualGuard(), snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 0.4 }, easing: { type: "EASE_OUT" } }
    ]) }));
    expect(statusCodes(result)).toContain("KEYFRAME_VALUE_CHANGED");
  });

  it("detects changed easing as stale", async () => {
    const result = await check(manualGuard(), snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_IN" } }
    ]) }));
    expect(statusCodes(result)).toContain("EASING_CHANGED");
  });

  it("detects added keyframes as stale", async () => {
    const result = await check(manualGuard(), snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      ...defaultKeyframes(),
      { id: "OPACITY-c", timelinePosition: 0.75, value: { type: "FLOAT", value: 0.7 }, easing: { type: "LINEAR" } }
    ]) }));
    expect(statusCodes(result)).toContain("KEYFRAME_COUNT_CHANGED");
  });

  it("detects removed keyframes as stale", async () => {
    const result = await check(manualGuard(), snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [defaultKeyframes()[0]]) }));
    expect(statusCodes(result)).toContain("KEYFRAME_COUNT_CHANGED");
  });

  it("preserves duplicate-time keyframes in fingerprints", async () => {
    const duplicate = snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "dup-a", timelinePosition: 0.5, value: { type: "FLOAT", value: 0.4 }, easing: { type: "LINEAR" } },
      { id: "dup-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 0.8 }, easing: { type: "LINEAR" } }
    ]) });
    expect((await check(manualGuard({}, duplicate), duplicate)).status).toBe("current");
  });

  it("is current when raw manual-track collections reorder", async () => {
    const base = snapshot({ manualKeyframeTracks: { ...manualTrack("OPACITY"), ...manualTrack("TRANSLATION_X") } });
    const current = snapshot({ manualKeyframeTracks: { ...manualTrack("TRANSLATION_X"), ...manualTrack("OPACITY") } });
    expect((await check(manualGuard({}, base), current)).status).toBe("current");
  });

  it("detects target track removal as stale", async () => {
    const result = await check(manualGuard(), snapshot({ manualKeyframeTracks: {} }));
    expect(result.status).toBe("stale");
    expect(statusCodes(result)).toContain("TRACK_REMOVED");
  });

  it("detects duplicate semantic property tracks as stale", async () => {
    const result = await check(manualGuard(), snapshot({ manualKeyframeTracks: { OPACITY: { tracks: [
      { id: "a", keyframes: defaultKeyframes() },
      { id: "b", keyframes: defaultKeyframes() }
    ] } } }));
    expect(statusCodes(result)).toContain("TRACK_ADDED");
  });

  it("ignores unrelated manual track changes when not preserved", async () => {
    const base = snapshot({ manualKeyframeTracks: { ...manualTrack("OPACITY"), ...manualTrack("TRANSLATION_X") } });
    const current = snapshot({ manualKeyframeTracks: { ...manualTrack("OPACITY"), ...manualTrack("TRANSLATION_X", [
      defaultKeyframes("TRANSLATION_X")[0],
      { id: "TRANSLATION_X-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 99 }, easing: { type: "EASE_OUT" } }
    ]) } });
    expect((await check(manualGuard({}, base), current)).status).toBe("current");
  });

  it("detects unrelated manual track changes when preservation is required", async () => {
    const base = snapshot({ manualKeyframeTracks: { ...manualTrack("OPACITY"), ...manualTrack("TRANSLATION_X") } });
    const current = snapshot({ manualKeyframeTracks: { ...manualTrack("OPACITY"), ...manualTrack("TRANSLATION_X", [
      defaultKeyframes("TRANSLATION_X")[0],
      { id: "TRANSLATION_X-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 99 }, easing: { type: "EASE_OUT" } }
    ]) } });
    expect(statusCodes(await check(manualGuard({ preserveUnrelatedManualTracks: true }, base), current))).toContain("TRACK_REMOVED");
  });

  it("keeps same style application with new applied instance ID current", async () => {
    const result = await check(styleGuard(), snapshot({ animationStyles: [{ id: "applied-2", styleId: "Scale", name: "Scale" }] }));
    expect(result.status).toBe("current");
    expect(result.warnings.map((warning) => warning.code)).toContain("STYLE_INSTANCE_ID_DRIFT");
  });

  it("detects style configuration changes as stale", async () => {
    expect(statusCodes(await check(styleGuard(), snapshot({ animationStyles: [{ id: "applied-1", styleId: "Scale", name: "Scale v2" }] })))).toContain("STYLE_CONFIGURATION_CHANGED");
  });

  it("detects style application removal as stale", async () => {
    expect(statusCodes(await check(styleGuard(), snapshot({ animationStyles: [] })))).toContain("STYLE_APPLICATION_REMOVED");
  });

  it("detects duplicate style applications as stale", async () => {
    expect(statusCodes(await check(styleGuard(), snapshot({ animationStyles: [
      { id: "a", styleId: "Scale", name: "Scale" },
      { id: "b", styleId: "Scale", name: "Scale" }
    ] })))).toContain("STYLE_DUPLICATED");
  });

  it("ignores unrelated style changes when irrelevant", async () => {
    const base = snapshot({ animationStyles: [{ id: "a", styleId: "Scale", name: "Scale" }, { id: "b", styleId: "Fade", name: "Fade" }] });
    const current = snapshot({ animationStyles: [{ id: "a", styleId: "Scale", name: "Scale" }, { id: "b", styleId: "Fade", name: "Fade v2" }] });
    expect((await check(styleGuard({}, base), current)).status).toBe("current");
  });

  it("detects unrelated style changes when preservation is required", async () => {
    const base = snapshot({ animationStyles: [{ id: "a", styleId: "Scale", name: "Scale" }, { id: "b", styleId: "Fade", name: "Fade" }] });
    const current = snapshot({ animationStyles: [{ id: "a", styleId: "Scale", name: "Scale" }, { id: "b", styleId: "Fade", name: "Fade v2" }] });
    expect(statusCodes(await check(styleGuard({ preserveUnrelatedStyleInstances: true }, base), current))).toContain("STYLE_CONFIGURATION_CHANGED");
  });

  it("returns current for unchanged timeline duration", async () => {
    expect((await check(timelineGuard())).status).toBe("current");
  });

  it("detects changed timeline duration as stale", async () => {
    expect(statusCodes(await check(timelineGuard(), snapshot({ timelines: [{ id: "timeline-1", duration: 0.75 }] })))).toContain("TIMELINE_DURATION_CHANGED");
  });

  it("ignores unrelated manual track changes for duration-only guards", async () => {
    const result = await check(timelineGuard(), snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 0.4 }, easing: { type: "EASE_OUT" } }
    ]) }));
    expect(result.status).toBe("current");
  });

  it("returns current for unchanged CP09 BOOLEAN value", async () => {
    expect((await check(cpGuard())).status).toBe("current");
  });

  it("detects changed CP09 BOOLEAN value as stale", async () => {
    expect(statusCodes(await check(cpGuard(), snapshot({ componentProperties: { "ShowBadge#1:2": { type: "BOOLEAN", value: false } } })))).toContain("COMPONENT_PROPERTY_VALUE_CHANGED");
  });

  it("detects CP09 property type changes as stale", async () => {
    expect(statusCodes(await check(cpGuard(), snapshot({ componentProperties: { "ShowBadge#1:2": { type: "TEXT", value: "true" } } })))).toContain("COMPONENT_PROPERTY_TYPE_CHANGED");
  });

  it("rejects component-property Motion-track write guards as unsupported", () => {
    expect(createMotionStateGuard(snapshot(), { operation: "component-property-motion-track-write", propertyKey: "ShowBadge#1:2" })).toMatchObject({
      ok: false,
      error: { code: "WRITE_UNSUPPORTED" }
    });
  });

  it("detects capability downgrade as stale", async () => {
    const result = await check(timelineGuard(), snapshot({ setTimelineDuration: undefined }));
    expect(statusCodes(result)).toContain("CAPABILITY_CHANGED");
  });

  it("keeps a new snapshot ID with identical state current", async () => {
    const result = await check(manualGuard({ createdFromSnapshotId: "snapshot-a" }), snapshot());
    expect(result.status).toBe("current");
    expect(result.warnings.map((warning) => warning.code)).toContain("SNAPSHOT_ID_IGNORED");
  });

  it("does not use matching snapshot ID as sole stale proof", async () => {
    const stateGuard = manualGuard({ createdFromSnapshotId: "same-id" });
    stateGuard.createdFromSnapshotId = "same-id";
    expect(statusCodes(await check(stateGuard, snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.7, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
    ]) })))).toContain("KEYFRAME_TIME_CHANGED");
  });

  it("canonical serialization ignores object key order", () => {
    expect(canonicalMotionJson({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalMotionJson({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("canonical fingerprint handles collection reordering through projections", async () => {
    const base = snapshot({ manualKeyframeTracks: { ...manualTrack("OPACITY"), ...manualTrack("TRANSLATION_X") } });
    const current = snapshot({ manualKeyframeTracks: { ...manualTrack("TRANSLATION_X"), ...manualTrack("OPACITY") } });
    expect((await check(manualGuard({}, base), current)).currentFingerprint).toBe(manualGuard({}, base).fingerprint);
  });

  it("canonicalizes cubic Bezier easing stably", async () => {
    const base = snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "CUSTOM", easingFunctionCubicBezier: { x1: 0.2, y1: 0, x2: 0.4, y2: 1 } } }
    ]) });
    expect((await check(manualGuard({}, base), base)).status).toBe("current");
  });

  it("canonicalizes spring easing where exposed", async () => {
    const base = snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "SPRING", stiffness: 10, damping: 2 } }
    ]) });
    expect((await check(manualGuard({}, base), base)).status).toBe("current");
  });

  it("ignores unknown unrelated beta fields", async () => {
    const result = await check(timelineGuard(), snapshot({ animations: { OPACITY: { timelineDuration: 0.5, beta: { changed: true } } } }));
    expect(result.status).toBe("current");
  });

  it("returns unverifiable when unknown relevant beta easing changes", async () => {
    const base = snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { beta: "expected" } }
    ]) });
    const current = snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      defaultKeyframes()[0],
      { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { beta: "actual" } }
    ]) });
    const result = await check(manualGuard({}, base), current);
    expect(result.status).toBe("unverifiable");
    expect(statusCodes(result)).toContain("OPERATION_TARGET_UNVERIFIABLE");
  });

  it("returns typed errors for fresh adapter read failure", async () => {
    const result = await checkMotionStateGuard(timelineGuard(), {
      adapter: { readMotionSnapshot: () => Promise.resolve({ ok: false, error: { code: "READ_FAILED", message: "read failed" } }) }
    });
    expect(result).toMatchObject({ ok: false, error: { code: "REREAD_FAILED", causeMessage: "read failed" } });
  });

  it("orders differences deterministically", async () => {
    const result = await check(manualGuard(), snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [
      { id: "OPACITY-a", timelinePosition: 0.2, value: { type: "FLOAT", value: 2 }, easing: { type: "EASE_IN" } },
      { id: "OPACITY-b", timelinePosition: 0.7, value: { type: "FLOAT", value: 3 }, easing: { type: "EASE_IN" } }
    ]) }));
    const ordered = result.status === "current" ? [] : result.differences.map((difference) => `${difference.path}:${difference.code}`);
    expect(ordered).toEqual([...ordered].sort());
  });

  it("serializes guards and results", async () => {
    const stateGuard = cpGuard();
    expect(JSON.parse(JSON.stringify(stateGuard))).toMatchObject({ operation: "component-property-boolean-write" });
    expect(JSON.parse(JSON.stringify(await check(stateGuard)))).toMatchObject({ status: "current" });
  });

  it("does not include raw Figma objects in guard or result", async () => {
    const text = JSON.stringify(await check(timelineGuard()));
    expect(text).not.toContain("applyManualKeyframeTrack");
    expect(text).not.toContain("setTimelineDuration");
  });

  it("keeps stale detection isolated from Phase 0 lab imports and UI/write workflows", async () => {
    const text = await readFile(join(process.cwd(), "src", "plugin", "motion", "stale-detection.ts"), "utf8");
    const imports = text.split("\n").filter((line) => line.startsWith("import "));
    expect(imports.join("\n")).not.toMatch(/diagnostic|p00\d|fixture|collector|src\/ui|ui\/App|playwright/i);
    expect(text).not.toMatch(/replaceManualTrack|removeAndReapplyStyle|setTimelineDuration\(/);
  });

  it("keeps exhaustive guard-operation switches callable", async () => {
    await expect(check(styleGuard({ operation: "direct-animation-style-reapply" }))).resolves.toMatchObject({ status: "current" });
  });

  it("generates deterministic fingerprints across repeated runs", () => {
    const projection = manualGuard().projection;
    expect(motionStateFingerprint(projection)).toBe(motionStateFingerprint(JSON.parse(JSON.stringify(projection))));
  });

  it("assertMotionStateCurrent returns the fresh normalized current snapshot", async () => {
    const result = await assertMotionStateCurrent(timelineGuard(), {
      adapter: { readMotionSnapshot: () => Promise.resolve({ ok: true, value: snapshot() }) }
    });
    expect(result).toMatchObject({ ok: true, value: { currentSnapshot: { nodeId: "node-1" } } });
  });

  it("motion production files remain inside the motion domain", async () => {
    const files = await filesUnder(join(process.cwd(), "src", "plugin", "motion"));
    expect(files.map((file) => relative(process.cwd(), file).split(sep).join("/")).some((file) => file.endsWith("stale-detection.ts"))).toBe(true);
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
