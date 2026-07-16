import { denormalizeEasing } from "./easing";
import { err, messageForCause, type MotionAdapterError } from "./errors";
import {
  beginMotionLogOperation,
  emitMotionLogEvent,
  metadataForError,
  metadataForSnapshot,
  type MotionLogOptions,
  type MotionLogOperation
} from "./log";
import { millisecondsToSeconds, type TimeMs } from "./time";
import { readMotionSnapshot } from "./read";
import type { ManualTrackWriteModel, MotionSceneNode, MotionSnapshot, Result } from "./types";
import type { VerifiedOperationKind } from "./expectations";

declare const figma: {
  getNodeByIdAsync(nodeId: string): Promise<unknown>;
};

type MotionWritableNode = MotionSceneNode & Record<string, unknown>;

const getWritableNode = async (nodeId: string): Promise<Result<MotionWritableNode, MotionAdapterError>> => {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    return err({ code: "NODE_NOT_FOUND", message: `No node found for ${nodeId}.`, nodeId });
  }
  if (typeof node !== "object" || !("type" in node)) {
    return err({ code: "NODE_UNSUPPORTED", message: `Node ${nodeId} is not a scene node.`, nodeId });
  }
  return { ok: true, value: node as MotionWritableNode };
};

const reread = async (nodeId: string): Promise<Result<MotionSnapshot, MotionAdapterError>> => {
  const snapshot = await readMotionSnapshot(nodeId);
  return snapshot.ok
    ? snapshot
    : err({ ...snapshot.error, code: "REREAD_FAILED", message: `Write succeeded, but re-read failed: ${snapshot.error.message}` });
};

export const replaceManualTrack = async (
  nodeId: string,
  track: ManualTrackWriteModel,
  logOptions: MotionLogOptions = {}
): Promise<Result<MotionSnapshot, MotionAdapterError>> => {
  const operation = beginMotionLogOperation(logOptions);
  emitWriteStarted(logOptions, operation, nodeId, "manual-track-replacement", { affectedEntityCount: track.keyframes.length });
  const validation = validateManualTrack(track, nodeId);
  if (!validation.ok) {
    return failWrite(validation.error, logOptions, operation, "manual-track-replacement");
  }
  const nodeResult = await getWritableNode(nodeId);
  if (!nodeResult.ok) {
    return failWrite(nodeResult.error, logOptions, operation, "manual-track-replacement");
  }
  const apply = nodeResult.value.applyManualKeyframeTrack;
  if (typeof apply !== "function") {
    return failWrite({ code: "WRITE_UNSUPPORTED", message: "Manual track replacement is unavailable on this node.", nodeId }, logOptions, operation, "manual-track-replacement");
  }

  try {
    apply.call(nodeResult.value, { type: "PROPERTY", name: track.property }, toRawManualTrack(track));
    return completeWrite(await reread(nodeId), logOptions, operation, "manual-track-replacement", track.keyframes.length);
  } catch (cause) {
    return failWrite({ code: "TRACK_WRITE_FAILED", message: messageForCause(cause), nodeId, causeMessage: messageForCause(cause) }, logOptions, operation, "manual-track-replacement");
  }
};

export const removeAndReapplyStyle = async (
  nodeId: string,
  ids: { appliedStyleInstanceId: string; availableAnimationStyleId: string },
  logOptions: MotionLogOptions = {}
): Promise<Result<MotionSnapshot, MotionAdapterError>> => {
  const operation = beginMotionLogOperation(logOptions);
  emitWriteStarted(logOptions, operation, nodeId, "animation-style-remove-reapply", { affectedEntityCount: 1 });
  if (ids.appliedStyleInstanceId.trim().length === 0 || ids.availableAnimationStyleId.trim().length === 0) {
    return failWrite({ code: "INVALID_INPUT", message: "Style remove/reapply requires both applied instance ID and available style ID.", nodeId }, logOptions, operation, "animation-style-remove-reapply");
  }
  if (ids.appliedStyleInstanceId === ids.availableAnimationStyleId) {
    return failWrite({
      code: "STYLE_EDIT_RESTRICTED",
      message: "Applied style-instance ID and available application style ID must stay distinct.",
      nodeId
    }, logOptions, operation, "animation-style-remove-reapply");
  }
  const nodeResult = await getWritableNode(nodeId);
  if (!nodeResult.ok) {
    return failWrite(nodeResult.error, logOptions, operation, "animation-style-remove-reapply");
  }
  const remove = nodeResult.value.removeAnimationStyle;
  const apply = nodeResult.value.applyAnimationStyle;
  if (typeof remove !== "function" || typeof apply !== "function") {
    return failWrite({ code: "WRITE_UNSUPPORTED", message: "Style remove/reapply is unavailable on this node.", nodeId }, logOptions, operation, "animation-style-remove-reapply");
  }

  try {
    remove.call(nodeResult.value, ids.appliedStyleInstanceId);
    apply.call(nodeResult.value, ids.availableAnimationStyleId);
    return completeWrite(await reread(nodeId), logOptions, operation, "animation-style-remove-reapply", 1);
  } catch (cause) {
    return failWrite({ code: "WRITE_FAILED", message: messageForCause(cause), nodeId, causeMessage: messageForCause(cause) }, logOptions, operation, "animation-style-remove-reapply");
  }
};

export const setTimelineDuration = async (
  nodeId: string,
  timelineId: string,
  durationMs: TimeMs,
  logOptions: MotionLogOptions = {}
): Promise<Result<MotionSnapshot, MotionAdapterError>> => {
  const operation = beginMotionLogOperation(logOptions);
  emitWriteStarted(logOptions, operation, nodeId, "timeline-duration-update", { affectedEntityCount: 1 });
  const nodeResult = await getWritableNode(nodeId);
  if (!nodeResult.ok) {
    return failWrite(nodeResult.error, logOptions, operation, "timeline-duration-update");
  }
  const setDuration = nodeResult.value.setTimelineDuration;
  if (typeof setDuration !== "function") {
    return failWrite({ code: "WRITE_UNSUPPORTED", message: "Timeline duration writes are unavailable on this node.", nodeId }, logOptions, operation, "timeline-duration-update");
  }

  try {
    const durationSeconds = millisecondsToSeconds(durationMs);
    setDuration.call(nodeResult.value, timelineId, durationSeconds);
    return completeWrite(await reread(nodeId), logOptions, operation, "timeline-duration-update", 1);
  } catch (cause) {
    const message = messageForCause(cause);
    return failWrite({
      code: message.includes("milliseconds") || message.includes("finite") ? "INVALID_TIME" : "TIMELINE_WRITE_FAILED",
      message,
      nodeId,
      path: timelineId,
      causeMessage: message
    }, logOptions, operation, "timeline-duration-update");
  }
};

export const setComponentPropertyValue = async (
  nodeId: string,
  propertyKey: string,
  value: boolean,
  logOptions: MotionLogOptions = {}
): Promise<Result<MotionSnapshot, MotionAdapterError>> => {
  const operation = beginMotionLogOperation(logOptions);
  emitWriteStarted(logOptions, operation, nodeId, "component-property-boolean-write", { affectedEntityCount: 1 });
  const nodeResult = await getWritableNode(nodeId);
  if (!nodeResult.ok) {
    return failWrite(nodeResult.error, logOptions, operation, "component-property-boolean-write");
  }
  const propertyState = asPropertyState(nodeResult.value.componentProperties, propertyKey);
  if (propertyState?.type !== "BOOLEAN") {
    return failWrite({
      code: "UNSUPPORTED_PROPERTY",
      message: "Only CP09-verified BOOLEAN component-property writes are supported by this adapter.",
      nodeId,
      path: propertyKey
    }, logOptions, operation, "component-property-boolean-write");
  }
  const setter = nodeResult.value.setProperties;
  if (typeof setter !== "function") {
    return failWrite({ code: "WRITE_UNSUPPORTED", message: "Component property writes are unavailable on this node.", nodeId }, logOptions, operation, "component-property-boolean-write");
  }

  try {
    setter.call(nodeResult.value, { [propertyKey]: value });
    return completeWrite(await reread(nodeId), logOptions, operation, "component-property-boolean-write", 1);
  } catch (cause) {
    return failWrite({ code: "WRITE_FAILED", message: messageForCause(cause), nodeId, path: propertyKey, causeMessage: messageForCause(cause) }, logOptions, operation, "component-property-boolean-write");
  }
};

const emitWriteStarted = (
  logOptions: MotionLogOptions,
  operation: MotionLogOperation,
  nodeId: string,
  operationKind: VerifiedOperationKind,
  metadata: { affectedEntityCount: number }
): void => {
  emitMotionLogEvent(logOptions.logger, {
    name: "motion.write.started",
    severity: "debug",
    timestamp: operation.timestamp,
    operationId: operation.operationId,
    requestId: operation.requestId,
    nodeId,
    operationKind,
    metadata
  });
};

const completeWrite = (
  result: Result<MotionSnapshot, MotionAdapterError>,
  logOptions: MotionLogOptions,
  operation: MotionLogOperation,
  operationKind: VerifiedOperationKind,
  affectedEntityCount: number
): Result<MotionSnapshot, MotionAdapterError> => {
  if (!result.ok) {
    return failWrite(result.error, logOptions, operation, operationKind, "post-write-read");
  }
  emitMotionLogEvent(logOptions.logger, {
    name: "motion.write.completed",
    severity: result.value.warnings.length > 0 ? "warning" : "info",
    timestamp: operation.timestampNow(),
    operationId: operation.operationId,
    requestId: operation.requestId,
    nodeId: result.value.nodeId,
    operationKind,
    elapsedMs: operation.elapsedMs(),
    metadata: {
      ...metadataForSnapshot(result.value),
      affectedEntityCount,
      postWriteReadOutcome: "success"
    }
  });
  return result;
};

const failWrite = (
  error: MotionAdapterError,
  logOptions: MotionLogOptions,
  operation: MotionLogOperation,
  operationKind: VerifiedOperationKind,
  failureStage = "write"
): Result<MotionSnapshot, MotionAdapterError> => {
  emitMotionLogEvent(logOptions.logger, {
    name: "motion.write.failed",
    severity: "error",
    timestamp: operation.timestampNow(),
    operationId: operation.operationId,
    requestId: operation.requestId,
    nodeId: error.nodeId,
    operationKind,
    elapsedMs: operation.elapsedMs(),
    errorCode: error.code,
    metadata: metadataForError(error, failureStage)
  });
  return err(error);
};

const toRawManualTrack = (track: ManualTrackWriteModel): unknown => ({
  id: track.trackId,
  baseValue: track.baseValue,
  keyframes: track.keyframes.map((keyframe) => ({
    id: keyframe.keyframeId,
    timelinePosition: millisecondsToSeconds(keyframe.timeMs),
    value: keyframe.value,
    easing: denormalizeEasing(keyframe.easing)
  }))
});

const asPropertyState = (properties: unknown, propertyKey: string): { type?: string } | null => {
  if (!isRecord(properties)) {
    return null;
  }
  const value = properties[propertyKey];
  if (!isRecord(value)) {
    return null;
  }
  const type = value.type;
  return typeof type === "string" ? { type } : {};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const validateManualTrack = (track: ManualTrackWriteModel, nodeId: string): Result<true, MotionAdapterError> => {
  if (track.property.trim().length === 0) {
    return err({ code: "INVALID_INPUT", message: "Manual track property is required.", nodeId });
  }
  if (!track.trackId || track.trackId.trim().length === 0) {
    return err({
      code: "INVALID_INPUT",
      message: "Manual track replacement requires the observed track ID from the current snapshot.",
      nodeId,
      path: track.property
    });
  }
  if (track.keyframes.length === 0) {
    return err({ code: "INVALID_INPUT", message: "Manual track replacement requires at least one keyframe.", nodeId, path: track.property });
  }
  const missingId = track.keyframes.find((keyframe) => !keyframe.keyframeId || keyframe.keyframeId.trim().length === 0);
  if (missingId) {
    return err({
      code: "INVALID_INPUT",
      message: "Manual track replacement requires observational keyframe IDs for the accepted full-track write path.",
      nodeId,
      path: track.property
    });
  }
  return { ok: true, value: true };
};
