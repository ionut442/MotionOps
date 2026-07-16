export type AnalyticsEventName =
  | "workspace.opened"
  | "scope.scan.completed"
  | "motion.inspect.completed"
  | "motion.preview.created"
  | "motion.apply.completed"
  | "standards.storage.completed"
  | "qa.run.completed"
  | "handoff.export.completed"
  | "help.opened";

export type AnalyticsResult = "success" | "failure" | "cancelled" | "not-applicable";
export type AnalyticsCountBucket = "0" | "1" | "2-5" | "6-20" | "21-100" | "101-plus";
export type AnalyticsDurationBucket = "under-100ms" | "100-500ms" | "500ms-2s" | "2s-10s" | "over-10s";

export interface AnalyticsEvent {
  readonly name: AnalyticsEventName;
  readonly result?: AnalyticsResult;
  readonly safeErrorCode?: string;
  readonly countBucket?: AnalyticsCountBucket;
  readonly durationBucket?: AnalyticsDurationBucket;
  readonly pluginVersion?: string;
}

export interface AnalyticsClient {
  readonly enabled: false;
  track(event: AnalyticsEvent): void;
}

const safeCodePattern = /^[A-Z0-9_:-]{1,64}$/;
const pluginVersionPattern = /^[0-9A-Za-z.+-]{1,32}$/;

export const bucketCount = (count: number): AnalyticsCountBucket => {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count === 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  if (count <= 100) return "21-100";
  return "101-plus";
};

export const bucketDurationMs = (durationMs: number): AnalyticsDurationBucket => {
  if (!Number.isFinite(durationMs) || durationMs < 100) return "under-100ms";
  if (durationMs < 500) return "100-500ms";
  if (durationMs < 2_000) return "500ms-2s";
  if (durationMs < 10_000) return "2s-10s";
  return "over-10s";
};

export const sanitizeAnalyticsEvent = (event: AnalyticsEvent): AnalyticsEvent => ({
  name: event.name,
  ...(event.result === undefined ? {} : { result: event.result }),
  ...(event.safeErrorCode !== undefined && safeCodePattern.test(event.safeErrorCode)
    ? { safeErrorCode: event.safeErrorCode }
    : {}),
  ...(event.countBucket === undefined ? {} : { countBucket: event.countBucket }),
  ...(event.durationBucket === undefined ? {} : { durationBucket: event.durationBucket }),
  ...(event.pluginVersion !== undefined && pluginVersionPattern.test(event.pluginVersion)
    ? { pluginVersion: event.pluginVersion }
    : {})
});

export const createNoopAnalyticsClient = (): AnalyticsClient => ({
  enabled: false,
  track: () => undefined
});

export const analytics = createNoopAnalyticsClient();
