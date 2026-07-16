import type { DiagnosticError, DiagnosticValue, DiagnosticWarning, P006RunnerStatus } from "./diagnostics";
import type { P008CaseId, P008Operation } from "./p008Registry";

export const p008EvidenceSchemaVersion = 1;

export type P008CapabilityClassification =
  | "supported"
  | "supported-with-warning"
  | "partial"
  | "mixed"
  | "read-only"
  | "unsupported"
  | "blocked";

export interface P008AppliedStyleJson {
  readonly id?: string;
  readonly styleId?: string;
  readonly name?: string;
  readonly duration?: number;
  readonly timelineOffset?: number;
  readonly props?: DiagnosticValue;
  readonly [key: string]: DiagnosticValue | undefined;
}

export interface P008StyleSnapshot {
  readonly styles: readonly P008AppliedStyleJson[];
  readonly manualTracks: DiagnosticValue;
  readonly timelines: DiagnosticValue;
  readonly animations: DiagnosticValue;
}

export interface P008StyleComparison {
  beforeCount: number;
  actualCount: number;
  duplicateDetected: boolean;
  beforeInstanceIds: string[];
  actualInstanceIds: string[];
  beforeStyleIds: string[];
  actualStyleIds: string[];
  intendedStyleId: string | null;
  intendedInstanceIdBefore: string | null;
  intendedInstanceIdActual: string | null;
  instanceIdPreserved: boolean | null;
  styleIdPreserved: boolean;
}

export interface P008IsolationComparison {
  manualTracksBeforeFingerprint: string;
  manualTracksActualFingerprint: string;
  manualTracksUnchanged: boolean;
  timelineBeforeFingerprint: string;
  timelineActualFingerprint: string;
  timelineUnchanged: boolean;
  animationsBeforeFingerprint: string;
  animationsActualFingerprint: string;
  animationsUnchanged: boolean;
  unrelatedDataUnchanged: boolean;
}

export interface P008DiffSummary {
  changedPaths: string[];
  unexpectedChangedPaths: string[];
}

export interface P008EvidenceRecord {
  evidenceSchemaVersion: 1;
  runId: string;
  caseId: P008CaseId;
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
    styleId: string | null;
    applicationStyleId?: string | null;
    instanceId: string | null;
    hasManualSibling: boolean;
  };
  operation: P008Operation;
  before: P008StyleSnapshot | null;
  planned: DiagnosticValue | null;
  actual: P008StyleSnapshot | null;
  restoration: P008StyleSnapshot | null;
  styleComparison: P008StyleComparison;
  isolationComparison: P008IsolationComparison;
  diagnostic: {
    apiSemantics: string[];
    diff: P008DiffSummary;
    classification: P008CapabilityClassification;
    request?: {
      requestId: string | null;
      caseId: P008CaseId;
      message: "P008_RUN_CASE" | "P008_RUN_ALL";
      handlerEntered: boolean;
    };
    styleDiscovery?: {
      availableStyleCount: number;
      applicableStyleCount?: number;
      fixtureStyleCount: number;
      selectedStyleId: string | null;
      selectedApplicationStyleId?: string | null;
      missingPrerequisite?: string;
      manualActionRequired?: string;
      preflightStatus?: string;
      rejectionCategories?: string[];
    };
    execution?: {
      targetNodeId: string | null;
      apiOperationStarted: boolean;
      apiOperationCompleted: boolean;
      rereadCompleted: boolean;
      responsePosted: boolean;
      evidencePostStatus: "PENDING_UI_WRITE";
      terminalStatus: P006RunnerStatus;
    };
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

export interface P008RunResult {
  runId: string;
  status: P006RunnerStatus;
  startedAt: string;
  finishedAt: string;
  files: string[];
  evidence: P008EvidenceRecord[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P008RunManifest {
  runId: string;
  evidenceSchemaVersion: 1;
  build: "lab";
  startedAt: string;
  finishedAt: string;
  caseIds: P008CaseId[];
  evidenceFiles: string[];
  accepted: boolean;
  classification: P008CapabilityClassification;
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

export const changedPaths = (before: unknown, actual: unknown, path = "$"): string[] => {
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
    return [...keys].sort().flatMap((key) => changedPaths(before[key] ?? null, actual[key] ?? null, `${path}.${key}`));
  }
  return [path];
};

export const coerceAppliedStyles = (value: DiagnosticValue): P008AppliedStyleJson[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const styles: P008AppliedStyleJson[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    styles.push({
      ...(toDiagnosticValue(item) as Record<string, DiagnosticValue>),
      id: typeof item.id === "string" ? item.id : undefined,
      styleId: typeof item.styleId === "string" ? item.styleId : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      duration: typeof item.duration === "number" ? item.duration : undefined,
      timelineOffset: typeof item.timelineOffset === "number" ? item.timelineOffset : undefined,
      props: "props" in item ? toDiagnosticValue(item.props) : undefined
    });
  }
  return styles;
};

export const createStyleComparison = (
  before: P008StyleSnapshot | null,
  actual: P008StyleSnapshot | null,
  intendedStyleId: string | null
): P008StyleComparison => {
  const beforeStyles = before?.styles ?? [];
  const actualStyles = actual?.styles ?? [];
  const firstOrNull = (styles: readonly P008AppliedStyleJson[]): P008AppliedStyleJson | null =>
    styles.length === 0 ? null : styles[0];
  const beforeInstance: P008AppliedStyleJson | null =
    intendedStyleId === null
      ? firstOrNull(beforeStyles)
      : beforeStyles.find((style) => style.styleId === intendedStyleId) ?? firstOrNull(beforeStyles);
  const actualInstance: P008AppliedStyleJson | null =
    intendedStyleId === null
      ? firstOrNull(actualStyles)
      : actualStyles.find((style) => style.styleId === intendedStyleId) ?? firstOrNull(actualStyles);
  const actualStyleIds = actualStyles.map((style) => style.styleId ?? "").filter((id) => id.length > 0);
  return {
    beforeCount: beforeStyles.length,
    actualCount: actualStyles.length,
    duplicateDetected: new Set(actualStyleIds).size !== actualStyleIds.length || actualStyles.length > Math.max(beforeStyles.length, 1),
    beforeInstanceIds: beforeStyles.map((style) => style.id ?? "").filter((id) => id.length > 0),
    actualInstanceIds: actualStyles.map((style) => style.id ?? "").filter((id) => id.length > 0),
    beforeStyleIds: beforeStyles.map((style) => style.styleId ?? "").filter((id) => id.length > 0),
    actualStyleIds,
    intendedStyleId,
    intendedInstanceIdBefore: beforeInstance?.id ?? null,
    intendedInstanceIdActual: actualInstance?.id ?? null,
    instanceIdPreserved: beforeInstance?.id === undefined || actualInstance?.id === undefined ? null : beforeInstance.id === actualInstance.id,
    styleIdPreserved: intendedStyleId === null || actualStyleIds.includes(intendedStyleId)
  };
};

export const createIsolationComparison = (
  before: P008StyleSnapshot | null,
  actual: P008StyleSnapshot | null
): P008IsolationComparison => {
  const manualTracksBeforeFingerprint = stableFingerprint(before?.manualTracks ?? null);
  const manualTracksActualFingerprint = stableFingerprint(actual?.manualTracks ?? null);
  const timelineBeforeFingerprint = stableFingerprint(before?.timelines ?? null);
  const timelineActualFingerprint = stableFingerprint(actual?.timelines ?? null);
  const animationsBeforeFingerprint = stableFingerprint(before?.animations ?? null);
  const animationsActualFingerprint = stableFingerprint(actual?.animations ?? null);
  const manualTracksUnchanged = manualTracksBeforeFingerprint === manualTracksActualFingerprint;
  const timelineUnchanged = timelineBeforeFingerprint === timelineActualFingerprint;
  const animationsUnchanged = animationsBeforeFingerprint === animationsActualFingerprint;
  return {
    manualTracksBeforeFingerprint,
    manualTracksActualFingerprint,
    manualTracksUnchanged,
    timelineBeforeFingerprint,
    timelineActualFingerprint,
    timelineUnchanged,
    animationsBeforeFingerprint,
    animationsActualFingerprint,
    animationsUnchanged,
    unrelatedDataUnchanged: manualTracksUnchanged && timelineUnchanged
  };
};

export const summarizeStyleDiff = (
  before: P008StyleSnapshot | null,
  actual: P008StyleSnapshot | null,
  allowedPaths: readonly string[]
): P008DiffSummary => {
  const changed = before === null || actual === null ? ["$"] : changedPaths(before.styles, actual.styles);
  const allowed = new Set(allowedPaths);
  return {
    changedPaths: changed,
    unexpectedChangedPaths: changed.filter((path) => !allowed.has(path))
  };
};

export const statusFromP008Checks = (
  comparison: P008StyleComparison,
  isolation: P008IsolationComparison,
  diff: P008DiffSummary,
  classification: P008CapabilityClassification,
  hasErrors: boolean
): P006RunnerStatus => {
  if (hasErrors) {
    if (classification === "blocked") {
      return "BLOCKED_PRECONDITION";
    }
    return "ERROR";
  }
  if (classification === "unsupported") {
    return "UNSUPPORTED";
  }
  if (classification === "read-only") {
    return "READ_ONLY";
  }
  if (classification === "partial" || classification === "supported-with-warning") {
    return "PARTIAL";
  }
  if (!comparison.duplicateDetected && comparison.styleIdPreserved && isolation.unrelatedDataUnchanged && diff.unexpectedChangedPaths.length === 0) {
    return "PASS";
  }
  return "FAIL";
};
