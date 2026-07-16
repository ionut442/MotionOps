import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { ScopeScanResult } from "../src/domain/scopeScan";
import { normalizeMotionSnapshot, type MotionSceneNode } from "../src/plugin/motion";
import { App } from "../src/ui/App";
import { ApplicationStateProvider } from "../src/ui/ApplicationStateProvider";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

type FakeNode = MotionSceneNode & Record<string, unknown>;

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  for (const container of containers.splice(0)) {
    container.remove();
  }
  vi.restoreAllMocks();
});

const scopeResult: ScopeScanResult = {
  roots: ["manual", "mixed"],
  nodes: [
    {
      id: "manual",
      parentId: null,
      name: "Manual Layer",
      type: "RECTANGLE",
      depth: 0,
      childIds: [],
      visible: true,
      locked: false,
      hasChildren: false,
      childrenIncluded: false,
      rootIds: ["manual"],
      traversalIndex: 0
    },
    {
      id: "mixed",
      parentId: null,
      name: "Mixed Layer",
      type: "FRAME",
      depth: 0,
      childIds: [],
      visible: false,
      locked: true,
      hasChildren: false,
      childrenIncluded: false,
      rootIds: ["mixed"],
      traversalIndex: 1
    }
  ],
  issues: []
};

const node = (id: string, overrides: Record<string, unknown> = {}): FakeNode => ({
  id,
  name: id,
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: `${id}-opacity`,
      keyframes: [
        { id: `${id}-a`, time: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
        { id: `${id}-b`, time: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
      ]
    }
  },
  animations: {},
  animationStyles: [],
  timelines: [{ id: `${id}-timeline`, duration: 0.5 }],
  applyManualKeyframeTrack: vi.fn(),
  ...overrides
});

const renderApp = () => {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

  act(() => {
    root.render(
      <ApplicationStateProvider>
        <App />
      </ApplicationStateProvider>
    );
  });

  return { container, postMessage };
};

const postPluginMessage = (message: unknown) => {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: { pluginMessage: message } }));
  });
};

const click = (element: Element | null) => {
  expect(element).toBeTruthy();
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const change = (element: HTMLInputElement | HTMLSelectElement | null, value: string) => {
  expect(element).toBeTruthy();
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set?.call(element, value);
    element?.dispatchEvent(new Event("input", { bubbles: true }));
    element?.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("Inspect workspace", () => {
  test("renders scoped normalized Motion data, filters locally, toggles debug, and reveals nodes", () => {
    const { container, postMessage } = renderApp();
    const scopeRequest = postMessage.mock.calls.find(
      ([payload]) =>
        typeof payload === "object" &&
        payload !== null &&
        "pluginMessage" in payload &&
        (payload as { pluginMessage?: { type?: string } }).pluginMessage?.type === "SCOPE_SCAN_REQUEST"
    )?.[0] as { pluginMessage: { requestId: string } };

    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: scopeRequest.pluginMessage.requestId, result: scopeResult });
    click(container.querySelector('[role="tab"][aria-label="Inspect workspace"]'));

    const inspectRequest = [...postMessage.mock.calls].reverse().find(
      ([payload]) =>
        typeof payload === "object" &&
        payload !== null &&
        "pluginMessage" in payload &&
        (payload as { pluginMessage?: { type?: string } }).pluginMessage?.type === "MOTION_INSPECT_REQUEST"
    )?.[0] as { pluginMessage: { requestId: string; nodeIds: readonly string[] } };

    expect(inspectRequest.pluginMessage.nodeIds).toEqual(["manual", "mixed"]);

    postPluginMessage({
      type: "MOTION_INSPECT_RESULT",
      requestId: inspectRequest.pluginMessage.requestId,
      result: {
        requestedNodeIds: ["manual", "mixed"],
        snapshots: [
          normalizeMotionSnapshot(node("manual")),
          normalizeMotionSnapshot(
            node("mixed", {
              animationStyles: [{ id: "applied", styleId: "available", name: "Pulse" }],
              animations: { OPACITY: { timelineDuration: 0.5 } }
            })
          )
        ],
        failures: []
      }
    });

    expect(container.textContent).toContain("Manual Layer");
    expect(container.textContent).toContain("Mixed Layer");
    expect(container.textContent).toContain("Manual Tracks");
    expect(container.textContent).toContain("OPACITY");
    expect(container.textContent).toContain("500 ms");

    const sourceSelect = Array.from(container.querySelectorAll("select")).find((select) =>
      Array.from(select.options).some((option) => option.value === "mixed")
    );
    change(sourceSelect ?? null, "mixed");
    expect(container.textContent).not.toContain("Manual Layer");
    expect(container.textContent).toContain("Mixed Layer");

    click(container.querySelector('input[value="debug"]'));
    expect(container.textContent).toContain("Serialized normalized data");

    click(container.querySelector('button[aria-label="Reveal Mixed Layer in Figma"]'));
    const revealRequest = [...postMessage.mock.calls].reverse().find(
      ([payload]) =>
        typeof payload === "object" &&
        payload !== null &&
        "pluginMessage" in payload &&
        (payload as { pluginMessage?: { type?: string } }).pluginMessage?.type === "SCOPE_REVEAL_NODE_REQUEST"
    )?.[0] as { pluginMessage: { nodeId: string } };
    expect(revealRequest.pluginMessage.nodeId).toBe("mixed");
  });
});
