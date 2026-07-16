import type { DiagnosticWarning } from "../../shared/diagnostics";
import {
  createFixtureRegistry,
  fixtureRegistryStorageKey,
  fixtureRootName,
  type FixtureRegistry
} from "./fixtureRegistry";

const getRegistry = async (): Promise<FixtureRegistry | null> => {
  const value: unknown = await figma.clientStorage.getAsync(fixtureRegistryStorageKey);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const maybe = value as Partial<FixtureRegistry>;
  if (
    typeof maybe.rootId !== "string" ||
    !Array.isArray(maybe.createdNodeIds) ||
    !maybe.createdNodeIds.every((id) => typeof id === "string") ||
    typeof maybe.createdAt !== "string"
  ) {
    return null;
  }

  return {
    rootId: maybe.rootId,
    createdNodeIds: maybe.createdNodeIds,
    createdAt: maybe.createdAt
  };
};

const saveRegistry = async (registry: FixtureRegistry | null): Promise<void> => {
  if (registry === null) {
    await figma.clientStorage.deleteAsync(fixtureRegistryStorageKey);
    return;
  }

  await figma.clientStorage.setAsync(fixtureRegistryStorageKey, registry);
};

const configureBox = (
  node: FrameNode | RectangleNode | ComponentNode,
  x: number,
  y: number,
  width: number,
  height: number,
  fills: readonly Paint[]
): void => {
  node.x = x;
  node.y = y;
  node.resize(width, height);
  node.fills = fills;
};

export const createDisposableFixture = async (): Promise<{
  registry: FixtureRegistry;
  warnings: DiagnosticWarning[];
}> => {
  const warnings: DiagnosticWarning[] = [];
  const existing = await getRegistry();
  if (existing !== null) {
    warnings.push({
      code: "EXISTING_FIXTURE_REGISTRY",
      message: "Existing fixture registry was replaced after creating a new disposable fixture."
    });
  }

  const root = figma.createFrame();
  root.name = fixtureRootName;
  configureBox(root, 80, 80, 640, 420, [{ type: "SOLID", color: { r: 0.95, g: 0.97, b: 1 } }]);
  root.layoutMode = "VERTICAL";
  root.itemSpacing = 16;
  root.paddingLeft = 24;
  root.paddingRight = 24;
  root.paddingTop = 24;
  root.paddingBottom = 24;

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const label = figma.createText();
  label.name = "Disposable fixture label";
  label.characters = "MotionOps API Lab disposable fixture. Safe to clear from the lab.";
  label.fontSize = 16;
  label.fills = [{ type: "SOLID", color: { r: 0.05, g: 0.07, b: 0.1 } }];

  const childFrame = figma.createFrame();
  childFrame.name = "Ordinary child frame";
  configureBox(childFrame, 0, 0, 220, 96, [{ type: "SOLID", color: { r: 0.88, g: 0.93, b: 1 } }]);

  const rectangle = figma.createRectangle();
  rectangle.name = "Rectangle baseline target";
  configureBox(rectangle, 0, 0, 120, 64, [{ type: "SOLID", color: { r: 0.18, g: 0.43, b: 0.9 } }]);

  const autoLayout = figma.createFrame();
  autoLayout.name = "Auto-layout target group";
  configureBox(autoLayout, 0, 0, 320, 72, [{ type: "SOLID", color: { r: 0.93, g: 0.94, b: 0.95 } }]);
  autoLayout.layoutMode = "HORIZONTAL";
  autoLayout.itemSpacing = 12;
  autoLayout.paddingLeft = 12;
  autoLayout.paddingRight = 12;
  autoLayout.paddingTop = 12;
  autoLayout.paddingBottom = 12;

  const autoChildren = [0, 1, 2].map((index) => {
    const item = figma.createRectangle();
    item.name = `Auto child ${String(index + 1)}`;
    configureBox(item, 0, 0, 48, 48, [{ type: "SOLID", color: { r: 0.2, g: 0.62, b: 0.45 } }]);
    autoLayout.appendChild(item);
    return item;
  });

  const component = figma.createComponent();
  component.name = "Component baseline target";
  configureBox(component, 0, 0, 140, 80, [{ type: "SOLID", color: { r: 0.98, g: 0.79, b: 0.28 } }]);
  const instance = component.createInstance();
  instance.name = "Instance baseline target";

  const nested = figma.createFrame();
  nested.name = "Nested frame target";
  configureBox(nested, 0, 0, 260, 72, [{ type: "SOLID", color: { r: 0.96, g: 0.9, b: 0.98 } }]);
  const nestedChild = figma.createRectangle();
  nestedChild.name = "Nested rectangle target";
  configureBox(nestedChild, 16, 16, 76, 40, [{ type: "SOLID", color: { r: 0.6, g: 0.35, b: 0.82 } }]);
  nested.appendChild(nestedChild);

  root.appendChild(label);
  root.appendChild(childFrame);
  childFrame.appendChild(rectangle);
  root.appendChild(autoLayout);
  root.appendChild(component);
  root.appendChild(instance);
  root.appendChild(nested);
  figma.currentPage.appendChild(root);
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);

  const registry = createFixtureRegistry(root.id, [
    label.id,
    childFrame.id,
    rectangle.id,
    autoLayout.id,
    ...autoChildren.map((node) => node.id),
    component.id,
    instance.id,
    nested.id,
    nestedChild.id
  ]);
  await saveRegistry(registry);

  return { registry, warnings };
};

export const clearDisposableFixture = async (): Promise<{
  removedNodeIds: string[];
  warnings: DiagnosticWarning[];
}> => {
  const warnings: DiagnosticWarning[] = [];
  const registry = await getRegistry();
  if (registry === null) {
    return {
      removedNodeIds: [],
      warnings: [{ code: "NO_FIXTURE_REGISTRY", message: "No disposable fixture registry exists." }]
    };
  }

  const root = await figma.getNodeByIdAsync(registry.rootId);
  if (root !== null && "remove" in root && typeof root.remove === "function") {
    root.remove();
    await saveRegistry(null);
    return { removedNodeIds: registry.createdNodeIds, warnings };
  }

  warnings.push({
    code: "FIXTURE_ROOT_MISSING",
    message: "Fixture root was missing; cleanup will only remove still-registered nodes."
  });

  const removedNodeIds: string[] = [];
  for (const nodeId of registry.createdNodeIds.filter((id) => id !== registry.rootId)) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (node !== null && "remove" in node && typeof node.remove === "function") {
      node.remove();
      removedNodeIds.push(nodeId);
    }
  }

  await saveRegistry(null);
  return { removedNodeIds, warnings };
};
