import { describe, expect, it } from "vitest";
import {
  buildPlannedTrack,
  changedPaths,
  cloneManualTrack,
  createIdComparison,
  hasDuplicateTrack,
  stableFingerprint,
  statusFromP007Checks,
  summarizeDiff,
  type P007IsolationComparison,
  type P007ManualTrackJson
} from "../src/shared/p007Evidence";
import { p007CaseDefinitions, p007EvidenceFilename } from "../src/shared/p007Registry";

const baseTrack = (): P007ManualTrackJson => ({
  id: "track-1",
  baseValue: { type: "FLOAT", value: 0 },
  keyframes: [
    { id: "kf-1", timelinePosition: 0, easing: { type: "EASE_IN" }, value: { type: "FLOAT", value: 0 } },
    { id: "kf-2", timelinePosition: 0.2, easing: { type: "EASE_OUT" }, value: { type: "FLOAT", value: 0.5 } },
    { id: "kf-3", timelinePosition: 0.5, easing: { type: "EASE_IN_AND_OUT" }, value: { type: "FLOAT", value: 1 } }
  ]
});

const cleanIsolation = (): P007IsolationComparison => ({
  beforeTrackCount: 1,
  actualTrackCount: 1,
  duplicateDetected: false,
  siblingBeforeFingerprint: null,
  siblingActualFingerprint: null,
  siblingUnchanged: null,
  timelineBeforeFingerprint: "[]",
  timelineActualFingerprint: "[]",
  animationStylesBeforeFingerprint: "[]",
  animationStylesActualFingerprint: "[]",
  unrelatedDataUnchanged: true
});

describe("P0-007 evidence helpers", () => {
  it("clones complete tracks without aliasing and preserves unknown fields", () => {
    const original = { ...baseTrack(), unknownReadableField: "kept" };
    const cloned = cloneManualTrack(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.keyframes).not.toBe(original.keyframes);
    expect(cloned.unknownReadableField).toBe("kept");
  });

  it("builds single-field timing, value, and easing mutations with IDs preserved", () => {
    const timing = buildPlannedTrack({ operation: "TIMING_MODIFICATION" }, baseTrack());
    expect(timing.id).toBe("track-1");
    expect(timing.keyframes.map((keyframe) => keyframe.id)).toEqual(["kf-1", "kf-2", "kf-3"]);
    expect(changedPaths(baseTrack(), timing)).toEqual(["$.keyframes[1].timelinePosition"]);

    const value = buildPlannedTrack({ operation: "VALUE_MODIFICATION" }, baseTrack());
    expect(changedPaths(baseTrack(), value)).toEqual(["$.keyframes[1].value.value"]);

    const easing = buildPlannedTrack({ operation: "EASING_MODIFICATION" }, baseTrack());
    expect(changedPaths(baseTrack(), easing)).toEqual(["$.keyframes[1].easing.type"]);
  });

  it("compares track and ordered keyframe IDs explicitly", () => {
    const before = baseTrack();
    const planned = buildPlannedTrack({ operation: "VALUE_MODIFICATION" }, before);
    const comparison = createIdComparison(before, planned, planned);
    expect(comparison.trackIdPreserved).toBe(true);
    expect(comparison.orderedKeyframeIdsPreserved).toBe(true);
  });

  it("detects duplicate track IDs across sibling properties", () => {
    const track = baseTrack();
    expect(hasDuplicateTrack({ OPACITY: track, TRANSLATION_X: track }, "OPACITY", track)).toBe(true);
  });

  it("summarizes unexpected diffs and pass status", () => {
    const before = baseTrack();
    const planned = buildPlannedTrack({ operation: "VALUE_MODIFICATION" }, before);
    const diff = summarizeDiff(before, planned, "VALUE_MODIFICATION");
    const ids = createIdComparison(before, planned, planned);
    expect(diff.unexpectedChangedPaths).toEqual([]);
    expect(statusFromP007Checks(ids, cleanIsolation(), diff, null, false)).toBe("PASS");
  });

  it("creates deterministic P0-007 filenames and stable fingerprints", () => {
    expect(p007CaseDefinitions.map((definition) => definition.id)).toEqual([
      "W01",
      "W02",
      "W03",
      "W04",
      "W05",
      "W06",
      "W07",
      "W08"
    ]);
    expect(p007EvidenceFilename("p007-test-abcdef", p007CaseDefinitions[0])).toBe(
      "p007-test-abcdef-W01-noop-round-trip.json"
    );
    expect(stableFingerprint({ b: 2, a: 1 })).toBe(stableFingerprint({ a: 1, b: 2 }));
  });
});
