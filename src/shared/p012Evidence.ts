import type { DiagnosticError, DiagnosticValue, DiagnosticWarning, P006RunnerStatus } from "./diagnostics";
import { p012CaseDefinitions, type P012CaseId, type P012PropertyKind } from "./p012Registry";

export const p012EvidenceSchemaVersion = 1;

export type P012TerminalClassification =
  | "PASS"
  | "PARTIAL"
  | "READ_ONLY"
  | "UNSUPPORTED"
  | "BLOCKED_PRECONDITION"
  | "FAIL"
  | "ERROR";

export type P012MotionSourceType = "manualKeyframeTracks" | "animations" | "timelines" | "componentProperties" | "variantProperties" | "none";
export type P012SemanticTrackClassification = "component-property-track" | "property-api-only" | "variant-instance-state" | "not-exposed" | "unsupported";
export type P012WritableResult = "WRITABLE" | "READ_ONLY" | "UNSUPPORTED" | "BLOCKED_PRECONDITION" | "ERROR";

export interface P012PropertyDescriptor {
  name: string;
  stableIdentifier: string;
  displayName: string;
  type: P012PropertyKind;
  defaultValue: DiagnosticValue;
  value: DiagnosticValue;
  preferredValues: DiagnosticValue;
  variantOptions: string[];
}

export interface P012Fingerprint {
  sourceComponent: string | null;
  componentSet: string | null;
  targetInstance: string | null;
  siblingInstance: string | null;
  nestedInstance: string | null;
  unrelatedMotion: string | null;
}

export interface P012EvidenceRecord {
  evidenceSchemaVersion: 1;
  runId: string;
  caseId: P012CaseId;
  targetProvenance: {
    mode: "EXPLICIT_NODE_IDS";
    requestedNodeIds: string[];
    resolvedNodeIds: string[];
    failedNodeIds: string[];
    fixtureRootId: string | null;
    targetRole: string;
    siblingRole: string;
    sourceRole: string;
  };
  componentId: string | null;
  componentSetId: string | null;
  instanceId: string | null;
  siblingInstanceId: string | null;
  nestedInstanceId: string | null;
  componentPropertyIdentifier: string | null;
  propertyType: P012PropertyKind;
  propertyValue: {
    before: DiagnosticValue;
    planned: DiagnosticValue;
    after: DiagnosticValue;
    restored: DiagnosticValue;
  };
  definitions: P012PropertyDescriptor[];
  targetProperties: DiagnosticValue;
  siblingProperties: DiagnosticValue;
  variantProperties: DiagnosticValue;
  rawTrackShape: DiagnosticValue;
  motionSourceType: P012MotionSourceType;
  semanticTrackClassification: P012SemanticTrackClassification;
  writableResult: P012WritableResult;
  sourceAndSiblingFingerprints: {
    before: P012Fingerprint;
    after: P012Fingerprint;
    restored: P012Fingerprint;
    sourceUnchanged: boolean | null;
    siblingUnchanged: boolean | null;
    nestedUnchanged: boolean | null;
    unrelatedMotionUnchanged: boolean | null;
  };
  overrideState: {
    before: DiagnosticValue;
    after: DiagnosticValue;
    createdOrChanged: boolean | null;
  };
  componentLinkage: {
    targetMainComponentIdBefore: string | null;
    targetMainComponentIdAfter: string | null;
    siblingMainComponentIdBefore: string | null;
    siblingMainComponentIdAfter: string | null;
    preserved: boolean | null;
  };
  restoration: {
    attempted: boolean;
    restored: boolean | null;
    restoredBy: "setProperties" | "undo" | "none";
  };
  undoRedo: {
    undoTested: boolean;
    undoRestored: boolean | null;
    redoTested: boolean;
    redoRestoredMutation: boolean | null;
  };
  terminalClassification: P012TerminalClassification;
  result: {
    status: P006RunnerStatus;
    passed: boolean;
    reasons: string[];
  };
  errors: DiagnosticError[];
  warnings: DiagnosticWarning[];
  timeout: boolean;
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

export interface P012RunResult {
  runId: string;
  status: P006RunnerStatus;
  startedAt: string;
  finishedAt: string;
  files: string[];
  evidence: P012EvidenceRecord[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P012RunManifest {
  runId: string;
  evidenceSchemaVersion: 1;
  build: "lab";
  startedAt: string;
  finishedAt: string;
  caseIds: P012CaseId[];
  evidenceFiles: string[];
  accepted: boolean;
  classification: "supported" | "mixed" | "read-only" | "unsupported" | "blocked" | "error";
  rejectionReason?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toP012DiagnosticValue = (value: unknown): DiagnosticValue => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toP012DiagnosticValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toP012DiagnosticValue(entry)]));
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

export const p012Fingerprint = (value: unknown): string => JSON.stringify(sortValue(toP012DiagnosticValue(value)));

const stripGeneratedIds = (value: DiagnosticValue): DiagnosticValue => {
  if (Array.isArray(value)) {
    return value.map(stripGeneratedIds);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "id")
        .map(([key, entry]) => [key, stripGeneratedIds(entry)])
    );
  }
  return value;
};

export const p012SemanticFingerprint = (value: unknown): string =>
  JSON.stringify(sortValue(stripGeneratedIds(toP012DiagnosticValue(value))));

export const displayNameFromComponentPropertyKey = (propertyName: string): string =>
  propertyName.includes("#") ? propertyName.slice(0, propertyName.indexOf("#")) : propertyName;

export const classifyP012Terminal = (
  writableResult: P012WritableResult,
  semanticTrackClassification: P012SemanticTrackClassification,
  errors: readonly DiagnosticError[],
  targetResolved: boolean,
  restored: boolean | null
): { terminalClassification: P012TerminalClassification; status: P006RunnerStatus; reasons: string[] } => {
  const reasons = [
    targetResolved ? "target-resolved" : "target-not-resolved",
    `semantic-track-${semanticTrackClassification}`,
    `write-${writableResult.toLowerCase()}`,
    restored === null ? "restoration-not-tested" : restored ? "restored" : "not-restored"
  ];
  if (!targetResolved) {
    return { terminalClassification: "BLOCKED_PRECONDITION", status: "BLOCKED_PRECONDITION", reasons };
  }
  if (errors.some((error) => !error.code.includes("UNSUPPORTED") && !error.code.includes("READ_ONLY"))) {
    return { terminalClassification: "ERROR", status: "ERROR", reasons };
  }
  if (writableResult === "WRITABLE") {
    return {
      terminalClassification: semanticTrackClassification === "component-property-track" && restored !== false ? "PASS" : "PARTIAL",
      status: semanticTrackClassification === "component-property-track" && restored !== false ? "PASS" : "PARTIAL",
      reasons
    };
  }
  if (writableResult === "READ_ONLY") {
    return { terminalClassification: "READ_ONLY", status: "READ_ONLY", reasons };
  }
  if (writableResult === "BLOCKED_PRECONDITION") {
    return { terminalClassification: "BLOCKED_PRECONDITION", status: "BLOCKED_PRECONDITION", reasons };
  }
  return { terminalClassification: "UNSUPPORTED", status: "UNSUPPORTED", reasons };
};

export const createP012RunManifest = (result: P012RunResult): P012RunManifest => {
  const classifications = new Set(result.evidence.map((record) => record.terminalClassification));
  const classification: P012RunManifest["classification"] = classifications.has("ERROR")
    ? "error"
    : classifications.has("BLOCKED_PRECONDITION") && classifications.size === 1
      ? "blocked"
      : classifications.size === 1 && classifications.has("PASS")
        ? "supported"
        : classifications.size === 1 && classifications.has("READ_ONLY")
          ? "read-only"
          : classifications.size === 1 && classifications.has("UNSUPPORTED")
            ? "unsupported"
            : "mixed";
  return {
    runId: result.runId,
    evidenceSchemaVersion: p012EvidenceSchemaVersion,
    build: "lab",
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    caseIds: p012CaseDefinitions.map((definition) => definition.id),
    evidenceFiles: result.files,
    accepted: classification !== "error",
    classification,
    rejectionReason: classification === "error" ? "P0-012 evidence did not terminate conclusively." : undefined
  };
};
