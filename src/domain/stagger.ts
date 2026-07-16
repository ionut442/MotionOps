import type { TimeMs } from "./time";

export type StaggerTimingMode =
  | "fixed-interval"
  | "total-duration"
  | "fixed-overlap"
  | "sequential-after-end"
  | "start-before-previous-end";

export type StaggerDurationPolicy = "preserve" | "scale-to-fit";
export type StaggerAnchor = "preserve-first-start" | "preserve-last-end" | "extend-timeline";

export interface StaggerOperation {
  readonly kind: "stagger";
  readonly timingMode: StaggerTimingMode;
  readonly durationPolicy: StaggerDurationPolicy;
  readonly anchor: StaggerAnchor;
  readonly intervalMs?: TimeMs;
  readonly totalDurationMs?: TimeMs;
  readonly overlapMs?: TimeMs;
  readonly gapMs?: TimeMs;
}

export interface StaggerItem {
  readonly id: string;
  readonly startMs: TimeMs;
  readonly endMs: TimeMs;
}

export interface StaggeredItem extends StaggerItem {
  readonly originalStartMs: TimeMs;
  readonly originalEndMs: TimeMs;
  readonly durationMs: TimeMs;
  readonly orderIndex: number;
}

export interface StaggerSchedule {
  readonly operation: StaggerOperation;
  readonly items: readonly StaggeredItem[];
  readonly timelineEndMs: TimeMs;
  readonly warnings: readonly StaggerWarning[];
}

export interface StaggerWarning {
  readonly code: "IDENTITY_STAGGER" | "TIMELINE_EXTENSION_REQUIRED";
  readonly itemId?: string;
  readonly message: string;
}

export interface StaggerFailure {
  readonly code:
    | "EMPTY_TARGETS"
    | "INVALID_INTEGER_MS"
    | "INVALID_CONFIGURATION"
    | "IMPOSSIBLE_PRESERVE_DURATION";
  readonly message: string;
  readonly path?: string;
}

export type StaggerResult<T> = { ok: true; value: T } | { ok: false; error: StaggerFailure };

const MIN_DURATION_MS = 1;

export const createFixedIntervalStagger = (
  intervalMs: TimeMs,
  options: Partial<Pick<StaggerOperation, "anchor" | "durationPolicy">> = {}
): StaggerOperation => ({
  kind: "stagger",
  timingMode: "fixed-interval",
  intervalMs,
  anchor: options.anchor ?? "preserve-first-start",
  durationPolicy: options.durationPolicy ?? "preserve"
});

export const validateStaggerOperation = (operation: StaggerOperation): StaggerResult<StaggerOperation> => {
  const common = validateEnum(operation.anchor, ["preserve-first-start", "preserve-last-end", "extend-timeline"], "operation.anchor") ??
    validateEnum(operation.durationPolicy, ["preserve", "scale-to-fit"], "operation.durationPolicy");
  if (common !== null) {
    return common;
  }

  switch (operation.timingMode) {
    case "fixed-interval":
      return validateRequiredInteger(operation.intervalMs, "operation.intervalMs", operation);
    case "total-duration":
      return validateRequiredInteger(operation.totalDurationMs, "operation.totalDurationMs", operation, 1);
    case "fixed-overlap":
      return validateRequiredInteger(operation.overlapMs, "operation.overlapMs", operation);
    case "sequential-after-end":
      return validateRequiredInteger(operation.gapMs ?? 0, "operation.gapMs", operation);
    case "start-before-previous-end":
      return validateRequiredInteger(operation.overlapMs, "operation.overlapMs", operation);
    default:
      return assertNever(operation.timingMode);
  }
};

export const resolveStaggerSchedule = (
  items: readonly StaggerItem[],
  operation: StaggerOperation,
  timelineEndMs: TimeMs = maxEnd(items)
): StaggerResult<StaggerSchedule> => {
  const validation = validateStaggerOperation(operation);
  if (!validation.ok) {
    return validation;
  }
  if (items.length === 0) {
    return { ok: false, error: { code: "EMPTY_TARGETS", message: "Stagger requires at least one target." } };
  }
  const normalized = items.map((item, index) => normalizeItem(item, index));
  const itemValidation = normalized.find((item) =>
    !isIntegerMs(item.startMs) || !isIntegerMs(item.endMs) || item.endMs < item.startMs
  );
  if (itemValidation !== undefined) {
    return {
      ok: false,
      error: {
        code: "INVALID_INTEGER_MS",
        message: "Stagger targets require non-negative integer starts and ends.",
        path: `items.${itemValidation.id}`
      }
    };
  }

  const scheduled = scheduleItems(normalized, validation.value);
  if (!scheduled.ok) {
    return scheduled;
  }
  const anchored = applyAnchor(scheduled.value, validation.value.anchor).map(refreshDuration);
  const warnings: StaggerWarning[] = [];
  if (sameSchedule(normalized, anchored)) {
    warnings.push({ code: "IDENTITY_STAGGER", message: "Stagger did not move or scale any target." });
  }
  const nextTimelineEnd = asTimeMs(Math.max(timelineEndMs, ...anchored.map((item) => item.endMs)));
  if (nextTimelineEnd > timelineEndMs) {
    warnings.push({
      code: "TIMELINE_EXTENSION_REQUIRED",
      message: `Stagger extends the timeline from ${String(timelineEndMs)} ms to ${String(nextTimelineEnd)} ms.`
    });
  }
  return {
    ok: true,
    value: {
      operation: validation.value,
      items: Object.freeze(anchored),
      timelineEndMs: nextTimelineEnd,
      warnings: Object.freeze(warnings)
    }
  };
};

export const shiftTimesByStagger = (
  times: readonly TimeMs[],
  item: StaggeredItem
): readonly TimeMs[] => {
  const originalDuration = Math.max(0, item.originalEndMs - item.originalStartMs);
  const nextDuration = Math.max(0, item.endMs - item.startMs);
  return Object.freeze(times.map((time) => {
    if (originalDuration === 0) {
      return item.startMs;
    }
    return asTimeMs(item.startMs + Math.round(((time - item.originalStartMs) * nextDuration) / originalDuration));
  }));
};

const scheduleItems = (
  items: readonly StaggeredItem[],
  operation: StaggerOperation
): StaggerResult<readonly StaggeredItem[]> => {
  if (items.length === 1) {
    return { ok: true, value: items.map((item) => ({ ...item })) };
  }

  switch (operation.timingMode) {
    case "fixed-interval":
      return { ok: true, value: scheduleByStep(items, operation.intervalMs ?? (0 as TimeMs), operation.durationPolicy) };
    case "fixed-overlap":
      return { ok: true, value: scheduleByPreviousEnd(items, -Number(operation.overlapMs ?? 0), operation.durationPolicy) };
    case "sequential-after-end":
      return { ok: true, value: scheduleByPreviousEnd(items, operation.gapMs ?? 0, operation.durationPolicy) };
    case "start-before-previous-end":
      return { ok: true, value: scheduleByPreviousEnd(items, -Number(operation.overlapMs ?? 0), operation.durationPolicy) };
    case "total-duration":
      return scheduleTotalDuration(items, operation.totalDurationMs ?? (0 as TimeMs), operation.durationPolicy);
    default:
      return assertNever(operation.timingMode);
  }
};

const scheduleByStep = (
  items: readonly StaggeredItem[],
  stepMs: TimeMs,
  durationPolicy: StaggerDurationPolicy
): readonly StaggeredItem[] => {
  const firstStart = items[0].originalStartMs;
  return items.map((item, index) => {
    const duration = durationPolicy === "scale-to-fit" ? item.durationMs : item.durationMs;
    const start = asTimeMs(firstStart + index * stepMs);
    return { ...item, startMs: start, endMs: asTimeMs(start + duration) };
  });
};

const scheduleByPreviousEnd = (
  items: readonly StaggeredItem[],
  gapMs: number,
  durationPolicy: StaggerDurationPolicy
): readonly StaggeredItem[] => {
  const output: StaggeredItem[] = [];
  let cursor: number = items[0].originalStartMs;
  for (const item of items) {
    const duration = durationPolicy === "scale-to-fit" ? item.durationMs : item.durationMs;
    output.push({ ...item, startMs: asTimeMs(cursor), endMs: asTimeMs(cursor + duration) });
    cursor += duration + gapMs;
  }
  return output;
};

const scheduleTotalDuration = (
  items: readonly StaggeredItem[],
  totalDurationMs: TimeMs,
  durationPolicy: StaggerDurationPolicy
): StaggerResult<readonly StaggeredItem[]> => {
  const firstStart = items[0].originalStartMs;
  if (durationPolicy === "preserve") {
    const totalItemDuration = items.reduce((sum, item) => sum + item.durationMs, 0);
    if (totalItemDuration > totalDurationMs) {
      return {
        ok: false,
        error: {
          code: "IMPOSSIBLE_PRESERVE_DURATION",
          message: "Preserve-duration total stagger is impossible because target durations exceed the requested total.",
          path: "operation.totalDurationMs"
        }
      };
    }
    const gap = items.length <= 1 ? 0 : Math.round((totalDurationMs - totalItemDuration) / (items.length - 1));
    return { ok: true, value: scheduleByPreviousEnd(items, gap, "preserve") };
  }

  const originalStart = Math.min(...items.map((item) => item.originalStartMs));
  const originalEnd = Math.max(...items.map((item) => item.originalEndMs));
  const originalDuration = originalEnd - originalStart;
  if (originalDuration <= 0) {
    return {
      ok: false,
      error: { code: "INVALID_CONFIGURATION", message: "Scale-to-fit requires a positive source duration.", path: "items" }
    };
  }
  return {
    ok: true,
    value: items.map((item) => {
      const start = firstStart + Math.round(((item.originalStartMs - originalStart) * totalDurationMs) / originalDuration);
      const end = firstStart + Math.round(((item.originalEndMs - originalStart) * totalDurationMs) / originalDuration);
      return { ...item, startMs: asTimeMs(start), endMs: asTimeMs(Math.max(start + MIN_DURATION_MS, end)) };
    })
  };
};

const applyAnchor = (items: readonly StaggeredItem[], anchor: StaggerAnchor): readonly StaggeredItem[] => {
  if (anchor === "extend-timeline") {
    return items.map((item) => ({ ...item }));
  }
  const currentFirst = items[0].startMs;
  const currentLast = Math.max(...items.map((item) => item.endMs));
  const wantedFirst = items[0].originalStartMs;
  const wantedLast = Math.max(...items.map((item) => item.originalEndMs));
  const shift = anchor === "preserve-first-start" ? wantedFirst - currentFirst : wantedLast - currentLast;
  return items.map((item) => ({
    ...item,
    startMs: asTimeMs(item.startMs + shift),
    endMs: asTimeMs(item.endMs + shift)
  }));
};

const normalizeItem = (item: StaggerItem, index: number): StaggeredItem => ({
  ...item,
  originalStartMs: item.startMs,
  originalEndMs: item.endMs,
  durationMs: asTimeMs(item.endMs - item.startMs),
  orderIndex: index
});

const refreshDuration = (item: StaggeredItem): StaggeredItem => ({
  ...item,
  durationMs: asTimeMs(item.endMs - item.startMs)
});

const validateRequiredInteger = <T extends StaggerOperation>(
  value: unknown,
  path: string,
  operation: T,
  minimum = 0
): StaggerResult<T> =>
  isIntegerMs(value) && (value as number) >= minimum
    ? { ok: true, value: operation }
    : {
        ok: false,
        error: {
          code: "INVALID_INTEGER_MS",
          message: `Stagger value at ${path} must be an integer millisecond value >= ${String(minimum)}.`,
          path
        }
      };

const validateEnum = <T extends string>(value: T, values: readonly T[], path: string): StaggerResult<never> | null =>
  values.includes(value)
    ? null
    : { ok: false, error: { code: "INVALID_CONFIGURATION", message: `Invalid stagger option at ${path}.`, path } };

const sameSchedule = (before: readonly StaggeredItem[], after: readonly StaggeredItem[]) =>
  before.every((item, index) => item.startMs === after[index].startMs && item.endMs === after[index].endMs);

const maxEnd = (items: readonly StaggerItem[]): TimeMs =>
  asTimeMs(Math.max(0, ...items.map((item) => item.endMs)));

const isIntegerMs = (value: unknown): value is TimeMs =>
  Number.isInteger(value) && Number.isFinite(value) && (value as number) >= 0;

const asTimeMs = (value: number): TimeMs => Math.round(value) as TimeMs;

const assertNever = (value: never): never => {
  throw new Error(`Unhandled stagger value: ${JSON.stringify(value)}`);
};
