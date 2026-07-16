import {
  type DiagnosticError,
  type DiagnosticValue,
  type DiagnosticWarning,
  type P006FixtureSummary,
  type P006RunnerStatus
} from "../../shared/diagnostics";
import {
  buildPlannedTrack,
  cloneManualTrack,
  coerceManualTrack,
  createIdComparison,
  hasDuplicateTrack,
  p007EvidenceSchemaVersion,
  stableFingerprint,
  statusFromP007Checks,
  summarizeDiff,
  type P007EvidenceRecord,
  type P007IsolationComparison,
  type P007ManualTrackJson,
  type P007RunManifest,
  type P007RunResult
} from "../../shared/p007Evidence";
import {
  getP007CaseDefinition,
  p007CaseDefinitions,
  p007EvidenceFilename,
  type P007CaseDefinition,
  type P007CaseId
} from "../../shared/p007Registry";
import { serializeDiagnosticValue } from "../../shared/diagnosticSerializer";
import { resolveDiagnosticTargets, revealDiagnosticTargets } from "./targetResolver";

type MotionWritableNode = SceneNode & {
  readonly manualKeyframeTracks?: unknown;
  readonly timelines?: unknown;
  readonly animations?: unknown;
  readonly animationStyles?: unknown;
  applyManualKeyframeTrack?: (field: KeyframeField, track: ManualKeyframeTrackInput) => void;
};

interface StoredP007Registry {
  rootId: string;
  nodeIds: string[];
  createdAt: string;
}

const storageKey = "motionops.apiLab.p007Registry";
const ownerNamespace = "motionops.apiLab";
const ownerValue = "P0-007";
const rootName = "__MOTIONOPS_P0_007_FIXTURES__";

const setOwnership = (node: BaseNode, caseId: P007CaseId | "ROOT", role: string): void => {
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

const isMotionWritableNode = (node: BaseNode): node is MotionWritableNode =>
  "visible" in node && "applyManualKeyframeTrack" in node;

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

const manualTrack = (
  values: readonly number[],
  positions: readonly number[],
  easings: readonly MotionEasing[] = []
): ManualKeyframeTrackInput => ({
  baseValue: { type: "FLOAT", value: values[0] ?? 0 },
  keyframes: values.map((value, index) => ({
    timelinePosition: positions[index] ?? index * 0.2,
    easing: easings[index] ?? { type: index === values.length - 1 ? "EASE_OUT" : "EASE_IN_AND_OUT" },
    value: { type: "FLOAT", value }
  }))
});

const applyTrack = (
  node: MotionWritableNode,
  name: P007CaseDefinition["propertyName"],
  values: readonly number[],
  positions: readonly number[],
  easings?: readonly MotionEasing[]
): void => {
  if (typeof node.applyManualKeyframeTrack !== "function") {
    return;
  }
  node.applyManualKeyframeTrack({ type: "PROPERTY", name }, manualTrack(values, positions, easings));
};

const readRegistry = async (): Promise<StoredP007Registry | null> => {
  const value: unknown = await figma.clientStorage.getAsync(storageKey);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const maybe = value as Partial<StoredP007Registry>;
  if (typeof maybe.rootId !== "string" || !Array.isArray(maybe.nodeIds)) {
    return null;
  }
  return {
    rootId: maybe.rootId,
    nodeIds: maybe.nodeIds.filter((id): id is string => typeof id === "string"),
    createdAt: typeof maybe.createdAt === "string" ? maybe.createdAt : new Date().toISOString()
  };
};

const saveRegistry = async (registry: StoredP007Registry | null): Promise<void> => {
  if (registry === null) {
    await figma.clientStorage.deleteAsync(storageKey);
  } else {
    await figma.clientStorage.setAsync(storageKey, registry);
  }
};

export const clearP007Fixtures = async (): Promise<P006FixtureSummary> => {
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
      code: "P007_ROOT_NOT_REMOVED",
      message: "Stored P0-007 fixture root was missing or not owned by this lab."
    });
  }
  await saveRegistry(null);
  return { rootId: registry.rootId, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: registry.nodeIds, warnings };
};

const createLabel = async (text: string): Promise<TextNode> => {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const label = figma.createText();
  label.name = "Fixture label";
  label.characters = text;
  label.fontSize = 12;
  label.resize(300, 42);
  label.fills = solid(0.09, 0.1, 0.12);
  return label;
};

const createCaseFixture = async (
  root: FrameNode,
  definition: P007CaseDefinition,
  index: number
): Promise<void> => {
  const frame = figma.createFrame();
  frame.name = definition.fixtureName;
  configureBox(frame, (index % 4) * 300, Math.floor(index / 4) * 210, 260, 170, solid(0.98, 0.99, 1));
  frame.layoutMode = "VERTICAL";
  frame.itemSpacing = 8;
  frame.paddingLeft = 12;
  frame.paddingRight = 12;
  frame.paddingTop = 12;
  frame.paddingBottom = 12;
  setOwnership(frame, definition.id, "fixture-frame");
  frame.appendChild(await createLabel(`${definition.id} - ${definition.title}`));

  const rectangle = figma.createRectangle();
  rectangle.name = `${definition.id} replacement target`;
  configureBox(rectangle, 0, 0, 92, 54, solid(0.18, 0.42, 0.86));
  setOwnership(rectangle, definition.id, definition.targetRole);
  frame.appendChild(rectangle);
  const node = rectangle as MotionWritableNode;

  switch (definition.id) {
    case "W01":
      applyTrack(node, "OPACITY", [0.15, 1], [0, 0.5]);
      break;
    case "W02":
      applyTrack(node, "TRANSLATION_X", [0, 56, 12], [0, 0.22, 0.52]);
      break;
    case "W03":
      applyTrack(node, "OPACITY", [0.2, 0.75, 1], [0, 0.25, 0.55]);
      break;
    case "W04":
      applyTrack(node, "OPACITY", [0.1, 0.85, 1], [0, 0.24, 0.54], [
        { type: "EASE_IN" },
        { type: "EASE_OUT" },
        { type: "EASE_IN_AND_OUT" }
      ]);
      break;
    case "W05":
      applyTrack(node, "OPACITY", [0.1, 0.45, 0.7, 1], [0, 0.18, 0.36, 0.62]);
      break;
    case "W06":
      applyTrack(node, "OPACITY", [0.25, 0.8, 1], [0, 0.2, 0.5]);
      applyTrack(node, "TRANSLATION_X", [0, 36, 0], [0, 0.24, 0.5]);
      break;
    case "W07":
      applyTrack(node, "TRANSLATION_X", [0, 44, 4], [0, 0.22, 0.52]);
      break;
    case "W08":
      applyTrack(node, "OPACITY", [0.15, 0.65, 1], [0, 0.2, 0.5]);
      break;
  }

  root.appendChild(frame);
};

export const createOrRefreshP007Fixtures = async (): Promise<P006FixtureSummary> => {
  const cleanup = await clearP007Fixtures();
  const warnings: DiagnosticWarning[] = [...cleanup.warnings];
  const root = figma.createFrame();
  root.name = rootName;
  configureBox(root, 900, 1060, 1180, 470, solid(0.96, 0.98, 1));
  root.layoutMode = "NONE";
  setOwnership(root, "ROOT", "fixture-root");
  figma.currentPage.appendChild(root);

  for (const [index, definition] of p007CaseDefinitions.entries()) {
    await createCaseFixture(root, definition, index);
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
    warnings
  };
};

const findCaseNode = async (definition: P007CaseDefinition): Promise<MotionWritableNode> => {
  const registry = await readRegistry();
  if (registry === null) {
    throw new Error("P0-007 fixtures are missing. Create/Refresh P0-007 Fixtures first.");
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root === null || !("findAll" in root) || !nodeOwned(root)) {
    throw new Error("P0-007 fixture root is missing or not owned by this lab.");
  }
  const node = root.findAll((candidate) => {
    const owned = nodeOwned(candidate);
    const caseId = candidate.getPluginData("motionops.apiLab.testCase");
    const role = candidate.getPluginData("motionops.apiLab.role");
    return owned && caseId === definition.id && role === definition.targetRole;
  }).find(isMotionWritableNode);
  if (node === undefined) {
    throw new Error(`Expected P0-007 target for ${definition.id}.`);
  }
  return node;
};

const serial = (value: unknown): DiagnosticValue => serializeDiagnosticValue(value, { maxDepth: 10, maxArrayItems: 80, maxObjectKeys: 80 }).value;

const readAllTracks = (node: MotionWritableNode): Record<string, DiagnosticValue> => {
  const value = serial(node.manualKeyframeTracks);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
};

const readTrack = (node: MotionWritableNode, propertyName: string): P007ManualTrackJson | null =>
  coerceManualTrack(readAllTracks(node)[propertyName] ?? null);

const trackInput = (track: P007ManualTrackJson): ManualKeyframeTrackInput => ({
  id: track.id,
  baseValue: track.baseValue as KeyframeValue | undefined,
  keyframes: track.keyframes.map((keyframe) => ({
    id: keyframe.id,
    timelinePosition: keyframe.timelinePosition,
    easing: keyframe.easing as MotionEasing | VariableAlias | undefined,
    value: keyframe.value as KeyframeValue
  }))
});

const applyPlannedTrack = (node: MotionWritableNode, propertyName: P007CaseDefinition["propertyName"], planned: P007ManualTrackJson): void => {
  if (typeof node.applyManualKeyframeTrack !== "function") {
    throw new Error("applyManualKeyframeTrack is not exposed on the target node.");
  }
  node.applyManualKeyframeTrack({ type: "PROPERTY", name: propertyName }, trackInput(planned));
};

const siblingProperty = (definition: P007CaseDefinition): string | null =>
  definition.requiresSiblingTrack ? "TRANSLATION_X" : null;

const buildIsolation = (
  definition: P007CaseDefinition,
  beforeTracks: Record<string, DiagnosticValue>,
  actualTracks: Record<string, DiagnosticValue>,
  node: MotionWritableNode,
  beforeTimeline: DiagnosticValue,
  beforeStyles: DiagnosticValue
): P007IsolationComparison => {
  const actualTrack = coerceManualTrack(actualTracks[definition.propertyName] ?? null);
  const sibling = siblingProperty(definition);
  const beforeSibling = sibling === null ? null : beforeTracks[sibling] ?? null;
  const actualSibling = sibling === null ? null : actualTracks[sibling] ?? null;
  const timelineActual = serial(node.timelines);
  const stylesActual = serial(node.animationStyles);
  const siblingBeforeFingerprint = beforeSibling === null ? null : stableFingerprint(beforeSibling);
  const siblingActualFingerprint = actualSibling === null ? null : stableFingerprint(actualSibling);
  const timelineBeforeFingerprint = stableFingerprint(beforeTimeline);
  const timelineActualFingerprint = stableFingerprint(timelineActual);
  const animationStylesBeforeFingerprint = stableFingerprint(beforeStyles);
  const animationStylesActualFingerprint = stableFingerprint(stylesActual);
  const siblingUnchanged =
    sibling === null ? null : siblingBeforeFingerprint !== null && siblingBeforeFingerprint === siblingActualFingerprint;
  return {
    beforeTrackCount: Object.keys(beforeTracks).length,
    actualTrackCount: Object.keys(actualTracks).length,
    duplicateDetected: hasDuplicateTrack(actualTracks, definition.propertyName, actualTrack),
    siblingBeforeFingerprint,
    siblingActualFingerprint,
    siblingUnchanged,
    timelineBeforeFingerprint,
    timelineActualFingerprint,
    animationStylesBeforeFingerprint,
    animationStylesActualFingerprint,
    unrelatedDataUnchanged:
      timelineBeforeFingerprint === timelineActualFingerprint &&
      animationStylesBeforeFingerprint === animationStylesActualFingerprint &&
      (siblingUnchanged ?? true)
  };
};

const runCase = async (definition: P007CaseDefinition, runId: string): Promise<P007EvidenceRecord> => {
  const warnings: DiagnosticWarning[] = [];
  const errors: DiagnosticError[] = [];
  const node = await findCaseNode(definition);
  await revealDiagnosticTargets([node.id]);
  const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: [node.id] });
  if (targets.resolvedNodes.length !== 1) {
    errors.push({ code: "P007_TARGET_RESOLUTION_FAILED", message: "Expected exactly one resolved target.", path: definition.id });
  }

  const beforeTracks = readAllTracks(node);
  const before = readTrack(node, definition.propertyName);
  const beforeTimeline = serial(node.timelines);
  const beforeStyles = serial(node.animationStyles);
  if (before === null) {
    errors.push({ code: "P007_TRACK_MISSING", message: `No readable ${definition.propertyName} manual track.`, path: definition.id });
  } else if (before.keyframes.length < definition.expectedMinKeyframes) {
    errors.push({
      code: "P007_KEYFRAME_COUNT_TOO_SMALL",
      message: `Expected at least ${definition.expectedMinKeyframes.toString()} keyframes.`,
      path: definition.id
    });
  }

  let planned = before === null ? null : buildPlannedTrack(definition, before);
  let actual: P007ManualTrackJson | null = null;
  let restoration: P007ManualTrackJson | null = null;

  if (before !== null && planned !== null && errors.length === 0) {
    applyPlannedTrack(node, definition.propertyName, planned);
    actual = readTrack(node, definition.propertyName);

    if (definition.operation === "REPEATED_REPLACEMENT" && actual !== null) {
      planned = buildPlannedTrack(definition, actual, 2);
      applyPlannedTrack(node, definition.propertyName, planned);
      actual = readTrack(node, definition.propertyName);
    }

    if (definition.operation === "RESTORE_ORIGINAL") {
      applyPlannedTrack(node, definition.propertyName, cloneManualTrack(before));
      restoration = readTrack(node, definition.propertyName);
    }
  }

  const actualTracks = readAllTracks(node);
  const idComparison = createIdComparison(before, planned, actual);
  const isolationComparison = buildIsolation(definition, beforeTracks, actualTracks, node, beforeTimeline, beforeStyles);
  const diff = summarizeDiff(before, actual, definition.operation);
  const status =
    errors.length > 0
      ? "ERROR"
      : statusFromP007Checks(idComparison, isolationComparison, diff, restoration, definition.operation === "RESTORE_ORIGINAL");
  const reasons = [
    idComparison.trackIdPreserved ? "track-id-preserved" : "track-id-not-preserved",
    idComparison.orderedKeyframeIdsPreserved ? "keyframe-ids-preserved" : "keyframe-ids-not-preserved",
    isolationComparison.duplicateDetected ? "duplicate-detected" : "no-duplicate",
    isolationComparison.unrelatedDataUnchanged ? "unrelated-data-unchanged" : "unrelated-data-changed",
    diff.unexpectedChangedPaths.length === 0 ? "diff-expected" : "unexpected-diff"
  ];
  const filename = p007EvidenceFilename(runId, definition);
  return {
    evidenceSchemaVersion: p007EvidenceSchemaVersion,
    runId,
    caseId: definition.id,
    variantId: definition.slug,
    target: {
      mode: "EXPLICIT_NODE_IDS",
      requestedNodeIds: targets.requestedNodeIds,
      resolvedNodeIds: targets.resolvedNodeIds,
      failedNodeIds: targets.failed.map((failure) => failure.nodeId),
      role: definition.targetRole
    },
    fixture: {
      rootId: (await readRegistry())?.rootId ?? null,
      nodeId: node.id,
      nodeName: node.name,
      propertyName: definition.propertyName,
      siblingPropertyName: siblingProperty(definition)
    },
    operation: definition.operation,
    before: before === null ? null : serial(before),
    planned: planned === null ? null : serial(planned),
    actual: actual === null ? null : serial(actual),
    restoration: restoration === null ? null : serial(restoration),
    idComparison,
    isolationComparison,
    diagnostic: {
      apiSemantics: [
        "applyManualKeyframeTrack(field, track) receives a KeyframeField and ManualKeyframeTrackInput.",
        "ManualKeyframeTrackInput accepts optional track id, optional baseValue, and a complete keyframes array.",
        "ManualKeyframeInput accepts optional keyframe id, timelinePosition seconds, optional per-keyframe easing, and value."
      ],
      diff
    },
    result: { status, passed: status === "PASS", reasons },
    errors,
    warnings,
    environment: {
      editorType: figma.editorType,
      figmaMode: figma.mode,
      currentPageId: figma.currentPage.id,
      currentPageName: figma.currentPage.name
    },
    timestamp: new Date().toISOString(),
    filename
  };
};

export const runP007Case = async (caseId: P007CaseId, runId: string = createP007RunId()): Promise<P007RunResult> => {
  const definition = getP007CaseDefinition(caseId);
  if (definition === undefined) {
    throw new Error(`Unknown P0-007 case id: ${caseId}`);
  }
  const startedAt = new Date().toISOString();
  const evidence = [await runCase(definition, runId)];
  const errors = evidence.flatMap((record) => record.errors);
  const warnings = evidence.flatMap((record) => record.warnings);
  const status: P006RunnerStatus = evidence.every((record) => record.result.status === "PASS") ? "PASS" : "ERROR";
  return {
    runId,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    files: evidence.map((record) => record.filename),
    evidence,
    warnings,
    errors
  };
};

export const runAllP007Cases = async (runId: string = createP007RunId()): Promise<P007RunResult> => {
  const startedAt = new Date().toISOString();
  const evidence: P007EvidenceRecord[] = [];
  for (const definition of p007CaseDefinitions) {
    evidence.push(await runCase(definition, runId));
  }
  const errors = evidence.flatMap((record) => record.errors);
  const warnings = evidence.flatMap((record) => record.warnings);
  const status: P006RunnerStatus = evidence.every((record) => record.result.status === "PASS") ? "PASS" : "ERROR";
  return {
    runId,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    files: evidence.map((record) => record.filename),
    evidence,
    warnings,
    errors
  };
};

export const createP007RunManifest = (result: P007RunResult): P007RunManifest => ({
  runId: result.runId,
  evidenceSchemaVersion: p007EvidenceSchemaVersion,
  build: "lab",
  startedAt: result.startedAt,
  finishedAt: result.finishedAt,
  caseIds: p007CaseDefinitions.map((definition) => definition.id),
  evidenceFiles: result.files,
  accepted: result.status === "PASS",
  rejectionReason: result.status === "PASS" ? undefined : "P0-007 live replacement evidence did not pass every case."
});

export const verifyP007TargetPipeline = async (): Promise<{
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
    const nodes: MotionWritableNode[] = [];
    for (const definition of p007CaseDefinitions) {
      nodes.push(await findCaseNode(definition));
    }
    const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: nodes.map((node) => node.id) });
    return {
      status: targets.resolvedNodes.length === p007CaseDefinitions.length ? "PASS" : "ERROR",
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
      code: "P007_TARGET_PIPELINE_FAILED",
      message: error instanceof Error ? error.message : "Unknown P0-007 target pipeline failure."
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

export const createP007RunId = (): string =>
  `p007-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
