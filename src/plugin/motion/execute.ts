import { createFigmaMotionAdapter } from "./adapter";
import { messageForCause, type MotionAdapterError } from "./errors";
import { stableClone } from "./object";
import { snapshotPlanId, type ChangePlan, type ChangePlanMutation } from "./plan";
import { checkMotionStateGuard, type MotionStaleCheckResult } from "./stale-detection";
import { verifyMotionWrite } from "./verification";
import type { MotionAdapter, MotionSnapshot, Result } from "./types";
import type { MotionVerificationReport } from "./diff";
import type { TimeMs } from "../../domain/time";

declare const figma: {
  commitUndo?: () => void;
  triggerUndo?: () => void;
};

export type ChangePlanExecutionStatus =
  | "success"
  | "partial-success"
  | "stale"
  | "validation-failure"
  | "writer-failure"
  | "verification-mismatch"
  | "rollback-success"
  | "rollback-failure";

export interface MutationExecutionResult {
  mutationId: string;
  status: "success" | "skipped" | "writer-failure" | "verification-mismatch";
  source: ChangePlanMutation["source"];
  nodeId: string;
  message: string;
  verification?: MotionVerificationReport;
  error?: SanitizedExecutionError;
}

export interface SanitizedExecutionError {
  code: string;
  message: string;
  nodeId?: string;
  path?: string;
}

export interface ChangePlanExecutionResult {
  status: ChangePlanExecutionStatus;
  planId?: string;
  requestId: string;
  baseSnapshotId?: string;
  mutationResults: MutationExecutionResult[];
  staleResults: MotionStaleCheckResult[];
  errors: SanitizedExecutionError[];
  rollback?: {
    attempted: boolean;
    status: "not-needed" | "success" | "failure" | "unsupported";
    message: string;
  };
}

export interface UndoTransaction {
  begin(): Result<true, SanitizedExecutionError>;
  rollback(): Result<true, SanitizedExecutionError>;
}

export interface ExecuteChangePlanOptions {
  adapter?: Pick<
    MotionAdapter,
    "readMotionSnapshot" | "replaceManualTrack" | "removeAndReapplyStyle" | "setTimelineDuration"
  >;
  undo?: UndoTransaction;
  requestId: string;
  seenRequestIds?: Set<string>;
}

export const createFigmaUndoTransaction = (): UndoTransaction => ({
  begin: () => {
    if (typeof figma.commitUndo !== "function") {
      return {
        ok: false,
        error: {
          code: "UNDO_UNSUPPORTED",
          message: "figma.commitUndo is unavailable; guarded write transaction cannot begin."
        }
      };
    }
    figma.commitUndo();
    return { ok: true, value: true };
  },
  rollback: () => {
    if (typeof figma.triggerUndo !== "function") {
      return {
        ok: false,
        error: {
          code: "ROLLBACK_UNSUPPORTED",
          message: "figma.triggerUndo is unavailable; rollback could not be attempted."
        }
      };
    }
    figma.triggerUndo();
    return { ok: true, value: true };
  }
});

export const executeChangePlan = async (
  serializedPlan: unknown,
  options: ExecuteChangePlanOptions
): Promise<ChangePlanExecutionResult> => {
  const parsed = validateSerializedPlan(serializedPlan);
  if (!parsed.ok) {
    return {
      status: "validation-failure",
      requestId: options.requestId,
      mutationResults: [],
      staleResults: [],
      errors: [parsed.error],
      rollback: { attempted: false, status: "not-needed", message: "Invalid plans never write." }
    };
  }

  if (options.seenRequestIds?.has(options.requestId)) {
    return {
      status: "validation-failure",
      planId: parsed.value.planId,
      requestId: options.requestId,
      baseSnapshotId: parsed.value.baseSnapshotId,
      mutationResults: [],
      staleResults: [],
      errors: [{ code: "DUPLICATE_REQUEST", message: "Duplicate apply request was suppressed." }],
      rollback: { attempted: false, status: "not-needed", message: "Duplicate requests never write." }
    };
  }
  options.seenRequestIds?.add(options.requestId);

  if (parsed.value.mutations.length === 0) {
    return {
      status: "validation-failure",
      planId: parsed.value.planId,
      requestId: options.requestId,
      baseSnapshotId: parsed.value.baseSnapshotId,
      mutationResults: [],
      staleResults: [],
      errors: [{ code: "NO_APPLICABLE_MUTATIONS", message: "Change plan has no applicable mutations to write." }],
      rollback: { attempted: false, status: "not-needed", message: "Read-only or skipped-only plans never write." }
    };
  }

  const adapter = options.adapter ?? createFigmaMotionAdapter();
  const preflight = await preflightPlan(parsed.value, adapter);
  if (!preflight.ok) {
    return {
      status: preflight.error.status,
      planId: parsed.value.planId,
      requestId: options.requestId,
      baseSnapshotId: parsed.value.baseSnapshotId,
      mutationResults: [],
      staleResults: preflight.error.staleResults,
      errors: preflight.error.errors,
      rollback: { attempted: false, status: "not-needed", message: "Preflight failed before any write." }
    };
  }

  const undo = options.undo ?? createFigmaUndoTransaction();
  const begin = undo.begin();
  if (!begin.ok) {
    return {
      status: "validation-failure",
      planId: parsed.value.planId,
      requestId: options.requestId,
      baseSnapshotId: parsed.value.baseSnapshotId,
      mutationResults: [],
      staleResults: preflight.value,
      errors: [begin.error],
      rollback: { attempted: false, status: "unsupported", message: begin.error.message }
    };
  }

  const mutationResults: MutationExecutionResult[] = [];
  for (const mutation of parsed.value.mutations) {
    const writeResult = await dispatchMutation(mutation, adapter);
    if (!writeResult.ok) {
      mutationResults.push({
        mutationId: mutation.id,
        status: "writer-failure",
        source: mutation.source,
        nodeId: mutation.nodeId,
        message: writeResult.error.message,
        error: sanitizeError(writeResult.error)
      });
      break;
    }

    const verification = await verifyMotionWrite(mutation.expectation, {
      adapter,
      actualSnapshot: writeResult.value
    });
    if (!verification.ok) {
      mutationResults.push({
        mutationId: mutation.id,
        status: "verification-mismatch",
        source: mutation.source,
        nodeId: mutation.nodeId,
        message: verification.error.message,
        error: sanitizeError(verification.error)
      });
      break;
    }
    const verified = verification.value.status === "verified" || verification.value.status === "verified-with-warning";
    mutationResults.push({
      mutationId: mutation.id,
      status: verified ? "success" : "verification-mismatch",
      source: mutation.source,
      nodeId: mutation.nodeId,
      message: verified ? "Mutation was written and verified by re-read." : "Mutation write did not match expected normalized output.",
      verification: stableClone(verification.value) as MotionVerificationReport
    });
    if (!verified) {
      break;
    }
  }

  const failed = mutationResults.find((result) => result.status !== "success");
  if (failed) {
    const rollback = undo.rollback();
    return {
      status: rollback.ok ? "rollback-success" : "rollback-failure",
      planId: parsed.value.planId,
      requestId: options.requestId,
      baseSnapshotId: parsed.value.baseSnapshotId,
      mutationResults,
      staleResults: preflight.value,
      errors: failed.error ? [failed.error] : [],
      rollback: rollback.ok
        ? { attempted: true, status: "success", message: "Rollback was triggered after a failed mutation." }
        : { attempted: true, status: "failure", message: rollback.error.message }
    };
  }

  const status =
    mutationResults.length === parsed.value.mutations.length
      ? "success"
      : mutationResults.length > 0
        ? "partial-success"
        : "validation-failure";
  return {
    status,
    planId: parsed.value.planId,
    requestId: options.requestId,
    baseSnapshotId: parsed.value.baseSnapshotId,
    mutationResults,
    staleResults: preflight.value,
    errors: [],
    rollback: { attempted: false, status: "not-needed", message: "No rollback needed." }
  };
};

const preflightPlan = async (
  plan: ChangePlan,
  adapter: Pick<MotionAdapter, "readMotionSnapshot">
): Promise<Result<MotionStaleCheckResult[], { status: "stale" | "validation-failure"; staleResults: MotionStaleCheckResult[]; errors: SanitizedExecutionError[] }>> => {
  const staleResults: MotionStaleCheckResult[] = [];
  const snapshots = new Map<string, MotionSnapshot>();
  for (const mutation of plan.mutations) {
    if (!snapshots.has(mutation.nodeId)) {
      const read = await adapter.readMotionSnapshot(mutation.nodeId);
      if (!read.ok) {
        return { ok: false, error: { status: "validation-failure", staleResults, errors: [sanitizeError(read.error)] } };
      }
      snapshots.set(mutation.nodeId, read.value);
    }
  }
  const first = snapshots.values().next().value;
  if (first && !plan.baseSnapshotId.startsWith("paste:") && plan.baseSnapshotId !== snapshotPlanId(first)) {
    return {
      ok: false,
      error: {
        status: "stale",
        staleResults,
        errors: [{ code: "STALE_PLAN", message: "Base snapshot identity no longer matches the current normalized state." }]
      }
    };
  }
  for (const mutation of plan.mutations) {
    const result = await checkMotionStateGuard(mutation.guard, { adapter });
    if (!result.ok) {
      return { ok: false, error: { status: "validation-failure", staleResults, errors: [sanitizeError(result.error)] } };
    }
    staleResults.push(stableClone(result.value) as MotionStaleCheckResult);
    if (result.value.status !== "current") {
      return {
        ok: false,
        error: {
          status: "stale",
          staleResults,
          errors: [{ code: "STALE_PLAN", message: "Stale or unverifiable plan was blocked before write." }]
        }
      };
    }
  }
  return { ok: true, value: staleResults };
};

const dispatchMutation = async (
  mutation: ChangePlanMutation,
  adapter: Pick<MotionAdapter, "replaceManualTrack" | "removeAndReapplyStyle" | "setTimelineDuration">
): Promise<Result<MotionSnapshot, MotionAdapterError>> => {
  switch (mutation.source) {
    case "manual":
      return await adapter.replaceManualTrack(mutation.nodeId, mutation.writeModel);
    case "style":
      return await adapter.removeAndReapplyStyle(mutation.nodeId, mutation.writerInput);
    case "timeline":
      return await adapter.setTimelineDuration(mutation.nodeId, mutation.timelineId, mutation.afterDurationMs as TimeMs);
    default:
      return assertNeverMutation(mutation);
  }
};

const validateSerializedPlan = (value: unknown): Result<ChangePlan, SanitizedExecutionError> => {
  if (!value || typeof value !== "object") {
    return { ok: false, error: { code: "INVALID_PLAN", message: "Change plan must be a serializable object." } };
  }
  const plan = value as Partial<ChangePlan>;
  if (plan.version !== 1 || typeof plan.planId !== "string" || typeof plan.baseSnapshotId !== "string" || !Array.isArray(plan.mutations)) {
    return { ok: false, error: { code: "INVALID_PLAN", message: "Change plan structure is invalid." } };
  }
  const mutations = plan.mutations as unknown[];
  if (
    mutations.some(
      (mutation) =>
        typeof mutation !== "object" ||
        mutation === null ||
        !("source" in mutation) ||
        (mutation.source !== "manual" && mutation.source !== "style" && mutation.source !== "timeline")
    )
  ) {
    return { ok: false, error: { code: "INVALID_PLAN", message: "Change plan contains an unsupported mutation source." } };
  }
  return { ok: true, value: stableClone(plan) as ChangePlan };
};

const sanitizeError = (error: MotionAdapterError | SanitizedExecutionError): SanitizedExecutionError => ({
  code: error.code,
  message: messageForCause(error.message),
  nodeId: "nodeId" in error ? error.nodeId : undefined,
  path: "path" in error ? error.path : undefined
});

const assertNeverMutation = (mutation: never): never => {
  throw new Error(`Unhandled mutation source: ${JSON.stringify(mutation)}`);
};
