import type { Result } from "./types";

export type MotionAdapterErrorCode =
  | "API_UNAVAILABLE"
  | "NODE_NOT_FOUND"
  | "PAGE_NOT_LOADED"
  | "NODE_UNSUPPORTED"
  | "UNKNOWN_API_SHAPE"
  | "READ_FAILED"
  | "WRITE_UNSUPPORTED"
  | "UNSUPPORTED_PROPERTY"
  | "STYLE_EDIT_RESTRICTED"
  | "INVALID_TIME"
  | "INVALID_EASING"
  | "WRITE_FAILED"
  | "TRACK_WRITE_FAILED"
  | "TIMELINE_WRITE_FAILED"
  | "REREAD_FAILED"
  | "VERIFICATION_MISMATCH"
  | "INVALID_INPUT";

export interface MotionAdapterError {
  code: MotionAdapterErrorCode;
  message: string;
  nodeId?: string;
  path?: string;
  causeMessage?: string;
}

export const ok = <T>(value: T): Result<T, MotionAdapterError> => ({ ok: true, value });

export const err = (error: MotionAdapterError): Result<never, MotionAdapterError> => ({
  ok: false,
  error
});

export const messageForCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "Unknown Motion adapter failure.";

export const classifyReadCause = (cause: unknown, nodeId: string): MotionAdapterError => {
  const message = messageForCause(cause);
  const lower = message.toLowerCase();
  if (lower.includes("not loaded") || lower.includes("page") || lower.includes("dynamic-page")) {
    return { code: "PAGE_NOT_LOADED", message, nodeId, causeMessage: message };
  }
  if (lower.includes("figma") && lower.includes("undefined")) {
    return { code: "API_UNAVAILABLE", message, nodeId, causeMessage: message };
  }
  return { code: "READ_FAILED", message, nodeId, causeMessage: message };
};
