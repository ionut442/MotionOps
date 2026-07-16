import { beforeEach, describe, expect, it, vi } from "vitest";

const makeFigmaMock = () => {
  let nextId = 1;
  const nodes = new Map();
  const storage = new Map();

  const createNode = (type) => {
    const pluginData = new Map();
    const sharedData = new Map();
    const node = {
      id: `node-${String(nextId++)}`,
      key: `key-${String(nextId)}`,
      type,
      name: type,
      x: 0,
      y: 0,
      removed: false,
      parent: null,
      children: [],
      fontName: type === "TEXT" ? { family: "Roboto", style: "Regular" } : undefined,
      componentPropertyDefinitions: type === "COMPONENT" || type === "COMPONENT_SET" ? {} : undefined,
      componentProperties: type === "INSTANCE" ? {} : undefined,
      setPluginData: (key, value) => pluginData.set(key, value),
      getPluginData: (key) => pluginData.get(key) ?? "",
      setSharedPluginData: (namespace, key, value) => sharedData.set(`${namespace}:${key}`, value),
      getSharedPluginData: (namespace, key) => sharedData.get(`${namespace}:${key}`) ?? "",
      resize: () => undefined,
      appendChild: (child) => {
        child.parent = node;
        node.children.push(child);
      },
      remove: () => {
        node.removed = true;
      },
      findAll: (predicate) => {
        const found = [];
        const visit = (entry) => {
          for (const child of entry.children) {
            if (predicate(child)) found.push(child);
            visit(child);
          }
        };
        visit(node);
        return found;
      },
      applyManualKeyframeTrack: () => undefined
    };
    Object.defineProperty(node, "componentPropertyReferences", {
      get: () => null,
      set: () => {
        throw new Error("mock reference assignment rejected");
      },
      configurable: true
    });
    if (type === "COMPONENT") {
      node.addComponentProperty = (name, propertyType, value) => {
        const propertyName = propertyType === "VARIANT" ? name : `${name}#${String(nextId++)}:0`;
        node.componentPropertyDefinitions ??= {};
        node.componentPropertyDefinitions[propertyName] = { type: propertyType, defaultValue: value };
        return propertyName;
      };
      node.createInstance = () => {
        const instance = createNode("INSTANCE");
        instance.componentProperties = Object.fromEntries(
          Object.entries(node.componentPropertyDefinitions ?? {}).map(([key, definition]) => [
            key,
            { type: definition.type, value: definition.defaultValue }
          ])
        );
        return instance;
      };
    }
    nodes.set(node.id, node);
    return node;
  };

  const page = createNode("PAGE");

  return {
    currentPage: page,
    editorType: "figma",
    mode: "default",
    createFrame: () => createNode("FRAME"),
    createComponent: () => createNode("COMPONENT"),
    createRectangle: () => createNode("RECTANGLE"),
    createText: () => createNode("TEXT"),
    combineAsVariants: (variants) => {
      const set = createNode("COMPONENT_SET");
      set.componentPropertyDefinitions = { State: { type: "VARIANT", defaultValue: "Rest" } };
      for (const variant of variants) {
        set.appendChild(variant);
      }
      return set;
    },
    loadFontAsync: vi.fn(() => Promise.resolve()),
    getNodeByIdAsync: (id) => Promise.resolve(nodes.get(id) ?? null),
    clientStorage: {
      getAsync: (key) => Promise.resolve(storage.get(key)),
      setAsync: (key, value) => {
        storage.set(key, value);
        return Promise.resolve();
      },
      deleteAsync: (key) => {
        storage.delete(key);
        return Promise.resolve();
      }
    }
  };
};

describe("P0-012 fixture construction", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns a fixture result when componentPropertyReferences are rejected by runtime", async () => {
    vi.stubGlobal("figma", makeFigmaMock());
    const { createOrRefreshP012Fixtures } = await import("../src/plugin/diagnostics/p012Fixtures");

    const result = await createOrRefreshP012Fixtures();

    expect(result.rootId).toMatch(/^node-/);
    expect(result.createdNodeIds.length).toBeGreaterThan(8);
    expect(result.warnings.some((warning) => warning.code === "P012_COMPONENT_PROPERTY_REFERENCE_UNSUPPORTED")).toBe(true);
  });
});
