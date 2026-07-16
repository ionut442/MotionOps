import type { MotionAdapterError, MotionAdapterErrorCode } from "./errors";
import type { MotionVerificationReport } from "./diff";
import type { MotionStaleCheckResult } from "./stale-detection";
import type { MotionSnapshot } from "./types";
import type { VerifiedOperationKind } from "./expectations";

export type MotionLogSeverity = "debug" | "info" | "warning" | "error";

export type MotionLogEventName =
  | "motion.read.started"
  | "motion.read.completed"
  | "motion.read.failed"
  | "motion.write.started"
  | "motion.write.completed"
  | "motion.write.failed"
  | "motion.verification.completed"
  | "motion.stale_check.completed";

export type MotionLoggedOperationKind = VerifiedOperationKind | "read-motion-snapshot" | "direct-animation-style-reapply";

export type MotionLogMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[]
  | readonly boolean[]
  | { readonly [key: string]: MotionLogMetadataValue };

export type MotionLogMetadata = Readonly<Record<string, MotionLogMetadataValue>>;

interface MotionLogEventBase {
  readonly name: MotionLogEventName;
  readonly severity: MotionLogSeverity;
  readonly timestamp: string;
  readonly operationId: string;
  readonly requestId?: string;
  readonly nodeId?: string;
  readonly operationKind: MotionLoggedOperationKind;
  readonly metadata: MotionLogMetadata;
}

export interface MotionReadStartedEvent extends MotionLogEventBase {
  readonly name: "motion.read.started";
  readonly severity: "debug";
  readonly operationKind: "read-motion-snapshot";
}

export interface MotionReadCompletedEvent extends MotionLogEventBase {
  readonly name: "motion.read.completed";
  readonly severity: "info";
  readonly operationKind: "read-motion-snapshot";
  readonly elapsedMs: number;
}

export interface MotionReadFailedEvent extends MotionLogEventBase {
  readonly name: "motion.read.failed";
  readonly severity: "error";
  readonly operationKind: "read-motion-snapshot";
  readonly elapsedMs: number;
  readonly errorCode: MotionAdapterErrorCode;
}

export interface MotionWriteStartedEvent extends MotionLogEventBase {
  readonly name: "motion.write.started";
  readonly severity: "debug";
  readonly operationKind: VerifiedOperationKind | "direct-animation-style-reapply";
}

export interface MotionWriteCompletedEvent extends MotionLogEventBase {
  readonly name: "motion.write.completed";
  readonly severity: "info" | "warning";
  readonly operationKind: VerifiedOperationKind | "direct-animation-style-reapply";
  readonly elapsedMs: number;
}

export interface MotionWriteFailedEvent extends MotionLogEventBase {
  readonly name: "motion.write.failed";
  readonly severity: "error";
  readonly operationKind: VerifiedOperationKind | "direct-animation-style-reapply";
  readonly elapsedMs: number;
  readonly errorCode: MotionAdapterErrorCode;
}

export interface MotionVerificationCompletedEvent extends MotionLogEventBase {
  readonly name: "motion.verification.completed";
  readonly severity: "info" | "warning" | "error";
  readonly operationKind: VerifiedOperationKind;
  readonly elapsedMs: number;
}

export interface MotionStaleCheckCompletedEvent extends MotionLogEventBase {
  readonly name: "motion.stale_check.completed";
  readonly severity: "info" | "warning" | "error";
  readonly operationKind: VerifiedOperationKind | "direct-animation-style-reapply";
  readonly elapsedMs: number;
}

export type MotionLogEvent =
  | MotionReadStartedEvent
  | MotionReadCompletedEvent
  | MotionReadFailedEvent
  | MotionWriteStartedEvent
  | MotionWriteCompletedEvent
  | MotionWriteFailedEvent
  | MotionVerificationCompletedEvent
  | MotionStaleCheckCompletedEvent;

export interface MotionLogger {
  log(event: MotionLogEvent): void;
}

export interface MotionLogClock {
  now(): number;
  isoNow(): string;
}

export type MotionOperationIdGenerator = () => string;

export interface MotionLogOptions {
  logger?: MotionLogger;
  clock?: MotionLogClock;
  operationIdGenerator?: MotionOperationIdGenerator;
  operationId?: string;
  requestId?: string;
}

export interface MotionLogOperation {
  readonly operationId: string;
  readonly requestId?: string;
  readonly startedAtMs: number;
  readonly timestamp: string;
  elapsedMs(): number;
  timestampNow(): string;
}

export const noopMotionLogger: MotionLogger = {
  log: () => undefined
};

export class InMemoryMotionLogger implements MotionLogger {
  readonly events: MotionLogEvent[] = [];

  log(event: MotionLogEvent): void {
    this.events.push(event);
  }

  clear(): void {
    this.events.length = 0;
  }
}

export interface DevelopmentConsoleMotionLoggerOptions {
  includeStack?: boolean;
  console?: Pick<Console, "log">;
}

export class DevelopmentConsoleMotionLogger implements MotionLogger {
  private readonly output: Pick<Console, "log">;

  constructor(private readonly options: DevelopmentConsoleMotionLoggerOptions = {}) {
    this.output = options.console ?? console;
  }

  log(event: MotionLogEvent): void {
    const metadata = sanitizeMotionLogMetadata({
      ...event.metadata,
      elapsedMs: "elapsedMs" in event ? event.elapsedMs : null,
      errorCode: "errorCode" in event ? event.errorCode : null
    });
    const record = {
      name: event.name,
      severity: event.severity,
      timestamp: event.timestamp,
      operationId: event.operationId,
      requestId: event.requestId ?? null,
      nodeId: event.nodeId ?? null,
      operationKind: event.operationKind,
      ...metadata
    };
    this.output.log(JSON.stringify(record));
  }
}

let localOperationCounter = 0;

export const createLocalMotionOperationId = (): string => {
  localOperationCounter += 1;
  return `mo-${localOperationCounter.toString(36)}`;
};

export const systemMotionLogClock: MotionLogClock = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString()
};

export const beginMotionLogOperation = (options: MotionLogOptions = {}): MotionLogOperation => {
  const clock = options.clock ?? systemMotionLogClock;
  const startedAtMs = safeNow(clock);
  const timestamp = safeIsoNow(clock);
  const generated = safeGenerateOperationId(options.operationIdGenerator ?? createLocalMotionOperationId);
  return {
    operationId: safeId(options.operationId) ?? generated,
    requestId: safeId(options.requestId),
    startedAtMs,
    timestamp,
    elapsedMs: () => Math.max(0, safeNow(clock) - startedAtMs),
    timestampNow: () => safeIsoNow(clock)
  };
};

export const emitMotionLogEvent = (logger: MotionLogger | undefined, event: MotionLogEvent): void => {
  try {
    (logger ?? noopMotionLogger).log({ ...event, metadata: sanitizeMotionLogMetadata(event.metadata) });
  } catch {
    return;
  }
};

export const sanitizeMotionLogMetadata = (metadata: MotionLogMetadata): MotionLogMetadata => {
  const output: Record<string, MotionLogMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right))) {
    if (isForbiddenLogKey(key)) {
      continue;
    }
    const sanitized = sanitizeMetadataValue(value);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return output;
};

export const metadataForSnapshot = (snapshot: MotionSnapshot): MotionLogMetadata => ({
  nodeType: snapshot.nodeType,
  manualTrackCount: snapshot.manualTracks.length,
  styleInstanceCount: snapshot.styleInstances.length,
  timelineCount: snapshot.timelines.length,
  derivedAnimationCount: snapshot.derivedAnimations.length,
  warningCount: snapshot.warnings.length,
  warningCodes: warningCodes(snapshot.warnings),
  sourceKind: snapshot.sources.kind
});

export const metadataForVerificationReport = (report: MotionVerificationReport): MotionLogMetadata => ({
  verificationStatus: report.status,
  differenceCount: report.differences.length,
  differenceCodes: sortedCodes(report.differences.map((difference) => difference.code)),
  warningCodes: sortedCodes(report.warnings.map((warning) => warning.code)),
  warningCount: report.warnings.length + report.adapterWarnings.length,
  adapterWarningCodes: warningCodes(report.adapterWarnings)
});

export const metadataForStaleCheckResult = (result: MotionStaleCheckResult): MotionLogMetadata => ({
  staleCheckStatus: result.status,
  differenceCount: result.status === "current" ? 0 : result.differences.length,
  differenceCodes: result.status === "current" ? [] : sortedCodes(result.differences.map((difference) => difference.code)),
  warningCodes: sortedCodes(result.warnings.map((warning) => warning.code)),
  warningCount: result.warnings.length,
  nodeType: result.currentSnapshot?.nodeType ?? result.guard.projection.nodeType
});

export const metadataForError = (error: MotionAdapterError, failureStage: string): MotionLogMetadata => ({
  errorCode: error.code,
  failureStage,
  recoverable: error.code === "PAGE_NOT_LOADED" || error.code === "REREAD_FAILED" || error.code === "WRITE_UNSUPPORTED",
  hasPath: typeof error.path === "string" && error.path.length > 0
});

export const warningCodes = (warnings: readonly { code: string }[]): string[] =>
  sortedCodes(warnings.map((warning) => warning.code));

export const sortedCodes = (codes: readonly string[]): string[] => [...new Set(codes)].sort();

export const severityForVerificationStatus = (status: MotionVerificationReport["status"]): "info" | "warning" | "error" => {
  switch (status) {
    case "verified":
      return "info";
    case "verified-with-warning":
    case "partial":
    case "unverifiable":
      return "warning";
    case "mismatch":
      return "error";
    default:
      return assertNever(status);
  }
};

export const severityForStaleStatus = (status: MotionStaleCheckResult["status"]): "info" | "warning" | "error" => {
  switch (status) {
    case "current":
      return "info";
    case "unverifiable":
      return "warning";
    case "stale":
      return "error";
    default:
      return assertNever(status);
  }
};

const sanitizeMetadataValue = (value: MotionLogMetadataValue): MotionLogMetadataValue | undefined => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.every((item): item is string => typeof item === "string")) {
      return [...value].sort();
    }
    if (value.every((item): item is number => typeof item === "number")) {
      return [...value];
    }
    if (value.every((item): item is boolean => typeof item === "boolean")) {
      return [...value];
    }
    return undefined;
  }
  if (!isMetadataObject(value)) {
    return undefined;
  }
  const nested: Record<string, MotionLogMetadataValue> = {};
  for (const [key, child] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (isForbiddenLogKey(key)) {
      continue;
    }
    const sanitized = sanitizeMetadataValue(child);
    if (sanitized !== undefined) {
      nested[key] = sanitized;
    }
  }
  return nested;
};

const isForbiddenLogKey = (key: string): boolean =>
  /(?:file|page|layer|text|copy|value|snapshot|figma|screenshot|pluginData|standard|client|organization|raw|expected|actual|stack|message|content)/i.test(
    key
  );

const isMetadataObject = (value: MotionLogMetadataValue): value is Readonly<Record<string, MotionLogMetadataValue>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeId = (value: string | undefined): string | undefined =>
  typeof value === "string" && /^[A-Za-z0-9:_-]{1,96}$/.test(value) ? value : undefined;

const safeGenerateOperationId = (generator: MotionOperationIdGenerator): string => {
  try {
    return safeId(generator()) ?? createLocalMotionOperationId();
  } catch {
    return createLocalMotionOperationId();
  }
};

const safeNow = (clock: MotionLogClock): number => {
  try {
    const value = clock.now();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const safeIsoNow = (clock: MotionLogClock): string => {
  try {
    const value = clock.isoNow();
    return typeof value === "string" && value.length > 0 ? value : "1970-01-01T00:00:00.000Z";
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
};

const assertNever = (value: never): never => {
  throw new Error(`Unhandled Motion log status: ${String(value)}`);
};
