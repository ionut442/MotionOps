import { describe, expect, test } from "vitest";
import {
  APPLICATION_EVENT_TYPES,
  APPLICATION_STATUSES,
  INITIAL_APPLICATION_STATE,
  applicationStatusLabel,
  createApplicationStateError,
  hasApplicationDraft,
  isApplicationBusy,
  isApplicationRecoverable,
  transitionApplicationState,
  type ApplicationEvent,
  type ApplicationState
} from "../src/ui/applicationState";

const initError = createApplicationStateError("initialization_failed", "Initialization failed.", {
  stage: "initialization"
});
const recoverableSyncError = createApplicationStateError("sync_failed", "Synchronization failed.", {
  recoverable: true,
  stage: "sync"
});
const applyError = createApplicationStateError("apply_failed", "Apply failed.", {
  recoverable: true,
  stage: "apply"
});

const expectSerializable = (value: unknown) => {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
};

describe("application lifecycle transition engine", () => {
  test("uses deterministic initializing state", () => {
    expect(INITIAL_APPLICATION_STATE).toEqual({ status: "initializing" });
    expect(INITIAL_APPLICATION_STATE.status).toBe("initializing");
  });

  test("initialization succeeds to synced and fails to error", () => {
    expect(
      transitionApplicationState(INITIAL_APPLICATION_STATE, { type: "INITIALIZATION_SUCCEEDED" })
    ).toEqual({ ok: true, state: { status: "synced" } });

    expect(
      transitionApplicationState(INITIAL_APPLICATION_STATE, {
        type: "INITIALIZATION_FAILED",
        error: initError
      })
    ).toEqual({ ok: true, state: { status: "error", error: initError } });
  });

  test("draft lifecycle is explicit", () => {
    const changed = transitionApplicationState({ status: "synced" }, {
      type: "DRAFT_CHANGED",
      draftId: "draft-1"
    });
    expect(changed).toEqual({ ok: true, state: { status: "draft", draftId: "draft-1" } });

    const changedAgain = transitionApplicationState(
      { status: "draft", draftId: "draft-1" },
      { type: "DRAFT_CHANGED", draftId: "draft-2" }
    );
    expect(changedAgain).toEqual({ ok: true, state: { status: "draft", draftId: "draft-2" } });

    expect(
      transitionApplicationState({ status: "draft", draftId: "draft-2" }, { type: "DRAFT_CLEARED" })
    ).toEqual({ ok: true, state: { status: "synced" } });
  });

  test("apply lifecycle preserves operation id and handles success or failure", () => {
    const started = transitionApplicationState({ status: "draft" }, {
      type: "APPLY_STARTED",
      operationId: "operation-1"
    });
    expect(started).toEqual({
      ok: true,
      state: { status: "applying", operationId: "operation-1", startedFrom: "draft" }
    });

    expect(
      transitionApplicationState(
        { status: "applying", operationId: "operation-1", startedFrom: "draft" },
        { type: "APPLY_SUCCEEDED" }
      )
    ).toEqual({ ok: true, state: { status: "synced" } });

    expect(
      transitionApplicationState(
        { status: "applying", operationId: "operation-1", startedFrom: "draft" },
        { type: "APPLY_FAILED", error: applyError }
      )
    ).toEqual({
      ok: true,
      state: { status: "error", error: applyError, previousStatus: "draft" }
    });
  });

  test("stale lifecycle accepts synced draft and applying sources", () => {
    expect(
      transitionApplicationState({ status: "synced" }, {
        type: "DOCUMENT_STALE",
        reason: "document_changed"
      })
    ).toEqual({
      ok: true,
      state: { status: "stale", reason: "document_changed", previousStatus: "synced" }
    });

    expect(
      transitionApplicationState({ status: "draft" }, {
        type: "DOCUMENT_STALE",
        reason: "selection_context_changed"
      })
    ).toEqual({
      ok: true,
      state: { status: "stale", reason: "selection_context_changed", previousStatus: "draft" }
    });

    expect(
      transitionApplicationState(
        { status: "applying", operationId: "operation-1", startedFrom: "draft" },
        { type: "DOCUMENT_STALE", reason: "operation_baseline_changed" }
      )
    ).toEqual({
      ok: true,
      state: { status: "stale", reason: "operation_baseline_changed", previousStatus: "applying" }
    });
  });

  test("stale state can recover or fail synchronization", () => {
    const stale: ApplicationState = {
      status: "stale",
      reason: "source_state_unavailable",
      previousStatus: "synced"
    };
    expect(transitionApplicationState(stale, { type: "SYNC_RESTORED" })).toEqual({
      ok: true,
      state: { status: "synced" }
    });
    expect(transitionApplicationState(stale, { type: "SYNC_FAILED", error: recoverableSyncError })).toEqual({
      ok: true,
      state: { status: "error", error: recoverableSyncError, previousStatus: "stale" }
    });
  });

  test("recoverable error can return to synced through explicit recovery event", () => {
    expect(
      transitionApplicationState(
        { status: "error", error: recoverableSyncError, previousStatus: "stale" },
        { type: "SYNC_RESTORED" }
      )
    ).toEqual({ ok: true, state: { status: "synced" } });
  });

  test("reset returns every state to the initial state", () => {
    const states: ApplicationState[] = [
      INITIAL_APPLICATION_STATE,
      { status: "synced" },
      { status: "draft", draftId: "draft-1" },
      { status: "applying", operationId: "operation-1", startedFrom: "draft" },
      { status: "stale", reason: "unknown", previousStatus: "draft" },
      { status: "error", error: recoverableSyncError, previousStatus: "stale" }
    ];

    for (const state of states) {
      expect(transitionApplicationState(state, { type: "RESET" })).toEqual({
        ok: true,
        state: INITIAL_APPLICATION_STATE
      });
    }
  });

  test("invalid transition reports safely and preserves original state", () => {
    const state: ApplicationState = { status: "synced" };
    const result = transitionApplicationState(state, { type: "APPLY_SUCCEEDED" });
    expect(result).toEqual({
      ok: false,
      state,
      error: {
        code: "invalid_application_transition",
        currentStatus: "synced",
        eventType: "APPLY_SUCCEEDED",
        summary: "Cannot apply APPLY_SUCCEEDED while application is synced."
      }
    });
    expect(result.state).toBe(state);
  });

  test("transition engine does not mutate input", () => {
    const state: ApplicationState = { status: "draft", draftId: "draft-1" };
    const before = JSON.stringify(state);
    transitionApplicationState(state, { type: "APPLY_STARTED", operationId: "operation-1" });
    expect(JSON.stringify(state)).toBe(before);
  });

  test("state values events errors and results are serializable", () => {
    const event: ApplicationEvent = { type: "APPLY_FAILED", error: applyError };
    const state: ApplicationState = { status: "error", error: applyError, previousStatus: "draft" };
    const result = transitionApplicationState(
      { status: "applying", operationId: "operation-1", startedFrom: "draft" },
      event
    );

    expectSerializable(event);
    expectSerializable(state);
    expectSerializable(result);
  });

  test("error state stores no raw Error object", () => {
    const result = transitionApplicationState(INITIAL_APPLICATION_STATE, {
      type: "INITIALIZATION_FAILED",
      error: initError
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.status).toBe("error");
      if (result.state.status === "error") {
        expect(result.state.error).not.toBeInstanceOf(Error);
        expect(Object.keys(result.state.error).sort()).toEqual([
          "code",
          "recoverable",
          "stage",
          "summary"
        ]);
      }
    }
  });

  test("state union avoids impossible boolean combinations", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(status.startsWith("is")).toBe(false);
    }
    const applying: ApplicationState = {
      status: "applying",
      operationId: "operation-1",
      startedFrom: "draft"
    };
    expect("isApplying" in applying).toBe(false);
    expect("isSynced" in applying).toBe(false);
  });

  test("event and state taxonomies stay exhaustive for P2-003", () => {
    expect(APPLICATION_EVENT_TYPES).toEqual([
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
    ]);
    expect(APPLICATION_STATUSES).toEqual([
      "initializing",
      "synced",
      "draft",
      "applying",
      "stale",
      "error"
    ]);
  });

  test("selectors are pure projections", () => {
    expect(isApplicationBusy(INITIAL_APPLICATION_STATE)).toBe(true);
    expect(isApplicationBusy({ status: "synced" })).toBe(false);
    expect(hasApplicationDraft({ status: "draft" })).toBe(true);
    expect(hasApplicationDraft({ status: "applying", operationId: "operation-1", startedFrom: "draft" })).toBe(
      true
    );
    expect(isApplicationRecoverable({ status: "error", error: recoverableSyncError })).toBe(true);
    expect(applicationStatusLabel({ status: "draft" })).toBe("Draft changes");
  });
});
