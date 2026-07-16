import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  INITIAL_APPLICATION_STATE,
  transitionApplicationState,
  type ApplicationEvent,
  type ApplicationState,
  type ApplicationTransitionResult
} from "./applicationState";
import { ApplicationStateContext, ApplicationStateDispatchContext } from "./applicationStateContext";

export const ApplicationStateProvider = ({
  children,
  initialState = INITIAL_APPLICATION_STATE
}: {
  children: ReactNode;
  initialState?: ApplicationState;
}) => {
  const [applicationState, setApplicationState] = useState<ApplicationState>(initialState);
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
        {children}
      </ApplicationStateDispatchContext.Provider>
    </ApplicationStateContext.Provider>
  );
};
