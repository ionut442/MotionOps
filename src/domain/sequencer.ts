import type {
  ManualTrackWriteModel,
  MotionCapability,
  MotionSnapshot,
  NormalizedEasing,
  NormalizedManualTrack,
  NormalizedStyleInstance,
  NormalizedTimeline
} from "./motion";
import {
  resolveStaggerSchedule,
  shiftTimesByStagger,
  type StaggerOperation
} from "./stagger";
import type { TimeMs } from "./time";

export type SequencerSource = "manual" | "style" | "timeline";
export type SequencerCapability = "editable" | "read-only" | "unsupported" | "unknown";

export interface SequencerKeyframeDraft {
  readonly id: string;
  readonly ordinal: number;
  readonly timeMs: TimeMs;
  readonly value: unknown;
  readonly easing: NormalizedEasing;
  readonly valueClassification: string;
}

export interface SequencerItemDraft {
  readonly id: string;
  readonly nodeId: string;
  readonly nodeLabel: string;
  readonly source: SequencerSource;
  readonly property: string;
  readonly label: string;
  readonly startMs: TimeMs;
  readonly endMs: TimeMs;
  readonly durationMs: TimeMs;
  readonly capability: SequencerCapability;
  readonly capabilityReason: string;
  readonly timelineIds: readonly string[];
  readonly originalStartMs: TimeMs;
  readonly originalEndMs: TimeMs;
  readonly keyframes: readonly SequencerKeyframeDraft[];
  readonly style?: NormalizedStyleInstance;
}

export interface SequencerRowDraft {
  readonly id: string;
  readonly nodeId: string;
  readonly label: string;
  readonly expanded: boolean;
  readonly items: readonly SequencerItemDraft[];
}

export interface SequencerSelection {
  readonly itemIds: readonly string[];
  readonly keyframeIds: readonly string[];
}

export interface SequencerViewport {
  readonly zoomPxPerMs: number;
  readonly panMs: TimeMs;
  readonly widthPx: number;
  readonly visibleStartMs: TimeMs;
  readonly visibleEndMs: TimeMs;
}

export interface SequencerSnapSettings {
  readonly enabled: boolean;
  readonly intervalMs: TimeMs;
}

export interface SequencerWarning {
  readonly code:
    | "READ_ONLY_SKIPPED"
    | "NEGATIVE_TIME_BLOCKED"
    | "INVALID_OPERATION"
    | "TIMELINE_EXTENSION_REQUIRED"
    | "TIMELINE_READ_ONLY"
    | "BOX_SELECTION_DEFERRED"
    | "STAGGER_WARNING";
  readonly itemId?: string;
  readonly message: string;
}

export interface SequencerDraft {
  readonly version: 1;
  readonly draftId: string;
  readonly baseSnapshotId: string;
  readonly baseFingerprints: Record<string, string>;
  readonly createdAtMs: number;
  readonly rows: readonly SequencerRowDraft[];
  readonly selection: SequencerSelection;
  readonly viewport: SequencerViewport;
  readonly snap: SequencerSnapSettings;
  readonly timelineEndMs: TimeMs;
  readonly stale: boolean;
  readonly warnings: readonly SequencerWarning[];
}

export type SequencerDistributionMode = "starts" | "ends" | "centers" | "gaps";
export type SequencerFitMode = "preserve-durations" | "scale-all";
export type SequencerAlignTarget =
  | { kind: "earliest" }
  | { kind: "latest" }
  | { kind: "exact"; timeMs: TimeMs }
  | { kind: "reference"; itemId: string };

export interface SequencerChangeOperation {
  readonly kind: "sequencer-draft";
  readonly label: string;
  readonly manualTracks: readonly ManualTrackWriteModel[];
  readonly timelineDurations: readonly { timelineId: string; durationMs: TimeMs }[];
  readonly baseSnapshotId: string;
  readonly warnings: readonly SequencerWarning[];
}

const MIN_ZOOM_PX_PER_MS = 0.02;
const MAX_ZOOM_PX_PER_MS = 4;
const DEFAULT_ZOOM_PX_PER_MS = 0.2;
const MIN_DURATION_MS = 1 as TimeMs;

const capabilityFor = (capability: MotionCapability): SequencerCapability => {
  if (capability.status === "supported" || capability.status === "supported-with-warning") {
    return "editable";
  }
  if (capability.status === "read-only") {
    return "read-only";
  }
  if (capability.status === "unknown") {
    return "unknown";
  }
  return "unsupported";
};

export const createSequencerDraft = ({
  snapshots,
  scopeOrder = snapshots.map((snapshot) => ({ nodeId: snapshot.nodeId, label: snapshot.nodeId })),
  baseSnapshotId,
  baseFingerprints,
  nowMs = () => 0,
  id = "sequencer-draft"
}: {
  readonly snapshots: readonly MotionSnapshot[];
  readonly scopeOrder?: readonly { nodeId: string; label: string }[];
  readonly baseSnapshotId: string;
  readonly baseFingerprints: Record<string, string>;
  readonly nowMs?: () => number;
  readonly id?: string;
}): SequencerDraft => {
  const labels = new Map(scopeOrder.map((entry) => [entry.nodeId, entry.label]));
  const ordered = [...snapshots].sort((left, right) => {
    const leftIndex = scopeOrder.findIndex((entry) => entry.nodeId === left.nodeId);
    const rightIndex = scopeOrder.findIndex((entry) => entry.nodeId === right.nodeId);
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
  const rows = ordered.map((snapshot) => buildRow(snapshot, labels.get(snapshot.nodeId) ?? snapshot.nodeId));
  const timelineEndMs = maxTime(rows, ordered);
  return freezeDraft({
    version: 1,
    draftId: id,
    baseSnapshotId,
    baseFingerprints: { ...baseFingerprints },
    createdAtMs: nowMs(),
    rows,
    selection: { itemIds: [], keyframeIds: [] },
    viewport: createViewport({ widthPx: 720, timelineEndMs }),
    snap: { enabled: true, intervalMs: 50 as TimeMs },
    timelineEndMs,
    stale: false,
    warnings: []
  });
};

export const resetSequencerDraft = (draft: SequencerDraft, snapshots: readonly MotionSnapshot[]): SequencerDraft =>
  createSequencerDraft({
    snapshots,
    baseSnapshotId: draft.baseSnapshotId,
    baseFingerprints: draft.baseFingerprints,
    nowMs: () => draft.createdAtMs,
    id: draft.draftId
  });

export const createViewport = ({
  widthPx,
  timelineEndMs,
  zoomPxPerMs = DEFAULT_ZOOM_PX_PER_MS,
  panMs = 0 as TimeMs
}: {
  readonly widthPx: number;
  readonly timelineEndMs: TimeMs;
  readonly zoomPxPerMs?: number;
  readonly panMs?: TimeMs;
}): SequencerViewport => {
  const zoom = clampZoom(zoomPxPerMs);
  const maxPan = Math.max(0, timelineEndMs - Math.round(widthPx / zoom));
  const start = asTimeMs(Math.min(Math.max(0, panMs), maxPan));
  return {
    widthPx,
    zoomPxPerMs: zoom,
    panMs: start,
    visibleStartMs: start,
    visibleEndMs: asTimeMs(Math.min(timelineEndMs, start + Math.round(widthPx / zoom)))
  };
};

export const timeToPixel = (timeMs: TimeMs, viewport: SequencerViewport): number =>
  Math.round((timeMs - viewport.panMs) * viewport.zoomPxPerMs);

export const pixelToTime = (pixel: number, viewport: SequencerViewport): TimeMs =>
  asTimeMs(Math.max(0, Math.round(viewport.panMs + pixel / viewport.zoomPxPerMs)));

export const updateSequencerViewport = (
  draft: SequencerDraft,
  update: Partial<Pick<SequencerViewport, "widthPx" | "zoomPxPerMs" | "panMs">>
): SequencerDraft =>
  replaceDraft(draft, {
    viewport: createViewport({
      widthPx: update.widthPx ?? draft.viewport.widthPx,
      zoomPxPerMs: update.zoomPxPerMs ?? draft.viewport.zoomPxPerMs,
      panMs: update.panMs ?? draft.viewport.panMs,
      timelineEndMs: draft.timelineEndMs
    })
  });

export const selectSequencerItems = (
  draft: SequencerDraft,
  itemIds: readonly string[],
  mode: "replace" | "add" | "range" | "clear" = "replace"
): SequencerDraft => {
  if (mode === "clear") {
    return replaceDraft(draft, { selection: { itemIds: [], keyframeIds: [] } });
  }
  const orderedIds = draft.rows.flatMap((row) => row.items.map((item) => item.id));
  const current = new Set(mode === "add" ? draft.selection.itemIds : []);
  if (mode === "range" && draft.selection.itemIds.length > 0 && itemIds.length > 0) {
    const anchor = orderedIds.indexOf(draft.selection.itemIds[draft.selection.itemIds.length - 1]);
    const target = orderedIds.indexOf(itemIds[0]);
    if (anchor >= 0 && target >= 0) {
      const [start, end] = anchor < target ? [anchor, target] : [target, anchor];
      for (const id of orderedIds.slice(start, end + 1)) {
        current.add(id);
      }
    }
  } else {
    for (const id of itemIds) {
      if (orderedIds.includes(id)) {
        current.add(id);
      }
    }
  }
  return replaceDraft(draft, { selection: { itemIds: [...current], keyframeIds: [] } });
};

export const offsetSelection = (draft: SequencerDraft, deltaMs: TimeMs): SequencerDraft => {
  if (deltaMs === 0) {
    return draft;
  }
  return transformSelectedItems(draft, (item) => moveItem(item, deltaMs));
};

export const resizeSelection = (
  draft: SequencerDraft,
  edge: "start" | "end",
  deltaMs: TimeMs,
  minimumDurationMs: TimeMs = MIN_DURATION_MS
): SequencerDraft =>
  transformSelectedItems(draft, (item) => resizeItem(item, edge, deltaMs, minimumDurationMs));

export const alignSelection = (
  draft: SequencerDraft,
  edge: "start" | "end",
  target: SequencerAlignTarget
): SequencerDraft => {
  const selected = selectedEditableItems(draft);
  if (selected.length <= 1) {
    return draft;
  }
  const targetTime = resolveAlignTime(selected, edge, target);
  return transformSelectedItems(draft, (item) => moveItem(item, asTimeMs(targetTime - (edge === "start" ? item.startMs : item.endMs))));
};

export const distributeSelection = (draft: SequencerDraft, mode: SequencerDistributionMode): SequencerDraft => {
  const selected = selectedEditableItems(draft).sort(compareByRowThenTime);
  if (selected.length < 3) {
    return addWarning(draft, { code: "INVALID_OPERATION", message: "Distribution requires at least three editable items." });
  }
  if (mode === "gaps") {
    const totalDuration = selected.reduce((sum, item) => sum + item.durationMs, 0);
    const start = selected[0].startMs;
    const end = selected[selected.length - 1].endMs;
    const gap = Math.round((end - start - totalDuration) / (selected.length - 1));
    let cursor: number = start;
    const moves = new Map<string, TimeMs>();
    for (const item of selected) {
      moves.set(item.id, asTimeMs(cursor - item.startMs));
      cursor += item.durationMs + gap;
    }
    return transformSelectedItems(draft, (item) => moveItem(item, moves.get(item.id) ?? (0 as TimeMs)));
  }
  const valueFor = (item: SequencerItemDraft) =>
    mode === "starts" ? item.startMs : mode === "ends" ? item.endMs : item.startMs + Math.round(item.durationMs / 2);
  const first = valueFor(selected[0]);
  const last = valueFor(selected[selected.length - 1]);
  const step = (last - first) / (selected.length - 1);
  const moves = new Map<string, TimeMs>();
  selected.forEach((item, index) => {
    const wanted = Math.round(first + step * index);
    moves.set(item.id, asTimeMs(wanted - valueFor(item)));
  });
  return transformSelectedItems(draft, (item) => moveItem(item, moves.get(item.id) ?? (0 as TimeMs)));
};

export const staggerSelection = (draft: SequencerDraft, operation: StaggerOperation): SequencerDraft => {
  const selected = selectedEditableItems(draft).sort(compareByRowThenTime);
  if (selected.length === 0) {
    return addWarning(draft, { code: "INVALID_OPERATION", message: "Stagger requires at least one editable selected item." });
  }
  const schedule = resolveStaggerSchedule(
    selected.map((item) => ({ id: item.id, startMs: item.startMs, endMs: item.endMs })),
    operation,
    draft.timelineEndMs
  );
  if (!schedule.ok) {
    return addWarning(draft, { code: "INVALID_OPERATION", message: schedule.error.message, itemId: schedule.error.path });
  }
  const byId = new Map(schedule.value.items.map((item) => [item.id, item]));
  const rows = draft.rows.map((row) => ({
    ...row,
    items: row.items.map((item) => {
      const scheduled = byId.get(item.id);
      if (scheduled === undefined) {
        return item;
      }
      return {
        ...item,
        startMs: scheduled.startMs,
        endMs: scheduled.endMs,
        durationMs: scheduled.durationMs,
        keyframes: item.keyframes.map((keyframe, index) => ({
          ...keyframe,
          timeMs: shiftTimesByStagger([keyframe.timeMs], scheduled)[0] ?? item.keyframes[index].timeMs
        }))
      };
    })
  }));
  const warnings = schedule.value.warnings.map((warning) => ({
    code: warning.code === "TIMELINE_EXTENSION_REQUIRED" ? "TIMELINE_EXTENSION_REQUIRED" as const : "STAGGER_WARNING" as const,
    itemId: warning.itemId,
    message: warning.message
  }));
  return normalizeTimelineEnd(replaceDraft(draft, { rows, warnings: [...draft.warnings, ...warnings] }));
};

export const fitSelectionToDuration = (
  draft: SequencerDraft,
  durationMs: TimeMs,
  mode: SequencerFitMode
): SequencerDraft => {
  const selected = selectedEditableItems(draft).sort(compareByRowThenTime);
  if (selected.length === 0 || durationMs <= 0) {
    return addWarning(draft, { code: "INVALID_OPERATION", message: "Fit requires editable items and a positive duration." });
  }
  const start = Math.min(...selected.map((item) => item.startMs));
  const end = Math.max(...selected.map((item) => item.endMs));
  const currentDuration = end - start;
  if (currentDuration === 0) {
    return draft;
  }
  if (mode === "preserve-durations") {
    const totalItemDuration = selected.reduce((sum, item) => sum + item.durationMs, 0);
    if (totalItemDuration > durationMs) {
      return addWarning(draft, {
        code: "INVALID_OPERATION",
        message: "Preserve-duration fit is impossible because selected durations exceed the target."
      });
    }
    const gap = selected.length <= 1 ? 0 : Math.round((durationMs - totalItemDuration) / (selected.length - 1));
    let cursor = start;
    const moves = new Map<string, TimeMs>();
    for (const item of selected) {
      moves.set(item.id, asTimeMs(cursor - item.startMs));
      cursor += item.durationMs + gap;
    }
    return transformSelectedItems(draft, (item) => moveItem(item, moves.get(item.id) ?? (0 as TimeMs)));
  }
  return transformSelectedItems(draft, (item) => {
    const nextStart = start + Math.round(((item.startMs - start) * durationMs) / currentDuration);
    const nextEnd = start + Math.round(((item.endMs - start) * durationMs) / currentDuration);
    return scaleItemTo(item, asTimeMs(nextStart), asTimeMs(Math.max(nextStart + MIN_DURATION_MS, nextEnd)));
  });
};

export const trimAndPadTimeline = (
  draft: SequencerDraft,
  options: { readonly trimStart?: boolean; readonly trimEnd?: boolean; readonly paddingStartMs?: TimeMs; readonly paddingEndMs?: TimeMs }
): SequencerDraft => {
  const editable = draft.rows.flatMap((row) => row.items).filter((item) => item.source === "manual" && item.capability === "editable");
  if (editable.length === 0) {
    return addWarning(draft, { code: "INVALID_OPERATION", message: "Trim and padding require editable manual timing data." });
  }
  const first = Math.min(...editable.map((item) => item.startMs));
  const startPadding = options.paddingStartMs ?? (0 as TimeMs);
  const endPadding = options.paddingEndMs ?? (0 as TimeMs);
  if (startPadding < 0 || endPadding < 0) {
    return addWarning(draft, { code: "INVALID_OPERATION", message: "Timeline padding must be a non-negative integer millisecond value." });
  }
  let next = draft;
  if (options.trimStart && first > startPadding) {
    next = transformAllManualItems(next, (item) => moveItem(item, asTimeMs(startPadding - first)));
  }
  const latest = Math.max(...next.rows.flatMap((row) => row.items).map((item) => item.endMs));
  const requestedEnd = asTimeMs((options.trimEnd ? latest : next.timelineEndMs) + endPadding);
  return replaceDraft(next, { timelineEndMs: requestedEnd, viewport: createViewport({ ...next.viewport, timelineEndMs: requestedEnd }) });
};

export const snapTime = (timeMs: TimeMs, snap: SequencerSnapSettings): TimeMs => {
  if (!snap.enabled) {
    return timeMs;
  }
  if (!Number.isInteger(snap.intervalMs) || snap.intervalMs <= 0) {
    return timeMs;
  }
  return asTimeMs(Math.round(timeMs / snap.intervalMs) * snap.intervalMs);
};

export const markSequencerStale = (draft: SequencerDraft, currentFingerprints: Record<string, string>): SequencerDraft => {
  const stale = Object.entries(draft.baseFingerprints).some(([nodeId, fingerprint]) => currentFingerprints[nodeId] !== fingerprint);
  return replaceDraft(draft, { stale });
};

export const buildSequencerChangeOperation = (draft: SequencerDraft, label = "Sequencer draft"): SequencerChangeOperation => {
  const manualTracks = draft.rows
    .flatMap((row) => row.items)
    .filter((item) => item.source === "manual" && item.capability === "editable" && itemChanged(item))
    .map((item) => ({
      trackId: item.id.split(":track:")[1],
      property: item.property,
      keyframes: item.keyframes.map((keyframe) => ({
        keyframeId: keyframe.id.includes(":keyframe:") ? keyframe.id.split(":keyframe:")[1] : undefined,
        timeMs: keyframe.timeMs,
        value: keyframe.value,
        easing: keyframe.easing
      }))
    }));
  return {
    kind: "sequencer-draft",
    label,
    manualTracks,
    timelineDurations: [],
    baseSnapshotId: draft.baseSnapshotId,
    warnings: draft.warnings
  };
};

const buildRow = (snapshot: MotionSnapshot, label: string): SequencerRowDraft => {
  const { timelines: normalizedTimelines } = snapshot;
  return {
    id: `row:${snapshot.nodeId}`,
    nodeId: snapshot.nodeId,
    label,
    expanded: true,
    items: [
      ...snapshot.manualTracks.map((track) => manualItem(snapshot, label, track)),
      ...snapshot.styleInstances.map((style, index) => styleItem(snapshot, label, style, index, normalizedTimelines))
    ]
  };
};

const manualItem = (snapshot: MotionSnapshot, nodeLabel: string, track: NormalizedManualTrack): SequencerItemDraft => {
  const { timelines: normalizedTimelines } = snapshot;
  const times = track.keyframes.map((keyframe) => keyframe.timeMs);
  const start = asTimeMs(times.length === 0 ? 0 : Math.min(...times));
  const end = asTimeMs(times.length === 0 ? 0 : Math.max(...times));
  const trackId = track.trackId ?? track.property;
  return {
    id: `${snapshot.nodeId}:track:${trackId}`,
    nodeId: snapshot.nodeId,
    nodeLabel,
    source: "manual",
    property: track.property,
    label: track.property,
    startMs: start,
    endMs: end,
    durationMs: asTimeMs(end - start),
    capability: capabilityFor(track.write),
    capabilityReason: track.write.reason,
    timelineIds: normalizedTimelines.filter((timeline) => timeline.tracks.includes(track.property)).map((timeline) => timeline.timelineId),
    originalStartMs: start,
    originalEndMs: end,
    keyframes: track.keyframes.map((keyframe) => ({
      id: `${snapshot.nodeId}:track:${trackId}:keyframe:${keyframe.keyframeId ?? String(keyframe.ordinal)}`,
      ordinal: keyframe.ordinal,
      timeMs: keyframe.timeMs,
      value: keyframe.value,
      easing: keyframe.easing,
      valueClassification: keyframe.valueClassification
    }))
  };
};

const styleItem = (
  snapshot: MotionSnapshot,
  nodeLabel: string,
  style: NormalizedStyleInstance,
  index: number,
  timelines: readonly NormalizedTimeline[]
): SequencerItemDraft => {
  const duration = timelines[0]?.durationMs ?? (0 as TimeMs);
  const id = style.appliedStyleInstanceId ?? style.availableAnimationStyleId ?? `style-${String(index)}`;
  return {
    id: `${snapshot.nodeId}:style:${id}`,
    nodeId: snapshot.nodeId,
    nodeLabel,
    source: "style",
    property: style.name ?? "style",
    label: style.name ?? "Animation style",
    startMs: 0 as TimeMs,
    endMs: duration,
    durationMs: duration,
    capability: "read-only",
    capabilityReason: "Style-generated timing is visible but not directly editable without verified writer support.",
    timelineIds: timelines.map((timeline) => timeline.timelineId),
    originalStartMs: 0 as TimeMs,
    originalEndMs: duration,
    keyframes: [],
    style
  };
};

const transformSelectedItems = (
  draft: SequencerDraft,
  transform: (item: SequencerItemDraft) => SequencerItemDraft | SequencerWarning
): SequencerDraft => {
  const selected = new Set(draft.selection.itemIds);
  const warnings: SequencerWarning[] = [];
  const rows = draft.rows.map((row) => ({
    ...row,
    items: row.items.map((item) => {
      if (!selected.has(item.id)) {
        return item;
      }
      if (item.capability !== "editable" || item.source !== "manual") {
        warnings.push({ code: "READ_ONLY_SKIPPED", itemId: item.id, message: `${item.label} is read-only and was skipped.` });
        return item;
      }
      const next = transform(item);
      if ("code" in next) {
        warnings.push(next);
        return item;
      }
      return next;
    })
  }));
  return normalizeTimelineEnd(replaceDraft(draft, { rows, warnings: [...draft.warnings, ...warnings] }));
};

const transformAllManualItems = (
  draft: SequencerDraft,
  transform: (item: SequencerItemDraft) => SequencerItemDraft | SequencerWarning
): SequencerDraft => {
  const rows = draft.rows.map((row) => ({
    ...row,
    items: row.items.map((item) => (item.source === "manual" && item.capability === "editable" ? transform(item) : item))
  })) as SequencerRowDraft[];
  return normalizeTimelineEnd(replaceDraft(draft, { rows }));
};

const moveItem = (item: SequencerItemDraft, deltaMs: TimeMs): SequencerItemDraft | SequencerWarning => {
  const start = item.startMs + deltaMs;
  const end = item.endMs + deltaMs;
  if (start < 0 || end < 0) {
    return { code: "NEGATIVE_TIME_BLOCKED", itemId: item.id, message: "Move would place timing before 0 ms." };
  }
  return {
    ...item,
    startMs: asTimeMs(start),
    endMs: asTimeMs(end),
    keyframes: item.keyframes.map((keyframe) => ({ ...keyframe, timeMs: asTimeMs(keyframe.timeMs + deltaMs) }))
  };
};

const resizeItem = (
  item: SequencerItemDraft,
  edge: "start" | "end",
  deltaMs: TimeMs,
  minimumDurationMs: TimeMs
): SequencerItemDraft | SequencerWarning => {
  const nextStart = edge === "start" ? item.startMs + deltaMs : item.startMs;
  const nextEnd = edge === "end" ? item.endMs + deltaMs : item.endMs;
  if (nextStart < 0 || nextEnd < 0 || nextEnd - nextStart < minimumDurationMs) {
    return { code: "INVALID_OPERATION", itemId: item.id, message: "Resize would create an invalid duration." };
  }
  return scaleItemTo(item, asTimeMs(nextStart), asTimeMs(nextEnd));
};

const scaleItemTo = (item: SequencerItemDraft, nextStart: TimeMs, nextEnd: TimeMs): SequencerItemDraft => {
  const currentDuration = item.durationMs;
  const nextDuration = Math.max(MIN_DURATION_MS, nextEnd - nextStart);
  const keyframes = currentDuration === 0
    ? item.keyframes.map((keyframe) => ({ ...keyframe, timeMs: nextStart }))
    : item.keyframes.map((keyframe) => ({
        ...keyframe,
        timeMs: asTimeMs(nextStart + Math.round(((keyframe.timeMs - item.startMs) * nextDuration) / currentDuration))
      }));
  return {
    ...item,
    startMs: nextStart,
    endMs: nextEnd,
    durationMs: asTimeMs(nextDuration),
    keyframes
  };
};

const resolveAlignTime = (items: readonly SequencerItemDraft[], edge: "start" | "end", target: SequencerAlignTarget): TimeMs => {
  const valueFor = (item: SequencerItemDraft) => (edge === "start" ? item.startMs : item.endMs);
  switch (target.kind) {
    case "earliest":
      return asTimeMs(Math.min(...items.map(valueFor)));
    case "latest":
      return asTimeMs(Math.max(...items.map(valueFor)));
    case "exact":
      return target.timeMs;
    case "reference":
      return valueFor(items.find((item) => item.id === target.itemId) ?? items[0]);
    default:
      return assertNever(target);
  }
};

const selectedEditableItems = (draft: SequencerDraft) => {
  const selected = new Set(draft.selection.itemIds);
  return draft.rows.flatMap((row, rowIndex) =>
    row.items
      .filter((item) => selected.has(item.id) && item.source === "manual" && item.capability === "editable")
      .map((item) => ({ ...item, rowIndex }))
  );
};

const compareByRowThenTime = (left: SequencerItemDraft & { rowIndex?: number }, right: SequencerItemDraft & { rowIndex?: number }) =>
  (left.rowIndex ?? 0) - (right.rowIndex ?? 0) || left.startMs - right.startMs || left.id.localeCompare(right.id);

const itemChanged = (item: SequencerItemDraft): boolean =>
  item.startMs !== item.originalStartMs ||
  item.endMs !== item.originalEndMs ||
  item.keyframes.some((keyframe) => keyframe.timeMs < item.originalStartMs || keyframe.timeMs > item.originalEndMs);

const maxTime = (rows: readonly SequencerRowDraft[], snapshots: readonly MotionSnapshot[]): TimeMs =>
  asTimeMs(Math.max(0, ...rows.flatMap((row) => row.items.map((item) => item.endMs)), ...snapshots.flatMap((snapshot) => {
    const { timelines: normalizedTimelines } = snapshot;
    return normalizedTimelines.map((timeline) => timeline.durationMs);
  })));

const normalizeTimelineEnd = (draft: SequencerDraft): SequencerDraft => {
  const timelineEndMs = asTimeMs(Math.max(draft.timelineEndMs, ...draft.rows.flatMap((row) => row.items.map((item) => item.endMs))));
  return replaceDraft(draft, { timelineEndMs, viewport: createViewport({ ...draft.viewport, timelineEndMs }) });
};

const addWarning = (draft: SequencerDraft, warning: SequencerWarning): SequencerDraft =>
  replaceDraft(draft, { warnings: [...draft.warnings, warning] });

const replaceDraft = (draft: SequencerDraft, patch: Partial<SequencerDraft>): SequencerDraft =>
  freezeDraft({ ...draft, ...patch });

const freezeDraft = (draft: SequencerDraft): SequencerDraft =>
  Object.freeze(draft);

const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM_PX_PER_MS, Math.max(MIN_ZOOM_PX_PER_MS, Number.isFinite(zoom) ? zoom : DEFAULT_ZOOM_PX_PER_MS));

const asTimeMs = (value: number): TimeMs => Math.round(value) as TimeMs;

const assertNever = (value: never): never => {
  throw new Error(`Unhandled sequencer value: ${JSON.stringify(value)}`);
};
