import type { DiagnosticError, DiagnosticValue, DiagnosticWarning, P006RunnerStatus } from "./diagnostics";
import type { P010CaseDefinition, P010CaseId, P010TransactionStrategyId, P010SourceType } from "./p010Registry";
import { p010CaseDefinitions } from "./p010Registry";

export const p010EvidenceSchemaVersion = 1;

export type P010TerminalClassification = "PASS" | "PARTIAL" | "UNSUPPORTED" | "BLOCKED_PRECONDITION" | "FAIL" | "ERROR";
export type P010CapabilityConclusion = "supported" | "supported-with-warning" | "unsupported" | "unsafe" | "unknown";
export type P010GuidedStep = "prepare" | "apply" | "native-undo" | "second-undo" | "redo" | "trigger-undo" | "complete";
export type P010FailureClassification =
  | "actual undo grouping failure"
  | "wrong commitUndo ordering"
  | "re-read happened before native Undo completed"
  | "stale snapshot or stale target reference"
  | "semantic comparator defect"
  | "regenerated IDs incorrectly treated as failed restoration"
  | "derived readback incorrectly treated as unrelated mutation"
  | "fixture contamination from a previous case"
  | "multiple history entries created"
  | "no history entry created"
  | "user-action sequencing ambiguity"
  | "unknown";

export interface P010ApiContract {
  commitUndoSignature: "commitUndo(): void";
  commitUndoReturn: "void";
  commitUndoAsync: false;
  triggerUndoSignature: "triggerUndo(): void";
  triggerUndoReturn: "void";
  triggerUndoAsync: false;
  docsSummary: string[];
  liveAmbiguities: string[];
}

export interface P010SemanticState {
  label: string;
  nodeIds: string[];
  manualTrackFingerprint: string;
  styleInstanceFingerprint: string;
  timelineFingerprint: string;
  derivedAnimationFingerprint: string;
  pluginDataFingerprint: string;
  counts: {
    manualTracks: number;
    styleInstances: number;
    timelines: number;
    derivedAnimations: number;
  };
  raw: DiagnosticValue;
}

export interface P010UndoObservation {
  firstUndoRestoredOriginal: boolean | null;
  secondUndoRequired: boolean | null;
  redoRestoredApplied: boolean | null;
  separateUndoOrdering: boolean | null;
  noOpCreatedHistory: "none" | "empty-entry" | "normalized" | "unknown";
  triggerUndoSafe: boolean | null;
  partialWritesRemained: boolean | null;
}

export interface P010SettleObservation {
  expectedFingerprint: string | null;
  startingFingerprint: string | null;
  finalFingerprint: string | null;
  firstDetectedChangeMs: number | null;
  elapsedMs: number;
  readCount: number;
  timedOut: boolean;
  reachedExpected: boolean | null;
  documentChangeObserved: boolean;
}

export interface P010FailureAudit {
  classification: P010FailureClassification;
  reason: string;
  nativeUndoChangedDocument: boolean | null;
  redoChangedDocument: boolean | null;
}

export interface P010EvidenceRecord {
  evidenceSchemaVersion: 1;
  runId: string;
  caseId: P010CaseId;
  transactionStrategyId: P010TransactionStrategyId;
  targetProvenance: {
    mode: "EXPLICIT_NODE_IDS";
    requestedNodeIds: string[];
    resolvedNodeIds: string[];
    failedNodeIds: string[];
    fixtureRootId: string | null;
    roles: string[];
  };
  operationIds: string[];
  sourceTypes: readonly P010SourceType[];
  apiContract: P010ApiContract;
  semanticStateBefore: P010SemanticState | null;
  semanticStateAfterApply: P010SemanticState | null;
  semanticStateAfterFirstUndo: P010SemanticState | null;
  semanticStateAfterSecondUndo: P010SemanticState | null;
  semanticStateAfterRedo: P010SemanticState | null;
  manualTrackFingerprints: string[];
  styleInstanceFingerprints: string[];
  timelineFingerprints: string[];
  derivedAnimationFingerprints: string[];
  oneOrMultipleUndoStepsRequired: "one" | "two" | "none" | "unknown";
  rollbackAttempt: {
    attempted: boolean;
    method: "triggerUndo" | "native-undo" | "none";
    result: "restored" | "partial" | "failed" | "not-tested" | "unknown";
  };
  observation: P010UndoObservation;
  settleObservations: {
    firstUndo: P010SettleObservation | null;
    secondUndo: P010SettleObservation | null;
    redo: P010SettleObservation | null;
  };
  failureAudit: P010FailureAudit;
  errors: DiagnosticError[];
  warnings: DiagnosticWarning[];
  timeout: boolean;
  terminalClassification: P010TerminalClassification;
  result: {
    status: P006RunnerStatus;
    passed: boolean;
    reasons: string[];
    capabilityConclusion: P010CapabilityConclusion;
    nextStep: P010GuidedStep;
    nextInstruction: string;
  };
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

export interface P010RunResult {
  runId: string;
  status: P006RunnerStatus;
  startedAt: string;
  finishedAt: string;
  files: string[];
  evidence: P010EvidenceRecord[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P010RunManifest {
  runId: string;
  evidenceSchemaVersion: 1;
  build: "lab";
  startedAt: string;
  finishedAt: string;
  caseIds: P010CaseId[];
  evidenceFiles: string[];
  accepted: boolean;
  classification: "supported" | "mixed" | "unsupported" | "blocked" | "error";
  rejectionReason?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toDiagnosticValue = (value: unknown): DiagnosticValue => {
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

const normalizeEasing = (value: DiagnosticValue | undefined): DiagnosticValue => {
  if (!isRecord(value)) {
    return value ?? null;
  }
  return {
    type: value.type ?? null,
    easingFunctionCubicBezier: value.easingFunctionCubicBezier ?? null
  };
};

const normalizeManualTracks = (value: DiagnosticValue): DiagnosticValue => {
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).sort().map(([property, track]) => {
      if (!isRecord(track) || !Array.isArray(track.keyframes)) {
        return [property, sortValue(track)];
      }
      return [
        property,
        {
          property,
          baseValue: track.baseValue ?? null,
          keyframes: track.keyframes.map((entry) => {
            if (!isRecord(entry)) {
              return sortValue(entry);
            }
            return {
              timelinePosition: entry.timelinePosition ?? null,
              easing: normalizeEasing(entry.easing),
              value: entry.value ?? null
            };
          })
        }
      ];
    })
  );
};

const normalizeStyleInstances = (value: DiagnosticValue): DiagnosticValue => {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      return sortValue(entry);
    }
    return {
      styleId: entry.styleId ?? null,
      name: entry.name ?? null,
      duration: entry.duration ?? null,
      timelineOffset: entry.timelineOffset ?? null,
      props: entry.props ?? null
    };
  });
};

const normalizeTimelines = (value: DiagnosticValue): DiagnosticValue => {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      return sortValue(entry);
    }
    return {
      id: entry.id ?? null,
      duration: entry.duration ?? null
    };
  });
};

const normalizeDerivedAnimations = (value: DiagnosticValue): DiagnosticValue => {
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).sort().map(([property, animation]) => {
      if (!isRecord(animation)) {
        return [property, sortValue(animation)];
      }
      return [
        property,
        {
          timelineDuration: animation.timelineDuration ?? null,
          baseValue: animation.baseValue ?? null,
          tracks: Array.isArray(animation.tracks)
            ? animation.tracks.map((track) => {
                if (!isRecord(track) || !Array.isArray(track.keyframes)) {
                  return sortValue(track);
                }
                return {
                  keyframes: track.keyframes.map((entry) => {
                    if (!isRecord(entry)) {
                      return sortValue(entry);
                    }
                    return {
                      timelinePosition: entry.timelinePosition ?? null,
                      easing: normalizeEasing(entry.easing),
                      value: entry.value ?? null
                    };
                  })
                };
              })
            : []
        }
      ];
    })
  );
};

export const semanticComparableRaw = (state: P010SemanticState | null): DiagnosticValue | null => {
  if (state === null || !Array.isArray(state.raw)) {
    return null;
  }
  return state.raw.map((entry) => {
    if (!isRecord(entry)) {
      return sortValue(entry);
    }
    return {
      role: entry.role ?? null,
      manualKeyframeTracks: normalizeManualTracks(entry.manualKeyframeTracks ?? {}),
      animationStyles: normalizeStyleInstances(entry.animationStyles ?? []),
      timelines: normalizeTimelines(entry.timelines ?? []),
      animations: normalizeDerivedAnimations(entry.animations ?? {}),
      pluginData: entry.pluginData ?? null
    };
  });
};

export const semanticFingerprint = (state: P010SemanticState | null): string | null =>
  state === null ? null : stableFingerprint(semanticComparableRaw(state));

export const p010ApiContract = (): P010ApiContract => ({
  commitUndoSignature: "commitUndo(): void",
  commitUndoReturn: "void",
  commitUndoAsync: false,
  triggerUndoSignature: "triggerUndo(): void",
  triggerUndoReturn: "void",
  triggerUndoAsync: false,
  docsSummary: [
    "Installed @figma/plugin-typings 1.130.0 exposes figma.commitUndo(): void and figma.triggerUndo(): void.",
    "Official Figma docs say commitUndo commits actions to undo history and does not trigger undo.",
    "Official Figma docs say triggerUndo reverts to the last commitUndo state.",
    "Docs example indicates commitUndo splits previous writes from later writes; live Motion grouping remains P0-010 evidence."
  ],
  liveAmbiguities: [
    "Motion writes before first commitUndo and across message handlers.",
    "Awaited async boundaries.",
    "No-op writes and empty undo entries.",
    "Selection, reveal, plugin-data participation.",
    "Partial failure and triggerUndo rollback stack safety.",
    "Redo must be user-performed because installed Figma typings expose triggerUndo but no triggerRedo API."
  ]
});

export const createSemanticState = (
  label: string,
  nodes: readonly {
    id: string;
    role: string;
    manualKeyframeTracks: unknown;
    animationStyles: unknown;
    timelines: unknown;
    animations: unknown;
    pluginData?: unknown;
  }[]
): P010SemanticState => {
  const raw = nodes.map((node) => ({
    id: node.id,
    role: node.role,
    manualKeyframeTracks: toDiagnosticValue(node.manualKeyframeTracks),
    animationStyles: toDiagnosticValue(node.animationStyles),
    timelines: toDiagnosticValue(node.timelines),
    animations: toDiagnosticValue(node.animations),
    pluginData: toDiagnosticValue(node.pluginData ?? null)
  }));
  const countObjectKeys = (value: unknown): number => (isRecord(value) ? Object.keys(value).length : 0);
  const countArray = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
  return {
    label,
    nodeIds: nodes.map((node) => node.id),
    manualTrackFingerprint: stableFingerprint(raw.map((node) => node.manualKeyframeTracks)),
    styleInstanceFingerprint: stableFingerprint(raw.map((node) => node.animationStyles)),
    timelineFingerprint: stableFingerprint(raw.map((node) => node.timelines)),
    derivedAnimationFingerprint: stableFingerprint(raw.map((node) => node.animations)),
    pluginDataFingerprint: stableFingerprint(raw.map((node) => node.pluginData)),
    counts: {
      manualTracks: raw.reduce((sum, node) => sum + countObjectKeys(node.manualKeyframeTracks), 0),
      styleInstances: raw.reduce((sum, node) => sum + countArray(node.animationStyles), 0),
      timelines: raw.reduce((sum, node) => sum + countArray(node.timelines), 0),
      derivedAnimations: raw.reduce((sum, node) => sum + countObjectKeys(node.animations), 0)
    },
    raw
  };
};

export const semanticEqual = (left: P010SemanticState | null, right: P010SemanticState | null): boolean =>
  left !== null && right !== null && semanticFingerprint(left) === semanticFingerprint(right);

export interface P010SettleInput<T> {
  beforeAction: T;
  expected: T | null;
  read: () => Promise<T>;
  fingerprint: (value: T) => string;
  equalsExpected: (value: T, expected: T) => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
  documentChangeObserved?: () => boolean;
}

export const observeSettledState = async <T>({
  beforeAction,
  expected,
  read,
  fingerprint,
  equalsExpected,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 1200,
  intervalMs = 50,
  documentChangeObserved = () => false
}: P010SettleInput<T>): Promise<{ state: T; observation: P010SettleObservation }> => {
  const started = now();
  const startingFingerprint = fingerprint(beforeAction);
  const expectedFingerprint = expected === null ? null : fingerprint(expected);
  let readCount = 0;
  let firstDetectedChangeMs: number | null = null;
  let last = beforeAction;
  let lastFingerprint = startingFingerprint;
  while (now() - started <= timeoutMs) {
    last = await read();
    readCount += 1;
    lastFingerprint = fingerprint(last);
    if (lastFingerprint !== startingFingerprint) {
      firstDetectedChangeMs = now() - started;
    }
    if (expected !== null && equalsExpected(last, expected)) {
      return {
        state: last,
        observation: {
          expectedFingerprint,
          startingFingerprint,
          finalFingerprint: lastFingerprint,
          firstDetectedChangeMs,
          elapsedMs: now() - started,
          readCount,
          timedOut: false,
          reachedExpected: true,
          documentChangeObserved: documentChangeObserved()
        }
      };
    }
    if (firstDetectedChangeMs !== null) {
      break;
    }
    await sleep(intervalMs);
  }
  const reachedExpected = expected === null ? null : equalsExpected(last, expected);
  return {
    state: last,
    observation: {
      expectedFingerprint,
      startingFingerprint,
      finalFingerprint: lastFingerprint,
      firstDetectedChangeMs,
      elapsedMs: now() - started,
      readCount,
      timedOut: reachedExpected === true ? false : firstDetectedChangeMs === null,
      reachedExpected,
      documentChangeObserved: documentChangeObserved()
    }
  };
};

export const classifyUndoEvidence = (
  definition: P010CaseDefinition,
  before: P010SemanticState | null,
  afterApply: P010SemanticState | null,
  afterUndo: P010SemanticState | null,
  afterSecondUndo: P010SemanticState | null,
  afterRedo: P010SemanticState | null,
  errors: readonly DiagnosticError[]
): Pick<P010EvidenceRecord, "observation" | "oneOrMultipleUndoStepsRequired" | "terminalClassification" | "failureAudit" | "result"> => {
  const applyChanged = before !== null && afterApply !== null && !semanticEqual(before, afterApply);
  const firstUndoRestoredOriginal = afterUndo === null ? null : semanticEqual(before, afterUndo);
  const secondUndoRequired =
    afterSecondUndo === null ? null : firstUndoRestoredOriginal === true ? false : semanticEqual(before, afterSecondUndo);
  const redoRestoredApplied = afterRedo === null ? null : semanticEqual(afterApply, afterRedo);
  const separateUndoOrdering =
    definition.id !== "U06" || afterUndo === null || afterSecondUndo === null
      ? null
      : !semanticEqual(before, afterUndo) && semanticEqual(before, afterSecondUndo);
  const noOpCreatedHistory =
    definition.id === "U07"
      ? afterUndo === null
        ? "unknown"
        : semanticEqual(before, afterUndo)
          ? "none"
          : semanticEqual(afterApply, afterUndo)
            ? "empty-entry"
            : "normalized"
      : "unknown";
  const partialWritesRemained =
    definition.id === "U08" && afterApply !== null && before !== null ? !semanticEqual(before, afterApply) : null;
  const triggerUndoSafe = definition.id === "U08" && afterUndo !== null ? semanticEqual(before, afterUndo) : null;
  const nativeUndoChangedDocument = afterApply === null || afterUndo === null ? null : !semanticEqual(afterApply, afterUndo);
  const redoChangedDocument =
    afterRedo === null ? null : !semanticEqual(afterSecondUndo ?? afterUndo ?? afterApply, afterRedo);
  const oneOrMultipleUndoStepsRequired =
    firstUndoRestoredOriginal === true
      ? "one"
      : secondUndoRequired === true
        ? "two"
        : definition.id === "U07" && noOpCreatedHistory === "none"
          ? "none"
          : "unknown";
  const reasons = [
    applyChanged || definition.id === "U07" ? "apply-state-captured" : "apply-did-not-change",
    firstUndoRestoredOriginal === true ? "first-undo-restored" : "first-undo-not-proven",
    secondUndoRequired === true ? "second-undo-required" : "second-undo-not-required-or-unknown",
    redoRestoredApplied === true ? "redo-restored-applied" : "redo-not-proven",
    separateUndoOrdering === true ? "separate-actions-ordered" : "separate-actions-not-applicable-or-unproven",
    triggerUndoSafe === true ? "trigger-undo-safe" : "trigger-undo-not-proven"
  ];
  const controlledPartialFailureOnly =
    definition.id === "U08" && errors.length > 0 && errors.every((error) => error.code === "P010_CONTROLLED_PARTIAL_FAILURE");
  const hasFatalError = errors.length > 0 && !(controlledPartialFailureOnly && triggerUndoSafe === true);
  const redoWarningForSingleUndo =
    definition.id !== "U06" && firstUndoRestoredOriginal === true && afterRedo !== null && redoRestoredApplied !== true;
  let terminalClassification: P010TerminalClassification = "PARTIAL";
  let capabilityConclusion: P010CapabilityConclusion = "supported-with-warning";
  if (hasFatalError) {
    terminalClassification = "ERROR";
    capabilityConclusion = "unknown";
  } else if (definition.id === "U06" && separateUndoOrdering === true) {
    terminalClassification = "PASS";
    capabilityConclusion = "supported";
  } else if (definition.id === "U08" && triggerUndoSafe === true) {
    terminalClassification = redoRestoredApplied === true ? "PASS" : "PARTIAL";
    capabilityConclusion = "supported-with-warning";
  } else if (redoWarningForSingleUndo) {
    terminalClassification = "PARTIAL";
    capabilityConclusion = "supported-with-warning";
  } else if (firstUndoRestoredOriginal === true || (definition.id === "U07" && afterUndo !== null)) {
    terminalClassification = "PASS";
    capabilityConclusion = "supported";
  } else if (secondUndoRequired === true) {
    terminalClassification = "PARTIAL";
    capabilityConclusion = "supported-with-warning";
  } else if (afterUndo !== null || afterSecondUndo !== null) {
    terminalClassification = "FAIL";
    capabilityConclusion = "unsupported";
  }
  const status: P006RunnerStatus =
    terminalClassification === "PASS"
      ? "PASS"
      : terminalClassification === "PARTIAL"
        ? "PARTIAL"
        : terminalClassification === "FAIL"
          ? "FAIL"
          : "ERROR";
  let failureAudit: P010FailureAudit = {
    classification: "unknown",
    reason: "Terminal evidence is not yet complete.",
    nativeUndoChangedDocument,
    redoChangedDocument
  };
  if (hasFatalError) {
    failureAudit = {
      classification: errors.some((error) => error.code.includes("PRECONDITION") || error.message.includes("No applicable native Motion style"))
        ? "fixture contamination from a previous case"
        : "unknown",
      reason: errors.map((error) => error.message).join("; "),
      nativeUndoChangedDocument,
      redoChangedDocument
    };
  } else if (controlledPartialFailureOnly && triggerUndoSafe === true) {
    failureAudit = {
      classification: "unknown",
      reason:
        redoRestoredApplied === true
          ? "Controlled partial failure was rolled back by triggerUndo and native redo restored the applied state."
          : "Controlled partial failure was rolled back by triggerUndo; native redo did not restore the applied state.",
      nativeUndoChangedDocument,
      redoChangedDocument
    };
  } else if (redoWarningForSingleUndo) {
    failureAudit = {
      classification: "unknown",
      reason: "Native Undo reached the expected baseline, but native Redo did not restore the applied semantic state.",
      nativeUndoChangedDocument,
      redoChangedDocument
    };
  } else if (firstUndoRestoredOriginal === true || secondUndoRequired === true || (definition.id === "U07" && afterUndo !== null)) {
    failureAudit = {
      classification: "unknown",
      reason: "No failure; undo evidence reached expected semantic state.",
      nativeUndoChangedDocument,
      redoChangedDocument
    };
  } else if (afterUndo !== null && nativeUndoChangedDocument === false) {
    failureAudit = {
      classification: definition.strategy === "A_WRITE_THEN_COMMIT" ? "wrong commitUndo ordering" : "no history entry created",
      reason: "After-apply, first-undo, second-undo, and redo snapshots stayed semantically identical.",
      nativeUndoChangedDocument,
      redoChangedDocument
    };
  } else if (afterUndo !== null && nativeUndoChangedDocument === true) {
    failureAudit = {
      classification: "actual undo grouping failure",
      reason: "Native Undo changed the document but did not reach the expected semantic baseline.",
      nativeUndoChangedDocument,
      redoChangedDocument
    };
  }
  return {
    observation: {
      firstUndoRestoredOriginal,
      secondUndoRequired,
      redoRestoredApplied,
      separateUndoOrdering,
      noOpCreatedHistory,
      triggerUndoSafe,
      partialWritesRemained
    },
    oneOrMultipleUndoStepsRequired,
    terminalClassification,
    failureAudit,
    result: {
      status,
      passed: status === "PASS" || status === "PARTIAL",
      reasons,
      capabilityConclusion,
      nextStep: "complete",
      nextInstruction: "Case complete."
    }
  };
};

export const nextInstructionFor = (definition: P010CaseDefinition, step: P010GuidedStep): string => {
  switch (step) {
    case "prepare":
      return `Click Prepare ${definition.id} Fixture.`;
    case "apply":
      return `Click Apply ${definition.id} Operation.`;
    case "native-undo":
      return "Press Ctrl+Z or Cmd+Z in Figma, then click I Performed One Undo.";
    case "second-undo":
      return "Press Ctrl+Z or Cmd+Z one more time, then click I Performed Second Undo.";
    case "redo":
      return "Use Figma native Redo, then click I Performed Redo.";
    case "trigger-undo":
      return `Click Trigger Undo For ${definition.id}.`;
    case "complete":
      return "Terminal evidence captured.";
  }
};

export const createP010RunManifest = (result: P010RunResult): P010RunManifest => {
  const statuses = new Set(result.evidence.map((record) => record.result.status));
  const classification: P010RunManifest["classification"] =
    result.evidence.some((record) => record.result.status === "ERROR")
      ? "error"
      : result.evidence.some((record) => record.result.status === "BLOCKED_PRECONDITION")
        ? "blocked"
        : statuses.size === 1 && statuses.has("PASS")
          ? "supported"
          : result.evidence.every((record) => record.result.status === "UNSUPPORTED")
            ? "unsupported"
            : "mixed";
  return {
    runId: result.runId,
    evidenceSchemaVersion: p010EvidenceSchemaVersion,
    build: "lab",
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    caseIds: p010CaseDefinitions.map((definition) => definition.id),
    evidenceFiles: result.files,
    accepted: classification !== "error" && classification !== "blocked",
    classification,
    rejectionReason:
      classification === "error" || classification === "blocked"
        ? "P0-010 evidence did not terminate with a conclusive undo classification."
        : undefined
  };
};
