import { createFigmaMotionAdapter } from "./adapter";
import {
  addDifference,
  addMatch,
  createAccumulator,
  finalizeReport,
  type ComparisonAccumulator,
  type MotionVerificationReport
} from "./diff";
import { err, type MotionAdapterError } from "./errors";
import { assertNeverExpectation, type MotionWriteExpectation } from "./expectations";
import {
  beginMotionLogOperation,
  emitMotionLogEvent,
  metadataForError,
  metadataForVerificationReport,
  severityForVerificationStatus,
  type MotionLogOptions
} from "./log";
import {
  easingsSafelyComparable,
  keyframesSemanticallyEqual,
  manualTrackSemanticKey,
  styleApplicationSemanticKey,
  valuesSemanticallyEqual
} from "./semantic-equality";
import type { MotionAdapter, MotionCapabilitySet, MotionSnapshot, NormalizedManualTrack, Result } from "./types";

export interface VerifyMotionWriteOptions {
  adapter?: Pick<MotionAdapter, "readMotionSnapshot">;
  actualSnapshot?: MotionSnapshot;
  logOptions?: MotionLogOptions;
}

export const verifyMotionWrite = async (
  expectation: MotionWriteExpectation,
  options: VerifyMotionWriteOptions = {}
): Promise<Result<MotionVerificationReport, MotionAdapterError>> => {
  const operation = beginMotionLogOperation(options.logOptions);
  const actualResult = options.actualSnapshot
    ? ({ ok: true, value: options.actualSnapshot } as const)
    : await (options.adapter ?? createFigmaMotionAdapter()).readMotionSnapshot(expectation.nodeId);

  if (!actualResult.ok) {
    const error: MotionAdapterError = {
      code: "REREAD_FAILED",
      message: `Verification re-read failed: ${actualResult.error.message}`,
      nodeId: expectation.nodeId,
      causeMessage: actualResult.error.message
    };
    emitMotionLogEvent(options.logOptions?.logger, {
      name: "motion.verification.completed",
      severity: "error",
      timestamp: operation.timestampNow(),
      operationId: operation.operationId,
      requestId: operation.requestId,
      nodeId: expectation.nodeId,
      operationKind: expectation.operation,
      elapsedMs: operation.elapsedMs(),
      metadata: metadataForError(error, "verification-read")
    });
    return err(error);
  }

  const actual = actualResult.value;
  const accumulator = createAccumulator();
  compareCapabilityChecks(expectation, actual, accumulator);

  switch (expectation.operation) {
    case "timeline-duration-update":
      compareTimelineDuration(expectation.timelineId, expectation.expectedDurationMs, actual, accumulator);
      break;
    case "manual-track-replacement":
      compareManualTrack(expectation.expectedTrack, actual, accumulator);
      comparePreservedManualTracks(expectation.preserveManualTracks ?? [], actual, accumulator);
      break;
    case "animation-style-remove-reapply":
      compareStyle(expectation.expectedStyle, actual, accumulator);
      comparePreservedStyles(expectation.preserveStyleInstances ?? [], actual, accumulator);
      break;
    case "component-property-boolean-write":
      compareComponentProperty(expectation, actual, accumulator);
      break;
    case "component-property-motion-track-write":
      addDifference(accumulator, {
        code: "UNSUPPORTED_OPERATION",
        path: `componentProperties.${expectation.propertyKey}.motionTracks`,
        category: "operation",
        expected: "supported component-property Motion-track write",
        actual: "unsupported by accepted CP09 production scope",
        severity: "unverifiable",
        message: "Component-property Motion-track writes are not a verified production operation."
      });
      break;
    default:
      assertNeverExpectation(expectation);
  }

  const report = finalizeReport(expectation, actual, accumulator);
  emitMotionLogEvent(options.logOptions?.logger, {
    name: "motion.verification.completed",
    severity: severityForVerificationStatus(report.status),
    timestamp: operation.timestampNow(),
    operationId: operation.operationId,
    requestId: operation.requestId,
    nodeId: expectation.nodeId,
    operationKind: expectation.operation,
    elapsedMs: operation.elapsedMs(),
    metadata: metadataForVerificationReport(report)
  });
  return { ok: true, value: report };
};

const compareCapabilityChecks = (
  expectation: MotionWriteExpectation,
  actual: MotionSnapshot,
  accumulator: ComparisonAccumulator
): void => {
  const operationCapability = capabilityForOperation(expectation.operation);
  const checks = [{ capability: operationCapability }, ...(expectation.capabilityChecks ?? [])];
  for (const check of checks) {
    if (!(check.capability in actual.capabilities)) {
      addDifference(accumulator, {
        code: "CAPABILITY_UNSUPPORTED_AFTER_WRITE",
        path: `capabilities.${check.capability}`,
        category: "capability",
        expected: "supported capability",
        actual: undefined,
        severity: "unverifiable",
        message: "Fresh snapshot did not expose the capability needed to verify the write."
      });
      continue;
    }
    const actualCapability = actual.capabilities[check.capability as keyof MotionCapabilitySet];
    if (actualCapability.status === "unsupported" || actualCapability.status === "read-only") {
      addDifference(accumulator, {
        code: "CAPABILITY_UNSUPPORTED_AFTER_WRITE",
        path: `capabilities.${check.capability}`,
        category: "capability",
        expected: "supported or supported-with-warning",
        actual: actualCapability,
        severity: "error",
        message: "Fresh snapshot classifies the operation capability as unsupported or read-only."
      });
      continue;
    }
    if (check.before && check.before.status !== actualCapability.status) {
      addDifference(accumulator, {
        code: "CAPABILITY_CHANGED_AFTER_WRITE",
        path: `capabilities.${check.capability}`,
        category: "capability",
        expected: check.before,
        actual: actualCapability,
        severity: "warning",
        message: "Fresh snapshot capability changed after the write."
      });
      continue;
    }
    addMatch(accumulator);
  }
};

const capabilityForOperation = (operation: MotionWriteExpectation["operation"]): keyof MotionCapabilitySet => {
  switch (operation) {
    case "timeline-duration-update":
      return "timelineDurationWrites";
    case "manual-track-replacement":
      return "manualTrackReplacement";
    case "animation-style-remove-reapply":
      return "styleRemoveReapply";
    case "component-property-boolean-write":
      return "componentPropertyWrites";
    case "component-property-motion-track-write":
      return "componentPropertyMotionTrackReads";
    default:
      return assertNeverExpectation({ operation } as never);
  }
};

const compareTimelineDuration = (
  timelineId: string,
  expectedDurationMs: number,
  actual: MotionSnapshot,
  accumulator: ComparisonAccumulator
): void => {
  const timeline = actual.timelines.find((item) => item.timelineId === timelineId);
  if (!timeline) {
    addDifference(accumulator, {
      code: "TIMELINE_MISSING",
      path: `timelines.${timelineId}`,
      category: "timeline",
      expected: expectedDurationMs,
      actual: undefined,
      severity: "error",
      message: "Expected timeline was missing after re-read."
    });
    return;
  }
  if (timeline.durationMs !== expectedDurationMs) {
    addDifference(accumulator, {
      code: "TIMELINE_DURATION_MISMATCH",
      path: `timelines.${timelineId}.durationMs`,
      category: "timeline",
      expected: expectedDurationMs,
      actual: timeline.durationMs,
      severity: "error",
      message: "Timeline duration did not match expected normalized milliseconds."
    });
    return;
  }
  addMatch(accumulator);
};

const compareManualTrack = (
  expected: NormalizedManualTrack,
  actual: MotionSnapshot,
  accumulator: ComparisonAccumulator
): void => {
  const candidates = actual.manualTracks.filter((track) => track.property === expected.property);
  if (candidates.length === 0) {
    addDifference(accumulator, {
      code: "MANUAL_TRACK_MISSING",
      path: `manualTracks.${expected.property}`,
      category: "manual-track",
      expected: expected.property,
      actual: undefined,
      severity: "error",
      message: "Expected manual track was missing after re-read."
    });
    return;
  }
  if (candidates.length > 1) {
    addDifference(accumulator, {
      code: "MANUAL_TRACK_DUPLICATE",
      path: `manualTracks.${expected.property}`,
      category: "manual-track",
      expected: 1,
      actual: candidates.length,
      severity: "error",
      message: "Fresh snapshot contains duplicate property tracks for the expected manual track."
    });
  }

  const candidate = candidates.find((track) => manualTrackSemanticKey(track) === manualTrackSemanticKey(expected)) ?? candidates[0];
  if (expected.trackId && candidate.trackId && expected.trackId !== candidate.trackId) {
    accumulator.warnings.push({
      code: "OBSERVATIONAL_FIELD_CHANGED",
      path: `manualTracks.${expected.property}.trackId`,
      message: "Manual track ID changed, but semantic track content matched.",
      detail: `${expected.trackId} -> ${candidate.trackId}`
    });
  }
  if (candidate.propertyClassification !== expected.propertyClassification) {
    addDifference(accumulator, {
      code: "MANUAL_TRACK_MISSING",
      path: `manualTracks.${expected.property}.propertyClassification`,
      category: "manual-track",
      expected: expected.propertyClassification,
      actual: candidate.propertyClassification,
      severity: "error",
      message: "Manual track property classification changed after re-read."
    });
  } else {
    addMatch(accumulator);
  }
  compareKeyframes(expected, candidate, accumulator);
};

const compareKeyframes = (
  expected: NormalizedManualTrack,
  actual: NormalizedManualTrack,
  accumulator: ComparisonAccumulator
): void => {
  if (expected.keyframes.length !== actual.keyframes.length) {
    addDifference(accumulator, {
      code: "MANUAL_KEYFRAME_COUNT_MISMATCH",
      path: `manualTracks.${expected.property}.keyframes`,
      category: "manual-track",
      expected: expected.keyframes.length,
      actual: actual.keyframes.length,
      severity: "error",
      message: "Manual track keyframe count changed after re-read."
    });
  } else {
    addMatch(accumulator);
  }

  const count = Math.min(expected.keyframes.length, actual.keyframes.length);
  for (let index = 0; index < count; index += 1) {
    const expectedKeyframe = expected.keyframes[index];
    const actualKeyframe = actual.keyframes[index];
    const path = `manualTracks.${expected.property}.keyframes.${String(index)}`;
    if (expectedKeyframe.keyframeId && actualKeyframe.keyframeId && expectedKeyframe.keyframeId !== actualKeyframe.keyframeId) {
      accumulator.warnings.push({
        code: "KEYFRAME_ID_DRIFT",
        path: `${path}.keyframeId`,
        message: "Keyframe ID changed, but IDs are observational for semantic verification.",
        detail: `${expectedKeyframe.keyframeId} -> ${actualKeyframe.keyframeId}`
      });
    }
    if (expectedKeyframe.timeMs !== actualKeyframe.timeMs) {
      addDifference(accumulator, {
        code: "MANUAL_KEYFRAME_TIME_MISMATCH",
        path: `${path}.timeMs`,
        category: "manual-track",
        expected: expectedKeyframe.timeMs,
        actual: actualKeyframe.timeMs,
        severity: "error",
        message: "Manual keyframe time differed after normalization."
      });
      continue;
    }
    addMatch(accumulator);
    if (!valuesSemanticallyEqual(expectedKeyframe.value, actualKeyframe.value)) {
      addDifference(accumulator, {
        code: "MANUAL_KEYFRAME_VALUE_MISMATCH",
        path: `${path}.value`,
        category: "manual-track",
        expected: expectedKeyframe.value,
        actual: actualKeyframe.value,
        severity: "error",
        message: "Manual keyframe value differed after normalization."
      });
    } else {
      addMatch(accumulator);
    }
    if (!easingsSafelyComparable(expectedKeyframe.easing, actualKeyframe.easing)) {
      addDifference(accumulator, {
        code: "UNCOMPARABLE_EASING",
        path: `${path}.easing`,
        category: "manual-track",
        expected: expectedKeyframe.easing,
        actual: actualKeyframe.easing,
        severity: "unverifiable",
        message: "Unknown easing shapes were not safely comparable."
      });
    } else if (!keyframesSemanticallyEqual(expectedKeyframe, actualKeyframe)) {
      addDifference(accumulator, {
        code: "MANUAL_KEYFRAME_EASING_MISMATCH",
        path: `${path}.easing`,
        category: "manual-track",
        expected: expectedKeyframe.easing,
        actual: actualKeyframe.easing,
        severity: "error",
        message: "Manual keyframe easing differed semantically."
      });
    } else {
      if (expectedKeyframe.easing.kind === "unknown") {
        accumulator.warnings.push({
          code: "UNKNOWN_EASING_EQUIVALENT",
          path: `${path}.easing`,
          message: "Unknown easing matched only by preserved normalized raw representation."
        });
      }
      addMatch(accumulator);
    }
  }
};

const comparePreservedManualTracks = (
  expectedTracks: NormalizedManualTrack[],
  actual: MotionSnapshot,
  accumulator: ComparisonAccumulator
): void => {
  for (const expected of expectedTracks) {
    const found = actual.manualTracks.some((track) => manualTrackSemanticKey(track) === manualTrackSemanticKey(expected));
    if (found) {
      addMatch(accumulator);
      continue;
    }
    addDifference(accumulator, {
      code: "MANUAL_TRACK_UNEXPECTED_LOSS",
      path: `manualTracks.${expected.property}`,
      category: "manual-track",
      expected: expected.property,
      actual: actual.manualTracks.map((track) => track.property),
      severity: "error",
      message: "Unrelated manual track expected to remain was missing or changed."
    });
  }
};

const compareStyle = (
  expected: { availableAnimationStyleId?: string; appliedStyleInstanceId?: string; name?: string },
  actual: MotionSnapshot,
  accumulator: ComparisonAccumulator
): void => {
  const matches = actual.styleInstances.filter((style) => style.availableAnimationStyleId === expected.availableAnimationStyleId);
  if (matches.length === 0) {
    addDifference(accumulator, {
      code: actual.styleInstances.length > 0 ? "STYLE_APPLICATION_WRONG" : "STYLE_APPLICATION_MISSING",
      path: `styleInstances.${expected.availableAnimationStyleId ?? "unknown"}`,
      category: "style-instance",
      expected,
      actual: actual.styleInstances,
      severity: "error",
      message: "Expected animation style application was missing after re-read."
    });
    return;
  }
  if (matches.length > 1) {
    addDifference(accumulator, {
      code: "STYLE_APPLICATION_DUPLICATE",
      path: `styleInstances.${expected.availableAnimationStyleId ?? "unknown"}`,
      category: "style-instance",
      expected: 1,
      actual: matches.length,
      severity: "error",
      message: "Fresh snapshot contains duplicate applications of the same animation style."
    });
    return;
  }
  const actualStyle = matches[0];
  if (expected.appliedStyleInstanceId && actualStyle.appliedStyleInstanceId && expected.appliedStyleInstanceId !== actualStyle.appliedStyleInstanceId) {
    accumulator.warnings.push({
      code: "STYLE_INSTANCE_ID_DRIFT",
      path: `styleInstances.${expected.availableAnimationStyleId ?? "unknown"}.appliedStyleInstanceId`,
      message: "Applied style-instance ID changed; remove/reapply may legitimately allocate a new ID.",
      detail: `${expected.appliedStyleInstanceId} -> ${actualStyle.appliedStyleInstanceId}`
    });
  }
  if (styleApplicationSemanticKey(actualStyle) !== styleApplicationSemanticKey(expected)) {
    addDifference(accumulator, {
      code: "STYLE_APPLICATION_WRONG",
      path: `styleInstances.${expected.availableAnimationStyleId ?? "unknown"}`,
      category: "style-instance",
      expected,
      actual: actualStyle,
      severity: "error",
      message: "Animation style semantic application did not match expected fields."
    });
    return;
  }
  addMatch(accumulator);
};

const comparePreservedStyles = (
  expectedStyles: { availableAnimationStyleId?: string; appliedStyleInstanceId?: string; name?: string }[],
  actual: MotionSnapshot,
  accumulator: ComparisonAccumulator
): void => {
  for (const expected of expectedStyles) {
    const found = actual.styleInstances.some((style) => styleApplicationSemanticKey(style) === styleApplicationSemanticKey(expected));
    if (found) {
      addMatch(accumulator);
      continue;
    }
    addDifference(accumulator, {
      code: "STYLE_UNRELATED_LOSS",
      path: `styleInstances.${expected.availableAnimationStyleId ?? "unknown"}`,
      category: "style-instance",
      expected,
      actual: actual.styleInstances,
      severity: "error",
      message: "Unrelated style instance expected to remain was missing or changed."
    });
  }
};

const compareComponentProperty = (
  expectation: Extract<MotionWriteExpectation, { operation: "component-property-boolean-write" }>,
  actual: MotionSnapshot,
  accumulator: ComparisonAccumulator
): void => {
  const state = actual.componentProperties.currentState.find((item) => item.propertyKey === expectation.propertyKey);
  if (!state) {
    addDifference(accumulator, {
      code: "COMPONENT_PROPERTY_MISSING",
      path: `componentProperties.${expectation.propertyKey}`,
      category: "component-property",
      expected: expectation.expectedValue,
      actual: undefined,
      severity: "error",
      message: "Expected component property state was missing after re-read."
    });
    return;
  }
  if (state.type !== "BOOLEAN") {
    addDifference(accumulator, {
      code: "COMPONENT_PROPERTY_DEFINITION_INCOMPATIBLE",
      path: `componentProperties.${expectation.propertyKey}.type`,
      category: "component-property",
      expected: "BOOLEAN",
      actual: state.type,
      severity: "error",
      message: "Component property type is not compatible with CP09 BOOLEAN write verification."
    });
  } else {
    addMatch(accumulator);
  }
  if (!valuesSemanticallyEqual(state.value, expectation.expectedValue)) {
    addDifference(accumulator, {
      code: "COMPONENT_PROPERTY_VALUE_MISMATCH",
      path: `componentProperties.${expectation.propertyKey}.value`,
      category: "component-property",
      expected: expectation.expectedValue,
      actual: state.value,
      severity: "error",
      message: "Component property value did not match requested BOOLEAN state."
    });
  } else {
    accumulator.warnings.push({
      code: "COMPONENT_PROPERTY_UNDO_PARTIAL",
      path: `componentProperties.${expectation.propertyKey}`,
      message: "CP09 value write is supported, but plugin-triggered Undo restoration is partial/unreliable."
    });
    addMatch(accumulator);
  }
  if (expectation.expectedDefinition) {
    const definition = actual.componentProperties.definitions.find((item) => item.propertyKey === expectation.propertyKey);
    const compatible =
      definition &&
      (expectation.expectedDefinition.type === undefined || definition.type === expectation.expectedDefinition.type) &&
      (expectation.expectedDefinition.stableIdentifier === undefined ||
        definition.stableIdentifier === expectation.expectedDefinition.stableIdentifier) &&
      (expectation.expectedDefinition.displayName === undefined || definition.displayName === expectation.expectedDefinition.displayName);
    if (!compatible) {
      addDifference(accumulator, {
        code: "COMPONENT_PROPERTY_DEFINITION_INCOMPATIBLE",
        path: `componentProperties.${expectation.propertyKey}.definition`,
        category: "component-property",
        expected: expectation.expectedDefinition,
        actual: definition,
        severity: "error",
        message: "Component property definition changed or became incompatible after write."
      });
    } else {
      addMatch(accumulator);
    }
  }
};
