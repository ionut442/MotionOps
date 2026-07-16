import type { DiagnosticError, DiagnosticValue, DiagnosticWarning, P006FixtureSummary, P006RunnerStatus } from "../../shared/diagnostics";
import {
  classifyP012Terminal,
  createP012RunManifest as createP012RunManifestFromResult,
  displayNameFromComponentPropertyKey,
  p012EvidenceSchemaVersion,
  p012Fingerprint,
  toP012DiagnosticValue,
  type P012EvidenceRecord,
  type P012Fingerprint,
  type P012MotionSourceType,
  type P012PropertyDescriptor,
  type P012RunManifest,
  type P012RunResult,
  type P012SemanticTrackClassification,
  type P012WritableResult
} from "../../shared/p012Evidence";
import {
  getP012CaseDefinition,
  p012CaseDefinitions,
  p012EvidenceFilename,
  type P012CaseDefinition,
  type P012CaseId,
  type P012PropertyKind
} from "../../shared/p012Registry";
import { resolveDiagnosticTargets, revealDiagnosticTargets } from "./targetResolver";

type ComponentPropertyNode = SceneNode & {
  componentPropertyDefinitions?: ComponentPropertyDefinitions;
  componentProperties?: ComponentProperties;
  componentPropertyReferences?: { visible?: string; characters?: string; mainComponent?: string } | null;
  variantProperties?: Record<string, string> | null;
  manualKeyframeTracks?: unknown;
  animationStyles?: unknown;
  timelines?: unknown;
  animations?: unknown;
  mainComponent?: ComponentNode | null;
  getMainComponentAsync?: () => Promise<ComponentNode | null>;
  addComponentProperty?: (
    propertyName: string,
    type: ComponentPropertyType,
    defaultValue: string | boolean | VariableAlias,
    options?: ComponentPropertyOptions
  ) => string;
  setProperties?: (properties: Record<string, string | boolean | VariableAlias>) => void;
  applyManualKeyframeTrack?: (field: KeyframeField, track: ManualKeyframeTrackInput) => void;
};

interface StoredP012Registry {
  rootId: string;
  nodeIds: string[];
  roleIds: Partial<Record<string, string>>;
  propertyNames: Partial<Record<P012PropertyKind, string>>;
  iconAId: string | null;
  iconBId: string | null;
  createdAt: string;
}

interface P012Context {
  registry: StoredP012Registry;
  root: FrameNode;
}

interface P012WriteProbeResult {
  status: "WRITE_SUPPORTED" | "WRITE_UNSUPPORTED" | "WRITE_SHAPE_UNKNOWN" | "BLOCKED_PRECONDITION" | "HARNESS_ERROR";
  writableResult: P012WritableResult;
  error?: DiagnosticError;
}

const storageKey = "motionops.apiLab.p012Registry";
const ownerNamespace = "motionops.apiLab";
const ownerValue = "P0-012";
const rootName = "__MOTIONOPS_P0_012_FIXTURES__";
const solid = (r: number, g: number, b: number): Paint[] => [{ type: "SOLID", color: { r, g, b } }];

const configureBox = (node: FrameNode | ComponentNode | InstanceNode | RectangleNode, x: number, y: number, width: number, height: number, fills: Paint[]): void => {
  node.x = x;
  node.y = y;
  node.resize(width, height);
  if (node.type !== "INSTANCE" && "fills" in node) {
    node.fills = fills;
  }
};

const manualTrack = (): ManualKeyframeTrackInput => ({
  baseValue: { type: "FLOAT", value: 0.2 },
  keyframes: [
    { timelinePosition: 0, easing: { type: "LINEAR" }, value: { type: "FLOAT", value: 0.2 } },
    { timelinePosition: 0.5, easing: { type: "EASE_IN_AND_OUT" }, value: { type: "FLOAT", value: 1 } }
  ]
});

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

const isComponentPropertyNode = (node: BaseNode | null): node is ComponentPropertyNode =>
  node !== null && "visible" in node;

const readRegistry = async (): Promise<StoredP012Registry | null> => {
  const value: unknown = await figma.clientStorage.getAsync(storageKey);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const roleIds = typeof raw.roleIds === "object" && raw.roleIds !== null ? raw.roleIds as Record<string, unknown> : {};
  const propertyNames = typeof raw.propertyNames === "object" && raw.propertyNames !== null ? raw.propertyNames as Record<string, unknown> : {};
  return typeof raw.rootId === "string" && Array.isArray(raw.nodeIds)
    ? {
        rootId: raw.rootId,
        nodeIds: raw.nodeIds.filter((id): id is string => typeof id === "string"),
        roleIds: Object.fromEntries(Object.entries(roleIds).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
        propertyNames: Object.fromEntries(Object.entries(propertyNames).filter((entry): entry is [P012PropertyKind, string] => typeof entry[1] === "string")),
        iconAId: typeof raw.iconAId === "string" ? raw.iconAId : null,
        iconBId: typeof raw.iconBId === "string" ? raw.iconBId : null,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()
      }
    : null;
};

const saveRegistry = async (registry: StoredP012Registry | null): Promise<void> => {
  if (registry === null) {
    await figma.clientStorage.deleteAsync(storageKey);
  } else {
    await figma.clientStorage.setAsync(storageKey, registry);
  }
};

const removeNode = (node: BaseNode, warnings: DiagnosticWarning[]): void => {
  try {
    if (!node.removed && "remove" in node && typeof node.remove === "function") {
      node.remove();
    }
  } catch (error) {
    warnings.push({ code: "P012_STALE_NODE_REMOVE_SKIPPED", message: error instanceof Error ? error.message : "Unknown stale P0-012 node removal failure.", path: node.id });
  }
};

export const clearP012Fixtures = async (): Promise<P006FixtureSummary> => {
  const registry = await readRegistry();
  const warnings: DiagnosticWarning[] = [];
  const owned = figma.currentPage.findAll((node) => nodeOwned(node) || node.name === rootName).filter((node) => node.parent?.type === "PAGE");
  for (const node of owned) {
    removeNode(node, warnings);
  }
  await saveRegistry(null);
  return { rootId: registry?.rootId ?? null, testCaseIds: [], createdNodeIds: [], mutatedNodeIds: registry?.nodeIds ?? [], warnings };
};

const createIconComponent = (role: string, x: number, y: number, fill: Paint[]): ComponentNode => {
  const component = figma.createComponent();
  component.name = role;
  configureBox(component, x, y, 48, 48, solid(1, 1, 1));
  setOwnership(component, role);
  const shape = figma.createRectangle();
  shape.name = `${role}-shape`;
  configureBox(shape, 8, 8, 32, 32, fill);
  setOwnership(shape, `${role}-shape`);
  component.appendChild(shape);
  return component;
};

const createLabelText = async (role: string, x: number, y: number, warnings: DiagnosticWarning[]): Promise<TextNode> => {
  const text = figma.createText();
  text.name = role;
  text.x = x;
  text.y = y;
  text.resize(150, 32);
  try {
    const fontName = text.fontName;
    if (fontName !== figma.mixed) {
      await figma.loadFontAsync(fontName);
      text.characters = "Alpha";
    } else {
      warnings.push({ code: "P012_TEXT_FONT_MIXED", message: "Text fixture fontName was mixed; text characters were left at default.", path: role });
    }
  } catch (error) {
    warnings.push({ code: "P012_TEXT_FIXTURE_LIMITED", message: error instanceof Error ? error.message : "Text fixture font loading failed.", path: role });
  }
  setOwnership(text, role);
  return text;
};

const assignComponentPropertyReferences = (
  node: ComponentPropertyNode,
  references: { visible?: string; characters?: string; mainComponent?: string },
  warnings: DiagnosticWarning[],
  path: string
): void => {
  try {
    node.componentPropertyReferences = references;
  } catch (error) {
    warnings.push({
      code: "P012_COMPONENT_PROPERTY_REFERENCE_UNSUPPORTED",
      message: error instanceof Error ? error.message : "Component property reference assignment failed.",
      path
    });
  }
};

const getContext = async (): Promise<P012Context> => {
  const registry = await readRegistry();
  if (registry === null) {
    throw new Error("Create P0-012 fixtures before running cases.");
  }
  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root?.type !== "FRAME") {
    throw new Error("Stored P0-012 fixture root is missing.");
  }
  return { registry, root };
};

const findByRole = async (role: string, context: P012Context): Promise<ComponentPropertyNode | null> => {
  const id = context.registry.roleIds[role];
  const node = typeof id === "string" ? await figma.getNodeByIdAsync(id) : null;
  return isComponentPropertyNode(node) ? node : null;
};

const remember = (
  roleIds: Partial<Record<string, string>>,
  nodeIds: string[],
  role: string,
  node: BaseNode
): void => {
  setOwnership(node, role);
  roleIds[role] = node.id;
  nodeIds.push(node.id);
};

export const createOrRefreshP012Fixtures = async (): Promise<P006FixtureSummary> => {
  const cleanup = await clearP012Fixtures();
  const warnings = [...cleanup.warnings];
  const roleIds: Partial<Record<string, string>> = {};
  const nodeIds: string[] = [];
  const propertyNames: Partial<Record<P012PropertyKind, string>> = {};

  const root = figma.createFrame();
  root.name = rootName;
  configureBox(root, 3560, 120, 1100, 760, solid(0.98, 0.98, 0.95));
  remember(roleIds, nodeIds, "fixture-root", root);
  figma.currentPage.appendChild(root);

  const iconA = createIconComponent("p012-icon-a", 3560, 940, solid(0.12, 0.55, 0.84));
  const iconB = createIconComponent("p012-icon-b", 3630, 940, solid(0.92, 0.42, 0.21));
  remember(roleIds, nodeIds, "icon-a", iconA);
  remember(roleIds, nodeIds, "icon-b", iconB);

  const component = figma.createComponent();
  component.name = "P0-012 component properties";
  configureBox(component, 3800, 940, 220, 140, solid(0.96, 0.97, 1));
  remember(roleIds, nodeIds, "source-component", component);
  const boolName = component.addComponentProperty("ShowBadge", "BOOLEAN", true);
  const textName = component.addComponentProperty("LabelText", "TEXT", "Alpha");
  let swapName: string | undefined;
  try {
    swapName = component.addComponentProperty("IconSwap", "INSTANCE_SWAP", iconA.id, { preferredValues: [{ type: "COMPONENT", key: iconA.key }, { type: "COMPONENT", key: iconB.key }] });
  } catch (error) {
    warnings.push({ code: "P012_INSTANCE_SWAP_PROPERTY_LIMITED", message: error instanceof Error ? error.message : "Instance-swap property creation failed." });
  }
  propertyNames.BOOLEAN = boolName;
  propertyNames.TEXT = textName;
  if (swapName !== undefined) {
    propertyNames.INSTANCE_SWAP = swapName;
  }

  const label = await createLabelText("property-label", 60, 28, warnings);
  remember(roleIds, nodeIds, "property-label", label);
  component.appendChild(label);
  assignComponentPropertyReferences(label, { characters: textName }, warnings, "property-label.characters");
  const badge = figma.createRectangle();
  badge.name = "property-badge";
  configureBox(badge, 24, 76, 32, 32, solid(0.18, 0.72, 0.38));
  remember(roleIds, nodeIds, "property-badge", badge);
  component.appendChild(badge);
  assignComponentPropertyReferences(badge, { visible: boolName }, warnings, "property-badge.visible");
  const iconSlot = iconA.createInstance();
  iconSlot.name = "property-icon-slot";
  configureBox(iconSlot, 24, 24, 48, 48, solid(1, 1, 1));
  remember(roleIds, nodeIds, "property-icon-slot", iconSlot);
  component.appendChild(iconSlot);
  if (swapName !== undefined) {
    assignComponentPropertyReferences(iconSlot, { mainComponent: swapName }, warnings, "property-icon-slot.mainComponent");
  }

  const target = component.createInstance();
  target.name = "P0-012 target instance";
  configureBox(target, 40, 40, 220, 140, solid(0.93, 0.97, 1));
  remember(roleIds, nodeIds, "target-instance", target);
  root.appendChild(target);
  const sibling = component.createInstance();
  sibling.name = "P0-012 sibling instance";
  configureBox(sibling, 300, 40, 220, 140, solid(0.95, 0.96, 1));
  remember(roleIds, nodeIds, "sibling-instance", sibling);
  root.appendChild(sibling);

  const variantA = figma.createComponent();
  variantA.name = "State=Rest";
  configureBox(variantA, 4060, 940, 180, 100, solid(0.97, 0.95, 0.9));
  remember(roleIds, nodeIds, "variant-a", variantA);
  const variantB = figma.createComponent();
  variantB.name = "State=Active";
  configureBox(variantB, 4260, 940, 180, 100, solid(0.9, 0.98, 0.94));
  remember(roleIds, nodeIds, "variant-b", variantB);
  const componentSet = figma.combineAsVariants([variantA, variantB], figma.currentPage);
  componentSet.name = "P0-012 component property variants";
  remember(roleIds, nodeIds, "component-set", componentSet);
  propertyNames.VARIANT = "State";
  const variantInstance = variantA.createInstance();
  variantInstance.name = "P0-012 variant instance";
  configureBox(variantInstance, 560, 40, 180, 100, solid(0.97, 0.95, 0.9));
  remember(roleIds, nodeIds, "variant-instance", variantInstance);
  root.appendChild(variantInstance);

  const nested = component.createInstance();
  nested.name = "P0-012 nested/control instance";
  configureBox(nested, 40, 230, 220, 140, solid(0.94, 0.96, 0.96));
  remember(roleIds, nodeIds, "nested-instance", nested);
  root.appendChild(nested);
  const unrelated = figma.createRectangle();
  unrelated.name = "P0-012 unrelated motion target";
  configureBox(unrelated, 300, 230, 100, 70, solid(0.78, 0.78, 0.82));
  remember(roleIds, nodeIds, "unrelated-motion", unrelated);
  root.appendChild(unrelated);
  if (typeof unrelated.applyManualKeyframeTrack === "function") {
    unrelated.applyManualKeyframeTrack({ type: "PROPERTY", name: "OPACITY" }, manualTrack());
  }
  if (typeof target.applyManualKeyframeTrack === "function") {
    target.applyManualKeyframeTrack({ type: "PROPERTY", name: "OPACITY" }, manualTrack());
  }

  const registry: StoredP012Registry = {
    rootId: root.id,
    nodeIds,
    roleIds,
    propertyNames,
    iconAId: iconA.id,
    iconBId: iconB.id,
    createdAt: new Date().toISOString()
  };
  await saveRegistry(registry);
  return {
    rootId: root.id,
    testCaseIds: [],
    createdNodeIds: nodeIds,
    mutatedNodeIds: [],
    warnings
  };
};

const componentPropertyValue = (
  values: ComponentProperties,
  propertyName: string,
  fallback: unknown
): unknown =>
  Object.prototype.hasOwnProperty.call(values, propertyName) ? values[propertyName].value : fallback;

const componentPropertiesOf = (node: ComponentPropertyNode | null, warnings?: DiagnosticWarning[]): ComponentProperties => {
  if (node === null) {
    return {};
  }
  try {
    return node.componentProperties ?? {};
  } catch (error) {
    warnings?.push({
      code: "P012_COMPONENT_PROPERTIES_READ_FAILED",
      message: error instanceof Error ? error.message : "Reading componentProperties failed.",
      path: node.id
    });
    return {};
  }
};

const componentDefinitionsOf = (node: ComponentPropertyNode | null, warnings?: DiagnosticWarning[]): ComponentPropertyDefinitions => {
  if (node === null) {
    return {};
  }
  try {
    return node.componentPropertyDefinitions ?? {};
  } catch (error) {
    warnings?.push({
      code: "P012_COMPONENT_DEFINITIONS_READ_FAILED",
      message: error instanceof Error ? error.message : "Reading componentPropertyDefinitions failed.",
      path: node.id
    });
    return {};
  }
};

const variantPropertiesOf = (node: ComponentPropertyNode | null, warnings?: DiagnosticWarning[]): DiagnosticValue => {
  if (node === null) {
    return null;
  }
  try {
    // P0-012 records deprecated variantProperties only as discovery evidence.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return toP012DiagnosticValue(node.variantProperties ?? null);
  } catch (error) {
    warnings?.push({
      code: "P012_VARIANT_PROPERTIES_READ_FAILED",
      message: error instanceof Error ? error.message : "Reading variantProperties failed.",
      path: node.id
    });
    return null;
  }
};

const variantPropertyValue = (node: ComponentPropertyNode | null, propertyName: string, warnings?: DiagnosticWarning[]): string | null => {
  if (node === null) {
    return null;
  }
  try {
    // P0-012 compares deprecated variantProperties against componentProperties to classify runtime behavior.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return node.variantProperties?.[propertyName] ?? null;
  } catch (error) {
    warnings?.push({
      code: "P012_VARIANT_PROPERTY_READ_FAILED",
      message: error instanceof Error ? error.message : "Reading variant property failed.",
      path: node.id
    });
    return null;
  }
};

const hasVariantProperties = (node: ComponentPropertyNode | null, warnings?: DiagnosticWarning[]): boolean => {
  if (node === null) {
    return false;
  }
  try {
    // P0-012 must distinguish variant instance state even though the modern API is componentProperties.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return node.variantProperties !== undefined && node.variantProperties !== null;
  } catch (error) {
    warnings?.push({
      code: "P012_VARIANT_PROPERTIES_READ_FAILED",
      message: error instanceof Error ? error.message : "Reading variantProperties failed.",
      path: node.id
    });
    return false;
  }
};

const nodeValue = (node: ComponentPropertyNode | null, warnings?: DiagnosticWarning[]): DiagnosticValue =>
  toP012DiagnosticValue({
    id: node?.id ?? null,
    type: node?.type ?? null,
    role: node === null ? null : getRole(node),
    componentProperties: componentPropertiesOf(node, warnings),
    componentPropertyDefinitions: componentDefinitionsOf(node, warnings),
    componentPropertyReferences: safeReadNodeField(node, "componentPropertyReferences", warnings),
    variantProperties: variantPropertiesOf(node, warnings),
    manualKeyframeTracks: safeReadNodeField(node, "manualKeyframeTracks", warnings),
    animations: safeReadNodeField(node, "animations", warnings),
    timelines: safeReadNodeField(node, "timelines", warnings)
  });

const safeReadNodeField = (
  node: ComponentPropertyNode | null,
  field: keyof ComponentPropertyNode,
  warnings?: DiagnosticWarning[]
): unknown => {
  if (node === null) {
    return null;
  }
  try {
    return node[field] ?? null;
  } catch (error) {
    warnings?.push({
      code: "P012_NODE_FIELD_READ_FAILED",
      message: error instanceof Error ? error.message : `Reading ${field} failed.`,
      path: `${node.id}.${field}`
    });
    return null;
  }
};

const mainComponentId = async (node: ComponentPropertyNode | null, warnings?: DiagnosticWarning[]): Promise<string | null> => {
  if (node?.type !== "INSTANCE" || typeof node.getMainComponentAsync !== "function") {
    return null;
  }
  try {
    const main = await node.getMainComponentAsync();
    return main?.id ?? null;
  } catch (error) {
    warnings?.push({
      code: "P012_MAIN_COMPONENT_READ_FAILED",
      message: error instanceof Error ? error.message : "Reading main component failed.",
      path: `${node.id}.getMainComponentAsync`
    });
    return null;
  }
};

const fingerprintSet = async (context: P012Context, warnings?: DiagnosticWarning[]): Promise<P012Fingerprint> => ({
  sourceComponent: p012Fingerprint(nodeValue(await findByRole("source-component", context), warnings)),
  componentSet: p012Fingerprint(nodeValue(await findByRole("component-set", context), warnings)),
  targetInstance: p012Fingerprint(nodeValue(await findByRole("target-instance", context), warnings)),
  siblingInstance: p012Fingerprint(nodeValue(await findByRole("sibling-instance", context), warnings)),
  nestedInstance: p012Fingerprint(nodeValue(await findByRole("nested-instance", context), warnings)),
  unrelatedMotion: p012Fingerprint(nodeValue(await findByRole("unrelated-motion", context), warnings))
});

const descriptors = (source: ComponentPropertyNode | null, target: ComponentPropertyNode | null, warnings?: DiagnosticWarning[]): P012PropertyDescriptor[] => {
  const definitions = componentDefinitionsOf(source, warnings);
  const values = componentPropertiesOf(target, warnings);
  return Object.entries(definitions).map(([name, definition]) => ({
    name,
    stableIdentifier: name.includes("#") ? name.slice(name.indexOf("#") + 1) : name,
    displayName: displayNameFromComponentPropertyKey(name),
    type: definition.type as P012PropertyKind,
    defaultValue: toP012DiagnosticValue(definition.defaultValue),
    value: toP012DiagnosticValue(componentPropertyValue(values, name, definition.defaultValue)),
    preferredValues: toP012DiagnosticValue(definition.preferredValues ?? []),
    variantOptions: definition.variantOptions ?? []
  }));
};

const propertyForCase = (definition: P012CaseDefinition, registry: StoredP012Registry): string | null =>
  registry.propertyNames[definition.propertyKind] ?? null;

const readPropertyValue = (node: ComponentPropertyNode | null, propertyName: string | null, warnings?: DiagnosticWarning[]): DiagnosticValue =>
  propertyName === null ? null : toP012DiagnosticValue(componentPropertyValue(componentPropertiesOf(node, warnings), propertyName, variantPropertyValue(node, propertyName, warnings)));

const plannedValue = (kind: P012PropertyKind, registry: StoredP012Registry): string | boolean | null => {
  if (kind === "BOOLEAN") return false;
  if (kind === "TEXT") return "Beta";
  if (kind === "INSTANCE_SWAP") return registry.iconBId;
  if (kind === "VARIANT") return "Active";
  return null;
};

const writeP012ComponentProperty = (
  target: ComponentPropertyNode | null,
  propertyName: string | null,
  planned: string | boolean | null,
  path: string
): P012WriteProbeResult => {
  if (target === null || propertyName === null || planned === null || typeof target.setProperties !== "function") {
    return { status: "BLOCKED_PRECONDITION", writableResult: "BLOCKED_PRECONDITION" };
  }
  try {
    target.setProperties({ [propertyName]: planned });
    return { status: "WRITE_SUPPORTED", writableResult: "WRITABLE" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown component-property write error.";
    const lower = message.toLowerCase();
    if (lower.includes("read only") || lower.includes("readonly")) {
      return {
        status: "WRITE_UNSUPPORTED",
        writableResult: "READ_ONLY",
        error: { code: "P012_PROPERTY_WRITE_READ_ONLY", message, path }
      };
    }
    if (lower.includes("unsupported") || lower.includes("not supported") || lower.includes("cannot")) {
      return {
        status: "WRITE_UNSUPPORTED",
        writableResult: "UNSUPPORTED",
        error: { code: "P012_PROPERTY_WRITE_UNSUPPORTED", message, path }
      };
    }
    return {
      status: "HARNESS_ERROR",
      writableResult: "ERROR",
      error: { code: "P012_PROPERTY_WRITE_ERROR", message, path }
    };
  }
};

const detectMotionSource = (node: ComponentPropertyNode | null, propertyName: string | null, warnings?: DiagnosticWarning[]): { source: P012MotionSourceType; raw: DiagnosticValue; semantic: P012SemanticTrackClassification } => {
  const raw = nodeValue(node, warnings);
  const haystack = JSON.stringify(raw);
  if (propertyName !== null && haystack.includes(propertyName)) {
    return { source: "manualKeyframeTracks", raw, semantic: "component-property-track" };
  }
  if (hasVariantProperties(node, warnings)) {
    return { source: "variantProperties", raw, semantic: "variant-instance-state" };
  }
  if (node?.componentProperties !== undefined) {
    return { source: "componentProperties", raw, semantic: "property-api-only" };
  }
  return { source: "none", raw, semantic: "not-exposed" };
};

const environment = (timestamp: string): P012EvidenceRecord["environment"] => ({
  editorType: figma.editorType,
  figmaMode: figma.mode,
  currentPageId: figma.currentPage.id,
  currentPageName: figma.currentPage.name,
  timestamp
});

const runCase = async (definition: P012CaseDefinition, runId: string): Promise<P012EvidenceRecord> => {
  const warnings: DiagnosticWarning[] = [];
  const errors: DiagnosticError[] = [];
  await createOrRefreshP012Fixtures();
  const context = await getContext();
  const target = await findByRole(definition.propertyKind === "VARIANT" ? "variant-instance" : "target-instance", context);
  const sibling = await findByRole("sibling-instance", context);
  const source = await findByRole(definition.propertyKind === "VARIANT" ? "component-set" : "source-component", context);
  const nested = await findByRole("nested-instance", context);
  const propertyName = propertyForCase(definition, context.registry);
  const beforeFingerprints = await fingerprintSet(context, warnings);
  const beforeValue = readPropertyValue(target, propertyName, warnings);
  const targetMainBefore = await mainComponentId(target, warnings);
  const siblingMainBefore = await mainComponentId(sibling, warnings);
  const motion = detectMotionSource(target, propertyName, warnings);
  let writableResult: P012WritableResult = "UNSUPPORTED";
  let semantic = motion.semantic;
  const planned: string | boolean | null = plannedValue(definition.propertyKind, context.registry);
  let restoredBy: P012EvidenceRecord["restoration"]["restoredBy"] = "none";
  let undoRestored: boolean | null = null;
  let afterValue: DiagnosticValue = beforeValue;
  let restoredValue: DiagnosticValue = beforeValue;
  let afterFingerprints: P012Fingerprint = beforeFingerprints;
  let restoredFingerprints: P012Fingerprint = beforeFingerprints;
  const writeState: { status: P012WriteProbeResult["status"] | null; supported: boolean } = {
    status: null,
    supported: false
  };

  if (propertyName === null && ["CP03", "CP04", "CP05", "CP06", "CP07", "CP09", "CP10"].includes(definition.id)) {
    writableResult = "BLOCKED_PRECONDITION";
    errors.push({ code: "P012_PRECONDITION_PROPERTY_MISSING", message: `No ${definition.propertyKind} property exists for this fixture.`, path: definition.id });
  } else if (definition.id === "CP01" || definition.id === "CP02") {
    writableResult = "READ_ONLY";
    semantic = "property-api-only";
  } else if (definition.id === "CP08") {
    writableResult = motion.semantic === "component-property-track" ? "READ_ONLY" : "UNSUPPORTED";
    semantic = motion.semantic === "component-property-track" ? "component-property-track" : "not-exposed";
  } else {
    const runWriteProbe = async (): Promise<boolean> => {
      const writeProbe = writeP012ComponentProperty(target, propertyName, planned, definition.id);
      writeState.status = writeProbe.status;
      writableResult = writeProbe.writableResult;
      if (writeProbe.error !== undefined) {
        errors.push(writeProbe.error);
      }
      if (writeProbe.status !== "WRITE_SUPPORTED") {
        return false;
      }
      writeState.supported = true;
      afterValue = readPropertyValue(target, propertyName, warnings);
      afterFingerprints = await fingerprintSet(context, warnings);
      return true;
    };

    try {
      if (definition.id === "CP09") {
        if (motion.semantic !== "component-property-track") {
          writableResult = "BLOCKED_PRECONDITION";
          errors.push({ code: "P012_CP09_WRITABLE_TRACK_MISSING", message: "Undo cannot be tested because no supported property-track write exists.", path: definition.id });
        } else {
          figma.commitUndo();
          const writeSupported = await runWriteProbe();
          if (!writeSupported) {
            restoredValue = afterValue;
            restoredFingerprints = afterFingerprints;
          } else if (typeof figma.triggerUndo === "function") {
            try {
              figma.triggerUndo();
              restoredValue = readPropertyValue(target, propertyName, warnings);
              restoredFingerprints = await fingerprintSet(context, warnings);
              undoRestored = p012Fingerprint(restoredValue) === p012Fingerprint(beforeValue);
              restoredBy = "undo";
              if (!undoRestored) {
                warnings.push({
                  code: "P012_UNDO_RESTORATION_UNSUPPORTED",
                  message: "One plugin-triggered Undo did not restore the original component-property value.",
                  path: definition.id
                });
              }
            } catch (error) {
              restoredValue = null;
              restoredFingerprints = await fingerprintSet(context, warnings);
              undoRestored = false;
              restoredBy = "undo";
              warnings.push({
                code: "P012_UNDO_TARGET_INVALIDATED",
                message: error instanceof Error ? error.message : "Undo invalidated the P0-012 target.",
                path: definition.id
              });
            }
            warnings.push({ code: "P012_REDO_API_NOT_EXPOSED", message: "Installed plugin typings expose figma.triggerUndo(), but no plugin-side triggerRedo() API.", path: definition.id });
          } else {
            warnings.push({ code: "P012_TRIGGER_UNDO_MISSING", message: "figma.triggerUndo() is not exposed, so Undo cannot be tested.", path: definition.id });
          }
        }
      } else {
        const writeSupported = await runWriteProbe();
        if (!writeSupported) {
          restoredValue = afterValue;
          restoredFingerprints = afterFingerprints;
        } else {
          if (definition.id === "CP07" && motion.semantic !== "component-property-track") {
            warnings.push({ code: "P012_NO_WRITABLE_MOTION_TRACK", message: "Property value is writable through InstanceNode.setProperties, but no raw Motion component-property track was exposed.", path: definition.id });
          }
          if (target !== null && propertyName !== null && typeof target.setProperties === "function" && (typeof beforeValue === "string" || typeof beforeValue === "boolean")) {
            const setProperties = target.setProperties;
            setProperties.call(target, { [propertyName]: beforeValue });
            restoredValue = readPropertyValue(target, propertyName, warnings);
            restoredFingerprints = await fingerprintSet(context, warnings);
            restoredBy = "setProperties";
          } else {
            writableResult = "ERROR";
            errors.push({ code: "P012_PROPERTY_RESTORE_SHAPE_UNKNOWN", message: "Original component-property value was not a supported restore shape.", path: definition.id });
          }
        }
      }
    } catch (error) {
      writableResult = "ERROR";
      errors.push({ code: "P012_PROPERTY_WRITE_ERROR", message: error instanceof Error ? error.message : "Unknown component-property write error.", path: definition.id });
    }
  }

  if (!writeState.supported) {
    afterValue = readPropertyValue(target, propertyName, warnings);
    afterFingerprints = await fingerprintSet(context, warnings);
    restoredValue = afterValue;
    restoredFingerprints = afterFingerprints;
  }
  const targetIds = target === null ? [] : [target.id];
  const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: targetIds });
  if (targetIds.length > 0) {
    await revealDiagnosticTargets(targetIds);
  }
  const targetMainAfter = await mainComponentId(target, warnings);
  const siblingMainAfter = await mainComponentId(sibling, warnings);
  const terminal =
    definition.id === "CP09" && writeState.status === "WRITE_SUPPORTED" && undoRestored === false
      ? {
          terminalClassification: "PARTIAL" as const,
          status: "PARTIAL" as const,
          reasons: ["target-resolved", `semantic-track-${semantic}`, "write-probe-WRITE_SUPPORTED", "undo-not-restored"]
        }
      : classifyP012Terminal(writableResult, semantic, errors, target !== null && targets.failed.length === 0, p012Fingerprint(restoredValue) === p012Fingerprint(beforeValue));
  const timestamp = new Date().toISOString();
  return {
    evidenceSchemaVersion: p012EvidenceSchemaVersion,
    runId,
    caseId: definition.id,
    targetProvenance: {
      mode: "EXPLICIT_NODE_IDS",
      requestedNodeIds: targets.requestedNodeIds,
      resolvedNodeIds: targets.resolvedNodeIds,
      failedNodeIds: targets.failed.map((failure) => failure.nodeId),
      fixtureRootId: context.registry.rootId,
      targetRole: definition.propertyKind === "VARIANT" ? "variant-instance" : "target-instance",
      siblingRole: "sibling-instance",
      sourceRole: definition.propertyKind === "VARIANT" ? "component-set" : "source-component"
    },
    componentId: context.registry.roleIds["source-component"] ?? null,
    componentSetId: context.registry.roleIds["component-set"] ?? null,
    instanceId: target?.id ?? null,
    siblingInstanceId: sibling?.id ?? null,
    nestedInstanceId: nested?.id ?? null,
    componentPropertyIdentifier: propertyName,
    propertyType: definition.propertyKind,
    propertyValue: { before: beforeValue, planned: toP012DiagnosticValue(planned), after: afterValue, restored: restoredValue },
    definitions: descriptors(source, target, warnings),
    targetProperties: toP012DiagnosticValue(componentPropertiesOf(target, warnings)),
    siblingProperties: toP012DiagnosticValue(componentPropertiesOf(sibling, warnings)),
    variantProperties: variantPropertiesOf(target, warnings),
    rawTrackShape: motion.raw,
    motionSourceType: motion.source,
    semanticTrackClassification: semantic,
    writableResult,
    sourceAndSiblingFingerprints: {
      before: beforeFingerprints,
      after: afterFingerprints,
      restored: restoredFingerprints,
      sourceUnchanged: beforeFingerprints.sourceComponent === afterFingerprints.sourceComponent,
      siblingUnchanged: beforeFingerprints.siblingInstance === afterFingerprints.siblingInstance,
      nestedUnchanged: beforeFingerprints.nestedInstance === afterFingerprints.nestedInstance,
      unrelatedMotionUnchanged: beforeFingerprints.unrelatedMotion === afterFingerprints.unrelatedMotion
    },
    overrideState: {
      before: beforeValue,
      after: afterValue,
      createdOrChanged: p012Fingerprint(beforeValue) !== p012Fingerprint(afterValue)
    },
    componentLinkage: {
      targetMainComponentIdBefore: targetMainBefore,
      targetMainComponentIdAfter: targetMainAfter,
      siblingMainComponentIdBefore: siblingMainBefore,
      siblingMainComponentIdAfter: siblingMainAfter,
      preserved: targetMainBefore === targetMainAfter && siblingMainBefore === siblingMainAfter
    },
    restoration: {
      attempted: writeState.supported,
      restored: p012Fingerprint(restoredValue) === p012Fingerprint(beforeValue),
      restoredBy
    },
    undoRedo: {
      undoTested: definition.id === "CP09",
      undoRestored,
      redoTested: false,
      redoRestoredMutation: null
    },
    terminalClassification: terminal.terminalClassification,
    result: { status: terminal.status, passed: terminal.status !== "FAIL" && terminal.status !== "ERROR", reasons: terminal.reasons },
    errors,
    warnings,
    timeout: false,
    environment: environment(timestamp),
    timestamp,
    filename: p012EvidenceFilename(runId, definition)
  };
};

export const runP012Case = async (caseId: P012CaseId, runId: string = createP012RunId()): Promise<P012RunResult> => {
  const definition = getP012CaseDefinition(caseId);
  if (definition === undefined) {
    throw new Error(`Unknown P0-012 case id: ${caseId}`);
  }
  const startedAt = new Date().toISOString();
  const evidence = await runCase(definition, runId);
  const finishedAt = new Date().toISOString();
  return { runId, status: evidence.result.status, startedAt, finishedAt, files: [evidence.filename], evidence: [evidence], warnings: evidence.warnings, errors: evidence.errors };
};

export const runAllP012Cases = async (runId: string = createP012RunId()): Promise<P012RunResult> => {
  const startedAt = new Date().toISOString();
  const evidence: P012EvidenceRecord[] = [];
  for (const definition of p012CaseDefinitions) {
    try {
      evidence.push(await runCase(definition, runId));
    } catch (error) {
      const timestamp = new Date().toISOString();
      evidence.push({
        evidenceSchemaVersion: p012EvidenceSchemaVersion,
        runId,
        caseId: definition.id,
        targetProvenance: { mode: "EXPLICIT_NODE_IDS", requestedNodeIds: [], resolvedNodeIds: [], failedNodeIds: [], fixtureRootId: null, targetRole: "target-instance", siblingRole: "sibling-instance", sourceRole: "source-component" },
        componentId: null,
        componentSetId: null,
        instanceId: null,
        siblingInstanceId: null,
        nestedInstanceId: null,
        componentPropertyIdentifier: null,
        propertyType: definition.propertyKind,
        propertyValue: { before: null, planned: null, after: null, restored: null },
        definitions: [],
        targetProperties: null,
        siblingProperties: null,
        variantProperties: null,
        rawTrackShape: null,
        motionSourceType: "none",
        semanticTrackClassification: "unsupported",
        writableResult: "ERROR",
        sourceAndSiblingFingerprints: { before: { sourceComponent: null, componentSet: null, targetInstance: null, siblingInstance: null, nestedInstance: null, unrelatedMotion: null }, after: { sourceComponent: null, componentSet: null, targetInstance: null, siblingInstance: null, nestedInstance: null, unrelatedMotion: null }, restored: { sourceComponent: null, componentSet: null, targetInstance: null, siblingInstance: null, nestedInstance: null, unrelatedMotion: null }, sourceUnchanged: null, siblingUnchanged: null, nestedUnchanged: null, unrelatedMotionUnchanged: null },
        overrideState: { before: null, after: null, createdOrChanged: null },
        componentLinkage: { targetMainComponentIdBefore: null, targetMainComponentIdAfter: null, siblingMainComponentIdBefore: null, siblingMainComponentIdAfter: null, preserved: null },
        restoration: { attempted: false, restored: null, restoredBy: "none" },
        undoRedo: { undoTested: false, undoRestored: null, redoTested: false, redoRestoredMutation: null },
        terminalClassification: "ERROR",
        result: { status: "ERROR", passed: false, reasons: ["case-threw"] },
        errors: [{ code: "P012_CASE_ERROR", message: error instanceof Error ? error.message : "Unknown P0-012 case error.", path: definition.id }],
        warnings: [],
        timeout: false,
        environment: environment(timestamp),
        timestamp,
        filename: p012EvidenceFilename(runId, definition)
      });
    }
  }
  const finishedAt = new Date().toISOString();
  const status: P006RunnerStatus = evidence.some((record) => record.result.status === "ERROR")
    ? "ERROR"
    : evidence.some((record) => record.result.status === "BLOCKED_PRECONDITION")
      ? "BLOCKED_PRECONDITION"
      : evidence.every((record) => record.result.status === "PASS")
        ? "PASS"
        : "PARTIAL";
  return { runId, status, startedAt, finishedAt, files: evidence.map((record) => record.filename), evidence, warnings: evidence.flatMap((record) => record.warnings), errors: evidence.flatMap((record) => record.errors) };
};

export const createP012RunManifest = (result: P012RunResult): P012RunManifest => createP012RunManifestFromResult(result);

export const verifyP012TargetPipeline = async (): Promise<{
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
    const roles = ["source-component", "component-set", "target-instance", "sibling-instance", "variant-instance", "nested-instance", "unrelated-motion"];
    const ids = roles.map((role) => context.registry.roleIds[role]).filter((id): id is string => typeof id === "string");
    if (ids.length !== roles.length) {
      errors.push({ code: "P012_TARGET_ROLE_MISSING", message: "One or more P0-012 fixture roles are missing.", path: "roles" });
    }
    const targets = await resolveDiagnosticTargets({ mode: "EXPLICIT_NODE_IDS", nodeIds: ids });
    return {
      status: errors.length === 0 && targets.resolvedNodes.length === ids.length ? "PASS" : "ERROR",
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
    errors.push({ code: "P012_TARGET_PIPELINE_FAILED", message: error instanceof Error ? error.message : "Unknown P0-012 target pipeline failure." });
    return { status: "ERROR", requested: 0, resolved: 0, nodesRead: 0, requestedNodeIds: [], resolvedNodeIds: [], canvasSelectionNodeIds: figma.currentPage.selection.map((node) => node.id), warnings, errors };
  }
};

export const createP012RunId = (): string =>
  `p012-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
