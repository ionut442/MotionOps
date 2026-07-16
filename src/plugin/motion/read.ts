import { classifyReadCause, err, ok, type MotionAdapterError } from "./errors";
import {
  beginMotionLogOperation,
  emitMotionLogEvent,
  metadataForError,
  metadataForSnapshot,
  type MotionLogOptions
} from "./log";
import { normalizeMotionSnapshot } from "./normalize";
import type { MotionSceneNode, MotionSnapshot, Result } from "./types";

declare const figma: {
  getNodeByIdAsync(nodeId: string): Promise<unknown>;
};

export const readMotionSnapshot = async (
  nodeId: string,
  logOptions: MotionLogOptions = {}
): Promise<Result<MotionSnapshot, MotionAdapterError>> => {
  const operation = beginMotionLogOperation(logOptions);
  emitMotionLogEvent(logOptions.logger, {
    name: "motion.read.started",
    severity: "debug",
    timestamp: operation.timestamp,
    operationId: operation.operationId,
    requestId: operation.requestId,
    nodeId,
    operationKind: "read-motion-snapshot",
    metadata: {}
  });
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      return failRead({ code: "NODE_NOT_FOUND", message: `No node found for ${nodeId}.`, nodeId }, operation, logOptions);
    }
    if (typeof node !== "object" || !("type" in node)) {
      return failRead({ code: "NODE_UNSUPPORTED", message: `Node ${nodeId} is not a scene node.`, nodeId }, operation, logOptions);
    }
    if (!("id" in node) || typeof node.id !== "string" || typeof node.type !== "string") {
      return failRead({ code: "UNKNOWN_API_SHAPE", message: `Node ${nodeId} has an unknown runtime shape.`, nodeId }, operation, logOptions);
    }
    const snapshot = normalizeMotionSnapshot(node as MotionSceneNode);
    emitMotionLogEvent(logOptions.logger, {
      name: "motion.read.completed",
      severity: "info",
      timestamp: operation.timestampNow(),
      operationId: operation.operationId,
      requestId: operation.requestId,
      nodeId,
      operationKind: "read-motion-snapshot",
      elapsedMs: operation.elapsedMs(),
      metadata: metadataForSnapshot(snapshot)
    });
    return ok(snapshot);
  } catch (cause) {
    return failRead(classifyReadCause(cause, nodeId), operation, logOptions);
  }
};

const failRead = (
  error: MotionAdapterError,
  operation: ReturnType<typeof beginMotionLogOperation>,
  logOptions: MotionLogOptions
): Result<MotionSnapshot, MotionAdapterError> => {
  emitMotionLogEvent(logOptions.logger, {
    name: "motion.read.failed",
    severity: "error",
    timestamp: operation.timestampNow(),
    operationId: operation.operationId,
    requestId: operation.requestId,
    nodeId: error.nodeId,
    operationKind: "read-motion-snapshot",
    elapsedMs: operation.elapsedMs(),
    errorCode: error.code,
    metadata: metadataForError(error, "read")
  });
  return err(error);
};
