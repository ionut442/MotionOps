import { easingSemanticKey, easingSemanticallyEqual } from "./easing";
import { stableClone } from "./object";
import type { NormalizedEasing, NormalizedKeyframe, NormalizedManualTrack, NormalizedStyleInstance } from "./types";

export const stableJson = (value: unknown): string => JSON.stringify(stableClone(value));

export const valuesSemanticallyEqual = (left: unknown, right: unknown): boolean => stableJson(left) === stableJson(right);

export const easingsSafelyComparable = (left: NormalizedEasing, right: NormalizedEasing): boolean => {
  if (left.kind !== "unknown" || right.kind !== "unknown") {
    return true;
  }
  return stableJson(left.raw) === stableJson(right.raw);
};

export const keyframesSemanticallyEqual = (left: NormalizedKeyframe, right: NormalizedKeyframe): boolean =>
  left.timeMs === right.timeMs &&
  valuesSemanticallyEqual(left.value, right.value) &&
  easingSemanticallyEqual(left.easing, right.easing) &&
  left.valueClassification === right.valueClassification;

export const manualTrackSemanticKey = (track: NormalizedManualTrack): string =>
  [
    track.property,
    track.propertyClassification,
    track.keyframes
      .map((keyframe) =>
        [
          keyframe.timeMs,
          stableJson(keyframe.value),
          easingSemanticKey(keyframe.easing),
          keyframe.valueClassification
        ].join("|")
      )
      .join(";")
  ].join("::");

export const styleApplicationSemanticKey = (
  style: Pick<NormalizedStyleInstance, "availableAnimationStyleId" | "name">
): string => `${style.availableAnimationStyleId ?? ""}::${style.name ?? ""}`;
