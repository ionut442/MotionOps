import { describe, expect, it } from "vitest";
import {
  analytics,
  bucketCount,
  bucketDurationMs,
  createNoopAnalyticsClient,
  sanitizeAnalyticsEvent
} from "../src/shared/analytics";

describe("disabled analytics boundary", () => {
  it("is disabled and has no observable side effect", () => {
    const client = createNoopAnalyticsClient();
    expect(client.enabled).toBe(false);
    expect(analytics.enabled).toBe(false);
    client.track({ name: "help.opened", result: "success" });
  });

  it("allows only generic event fields", () => {
    const sanitized = sanitizeAnalyticsEvent({
      name: "motion.apply.completed",
      result: "failure",
      safeErrorCode: "APPLY_FAILED",
      countBucket: bucketCount(17),
      durationBucket: bucketDurationMs(1_500),
      pluginVersion: "0.0.0"
    });
    expect(sanitized).toEqual({
      name: "motion.apply.completed",
      result: "failure",
      safeErrorCode: "APPLY_FAILED",
      countBucket: "6-20",
      durationBucket: "500ms-2s",
      pluginVersion: "0.0.0"
    });
  });

  it("rejects unsafe identifiers and raw content shaped error data", () => {
    const serialized = JSON.stringify(
      sanitizeAnalyticsEvent({
        name: "qa.run.completed",
        safeErrorCode: "Layer name / File key / node-id",
        pluginVersion: "0.0.0+client name"
      })
    );
    expect(serialized).not.toContain("Layer name");
    expect(serialized).not.toContain("File key");
    expect(serialized).not.toContain("node-id");
    expect(serialized).toBe(JSON.stringify({ name: "qa.run.completed" }));
  });
});
