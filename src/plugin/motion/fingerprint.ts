import { easingSemanticKey } from "./easing";
import { stableClone } from "./object";
import type { NormalizedManualTrack } from "./types";

export const canonicalMotionJson = (value: unknown): string => JSON.stringify(stableClone(value));

export const motionStateFingerprint = (value: unknown): string => {
  const input = canonicalMotionJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const manualTrackSemanticFingerprint = (track: NormalizedManualTrack): string =>
  canonicalMotionJson({
    property: track.property,
    propertyClassification: track.propertyClassification,
    keyframes: track.keyframes.map((keyframe) => ({
      timeMs: keyframe.timeMs,
      value: stableClone(keyframe.value),
      easing: easingSemanticKey(keyframe.easing),
      valueClassification: keyframe.valueClassification
    }))
  });
