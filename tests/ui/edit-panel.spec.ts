import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

declare global {
  interface Window {
    __motionOpsMessages?: unknown[];
  }
}

const capturePluginMessages = async (page: Page) => {
  await page.addInitScript(() => {
    window.__motionOpsMessages = [];
    const nativePostMessage = window.postMessage.bind(window);
    const replacementPostMessage: typeof window.postMessage = (
      message: unknown,
      optionsOrTarget?: WindowPostMessageOptions | string,
      transfer?: Transferable[]
    ) => {
      window.__motionOpsMessages?.push(message);
      if (typeof optionsOrTarget === "string") {
        nativePostMessage(message, optionsOrTarget, transfer ?? []);
        return;
      }
      nativePostMessage(message, optionsOrTarget);
    };
    window.postMessage = replacementPostMessage;
  });
};

const pluginRequestId = async (page: Page, type: string): Promise<string> =>
  page.evaluate((messageType) => {
    const messages = window.__motionOpsMessages ?? [];
    const match = [...messages].reverse().find((entry) => {
      if (typeof entry !== "object" || entry === null || !("pluginMessage" in entry)) return false;
      return (entry as { pluginMessage?: { type?: string } }).pluginMessage?.type === messageType;
    }) as { pluginMessage?: { requestId?: string } } | undefined;
    if (!match?.pluginMessage?.requestId) {
      throw new Error(`Missing ${messageType} request`);
    }
    return match.pluginMessage.requestId;
  }, type);

const snapshot = {
  nodeId: "long",
  nodeType: "RECTANGLE",
  sources: { kind: "manual", hasDerivedAnimations: false, hasManualTracks: true, hasStyleInstances: false, hasTimelines: true },
  timelines: [{ timelineId: "timeline-1", durationMs: 2000, tracks: ["opacity-track"] }],
  manualTracks: [
    {
      trackId: "opacity-track",
      property: "OPACITY",
      propertyClassification: "scalar",
      keyframes: [
        { keyframeId: "a", ordinal: 0, timeMs: 0, value: { type: "FLOAT", value: 0 }, easing: { kind: "linear" }, valueClassification: "scalar" },
        { keyframeId: "b", ordinal: 1, timeMs: 450, value: { type: "FLOAT", value: 1 }, easing: { kind: "cubic-bezier", x1: 0.33, y1: 0, x2: 0.67, y2: 1 }, valueClassification: "scalar" }
      ],
      write: { status: "supported-with-warning", reason: "Manual track replacement is available with limitations." },
      warnings: []
    },
    {
      trackId: "scale-x-track",
      property: "SCALE_X",
      propertyClassification: "scalar",
      keyframes: [
        { keyframeId: "c", ordinal: 0, timeMs: 0, value: { type: "FLOAT", value: 1 }, easing: { kind: "preset", name: "EASE_IN_AND_OUT" }, valueClassification: "scalar" },
        { keyframeId: "d", ordinal: 1, timeMs: 450, value: { type: "FLOAT", value: 1.2 }, easing: { kind: "preset", name: "EASE_IN_AND_OUT" }, valueClassification: "scalar" }
      ],
      write: { status: "supported", reason: "Manual track replacement is available." },
      warnings: []
    }
  ],
  styleInstances: [],
  componentProperties: { definitions: [], currentState: [], motionTracks: [], writeability: { status: "supported", reason: "Readable." }, warnings: [] },
  derivedAnimations: [],
  capabilities: {},
  warnings: []
};

const loadEditFixture = async (page: Page) => {
  await capturePluginMessages(page);
  await page.goto("/");
  const scopeRequestId = await pluginRequestId(page, "SCOPE_SCAN_REQUEST");
  await page.evaluate((requestId) => {
    window.postMessage({
      pluginMessage: {
        type: "SCOPE_SCAN_RESULT",
        requestId,
        result: {
          roots: ["long"],
          nodes: [
            {
              id: "long",
              parentId: null,
              name: "Very Long Animated Checkout Header Layer Name That Needs Truncation In Edit",
              type: "RECTANGLE",
              depth: 0,
              childIds: [],
              visible: true,
              locked: false,
              hasChildren: false,
              childrenIncluded: false,
              rootIds: ["long"],
              traversalIndex: 0
            }
          ],
          issues: []
        }
      }
    });
  }, scopeRequestId);
  await page.getByRole("button", { name: "Confirm scope" }).click();
  await page.getByRole("tab", { name: "Edit workspace" }).click();
  const inspectRequestId = await pluginRequestId(page, "MOTION_INSPECT_REQUEST");
  await page.evaluate(
    ({ requestId, motionSnapshot }) => {
      window.postMessage({
        pluginMessage: {
          type: "MOTION_INSPECT_RESULT",
          requestId,
          result: { requestedNodeIds: ["long"], snapshots: [motionSnapshot], failures: [] }
        }
      });
    },
    { requestId: inspectRequestId, motionSnapshot: snapshot }
  );
};

test("Edit panel hides internals, aligns selects, and keeps narrow viewports overflow-free", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1000, height: 720 },
    { width: 760, height: 700 },
    { width: 760, height: 560 }
  ]) {
    await page.setViewportSize(viewport);
    await loadEditFixture(page);
    await expect(page.getByText("2 of 2 properties selected")).toBeVisible();
    await expect(page.getByText("Opacity")).toBeVisible();
    await expect(page.getByText("Scale X")).toBeVisible();
    await expect(page.getByText(/supported-with-warning|OPACITY manual|SCALE_X|manual replacement|timelines\./)).toHaveCount(0);

    const selectLayout = await page.locator(".edit-workspace .scope-field", { hasText: "Operation" }).locator(".ui-select-trigger").first().evaluate((trigger) => {
        const style = window.getComputedStyle(trigger);
        return { display: style.display, textAlign: style.textAlign };
      });
    expect(selectLayout).toMatchObject({ display: "grid", textAlign: "left" });

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
  }
});

test("Edit preview aggregates warnings and does not squeeze the form at narrow widths", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 560 });
  await loadEditFixture(page);
  await page.getByRole("button", { name: "Preview changes" }).click();
  const planRequestId = await pluginRequestId(page, "MOTION_PLAN_OPERATION_REQUEST");
  await page.evaluate((requestId) => {
    window.postMessage({
      pluginMessage: {
        type: "MOTION_PLAN_OPERATION_RESULT",
        requestId,
        result: {
          ok: true,
          plan: {
            version: 1,
            planId: "edit-preview",
            operation: { kind: "set-duration" },
            mutations: [
              {
                source: "manual",
                property: "OPACITY",
                before: { keyframes: [{ timeMs: 0 }, { timeMs: 450 }] },
                after: { keyframes: [{ timeMs: 0 }, { timeMs: 5000 }] }
              },
              {
                source: "manual",
                property: "SCALE_X",
                before: { keyframes: [{ timeMs: 0 }, { timeMs: 450 }] },
                after: { keyframes: [{ timeMs: 0 }, { timeMs: 5000 }] }
              }
            ],
            skipped: [],
            warnings: [
              { path: "timelines.6561:57.durationMs", code: "TIMELINE_SHORT", message: "Property ends beyond the current timeline." },
              { path: "timelines.6561:57.durationMs", code: "TIMELINE_SHORT", message: "Property ends beyond the current timeline." }
            ],
            expected: {
              affectedTargets: 1,
              manualMutations: 2,
              styleMutations: 0,
              timelineMutations: 0,
              skippedTargets: 0,
              expectedResults: [],
              beforeAfterExamples: []
            }
          }
        }
      }
    });
  }, planRequestId);

  await expect(page.getByText("2 properties will change on 1 layer")).toBeVisible();
  await expect(page.getByText("Property ends beyond the current timeline.")).toHaveCount(1);
  await expect(page.getByText("Warnings (0)")).toHaveCount(0);
  await expect(page.getByText("Skipped targets (0)")).toHaveCount(0);
  await expect(page.getByText(/timelines\.6561|Mutations|Timeline/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply 2 changes" })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
});

test("captures Edit panel deliverable screenshots", async ({ page }) => {
  const outDir = path.resolve("screenshots");
  await fs.mkdir(outDir, { recursive: true });

  for (const mode of ["Timing", "Easing", "Copy/Paste", "Stagger"]) {
    for (const viewport of [
      { suffix: "wide", width: 1280, height: 800 },
      { suffix: "narrow", width: 760, height: 560 }
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loadEditFixture(page);
      await page.getByRole("tab", { name: mode }).click();
      await page.screenshot({ path: path.join(outDir, `edit-${mode.toLowerCase().replace("/", "-")}-${viewport.suffix}.png`), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1000, height: 720 });
  await loadEditFixture(page);
  await page.getByRole("button", { name: "Preview changes" }).click();
  const timingRequestId = await pluginRequestId(page, "MOTION_PLAN_OPERATION_REQUEST");
  await page.evaluate((requestId) => {
    window.postMessage({
      pluginMessage: {
        type: "MOTION_PLAN_OPERATION_RESULT",
        requestId,
        result: {
          ok: true,
          plan: {
            version: 1,
            planId: "timing-shot",
            operation: { kind: "set-duration" },
            mutations: [
              { property: "OPACITY", before: { keyframes: [{ timeMs: 0 }, { timeMs: 450 }] }, after: { keyframes: [{ timeMs: 0 }, { timeMs: 5000 }] } },
              { property: "SCALE_X", before: { keyframes: [{ timeMs: 0 }, { timeMs: 450 }] }, after: { keyframes: [{ timeMs: 0 }, { timeMs: 5000 }] } }
            ],
            skipped: [],
            warnings: [
              { path: "timelines.6561:57.durationMs", code: "TIMELINE_SHORT", message: "2 properties will finish beyond the current timeline." },
              { path: "timelines.6561:57.durationMs", code: "TIMELINE_SHORT", message: "2 properties will finish beyond the current timeline." }
            ],
            expected: { affectedTargets: 1, manualMutations: 2, styleMutations: 0, timelineMutations: 0, skippedTargets: 0, expectedResults: [], beforeAfterExamples: [] }
          }
        }
      }
    });
  }, timingRequestId);
  await page.screenshot({ path: path.join(outDir, "edit-preview-timing-wide.png"), fullPage: true });

  await page.setViewportSize({ width: 760, height: 560 });
  await loadEditFixture(page);
  await page.getByRole("tab", { name: "Copy/Paste" }).click();
  await page.getByRole("button", { name: "Copy selected motion" }).click();
  const copyRequestId = await pluginRequestId(page, "MOTION_CLIPBOARD_COPY_REQUEST");
  await page.evaluate((requestId) => {
    window.postMessage({
      pluginMessage: {
        type: "MOTION_CLIPBOARD_COPY_RESULT",
        requestId,
        result: {
          ok: true,
          clipboard: { version: 1, createdAtMs: 1, mode: "complete", sources: [{ sourceNodeId: "long", sourceNodeType: "RECTANGLE", sourceKind: "manual", copyMode: "complete", manualTracks: [{}, {}], styleInstances: [], timingSummary: {}, capabilities: {}, warnings: [] }] },
          serialized: "{}"
        }
      }
    });
  }, copyRequestId);
  await page.getByRole("button", { name: "Preview changes" }).click();
  const pasteRequestId = await pluginRequestId(page, "MOTION_PASTE_PLAN_REQUEST");
  await page.evaluate((requestId) => {
    window.postMessage({
      pluginMessage: {
        type: "MOTION_PASTE_PLAN_RESULT",
        requestId,
        result: {
          ok: true,
          compatibility: { summary: { supported: 2, warnings: 0, partial: 0, readOnly: 0, unsupported: 1 } },
          plan: {
            version: 1,
            planId: "paste-shot",
            operation: { kind: "paste-motion" },
            mutations: [
              { property: "Very Long Animated Checkout Header Layer Name That Needs Truncation In Edit", before: "Current", after: "Pasted motion" },
              { property: "Target - fully compatible rectangle", before: "Current", after: "Pasted motion" },
              { property: "Target - text", before: "Current", after: "Pasted motion" }
            ],
            skipped: [{ target: "Target - text", code: "INCOMPATIBLE_DESTINATION", message: "This destination does not expose matching editable animation properties." }],
            warnings: [],
            expected: { affectedTargets: 3, manualMutations: 3, styleMutations: 0, timelineMutations: 0, skippedTargets: 1, expectedResults: [], beforeAfterExamples: [] }
          }
        }
      }
    });
  }, pasteRequestId);
  await page.screenshot({ path: path.join(outDir, "edit-preview-copy-paste-narrow.png"), fullPage: true });
});
