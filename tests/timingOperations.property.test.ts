import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import {
  transformManualTrack,
  type MotionOperation,
  type NormalizedManualTrack
} from "../src/plugin/motion";

beforeAll(() => {
  fc.configureGlobal({ seed: 404017, numRuns: 80 });
});

const timeArray = fc
  .array(fc.integer({ min: 0, max: 10_000 }), { minLength: 2, maxLength: 8 })
  .map((times) => [...times].sort((a, b) => a - b));

const valueArray = fc.array(fc.integer({ min: -100, max: 100 }), { minLength: 8, maxLength: 8 });

const trackArbitrary = fc.record({ times: timeArray, values: valueArray }).map(({ times, values }) =>
  makeTrack(times, values)
);

const makeTrack = (times: readonly number[], values: readonly number[]): NormalizedManualTrack => ({
  trackId: "track-opacity",
  property: "OPACITY",
  propertyClassification: "opacity",
  write: { status: "supported", reason: "property test writer" },
  warnings: [],
  keyframes: times.map((timeMs, index) => ({
    keyframeId: `kf-${String(index)}`,
    ordinal: index,
    timeMs: timeMs as NormalizedManualTrack["keyframes"][number]["timeMs"],
    value: { n: values[index] ?? index },
    easing: { kind: "linear" },
    valueClassification: "number"
  }))
});

const apply = (track: NormalizedManualTrack, operation: MotionOperation): NormalizedManualTrack => {
  const result = transformManualTrack(track, operation, [
    { timelineId: "timeline", durationMs: 20_000 as never, tracks: ["OPACITY"] }
  ]);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value.track;
};

const times = (track: NormalizedManualTrack) => track.keyframes.map((keyframe) => keyframe.timeMs);
const ids = (track: NormalizedManualTrack) => track.keyframes.map((keyframe) => keyframe.keyframeId);
const values = (track: NormalizedManualTrack) => track.keyframes.map((keyframe) => keyframe.value);
const firstTime = (track: NormalizedManualTrack) => Math.min(...times(track));
const lastTime = (track: NormalizedManualTrack) => Math.max(...times(track));

const expectIdentityMetadata = (before: NormalizedManualTrack, after: NormalizedManualTrack) => {
  expect(ids(after)).toEqual(ids(before));
  expect(values(after)).toEqual(values(before));
  expect(after.property).toBe(before.property);
  expect(after.trackId).toBe(before.trackId);
};

const expectOrderedNonNegative = (track: NormalizedManualTrack) => {
  const outputTimes = times(track);
  expect(outputTimes.every((time) => Number.isInteger(time) && time >= 0)).toBe(true);
  for (let index = 1; index < outputTimes.length; index += 1) {
    expect(outputTimes[index]).toBeGreaterThanOrEqual(outputTimes[index - 1]);
  }
};

describe("property-based timing operation invariants", () => {
  it("preserves IDs, values, ordering, non-negative times, and input immutability for duration changes", () => {
    fc.assert(
      fc.property(trackArbitrary, fc.integer({ min: 0, max: 20_000 }), fc.constantFrom("preserve-start", "preserve-end"), (track, durationMs, anchor) => {
        const before = structuredClone(track);
        const result = transformManualTrack(track, { kind: "set-duration", durationMs: durationMs as never, anchor }, []);
        expect(track).toEqual(before);
        if (!result.ok) {
          expect(result.error.code).toBe("INVALID_TIME");
          return;
        }
        expectIdentityMetadata(track, result.value.track);
        expectOrderedNonNegative(result.value.track);
        if (anchor === "preserve-start") {
          expect(firstTime(result.value.track)).toBe(firstTime(track));
        } else {
          expect(lastTime(result.value.track)).toBe(lastTime(track));
        }
      })
    );
  });

  it("keeps identity duration transforms as identity apart from documented warnings", () => {
    fc.assert(
      fc.property(trackArbitrary, (track) => {
        const duration = lastTime(track) - firstTime(track);
        const output = apply(track, { kind: "set-duration", durationMs: duration as never, anchor: "preserve-start" });
        expect(times(output)).toEqual(times(track));
        expectIdentityMetadata(track, output);
      })
    );
  });

  it("supports delay add, remove, and replace without unexpected negative times", () => {
    fc.assert(
      fc.property(trackArbitrary, fc.integer({ min: 0, max: 5_000 }), (track, delayMs) => {
        const added = apply(track, { kind: "set-delay", mode: "add", delayMs: delayMs as never });
        expect(firstTime(added)).toBe(firstTime(track) + delayMs);
        expectOrderedNonNegative(added);
        expectIdentityMetadata(track, added);

        const removed = apply(added, { kind: "set-delay", mode: "remove" });
        expect(firstTime(removed)).toBe(0);
        expectOrderedNonNegative(removed);

        const replaced = apply(track, { kind: "set-delay", mode: "replace", delayMs: delayMs as never });
        expect(firstTime(replaced)).toBe(delayMs);
        expectOrderedNonNegative(replaced);
      })
    );
  });

  it("scales proportional keyframe timing and restores with bounded integer rounding tolerance", () => {
    fc.assert(
      fc.property(
        trackArbitrary,
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (track, numerator, denominator) => {
          const scaled = apply(track, { kind: "scale-timing", numerator, denominator, origin: "start" });
          const restored = apply(scaled, { kind: "scale-timing", numerator: denominator, denominator: numerator, origin: "start" });
          expectIdentityMetadata(track, scaled);
          expectOrderedNonNegative(scaled);
          times(restored).forEach((time, index) => {
            expect(Math.abs(time - times(track)[index])).toBeLessThanOrEqual(3);
          });
        }
      )
    );
  });

  it("does not accumulate floating-point drift through repeated serialization and transforms", () => {
    fc.assert(
      fc.property(trackArbitrary, (track) => {
        let current = structuredClone(track);
        for (let count = 0; count < 6; count += 1) {
          current = JSON.parse(JSON.stringify(apply(current, { kind: "scale-timing", numerator: 1, denominator: 1, origin: "start" }))) as NormalizedManualTrack;
        }
        expect(times(current)).toEqual(times(track));
        expectIdentityMetadata(track, current);
      })
    );
  });

  it("includes the final output keyframe in timeline-extension warnings and rejects invalid operations before mutations", () => {
    fc.assert(
      fc.property(trackArbitrary, fc.integer({ min: 20_001, max: 40_000 }), (track, durationMs) => {
        const result = transformManualTrack(track, { kind: "set-duration", durationMs: durationMs as never, anchor: "preserve-start" }, [
          { timelineId: "short", durationMs: 1 as never, tracks: ["OPACITY"] }
        ]);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.warnings.some((warning) => warning.code === "TIMELINE_EXTENSION_REQUIRED" && warning.detail?.endsWith(String(lastTime(result.value.track))))).toBe(true);
        }
        const invalid = transformManualTrack(track, { kind: "scale-timing", numerator: 0, denominator: 1, origin: "start" }, []);
        expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_OPERATION" } });
        expect(transformManualTrack(track, { kind: "set-delay", mode: "add", delayMs: -1 as never }, [])).toMatchObject({
          ok: false,
          error: { code: "INVALID_TIME" }
        });
      })
    );
  });
});
