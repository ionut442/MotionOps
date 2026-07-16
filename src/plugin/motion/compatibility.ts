import { propertyCapabilityFor } from "./propertyRegistry";
import type { MotionClipboard, MotionClipboardManualTrack, MotionClipboardSource } from "./clipboard";
import type { MotionSnapshot, NormalizedManualTrack } from "./types";

export type PasteCompatibilityStatus = "supported" | "supported-with-warning" | "read-only" | "unsupported" | "partial";

export type PasteCompatibilityReason =
  | "SUPPORTED"
  | "SUPPORTED_WITH_WARNING"
  | "UNSUPPORTED_PROPERTY"
  | "DESTINATION_NODE_TYPE_UNSUPPORTED"
  | "MISSING_DESTINATION_TRACK"
  | "EXISTING_CONFLICT"
  | "STYLE_SOURCE_READ_ONLY"
  | "MANUAL_STYLE_CONFLICT"
  | "COMPONENT_RESTRICTION"
  | "TIMELINE_TOO_SHORT"
  | "MISSING_SOURCE_DATA"
  | "UNKNOWN_CAPABILITY"
  | "PARTIAL_COMPATIBILITY";

export interface PasteCompatibilityItem {
  sourceNodeId: string;
  destinationNodeId: string;
  property: string;
  trackId?: string;
  status: PasteCompatibilityStatus;
  reason: PasteCompatibilityReason;
  explanation: string;
  strategy?: "replace" | "merge" | "add-missing" | "timing-only" | "easing-only" | "skip";
}

export interface PasteCompatibilityResult {
  version: 1;
  items: PasteCompatibilityItem[];
  summary: {
    supported: number;
    warnings: number;
    readOnly: number;
    unsupported: number;
    partial: number;
  };
}

export const analyzePasteCompatibility = (
  clipboard: MotionClipboard,
  destinations: readonly MotionSnapshot[]
): PasteCompatibilityResult => {
  const items = destinations.flatMap((destination) =>
    clipboard.sources.flatMap((source) => analyzeSourceDestination(source, destination))
  );
  return {
    version: 1,
    items,
    summary: {
      supported: items.filter((item) => item.status === "supported").length,
      warnings: items.filter((item) => item.status === "supported-with-warning").length,
      readOnly: items.filter((item) => item.status === "read-only").length,
      unsupported: items.filter((item) => item.status === "unsupported").length,
      partial: items.filter((item) => item.status === "partial").length
    }
  };
};

const analyzeSourceDestination = (
  source: MotionClipboardSource,
  destination: MotionSnapshot
): PasteCompatibilityItem[] => {
  const manual = source.manualTracks.length === 0 && source.styleInstances.length === 0
    ? [missingSourceItem(source, destination)]
    : source.manualTracks.map((track) => analyzeTrack(source, track, destination));
  const style = source.styleInstances.map((entry) => ({
    sourceNodeId: source.sourceNodeId,
    destinationNodeId: destination.nodeId,
    property: entry.name ?? entry.availableAnimationStyleId ?? "style",
    status: "read-only" as const,
    reason: "STYLE_SOURCE_READ_ONLY" as const,
    explanation: "Style data is copied for visibility but skipped because no verified direct style writer exists.",
    strategy: "skip" as const
  }));
  return [...manual, ...style];
};

const analyzeTrack = (
  source: MotionClipboardSource,
  track: MotionClipboardManualTrack,
  destination: MotionSnapshot
): PasteCompatibilityItem => {
  const capability = propertyCapabilityFor(track.property);
  const destinationTrack = destination.manualTracks.find((item) => item.property === track.property);
  const base = {
    sourceNodeId: source.sourceNodeId,
    destinationNodeId: destination.nodeId,
    property: track.property,
    trackId: track.trackId
  };
  if (capability.id === "UNKNOWN") {
    return { ...base, status: "unsupported", reason: "UNSUPPORTED_PROPERTY", explanation: capability.restrictions[0], strategy: "skip" };
  }
  if (capability.paste === "read-only") {
    return { ...base, status: "read-only", reason: "DESTINATION_NODE_TYPE_UNSUPPORTED", explanation: capability.evidence, strategy: "skip" };
  }
  if (destination.capabilities.manualTrackReplacement.status === "unknown") {
    return { ...base, status: "unsupported", reason: "UNKNOWN_CAPABILITY", explanation: destination.capabilities.manualTrackReplacement.reason, strategy: "skip" };
  }
  if (destination.capabilities.manualTrackReplacement.status === "unsupported" || destination.capabilities.manualTrackReplacement.status === "read-only") {
    return { ...base, status: "read-only", reason: "COMPONENT_RESTRICTION", explanation: destination.capabilities.manualTrackReplacement.reason, strategy: "skip" };
  }
  if (!destinationTrack) {
    return { ...base, status: "partial", reason: "MISSING_DESTINATION_TRACK", explanation: "Destination does not expose this manual track; add-missing paste may create it only when a writer-ready value strategy exists.", strategy: "add-missing" };
  }
  if (destination.styleInstances.some((style) => (style.name ?? "").toUpperCase() === track.property.toUpperCase())) {
    return { ...base, status: "supported-with-warning", reason: "MANUAL_STYLE_CONFLICT", explanation: "Destination has style and manual Motion with the same property label; style data remains skipped.", strategy: "replace" };
  }
  if (timelineTooShort(track, destinationTrack, destination)) {
    return { ...base, status: "supported-with-warning", reason: "TIMELINE_TOO_SHORT", explanation: "Copied timing extends beyond the destination timeline; the existing preview warning remains visible.", strategy: "replace" };
  }
  return { ...base, status: "supported", reason: "SUPPORTED", explanation: "Manual property has a compatible destination track and verified guarded writer path.", strategy: "replace" };
};

const timelineTooShort = (
  source: MotionClipboardManualTrack,
  destinationTrack: NormalizedManualTrack,
  destination: MotionSnapshot
): boolean => {
  const timeline = destination.timelines.find((item) => item.tracks.includes(destinationTrack.property));
  const max = Math.max(...source.keyframes.flatMap((keyframe) => keyframe.timeMs === undefined ? [] : [keyframe.timeMs]), 0);
  return timeline !== undefined && max > timeline.durationMs;
};

const missingSourceItem = (source: MotionClipboardSource, destination: MotionSnapshot): PasteCompatibilityItem => ({
  sourceNodeId: source.sourceNodeId,
  destinationNodeId: destination.nodeId,
  property: "none",
  status: "unsupported",
  reason: "MISSING_SOURCE_DATA",
  explanation: "Clipboard source contains no pasteable manual or visible style Motion data.",
  strategy: "skip"
});
