import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { ScopeScanResult } from "../src/domain/scopeScan";
import { createDefaultStandards } from "../src/domain/standards";
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
  for (const root of roots.splice(0)) act(() => { root.unmount(); });
  for (const container of containers.splice(0)) container.remove();
  vi.restoreAllMocks();
});

const scopeResult: ScopeScanResult = {
  roots: ["mixed"],
  nodes: [{ id: "mixed", parentId: null, name: "Mixed Layer", type: "RECTANGLE", depth: 0, childIds: [], visible: false, locked: true, hasChildren: false, childrenIncluded: false, rootIds: ["mixed"], traversalIndex: 0 }],
  issues: []
};

const node = (): FakeNode => ({
  id: "mixed",
  name: "Mixed Layer",
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: { OPACITY: { id: "opacity-track", keyframes: [{ id: "a", time: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } }, { id: "b", time: 1.5, value: { type: "FLOAT", value: 2 }, easing: { type: "LINEAR" } }] } },
  animations: { OPACITY: { timelineDuration: 1 } },
  animationStyles: [{ id: "applied", styleId: "available", name: "Opacity Style" }],
  timelines: [{ id: "timeline", duration: 1 }],
  applyManualKeyframeTrack: vi.fn()
});

const renderApp = () => {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
  act(() => {
    root.render(<ApplicationStateProvider><App /></ApplicationStateProvider>);
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
  act(() => { element?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};

const latestPluginMessage = <T extends { type: string }>(postMessage: ReturnType<typeof vi.spyOn>, type: T["type"]): T => {
  const payload = [...postMessage.mock.calls].reverse().find(
    ([item]) => typeof item === "object" && item !== null && "pluginMessage" in item && (item as { pluginMessage?: { type?: string } }).pluginMessage?.type === type
  )?.[0] as { pluginMessage: T } | undefined;
  expect(payload).toBeTruthy();
  if (payload === undefined) throw new Error(`No plugin message of type ${type}`);
  return payload.pluginMessage;
};

describe("Review workspace", () => {
  test("loads standards, runs QA without writing, shows issues, reveals nodes, and builds safe-fix preview through P4", () => {
    const { container, postMessage } = renderApp();
    postPluginMessage({ type: "PLUGIN_READY", pluginVersion: "0.0.0", figmaMode: "default", apiLabEnabled: false });
    const scopeRequest = latestPluginMessage<{ type: "SCOPE_SCAN_REQUEST"; requestId: string }>(postMessage, "SCOPE_SCAN_REQUEST");
    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: scopeRequest.requestId, result: scopeResult });
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Confirm scope") ?? null);

    click(container.querySelector('[role="tab"][aria-label="Review workspace"]'));
    const storageRequest = latestPluginMessage<{ type: "STANDARDS_STORAGE_REQUEST"; requestId: string }>(postMessage, "STANDARDS_STORAGE_REQUEST");
    const standards = createDefaultStandards(10);
    postPluginMessage({
      type: "STANDARDS_STORAGE_RESULT",
      requestId: storageRequest.requestId,
      result: { personal: [{ id: standards.id, name: standards.name, source: "personal", standardsVersion: standards.metadata.version }], activeSource: "personal", activeId: standards.id, active: standards, errors: [] }
    });

    expect(container.textContent).toContain("Standards");
    expect(container.textContent).toContain("QA");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "QA") ?? null);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Run QA") ?? null);
    const inspectRequest = latestPluginMessage<{ type: "MOTION_INSPECT_REQUEST"; requestId: string; nodeIds: readonly string[] }>(postMessage, "MOTION_INSPECT_REQUEST");
    expect(inspectRequest.nodeIds).toEqual(["mixed"]);
    expect(postMessage.mock.calls.some(([item]) => JSON.stringify(item).includes("MOTION_APPLY_CHANGE_PLAN_REQUEST"))).toBe(false);
    postPluginMessage({
      type: "MOTION_INSPECT_RESULT",
      requestId: inspectRequest.requestId,
      result: { requestedNodeIds: ["mixed"], snapshots: [normalizeMotionSnapshot(node())], failures: [] }
    });

    expect(container.textContent).toContain("Warning");
    const issueButtons = Array.from(container.querySelectorAll(".review-issue-list button"));
    const durationIssueButton = issueButtons.find((button) => button.textContent.includes("Duration"));
    click(durationIssueButton ?? null);
    expect(container.textContent).toContain("Reveal node");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Reveal node") ?? null);
    expect(latestPluginMessage<{ type: "SCOPE_REVEAL_NODE_REQUEST"; requestId: string; nodeId: string }>(postMessage, "SCOPE_REVEAL_NODE_REQUEST").nodeId).toBe("mixed");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Build safe fix") ?? null);
    expect(latestPluginMessage<{ type: "MOTION_PLAN_OPERATION_REQUEST"; requestId: string }>(postMessage, "MOTION_PLAN_OPERATION_REQUEST").type).toBe("MOTION_PLAN_OPERATION_REQUEST");
    expect(container.textContent).not.toMatch(/analytics|cloud|accessibility audit/i);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Handoff") ?? null);
    expect(container.textContent).toContain("Markdown preview");
    expect(container.textContent).toContain("Copy Markdown");
    expect(container.textContent).toContain("Export JSON");
    expect(container.textContent).toContain("MotionOps Handoff Report");
    expect(container.textContent).not.toMatch(/code generation|share link|backend/i);
  });
});
