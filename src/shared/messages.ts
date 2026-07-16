import {
  isMotionDiagnosticRequest,
  isMotionDiagnosticResultMessage,
  isP006FixtureCommandMessage,
  isP006FixtureResultMessage,
  isP006RunAllMessage,
  isP006RunAllResultMessage,
  isP006RunTestMessage,
  isP006TestRunResultMessage,
  isP006TargetPipelineResultMessage,
  isP006VerifyTargetPipelineMessage,
  isP007FixtureCommandMessage,
  isP007FixtureResultMessage,
  isP007RunAllMessage,
  isP007RunCaseMessage,
  isP007RunResultMessage,
  isP007TargetPipelineResultMessage,
  isP007VerifyTargetPipelineMessage,
  isP008FixtureCommandMessage,
  isP008FixtureResultMessage,
  isP008RunAllMessage,
  isP008RunCaseMessage,
  isP008RunResultMessage,
  isP008TargetPipelineResultMessage,
  isP008VerifyTargetPipelineMessage,
  isP009FixtureCommandMessage,
  isP009FixtureResultMessage,
  isP009RunAllMessage,
  isP009RunCaseMessage,
  isP009RunResultMessage,
  isP009TargetPipelineResultMessage,
  isP009VerifyTargetPipelineMessage,
  isP010FixtureCommandMessage,
  isP010FixtureResultMessage,
  isP010RunActionMessage,
  isP010RunResultMessage,
  isP010TargetPipelineResultMessage,
  isP010VerifyTargetPipelineMessage,
  isP011FixtureCommandMessage,
  isP011FixtureResultMessage,
  isP011RunAllMessage,
  isP011RunCaseMessage,
  isP011RunResultMessage,
  isP011TargetPipelineResultMessage,
  isP011VerifyTargetPipelineMessage,
  isP012FixtureCommandMessage,
  isP012FixtureResultMessage,
  isP012RunAllMessage,
  isP012RunCaseMessage,
  isP012RunResultMessage,
  isP012TargetPipelineResultMessage,
  isP012VerifyTargetPipelineMessage,
  type MotionDiagnosticRequest,
  type MotionDiagnosticResultMessage,
  type P006FixtureCommandMessage,
  type P006FixtureResultMessage,
  type P006RunAllMessage,
  type P006RunAllResultMessage,
  type P006RunTestMessage,
  type P006TestRunResultMessage,
  type P006TargetPipelineResultMessage,
  type P006VerifyTargetPipelineMessage,
  type P007FixtureCommandMessage,
  type P007FixtureResultMessage,
  type P007RunAllMessage,
  type P007RunCaseMessage,
  type P007RunResultMessage,
  type P007TargetPipelineResultMessage,
  type P007VerifyTargetPipelineMessage,
  type P008FixtureCommandMessage,
  type P008FixtureResultMessage,
  type P008RunAllMessage,
  type P008RunCaseMessage,
  type P008RunResultMessage,
  type P008TargetPipelineResultMessage,
  type P008VerifyTargetPipelineMessage,
  type P009FixtureCommandMessage,
  type P009FixtureResultMessage,
  type P009RunAllMessage,
  type P009RunCaseMessage,
  type P009RunResultMessage,
  type P009TargetPipelineResultMessage,
  type P009VerifyTargetPipelineMessage,
  type P010FixtureCommandMessage,
  type P010FixtureResultMessage,
  type P010RunActionMessage,
  type P010RunResultMessage,
  type P010TargetPipelineResultMessage,
  type P010VerifyTargetPipelineMessage,
  type P011FixtureCommandMessage,
  type P011FixtureResultMessage,
  type P011RunAllMessage,
  type P011RunCaseMessage,
  type P011RunResultMessage,
  type P011TargetPipelineResultMessage,
  type P011VerifyTargetPipelineMessage,
  type P012FixtureCommandMessage,
  type P012FixtureResultMessage,
  type P012RunAllMessage,
  type P012RunCaseMessage,
  type P012RunResultMessage,
  type P012TargetPipelineResultMessage,
  type P012VerifyTargetPipelineMessage
} from "./diagnostics";
import { isResizePluginWindowRequest, type ResizePluginWindowRequest } from "./pluginWindow";
import { parseScopeDefinition, type ScopeDefinition } from "../domain/scope";
import { isScopeScanResult, type ScopeScanResult } from "../domain/scopeScan";
import type { ScopeScanProgress } from "../plugin/scopeScanner";
import type { MotionSnapshot, NormalizedEasing } from "../domain/motion";
import type { StaggerOperation } from "../domain/stagger";
import type { MotionStandards, StandardsSource } from "../domain/standards";
import type { StandardsStorageAction, StandardsStorageState } from "../plugin/standardsStorage";
import type { CancelableOperationKind } from "./cancellation";

export type RequestId = string;

export interface PluginReadyMessage {
  type: "PLUGIN_READY";
  pluginVersion: string;
  figmaMode: string;
  apiLabEnabled: boolean;
}

export interface PluginPongMessage {
  type: "PLUGIN_PONG";
  requestId: RequestId;
  receivedAtMs: number;
}

export interface PluginErrorMessage {
  type: "PLUGIN_ERROR";
  requestId?: RequestId;
  code: "INVALID_MESSAGE";
  message: string;
}

export interface ScopeScanRequestMessage {
  type: "SCOPE_SCAN_REQUEST";
  requestId: RequestId;
  scope: ScopeDefinition;
}

export interface ScopeScanCancelMessage {
  type: "SCOPE_SCAN_CANCEL";
  requestId: RequestId;
}

export interface MotionOperationCancelRequestMessage {
  type: "MOTION_OPERATION_CANCEL_REQUEST";
  requestId: RequestId;
  operation: Exclude<CancelableOperationKind, "scope-scan">;
}

export interface ScopeScanResultMessage {
  type: "SCOPE_SCAN_RESULT";
  requestId: RequestId;
  result: ScopeScanResult;
}

export interface ScopeScanProgressMessage {
  type: "SCOPE_SCAN_PROGRESS";
  requestId: RequestId;
  progress: ScopeScanProgress;
}

export interface ScopeSelectionChangedMessage {
  type: "SCOPE_SELECTION_CHANGED";
  selectionIds: readonly string[];
}

export interface ScopeRevealNodeRequestMessage {
  type: "SCOPE_REVEAL_NODE_REQUEST";
  requestId: RequestId;
  nodeId: string;
}

export interface ScopeRevealNodeResult {
  readonly ok: boolean;
  readonly nodeId: string;
  readonly status: "selected" | "missing" | "unsupported" | "error";
  readonly message: string;
}

export interface ScopeRevealNodeResultMessage {
  type: "SCOPE_REVEAL_NODE_RESULT";
  requestId: RequestId;
  result: ScopeRevealNodeResult;
}

export interface MotionInspectRequestMessage {
  type: "MOTION_INSPECT_REQUEST";
  requestId: RequestId;
  nodeIds: readonly string[];
}

export interface MotionInspectFailure {
  readonly nodeId: string;
  readonly code: string;
  readonly message: string;
}

export interface MotionInspectResult {
  readonly requestedNodeIds: readonly string[];
  readonly snapshots: readonly MotionSnapshot[];
  readonly failures: readonly MotionInspectFailure[];
}

export interface MotionInspectResultMessage {
  type: "MOTION_INSPECT_RESULT";
  requestId: RequestId;
  result: MotionInspectResult;
}

export type MotionEditOperation =
  | { kind: "set-duration"; durationMs: number; anchor: "preserve-start" | "preserve-end" }
  | { kind: "replace-easing"; easing: NormalizedEasing }
  | { kind: "set-delay"; mode: "add" | "remove" | "replace"; delayMs?: number }
  | { kind: "scale-timing"; numerator: number; denominator: number; origin: "start" }
  | {
      kind: "sequencer-draft";
      label: string;
      manualTracks: readonly {
        trackId?: string;
        property: string;
        keyframes: readonly {
          keyframeId?: string;
          timeMs: number;
          value: unknown;
          easing?: NormalizedEasing;
        }[];
      }[];
      timelineDurations: readonly { timelineId: string; durationMs: number }[];
      baseSnapshotId: string;
      warnings: readonly { code: string; itemId?: string; message: string }[];
    };

export type MotionClipboardCopyMode = "complete" | "timing-only" | "easing-only" | "selected-tracks";
export type PasteMode = "replace" | "merge-compatible" | "add-missing-only" | "preserve-timing" | "preserve-easing";
export type PasteMapping =
  | { mode: "one-to-many" }
  | { mode: "scope-order" }
  | { mode: "explicit"; pairs: readonly { sourceNodeId: string; destinationNodeId: string }[] };
export interface PasteTimingOptions {
  offsetMs?: number;
  intervalMs?: number;
  reverseOrder?: boolean;
  stagger?: StaggerOperation;
}
export interface MotionClipboard {
  version: 1;
  createdAtMs: number;
  mode: MotionClipboardCopyMode;
  sources: readonly {
    sourceNodeId: string;
    sourceNodeType: string;
    sourceKind: string;
    copyMode: MotionClipboardCopyMode;
    manualTracks: readonly unknown[];
    styleInstances: readonly unknown[];
    timingSummary: Record<string, unknown>;
    capabilities: Record<string, unknown>;
    warnings: readonly unknown[];
  }[];
}

export interface MotionPlanOperationRequestMessage {
  type: "MOTION_PLAN_OPERATION_REQUEST";
  requestId: RequestId;
  nodeId: string;
  targetIds: readonly string[];
  operation: MotionEditOperation;
}

export interface MotionPlanOperationResultMessage {
  type: "MOTION_PLAN_OPERATION_RESULT";
  requestId: RequestId;
  result:
    | { ok: true; plan: unknown }
    | { ok: false; error: { code: string; message: string; path?: string } };
}

export interface MotionApplyChangePlanRequestMessage {
  type: "MOTION_APPLY_CHANGE_PLAN_REQUEST";
  requestId: RequestId;
  plan: unknown;
}

export interface MotionApplyChangePlanResultMessage {
  type: "MOTION_APPLY_CHANGE_PLAN_RESULT";
  requestId: RequestId;
  result: unknown;
}

export interface MotionClipboardCopyRequestMessage {
  type: "MOTION_CLIPBOARD_COPY_REQUEST";
  requestId: RequestId;
  nodeIds: readonly string[];
  mode: MotionClipboardCopyMode;
  selectedTrackIds: readonly string[];
}

export interface MotionClipboardCopyResultMessage {
  type: "MOTION_CLIPBOARD_COPY_RESULT";
  requestId: RequestId;
  result:
    | { ok: true; clipboard: MotionClipboard; serialized: string }
    | { ok: false; error: { code: string; message: string } };
}

export interface MotionPastePlanRequestMessage {
  type: "MOTION_PASTE_PLAN_REQUEST";
  requestId: RequestId;
  clipboard: MotionClipboard;
  destinationNodeIds: readonly string[];
  pasteMode: PasteMode;
  mapping: PasteMapping;
  timing: PasteTimingOptions;
}

export interface MotionPastePlanResultMessage {
  type: "MOTION_PASTE_PLAN_RESULT";
  requestId: RequestId;
  result:
    | { ok: true; plan: unknown; compatibility: unknown }
    | { ok: false; error: { code: string; message: string } };
}

export interface StandardsStorageRequestMessage {
  type: "STANDARDS_STORAGE_REQUEST";
  requestId: RequestId;
  action: StandardsStorageAction;
}

export interface StandardsStorageResultMessage {
  type: "STANDARDS_STORAGE_RESULT";
  requestId: RequestId;
  result: StandardsStorageState;
}

export type PluginToUiMessage =
  | PluginReadyMessage
  | PluginPongMessage
  | MotionDiagnosticResultMessage
  | P006FixtureResultMessage
  | P006TestRunResultMessage
  | P006RunAllResultMessage
  | P006TargetPipelineResultMessage
  | P007FixtureResultMessage
  | P007RunResultMessage
  | P007TargetPipelineResultMessage
  | P008FixtureResultMessage
  | P008RunResultMessage
  | P008TargetPipelineResultMessage
  | P009FixtureResultMessage
  | P009RunResultMessage
  | P009TargetPipelineResultMessage
  | P010FixtureResultMessage
  | P010RunResultMessage
  | P010TargetPipelineResultMessage
  | P011FixtureResultMessage
  | P011RunResultMessage
  | P011TargetPipelineResultMessage
  | P012FixtureResultMessage
  | P012RunResultMessage
  | P012TargetPipelineResultMessage
  | ScopeScanResultMessage
  | ScopeScanProgressMessage
  | ScopeSelectionChangedMessage
  | ScopeRevealNodeResultMessage
  | MotionInspectResultMessage
  | MotionPlanOperationResultMessage
  | MotionApplyChangePlanResultMessage
  | MotionClipboardCopyResultMessage
  | MotionPastePlanResultMessage
  | StandardsStorageResultMessage
  | PluginErrorMessage;

export interface UiPingMessage {
  type: "UI_PING";
  requestId: RequestId;
  sentAtMs: number;
}

export type UiToPluginMessage =
  | UiPingMessage
  | ResizePluginWindowRequest
  | MotionDiagnosticRequest
  | P006FixtureCommandMessage
  | P006RunTestMessage
  | P006RunAllMessage
  | P006VerifyTargetPipelineMessage
  | P007FixtureCommandMessage
  | P007RunCaseMessage
  | P007RunAllMessage
  | P007VerifyTargetPipelineMessage
  | P008FixtureCommandMessage
  | P008RunCaseMessage
  | P008RunAllMessage
  | P008VerifyTargetPipelineMessage
  | P009FixtureCommandMessage
  | P009RunCaseMessage
  | P009RunAllMessage
  | P009VerifyTargetPipelineMessage
  | P010FixtureCommandMessage
  | P010RunActionMessage
  | P010VerifyTargetPipelineMessage
  | P011FixtureCommandMessage
  | P011RunCaseMessage
  | P011RunAllMessage
  | P011VerifyTargetPipelineMessage
  | P012FixtureCommandMessage
  | P012RunCaseMessage
  | P012RunAllMessage
  | P012VerifyTargetPipelineMessage
  | ScopeScanRequestMessage
  | ScopeScanCancelMessage
  | MotionOperationCancelRequestMessage
  | ScopeRevealNodeRequestMessage
  | MotionInspectRequestMessage
  | MotionPlanOperationRequestMessage
  | MotionApplyChangePlanRequestMessage
  | MotionClipboardCopyRequestMessage
  | MotionPastePlanRequestMessage
  | StandardsStorageRequestMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isScopeScanProgress = (value: unknown): value is ScopeScanProgress =>
  isRecord(value) &&
  isNonEmptyString(value.requestId) &&
  typeof value.visited === "number" &&
  Number.isInteger(value.visited) &&
  value.visited >= 0 &&
  (value.queued === undefined || (typeof value.queued === "number" && Number.isFinite(value.queued))) &&
  (value.total === undefined || (typeof value.total === "number" && Number.isFinite(value.total))) &&
  typeof value.indeterminate === "boolean";

const isScopeRevealNodeResult = (value: unknown): value is ScopeRevealNodeResult =>
  isRecord(value) &&
  typeof value.ok === "boolean" &&
  isNonEmptyString(value.nodeId) &&
  (value.status === "selected" ||
    value.status === "missing" ||
    value.status === "unsupported" ||
    value.status === "error") &&
  isNonEmptyString(value.message);

const isMotionInspectFailure = (value: unknown): value is MotionInspectFailure =>
  isRecord(value) &&
  isNonEmptyString(value.nodeId) &&
  isNonEmptyString(value.code) &&
  isNonEmptyString(value.message);

const isMotionSnapshot = (value: unknown): value is MotionSnapshot =>
  isRecord(value) &&
  isNonEmptyString(value.nodeId) &&
  isNonEmptyString(value.nodeType) &&
  isRecord(value.sources) &&
  (value.sources.kind === "none" ||
    value.sources.kind === "manual" ||
    value.sources.kind === "style" ||
    value.sources.kind === "mixed") &&
  Array.isArray(value.timelines) &&
  Array.isArray(value.manualTracks) &&
  Array.isArray(value.styleInstances) &&
  Array.isArray(value.derivedAnimations) &&
  isRecord(value.componentProperties) &&
  isRecord(value.capabilities) &&
  Array.isArray(value.warnings);

const isMotionInspectResult = (value: unknown): value is MotionInspectResult =>
  isRecord(value) &&
  isStringArray(value.requestedNodeIds) &&
  Array.isArray(value.snapshots) &&
  value.snapshots.every(isMotionSnapshot) &&
  Array.isArray(value.failures) &&
    value.failures.every(isMotionInspectFailure);

const isMotionClipboardCopyMode = (value: unknown): value is MotionClipboardCopyMode =>
  value === "complete" || value === "timing-only" || value === "easing-only" || value === "selected-tracks";

const isPasteMode = (value: unknown): value is PasteMode =>
  value === "replace" ||
  value === "merge-compatible" ||
  value === "add-missing-only" ||
  value === "preserve-timing" ||
  value === "preserve-easing";

const isPasteMapping = (value: unknown): value is PasteMapping => {
  if (!isRecord(value) || (value.mode !== "one-to-many" && value.mode !== "scope-order" && value.mode !== "explicit")) {
    return false;
  }
  if (value.pairs === undefined) {
    return true;
  }
  return Array.isArray(value.pairs) && value.pairs.every((pair) =>
    isRecord(pair) && isNonEmptyString(pair.sourceNodeId) && isNonEmptyString(pair.destinationNodeId)
  );
};

const isPasteTimingOptions = (value: unknown): value is PasteTimingOptions =>
  isRecord(value) &&
  (value.offsetMs === undefined || (isFiniteNumber(value.offsetMs) && Number.isInteger(value.offsetMs))) &&
  (value.intervalMs === undefined || (isFiniteNumber(value.intervalMs) && Number.isInteger(value.intervalMs))) &&
  (value.reverseOrder === undefined || typeof value.reverseOrder === "boolean") &&
  (value.stagger === undefined || isStaggerOperation(value.stagger));

const isStaggerOperation = (value: unknown): value is StaggerOperation =>
  isRecord(value) &&
  value.kind === "stagger" &&
  (
    value.timingMode === "fixed-interval" ||
    value.timingMode === "total-duration" ||
    value.timingMode === "fixed-overlap" ||
    value.timingMode === "sequential-after-end" ||
    value.timingMode === "start-before-previous-end"
  ) &&
  (value.durationPolicy === "preserve" || value.durationPolicy === "scale-to-fit") &&
  (value.anchor === "preserve-first-start" || value.anchor === "preserve-last-end" || value.anchor === "extend-timeline") &&
  (value.intervalMs === undefined || (isFiniteNumber(value.intervalMs) && Number.isInteger(value.intervalMs))) &&
  (value.totalDurationMs === undefined || (isFiniteNumber(value.totalDurationMs) && Number.isInteger(value.totalDurationMs))) &&
  (value.overlapMs === undefined || (isFiniteNumber(value.overlapMs) && Number.isInteger(value.overlapMs))) &&
  (value.gapMs === undefined || (isFiniteNumber(value.gapMs) && Number.isInteger(value.gapMs)));

const isMotionOperationCancelKind = (value: unknown): value is MotionOperationCancelRequestMessage["operation"] =>
  value === "motion-inspect" ||
  value === "motion-plan" ||
  value === "motion-clipboard" ||
  value === "motion-paste-plan" ||
  value === "standards-storage" ||
  value === "handoff-report";

const isMotionClipboard = (value: unknown): value is MotionClipboard =>
  isRecord(value) &&
  value.version === 1 &&
  isFiniteNumber(value.createdAtMs) &&
  isMotionClipboardCopyMode(value.mode) &&
  Array.isArray(value.sources);

const isStandardsLike = (value: unknown): value is MotionStandards =>
  isRecord(value) &&
  value.schemaVersion === 1 &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isRecord(value.metadata) &&
  Array.isArray(value.tokens);

const isStandardsSource = (value: unknown): value is StandardsSource =>
  value === "personal" || value === "file" || value === "imported";

const isStandardsStorageAction = (value: unknown): value is StandardsStorageAction => {
  if (!isRecord(value) || !isNonEmptyString(value.kind)) {
    return false;
  }
  switch (value.kind) {
    case "list-personal":
    case "read-file":
    case "export-active":
      return true;
    case "read-personal":
    case "delete-personal":
      return isNonEmptyString(value.id);
    case "save-personal":
    case "save-file":
      return isStandardsLike(value.standards);
    case "rename-personal":
      return isNonEmptyString(value.id) && isNonEmptyString(value.name);
    case "select-active":
      return isStandardsSource(value.source) && (value.id === undefined || typeof value.id === "string") && (value.standards === undefined || isStandardsLike(value.standards));
    case "import-json":
      return typeof value.json === "string";
    default:
      return false;
  }
};

const isNormalizedEasing = (value: unknown): value is NormalizedEasing => {
  if (!isRecord(value) || !isNonEmptyString(value.kind)) {
    return false;
  }
  switch (value.kind) {
    case "linear":
      return true;
    case "preset":
      return isNonEmptyString(value.name);
    case "cubic-bezier":
      return (
        isFiniteNumber(value.x1) &&
        isFiniteNumber(value.y1) &&
        isFiniteNumber(value.x2) &&
        isFiniteNumber(value.y2)
      );
    case "spring":
      return true;
    case "unknown":
      return "raw" in value;
    default:
      return false;
  }
};

const isMotionEditOperation = (value: unknown): value is MotionEditOperation => {
  if (!isRecord(value) || !isNonEmptyString(value.kind)) {
    return false;
  }
  switch (value.kind) {
    case "set-duration":
      return (
        isFiniteNumber(value.durationMs) &&
        Number.isInteger(value.durationMs) &&
        value.durationMs >= 0 &&
        (value.anchor === "preserve-start" || value.anchor === "preserve-end")
      );
    case "replace-easing":
      return isNormalizedEasing(value.easing);
    case "set-delay":
      return (
        (value.mode === "add" || value.mode === "remove" || value.mode === "replace") &&
        (value.mode === "remove" ||
          (isFiniteNumber(value.delayMs) && Number.isInteger(value.delayMs) && value.delayMs >= 0))
      );
    case "scale-timing":
      return (
        value.origin === "start" &&
        isFiniteNumber(value.numerator) &&
        isFiniteNumber(value.denominator) &&
        Number.isInteger(value.numerator) &&
        Number.isInteger(value.denominator) &&
        value.numerator > 0 &&
        value.denominator > 0
      );
    case "sequencer-draft":
      return (
        isNonEmptyString(value.label) &&
        isStringArray([value.baseSnapshotId]) &&
        Array.isArray(value.manualTracks) &&
        value.manualTracks.every((track) =>
          isRecord(track) &&
          isNonEmptyString(track.property) &&
          Array.isArray(track.keyframes) &&
          track.keyframes.every((keyframe) =>
            isRecord(keyframe) &&
            isFiniteNumber(keyframe.timeMs) &&
            Number.isInteger(keyframe.timeMs) &&
            keyframe.timeMs >= 0 &&
            (keyframe.easing === undefined || isNormalizedEasing(keyframe.easing))
          )
        ) &&
        Array.isArray(value.timelineDurations) &&
        value.timelineDurations.every((timeline) =>
          isRecord(timeline) &&
          isNonEmptyString(timeline.timelineId) &&
          isFiniteNumber(timeline.durationMs) &&
          Number.isInteger(timeline.durationMs) &&
          timeline.durationMs >= 0
        ) &&
        Array.isArray(value.warnings)
      );
    default:
      return false;
  }
};

const isSerializedOperationResult = (value: unknown): value is MotionPlanOperationResultMessage["result"] => {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return "plan" in value;
  }
  return (
    isRecord(value.error) &&
    isNonEmptyString(value.error.code) &&
    isNonEmptyString(value.error.message) &&
    (value.error.path === undefined || typeof value.error.path === "string")
  );
};

export const isUiToPluginMessage = (value: unknown): value is UiToPluginMessage => {
  if (isMotionDiagnosticRequest(value)) {
    return true;
  }

  if (isResizePluginWindowRequest(value)) {
    return true;
  }

  if (
    isP006FixtureCommandMessage(value) ||
    isP006RunTestMessage(value) ||
    isP006RunAllMessage(value) ||
    isP006VerifyTargetPipelineMessage(value) ||
    isP007FixtureCommandMessage(value) ||
    isP007RunCaseMessage(value) ||
    isP007RunAllMessage(value) ||
    isP007VerifyTargetPipelineMessage(value) ||
    isP008FixtureCommandMessage(value) ||
    isP008RunCaseMessage(value) ||
    isP008RunAllMessage(value) ||
    isP008VerifyTargetPipelineMessage(value) ||
    isP009FixtureCommandMessage(value) ||
    isP009RunCaseMessage(value) ||
    isP009RunAllMessage(value) ||
    isP009VerifyTargetPipelineMessage(value) ||
    isP010FixtureCommandMessage(value) ||
    isP010RunActionMessage(value) ||
    isP010VerifyTargetPipelineMessage(value) ||
    isP011FixtureCommandMessage(value) ||
    isP011RunCaseMessage(value) ||
    isP011RunAllMessage(value) ||
    isP011VerifyTargetPipelineMessage(value) ||
    isP012FixtureCommandMessage(value) ||
    isP012RunCaseMessage(value) ||
    isP012RunAllMessage(value) ||
    isP012VerifyTargetPipelineMessage(value)
  ) {
    return true;
  }

  if (!isRecord(value) || value.type !== "UI_PING") {
    if (!isRecord(value) || value.type !== "SCOPE_SCAN_REQUEST") {
      if (!isRecord(value) || value.type !== "SCOPE_SCAN_CANCEL") {
        if (!isRecord(value) || value.type !== "MOTION_OPERATION_CANCEL_REQUEST") {
          if (!isRecord(value) || value.type !== "SCOPE_REVEAL_NODE_REQUEST") {
            if (!isRecord(value) || value.type !== "MOTION_INSPECT_REQUEST") {
            if (!isRecord(value) || value.type !== "MOTION_PLAN_OPERATION_REQUEST") {
              if (!isRecord(value) || value.type !== "MOTION_APPLY_CHANGE_PLAN_REQUEST") {
                if (!isRecord(value) || value.type !== "MOTION_CLIPBOARD_COPY_REQUEST") {
                  if (!isRecord(value) || value.type !== "MOTION_PASTE_PLAN_REQUEST") {
                    if (!isRecord(value) || value.type !== "STANDARDS_STORAGE_REQUEST") {
                      return false;
                    }

                    return isNonEmptyString(value.requestId) && isStandardsStorageAction(value.action);
                  }

                  return (
                    isNonEmptyString(value.requestId) &&
                    isMotionClipboard(value.clipboard) &&
                    isStringArray(value.destinationNodeIds) &&
                    isPasteMode(value.pasteMode) &&
                    isPasteMapping(value.mapping) &&
                    isPasteTimingOptions(value.timing)
                  );
                }

                return (
                  isNonEmptyString(value.requestId) &&
                  isStringArray(value.nodeIds) &&
                  isMotionClipboardCopyMode(value.mode) &&
                  isStringArray(value.selectedTrackIds)
                );
              }

              return isNonEmptyString(value.requestId) && "plan" in value;
            }

            return (
              isNonEmptyString(value.requestId) &&
              isNonEmptyString(value.nodeId) &&
              isStringArray(value.targetIds) &&
              isMotionEditOperation(value.operation)
            );
          }

            return isNonEmptyString(value.requestId) && isStringArray(value.nodeIds);
          }

          return isNonEmptyString(value.requestId) && isNonEmptyString(value.nodeId);
        }

        return isNonEmptyString(value.requestId) && isMotionOperationCancelKind(value.operation);
      }

      return isNonEmptyString(value.requestId);
    }

    return isNonEmptyString(value.requestId) && parseScopeDefinition(value.scope).ok;
  }

  return isNonEmptyString(value.requestId) && isFiniteNumber(value.sentAtMs);
};

export const isPluginToUiMessage = (value: unknown): value is PluginToUiMessage => {
  if (!isRecord(value) || !isNonEmptyString(value.type)) {
    return false;
  }

  switch (value.type) {
    case "PLUGIN_READY":
      return (
        isNonEmptyString(value.pluginVersion) &&
        isNonEmptyString(value.figmaMode) &&
        typeof value.apiLabEnabled === "boolean"
      );
    case "PLUGIN_PONG":
      return isNonEmptyString(value.requestId) && isFiniteNumber(value.receivedAtMs);
    case "MOTION_DIAGNOSTIC_RESULT":
      return isMotionDiagnosticResultMessage(value);
    case "P006_FIXTURE_RESULT":
      return isP006FixtureResultMessage(value);
    case "P006_TEST_RUN_RESULT":
      return isP006TestRunResultMessage(value);
    case "P006_RUN_ALL_RESULT":
      return isP006RunAllResultMessage(value);
    case "P006_TARGET_PIPELINE_RESULT":
      return isP006TargetPipelineResultMessage(value);
    case "P007_FIXTURE_RESULT":
      return isP007FixtureResultMessage(value);
    case "P007_RUN_RESULT":
      return isP007RunResultMessage(value);
    case "P007_TARGET_PIPELINE_RESULT":
      return isP007TargetPipelineResultMessage(value);
    case "P008_FIXTURE_RESULT":
      return isP008FixtureResultMessage(value);
    case "P008_RUN_RESULT":
      return isP008RunResultMessage(value);
    case "P008_TARGET_PIPELINE_RESULT":
      return isP008TargetPipelineResultMessage(value);
    case "P009_FIXTURE_RESULT":
      return isP009FixtureResultMessage(value);
    case "P009_RUN_RESULT":
      return isP009RunResultMessage(value);
    case "P009_TARGET_PIPELINE_RESULT":
      return isP009TargetPipelineResultMessage(value);
    case "P010_FIXTURE_RESULT":
      return isP010FixtureResultMessage(value);
    case "P010_RUN_RESULT":
      return isP010RunResultMessage(value);
    case "P010_TARGET_PIPELINE_RESULT":
      return isP010TargetPipelineResultMessage(value);
    case "P011_FIXTURE_RESULT":
      return isP011FixtureResultMessage(value);
    case "P011_RUN_RESULT":
      return isP011RunResultMessage(value);
    case "P011_TARGET_PIPELINE_RESULT":
      return isP011TargetPipelineResultMessage(value);
    case "P012_FIXTURE_RESULT":
      return isP012FixtureResultMessage(value);
    case "P012_RUN_RESULT":
      return isP012RunResultMessage(value);
    case "P012_TARGET_PIPELINE_RESULT":
      return isP012TargetPipelineResultMessage(value);
    case "SCOPE_SCAN_RESULT":
      return isNonEmptyString(value.requestId) && isScopeScanResult(value.result);
    case "SCOPE_SCAN_PROGRESS":
      return (
        isNonEmptyString(value.requestId) &&
        isScopeScanProgress(value.progress) &&
        value.progress.requestId === value.requestId
      );
    case "SCOPE_SELECTION_CHANGED":
      return isStringArray(value.selectionIds);
    case "SCOPE_REVEAL_NODE_RESULT":
      return isNonEmptyString(value.requestId) && isScopeRevealNodeResult(value.result);
    case "MOTION_INSPECT_RESULT":
      return isNonEmptyString(value.requestId) && isMotionInspectResult(value.result);
    case "MOTION_PLAN_OPERATION_RESULT":
      return isNonEmptyString(value.requestId) && isSerializedOperationResult(value.result);
    case "MOTION_APPLY_CHANGE_PLAN_RESULT":
      return isNonEmptyString(value.requestId) && "result" in value;
    case "MOTION_CLIPBOARD_COPY_RESULT":
      return isNonEmptyString(value.requestId) && "result" in value;
    case "MOTION_PASTE_PLAN_RESULT":
      return isNonEmptyString(value.requestId) && "result" in value;
    case "STANDARDS_STORAGE_RESULT":
      return isNonEmptyString(value.requestId) && isRecord(value.result) && Array.isArray(value.result.errors);
    case "PLUGIN_ERROR":
      return (
        value.code === "INVALID_MESSAGE" &&
        isNonEmptyString(value.message) &&
        (value.requestId === undefined || isNonEmptyString(value.requestId))
      );
    default:
      return false;
  }
};

export const makeInvalidMessageError = (
  message: string,
  requestId?: RequestId
): PluginErrorMessage => ({
  type: "PLUGIN_ERROR",
  code: "INVALID_MESSAGE",
  message,
  requestId
});
