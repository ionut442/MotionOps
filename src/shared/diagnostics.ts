import type { RequestId } from "./messages";
import type { P006TestId } from "./p006Registry";
import type { P007CaseId } from "./p007Registry";
import type { P007EvidenceRecord, P007RunManifest, P007RunResult } from "./p007Evidence";
import type { P008CaseId } from "./p008Registry";
import type { P008EvidenceRecord, P008RunManifest, P008RunResult } from "./p008Evidence";
import type { P009CaseId } from "./p009Registry";
import type { P009EvidenceRecord, P009RunManifest, P009RunResult } from "./p009Evidence";
import type { P010Action, P010CaseId } from "./p010Registry";
import type { P010TransactionStrategyId } from "./p010Registry";
import type { P010EvidenceRecord, P010RunManifest, P010RunResult } from "./p010Evidence";
import type { P011CaseId } from "./p011Registry";
import type { P011EvidenceRecord, P011RunManifest, P011RunResult } from "./p011Evidence";
import type { P011ConstructionDiagnostic, P011RoleInfo } from "./p011FixtureTopology";
import type { P012CaseId } from "./p012Registry";
import type { P012EvidenceRecord, P012RunManifest, P012RunResult } from "./p012Evidence";

export const implementedMotionDiagnosticCommands = [
  "GET_ENVIRONMENT",
  "READ_CURRENT_SELECTION",
  "READ_MOTION_DATA",
  "READ_MANUAL_TRACKS",
  "READ_ANIMATION_STYLES",
  "READ_DERIVED_ANIMATIONS",
  "READ_TIMELINES",
  "VERIFY_EXPLICIT_TARGET_PIPELINE",
  "CREATE_DISPOSABLE_FIXTURE",
  "CLEAR_DISPOSABLE_FIXTURE",
  "EXPORT_LAST_RESULT"
] as const;

export const futureMotionDiagnosticCommands = [
  "TEST_MANUAL_TRACK_WRITE",
  "TEST_STYLE_UPDATE",
  "TEST_TIMELINE_DURATION",
  "TEST_UNDO_BOUNDARY",
  "TEST_COMPONENT_INSTANCE_MATRIX",
  "TEST_COMPONENT_PROPERTY_TRACK",
  "TEST_PAINT_EFFECT_TRACK",
  "TEST_DYNAMIC_PAGE_SCAN"
] as const;

export type MotionDiagnosticCommand = (typeof implementedMotionDiagnosticCommands)[number];
export type FutureMotionDiagnosticCommand = (typeof futureMotionDiagnosticCommands)[number];
export type AnyMotionDiagnosticCommand = MotionDiagnosticCommand | FutureMotionDiagnosticCommand;

export type DiagnosticStatus =
  | "SUPPORTED"
  | "UNSUPPORTED"
  | "UNKNOWN"
  | "ERROR"
  | "PARTIAL"
  | "NOT_TESTED";

export type JsonPrimitive = string | number | boolean | null;
export type DiagnosticValue =
  | JsonPrimitive
  | DiagnosticValue[]
  | { readonly [key: string]: DiagnosticValue };

export interface DiagnosticWarning {
  code: string;
  message: string;
  path?: string;
}

export interface DiagnosticError {
  code: string;
  message: string;
  path?: string;
}

export interface DiagnosticCapability {
  name: string;
  status: DiagnosticStatus;
  summary: string;
  evidence?: DiagnosticValue;
}

export interface DiagnosticEnvironment {
  editorType: string;
  figmaMode: string;
  currentPageId: string;
  currentPageName: string;
  selectionCount: number;
  dynamicPageAccess: "configured";
  apiLabEnabled: boolean;
  runtimeSignals: Record<string, boolean | string | number>;
}

export type DiagnosticTargetSpec =
  | {
      mode: "EXPLICIT_NODE_IDS";
      nodeIds: string[];
    }
  | {
      mode: "CURRENT_SELECTION";
    }
  | {
      mode: "EMPTY";
    };

export interface DiagnosticTestContext {
  testCaseId: string;
  subcaseId: string;
  expectedRoles: string[];
}

export interface ResolvedDiagnosticTargetFailure {
  nodeId: string;
  reason: "NOT_FOUND" | "REMOVED" | "NOT_SCENE_NODE" | "WRONG_PAGE" | "UNSUPPORTED";
  message: string;
}

export interface ResolvedDiagnosticTargetSummary {
  mode: DiagnosticTargetSpec["mode"];
  requestedNodeIds: string[];
  resolvedNodeIds: string[];
  failed: ResolvedDiagnosticTargetFailure[];
  canvasSelectionNodeIds: string[];
}

export interface PerNodeDiagnosticResult<T extends DiagnosticValue = DiagnosticValue> {
  requestedIndex: number;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  pageId: string;
  role?: string;
  status: DiagnosticStatus;
  data: T | null;
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface DiagnosticResult {
  command: AnyMotionDiagnosticCommand;
  status: DiagnosticStatus;
  timestamp: string;
  durationMs: number;
  environment: DiagnosticEnvironment;
  target: ResolvedDiagnosticTargetSummary;
  nodesReadCount: number;
  summary: string;
  capabilities: DiagnosticCapability[];
  evidence: DiagnosticValue;
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface MotionDiagnosticRequest {
  type: "MOTION_DIAGNOSTIC_REQUEST";
  requestId: RequestId;
  command: AnyMotionDiagnosticCommand;
  target: DiagnosticTargetSpec;
  testContext?: DiagnosticTestContext;
}

export interface MotionDiagnosticResultMessage {
  type: "MOTION_DIAGNOSTIC_RESULT";
  requestId: RequestId;
  result: DiagnosticResult;
}

export type P006RunnerStatus =
  | "PASS"
  | "FAIL"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "READ_ONLY"
  | "BLOCKED_PRECONDITION"
  | "ERROR"
  | "CANCELLED";

export interface P006FixtureSummary {
  rootId: string | null;
  testCaseIds: P006TestId[];
  createdNodeIds: string[];
  mutatedNodeIds: string[];
  warnings: DiagnosticWarning[];
  p008Readiness?: P008FixtureReadiness;
  p009Readiness?: P009FixtureReadiness;
  p010StyleReadiness?: P010StyleReadiness;
  p011Readiness?: P011FixtureReadiness;
}

export type P008PreflightStatus =
  | "VALID_STYLE_SELECTED"
  | "NO_APPLICABLE_STYLE"
  | "AMBIGUOUS_STYLE_SHAPE"
  | "STYLE_APPLY_PROBE_FAILED";

export interface P008CandidateDiagnostic {
  index: number;
  classification: "applicable-animation-style" | "unsupported-candidate";
  applicationIdField: "styleId";
  applicationIdPresent: boolean;
  idPrefix: string | null;
  applicable: boolean;
  rejectionReason?: string;
  label: string | null;
  propKeys: string[];
  rawFingerprint: string;
}

export interface P008FixtureReadiness {
  preflightStatus: P008PreflightStatus;
  availableCandidateCount: number;
  applicableCandidateCount: number;
  selectedStyleIdStatus: "present" | "missing" | "rejected";
  selectedStyleIdPrefix: string | null;
  fixtureStyleCount: number;
  appliedFixtureInstanceCount: number;
  appliedInstanceIdStatus: "present" | "missing";
  duplicateCount: number;
  ready: boolean;
  rejectionCategories: string[];
  candidates: P008CandidateDiagnostic[];
}

export interface P009FixtureReadiness {
  ready: boolean;
  targetCount: number;
  timelineMethod: "setTimelineDuration(id: string, duration: number): void";
}

export interface P010StyleReadiness {
  ready: boolean;
  availableCandidateCount: number;
  applicableCandidateCount: number;
  selectedApplicationStyleId: string | null;
  appliedInstanceIdStatus: "present" | "missing";
  appliedFixtureInstanceCount: number;
  duplicateCount: number;
  fixtureStyleCount: number;
  prerequisite: string | null;
}

export interface P011FixtureReadiness {
  status: P006RunnerStatus;
  ready: boolean;
  failedStage: string | null;
  roleCount: number;
  expectedRoleCount: number;
  roleTable: P011RoleInfo[];
  diagnostics: P011ConstructionDiagnostic[];
  errors: DiagnosticError[];
  cleanupAttempted: boolean;
  cleanupCompleted: boolean;
}

export interface P006TargetPipelineResult {
  status: P006RunnerStatus;
  requested: number;
  resolved: number;
  nodesRead: number;
  requestedNodeIds: string[];
  resolvedNodeIds: string[];
  canvasSelectionNodeIds: string[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P006EvidenceEnvelope {
  evidenceSchemaVersion: 2;
  runId: string;
  testCaseId: P006TestId;
  testTitle: string;
  subcaseId: string;
  subcaseTitle: string;
  command: MotionDiagnosticCommand;
  timestamp: string;
  filename: string;
  page: {
    id: string;
    name: string;
  };
  target: {
    mode: DiagnosticTargetSpec["mode"];
    requestedNodeIds: string[];
    resolvedNodeIds: string[];
    failedNodeIds: string[];
    expectedRoles: string[];
  };
  canvasState: {
    currentPageId: string;
    canvasSelectionNodeIds: string[];
    canvasSelectionCount: number;
  };
  diagnostic: {
    nodesReadCount: number;
    result: DiagnosticValue;
  };
  diagnosticStatus: DiagnosticStatus;
  raw: DiagnosticResult;
  summary: string;
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
  collector: {
    target: "http://localhost:3847/api/evidence";
    writeStatus: "PENDING_UI_WRITE";
  };
  plugin: {
    version: string;
    build: "lab";
  };
}

export interface P006TestRunResult {
  testId: P006TestId;
  runId: string;
  status: P006RunnerStatus;
  startedAt: string;
  finishedAt: string;
  files: string[];
  evidence: P006EvidenceEnvelope[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}

export interface P006RunManifest {
  runId: string;
  evidenceSchemaVersion: 2;
  build: "lab";
  startedAt: string;
  finishedAt: string;
  testIds: P006TestId[];
  evidenceFiles: string[];
  accepted: boolean;
  rejectionReason?: string;
  targetPipeline: P006TargetPipelineResult | null;
}

export interface P006FixtureCommandMessage {
  type: "P006_FIXTURE_COMMAND";
  requestId: RequestId;
  command: "CREATE_OR_REFRESH_ALL" | "CLEAR_GENERATED";
}

export interface P006RunTestMessage {
  type: "P006_RUN_TEST";
  requestId: RequestId;
  testId: P006TestId;
}

export interface P006RunAllMessage {
  type: "P006_RUN_ALL";
  requestId: RequestId;
}

export interface P006VerifyTargetPipelineMessage {
  type: "P006_VERIFY_TARGET_PIPELINE";
  requestId: RequestId;
}

export interface P006FixtureResultMessage {
  type: "P006_FIXTURE_RESULT";
  requestId: RequestId;
  result: P006FixtureSummary;
}

export interface P006TestRunResultMessage {
  type: "P006_TEST_RUN_RESULT";
  requestId: RequestId;
  result: P006TestRunResult;
}

export interface P006RunAllResultMessage {
  type: "P006_RUN_ALL_RESULT";
  requestId: RequestId;
  results: P006TestRunResult[];
  manifest: P006RunManifest;
}

export interface P006TargetPipelineResultMessage {
  type: "P006_TARGET_PIPELINE_RESULT";
  requestId: RequestId;
  result: P006TargetPipelineResult;
}

export interface P007FixtureCommandMessage {
  type: "P007_FIXTURE_COMMAND";
  requestId: RequestId;
  command: "CREATE_OR_REFRESH_ALL" | "CLEAR_GENERATED";
}

export interface P007RunCaseMessage {
  type: "P007_RUN_CASE";
  requestId: RequestId;
  caseId: P007CaseId;
}

export interface P007RunAllMessage {
  type: "P007_RUN_ALL";
  requestId: RequestId;
}

export interface P007VerifyTargetPipelineMessage {
  type: "P007_VERIFY_TARGET_PIPELINE";
  requestId: RequestId;
}

export interface P007FixtureResultMessage {
  type: "P007_FIXTURE_RESULT";
  requestId: RequestId;
  result: P006FixtureSummary;
}

export interface P007RunResultMessage {
  type: "P007_RUN_RESULT";
  requestId: RequestId;
  result: P007RunResult;
  manifest: P007RunManifest;
}

export interface P007TargetPipelineResultMessage {
  type: "P007_TARGET_PIPELINE_RESULT";
  requestId: RequestId;
  result: P006TargetPipelineResult;
}

export interface P008FixtureCommandMessage {
  type: "P008_FIXTURE_COMMAND";
  requestId: RequestId;
  command: "CREATE_OR_REFRESH_ALL" | "CLEAR_GENERATED";
}

export interface P008RunCaseMessage {
  type: "P008_RUN_CASE";
  requestId: RequestId;
  caseId: P008CaseId;
}

export interface P008RunAllMessage {
  type: "P008_RUN_ALL";
  requestId: RequestId;
}

export interface P008VerifyTargetPipelineMessage {
  type: "P008_VERIFY_TARGET_PIPELINE";
  requestId: RequestId;
}

export interface P008FixtureResultMessage {
  type: "P008_FIXTURE_RESULT";
  requestId: RequestId;
  result: P006FixtureSummary;
}

export interface P008RunResultMessage {
  type: "P008_RUN_RESULT";
  requestId: RequestId;
  result: P008RunResult;
  manifest: P008RunManifest;
}

export interface P008TargetPipelineResultMessage {
  type: "P008_TARGET_PIPELINE_RESULT";
  requestId: RequestId;
  result: P006TargetPipelineResult;
}

export interface P009FixtureCommandMessage {
  type: "P009_FIXTURE_COMMAND";
  requestId: RequestId;
  command: "CREATE_OR_REFRESH_ALL" | "CLEAR_GENERATED";
}

export interface P009RunCaseMessage {
  type: "P009_RUN_CASE";
  requestId: RequestId;
  caseId: P009CaseId;
}

export interface P009RunAllMessage {
  type: "P009_RUN_ALL";
  requestId: RequestId;
}

export interface P009VerifyTargetPipelineMessage {
  type: "P009_VERIFY_TARGET_PIPELINE";
  requestId: RequestId;
}

export interface P009FixtureResultMessage {
  type: "P009_FIXTURE_RESULT";
  requestId: RequestId;
  result: P006FixtureSummary;
}

export interface P009RunResultMessage {
  type: "P009_RUN_RESULT";
  requestId: RequestId;
  result: P009RunResult;
  manifest: P009RunManifest;
}

export interface P009TargetPipelineResultMessage {
  type: "P009_TARGET_PIPELINE_RESULT";
  requestId: RequestId;
  result: P006TargetPipelineResult;
}

export interface P010FixtureCommandMessage {
  type: "P010_FIXTURE_COMMAND";
  requestId: RequestId;
  command: "CREATE_OR_REFRESH_ALL" | "CLEAR_GENERATED";
}

export interface P010RunActionMessage {
  type: "P010_RUN_ACTION";
  requestId: RequestId;
  caseId: P010CaseId;
  action: P010Action;
  strategyId?: P010TransactionStrategyId;
}

export interface P010VerifyTargetPipelineMessage {
  type: "P010_VERIFY_TARGET_PIPELINE";
  requestId: RequestId;
}

export interface P010FixtureResultMessage {
  type: "P010_FIXTURE_RESULT";
  requestId: RequestId;
  result: P006FixtureSummary;
}

export interface P010RunResultMessage {
  type: "P010_RUN_RESULT";
  requestId: RequestId;
  result: P010RunResult;
  manifest: P010RunManifest;
}

export interface P010TargetPipelineResultMessage {
  type: "P010_TARGET_PIPELINE_RESULT";
  requestId: RequestId;
  result: P006TargetPipelineResult;
}

export interface P011FixtureCommandMessage {
  type: "P011_FIXTURE_COMMAND";
  requestId: RequestId;
  command: "CREATE_OR_REFRESH_ALL" | "CREATE_AND_SELF_VERIFY" | "CLEAR_GENERATED";
}

export interface P011RunCaseMessage {
  type: "P011_RUN_CASE";
  requestId: RequestId;
  caseId: P011CaseId;
}

export interface P011RunAllMessage {
  type: "P011_RUN_ALL";
  requestId: RequestId;
}

export interface P011VerifyTargetPipelineMessage {
  type: "P011_VERIFY_TARGET_PIPELINE";
  requestId: RequestId;
}

export interface P011FixtureResultMessage {
  type: "P011_FIXTURE_RESULT";
  requestId: RequestId;
  result: P006FixtureSummary;
}

export interface P011RunResultMessage {
  type: "P011_RUN_RESULT";
  requestId: RequestId;
  result: P011RunResult;
  manifest: P011RunManifest;
}

export interface P011TargetPipelineResultMessage {
  type: "P011_TARGET_PIPELINE_RESULT";
  requestId: RequestId;
  result: P006TargetPipelineResult;
}

export interface P012FixtureCommandMessage {
  type: "P012_FIXTURE_COMMAND";
  requestId: RequestId;
  command: "CREATE_OR_REFRESH_ALL" | "CLEAR_GENERATED";
}

export interface P012RunCaseMessage {
  type: "P012_RUN_CASE";
  requestId: RequestId;
  caseId: P012CaseId;
}

export interface P012RunAllMessage {
  type: "P012_RUN_ALL";
  requestId: RequestId;
}

export interface P012VerifyTargetPipelineMessage {
  type: "P012_VERIFY_TARGET_PIPELINE";
  requestId: RequestId;
}

export interface P012FixtureResultMessage {
  type: "P012_FIXTURE_RESULT";
  requestId: RequestId;
  result: P006FixtureSummary;
}

export interface P012RunResultMessage {
  type: "P012_RUN_RESULT";
  requestId: RequestId;
  result: P012RunResult;
  manifest: P012RunManifest;
}

export interface P012TargetPipelineResultMessage {
  type: "P012_TARGET_PIPELINE_RESULT";
  requestId: RequestId;
  result: P006TargetPipelineResult;
}

export interface MotionDiagnosticExportRequest {
  type: "MOTION_DIAGNOSTIC_EXPORT_REQUEST";
  requestId: RequestId;
}

export const isDiagnosticStatus = (value: unknown): value is DiagnosticStatus =>
  value === "SUPPORTED" ||
  value === "UNSUPPORTED" ||
  value === "UNKNOWN" ||
  value === "ERROR" ||
  value === "FAIL" ||
  value === "PARTIAL" ||
  value === "READ_ONLY" ||
  value === "BLOCKED_PRECONDITION" ||
  value === "NOT_TESTED";

export const isAnyMotionDiagnosticCommand = (
  value: unknown
): value is AnyMotionDiagnosticCommand =>
  typeof value === "string" &&
  ([...implementedMotionDiagnosticCommands, ...futureMotionDiagnosticCommands] as string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isDiagnosticTargetSpec = (value: unknown): value is DiagnosticTargetSpec => {
  if (!isRecord(value)) {
    return false;
  }

  if (value.mode === "CURRENT_SELECTION" || value.mode === "EMPTY") {
    return true;
  }

  return value.mode === "EXPLICIT_NODE_IDS" && isStringArray(value.nodeIds);
};

const isDiagnosticTestContext = (value: unknown): value is DiagnosticTestContext => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.testCaseId) &&
    isNonEmptyString(value.subcaseId) &&
    isStringArray(value.expectedRoles)
  );
};

export const isMotionDiagnosticRequest = (
  value: unknown
): value is MotionDiagnosticRequest => {
  if (!isRecord(value) || value.type !== "MOTION_DIAGNOSTIC_REQUEST") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    isAnyMotionDiagnosticCommand(value.command) &&
    isDiagnosticTargetSpec(value.target) &&
    (value.testContext === undefined || isDiagnosticTestContext(value.testContext))
  );
};

export const isP006FixtureCommandMessage = (value: unknown): value is P006FixtureCommandMessage => {
  if (!isRecord(value) || value.type !== "P006_FIXTURE_COMMAND") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    (value.command === "CREATE_OR_REFRESH_ALL" || value.command === "CREATE_AND_SELF_VERIFY" || value.command === "CLEAR_GENERATED")
  );
};

export const isP006RunTestMessage = (value: unknown): value is P006RunTestMessage => {
  if (!isRecord(value) || value.type !== "P006_RUN_TEST") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    typeof value.testId === "string" &&
    /^R(?:0[1-9]|10)$/.test(value.testId)
  );
};

export const isP006RunAllMessage = (value: unknown): value is P006RunAllMessage =>
  isRecord(value) && value.type === "P006_RUN_ALL" && isNonEmptyString(value.requestId);

export const isP006VerifyTargetPipelineMessage = (
  value: unknown
): value is P006VerifyTargetPipelineMessage =>
  isRecord(value) && value.type === "P006_VERIFY_TARGET_PIPELINE" && isNonEmptyString(value.requestId);

export const isP007FixtureCommandMessage = (value: unknown): value is P007FixtureCommandMessage => {
  if (!isRecord(value) || value.type !== "P007_FIXTURE_COMMAND") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    (value.command === "CREATE_OR_REFRESH_ALL" || value.command === "CLEAR_GENERATED")
  );
};

export const isP007RunCaseMessage = (value: unknown): value is P007RunCaseMessage => {
  if (!isRecord(value) || value.type !== "P007_RUN_CASE") {
    return false;
  }

  return isNonEmptyString(value.requestId) && typeof value.caseId === "string" && /^W0[1-8]$/.test(value.caseId);
};

export const isP007RunAllMessage = (value: unknown): value is P007RunAllMessage =>
  isRecord(value) && value.type === "P007_RUN_ALL" && isNonEmptyString(value.requestId);

export const isP007VerifyTargetPipelineMessage = (
  value: unknown
): value is P007VerifyTargetPipelineMessage =>
  isRecord(value) && value.type === "P007_VERIFY_TARGET_PIPELINE" && isNonEmptyString(value.requestId);

export const isP008FixtureCommandMessage = (value: unknown): value is P008FixtureCommandMessage => {
  if (!isRecord(value) || value.type !== "P008_FIXTURE_COMMAND") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    (value.command === "CREATE_OR_REFRESH_ALL" || value.command === "CLEAR_GENERATED")
  );
};

export const isP008RunCaseMessage = (value: unknown): value is P008RunCaseMessage => {
  if (!isRecord(value) || value.type !== "P008_RUN_CASE") {
    return false;
  }

  return isNonEmptyString(value.requestId) && typeof value.caseId === "string" && /^S0[1-6]$/.test(value.caseId);
};

export const isP008RunAllMessage = (value: unknown): value is P008RunAllMessage =>
  isRecord(value) && value.type === "P008_RUN_ALL" && isNonEmptyString(value.requestId);

export const isP008VerifyTargetPipelineMessage = (
  value: unknown
): value is P008VerifyTargetPipelineMessage =>
  isRecord(value) && value.type === "P008_VERIFY_TARGET_PIPELINE" && isNonEmptyString(value.requestId);

export const isP009FixtureCommandMessage = (value: unknown): value is P009FixtureCommandMessage => {
  if (!isRecord(value) || value.type !== "P009_FIXTURE_COMMAND") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    (value.command === "CREATE_OR_REFRESH_ALL" || value.command === "CLEAR_GENERATED")
  );
};

export const isP009RunCaseMessage = (value: unknown): value is P009RunCaseMessage => {
  if (!isRecord(value) || value.type !== "P009_RUN_CASE") {
    return false;
  }

  return isNonEmptyString(value.requestId) && typeof value.caseId === "string" && /^T0[1-6]$/.test(value.caseId);
};

export const isP009RunAllMessage = (value: unknown): value is P009RunAllMessage =>
  isRecord(value) && value.type === "P009_RUN_ALL" && isNonEmptyString(value.requestId);

export const isP009VerifyTargetPipelineMessage = (
  value: unknown
): value is P009VerifyTargetPipelineMessage =>
  isRecord(value) && value.type === "P009_VERIFY_TARGET_PIPELINE" && isNonEmptyString(value.requestId);

export const isP010FixtureCommandMessage = (value: unknown): value is P010FixtureCommandMessage => {
  if (!isRecord(value) || value.type !== "P010_FIXTURE_COMMAND") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    (value.command === "CREATE_OR_REFRESH_ALL" || value.command === "CLEAR_GENERATED")
  );
};

export const isP010RunActionMessage = (value: unknown): value is P010RunActionMessage => {
  if (!isRecord(value) || value.type !== "P010_RUN_ACTION") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    typeof value.caseId === "string" &&
    /^U(?:0[1-9]|10)$/.test(value.caseId) &&
    typeof value.action === "string" &&
    ["PREPARE", "APPLY", "CONFIRM_UNDO", "CONFIRM_SECOND_UNDO", "CONFIRM_REDO", "TRIGGER_UNDO", "CLEAR_GENERATED"].includes(value.action) &&
    (value.strategyId === undefined ||
      value.strategyId === "A_WRITE_THEN_COMMIT" ||
      value.strategyId === "B_COMMIT_WRITE_COMMIT" ||
      value.strategyId === "C_INITIAL_BOUNDARY_WRITE_COMMIT")
  );
};

export const isP010VerifyTargetPipelineMessage = (
  value: unknown
): value is P010VerifyTargetPipelineMessage =>
  isRecord(value) && value.type === "P010_VERIFY_TARGET_PIPELINE" && isNonEmptyString(value.requestId);

export const isP011FixtureCommandMessage = (value: unknown): value is P011FixtureCommandMessage => {
  if (!isRecord(value) || value.type !== "P011_FIXTURE_COMMAND") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    (value.command === "CREATE_OR_REFRESH_ALL" || value.command === "CREATE_AND_SELF_VERIFY" || value.command === "CLEAR_GENERATED")
  );
};

export const isP011RunCaseMessage = (value: unknown): value is P011RunCaseMessage => {
  if (!isRecord(value) || value.type !== "P011_RUN_CASE") {
    return false;
  }

  return isNonEmptyString(value.requestId) && typeof value.caseId === "string" && /^C(?:0[1-9]|1[0-2])$/.test(value.caseId);
};

export const isP011RunAllMessage = (value: unknown): value is P011RunAllMessage =>
  isRecord(value) && value.type === "P011_RUN_ALL" && isNonEmptyString(value.requestId);

export const isP011VerifyTargetPipelineMessage = (
  value: unknown
): value is P011VerifyTargetPipelineMessage =>
  isRecord(value) && value.type === "P011_VERIFY_TARGET_PIPELINE" && isNonEmptyString(value.requestId);

export const isP012FixtureCommandMessage = (value: unknown): value is P012FixtureCommandMessage => {
  if (!isRecord(value) || value.type !== "P012_FIXTURE_COMMAND") {
    return false;
  }

  return (
    isNonEmptyString(value.requestId) &&
    (value.command === "CREATE_OR_REFRESH_ALL" || value.command === "CLEAR_GENERATED")
  );
};

export const isP012RunCaseMessage = (value: unknown): value is P012RunCaseMessage => {
  if (!isRecord(value) || value.type !== "P012_RUN_CASE") {
    return false;
  }

  return isNonEmptyString(value.requestId) && typeof value.caseId === "string" && /^CP(?:0[1-9]|10)$/.test(value.caseId);
};

export const isP012RunAllMessage = (value: unknown): value is P012RunAllMessage =>
  isRecord(value) && value.type === "P012_RUN_ALL" && isNonEmptyString(value.requestId);

export const isP012VerifyTargetPipelineMessage = (
  value: unknown
): value is P012VerifyTargetPipelineMessage =>
  isRecord(value) && value.type === "P012_VERIFY_TARGET_PIPELINE" && isNonEmptyString(value.requestId);

export const isMotionDiagnosticResultMessage = (
  value: unknown
): value is MotionDiagnosticResultMessage => {
  if (!isRecord(value) || value.type !== "MOTION_DIAGNOSTIC_RESULT") {
    return false;
  }

  const result = value.result;
  return (
    isNonEmptyString(value.requestId) &&
    isRecord(result) &&
    isAnyMotionDiagnosticCommand(result.command) &&
    isDiagnosticStatus(result.status)
  );
};

export const isP006FixtureResultMessage = (
  value: unknown
): value is P006FixtureResultMessage =>
  isRecord(value) &&
  value.type === "P006_FIXTURE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP006TestRunResultMessage = (
  value: unknown
): value is P006TestRunResultMessage =>
  isRecord(value) &&
  value.type === "P006_TEST_RUN_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP006RunAllResultMessage = (value: unknown): value is P006RunAllResultMessage =>
  isRecord(value) &&
  value.type === "P006_RUN_ALL_RESULT" &&
  isNonEmptyString(value.requestId) &&
  Array.isArray(value.results);

export const isP006TargetPipelineResultMessage = (
  value: unknown
): value is P006TargetPipelineResultMessage =>
  isRecord(value) &&
  value.type === "P006_TARGET_PIPELINE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP007FixtureResultMessage = (
  value: unknown
): value is P007FixtureResultMessage =>
  isRecord(value) &&
  value.type === "P007_FIXTURE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP007RunResultMessage = (value: unknown): value is P007RunResultMessage =>
  isRecord(value) &&
  value.type === "P007_RUN_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result) &&
  isRecord(value.manifest);

export const isP007TargetPipelineResultMessage = (
  value: unknown
): value is P007TargetPipelineResultMessage =>
  isRecord(value) &&
  value.type === "P007_TARGET_PIPELINE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP008FixtureResultMessage = (
  value: unknown
): value is P008FixtureResultMessage =>
  isRecord(value) &&
  value.type === "P008_FIXTURE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP008RunResultMessage = (value: unknown): value is P008RunResultMessage =>
  isRecord(value) &&
  value.type === "P008_RUN_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result) &&
  isRecord(value.manifest);

export const isP008TargetPipelineResultMessage = (
  value: unknown
): value is P008TargetPipelineResultMessage =>
  isRecord(value) &&
  value.type === "P008_TARGET_PIPELINE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP009FixtureResultMessage = (
  value: unknown
): value is P009FixtureResultMessage =>
  isRecord(value) &&
  value.type === "P009_FIXTURE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP009RunResultMessage = (value: unknown): value is P009RunResultMessage =>
  isRecord(value) &&
  value.type === "P009_RUN_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result) &&
  isRecord(value.manifest);

export const isP009TargetPipelineResultMessage = (
  value: unknown
): value is P009TargetPipelineResultMessage =>
  isRecord(value) &&
  value.type === "P009_TARGET_PIPELINE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP010FixtureResultMessage = (
  value: unknown
): value is P010FixtureResultMessage =>
  isRecord(value) &&
  value.type === "P010_FIXTURE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP010RunResultMessage = (value: unknown): value is P010RunResultMessage =>
  isRecord(value) &&
  value.type === "P010_RUN_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result) &&
  isRecord(value.manifest);

export const isP010TargetPipelineResultMessage = (
  value: unknown
): value is P010TargetPipelineResultMessage =>
  isRecord(value) &&
  value.type === "P010_TARGET_PIPELINE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP011FixtureResultMessage = (
  value: unknown
): value is P011FixtureResultMessage =>
  isRecord(value) &&
  value.type === "P011_FIXTURE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP011RunResultMessage = (value: unknown): value is P011RunResultMessage =>
  isRecord(value) &&
  value.type === "P011_RUN_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result) &&
  isRecord(value.manifest);

export const isP011TargetPipelineResultMessage = (
  value: unknown
): value is P011TargetPipelineResultMessage =>
  isRecord(value) &&
  value.type === "P011_TARGET_PIPELINE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP012FixtureResultMessage = (
  value: unknown
): value is P012FixtureResultMessage =>
  isRecord(value) &&
  value.type === "P012_FIXTURE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP012RunResultMessage = (value: unknown): value is P012RunResultMessage =>
  isRecord(value) &&
  value.type === "P012_RUN_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result) &&
  isRecord(value.manifest);

export const isP012TargetPipelineResultMessage = (
  value: unknown
): value is P012TargetPipelineResultMessage =>
  isRecord(value) &&
  value.type === "P012_TARGET_PIPELINE_RESULT" &&
  isNonEmptyString(value.requestId) &&
  isRecord(value.result);

export const isP007EvidenceRecord = (value: unknown): value is P007EvidenceRecord =>
  isRecord(value) &&
  value.evidenceSchemaVersion === 1 &&
  isNonEmptyString(value.runId) &&
  typeof value.caseId === "string" &&
  /^W0[1-8]$/.test(value.caseId) &&
  isNonEmptyString(value.filename) &&
  isRecord(value.target) &&
  isRecord(value.fixture) &&
  isRecord(value.result);

export const isP008EvidenceRecord = (value: unknown): value is P008EvidenceRecord =>
  isRecord(value) &&
  value.evidenceSchemaVersion === 1 &&
  isNonEmptyString(value.runId) &&
  typeof value.caseId === "string" &&
  /^S0[1-6]$/.test(value.caseId) &&
  isNonEmptyString(value.filename) &&
  isRecord(value.target) &&
  isRecord(value.fixture) &&
  isRecord(value.result);

export const isP009EvidenceRecord = (value: unknown): value is P009EvidenceRecord =>
  isRecord(value) &&
  value.evidenceSchemaVersion === 1 &&
  isNonEmptyString(value.runId) &&
  typeof value.caseId === "string" &&
  /^T0[1-6]$/.test(value.caseId) &&
  isNonEmptyString(value.filename) &&
  isRecord(value.targetProvenance) &&
  isRecord(value.apiContract) &&
  isRecord(value.result);

export const isP010EvidenceRecord = (value: unknown): value is P010EvidenceRecord =>
  isRecord(value) &&
  value.evidenceSchemaVersion === 1 &&
  isNonEmptyString(value.runId) &&
  typeof value.caseId === "string" &&
  /^U(?:0[1-9]|10)$/.test(value.caseId) &&
  isNonEmptyString(value.filename) &&
  isRecord(value.targetProvenance) &&
  isRecord(value.apiContract) &&
  isRecord(value.result);

export const isP011EvidenceRecord = (value: unknown): value is P011EvidenceRecord =>
  isRecord(value) &&
  value.evidenceSchemaVersion === 1 &&
  isNonEmptyString(value.runId) &&
  typeof value.caseId === "string" &&
  /^C(?:0[1-9]|1[0-2])$/.test(value.caseId) &&
  isNonEmptyString(value.filename) &&
  isRecord(value.targetProvenance) &&
  isRecord(value.apiContract) &&
  isRecord(value.result);

export const isP012EvidenceRecord = (value: unknown): value is P012EvidenceRecord =>
  isRecord(value) &&
  value.evidenceSchemaVersion === 1 &&
  isNonEmptyString(value.runId) &&
  typeof value.caseId === "string" &&
  /^CP(?:0[1-9]|10)$/.test(value.caseId) &&
  isNonEmptyString(value.filename) &&
  isRecord(value.targetProvenance) &&
  isRecord(value.result);

const emptyTargetSummary = (): ResolvedDiagnosticTargetSummary => ({
  mode: "EMPTY",
  requestedNodeIds: [],
  resolvedNodeIds: [],
  failed: [],
  canvasSelectionNodeIds: []
});

export const createNotTestedResult = (
  command: AnyMotionDiagnosticCommand,
  environment: DiagnosticEnvironment,
  startedAt: number,
  summary: string
): DiagnosticResult => ({
  command,
  status: "NOT_TESTED",
  timestamp: new Date().toISOString(),
  durationMs: Date.now() - startedAt,
  environment,
  target: emptyTargetSummary(),
  nodesReadCount: 0,
  summary,
  capabilities: [],
  evidence: {},
  warnings: [],
  errors: []
});
