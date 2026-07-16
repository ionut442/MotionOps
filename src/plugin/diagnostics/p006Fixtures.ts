import {
  type DiagnosticError,
  type DiagnosticWarning,
  type P006RunManifest,
  type P006EvidenceEnvelope,
  type P006FixtureSummary,
  type P006TargetPipelineResult,
  type P006RunnerStatus,
  type P006TestRunResult
} from "../../shared/diagnostics";
import {
  getP006TestDefinition,
  p006EvidenceFilename,
  p006TestDefinitions,
  type P006TestDefinition,
  type P006TestId
} from "../../shared/p006Registry";
import { runMotionDiagnostic } from "./diagnosticRunner";
import {
  resolveDiagnosticTargets,
  revealDiagnosticTargets,
  type ResolvedDiagnosticTargets
} from "./targetResolver";

type MotionWritableNode = SceneNode;

interface StoredP006Registry {
  rootId: string;
  nodeIds: string[];
  createdAt: string;
}

const storageKey = "motionops.apiLab.p006Registry";
const ownerNamespace = "motionops.apiLab";
const ownerValue = "P0-006";
const rootName = "__MOTIONOPS_P0_006_FIXTURES__";

const setOwnership = (node: BaseNode, testCase: P006TestId | "ROOT", role: string): void => {
  node.setPluginData("motionops.apiLab.owner", ownerValue);
  node.setPluginData("motionops.apiLab.testCase", testCase);
  node.setPluginData("motionops.apiLab.role", role);
  node.setSharedPluginData(ownerNamespace, "owner", ownerValue);
  node.setSharedPluginData(ownerNamespace, "testCase", testCase);
  node.setSharedPluginData(ownerNamespace, "role", role);
};

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

const loadInter = async (): Promise<void> => {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
};

const createLabel = async (text: string): Promise<TextNode> => {
  await loadInter();
  const label = figma.createText();
  label.name = "Fixture label";
  label.characters = text;
  label.fontSize = 12;
  label.lineHeight = { unit: "PIXELS", value: 16 };
  label.fills = solid(0.09, 0.1, 0.12);
  label.resize(300, 54);
  return label;
};

const manualTrack = (values: readonly number[], positions: readonly number[] = [0, 0.3, 0.7]) => ({
  baseValue: { type: "FLOAT", value: values[0] },
  keyframes: values.map((value, index) => ({
    timelinePosition: positions[index] ?? index * 0.3,
    easing: { type: index === values.length - 1 ? "EASE_OUT" : "EASE_IN_AND_OUT" },
    value: { type: "FLOAT", value }
  }))
});

const applyTrack = (node: MotionWritableNode, name: string, values: readonly number[], positions?: readonly number[]): void => {
  const apply = (node as unknown as Record<string, unknown>).applyManualKeyframeTrack;
  if (typeof apply === "function") {
    apply.call(node, { type: "PROPERTY", name }, manualTrack(values, positions));
  }
};

const applyFirstStyle = (
  node: MotionWritableNode,
  warnings: DiagnosticWarning[],
  timelineOffset = 0
): void => {
  const styles = figma.motion.figmaAnimationStyles();
  const apply = (node as unknown as Record<string, unknown>).applyAnimationStyle;
  if (styles.length === 0 || typeof apply !== "function") {
    warnings.push({
      code: "NATIVE_STYLE_UNAVAILABLE",
      message: "No native Motion animation style was available to apply."
    });
    return;
  }

  const preferred = styles.find((style) => /fade|scale|rotate|move|slide/i.test(style.name)) ?? styles[0];
  apply.call(node, preferred.styleId, { duration: 0.5, timelineOffset });
};

const createFixtureFrame = async (
  root: FrameNode,
  definition: P006TestDefinition,
  index: number
): Promise<FrameNode> => {
  const frame = figma.createFrame();
  frame.name = definition.fixtureName;
  const column = index % 3;
  const row = Math.floor(index / 3);
  configureBox(frame, column * 360, row * 250, 320, 210, solid(0.98, 0.99, 1));
  frame.strokes = solid(0.75, 0.8, 0.88);
  frame.layoutMode = "VERTICAL";
  frame.itemSpacing = 10;
  frame.paddingLeft = 14;
  frame.paddingRight = 14;
  frame.paddingTop = 14;
  frame.paddingBottom = 14;
  setOwnership(frame, definition.id, "fixture-frame");
  frame.appendChild(
    await createLabel(
      `${definition.id} - ${definition.title}\n${definition.description}\nTargets: ${definition.selections.map((selection) => selection.title).join("; ")}`
    )
  );
  root.appendChild(frame);
  return frame;
};

const rect = (name: string, role: string, color: Paint[], testId: P006TestId): RectangleNode => {
  const node = figma.createRectangle();
  node.name = name;
  configureBox(node, 0, 0, 96, 56, color);
  setOwnership(node, testId, role);
  return node;
};

const buildSimpleFixture = (
  frame: FrameNode,
  definition: P006TestDefinition,
  warnings: DiagnosticWarning[]
): void => {
  const target = rect(`${definition.id} animated target`, "animated-target", solid(0.2, 0.43, 0.9), definition.id);
  frame.appendChild(target);

  const writable = target;
  switch (definition.fixtureBuilder) {
    case "manual-opacity":
      applyTrack(writable, "OPACITY", [0, 1], [0, 0.5]);
      break;
    case "manual-multi-property":
      applyTrack(writable, "TRANSLATION_Y", [0, 30, 0]);
      applyTrack(writable, "SCALE_X", [1, 1.25, 1]);
      applyTrack(writable, "ROTATION", [0, 12, -8]);
      break;
    case "native-style":
      applyFirstStyle(writable, warnings);
      break;
    case "mixed-style-manual":
      applyFirstStyle(writable, warnings);
      applyTrack(writable, "TRANSLATION_X", [0, 80], [0, 0.5]);
      break;
    case "extended-timeline":
      applyTrack(writable, "OPACITY", [0, 1], [0, 0.5]);
      {
        const timelines = ((writable as unknown as { timelines?: readonly { id: string; duration: number }[] }).timelines ?? []) as readonly ({ id: string; duration: number } | undefined)[];
        const timeline = timelines[0];
        const setTimelineDuration = (writable as unknown as Record<string, unknown>).setTimelineDuration;
        if (timeline !== undefined && timeline.id !== "-1:-1" && typeof setTimelineDuration === "function") {
          setTimelineDuration.call(writable, timeline.id, 1);
        } else {
          warnings.push({
            code: "TIMELINE_ID_UNAVAILABLE",
            message: "No concrete timeline ID was available after applying the manual track."
          });
        }
      }
      break;
    case "no-motion":
    default:
      break;
  }
};

const buildParentChildren = (frame: FrameNode, definition: P006TestDefinition): void => {
  const parent = figma.createFrame();
  parent.name = "Animated Parent";
  configureBox(parent, 0, 0, 220, 112, solid(0.9, 0.95, 1));
  parent.layoutMode = "HORIZONTAL";
  parent.itemSpacing = 8;
  parent.paddingLeft = 10;
  parent.paddingRight = 10;
  parent.paddingTop = 18;
  parent.paddingBottom = 10;
  setOwnership(parent, definition.id, "animated-parent");
  applyTrack(parent, "TRANSLATION_Y", [0, 24], [0, 0.4]);

  const animatedChild = rect("Animated Child", "animated-child", solid(0.32, 0.64, 0.45), definition.id);
  applyTrack(animatedChild, "OPACITY", [0.25, 1], [0, 0.45]);
  parent.appendChild(animatedChild);
  parent.appendChild(rect("Static Child A", "static-child", solid(0.7, 0.75, 0.82), definition.id));
  parent.appendChild(rect("Static Child B", "static-child", solid(0.7, 0.75, 0.82), definition.id));
  frame.appendChild(parent);
};

const buildStagger = (frame: FrameNode, definition: P006TestDefinition): void => {
  const parent = figma.createFrame();
  parent.name = "Auto-layout stagger parent";
  configureBox(parent, 0, 0, 250, 84, solid(0.94, 0.94, 0.96));
  parent.layoutMode = "HORIZONTAL";
  parent.itemSpacing = 10;
  parent.paddingLeft = 12;
  parent.paddingRight = 12;
  parent.paddingTop = 14;
  parent.paddingBottom = 14;
  setOwnership(parent, definition.id, "auto-layout-parent");
  [0, 1, 2].forEach((index) => {
    const childNumber = String(index + 1);
    const child = rect(`Stagger Child ${childNumber}`, `stagger-child-${childNumber}`, solid(0.65, 0.39, 0.83), definition.id);
    applyTrack(child, "OPACITY", [0, 1], [index * 0.05, 0.45 + index * 0.05]);
    applyTrack(child, "TRANSLATION_Y", [20, 0], [index * 0.05, 0.45 + index * 0.05]);
    parent.appendChild(child);
  });
  frame.appendChild(parent);
};

const buildMixedSelection = (frame: FrameNode, definition: P006TestDefinition, warnings: DiagnosticWarning[]): void => {
  const manual = rect("Manual animation node", "manual-node", solid(0.2, 0.43, 0.9), definition.id);
  applyTrack(manual, "OPACITY", [0, 1], [0, 0.4]);
  const style = rect("Native style node", "style-node", solid(0.86, 0.44, 0.22), definition.id);
  applyFirstStyle(style, warnings);
  frame.appendChild(manual);
  frame.appendChild(style);
  frame.appendChild(rect("No Motion node", "no-motion-node", solid(0.55, 0.6, 0.68), definition.id));
};

const readRegistry = async (): Promise<StoredP006Registry | null> => {
  const value: unknown = await figma.clientStorage.getAsync(storageKey);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const maybe = value as Partial<StoredP006Registry>;
  if (typeof maybe.rootId !== "string" || !Array.isArray(maybe.nodeIds)) {
    return null;
  }
  return {
    rootId: maybe.rootId,
    nodeIds: maybe.nodeIds.filter((id): id is string => typeof id === "string"),
    createdAt: typeof maybe.createdAt === "string" ? maybe.createdAt : new Date().toISOString()
  };
};

const saveRegistry = async (registry: StoredP006Registry | null): Promise<void> => {
  if (registry === null) {
    await figma.clientStorage.deleteAsync(storageKey);
  } else {
    await figma.clientStorage.setAsync(storageKey, registry);
  }
};

const nodeOwned = (node: BaseNode): boolean =>
  node.getPluginData("motionops.apiLab.owner") === ownerValue ||
  node.getSharedPluginData(ownerNamespace, "owner") === ownerValue;

export const clearP006Fixtures = async (): Promise<P006FixtureSummary> => {
  const registry = await readRegistry();
  const removed: string[] = [];
  const warnings: DiagnosticWarning[] = [];
  if (registry === null) {
    return { rootId: null, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: [], warnings };
  }

  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root !== null && "remove" in root && typeof root.remove === "function" && nodeOwned(root)) {
    root.remove();
    removed.push(...registry.nodeIds);
  } else {
    warnings.push({
      code: "P006_ROOT_NOT_REMOVED",
      message: "Stored fixture root was missing or was not owned by P0-006."
    });
  }

  await saveRegistry(null);
  return { rootId: registry.rootId, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: removed, warnings };
};

export const createOrRefreshP006Fixtures = async (): Promise<P006FixtureSummary> => {
  const cleanup = await clearP006Fixtures();
  const warnings: DiagnosticWarning[] = [...cleanup.warnings];
  const root = figma.createFrame();
  root.name = rootName;
  configureBox(root, 900, 80, 1080, 940, solid(0.96, 0.98, 1));
  root.layoutMode = "NONE";
  setOwnership(root, "ROOT", "fixture-root");
  figma.currentPage.appendChild(root);

  const testDefinitions = p006TestDefinitions.filter((definition) => definition.fixtureBuilder !== null);
  for (const [index, definition] of testDefinitions.entries()) {
    const frame = await createFixtureFrame(root, definition, index);
    switch (definition.fixtureBuilder) {
      case "parent-children":
        buildParentChildren(frame, definition);
        break;
      case "auto-layout-stagger":
        buildStagger(frame, definition);
        break;
      case "mixed-multi-selection":
        buildMixedSelection(frame, definition, warnings);
        break;
      default:
        buildSimpleFixture(frame, definition, warnings);
        break;
    }
  }

  const nodeIds = [root.id, ...root.findAll().map((node) => node.id)];
  await saveRegistry({ rootId: root.id, nodeIds, createdAt: new Date().toISOString() });
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return {
    rootId: root.id,
    testCaseIds: testDefinitions.map((definition) => definition.id),
    createdNodeIds: nodeIds,
    mutatedNodeIds: cleanup.mutatedNodeIds,
    warnings
  };
};

const findOwnedNodesByRoles = async (testId: P006TestId, roles: readonly string[]): Promise<SceneNode[]> => {
  if (roles.length === 0) {
    return [];
  }
  const registry = await readRegistry();
  if (registry === null) {
    throw new Error("P0-006 fixtures are missing. Create/Refresh All Test Frames first.");
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root === null || !("findAll" in root) || !nodeOwned(root)) {
    throw new Error("P0-006 fixture root is missing or not owned by this lab.");
  }
  const candidates = root
    .findAll((node) => {
      const owned = nodeOwned(node);
      const nodeTest = node.getPluginData("motionops.apiLab.testCase");
      const role = node.getPluginData("motionops.apiLab.role");
      return owned && nodeTest === testId && roles.includes(role);
    })
    .filter((node): node is SceneNode => "visible" in node);

  const nodes = roles.map((role) => candidates.find((node) => node.getPluginData("motionops.apiLab.role") === role));
  if (nodes.some((node) => node === undefined)) {
    throw new Error(`Expected roles for ${testId}: ${roles.join(", ")}.`);
  }

  if (nodes.length !== roles.length) {
    throw new Error(`Expected ${roles.length.toString()} node(s) for ${testId}, found ${nodes.length.toString()}.`);
  }
  return nodes as SceneNode[];
};

const statusFromErrors = (errors: readonly DiagnosticError[], warnings: readonly DiagnosticWarning[]): P006RunnerStatus => {
  if (errors.length > 0) {
    return warnings.some((warning) => warning.code.includes("UNAVAILABLE")) ? "UNSUPPORTED" : "ERROR";
  }
  return warnings.some((warning) => warning.code.includes("UNAVAILABLE")) ? "UNSUPPORTED" : "PASS";
};

const createRunId = (): string => `p006-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

const canvasState = () => ({
  currentPageId: figma.currentPage.id,
  canvasSelectionNodeIds: figma.currentPage.selection.map((node) => node.id),
  canvasSelectionCount: figma.currentPage.selection.length
});

const buildEnvelope = (
  runId: string,
  definition: P006TestDefinition,
  selection: P006TestDefinition["selections"][number],
  targets: ResolvedDiagnosticTargets,
  command: P006EvidenceEnvelope["command"],
  diagnostic: P006EvidenceEnvelope["raw"],
  filename: string
): P006EvidenceEnvelope => ({
  evidenceSchemaVersion: 2,
  runId,
  testCaseId: definition.id,
  testTitle: definition.title,
  subcaseId: selection.id,
  subcaseTitle: selection.title,
  command,
  timestamp: new Date().toISOString(),
  filename,
  page: { id: figma.currentPage.id, name: figma.currentPage.name },
  target: {
    mode: targets.mode,
    requestedNodeIds: targets.requestedNodeIds,
    resolvedNodeIds: targets.resolvedNodeIds,
    failedNodeIds: targets.failed.map((failure) => failure.nodeId),
    expectedRoles: [...selection.roles]
  },
  canvasState: canvasState(),
  diagnostic: {
    nodesReadCount: diagnostic.nodesReadCount,
    result: diagnostic.evidence
  },
  diagnosticStatus: diagnostic.status,
  raw: diagnostic,
  summary: diagnostic.summary,
  warnings: diagnostic.warnings,
  errors: diagnostic.errors,
  collector: { target: "http://localhost:3847/api/evidence", writeStatus: "PENDING_UI_WRITE" },
  plugin: { version: "0.0.0", build: "lab" }
});

const validatePreflight = (
  definition: P006TestDefinition,
  selection: P006TestDefinition["selections"][number],
  targets: ResolvedDiagnosticTargets
): DiagnosticError[] => {
  const errors: DiagnosticError[] = [];
  if (targets.requestedNodeIds.length !== selection.roles.length) {
    errors.push({
      code: "P006_TARGET_COUNT_MISMATCH",
      message: `Expected ${selection.roles.length.toString()} requested target(s), got ${targets.requestedNodeIds.length.toString()}.`,
      path: `${definition.id}.${selection.id}`
    });
  }
  if (targets.resolvedNodeIds.length !== selection.roles.length) {
    errors.push({
      code: "P006_RESOLVED_COUNT_MISMATCH",
      message: `Expected ${selection.roles.length.toString()} resolved target(s), got ${targets.resolvedNodeIds.length.toString()}.`,
      path: `${definition.id}.${selection.id}`
    });
  }
  if (definition.id !== "R01" && targets.resolvedNodeIds.length === 0) {
    errors.push({
      code: "P006_ZERO_RESOLVED_TARGETS",
      message: "Selected-node cases must resolve at least one explicit target.",
      path: `${definition.id}.${selection.id}`
    });
  }
  for (const node of targets.resolvedNodes) {
    if (!nodeOwned(node) || node.getPluginData("motionops.apiLab.testCase") !== definition.id) {
      errors.push({
        code: "P006_FIXTURE_OWNERSHIP_MISMATCH",
        message: `Resolved node ${node.id} is not owned by ${definition.id}.`,
        path: node.id
      });
    }
  }
  return errors;
};

export const runP006Test = async (testId: P006TestId, runId: string = createRunId()): Promise<P006TestRunResult> => {
  const definition = getP006TestDefinition(testId);
  if (definition === undefined) {
    throw new Error(`Unknown P0-006 test id: ${testId}`);
  }

  const startedAt = new Date().toISOString();
  const warnings: DiagnosticWarning[] = [];
  const errors: DiagnosticError[] = [];
  const evidence: P006EvidenceEnvelope[] = [];

  for (const selection of definition.selections) {
    try {
      const nodes = await findOwnedNodesByRoles(definition.id, selection.roles);
      const target =
        definition.id === "R01"
          ? ({ mode: "EMPTY" } as const)
          : ({ mode: "EXPLICIT_NODE_IDS", nodeIds: nodes.map((node) => node.id) } as const);
      const reveal = await revealDiagnosticTargets(nodes.map((node) => node.id));
      warnings.push(
        ...reveal.warnings.map((message): DiagnosticWarning => ({
          code: "P006_REVEAL_WARNING",
          message,
          path: `${definition.id}.${selection.id}`
        }))
      );
      const targets = await resolveDiagnosticTargets(target);
      const preflightErrors = validatePreflight(definition, selection, targets);
      if (preflightErrors.length > 0) {
        errors.push(...preflightErrors);
        continue;
      }

      for (const command of definition.commands) {
        const diagnostic = await runMotionDiagnostic(command, targets, {
          testCaseId: definition.id,
          subcaseId: selection.id,
          expectedRoles: [...selection.roles]
        });
        if (diagnostic.nodesReadCount !== targets.resolvedNodeIds.length) {
          errors.push({
            code: "P006_NODES_READ_MISMATCH",
            message: `Diagnostic read ${diagnostic.nodesReadCount.toString()} node(s), but resolved ${targets.resolvedNodeIds.length.toString()} target(s).`,
            path: `${definition.id}.${selection.id}.${command}`
          });
          continue;
        }
        const filename = p006EvidenceFilename(definition, selection.id, command);
        evidence.push(buildEnvelope(runId, definition, selection, targets, command, diagnostic, filename));
      }
    } catch (error) {
      errors.push({
        code: "P006_SUBCASE_FAILED",
        message: error instanceof Error ? error.message : "Unknown P0-006 subcase failure.",
        path: `${definition.id}.${selection.id}`
      });
    }
  }

  const commandErrors = evidence.flatMap((item) => item.errors);
  const commandWarnings = evidence.flatMap((item) => item.warnings);
  warnings.push(...commandWarnings);
  errors.push(...commandErrors);
  const status =
    evidence.length === 0
      ? statusFromErrors(errors, warnings)
      : errors.length > 0
        ? "PARTIAL"
        : evidence.some((item) => item.diagnosticStatus === "ERROR")
          ? "PARTIAL"
          : statusFromErrors(errors, warnings);

  return {
    testId: definition.id,
    runId,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    files: evidence.map((item) => item.filename),
    evidence,
    warnings,
    errors
  };
};

export const verifyP006TargetPipeline = async (): Promise<P006TargetPipelineResult> => {
  const warnings: DiagnosticWarning[] = [];
  const errors: DiagnosticError[] = [];
  try {
    const nodes = await findOwnedNodesByRoles("R10", ["manual-node", "style-node"]);
    await revealDiagnosticTargets([]);
    const targets = await resolveDiagnosticTargets({
      mode: "EXPLICIT_NODE_IDS",
      nodeIds: nodes.map((node) => node.id)
    });
    const diagnostic = await runMotionDiagnostic("VERIFY_EXPLICIT_TARGET_PIPELINE", targets, {
      testCaseId: "R10",
      subcaseId: "target-pipeline",
      expectedRoles: ["manual-node", "style-node"]
    });
    errors.push(...diagnostic.errors);
    return {
      status:
        targets.requestedNodeIds.length === 2 &&
        targets.resolvedNodeIds.length === 2 &&
        diagnostic.nodesReadCount === 2
          ? "PASS"
          : "ERROR",
      requested: targets.requestedNodeIds.length,
      resolved: targets.resolvedNodeIds.length,
      nodesRead: diagnostic.nodesReadCount,
      requestedNodeIds: targets.requestedNodeIds,
      resolvedNodeIds: targets.resolvedNodeIds,
      canvasSelectionNodeIds: targets.canvasSelectionNodeIds,
      warnings,
      errors
    };
  } catch (error) {
    return {
      status: "ERROR",
      requested: 0,
      resolved: 0,
      nodesRead: 0,
      requestedNodeIds: [],
      resolvedNodeIds: [],
      canvasSelectionNodeIds: figma.currentPage.selection.map((node) => node.id),
      warnings,
      errors: [
        {
          code: "P006_TARGET_PIPELINE_FAILED",
          message: error instanceof Error ? error.message : "Unknown target pipeline failure."
        }
      ]
    };
  }
};

export const createP006RunManifest = (
  runId: string,
  startedAt: string,
  finishedAt: string,
  results: readonly P006TestRunResult[],
  targetPipeline: P006TargetPipelineResult | null
): P006RunManifest => {
  const evidenceFiles = results.flatMap((result) => result.files);
  const accepted = targetPipeline?.status === "PASS" && results.every((result) => result.status === "PASS");
  return {
    runId,
    evidenceSchemaVersion: 2,
    build: "lab",
    startedAt,
    finishedAt,
    testIds: results.map((result) => result.testId),
    evidenceFiles,
    accepted,
    rejectionReason: accepted ? undefined : "P0-006 still requires live evidence analysis before acceptance.",
    targetPipeline
  };
};

export const createP006RunId = createRunId;
