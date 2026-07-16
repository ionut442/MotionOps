import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeMotionSnapshot,
  secondsToMilliseconds,
  verifyMotionWrite,
  type MotionSnapshot,
  type MotionWriteExpectation,
  type NormalizedManualTrack
} from "../src/plugin/motion";
import type { MotionSceneNode } from "../src/plugin/motion/types";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const parent = (type: string, next: MotionSceneNode["parent"] = null): MotionSceneNode["parent"] => ({ type, parent: next });

const manualTrack = (property = "OPACITY", keyframes: unknown[] = defaultKeyframes(property)): Record<string, unknown> => ({
  [property]: {
    id: `${property}-track`,
    keyframes
  }
});

const defaultKeyframes = (property = "OPACITY"): unknown[] => [
  { id: `${property}-a`, timelinePosition: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
  { id: `${property}-b`, timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
];

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

const verify = async (expectation: MotionWriteExpectation, actualSnapshot: MotionSnapshot = snapshot()) => {
  const result = await verifyMotionWrite(expectation, { actualSnapshot });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const expectedTrack = (actualSnapshot: MotionSnapshot = snapshot()): NormalizedManualTrack => actualSnapshot.manualTracks[0];

const manualExpectation = (track = expectedTrack(), preserveManualTracks: NormalizedManualTrack[] = []): MotionWriteExpectation => ({
  operation: "manual-track-replacement",
  nodeId: "node-1",
  expectedTrack: track,
  preserveManualTracks
});

const timelineExpectation = (expectedDurationMs: number): MotionWriteExpectation => ({
  operation: "timeline-duration-update",
  nodeId: "node-1",
  timelineId: "timeline-1",
  expectedDurationMs: secondsToMilliseconds(expectedDurationMs / 1000)
});

const styleExpectation = (
  availableAnimationStyleId = "Scale",
  appliedStyleInstanceId = "old-applied"
): Extract<MotionWriteExpectation, { operation: "animation-style-remove-reapply" }> => ({
  operation: "animation-style-remove-reapply",
  nodeId: "node-1",
  expectedStyle: { availableAnimationStyleId, appliedStyleInstanceId, name: "Scale" }
});

const cpExpectation = (expectedValue = true): MotionWriteExpectation => ({
  operation: "component-property-boolean-write",
  nodeId: "node-1",
  propertyKey: "ShowBadge#1:2",
  expectedValue,
  expectedDefinition: { type: "BOOLEAN", stableIdentifier: "1:2", displayName: "ShowBadge" }
});

const cloneTrack = (track: NormalizedManualTrack): NormalizedManualTrack => JSON.parse(JSON.stringify(track)) as NormalizedManualTrack;

describe("Motion write verification", () => {
  it("verifies timeline duration in normalized integer milliseconds", async () => {
    const report = await verify(timelineExpectation(500));
    expect(report.status).toBe("verified");
  });

  it("reports timeline duration mismatch", async () => {
    const report = await verify(timelineExpectation(700));
    expect(report.status).toBe("partial");
    expect(report.differences.map((difference) => difference.code)).toContain("TIMELINE_DURATION_MISMATCH");
  });

  it("verifies a manual track exact semantic match", async () => {
    const report = await verify(manualExpectation());
    expect(report.status).toBe("verified");
  });

  it("matches manual tracks when keyframe IDs changed", async () => {
    const actual = snapshot({
      manualKeyframeTracks: manualTrack("OPACITY", [
        { id: "new-a", timelinePosition: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
        { id: "new-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
      ])
    });
    const report = await verify(manualExpectation(expectedTrack()), actual);
    expect(report.status).toBe("verified-with-warning");
    expect(report.warnings.map((warning) => warning.code)).toContain("KEYFRAME_ID_DRIFT");
  });

  it("detects missing expected manual keyframe", async () => {
    const actual = snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [defaultKeyframes()[0]]) });
    const report = await verify(manualExpectation(), actual);
    expect(report.differences.map((difference) => difference.code)).toContain("MANUAL_KEYFRAME_COUNT_MISMATCH");
  });

  it("detects changed manual keyframe time", async () => {
    const changed = cloneTrack(expectedTrack());
    changed.keyframes[1].timeMs = secondsToMilliseconds(0.6);
    const report = await verify(manualExpectation(changed));
    expect(report.differences.map((difference) => difference.code)).toContain("MANUAL_KEYFRAME_TIME_MISMATCH");
  });

  it("detects changed manual keyframe value", async () => {
    const changed = cloneTrack(expectedTrack());
    changed.keyframes[1].value = { type: "FLOAT", value: 0.75 };
    const report = await verify(manualExpectation(changed));
    expect(report.differences.map((difference) => difference.code)).toContain("MANUAL_KEYFRAME_VALUE_MISMATCH");
  });

  it("detects changed manual keyframe easing", async () => {
    const changed = cloneTrack(expectedTrack());
    changed.keyframes[1].easing = { kind: "preset", name: "EASE_IN" };
    const report = await verify(manualExpectation(changed));
    expect(report.differences.map((difference) => difference.code)).toContain("MANUAL_KEYFRAME_EASING_MISMATCH");
  });

  it("preserves duplicate-time keyframes as distinct ordered entries", async () => {
    const actual = snapshot({
      manualKeyframeTracks: manualTrack("OPACITY", [
        defaultKeyframes()[0],
        { id: "dup-a", timelinePosition: 0.5, value: { type: "FLOAT", value: 0.4 }, easing: { type: "LINEAR" } },
        { id: "dup-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 0.8 }, easing: { type: "LINEAR" } }
      ])
    });
    const report = await verify(manualExpectation(expectedTrack(actual)), actual);
    expect(report.status).toBe("verified");
    expect(report.actualSnapshot.manualTracks[0].keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, 500, 500]);
  });

  it("is independent of raw manual-track collection order", async () => {
    const actual = snapshot({ manualKeyframeTracks: { ...manualTrack("TRANSLATION_X"), ...manualTrack("OPACITY") } });
    const report = await verify(manualExpectation(expectedTrack()), actual);
    expect(report.status).toBe("verified");
  });

  it("confirms unrelated manual track preservation", async () => {
    const actual = snapshot({ manualKeyframeTracks: { ...manualTrack("OPACITY"), ...manualTrack("TRANSLATION_X") } });
    const report = await verify(manualExpectation(expectedTrack(), [actual.manualTracks[1]]), actual);
    expect(report.status).toBe("verified");
  });

  it("detects unexpected loss of unrelated manual track", async () => {
    const before = snapshot({ manualKeyframeTracks: { ...manualTrack("OPACITY"), ...manualTrack("TRANSLATION_X") } });
    const report = await verify(manualExpectation(expectedTrack(), [before.manualTracks[1]]), snapshot());
    expect(report.differences.map((difference) => difference.code)).toContain("MANUAL_TRACK_UNEXPECTED_LOSS");
  });

  it("accepts style reapply with new applied instance ID for same semantic application", async () => {
    const report = await verify(styleExpectation("Scale", "old-applied"));
    expect(report.status).toBe("verified-with-warning");
    expect(report.warnings.map((warning) => warning.code)).toContain("STYLE_INSTANCE_ID_DRIFT");
  });

  it("detects unrelated style instance loss", async () => {
    const report = await verify(
      {
        ...styleExpectation("Scale", "applied-1"),
        preserveStyleInstances: [{ availableAnimationStyleId: "Fade", name: "Fade" }]
      },
      snapshot()
    );
    expect(report.differences.map((difference) => difference.code)).toContain("STYLE_UNRELATED_LOSS");
  });

  it("detects accidental duplicate style instance", async () => {
    const actual = snapshot({ animationStyles: [{ id: "a", styleId: "Scale", name: "Scale" }, { id: "b", styleId: "Scale", name: "Scale" }] });
    const report = await verify(styleExpectation("Scale", "a"), actual);
    expect(report.differences.map((difference) => difference.code)).toContain("STYLE_APPLICATION_DUPLICATE");
  });

  it("detects wrong animation-style application ID", async () => {
    const report = await verify(styleExpectation("Slide", "applied-1"));
    expect(report.differences.map((difference) => difference.code)).toContain("STYLE_APPLICATION_WRONG");
  });

  it("confirms unrelated style instance preservation", async () => {
    const actual = snapshot({ animationStyles: [{ id: "a", styleId: "Scale", name: "Scale" }, { id: "b", styleId: "Fade", name: "Fade" }] });
    const report = await verify({ ...styleExpectation("Scale", "a"), preserveStyleInstances: [{ availableAnimationStyleId: "Fade", name: "Fade" }] }, actual);
    expect(report.status).toBe("verified");
  });

  it("uses cubic Bezier semantic equality", async () => {
    const changed = cloneTrack(expectedTrack());
    changed.keyframes[1].easing = { kind: "cubic-bezier", x1: 0.2, y1: 0, x2: 0.4, y2: 1 };
    const actual = snapshot({
      manualKeyframeTracks: manualTrack("OPACITY", [
        defaultKeyframes()[0],
        { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "CUSTOM", easingFunctionCubicBezier: { x1: 0.2, y1: 0, x2: 0.4, y2: 1 } } }
      ])
    });
    const report = await verify(manualExpectation(changed), actual);
    expect(report.status).toBe("verified");
  });

  it("uses preset easing equality", async () => {
    const report = await verify(manualExpectation(expectedTrack()));
    expect(report.status).toBe("verified");
  });

  it("uses spring equality where exposed", async () => {
    const actual = snapshot({
      manualKeyframeTracks: manualTrack("OPACITY", [
        defaultKeyframes()[0],
        { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "SPRING", stiffness: 10, damping: 2 } }
      ])
    });
    const report = await verify(manualExpectation(expectedTrack(actual)), actual);
    expect(report.status).toBe("verified");
  });

  it("matches unknown easing by equivalent preserved representation", async () => {
    const actual = snapshot({
      manualKeyframeTracks: manualTrack("OPACITY", [
        defaultKeyframes()[0],
        { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { beta: true, z: 1 } }
      ])
    });
    const report = await verify(manualExpectation(expectedTrack(actual)), actual);
    expect(report.status).toBe("verified-with-warning");
    expect(report.warnings.map((warning) => warning.code)).toContain("UNKNOWN_EASING_EQUIVALENT");
  });

  it("marks unknown easing as not safely comparable when preserved shapes differ", async () => {
    const changed = cloneTrack(expectedTrack());
    changed.keyframes[1].easing = { kind: "unknown", raw: { beta: "expected" } };
    const actual = snapshot({
      manualKeyframeTracks: manualTrack("OPACITY", [
        defaultKeyframes()[0],
        { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { beta: "actual" } }
      ])
    });
    const report = await verify(manualExpectation(changed), actual);
    expect(report.differences.map((difference) => difference.code)).toContain("UNCOMPARABLE_EASING");
  });

  it("returns verified-with-warning for CP09 BOOLEAN value write", async () => {
    const report = await verify(cpExpectation(true));
    expect(report.status).toBe("verified-with-warning");
    expect(report.warnings.map((warning) => warning.code)).toContain("COMPONENT_PROPERTY_UNDO_PARTIAL");
  });

  it("detects CP09 requested value mismatch", async () => {
    const report = await verify(cpExpectation(false));
    expect(report.differences.map((difference) => difference.code)).toContain("COMPONENT_PROPERTY_VALUE_MISMATCH");
  });

  it("rejects unsupported component-property Motion-track operation", async () => {
    const report = await verify({ operation: "component-property-motion-track-write", nodeId: "node-1", propertyKey: "ShowBadge#1:2" });
    expect(report.status).toBe("partial");
    expect(report.differences.map((difference) => difference.code)).toContain("UNSUPPORTED_OPERATION");
  });

  it("reports capability becoming read-only or unsupported after write", async () => {
    const actual = snapshot({ setTimelineDuration: undefined });
    const report = await verify(timelineExpectation(500), actual);
    expect(report.differences.map((difference) => difference.code)).toContain("CAPABILITY_UNSUPPORTED_AFTER_WRITE");
  });

  it("converts fresh adapter read failure into typed verification failure", async () => {
    const result = await verifyMotionWrite(timelineExpectation(500), {
      adapter: {
        readMotionSnapshot: () => Promise.resolve({
          ok: false,
          error: { code: "READ_FAILED", message: "read failed", nodeId: "node-1" }
        })
      }
    });
    expect(result).toMatchObject({ ok: false, error: { code: "REREAD_FAILED", causeMessage: "read failed" } });
  });

  it("orders differences deterministically", async () => {
    const report = await verify(manualExpectation(cloneTrack(expectedTrack())), snapshot({ manualKeyframeTracks: {} }));
    expect(report.differences.map((difference) => `${difference.path}:${difference.code}`)).toEqual(
      [...report.differences.map((difference) => `${difference.path}:${difference.code}`)].sort()
    );
  });

  it("serializes verification reports", async () => {
    const report = await verify(cpExpectation(true));
    expect(JSON.parse(JSON.stringify(report))).toMatchObject({ status: "verified-with-warning", operation: "component-property-boolean-write" });
  });

  it("does not include raw Figma object references in reports", async () => {
    const raw = node();
    const report = await verify(timelineExpectation(500), normalizeMotionSnapshot(raw));
    expect(JSON.stringify(report)).not.toContain("applyManualKeyframeTrack");
    expect(JSON.stringify(report)).not.toContain("setTimelineDuration");
  });

  it("keeps verification production code isolated from Phase 0 lab modules, stale data, and UI", async () => {
    const sourceFiles = await filesUnder(join(process.cwd(), "src", "plugin", "motion"));
    const bannedImport = /^import .*["].*(diagnostic|p00\d|fixture|collector|src\/ui|ui\/App|playwright)/im;
    const bannedVerifierText = /stale|fingerprint.*block/i;
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const normalized = relative(process.cwd(), file).split(sep).join("/");
      const text = await readFile(file, "utf8");
      if (normalized.endsWith("fingerprint.ts")) {
        continue;
      }
      const isVerifierFile = /verification|expectations|diff|semantic-equality/.test(normalized);
      if (bannedImport.test(text) || (isVerifierFile && bannedVerifierText.test(text))) {
        offenders.push(normalized);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps operation and difference-code switches exhaustive", async () => {
    const report = await verify(timelineExpectation(500), normalizeMotionSnapshot(node({ type: "RECTANGLE", parent: parent("INSTANCE") })));
    expect(report.operation).toBe("timeline-duration-update");
    expect(report.differences).toEqual([]);
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
