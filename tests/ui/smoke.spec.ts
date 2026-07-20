import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __motionOpsMessages?: unknown[];
    __motionOpsNetworkCalls?: string[];
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

const captureRuntimeBoundaries = async (page: Page) => {
  await capturePluginMessages(page);
  await page.addInitScript(() => {
    window.__motionOpsNetworkCalls = [];
    Object.defineProperty(window, "figma", {
      configurable: true,
      get() {
        throw new Error("UI accessed Figma global");
      }
    });

    const nativeFetch = window.fetch.bind(window);
    const replacementFetch: typeof window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      window.__motionOpsNetworkCalls?.push(requestUrl);
      return nativeFetch(input, init);
    };
    window.fetch = replacementFetch;
  });
};

const expectOnlyActiveWorkspace = async (page: Page, label: string) => {
  const activeTab = page
    .getByRole("tablist", { name: "Workspace navigation" })
    .getByRole("tab", { selected: true });
  await expect(activeTab).toHaveText(label);
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName(`${label} workspace`);
  await expect(page.getByRole("heading", { level: 2, name: label })).toBeVisible();
};

test("MotionOps production shell renders deterministic workspace navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 760 });
  await page.goto("/");

  await expect(page.getByRole("banner", { name: "MotionOps header" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "MotionOps" })).toBeVisible();
  await expect(page.getByLabel("Active workspace")).toContainText("Scope");
  await expect(page.getByLabel("Document status: Initializing")).toBeVisible();
  await expect(page.getByTestId("document-status")).toContainText("Preparing the MotionOps interface.");
  await expect(page.getByRole("navigation", { name: "Workspace navigation region" })).toBeVisible();
  await expect(page.getByRole("main", { name: "MotionOps workspace" })).toBeVisible();
  await expect(page.locator(".context-drawer-shell")).toHaveCount(0);
  await expect(page.getByRole("contentinfo", { name: "MotionOps footer" })).toHaveCount(0);
  await expect(page.getByTestId("resize-handle")).toHaveAccessibleName("Resize plugin window");
  await expect(page.getByRole("tablist", { name: "Workspace navigation" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(5);
  await expect(page.getByRole("tab", { name: "Scope workspace" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Inspect workspace" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Edit workspace" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sequence workspace" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Review workspace" })).toBeVisible();
  await expectOnlyActiveWorkspace(page, "Scope");
  await expect(page.getByRole("heading", { level: 2, name: "Inspect" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel scan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm scope" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply|Motion|Timeline/i })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Target order" })).toBeVisible();
  await expect(page.getByText("Selection sync")).toHaveCount(0);
  await expect(page.getByText(/keyframe|easing|track|animation style|handoff/i)).toHaveCount(0);
  for (const blockedText of [
    "Context region",
    "Coming soon",
    "0 targets",
    "No standard",
    "Settings",
    "INITIALIZATION_",
    "change plan",
    "target count",
    "track count",
    "warning count",
    "skipped target",
    "compatibility preview",
    "Scope controls",
    "Inspector details",
    "QA details",
    "standards details",
    "sequencer property"
  ]) {
    await expect(page.getByText(blockedText)).toHaveCount(0);
  }
});

test("MotionOps shell handles plugin messages outside Figma without crashing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toContainText("Initializing");

  await page.evaluate(() => {
    window.postMessage({
      pluginMessage: {
        type: "PLUGIN_READY",
        pluginVersion: "0.0.0",
        figmaMode: "default",
        apiLabEnabled: false
      }
    });
  });

  await expect(page.getByTestId("document-status")).toContainText("Synced");
  await expect(page.getByTestId("connection-state")).toHaveCount(0);
  await expect(page.getByTestId("last-message")).toHaveCount(0);
});

test("MotionOps shell emits typed resize requests while dragging", async ({ page }) => {
  await capturePluginMessages(page);
  await page.setViewportSize({ width: 1080, height: 760 });
  await page.goto("/");

  const handle = page.getByTestId("resize-handle");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move((box?.x ?? 0) + 12, (box?.y ?? 0) + 12);
  await page.mouse.down();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-resizing", "true");
  await page.mouse.move((box?.x ?? 0) - 500, (box?.y ?? 0) - 300);
  await page.waitForTimeout(50);
  await page.mouse.up();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-resizing", "false");

  const messages = await page.evaluate(() => window.__motionOpsMessages ?? []);
  const resizeMessage = messages
    .map((entry) =>
      typeof entry === "object" && entry !== null && "pluginMessage" in entry
        ? (entry as { pluginMessage?: unknown }).pluginMessage
        : null
    )
    .find(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "type" in entry &&
        (entry as { type?: string }).type === "RESIZE_PLUGIN_WINDOW"
    );

  expect(resizeMessage).toMatchObject({
    type: "RESIZE_PLUGIN_WINDOW",
    payload: { width: 760, height: 560 }
  });
  await expect(page.getByTestId("last-request")).toHaveCount(0);
});

test("workspace navigation switches by click without plugin or network work", async ({ page }) => {
  await captureRuntimeBoundaries(page);
  await page.setViewportSize({ width: 1080, height: 760 });
  await page.goto("/");

  for (const label of ["Inspect", "Edit", "Sequence", "Review"]) {
    await page.getByRole("tab", { name: `${label} workspace` }).click();
    await expectOnlyActiveWorkspace(page, label);
    await expect(page.getByLabel("Active workspace")).toContainText(label);
  }

  await expect(page.getByRole("tablist", { name: "Workspace navigation" }).getByRole("tab", { selected: true })).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("tab", { name: "Scope workspace" })).toHaveAttribute("tabindex", "-1");

  const unexpectedMessages = await page.evaluate(() =>
    (window.__motionOpsMessages ?? []).filter((entry) => {
      const pluginMessage =
        typeof entry === "object" && entry !== null && "pluginMessage" in entry
          ? (entry as { pluginMessage?: { type?: string } }).pluginMessage
          : undefined;
      if (pluginMessage?.type === "SCOPE_SCAN_REQUEST") return false;
      if (
        pluginMessage?.type === "STANDARDS_STORAGE_REQUEST" &&
        "action" in pluginMessage &&
        typeof pluginMessage.action === "object" &&
        pluginMessage.action !== null &&
        "kind" in pluginMessage.action &&
        pluginMessage.action.kind === "list-personal"
      ) {
        return false;
      }
      return true;
    })
  );
  expect(unexpectedMessages).toEqual([]);
  expect(await page.evaluate(() => window.__motionOpsNetworkCalls ?? [])).toEqual([]);
});

test("Inspect workspace renders when plugin storage access is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    const blockedStorage = {
      getItem() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
      setItem() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
      removeItem() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
      clear() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
      key() {
        return null;
      },
      get length() {
        return 0;
      }
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: blockedStorage
    });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Inspect workspace" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Inspect" })).toBeVisible();
  await expect(page.getByText("Define or confirm a Scope before opening Inspect.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Debug" })).toHaveCount(0);
});

test("workspace navigation follows horizontal tab keyboard policy", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 760 });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Open help and limitations" })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("tab", { name: "Scope workspace" })).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Inspect workspace" })).toBeFocused();
  await expectOnlyActiveWorkspace(page, "Inspect");

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Scope workspace" })).toBeFocused();
  await expectOnlyActiveWorkspace(page, "Scope");

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Review workspace" })).toBeFocused();
  await expectOnlyActiveWorkspace(page, "Review");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Scope workspace" })).toBeFocused();
  await expectOnlyActiveWorkspace(page, "Scope");

  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Review workspace" })).toBeFocused();
  await expectOnlyActiveWorkspace(page, "Review");

  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "Scope workspace" })).toBeFocused();
  await expectOnlyActiveWorkspace(page, "Scope");

  await page.keyboard.press("ArrowRight");
  await expectOnlyActiveWorkspace(page, "Inspect");
  await page.keyboard.press("Enter");
  await expectOnlyActiveWorkspace(page, "Inspect");
  await page.keyboard.press(" ");
  await expectOnlyActiveWorkspace(page, "Inspect");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel")).toBeFocused();
});

test("workspace active and focus states are visible without color alone", async ({ page }) => {
  await page.goto("/");
  const scopeTab = page.getByRole("tab", { name: "Scope workspace" });
  await scopeTab.focus();

  const styles = await scopeTab.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    const labelElement = element.querySelector("span");
    if (labelElement === null) {
      throw new Error("Active workspace tab label is missing.");
    }
    const label = window.getComputedStyle(labelElement);
    return {
      backgroundColor: computed.backgroundColor,
      outlineStyle: computed.outlineStyle,
      textDecorationLine: label.textDecorationLine
    };
  });

  expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(styles.outlineStyle).not.toBe("none");
  expect(styles.textDecorationLine).toBe("none");
});

test("MotionOps shell stays usable at supported dimensions", async ({ page }) => {
  for (const size of [
    { width: 1080, height: 760, density: "wide" },
    { width: 820, height: 620, density: "narrow" },
    { width: 760, height: 560, density: "narrow" }
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");

    await expect(page.locator(".app-shell")).toHaveAttribute("data-density", size.density);
    await expect(page.getByRole("main", { name: "MotionOps workspace" })).toBeVisible();
    await expect(page.locator(".context-drawer-shell")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(5);
    await expect(page.getByRole("tab", { name: "Scope workspace" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Inspect workspace" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Edit workspace" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Sequence workspace" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Review workspace" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "MotionOps" })).toBeVisible();
    await expect(page.getByLabel("Active workspace")).toContainText("Scope");
    await expect(page.getByLabel("Document status: Initializing")).toBeVisible();

    const layout = await page.evaluate(() => {
      const nav = document.querySelector(".shell-nav")?.getBoundingClientRect();
      const main = document.querySelector(".shell-main")?.getBoundingClientRect();
      const drawer = document.querySelector(".context-drawer-shell")?.getBoundingClientRect();
      const headerIdentity = document.querySelector(".global-header-identity")?.getBoundingClientRect();
      const headerWorkspace = document.querySelector(".global-header-workspace")?.getBoundingClientRect();
      const headerStatus = document.querySelector(".document-status")?.getBoundingClientRect();
      const handle = document.querySelector(".resize-handle")?.getBoundingClientRect();
      return {
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
        drawerVisible: Boolean(drawer && drawer.width > 0 && drawer.height > 0),
        handleVisible: Boolean(handle && handle.width > 0 && handle.height > 0),
        headerContentVisible: Boolean(
          headerIdentity &&
            headerIdentity.width > 0 &&
            headerWorkspace &&
            headerWorkspace.width > 0 &&
            headerStatus &&
            headerStatus.width > 0
        ),
        mainOverlapsNav: Boolean(nav && main && main.left < nav.right && main.top < nav.bottom),
        shellHeight: document.querySelector(".app-shell")?.clientHeight,
        viewportHeight: window.innerHeight
      };
    });

    expect(layout.bodyOverflow).toBe(0);
    expect(layout.drawerVisible).toBe(false);
    expect(layout.headerContentVisible).toBe(true);
    expect(layout.mainOverlapsNav).toBe(false);
    expect(layout.handleVisible).toBe(true);
    expect(layout.shellHeight).toBe(layout.viewportHeight);
  }
});

test("MotionOps shell renders outside Figma without runtime errors", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) {
      runtimeErrors.push(message.text());
    }
  });

  await page.setViewportSize({ width: 760, height: 560 });
  await page.goto("/");

  await expect(page.getByRole("tab", { selected: true })).toHaveText("Scope");
  expect(runtimeErrors).toEqual([]);
});
