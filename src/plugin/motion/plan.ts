import { createMotionStateGuard, type MotionGuardTarget, type MotionStateGuard } from "./stale-detection";
import { motionStateFingerprint } from "./fingerprint";
import { stableClone } from "./object";
import {
  transformManualTrack,
  validateMotionOperation,
  type MotionOperation,
  type OperationError,
  type OperationWarning
} from "./operations";
import type {
  ManualTrackWriteModel,
  MotionCapability,
  MotionSnapshot,
  NormalizedManualTrack,
  NormalizedStyleInstance,
  Result
} from "./types";
import type { MotionWriteExpectation } from "./expectations";

export type ChangePlanMutation =
  | ManualTrackChangeMutation
  | StyleChangeMutation
  | TimelineChangeMutation;

interface ChangeMutationBase {
  id: string;
  nodeId: string;
  source: "manual" | "style" | "timeline";
  guard: MotionStateGuard;
  expectation: MotionWriteExpectation;
  warnings: OperationWarning[];
}

export interface ManualTrackChangeMutation extends ChangeMutationBase {
  source: "manual";
  property: string;
  before: NormalizedManualTrack;
  after: NormalizedManualTrack;
  writeModel: ManualTrackWriteModel;
}

export interface StyleChangeMutation extends ChangeMutationBase {
  source: "style";
  availableAnimationStyleId: string;
  before: NormalizedStyleInstance;
  after: NormalizedStyleInstance;
  writerInput: {
    appliedStyleInstanceId: string;
    availableAnimationStyleId: string;
  };
}

export interface TimelineChangeMutation extends ChangeMutationBase {
  source: "timeline";
  timelineId: string;
  beforeDurationMs: number;
  afterDurationMs: number;
}

export interface ChangePlanSkip {
  nodeId: string;
  source: "manual" | "style" | "timeline" | "target" | "operation";
  target: string;
  code:
    | "EMPTY_OPERATION"
    | "NO_TARGETS"
    | "UNSUPPORTED_CAPABILITY"
    | "UNKNOWN_CAPABILITY"
    | "READ_ONLY_STYLE_FIELD"
    | "INVALID_OPERATION"
    | "TRANSFORM_FAILED"
    | "MISSING_WRITER_METADATA"
    | "STYLE_MANUAL_CONFLICT";
  message: string;
  detail?: string;
}

export interface ChangePlanWarning {
  nodeId?: string;
  code:
    | "PARTIAL_COMPATIBILITY"
    | "UNKNOWN_CAPABILITY"
    | "STYLE_FIELD_READ_ONLY"
    | "TIMELINE_EXTENSION_REQUIRED"
    | "STYLE_MANUAL_CONFLICT"
    | "IDENTITY_OPERATION"
    | "SPRING_EDIT_UNVERIFIED"
    | "ZERO_DURATION_RANGE"
    | "SEQUENCER_DRAFT_WARNING";
  path: string;
  message: string;
  detail?: string;
}

export interface ChangePlanExpectedSummary {
  affectedTargets: number;
  manualMutations: number;
  styleMutations: number;
  timelineMutations: number;
  skippedTargets: number;
  expectedResults: string[];
  beforeAfterExamples: { label: string; before: string; after: string }[];
}

export interface ChangePlan {
  version: 1;
  planId: string;
  baseSnapshotId: string;
  operation: MotionOperation;
  createdAtMs: number;
  mutations: ChangePlanMutation[];
  skipped: ChangePlanSkip[];
  warnings: ChangePlanWarning[];
  expected: ChangePlanExpectedSummary;
}

export interface PlanMotionOperationOptions {
  baseSnapshot: MotionSnapshot;
  operation: MotionOperation;
  idGenerator: () => string;
  nowMs?: () => number;
  targetIds?: string[];
}

const supportedCapability = (capability: MotionCapability): boolean =>
  capability.status === "supported" || capability.status === "supported-with-warning";

export const planMotionOperation = ({
  baseSnapshot,
  operation,
  idGenerator,
  nowMs = () => 0,
  targetIds
}: PlanMotionOperationOptions): Result<ChangePlan, OperationError> => {
  const validation = validateMotionOperation(operation);
  if (!validation.ok) {
    return validation;
  }

  const planId = idGenerator();
  const baseSnapshotId = snapshotPlanId(baseSnapshot);
  const selected = selectTargets(baseSnapshot, targetIds);
  const mutations: ChangePlanMutation[] = [];
  const skipped: ChangePlanSkip[] = [];
  const warnings: ChangePlanWarning[] = [];

  if (selected.manualTracks.length + selected.styleInstances.length + selected.timelines.length === 0) {
    skipped.push({
      nodeId: baseSnapshot.nodeId,
      source: "target",
      target: baseSnapshot.nodeId,
      code: targetIds && targetIds.length > 0 ? "NO_TARGETS" : "EMPTY_OPERATION",
      message: "No compatible Motion targets were selected for planning."
    });
  }

  if (operation.kind === "empty") {
    skipped.push({
      nodeId: baseSnapshot.nodeId,
      source: "operation",
      target: baseSnapshot.nodeId,
      code: "EMPTY_OPERATION",
      message: "Empty operation was represented explicitly and produced no mutations."
    });
  } else {
    if (operation.kind === "sequencer-draft") {
      warnings.push(
        ...operation.warnings.map((warning) => ({
          code: "SEQUENCER_DRAFT_WARNING" as const,
          path: warning.itemId ?? "sequencer",
          message: warning.message
        }))
      );
    }
    for (const track of selected.manualTracks) {
      const capabilitySkip = skipForCapability(baseSnapshot.nodeId, "manual", `manualTracks.${track.property}`, track.write);
      if (capabilitySkip) {
        skipped.push(capabilitySkip);
        if (capabilitySkip.code === "UNKNOWN_CAPABILITY") {
          warnings.push({
            nodeId: baseSnapshot.nodeId,
            code: "UNKNOWN_CAPABILITY",
            path: capabilitySkip.target,
            message: capabilitySkip.message
          });
        }
        continue;
      }
      const result = transformManualTrack(track, operation, baseSnapshot.timelines);
      if (!result.ok) {
        skipped.push({
          nodeId: baseSnapshot.nodeId,
          source: "manual",
          target: `manualTracks.${track.property}`,
          code: "TRANSFORM_FAILED",
          message: result.error.message,
          detail: result.error.path
        });
        continue;
      }
      const guard = guardFor(baseSnapshot, {
        operation: "manual-track-replacement",
        property: track.property,
        preserveUnrelatedManualTracks: true,
        createdFromSnapshotId: baseSnapshotId
      });
      if (!guard.ok) {
        skipped.push({
          nodeId: baseSnapshot.nodeId,
          source: "manual",
          target: `manualTracks.${track.property}`,
          code: "TRANSFORM_FAILED",
          message: guard.error.message
        });
        continue;
      }
      const mutation: ManualTrackChangeMutation = {
        id: `${planId}:manual:${String(mutations.length)}`,
        nodeId: baseSnapshot.nodeId,
        source: "manual",
        property: track.property,
        before: stableClone(track) as NormalizedManualTrack,
        after: result.value.track,
        writeModel: result.value.writeModel,
        guard: guard.value,
        expectation: {
          operation: "manual-track-replacement",
          nodeId: baseSnapshot.nodeId,
          expectedTrack: result.value.track,
          preserveManualTracks: baseSnapshot.manualTracks.filter((item) => item.property !== track.property)
        },
        warnings: result.value.warnings
      };
      mutations.push(mutation);
      warnings.push(...result.value.warnings.map((warning) => ({ ...warning, nodeId: baseSnapshot.nodeId })));
    }

    for (const style of selected.styleInstances) {
      const styleSkip = planStyleSkip(baseSnapshot.nodeId, operation, style, baseSnapshot.capabilities.styleRemoveReapply);
      if (styleSkip) {
        skipped.push(styleSkip);
        warnings.push({
          nodeId: baseSnapshot.nodeId,
          code: styleSkip.code === "UNKNOWN_CAPABILITY" ? "UNKNOWN_CAPABILITY" : "STYLE_FIELD_READ_ONLY",
          path: styleSkip.target,
          message: styleSkip.message,
          detail: styleSkip.detail
        });
      }
    }

    for (const conflict of detectManualStyleConflicts(baseSnapshot)) {
      skipped.push(conflict);
      warnings.push({
        nodeId: conflict.nodeId,
        code: "STYLE_MANUAL_CONFLICT",
        path: conflict.target,
        message: conflict.message
      });
    }

    if (operation.kind === "sequencer-draft") {
      for (const timelineChange of operation.timelineDurations) {
        const timeline = selected.timelines.find((item) => item.timelineId === timelineChange.timelineId);
        if (timeline === undefined) {
          skipped.push({
            nodeId: baseSnapshot.nodeId,
            source: "timeline",
            target: `timelines.${timelineChange.timelineId}`,
            code: "NO_TARGETS",
            message: "Sequencer timeline change did not match a selected timeline."
          });
          continue;
        }
        const capability = baseSnapshot.capabilities.timelineDurationWrites;
        const capabilitySkip = skipForCapability(baseSnapshot.nodeId, "timeline", `timelines.${timeline.timelineId}`, capability);
        if (capabilitySkip) {
          skipped.push(capabilitySkip);
          continue;
        }
        if (timeline.durationMs === timelineChange.durationMs) {
          warnings.push({
            nodeId: baseSnapshot.nodeId,
            code: "IDENTITY_OPERATION",
            path: `timelines.${timeline.timelineId}.durationMs`,
            message: "Sequencer timeline duration is unchanged."
          });
          continue;
        }
        const guard = guardFor(baseSnapshot, {
          operation: "timeline-duration-update",
          timelineId: timeline.timelineId,
          createdFromSnapshotId: baseSnapshotId
        });
        if (!guard.ok) {
          skipped.push({
            nodeId: baseSnapshot.nodeId,
            source: "timeline",
            target: `timelines.${timeline.timelineId}`,
            code: "TRANSFORM_FAILED",
            message: guard.error.message
          });
          continue;
        }
        mutations.push({
          id: `${planId}:timeline:${String(mutations.length)}`,
          nodeId: baseSnapshot.nodeId,
          source: "timeline",
          timelineId: timeline.timelineId,
          beforeDurationMs: timeline.durationMs,
          afterDurationMs: timelineChange.durationMs,
          guard: guard.value,
          expectation: {
            operation: "timeline-duration-update",
            nodeId: baseSnapshot.nodeId,
            timelineId: timeline.timelineId,
            expectedDurationMs: timelineChange.durationMs
          },
          warnings: []
        });
      }
    }
  }

  const expected = expectedSummary(mutations, skipped, warnings);
  return {
    ok: true,
    value: {
      version: 1,
      planId,
      baseSnapshotId,
      operation: stableClone(operation) as MotionOperation,
      createdAtMs: nowMs(),
      mutations,
      skipped,
      warnings,
      expected
    }
  };
};

export const snapshotPlanId = (snapshot: MotionSnapshot): string =>
  motionStateFingerprint({
    nodeId: snapshot.nodeId,
    nodeType: snapshot.nodeType,
    sources: snapshot.sources,
    manualTracks: snapshot.manualTracks,
    styleInstances: snapshot.styleInstances,
    timelines: snapshot.timelines,
    componentProperties: snapshot.componentProperties,
    capabilities: snapshot.capabilities
  });

const selectTargets = (snapshot: MotionSnapshot, targetIds: string[] | undefined) => {
  const selected = new Set(targetIds ?? []);
  const all = selected.size === 0;
  return {
    manualTracks: snapshot.manualTracks.filter((track) => all || selected.has(track.trackId ?? track.property) || selected.has(track.property)),
    styleInstances: snapshot.styleInstances.filter(
      (style) =>
        all ||
        (style.availableAnimationStyleId !== undefined && selected.has(style.availableAnimationStyleId)) ||
        (style.appliedStyleInstanceId !== undefined && selected.has(style.appliedStyleInstanceId))
    ),
    timelines: snapshot.timelines.filter((timeline) => all || selected.has(timeline.timelineId))
  };
};

const skipForCapability = (
  nodeId: string,
  source: ChangePlanSkip["source"],
  target: string,
  capability: MotionCapability
): ChangePlanSkip | null => {
  if (supportedCapability(capability)) {
    return null;
  }
  return {
    nodeId,
    source,
    target,
    code: capability.status === "unknown" ? "UNKNOWN_CAPABILITY" : "UNSUPPORTED_CAPABILITY",
    message: capability.reason
  };
};

const planStyleSkip = (
  nodeId: string,
  operation: MotionOperation,
  style: NormalizedStyleInstance,
  capability: MotionCapability
): ChangePlanSkip | null => {
  if (capability.status === "unknown") {
    return {
      nodeId,
      source: "style",
      target: `styleInstances.${style.availableAnimationStyleId ?? style.appliedStyleInstanceId ?? "unknown"}`,
      code: "UNKNOWN_CAPABILITY",
      message: capability.reason
    };
  }
  return {
    nodeId,
    source: "style",
    target: `styleInstances.${style.availableAnimationStyleId ?? style.appliedStyleInstanceId ?? "unknown"}`,
    code: operation.kind === "spring" ? "UNSUPPORTED_CAPABILITY" : "READ_ONLY_STYLE_FIELD",
    message:
      operation.kind === "spring"
        ? "Spring editing remains unavailable until verified by capability evidence."
        : "No verified production writer exists for direct style timing or easing field edits.",
    detail: capability.reason
  };
};

const detectManualStyleConflicts = (snapshot: MotionSnapshot): ChangePlanSkip[] => {
  const styleNames = new Set(snapshot.styleInstances.flatMap((style) => (style.name ? [style.name.toUpperCase()] : [])));
  return snapshot.manualTracks
    .filter((track) => styleNames.has(track.property.toUpperCase()))
    .map((track) => ({
      nodeId: snapshot.nodeId,
      source: "target",
      target: `manualTracks.${track.property}`,
      code: "STYLE_MANUAL_CONFLICT",
      message: "Node has manual and style Motion for the same property label; sources remain planned separately."
    }));
};

const guardFor = (snapshot: MotionSnapshot, target: MotionGuardTarget): Result<MotionStateGuard, OperationError> => {
  const result = createMotionStateGuard(snapshot, target);
  return result.ok
    ? result
    : {
        ok: false,
        error: {
          code: result.error.code === "INVALID_INPUT" ? "INVALID_OPERATION" : "UNSUPPORTED_OPERATION",
          message: result.error.message,
          path: result.error.path
        }
      };
};

const expectedSummary = (
  mutations: ChangePlanMutation[],
  skipped: ChangePlanSkip[],
  warnings: ChangePlanWarning[]
): ChangePlanExpectedSummary => {
  const manual = mutations.filter((mutation) => mutation.source === "manual");
  const styleCount = mutations.filter((mutation) => mutation.source === "style").length;
  const timelineCount = mutations.filter((mutation) => mutation.source === "timeline").length;
  const examples = manual.slice(0, 3).map((mutation) => ({
    label: mutation.property,
    before: mutation.before.keyframes.map((keyframe) => String(keyframe.timeMs)).join(", "),
    after: mutation.after.keyframes.map((keyframe) => String(keyframe.timeMs)).join(", ")
  }));
  return {
    affectedTargets: new Set(mutations.map((mutation) => mutation.nodeId)).size,
    manualMutations: manual.length,
    styleMutations: styleCount,
    timelineMutations: timelineCount,
    skippedTargets: skipped.length,
    expectedResults: [
      `${String(manual.length)} manual replacement mutation(s)`,
      `${String(styleCount)} style mutation(s)`,
      `${String(timelineCount)} timeline mutation(s)`,
      `${String(warnings.length)} warning(s)`
    ],
    beforeAfterExamples: examples
  };
};
