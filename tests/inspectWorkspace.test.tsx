import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
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

const chooseComboboxOption = (name: string, optionName: string) => {
  click(document.querySelector(`[role="combobox"][aria-label="${name}"]`));
  click(
    Array.from(document.querySelectorAll('[role="option"]')).find((option) => option.textContent === optionName) ??
      null
  );
};

describe("Inspect workspace", () => {
  test("renders scoped normalized Motion data, filters locally, toggles debug, and reveals nodes", () => {
    window.localStorage.setItem("motionops.developerMode", "true");
    const { container, postMessage } = renderApp();
    const scopeRequest = postMessage.mock.calls.find(
      ([payload]) =>
        typeof payload === "object" &&
        payload !== null &&
        "pluginMessage" in payload &&
        (payload as { pluginMessage?: { type?: string } }).pluginMessage?.type === "SCOPE_SCAN_REQUEST"
    )?.[0] as { pluginMessage: { requestId: string } };

    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: scopeRequest.pluginMessage.requestId, result: scopeResult });
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Confirm scope") ?? null);
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
    expect(container.textContent).toContain("Overview");
    expect(container.textContent).toContain("Details");
    expect(container.textContent).toContain("This layer has 1 animated property across 1 manual track and 2 keyframes.");
    expect(container.textContent).toContain("Animated properties");
    expect(container.textContent).toContain("Timing");
    expect(container.textContent).not.toContain("Opacity track");
    expect(container.textContent).not.toContain("Manual · 500 ms");
    expect(container.textContent).not.toContain("Opacity track - Partially editable");
    expect(container.textContent).toContain("500 ms");
    expect(container.textContent).not.toContain("0%");
    expect(container.textContent).not.toContain("100%");
    expect(container.textContent).not.toContain("Track duration");
    expect(container.textContent).toContain("Rectangle");
    expect(container.textContent).toContain("Manual");
    expect(container.textContent).not.toContain("Node type");
    expect(container.textContent).not.toContain("{ type: FLOAT");
    expect(container.textContent).not.toContain("Main timing");
    expect(container.textContent).not.toContain("Animation styles and derived data");
    expect(container.textContent).not.toContain("No animation styles");

    click(Array.from(container.querySelectorAll('[role="radio"]')).find((button) => button.textContent === "Details") ?? null);
    expect(container.textContent).toContain("Animation tracks (1)");
    expect(container.textContent).toContain("Opacity");
    expect(container.textContent).toContain("Manual · 500 ms");
    expect(container.textContent).not.toContain("Opacity track");
    expect(container.textContent).toContain("0%");
    expect(container.textContent).toContain("100%");

    chooseComboboxOption("Source", "Mixed");
    expect(container.textContent).not.toContain("Manual Layer");
    expect(container.textContent).toContain("Mixed Layer");
    expect(container.textContent).toContain("Frame");
    expect(container.textContent).toContain("Mixed");

    const capabilitySummary = container.querySelector(".inspector-capability-summary");
    expect(capabilitySummary).toBeTruthy();
    if (capabilitySummary === null) throw new Error("missing capability summary");
    expect(capabilitySummary.querySelector("h4")?.textContent).toBe("Manual tracks are editable. Derived details are read-only.");
    expect(capabilitySummary.textContent).toContain("View 1 read-only details");
    expect(capabilitySummary.textContent.match(/These values come from derived Figma Motion data/g)).toBeNull();
    click(capabilitySummary.querySelector("button"));
    expect(capabilitySummary.textContent).toContain("Opacity - derived details are read-only");
    expect(capabilitySummary.textContent.match(/These values come from derived Figma Motion data/g)?.length).toBe(1);
    expect(Array.from(container.querySelectorAll(".inspector-section h4")).map((heading) => heading.textContent)).not.toContain(
      "Derived animation"
    );
    expect(container.textContent).not.toContain("Timeline duration: 500 ms");

    click(Array.from(container.querySelectorAll("label")).find((label) => label.textContent === "Warnings only")?.querySelector("input") ?? null);
    expect(container.textContent).toContain("No inspected targets match the current filters.");
    click(Array.from(container.querySelectorAll("label")).find((label) => label.textContent === "Warnings only")?.querySelector("input") ?? null);

    click(Array.from(container.querySelectorAll('[role="radio"]')).find((button) => button.textContent === "Debug") ?? null);
    expect(container.textContent).toContain("Derived animation");
    expect(container.textContent).toContain("Timeline duration: 500 ms");
    expect(container.textContent).toContain("Serialized normalized data");
    expect(container.textContent).toContain("{");

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

  test("uses fixed Inspect controls above independently scrolling target and detail panels", () => {
    const styles = readFileSync("src/ui/styles.css", "utf8");
    expect(styles).toMatch(/\.workspace-panel:has\(\.inspect-workspace\)\s*{[^}]*place-content:\s*stretch;/s);
    expect(styles).toMatch(/\.inspect-workspace\s*{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\);[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.inspect-filter-controls\s*{[^}]*background:\s*var\(--color-surface\);/s);
    expect(styles).toMatch(/\.inspect-filter-controls\s*{[^}]*position:\s*relative;[^}]*z-index:\s*20;/s);
    expect(styles).toMatch(/\.inspect-layout\s*{[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.inspector-target-list,\s*\.inspector-detail\s*{[^}]*overflow:\s*auto;/s);
  });
});
