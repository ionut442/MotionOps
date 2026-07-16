import { describe, expect, it } from "vitest";
import {
  analyzePasteCompatibility,
  buildPasteChangePlan,
  copyMotionToClipboard,
  normalizeMotionSnapshot,
  serializeMotionClipboard,
  type MotionSceneNode
} from "../src/plugin/motion";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const node = (id: string, overrides: Record<string, unknown> = {}): FakeNode => ({
  id,
  name: id,
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: `${id}-opacity-track`,
      keyframes: [
        { id: `${id}-a`, time: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
        { id: `${id}-b`, time: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
      ]
    }
  },
  animationStyles: [{ id: `${id}-applied`, styleId: `${id}-available`, name: "Opacity Style" }],
  animations: { OPACITY: { timelineDuration: 0.5 } },
  timelines: [{ id: `${id}-timeline`, duration: 0.5 }],
  applyManualKeyframeTrack: () => undefined,
  removeAnimationStyle: () => undefined,
  applyAnimationStyle: () => undefined,
  ...overrides
});

describe("Phase 5 clipboard and paste engine", () => {
  it("creates deterministic session clipboard entries for complete, timing-only, easing-only, and selected tracks", () => {
    const snapshot = normalizeMotionSnapshot(node("source"));
    const complete = copyMotionToClipboard({ snapshots: [snapshot], mode: "complete", nowMs: () => 5 });
    expect(complete.ok).toBe(true);
    if (!complete.ok) throw new Error(complete.message);
    expect(complete.clipboard.sources[0].manualTracks[0].keyframes[0].value).toEqual({ type: "FLOAT", value: 0 });
    expect(serializeMotionClipboard(complete.clipboard)).toBe(serializeMotionClipboard(complete.clipboard));
    expect(JSON.parse(JSON.stringify(complete.clipboard))).toEqual(complete.clipboard);

    const timing = copyMotionToClipboard({ snapshots: [snapshot], mode: "timing-only" });
    expect(timing.ok && timing.clipboard.sources[0].manualTracks[0].keyframes[0].value).toBeUndefined();

    const easing = copyMotionToClipboard({ snapshots: [snapshot], mode: "easing-only" });
    expect(easing.ok && easing.clipboard.sources[0].manualTracks[0].keyframes[0].timeMs).toBeUndefined();
    expect(easing.ok && easing.clipboard.sources[0].manualTracks[0].keyframes[0].easing).toEqual({ kind: "linear" });

    const selected = copyMotionToClipboard({ snapshots: [snapshot], mode: "selected-tracks", selectedTrackIds: ["source-opacity-track"] });
    expect(selected.ok && selected.clipboard.sources[0].manualTracks).toHaveLength(1);
    expect(copyMotionToClipboard({ snapshots: [], mode: "complete" })).toMatchObject({ ok: false, code: "EMPTY_SELECTION" });
  });

  it("returns compatibility categories without mutating input snapshots", () => {
    const source = normalizeMotionSnapshot(node("source"));
    const destination = normalizeMotionSnapshot(node("dest"));
    const before = JSON.stringify(destination);
    const copied = copyMotionToClipboard({ snapshots: [source], mode: "complete" });
    expect(copied.ok).toBe(true);
    if (!copied.ok) throw new Error(copied.message);
    const compatibility = analyzePasteCompatibility(copied.clipboard, [destination]);
    expect(compatibility.summary.supported + compatibility.summary.warnings).toBeGreaterThan(0);
    expect(compatibility.items.map((item) => item.reason)).toContain("STYLE_SOURCE_READ_ONLY");
    expect(JSON.stringify(destination)).toBe(before);
    expect(JSON.parse(JSON.stringify(compatibility))).toEqual(compatibility);
  });

  it("builds replace, timing, easing, one-to-many, and ambiguous-mapping plans through ChangePlan shape", () => {
    const source = normalizeMotionSnapshot(node("source"));
    const destA = normalizeMotionSnapshot(node("dest-a"));
    const destB = normalizeMotionSnapshot(node("dest-b"));
    const copied = copyMotionToClipboard({ snapshots: [source], mode: "complete" });
    expect(copied.ok).toBe(true);
    if (!copied.ok) throw new Error(copied.message);

    const replace = buildPasteChangePlan({
      clipboard: copied.clipboard,
      destinations: [destA, destB],
      pasteMode: "replace",
      mapping: { mode: "one-to-many" },
      timing: { offsetMs: 100, intervalMs: 50 },
      idGenerator: () => "paste-plan",
      nowMs: () => 10
    });
    expect(replace.ok).toBe(true);
    if (!replace.ok) throw new Error(replace.error.message);
    expect(replace.value.operation).toEqual({ kind: "paste-motion", pasteMode: "replace" });
    expect(replace.value.mutations).toHaveLength(2);
    expect(replace.value.expected.beforeAfterExamples[0].after).toContain("100");
    expect(replace.value.skipped.map((skip) => skip.code)).toContain("READ_ONLY_STYLE_FIELD");

    const stagger = buildPasteChangePlan({
      clipboard: copied.clipboard,
      destinations: [destA, destB],
      pasteMode: "replace",
      mapping: { mode: "one-to-many" },
      timing: {
        stagger: {
          kind: "stagger",
          timingMode: "fixed-interval",
          durationPolicy: "preserve",
          anchor: "preserve-first-start",
          intervalMs: 125 as never
        }
      },
      idGenerator: () => "stagger-plan"
    });
    expect(stagger.ok).toBe(true);
    if (!stagger.ok) throw new Error(stagger.error.message);
    expect(stagger.value.mutations.map((mutation) => mutation.source === "manual" ? mutation.after.keyframes[0].timeMs : null).filter((value) => value !== null)).toEqual([0, 125]);

    const timing = buildPasteChangePlan({
      clipboard: copied.clipboard,
      destinations: [destA],
      pasteMode: "preserve-timing",
      mapping: { mode: "one-to-many" },
      idGenerator: () => "timing-plan"
    });
    expect(timing.ok && timing.value.mutations.find((mutation) => mutation.source === "manual")?.after.keyframes[1].value).toEqual(destA.manualTracks[0].keyframes[1].value);

    const easing = buildPasteChangePlan({
      clipboard: copied.clipboard,
      destinations: [destA],
      pasteMode: "preserve-easing",
      mapping: { mode: "one-to-many" },
      idGenerator: () => "easing-plan"
    });
    expect(easing.ok && easing.value.mutations.find((mutation) => mutation.source === "manual")?.after.keyframes[1].timeMs).toBe(destA.manualTracks[0].keyframes[1].timeMs);

    expect(buildPasteChangePlan({
      clipboard: copied.clipboard,
      destinations: [destA, destB],
      pasteMode: "replace",
      mapping: { mode: "scope-order" },
      idGenerator: () => "bad-map"
    })).toMatchObject({ ok: false, error: { code: "AMBIGUOUS_MAPPING" } });
  });
});
