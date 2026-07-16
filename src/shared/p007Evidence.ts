import type { DiagnosticError, DiagnosticValue, DiagnosticWarning, P006RunnerStatus } from "./diagnostics";
import type { P007CaseDefinition, P007CaseId, P007Operation } from "./p007Registry";

export const p007EvidenceSchemaVersion = 1;

export interface P007Field {
  readonly type: "PROPERTY";
  readonly name: string;
}

export interface P007KeyframeJson {
  readonly id?: string;
  readonly timelinePosition: number;
  readonly easing?: DiagnosticValue;
  readonly value: DiagnosticValue;
  readonly [key: string]: DiagnosticValue | undefined;
}

export interface P007ManualTrackJson {
  readonly id?: string;
  readonly baseValue?: DiagnosticValue;
  readonly keyframes: readonly P007KeyframeJson[];
  readonly [key: string]: DiagnosticValue | readonly P007KeyframeJson[] | undefined;
}

export interface P007IdComparison {
  originalTrackId: string | null;
  plannedTrackId: string | null;
  actualTrackId: string | null;
  originalKeyframeIds: string[];
  plannedKeyframeIds: string[];
  actualKeyframeIds: string[];
  trackIdPreserved: boolean;
  orderedKeyframeIdsPreserved: boolean;
}

export interface P007IsolationComparison {
  beforeTrackCount: number;
  actualTrackCount: number;
  duplicateDetected: boolean;
  siblingBeforeFingerprint: string | null;
  siblingActualFingerprint: string | null;
  siblingUnchanged: boolean | null;
  timelineBeforeFingerprint: string;
  timelineActualFingerprint: string;
  animationStylesBeforeFingerprint: string;
  animationStylesActualFingerprint: string;
  unrelatedDataUnchanged: boolean;
}

export interface P007DiffSummary {
  changedPaths: string[];
  unexpectedChangedPaths: string[];
}

export interface P007OperationResult {
  status: P006RunnerStatus;
  before: P007ManualTrackJson | null;
  planned: P007ManualTrackJson | null;
  actual: P007ManualTrackJson | null;
  restoration: P007ManualTrackJson | null;
  idComparison: P007IdComparison;
  isolationComparison: P007IsolationComparison;
  diff: P007DiffSummary;
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P007EvidenceRecord {
  evidenceSchemaVersion: 1;
  runId: string;
  caseId: P007CaseId;
  variantId: string;
  target: {
    mode: "EXPLICIT_NODE_IDS";
    requestedNodeIds: string[];
    resolvedNodeIds: string[];
    failedNodeIds: string[];
    role: string;
  };
  fixture: {
    rootId: string | null;
    nodeId: string;
    nodeName: string;
    propertyName: string;
    siblingPropertyName: string | null;
  };
  operation: P007Operation;
  before: DiagnosticValue | null;
  planned: DiagnosticValue | null;
  actual: DiagnosticValue | null;
  restoration: DiagnosticValue | null;
  idComparison: P007IdComparison;
  isolationComparison: P007IsolationComparison;
  diagnostic: {
    apiSemantics: string[];
    diff: P007DiffSummary;
  };
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
  };
  timestamp: string;
  filename: string;
}

export interface P007RunResult {
  runId: string;
  status: P006RunnerStatus;
  startedAt: string;
  finishedAt: string;
  files: string[];
  evidence: P007EvidenceRecord[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P007RunManifest {
  runId: string;
  evidenceSchemaVersion: 1;
  build: "lab";
  startedAt: string;
  finishedAt: string;
  caseIds: P007CaseId[];
  evidenceFiles: string[];
  accepted: boolean;
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
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toDiagnosticValue(entry)])
    );
  }
  return Object.prototype.toString.call(value);
};

export const cloneDiagnosticValue = <T extends DiagnosticValue>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

export const cloneManualTrack = (track: P007ManualTrackJson): P007ManualTrackJson =>
  JSON.parse(JSON.stringify(track)) as P007ManualTrackJson;

export const coerceManualTrack = (value: DiagnosticValue): P007ManualTrackJson | null => {
  if (!isRecord(value) || !Array.isArray(value.keyframes)) {
    return null;
  }
  const keyframes: P007KeyframeJson[] = [];
  for (const item of value.keyframes) {
    if (!isRecord(item) || typeof item.timelinePosition !== "number" || !("value" in item)) {
      return null;
    }
    keyframes.push({
      ...(toDiagnosticValue(item) as Record<string, DiagnosticValue>),
      id: typeof item.id === "string" ? item.id : undefined,
      timelinePosition: item.timelinePosition,
      easing: "easing" in item ? toDiagnosticValue(item.easing) : undefined,
      value: toDiagnosticValue(item.value)
    });
  }
  return {
    ...(toDiagnosticValue(value) as Record<string, DiagnosticValue>),
    id: typeof value.id === "string" ? value.id : undefined,
    baseValue: "baseValue" in value ? toDiagnosticValue(value.baseValue) : undefined,
    keyframes
  };
};

export const keyframeIds = (track: P007ManualTrackJson | null): string[] =>
  track?.keyframes.map((keyframe) => keyframe.id ?? "").filter((id) => id.length > 0) ?? [];

export const createIdComparison = (
  before: P007ManualTrackJson | null,
  planned: P007ManualTrackJson | null,
  actual: P007ManualTrackJson | null
): P007IdComparison => {
  const originalKeyframeIds = keyframeIds(before);
  const plannedKeyframeIds = keyframeIds(planned);
  const actualKeyframeIds = keyframeIds(actual);
  return {
    originalTrackId: before?.id ?? null,
    plannedTrackId: planned?.id ?? null,
    actualTrackId: actual?.id ?? null,
    originalKeyframeIds,
    plannedKeyframeIds,
    actualKeyframeIds,
    trackIdPreserved: before?.id !== undefined && before.id === planned?.id && before.id === actual?.id,
    orderedKeyframeIdsPreserved:
      originalKeyframeIds.length > 0 &&
      JSON.stringify(originalKeyframeIds) === JSON.stringify(plannedKeyframeIds) &&
      JSON.stringify(originalKeyframeIds) === JSON.stringify(actualKeyframeIds)
  };
};

export const stableFingerprint = (value: unknown): string => JSON.stringify(sortValue(toDiagnosticValue(value)));

const sortValue = (value: DiagnosticValue): DiagnosticValue => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  }
  return value;
};

export const changedPaths = (
  before: unknown,
  actual: unknown,
  path = "$"
): string[] => {
  if (stableFingerprint(before) === stableFingerprint(actual)) {
    return [];
  }
  if (Array.isArray(before) && Array.isArray(actual)) {
    const length = Math.max(before.length, actual.length);
    return Array.from({ length }, (_, index) =>
      changedPaths(before[index] ?? null, actual[index] ?? null, `${path}[${index.toString()}]`)
    ).flat();
  }
  if (isRecord(before) && isRecord(actual)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(actual)]);
    return [...keys].sort().flatMap((key) =>
      changedPaths(
        before[key] ?? null,
        actual[key] ?? null,
        `${path}.${key}`
      )
    );
  }
  return [path];
};

const mutateKeyframeValue = (value: DiagnosticValue): DiagnosticValue => {
  if (isRecord(value) && value.type === "FLOAT" && typeof value.value === "number") {
    return { ...value, value: Number((value.value + 0.125).toFixed(3)) };
  }
  return value;
};

export const buildPlannedTrack = (
  definition: Pick<P007CaseDefinition, "operation">,
  before: P007ManualTrackJson,
  step = 1
): P007ManualTrackJson => {
  const planned = cloneManualTrack(before);
  const keyframes = planned.keyframes.map((keyframe, index) => {
    if (definition.operation === "TIMING_MODIFICATION" && index === 1) {
      return { ...keyframe, timelinePosition: Number((keyframe.timelinePosition + 0.05 * step).toFixed(3)) };
    }
    if (
      (definition.operation === "VALUE_MODIFICATION" ||
        definition.operation === "MULTI_KEYFRAME_PRESERVATION" ||
        definition.operation === "SIBLING_TRACK_ISOLATION" ||
        definition.operation === "REPEATED_REPLACEMENT" ||
        definition.operation === "RESTORE_ORIGINAL") &&
      index === 1
    ) {
      return { ...keyframe, value: mutateKeyframeValue(keyframe.value) };
    }
    if (definition.operation === "EASING_MODIFICATION" && index === 1) {
      return { ...keyframe, easing: { type: step % 2 === 0 ? "EASE_IN" : "LINEAR" } };
    }
    return keyframe;
  });
  return { ...planned, keyframes };
};

export const expectedChangedPathsFor = (operation: P007Operation): string[] => {
  switch (operation) {
    case "NO_OP_ROUND_TRIP":
      return [];
    case "TIMING_MODIFICATION":
      return ["$.keyframes[1].timelinePosition"];
    case "EASING_MODIFICATION":
      return ["$.keyframes[1].easing.type"];
    case "VALUE_MODIFICATION":
    case "MULTI_KEYFRAME_PRESERVATION":
    case "SIBLING_TRACK_ISOLATION":
    case "REPEATED_REPLACEMENT":
    case "RESTORE_ORIGINAL":
      return ["$.keyframes[1].value.value"];
  }
};

export const summarizeDiff = (
  before: P007ManualTrackJson | null,
  actual: P007ManualTrackJson | null,
  operation: P007Operation
): P007DiffSummary => {
  const changed = before === null || actual === null ? ["$"] : changedPaths(before, actual);
  const allowed = new Set(expectedChangedPathsFor(operation));
  return {
    changedPaths: changed,
    unexpectedChangedPaths: changed.filter((path) => !allowed.has(path))
  };
};

export const hasDuplicateTrack = (
  allTracks: Record<string, unknown>,
  propertyName: string,
  actual: P007ManualTrackJson | null
): boolean => {
  const matchingPropertyCount = Object.keys(allTracks).filter((key) => key === propertyName).length;
  if (matchingPropertyCount > 1) {
    return true;
  }
  if (actual?.id === undefined) {
    return false;
  }
  const idMatches = Object.values(allTracks).filter(
    (track) => isRecord(track) && track.id === actual.id
  ).length;
  return idMatches > 1;
};

export const statusFromP007Checks = (
  idComparison: P007IdComparison,
  isolation: P007IsolationComparison,
  diff: P007DiffSummary,
  restoration: P007ManualTrackJson | null,
  requiresRestoration: boolean
): P006RunnerStatus => {
  if (
    idComparison.trackIdPreserved &&
    idComparison.orderedKeyframeIdsPreserved &&
    !isolation.duplicateDetected &&
    isolation.unrelatedDataUnchanged &&
    diff.unexpectedChangedPaths.length === 0 &&
    (!requiresRestoration || restoration !== null)
  ) {
    return "PASS";
  }
  return "ERROR";
};
