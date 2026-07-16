import {
  isUiToPluginMessage,
  makeInvalidMessageError,
  type PluginToUiMessage
} from "../shared/messages";
import { DEFAULT_PLUGIN_WINDOW_SIZE } from "../shared/pluginWindow";
import { isMotionApiLabEnabled } from "../shared/labConfig";
import { createCancellationRegistry } from "../shared/cancellation";
import { resizePluginWindow } from "./windowResize";
import { scanScope } from "./scopeScanner";
import { inspectMotionTargets } from "./inspector";
import {
  executeChangePlan,
  analyzePasteCompatibility,
  buildPasteChangePlan,
  copyMotionToClipboard,
  planMotionOperation,
  readMotionSnapshot,
  serializeMotionClipboard,
  type MotionClipboard,
  type MotionOperation
} from "./motion";
import { createStandardsStorage } from "./standardsStorage";

const postToUi = (message: PluginToUiMessage): void => {
  figma.ui.postMessage(message);
};

const postPluginError = (requestId: string, error: unknown): void => {
  postToUi(
    makeInvalidMessageError(
      error instanceof Error ? error.message : "Unknown plugin operation failure.",
      requestId
    )
  );
};

figma.showUI(__html__, { ...DEFAULT_PLUGIN_WINDOW_SIZE, themeColors: true });

let activeScopeScan: { readonly requestId: string; cancel: () => void } | null = null;
let activeMotionInspectRequestId: string | null = null;
let activeMotionPlanRequestId: string | null = null;
let activeMotionClipboardRequestId: string | null = null;
let activeMotionPastePlanRequestId: string | null = null;
let activeStandardsStorageRequestId: string | null = null;
const cancellationRegistry = createCancellationRegistry();
const appliedChangePlanRequestIds = new Set<string>();
let suppressSelectionNotification = false;
const standardsStorage = createStandardsStorage({
  clientGet: (key) => figma.clientStorage.getAsync(key),
  clientSet: (key, value) => figma.clientStorage.setAsync(key, value),
  rootGetPluginData: (key) => figma.root.getPluginData(key),
  rootSetPluginData: (key, value) => {
    figma.root.setPluginData(key, value);
  },
  nowMs: () => Date.now()
});

const selectionIds = (): readonly string[] => figma.currentPage.selection.map((node) => node.id);

const postSelectionChanged = () => {
  if (suppressSelectionNotification) {
    return;
  }
  postToUi({
    type: "SCOPE_SELECTION_CHANGED",
    selectionIds: selectionIds()
  });
};

figma.on("selectionchange", postSelectionChanged);

const isSelectableNode = (node: BaseNode | null): node is SceneNode =>
  node !== null && "visible" in node && "removed" in node && !node.removed;

const revealScopeNode = async (requestId: string, nodeId: string): Promise<void> => {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (node === null) {
      postToUi({
        type: "SCOPE_REVEAL_NODE_RESULT",
        requestId,
        result: {
          ok: false,
          nodeId,
          status: "missing",
          message: "Scope node is no longer available."
        }
      });
      return;
    }

    if (!isSelectableNode(node)) {
      postToUi({
        type: "SCOPE_REVEAL_NODE_RESULT",
        requestId,
        result: {
          ok: false,
          nodeId,
          status: "unsupported",
          message: "Scope node cannot be selected in the current editor context."
        }
      });
      return;
    }

    suppressSelectionNotification = true;
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
    void Promise.resolve().then(() => {
      suppressSelectionNotification = false;
    });
    postToUi({
      type: "SCOPE_REVEAL_NODE_RESULT",
      requestId,
      result: {
        ok: true,
        nodeId,
        status: "selected",
        message: "Scope node selected and revealed."
      }
    });
  } catch {
    suppressSelectionNotification = false;
    postToUi({
      type: "SCOPE_REVEAL_NODE_RESULT",
      requestId,
      result: {
        ok: false,
        nodeId,
        status: "error",
        message: "Scope node could not be revealed safely."
      }
    });
  }
};

postToUi({
  type: "PLUGIN_READY",
  pluginVersion: "0.0.0",
  figmaMode: figma.mode,
  apiLabEnabled: isMotionApiLabEnabled()
});

const motionApiLabMessageTypes = new Set<string>([
  "MOTION_DIAGNOSTIC_REQUEST",
  "P006_VERIFY_TARGET_PIPELINE",
  "P006_FIXTURE_COMMAND",
  "P006_RUN_TEST",
  "P006_RUN_ALL",
  "P007_FIXTURE_COMMAND",
  "P007_VERIFY_TARGET_PIPELINE",
  "P007_RUN_CASE",
  "P007_RUN_ALL",
  "P008_FIXTURE_COMMAND",
  "P008_VERIFY_TARGET_PIPELINE",
  "P008_RUN_CASE",
  "P008_RUN_ALL",
  "P009_FIXTURE_COMMAND",
  "P009_VERIFY_TARGET_PIPELINE",
  "P009_RUN_CASE",
  "P009_RUN_ALL",
  "P010_FIXTURE_COMMAND",
  "P010_VERIFY_TARGET_PIPELINE",
  "P010_RUN_ACTION",
  "P011_FIXTURE_COMMAND",
  "P011_VERIFY_TARGET_PIPELINE",
  "P011_RUN_CASE",
  "P011_RUN_ALL",
  "P012_FIXTURE_COMMAND",
  "P012_VERIFY_TARGET_PIPELINE",
  "P012_RUN_CASE",
  "P012_RUN_ALL"
]);

const isMotionApiLabMessageType = (type: string): boolean => motionApiLabMessageTypes.has(type);

figma.ui.onmessage = (message: unknown) => {
  if (!isUiToPluginMessage(message)) {
    postToUi(makeInvalidMessageError("Rejected malformed UI message."));
    return;
  }

  if (message.type === "RESIZE_PLUGIN_WINDOW") {
    const result = resizePluginWindow(figma.ui, message);
    if (!result.ok) {
      postPluginError(message.requestId, result.error);
    }
    return;
  }

  if (message.type === "SCOPE_SCAN_REQUEST") {
    activeScopeScan?.cancel();
    let cancelled = false;
    const cancelHandle = cancellationRegistry.start("scope-scan", message.requestId);
    activeScopeScan = {
      requestId: message.requestId,
      cancel: () => {
        cancelled = true;
        cancelHandle.cancel();
      }
    };
    void scanScope(figma, message.scope, {
      requestId: message.requestId,
      isCancelled: () => cancelled || cancelHandle.isCancelled(),
      onProgress: (progress) => {
        postToUi({
          type: "SCOPE_SCAN_PROGRESS",
          requestId: message.requestId,
          progress
        });
      }
    })
      .then((result) => {
        if (activeScopeScan?.requestId !== message.requestId) {
          return;
        }
        cancellationRegistry.complete("scope-scan", message.requestId);
        activeScopeScan = null;
        postToUi({
          type: "SCOPE_SCAN_RESULT",
          requestId: message.requestId,
          result
        });
      })
      .catch((error: unknown) => {
        if (activeScopeScan?.requestId === message.requestId) {
          cancellationRegistry.complete("scope-scan", message.requestId);
          activeScopeScan = null;
        }
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "SCOPE_SCAN_CANCEL") {
    if (activeScopeScan?.requestId === message.requestId) {
      activeScopeScan.cancel();
    }
    return;
  }

  if (message.type === "MOTION_OPERATION_CANCEL_REQUEST") {
    cancellationRegistry.cancel(message.operation, message.requestId);
    if (message.operation === "motion-inspect" && activeMotionInspectRequestId === message.requestId) {
      activeMotionInspectRequestId = null;
    }
    if (message.operation === "motion-plan" && activeMotionPlanRequestId === message.requestId) {
      activeMotionPlanRequestId = null;
    }
    if (message.operation === "motion-clipboard" && activeMotionClipboardRequestId === message.requestId) {
      activeMotionClipboardRequestId = null;
    }
    if (message.operation === "motion-paste-plan" && activeMotionPastePlanRequestId === message.requestId) {
      activeMotionPastePlanRequestId = null;
    }
    if (message.operation === "standards-storage" && activeStandardsStorageRequestId === message.requestId) {
      activeStandardsStorageRequestId = null;
    }
    return;
  }

  if (message.type === "SCOPE_REVEAL_NODE_REQUEST") {
    void revealScopeNode(message.requestId, message.nodeId);
    return;
  }

  if (message.type === "MOTION_INSPECT_REQUEST") {
    activeMotionInspectRequestId = message.requestId;
    const cancelHandle = cancellationRegistry.start("motion-inspect", message.requestId);
    void inspectMotionTargets(message.nodeIds, {
      requestId: message.requestId,
      isStale: () => activeMotionInspectRequestId !== message.requestId || cancelHandle.isCancelled()
    })
      .then((result) => {
        if (result === null || activeMotionInspectRequestId !== message.requestId) {
          return;
        }
        cancellationRegistry.complete("motion-inspect", message.requestId);
        activeMotionInspectRequestId = null;
        postToUi({
          type: "MOTION_INSPECT_RESULT",
          requestId: message.requestId,
          result
        });
      })
      .catch((error: unknown) => {
        if (activeMotionInspectRequestId === message.requestId) {
          cancellationRegistry.complete("motion-inspect", message.requestId);
          activeMotionInspectRequestId = null;
        }
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "MOTION_PLAN_OPERATION_REQUEST") {
    activeMotionPlanRequestId = message.requestId;
    const cancelHandle = cancellationRegistry.start("motion-plan", message.requestId);
    void readMotionSnapshot(message.nodeId, { requestId: message.requestId })
      .then((snapshot) => {
        if (activeMotionPlanRequestId !== message.requestId || cancelHandle.isCancelled()) {
          return;
        }
        cancellationRegistry.complete("motion-plan", message.requestId);
        activeMotionPlanRequestId = null;
        if (!snapshot.ok) {
          postToUi({
            type: "MOTION_PLAN_OPERATION_RESULT",
            requestId: message.requestId,
            result: {
              ok: false,
              error: {
                code: snapshot.error.code,
                message: snapshot.error.message
              }
            }
          });
          return;
        }
        const plan = planMotionOperation({
          baseSnapshot: snapshot.value,
          operation: message.operation as MotionOperation,
          targetIds: [...message.targetIds],
          idGenerator: () => `plan-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`,
          nowMs: () => Date.now()
        });
        postToUi({
          type: "MOTION_PLAN_OPERATION_RESULT",
          requestId: message.requestId,
          result: plan.ok
            ? { ok: true, plan: plan.value }
            : {
                ok: false,
                error: {
                  code: plan.error.code,
                  message: plan.error.message,
                  path: plan.error.path
                }
              }
        });
      })
      .catch((error: unknown) => {
        if (activeMotionPlanRequestId === message.requestId) {
          cancellationRegistry.complete("motion-plan", message.requestId);
          activeMotionPlanRequestId = null;
        }
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "MOTION_CLIPBOARD_COPY_REQUEST") {
    activeMotionClipboardRequestId = message.requestId;
    const cancelHandle = cancellationRegistry.start("motion-clipboard", message.requestId);
    void inspectMotionTargets(message.nodeIds, {
      requestId: message.requestId,
      isStale: () => activeMotionClipboardRequestId !== message.requestId || cancelHandle.isCancelled()
    })
      .then((result) => {
        if (activeMotionClipboardRequestId !== message.requestId || cancelHandle.isCancelled()) {
          return;
        }
        cancellationRegistry.complete("motion-clipboard", message.requestId);
        activeMotionClipboardRequestId = null;
        if (result === null) {
          return;
        }
        const copied = copyMotionToClipboard({
          snapshots: result.snapshots,
          mode: message.mode,
          selectedTrackIds: message.selectedTrackIds,
          nowMs: () => Date.now()
        });
        postToUi({
          type: "MOTION_CLIPBOARD_COPY_RESULT",
          requestId: message.requestId,
          result: copied.ok
            ? { ok: true, clipboard: copied.clipboard, serialized: serializeMotionClipboard(copied.clipboard) }
            : { ok: false, error: { code: copied.code, message: copied.message } }
        });
      })
      .catch((error: unknown) => {
        if (activeMotionClipboardRequestId === message.requestId) {
          cancellationRegistry.complete("motion-clipboard", message.requestId);
          activeMotionClipboardRequestId = null;
        }
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "MOTION_PASTE_PLAN_REQUEST") {
    activeMotionPastePlanRequestId = message.requestId;
    const cancelHandle = cancellationRegistry.start("motion-paste-plan", message.requestId);
    void inspectMotionTargets(message.destinationNodeIds, {
      requestId: message.requestId,
      isStale: () => activeMotionPastePlanRequestId !== message.requestId || cancelHandle.isCancelled()
    })
      .then((result) => {
        if (activeMotionPastePlanRequestId !== message.requestId || cancelHandle.isCancelled()) {
          return;
        }
        cancellationRegistry.complete("motion-paste-plan", message.requestId);
        activeMotionPastePlanRequestId = null;
        if (result === null) {
          return;
        }
        const clipboard = message.clipboard as unknown as MotionClipboard;
        const compatibility = analyzePasteCompatibility(clipboard, result.snapshots);
        const plan = buildPasteChangePlan({
          clipboard,
          destinations: result.snapshots,
          pasteMode: message.pasteMode,
          mapping: message.mapping,
          timing: message.timing,
          idGenerator: () => `paste-${Date.now().toString()}-${Math.random().toString(16).slice(2)}`,
          nowMs: () => Date.now()
        });
        postToUi({
          type: "MOTION_PASTE_PLAN_RESULT",
          requestId: message.requestId,
          result: plan.ok
            ? { ok: true, plan: plan.value, compatibility }
            : { ok: false, error: plan.error }
        });
      })
      .catch((error: unknown) => {
        if (activeMotionPastePlanRequestId === message.requestId) {
          cancellationRegistry.complete("motion-paste-plan", message.requestId);
          activeMotionPastePlanRequestId = null;
        }
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "MOTION_APPLY_CHANGE_PLAN_REQUEST") {
    void executeChangePlan(message.plan, {
      requestId: message.requestId,
      seenRequestIds: appliedChangePlanRequestIds
    })
      .then((result) => {
        postToUi({
          type: "MOTION_APPLY_CHANGE_PLAN_RESULT",
          requestId: message.requestId,
          result
        });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (message.type === "STANDARDS_STORAGE_REQUEST") {
    activeStandardsStorageRequestId = message.requestId;
    const cancelHandle = cancellationRegistry.start("standards-storage", message.requestId);
    void standardsStorage.handle(message.action)
      .then((result) => {
        if (activeStandardsStorageRequestId !== message.requestId || cancelHandle.isCancelled()) {
          return;
        }
        cancellationRegistry.complete("standards-storage", message.requestId);
        activeStandardsStorageRequestId = null;
        postToUi({
          type: "STANDARDS_STORAGE_RESULT",
          requestId: message.requestId,
          result
        });
      })
      .catch((error: unknown) => {
        if (activeStandardsStorageRequestId === message.requestId) {
          cancellationRegistry.complete("standards-storage", message.requestId);
          activeStandardsStorageRequestId = null;
        }
        postPluginError(message.requestId, error);
      });
    return;
  }

  if (isMotionApiLabMessageType(message.type)) {
    if (!__MOTIONOPS_ENABLE_API_LAB__) {
      postToUi(makeInvalidMessageError("Motion API Lab is disabled in this build.", message.requestId));
      return;
    }

    void import("./diagnostics/labHandlers")
      .then(({ handleMotionApiLabMessage }) => {
        handleMotionApiLabMessage(message, { postToUi, postPluginError });
      })
      .catch((error: unknown) => {
        postPluginError(message.requestId, error);
      });
    return;
  }

  postToUi({
    type: "PLUGIN_PONG",
    requestId: message.requestId,
    receivedAtMs: Date.now()
  });
};
