import type { TimeMs } from "../../domain/time";
import { stableClone } from "./object";
import type {
  MotionAdapterWarning,
  MotionCapability,
  MotionSnapshot,
  MotionSourceKind,
  NormalizedEasing,
  NormalizedManualTrack,
  NormalizedStyleInstance
} from "./types";

export type MotionClipboardCopyMode = "complete" | "timing-only" | "easing-only" | "selected-tracks";

export interface MotionClipboardManualKeyframe {
  keyframeId?: string;
  ordinal: number;
  timeMs?: TimeMs;
  value?: unknown;
  easing?: NormalizedEasing;
  valueClassification: string;
}

export interface MotionClipboardManualTrack {
  trackId?: string;
  property: string;
  propertyClassification: string;
  keyframes: MotionClipboardManualKeyframe[];
  write: MotionCapability;
  warnings: MotionAdapterWarning[];
}

export interface MotionClipboardStyleEntry {
  availableAnimationStyleId?: string;
  appliedStyleInstanceId?: string;
  name?: string;
  writable: false;
  warnings: MotionAdapterWarning[];
}

export interface MotionClipboardSource {
  sourceNodeId: string;
  sourceNodeType: string;
  sourceKind: MotionSourceKind;
  copyMode: MotionClipboardCopyMode;
  manualTracks: MotionClipboardManualTrack[];
  styleInstances: MotionClipboardStyleEntry[];
  timingSummary: {
    firstMs?: TimeMs;
    lastMs?: TimeMs;
    durationMs?: TimeMs;
    keyframeCount: number;
  };
  capabilities: {
    manualTrackReplacement: MotionCapability;
    styleRemoveReapply: MotionCapability;
  };
  warnings: MotionAdapterWarning[];
}

export interface MotionClipboard {
  version: 1;
  createdAtMs: number;
  mode: MotionClipboardCopyMode;
  sources: MotionClipboardSource[];
}

export type MotionClipboardCopyResult =
  | { ok: true; clipboard: MotionClipboard }
  | { ok: false; code: "EMPTY_SELECTION" | "NO_TRACKS_SELECTED"; message: string };

export const copyMotionToClipboard = ({
  snapshots,
  mode,
  selectedTrackIds = [],
  nowMs = () => 0
}: {
  snapshots: readonly MotionSnapshot[];
  mode: MotionClipboardCopyMode;
  selectedTrackIds?: readonly string[];
  nowMs?: () => number;
}): MotionClipboardCopyResult => {
  if (snapshots.length === 0) {
    return { ok: false, code: "EMPTY_SELECTION", message: "No source Motion snapshots were selected for copy." };
  }
  const selected = new Set(selectedTrackIds);
  const sources = snapshots.map((snapshot) => clipboardSource(snapshot, mode, selected));
  if (mode === "selected-tracks" && sources.every((source) => source.manualTracks.length === 0 && source.styleInstances.length === 0)) {
    return { ok: false, code: "NO_TRACKS_SELECTED", message: "Selected-track copy did not match any source tracks." };
  }
  return {
    ok: true,
    clipboard: stableClone({
      version: 1,
      createdAtMs: nowMs(),
      mode,
      sources
    }) as MotionClipboard
  };
};

export const serializeMotionClipboard = (clipboard: MotionClipboard): string =>
  JSON.stringify(clipboard, stableKeyOrder);

const clipboardSource = (
  snapshot: MotionSnapshot,
  mode: MotionClipboardCopyMode,
  selected: ReadonlySet<string>
): MotionClipboardSource => {
  const manualTracks = snapshot.manualTracks
    .filter((track) => mode !== "selected-tracks" || selected.has(track.trackId ?? track.property) || selected.has(track.property))
    .map((track) => copyTrack(track, mode));
  const styleInstances = snapshot.styleInstances
    .filter((style, index) => mode !== "selected-tracks" || selected.has(style.appliedStyleInstanceId ?? style.availableAnimationStyleId ?? `style-${String(index)}`))
    .map(copyStyle);
  return {
    sourceNodeId: snapshot.nodeId,
    sourceNodeType: snapshot.nodeType,
    sourceKind: snapshot.sources.kind,
    copyMode: mode,
    manualTracks,
    styleInstances,
    timingSummary: summarize(manualTracks),
    capabilities: {
      manualTrackReplacement: stableClone(snapshot.capabilities.manualTrackReplacement) as MotionCapability,
      styleRemoveReapply: stableClone(snapshot.capabilities.styleRemoveReapply) as MotionCapability
    },
    warnings: stableClone(snapshot.warnings) as MotionAdapterWarning[]
  };
};

const copyTrack = (track: NormalizedManualTrack, mode: MotionClipboardCopyMode): MotionClipboardManualTrack => ({
  trackId: track.trackId,
  property: track.property,
  propertyClassification: track.propertyClassification,
  keyframes: track.keyframes.map((keyframe) => ({
    keyframeId: keyframe.keyframeId,
    ordinal: keyframe.ordinal,
    timeMs: mode === "easing-only" ? undefined : keyframe.timeMs,
    value: mode === "timing-only" || mode === "easing-only" ? undefined : stableClone(keyframe.value),
    easing: mode === "timing-only" ? undefined : stableClone(keyframe.easing) as NormalizedEasing,
    valueClassification: keyframe.valueClassification
  })),
  write: stableClone(track.write) as MotionCapability,
  warnings: stableClone(track.warnings) as MotionAdapterWarning[]
});

const copyStyle = (style: NormalizedStyleInstance): MotionClipboardStyleEntry => ({
  availableAnimationStyleId: style.availableAnimationStyleId,
  appliedStyleInstanceId: style.appliedStyleInstanceId,
  name: style.name,
  writable: false,
  warnings: stableClone(style.warnings) as MotionAdapterWarning[]
});

const summarize = (tracks: readonly MotionClipboardManualTrack[]): MotionClipboardSource["timingSummary"] => {
  const times = tracks.flatMap((track) => track.keyframes.flatMap((keyframe) => keyframe.timeMs === undefined ? [] : [keyframe.timeMs]));
  if (times.length === 0) {
    return { keyframeCount: tracks.reduce((count, track) => count + track.keyframes.length, 0) };
  }
  const first = Math.min(...times) as TimeMs;
  const last = Math.max(...times) as TimeMs;
  return { firstMs: first, lastMs: last, durationMs: (last - first) as TimeMs, keyframeCount: times.length };
};

const stableKeyOrder = (_key: string, value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)));
};
