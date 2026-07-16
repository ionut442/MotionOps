import { describe, expect, it } from "vitest";
import {
  classifyP009,
  coerceTimelines,
  compareDurations,
  compareIsolation,
  stableFingerprint,
  statusFromP009Classification,
  type P009TimelineSnapshot
} from "../src/shared/p009Evidence";
import { p009CaseDefinitions, p009EvidenceFilename } from "../src/shared/p009Registry";

const snapshot = (duration = 1.2): P009TimelineSnapshot => ({
  timelines: [{ id: "timeline-1", duration }],
  manualTracks: {
    TRANSLATION_X: {
      tracks: [{ keyframes: [{ id: "kf-1", timelinePosition: 0 }, { id: "kf-2", timelinePosition: 0.75 }] }]
    }
  },
  animationStyles: [],
  derivedAnimations: []
});

describe("P0-009 evidence helpers", () => {
  it("creates deterministic P0-009 matrix and filenames", () => {
    expect(p009CaseDefinitions.map((definition) => definition.id)).toEqual(["T01", "T02", "T03", "T04", "T05", "T06"]);
    expect(p009EvidenceFilename("p009-test-abcdef", p009CaseDefinitions[0])).toBe(
      "p009-test-abcdef-T01-noop-duration-write.json"
    );
  });

  it("coerces timeline readback with seconds duration", () => {
    const timelines = coerceTimelines([{ id: "timeline-1", duration: 1.25, extra: { kept: true } }]);
    expect(timelines[0].id).toBe("timeline-1");
    expect(timelines[0].duration).toBe(1.25);
    expect(timelines[0].extra).toEqual({ kept: true });
  });

  it("detects no-op semantic equality", () => {
    const before = snapshot();
    const actual = snapshot();
    const duration = compareDurations(before, actual, "timeline-1", 1.2);
    const isolation = compareIsolation(before, actual);
    expect(duration.semanticEqualToBefore).toBe(true);
    expect(isolation.unrelatedMotionDataUnchanged).toBe(true);
    expect(classifyP009("NO_OP_DURATION_WRITE", duration, isolation, null, false)).toBe("supported");
  });

  it("summarizes extension and safe shortening as supported when isolated", () => {
    const before = snapshot(1.2);
    for (const planned of [1.45, 0.95]) {
      const actual = { ...snapshot(planned), derivedAnimations: { TRANSLATION_X: { timelineDuration: planned } } };
      const duration = compareDurations(before, actual, "timeline-1", planned);
      const isolation = compareIsolation(before, actual);
      expect(duration.durationMatchesPlan).toBe(true);
      expect(statusFromP009Classification(classifyP009("EXTEND_DURATION", duration, isolation, null, false), false)).toBe("PASS");
    }
  });

  it("detects clamping or normalization", () => {
    const before = snapshot(1.2);
    const actual = snapshot(0.75);
    const duration = compareDurations(before, actual, "timeline-1", 0.5);
    expect(duration.normalizedOrClamped).toBe(true);
    expect(classifyP009("SHORTEN_BELOW_FINAL_KEYFRAME", duration, compareIsolation(before, actual), null, false)).toBe(
      "supported-with-warning"
    );
  });

  it("classifies rejected below-keyframe writes as unsupported terminal evidence", () => {
    const before = snapshot(1.2);
    const actual = snapshot(1.2);
    const duration = compareDurations(before, actual, "timeline-1", 0.4, 1);
    expect(duration.rejected).toBe(true);
    expect(classifyP009("SHORTEN_BELOW_FINAL_KEYFRAME", duration, compareIsolation(before, actual), null, true)).toBe(
      "unsupported"
    );
  });

  it("uses stable fingerprints for manual-track and style isolation", () => {
    expect(stableFingerprint({ b: 2, a: 1 })).toBe(stableFingerprint({ a: 1, b: 2 }));
  });
});
