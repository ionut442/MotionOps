import { expect, test, type Page } from "@playwright/test";

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

const capabilities = (status: "supported" | "read-only" | "supported-with-warning" = "supported") => ({
  derivedAnimationReads: { status: "supported", reason: "Readable." },
  manualTrackReads: { status: "supported", reason: "Readable." },
  manualTrackReplacement: { status, reason: "Manual track write policy." },
  styleInstanceReads: { status: "supported", reason: "Readable." },
  styleRemoveReapply: { status: "read-only", reason: "Style writes are limited." },
  directStyleReapply: { status: "read-only", reason: "Style writes are limited." },
  timelineReads: { status: "supported", reason: "Readable." },
  timelineDurationWrites: { status: "read-only", reason: "Timeline writes are limited." },
  componentPropertyReads: { status: "supported", reason: "Readable." },
  componentPropertyMotionTrackReads: { status: "read-only", reason: "Derived details are read-only." },
  componentPropertyWrites: { status: "read-only", reason: "Component writes are limited." },
  componentRoots: { status: "supported", reason: "Readable." },
  componentChildren: { status: "supported", reason: "Readable." },
  componentSets: { status: "supported", reason: "Readable." },
  variantComponents: { status: "supported", reason: "Readable." },
  instanceRoots: { status: "supported", reason: "Readable." },
  instanceDescendants: { status: "supported", reason: "Readable." },
  nestedInstances: { status: "supported", reason: "Readable." },
  nestedDescendants: { status: "supported", reason: "Readable." }
});

const emptyComponentProperties = {
  definitions: [],
  currentState: [],
  motionTracks: [],
  writeability: { status: "supported", reason: "Readable." },
  warnings: []
};

const snapshot = (nodeId: string, sourceKind: "manual" | "mixed" | "none" = "manual") => ({
  nodeId,
  nodeType: nodeId === "deep" ? "FRAME" : "RECTANGLE",
  sources: {
    kind: sourceKind,
    hasDerivedAnimations: sourceKind === "mixed",
    hasManualTracks: sourceKind !== "none",
    hasStyleInstances: sourceKind === "mixed",
    hasTimelines: true
  },
  timelines: [{ timelineId: `${nodeId}-timeline`, durationMs: 2000, tracks: [`${nodeId}-opacity`] }],
  manualTracks:
    sourceKind === "none"
      ? []
      : [
          {
            trackId: `${nodeId}-opacity`,
            property: "OPACITY",
            propertyClassification: "scalar",
            keyframes: [
              { keyframeId: `${nodeId}-a`, ordinal: 0, timeMs: 0, value: { type: "FLOAT", value: 0 }, easing: { kind: "linear" }, valueClassification: "scalar" },
              { keyframeId: `${nodeId}-b`, ordinal: 1, timeMs: 450, value: { type: "FLOAT", value: 1 }, easing: { kind: "cubic-bezier", x1: 0.33, y1: 0, x2: 0.67, y2: 1 }, valueClassification: "scalar" }
            ],
            write: { status: "supported", reason: "Manual track replacement is available." },
            warnings: []
          }
        ],
  styleInstances: sourceKind === "mixed" ? [{ appliedStyleInstanceId: "applied", availableAnimationStyleId: "available", name: "Pulse", warnings: [] }] : [],
  componentProperties: emptyComponentProperties,
  derivedAnimations:
    sourceKind === "mixed"
      ? [
          { property: "OPACITY", valueClassification: "object", timelineDurationMs: 2000 },
          { property: "ROTATION", valueClassification: "object", timelineDurationMs: 2000 }
        ]
      : [],
  capabilities: capabilities(sourceKind === "mixed" ? "supported-with-warning" : "supported"),
  warnings: []
});

const loadInspectFixture = async (page: Page) => {
  await capturePluginMessages(page);
  await page.goto("/");
  const scopeRequestId = await pluginRequestId(page, "SCOPE_SCAN_REQUEST");
  await page.evaluate((requestId) => {
    window.postMessage({
      pluginMessage: {
        type: "SCOPE_SCAN_RESULT",
        requestId,
        result: {
          roots: ["deep"],
          nodes: [
            {
              id: "deep",
              parentId: null,
              name: "Deep Parent Section With Motion Targets",
              type: "FRAME",
              depth: 0,
              childIds: ["long"],
              visible: true,
              locked: false,
              hasChildren: true,
              childrenIncluded: true,
              rootIds: ["deep"],
              traversalIndex: 0
            },
            {
              id: "long",
              parentId: "deep",
              name: "Very Long Checkout Modal Header Layer Name With Nested States And Motion Tokens That Should Truncate Across A Drawer Width With Repeated Variant State Copy For Tooltip Verification",
              type: "RECTANGLE",
              depth: 3,
              childIds: [],
              visible: true,
              locked: false,
              hasChildren: false,
              childrenIncluded: false,
              rootIds: ["deep"],
              traversalIndex: 1
            },
            {
              id: "mixed",
              parentId: "deep",
              name: "Mixed Source Layer",
              type: "RECTANGLE",
              depth: 1,
              childIds: [],
              visible: false,
              locked: true,
              hasChildren: false,
              childrenIncluded: false,
              rootIds: ["deep"],
              traversalIndex: 2
            },
            {
              id: "short",
              parentId: "deep",
              name: "Short Name",
              type: "RECTANGLE",
              depth: 1,
              childIds: [],
              visible: true,
              locked: true,
              hasChildren: false,
              childrenIncluded: false,
              rootIds: ["deep"],
              traversalIndex: 3
            }
          ],
          issues: []
        }
      }
    });
  }, scopeRequestId);
  await page.getByRole("button", { name: "Confirm scope" }).click();
  await page.getByRole("tab", { name: "Inspect workspace" }).click();
  const inspectRequestId = await pluginRequestId(page, "MOTION_INSPECT_REQUEST");
  await page.evaluate(
    ({ requestId, snapshots }) => {
      window.postMessage({
        pluginMessage: {
          type: "MOTION_INSPECT_RESULT",
          requestId,
          result: {
            requestedNodeIds: ["deep", "long", "mixed", "short"],
            snapshots,
            failures: []
          }
        }
      });
    },
    { requestId: inspectRequestId, snapshots: [snapshot("deep"), snapshot("long"), snapshot("mixed", "mixed"), snapshot("short", "none")] }
  );
  await expect(page.getByLabel("Inspector target list")).toBeVisible();
};

test("Inspect panel stays aligned and overflow-free across responsive widths", async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1000, height: 720 },
    { width: 760, height: 700 },
    { width: 760, height: 560 }
  ]) {
    await page.setViewportSize(viewport);
    await loadInspectFixture(page);
    await expect(page.getByRole("radio", { name: "Overview", checked: true })).toBeVisible();
    await expect(page.getByText("Animation tracks")).toHaveCount(0);

    const targetList = page.getByLabel("Inspector target list");
    await expect
      .poll(async () => targetList.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);

    const sourceTrigger = page.getByRole("combobox", { name: "Source" });
    const sourceText = sourceTrigger.locator("span").first();
    const sourceTriggerRect = await sourceTrigger.boundingBox();
    const sourceTextRect = await sourceText.boundingBox();
    expect(sourceTriggerRect).not.toBeNull();
    expect(sourceTextRect).not.toBeNull();
    expect((sourceTextRect?.x ?? 0) - (sourceTriggerRect?.x ?? 0)).toBeLessThan(16);

    const rowsOk = await page.locator(".inspector-target-row").evaluateAll((rows) =>
      rows.every((row) => {
        const rowRect = row.getBoundingClientRect();
        return Array.from(row.querySelectorAll(".inspector-icon-token")).every((icon) => {
          const iconRect = icon.getBoundingClientRect();
          return iconRect.left >= rowRect.left - 1 && iconRect.right <= rowRect.right + 1 && iconRect.top >= rowRect.top - 1 && iconRect.bottom <= rowRect.bottom + 1;
        });
      })
    );
    expect(rowsOk).toBe(true);

    const rowContracts = await page.locator(".inspector-target-row").evaluateAll((rows) =>
      rows.every((row) => {
        const name = row.querySelector<HTMLElement>(".inspector-target-name");
        const indicators = row.querySelector<HTMLElement>(".inspector-target-indicators");
        if (!name || !indicators) return false;
        const nameStyle = window.getComputedStyle(name);
        const indicatorStyle = window.getComputedStyle(indicators);
        return (
          Number.parseFloat(nameStyle.fontSize) <= 12 &&
          Number.parseInt(nameStyle.fontWeight, 10) <= 500 &&
          nameStyle.textAlign === "left" &&
          nameStyle.textOverflow === "ellipsis" &&
          indicatorStyle.flexShrink === "0"
        );
      })
    );
    expect(rowContracts).toBe(true);

    const longNameTruncates = await page.locator(".inspector-target-name").filter({ hasText: "Very Long Checkout" }).evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(longNameTruncates).toBe(true);

    const selectedStyle = await page.locator(".inspector-target-row[data-selected=\"true\"]").evaluate((row) => {
      const rect = row.getBoundingClientRect();
      const style = window.getComputedStyle(row);
      return {
        borderRadius: Number.parseFloat(style.borderTopLeftRadius),
        boxShadow: style.boxShadow,
        width: rect.width
      };
    });
    expect(selectedStyle.borderRadius).toBeGreaterThanOrEqual(4);
    expect(selectedStyle.boxShadow).toBe("none");
    expect(selectedStyle.width).toBeGreaterThan(200);

    const metricContracts = await page.locator(".inspector-metric-card").evaluateAll((cards) =>
      cards.length === 4 &&
      cards.every((card) => {
        const copy = card.querySelector<HTMLElement>(".inspector-metric-copy");
        const label = card.querySelector<HTMLElement>("dt");
        const icon = card.querySelector<HTMLElement>(".ui-tooltip-anchor");
        if (!copy || !label || !icon) return false;
        const copyStyle = window.getComputedStyle(copy);
        const labelRect = label.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        return (
          copyStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
          copyStyle.borderTopWidth === "0px" &&
          Math.abs(iconRect.top - labelRect.top) <= 2
        );
      })
    );
    expect(metricContracts).toBe(true);

    await page.screenshot({ path: testInfo.outputPath(`inspect-${String(viewport.width)}x${String(viewport.height)}.png`), fullPage: true });
  }
});

test("Inspect details use custom viewport-contained tooltips", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 760, height: 560 });
  await loadInspectFixture(page);

  const longName = page.locator(".inspector-target-name").filter({ hasText: "Very Long Checkout" });
  await longName.hover();
  const nameTooltip = page.getByRole("tooltip");
  await expect(nameTooltip).toContainText("Very Long Checkout Modal Header Layer Name");
  const tooltipBox = await nameTooltip.boundingBox();
  const anchorBox = await longName.boundingBox();
  expect(tooltipBox).not.toBeNull();
  expect(anchorBox).not.toBeNull();
  expect((tooltipBox?.x ?? 0)).toBeGreaterThanOrEqual(0);
  expect((tooltipBox?.x ?? 0) + (tooltipBox?.width ?? 0)).toBeLessThanOrEqual(760);
  expect(Math.abs(((tooltipBox?.y ?? 0) + (tooltipBox?.height ?? 0)) - (anchorBox?.y ?? 0))).toBeLessThan(90);

  await page.getByText("Short Name").hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.getByRole("radio", { name: "Details" }).click();
  await page.getByText("Custom").hover();
  await expect(page.getByRole("tooltip")).toContainText("Cubic bezier");
  await expect(page.getByRole("tooltip")).toHaveCount(1);

  await page.getByRole("button", { name: /Mixed Source Layer/ }).click();
  await page.getByText("View 2 read-only details").click();
  await expect(page.getByText("These values come from derived Figma Motion data")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("inspect-tooltip-details.png"), fullPage: true });
});
