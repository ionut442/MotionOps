import type { TimeMs } from "../../domain/time";
import {
  resolveStaggerSchedule,
  type StaggerOperation,
  type StaggeredItem
} from "../../domain/stagger";
import { stableClone } from "./object";
import { transformManualTrack } from "./operations";
import { snapshotPlanId, type ChangePlan, type ChangePlanSkip, type ChangePlanWarning, type ManualTrackChangeMutation } from "./plan";
import { createMotionStateGuard } from "./stale-detection";
import type { MotionClipboard, MotionClipboardManualTrack } from "./clipboard";
import { analyzePasteCompatibility, type PasteCompatibilityItem } from "./compatibility";
import type { ManualTrackWriteModel, MotionSnapshot, NormalizedManualTrack, Result } from "./types";
import type { NormalizedEasing } from "./types";

export type PasteMode = "replace" | "merge-compatible" | "add-missing-only" | "preserve-timing" | "preserve-easing";
export type PasteMappingMode = "one-to-many" | "scope-order" | "explicit";

export interface PasteMapping {
  mode: PasteMappingMode;
  pairs?: readonly { sourceNodeId: string; destinationNodeId: string }[];
}

export interface PasteTimingOptions {
  offsetMs?: number;
  intervalMs?: number;
  reverseOrder?: boolean;
  stagger?: StaggerOperation;
}

export interface BuildPastePlanOptions {
  clipboard: MotionClipboard;
  destinations: readonly MotionSnapshot[];
  pasteMode: PasteMode;
  mapping: PasteMapping;
  timing?: PasteTimingOptions;
  idGenerator: () => string;
  nowMs?: () => number;
}

export const buildPasteChangePlan = ({
  clipboard,
  destinations,
  pasteMode,
  mapping,
  timing = {},
  idGenerator,
  nowMs = () => 0
}: BuildPastePlanOptions): Result<ChangePlan, { code: string; message: string }> => {
  const pairs = resolveMapping(clipboard, destinations, mapping);
  if (!pairs.ok) {
    return pairs;
  }
  const orderedPairs = timing.reverseOrder ? [...pairs.value].reverse() : pairs.value;
  const staggerItems = resolvePasteStaggerItems(clipboard, destinations, orderedPairs, timing);
  if (!staggerItems.ok) {
    return staggerItems;
  }
  const planId = idGenerator();
  const compatibility = analyzePasteCompatibility(clipboard, destinations);
  const mutations: ManualTrackChangeMutation[] = [];
  const skipped: ChangePlanSkip[] = [];
  const warnings: ChangePlanWarning[] = [];

  for (const [pairIndex, pair] of orderedPairs.entries()) {
    const source = clipboard.sources.find((item) => item.sourceNodeId === pair.sourceNodeId);
    const destination = destinations.find((item) => item.nodeId === pair.destinationNodeId);
    if (!source || !destination) {
      skipped.push(skip(pair.destinationNodeId, "target", "NO_TARGETS", "Mapping referenced a missing source or destination."));
      continue;
    }
    for (const sourceTrack of source.manualTracks) {
      const compat = compatibility.items.find((item) =>
        item.sourceNodeId === source.sourceNodeId &&
        item.destinationNodeId === destination.nodeId &&
        item.property === sourceTrack.property
      );
      const destinationTrack = destination.manualTracks.find((track) => track.property === sourceTrack.property);
      if (!compat || compat.status === "unsupported" || compat.status === "read-only") {
        skipped.push(skip(destination.nodeId, `manualTracks.${sourceTrack.property}`, "UNSUPPORTED_CAPABILITY", compat?.explanation ?? "Track is not compatible."));
        continue;
      }
      if (pasteMode === "add-missing-only" && destinationTrack) {
        skipped.push(skip(destination.nodeId, `manualTracks.${sourceTrack.property}`, "STYLE_MANUAL_CONFLICT", "Destination already has this property; add-missing-only skipped it explicitly."));
        continue;
      }
      if (!destinationTrack) {
        skipped.push(skip(destination.nodeId, `manualTracks.${sourceTrack.property}`, "MISSING_WRITER_METADATA", "Destination track is missing; this batch does not fabricate destination values."));
        continue;
      }
      const staggered = staggerItems.value.get(pair.destinationNodeId);
      const after = makePastedTrack(
        sourceTrack,
        destinationTrack,
        pasteMode,
        staggered?.startMs ?? ((timing.offsetMs ?? 0) + pairIndex * (timing.intervalMs ?? 0)),
        staggered
      );
      if (!after.ok) {
        skipped.push(skip(destination.nodeId, `manualTracks.${sourceTrack.property}`, "TRANSFORM_FAILED", after.error.message));
        continue;
      }
      const guard = createMotionStateGuard(destination, {
        operation: "manual-track-replacement",
        property: destinationTrack.property,
        preserveUnrelatedManualTracks: true,
        createdFromSnapshotId: snapshotPlanId(destination)
      });
      if (!guard.ok) {
        skipped.push(skip(destination.nodeId, `manualTracks.${sourceTrack.property}`, "TRANSFORM_FAILED", guard.error.message));
        continue;
      }
      const mutation: ManualTrackChangeMutation = {
        id: `${planId}:paste:${String(mutations.length)}`,
        nodeId: destination.nodeId,
        source: "manual",
        property: destinationTrack.property,
        before: stableClone(destinationTrack) as NormalizedManualTrack,
        after: after.value.track,
        writeModel: after.value.writeModel,
        guard: guard.value,
        expectation: {
          operation: "manual-track-replacement",
          nodeId: destination.nodeId,
          expectedTrack: after.value.track,
          preserveManualTracks: destination.manualTracks.filter((track) => track.property !== destinationTrack.property)
        },
        warnings: []
      };
      mutations.push(mutation);
      appendCompatibilityWarnings(warnings, compat);
    }
    for (const style of source.styleInstances) {
      skipped.push(skip(destination.nodeId, `styleInstances.${style.availableAnimationStyleId ?? style.name ?? "unknown"}`, "READ_ONLY_STYLE_FIELD", "Copied style data is visible but remains read-only for paste."));
    }
  }

  return {
    ok: true,
    value: {
      version: 1,
      planId,
      baseSnapshotId: `paste:${destinations.map(snapshotPlanId).join("|")}`,
        operation: { kind: "paste-motion", pasteMode },
      createdAtMs: nowMs(),
      mutations,
      skipped,
      warnings,
      expected: {
        affectedTargets: new Set(mutations.map((mutation) => mutation.nodeId)).size,
        manualMutations: mutations.length,
        styleMutations: 0,
        timelineMutations: 0,
        skippedTargets: skipped.length,
        expectedResults: [
          `${String(mutations.length)} manual paste mutation(s)`,
          `${String(skipped.length)} skipped paste target(s)`,
          `${String(warnings.length)} warning(s)`
        ],
        beforeAfterExamples: mutations.slice(0, 3).map((mutation) => ({
          label: `${mutation.nodeId}:${mutation.property}`,
          before: mutation.before.keyframes.map((keyframe) => String(keyframe.timeMs)).join(", "),
          after: mutation.after.keyframes.map((keyframe) => String(keyframe.timeMs)).join(", ")
        }))
      }
    }
  };
};

const resolvePasteStaggerItems = (
  clipboard: MotionClipboard,
  destinations: readonly MotionSnapshot[],
  pairs: readonly { sourceNodeId: string; destinationNodeId: string }[],
  timing: PasteTimingOptions
): Result<ReadonlyMap<string, StaggeredItem>, { code: string; message: string }> => {
  if (timing.stagger === undefined) {
    return { ok: true, value: new Map() };
  }
  const baseOffset = timing.offsetMs ?? 0;
  const items = pairs.map((pair, index) => {
    const source = clipboard.sources.find((item) => item.sourceNodeId === pair.sourceNodeId);
    const duration = source?.timingSummary.durationMs ?? 0;
    return {
      id: pair.destinationNodeId,
      startMs: (baseOffset + index * (timing.intervalMs ?? 0)) as TimeMs,
      endMs: (baseOffset + index * (timing.intervalMs ?? 0) + duration) as TimeMs
    };
  });
  const timelineEnd = Math.max(
    0,
    ...destinations.flatMap((destination) => destination.timelines.map((timeline) => timeline.durationMs))
  ) as TimeMs;
  const schedule = resolveStaggerSchedule(items, timing.stagger, timelineEnd);
  if (!schedule.ok) {
    return { ok: false, error: { code: schedule.error.code, message: schedule.error.message } };
  }
  return { ok: true, value: new Map(schedule.value.items.map((item) => [item.id, item])) };
};

const resolveMapping = (
  clipboard: MotionClipboard,
  destinations: readonly MotionSnapshot[],
  mapping: PasteMapping
): Result<{ sourceNodeId: string; destinationNodeId: string }[], { code: string; message: string }> => {
  if (clipboard.sources.length === 0 || destinations.length === 0) {
    return { ok: false, error: { code: "EMPTY_MAPPING", message: "Paste requires at least one source and one destination." } };
  }
  if (mapping.mode === "one-to-many") {
    return { ok: true, value: destinations.map((destination) => ({ sourceNodeId: clipboard.sources[0].sourceNodeId, destinationNodeId: destination.nodeId })) };
  }
  if (mapping.mode === "scope-order") {
    if (clipboard.sources.length !== destinations.length) {
      return { ok: false, error: { code: "AMBIGUOUS_MAPPING", message: "Multi-source paste requires matching source and destination counts or explicit pairs." } };
    }
    return {
      ok: true,
      value: destinations.map((destination, index) => ({ sourceNodeId: clipboard.sources[index].sourceNodeId, destinationNodeId: destination.nodeId }))
    };
  }
  const pairs = mapping.pairs ?? [];
  if (pairs.length === 0) {
    return { ok: false, error: { code: "AMBIGUOUS_MAPPING", message: "Explicit mapping requires source-to-destination pairs." } };
  }
  return { ok: true, value: [...pairs] };
};

const makePastedTrack = (
  source: MotionClipboardManualTrack,
  destination: NormalizedManualTrack,
  pasteMode: PasteMode,
  shiftMs: number,
  staggered?: StaggeredItem
): Result<{ track: NormalizedManualTrack; writeModel: ManualTrackWriteModel }, { message: string }> => {
  if (pasteMode === "preserve-timing") {
    return mapTiming(source, destination, shiftMs, staggered);
  }
  if (pasteMode === "preserve-easing") {
    return mapEasing(source, destination);
  }
  const keyframes = source.keyframes.map((keyframe, index) => ({
    keyframeId: destination.keyframes[index]?.keyframeId,
    ordinal: index,
    timeMs: mapPastedKeyframeTime(keyframe.timeMs ?? destination.keyframes[index].timeMs, shiftMs, staggered),
    value: stableClone(keyframe.value ?? destination.keyframes[index].value),
    easing: stableClone(keyframe.easing ?? destination.keyframes[index].easing) as NormalizedEasing,
    valueClassification: keyframe.valueClassification
  }));
  if (keyframes.some((keyframe) => keyframe.value === undefined)) {
    return { ok: false, error: { message: "Complete paste requires source values or deterministic destination fallback values." } };
  }
  return writeResult(destination, keyframes);
};

const mapTiming = (
  source: MotionClipboardManualTrack,
  destination: NormalizedManualTrack,
  shiftMs: number,
  staggered?: StaggeredItem
): Result<{ track: NormalizedManualTrack; writeModel: ManualTrackWriteModel }, { message: string }> => {
  if (source.keyframes.length !== destination.keyframes.length) {
    return { ok: false, error: { message: "Timing-only paste requires matching keyframe counts." } };
  }
  return writeResult(destination, destination.keyframes.map((keyframe, index) => ({
      ...keyframe,
      timeMs: mapPastedKeyframeTime(source.keyframes[index].timeMs ?? keyframe.timeMs, shiftMs, staggered)
  })));
};

const mapPastedKeyframeTime = (
  sourceTimeMs: TimeMs,
  shiftMs: number,
  staggered?: StaggeredItem
): TimeMs => {
  if (staggered === undefined) {
    return (sourceTimeMs + shiftMs) as TimeMs;
  }
  const sourceDuration = Math.max(0, staggered.originalEndMs - staggered.originalStartMs);
  const targetDuration = Math.max(0, staggered.endMs - staggered.startMs);
  if (sourceDuration === 0) {
    return staggered.startMs;
  }
  return (staggered.startMs + Math.round(((sourceTimeMs - staggered.originalStartMs) * targetDuration) / sourceDuration)) as TimeMs;
};

const mapEasing = (
  source: MotionClipboardManualTrack,
  destination: NormalizedManualTrack
): Result<{ track: NormalizedManualTrack; writeModel: ManualTrackWriteModel }, { message: string }> => {
  if (source.keyframes.length !== destination.keyframes.length) {
    return { ok: false, error: { message: "Easing-only paste requires matching keyframe counts." } };
  }
  return writeResult(destination, destination.keyframes.map((keyframe, index) => ({
    ...keyframe,
    easing: stableClone(source.keyframes[index].easing ?? keyframe.easing) as NormalizedEasing
  })));
};

const writeResult = (
  destination: NormalizedManualTrack,
  keyframes: NormalizedManualTrack["keyframes"]
): Result<{ track: NormalizedManualTrack; writeModel: ManualTrackWriteModel }, { message: string }> => {
  const normalized: NormalizedManualTrack = { ...destination, keyframes };
  const transformed = transformManualTrack(normalized, { kind: "empty" });
  if (!transformed.ok) {
    return { ok: false, error: { message: transformed.error.message } };
  }
  return { ok: true, value: { track: normalized, writeModel: transformed.value.writeModel } };
};

const skip = (
  nodeId: string,
  target: string,
  code: ChangePlanSkip["code"],
  message: string
): ChangePlanSkip => ({ nodeId, source: "manual", target, code, message });

const appendCompatibilityWarnings = (warnings: ChangePlanWarning[], item: PasteCompatibilityItem) => {
  if (item.status === "supported") {
    return;
  }
  warnings.push({
    nodeId: item.destinationNodeId,
    code: item.status === "partial" ? "PARTIAL_COMPATIBILITY" : "UNKNOWN_CAPABILITY",
    path: `manualTracks.${item.property}`,
    message: item.explanation
  });
};
