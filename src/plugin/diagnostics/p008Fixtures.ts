import {
  type DiagnosticError,
  type DiagnosticValue,
  type DiagnosticWarning,
  type P006FixtureSummary,
  type P006RunnerStatus,
  type P008CandidateDiagnostic,
  type P008FixtureReadiness,
  type P008PreflightStatus
} from "../../shared/diagnostics";
import { serializeDiagnosticValue } from "../../shared/diagnosticSerializer";
import {
  coerceAppliedStyles,
  createIsolationComparison,
  createStyleComparison,
  p008EvidenceSchemaVersion,
  statusFromP008Checks,
  summarizeStyleDiff,
  type P008AppliedStyleJson,
  type P008CapabilityClassification,
  type P008EvidenceRecord,
  type P008RunManifest,
  type P008RunResult,
  type P008StyleSnapshot
} from "../../shared/p008Evidence";
import {
  getP008CaseDefinition,
  p008CaseDefinitions,
  p008EvidenceFilename,
  type P008CaseDefinition,
  type P008CaseId
} from "../../shared/p008Registry";
import { resolveDiagnosticTargets, revealDiagnosticTargets } from "./targetResolver";

type StyleWritableNode = SceneNode & {
  readonly animationStyles?: unknown;
  readonly manualKeyframeTracks?: unknown;
  readonly timelines?: unknown;
  readonly animations?: unknown;
  applyAnimationStyle?: (styleId: string, animationStyleData?: AnimationStyleConfiguration) => string;
  removeAnimationStyle?: (id: string) => void;
  applyManualKeyframeTrack?: (field: KeyframeField, track: ManualKeyframeTrackInput) => void;
};

interface StoredP008Registry {
  rootId: string;
  nodeIds: string[];
  applicationStyleId: string | null;
  appliedStyleReferenceId: string | null;
  appliedInstanceId: string | null;
  styleName: string | null;
  createdAt: string;
  readiness: P008FixtureReadiness;
}

type P008StyleCandidate =
  | {
      kind: "applicable-animation-style";
      applicationStyleId: string;
      styleName: string;
      props: AvailableAnimationStyle["props"];
      rawFingerprint: string;
      diagnostic: P008CandidateDiagnostic;
      raw: AvailableAnimationStyle;
    }
  | {
      kind: "unsupported-candidate";
      reason: string;
      rawFingerprint: string;
      diagnostic: P008CandidateDiagnostic;
      raw: AvailableAnimationStyle;
    };

interface P008StylePreflight {
  status: P008PreflightStatus;
  selected: Extract<P008StyleCandidate, { kind: "applicable-animation-style" }> | null;
  candidates: P008StyleCandidate[];
  readiness: P008FixtureReadiness;
}

interface P008RequestContext {
  requestId: string | null;
  message: "P008_RUN_CASE" | "P008_RUN_ALL";
}

const storageKey = "motionops.apiLab.p008Registry";
const ownerNamespace = "motionops.apiLab";
const ownerValue = "P0-008";
const rootName = "__MOTIONOPS_P0_008_FIXTURES__";

const setOwnership = (node: BaseNode, caseId: P008CaseId | "ROOT", role: string): void => {
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

const isStyleWritableNode = (node: BaseNode): node is StyleWritableNode =>
  "visible" in node && "applyAnimationStyle" in node;

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
  serializeDiagnosticValue(value, { maxDepth: 10, maxArrayItems: 80, maxObjectKeys: 80 }).value;

const plannedValue = (value: unknown): DiagnosticValue => serial(value);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fingerprint = (value: unknown): string => {
  const raw = JSON.stringify(serial(value));
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const idPrefix = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }
  const separatorIndex = value.indexOf(":");
  return separatorIndex === -1 ? "plain" : value.slice(0, separatorIndex);
};

const isRejectedApplicationId = (value: string): boolean =>
  value.startsWith("CodeComponentId:") || value.startsWith("AnimationPresetId:");

const rejectionCategory = (reason: string): string => reason.split(":")[0] ?? reason;

const emptyP008Readiness = (
  status: P008PreflightStatus,
  candidates: P008StyleCandidate[],
  selected: Extract<P008StyleCandidate, { kind: "applicable-animation-style" }> | null,
  overrides: Partial<P008FixtureReadiness> = {}
): P008FixtureReadiness => {
  const rejectionCategories = [
    ...new Set(
      candidates
        .filter((candidate): candidate is Extract<P008StyleCandidate, { kind: "unsupported-candidate" }> =>
          candidate.kind === "unsupported-candidate"
        )
        .map((candidate) => rejectionCategory(candidate.reason))
    )
  ];
  return {
    preflightStatus: status,
    availableCandidateCount: candidates.length,
    applicableCandidateCount: candidates.filter((candidate) => candidate.kind === "applicable-animation-style").length,
    selectedStyleIdStatus: selected === null ? "missing" : "present",
    selectedStyleIdPrefix: selected === null ? null : idPrefix(selected.applicationStyleId),
    fixtureStyleCount: 0,
    appliedFixtureInstanceCount: 0,
    appliedInstanceIdStatus: "missing",
    duplicateCount: 0,
    ready: false,
    rejectionCategories,
    candidates: candidates.map((candidate) => candidate.diagnostic),
    ...overrides
  };
};

const normalizeStyleCandidate = (style: AvailableAnimationStyle, index: number): P008StyleCandidate => {
  const rawFingerprint = fingerprint({
    keys: Object.keys(style).sort(),
    styleId: style.styleId,
    name: style.name,
    props: style.props
  });
  const styleId = style.styleId;
  const baseDiagnostic = {
    index,
    applicationIdField: "styleId" as const,
    applicationIdPresent: typeof styleId === "string" && styleId.trim().length > 0,
    idPrefix: typeof styleId === "string" && styleId.trim().length > 0 ? idPrefix(styleId) : null,
    label: typeof style.name === "string" && style.name.trim().length > 0 ? style.name : null,
    propKeys:
      style.props === undefined
        ? []
        : Object.keys(style.props).filter((key) => typeof key === "string").sort(),
    rawFingerprint
  };

  let reason: string | null = null;
  if (typeof styleId !== "string" || styleId.trim().length === 0) {
    reason = "missing-styleId: AvailableAnimationStyle.styleId is required by installed typings.";
  } else if (isRejectedApplicationId(styleId)) {
    reason = `non-application-id-prefix: ${idPrefix(styleId) ?? "unknown"} is not a Motion animation style application id.`;
  }

  if (reason !== null) {
    return {
      kind: "unsupported-candidate",
      reason,
      rawFingerprint,
      raw: style,
      diagnostic: {
        ...baseDiagnostic,
        classification: "unsupported-candidate",
        applicable: false,
        rejectionReason: reason
      }
    };
  }

  return {
    kind: "applicable-animation-style",
    applicationStyleId: styleId,
    styleName: style.name,
    props: style.props,
    rawFingerprint,
    raw: style,
    diagnostic: {
      ...baseDiagnostic,
      classification: "applicable-animation-style",
      applicable: true
    }
  };
};

const discoverP008StyleCandidates = (): P008StylePreflight => {
  let styles: AvailableAnimationStyle[] = [];
  try {
    styles = figma.motion.figmaAnimationStyles();
  } catch {
    styles = [];
  }
  const candidates = styles.map(normalizeStyleCandidate);
  const applicable = candidates.filter(
    (candidate): candidate is Extract<P008StyleCandidate, { kind: "applicable-animation-style" }> =>
      candidate.kind === "applicable-animation-style"
  );
  const matched = applicable.find((candidate) => /fade|scale|rotate|move|slide/i.test(candidate.styleName));
  const selected = matched ?? (applicable.length > 0 ? applicable[0] : null);
  const unsupportedCount = candidates.length - applicable.length;
  const status: P008PreflightStatus =
    selected !== null
      ? "VALID_STYLE_SELECTED"
      : candidates.length > 0 && unsupportedCount === candidates.length
        ? "NO_APPLICABLE_STYLE"
        : "AMBIGUOUS_STYLE_SHAPE";
  return {
    status,
    selected,
    candidates,
    readiness: emptyP008Readiness(status, candidates, selected)
  };
};

const readRegistry = async (): Promise<StoredP008Registry | null> => {
  const value: unknown = await figma.clientStorage.getAsync(storageKey);
  if (!isObjectRecord(value)) {
    return null;
  }
  const maybe = value;
  if (typeof maybe.rootId !== "string" || !Array.isArray(maybe.nodeIds)) {
    return null;
  }
  return {
    rootId: maybe.rootId,
    nodeIds: maybe.nodeIds.filter((id): id is string => typeof id === "string"),
    applicationStyleId:
      typeof maybe.applicationStyleId === "string"
        ? maybe.applicationStyleId
        : typeof maybe.styleId === "string"
          ? maybe.styleId
          : null,
    appliedStyleReferenceId:
      typeof maybe.appliedStyleReferenceId === "string" ? maybe.appliedStyleReferenceId : null,
    appliedInstanceId: typeof maybe.appliedInstanceId === "string" ? maybe.appliedInstanceId : null,
    styleName: typeof maybe.styleName === "string" ? maybe.styleName : null,
    createdAt: typeof maybe.createdAt === "string" ? maybe.createdAt : new Date().toISOString(),
    readiness:
      typeof maybe.readiness === "object" && maybe.readiness !== null && !Array.isArray(maybe.readiness)
        ? (maybe.readiness as P008FixtureReadiness)
        : emptyP008Readiness("AMBIGUOUS_STYLE_SHAPE", [], null)
  };
};

const saveRegistry = async (registry: StoredP008Registry | null): Promise<void> => {
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
  label.resize(290, 42);
  label.fills = solid(0.09, 0.1, 0.12);
  return label;
};

const manualTrack = (): ManualKeyframeTrackInput => ({
  baseValue: { type: "FLOAT", value: 0 },
  keyframes: [
    { timelinePosition: 0, easing: { type: "EASE_IN_AND_OUT" }, value: { type: "FLOAT", value: 0 } },
    { timelinePosition: 0.35, easing: { type: "EASE_OUT" }, value: { type: "FLOAT", value: 48 } }
  ]
});

const applyManualSibling = (node: StyleWritableNode): void => {
  if (typeof node.applyManualKeyframeTrack === "function") {
    node.applyManualKeyframeTrack({ type: "PROPERTY", name: "TRANSLATION_X" }, manualTrack());
  }
};

const applyInitialStyle = (
  node: StyleWritableNode,
  applicationStyleId: string,
  definition: P008CaseDefinition
): string => {
  if (typeof node.applyAnimationStyle !== "function") {
    throw new Error("applyAnimationStyle is not exposed on the target node.");
  }
  const duration = definition.id === "S05" ? 0.55 : 0.5;
  const timelineOffset = definition.id === "S02" ? 0.05 : 0;
  return node.applyAnimationStyle(applicationStyleId, { duration, timelineOffset });
};

interface CreatedP008CaseFixture {
  nodeId: string;
  appliedStyleReferenceId: string | null;
  appliedInstanceId: string | null;
  styleCount: number;
  duplicateCount: number;
  warnings: DiagnosticWarning[];
}

const createCaseFixture = async (
  root: FrameNode,
  definition: P008CaseDefinition,
  index: number,
  selected: Extract<P008StyleCandidate, { kind: "applicable-animation-style" }>
): Promise<CreatedP008CaseFixture> => {
  const warnings: DiagnosticWarning[] = [];
  const frame = figma.createFrame();
  frame.name = definition.fixtureName;
  configureBox(frame, (index % 3) * 320, Math.floor(index / 3) * 210, 280, 170, solid(0.98, 0.99, 1));
  frame.layoutMode = "VERTICAL";
  frame.itemSpacing = 8;
  frame.paddingLeft = 12;
  frame.paddingRight = 12;
  frame.paddingTop = 12;
  frame.paddingBottom = 12;
  setOwnership(frame, definition.id, "fixture-frame");
  frame.appendChild(await createLabel(`${definition.id} - ${definition.title}`));

  const rectangle = figma.createRectangle();
  rectangle.name = `${definition.id} style target`;
  configureBox(rectangle, 0, 0, 96, 56, solid(0.32, 0.2, 0.78));
  setOwnership(rectangle, definition.id, definition.targetRole);
  frame.appendChild(rectangle);
  const node = rectangle as StyleWritableNode;

  const returnedInstanceId = applyInitialStyle(node, selected.applicationStyleId, definition);
  const styles = coerceAppliedStyles(serial(node.animationStyles));
  const matchedStyle =
    styles.find((style) => style.id === returnedInstanceId) ??
    (styles.length === 1 ? styles[0] : null);
  if (styles.length === 0 || matchedStyle === null) {
    throw new Error(`Fixture re-read found no applied style instance for ${definition.id}.`);
  }
  if (definition.requiresManualSibling) {
    applyManualSibling(node);
  }
  root.appendChild(frame);
  const duplicateCount = Math.max(0, styles.length - 1);
  return {
    nodeId: rectangle.id,
    appliedStyleReferenceId: matchedStyle.styleId ?? null,
    appliedInstanceId: matchedStyle.id ?? null,
    styleCount: styles.length,
    duplicateCount,
    warnings
  };
};

export const clearP008Fixtures = async (): Promise<P006FixtureSummary> => {
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
      code: "P008_ROOT_NOT_REMOVED",
      message: "Stored P0-008 fixture root was missing or not owned by this lab."
    });
  }
  await saveRegistry(null);
  return { rootId: registry.rootId, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: registry.nodeIds, warnings };
};

export const createOrRefreshP008Fixtures = async (): Promise<P006FixtureSummary> => {
  const cleanup = await clearP008Fixtures();
  const warnings: DiagnosticWarning[] = [...cleanup.warnings];
  const preflight = discoverP008StyleCandidates();
  if (preflight.selected === null) {
    warnings.push({
      code: "P008_NO_APPLICABLE_STYLE",
      message: "No applicable Motion animation style candidate was found for applyAnimationStyle."
    });
    await saveRegistry(null);
    return {
      rootId: null,
      testCaseIds: [],
      createdNodeIds: [],
      mutatedNodeIds: cleanup.mutatedNodeIds,
      warnings,
      p008Readiness: preflight.readiness
    };
  }

  const root = figma.createFrame();
  root.name = rootName;
  configureBox(root, 900, 1580, 980, 430, solid(0.97, 0.98, 1));
  root.layoutMode = "NONE";
  setOwnership(root, "ROOT", "fixture-root");
  figma.currentPage.appendChild(root);

  const created: CreatedP008CaseFixture[] = [];
  try {
    for (const [index, definition] of p008CaseDefinitions.entries()) {
      const fixture = await createCaseFixture(root, definition, index, preflight.selected);
      warnings.push(...fixture.warnings);
      created.push(fixture);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown P0-008 fixture creation failure.";
    warnings.push({
      code: "P008_STYLE_APPLY_PROBE_FAILED",
      message
    });
    if (!root.removed) {
      root.remove();
    }
    const failedReadiness = emptyP008Readiness(
      "STYLE_APPLY_PROBE_FAILED",
      preflight.candidates,
      preflight.selected,
      { selectedStyleIdStatus: "present", ready: false }
    );
    await saveRegistry(null);
    return {
      rootId: null,
      testCaseIds: [],
      createdNodeIds: [],
      mutatedNodeIds: cleanup.mutatedNodeIds,
      warnings,
      p008Readiness: failedReadiness
    };
  }

  const nodeIds = [root.id, ...root.findAll().map((node) => node.id)];
  const fixtureStyleCount = created.reduce((sum, fixture) => sum + fixture.styleCount, 0);
  const duplicateCount = created.reduce((sum, fixture) => sum + fixture.duplicateCount, 0);
  const appliedFixtureInstanceCount = created.filter((fixture) => fixture.appliedInstanceId !== null).length;
  const readiness = emptyP008Readiness("VALID_STYLE_SELECTED", preflight.candidates, preflight.selected, {
    fixtureStyleCount,
    appliedFixtureInstanceCount,
    appliedInstanceIdStatus: appliedFixtureInstanceCount === p008CaseDefinitions.length ? "present" : "missing",
    duplicateCount,
    ready:
      fixtureStyleCount >= p008CaseDefinitions.length &&
      appliedFixtureInstanceCount === p008CaseDefinitions.length &&
      duplicateCount === 0
  });
  await saveRegistry({
    rootId: root.id,
    nodeIds,
    applicationStyleId: preflight.selected.applicationStyleId,
    appliedStyleReferenceId: created[0]?.appliedStyleReferenceId ?? null,
    appliedInstanceId: created[0]?.appliedInstanceId ?? null,
    styleName: preflight.selected.styleName,
    createdAt: new Date().toISOString(),
    readiness
  });
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return {
    rootId: readiness.ready ? root.id : null,
    testCaseIds: [],
    createdNodeIds: nodeIds,
    mutatedNodeIds: cleanup.mutatedNodeIds,
    warnings,
    p008Readiness: readiness
  };
};

const findCaseNode = async (definition: P008CaseDefinition): Promise<StyleWritableNode> => {
  const registry = await readRegistry();
  if (registry === null) {
    throw new Error("P0-008 fixtures are missing. Create/Refresh P0-008 Fixtures first.");
  }
  if (!registry.readiness.ready || registry.applicationStyleId === null || isRejectedApplicationId(registry.applicationStyleId)) {
    throw new Error("P0-008 fixture readiness failed. Create/Refresh P0-008 Fixtures must select a valid application style and apply readable instances.");
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root === null || !("findAll" in root) || !nodeOwned(root)) {
    throw new Error("P0-008 fixture root is missing or not owned by this lab.");
  }
  const node = root.findAll((candidate) => {
    const owned = nodeOwned(candidate);
    const caseId = candidate.getPluginData("motionops.apiLab.testCase");
    const role = candidate.getPluginData("motionops.apiLab.role");
    return owned && caseId === definition.id && role === definition.targetRole;
  }).find(isStyleWritableNode);
  if (node === undefined) {
    throw new Error(`Expected P0-008 target for ${definition.id}.`);
  }
  const styles = coerceAppliedStyles(serial(node.animationStyles));
  if (styles.length < 1) {
    throw new Error(`Expected ${definition.id} target to have at least one readable applied animation style instance.`);
  }
  return node;
};

const snapshot = (node: StyleWritableNode): P008StyleSnapshot => {
  const styles = coerceAppliedStyles(serial(node.animationStyles));
  return {
    styles,
    manualTracks: serial(node.manualKeyframeTracks),
    timelines: serial(node.timelines),
    animations: serial(node.animations)
  };
};

const firstStyle = (snapshotValue: P008StyleSnapshot): P008AppliedStyleJson | null =>
  snapshotValue.styles[0] ?? null;

const configFor = (style: P008AppliedStyleJson, overrides: Partial<AnimationStyleConfiguration> = {}): AnimationStyleConfiguration => ({
  duration: typeof style.duration === "number" ? style.duration : 0.5,
  timelineOffset: typeof style.timelineOffset === "number" ? style.timelineOffset : 0,
  ...(style.props === undefined ? {} : { props: style.props as AnimationStyleConfiguration["props"] }),
  ...overrides
});

const changedDuration = (style: P008AppliedStyleJson): number =>
  Number(((typeof style.duration === "number" ? style.duration : 0.5) + 0.15).toFixed(3));

const applyStyle = (node: StyleWritableNode, styleId: string, config: AnimationStyleConfiguration): string => {
  if (typeof node.applyAnimationStyle !== "function") {
    throw new Error("applyAnimationStyle is not exposed on the target node.");
  }
  return node.applyAnimationStyle(styleId, config);
};

const readApplicationStyleId = async (): Promise<string> => {
  const registry = await readRegistry();
  if (registry?.applicationStyleId === undefined || registry.applicationStyleId === null) {
    throw new Error("P0-008 selected application style id is missing.");
  }
  if (isRejectedApplicationId(registry.applicationStyleId)) {
    throw new Error(`Rejected non-application Motion style id: ${idPrefix(registry.applicationStyleId) ?? "unknown"}.`);
  }
  return registry.applicationStyleId;
};

const removeStyle = (node: StyleWritableNode, instanceId: string): void => {
  if (typeof node.removeAnimationStyle !== "function") {
    throw new Error("removeAnimationStyle is not exposed on the target node.");
  }
  node.removeAnimationStyle(instanceId);
};

const allowedDiffsFor = (definition: P008CaseDefinition): string[] => {
  if (definition.operation === "CONFIGURATION_CHANGE" || definition.operation === "RESTORATION") {
    return ["$[0].duration"];
  }
  if (definition.operation === "REMOVE_AND_REAPPLY") {
    return ["$[0].id"];
  }
  return [];
};

const classify = (
  definition: P008CaseDefinition,
  before: P008StyleSnapshot | null,
  actual: P008StyleSnapshot | null,
  comparison: ReturnType<typeof createStyleComparison>,
  diff: ReturnType<typeof summarizeStyleDiff>
): P008CapabilityClassification => {
  if (before === null || before.styles.length === 0 || actual === null) {
    return "blocked";
  }
  if (comparison.duplicateDetected) {
    return "partial";
  }
  if (definition.requiresWritableConfig && diff.changedPaths.length === 0) {
    return "read-only";
  }
  if (diff.unexpectedChangedPaths.length > 0) {
    return "supported-with-warning";
  }
  return "supported";
};

const availableAnimationStyles = (): AvailableAnimationStyle[] => {
  try {
    return figma.motion.figmaAnimationStyles();
  } catch {
    return [];
  }
};

const makeP008Diagnostic = (
  definition: P008CaseDefinition,
  requestContext: P008RequestContext | undefined,
  diff: ReturnType<typeof summarizeStyleDiff>,
  classification: P008CapabilityClassification,
  availableStyleCount: number,
  applicableStyleCount: number,
  fixtureStyleCount: number,
  selectedStyleId: string | null,
  selectedApplicationStyleId: string | null,
  targetNodeId: string | null,
  apiOperationStarted: boolean,
  apiOperationCompleted: boolean,
  rereadCompleted: boolean,
  terminalStatus: P006RunnerStatus,
  missingPrerequisite?: string,
  preflightStatus?: P008PreflightStatus,
  rejectionCategories?: string[]
): P008EvidenceRecord["diagnostic"] => ({
  apiSemantics: [
    "figma.motion.figmaAnimationStyles() exposes available native Motion animation styles.",
    "applyAnimationStyle(styleId, configuration?) returns an applied animation style instance id.",
    "AnimationStyleConfiguration accepts optional duration, timelineOffset, and props.",
    "removeAnimationStyle(id) removes an applied animation style by instance id.",
    "Installed typings expose no update-in-place API for an existing animation style instance."
  ],
  diff,
  classification,
  request: {
    requestId: requestContext?.requestId ?? null,
    caseId: definition.id,
    message: requestContext?.message ?? "P008_RUN_CASE",
    handlerEntered: true
  },
  styleDiscovery: {
    availableStyleCount,
    applicableStyleCount,
    fixtureStyleCount,
    selectedStyleId,
    selectedApplicationStyleId,
    missingPrerequisite,
    preflightStatus,
    rejectionCategories,
    manualActionRequired:
      missingPrerequisite === undefined
        ? undefined
        : "Create or apply one native Motion animation style in Figma, then rerun P0-008 fixtures."
  },
  execution: {
    targetNodeId,
    apiOperationStarted,
    apiOperationCompleted,
    rereadCompleted,
    responsePosted: false,
    evidencePostStatus: "PENDING_UI_WRITE",
    terminalStatus
  }
});

const makeTerminalEvidence = async (
  definition: P008CaseDefinition,
  runId: string,
  status: P006RunnerStatus,
  classification: P008CapabilityClassification,
  error: DiagnosticError,
  requestContext?: P008RequestContext,
  node?: StyleWritableNode,
  before: P008StyleSnapshot | null = null,
  actual: P008StyleSnapshot | null = null,
  apiOperationStarted = false,
  apiOperationCompleted = false
): Promise<P008EvidenceRecord> => {
  const preflight = discoverP008StyleCandidates();
  const registry = await readRegistry();
  const availableStyleCount = preflight.readiness.availableCandidateCount;
  const applicableStyleCount = preflight.readiness.applicableCandidateCount;
  const fixtureStyleCount = before?.styles.length ?? 0;
  const selectedStyleId = firstStyle(before ?? { styles: [], manualTracks: null, timelines: null, animations: null })?.styleId ?? null;
  const selectedApplicationStyleId = registry?.applicationStyleId ?? preflight.selected?.applicationStyleId ?? null;
  const comparison = createStyleComparison(before, actual, selectedStyleId);
  const isolation = createIsolationComparison(before, actual);
  const diff = summarizeStyleDiff(before, actual, allowedDiffsFor(definition));
  return {
    evidenceSchemaVersion: p008EvidenceSchemaVersion,
    runId,
    caseId: definition.id,
    variantId: definition.slug,
    target: {
      mode: "EXPLICIT_NODE_IDS",
      requestedNodeIds: node === undefined ? [] : [node.id],
      resolvedNodeIds: node === undefined ? [] : [node.id],
      failedNodeIds: node === undefined ? [definition.id] : [],
      role: definition.targetRole
    },
    fixture: {
      rootId: registry?.rootId ?? null,
      nodeId: node?.id ?? "",
      nodeName: "",
      styleId: selectedStyleId,
      applicationStyleId: selectedApplicationStyleId,
      instanceId: firstStyle(before ?? { styles: [], manualTracks: null, timelines: null, animations: null })?.id ?? null,
      hasManualSibling: definition.requiresManualSibling
    },
    operation: definition.operation,
    before,
    planned: null,
    actual,
    restoration: null,
    styleComparison: comparison,
    isolationComparison: isolation,
    diagnostic: makeP008Diagnostic(
      definition,
      requestContext,
      diff,
      classification,
      availableStyleCount,
      applicableStyleCount,
      fixtureStyleCount,
      selectedStyleId,
      selectedApplicationStyleId,
      node?.id ?? null,
      apiOperationStarted,
      apiOperationCompleted,
      actual !== null,
      status,
      error.message,
      registry?.readiness.preflightStatus ?? preflight.status,
      registry?.readiness.rejectionCategories ?? preflight.readiness.rejectionCategories
    ),
    result: { status, passed: status === "PASS" || status === "UNSUPPORTED" || status === "READ_ONLY", reasons: [error.code] },
    errors: [error],
    warnings: [],
    environment: {
      editorType: figma.editorType,
      figmaMode: figma.mode,
      currentPageId: figma.currentPage.id,
      currentPageName: ""
    },
    timestamp: new Date().toISOString(),
    filename: p008EvidenceFilename(runId, definition)
  };
};

export const markP008ResponsePosted = (result: P008RunResult): P008RunResult => {
  for (const evidence of result.evidence) {
    if (evidence.diagnostic.execution !== undefined) {
      evidence.diagnostic.execution.responsePosted = true;
    }
  }
  return result;
};

const runCaseUnsafe = async (
  definition: P008CaseDefinition,
  runId: string,
  requestContext?: P008RequestContext
): Promise<P008EvidenceRecord> => {
  const warnings: DiagnosticWarning[] = [];
  const errors: DiagnosticError[] = [];
  const node = await findCaseNode(definition);
  await revealDiagnosticTargets([node.id]);
  const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: [node.id] });
  if (targets.resolvedNodes.length !== 1) {
    errors.push({ code: "P008_TARGET_RESOLUTION_FAILED", message: "Expected exactly one resolved target.", path: definition.id });
  }

  const before = snapshot(node);
  const beforeStyle = firstStyle(before);
  const applicationStyleId = await readApplicationStyleId();
  let planned: DiagnosticValue | null = null;
  let actual: P008StyleSnapshot | null = null;
  let restoration: P008StyleSnapshot | null = null;
  let returnedInstanceId: string | null = null;
  let apiOperationStarted = false;
  let apiOperationCompleted = false;

  if (beforeStyle?.styleId === undefined || applicationStyleId.trim().length === 0) {
    const availableStyleCount = availableAnimationStyles().length;
    return makeTerminalEvidence(
      definition,
      runId,
      "BLOCKED_PRECONDITION",
      "blocked",
      {
        code: "P008_STYLE_MISSING",
        message:
          availableStyleCount === 0
            ? "No native Motion animation style is available. Create one native Motion style and rerun fixtures."
            : "Fixture has no readable applied animation style or selected application style. Recreate fixtures after a native Motion style exists.",
        path: definition.id
      },
      requestContext,
      node,
      before,
      null,
      false,
      false
    );
  } else if (errors.length === 0) {
    const baseConfig = configFor(beforeStyle);
    apiOperationStarted = true;
    switch (definition.operation) {
      case "CONFIGURATION_CHANGE":
        planned = plannedValue({ applicationStyleId, appliedStyleReferenceId: beforeStyle.styleId, config: configFor(beforeStyle, { duration: changedDuration(beforeStyle) }) });
        returnedInstanceId = applyStyle(node, applicationStyleId, configFor(beforeStyle, { duration: changedDuration(beforeStyle) }));
        break;
      case "REPEATED_REAPPLY":
        planned = plannedValue({ applicationStyleId, appliedStyleReferenceId: beforeStyle.styleId, config: baseConfig, count: 2 });
        returnedInstanceId = applyStyle(node, applicationStyleId, baseConfig);
        returnedInstanceId = applyStyle(node, applicationStyleId, baseConfig);
        break;
      case "RESTORATION":
        planned = plannedValue({ applicationStyleId, appliedStyleReferenceId: beforeStyle.styleId, config: configFor(beforeStyle, { duration: changedDuration(beforeStyle) }), restore: baseConfig });
        returnedInstanceId = applyStyle(node, applicationStyleId, configFor(beforeStyle, { duration: changedDuration(beforeStyle) }));
        actual = snapshot(node);
        applyStyle(node, applicationStyleId, baseConfig);
        restoration = snapshot(node);
        break;
      case "REMOVE_AND_REAPPLY":
        planned = plannedValue({ applicationStyleId, appliedStyleReferenceId: beforeStyle.styleId, removeInstanceId: beforeStyle.id ?? null, config: baseConfig });
        if (beforeStyle.id === undefined) {
          throw new Error("removeAnimationStyle requires an applied style instance id, but none was exposed.");
        }
        removeStyle(node, beforeStyle.id);
        returnedInstanceId = applyStyle(node, applicationStyleId, baseConfig);
        break;
      case "SIBLING_ISOLATION":
      case "NO_OP_REAPPLY":
      default:
        planned = plannedValue({ applicationStyleId, appliedStyleReferenceId: beforeStyle.styleId, config: baseConfig });
        returnedInstanceId = applyStyle(node, applicationStyleId, baseConfig);
        break;
    }
    apiOperationCompleted = true;
    actual ??= snapshot(node);
  }

  const intendedStyleId = beforeStyle.styleId ?? null;
  const comparison = createStyleComparison(before, actual, intendedStyleId);
  const isolation = createIsolationComparison(before, actual);
  const diff = summarizeStyleDiff(before, actual, allowedDiffsFor(definition));
  const classification = classify(definition, before, actual, comparison, diff);
  const status = statusFromP008Checks(comparison, isolation, diff, classification, errors.length > 0);
  const reasons = [
    comparison.duplicateDetected ? "duplicate-detected" : "no-duplicate",
    comparison.styleIdPreserved ? "style-id-present" : "style-id-missing",
    comparison.instanceIdPreserved === null ? "instance-id-unknown" : comparison.instanceIdPreserved ? "instance-id-preserved" : "instance-id-changed",
    isolation.manualTracksUnchanged ? "manual-tracks-unchanged" : "manual-tracks-changed",
    isolation.timelineUnchanged ? "timeline-unchanged" : "timeline-changed",
    `classification-${classification}`
  ];
  if (returnedInstanceId !== null && comparison.actualInstanceIds.length > 0 && !comparison.actualInstanceIds.includes(returnedInstanceId)) {
    warnings.push({
      code: "P008_RETURNED_INSTANCE_NOT_READ_BACK",
      message: `applyAnimationStyle returned ${returnedInstanceId}, but that id was not present in re-read animationStyles.`,
      path: definition.id
    });
  }
  return {
    evidenceSchemaVersion: p008EvidenceSchemaVersion,
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
      styleId: intendedStyleId,
      applicationStyleId,
      instanceId: beforeStyle.id ?? null,
      hasManualSibling: definition.requiresManualSibling
    },
    operation: definition.operation,
    before,
    planned,
    actual,
    restoration,
    styleComparison: comparison,
    isolationComparison: isolation,
    diagnostic: {
      ...makeP008Diagnostic(
        definition,
        requestContext,
        diff,
        classification,
        availableAnimationStyles().length,
        discoverP008StyleCandidates().readiness.applicableCandidateCount,
        before.styles.length,
        intendedStyleId,
        applicationStyleId,
        node.id,
        apiOperationStarted,
        apiOperationCompleted,
        actual !== null,
        status
      )
    },
    result: { status, passed: status === "PASS" || status === "PARTIAL" || status === "UNSUPPORTED", reasons },
    errors,
    warnings,
    environment: {
      editorType: figma.editorType,
      figmaMode: figma.mode,
      currentPageId: figma.currentPage.id,
      currentPageName: figma.currentPage.name
    },
    timestamp: new Date().toISOString(),
    filename: p008EvidenceFilename(runId, definition)
  };
};

const runCase = async (
  definition: P008CaseDefinition,
  runId: string,
  requestContext?: P008RequestContext
): Promise<P008EvidenceRecord> => {
  try {
    return await runCaseUnsafe(definition, runId, requestContext);
  } catch (error) {
    return makeTerminalEvidence(
      definition,
      runId,
      "ERROR",
      "blocked",
      {
        code: "P008_CASE_EXCEPTION",
        message: error instanceof Error ? error.message : "Unknown P0-008 case failure.",
        path: definition.id
      },
      requestContext
    );
  }
};

const makeBlockedRunEvidence = async (
  runId: string,
  requestContext: P008RequestContext | undefined,
  message: string
): Promise<P008EvidenceRecord[]> =>
  Promise.all(
    p008CaseDefinitions.map((definition) =>
      makeTerminalEvidence(
        definition,
        runId,
        "BLOCKED_PRECONDITION",
        "blocked",
        {
          code: "P008_FIXTURE_NOT_READY",
          message,
          path: definition.id
        },
        requestContext
      )
    )
  );

const requireRunReady = async (): Promise<string | null> => {
  const registry = await readRegistry();
  if (registry === null) {
    return "P0-008 fixtures are missing. Create/Refresh P0-008 Fixtures first.";
  }
  if (!registry.readiness.ready) {
    return "P0-008 fixture readiness is FAIL. Create/Refresh P0-008 Fixtures must produce readable applied style instances before S01-S06.";
  }
  if (registry.applicationStyleId === null || registry.applicationStyleId.trim().length === 0) {
    return "P0-008 selected application style id is missing.";
  }
  if (isRejectedApplicationId(registry.applicationStyleId)) {
    return `P0-008 rejected selected application style id prefix: ${idPrefix(registry.applicationStyleId) ?? "unknown"}.`;
  }
  if (registry.readiness.fixtureStyleCount < p008CaseDefinitions.length) {
    return "P0-008 fixture style count is below the required applied instance count.";
  }
  if (registry.readiness.duplicateCount !== 0) {
    return "P0-008 fixture starts with duplicate applied style instances.";
  }
  return null;
};

const aggregateP008Status = (evidence: P008EvidenceRecord[]): P006RunnerStatus => {
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
  if (evidence.every((record) => record.result.status === "READ_ONLY")) {
    return "READ_ONLY";
  }
  if (evidence.every((record) => record.result.status === "UNSUPPORTED")) {
    return "UNSUPPORTED";
  }
  return "FAIL";
};

export const runP008Case = async (
  caseId: P008CaseId,
  runId: string = createP008RunId(),
  requestContext?: P008RequestContext
): Promise<P008RunResult> => {
  const definition = getP008CaseDefinition(caseId);
  if (definition === undefined) {
    throw new Error(`Unknown P0-008 case id: ${caseId}`);
  }
  const startedAt = new Date().toISOString();
  const readinessError = await requireRunReady();
  const evidence =
    readinessError === null
      ? [await runCase(definition, runId, requestContext)]
      : [
          await makeTerminalEvidence(definition, runId, "BLOCKED_PRECONDITION", "blocked", {
            code: "P008_FIXTURE_NOT_READY",
            message: readinessError,
            path: definition.id
          }, requestContext)
        ];
  const errors = evidence.flatMap((record) => record.errors);
  const warnings = evidence.flatMap((record) => record.warnings);
  const status = aggregateP008Status(evidence);
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

export const runAllP008Cases = async (
  runId: string = createP008RunId(),
  requestContext?: P008RequestContext
): Promise<P008RunResult> => {
  const startedAt = new Date().toISOString();
  const resolvedContext = requestContext ?? { requestId: null, message: "P008_RUN_ALL" as const };
  const readinessError = await requireRunReady();
  const evidence: P008EvidenceRecord[] =
    readinessError === null ? [] : await makeBlockedRunEvidence(runId, resolvedContext, readinessError);
  if (readinessError === null) {
    for (const definition of p008CaseDefinitions) {
      evidence.push(await runCase(definition, runId, resolvedContext));
    }
  }
  const errors = evidence.flatMap((record) => record.errors);
  const warnings = evidence.flatMap((record) => record.warnings);
  const status = aggregateP008Status(evidence);
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

export const createP008RunManifest = (result: P008RunResult): P008RunManifest => {
  const classifications = new Set(result.evidence.map((record) => record.diagnostic.classification));
  const classification: P008CapabilityClassification =
    result.status === "ERROR"
      ? "blocked"
      : classifications.size === 1
        ? [...classifications][0] ?? "blocked"
        : "mixed";
  return {
    runId: result.runId,
    evidenceSchemaVersion: p008EvidenceSchemaVersion,
    build: "lab",
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    caseIds: p008CaseDefinitions.map((definition) => definition.id),
    evidenceFiles: result.files,
    accepted:
      result.status !== "ERROR" &&
      result.status !== "FAIL" &&
      result.status !== "BLOCKED_PRECONDITION" &&
      result.status !== "CANCELLED",
    classification,
    rejectionReason:
      result.status === "ERROR" || result.status === "FAIL" || result.status === "BLOCKED_PRECONDITION"
        ? "P0-008 style-instance evidence could not distinguish behavior."
        : undefined
  };
};

export const verifyP008TargetPipeline = async (): Promise<{
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
    const readinessError = await requireRunReady();
    if (readinessError !== null) {
      errors.push({ code: "P008_FIXTURE_NOT_READY", message: readinessError });
      return {
        status: "BLOCKED_PRECONDITION",
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
    const nodes: StyleWritableNode[] = [];
    for (const definition of p008CaseDefinitions) {
      nodes.push(await findCaseNode(definition));
    }
    const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: nodes.map((node) => node.id) });
    return {
      status: targets.resolvedNodes.length === p008CaseDefinitions.length ? "PASS" : "ERROR",
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
      code: "P008_TARGET_PIPELINE_FAILED",
      message: error instanceof Error ? error.message : "Unknown P0-008 target pipeline failure."
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

export const createP008RunId = (): string =>
  `p008-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
