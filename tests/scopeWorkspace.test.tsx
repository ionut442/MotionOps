import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { App } from "../src/ui/App";
import { ApplicationStateProvider } from "../src/ui/ApplicationStateProvider";
import type { ScopeScanResult } from "../src/domain/scopeScan";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const sampleResult: ScopeScanResult = {
  roots: ["frame"],
  nodes: [
    {
      id: "frame",
      parentId: null,
      name: "Checkout Frame",
      type: "FRAME",
      depth: 0,
      childIds: ["group"],
      visible: true,
      locked: false,
      hasChildren: true,
      childrenIncluded: true,
      rootIds: ["frame"],
      traversalIndex: 0,
      geometry: { x: 0, y: 0, width: 200, height: 140, centerX: 100, centerY: 70 }
    },
    {
      id: "group",
      parentId: "frame",
      name: "Controls",
      type: "GROUP",
      depth: 1,
      childIds: ["hidden", "locked"],
      visible: true,
      locked: false,
      hasChildren: true,
      childrenIncluded: true,
      rootIds: ["frame"],
      traversalIndex: 1,
      geometry: { x: 60, y: 20, width: 100, height: 60, centerX: 110, centerY: 50 }
    },
    {
      id: "hidden",
      parentId: "group",
      name: "Hidden Copy",
      type: "TEXT",
      depth: 2,
      childIds: [],
      visible: false,
      locked: false,
      hasChildren: false,
      childrenIncluded: false,
      rootIds: ["frame"],
      traversalIndex: 2,
      geometry: { x: 20, y: 10, width: 30, height: 20, centerX: 35, centerY: 20 }
    },
    {
      id: "locked",
      parentId: "group",
      name: "Locked Icon",
      type: "VECTOR",
      depth: 2,
      childIds: [],
      visible: true,
      locked: true,
      hasChildren: false,
      childrenIncluded: false,
      rootIds: ["frame"],
      traversalIndex: 3,
      geometry: { x: 140, y: 90, width: 20, height: 20, centerX: 150, centerY: 100 }
    }
  ],
  issues: []
};

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

  const getScopeRequestId = () => {
    const message = [...postMessage.mock.calls].reverse().find(
      ([payload]) =>
        typeof payload === "object" &&
        payload !== null &&
        "pluginMessage" in payload &&
        (payload as { pluginMessage?: { type?: string } }).pluginMessage?.type === "SCOPE_SCAN_REQUEST"
    )?.[0] as { pluginMessage: { requestId: string } } | undefined;
    return message?.pluginMessage.requestId;
  };

  const getScopeRequests = () =>
    postMessage.mock.calls
      .map(([payload]) =>
        typeof payload === "object" && payload !== null && "pluginMessage" in payload
          ? (payload as { pluginMessage?: { type?: string; scope?: unknown; requestId?: string } }).pluginMessage
          : undefined
      )
      .filter(
        (message): message is { type: "SCOPE_SCAN_REQUEST"; scope: unknown; requestId: string } =>
          message?.type === "SCOPE_SCAN_REQUEST" && typeof message.requestId === "string"
      );

  return { container, getScopeRequestId, getScopeRequests, postMessage };
};

const postPluginMessage = (message: unknown) => {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: { pluginMessage: message } }));
  });
};

const setInputValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const requireValue = <T,>(value: T | null | undefined, message: string): T => {
  expect(value, message).toBeDefined();
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  for (const container of containers.splice(0)) {
    container.remove();
  }
  document.body.innerHTML = "";
});

describe("Scope workspace hierarchy", () => {
  test("requests a current-selection scan and renders loading state", () => {
    const { container, getScopeRequestId } = renderApp();
    expect(getScopeRequestId()).toBeDefined();
    expect(container.querySelector('[data-testid="scope-loading"]')?.textContent).toContain(
      "Scanning Scope"
    );
  });

  test("ignores stale scan responses and applies the matching response", () => {
    const { container, getScopeRequestId } = renderApp();
    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: "stale", result: sampleResult });
    expect(container.querySelector('[role="tree"]')).toBeNull();

    postPluginMessage({
      type: "SCOPE_SCAN_RESULT",
      requestId: getScopeRequestId(),
      result: sampleResult
    });
    expect(container.querySelector('[role="tree"]')).not.toBeNull();
    expect(container.textContent).toContain("Checkout Frame");
  });

  test("renders empty and error states safely", () => {
    const empty = renderApp();
    postPluginMessage({
      type: "SCOPE_SCAN_RESULT",
      requestId: empty.getScopeRequestId(),
      result: { roots: [], nodes: [], issues: [{ code: "empty_selection", message: "Nothing selected." }] }
    });
    expect(empty.container.querySelector('[data-testid="scope-empty"]')?.textContent).toContain(
      "Select one or more supported layers in Figma"
    );

    vi.restoreAllMocks();
    const error = renderApp();
    postPluginMessage({
      type: "PLUGIN_ERROR",
      requestId: error.getScopeRequestId(),
      code: "INVALID_MESSAGE",
      message: "Safe scanner failure."
    });
    expect(error.container.querySelector('[role="alert"]')?.textContent).toContain("Safe scanner failure.");
    expect(error.container.querySelector('[role="alert"]')?.textContent).toContain("Retry scan");
  });

  test("renders hierarchy rows with expansion, checkbox, type, hidden, and locked data", () => {
    const { container, getScopeRequestId } = renderApp();
    postPluginMessage({
      type: "SCOPE_SCAN_RESULT",
      requestId: getScopeRequestId(),
      result: sampleResult
    });

    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(2);
    const groupExpand = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("Expand Controls")
    );
    const expandControls = requireValue(groupExpand, "Expected Controls expand button.");
    act(() => {
      expandControls.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(4);
    expect(container.textContent).toContain("Hidden");
    expect(container.textContent).toContain("Locked");
    expect(container.textContent).not.toMatch(/animated|motion source|compatibility/i);

    const checkbox = requireValue(
      container.querySelector<HTMLInputElement>('input[aria-label="Include Hidden Copy"]'),
      "Expected Hidden Copy checkbox."
    );
    expect(checkbox.checked).toBe(true);
    act(() => {
      checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(checkbox.checked).toBe(false);
  });

  test("supports keyboard expansion and local checkbox toggling", () => {
    const { container, getScopeRequestId } = renderApp();
    postPluginMessage({
      type: "SCOPE_SCAN_RESULT",
      requestId: getScopeRequestId(),
      result: sampleResult
    });

    const groupRow = Array.from(container.querySelectorAll('[role="treeitem"]')).find((row) =>
      row.textContent.includes("Controls")
    );
    const controlsRow = requireValue(groupRow, "Expected Controls row.");
    act(() => {
      controlsRow.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(4);
    act(() => {
      controlsRow.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    const checkbox = requireValue(
      container.querySelector<HTMLInputElement>('input[aria-label="Include Controls"]'),
      "Expected Controls checkbox."
    );
    expect(checkbox.checked).toBe(false);
  });

  test("maps all five mode controls to canonical Scope requests", () => {
    const { container, getScopeRequests } = renderApp();

    const choose = (label: string) => {
      const input = requireValue(
        Array.from(container.querySelectorAll<HTMLInputElement>('input[name="scope-mode"]')).find(
          (candidate) => candidate.parentElement?.textContent === label
        ),
        `Expected ${label} mode input.`
      );
      act(() => {
        input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    };

    choose("Direct children");
    choose("All descendants");
    choose("Depth");
    const depth = requireValue(
      container.querySelector<HTMLInputElement>('input[type="number"]'),
      "Expected depth input."
    );
    act(() => {
      setInputValue(depth, "3");
    });
    choose("Manual");
    const manual = requireValue(
      container.querySelector<HTMLInputElement>('input[placeholder="12:34, 56:78"]'),
      "Expected manual node ID input."
    );
    act(() => {
      setInputValue(manual, "1:1, 2:2 1:1");
    });
    choose("Selected object");

    expect(getScopeRequests().map((request) => request.scope)).toEqual([
      { mode: "current-selection" },
      { mode: "direct-children" },
      { mode: "all-descendants" },
      { mode: "depth-limited", maxDepth: 2 },
      { mode: "depth-limited", maxDepth: 3 },
      { mode: "manual", nodeIds: [] },
      { mode: "manual", nodeIds: ["1:1", "2:2"] },
      { mode: "current-selection" }
    ]);
  });

  test("validates depth input while real order and selection-sync controls are present", () => {
    const { container, getScopeRequests } = renderApp();
    const depthMode = requireValue(
      Array.from(container.querySelectorAll<HTMLInputElement>('input[name="scope-mode"]')).find(
        (candidate) => candidate.parentElement?.textContent === "Depth"
      ),
      "Expected depth mode input."
    );
    act(() => {
      depthMode.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const requestCount = getScopeRequests().length;
    const depth = requireValue(
      container.querySelector<HTMLInputElement>('input[type="number"]'),
      "Expected depth input."
    );
    act(() => {
      setInputValue(depth, "0");
    });

    expect(container.textContent).toContain("Depth must be an integer of at least 1.");
    expect(getScopeRequests()).toHaveLength(requestCount);
    expect(container.textContent).toMatch(/Target order|Selection sync/i);
  });

  test("changes automatic ordering and custom ordering locally without rescanning", () => {
    const { container, getScopeRequestId, getScopeRequests } = renderApp();
    postPluginMessage({
      type: "SCOPE_SCAN_RESULT",
      requestId: getScopeRequestId(),
      result: sampleResult
    });
    const requestCount = getScopeRequests().length;
    const order = requireValue(
      container.querySelector<HTMLSelectElement>('select[aria-label="Target order"]'),
      "Expected target order select."
    );

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(order, "left-to-right");
      order.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Current order: Left to right");

    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(order, "custom");
      order.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const moveDown = requireValue(
      Array.from(container.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === "Move Checkout Frame down"),
      "Expected move down button."
    );
    act(() => {
      moveDown.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Current order: Custom");
    expect(getScopeRequests()).toHaveLength(requestCount);

    const reset = requireValue(
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Reset custom order"),
      "Expected reset custom order button."
    );
    act(() => {
      reset.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Current order: Left to right");
  });

  test("reveals nodes through the plugin boundary and reports safe results", () => {
    const { container, getScopeRequestId, postMessage } = renderApp();
    postPluginMessage({
      type: "SCOPE_SCAN_RESULT",
      requestId: getScopeRequestId(),
      result: sampleResult
    });
    const reveal = requireValue(
      Array.from(container.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === "Reveal Checkout Frame in Figma"),
      "Expected reveal button."
    );
    act(() => {
      reveal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const revealRequest = postMessage.mock.calls
      .map(([payload]) =>
        typeof payload === "object" && payload !== null && "pluginMessage" in payload
          ? (payload as { pluginMessage?: { type?: string; requestId?: string; nodeId?: string } }).pluginMessage
          : undefined
      )
      .find((message) => message?.type === "SCOPE_REVEAL_NODE_REQUEST");
    expect(revealRequest).toMatchObject({ nodeId: "frame" });

    postPluginMessage({
      type: "SCOPE_REVEAL_NODE_RESULT",
      requestId: revealRequest?.requestId,
      result: { ok: true, nodeId: "frame", status: "selected", message: "Scope node selected and revealed." }
    });
    expect(container.textContent).toContain("Scope node selected and revealed.");
  });

  test("handles progress, cancellation, stale selection changes, rescan, and selection sync", () => {
    const { container, getScopeRequestId, getScopeRequests, postMessage } = renderApp();
    const firstRequest = getScopeRequestId();
    postPluginMessage({
      type: "SCOPE_SCAN_PROGRESS",
      requestId: firstRequest,
      progress: { requestId: firstRequest, visited: 25, indeterminate: true }
    });
    expect(container.textContent).toContain("25 nodes visited");

    const cancel = requireValue(
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Cancel scan"),
      "Expected cancel scan button."
    );
    act(() => {
      cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      postMessage.mock.calls.some(
        ([payload]) =>
          typeof payload === "object" &&
          payload !== null &&
          "pluginMessage" in payload &&
          (payload as { pluginMessage?: { type?: string } }).pluginMessage?.type === "SCOPE_SCAN_CANCEL"
      )
    ).toBe(true);
    expect(container.textContent).toContain("Scope scan cancelled");

    const rescan = requireValue(
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Rescan"),
      "Expected rescan button."
    );
    act(() => {
      rescan.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const readyRequest = getScopeRequestId();
    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: readyRequest, result: sampleResult });
    const requestCount = getScopeRequests().length;
    postPluginMessage({ type: "SCOPE_SELECTION_CHANGED", selectionIds: ["other"] });
    expect(container.querySelector('[data-testid="scope-stale"]')?.textContent).toContain("selection");

    const sync = requireValue(
      Array.from(container.querySelectorAll("label")).find((label) => label.textContent === "Selection sync")?.querySelector<HTMLInputElement>("input"),
      "Expected selection sync input."
    );
    act(() => {
      sync.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    postPluginMessage({ type: "SCOPE_SELECTION_CHANGED", selectionIds: ["next"] });
    expect(getScopeRequests()).toHaveLength(requestCount + 1);
  });

  test("applies filters locally and clears them without rescanning", () => {
    const { container, getScopeRequestId, getScopeRequests } = renderApp();
    postPluginMessage({
      type: "SCOPE_SCAN_RESULT",
      requestId: getScopeRequestId(),
      result: sampleResult
    });
    const requestCount = getScopeRequests().length;

    const groupExpand = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("Expand Controls")
    );
    act(() => {
      requireValue(groupExpand, "Expected Controls expand button.").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(container.textContent).toContain("Hidden Copy");

    const search = requireValue(
      container.querySelector<HTMLInputElement>('input[type="search"]'),
      "Expected search input."
    );
    act(() => {
      setInputValue(search, "locked");
    });
    expect(container.textContent).toContain("Locked Icon");
    expect(container.textContent).not.toContain("Hidden Copy");

    const clear = requireValue(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Clear filters"
      ),
      "Expected Clear filters button."
    );
    act(() => {
      clear.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      requireValue(groupExpand, "Expected Controls expand button.").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(container.textContent).toContain("Hidden Copy");
    expect(getScopeRequests()).toHaveLength(requestCount);
  });

  test("filters hidden, locked, and node types while preserving safe indicators when visible", () => {
    const { container, getScopeRequestId } = renderApp();
    postPluginMessage({
      type: "SCOPE_SCAN_RESULT",
      requestId: getScopeRequestId(),
      result: sampleResult
    });

    const groupExpand = Array.from(container.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("Expand Controls")
    );
    act(() => {
      requireValue(groupExpand, "Expected Controls expand button.").dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(container.textContent).toContain("Hidden");
    expect(container.textContent).toContain("Locked");

    const excludeHiddenLabel = requireValue(
      Array.from(container.querySelectorAll("label")).find(
        (label) => label.textContent === "Exclude hidden"
      ),
      "Expected exclude hidden label."
    );
    const excludeHiddenInput = requireValue(
      excludeHiddenLabel.querySelector<HTMLInputElement>("input"),
      "Expected exclude hidden input."
    );
    act(() => {
      excludeHiddenInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("Hidden Copy");
    expect(container.textContent).toContain("Locked Icon");

    const vectorTypeLabel = requireValue(
      Array.from(container.querySelectorAll("label")).find((label) => label.textContent === "vector"),
      "Expected vector type label."
    );
    const vectorTypeInput = requireValue(
      vectorTypeLabel.querySelector<HTMLInputElement>("input"),
      "Expected vector type input."
    );
    act(() => {
      vectorTypeInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Locked Icon");
    expect(container.textContent).not.toContain("Controls");
  });
});
