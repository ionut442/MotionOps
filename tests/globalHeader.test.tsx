import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { App } from "../src/ui/App";
import { ApplicationStateProvider } from "../src/ui/ApplicationStateProvider";
import {
  useApplicationState,
  useApplicationStateDispatch
} from "../src/ui/applicationStateContext";
import {
  createApplicationStateError,
  type ApplicationState,
  type ApplicationTransitionResult
} from "../src/ui/applicationState";
import { getDocumentStatusPresentation } from "../src/ui/documentStatusPresentation";
import { WORKSPACES } from "../src/ui/workspaces";

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

const renderApp = (initialState?: ApplicationState) => {
  const container = createContainer();
  const root = createRoot(container);
  roots.push(root);

  const probe: {
    state: ApplicationState | null;
    send: ((event: Parameters<ReturnType<typeof useApplicationStateDispatch>>[0]) => ApplicationTransitionResult) | null;
  } = {
    state: null,
    send: null
  };

  const Probe = () => {
    probe.state = useApplicationState();
    probe.send = useApplicationStateDispatch();
    return null;
  };

  act(() => {
    root.render(
      <ApplicationStateProvider initialState={initialState}>
        <Probe />
        <App />
      </ApplicationStateProvider>
    );
  });

  return { container, probe };
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

describe("global header", () => {
  test("renders product identity and initial Scope workspace from centralized model", () => {
    const { container } = renderApp();
    expect(container.querySelector("h1")?.textContent).toBe("MotionOps");
    expect(container.querySelector('[data-testid="header-workspace"]')?.textContent).toContain(
      WORKSPACES[0].label
    );
    expect(WORKSPACES[0].id).toBe("scope");
  });

  test("workspace navigation updates header workspace label", () => {
    const { container } = renderApp();

    for (const workspace of WORKSPACES.slice(1)) {
      const tab = Array.from(container.querySelectorAll('[role="tab"]')).find(
        (candidate) => candidate.textContent === workspace.label
      );
      expect(tab).toBeDefined();
      act(() => {
        tab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(container.querySelector('[data-testid="header-workspace"]')?.textContent).toContain(
        workspace.label
      );
    }
  });

  test("workspace change does not change lifecycle state", () => {
    const { container, probe } = renderApp({ status: "synced" });
    const inspectTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (candidate) => candidate.textContent === "Inspect"
    );

    act(() => {
      inspectTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(probe.state).toEqual({ status: "synced" });
    expect(container.querySelector('[data-testid="header-workspace"]')?.textContent).toContain(
      "Inspect"
    );
  });

  test("lifecycle change does not change workspace", () => {
    const { container, probe } = renderApp({ status: "synced" });
    const reviewTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (candidate) => candidate.textContent === "Review"
    );
    act(() => {
      reviewTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      probe.send?.({ type: "DRAFT_CHANGED", draftId: "draft-1" });
    });

    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Review");
    expect(container.querySelector('[data-testid="header-workspace"]')?.textContent).toContain(
      "Review"
    );
    expect(container.querySelector('[data-testid="document-status"]')?.textContent).toContain(
      "Draft changes"
    );
  });

  test("provider initial-state injection supports status component tests", () => {
    const { container } = renderApp({ status: "draft", draftId: "draft-1" });
    expect(container.querySelector('[data-testid="document-status"]')?.textContent).toContain(
      "Draft changes"
    );
  });

  test("does not render future header feature controls or feature data", () => {
    const { container } = renderApp();
    expect(container.textContent).not.toMatch(/No selection|0 targets|No standard|breadcrumb/i);
    expect(container.querySelector("button[aria-label*='Rescan']")).toBeNull();
    expect(container.querySelector("button[aria-label*='Settings']")).toBeNull();
    expect(container.querySelector('[role="switch"]')).toBeNull();
  });

  test("opens production help and limitations without changing workspace state", () => {
    const { container } = renderApp({ status: "synced" });
    const help = container.querySelector("button[aria-label='Open help and limitations']");
    expect(help).not.toBeNull();

    act(() => {
      help?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Help and limitations");
    expect(container.textContent).toContain("The five workspaces are Scope, Inspect, Edit, Sequence, and Review.");
    expect(container.textContent).toContain("Analytics are disabled in this release candidate.");
    expect(container.textContent).toContain("No playback or playhead control.");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Scope");
    expect(container.querySelector('[data-testid="document-status"]')?.textContent).toContain("Synced");
  });
});

describe("document status presentation", () => {
  const states: ApplicationState[] = [
    { status: "initializing" },
    { status: "synced" },
    { status: "draft", draftId: "draft-1" },
    { status: "applying", operationId: "operation-1", startedFrom: "draft" },
    { status: "stale", reason: "document_changed", previousStatus: "draft" },
    {
      status: "error",
      error: createApplicationStateError("sync_failed", "MotionOps encountered an application error.", {
        recoverable: true,
        stage: "sync"
      }),
      previousStatus: "stale"
    }
  ];

  test("maps every lifecycle state exhaustively", () => {
    expect(states.map((state) => getDocumentStatusPresentation(state).label)).toEqual([
      "Initializing",
      "Synced",
      "Draft changes",
      "Applying",
      "Stale",
      "Error"
    ]);
  });

  test("every status has accessible description and serializable presentation", () => {
    for (const state of states) {
      const presentation = getDocumentStatusPresentation(state);
      expect(presentation.description.length).toBeGreaterThan(0);
      expect(JSON.parse(JSON.stringify(presentation))).toEqual(presentation);
    }
  });

  test("applying exposes busy semantics", () => {
    const { container } = renderApp({
      status: "applying",
      operationId: "operation-1",
      startedFrom: "draft"
    });
    expect(container.querySelector('[data-testid="document-status"]')).toHaveProperty(
      "ariaBusy",
      "true"
    );
  });

  test("status wording avoids unsafe claims and raw data", () => {
    expect(getDocumentStatusPresentation({ status: "synced" }).description).not.toMatch(/cloud/i);
    expect(getDocumentStatusPresentation({ status: "draft", draftId: "draft-1" }).description).not.toMatch(
      /already changed/i
    );
    expect(
      getDocumentStatusPresentation({
        status: "stale",
        reason: "operation_baseline_changed",
        previousStatus: "applying"
      }).supportText
    ).not.toMatch(/fingerprint|guard|diff/i);

    const { container } = renderApp({
      status: "applying",
      operationId: "operation-raw-secret",
      startedFrom: "draft"
    });
    expect(container.textContent).not.toContain("operation-raw-secret");
    expect(container.textContent).not.toMatch(/manualKeyframeTracks|animationStyles|fingerprint/i);
  });

  test("error status exposes only safe lifecycle summary", () => {
    const { container } = renderApp({
      status: "error",
      error: createApplicationStateError("apply_failed", "Safe lifecycle summary.", {
        recoverable: false,
        stage: "apply"
      }),
      previousStatus: "draft"
    });
    expect(container.querySelector('[data-testid="document-status"]')?.textContent).toContain(
      "Safe lifecycle summary."
    );
    expect(container.querySelector('[data-testid="document-status"]')?.textContent).not.toMatch(
      /stack|at Object|layer|page|manualKeyframeTracks/i
    );
  });

  test("status is not conveyed by color alone", () => {
    const { container } = renderApp({ status: "stale", reason: "unknown", previousStatus: "synced" });
    const status = container.querySelector('[data-testid="document-status"]');
    expect(status?.textContent).toContain("Stale");
    expect(status?.querySelector(".document-status-marker")).not.toBeNull();
    expect(status?.getAttribute("aria-label")).toBe("Document status: Stale");
  });
});
