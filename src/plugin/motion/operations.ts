import type { TimeMs } from "../../domain/time";
import { stableClone } from "./object";
import type {
  ManualTrackWriteModel,
  MotionAdapterWarning,
  NormalizedEasing,
  NormalizedManualTrack,
  NormalizedTimeline,
  Result
} from "./types";

export type MotionOperation =
  | {
      kind: "empty";
      label?: string;
    }
  | {
      kind: "set-duration";
      durationMs: TimeMs;
      anchor: "preserve-start" | "preserve-end";
    }
  | {
      kind: "replace-easing";
      easing: NormalizedEasing;
    }
  | {
      kind: "set-delay";
      mode: "add" | "remove" | "replace";
      delayMs?: TimeMs;
    }
  | {
      kind: "scale-timing";
      numerator: number;
      denominator: number;
      origin: "start";
    }
  | {
      kind: "spring";
      easing: NormalizedEasing;
    }
  | {
      kind: "paste-motion";
      pasteMode: "replace" | "merge-compatible" | "add-missing-only" | "preserve-timing" | "preserve-easing";
    }
  | {
      kind: "sequencer-draft";
      label: string;
      manualTracks: readonly ManualTrackWriteModel[];
      timelineDurations: readonly { timelineId: string; durationMs: TimeMs }[];
      baseSnapshotId: string;
      warnings: readonly { code: string; itemId?: string; message: string }[];
    };

export interface OperationWarning {
  code:
    | "IDENTITY_OPERATION"
    | "TIMELINE_EXTENSION_REQUIRED"
    | "STYLE_FIELD_READ_ONLY"
    | "SPRING_EDIT_UNVERIFIED"
    | "ZERO_DURATION_RANGE";
  path: string;
  message: string;
  detail?: string;
}

export interface OperationError {
  code:
    | "INVALID_OPERATION"
    | "INVALID_TIME"
    | "INVALID_EASING"
    | "UNSUPPORTED_OPERATION";
  message: string;
  path?: string;
}

export interface ManualTrackTransformResult {
  track: NormalizedManualTrack;
  writeModel: ManualTrackWriteModel;
  warnings: OperationWarning[];
}

type KeyframeCopy = NormalizedManualTrack["keyframes"][number];

export type EasingValidationResult =
  | { ok: true; value: NormalizedEasing }
  | { ok: false; error: OperationError };

export const validateMotionOperation = (operation: MotionOperation): Result<MotionOperation, OperationError> => {
  switch (operation.kind) {
    case "empty":
      return { ok: true, value: operation };
    case "set-duration":
      return validOperationTime(operation.durationMs, "operation.durationMs", operation);
    case "replace-easing": {
      const easing = validateEasing(operation.easing);
      return easing.ok ? { ok: true, value: { ...operation, easing: easing.value } } : easing;
    }
    case "set-delay":
      if (operation.mode === "remove") {
        return { ok: true, value: operation };
      }
      return validOperationTime(operation.delayMs, "operation.delayMs", operation);
    case "scale-timing":
      if (
        !Number.isInteger(operation.numerator) ||
        !Number.isInteger(operation.denominator) ||
        operation.numerator <= 0 ||
        operation.denominator <= 0
      ) {
        return {
          ok: false,
          error: {
            code: "INVALID_OPERATION",
            message: "Timing scale requires positive integer numerator and denominator.",
            path: "operation"
          }
        };
      }
      return { ok: true, value: operation };
    case "spring":
      if (operation.easing.kind !== "spring") {
        return {
          ok: false,
          error: {
            code: "INVALID_EASING",
            message: "Spring operation requires a normalized spring easing.",
            path: "operation.easing"
          }
        };
      }
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_OPERATION",
          message: "Spring editing is not verified for production writes; the planner must keep spring data read-only.",
          path: "operation.easing"
        }
      };
    case "paste-motion":
      return { ok: true, value: operation };
    case "sequencer-draft":
      for (const track of operation.manualTracks) {
        for (const keyframe of track.keyframes) {
          const valid = validateIntegerMs(keyframe.timeMs, `manualTracks.${track.property}.keyframes`);
          if (!valid.ok) {
            return valid;
          }
        }
      }
      for (const timeline of operation.timelineDurations) {
        const valid = validateIntegerMs(timeline.durationMs, `timelines.${timeline.timelineId}.durationMs`);
        if (!valid.ok) {
          return valid;
        }
      }
      return { ok: true, value: operation };
    default:
      return assertNeverOperation(operation);
  }
};

export const validateEasing = (easing: NormalizedEasing): EasingValidationResult => {
  switch (easing.kind) {
    case "linear":
      return { ok: true, value: { kind: "linear" } };
    case "preset":
      return easing.name.trim().length > 0
        ? { ok: true, value: { kind: "preset", name: easing.name } }
        : invalidEasing("Preset easing requires a non-empty name.", "easing.name");
    case "cubic-bezier":
      return validateCubicBezier([easing.x1, easing.y1, easing.x2, easing.y2]);
    case "spring":
      return validateSpring(easing);
    case "unknown":
      return invalidEasing("Unknown easing cannot be selected for replacement.", "easing");
    default:
      return assertNeverEasing(easing);
  }
};

export const parseCubicBezier = (input: string): EasingValidationResult => {
  const match = /^cubic-bezier\((.*)\)$/i.exec(input.trim());
  if (!match) {
    return invalidEasing("Malformed cubic-bezier input.", "easing");
  }
  const values = match[1].split(",").map((part) => Number(part.trim()));
  return validateCubicBezier(values);
};

export const transformManualTrack = (
  source: NormalizedManualTrack,
  operation: MotionOperation,
  timelines: NormalizedTimeline[] = []
): Result<ManualTrackTransformResult, OperationError> => {
  const validation = validateMotionOperation(operation);
  if (!validation.ok) {
    return validation;
  }

  const sourceKeyframes = source.keyframes.map((keyframe) => ({
    ...keyframe,
    value: stableClone(keyframe.value),
    easing: stableClone(keyframe.easing) as NormalizedEasing
  }));
  const warnings: OperationWarning[] = [];
  let keyframes = sourceKeyframes;

  try {
    switch (validation.value.kind) {
      case "empty":
        warnings.push({
          code: "IDENTITY_OPERATION",
          path: `manualTracks.${source.property}`,
          message: "Empty operation produced no manual-track mutation."
        });
        break;
      case "set-duration":
        keyframes = scaleManualDuration(sourceKeyframes, validation.value.durationMs, validation.value.anchor, source.property, warnings);
        break;
      case "replace-easing": {
        const easing = validation.value.easing;
        keyframes = sourceKeyframes.map((keyframe) => ({
          ...keyframe,
          easing: stableClone(easing) as NormalizedEasing
        }));
        break;
      }
      case "set-delay":
        keyframes = shiftManualDelay(sourceKeyframes, validation.value, source.property);
        break;
      case "scale-timing":
        keyframes = scaleAllTiming(sourceKeyframes, validation.value.numerator, validation.value.denominator, source.property);
        break;
      case "spring":
        return {
          ok: false,
          error: {
            code: "UNSUPPORTED_OPERATION",
            message: "Spring editing is not verified for manual-track writes.",
            path: `manualTracks.${source.property}.easing`
          }
        };
      case "paste-motion":
        warnings.push({
          code: "IDENTITY_OPERATION",
          path: `manualTracks.${source.property}`,
          message: "Paste operations are constructed by the paste planner, not by generic track transforms."
        });
        break;
      case "sequencer-draft": {
        const replacement = validation.value.manualTracks.find((track) => track.property === source.property);
        if (replacement === undefined) {
          warnings.push({
            code: "IDENTITY_OPERATION",
            path: `manualTracks.${source.property}`,
            message: "Sequencer draft did not include a local timing change for this track."
          });
          break;
        }
        keyframes = sourceKeyframes.map((keyframe, index) => {
          if (index >= replacement.keyframes.length) {
            return keyframe;
          }
          const next = replacement.keyframes.find(
            (candidate) =>
              candidate.keyframeId !== undefined && keyframe.keyframeId !== undefined && candidate.keyframeId === keyframe.keyframeId
          ) ?? replacement.keyframes[index];
          return {
            ...keyframe,
            timeMs: asTimeMs(next.timeMs),
            value: stableClone(next.value),
            easing: next.easing === undefined ? keyframe.easing : (stableClone(next.easing) as NormalizedEasing)
          };
        });
        break;
      }
      default:
        return assertNeverOperation(validation.value);
    }
  } catch (cause) {
    const operationError = typeof cause === "object" && cause !== null && "operationError" in cause
      ? (cause as { operationError: OperationError }).operationError
      : undefined;
    if (operationError) {
      return { ok: false, error: operationError };
    }
    throw cause;
  }

  const sortedValidation = validateKeyframeTimes(keyframes, source.property);
  if (!sortedValidation.ok) {
    return sortedValidation;
  }
  appendTimelineExtensionWarnings(keyframes, source.property, timelines, warnings);
  const track: NormalizedManualTrack = {
    ...source,
    keyframes,
    warnings: source.warnings.map((warning) => stableClone(warning) as MotionAdapterWarning)
  };
  const writeModel: ManualTrackWriteModel = {
    trackId: source.trackId,
    property: source.property,
    keyframes: keyframes.map((keyframe) => ({
      keyframeId: keyframe.keyframeId,
      timeMs: asTimeMs(keyframe.timeMs),
      value: stableClone(keyframe.value),
      easing: stableClone(keyframe.easing) as NormalizedEasing
    }))
  };
  return { ok: true, value: { track, writeModel, warnings } };
};

const validateIntegerMs = (
  value: unknown,
  path: string
): Result<true, OperationError> => {
  if (!Number.isInteger(value) || (value as number) < 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_TIME",
        message: "Motion time values must be non-negative integer milliseconds.",
        path
      }
    };
  }
  return { ok: true, value: true };
};

const validOperationTime = <T extends MotionOperation>(value: unknown, path: string, operation: T): Result<T, OperationError> => {
  const result = validateIntegerMs(value, path);
  return result.ok ? { ok: true, value: operation } : result;
};

const validateCubicBezier = (values: number[]): EasingValidationResult => {
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return invalidEasing("Cubic-bezier easing requires four finite numbers.", "easing");
  }
  const [x1, y1, x2, y2] = values;
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    return invalidEasing("Cubic-bezier x control points must be in the normalized 0..1 range.", "easing");
  }
  if (y1 < -4 || y1 > 4 || y2 < -4 || y2 > 4) {
    return invalidEasing("Cubic-bezier y control points are outside the accepted Figma/CSS safety range.", "easing");
  }
  return { ok: true, value: { kind: "cubic-bezier", x1, y1, x2, y2 } };
};

const validateSpring = (easing: Extract<NormalizedEasing, { kind: "spring" }>): EasingValidationResult => {
  for (const [key, value] of Object.entries({ mass: easing.mass, stiffness: easing.stiffness, damping: easing.damping })) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      return invalidEasing(`Spring ${key} must be a finite non-negative number.`, `easing.${key}`);
    }
  }
  return { ok: true, value: stableClone(easing) as NormalizedEasing };
};

const invalidEasing = (message: string, path: string): EasingValidationResult => ({
  ok: false,
  error: { code: "INVALID_EASING", message, path }
});

const range = (keyframes: { timeMs: number }[]) => {
  const times = keyframes.map((keyframe) => keyframe.timeMs);
  return { start: Math.min(...times), end: Math.max(...times), duration: Math.max(...times) - Math.min(...times) };
};

const scaleManualDuration = (
  keyframes: KeyframeCopy[],
  durationMs: TimeMs,
  anchor: "preserve-start" | "preserve-end",
  property: string,
  warnings: OperationWarning[]
) => {
  const current = range(keyframes);
  if (current.duration === 0) {
    warnings.push({
      code: "ZERO_DURATION_RANGE",
      path: `manualTracks.${property}.keyframes`,
      message: "Zero-duration manual track cannot scale intermediate keyframes; all keyframes remain anchored."
    });
    return keyframes.map((keyframe) => ({ ...keyframe, timeMs: asTimeMs(anchor === "preserve-end" ? current.end : current.start) }));
  }
  if (durationMs === current.duration) {
    warnings.push({
      code: "IDENTITY_OPERATION",
      path: `manualTracks.${property}.keyframes`,
      message: "Requested duration equals the current manual-track duration."
    });
  }
  return keyframes.map((keyframe) => {
    const offset =
      anchor === "preserve-start"
        ? keyframe.timeMs - current.start
        : current.end - keyframe.timeMs;
    const scaled = Math.round((offset * durationMs) / current.duration);
    return {
      ...keyframe,
      timeMs: asTimeMs(anchor === "preserve-start" ? current.start + scaled : current.end - scaled)
    };
  });
};

const shiftManualDelay = (
  keyframes: KeyframeCopy[],
  operation: Extract<MotionOperation, { kind: "set-delay" }>,
  property: string
) => {
  const current = range(keyframes);
  const shift =
    operation.mode === "add"
      ? operation.delayMs ?? 0
      : operation.mode === "replace"
        ? (operation.delayMs ?? 0) - current.start
        : -current.start;
  const shifted = keyframes.map((keyframe) => ({ ...keyframe, timeMs: asTimeMs(keyframe.timeMs + shift) }));
  const invalid = shifted.find((keyframe) => keyframe.timeMs < 0);
  if (invalid) {
    throwOperationError("INVALID_TIME", "Delay operation would produce a negative keyframe time.", `manualTracks.${property}.keyframes`);
  }
  return shifted;
};

const scaleAllTiming = (
  keyframes: KeyframeCopy[],
  numerator: number,
  denominator: number,
  property: string
) => {
  const current = range(keyframes);
  const scaled = keyframes.map((keyframe) => ({
    ...keyframe,
    timeMs: asTimeMs(current.start + Math.round(((keyframe.timeMs - current.start) * numerator) / denominator))
  }));
  const invalid = scaled.find((keyframe) => keyframe.timeMs < 0);
  if (invalid) {
    throwOperationError("INVALID_TIME", "Timing scale would produce a negative keyframe time.", `manualTracks.${property}.keyframes`);
  }
  return scaled;
};

const validateKeyframeTimes = (
  keyframes: { timeMs: number }[],
  property: string
): Result<true, OperationError> => {
  for (const keyframe of keyframes) {
    if (!Number.isInteger(keyframe.timeMs) || keyframe.timeMs < 0 || !Number.isFinite(keyframe.timeMs)) {
      return {
        ok: false,
        error: {
          code: "INVALID_TIME",
          message: "Manual keyframe output times must be finite non-negative integer milliseconds.",
          path: `manualTracks.${property}.keyframes`
        }
      };
    }
  }
  for (let index = 1; index < keyframes.length; index += 1) {
    if (keyframes[index].timeMs < keyframes[index - 1].timeMs) {
      return {
        ok: false,
        error: {
          code: "INVALID_TIME",
          message: "Manual keyframe output times must remain ordered; duplicate times are preserved.",
          path: `manualTracks.${property}.keyframes.${String(index)}`
        }
      };
    }
  }
  return { ok: true, value: true };
};

const appendTimelineExtensionWarnings = (
  keyframes: { timeMs: number }[],
  property: string,
  timelines: NormalizedTimeline[],
  warnings: OperationWarning[]
) => {
  if (timelines.length === 0) {
    return;
  }
  const max = Math.max(...keyframes.map((keyframe) => keyframe.timeMs));
  const timeline = timelines.find((item) => item.tracks.includes(property)) ?? timelines[0];
  if (max <= timeline.durationMs) {
    return;
  }
  warnings.push({
    code: "TIMELINE_EXTENSION_REQUIRED",
    path: `timelines.${timeline.timelineId}.durationMs`,
    message: "Manual keyframes extend beyond the current timeline duration.",
    detail: `${String(timeline.durationMs)} -> ${String(max)}`
  });
};

const throwOperationError = (code: OperationError["code"], message: string, path: string): never => {
  throw Object.assign(new Error(message), { operationError: { code, message, path } satisfies OperationError });
};

const asTimeMs = (value: number): TimeMs => value as TimeMs;

const assertNeverOperation = (operation: never): never => {
  throw new Error(`Unhandled Motion operation: ${JSON.stringify(operation)}`);
};

const assertNeverEasing = (easing: never): never => {
  throw new Error(`Unhandled easing: ${JSON.stringify(easing)}`);
};
