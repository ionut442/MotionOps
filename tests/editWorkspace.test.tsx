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
  roots: ["mixed"],
  nodes: [
    {
      id: "mixed",
      parentId: null,
      name: "Mixed Layer",
      type: "RECTANGLE",
      depth: 0,
      childIds: [],
      visible: true,
      locked: false,
      hasChildren: false,
      childrenIncluded: false,
      rootIds: ["mixed"],
      traversalIndex: 0
    }
  ],
  issues: []
};

const node = (overrides: Record<string, unknown> = {}): FakeNode => ({
  id: "mixed",
  name: "Mixed Layer",
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: "opacity-track",
      keyframes: [
        { id: "a", time: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
        { id: "b", time: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
      ]
    }
  },
  animations: { OPACITY: { timelineDuration: 0.5 } },
  animationStyles: [{ id: "applied", styleId: "available", name: "Opacity Style" }],
  timelines: [{ id: "timeline", duration: 0.5 }],
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

const chooseComboboxOption = (name: string, optionName: string) => {
  click(document.querySelector(`[role="combobox"][aria-label="${name}"]`));
  click(
    Array.from(document.querySelectorAll('[role="option"]')).find((option) => option.textContent === optionName) ??
      null
  );
};

const latestPluginMessage = <T extends { type: string }>(postMessage: ReturnType<typeof vi.spyOn>, type: T["type"]): T => {
  const payload = [...postMessage.mock.calls].reverse().find(
    ([item]) =>
      typeof item === "object" &&
      item !== null &&
      "pluginMessage" in item &&
      (item as { pluginMessage?: { type?: string } }).pluginMessage?.type === type
  )?.[0] as { pluginMessage: T } | undefined;
  expect(payload).toBeTruthy();
  if (payload === undefined) {
    throw new Error(`No plugin message of type ${type} was posted.`);
  }
  return payload.pluginMessage;
};

describe("Edit workspace", () => {
  test("builds Timing and Easing previews through typed messages and keeps Apply inside the drawer", () => {
    const { container, postMessage } = renderApp();
    postPluginMessage({ type: "PLUGIN_READY", pluginVersion: "0.0.0", figmaMode: "default", apiLabEnabled: false });

    const scopeRequest = latestPluginMessage<{ type: "SCOPE_SCAN_REQUEST"; requestId: string }>(postMessage, "SCOPE_SCAN_REQUEST");
    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: scopeRequest.requestId, result: scopeResult });
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Confirm scope") ?? null);
    click(container.querySelector('[role="tab"][aria-label="Edit workspace"]'));

    const inspectRequest = latestPluginMessage<{ type: "MOTION_INSPECT_REQUEST"; requestId: string; nodeIds: readonly string[] }>(
      postMessage,
      "MOTION_INSPECT_REQUEST"
    );
    expect(inspectRequest.nodeIds).toEqual(["mixed"]);
    postPluginMessage({
      type: "MOTION_INSPECT_RESULT",
      requestId: inspectRequest.requestId,
      result: { requestedNodeIds: ["mixed"], snapshots: [normalizeMotionSnapshot(node())], failures: [] }
    });

    expect(container.textContent).toContain("Timing");
    expect(container.textContent).toContain("Easing");
    expect(container.textContent).toContain("Opacity");
    expect(container.textContent).toContain("1 of 1 properties selected");
    expect(container.textContent).toContain("Animation style");
    expect(container.textContent).not.toContain("OPACITY manual");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Preview changes") ?? null);
    const planRequest = latestPluginMessage<{
      type: "MOTION_PLAN_OPERATION_REQUEST";
      requestId: string;
      nodeId: string;
      targetIds: readonly string[];
      operation: { kind: string; durationMs?: number; anchor?: string };
    }>(postMessage, "MOTION_PLAN_OPERATION_REQUEST");
    expect(planRequest.nodeId).toBe("mixed");
    expect(planRequest.operation).toMatchObject({ kind: "set-duration", durationMs: 500, anchor: "preserve-start" });
    expect(planRequest.targetIds).toContain("opacity-track");
    expect(planRequest.targetIds).toContain("applied");

    postPluginMessage({
      type: "MOTION_PLAN_OPERATION_RESULT",
      requestId: planRequest.requestId,
      result: {
        ok: true,
        plan: {
          version: 1,
          planId: "plan-1",
          operation: { kind: "set-duration" },
          mutations: [{ id: "m1" }],
          skipped: [{ target: "styleInstances.applied", code: "READ_ONLY_STYLE_FIELD", message: "Style read-only." }],
          warnings: [{ path: "styleInstances.applied", code: "STYLE_FIELD_READ_ONLY", message: "Style read-only." }],
          expected: {
            affectedTargets: 1,
            manualMutations: 1,
            styleMutations: 0,
            timelineMutations: 0,
            skippedTargets: 1,
            expectedResults: ["1 manual replacement mutation(s)", "0 style mutation(s)", "0 timeline mutation(s)", "1 warning(s)"],
            beforeAfterExamples: [{ label: "OPACITY", before: "0, 500", after: "0, 500" }]
          }
        }
      }
    });

    expect(container.textContent).toContain("Timing preview");
    expect(container.textContent).toContain("1 property will change");
    expect(container.textContent).toContain("Apply 1 change");
    expect(container.textContent).not.toContain("Mutations");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Apply 1 change") ?? null);
    const applyRequest = latestPluginMessage<{ type: "MOTION_APPLY_CHANGE_PLAN_REQUEST"; requestId: string; plan: unknown }>(
      postMessage,
      "MOTION_APPLY_CHANGE_PLAN_REQUEST"
    );
    expect(JSON.stringify(applyRequest.plan)).toContain("plan-1");
    postPluginMessage({
      type: "MOTION_APPLY_CHANGE_PLAN_RESULT",
      requestId: applyRequest.requestId,
      result: { status: "stale", errors: [{ message: "Stale or unverifiable plan was blocked before write." }] }
    });
    expect(container.textContent).toContain("stale");
    expect(container.textContent).toContain("Stale or unverifiable plan was blocked before write.");

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Easing") ?? null);
    chooseComboboxOption("New easing", "Custom cubic-bezier");
    const inputs = container.querySelectorAll("input");
    change(inputs[inputs.length - 1], "cubic-bezier(2, 0, 0.4, 1)");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Preview changes") ?? null);
    expect(container.textContent).toContain("The x control points must be between 0 and 1.");
  });

  test("invalidates preview snapshots when mode or selected properties change", () => {
    const { container, postMessage } = renderApp();
    postPluginMessage({ type: "PLUGIN_READY", pluginVersion: "0.0.0", figmaMode: "default", apiLabEnabled: false });
    const scopeRequest = latestPluginMessage<{ type: "SCOPE_SCAN_REQUEST"; requestId: string }>(postMessage, "SCOPE_SCAN_REQUEST");
    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: scopeRequest.requestId, result: scopeResult });
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Confirm scope") ?? null);
    click(container.querySelector('[role="tab"][aria-label="Edit workspace"]'));
    const inspectRequest = latestPluginMessage<{ type: "MOTION_INSPECT_REQUEST"; requestId: string; nodeIds: readonly string[] }>(
      postMessage,
      "MOTION_INSPECT_REQUEST"
    );
    postPluginMessage({
      type: "MOTION_INSPECT_RESULT",
      requestId: inspectRequest.requestId,
      result: { requestedNodeIds: ["mixed"], snapshots: [normalizeMotionSnapshot(node())], failures: [] }
    });

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Preview changes") ?? null);
    const planRequest = latestPluginMessage<{ type: "MOTION_PLAN_OPERATION_REQUEST"; requestId: string }>(postMessage, "MOTION_PLAN_OPERATION_REQUEST");
    postPluginMessage({
      type: "MOTION_PLAN_OPERATION_RESULT",
      requestId: planRequest.requestId,
      result: {
        ok: true,
        plan: {
          version: 1,
          planId: "timing-stale",
          operation: { kind: "set-duration" },
          mutations: [{ id: "m1" }],
          skipped: [],
          warnings: [],
          expected: {
            affectedTargets: 1,
            manualMutations: 1,
            styleMutations: 0,
            timelineMutations: 0,
            skippedTargets: 0,
            expectedResults: [],
            beforeAfterExamples: [{ label: "OPACITY", before: "0, 500", after: "0, 700" }]
          }
        }
      }
    });
    expect(container.textContent).toContain("Timing preview");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Easing") ?? null);
    expect(container.textContent).not.toContain("Timing preview");
    expect(container.textContent).not.toContain("Apply 1 change");

    chooseComboboxOption("New easing", "Ease out");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Preview changes") ?? null);
    const easingRequest = latestPluginMessage<{ type: "MOTION_PLAN_OPERATION_REQUEST"; requestId: string }>(postMessage, "MOTION_PLAN_OPERATION_REQUEST");
    postPluginMessage({
      type: "MOTION_PLAN_OPERATION_RESULT",
      requestId: easingRequest.requestId,
      result: {
        ok: true,
        plan: {
          version: 1,
          planId: "easing-stale",
          operation: { kind: "replace-easing" },
          mutations: [{ property: "OPACITY", before: { keyframes: [{ easing: { kind: "linear" } }] }, after: { keyframes: [{ easing: { kind: "preset", name: "EASE_OUT" } }] } }],
          skipped: [],
          warnings: [],
          expected: {
            affectedTargets: 1,
            manualMutations: 1,
            styleMutations: 0,
            timelineMutations: 0,
            skippedTargets: 0,
            expectedResults: [],
            beforeAfterExamples: []
          }
        }
      }
    });
    expect(container.textContent).toContain("Easing preview");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Deselect all") ?? null);
    expect(container.textContent).not.toContain("Easing preview");
    expect(container.textContent).not.toContain("Apply easing");
  });

  test("copies Motion and builds a paste preview through typed Phase 5 messages", () => {
    const { container, postMessage } = renderApp();
    postPluginMessage({ type: "PLUGIN_READY", pluginVersion: "0.0.0", figmaMode: "default", apiLabEnabled: false });
    const scopeRequest = latestPluginMessage<{ type: "SCOPE_SCAN_REQUEST"; requestId: string }>(postMessage, "SCOPE_SCAN_REQUEST");
    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: scopeRequest.requestId, result: scopeResult });
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Confirm scope") ?? null);
    click(container.querySelector('[role="tab"][aria-label="Edit workspace"]'));
    const inspectRequest = latestPluginMessage<{ type: "MOTION_INSPECT_REQUEST"; requestId: string; nodeIds: readonly string[] }>(
      postMessage,
      "MOTION_INSPECT_REQUEST"
    );
    postPluginMessage({
      type: "MOTION_INSPECT_RESULT",
      requestId: inspectRequest.requestId,
      result: { requestedNodeIds: ["mixed"], snapshots: [normalizeMotionSnapshot(node())], failures: [] }
    });

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Copy/Paste") ?? null);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Copy selected motion") ?? null);
    const copyRequest = latestPluginMessage<{
      type: "MOTION_CLIPBOARD_COPY_REQUEST";
      requestId: string;
      nodeIds: readonly string[];
      mode: string;
    }>(postMessage, "MOTION_CLIPBOARD_COPY_REQUEST");
    expect(copyRequest.nodeIds).toEqual(["mixed"]);
    expect(copyRequest.mode).toBe("complete");

    const clipboard = {
      version: 1,
      createdAtMs: 1,
      mode: "complete",
      sources: [
        {
          sourceNodeId: "mixed",
          sourceNodeType: "RECTANGLE",
          sourceKind: "mixed",
          copyMode: "complete",
          manualTracks: [{}],
          styleInstances: [{}],
          timingSummary: { keyframeCount: 2 },
          capabilities: {},
          warnings: []
        }
      ]
    };
    postPluginMessage({
      type: "MOTION_CLIPBOARD_COPY_RESULT",
      requestId: copyRequest.requestId,
      result: { ok: true, clipboard, serialized: "{}" }
    });
    expect(container.textContent).toContain("Clipboard replaced with 1 source");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Preview changes") ?? null);
    const pasteRequest = latestPluginMessage<{
      type: "MOTION_PASTE_PLAN_REQUEST";
      requestId: string;
      destinationNodeIds: readonly string[];
      pasteMode: string;
      mapping: { mode: string };
    }>(postMessage, "MOTION_PASTE_PLAN_REQUEST");
    expect(pasteRequest.destinationNodeIds).toEqual(["mixed"]);
    expect(pasteRequest.pasteMode).toBe("replace");
    expect(pasteRequest.mapping.mode).toBe("one-to-many");

    postPluginMessage({
      type: "MOTION_PASTE_PLAN_RESULT",
      requestId: pasteRequest.requestId,
      result: {
        ok: true,
        compatibility: { summary: { supported: 1, warnings: 0, partial: 0, readOnly: 1, unsupported: 0 } },
        plan: {
          version: 1,
          planId: "paste-plan",
          operation: { kind: "paste-motion" },
          mutations: [{ id: "m1" }],
          skipped: [{ target: "styleInstances.applied", code: "READ_ONLY_STYLE_FIELD", message: "Style read-only." }],
          warnings: [],
          expected: {
            affectedTargets: 1,
            manualMutations: 1,
            styleMutations: 0,
            timelineMutations: 0,
            skippedTargets: 1,
            expectedResults: ["1 manual paste mutation(s)", "1 skipped paste target(s)", "0 warning(s)"],
            beforeAfterExamples: [{ label: "mixed:OPACITY", before: "0, 500", after: "0, 500" }]
          }
        }
      }
    });
    expect(container.textContent).toContain("Paste motion to 1 destination");
    expect(container.textContent).toContain("Supported 1");
  });
});
