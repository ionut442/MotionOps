import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  isPluginToUiMessage,
  type PluginToUiMessage,
  type UiToPluginMessage
} from "../shared/messages";
import {
  createResizePluginWindowRequest,
  DEFAULT_PLUGIN_WINDOW_SIZE,
  normalizePluginWindowSize,
  type PluginWindowSize
} from "../shared/pluginWindow";
import {
  getWorkspaceById,
  getWorkspaceIndex,
  getWorkspacePanelId,
  getWorkspaceTabId,
  INITIAL_WORKSPACE_ID,
  WORKSPACES,
  type WorkspaceId
} from "./workspaces";
import { GlobalHeader } from "./components/GlobalHeader";
import { ScopeWorkspace } from "./ScopeWorkspace";
import { InspectWorkspace } from "./InspectWorkspace";
import { EditWorkspace } from "./EditWorkspace";
import { SequenceWorkspace } from "./SequenceWorkspace";
import { ReviewWorkspace } from "./ReviewWorkspace";
import { HelpDrawer } from "./components/HelpDrawer";
import { Icon, type IconName } from "./components/Icon";
import type { ScopeScanResult } from "../domain/scopeScan";
import { useApplicationStateDispatch } from "./applicationStateContext";

type ShellDensity = "wide" | "narrow";

interface WorkspacePresentation {
  readonly icon: IconName;
  readonly navDescription: string;
  readonly title: string;
  readonly description: string;
}

const WORKSPACE_PRESENTATION: Record<WorkspaceId, WorkspacePresentation> = {
  scope: {
    icon: "layers",
    navDescription: "Choose layers",
    title: "Choose what to work on",
    description: "Start with the current Figma selection, then refine it only when you need more control."
  },
  inspect: {
    icon: "inspect",
    navDescription: "Understand motion",
    title: "Understand the motion",
    description: "See what is animated, how it behaves, and where Motion needs attention."
  },
  edit: {
    icon: "edit",
    navDescription: "Tune & reuse",
    title: "Adjust motion with confidence",
    description: "Tune timing and easing, copy Motion, or create a stagger before previewing changes."
  },
  sequence: {
    icon: "sequence",
    navDescription: "Arrange timing",
    title: "Build the sequence",
    description: "Align, offset, distribute, and stagger animated layers on one compact timeline."
  },
  review: {
    icon: "review",
    navDescription: "QA & handoff",
    title: "Validate and hand off",
    description: "Run Motion QA, resolve warnings, and export a clear implementation-ready report."
  }
};

const createRequestId = (): string =>
  `req-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;

const sendToPlugin = (message: UiToPluginMessage): void => {
  parent.postMessage({ pluginMessage: message }, "*");
};

const classifyShellDensity = (width: number): ShellDensity =>
  width < 920 ? "narrow" : "wide";

const initialWindowSize = (): PluginWindowSize => ({
  width: window.innerWidth > 0 ? window.innerWidth : DEFAULT_PLUGIN_WINDOW_SIZE.width,
  height: window.innerHeight > 0 ? window.innerHeight : DEFAULT_PLUGIN_WINDOW_SIZE.height
});

const focusWorkspaceTab = (id: WorkspaceId) => {
  requestAnimationFrame(() => {
    document.getElementById(getWorkspaceTabId(id))?.focus();
  });
};

const WorkspaceNavigation = ({
  activeWorkspace,
  onWorkspaceChange
}: {
  activeWorkspace: WorkspaceId;
  onWorkspaceChange: (workspace: WorkspaceId) => void;
}) => {
  const activateWorkspace = (id: WorkspaceId) => {
    onWorkspaceChange(id);
    focusWorkspaceTab(id);
  };

  const activateWorkspaceByIndex = (index: number) => {
    const normalizedIndex = (index + WORKSPACES.length) % WORKSPACES.length;
    activateWorkspace(WORKSPACES[normalizedIndex].id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: WorkspaceId) => {
    const currentIndex = getWorkspaceIndex(id);
    if (currentIndex < 0) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        activateWorkspaceByIndex((currentIndex + 1) % WORKSPACES.length);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        activateWorkspaceByIndex(currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        activateWorkspaceByIndex(0);
        break;
      case "End":
        event.preventDefault();
        activateWorkspaceByIndex(WORKSPACES.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        activateWorkspace(id);
        break;
    }
  };

  return (
    <div aria-label="Motion workflow" aria-orientation="vertical" className="workspace-tabs" role="tablist">
      {WORKSPACES.map((workspace, index) => {
        const isActive = workspace.id === activeWorkspace;
        const presentation = WORKSPACE_PRESENTATION[workspace.id];
        return (
          <button
            aria-controls={getWorkspacePanelId(workspace.id)}
            aria-label={workspace.accessibleLabel}
            aria-selected={isActive}
            className="workspace-tab"
            data-active={isActive}
            id={getWorkspaceTabId(workspace.id)}
            key={workspace.id}
            onClick={() => {
              activateWorkspace(workspace.id);
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, workspace.id);
            }}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            <span className="workspace-tab-icon">
              <Icon name={presentation.icon} size={15} />
            </span>
            <span className="workspace-tab-copy">
              <span className="workspace-tab-title">{workspace.label}</span>
              <span className="workspace-tab-description">{presentation.navDescription}</span>
            </span>
            <span aria-hidden="true" className="workspace-tab-step">
              {String(index + 1).padStart(2, "0")}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const WorkspaceStageHeader = ({
  activeWorkspace,
  onWorkspaceChange
}: {
  readonly activeWorkspace: WorkspaceId;
  readonly onWorkspaceChange: (workspace: WorkspaceId) => void;
}) => {
  const index = getWorkspaceIndex(activeWorkspace);
  const presentation = WORKSPACE_PRESENTATION[activeWorkspace];
  const previous = index > 0 ? WORKSPACES[index - 1] : null;
  const next = index < WORKSPACES.length - 1 ? WORKSPACES[index + 1] : null;

  return (
    <header className="workspace-stage-header">
      <span className="workspace-stage-icon">
        <Icon name={presentation.icon} size={17} />
      </span>
      <span className="workspace-stage-copy">
        <span className="workspace-stage-kicker">Step {String(index + 1)} of {String(WORKSPACES.length)}</span>
        <h2 className="workspace-stage-title">{presentation.title}</h2>
        <span className="workspace-stage-description">{presentation.description}</span>
      </span>
      <span className="workspace-stage-actions">
        <button
          aria-label={previous === null ? "No previous step" : `Go back to ${previous.label}`}
          className="stage-nav-button"
          disabled={previous === null}
          onClick={() => {
            if (previous !== null) {
              onWorkspaceChange(previous.id);
            }
          }}
          title={previous === null ? undefined : `Back to ${previous.label}`}
          type="button"
        >
          <Icon name="chevron-left" size={15} />
        </button>
        <button
          aria-label={next === null ? "No next step" : `Continue to ${next.label}`}
          className="stage-nav-button"
          disabled={next === null}
          onClick={() => {
            if (next !== null) {
              onWorkspaceChange(next.id);
            }
          }}
          title={next === null ? undefined : `Continue to ${next.label}`}
          type="button"
        >
          <Icon name="chevron-right" size={15} />
        </button>
      </span>
    </header>
  );
};

const WorkspacePanel = ({
  activeWorkspace,
  lastMessage,
  activeScope,
  onActiveScopeChange,
  onContextDrawerChange
}: {
  activeWorkspace: WorkspaceId;
  lastMessage: PluginToUiMessage | null;
  activeScope: ScopeScanResult | null;
  onActiveScopeChange: (result: ScopeScanResult | null) => void;
  onContextDrawerChange: (drawer: ReactNode | null) => void;
}) => {
  const workspace = getWorkspaceById(activeWorkspace);

  if (workspace.id === "scope") {
    return (
      <section
        aria-labelledby={getWorkspaceTabId(workspace.id)}
        className="workspace-panel"
        id={getWorkspacePanelId(workspace.id)}
        role="tabpanel"
        tabIndex={0}
      >
        <ScopeWorkspace
          createRequestId={createRequestId}
          lastMessage={lastMessage}
          onConfirmedScopeChange={onActiveScopeChange}
          sendToPlugin={sendToPlugin}
        />
      </section>
    );
  }

  if (workspace.id === "inspect") {
    return (
      <section
        aria-labelledby={getWorkspaceTabId(workspace.id)}
        className="workspace-panel"
        id={getWorkspacePanelId(workspace.id)}
        role="tabpanel"
        tabIndex={0}
      >
        <InspectWorkspace
          activeScope={activeScope}
          createRequestId={createRequestId}
          lastMessage={lastMessage}
          sendToPlugin={sendToPlugin}
        />
      </section>
    );
  }

  if (workspace.id === "edit") {
    return (
      <section
        aria-labelledby={getWorkspaceTabId(workspace.id)}
        className="workspace-panel"
        id={getWorkspacePanelId(workspace.id)}
        role="tabpanel"
        tabIndex={0}
      >
        <EditWorkspace
          activeScope={activeScope}
          createRequestId={createRequestId}
          lastMessage={lastMessage}
          onContextDrawerChange={onContextDrawerChange}
          sendToPlugin={sendToPlugin}
        />
      </section>
    );
  }

  if (workspace.id === "sequence") {
    return (
      <section
        aria-labelledby={getWorkspaceTabId(workspace.id)}
        className="workspace-panel"
        id={getWorkspacePanelId(workspace.id)}
        role="tabpanel"
        tabIndex={0}
      >
        <SequenceWorkspace
          activeScope={activeScope}
          createRequestId={createRequestId}
          lastMessage={lastMessage}
          onContextDrawerChange={onContextDrawerChange}
          sendToPlugin={sendToPlugin}
        />
      </section>
    );
  }

  return (
    <section
      aria-labelledby={getWorkspaceTabId(workspace.id)}
      className="workspace-panel"
      id={getWorkspacePanelId(workspace.id)}
      role="tabpanel"
      tabIndex={0}
    >
      <ReviewWorkspace
        activeScope={activeScope}
        createRequestId={createRequestId}
        lastMessage={lastMessage}
        onContextDrawerChange={onContextDrawerChange}
        sendToPlugin={sendToPlugin}
      />
    </section>
  );
};

export const App = ({ contextDrawer = null }: { contextDrawer?: ReactNode }) => {
  const dispatchApplicationEvent = useApplicationStateDispatch();
  const [lastMessage, setLastMessage] = useState<PluginToUiMessage | null>(null);
  const [windowSize, setWindowSize] = useState<PluginWindowSize>(initialWindowSize);
  const [isResizing, setIsResizing] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(INITIAL_WORKSPACE_ID);
  const [activeScope, setActiveScope] = useState<ScopeScanResult | null>(null);
  const [editContextDrawer, setEditContextDrawer] = useState<ReactNode | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const resizeFrameRef = useRef<number | null>(null);
  const latestResizeRef = useRef<PluginWindowSize | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      const maybeMessage =
        typeof payload === "object" && payload !== null && "pluginMessage" in payload
          ? (payload as { pluginMessage?: unknown }).pluginMessage
          : payload;

      if (!isPluginToUiMessage(maybeMessage)) {
        return;
      }

      setLastMessage(maybeMessage);
      if (maybeMessage.type !== "PLUGIN_ERROR") {
        dispatchApplicationEvent({ type: "INITIALIZATION_SUCCEEDED" });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [dispatchApplicationEvent]);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize(initialWindowSize());
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(
    () => () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }
    },
    []
  );

  const emitResize = (size: PluginWindowSize) => {
    const requestId = createRequestId();
    const message = createResizePluginWindowRequest(requestId, size);

    if (message === null) {
      return;
    }

    sendToPlugin(message);
  };

  const scheduleResize = (size: PluginWindowSize) => {
    latestResizeRef.current = size;

    if (resizeFrameRef.current !== null) {
      return;
    }

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      if (latestResizeRef.current !== null) {
        emitResize(latestResizeRef.current);
      }
    });
  };

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = { ...windowSize };
    setIsResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);

    const handleMove = (moveEvent: PointerEvent) => {
      const normalized = normalizePluginWindowSize({
        width: startSize.width + moveEvent.clientX - startX,
        height: startSize.height + moveEvent.clientY - startY
      });

      if (normalized !== null) {
        setWindowSize(normalized);
        scheduleResize(normalized);
      }
    };

    const stopResize = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  };

  const density = classifyShellDensity(windowSize.width);
  const activeDrawer = helpOpen ? (
    <HelpDrawer
      onClose={() => {
        setHelpOpen(false);
      }}
      open={helpOpen}
    />
  ) : (contextDrawer ?? editContextDrawer);

  return (
    <div
      className="app-shell"
      data-context-drawer={activeDrawer === null ? "closed" : "open"}
      data-density={density}
      data-resizing={isResizing}
    >
      <GlobalHeader
        activeWorkspace={activeWorkspace}
        onHelpOpen={() => {
          setHelpOpen(true);
        }}
      />

      <nav className="shell-nav" aria-label="Workspace navigation region">
        <WorkspaceNavigation
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={setActiveWorkspace}
        />
      </nav>

      <div className="shell-body">
        <main className="shell-main" aria-label="MotionOps workspace" tabIndex={-1}>
          <div className="workspace-main-shell">
            <WorkspaceStageHeader
              activeWorkspace={activeWorkspace}
              onWorkspaceChange={setActiveWorkspace}
            />
            <WorkspacePanel
              activeScope={activeScope}
              activeWorkspace={activeWorkspace}
              lastMessage={lastMessage}
              onActiveScopeChange={setActiveScope}
              onContextDrawerChange={setEditContextDrawer}
            />
          </div>
        </main>
        {activeDrawer === null ? null : <div className="shell-context">{activeDrawer}</div>}
      </div>

      <button
        aria-label="Resize plugin window"
        className="resize-handle"
        data-testid="resize-handle"
        onPointerDown={beginResize}
        type="button"
      />
    </div>
  );
};
