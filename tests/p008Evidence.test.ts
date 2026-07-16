import { describe, expect, it } from "vitest";
import {
  changedPaths,
  coerceAppliedStyles,
  createIsolationComparison,
  createStyleComparison,
  stableFingerprint,
  statusFromP008Checks,
  summarizeStyleDiff,
  type P008StyleSnapshot
} from "../src/shared/p008Evidence";
import { p008CaseDefinitions, p008EvidenceFilename } from "../src/shared/p008Registry";

const snapshot = (duration = 0.5): P008StyleSnapshot => ({
  styles: [
    {
      id: "instance-1",
      styleId: "style-1",
      name: "Fade",
      duration,
      timelineOffset: 0,
      props: { direction: "in" }
    }
  ],
  manualTracks: {},
  timelines: [{ id: "timeline-1", duration: 1 }],
  animations: []
});

describe("P0-008 evidence helpers", () => {
  it("creates deterministic P0-008 matrix and filenames", () => {
    expect(p008CaseDefinitions.map((definition) => definition.id)).toEqual(["S01", "S02", "S03", "S04", "S05", "S06"]);
    expect(p008EvidenceFilename("p008-test-abcdef", p008CaseDefinitions[0])).toBe(
      "p008-test-abcdef-S01-noop-reapply.json"
    );
  });

  it("coerces applied animation style readback while preserving unknown fields", () => {
    const styles = coerceAppliedStyles([
      { id: "instance-1", styleId: "style-1", name: "Fade", duration: 0.5, extra: { kept: true } }
    ]);
    expect(styles[0].id).toBe("instance-1");
    expect(styles[0].styleId).toBe("style-1");
    expect(styles[0].extra).toEqual({ kept: true });
  });

  it("detects duplicate style applications by styleId and classifies them as conclusive partial behavior", () => {
    const before = snapshot();
    const actual: P008StyleSnapshot = {
      ...snapshot(),
      styles: [
        ...snapshot().styles,
        { id: "instance-2", styleId: "style-1", name: "Fade", duration: 0.5 }
      ]
    };
    const comparison = createStyleComparison(before, actual, "style-1");
    const isolation = createIsolationComparison(before, actual);
    const diff = summarizeStyleDiff(before, actual, []);
    expect(comparison.duplicateDetected).toBe(true);
    expect(statusFromP008Checks(comparison, isolation, diff, "partial", false)).toBe("PARTIAL");
  });

  it("summarizes supported duration mutation without unrelated diffs", () => {
    const before = snapshot();
    const actual = snapshot(0.65);
    expect(changedPaths(before.styles, actual.styles)).toEqual(["$[0].duration"]);
    const diff = summarizeStyleDiff(before, actual, ["$[0].duration"]);
    const comparison = createStyleComparison(before, actual, "style-1");
    const isolation = createIsolationComparison(before, actual);
    expect(diff.unexpectedChangedPaths).toEqual([]);
    expect(isolation.manualTracksUnchanged).toBe(true);
    expect(statusFromP008Checks(comparison, isolation, diff, "supported", false)).toBe("PASS");
  });

  it("classifies read-only and blocked preconditions as terminal non-spinner outcomes", () => {
    const before = snapshot();
    const actual = snapshot();
    const diff = summarizeStyleDiff(before, actual, ["$[0].duration"]);
    const comparison = createStyleComparison(before, actual, "style-1");
    const isolation = createIsolationComparison(before, actual);
    expect(statusFromP008Checks(comparison, isolation, diff, "read-only", false)).toBe("READ_ONLY");
    expect(statusFromP008Checks(comparison, isolation, diff, "blocked", true)).toBe("BLOCKED_PRECONDITION");
  });

  it("uses stable fingerprints for sibling and timeline comparisons", () => {
    expect(stableFingerprint({ b: 2, a: 1 })).toBe(stableFingerprint({ a: 1, b: 2 }));
  });
});
