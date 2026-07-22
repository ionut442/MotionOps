import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode
} from "react";
import { useApplicationState } from "./ApplicationStateProvider";
import {
  WORKSPACE_LABELS,
  WORKSPACE_ORDER,
  type WorkspaceId
} from "../domain/workspaces";
import { isPluginToUiMessage, type PluginToUiMessage, type UiToPluginMessage } from "../shared/messages";
import {
  createResizePluginWindowRequest,
  DEFAULT_PLUGIN_WINDOW_SIZE,
  normalizePluginWindowSize,
  type PluginWindowSize
} from "../shared/pluginWindow";
import type { ScopeScanResult } from "../domain/scopeScan";
import { GlobalHeader } from "./components/GlobalHeader";
import { Icon, type IconName } from "./components/Icon";
import { ScopeWorkspace } from "./ScopeWorkspace";
import { InspectWorkspace } from "./InspectWorkspace";
import { EditWorkspace } from "./EditWorkspace";
import { SequenceWorkspace } from "./SequenceWorkspace";
import { ReviewWorkspace } from "./ReviewWorkspace";
import { ContextDrawer } from "./components/ContextDrawer";
import { useApplicationStateDispatch } from "./applicationStateContext";

interface WorkspacePresentation {
  readonly icon: IconName;
  readonly navDescription: string;
}

const WORKSPACE_PRESENTATION: Record<WorkspaceId, WorkspacePresentation> = {
  scope: { icon: "layers", navDescription: "Choose layers" },
  inspect: { icon: "inspect", navDescription: "Read motion" },
  edit: { icon: "edit", navDescription: "Tune & reuse" },
  sequence: { icon: "sequence", navDescription: "Arrange timing" },
  review: { icon: "review", navDescription: "QA & handoff" }
};

const createRequestId = (): string =>
  `req-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;

const sendToPlugin = (message: UiToPluginMessage): void => {
  parent.postMessage({ pluginMessage: message }, "*");
};

type ShellDensity = "narrow" | "wide";

const classifyShellDensity = (width: number): ShellDensity =>
  width < 920 ? "narrow" : "wide";

const initialWindowSize = (): PluginWindowSize => ({
  width: window.innerWidth > 0 ? window.innerWidth : DEFAULT_PLUGIN_WINDOW_SIZE.width,
  height: window.innerHeight > 0 ? window.innerHeight : DEFAULT_PLUGIN_WINDOW_SIZE.height
});

function WorkspacePanel({
  activeScope,
  className,
  lastMessage,
  onActiveScopeChange,
  onContextDrawerChange,
  workspace,
  ...sectionProps
}: {
  readonly activeScope: ScopeScanResult | null;
  readonly lastMessage: PluginToUiMessage | null;
  readonly onActiveScopeChange: (scope: ScopeScanResult | null) => void;
  readonly onContextDrawerChange: (drawer: ReactNode | null) => void;
  readonly workspace: WorkspaceId;
} & HTMLAttributes<HTMLElement>): ReactElement {
  const content = (() => {
  switch (workspace) {
    case "scope":
      return <ScopeWorkspace createRequestId={createRequestId} lastMessage={lastMessage} onConfirmedScopeChange={onActiveScopeChange} sendToPlugin={sendToPlugin} />;
    case "inspect":
      return <InspectWorkspace activeScope={activeScope} createRequestId={createRequestId} lastMessage={lastMessage} sendToPlugin={sendToPlugin} />;
    case "edit":
      return <EditWorkspace activeScope={activeScope} createRequestId={createRequestId} lastMessage={lastMessage} onContextDrawerChange={onContextDrawerChange} sendToPlugin={sendToPlugin} />;
    case "sequence":
      return <SequenceWorkspace activeScope={activeScope} createRequestId={createRequestId} lastMessage={lastMessage} onContextDrawerChange={onContextDrawerChange} sendToPlugin={sendToPlugin} />;
    case "review":
      return <ReviewWorkspace activeScope={activeScope} createRequestId={createRequestId} lastMessage={lastMessage} onContextDrawerChange={onContextDrawerChange} sendToPlugin={sendToPlugin} />;
    default:
      return <ScopeWorkspace createRequestId={createRequestId} lastMessage={lastMessage} onConfirmedScopeChange={onActiveScopeChange} sendToPlugin={sendToPlugin} />;
  }
  })();
  return <section {...sectionProps} className={["workspace-panel", className].filter(Boolean).join(" ")}>{content}</section>;
}

function WorkspaceTab({
  workspace,
  isActive,
  index,
  onSelect
}: {
  readonly workspace: WorkspaceId;
  readonly isActive: boolean;
  readonly index: number;
  readonly onSelect: (workspace: WorkspaceId) => void;
}): ReactElement {
  const presentation = WORKSPACE_PRESENTATION[workspace];
  const label = WORKSPACE_LABELS[workspace];

  return (
    <button
      aria-controls={`workspace-panel-${workspace}`}
      aria-selected={isActive}
      className="workspace-tab"
      data-active={isActive}
      data-testid={`workspace-tab-${workspace}`}
      id={`workspace-tab-${workspace}`}
      onClick={() => {
        onSelect(workspace);
      }}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      title={`${label.label} — ${presentation.navDescription}`}
      type="button"
    >
      <span className="workspace-tab-icon" aria-hidden="true">
        <Icon name={presentation.icon} size={18} />
      </span>
      <span className="workspace-tab-copy">
        <span className="workspace-tab-label">{label.label}</span>
        <span className="workspace-tab-description">{presentation.navDescription}</span>
      </span>
      <span className="workspace-tab-step" aria-hidden="true">{index + 1}</span>
    </button>
  );
}

export function App({ contextDrawer = null }: { readonly contextDrawer?: ReactElement | null } = {}): ReactElement {
  const dispatchApplicationEvent = useApplicationStateDispatch();
  const { state, setActiveWorkspace } = useApplicationState();
  const activeWorkspace = state.activeWorkspace;
  const [lastMessage, setLastMessage] = useState<PluginToUiMessage | null>(null);
  const [windowSize, setWindowSize] = useState<PluginWindowSize>(initialWindowSize);
  const [isResizing, setIsResizing] = useState(false);
  const [activeScope, setActiveScope] = useState<ScopeScanResult | null>(null);
  const [operationDrawer, setOperationDrawer] = useState<ReactNode | null>(null);
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

  const handleWorkspaceChange = useCallback(
    (workspace: WorkspaceId) => {
      setActiveWorkspace(workspace);
    },
    [setActiveWorkspace]
  );

  const emitResize = (size: PluginWindowSize) => {
    const message = createResizePluginWindowRequest(createRequestId(), size);

    if (message !== null) {
      sendToPlugin(message);
    }
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

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
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

  const activeDrawer = contextDrawer ?? operationDrawer ?? null;
  const density = classifyShellDensity(windowSize.width);

  return (
    <div
      className="app-shell"
      data-context-drawer={activeDrawer === null ? "closed" : "open"}
      data-density={density}
      data-resizing={isResizing}
      data-testid="app-shell"
    >
      <GlobalHeader />
      <div aria-label="Motion workflow" aria-orientation="horizontal" className="workspace-tabs" role="tablist">
        {WORKSPACE_ORDER.map((workspace, index) => (
          <WorkspaceTab
            index={index}
            isActive={workspace === activeWorkspace}
            key={workspace}
            onSelect={handleWorkspaceChange}
            workspace={workspace}
          />
        ))}
      </div>
      <div className="workspace-main-shell">
        <WorkspacePanel
          aria-labelledby={`workspace-tab-${activeWorkspace}`}
          activeScope={activeScope}
          id={`workspace-panel-${activeWorkspace}`}
          lastMessage={lastMessage}
          onActiveScopeChange={setActiveScope}
          onContextDrawerChange={setOperationDrawer}
          role="tabpanel"
          workspace={activeWorkspace}
        />
      </div>
      {activeDrawer ?? <ContextDrawer />}
      <button
        aria-label="Resize plugin window"
        className="resize-handle"
        data-testid="resize-handle"
        onPointerDown={beginResize}
        type="button"
      />
    </div>
  );
}
