import type { DiagnosticError, DiagnosticValue, DiagnosticWarning, P006RunnerStatus } from "./diagnostics";
import { p011CaseDefinitions, type P011CapabilityAttempt, type P011CaseId, type P011NodeCategory } from "./p011Registry";

export const p011EvidenceSchemaVersion = 1;

export type P011TerminalClassification =
  | "PASS"
  | "PARTIAL"
  | "READ_ONLY"
  | "UNSUPPORTED"
  | "BLOCKED_PRECONDITION"
  | "FAIL"
  | "ERROR";

export type P011CapabilityClassification =
  | "supported"
  | "supported-with-warning"
  | "read-only"
  | "unsupported"
  | "unknown";

export type P011CapabilityName =
  | "readDerivedAnimations"
  | "readManualTracks"
  | "readStyleInstances"
  | "readTimelines"
  | "replaceManualTracks"
  | "removeReapplyStyleInstances"
  | "writeTimelineDuration"
  | "preserveSourceComponent"
  | "preserveSiblingInstances"
  | "preserveComponentLinkage"
  | "createLocalOverride"
  | "nestedInstanceTargeting"
  | "undoRestoration"
  | "redoRestoration";

export type P011CapabilityMap = Record<P011CapabilityName, P011CapabilityClassification>;

export interface P011MotionSnapshot {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  role: string;
  manualKeyframeTracks: DiagnosticValue;
  animationStyles: DiagnosticValue;
  timelines: DiagnosticValue;
  derivedAnimations: DiagnosticValue;
  overrides: DiagnosticValue;
  mainComponentId: string | null;
  componentSetId: string | null;
  componentPropertyReferences: DiagnosticValue;
  children: readonly { id: string; name: string; type: string }[];
  fingerprint: string;
}

export interface P011MutationAttempt {
  capability: P011CapabilityAttempt;
  attempted: boolean;
  accepted: boolean | null;
  rejected: boolean;
  error: DiagnosticError | null;
  beforeFingerprint: string | null;
  afterFingerprint: string | null;
  changed: boolean | null;
  semanticEqualToBefore: boolean | null;
  plannedMutation: DiagnosticValue | null;
}

export interface P011EvidenceRecord {
  evidenceSchemaVersion: 1;
  runId: string;
  caseId: P011CaseId;
  targetProvenance: {
    mode: "EXPLICIT_NODE_IDS";
    requestedNodeIds: string[];
    resolvedNodeIds: string[];
    failedNodeIds: string[];
    fixtureRootId: string | null;
    targetRole: string;
    targetRolePath: string[];
    ambiguous: boolean;
  };
  nodeId: string | null;
  nodeType: string | null;
  ancestorNodeTypes: string[];
  sourceComponentId: string | null;
  componentSetId: string | null;
  variantRelationship: DiagnosticValue;
  outerInstanceId: string | null;
  innerInstanceId: string | null;
  targetRole: string;
  nodeCategory: P011NodeCategory;
  sourceTypesVisible: {
    derivedAnimations: boolean;
    manualTracks: boolean;
    styleInstances: boolean;
    timelines: boolean;
  };
  apiContract: {
    typingsPackage: "@figma/plugin-typings";
    typingsVersion: string;
    componentApis: string[];
    instanceApis: string[];
    runtimeCaveat: string;
  };
  capabilityAttempts: P011MutationAttempt[];
  stateBefore: P011MotionSnapshot | null;
  stateAfter: P011MotionSnapshot | null;
  restoredState: P011MotionSnapshot | null;
  manualTrackFingerprints: string[];
  styleInstanceFingerprints: string[];
  timelineFingerprints: string[];
  derivedAnimationFingerprints: string[];
  sourceComponentFingerprints: {
    before: string | null;
    after: string | null;
    unchanged: boolean | null;
  };
  siblingInstanceFingerprints: {
    before: string | null;
    after: string | null;
    unchanged: boolean | null;
  };
  overrideState: {
    before: DiagnosticValue;
    after: DiagnosticValue;
    createdOrChanged: boolean | null;
  };
  componentLinkageState: {
    beforeMainComponentId: string | null;
    afterMainComponentId: string | null;
    preserved: boolean | null;
  };
  semanticEquality: {
    targetChanged: boolean | null;
    restoredToBefore: boolean | null;
    identityChanges: string[];
  };
  capabilityClassification: P011CapabilityMap;
  terminalClassification: P011TerminalClassification;
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

export interface P011RunResult {
  runId: string;
  status: P006RunnerStatus;
  startedAt: string;
  finishedAt: string;
  files: string[];
  evidence: P011EvidenceRecord[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P011RunManifest {
  runId: string;
  evidenceSchemaVersion: 1;
  build: "lab";
  startedAt: string;
  finishedAt: string;
  caseIds: P011CaseId[];
  evidenceFiles: string[];
  accepted: boolean;
  classification: "supported" | "mixed" | "read-only" | "unsupported" | "blocked" | "error";
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

const emptyCapabilities = (): P011CapabilityMap => ({
  readDerivedAnimations: "unknown",
  readManualTracks: "unknown",
  readStyleInstances: "unknown",
  readTimelines: "unknown",
  replaceManualTracks: "unknown",
  removeReapplyStyleInstances: "unknown",
  writeTimelineDuration: "unknown",
  preserveSourceComponent: "unknown",
  preserveSiblingInstances: "unknown",
  preserveComponentLinkage: "unknown",
  createLocalOverride: "unknown",
  nestedInstanceTargeting: "unknown",
  undoRestoration: "unknown",
  redoRestoration: "unknown"
});

export const classifyP011Capabilities = (
  before: P011MotionSnapshot | null,
  after: P011MotionSnapshot | null,
  restored: P011MotionSnapshot | null,
  attempts: readonly P011MutationAttempt[],
  sourceUnchanged: boolean | null,
  siblingUnchanged: boolean | null,
  linkagePreserved: boolean | null,
  overrideChanged: boolean | null,
  category: P011NodeCategory
): P011CapabilityMap => {
  const capabilities = emptyCapabilities();
  capabilities.readDerivedAnimations = before?.derivedAnimations !== null && before?.derivedAnimations !== undefined ? "supported" : "unknown";
  capabilities.readManualTracks =
    before !== null &&
    typeof before.manualKeyframeTracks === "object" &&
    before.manualKeyframeTracks !== null &&
    !Array.isArray(before.manualKeyframeTracks) &&
    Object.keys(before.manualKeyframeTracks).length > 0
      ? "supported"
      : "read-only";
  capabilities.readStyleInstances = before !== null && Array.isArray(before.animationStyles) ? "supported" : "unknown";
  capabilities.readTimelines = before !== null && Array.isArray(before.timelines) ? "supported" : "unknown";
  for (const attempt of attempts) {
    const value: P011CapabilityClassification = attempt.accepted === true ? "supported" : attempt.rejected ? "unsupported" : "unknown";
    if (attempt.capability === "replace-manual-track") {
      capabilities.replaceManualTracks = value;
    }
    if (attempt.capability === "remove-reapply-style") {
      capabilities.removeReapplyStyleInstances = value;
    }
    if (attempt.capability === "write-timeline-duration") {
      capabilities.writeTimelineDuration = value;
    }
    if (attempt.capability === "verify-undo") {
      capabilities.undoRestoration = restored !== null && before !== null && restored.fingerprint === before.fingerprint ? "supported" : value;
    }
  }
  capabilities.preserveSourceComponent = sourceUnchanged === null ? "unknown" : sourceUnchanged ? "supported" : "unsupported";
  capabilities.preserveSiblingInstances = siblingUnchanged === null ? "unknown" : siblingUnchanged ? "supported" : "unsupported";
  capabilities.preserveComponentLinkage = linkagePreserved === null ? "unknown" : linkagePreserved ? "supported" : "unsupported";
  capabilities.createLocalOverride = overrideChanged === null ? "unknown" : overrideChanged ? "supported-with-warning" : "unsupported";
  capabilities.nestedInstanceTargeting =
    category === "nested-instance-root" || category === "nested-instance-descendant"
      ? attempts.some((attempt) => attempt.accepted === true)
        ? "supported"
        : attempts.some((attempt) => attempt.rejected)
          ? "unsupported"
          : "unknown"
      : "unknown";
  capabilities.redoRestoration = "unknown";
  if (after !== null && before !== null && after.fingerprint === before.fingerprint) {
    for (const attempt of attempts) {
      if (attempt.accepted === true && attempt.capability !== "read-motion") {
        capabilities[attempt.capability === "replace-manual-track" ? "replaceManualTracks" : attempt.capability === "write-timeline-duration" ? "writeTimelineDuration" : "removeReapplyStyleInstances"] = "supported-with-warning";
      }
    }
  }
  return capabilities;
};

export const classifyP011Terminal = (
  attempts: readonly P011MutationAttempt[],
  errors: readonly DiagnosticError[],
  warnings: readonly DiagnosticWarning[],
  targetResolved: boolean
): { terminalClassification: P011TerminalClassification; status: P006RunnerStatus; reasons: string[] } => {
  const reasons = [
    targetResolved ? "target-resolved" : "target-not-resolved",
    attempts.some((attempt) => attempt.capability === "read-motion" && attempt.accepted === true) ? "read-supported" : "read-not-proven",
    attempts.some((attempt) => attempt.accepted === true && attempt.changed === true) ? "write-changed-target" : "no-target-write-proven",
    warnings.length > 0 ? "warnings-recorded" : "no-warnings"
  ];
  if (!targetResolved || errors.some((error) => error.code.includes("PRECONDITION"))) {
    return { terminalClassification: "BLOCKED_PRECONDITION", status: "BLOCKED_PRECONDITION", reasons };
  }
  if (errors.some((error) => !error.code.includes("WRITE_REJECTED"))) {
    return { terminalClassification: "ERROR", status: "ERROR", reasons };
  }
  const writeAttempts = attempts.filter((attempt) => attempt.capability !== "read-motion" && attempt.capability !== "verify-linkage" && attempt.capability !== "verify-isolation");
  if (writeAttempts.some((attempt) => attempt.accepted === true && attempt.changed === true)) {
    return {
      terminalClassification: warnings.length > 0 || writeAttempts.some((attempt) => attempt.semanticEqualToBefore === true) ? "PARTIAL" : "PASS",
      status: warnings.length > 0 ? "PARTIAL" : "PASS",
      reasons
    };
  }
  if (writeAttempts.length > 0 && writeAttempts.every((attempt) => attempt.rejected || attempt.semanticEqualToBefore === true)) {
    return { terminalClassification: "READ_ONLY", status: "READ_ONLY", reasons };
  }
  if (attempts.some((attempt) => attempt.capability === "read-motion" && attempt.accepted === true)) {
    return { terminalClassification: "PARTIAL", status: "PARTIAL", reasons };
  }
  return { terminalClassification: "UNSUPPORTED", status: "UNSUPPORTED", reasons };
};

export const createP011RunManifest = (result: P011RunResult): P011RunManifest => {
  const classifications = new Set(result.evidence.map((record) => record.terminalClassification));
  const classification: P011RunManifest["classification"] = classifications.has("ERROR")
    ? "error"
    : classifications.has("BLOCKED_PRECONDITION")
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
    evidenceSchemaVersion: p011EvidenceSchemaVersion,
    build: "lab",
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    caseIds: p011CaseDefinitions.map((definition) => definition.id),
    evidenceFiles: result.files,
    accepted: classification !== "error" && classification !== "blocked",
    classification,
    rejectionReason:
      classification === "error" || classification === "blocked"
        ? "P0-011 evidence did not terminate with conclusive component/instance behavior."
        : undefined
  };
};
