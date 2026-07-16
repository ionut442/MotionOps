import { describe, expect, it } from "vitest";
import { isPluginToUiMessage, isUiToPluginMessage, makeInvalidMessageError } from "../src/shared/messages";

describe("message boundary validation", () => {
  it("accepts a valid UI ping", () => {
    expect(isUiToPluginMessage({ type: "UI_PING", requestId: "req-1", sentAtMs: 1 })).toBe(true);
  });

  it("accepts P0-006 lab runner messages", () => {
    expect(
      isUiToPluginMessage({
        type: "P006_FIXTURE_COMMAND",
        requestId: "req-fixtures",
        command: "CREATE_OR_REFRESH_ALL"
      })
    ).toBe(true);
    expect(isUiToPluginMessage({ type: "P006_RUN_TEST", requestId: "req-r04", testId: "R04" })).toBe(
      true
    );
    expect(isUiToPluginMessage({ type: "P006_RUN_ALL", requestId: "req-all" })).toBe(true);
  });

  it("accepts P0-007, P0-008, and P0-009 lab runner messages", () => {
    expect(isUiToPluginMessage({ type: "P007_RUN_CASE", requestId: "req-w01", caseId: "W01" })).toBe(true);
    expect(isUiToPluginMessage({ type: "P007_VERIFY_TARGET_PIPELINE", requestId: "req-p007" })).toBe(true);
    expect(isUiToPluginMessage({ type: "P008_RUN_CASE", requestId: "req-s01", caseId: "S01" })).toBe(true);
    expect(isUiToPluginMessage({ type: "P008_RUN_ALL", requestId: "req-p008-all" })).toBe(true);
    expect(isUiToPluginMessage({ type: "P008_VERIFY_TARGET_PIPELINE", requestId: "req-p008" })).toBe(true);
    expect(isUiToPluginMessage({ type: "P009_RUN_CASE", requestId: "req-t01", caseId: "T01" })).toBe(true);
    expect(isUiToPluginMessage({ type: "P009_RUN_ALL", requestId: "req-p009-all" })).toBe(true);
    expect(isUiToPluginMessage({ type: "P009_VERIFY_TARGET_PIPELINE", requestId: "req-p009" })).toBe(true);
    expect(isUiToPluginMessage({ type: "P008_RUN_CASE", requestId: "req-bad", caseId: "S99" })).toBe(false);
    expect(isUiToPluginMessage({ type: "P009_RUN_CASE", requestId: "req-bad", caseId: "T99" })).toBe(false);
  });

  it("rejects malformed UI messages", () => {
    expect(isUiToPluginMessage({ type: "UI_PING", requestId: "", sentAtMs: 1 })).toBe(false);
    expect(isUiToPluginMessage({ type: "UNKNOWN", requestId: "req-1", sentAtMs: 1 })).toBe(false);
  });

  it("accepts valid resize requests and rejects malformed resize payloads", () => {
    expect(
      isUiToPluginMessage({
        type: "RESIZE_PLUGIN_WINDOW",
        requestId: "resize-1",
        payload: { width: 1080, height: 760 }
      })
    ).toBe(true);
    expect(
      isUiToPluginMessage({
        type: "RESIZE_PLUGIN_WINDOW",
        requestId: "resize-1",
        payload: { width: Number.NaN, height: 760 }
      })
    ).toBe(false);
  });

  it("accepts Inspector read requests and normalized results", () => {
    expect(
      isUiToPluginMessage({
        type: "MOTION_INSPECT_REQUEST",
        requestId: "inspect-1",
        nodeIds: ["1:2", "3:4"]
      })
    ).toBe(true);
    expect(isUiToPluginMessage({ type: "MOTION_INSPECT_REQUEST", requestId: "inspect-1", nodeIds: [5] })).toBe(false);
    expect(
      isPluginToUiMessage({
        type: "MOTION_INSPECT_RESULT",
        requestId: "inspect-1",
        result: {
          requestedNodeIds: ["1:2"],
          snapshots: [
            {
              nodeId: "1:2",
              nodeType: "RECTANGLE",
              sources: {
                kind: "none",
                hasDerivedAnimations: false,
                hasManualTracks: false,
                hasStyleInstances: false,
                hasTimelines: false
              },
              timelines: [],
              manualTracks: [],
              styleInstances: [],
              componentProperties: {
                definitions: [],
                currentState: [],
                motionTracks: [],
                writeability: { status: "unsupported", reason: "No component property API fields detected." },
                warnings: []
              },
              derivedAnimations: [],
              capabilities: {},
              warnings: []
            }
          ],
          failures: [{ nodeId: "3:4", code: "NODE_NOT_FOUND", message: "No node found." }]
        }
      })
    ).toBe(true);
  });

  it("accepts Edit plan and apply messages while rejecting malformed operations", () => {
    expect(
      isUiToPluginMessage({
        type: "MOTION_PLAN_OPERATION_REQUEST",
        requestId: "plan-1",
        nodeId: "1:2",
        targetIds: ["opacity"],
        operation: { kind: "set-duration", durationMs: 600, anchor: "preserve-start" }
      })
    ).toBe(true);
    expect(
      isUiToPluginMessage({
        type: "MOTION_PLAN_OPERATION_REQUEST",
        requestId: "plan-2",
        nodeId: "1:2",
        targetIds: ["opacity"],
        operation: { kind: "replace-easing", easing: { kind: "cubic-bezier", x1: 0.2, y1: 0, x2: 0.4, y2: 1 } }
      })
    ).toBe(true);
    expect(
      isUiToPluginMessage({
        type: "MOTION_PLAN_OPERATION_REQUEST",
        requestId: "bad-plan",
        nodeId: "1:2",
        targetIds: ["opacity"],
        operation: { kind: "set-delay", mode: "add", delayMs: -1 }
      })
    ).toBe(false);
    expect(
      isUiToPluginMessage({
        type: "MOTION_APPLY_CHANGE_PLAN_REQUEST",
        requestId: "apply-1",
        plan: { version: 1, planId: "p1", mutations: [] }
      })
    ).toBe(true);
    expect(
      isPluginToUiMessage({
        type: "MOTION_PLAN_OPERATION_RESULT",
        requestId: "plan-1",
        result: { ok: true, plan: { version: 1, planId: "p1", mutations: [] } }
      })
    ).toBe(true);
    expect(
      isPluginToUiMessage({
        type: "MOTION_APPLY_CHANGE_PLAN_RESULT",
        requestId: "apply-1",
        result: { status: "success", mutationResults: [] }
      })
    ).toBe(true);
  });

  it("accepts Phase 5 clipboard and paste-plan messages", () => {
    const clipboard = {
      version: 1,
      createdAtMs: 1,
      mode: "complete",
      sources: [
        {
          sourceNodeId: "source",
          sourceNodeType: "RECTANGLE",
          sourceKind: "manual",
          copyMode: "complete",
          manualTracks: [],
          styleInstances: [],
          timingSummary: {},
          capabilities: {},
          warnings: []
        }
      ]
    };
    expect(isUiToPluginMessage({
      type: "MOTION_CLIPBOARD_COPY_REQUEST",
      requestId: "copy-1",
      nodeIds: ["source"],
      mode: "selected-tracks",
      selectedTrackIds: ["opacity-track"]
    })).toBe(true);
    expect(isUiToPluginMessage({
      type: "MOTION_PASTE_PLAN_REQUEST",
      requestId: "paste-1",
      clipboard,
      destinationNodeIds: ["dest"],
      pasteMode: "replace",
      mapping: { mode: "one-to-many" },
      timing: { offsetMs: 0, intervalMs: 0, reverseOrder: false }
    })).toBe(true);
    expect(isUiToPluginMessage({
      type: "MOTION_PASTE_PLAN_REQUEST",
      requestId: "paste-bad",
      clipboard,
      destinationNodeIds: ["dest"],
      pasteMode: "center-out",
      mapping: { mode: "one-to-many" },
      timing: {}
    })).toBe(false);
    expect(isPluginToUiMessage({
      type: "MOTION_CLIPBOARD_COPY_RESULT",
      requestId: "copy-1",
      result: { ok: true, clipboard, serialized: "{}" }
    })).toBe(true);
    expect(isPluginToUiMessage({
      type: "MOTION_PASTE_PLAN_RESULT",
      requestId: "paste-1",
      result: { ok: true, plan: { version: 1 }, compatibility: { version: 1 } }
    })).toBe(true);
  });

  it("accepts plugin ready and pong messages", () => {
    expect(
      isPluginToUiMessage({
        type: "PLUGIN_READY",
        pluginVersion: "0.0.0",
        figmaMode: "default",
        apiLabEnabled: false
      })
    ).toBe(true);
    expect(isPluginToUiMessage({ type: "PLUGIN_PONG", requestId: "req-1", receivedAtMs: 1 })).toBe(true);
  });

  it("creates serializable invalid-message errors", () => {
    const error = makeInvalidMessageError("Bad message", "req-1");
    expect(isPluginToUiMessage(error)).toBe(true);
    expect(JSON.parse(JSON.stringify(error))).toEqual(error);
  });

  it("accepts Phase 8 standards storage messages", () => {
    expect(isUiToPluginMessage({ type: "STANDARDS_STORAGE_REQUEST", requestId: "std-1", action: { kind: "list-personal" } })).toBe(true);
    expect(isUiToPluginMessage({ type: "STANDARDS_STORAGE_REQUEST", requestId: "std-2", action: { kind: "import-json", json: "{}" } })).toBe(true);
    expect(isUiToPluginMessage({ type: "STANDARDS_STORAGE_REQUEST", requestId: "bad", action: { kind: "save-personal", standards: { id: "x" } } })).toBe(false);
    expect(isPluginToUiMessage({
      type: "STANDARDS_STORAGE_RESULT",
      requestId: "std-1",
      result: { personal: [], activeSource: "personal", errors: [] }
    })).toBe(true);
  });
});
