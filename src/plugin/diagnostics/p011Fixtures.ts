import type { DiagnosticError, DiagnosticValue, DiagnosticWarning, P006FixtureSummary, P006RunnerStatus, P011FixtureReadiness } from "../../shared/diagnostics";
import { serializeDiagnosticValue } from "../../shared/diagnosticSerializer";
import {
  classifyP011Capabilities,
  classifyP011Terminal,
  createP011RunManifest as createP011RunManifestFromResult,
  p011EvidenceSchemaVersion,
  stableFingerprint,
  toDiagnosticValue,
  type P011EvidenceRecord,
  type P011MotionSnapshot,
  type P011MutationAttempt,
  type P011RunManifest,
  type P011RunResult
} from "../../shared/p011Evidence";
import {
  getP011CaseDefinition,
  p011CaseDefinitions,
  p011EvidenceFilename,
  type P011CapabilityAttempt,
  type P011CaseDefinition,
  type P011CaseId
} from "../../shared/p011Registry";
import {
  p011RequiredTopologyRoles,
  validateP011Topology,
  type P011ConstructionDiagnostic,
  type P011ConstructionStage,
  type P011RoleInfo
} from "../../shared/p011FixtureTopology";
import { resolveDiagnosticTargets, revealDiagnosticTargets } from "./targetResolver";

type MotionWritableNode = SceneNode & {
  readonly manualKeyframeTracks?: unknown;
  readonly animationStyles?: unknown;
  readonly timelines?: unknown;
  readonly animations?: unknown;
  readonly overrides?: unknown;
  readonly mainComponent?: ComponentNode | null;
  readonly componentPropertyReferences?: unknown;
  getMainComponentAsync?: () => Promise<ComponentNode | null>;
  applyManualKeyframeTrack?: (field: KeyframeField, track: ManualKeyframeTrackInput) => void;
  applyAnimationStyle?: (styleId: string, animationStyleData?: AnimationStyleConfiguration) => string;
  removeAnimationStyle?: (id: string) => void;
  setTimelineDuration?: (id: string, duration: number) => void;
};

interface StoredP011Registry {
  rootId: string;
  nodeIds: string[];
  roleIds: Partial<Record<string, string>>;
  rootRoleId: string | null;
  applicationStyleId: string | null;
  appliedStyleInstanceIds: Record<string, string | null>;
  createdAt: string;
}

interface P011FixtureContext {
  registry: StoredP011Registry;
  root: FrameNode;
}

const storageKey = "motionops.apiLab.p011Registry";
const ownerNamespace = "motionops.apiLab";
const ownerValue = "P0-011";
const rootName = "__MOTIONOPS_P0_011_FIXTURES__";
const buildingRootName = "__MOTIONOPS_P0_011_BUILDING__";
const typingsVersion = "1.130.0";

const serial = (value: unknown): DiagnosticValue =>
  serializeDiagnosticValue(value, { maxDepth: 10, maxArrayItems: 100, maxObjectKeys: 100 }).value;

const setOwnership = (node: BaseNode, role: string): void => {
  node.setPluginData("motionops.apiLab.owner", ownerValue);
  node.setPluginData("motionops.apiLab.role", role);
  node.setSharedPluginData(ownerNamespace, "owner", ownerValue);
  node.setSharedPluginData(ownerNamespace, "role", role);
};

const getRole = (node: BaseNode): string =>
  node.getPluginData("motionops.apiLab.role") || node.getSharedPluginData(ownerNamespace, "role");

const nodeOwned = (node: BaseNode): boolean =>
  node.getPluginData("motionops.apiLab.owner") === ownerValue ||
  node.getSharedPluginData(ownerNamespace, "owner") === ownerValue;

const isMotionWritableNode = (node: BaseNode | null): node is MotionWritableNode =>
  node !== null && "visible" in node;

const solid = (r: number, g: number, b: number): Paint[] => [{ type: "SOLID", color: { r, g, b } }];

const configureBox = (node: FrameNode | ComponentNode | InstanceNode | RectangleNode, x: number, y: number, width: number, height: number, fills: Paint[]): void => {
  node.x = x;
  node.y = y;
  node.resize(width, height);
  if (node.type !== "INSTANCE" && "fills" in node) {
    node.fills = fills;
  }
};

const manualTrack = (values: readonly number[], positions: readonly number[]): ManualKeyframeTrackInput => ({
  baseValue: { type: "FLOAT", value: values[0] ?? 0 },
  keyframes: values.map((value, index) => ({
    timelinePosition: positions[index] ?? index * 0.2,
    easing: { type: index === values.length - 1 ? "EASE_OUT" : "EASE_IN_AND_OUT" },
    value: { type: "FLOAT", value }
  }))
});

const applyTrack = (node: MotionWritableNode, name: "OPACITY" | "TRANSLATION_X", values: readonly number[], positions: readonly number[]): void => {
  if (typeof node.applyManualKeyframeTrack === "function") {
    node.applyManualKeyframeTrack({ type: "PROPERTY", name }, manualTrack(values, positions));
  }
};

const readRegistry = async (): Promise<StoredP011Registry | null> => {
  const value: unknown = await figma.clientStorage.getAsync(storageKey);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  return typeof raw.rootId === "string" && Array.isArray(raw.nodeIds) && typeof raw.roleIds === "object" && raw.roleIds !== null
    ? {
        rootId: raw.rootId,
        nodeIds: raw.nodeIds.filter((id): id is string => typeof id === "string"),
        roleIds: Object.fromEntries(Object.entries(raw.roleIds).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
        rootRoleId: typeof raw.rootRoleId === "string" ? raw.rootRoleId : null,
        applicationStyleId: typeof raw.applicationStyleId === "string" ? raw.applicationStyleId : null,
        appliedStyleInstanceIds:
          typeof raw.appliedStyleInstanceIds === "object" && raw.appliedStyleInstanceIds !== null
            ? Object.fromEntries(Object.entries(raw.appliedStyleInstanceIds).map(([key, id]) => [key, typeof id === "string" ? id : null]))
            : {},
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()
      }
    : null;
};

const saveRegistry = async (registry: StoredP011Registry | null): Promise<void> => {
  if (registry === null) {
    await figma.clientStorage.deleteAsync(storageKey);
  } else {
    await figma.clientStorage.setAsync(storageKey, registry);
  }
};

const removeP011Node = (node: BaseNode, warnings: DiagnosticWarning[]): boolean => {
  try {
    if (node.removed || !("remove" in node) || typeof node.remove !== "function") {
      return false;
    }
    node.remove();
    return true;
  } catch (error) {
    warnings.push({
      code: "P011_STALE_NODE_REMOVE_SKIPPED",
      message: error instanceof Error ? error.message : "Unknown stale P0-011 node removal failure.",
      path: node.id
    });
    return false;
  }
};

export const clearP011Fixtures = async (): Promise<P006FixtureSummary> => {
  const registry = await readRegistry();
  const warnings: DiagnosticWarning[] = [];
  if (registry === null) {
    const orphaned = figma.currentPage.findAll((node) => nodeOwned(node) || node.name === rootName || node.name === buildingRootName);
    const removed = new Set<string>();
    for (const node of orphaned) {
      if (removed.has(node.id)) {
        continue;
      }
      const removable = node.parent?.type === "PAGE" || node.name === rootName;
      if (removable && "remove" in node && typeof node.remove === "function") {
        removed.add(node.id);
        removeP011Node(node, warnings);
      }
    }
    return { rootId: null, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: [], warnings };
  }
  const topLevelOwned = figma.currentPage.findAll((node) => nodeOwned(node) || node.name === rootName || node.name === buildingRootName).filter((node) => node.parent?.type === "PAGE");
  if (topLevelOwned.length === 0) {
    warnings.push({ code: "P011_ROOT_NOT_REMOVED", message: "Stored P0-011 fixture nodes were missing or not owned." });
  }
  for (const node of topLevelOwned) {
    removeP011Node(node, warnings);
  }
  await saveRegistry(null);
  return { rootId: registry.rootId, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: registry.nodeIds, warnings };
};

const isRejectedApplicationId = (value: string): boolean =>
  value.startsWith("CodeComponentId:") || value.startsWith("AnimationPresetId:");

const firstApplicationStyle = (): string | null => {
  try {
    return figma.motion.figmaAnimationStyles().find((style) => style.styleId.trim().length > 0 && !isRejectedApplicationId(style.styleId))?.styleId ?? null;
  } catch {
    return null;
  }
};

const appliedStyles = (node: MotionWritableNode): { id?: string; styleId?: string }[] => {
  const styles = serial(node.animationStyles);
  if (!Array.isArray(styles)) {
    return [];
  }
  const output: { id?: string; styleId?: string }[] = [];
  for (const style of styles) {
    if (typeof style === "object" && style !== null && !Array.isArray(style)) {
      output.push({
        id: typeof style.id === "string" ? style.id : undefined,
        styleId: typeof style.styleId === "string" ? style.styleId : undefined
      });
    }
  }
  return output;
};

const tagTreeRoles = (node: BaseNode): void => {
  if ("children" in node) {
    for (const child of node.children) {
      const existing = getRole(child);
      if (existing.length > 0) {
        setOwnership(child, existing);
      }
      tagTreeRoles(child);
    }
  }
};

const createAnimatedRect = (role: string, x: number, y: number, fill: Paint[]): RectangleNode => {
  const rect = figma.createRectangle();
  rect.name = role;
  configureBox(rect, x, y, 90, 56, fill);
  setOwnership(rect, role);
  return rect;
};

const applyStyleFixture = (node: MotionWritableNode, applicationStyleId: string | null): string | null => {
  if (applicationStyleId === null || typeof node.applyAnimationStyle !== "function") {
    return null;
  }
  const returned = node.applyAnimationStyle(applicationStyleId, { duration: 0.55, timelineOffset: 0 });
  const styles = appliedStyles(node);
  return styles.find((style) => style.id === returned)?.id ?? styles[0]?.id ?? null;
};

const emptyP011Readiness = (
  status: P006RunnerStatus,
  diagnostics: readonly P011ConstructionDiagnostic[],
  errors: readonly DiagnosticError[],
  overrides: Partial<P011FixtureReadiness> = {}
): P011FixtureReadiness => ({
  status,
  ready: status === "PASS",
  failedStage: errors[0]?.path ?? null,
  roleCount: 0,
  expectedRoleCount: p011RequiredTopologyRoles.length,
  roleTable: [],
  diagnostics: [...diagnostics],
  errors: [...errors],
  cleanupAttempted: false,
  cleanupCompleted: false,
  ...overrides
});

const diagnostic = (
  stage: P011ConstructionStage,
  overrides: Partial<P011ConstructionDiagnostic> = {}
): P011ConstructionDiagnostic => ({
  requestId: null,
  stage,
  entered: true,
  completed: false,
  createdNodeType: null,
  createdNodeId: null,
  expectedParentRole: null,
  actualParentType: null,
  registryRole: null,
  cleanupAttempted: false,
  cleanupCompleted: false,
  terminalResult: "RUNNING",
  message: null,
  ...overrides
});

const sourceRoleFor = async (node: BaseNode, sourceById: ReadonlyMap<string, string>): Promise<string | null> => {
  if (!isMotionWritableNode(node) || node.type !== "INSTANCE" || typeof node.getMainComponentAsync !== "function") {
    return null;
  }
  const source = await node.getMainComponentAsync();
  return source === null ? null : sourceById.get(source.id) ?? null;
};

const roleInfo = async (
  role: string,
  node: BaseNode,
  parentRole: string | null,
  sourceById: ReadonlyMap<string, string>
): Promise<P011RoleInfo> => ({
  role,
  nodeId: node.id,
  nodeType: node.type,
  parentRole,
  sourceRole: await sourceRoleFor(node, sourceById)
});

const findFirstChildByName = (node: BaseNode, name: string): BaseNode | null =>
  "findOne" in node ? node.findOne((child) => child.name === name) : null;

const findFirstInstance = (node: BaseNode): InstanceNode | null =>
  "findOne" in node ? (node.findOne((child) => child.type === "INSTANCE") as InstanceNode | null) : null;

const seedBaselineMotion = (nodes: readonly MotionWritableNode[], applicationStyleId: string | null): Record<string, string | null> => {
  const appliedStyleInstanceIds: Record<string, string | null> = {};
  for (const node of nodes) {
    applyTrack(node, "OPACITY", [0.15, 0.55, 1], [0, 0.24, 0.56]);
  }
  const styleTarget = nodes.find((node) => getRole(node) === "style-target");
  if (styleTarget !== undefined) {
    appliedStyleInstanceIds[styleTarget.id] = applyStyleFixture(styleTarget, applicationStyleId);
  }
  return appliedStyleInstanceIds;
};

export const createOrRefreshP011Fixtures = async (): Promise<P006FixtureSummary> => {
  const cleanup = await clearP011Fixtures();
  const warnings: DiagnosticWarning[] = [...cleanup.warnings];
  const diagnostics: P011ConstructionDiagnostic[] = [];
  const createdTopLevelNodes: SceneNode[] = [];
  const roleNodes = new Map<string, BaseNode>();
  const roleParents = new Map<string, string | null>();
  const sourceById = new Map<string, string>();
  const applicationStyleId = firstApplicationStyle();
  if (applicationStyleId === null) {
    warnings.push({ code: "P011_STYLE_FIXTURE_LIMITED", message: "No applicable native Motion style found; C11 may block." });
  }
  const root = figma.createFrame();
  let currentStage: P011ConstructionStage = "ROOT";
  const mark = (stage: P011ConstructionStage, entry: Partial<P011ConstructionDiagnostic> = {}): void => {
    currentStage = stage;
    diagnostics.push(diagnostic(stage, entry));
  };
  const complete = (stage: P011ConstructionStage, entry: Partial<P011ConstructionDiagnostic> = {}): void => {
    diagnostics.push(diagnostic(stage, { completed: true, terminalResult: "RUNNING", ...entry }));
  };
  const remember = (role: string, node: BaseNode, parentRole: string | null = node.parent === null ? null : getRole(node.parent)): void => {
    roleNodes.set(role, node);
    roleParents.set(role, parentRole);
    setOwnership(node, role);
  };
  const rememberVirtual = (role: string, node: BaseNode, parentRole: string | null): void => {
    roleNodes.set(role, node);
    roleParents.set(role, parentRole);
  };
  const buildRoleTable = async (): Promise<P011RoleInfo[]> =>
    Promise.all(
      [...roleNodes.entries()].map(async ([role, node]) => roleInfo(role, node, roleParents.get(role) ?? null, sourceById))
    );
  try {
    mark("ROOT");
    root.name = buildingRootName;
    configureBox(root, 2040, 120, 1280, 860, solid(0.96, 0.98, 1));
    remember("fixture-root", root, null);
    figma.currentPage.appendChild(root);
    createdTopLevelNodes.push(root);
    complete("ROOT", { createdNodeType: root.type, createdNodeId: root.id, actualParentType: root.parent?.type ?? null, registryRole: "fixture-root" });

    mark("CONTROL");
    const control = figma.createFrame();
    control.name = "P0-011 control frame";
    configureBox(control, 20, 20, 230, 140, solid(0.93, 0.98, 0.98));
    remember("control-frame", control, "fixture-root");
    const controlChild = createAnimatedRect("control-child", 24, 38, solid(0.08, 0.57, 0.65));
    remember("control-child", controlChild, "control-frame");
    control.appendChild(controlChild);
    root.appendChild(control);
    complete("CONTROL", { createdNodeType: control.type, createdNodeId: control.id, expectedParentRole: "fixture-root", actualParentType: control.parent?.type ?? null, registryRole: "control-frame" });

    mark("SIMPLE_COMPONENT");
    const simpleComponent = figma.createComponent();
    simpleComponent.name = "P0-011 simple component";
    configureBox(simpleComponent, 2320, 170, 210, 140, solid(0.97, 0.95, 1));
    remember("simple-component", simpleComponent, null);
    createdTopLevelNodes.push(simpleComponent);
    sourceById.set(simpleComponent.id, "simple-component");
    const simpleChild = createAnimatedRect("simple-component-child", 24, 38, solid(0.48, 0.32, 0.82));
    remember("simple-component-child", simpleChild, "simple-component");
    simpleComponent.appendChild(simpleChild);
    complete("SIMPLE_COMPONENT", { createdNodeType: simpleComponent.type, createdNodeId: simpleComponent.id, actualParentType: simpleComponent.parent?.type ?? null, registryRole: "simple-component" });

    mark("DIRECT_INSTANCES");
    const directA = simpleComponent.createInstance();
    directA.name = "P0-011 direct instance A";
    configureBox(directA, 20, 230, 210, 140, solid(0.93, 0.96, 1));
    remember("direct-instance-a", directA, "fixture-root");
    root.appendChild(directA);
    const directB = simpleComponent.createInstance();
    directB.name = "P0-011 direct instance B";
    configureBox(directB, 260, 230, 210, 140, solid(0.93, 0.96, 1));
    remember("direct-instance-b", directB, "fixture-root");
    root.appendChild(directB);
    const directAChild = findFirstChildByName(directA, "simple-component-child");
    const directBChild = findFirstChildByName(directB, "simple-component-child");
    if (directAChild !== null) rememberVirtual("direct-instance-a-child", directAChild, "direct-instance-a");
    if (directBChild !== null) rememberVirtual("direct-instance-b-child", directBChild, "direct-instance-b");
    complete("DIRECT_INSTANCES", { createdNodeType: directA.type, createdNodeId: directA.id, expectedParentRole: "fixture-root", actualParentType: directA.parent?.type ?? null, registryRole: "direct-instance-a" });

    mark("VARIANT_COMPONENTS");
    const variantA = figma.createComponent();
    variantA.name = "Kind=A";
    configureBox(variantA, 2600, 170, 180, 120, solid(0.99, 0.96, 0.9));
    remember("variant-a", variantA, "component-set");
    const variantAChild = createAnimatedRect("variant-a-child", 20, 34, solid(0.8, 0.42, 0.18));
    remember("variant-a-child", variantAChild, "variant-a");
    variantA.appendChild(variantAChild);
    const variantB = figma.createComponent();
    variantB.name = "Kind=B";
    configureBox(variantB, 2820, 170, 180, 120, solid(0.93, 0.98, 0.92));
    remember("variant-b", variantB, "component-set");
    const variantBChild = createAnimatedRect("variant-b-child", 20, 34, solid(0.25, 0.68, 0.33));
    remember("variant-b-child", variantBChild, "variant-b");
    variantB.appendChild(variantBChild);
    complete("VARIANT_COMPONENTS", { createdNodeType: variantA.type, createdNodeId: variantA.id, registryRole: "variant-a" });

    mark("COMPONENT_SET");
    const componentSet = figma.combineAsVariants([variantA, variantB], figma.currentPage);
    componentSet.name = "P0-011 component set";
    componentSet.x = 2580;
    componentSet.y = 150;
    remember("component-set", componentSet, null);
    createdTopLevelNodes.push(componentSet);
    tagTreeRoles(componentSet);
    sourceById.set(variantA.id, "variant-a");
    sourceById.set(variantB.id, "variant-b");
    const variantInstanceA = variantA.createInstance();
    variantInstanceA.name = "P0-011 variant instance A";
    configureBox(variantInstanceA, 520, 230, 190, 120, solid(0.99, 0.96, 0.9));
    remember("variant-instance-a", variantInstanceA, "fixture-root");
    root.appendChild(variantInstanceA);
    const variantInstanceB = variantB.createInstance();
    variantInstanceB.name = "P0-011 variant instance B";
    configureBox(variantInstanceB, 740, 230, 190, 120, solid(0.93, 0.98, 0.92));
    remember("variant-instance-b", variantInstanceB, "fixture-root");
    root.appendChild(variantInstanceB);
    complete("COMPONENT_SET", { createdNodeType: componentSet.type, createdNodeId: componentSet.id, actualParentType: componentSet.parent?.type ?? null, registryRole: "component-set" });

    mark("INNER_COMPONENT");
    const innerComponent = figma.createComponent();
    innerComponent.name = "P0-011 inner component";
    configureBox(innerComponent, 2320, 390, 190, 120, solid(0.95, 0.97, 1));
    remember("inner-component", innerComponent, null);
    createdTopLevelNodes.push(innerComponent);
    sourceById.set(innerComponent.id, "inner-component");
    const innerChild = createAnimatedRect("inner-component-child", 20, 32, solid(0.1, 0.45, 0.82));
    remember("inner-component-child", innerChild, "inner-component");
    innerComponent.appendChild(innerChild);
    complete("INNER_COMPONENT", { createdNodeType: innerComponent.type, createdNodeId: innerComponent.id, registryRole: "inner-component" });

    mark("OUTER_COMPONENT");
    const outerComponent = figma.createComponent();
    outerComponent.name = "P0-011 outer component";
    configureBox(outerComponent, 2580, 390, 230, 150, solid(0.96, 0.95, 1));
    remember("outer-component", outerComponent, null);
    createdTopLevelNodes.push(outerComponent);
    sourceById.set(outerComponent.id, "outer-component");
    const innerInstanceInComponent = innerComponent.createInstance();
    innerInstanceInComponent.name = "P0-011 nested inner instance source";
    innerInstanceInComponent.x = 20;
    innerInstanceInComponent.y = 20;
    remember("inner-instance-in-outer-component", innerInstanceInComponent, "outer-component");
    outerComponent.appendChild(innerInstanceInComponent);
    complete("OUTER_COMPONENT", { createdNodeType: outerComponent.type, createdNodeId: outerComponent.id, registryRole: "outer-component" });

    mark("NESTED_INSTANCES");
    const outerInstanceA = outerComponent.createInstance();
    outerInstanceA.name = "P0-011 outer instance A";
    configureBox(outerInstanceA, 20, 440, 230, 150, solid(0.96, 0.95, 1));
    remember("outer-instance-a", outerInstanceA, "fixture-root");
    root.appendChild(outerInstanceA);
    const outerInstanceB = outerComponent.createInstance();
    outerInstanceB.name = "P0-011 outer instance B";
    configureBox(outerInstanceB, 280, 440, 230, 150, solid(0.96, 0.95, 1));
    remember("outer-instance-b", outerInstanceB, "fixture-root");
    root.appendChild(outerInstanceB);
    const nestedA = findFirstInstance(outerInstanceA);
    const nestedB = findFirstInstance(outerInstanceB);
    if (nestedA !== null) {
      rememberVirtual("nested-inner-instance-a", nestedA, "outer-instance-a");
      const nestedAChild = findFirstChildByName(nestedA, "inner-component-child");
      if (nestedAChild !== null) rememberVirtual("nested-inner-instance-a-child", nestedAChild, "nested-inner-instance-a");
    }
    if (nestedB !== null) {
      rememberVirtual("nested-inner-instance-b", nestedB, "outer-instance-b");
      const nestedBChild = findFirstChildByName(nestedB, "inner-component-child");
      if (nestedBChild !== null) rememberVirtual("nested-inner-instance-b-child", nestedBChild, "nested-inner-instance-b");
    }
    complete("NESTED_INSTANCES", { createdNodeType: outerInstanceA.type, createdNodeId: outerInstanceA.id, registryRole: "outer-instance-a" });

    const styleTarget = createAnimatedRect("style-target", 560, 440, solid(0.86, 0.36, 0.46));
    remember("style-target", styleTarget, "fixture-root");
    root.appendChild(styleTarget);

    mark("TOPOLOGY_VERIFY");
    const roleTable = await buildRoleTable();
    const topologyErrors = validateP011Topology(roleTable);
    if (topologyErrors.length > 0) {
      throw new Error(`P011_TOPOLOGY_VERIFY failed: ${topologyErrors.map((error) => error.message).join("; ")}`);
    }
    complete("TOPOLOGY_VERIFY", { message: `${roleTable.length.toString()} roles validated.` });

    mark("MOTION_SEEDING");
    const motionTargets = [controlChild, simpleChild, variantAChild, variantBChild, innerChild, styleTarget].filter(isMotionWritableNode);
    const appliedStyleInstanceIds = seedBaselineMotion(motionTargets, applicationStyleId);
    complete("MOTION_SEEDING", { message: `${motionTargets.length.toString()} ordinary child target(s) seeded.` });

    tagTreeRoles(root);
    const roots = createdTopLevelNodes;
    const ids = [
      ...roots.map((node) => node.id),
      ...roots.flatMap((node) => ("findAll" in node ? node.findAll().map((child) => child.id) : []))
    ];
    const registry: StoredP011Registry = {
      rootId: root.id,
      nodeIds: ids,
      roleIds: Object.fromEntries([...roleNodes.entries()].map(([role, node]) => [role, node.id])),
      rootRoleId: root.id,
      applicationStyleId,
      appliedStyleInstanceIds,
      createdAt: new Date().toISOString()
    };
    mark("REGISTRY_WRITE");
    await saveRegistry(registry);
    complete("REGISTRY_WRITE", { message: "Registry saved." });
    root.name = rootName;
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    complete("UI_RESPONSE", { terminalResult: "PASS", message: "P0-011 fixtures created and self-verified." });
    return {
      rootId: root.id,
      testCaseIds: [],
      createdNodeIds: ids,
      mutatedNodeIds: cleanup.mutatedNodeIds,
      warnings,
      p011Readiness: emptyP011Readiness("PASS", diagnostics, [], {
        roleCount: roleTable.length,
        roleTable,
        cleanupAttempted: false,
        cleanupCompleted: false
      })
    };
  } catch (error) {
    const partialRoleTable = await buildRoleTable();
    const diagnosticError: DiagnosticError = {
      code: "P011_CONSTRUCTION_FAILED",
      message: error instanceof Error ? error.message : "Unknown P0-011 construction failure.",
      path: currentStage
    };
    diagnostics.push(diagnostic(currentStage, { terminalResult: "ERROR", message: diagnosticError.message }));
    for (const node of createdTopLevelNodes.slice().reverse()) {
      if ("remove" in node && typeof node.remove === "function" && !node.removed) {
        node.remove();
      }
    }
    await saveRegistry(null);
    diagnostics.push(diagnostic(currentStage, { cleanupAttempted: true, cleanupCompleted: true, terminalResult: "ERROR" }));
    return {
      rootId: null,
      testCaseIds: [],
      createdNodeIds: [],
      mutatedNodeIds: cleanup.mutatedNodeIds,
      warnings,
      p011Readiness: emptyP011Readiness("ERROR", diagnostics, [diagnosticError], {
        failedStage: currentStage,
        roleCount: partialRoleTable.length,
        roleTable: partialRoleTable,
        cleanupAttempted: true,
        cleanupCompleted: true
      })
    };
  }
};

const getContext = async (): Promise<P011FixtureContext> => {
  const registry = await readRegistry();
  if (registry === null) {
    throw new Error("P0-011 fixtures are missing.");
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root?.type !== "FRAME" || !nodeOwned(root)) {
    throw new Error("P0-011 fixture root is missing, wrong kind, or not owned.");
  }
  return { registry, root };
};

const findByRole = async (role: string, context?: P011FixtureContext): Promise<MotionWritableNode | null> => {
  const resolved = context ?? (await getContext());
  let id: string | null = resolved.registry.roleIds[role] ?? null;
  if (id === null) {
    if (role === "direct-instance-a-child") {
      id = findDescendantRole(resolved.root, "direct-instance-a", "simple-component-child");
    } else if (role === "nested-inner-instance") {
      id = findDescendantType(resolved.root, "outer-instance-a", "INSTANCE");
    } else if (role === "nested-inner-instance-child") {
      const nestedId = findDescendantType(resolved.root, "outer-instance-a", "INSTANCE");
      const nested = nestedId === null ? null : await figma.getNodeByIdAsync(nestedId);
      id = nested !== null && "findOne" in nested ? nested.findOne((node) => node.name === "inner-component-child")?.id ?? null : null;
    }
  }
  const node = id === null ? null : await figma.getNodeByIdAsync(id);
  return isMotionWritableNode(node) ? node : null;
};

const findDescendantRole = (root: FrameNode, ancestorRole: string, childName: string): string | null => {
  const ancestor = root.findOne((node) => getRole(node) === ancestorRole);
  if (ancestor === null || !("findAll" in ancestor)) {
    return null;
  }
  return ancestor.findAll((node) => node.name === childName)[0]?.id ?? null;
};

const findDescendantType = (root: FrameNode, ancestorRole: string, type: string): string | null => {
  const ancestor = root.findOne((node) => getRole(node) === ancestorRole);
  if (ancestor === null || !("findAll" in ancestor)) {
    return null;
  }
  return ancestor.findAll((node) => node.type === type)[0]?.id ?? null;
};

const ancestorTypes = (node: BaseNode | null): string[] => {
  const types: string[] = [];
  let current = node?.parent ?? null;
  while (current !== null) {
    types.push(current.type);
    current = current.parent;
  }
  return types;
};

const getMainComponentId = async (node: MotionWritableNode | null): Promise<string | null> => {
  if (node?.type !== "INSTANCE" || typeof node.getMainComponentAsync !== "function") {
    return null;
  }
  return (await node.getMainComponentAsync())?.id ?? null;
};

const snapshot = async (node: MotionWritableNode | null): Promise<P011MotionSnapshot | null> => {
  if (node === null) {
    return null;
  }
  const children = "children" in node ? node.children.map((child) => ({ id: child.id, name: child.name, type: child.type })) : [];
  const payload = {
    manualKeyframeTracks: serial(node.manualKeyframeTracks),
    animationStyles: serial(node.animationStyles),
    timelines: serial(node.timelines),
    derivedAnimations: serial(node.animations),
    overrides: serial(node.overrides),
    componentPropertyReferences: serial(node.componentPropertyReferences),
    children
  };
  return {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    role: getRole(node),
    ...payload,
    mainComponentId: await getMainComponentId(node),
    componentSetId: node.parent?.type === "COMPONENT_SET" ? node.parent.id : null,
    fingerprint: stableFingerprint(payload)
  };
};

const sourceAndSibling = async (definition: P011CaseDefinition, context: P011FixtureContext): Promise<{ source: MotionWritableNode | null; sibling: MotionWritableNode | null }> => {
  if (definition.id === "C05") {
    return { source: await findByRole("component-set", context), sibling: await findByRole("variant-b", context) };
  }
  if (["C06", "C07", "C10"].includes(definition.id)) {
    return { source: await findByRole("simple-component", context), sibling: await findByRole("direct-instance-b", context) };
  }
  if (["C08", "C09"].includes(definition.id)) {
    return { source: await findByRole("inner-component", context), sibling: await findByRole("outer-instance-b", context) };
  }
  if (definition.id === "C03") {
    return { source: await findByRole("simple-component", context), sibling: await findByRole("direct-instance-a", context) };
  }
  return { source: null, sibling: null };
};

const firstTimeline = (node: MotionWritableNode): { id: string; duration: number } | null => {
  const timelines = serial(node.timelines);
  if (!Array.isArray(timelines)) {
    return null;
  }
  const found = timelines.find((item) => typeof item === "object" && item !== null && "id" in item && "duration" in item) as { id?: unknown; duration?: unknown } | undefined;
  return typeof found?.id === "string" && typeof found.duration === "number" ? { id: found.id, duration: found.duration } : null;
};

const attempt = async (
  node: MotionWritableNode | null,
  capability: P011CapabilityAttempt,
  registry: StoredP011Registry
): Promise<P011MutationAttempt> => {
  const before = await snapshot(node);
  const base: P011MutationAttempt = {
    capability,
    attempted: true,
    accepted: null,
    rejected: false,
    error: null,
    beforeFingerprint: before?.fingerprint ?? null,
    afterFingerprint: null,
    changed: null,
    semanticEqualToBefore: null,
    plannedMutation: null
  };
  if (node === null) {
    return { ...base, rejected: true, error: { code: "P011_TARGET_MISSING", message: "Target node is missing.", path: capability } };
  }
  try {
    if (capability === "read-motion" || capability === "verify-isolation" || capability === "verify-linkage") {
      const afterRead = await snapshot(node);
      return { ...base, accepted: true, afterFingerprint: afterRead?.fingerprint ?? null, changed: false, semanticEqualToBefore: true };
    }
    if (capability === "replace-manual-track") {
      if (typeof node.applyManualKeyframeTrack !== "function") {
        throw new Error("applyManualKeyframeTrack is not exposed.");
      }
      figma.commitUndo();
      const track = manualTrack([0.23, 0.72, 1], [0, 0.26, 0.58]);
      node.applyManualKeyframeTrack({ type: "PROPERTY", name: "OPACITY" }, track);
      base.plannedMutation = toDiagnosticValue({ property: "OPACITY", track });
    }
    if (capability === "write-timeline-duration") {
      if (typeof node.setTimelineDuration !== "function") {
        throw new Error("setTimelineDuration is not exposed.");
      }
      const timeline = firstTimeline(node);
      if (timeline === null) {
        throw new Error("Readable timeline id and duration missing.");
      }
      figma.commitUndo();
      const plannedDuration = Number((timeline.duration + 0.17).toFixed(3));
      node.setTimelineDuration(timeline.id, plannedDuration);
      base.plannedMutation = toDiagnosticValue({ timelineId: timeline.id, duration: plannedDuration });
    }
    if (capability === "remove-reapply-style") {
      if (registry.applicationStyleId === null) {
        throw new Error("No applicable native Motion style exists for safe remove/reapply.");
      }
      if (typeof node.removeAnimationStyle !== "function" || typeof node.applyAnimationStyle !== "function") {
        throw new Error("Style apply/remove methods are not exposed.");
      }
      const styles = appliedStyles(node);
      const instanceId = registry.appliedStyleInstanceIds[node.id] ?? styles[0]?.id ?? null;
      if (typeof instanceId !== "string" || instanceId.length === 0) {
        throw new Error("No readable applied style instance id exists for target.");
      }
      figma.commitUndo();
      node.removeAnimationStyle(instanceId);
      node.applyAnimationStyle(registry.applicationStyleId, { duration: 0.65, timelineOffset: 0 });
      base.plannedMutation = toDiagnosticValue({ removedAppliedInstanceId: instanceId, reappliedApplicationStyleId: registry.applicationStyleId });
    }
    if (capability === "verify-undo") {
      if (typeof figma.triggerUndo !== "function") {
        throw new Error("figma.triggerUndo is not exposed.");
      }
      figma.triggerUndo();
    }
    const after = await snapshot(node);
    const changed = before !== null && after !== null ? before.fingerprint !== after.fingerprint : null;
    return { ...base, accepted: true, afterFingerprint: after?.fingerprint ?? null, changed, semanticEqualToBefore: changed === null ? null : !changed };
  } catch (error) {
    const after = await snapshot(node);
    return {
      ...base,
      accepted: false,
      rejected: true,
      error: { code: "P011_WRITE_REJECTED", message: error instanceof Error ? error.message : "Unknown P0-011 write rejection.", path: capability },
      afterFingerprint: after?.fingerprint ?? null,
      changed: before !== null && after !== null ? before.fingerprint !== after.fingerprint : null,
      semanticEqualToBefore: before !== null && after !== null ? before.fingerprint === after.fingerprint : null
    };
  }
};

const visibleSources = (state: P011MotionSnapshot | null): P011EvidenceRecord["sourceTypesVisible"] => ({
  derivedAnimations: state !== null && serial(state.derivedAnimations) !== null,
  manualTracks: state !== null && typeof state.manualKeyframeTracks === "object" && state.manualKeyframeTracks !== null && !Array.isArray(state.manualKeyframeTracks) && Object.keys(state.manualKeyframeTracks).length > 0,
  styleInstances: state !== null && Array.isArray(state.animationStyles) && state.animationStyles.length > 0,
  timelines: state !== null && Array.isArray(state.timelines) && state.timelines.length > 0
});

const environment = (timestamp: string): P011EvidenceRecord["environment"] => ({
  editorType: figma.editorType,
  figmaMode: figma.mode,
  currentPageId: figma.currentPage.id,
  currentPageName: figma.currentPage.name,
  timestamp
});

const runCase = async (definition: P011CaseDefinition, runId: string): Promise<P011EvidenceRecord> => {
  const warnings: DiagnosticWarning[] = [];
  const errors: DiagnosticError[] = [];
  await createOrRefreshP011Fixtures();
  const context = await getContext();
  const target = await findByRole(definition.targetRole, context);
  if (target === null) {
    errors.push({ code: "P011_PRECONDITION_TARGET_MISSING", message: `Unable to resolve role ${definition.targetRole}.`, path: definition.id });
  }
  const related = await sourceAndSibling(definition, context);
  const before = await snapshot(target);
  const sourceBefore = await snapshot(related.source);
  const siblingBefore = await snapshot(related.sibling);
  if (before === null) {
    warnings.push({ code: "P011_NO_TARGET_SNAPSHOT", message: "Target snapshot is missing; case will terminate as blocked.", path: definition.id });
  }
  if (definition.id === "C11" && (context.registry.applicationStyleId === null || target === null || appliedStyles(target).length === 0)) {
    errors.push({
      code: "P011_PRECONDITION_STYLE_MISSING",
      message: "No applicable native Motion style with one readable applied style instance exists for C11.",
      path: definition.id
    });
  }
  const attempts: P011MutationAttempt[] = [];
  for (const capability of definition.attempts) {
    attempts.push(await attempt(target, capability, context.registry));
  }
  let restored: P011MotionSnapshot | null = null;
  if (definition.id === "C12" && attempts.some((entry) => entry.capability === "replace-manual-track" && entry.accepted === true)) {
    const undoAttempt = await attempt(target, "verify-undo", context.registry);
    attempts.push(undoAttempt);
    restored = await snapshot(target);
  }
  const after = await snapshot(target);
  const sourceAfter = await snapshot(related.source);
  const siblingAfter = await snapshot(related.sibling);
  const targetIds = target === null ? [] : [target.id];
  const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: targetIds });
  if (targetIds.length > 0) {
    await revealDiagnosticTargets(targetIds);
  }
  const sourceUnchanged = sourceBefore === null || sourceAfter === null ? null : sourceBefore.fingerprint === sourceAfter.fingerprint;
  const siblingUnchanged = siblingBefore === null || siblingAfter === null ? null : siblingBefore.fingerprint === siblingAfter.fingerprint;
  const linkagePreserved = before?.mainComponentId === null && after?.mainComponentId === null ? null : before?.mainComponentId === after?.mainComponentId;
  const overrideChanged = before === null || after === null ? null : stableFingerprint(before.overrides) !== stableFingerprint(after.overrides);
  const capabilities = classifyP011Capabilities(before, after, restored, attempts, sourceUnchanged, siblingUnchanged, linkagePreserved, overrideChanged, definition.category);
  const terminal = classifyP011Terminal(attempts, errors, warnings, target !== null && targets.failed.length === 0);
  const timestamp = new Date().toISOString();
  const stateList = [before, after, restored].filter((entry): entry is P011MotionSnapshot => entry !== null);
  return {
    evidenceSchemaVersion: p011EvidenceSchemaVersion,
    runId,
    caseId: definition.id,
    targetProvenance: {
      mode: "EXPLICIT_NODE_IDS",
      requestedNodeIds: targets.requestedNodeIds,
      resolvedNodeIds: targets.resolvedNodeIds,
      failedNodeIds: targets.failed.map((failure) => failure.nodeId),
      fixtureRootId: context.registry.rootId,
      targetRole: definition.targetRole,
      targetRolePath: [definition.targetRole],
      ambiguous: false
    },
    nodeId: target?.id ?? null,
    nodeType: target?.type ?? null,
    ancestorNodeTypes: ancestorTypes(target),
    sourceComponentId: before?.mainComponentId ?? sourceBefore?.nodeId ?? null,
    componentSetId: before?.componentSetId ?? null,
    variantRelationship: toDiagnosticValue({
      parentType: target?.parent?.type ?? null,
      componentSetId: before?.componentSetId ?? null,
      defaultVariantId: target?.parent?.type === "COMPONENT_SET" ? target.parent.defaultVariant.id : null
    }),
    outerInstanceId: definition.id === "C08" || definition.id === "C09" ? context.registry.roleIds["outer-instance-a"] ?? null : null,
    innerInstanceId: definition.id === "C08" || definition.id === "C09" ? target?.id ?? null : null,
    targetRole: definition.targetRole,
    nodeCategory: definition.category,
    sourceTypesVisible: visibleSources(before),
    apiContract: {
      typingsPackage: "@figma/plugin-typings",
      typingsVersion,
      componentApis: ["figma.createComponent()", "figma.combineAsVariants()", "ComponentNode.createInstance()", "ComponentSetNode.defaultVariant"],
      instanceApis: ["InstanceNode.getMainComponentAsync()", "InstanceNode.overrides", "InstanceNode.exposedInstances", "InstanceNode.detachInstance() not used"],
      runtimeCaveat: "Installed typings prove API surface only; accepted writes require live P0-011 evidence."
    },
    capabilityAttempts: attempts,
    stateBefore: before,
    stateAfter: after,
    restoredState: restored,
    manualTrackFingerprints: stateList.map((state) => stableFingerprint(state.manualKeyframeTracks)),
    styleInstanceFingerprints: stateList.map((state) => stableFingerprint(state.animationStyles)),
    timelineFingerprints: stateList.map((state) => stableFingerprint(state.timelines)),
    derivedAnimationFingerprints: stateList.map((state) => stableFingerprint(state.derivedAnimations)),
    sourceComponentFingerprints: { before: sourceBefore?.fingerprint ?? null, after: sourceAfter?.fingerprint ?? null, unchanged: sourceUnchanged },
    siblingInstanceFingerprints: { before: siblingBefore?.fingerprint ?? null, after: siblingAfter?.fingerprint ?? null, unchanged: siblingUnchanged },
    overrideState: { before: before?.overrides ?? null, after: after?.overrides ?? null, createdOrChanged: overrideChanged },
    componentLinkageState: {
      beforeMainComponentId: before?.mainComponentId ?? null,
      afterMainComponentId: after?.mainComponentId ?? null,
      preserved: linkagePreserved
    },
    semanticEquality: {
      targetChanged: before === null || after === null ? null : before.fingerprint !== after.fingerprint,
      restoredToBefore: before === null || restored === null ? null : before.fingerprint === restored.fingerprint,
      identityChanges: before !== null && after !== null && before.nodeId !== after.nodeId ? ["target-node-id"] : []
    },
    capabilityClassification: capabilities,
    terminalClassification: terminal.terminalClassification,
    result: { status: terminal.status, passed: terminal.status !== "FAIL" && terminal.status !== "ERROR", reasons: terminal.reasons },
    errors: [...errors, ...attempts.map((entry) => entry.error).filter((entry): entry is DiagnosticError => entry !== null)],
    warnings,
    timeout: false,
    environment: environment(timestamp),
    timestamp,
    filename: p011EvidenceFilename(runId, definition)
  };
};

export const runP011Case = async (caseId: P011CaseId, runId: string = createP011RunId()): Promise<P011RunResult> => {
  const definition = getP011CaseDefinition(caseId);
  if (definition === undefined) {
    throw new Error(`Unknown P0-011 case id: ${caseId}`);
  }
  const startedAt = new Date().toISOString();
  const evidence = await runCase(definition, runId);
  const finishedAt = new Date().toISOString();
  return {
    runId,
    status: evidence.result.status,
    startedAt,
    finishedAt,
    files: [evidence.filename],
    evidence: [evidence],
    warnings: evidence.warnings,
    errors: evidence.errors
  };
};

export const runAllP011Cases = async (runId: string = createP011RunId()): Promise<P011RunResult> => {
  const startedAt = new Date().toISOString();
  const evidence: P011EvidenceRecord[] = [];
  for (const definition of p011CaseDefinitions) {
    try {
      evidence.push(await runCase(definition, runId));
    } catch (error) {
      const timestamp = new Date().toISOString();
      evidence.push({
        evidenceSchemaVersion: p011EvidenceSchemaVersion,
        runId,
        caseId: definition.id,
        targetProvenance: { mode: "EXPLICIT_NODE_IDS", requestedNodeIds: [], resolvedNodeIds: [], failedNodeIds: [], fixtureRootId: null, targetRole: definition.targetRole, targetRolePath: [definition.targetRole], ambiguous: true },
        nodeId: null,
        nodeType: null,
        ancestorNodeTypes: [],
        sourceComponentId: null,
        componentSetId: null,
        variantRelationship: {},
        outerInstanceId: null,
        innerInstanceId: null,
        targetRole: definition.targetRole,
        nodeCategory: definition.category,
        sourceTypesVisible: { derivedAnimations: false, manualTracks: false, styleInstances: false, timelines: false },
        apiContract: { typingsPackage: "@figma/plugin-typings", typingsVersion, componentApis: [], instanceApis: [], runtimeCaveat: "Case failed before API probe." },
        capabilityAttempts: [],
        stateBefore: null,
        stateAfter: null,
        restoredState: null,
        manualTrackFingerprints: [],
        styleInstanceFingerprints: [],
        timelineFingerprints: [],
        derivedAnimationFingerprints: [],
        sourceComponentFingerprints: { before: null, after: null, unchanged: null },
        siblingInstanceFingerprints: { before: null, after: null, unchanged: null },
        overrideState: { before: null, after: null, createdOrChanged: null },
        componentLinkageState: { beforeMainComponentId: null, afterMainComponentId: null, preserved: null },
        semanticEquality: { targetChanged: null, restoredToBefore: null, identityChanges: [] },
        capabilityClassification: classifyP011Capabilities(null, null, null, [], null, null, null, null, definition.category),
        terminalClassification: "ERROR",
        result: { status: "ERROR", passed: false, reasons: ["case-threw"] },
        errors: [{ code: "P011_CASE_ERROR", message: error instanceof Error ? error.message : "Unknown P0-011 case error.", path: definition.id }],
        warnings: [],
        timeout: false,
        environment: environment(timestamp),
        timestamp,
        filename: p011EvidenceFilename(runId, definition)
      });
    }
  }
  const finishedAt = new Date().toISOString();
  const status: P006RunnerStatus = evidence.some((record) => record.result.status === "ERROR")
    ? "ERROR"
    : evidence.some((record) => record.result.status === "BLOCKED_PRECONDITION")
      ? "BLOCKED_PRECONDITION"
      : evidence.some((record) => record.result.status === "FAIL")
        ? "FAIL"
        : evidence.every((record) => record.result.status === "PASS")
          ? "PASS"
          : "PARTIAL";
  return {
    runId,
    status,
    startedAt,
    finishedAt,
    files: evidence.map((record) => record.filename),
    evidence,
    warnings: evidence.flatMap((record) => record.warnings),
    errors: evidence.flatMap((record) => record.errors)
  };
};

export const createP011RunManifest = (result: P011RunResult): P011RunManifest => createP011RunManifestFromResult(result);

export const verifyP011TargetPipeline = async (): Promise<{
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
    const context = await getContext();
    const ids: string[] = [];
    for (const definition of p011CaseDefinitions) {
      const node = await findByRole(definition.targetRole, context);
      if (node === null) {
        errors.push({ code: "P011_TARGET_ROLE_MISSING", message: `Missing target role ${definition.targetRole}.`, path: definition.id });
      } else {
        ids.push(node.id);
      }
    }
    const uniqueIds = [...new Set(ids)];
    const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: uniqueIds });
    return {
      status: errors.length === 0 && targets.resolvedNodes.length === uniqueIds.length ? "PASS" : "ERROR",
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
    errors.push({ code: "P011_TARGET_PIPELINE_FAILED", message: error instanceof Error ? error.message : "Unknown P0-011 target pipeline failure." });
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

export const createP011RunId = (): string =>
  `p011-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
