import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  INITIAL_APPLICATION_STATE,
  transitionApplicationState,
  type ApplicationEvent,
  type ApplicationState,
  type ApplicationTransitionResult
} from "./applicationState";
import { ApplicationStateContext, ApplicationStateDispatchContext } from "./applicationStateContext";

type QwenWorkspaceId = "scope" | "inspect" | "edit" | "sequence" | "review";

const QwenWorkspaceContext = createContext<{
  readonly activeWorkspace: QwenWorkspaceId;
  readonly setActiveWorkspace: (workspace: QwenWorkspaceId) => void;
} | null>(null);

export const ApplicationStateProvider = ({
  children,
  initialState = INITIAL_APPLICATION_STATE
}: {
  children: ReactNode;
  initialState?: ApplicationState;
}) => {
  const [applicationState, setApplicationState] = useState<ApplicationState>(initialState);
  const [activeWorkspace, setActiveWorkspace] = useState<QwenWorkspaceId>("scope");
  const stateRef = useRef<ApplicationState>(initialState);

  const sendApplicationEvent = useCallback((event: ApplicationEvent): ApplicationTransitionResult => {
    const result = transitionApplicationState(stateRef.current, event);
    if (result.ok) {
      stateRef.current = result.state;
      setApplicationState(result.state);
    }
    return result;
  }, []);

  const dispatchContextValue = useMemo(() => sendApplicationEvent, [sendApplicationEvent]);

  return (
    <ApplicationStateContext.Provider value={applicationState}>
      <ApplicationStateDispatchContext.Provider value={dispatchContextValue}>
        <QwenWorkspaceContext.Provider value={{ activeWorkspace, setActiveWorkspace }}>
          {children}
        </QwenWorkspaceContext.Provider>
      </ApplicationStateDispatchContext.Provider>
    </ApplicationStateContext.Provider>
  );
};

export const useApplicationState = () => {
  const applicationState = useContext(ApplicationStateContext);
  const workspaceState = useContext(QwenWorkspaceContext);
  if (workspaceState === null) {
    throw new Error("useApplicationState must be used inside ApplicationStateProvider.");
  }
  return {
    state: { ...applicationState, activeWorkspace: workspaceState.activeWorkspace },
    setActiveWorkspace: workspaceState.setActiveWorkspace
  };
};
