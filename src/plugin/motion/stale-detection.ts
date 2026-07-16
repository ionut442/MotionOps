import { createFigmaMotionAdapter } from "./adapter";
import { motionStateFingerprint } from "./fingerprint";
import { err, type MotionAdapterError } from "./errors";
import {
  beginMotionLogOperation,
  emitMotionLogEvent,
  metadataForError,
  metadataForStaleCheckResult,
  severityForStaleStatus,
  type MotionLogOptions
} from "./log";
import {
  easingsSafelyComparable,
  styleApplicationSemanticKey,
  valuesSemanticallyEqual
} from "./semantic-equality";
import type {
  ComponentPropertyDefinition,
  ComponentPropertyState,
  MotionAdapter,
  MotionCapability,
  MotionSnapshot,
  NormalizedManualTrack,
  NormalizedStyleInstance,
  Result
} from "./types";

export type GuardedOperationKind =
  | "manual-track-replacement"
  | "animation-style-remove-reapply"
  | "direct-animation-style-reapply"
  | "timeline-duration-update"
  | "component-property-boolean-write";

export type MotionStateProjection =
  | ManualTrackGuardProjection
  | AnimationStyleGuardProjection
  | TimelineDurationGuardProjection
  | ComponentPropertyBooleanGuardProjection;

export interface MotionStateGuard {
  nodeId: string;
  operation: GuardedOperationKind;
  projection: MotionStateProjection;
  fingerprint: string;
  createdFromSnapshotId?: string;
}

export type MotionGuardTarget =
  | {
      operation: "manual-track-replacement";
      property: string;
      preserveUnrelatedManualTracks?: boolean;
      createdFromSnapshotId?: string;
    }
  | {
      operation: "animation-style-remove-reapply" | "direct-animation-style-reapply";
      availableAnimationStyleId: string;
      preserveUnrelatedStyleInstances?: boolean;
      createdFromSnapshotId?: string;
    }
  | {
      operation: "timeline-duration-update";
      timelineId: string;
      createdFromSnapshotId?: string;
    }
  | {
      operation: "component-property-boolean-write";
      propertyKey: string;
      createdFromSnapshotId?: string;
    }
  | {
      operation: "component-property-motion-track-write";
      propertyKey: string;
      createdFromSnapshotId?: string;
    };

interface GuardProjectionBase {
  kind: GuardedOperationKind;
  nodeId: string;
  nodeType: string;
  capability: MotionCapability;
}

export interface ManualTrackGuardProjection extends GuardProjectionBase {
  kind: "manual-track-replacement";
  property: string;
  propertyClassification: string;
  targetTrack: ManualTrackSemantics | null;
  duplicateSemanticTrackCount: number;
  preservedTracks?: ManualTrackSemantics[];
  executionIds: {
    trackId?: string;
    keyframeIds: string[];
  };
}

export interface AnimationStyleGuardProjection extends GuardProjectionBase {
  kind: "animation-style-remove-reapply" | "direct-animation-style-reapply";
  availableAnimationStyleId: string;
  targetApplication: StyleApplicationSemantics | null;
  applicationCount: number;
  preservedApplications?: StyleApplicationSemantics[];
  executionIds: {
    appliedStyleInstanceId?: string;
  };
}

export interface TimelineDurationGuardProjection extends GuardProjectionBase {
  kind: "timeline-duration-update";
  timelineId: string;
  durationMs: number | null;
}

export interface ComponentPropertyBooleanGuardProjection extends GuardProjectionBase {
  kind: "component-property-boolean-write";
  propertyKey: string;
  definition: Pick<ComponentPropertyDefinition, "propertyKey" | "stableIdentifier" | "displayName" | "type"> | null;
  currentState: ComponentPropertyState | null;
  cp09WarningCodes: string[];
}

export interface ManualTrackSemantics {
  property: string;
  propertyClassification: string;
  keyframes: {
    ordinal: number;
    timeMs: number;
    value: unknown;
    easing: unknown;
    valueClassification: string;
  }[];
}

export interface StyleApplicationSemantics {
  availableAnimationStyleId?: string;
  name?: string;
}

export type MotionStaleDifferenceCode =
  | "TRACK_REMOVED"
  | "TRACK_ADDED"
  | "KEYFRAME_COUNT_CHANGED"
  | "KEYFRAME_TIME_CHANGED"
  | "KEYFRAME_VALUE_CHANGED"
  | "EASING_CHANGED"
  | "STYLE_APPLICATION_REMOVED"
  | "STYLE_CONFIGURATION_CHANGED"
  | "STYLE_DUPLICATED"
  | "TIMELINE_DURATION_CHANGED"
  | "COMPONENT_PROPERTY_REMOVED"
  | "COMPONENT_PROPERTY_VALUE_CHANGED"
  | "COMPONENT_PROPERTY_TYPE_CHANGED"
  | "CAPABILITY_CHANGED"
  | "OPERATION_TARGET_UNVERIFIABLE";

export type MotionStaleDifferenceSeverity = "warning" | "error" | "unverifiable";

export interface MotionStateDifference {
  code: MotionStaleDifferenceCode;
  path: string;
  expected: unknown;
  current: unknown;
  severity: MotionStaleDifferenceSeverity;
  message: string;
}

export type MotionStaleWarningCode = "KEYFRAME_ID_DRIFT" | "STYLE_INSTANCE_ID_DRIFT" | "SNAPSHOT_ID_IGNORED";

export interface MotionStaleWarning {
  code: MotionStaleWarningCode;
  path: string;
  message: string;
  detail?: string;
}

export type MotionStaleCheckResult =
  | {
      status: "current";
      guard: MotionStateGuard;
      currentFingerprint: string;
      currentSnapshot: MotionSnapshot;
      warnings: MotionStaleWarning[];
    }
  | {
      status: "stale";
      guard: MotionStateGuard;
      currentFingerprint: string;
      currentSnapshot: MotionSnapshot;
      differences: MotionStateDifference[];
      warnings: MotionStaleWarning[];
    }
  | {
      status: "unverifiable";
      guard: MotionStateGuard;
      warnings: MotionStaleWarning[];
      differences: MotionStateDifference[];
      currentFingerprint?: string;
      currentSnapshot?: MotionSnapshot;
    };

export interface CheckMotionStateGuardOptions {
  adapter?: Pick<MotionAdapter, "readMotionSnapshot">;
  logOptions?: MotionLogOptions;
}

export const createMotionStateGuard = (
  snapshot: MotionSnapshot,
  target: MotionGuardTarget
): Result<MotionStateGuard, MotionAdapterError> => {
  if (target.operation === "component-property-motion-track-write") {
    return err({
      code: "WRITE_UNSUPPORTED",
      message: "Component-property Motion-track writes are outside the accepted CP09 BOOLEAN guard scope.",
      nodeId: snapshot.nodeId,
      path: target.propertyKey
    });
  }

  const projection = buildProjection(snapshot, target);
  if (projection === null) {
    return err({
      code: "INVALID_INPUT",
      message: "Guard target was missing from the normalized Motion snapshot.",
      nodeId: snapshot.nodeId,
      path: targetPath(target)
    });
  }

  return {
    ok: true,
    value: {
      nodeId: snapshot.nodeId,
      operation: target.operation,
      projection,
      fingerprint: fingerprintProjection(projection),
      createdFromSnapshotId: target.createdFromSnapshotId
    }
  };
};

export const checkMotionStateGuard = async (
  guard: MotionStateGuard,
  options: CheckMotionStateGuardOptions = {}
): Promise<Result<MotionStaleCheckResult, MotionAdapterError>> => {
  const operation = beginMotionLogOperation(options.logOptions);
  const adapter = options.adapter ?? createFigmaMotionAdapter();
  const currentResult = await adapter.readMotionSnapshot(guard.nodeId);
  if (!currentResult.ok) {
    const error: MotionAdapterError = {
      ...currentResult.error,
      code: "REREAD_FAILED",
      message: `Stale-data guard re-read failed: ${currentResult.error.message}`,
      causeMessage: currentResult.error.message
    };
    emitMotionLogEvent(options.logOptions?.logger, {
      name: "motion.stale_check.completed",
      severity: "error",
      timestamp: operation.timestampNow(),
      operationId: operation.operationId,
      requestId: operation.requestId,
      nodeId: guard.nodeId,
      operationKind: guard.operation,
      elapsedMs: operation.elapsedMs(),
      metadata: metadataForError(error, "stale-check-read")
    });
    return err(error);
  }

  const currentSnapshot = currentResult.value;
  const target = targetFromGuard(guard);
  const currentProjection = buildProjection(currentSnapshot, target);
  if (currentProjection === null) {
    const missing = missingTargetDifference(guard.projection, target);
    const currentFingerprint = motionStateFingerprint({ missing: targetPath(target), nodeId: currentSnapshot.nodeId });
    const result: MotionStaleCheckResult = {
      status: "stale",
      guard,
      currentFingerprint,
      warnings: snapshotIdWarning(guard),
      differences: [missing],
      currentSnapshot
    };
    emitStaleCheckCompleted(result, options.logOptions, operation);
    return {
      ok: true,
      value: result
    };
  }

  const currentFingerprint = fingerprintProjection(currentProjection);
  const warnings = snapshotIdWarning(guard);
  warnings.push(...observationalWarnings(guard.projection, currentProjection));
  if (currentFingerprint === guard.fingerprint) {
    const result: MotionStaleCheckResult = { status: "current", guard, currentFingerprint, currentSnapshot, warnings };
    emitStaleCheckCompleted(result, options.logOptions, operation);
    return { ok: true, value: result };
  }

  const differences = compareProjections(guard.projection, currentProjection);
  if (differences.some((difference) => difference.severity === "unverifiable")) {
    const result: MotionStaleCheckResult = { status: "unverifiable", guard, currentFingerprint, currentSnapshot, warnings, differences };
    emitStaleCheckCompleted(result, options.logOptions, operation);
    return { ok: true, value: result };
  }
  const result: MotionStaleCheckResult = { status: "stale", guard, currentFingerprint, currentSnapshot, warnings, differences };
  emitStaleCheckCompleted(result, options.logOptions, operation);
  return { ok: true, value: result };
};

export const assertMotionStateCurrent = async (
  guard: MotionStateGuard,
  options: CheckMotionStateGuardOptions = {}
): Promise<Result<Extract<MotionStaleCheckResult, { status: "current" }>, MotionAdapterError>> => {
  const result = await checkMotionStateGuard(guard, options);
  if (!result.ok) {
    return result;
  }
  if (result.value.status !== "current") {
    return err({
      code: "VERIFICATION_MISMATCH",
      message: `Motion state guard is ${result.value.status}; write must be blocked until the operation is rebuilt.`,
      nodeId: guard.nodeId
    });
  }
  return { ok: true, value: result.value };
};

const buildProjection = (snapshot: MotionSnapshot, target: MotionGuardTarget): MotionStateProjection | null => {
  switch (target.operation) {
    case "manual-track-replacement":
      return manualTrackProjection(snapshot, target);
    case "animation-style-remove-reapply":
    case "direct-animation-style-reapply":
      return animationStyleProjection(snapshot, target);
    case "timeline-duration-update":
      return timelineProjection(snapshot, target);
    case "component-property-boolean-write":
      return componentPropertyProjection(snapshot, target);
    case "component-property-motion-track-write":
      return null;
    default:
      return assertNeverTarget(target);
  }
};

const fingerprintProjection = (projection: MotionStateProjection): string => motionStateFingerprint(projectionForFingerprint(projection));

const projectionForFingerprint = (projection: MotionStateProjection): unknown => {
  switch (projection.kind) {
    case "manual-track-replacement":
      return {
        kind: projection.kind,
        nodeId: projection.nodeId,
        nodeType: projection.nodeType,
        capability: projection.capability,
        property: projection.property,
        propertyClassification: projection.propertyClassification,
        targetTrack: projection.targetTrack,
        duplicateSemanticTrackCount: projection.duplicateSemanticTrackCount,
        preservedTracks: projection.preservedTracks
      };
    case "animation-style-remove-reapply":
    case "direct-animation-style-reapply":
      return {
        kind: projection.kind,
        nodeId: projection.nodeId,
        nodeType: projection.nodeType,
        capability: projection.capability,
        availableAnimationStyleId: projection.availableAnimationStyleId,
        targetApplication: projection.targetApplication,
        applicationCount: projection.applicationCount,
        preservedApplications: projection.preservedApplications
      };
    case "timeline-duration-update":
    case "component-property-boolean-write":
      return projection;
    default:
      return assertNeverProjection(projection);
  }
};

const manualTrackProjection = (
  snapshot: MotionSnapshot,
  target: Extract<MotionGuardTarget, { operation: "manual-track-replacement" }>
): ManualTrackGuardProjection | null => {
  const tracks = snapshot.manualTracks.filter((track) => track.property === target.property);
  if (tracks.length === 0) {
    return null;
  }
  const targetTrack = tracks[0];
  return {
    kind: target.operation,
    nodeId: snapshot.nodeId,
    nodeType: snapshot.nodeType,
    capability: snapshot.capabilities.manualTrackReplacement,
    property: target.property,
    propertyClassification: targetTrack.propertyClassification,
    targetTrack: manualSemantics(targetTrack),
    duplicateSemanticTrackCount: tracks.length,
    preservedTracks: target.preserveUnrelatedManualTracks
      ? snapshot.manualTracks.filter((track) => track.property !== target.property).map(manualSemantics)
      : undefined,
    executionIds: {
      trackId: targetTrack.trackId,
      keyframeIds: targetTrack.keyframes.flatMap((keyframe) => (keyframe.keyframeId ? [keyframe.keyframeId] : []))
    }
  };
};

const animationStyleProjection = (
  snapshot: MotionSnapshot,
  target: Extract<MotionGuardTarget, { operation: "animation-style-remove-reapply" | "direct-animation-style-reapply" }>
): AnimationStyleGuardProjection | null => {
  const styles = snapshot.styleInstances.filter((style) => style.availableAnimationStyleId === target.availableAnimationStyleId);
  if (styles.length === 0) {
    return null;
  }
  const style = styles[0];
  const capability =
    target.operation === "direct-animation-style-reapply" ? snapshot.capabilities.directStyleReapply : snapshot.capabilities.styleRemoveReapply;
  return {
    kind: target.operation,
    nodeId: snapshot.nodeId,
    nodeType: snapshot.nodeType,
    capability,
    availableAnimationStyleId: target.availableAnimationStyleId,
    targetApplication: styleSemantics(style),
    applicationCount: styles.length,
    preservedApplications: target.preserveUnrelatedStyleInstances
      ? snapshot.styleInstances.filter((item) => item.availableAnimationStyleId !== target.availableAnimationStyleId).map(styleSemantics)
      : undefined,
    executionIds: {
      appliedStyleInstanceId: style.appliedStyleInstanceId
    }
  };
};

const timelineProjection = (
  snapshot: MotionSnapshot,
  target: Extract<MotionGuardTarget, { operation: "timeline-duration-update" }>
): TimelineDurationGuardProjection | null => {
  const timeline = snapshot.timelines.find((item) => item.timelineId === target.timelineId);
  if (!timeline) {
    return null;
  }
  return {
    kind: target.operation,
    nodeId: snapshot.nodeId,
    nodeType: snapshot.nodeType,
    capability: snapshot.capabilities.timelineDurationWrites,
    timelineId: target.timelineId,
    durationMs: timeline.durationMs
  };
};

const componentPropertyProjection = (
  snapshot: MotionSnapshot,
  target: Extract<MotionGuardTarget, { operation: "component-property-boolean-write" }>
): ComponentPropertyBooleanGuardProjection | null => {
  const currentState = snapshot.componentProperties.currentState.find((state) => state.propertyKey === target.propertyKey);
  if (!currentState) {
    return null;
  }
  const definition = snapshot.componentProperties.definitions.find((item) => item.propertyKey === target.propertyKey);
  return {
    kind: target.operation,
    nodeId: snapshot.nodeId,
    nodeType: snapshot.nodeType,
    capability: snapshot.capabilities.componentPropertyWrites,
    propertyKey: target.propertyKey,
    definition: definition
      ? {
          propertyKey: definition.propertyKey,
          stableIdentifier: definition.stableIdentifier,
          displayName: definition.displayName,
          type: definition.type
        }
      : null,
    currentState,
    cp09WarningCodes: snapshot.componentProperties.warnings.map((warning) => warning.code).sort()
  };
};

const compareProjections = (baseline: MotionStateProjection, current: MotionStateProjection): MotionStateDifference[] => {
  if (baseline.kind !== current.kind) {
    return [difference("OPERATION_TARGET_UNVERIFIABLE", "operation", baseline.kind, current.kind, "unverifiable", "Guard operation kind changed.")];
  }

  const differences = [
    ...compareCapability(baseline.capability, current.capability),
    ...compareSpecificProjection(baseline, current)
  ];
  return differences.sort(compareDifferences);
};

const compareSpecificProjection = (baseline: MotionStateProjection, current: MotionStateProjection): MotionStateDifference[] => {
  switch (baseline.kind) {
    case "manual-track-replacement":
      return compareManualProjection(baseline, current as ManualTrackGuardProjection);
    case "animation-style-remove-reapply":
    case "direct-animation-style-reapply":
      return compareStyleProjection(baseline, current as AnimationStyleGuardProjection);
    case "timeline-duration-update":
      return compareTimelineProjection(baseline, current as TimelineDurationGuardProjection);
    case "component-property-boolean-write":
      return compareComponentPropertyProjection(baseline, current as ComponentPropertyBooleanGuardProjection);
    default:
      return assertNeverProjection(baseline);
  }
};

const compareCapability = (baseline: MotionCapability, current: MotionCapability): MotionStateDifference[] =>
  baseline.status === current.status
    ? []
    : [
        difference(
          "CAPABILITY_CHANGED",
          "capability.status",
          baseline,
          current,
          current.status === "unsupported" || current.status === "read-only" ? "error" : "warning",
          "Required Motion capability changed between preview and apply."
        )
      ];

const compareManualProjection = (
  baseline: ManualTrackGuardProjection,
  current: ManualTrackGuardProjection
): MotionStateDifference[] => {
  const differences: MotionStateDifference[] = [];
  if (current.duplicateSemanticTrackCount > baseline.duplicateSemanticTrackCount) {
    differences.push(difference("TRACK_ADDED", `manualTracks.${baseline.property}`, baseline.duplicateSemanticTrackCount, current.duplicateSemanticTrackCount, "error", "Duplicate semantic property track was introduced."));
  }
  if (current.duplicateSemanticTrackCount < baseline.duplicateSemanticTrackCount) {
    differences.push(difference("TRACK_REMOVED", `manualTracks.${baseline.property}`, baseline.duplicateSemanticTrackCount, current.duplicateSemanticTrackCount, "error", "Target semantic property track was removed."));
  }
  if (!baseline.targetTrack || !current.targetTrack) {
    differences.push(difference("TRACK_REMOVED", `manualTracks.${baseline.property}`, baseline.targetTrack, current.targetTrack, "error", "Target manual track is not comparable."));
    return differences;
  }
  differences.push(...compareManualTrackSemantics(baseline.targetTrack, current.targetTrack, `manualTracks.${baseline.property}`));
  for (const expected of baseline.preservedTracks ?? []) {
    const found = (current.preservedTracks ?? []).some((track) => manualSemanticKey(track) === manualSemanticKey(expected));
    if (!found) {
      differences.push(difference("TRACK_REMOVED", `manualTracks.${expected.property}`, expected, current.preservedTracks ?? [], "error", "Unrelated manual track changed while preservation was required."));
    }
  }
  return differences;
};

const compareManualTrackSemantics = (
  baseline: ManualTrackSemantics,
  current: ManualTrackSemantics,
  path: string
): MotionStateDifference[] => {
  const differences: MotionStateDifference[] = [];
  if (baseline.keyframes.length !== current.keyframes.length) {
    differences.push(difference("KEYFRAME_COUNT_CHANGED", `${path}.keyframes`, baseline.keyframes.length, current.keyframes.length, "error", "Manual keyframe count changed."));
  }
  const count = Math.min(baseline.keyframes.length, current.keyframes.length);
  for (let index = 0; index < count; index += 1) {
    const expected = baseline.keyframes[index];
    const actual = current.keyframes[index];
    const keyframePath = `${path}.keyframes.${String(index)}`;
    if (expected.timeMs !== actual.timeMs) {
      differences.push(difference("KEYFRAME_TIME_CHANGED", `${keyframePath}.timeMs`, expected.timeMs, actual.timeMs, "error", "Manual keyframe time changed."));
    }
    if (!valuesSemanticallyEqual(expected.value, actual.value)) {
      differences.push(difference("KEYFRAME_VALUE_CHANGED", `${keyframePath}.value`, expected.value, actual.value, "error", "Manual keyframe value changed."));
    }
    const expectedEasing = expected.easing as Parameters<typeof easingsSafelyComparable>[0];
    const actualEasing = actual.easing as Parameters<typeof easingsSafelyComparable>[1];
    if (!easingsSafelyComparable(expectedEasing, actualEasing)) {
      differences.push(difference("OPERATION_TARGET_UNVERIFIABLE", `${keyframePath}.easing`, expected.easing, actual.easing, "unverifiable", "Unknown relevant easing data changed and cannot be safely compared."));
    } else if (!valuesSemanticallyEqual(expected.easing, actual.easing)) {
      differences.push(difference("EASING_CHANGED", `${keyframePath}.easing`, expected.easing, actual.easing, "error", "Manual keyframe easing changed semantically."));
    }
  }
  return differences;
};

const compareStyleProjection = (
  baseline: AnimationStyleGuardProjection,
  current: AnimationStyleGuardProjection
): MotionStateDifference[] => {
  const differences: MotionStateDifference[] = [];
  if (current.applicationCount === 0) {
    differences.push(difference("STYLE_APPLICATION_REMOVED", `styleInstances.${baseline.availableAnimationStyleId}`, baseline.targetApplication, null, "error", "Animation style application was removed."));
  }
  if (current.applicationCount > baseline.applicationCount) {
    differences.push(difference("STYLE_DUPLICATED", `styleInstances.${baseline.availableAnimationStyleId}`, baseline.applicationCount, current.applicationCount, "error", "Duplicate animation style application was introduced."));
  }
  if (styleApplicationSemanticKey(baseline.targetApplication ?? {}) !== styleApplicationSemanticKey(current.targetApplication ?? {})) {
    differences.push(difference("STYLE_CONFIGURATION_CHANGED", `styleInstances.${baseline.availableAnimationStyleId}`, baseline.targetApplication, current.targetApplication, "error", "Animation style semantic configuration changed."));
  }
  for (const expected of baseline.preservedApplications ?? []) {
    const found = (current.preservedApplications ?? []).some((style) => styleApplicationSemanticKey(style) === styleApplicationSemanticKey(expected));
    if (!found) {
      differences.push(difference("STYLE_CONFIGURATION_CHANGED", `styleInstances.${expected.availableAnimationStyleId ?? "unknown"}`, expected, current.preservedApplications ?? [], "error", "Unrelated style application changed while preservation was required."));
    }
  }
  return differences;
};

const compareTimelineProjection = (
  baseline: TimelineDurationGuardProjection,
  current: TimelineDurationGuardProjection
): MotionStateDifference[] =>
  baseline.durationMs === current.durationMs
    ? []
    : [
        difference(
          "TIMELINE_DURATION_CHANGED",
          `timelines.${baseline.timelineId}.durationMs`,
          baseline.durationMs,
          current.durationMs,
          "error",
          "Timeline duration changed between preview and apply."
        )
      ];

const compareComponentPropertyProjection = (
  baseline: ComponentPropertyBooleanGuardProjection,
  current: ComponentPropertyBooleanGuardProjection
): MotionStateDifference[] => {
  const differences: MotionStateDifference[] = [];
  if (!current.currentState) {
    differences.push(difference("COMPONENT_PROPERTY_REMOVED", `componentProperties.${baseline.propertyKey}`, baseline.currentState, null, "error", "Component property was removed."));
    return differences;
  }
  if (baseline.currentState?.type !== current.currentState.type || baseline.definition?.type !== current.definition?.type) {
    differences.push(difference("COMPONENT_PROPERTY_TYPE_CHANGED", `componentProperties.${baseline.propertyKey}.type`, baseline.currentState?.type ?? baseline.definition?.type, current.currentState.type ?? current.definition?.type, "error", "Component property type changed."));
  }
  if (!valuesSemanticallyEqual(baseline.currentState?.value, current.currentState.value)) {
    differences.push(difference("COMPONENT_PROPERTY_VALUE_CHANGED", `componentProperties.${baseline.propertyKey}.value`, baseline.currentState?.value, current.currentState.value, "error", "Component property current value changed."));
  }
  return differences;
};

const manualSemantics = (track: NormalizedManualTrack): ManualTrackSemantics => ({
  property: track.property,
  propertyClassification: track.propertyClassification,
  keyframes: track.keyframes.map((keyframe) => ({
    ordinal: keyframe.ordinal,
    timeMs: keyframe.timeMs,
    value: keyframe.value,
    easing: keyframe.easing,
    valueClassification: keyframe.valueClassification
  }))
});

const styleSemantics = (style: NormalizedStyleInstance): StyleApplicationSemantics => ({
  availableAnimationStyleId: style.availableAnimationStyleId,
  name: style.name
});

const manualSemanticKey = (track: ManualTrackSemantics): string => motionStateFingerprint(track);

const targetFromGuard = (guard: MotionStateGuard): MotionGuardTarget => {
  switch (guard.projection.kind) {
    case "manual-track-replacement":
      return {
        operation: guard.projection.kind,
        property: guard.projection.property,
        preserveUnrelatedManualTracks: guard.projection.preservedTracks !== undefined
      };
    case "animation-style-remove-reapply":
    case "direct-animation-style-reapply":
      return {
        operation: guard.projection.kind,
        availableAnimationStyleId: guard.projection.availableAnimationStyleId,
        preserveUnrelatedStyleInstances: guard.projection.preservedApplications !== undefined
      };
    case "timeline-duration-update":
      return { operation: guard.projection.kind, timelineId: guard.projection.timelineId };
    case "component-property-boolean-write":
      return { operation: guard.projection.kind, propertyKey: guard.projection.propertyKey };
    default:
      return assertNeverProjection(guard.projection);
  }
};

const observationalWarnings = (baseline: MotionStateProjection, current: MotionStateProjection): MotionStaleWarning[] => {
  if (baseline.kind === "manual-track-replacement" && current.kind === "manual-track-replacement") {
    const warnings: MotionStaleWarning[] = [];
    if (baseline.executionIds.trackId && current.executionIds.trackId && baseline.executionIds.trackId !== current.executionIds.trackId) {
      warnings.push({
        code: "KEYFRAME_ID_DRIFT",
        path: `manualTracks.${baseline.property}.trackId`,
        message: "Manual track ID changed, but the guarded semantic projection matched.",
        detail: `${baseline.executionIds.trackId} -> ${current.executionIds.trackId}`
      });
    }
    if (baseline.executionIds.keyframeIds.join("|") !== current.executionIds.keyframeIds.join("|")) {
      warnings.push({
        code: "KEYFRAME_ID_DRIFT",
        path: `manualTracks.${baseline.property}.keyframes`,
        message: "Keyframe IDs changed; stale protection treats them as operational metadata, not semantic identity."
      });
    }
    return warnings;
  }
  if (
    (baseline.kind === "animation-style-remove-reapply" || baseline.kind === "direct-animation-style-reapply") &&
    (current.kind === "animation-style-remove-reapply" || current.kind === "direct-animation-style-reapply") &&
    baseline.executionIds.appliedStyleInstanceId &&
    current.executionIds.appliedStyleInstanceId &&
    baseline.executionIds.appliedStyleInstanceId !== current.executionIds.appliedStyleInstanceId
  ) {
    return [
      {
        code: "STYLE_INSTANCE_ID_DRIFT",
        path: `styleInstances.${baseline.availableAnimationStyleId}.appliedStyleInstanceId`,
        message: "Applied style-instance ID changed; stale protection uses semantic style identity.",
        detail: `${baseline.executionIds.appliedStyleInstanceId} -> ${current.executionIds.appliedStyleInstanceId}`
      }
    ];
  }
  return [];
};

const snapshotIdWarning = (guard: MotionStateGuard): MotionStaleWarning[] =>
  guard.createdFromSnapshotId
    ? [
        {
          code: "SNAPSHOT_ID_IGNORED",
          path: "createdFromSnapshotId",
          message: "Snapshot ID is recorded for diagnostics but semantic fingerprint comparison determines stale status.",
          detail: guard.createdFromSnapshotId
        }
      ]
    : [];

const difference = (
  code: MotionStaleDifferenceCode,
  path: string,
  expected: unknown,
  current: unknown,
  severity: MotionStaleDifferenceSeverity,
  message: string
): MotionStateDifference => ({ code, path, expected, current, severity, message });

const compareDifferences = (left: MotionStateDifference, right: MotionStateDifference): number =>
  left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);

const targetPath = (target: MotionGuardTarget): string => {
  switch (target.operation) {
    case "manual-track-replacement":
      return `manualTracks.${target.property}`;
    case "animation-style-remove-reapply":
    case "direct-animation-style-reapply":
      return `styleInstances.${target.availableAnimationStyleId}`;
    case "timeline-duration-update":
      return `timelines.${target.timelineId}`;
    case "component-property-boolean-write":
    case "component-property-motion-track-write":
      return `componentProperties.${target.propertyKey}`;
    default:
      return assertNeverTarget(target);
  }
};

const missingTargetDifference = (projection: MotionStateProjection, target: MotionGuardTarget): MotionStateDifference => {
  switch (projection.kind) {
    case "manual-track-replacement":
      return difference("TRACK_REMOVED", targetPath(target), projection.targetTrack, undefined, "error", "Target manual track was removed before apply.");
    case "animation-style-remove-reapply":
    case "direct-animation-style-reapply":
      return difference("STYLE_APPLICATION_REMOVED", targetPath(target), projection.targetApplication, undefined, "error", "Target animation style application was removed before apply.");
    case "timeline-duration-update":
      return difference("TIMELINE_DURATION_CHANGED", targetPath(target), projection.durationMs, undefined, "error", "Target timeline was removed before apply.");
    case "component-property-boolean-write":
      return difference("COMPONENT_PROPERTY_REMOVED", targetPath(target), projection.currentState, undefined, "error", "Target component property was removed before apply.");
    default:
      return assertNeverProjection(projection);
  }
};

const assertNeverTarget = (target: never): never => {
  throw new Error(`Unhandled Motion guard target: ${JSON.stringify(target)}`);
};

const assertNeverProjection = (projection: never): never => {
  throw new Error(`Unhandled Motion guard projection: ${JSON.stringify(projection)}`);
};

const emitStaleCheckCompleted = (
  result: MotionStaleCheckResult,
  logOptions: MotionLogOptions | undefined,
  operation: ReturnType<typeof beginMotionLogOperation>
): void => {
  emitMotionLogEvent(logOptions?.logger, {
    name: "motion.stale_check.completed",
    severity: severityForStaleStatus(result.status),
    timestamp: operation.timestampNow(),
    operationId: operation.operationId,
    requestId: operation.requestId,
    nodeId: result.guard.nodeId,
    operationKind: result.guard.operation,
    elapsedMs: operation.elapsedMs(),
    metadata: metadataForStaleCheckResult(result)
  });
};
