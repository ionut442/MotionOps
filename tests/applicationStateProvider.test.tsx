import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { ApplicationStateProvider } from "../src/ui/ApplicationStateProvider";
import {
  useApplicationState,
  useApplicationStateDispatch
} from "../src/ui/applicationStateContext";
import {
  createApplicationStateError,
  type ApplicationEvent,
  type ApplicationState,
  type ApplicationTransitionResult
} from "../src/ui/applicationState";
import { App } from "../src/ui/App";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

interface HarnessRecord {
  state: ApplicationState | null;
  send: ((event: ApplicationEvent) => ApplicationTransitionResult) | null;
  invalidResult: ApplicationTransitionResult | null;
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

const renderWithProvider = (
  record: HarnessRecord,
  initialState?: ApplicationState,
  onReady?: (send: (event: ApplicationEvent) => ApplicationTransitionResult) => void
) => {
  const Harness = () => {
    const state = useApplicationState();
    const send = useApplicationStateDispatch();
    record.state = state;
    record.send = send;

    useEffect(() => {
      onReady?.(send);
    }, [send]);

    return <div data-status={state.status}>status:{state.status}</div>;
  };

  const container = createContainer();
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <ApplicationStateProvider initialState={initialState}>
        <Harness />
      </ApplicationStateProvider>
    );
  });
  return container;
};

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
});

describe("ApplicationStateProvider", () => {
  test("exposes deterministic initial state", () => {
    const record: HarnessRecord = { state: null, send: null, invalidResult: null };
    const container = renderWithProvider(record);

    expect(record.state).toEqual({ status: "initializing" });
    expect(container.textContent).toBe("status:initializing");
  });

  test("accepts injected initial state in tests", () => {
    const record: HarnessRecord = { state: null, send: null, invalidResult: null };
    renderWithProvider(record, { status: "draft", draftId: "draft-1" });

    expect(record.state).toEqual({ status: "draft", draftId: "draft-1" });
  });

  test("applies valid events", () => {
    const record: HarnessRecord = { state: null, send: null, invalidResult: null };
    renderWithProvider(record);

    act(() => {
      const result = record.send?.({ type: "INITIALIZATION_SUCCEEDED" });
      expect(result).toEqual({ ok: true, state: { status: "synced" } });
    });

    expect(record.state).toEqual({ status: "synced" });
  });

  test("exposes invalid transition result safely", () => {
    const record: HarnessRecord = { state: null, send: null, invalidResult: null };
    renderWithProvider(record, { status: "synced" });

    act(() => {
      record.invalidResult = record.send?.({ type: "APPLY_SUCCEEDED" }) ?? null;
    });

    expect(record.invalidResult).toEqual({
      ok: false,
      state: { status: "synced" },
      error: {
        code: "invalid_application_transition",
        currentStatus: "synced",
        eventType: "APPLY_SUCCEEDED",
        summary: "Cannot apply APPLY_SUCCEEDED while application is synced."
      }
    });
    expect(record.state).toEqual({ status: "synced" });
  });

  test("two provider instances do not share mutable state", () => {
    const first: HarnessRecord = { state: null, send: null, invalidResult: null };
    const second: HarnessRecord = { state: null, send: null, invalidResult: null };
    renderWithProvider(first);
    renderWithProvider(second, { status: "draft", draftId: "draft-2" });

    act(() => {
      first.send?.({ type: "INITIALIZATION_SUCCEEDED" });
    });

    expect(first.state).toEqual({ status: "synced" });
    expect(second.state).toEqual({ status: "draft", draftId: "draft-2" });
  });

  test("provider renders outside Figma without automatic messaging or storage", () => {
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

    try {
      const record: HarnessRecord = { state: null, send: null, invalidResult: null };
      renderWithProvider(record);
      expect(record.state).toEqual({ status: "initializing" });
      expect(postMessages).toEqual([]);
      expect(storageCalls).toEqual([]);
    } finally {
      window.postMessage = nativePostMessage;
      if (nativeSetItemDescriptor !== undefined) {
        Object.defineProperty(Storage.prototype, "setItem", nativeSetItemDescriptor);
      }
    }
  });

  test("navigation switching does not alter lifecycle state", () => {
    const record: HarnessRecord = { state: null, send: null, invalidResult: null };
    const container = createContainer();
    const root = createRoot(container);
    roots.push(root);

    const Probe = () => {
      const state = useApplicationState();
      record.state = state;
      return null;
    };

    act(() => {
      root.render(
        <ApplicationStateProvider>
          <Probe />
          <App />
        </ApplicationStateProvider>
      );
    });

    const inspectTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Inspect"
    );
    expect(inspectTab).toBeDefined();

    act(() => {
      inspectTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(record.state).toEqual({ status: "initializing" });
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain("Inspect");
  });

  test("lifecycle transitions do not switch workspace", () => {
    const record: HarnessRecord = { state: null, send: null, invalidResult: null };
    const syncError = createApplicationStateError("sync_failed", "Synchronization failed.", {
      recoverable: true,
      stage: "sync"
    });

    const container = createContainer();
    const root = createRoot(container);
    roots.push(root);

    const Probe = () => {
      const state = useApplicationState();
      const send = useApplicationStateDispatch();
      record.state = state;
      record.send = send;
      return null;
    };

    act(() => {
      root.render(
        <ApplicationStateProvider initialState={{ status: "stale", reason: "unknown", previousStatus: "synced" }}>
          <Probe />
          <App />
        </ApplicationStateProvider>
      );
    });

    act(() => {
      record.send?.({ type: "SYNC_FAILED", error: syncError });
    });

    expect(record.state?.status).toBe("error");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Scope");
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain("Scope");
  });
});
