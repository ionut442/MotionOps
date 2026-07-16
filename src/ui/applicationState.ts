export type ApplicationStatus =
  | "initializing"
  | "synced"
  | "draft"
  | "applying"
  | "stale"
  | "error";

export type StableApplicationStatus = "synced" | "draft" | "applying";
export type RecoverableApplicationStatus = "synced" | "draft" | "stale";

export type ApplicationStaleReason =
  | "document_changed"
  | "selection_context_changed"
  | "operation_baseline_changed"
  | "source_state_unavailable"
  | "unknown";

export type ApplicationStateErrorCode =
  | "initialization_failed"
  | "apply_failed"
  | "sync_failed"
  | "recovery_unavailable";

export interface ApplicationStateError {
  code: ApplicationStateErrorCode;
  summary: string;
  recoverable: boolean;
  stage?: "initialization" | "apply" | "sync" | "recovery";
}

export type ApplicationState =
  | { status: "initializing" }
  | { status: "synced" }
  | { status: "draft"; draftId?: string }
  | { status: "applying"; operationId: string; startedFrom: "draft" }
  | { status: "stale"; reason: ApplicationStaleReason; previousStatus: StableApplicationStatus }
  | {
      status: "error";
      error: ApplicationStateError;
      previousStatus?: RecoverableApplicationStatus;
    };

export type ApplicationEvent =
  | { type: "INITIALIZATION_SUCCEEDED" }
  | { type: "INITIALIZATION_FAILED"; error: ApplicationStateError }
  | { type: "DRAFT_CHANGED"; draftId?: string }
  | { type: "DRAFT_CLEARED" }
  | { type: "APPLY_STARTED"; operationId: string }
  | { type: "APPLY_SUCCEEDED" }
  | { type: "APPLY_FAILED"; error: ApplicationStateError }
  | { type: "DOCUMENT_STALE"; reason: ApplicationStaleReason }
  | { type: "SYNC_RESTORED" }
  | { type: "SYNC_FAILED"; error: ApplicationStateError }
  | { type: "RESET" };

export interface ApplicationTransitionError {
  code: "invalid_application_transition";
  currentStatus: ApplicationStatus;
  eventType: ApplicationEvent["type"];
  summary: string;
}

export type ApplicationTransitionResult =
  | { ok: true; state: ApplicationState }
  | { ok: false; state: ApplicationState; error: ApplicationTransitionError };

export const INITIAL_APPLICATION_STATE: ApplicationState = { status: "initializing" };

export const APPLICATION_EVENT_TYPES = [
  "INITIALIZATION_SUCCEEDED",
  "INITIALIZATION_FAILED",
  "DRAFT_CHANGED",
  "DRAFT_CLEARED",
  "APPLY_STARTED",
  "APPLY_SUCCEEDED",
  "APPLY_FAILED",
  "DOCUMENT_STALE",
  "SYNC_RESTORED",
  "SYNC_FAILED",
  "RESET"
] as const satisfies readonly ApplicationEvent["type"][];

export const APPLICATION_STATUSES = [
  "initializing",
  "synced",
  "draft",
  "applying",
  "stale",
  "error"
] as const satisfies readonly ApplicationStatus[];

const assertNever = (value: never): never => {
  throw new Error(`Unhandled application state value: ${JSON.stringify(value)}`);
};

const eventTypeOf = (event: ApplicationEvent): ApplicationEvent["type"] => {
  switch (event.type) {
    case "INITIALIZATION_SUCCEEDED":
    case "INITIALIZATION_FAILED":
    case "DRAFT_CHANGED":
    case "DRAFT_CLEARED":
    case "APPLY_STARTED":
    case "APPLY_SUCCEEDED":
    case "APPLY_FAILED":
    case "DOCUMENT_STALE":
    case "SYNC_RESTORED":
    case "SYNC_FAILED":
    case "RESET":
      return event.type;
    default:
      return assertNever(event);
  }
};

const invalidTransition = (
  state: ApplicationState,
  event: ApplicationEvent
): ApplicationTransitionResult => {
  const eventType = eventTypeOf(event);
  return {
    ok: false,
    state,
    error: {
      code: "invalid_application_transition",
      currentStatus: state.status,
      eventType,
      summary: `Cannot apply ${eventType} while application is ${state.status}.`
    }
  };
};

export const createApplicationStateError = (
  code: ApplicationStateErrorCode,
  summary: string,
  options: { recoverable?: boolean; stage?: ApplicationStateError["stage"] } = {}
): ApplicationStateError => ({
  code,
  summary,
  recoverable: options.recoverable ?? false,
  ...(options.stage === undefined ? {} : { stage: options.stage })
});

export const transitionApplicationState = (
  state: ApplicationState,
  event: ApplicationEvent
): ApplicationTransitionResult => {
  if (event.type === "RESET") {
    return { ok: true, state: INITIAL_APPLICATION_STATE };
  }

  switch (state.status) {
    case "initializing":
      switch (event.type) {
        case "INITIALIZATION_SUCCEEDED":
          return { ok: true, state: { status: "synced" } };
        case "INITIALIZATION_FAILED":
          return { ok: true, state: { status: "error", error: event.error } };
        default:
          return invalidTransition(state, event);
      }

    case "synced":
      switch (event.type) {
        case "DRAFT_CHANGED":
          return { ok: true, state: { status: "draft", draftId: event.draftId } };
        case "DOCUMENT_STALE":
          return {
            ok: true,
            state: { status: "stale", reason: event.reason, previousStatus: "synced" }
          };
        default:
          return invalidTransition(state, event);
      }

    case "draft":
      switch (event.type) {
        case "DRAFT_CHANGED":
          return { ok: true, state: { status: "draft", draftId: event.draftId } };
        case "DRAFT_CLEARED":
          return { ok: true, state: { status: "synced" } };
        case "APPLY_STARTED":
          return {
            ok: true,
            state: { status: "applying", operationId: event.operationId, startedFrom: "draft" }
          };
        case "DOCUMENT_STALE":
          return {
            ok: true,
            state: { status: "stale", reason: event.reason, previousStatus: "draft" }
          };
        default:
          return invalidTransition(state, event);
      }

    case "applying":
      switch (event.type) {
        case "APPLY_SUCCEEDED":
          return { ok: true, state: { status: "synced" } };
        case "APPLY_FAILED":
          return {
            ok: true,
            state: { status: "error", error: event.error, previousStatus: "draft" }
          };
        case "DOCUMENT_STALE":
          return {
            ok: true,
            state: { status: "stale", reason: event.reason, previousStatus: "applying" }
          };
        default:
          return invalidTransition(state, event);
      }

    case "stale":
      switch (event.type) {
        case "SYNC_RESTORED":
          return { ok: true, state: { status: "synced" } };
        case "SYNC_FAILED":
          return {
            ok: true,
            state: { status: "error", error: event.error, previousStatus: "stale" }
          };
        default:
          return invalidTransition(state, event);
      }

    case "error":
      switch (event.type) {
        case "SYNC_RESTORED":
          return state.error.recoverable
            ? { ok: true, state: { status: "synced" } }
            : invalidTransition(state, event);
        default:
          return invalidTransition(state, event);
      }

    default:
      return assertNever(state);
  }
};

export const isApplicationBusy = (state: ApplicationState): boolean =>
  state.status === "initializing" || state.status === "applying";

export const hasApplicationDraft = (state: ApplicationState): boolean =>
  state.status === "draft" || state.status === "applying";

export const isApplicationRecoverable = (state: ApplicationState): boolean =>
  state.status === "error" && state.error.recoverable;

export const applicationStatusLabel = (state: ApplicationState): string => {
  switch (state.status) {
    case "initializing":
      return "Initializing";
    case "synced":
      return "Synced";
    case "draft":
      return "Draft changes";
    case "applying":
      return "Applying";
    case "stale":
      return "Stale";
    case "error":
      return "Error";
    default:
      return assertNever(state);
  }
};
