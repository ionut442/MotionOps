import { describe, expect, it } from "vitest";
import { figmaSecondsToTimeMs, timeMsToFigmaSeconds } from "../src/domain/time";

describe("Figma seconds and internal milliseconds", () => {
  it.each([
    [0, 0],
    [0.1, 100],
    [0.3, 300],
    [1.25, 1250]
  ])("converts %s seconds to %s ms", (seconds, milliseconds) => {
    expect(figmaSecondsToTimeMs(seconds)).toBe(milliseconds);
  });

  it("converts integer milliseconds to Figma seconds", () => {
    expect(timeMsToFigmaSeconds(1250)).toBe(1.25);
  });

  it("does not accumulate drift across repeated conversions", () => {
    let currentMs = figmaSecondsToTimeMs(0.3);

    for (let index = 0; index < 100; index += 1) {
      currentMs = figmaSecondsToTimeMs(timeMsToFigmaSeconds(currentMs));
    }

    expect(currentMs).toBe(300);
  });
});
