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

const node = (): FakeNode => ({
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
    },
    X: {
      id: "x-track",
      keyframes: [
        { id: "x1", time: 0.25, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
        { id: "x2", time: 0.75, value: { type: "FLOAT", value: 10 }, easing: { type: "LINEAR" } }
      ]
    }
  },
  animations: { OPACITY: { timelineDuration: 0.75 } },
  animationStyles: [{ id: "applied", styleId: "available", name: "Opacity Style" }],
  timelines: [{ id: "timeline", duration: 0.75 }],
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

const click = (element: Element | null, init: MouseEventInit = {}) => {
  expect(element).toBeTruthy();
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
  });
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

const hasPluginMessage = (postMessage: ReturnType<typeof vi.spyOn>, type: string): boolean =>
  postMessage.mock.calls.some(
    ([item]) =>
      typeof item === "object" &&
      item !== null &&
      "pluginMessage" in item &&
      (item as { pluginMessage?: { type?: string } }).pluginMessage?.type === type
  );

describe("Sequence workspace", () => {
  test("loads Scope Motion data, edits locally, previews through P4, and applies only from preview", () => {
    const { container, postMessage } = renderApp();
    postPluginMessage({ type: "PLUGIN_READY", pluginVersion: "0.0.0", figmaMode: "default", apiLabEnabled: false });
    const scopeRequest = latestPluginMessage<{ type: "SCOPE_SCAN_REQUEST"; requestId: string }>(postMessage, "SCOPE_SCAN_REQUEST");
    postPluginMessage({ type: "SCOPE_SCAN_RESULT", requestId: scopeRequest.requestId, result: scopeResult });
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Confirm scope") ?? null);

    click(container.querySelector('[role="tab"][aria-label="Sequence workspace"]'));
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

    expect(container.textContent).toContain("Sequence");
    expect(container.textContent).toContain("OPACITY");
    expect(container.textContent).toContain("Opacity Style");
    expect(container.textContent).toContain("Snap on");
    expect(container.textContent).not.toMatch(/playhead|playback|Stagger Builder|QA|Standards|Handoff/i);

    click(container.querySelector(".sequence-bar"));
    expect(container.textContent).toContain("Sequencer properties");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Nudge forward") ?? null);
    expect(hasPluginMessage(postMessage, "MOTION_APPLY_CHANGE_PLAN_REQUEST")).toBe(false);

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Build preview") ?? null);
    const planRequest = latestPluginMessage<{
      type: "MOTION_PLAN_OPERATION_REQUEST";
      requestId: string;
      operation: { kind: string; manualTracks: readonly { property: string; keyframes: readonly { timeMs: number }[] }[] };
      targetIds: readonly string[];
    }>(postMessage, "MOTION_PLAN_OPERATION_REQUEST");
    expect(planRequest.operation.kind).toBe("sequencer-draft");
    expect(planRequest.operation.manualTracks[0].property).toBe("OPACITY");
    expect(planRequest.operation.manualTracks[0].keyframes.map((keyframe) => keyframe.timeMs)).toEqual([50, 550]);
    expect(planRequest.targetIds).toContain("opacity-track");

    postPluginMessage({
      type: "MOTION_PLAN_OPERATION_RESULT",
      requestId: planRequest.requestId,
      result: {
        ok: true,
        plan: {
          version: 1,
          planId: "seq-plan",
          operation: { kind: "sequencer-draft" },
          mutations: [{ id: "m1" }],
          skipped: [],
          warnings: [],
          expected: {
            affectedTargets: 1,
            manualMutations: 1,
            styleMutations: 0,
            timelineMutations: 0,
            skippedTargets: 0,
            expectedResults: ["1 manual replacement mutation(s)", "0 style mutation(s)", "0 timeline mutation(s)", "0 warning(s)"],
            beforeAfterExamples: [{ label: "OPACITY", before: "0, 500", after: "50, 550" }]
          }
        }
      }
    });
    expect(container.textContent).toContain("Sequencer preview");
    expect(container.textContent).toContain("Sequencer draft");

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Apply") ?? null);
    const applyRequest = latestPluginMessage<{ type: "MOTION_APPLY_CHANGE_PLAN_REQUEST"; plan: unknown }>(
      postMessage,
      "MOTION_APPLY_CHANGE_PLAN_REQUEST"
    );
    expect(JSON.stringify(applyRequest.plan)).toContain("seq-plan");
  });
});
