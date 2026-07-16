import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { App } from "../src/ui/App";
import { ApplicationStateProvider } from "../src/ui/ApplicationStateProvider";
import {
  useApplicationState,
  useApplicationStateDispatch
} from "../src/ui/applicationStateContext";
import type { ApplicationState, ApplicationTransitionResult } from "../src/ui/applicationState";
import { ContextDrawerShell } from "../src/ui/components/ContextDrawerShell";
import {
  getContextDrawerModePresentation,
  isContextDrawerMode,
  type ContextDrawerMode
} from "../src/ui/contextDrawerMode";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const createContainer = () => {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  return container;
};

const render = (node: React.ReactNode) => {
  const container = createContainer();
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(node);
  });
  return { container, root };
};

const renderDrawer = ({
  open = true,
  mode = "context",
  description,
  footer,
  onClose = vi.fn()
}: {
  open?: boolean;
  mode?: ContextDrawerMode;
  description?: string;
  footer?: React.ReactNode;
  onClose?: () => void;
} = {}) =>
  render(
    <ContextDrawerShell
      description={description}
      footer={footer}
      mode={mode}
      onClose={onClose}
      open={open}
      title="Neutral drawer title"
    >
      <button type="button">Focusable supplied content</button>
      <p>Supplied neutral drawer content.</p>
    </ContextDrawerShell>
  );

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  for (const container of containers.splice(0)) {
    container.remove();
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("context drawer shell", () => {
  test("component exists and closed state is not visible or keyboard reachable", () => {
    const { container } = renderDrawer({ open: false });

    expect(container.querySelector(".context-drawer-shell")).toBeNull();
    expect(container.textContent).not.toContain("Neutral drawer title");
    expect(container.querySelector("button")).toBeNull();
  });

  test("open drawer renders title, supplied content, close control, and scroll container", () => {
    const { container } = renderDrawer();

    const drawer = container.querySelector(".context-drawer-shell");
    expect(drawer).not.toBeNull();
    expect(drawer?.getAttribute("role")).toBe("complementary");
    expect(container.querySelector(".context-drawer-title")?.textContent).toBe("Neutral drawer title");
    expect(container.textContent).toContain("Supplied neutral drawer content.");
    expect(container.querySelector('[data-testid="context-drawer-scroll"]')).not.toBeNull();
    expect(container.querySelector(".context-drawer-close")?.getAttribute("aria-label")).toBe(
      "Close context drawer"
    );
  });

  test("optional description and footer render only when supplied", () => {
    const withOptional = renderDrawer({
      description: "Short drawer description.",
      footer: <button type="button">Footer action</button>
    }).container;
    expect(withOptional.textContent).toContain("Short drawer description.");
    expect(withOptional.textContent).toContain("Footer action");

    const withoutOptional = renderDrawer().container;
    expect(withoutOptional.textContent).not.toContain("Short drawer description.");
    expect(withoutOptional.querySelector(".context-drawer-footer")).toBeNull();
  });

  test("close button and Escape request close exactly once, unrelated keys do not", () => {
    const clickClose = vi.fn();
    const clickContainer = renderDrawer({ onClose: clickClose }).container;
    act(() => {
      clickContainer.querySelector<HTMLButtonElement>(".context-drawer-close")?.click();
    });
    expect(clickClose).toHaveBeenCalledTimes(1);

    const escapeClose = vi.fn();
    renderDrawer({ onClose: escapeClose });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(escapeClose).toHaveBeenCalledTimes(0);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(escapeClose).toHaveBeenCalledTimes(1);
  });

  test("repeated renders do not request close or open automatically", () => {
    const onClose = vi.fn();
    const { root } = renderDrawer({ onClose, open: false });

    act(() => {
      root.render(
        <ContextDrawerShell mode="context" onClose={onClose} open={false} title="Hidden">
          Hidden content
        </ContextDrawerShell>
      );
    });

    expect(onClose).toHaveBeenCalledTimes(0);
    expect(document.body.textContent).not.toContain("Hidden content");
  });

  test("context and change-preview modes are deterministic, exhaustive, serializable, and guarded", () => {
    const modes: ContextDrawerMode[] = ["context", "change-preview"];
    const first = modes.map((mode) => [mode, getContextDrawerModePresentation(mode)]);
    const second = modes.map((mode) => [mode, getContextDrawerModePresentation(mode)]);

    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first).toEqual([
      ["context", { accessibleLabel: "Context drawer", tone: "neutral" }],
      ["change-preview", { accessibleLabel: "Change preview drawer", tone: "preview" }]
    ]);
    expect(isContextDrawerMode("context")).toBe(true);
    expect(isContextDrawerMode("change-preview")).toBe(true);
    expect(isContextDrawerMode("operation-preview")).toBe(false);
  });

  test("change-preview mode changes only shell semantics and adds no apply workflow", () => {
    const { container } = renderDrawer({ mode: "change-preview" });

    expect(container.querySelector(".context-drawer-shell")?.getAttribute("data-tone")).toBe("preview");
    expect(container.querySelector(".context-drawer-mode")?.textContent).toBe("Change preview drawer");
    expect(container.textContent).not.toMatch(/Apply|Reset|change plan|target count|track count|warning count/i);
  });

  test("two isolated drawer instances do not share close state", () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const { container } = render(
      <div>
        <ContextDrawerShell mode="context" onClose={firstClose} open={true} title="First drawer">
          First content
        </ContextDrawerShell>
        <ContextDrawerShell mode="change-preview" onClose={secondClose} open={true} title="Second drawer">
          Second content
        </ContextDrawerShell>
      </div>
    );

    const closeButtons = container.querySelectorAll<HTMLButtonElement>(".context-drawer-close");
    expect(closeButtons).toHaveLength(2);
    act(() => {
      closeButtons[0].click();
    });

    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondClose).toHaveBeenCalledTimes(0);
    expect(container.textContent).toContain("Second drawer");
  });
});

describe("application shell drawer integration", () => {
  test("production app renders no empty drawer, placeholders, or future feature controls by default", () => {
    const { container } = render(
      <ApplicationStateProvider>
        <App />
      </ApplicationStateProvider>
    );

    expect(container.querySelector(".shell-context")).toBeNull();
    expect(container.querySelector(".context-drawer-shell")).toBeNull();
    for (const blockedText of [
      "Context region",
      "Coming soon",
      "Apply",
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
      "sequencer"
    ]) {
      expect(container.textContent).not.toContain(blockedText);
    }
  });

  test("main workspace, global header, navigation, and resize remain rendered with drawer open", () => {
    const { container } = render(
      <ApplicationStateProvider>
        <App
          contextDrawer={
            <ContextDrawerShell mode="context" onClose={vi.fn()} open={true} title="Harness drawer">
              Harness drawer content
            </ContextDrawerShell>
          }
        />
      </ApplicationStateProvider>
    );

    expect(container.querySelector(".global-header")?.textContent).toContain("MotionOps");
    expect(container.querySelector("nav")).not.toBeNull();
    expect(container.querySelector("main")?.textContent).toContain("Scope");
    expect(container.querySelector(".resize-handle")).not.toBeNull();
    expect(container.querySelector(".context-drawer-shell")?.textContent).toContain("Harness drawer");
  });

  test("workspace navigation does not open the drawer or mutate lifecycle state", () => {
    const record: { state: ApplicationState | null } = { state: null };
    const Probe = () => {
      record.state = useApplicationState();
      return null;
    };
    const { container } = render(
      <ApplicationStateProvider>
        <Probe />
        <App />
      </ApplicationStateProvider>
    );

    const inspectTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === "Inspect"
    );
    act(() => {
      inspectTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(record.state).toEqual({ status: "initializing" });
    expect(container.querySelector(".context-drawer-shell")).toBeNull();
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain("Inspect");
  });

  test("lifecycle transitions do not open the drawer or switch workspace", () => {
    const record: {
      send: ((event: Parameters<ReturnType<typeof useApplicationStateDispatch>>[0]) => ApplicationTransitionResult) | null;
    } = { send: null };
    const Probe = () => {
      record.send = useApplicationStateDispatch();
      return null;
    };
    const { container } = render(
      <ApplicationStateProvider>
        <Probe />
        <App />
      </ApplicationStateProvider>
    );

    act(() => {
      record.send?.({ type: "INITIALIZATION_SUCCEEDED" });
    });

    expect(container.querySelector(".context-drawer-shell")).toBeNull();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Scope");
  });

  test("opening drawer does not switch workspace or dispatch lifecycle events", () => {
    const record: { state: ApplicationState | null } = { state: null };
    const Probe = () => {
      record.state = useApplicationState();
      return null;
    };
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <ApplicationStateProvider>
          <Probe />
          <button
            onClick={() => {
              setOpen(true);
            }}
            type="button"
          >
            Open test drawer
          </button>
          <App
            contextDrawer={
              open ? (
                <ContextDrawerShell
                  mode="context"
                  onClose={() => {
                    setOpen(false);
                  }}
                  open={open}
                  title="Opened drawer"
                >
                  Open content
                </ContextDrawerShell>
              ) : null
            }
          />
        </ApplicationStateProvider>
      );
    };
    const { container } = render(<Harness />);

    const inspectTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === "Inspect"
    );
    act(() => {
      inspectTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });

    expect(record.state).toEqual({ status: "initializing" });
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Inspect");
    expect(container.querySelector(".context-drawer-shell")?.textContent).toContain("Opened drawer");
  });

  test("drawer shell adds no Figma global access, plugin message, storage, analytics, or network work", () => {
    const postMessages: unknown[] = [];
    const nativePostMessage = window.postMessage.bind(window);
    window.postMessage = ((message: unknown, targetOrigin: string, transfer?: Transferable[]) => {
      postMessages.push(message);
      nativePostMessage(message, targetOrigin, transfer ?? []);
    }) as typeof window.postMessage;

    const storageCalls: string[] = [];
    const nativeSetItemDescriptor = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem");
    Storage.prototype.setItem = function setItem(key: string, value: string): void {
      storageCalls.push(`${key}:${value}`);
    };

    const fetchSpy = vi.spyOn(window, "fetch");
    Object.defineProperty(window, "figma", {
      configurable: true,
      get() {
        throw new Error("UI accessed Figma global");
      }
    });

    try {
      render(
        <ApplicationStateProvider>
          <App contextDrawer={<ContextDrawerShell mode="context" onClose={vi.fn()} open={true} title="Safe drawer">Safe content</ContextDrawerShell>} />
        </ApplicationStateProvider>
      );

      expect(
        postMessages.every(
          (message) =>
            typeof message === "object" &&
            message !== null &&
            "pluginMessage" in message &&
            (message as { pluginMessage?: { type?: string } }).pluginMessage?.type ===
              "SCOPE_SCAN_REQUEST"
        )
      ).toBe(true);
      expect(storageCalls).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      window.postMessage = nativePostMessage;
      if (nativeSetItemDescriptor !== undefined) {
        Object.defineProperty(Storage.prototype, "setItem", nativeSetItemDescriptor);
      }
      Reflect.deleteProperty(window, "figma");
    }
  });
});
