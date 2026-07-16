import {
  type DiagnosticError,
  type DiagnosticWarning,
  type P006FixtureSummary,
  type P006RunnerStatus,
  type P010StyleReadiness
} from "../../shared/diagnostics";
import { serializeDiagnosticValue } from "../../shared/diagnosticSerializer";
import {
  classifyUndoEvidence,
  createP010RunManifest,
  createSemanticState,
  nextInstructionFor,
  observeSettledState,
  p010ApiContract,
  p010EvidenceSchemaVersion,
  semanticEqual,
  semanticFingerprint,
  stableFingerprint,
  type P010EvidenceRecord,
  type P010GuidedStep,
  type P010SettleObservation,
  type P010RunManifest,
  type P010RunResult,
  type P010SemanticState
} from "../../shared/p010Evidence";
import {
  getP010CaseDefinition,
  p010CaseDefinitions,
  p010EvidenceFilename,
  type P010Action,
  type P010CaseDefinition,
  type P010CaseId,
  type P010TransactionStrategyId
} from "../../shared/p010Registry";
import { resolveDiagnosticTargets, revealDiagnosticTargets } from "./targetResolver";

type UndoWritableNode = SceneNode & {
  readonly manualKeyframeTracks?: unknown;
  readonly animationStyles?: unknown;
  readonly timelines?: unknown;
  readonly animations?: unknown;
  applyManualKeyframeTrack?: (field: KeyframeField, track: ManualKeyframeTrackInput) => void;
  applyAnimationStyle?: (styleId: string, animationStyleData?: AnimationStyleConfiguration) => string;
  removeAnimationStyle?: (id: string) => void;
  setTimelineDuration?: (id: string, duration: number) => void;
};

interface StoredP010Registry {
  rootId: string;
  nodeIds: string[];
  applicationStyleId: string | null;
  appliedStyleInstanceIds: Record<string, string | null>;
  styleReadiness: P010StyleReadiness;
  createdAt: string;
}

interface StoredP010CaseState {
  runId: string;
  caseId: P010CaseId;
  startedAt: string;
  operationIds: string[];
  before: P010SemanticState | null;
  afterApply: P010SemanticState | null;
  afterFirstUndo: P010SemanticState | null;
  afterSecondUndo: P010SemanticState | null;
  afterRedo: P010SemanticState | null;
  firstUndoSettle: P010SettleObservation | null;
  secondUndoSettle: P010SettleObservation | null;
  redoSettle: P010SettleObservation | null;
  strategy: P010TransactionStrategyId;
  errors: DiagnosticError[];
  warnings: DiagnosticWarning[];
}

const storageKey = "motionops.apiLab.p010Registry";
const statePrefix = "motionops.apiLab.p010State.";
const ownerNamespace = "motionops.apiLab";
const ownerValue = "P0-010";
const rootName = "__MOTIONOPS_P0_010_FIXTURES__";

const serial = (value: unknown) => serializeDiagnosticValue(value, { maxDepth: 10, maxArrayItems: 100, maxObjectKeys: 100 }).value;

const emptyStyleReadiness = (overrides: Partial<P010StyleReadiness> = {}): P010StyleReadiness => ({
  ready: false,
  availableCandidateCount: 0,
  applicableCandidateCount: 0,
  selectedApplicationStyleId: null,
  appliedInstanceIdStatus: "missing",
  appliedFixtureInstanceCount: 0,
  duplicateCount: 0,
  fixtureStyleCount: 0,
  prerequisite: "Create at least one native Motion animation style in Figma, then refresh P0-010 fixtures.",
  ...overrides
});

const setOwnership = (node: BaseNode, caseId: P010CaseId | "ROOT", role: string): void => {
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

const isUndoWritableNode = (node: BaseNode): node is UndoWritableNode => "visible" in node;

const solid = (r: number, g: number, b: number): Paint[] => [{ type: "SOLID", color: { r, g, b } }];

const configureBox = (node: FrameNode | RectangleNode | TextNode, x: number, y: number, width: number, height: number, fills: Paint[]): void => {
  node.x = x;
  node.y = y;
  node.resize(width, height);
  if ("fills" in node) {
    node.fills = fills;
  }
};

const readRegistry = async (): Promise<StoredP010Registry | null> => {
  const value: unknown = await figma.clientStorage.getAsync(storageKey);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const maybe = value as Record<string, unknown>;
  if (typeof maybe.rootId !== "string" || !Array.isArray(maybe.nodeIds)) {
    return null;
  }
  const rawAppliedStyleInstanceIds = maybe.appliedStyleInstanceIds;
  const rawStyleReadiness = maybe.styleReadiness;
  return {
    rootId: maybe.rootId,
    nodeIds: maybe.nodeIds.filter((id): id is string => typeof id === "string"),
    applicationStyleId: typeof maybe.applicationStyleId === "string" ? maybe.applicationStyleId : null,
    appliedStyleInstanceIds:
      typeof rawAppliedStyleInstanceIds === "object" && rawAppliedStyleInstanceIds !== null && !Array.isArray(rawAppliedStyleInstanceIds)
        ? Object.fromEntries(
            Object.entries(rawAppliedStyleInstanceIds).map(([key, entry]) => [key, typeof entry === "string" ? entry : null])
          )
        : {},
    styleReadiness:
      typeof rawStyleReadiness === "object" && rawStyleReadiness !== null && !Array.isArray(rawStyleReadiness)
        ? (rawStyleReadiness as P010StyleReadiness)
        : emptyStyleReadiness({
            selectedApplicationStyleId: typeof maybe.applicationStyleId === "string" ? maybe.applicationStyleId : null
          }),
    createdAt: typeof maybe.createdAt === "string" ? maybe.createdAt : new Date().toISOString()
  };
};

const saveRegistry = async (registry: StoredP010Registry | null): Promise<void> => {
  if (registry === null) {
    await figma.clientStorage.deleteAsync(storageKey);
  } else {
    await figma.clientStorage.setAsync(storageKey, registry);
  }
};

const readCaseState = async (caseId: P010CaseId): Promise<StoredP010CaseState | null> => {
  const value: unknown = await figma.clientStorage.getAsync(`${statePrefix}${caseId}`);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as StoredP010CaseState) : null;
};

const saveCaseState = async (state: StoredP010CaseState): Promise<void> => {
  await figma.clientStorage.setAsync(`${statePrefix}${state.caseId}`, state);
};

const clearCaseStates = async (): Promise<void> => {
  await Promise.all(p010CaseDefinitions.map((definition) => figma.clientStorage.deleteAsync(`${statePrefix}${definition.id}`)));
};

export const clearP010Fixtures = async (): Promise<P006FixtureSummary> => {
  const registry = await readRegistry();
  const warnings: DiagnosticWarning[] = [];
  if (registry === null) {
    await clearCaseStates();
    return { rootId: null, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: [], warnings };
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root !== null && "remove" in root && typeof root.remove === "function" && nodeOwned(root)) {
    root.remove();
  } else {
    warnings.push({ code: "P010_ROOT_NOT_REMOVED", message: "Stored P0-010 fixture root was missing or not owned." });
  }
  await saveRegistry(null);
  await clearCaseStates();
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

const manualTrack = (values: readonly number[], positions: readonly number[]): ManualKeyframeTrackInput => ({
  baseValue: { type: "FLOAT", value: values[0] ?? 0 },
  keyframes: values.map((value, index) => ({
    timelinePosition: positions[index] ?? index * 0.2,
    easing: { type: index === values.length - 1 ? "EASE_OUT" : "EASE_IN_AND_OUT" },
    value: { type: "FLOAT", value }
  }))
});

const applyTrack = (node: UndoWritableNode, name: "OPACITY" | "TRANSLATION_X", values: readonly number[], positions: readonly number[]): void => {
  if (typeof node.applyManualKeyframeTrack === "function") {
    node.applyManualKeyframeTrack({ type: "PROPERTY", name }, manualTrack(values, positions));
  }
};

const isRejectedApplicationId = (value: string): boolean =>
  value.startsWith("CodeComponentId:") || value.startsWith("AnimationPresetId:");

const availableAnimationStyles = (): AvailableAnimationStyle[] => {
  try {
    return figma.motion.figmaAnimationStyles();
  } catch {
    return [];
  }
};

const firstApplicationStyle = (): { applicationStyleId: string | null; readiness: P010StyleReadiness } => {
  const styles = availableAnimationStyles();
  const applicable = styles.filter(
    (style) => style.styleId.trim().length > 0 && !isRejectedApplicationId(style.styleId)
  );
  if (applicable.length === 0) {
    return {
      applicationStyleId: null,
      readiness: emptyStyleReadiness({
        availableCandidateCount: styles.length,
        applicableCandidateCount: 0,
        selectedApplicationStyleId: null,
        prerequisite: "No applicable native Motion animation style candidate exists. Create one native Motion style, then refresh P0-010 fixtures."
      })
    };
  }
  const selected = applicable.find((style) => /fade|scale|rotate|move|slide/i.test(style.name)) ?? applicable[0];
  return {
    applicationStyleId: selected.styleId,
    readiness: emptyStyleReadiness({
      availableCandidateCount: styles.length,
      applicableCandidateCount: applicable.length,
      selectedApplicationStyleId: selected.styleId,
      prerequisite: null
    })
  };
};

const appliedStyles = (node: UndoWritableNode): { id?: string; styleId?: string }[] => {
  const styles = serial(node.animationStyles);
  if (!Array.isArray(styles)) {
    return [];
  }
  return styles
    .filter((style) => typeof style === "object" && style !== null)
    .map((style) => style as { id?: string; styleId?: string });
};

const createRoleNode = (
  definition: P010CaseDefinition,
  role: string,
  applicationStyleId: string | null
): { node: RectangleNode; appliedStyleInstanceId: string | null; styleCount: number } => {
  const node = figma.createRectangle();
  node.name = `${definition.id} ${role}`;
  configureBox(node, 0, 0, 92, 54, solid(0.18, role.includes("style") ? 0.55 : 0.42, role.includes("timeline") ? 0.72 : 0.86));
  setOwnership(node, definition.id, role);
  const writable = node as UndoWritableNode;
  if (role.includes("manual")) {
    applyTrack(writable, role.includes("secondary") ? "TRANSLATION_X" : "OPACITY", [0.15, 0.55, 1], [0, 0.24, 0.56]);
  }
  if (role.includes("timeline")) {
    applyTrack(writable, "TRANSLATION_X", [0, 40, 0], [0, 0.28, 0.7]);
  }
  let appliedStyleInstanceId: string | null = null;
  if (role.includes("style") && applicationStyleId !== null && typeof writable.applyAnimationStyle === "function") {
    const returnedId = writable.applyAnimationStyle(applicationStyleId, { duration: 0.5, timelineOffset: 0 });
    const styles = appliedStyles(writable);
    const matched = styles.find((style) => style.id === returnedId) ?? (styles.length === 1 ? styles[0] : undefined);
    appliedStyleInstanceId = typeof matched?.id === "string" ? matched.id : null;
  }
  return { node, appliedStyleInstanceId, styleCount: appliedStyles(writable).length };
};

const createCaseFixture = async (
  root: FrameNode,
  definition: P010CaseDefinition,
  index: number,
  applicationStyleId: string | null
): Promise<{ appliedStyleInstanceIds: Record<string, string | null>; styleCount: number }> => {
  const frame = figma.createFrame();
  frame.name = `${definition.id} - ${definition.title}`;
  configureBox(frame, (index % 3) * 330, Math.floor(index / 3) * 220, 300, 180, solid(0.98, 0.99, 1));
  frame.layoutMode = "VERTICAL";
  frame.itemSpacing = 8;
  frame.paddingLeft = 12;
  frame.paddingRight = 12;
  frame.paddingTop = 12;
  frame.paddingBottom = 12;
  setOwnership(frame, definition.id, "fixture-frame");
  frame.appendChild(await createLabel(`${definition.id} - ${definition.title}`));
  const appliedStyleInstanceIds: Record<string, string | null> = {};
  let styleCount = 0;
  for (const role of definition.fixtureRoles) {
    const created = createRoleNode(definition, role, applicationStyleId);
    frame.appendChild(created.node);
    if (role.includes("style")) {
      appliedStyleInstanceIds[created.node.id] = created.appliedStyleInstanceId;
      styleCount += created.styleCount;
    }
  }
  root.appendChild(frame);
  return { appliedStyleInstanceIds, styleCount };
};

export const createOrRefreshP010Fixtures = async (): Promise<P006FixtureSummary> => {
  const cleanup = await clearP010Fixtures();
  const warnings: DiagnosticWarning[] = [...cleanup.warnings];
  const styleSelection = firstApplicationStyle();
  const applicationStyleId = styleSelection.applicationStyleId;
  if (applicationStyleId === null) {
    warnings.push({ code: "P010_STYLE_FIXTURE_LIMITED", message: "No applicable native Motion style found; style cases may block." });
  }
  const root = figma.createFrame();
  root.name = rootName;
  configureBox(root, 900, 1540, 1010, 850, solid(0.96, 0.98, 1));
  root.layoutMode = "NONE";
  setOwnership(root, "ROOT", "fixture-root");
  figma.currentPage.appendChild(root);
  const appliedStyleInstanceIds: Record<string, string | null> = {};
  let fixtureStyleCount = 0;
  for (const [index, definition] of p010CaseDefinitions.entries()) {
    const created = await createCaseFixture(root, definition, index, applicationStyleId);
    Object.assign(appliedStyleInstanceIds, created.appliedStyleInstanceIds);
    fixtureStyleCount += created.styleCount;
  }
  const nodeIds = [root.id, ...root.findAll().map((node) => node.id)];
  const appliedFixtureInstanceCount = Object.values(appliedStyleInstanceIds).filter((id) => id !== null).length;
  const expectedStyleFixtureCount = p010CaseDefinitions.filter((definition) =>
    definition.fixtureRoles.some((role) => role.includes("style"))
  ).length;
  const duplicateCount = Math.max(0, fixtureStyleCount - expectedStyleFixtureCount);
  const styleReadiness: P010StyleReadiness = {
    ...styleSelection.readiness,
    fixtureStyleCount,
    appliedFixtureInstanceCount,
    appliedInstanceIdStatus: appliedFixtureInstanceCount === expectedStyleFixtureCount ? "present" : "missing",
    duplicateCount,
    ready:
      applicationStyleId !== null &&
      appliedFixtureInstanceCount === expectedStyleFixtureCount &&
      fixtureStyleCount === expectedStyleFixtureCount &&
      duplicateCount === 0,
    prerequisite:
      applicationStyleId === null
        ? styleSelection.readiness.prerequisite
        : appliedFixtureInstanceCount !== expectedStyleFixtureCount
          ? "P0-010 style fixture could not create one readable applied style instance per style target."
          : duplicateCount !== 0
            ? "P0-010 style fixture starts with duplicate applied style instances."
            : null
  };
  await saveRegistry({ rootId: root.id, nodeIds, applicationStyleId, appliedStyleInstanceIds, styleReadiness, createdAt: new Date().toISOString() });
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return {
    rootId: root.id,
    testCaseIds: [],
    createdNodeIds: nodeIds,
    mutatedNodeIds: cleanup.mutatedNodeIds,
    warnings,
    p010StyleReadiness: styleReadiness
  };
};

const findCaseNodes = async (definition: P010CaseDefinition): Promise<UndoWritableNode[]> => {
  const registry = await readRegistry();
  if (registry === null) {
    throw new Error("P0-010 fixtures are missing. Click Prepare U01 Fixture first.");
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root === null || !("findAll" in root) || !nodeOwned(root)) {
    throw new Error("P0-010 fixture root is missing or not owned by this lab.");
  }
  const nodes = root.findAll((candidate) => {
    const caseId = candidate.getPluginData("motionops.apiLab.testCase");
    const role = candidate.getPluginData("motionops.apiLab.role");
    return nodeOwned(candidate) && caseId === definition.id && definition.fixtureRoles.includes(role);
  }).filter(isUndoWritableNode);
  if (nodes.length === 0) {
    throw new Error(`Expected P0-010 target nodes for ${definition.id}.`);
  }
  return nodes;
};

const stateFor = (label: string, nodes: readonly UndoWritableNode[]): P010SemanticState =>
  createSemanticState(label, nodes.map((node) => ({
    id: node.id,
    role: node.getPluginData("motionops.apiLab.role"),
    manualKeyframeTracks: serial(node.manualKeyframeTracks),
    animationStyles: serial(node.animationStyles),
    timelines: serial(node.timelines),
    animations: serial(node.animations),
    pluginData: {
      owner: node.getPluginData("motionops.apiLab.owner"),
      testCase: node.getPluginData("motionops.apiLab.testCase"),
      role: node.getPluginData("motionops.apiLab.role")
    }
  })));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const observeDocumentChanges = (): { observed: () => boolean; dispose: () => void } => {
  let observed = false;
  const api = figma as unknown as {
    on?: (event: "documentchange", callback: () => void) => void;
    off?: (event: "documentchange", callback: () => void) => void;
  };
  const callback = (): void => {
    observed = true;
  };
  if (typeof api.on === "function") {
    try {
      api.on("documentchange", callback);
    } catch {
      return { observed: () => false, dispose: () => undefined };
    }
  }
  return {
    observed: () => observed,
    dispose: () => {
      if (typeof api.off === "function") {
        try {
          api.off("documentchange", callback);
        } catch {
          // Figma may not expose documentchange in every runtime.
        }
      }
    }
  };
};

const waitForSettledState = async (
  label: string,
  nodes: readonly UndoWritableNode[],
  beforeAction: P010SemanticState | null,
  expected: P010SemanticState | null
): Promise<{ state: P010SemanticState; observation: P010SettleObservation }> => {
  const watcher = observeDocumentChanges();
  try {
    return await observeSettledState({
      beforeAction: beforeAction ?? stateFor(`${label}-starting`, nodes),
      expected,
      read: async () => {
        await sleep(0);
        return stateFor(label, nodes);
      },
      fingerprint: (state) => semanticFingerprint(state) ?? stableFingerprint(state.raw),
      equalsExpected: (state, expectedState) => semanticEqual(state, expectedState),
      sleep,
      timeoutMs: 1200,
      intervalMs: 50,
      documentChangeObserved: watcher.observed
    });
  } finally {
    watcher.dispose();
  }
};

const firstTimeline = (node: UndoWritableNode): { id: string; duration: number } | null => {
  const timelines = serial(node.timelines);
  if (!Array.isArray(timelines)) {
    return null;
  }
  const found = timelines.find((item) => typeof item === "object" && item !== null && "id" in item && "duration" in item) as { id?: unknown; duration?: unknown } | undefined;
  return typeof found?.id === "string" && typeof found.duration === "number" ? { id: found.id, duration: found.duration } : null;
};

const applyManualMutation = (node: UndoWritableNode, value: number): void => {
  if (typeof node.applyManualKeyframeTrack !== "function") {
    throw new Error("applyManualKeyframeTrack is not exposed.");
  }
  node.applyManualKeyframeTrack({ type: "PROPERTY", name: "OPACITY" }, manualTrack([0.2, value, 1], [0, 0.24, 0.56]));
};

const applyTimelineMutation = (node: UndoWritableNode, delta = 0.25): void => {
  if (typeof node.setTimelineDuration !== "function") {
    throw new Error("setTimelineDuration is not exposed.");
  }
  const timeline = firstTimeline(node);
  if (timeline === null) {
    throw new Error("Readable timeline id and duration missing.");
  }
  node.setTimelineDuration(timeline.id, Number((timeline.duration + delta).toFixed(3)));
};

const applyStyleMutation = async (node: UndoWritableNode): Promise<void> => {
  const registry = await readRegistry();
  if (registry?.applicationStyleId === null || registry?.applicationStyleId === undefined || !registry.styleReadiness.ready) {
    throw new Error(registry?.styleReadiness.prerequisite ?? "No applicable native Motion style was found for P0-010 style probe.");
  }
  if (typeof node.removeAnimationStyle !== "function" || typeof node.applyAnimationStyle !== "function") {
    throw new Error("Style apply/remove methods are not exposed.");
  }
  const styles = appliedStyles(node);
  if (styles.length !== 1) {
    throw new Error(`P0-010 style fixture expected exactly one applied style instance, found ${styles.length.toString()}.`);
  }
  const instanceId = registry.appliedStyleInstanceIds[node.id] ?? styles[0]?.id ?? null;
  if (typeof instanceId !== "string" || instanceId.trim().length === 0) {
    throw new Error("P0-010 style fixture has no readable applied style instance id.");
  }
  node.removeAnimationStyle(instanceId);
  node.applyAnimationStyle(registry.applicationStyleId, { duration: 0.65, timelineOffset: 0 });
};

const commitForStrategy = (definition: P010CaseDefinition, point: "before" | "after"): void => {
  if (typeof figma.commitUndo !== "function") {
    throw new Error("figma.commitUndo is not exposed.");
  }
  if ((definition.strategy === "B_COMMIT_WRITE_COMMIT" || definition.strategy === "C_INITIAL_BOUNDARY_WRITE_COMMIT") && point === "before") {
    figma.commitUndo();
  }
  if (point === "after" && definition.strategy !== "C_INITIAL_BOUNDARY_WRITE_COMMIT") {
    figma.commitUndo();
  }
};

const applyOperation = async (definition: P010CaseDefinition, nodes: UndoWritableNode[]): Promise<string[]> => {
  const operationIds: string[] = [];
  commitForStrategy(definition, "before");
  const byRole = (role: string) => nodes.find((node) => node.getPluginData("motionops.apiLab.role") === role) ?? nodes[0];
  if (definition.id === "U01") {
    applyManualMutation(byRole("manual-primary"), 0.72);
    operationIds.push("manual-primary-opacity");
  } else if (definition.id === "U02") {
    applyManualMutation(byRole("manual-primary"), 0.7);
    applyManualMutation(byRole("manual-secondary"), 0.62);
    operationIds.push("manual-primary-opacity", "manual-secondary-opacity");
  } else if (definition.id === "U03") {
    await applyStyleMutation(byRole("style-primary"));
    operationIds.push("style-remove-reapply");
  } else if (definition.id === "U04") {
    applyTimelineMutation(byRole("timeline-primary"));
    operationIds.push("timeline-duration");
  } else if (definition.id === "U05") {
    applyManualMutation(byRole("manual-primary"), 0.68);
    await applyStyleMutation(byRole("style-primary"));
    applyTimelineMutation(byRole("timeline-primary"));
    operationIds.push("manual-primary-opacity", "style-remove-reapply", "timeline-duration");
  } else if (definition.id === "U06") {
    applyManualMutation(byRole("manual-primary"), 0.55);
    figma.commitUndo();
    applyManualMutation(byRole("manual-primary"), 0.82);
    operationIds.push("apply-a-manual-opacity", "apply-b-manual-opacity");
  } else if (definition.id === "U07") {
    const before = serial(byRole("manual-primary").manualKeyframeTracks);
    if (typeof byRole("manual-primary").applyManualKeyframeTrack === "function" && typeof before === "object" && before !== null && "OPACITY" in before) {
      const track = before.OPACITY as unknown as ManualKeyframeTrackInput;
      byRole("manual-primary").applyManualKeyframeTrack({ type: "PROPERTY", name: "OPACITY" }, track);
    }
    operationIds.push("noop-manual-opacity");
  } else if (definition.id === "U08") {
    applyManualMutation(byRole("manual-primary"), 0.77);
    figma.commitUndo();
    operationIds.push("manual-before-controlled-failure");
    throw new Error("P010_CONTROLLED_FAILURE_AFTER_FIRST_MUTATION");
  } else if (definition.id === "U09") {
    applyManualMutation(byRole("manual-primary"), 0.61);
    await Promise.resolve();
    applyManualMutation(byRole("manual-secondary"), 0.74);
    operationIds.push("manual-before-await", "manual-after-await");
  } else {
    for (let index = 0; index < 3; index += 1) {
      applyManualMutation(byRole("manual-primary"), 0.52 + index * 0.08);
      applyTimelineMutation(byRole("timeline-primary"), 0.05);
    }
    operationIds.push("repeated-manual-timeline");
  }
  if (definition.id !== "U06") {
    commitForStrategy(definition, "after");
  }
  return operationIds;
};

const environment = (timestamp: string): P010EvidenceRecord["environment"] => ({
  editorType: figma.editorType,
  figmaMode: figma.mode,
  currentPageId: figma.currentPage.id,
  currentPageName: figma.currentPage.name,
  timestamp
});

const makeEvidence = async (
  definition: P010CaseDefinition,
  state: StoredP010CaseState,
  nodes: UndoWritableNode[],
  nextStep: P010GuidedStep,
  terminalOverride?: P006RunnerStatus
): Promise<P010EvidenceRecord> => {
  const registry = await readRegistry();
  const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: nodes.map((node) => node.id) });
  const classified = classifyUndoEvidence(
    definition,
    state.before,
    state.afterApply,
    state.afterFirstUndo,
    state.afterSecondUndo,
    state.afterRedo,
    state.errors
  );
  const result = {
    ...classified.result,
    status: terminalOverride ?? classified.result.status,
    nextStep,
    nextInstruction: nextInstructionFor(definition, nextStep)
  };
  const timestamp = new Date().toISOString();
  const capturedStates = [state.before, state.afterApply, state.afterFirstUndo, state.afterSecondUndo, state.afterRedo].filter(
    (entry): entry is P010SemanticState => entry !== null
  );
  return {
    evidenceSchemaVersion: p010EvidenceSchemaVersion,
    runId: state.runId,
    caseId: definition.id,
    transactionStrategyId: definition.strategy,
    targetProvenance: {
      mode: "EXPLICIT_NODE_IDS",
      requestedNodeIds: targets.requestedNodeIds,
      resolvedNodeIds: targets.resolvedNodeIds,
      failedNodeIds: targets.failed.map((failure) => failure.nodeId),
      fixtureRootId: registry?.rootId ?? null,
      roles: definition.fixtureRoles as string[]
    },
    operationIds: state.operationIds,
    sourceTypes: definition.sourceTypes,
    apiContract: p010ApiContract(),
    semanticStateBefore: state.before,
    semanticStateAfterApply: state.afterApply,
    semanticStateAfterFirstUndo: state.afterFirstUndo,
    semanticStateAfterSecondUndo: state.afterSecondUndo,
    semanticStateAfterRedo: state.afterRedo,
    manualTrackFingerprints: capturedStates.map((entry) => entry.manualTrackFingerprint),
    styleInstanceFingerprints: capturedStates.map((entry) => entry.styleInstanceFingerprint),
    timelineFingerprints: capturedStates.map((entry) => entry.timelineFingerprint),
    derivedAnimationFingerprints: capturedStates.map((entry) => entry.derivedAnimationFingerprint),
    oneOrMultipleUndoStepsRequired: classified.oneOrMultipleUndoStepsRequired,
    rollbackAttempt: {
      attempted: definition.usesTriggerUndo,
      method: definition.usesTriggerUndo ? "triggerUndo" : "none",
      result:
        definition.usesTriggerUndo && state.afterFirstUndo !== null
          ? semanticEqual(state.before, state.afterFirstUndo)
            ? "restored"
            : "partial"
          : "not-tested"
    },
    observation: classified.observation,
    settleObservations: {
      firstUndo: state.firstUndoSettle,
      secondUndo: state.secondUndoSettle,
      redo: state.redoSettle
    },
    failureAudit: classified.failureAudit,
    errors: state.errors,
    warnings: state.warnings,
    timeout: false,
    terminalClassification: classified.terminalClassification,
    result,
    environment: environment(timestamp),
    timestamp,
    filename: p010EvidenceFilename(state.runId, definition)
  };
};

const resultFromEvidence = (
  evidence: P010EvidenceRecord,
  startedAt: string,
  manifest = false
): { result: P010RunResult; manifest: P010RunManifest } => {
  const finishedAt = new Date().toISOString();
  const result: P010RunResult = {
    runId: evidence.runId,
    status: evidence.result.status,
    startedAt,
    finishedAt,
    files: [evidence.filename],
    evidence: [evidence],
    warnings: evidence.warnings,
    errors: evidence.errors
  };
  return { result, manifest: manifest ? createP010RunManifest(result) : createP010RunManifest(result) };
};

export const runP010Action = async (
  caseId: P010CaseId,
  action: P010Action,
  runId: string = createP010RunId(),
  strategyOverride?: P010TransactionStrategyId
): Promise<{ result: P010RunResult; manifest: P010RunManifest }> => {
  const baseDefinition = getP010CaseDefinition(caseId);
  if (baseDefinition === undefined) {
    throw new Error(`Unknown P0-010 case id: ${caseId}`);
  }
  const existing = await readCaseState(caseId);
  const startedAt = existing?.startedAt ?? new Date().toISOString();
  const resolvedStrategy = strategyOverride ?? existing?.strategy ?? baseDefinition.strategy;
  const definition: P010CaseDefinition = { ...baseDefinition, strategy: resolvedStrategy };
  if (action === "CLEAR_GENERATED") {
    await clearP010Fixtures();
  }
  const nodes = action === "CLEAR_GENERATED" ? [] : await findCaseNodes(definition);
  if (nodes.length > 0) {
    await revealDiagnosticTargets(nodes.map((node) => node.id));
  }
  const state: StoredP010CaseState = existing ?? {
    runId,
    caseId,
    startedAt,
    operationIds: [],
    before: null,
    afterApply: null,
    afterFirstUndo: null,
    afterSecondUndo: null,
    afterRedo: null,
    firstUndoSettle: null,
    secondUndoSettle: null,
    redoSettle: null,
    strategy: resolvedStrategy,
    errors: [],
    warnings: []
  };
  state.strategy = resolvedStrategy;
  state.firstUndoSettle ??= null;
  state.secondUndoSettle ??= null;
  state.redoSettle ??= null;
  let nextStep: P010GuidedStep = "apply";
  if (action === "PREPARE") {
    state.runId = createP010RunId();
    state.startedAt = new Date().toISOString();
    state.operationIds = [];
    state.errors = [];
    state.warnings = [];
    state.before = stateFor("before", nodes);
    state.afterApply = null;
    state.afterFirstUndo = null;
    state.afterSecondUndo = null;
    state.afterRedo = null;
    state.firstUndoSettle = null;
    state.secondUndoSettle = null;
    state.redoSettle = null;
    state.strategy = resolvedStrategy;
    nextStep = "apply";
  } else if (action === "APPLY") {
    state.before ??= stateFor("before", nodes);
    try {
      state.operationIds = await applyOperation(definition, nodes);
    } catch (error) {
      state.errors.push({
        code: definition.id === "U08" ? "P010_CONTROLLED_PARTIAL_FAILURE" : "P010_APPLY_FAILED",
        message: error instanceof Error ? error.message : "Unknown P0-010 apply failure.",
        path: definition.id
      });
    }
    state.afterApply = stateFor("after-apply", nodes);
    nextStep = definition.usesTriggerUndo ? "trigger-undo" : "native-undo";
  } else if (action === "TRIGGER_UNDO") {
    if (typeof figma.triggerUndo !== "function") {
      state.errors.push({ code: "P010_TRIGGER_UNDO_MISSING", message: "figma.triggerUndo is not exposed.", path: definition.id });
    } else {
      figma.triggerUndo();
    }
    const settled = await waitForSettledState("after-trigger-undo", nodes, state.afterApply, state.before);
    state.afterFirstUndo = settled.state;
    state.firstUndoSettle = settled.observation;
    nextStep = definition.requiresRedo ? "redo" : "complete";
  } else if (action === "CONFIRM_UNDO") {
    const settled = await waitForSettledState("after-first-undo", nodes, state.afterApply, state.before);
    state.afterFirstUndo = settled.state;
    state.firstUndoSettle = settled.observation;
    nextStep =
      definition.requiresSecondUndo && !semanticEqual(state.before, state.afterFirstUndo)
        ? "second-undo"
        : definition.requiresRedo
          ? "redo"
          : "complete";
  } else if (action === "CONFIRM_SECOND_UNDO") {
    const settled = await waitForSettledState("after-second-undo", nodes, state.afterFirstUndo, state.before);
    state.afterSecondUndo = settled.state;
    state.secondUndoSettle = settled.observation;
    nextStep = definition.requiresRedo ? "redo" : "complete";
  } else if (action === "CONFIRM_REDO") {
    const settled = await waitForSettledState("after-redo", nodes, state.afterSecondUndo ?? state.afterFirstUndo, state.afterApply);
    state.afterRedo = settled.state;
    state.redoSettle = settled.observation;
    nextStep = "complete";
  }
  await saveCaseState(state);
  const evidence = await makeEvidence(definition, state, nodes, nextStep);
  return resultFromEvidence(evidence, state.startedAt, nextStep === "complete");
};

export const verifyP010TargetPipeline = async (): Promise<{
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
    const nodes: UndoWritableNode[] = [];
    for (const definition of p010CaseDefinitions) {
      nodes.push(...(await findCaseNodes(definition)));
    }
    const ids = [...new Set(nodes.map((node) => node.id))];
    const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: ids });
    return {
      status: targets.resolvedNodes.length === ids.length ? "PASS" : "ERROR",
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
    errors.push({ code: "P010_TARGET_PIPELINE_FAILED", message: error instanceof Error ? error.message : "Unknown P0-010 target pipeline failure." });
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

export const createP010RunId = (): string =>
  `p010-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

export const summarizeP010Hashes = (records: readonly P010EvidenceRecord[]): string =>
  stableFingerprint(records.map((record) => ({
    caseId: record.caseId,
    before: record.semanticStateBefore?.manualTrackFingerprint,
    afterApply: record.semanticStateAfterApply?.manualTrackFingerprint,
    afterUndo: record.semanticStateAfterFirstUndo?.manualTrackFingerprint,
    status: record.result.status
  })));
