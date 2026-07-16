import { createContext, useContext } from "react";
import type {
  ApplicationEvent,
  ApplicationState,
  ApplicationTransitionResult
} from "./applicationState";

export const ApplicationStateContext = createContext<ApplicationState | null>(null);
export const ApplicationStateDispatchContext =
  createContext<((event: ApplicationEvent) => ApplicationTransitionResult) | null>(null);

export const useApplicationState = (): ApplicationState => {
  const context = useContext(ApplicationStateContext);
  if (context === null) {
    throw new Error("useApplicationState must be used within ApplicationStateProvider.");
  }
  return context;
};

export const useApplicationStateDispatch = (): ((
  event: ApplicationEvent
) => ApplicationTransitionResult) => {
  const context = useContext(ApplicationStateDispatchContext);
  if (context === null) {
    throw new Error("useApplicationStateDispatch must be used within ApplicationStateProvider.");
  }
  return context;
};
