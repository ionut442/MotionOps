import type { MotionAdapterWarning, MotionSnapshot } from "./types";
import type { MotionWriteExpectation, VerifiedOperationKind } from "./expectations";

export type MotionDifferenceCode =
  | "TIMELINE_MISSING"
  | "TIMELINE_DURATION_MISMATCH"
  | "MANUAL_TRACK_MISSING"
  | "MANUAL_TRACK_DUPLICATE"
  | "MANUAL_KEYFRAME_COUNT_MISMATCH"
  | "MANUAL_KEYFRAME_TIME_MISMATCH"
  | "MANUAL_KEYFRAME_VALUE_MISMATCH"
  | "MANUAL_KEYFRAME_EASING_MISMATCH"
  | "MANUAL_TRACK_UNEXPECTED_LOSS"
  | "STYLE_APPLICATION_MISSING"
  | "STYLE_APPLICATION_DUPLICATE"
  | "STYLE_APPLICATION_WRONG"
  | "STYLE_UNRELATED_LOSS"
  | "COMPONENT_PROPERTY_MISSING"
  | "COMPONENT_PROPERTY_DEFINITION_INCOMPATIBLE"
  | "COMPONENT_PROPERTY_VALUE_MISMATCH"
  | "CAPABILITY_UNSUPPORTED_AFTER_WRITE"
  | "CAPABILITY_CHANGED_AFTER_WRITE"
  | "UNSUPPORTED_OPERATION"
  | "UNCOMPARABLE_EASING";

export type MotionDifferenceCategory =
  | "timeline"
  | "manual-track"
  | "style-instance"
  | "component-property"
  | "capability"
  | "operation";

export type MotionDifferenceSeverity = "info" | "warning" | "error" | "unverifiable";

export interface MotionDifference {
  code: MotionDifferenceCode;
  path: string;
  category: MotionDifferenceCategory;
  expected: unknown;
  actual: unknown;
  severity: MotionDifferenceSeverity;
  message: string;
}

export type MotionVerificationWarningCode =
  | "KEYFRAME_ID_DRIFT"
  | "STYLE_INSTANCE_ID_DRIFT"
  | "COMPONENT_PROPERTY_UNDO_PARTIAL"
  | "UNKNOWN_EASING_EQUIVALENT"
  | "OBSERVATIONAL_FIELD_CHANGED";

export interface MotionVerificationWarning {
  code: MotionVerificationWarningCode;
  path: string;
  message: string;
  detail?: string;
}

export type MotionVerificationStatus = "verified" | "verified-with-warning" | "partial" | "mismatch" | "unverifiable";

export interface MotionVerificationReport {
  status: MotionVerificationStatus;
  operation: VerifiedOperationKind;
  nodeId: string;
  differences: MotionDifference[];
  warnings: MotionVerificationWarning[];
  adapterWarnings: MotionAdapterWarning[];
  actualSnapshot: MotionSnapshot;
}

export interface ComparisonAccumulator {
  differences: MotionDifference[];
  warnings: MotionVerificationWarning[];
  matchedChecks: number;
  checkedFields: number;
}

export const createAccumulator = (): ComparisonAccumulator => ({
  differences: [],
  warnings: [],
  matchedChecks: 0,
  checkedFields: 0
});

export const addDifference = (accumulator: ComparisonAccumulator, difference: MotionDifference): void => {
  accumulator.checkedFields += 1;
  accumulator.differences.push(difference);
};

export const addMatch = (accumulator: ComparisonAccumulator): void => {
  accumulator.checkedFields += 1;
  accumulator.matchedChecks += 1;
};

export const finalizeReport = (
  expectation: MotionWriteExpectation,
  actualSnapshot: MotionSnapshot,
  accumulator: ComparisonAccumulator
): MotionVerificationReport => {
  const differences = accumulator.differences.sort(compareDifferences);
  const warnings = accumulator.warnings.sort(compareWarnings);
  const hasError = differences.some((difference) => difference.severity === "error");
  const hasUnverifiable = differences.some((difference) => difference.severity === "unverifiable");
  const status: MotionVerificationStatus = hasUnverifiable
    ? hasError || accumulator.matchedChecks > 0
      ? "partial"
      : "unverifiable"
    : hasError
      ? accumulator.matchedChecks > 0
        ? "partial"
        : "mismatch"
      : warnings.length > 0
        ? "verified-with-warning"
        : "verified";

  return {
    status,
    operation: expectation.operation,
    nodeId: expectation.nodeId,
    differences,
    warnings,
    adapterWarnings: actualSnapshot.warnings,
    actualSnapshot
  };
};

const compareDifferences = (left: MotionDifference, right: MotionDifference): number =>
  left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);

const compareWarnings = (left: MotionVerificationWarning, right: MotionVerificationWarning): number =>
  left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);
