export { createFigmaMotionAdapter } from "./adapter";
export { readMotionSnapshot } from "./read";
export {
  removeAndReapplyStyle,
  replaceManualTrack,
  setComponentPropertyValue,
  setTimelineDuration
} from "./write";
export { classifyMotionCapabilities } from "./capabilities";
export { normalizeMotionSnapshot } from "./normalize";
export { easingSemanticKey, easingSemanticallyEqual, normalizeEasing } from "./easing";
export { canonicalMotionJson, manualTrackSemanticFingerprint, motionStateFingerprint } from "./fingerprint";
export { verifyMotionWrite } from "./verification";
export { executeChangePlan, createFigmaUndoTransaction } from "./execute";
export { parseCubicBezier, transformManualTrack, validateEasing, validateMotionOperation } from "./operations";
export { planMotionOperation, snapshotPlanId } from "./plan";
export { copyMotionToClipboard, serializeMotionClipboard } from "./clipboard";
export { analyzePasteCompatibility } from "./compatibility";
export { buildPasteChangePlan } from "./paste";
export { canonicalMotionPropertyId, motionPropertyRegistry, propertyCapabilityFor } from "./propertyRegistry";
export { manualTrackSemanticKey, styleApplicationSemanticKey, valuesSemanticallyEqual } from "./semantic-equality";
export { assertMotionStateCurrent, checkMotionStateGuard, createMotionStateGuard } from "./stale-detection";
export {
  DevelopmentConsoleMotionLogger,
  InMemoryMotionLogger,
  beginMotionLogOperation,
  createLocalMotionOperationId,
  emitMotionLogEvent,
  metadataForError,
  metadataForSnapshot,
  metadataForStaleCheckResult,
  metadataForVerificationReport,
  noopMotionLogger,
  sanitizeMotionLogMetadata
} from "./log";
export type { MotionAdapterError, MotionAdapterErrorCode } from "./errors";
export type {
  AnimationStyleRemoveReapplyExpectation,
  ComponentPropertyBooleanExpectation,
  ComponentPropertyMotionTrackExpectation,
  ManualTrackReplacementExpectation,
  MotionWriteExpectation,
  TimelineDurationExpectation,
  VerifiedOperationKind
} from "./expectations";
export type {
  MotionDifference,
  MotionDifferenceCategory,
  MotionDifferenceCode,
  MotionDifferenceSeverity,
  MotionVerificationReport,
  MotionVerificationStatus,
  MotionVerificationWarning
} from "./diff";
export type {
  ChangePlanExecutionResult,
  ChangePlanExecutionStatus,
  MutationExecutionResult,
  SanitizedExecutionError,
  UndoTransaction
} from "./execute";
export type {
  EasingValidationResult,
  ManualTrackTransformResult,
  MotionOperation,
  OperationError,
  OperationWarning
} from "./operations";
export type {
  MotionClipboard,
  MotionClipboardCopyMode,
  MotionClipboardCopyResult,
  MotionClipboardManualTrack,
  MotionClipboardSource
} from "./clipboard";
export type {
  PasteCompatibilityItem,
  PasteCompatibilityReason,
  PasteCompatibilityResult,
  PasteCompatibilityStatus
} from "./compatibility";
export type {
  BuildPastePlanOptions,
  PasteMapping,
  PasteMappingMode,
  PasteMode,
  PasteTimingOptions
} from "./paste";
export type { MotionPropertyCapability, MotionPropertyId } from "./propertyRegistry";
export type {
  ChangePlan,
  ChangePlanExpectedSummary,
  ChangePlanMutation,
  ChangePlanSkip,
  ChangePlanWarning,
  ManualTrackChangeMutation,
  PlanMotionOperationOptions,
  StyleChangeMutation,
  TimelineChangeMutation
} from "./plan";
export type {
  GuardedOperationKind,
  MotionGuardTarget,
  MotionStaleCheckResult,
  MotionStaleWarning,
  MotionStateDifference,
  MotionStateGuard,
  MotionStateProjection
} from "./stale-detection";
export type {
  CapabilityStatus,
  ManualTrackWriteModel,
  MotionAdapter,
  MotionAdapterWarning,
  MotionCapability,
  MotionCapabilitySet,
  MotionSceneNode,
  MotionSnapshot,
  NormalizedEasing,
  NormalizedKeyframe,
  NormalizedManualTrack,
  NormalizedStyleInstance,
  NormalizedTimeline,
  Result
} from "./types";
export type {
  MotionLogClock,
  MotionLogEvent,
  MotionLogEventName,
  MotionLogMetadata,
  MotionLogMetadataValue,
  MotionLogger,
  MotionLogOptions,
  MotionLogSeverity,
  MotionLoggedOperationKind,
  MotionOperationIdGenerator
} from "./log";
export {
  figmaSecondsToTimeMs,
  millisecondsToSeconds,
  secondsToMilliseconds,
  timeMsToFigmaSeconds
} from "./time";
