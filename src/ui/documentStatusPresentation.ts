import { applicationStatusLabel, type ApplicationState } from "./applicationState";

export type DocumentStatusTone =
  | "neutral"
  | "positive"
  | "attention"
  | "progress"
  | "warning"
  | "critical";

export interface DocumentStatusPresentation {
  label: string;
  tone: DocumentStatusTone;
  description: string;
  busy: boolean;
  supportText?: string;
}

const assertNever = (value: never): never => {
  throw new Error(`Unhandled document status presentation: ${JSON.stringify(value)}`);
};

const staleReasonText = (state: Extract<ApplicationState, { status: "stale" }>): string => {
  switch (state.reason) {
    case "document_changed":
      return "Document changed.";
    case "selection_context_changed":
      return "Selection context changed.";
    case "operation_baseline_changed":
      return "Operation baseline changed.";
    case "source_state_unavailable":
      return "Source state unavailable.";
    case "unknown":
      return "Refresh needed.";
    default:
      return assertNever(state.reason);
  }
};

export const getDocumentStatusPresentation = (
  state: ApplicationState
): DocumentStatusPresentation => {
  switch (state.status) {
    case "initializing":
      return {
        label: applicationStatusLabel(state),
        tone: "neutral",
        description: "Preparing the MotionOps interface.",
        busy: true
      };
    case "synced":
      return {
        label: applicationStatusLabel(state),
        tone: "positive",
        description: "No pending local changes are known.",
        busy: false
      };
    case "draft":
      return {
        label: applicationStatusLabel(state),
        tone: "attention",
        description: "Local changes have not been applied to Figma.",
        busy: false
      };
    case "applying":
      return {
        label: applicationStatusLabel(state),
        tone: "progress",
        description: "A confirmed operation is being applied.",
        busy: true
      };
    case "stale":
      return {
        label: applicationStatusLabel(state),
        tone: "warning",
        description: "The known document state has changed and must be refreshed before applying.",
        busy: false,
        supportText: staleReasonText(state)
      };
    case "error":
      return {
        label: applicationStatusLabel(state),
        tone: "critical",
        description: state.error.summary,
        busy: false
      };
    default:
      return assertNever(state);
  }
};
