import type { DiagnosticError, DiagnosticValue, DiagnosticWarning, P006RunnerStatus } from "./diagnostics";
import type { P009CaseId, P009Operation } from "./p009Registry";

export const p009EvidenceSchemaVersion = 1;

export type P009CapabilityClassification =
  | "supported"
  | "supported-with-warning"
  | "unsupported"
  | "read-only"
  | "unknown"
  | "mixed";

export interface P009TimelineJson {
  readonly id?: string;
  readonly duration?: number;
  readonly [key: string]: DiagnosticValue | undefined;
}

export interface P009TimelineSnapshot {
  readonly timelines: readonly P009TimelineJson[];
  readonly manualTracks: DiagnosticValue;
  readonly animationStyles: DiagnosticValue;
  readonly derivedAnimations: DiagnosticValue;
}

export interface P009DurationComparison {
  beforeDuration: number | null;
  plannedDuration: number | null;
  actualDuration: number | null;
  rawApiDuration: number | null;
  durationMatchesPlan: boolean | null;
  semanticEqualToBefore: boolean;
  normalizedOrClamped: boolean;
  normalizationDelta: number | null;
  rejected: boolean;
}

export interface P009IsolationComparison {
  timelineIdBefore: string | null;
  timelineIdActual: string | null;
  timelineIdentityPreserved: boolean | null;
  timelineCountBefore: number;
  timelineCountActual: number;
  timelineCountPreserved: boolean;
  manualTracksBeforeFingerprint: string;
  manualTracksActualFingerprint: string;
  manualTracksUnchanged: boolean;
  animationStylesBeforeFingerprint: string;
  animationStylesActualFingerprint: string;
  animationStylesUnchanged: boolean;
  derivedAnimationsBeforeFingerprint: string;
  derivedAnimationsActualFingerprint: string;
  derivedAnimationsUnchanged: boolean;
  unrelatedMotionDataUnchanged: boolean;
}

export interface P009EvidenceRecord {
  evidenceSchemaVersion: 1;
  runId: string;
  caseId: P009CaseId;
  variantId: string;
  targetProvenance: {
    mode: "EXPLICIT_NODE_IDS";
    requestedNodeIds: string[];
    resolvedNodeIds: string[];
    failedNodeIds: string[];
    role: string;
    fixtureRootId: string | null;
  };
  apiContract: {
    method: "MotionNodeMixin.setTimelineDuration";
    signature: "setTimelineDuration(id: string, duration: number): void";
    invokedOn: "node";
    timelineIdentifierShape: "string id from node.timelines";
    durationUnits: "seconds";
    returnValue: "void";
    asynchronousBehavior: "synchronous";
    documentedRange: "duration must be greater than zero";
  };
  timelineId: string | null;
  timelineCount: number;
  durationBefore: number | null;
  plannedDuration: number | null;
  actualDuration: number | null;
  rawApiDuration: number | null;
  maximumKeyframeTime: number | null;
  keyframes: readonly { readonly id: string | null; readonly time: number }[];
  before: P009TimelineSnapshot | null;
  planned: DiagnosticValue | null;
  actual: P009TimelineSnapshot | null;
  restoration: {
    attempted: boolean;
    restoredDuration: number | null;
    restoredSemanticState: boolean | null;
    error: DiagnosticError | null;
  };
  durationComparison: P009DurationComparison;
  isolationComparison: P009IsolationComparison;
  normalizationOrClamping: {
    detected: boolean;
    kind: "none" | "clamped" | "normalized" | "rejected" | "accepted-below-keyframe" | "unknown";
    message: string;
  };
  terminalClassification: P009CapabilityClassification;
  result: {
    status: P006RunnerStatus;
    passed: boolean;
    reasons: string[];
  };
  errors: DiagnosticError[];
  warnings: DiagnosticWarning[];
  environment: {
    editorType: string;
    figmaMode: string;
    currentPageId: string;
    currentPageName: string;
    timestamp: string;
  };
  timestamp: string;
  filename: string;
}

export interface P009RunResult {
  runId: string;
  status: P006RunnerStatus;
  startedAt: string;
  finishedAt: string;
  files: string[];
  evidence: P009EvidenceRecord[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P009RunManifest {
  runId: string;
  evidenceSchemaVersion: 1;
  build: "lab";
  startedAt: string;
  finishedAt: string;
  caseIds: P009CaseId[];
  evidenceFiles: string[];
  accepted: boolean;
  classification: P009CapabilityClassification;
  rejectionReason?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toDiagnosticValue = (value: unknown): DiagnosticValue => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toDiagnosticValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toDiagnosticValue(entry)]));
  }
  return Object.prototype.toString.call(value);
};

const sortValue = (value: DiagnosticValue): DiagnosticValue => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
};

export const stableFingerprint = (value: unknown): string => JSON.stringify(sortValue(toDiagnosticValue(value)));

export const coerceTimelines = (value: DiagnosticValue): P009TimelineJson[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const timelines: P009TimelineJson[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    timelines.push({
      ...(toDiagnosticValue(item) as Record<string, DiagnosticValue>),
      id: typeof item.id === "string" ? item.id : undefined,
      duration: typeof item.duration === "number" ? item.duration : undefined
    });
  }
  return timelines;
};

export const compareDurations = (
  before: P009TimelineSnapshot | null,
  actual: P009TimelineSnapshot | null,
  timelineId: string | null,
  plannedDuration: number | null,
  errorCount = 0
): P009DurationComparison => {
  const findTimeline = (snapshot: P009TimelineSnapshot | null): P009TimelineJson | null => {
    const timelines = snapshot?.timelines ?? [];
    if (timelines.length === 0) {
      return null;
    }
    return timelines.find((timeline) => timeline.id === timelineId) ?? timelines[0];
  };
  const beforeDuration = findTimeline(before)?.duration ?? null;
  const actualDuration = findTimeline(actual)?.duration ?? null;
  const normalizationDelta =
    plannedDuration === null || actualDuration === null ? null : Math.abs(actualDuration - plannedDuration);
  return {
    beforeDuration,
    plannedDuration,
    actualDuration,
    rawApiDuration: actualDuration,
    durationMatchesPlan:
      plannedDuration === null || actualDuration === null ? null : Math.abs(actualDuration - plannedDuration) < 0.000001,
    semanticEqualToBefore: stableFingerprint(before) === stableFingerprint(actual),
    normalizedOrClamped:
      plannedDuration !== null &&
      actualDuration !== null &&
      Math.abs(actualDuration - plannedDuration) >= 0.000001 &&
      actualDuration !== beforeDuration,
    normalizationDelta,
    rejected: errorCount > 0 && actualDuration === beforeDuration
  };
};

export const compareIsolation = (
  before: P009TimelineSnapshot | null,
  actual: P009TimelineSnapshot | null
): P009IsolationComparison => {
  const beforeTimeline = before?.timelines[0] ?? null;
  const actualTimeline = actual?.timelines[0] ?? null;
  const manualTracksBeforeFingerprint = stableFingerprint(before?.manualTracks ?? null);
  const manualTracksActualFingerprint = stableFingerprint(actual?.manualTracks ?? null);
  const animationStylesBeforeFingerprint = stableFingerprint(before?.animationStyles ?? null);
  const animationStylesActualFingerprint = stableFingerprint(actual?.animationStyles ?? null);
  const derivedAnimationsBeforeFingerprint = stableFingerprint(before?.derivedAnimations ?? null);
  const derivedAnimationsActualFingerprint = stableFingerprint(actual?.derivedAnimations ?? null);
  const manualTracksUnchanged = manualTracksBeforeFingerprint === manualTracksActualFingerprint;
  const animationStylesUnchanged = animationStylesBeforeFingerprint === animationStylesActualFingerprint;
  const derivedAnimationsUnchanged = derivedAnimationsBeforeFingerprint === derivedAnimationsActualFingerprint;
  return {
    timelineIdBefore: beforeTimeline?.id ?? null,
    timelineIdActual: actualTimeline?.id ?? null,
    timelineIdentityPreserved:
      beforeTimeline?.id === undefined || actualTimeline?.id === undefined ? null : beforeTimeline.id === actualTimeline.id,
    timelineCountBefore: before?.timelines.length ?? 0,
    timelineCountActual: actual?.timelines.length ?? 0,
    timelineCountPreserved: (before?.timelines.length ?? 0) === (actual?.timelines.length ?? 0),
    manualTracksBeforeFingerprint,
    manualTracksActualFingerprint,
    manualTracksUnchanged,
    animationStylesBeforeFingerprint,
    animationStylesActualFingerprint,
    animationStylesUnchanged,
    derivedAnimationsBeforeFingerprint,
    derivedAnimationsActualFingerprint,
    derivedAnimationsUnchanged,
    unrelatedMotionDataUnchanged: manualTracksUnchanged && animationStylesUnchanged && derivedAnimationsUnchanged
  };
};

export const classifyP009 = (
  operation: P009Operation,
  duration: P009DurationComparison,
  isolation: P009IsolationComparison,
  restoredSemanticState: boolean | null,
  hasErrors: boolean
): P009CapabilityClassification => {
  if (hasErrors && duration.rejected) {
    return operation === "SHORTEN_BELOW_FINAL_KEYFRAME" ? "unsupported" : "read-only";
  }
  if (hasErrors) {
    return "unknown";
  }
  if (operation === "NO_OP_DURATION_WRITE" && duration.semanticEqualToBefore) {
    return "supported";
  }
  if (operation === "RESTORE_ORIGINAL_DURATION" && restoredSemanticState === true) {
    return "supported";
  }
  if (
    duration.durationMatchesPlan === true &&
    isolation.timelineCountPreserved &&
    isolation.manualTracksUnchanged &&
    isolation.animationStylesUnchanged
  ) {
    return "supported";
  }
  if (
    duration.normalizedOrClamped &&
    isolation.timelineCountPreserved &&
    isolation.manualTracksUnchanged &&
    isolation.animationStylesUnchanged
  ) {
    return "supported-with-warning";
  }
  return "unknown";
};

export const statusFromP009Classification = (
  classification: P009CapabilityClassification,
  hasErrors: boolean
): P006RunnerStatus => {
  if (classification === "supported") {
    return "PASS";
  }
  if (classification === "supported-with-warning" || classification === "mixed") {
    return "PARTIAL";
  }
  if (classification === "unsupported") {
    return "UNSUPPORTED";
  }
  if (classification === "read-only") {
    return "READ_ONLY";
  }
  return hasErrors ? "ERROR" : "FAIL";
};
