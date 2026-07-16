import {
  type DiagnosticError,
  type DiagnosticValue,
  type DiagnosticWarning,
  type P006FixtureSummary,
  type P006RunnerStatus
} from "../../shared/diagnostics";
import { serializeDiagnosticValue } from "../../shared/diagnosticSerializer";
import {
  classifyP009,
  coerceTimelines,
  compareDurations,
  compareIsolation,
  p009EvidenceSchemaVersion,
  statusFromP009Classification,
  stableFingerprint,
  type P009CapabilityClassification,
  type P009EvidenceRecord,
  type P009RunManifest,
  type P009RunResult,
  type P009TimelineSnapshot
} from "../../shared/p009Evidence";
import {
  getP009CaseDefinition,
  p009CaseDefinitions,
  p009EvidenceFilename,
  type P009CaseDefinition,
  type P009CaseId
} from "../../shared/p009Registry";
import { resolveDiagnosticTargets, revealDiagnosticTargets } from "./targetResolver";

type TimelineWritableNode = SceneNode & {
  readonly timelines?: unknown;
  readonly manualKeyframeTracks?: unknown;
  readonly animationStyles?: unknown;
  readonly animations?: unknown;
  applyManualKeyframeTrack?: (field: KeyframeField, track: ManualKeyframeTrackInput) => void;
  setTimelineDuration?: (id: string, duration: number) => void;
};

interface StoredP009Registry {
  rootId: string;
  nodeIds: string[];
  createdAt: string;
}

interface P009RequestContext {
  requestId: string | null;
  message: "P009_RUN_CASE" | "P009_RUN_ALL";
}

const storageKey = "motionops.apiLab.p009Registry";
const ownerNamespace = "motionops.apiLab";
const ownerValue = "P0-009";
const rootName = "__MOTIONOPS_P0_009_FIXTURES__";

const setOwnership = (node: BaseNode, caseId: P009CaseId | "ROOT", role: string): void => {
  node.setPluginData("motionops.apiLab.owner", ownerValue);
  node.setPluginData("motionops.apiLab.testCase", caseId);
  node.setPluginData("motionops.apiLab.role", role);
  node.setSharedPluginData(ownerNamespace, "owner", ownerValue);
  node.setSharedPluginData(ownerNamespace, "testCase", caseId);
  node.setSharedPluginData(ownerNamespace, "role", role);
};

const nodeOwned = (node: BaseNode): boolean =>
  node.getPluginData("motionops.apiLab.owner") === ownerValue ||
  node.getSharedPluginData(ownerNamespace, "owner") === ownerValue;

const isTimelineWritableNode = (node: BaseNode): node is TimelineWritableNode =>
  "visible" in node && "setTimelineDuration" in node;

const solid = (r: number, g: number, b: number): Paint[] => [{ type: "SOLID", color: { r, g, b } }];

const configureBox = (
  node: FrameNode | RectangleNode | TextNode,
  x: number,
  y: number,
  width: number,
  height: number,
  fills: Paint[]
): void => {
  node.x = x;
  node.y = y;
  node.resize(width, height);
  if ("fills" in node) {
    node.fills = fills;
  }
};

const serial = (value: unknown): DiagnosticValue =>
  serializeDiagnosticValue(value, { maxDepth: 10, maxArrayItems: 120, maxObjectKeys: 120 }).value;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRegistry = async (): Promise<StoredP009Registry | null> => {
  const value: unknown = await figma.clientStorage.getAsync(storageKey);
  if (!isObjectRecord(value) || typeof value.rootId !== "string" || !Array.isArray(value.nodeIds)) {
    return null;
  }
  return {
    rootId: value.rootId,
    nodeIds: value.nodeIds.filter((id): id is string => typeof id === "string"),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString()
  };
};

const saveRegistry = async (registry: StoredP009Registry | null): Promise<void> => {
  if (registry === null) {
    await figma.clientStorage.deleteAsync(storageKey);
  } else {
    await figma.clientStorage.setAsync(storageKey, registry);
  }
};

const createLabel = async (text: string): Promise<TextNode> => {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const label = figma.createText();
  label.name = "Fixture label";
  label.characters = text;
  label.fontSize = 12;
  label.resize(292, 42);
  label.fills = solid(0.09, 0.1, 0.12);
  return label;
};

const timelineTrack = (): ManualKeyframeTrackInput => ({
  baseValue: { type: "FLOAT", value: 0 },
  keyframes: [
    { id: "p009-kf-start", timelinePosition: 0, easing: { type: "EASE_IN_AND_OUT" }, value: { type: "FLOAT", value: 0 } },
    { id: "p009-kf-mid", timelinePosition: 0.45, easing: { type: "EASE_OUT" }, value: { type: "FLOAT", value: 64 } },
    { id: "p009-kf-final", timelinePosition: 0.75, easing: { type: "EASE_OUT" }, value: { type: "FLOAT", value: 96 } }
  ]
});

const createCaseFixture = async (
  root: FrameNode,
  definition: P009CaseDefinition,
  index: number
): Promise<string> => {
  const frame = figma.createFrame();
  frame.name = definition.fixtureName;
  configureBox(frame, (index % 3) * 326, Math.floor(index / 3) * 212, 292, 172, solid(0.98, 0.99, 1));
  frame.layoutMode = "VERTICAL";
  frame.itemSpacing = 8;
  frame.paddingLeft = 12;
  frame.paddingRight = 12;
  frame.paddingTop = 12;
  frame.paddingBottom = 12;
  setOwnership(frame, definition.id, "fixture-frame");
  frame.appendChild(await createLabel(`${definition.id} - ${definition.title}`));

  const rectangle = figma.createRectangle();
  rectangle.name = `${definition.id} timeline target`;
  configureBox(rectangle, 0, 0, 100, 58, solid(0.18, 0.47, 0.78));
  setOwnership(rectangle, definition.id, definition.targetRole);
  frame.appendChild(rectangle);

  const node = rectangle as TimelineWritableNode;
  if (typeof node.applyManualKeyframeTrack === "function") {
    node.applyManualKeyframeTrack({ type: "PROPERTY", name: "TRANSLATION_X" }, timelineTrack());
  }

  root.appendChild(frame);
  return rectangle.id;
};

export const clearP009Fixtures = async (): Promise<P006FixtureSummary> => {
  const registry = await readRegistry();
  const warnings: DiagnosticWarning[] = [];
  if (registry === null) {
    return { rootId: null, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: [], warnings };
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root !== null && "remove" in root && typeof root.remove === "function" && nodeOwned(root)) {
    root.remove();
  } else {
    warnings.push({
      code: "P009_ROOT_NOT_REMOVED",
      message: "Stored P0-009 fixture root was missing or not owned by this lab."
    });
  }
  await saveRegistry(null);
  return { rootId: registry.rootId, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: registry.nodeIds, warnings };
};

export const createOrRefreshP009Fixtures = async (): Promise<P006FixtureSummary> => {
  const cleanup = await clearP009Fixtures();
  const warnings: DiagnosticWarning[] = [...cleanup.warnings];
  const root = figma.createFrame();
  root.name = rootName;
  configureBox(root, 900, 2050, 990, 430, solid(0.97, 0.98, 1));
  root.layoutMode = "NONE";
  setOwnership(root, "ROOT", "fixture-root");
  figma.currentPage.appendChild(root);

  const targetIds: string[] = [];
  for (const [index, definition] of p009CaseDefinitions.entries()) {
    targetIds.push(await createCaseFixture(root, definition, index));
  }
  const nodeIds = [root.id, ...root.findAll().map((node) => node.id)];
  await saveRegistry({ rootId: root.id, nodeIds, createdAt: new Date().toISOString() });
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return {
    rootId: root.id,
    testCaseIds: [],
    createdNodeIds: nodeIds,
    mutatedNodeIds: cleanup.mutatedNodeIds,
    warnings,
    p009Readiness: {
      ready: true,
      targetCount: targetIds.length,
      timelineMethod: "setTimelineDuration(id: string, duration: number): void"
    }
  };
};

const findCaseNode = async (definition: P009CaseDefinition): Promise<TimelineWritableNode> => {
  const registry = await readRegistry();
  if (registry === null) {
    throw new Error("P0-009 fixtures are missing. Create/Refresh P0-009 Fixtures first.");
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root === null || !("findAll" in root) || !nodeOwned(root)) {
    throw new Error("P0-009 fixture root is missing or not owned by this lab.");
  }
  const node = root.findAll((candidate) => {
    const owned = nodeOwned(candidate);
    const caseId = candidate.getPluginData("motionops.apiLab.testCase");
    const role = candidate.getPluginData("motionops.apiLab.role");
    return owned && caseId === definition.id && role === definition.targetRole;
  }).find(isTimelineWritableNode);
  if (node === undefined) {
    throw new Error(`Expected P0-009 timeline target for ${definition.id}.`);
  }
  return node;
};

const snapshot = (node: TimelineWritableNode): P009TimelineSnapshot => ({
  timelines: coerceTimelines(serial(node.timelines)),
  manualTracks: serial(node.manualKeyframeTracks),
  animationStyles: serial(node.animationStyles),
  derivedAnimations: serial(node.animations)
});

const collectKeyframes = (value: DiagnosticValue): { id: string | null; time: number }[] => {
  const keyframes: { id: string | null; time: number }[] = [];
  const visit = (entry: DiagnosticValue): void => {
    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item);
      }
      return;
    }
    if (!isObjectRecord(entry)) {
      return;
    }
    if (typeof entry.timelinePosition === "number") {
      keyframes.push({
        id: typeof entry.id === "string" ? entry.id : null,
        time: entry.timelinePosition
      });
    }
    for (const item of Object.values(entry)) {
      visit(item);
    }
  };
  visit(value);
  return keyframes.sort((a, b) => a.time - b.time);
};

const maxKeyframeTime = (snapshotValue: P009TimelineSnapshot): number | null => {
  const times = collectKeyframes(snapshotValue.manualTracks).map((keyframe) => keyframe.time);
  return times.length === 0 ? null : Math.max(...times);
};

const planDurations = (
  definition: P009CaseDefinition,
  beforeDuration: number,
  maximumKeyframeTime: number | null
): number[] => {
  const safeFloor = (maximumKeyframeTime ?? 0) + 0.05;
  switch (definition.operation) {
    case "NO_OP_DURATION_WRITE":
      return [beforeDuration];
    case "EXTEND_DURATION":
      return [beforeDuration + 0.25];
    case "SHORTEN_SAFE":
      return [Math.max(safeFloor, beforeDuration - 0.2)];
    case "SHORTEN_BELOW_FINAL_KEYFRAME":
      return [Math.max(0.05, (maximumKeyframeTime ?? beforeDuration) - 0.2)];
    case "REPEATED_WRITES":
      return [beforeDuration + 0.1, beforeDuration + 0.2, beforeDuration + 0.3];
    case "RESTORE_ORIGINAL_DURATION":
      return [beforeDuration + 0.25, beforeDuration];
    default:
      return [beforeDuration];
  }
};

const emptySnapshot = (): P009TimelineSnapshot => ({
  timelines: [],
  manualTracks: null,
  animationStyles: null,
  derivedAnimations: null
});

const emptyIsolation = () => compareIsolation(null, null);

const makeTerminalEvidence = async (
  definition: P009CaseDefinition,
  runId: string,
  status: P006RunnerStatus,
  classification: P009CapabilityClassification,
  error: DiagnosticError,
  requestContext?: P009RequestContext,
  node?: TimelineWritableNode,
  before: P009TimelineSnapshot | null = null,
  actual: P009TimelineSnapshot | null = null,
  plannedDuration: number | null = null,
  restorationError: DiagnosticError | null = null
): Promise<P009EvidenceRecord> => {
  const registry = await readRegistry();
  const timeline = before?.timelines[0] ?? null;
  const durationComparison = compareDurations(before, actual, timeline?.id ?? null, plannedDuration, 1);
  const isolationComparison = before === null && actual === null ? emptyIsolation() : compareIsolation(before, actual);
  const timestamp = new Date().toISOString();
  return {
    evidenceSchemaVersion: p009EvidenceSchemaVersion,
    runId,
    caseId: definition.id,
    variantId: definition.slug,
    targetProvenance: {
      mode: "EXPLICIT_NODE_IDS",
      requestedNodeIds: node === undefined ? [] : [node.id],
      resolvedNodeIds: node === undefined ? [] : [node.id],
      failedNodeIds: node === undefined ? [definition.id] : [],
      role: definition.targetRole,
      fixtureRootId: registry?.rootId ?? null
    },
    apiContract: apiContract(),
    timelineId: timeline?.id ?? null,
    timelineCount: before?.timelines.length ?? 0,
    durationBefore: durationComparison.beforeDuration,
    plannedDuration,
    actualDuration: durationComparison.actualDuration,
    rawApiDuration: durationComparison.rawApiDuration,
    maximumKeyframeTime: before === null ? null : maxKeyframeTime(before),
    keyframes: before === null ? [] : collectKeyframes(before.manualTracks),
    before,
    planned: plannedDuration === null ? null : { durations: [plannedDuration] },
    actual,
    restoration: {
      attempted: restorationError !== null,
      restoredDuration: null,
      restoredSemanticState: null,
      error: restorationError
    },
    durationComparison,
    isolationComparison,
    normalizationOrClamping: {
      detected: durationComparison.rejected,
      kind: durationComparison.rejected ? "rejected" : "unknown",
      message: error.message
    },
    terminalClassification: classification,
    result: { status, passed: status !== "FAIL" && status !== "ERROR", reasons: [error.code] },
    errors: [error],
    warnings: requestContext === undefined ? [] : [{
      code: "P009_REQUEST_CONTEXT",
      message: `${requestContext.message}:${requestContext.requestId ?? "none"}`
    }],
    environment: environment(timestamp),
    timestamp,
    filename: p009EvidenceFilename(runId, definition)
  };
};

const apiContract = (): P009EvidenceRecord["apiContract"] => ({
  method: "MotionNodeMixin.setTimelineDuration",
  signature: "setTimelineDuration(id: string, duration: number): void",
  invokedOn: "node",
  timelineIdentifierShape: "string id from node.timelines",
  durationUnits: "seconds",
  returnValue: "void",
  asynchronousBehavior: "synchronous",
  documentedRange: "duration must be greater than zero"
});

const environment = (timestamp: string): P009EvidenceRecord["environment"] => ({
  editorType: figma.editorType,
  figmaMode: figma.mode,
  currentPageId: figma.currentPage.id,
  currentPageName: figma.currentPage.name,
  timestamp
});

const runCaseUnsafe = async (
  definition: P009CaseDefinition,
  runId: string,
  requestContext?: P009RequestContext
): Promise<P009EvidenceRecord> => {
  const warnings: DiagnosticWarning[] = [];
  const errors: DiagnosticError[] = [];
  const node = await findCaseNode(definition);
  await revealDiagnosticTargets([node.id]);
  const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: [node.id] });
  if (targets.resolvedNodes.length !== 1) {
    errors.push({ code: "P009_TARGET_RESOLUTION_FAILED", message: "Expected exactly one resolved target.", path: definition.id });
  }
  if (typeof node.setTimelineDuration !== "function") {
    return makeTerminalEvidence(
      definition,
      runId,
      "UNSUPPORTED",
      "unsupported",
      { code: "P009_METHOD_MISSING", message: "setTimelineDuration is not exposed on the target node.", path: definition.id },
      requestContext,
      node
    );
  }

  let before = snapshot(node);
  if (before.timelines.length === 0) {
    return makeTerminalEvidence(
      definition,
      runId,
      "BLOCKED_PRECONDITION",
      "unknown",
      { code: "P009_TIMELINE_MISSING", message: "Target node did not expose a readable timeline.", path: definition.id },
      requestContext,
      node,
      before
    );
  }
  let timeline = before.timelines[0];
  if (timeline.id === undefined || timeline.duration === undefined) {
    return makeTerminalEvidence(
      definition,
      runId,
      "BLOCKED_PRECONDITION",
      "unknown",
      { code: "P009_TIMELINE_MISSING", message: "Target node did not expose a readable timeline id and duration.", path: definition.id },
      requestContext,
      node,
      before
    );
  }

  const timelineId = timeline.id;
  const originalDuration = timeline.duration;
  const maximumKeyframeTime = maxKeyframeTime(before);
  if (originalDuration <= (maximumKeyframeTime ?? 0) + 0.1) {
    try {
      node.setTimelineDuration(timelineId, (maximumKeyframeTime ?? originalDuration) + 0.5);
      before = snapshot(node);
      timeline = before.timelines.find((entry) => entry.id === timelineId) ?? timeline;
    } catch (error) {
      warnings.push({
        code: "P009_FIXTURE_DURATION_SEED_FAILED",
        message: error instanceof Error ? error.message : "Unknown fixture duration seed failure."
      });
    }
  }

  const activeDuration = typeof timeline.duration === "number" ? timeline.duration : originalDuration;
  const durations = planDurations(definition, activeDuration, maxKeyframeTime(before));
  let apiReturned: unknown = undefined;
  let actual: P009TimelineSnapshot | null = null;
  let writeError: DiagnosticError | null = null;
  for (const duration of durations) {
    try {
      node.setTimelineDuration(timelineId, duration);
      apiReturned = undefined;
    } catch (error) {
      writeError = {
        code: "P009_SET_TIMELINE_DURATION_THROW",
        message: error instanceof Error ? error.message : "Unknown setTimelineDuration failure.",
        path: definition.id
      };
      errors.push(writeError);
      break;
    }
    actual = snapshot(node);
  }
  actual ??= snapshot(node);

  let restorationError: DiagnosticError | null = null;
  let restorationSnapshot: P009TimelineSnapshot | null = null;
  if (definition.operation !== "RESTORE_ORIGINAL_DURATION") {
    try {
      node.setTimelineDuration(timelineId, originalDuration);
      restorationSnapshot = snapshot(node);
    } catch (error) {
      restorationError = {
        code: "P009_RESTORE_FAILED",
        message: error instanceof Error ? error.message : "Unknown P0-009 restoration failure.",
        path: definition.id
      };
      errors.push(restorationError);
    }
  } else {
    restorationSnapshot = actual;
  }

  const plannedDuration = durations[durations.length - 1] ?? null;
  const durationComparison = compareDurations(before, actual, timelineId, plannedDuration, writeError === null ? 0 : 1);
  const isolationComparison = compareIsolation(before, actual);
  const restoredSemanticState =
    restorationSnapshot === null ? null : stableFingerprint(before) === stableFingerprint(restorationSnapshot);
  const classification = classifyP009(
    definition.operation,
    durationComparison,
    isolationComparison,
    restoredSemanticState,
    writeError !== null
  );
  const status = statusFromP009Classification(classification, writeError !== null);
  const normalizationKind =
    writeError !== null
      ? "rejected"
      : durationComparison.normalizedOrClamped
        ? "normalized"
        : definition.operation === "SHORTEN_BELOW_FINAL_KEYFRAME" && durationComparison.durationMatchesPlan === true
          ? "accepted-below-keyframe"
          : "none";
  const timestamp = new Date().toISOString();
  return {
    evidenceSchemaVersion: p009EvidenceSchemaVersion,
    runId,
    caseId: definition.id,
    variantId: definition.slug,
    targetProvenance: {
      mode: "EXPLICIT_NODE_IDS",
      requestedNodeIds: targets.requestedNodeIds,
      resolvedNodeIds: targets.resolvedNodeIds,
      failedNodeIds: targets.failed.map((failure) => failure.nodeId),
      role: definition.targetRole,
      fixtureRootId: (await readRegistry())?.rootId ?? null
    },
    apiContract: apiContract(),
    timelineId,
    timelineCount: before.timelines.length,
    durationBefore: durationComparison.beforeDuration,
    plannedDuration,
    actualDuration: durationComparison.actualDuration,
    rawApiDuration: typeof apiReturned === "number" ? apiReturned : durationComparison.rawApiDuration,
    maximumKeyframeTime: maxKeyframeTime(before),
    keyframes: collectKeyframes(before.manualTracks),
    before,
    planned: { durations },
    actual,
    restoration: {
      attempted: true,
      restoredDuration: restorationSnapshot?.timelines.find((entry) => entry.id === timelineId)?.duration ?? null,
      restoredSemanticState,
      error: restorationError
    },
    durationComparison,
    isolationComparison,
    normalizationOrClamping: {
      detected: normalizationKind !== "none",
      kind: normalizationKind,
      message:
        writeError?.message ??
        (durationComparison.normalizedOrClamped
          ? "Figma re-read duration differed from planned duration."
          : "No normalization or clamping detected.")
    },
    terminalClassification: classification,
    result: {
      status,
      passed: status === "PASS" || status === "PARTIAL" || status === "UNSUPPORTED" || status === "READ_ONLY",
      reasons: [
        `classification-${classification}`,
        `timeline-count-${isolationComparison.timelineCountPreserved ? "stable" : "changed"}`,
        `timeline-id-${isolationComparison.timelineIdentityPreserved === false ? "changed" : "stable-or-unknown"}`,
        `manual-tracks-${isolationComparison.manualTracksUnchanged ? "stable" : "changed"}`
      ]
    },
    errors,
    warnings,
    environment: environment(timestamp),
    timestamp,
    filename: p009EvidenceFilename(runId, definition)
  };
};

const runCase = async (
  definition: P009CaseDefinition,
  runId: string,
  requestContext?: P009RequestContext
): Promise<P009EvidenceRecord> => {
  try {
    return await runCaseUnsafe(definition, runId, requestContext);
  } catch (error) {
    return makeTerminalEvidence(
      definition,
      runId,
      "ERROR",
      "unknown",
      {
        code: "P009_CASE_EXCEPTION",
        message: error instanceof Error ? error.message : "Unknown P0-009 case failure.",
        path: definition.id
      },
      requestContext,
      undefined,
      emptySnapshot()
    );
  }
};

const aggregateP009Status = (evidence: P009EvidenceRecord[]): P006RunnerStatus => {
  if (evidence.some((record) => record.result.status === "ERROR")) {
    return "ERROR";
  }
  if (evidence.some((record) => record.result.status === "FAIL")) {
    return "FAIL";
  }
  if (evidence.some((record) => record.result.status === "BLOCKED_PRECONDITION")) {
    return "BLOCKED_PRECONDITION";
  }
  if (evidence.some((record) => record.result.status === "PARTIAL")) {
    return "PARTIAL";
  }
  if (evidence.every((record) => record.result.status === "PASS")) {
    return "PASS";
  }
  if (evidence.every((record) => record.result.status === "UNSUPPORTED")) {
    return "UNSUPPORTED";
  }
  if (evidence.every((record) => record.result.status === "READ_ONLY")) {
    return "READ_ONLY";
  }
  return "FAIL";
};

export const runP009Case = async (
  caseId: P009CaseId,
  runId: string = createP009RunId(),
  requestContext?: P009RequestContext
): Promise<P009RunResult> => {
  const definition = getP009CaseDefinition(caseId);
  if (definition === undefined) {
    throw new Error(`Unknown P0-009 case id: ${caseId}`);
  }
  const startedAt = new Date().toISOString();
  const evidence = [await runCase(definition, runId, requestContext)];
  return {
    runId,
    status: aggregateP009Status(evidence),
    startedAt,
    finishedAt: new Date().toISOString(),
    files: evidence.map((record) => record.filename),
    evidence,
    warnings: evidence.flatMap((record) => record.warnings),
    errors: evidence.flatMap((record) => record.errors)
  };
};

export const runAllP009Cases = async (
  runId: string = createP009RunId(),
  requestContext?: P009RequestContext
): Promise<P009RunResult> => {
  const startedAt = new Date().toISOString();
  const resolvedContext = requestContext ?? { requestId: null, message: "P009_RUN_ALL" as const };
  const evidence: P009EvidenceRecord[] = [];
  for (const definition of p009CaseDefinitions) {
    evidence.push(await runCase(definition, runId, resolvedContext));
  }
  return {
    runId,
    status: aggregateP009Status(evidence),
    startedAt,
    finishedAt: new Date().toISOString(),
    files: evidence.map((record) => record.filename),
    evidence,
    warnings: evidence.flatMap((record) => record.warnings),
    errors: evidence.flatMap((record) => record.errors)
  };
};

export const createP009RunManifest = (result: P009RunResult): P009RunManifest => {
  const classifications = new Set(result.evidence.map((record) => record.terminalClassification));
  const classification: P009CapabilityClassification =
    classifications.size === 1 ? [...classifications][0] ?? "unknown" : "mixed";
  return {
    runId: result.runId,
    evidenceSchemaVersion: p009EvidenceSchemaVersion,
    build: "lab",
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    caseIds: p009CaseDefinitions.map((definition) => definition.id),
    evidenceFiles: result.files,
    accepted:
      result.status !== "ERROR" &&
      result.status !== "FAIL" &&
      result.status !== "BLOCKED_PRECONDITION" &&
      result.status !== "CANCELLED",
    classification,
    rejectionReason:
      result.status === "ERROR" || result.status === "FAIL" || result.status === "BLOCKED_PRECONDITION"
        ? "P0-009 timeline-duration evidence could not distinguish API behavior."
        : undefined
  };
};

export const verifyP009TargetPipeline = async (): Promise<{
  status: P006RunnerStatus;
  requested: number;
  resolved: number;
  nodesRead: number;
  requestedNodeIds: string[];
  resolvedNodeIds: string[];
  canvasSelectionNodeIds: string[];
  warnings: DiagnosticWarning[];
  errors: DiagnosticError[];
}> => {
  const warnings: DiagnosticWarning[] = [];
  const errors: DiagnosticError[] = [];
  try {
    const nodes: TimelineWritableNode[] = [];
    for (const definition of p009CaseDefinitions) {
      nodes.push(await findCaseNode(definition));
    }
    const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: nodes.map((node) => node.id) });
    return {
      status: targets.resolvedNodes.length === p009CaseDefinitions.length ? "PASS" : "ERROR",
      requested: targets.requestedNodeIds.length,
      resolved: targets.resolvedNodeIds.length,
      nodesRead: targets.resolvedNodes.length,
      requestedNodeIds: targets.requestedNodeIds,
      resolvedNodeIds: targets.resolvedNodeIds,
      canvasSelectionNodeIds: targets.canvasSelectionNodeIds,
      warnings,
      errors
    };
  } catch (error) {
    errors.push({
      code: "P009_TARGET_PIPELINE_FAILED",
      message: error instanceof Error ? error.message : "Unknown P0-009 target pipeline failure."
    });
    return {
      status: "ERROR",
      requested: 0,
      resolved: 0,
      nodesRead: 0,
      requestedNodeIds: [],
      resolvedNodeIds: [],
      canvasSelectionNodeIds: figma.currentPage.selection.map((node) => node.id),
      warnings,
      errors
    };
  }
};

export const createP009RunId = (): string =>
  `p009-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
