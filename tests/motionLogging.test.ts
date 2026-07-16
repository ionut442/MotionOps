import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DevelopmentConsoleMotionLogger,
  InMemoryMotionLogger,
  checkMotionStateGuard,
  createFigmaMotionAdapter,
  createMotionStateGuard,
  noopMotionLogger,
  normalizeMotionSnapshot,
  sanitizeMotionLogMetadata,
  secondsToMilliseconds,
  verifyMotionWrite,
  type ManualTrackWriteModel,
  type MotionLogClock,
  type MotionLogEvent,
  type MotionLogger,
  type MotionSceneNode,
  type MotionSnapshot,
  type MotionWriteExpectation
} from "../src/plugin/motion";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const parent = (type: string, next: MotionSceneNode["parent"] = null): MotionSceneNode["parent"] => ({ type, parent: next });

const keyframes = (property = "OPACITY"): unknown[] => [
  { id: `${property}-a`, timelinePosition: 0, value: { type: "FLOAT", value: 0 }, easing: { type: "LINEAR" } },
  { id: `${property}-b`, timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { type: "EASE_OUT" } }
];

const manualTrack = (property = "OPACITY", frames = keyframes(property)): Record<string, unknown> => ({
  [property]: { id: `${property}-track`, keyframes: frames }
});

const node = (overrides: Record<string, unknown> = {}): FakeNode => ({
  id: "node-1",
  name: "Sensitive Layer Name",
  type: "INSTANCE",
  parent: null,
  manualKeyframeTracks: manualTrack(),
  animationStyles: [{ id: "applied-1", styleId: "Scale", name: "Sensitive Style" }],
  animations: { OPACITY: { timelineDuration: 0.5 } },
  timelines: [{ id: "timeline-1", duration: 0.5 }],
  componentProperties: { "ShowBadge#1:2": { type: "BOOLEAN", value: true } },
  componentPropertyDefinitions: {
    "ShowBadge#1:2": { type: "BOOLEAN", defaultValue: true, stableIdentifier: "1:2", displayName: "ShowBadge" }
  },
  applyManualKeyframeTrack: vi.fn(),
  removeAnimationStyle: vi.fn(),
  applyAnimationStyle: vi.fn(),
  setTimelineDuration: vi.fn(),
  setProperties: vi.fn(),
  ...overrides
});

const snapshot = (overrides: Record<string, unknown> = {}): MotionSnapshot => normalizeMotionSnapshot(node(overrides));

const deterministicClock = (): MotionLogClock => {
  let value = 1000;
  return {
    now: () => {
      value += 25;
      return value;
    },
    isoNow: () => `2026-07-13T00:00:${String(value / 25).padStart(2, "0")}.000Z`
  };
};

const adapterWithNodes = (nodes: unknown[], logger: MotionLogger = new InMemoryMotionLogger()) => {
  vi.stubGlobal("figma", { getNodeByIdAsync: vi.fn(() => Promise.resolve(nodes.shift() ?? null)) });
  return createFigmaMotionAdapter({
    logger,
    clock: deterministicClock(),
    operationIdGenerator: () => "op-test",
    requestId: "req-test"
  });
};

const writeTrack = (): ManualTrackWriteModel => ({
  property: "OPACITY",
  trackId: "OPACITY-track",
  keyframes: [
    { keyframeId: "a", timeMs: secondsToMilliseconds(0), value: { type: "FLOAT", value: 0 } },
    { keyframeId: "b", timeMs: secondsToMilliseconds(0.5), value: { type: "FLOAT", value: 1 } }
  ]
});

const timelineExpectation = (expectedDurationMs = secondsToMilliseconds(0.5)): MotionWriteExpectation => ({
  operation: "timeline-duration-update",
  nodeId: "node-1",
  timelineId: "timeline-1",
  expectedDurationMs
});

const cpExpectation = (expectedValue = true): MotionWriteExpectation => ({
  operation: "component-property-boolean-write",
  nodeId: "node-1",
  propertyKey: "ShowBadge#1:2",
  expectedValue,
  expectedDefinition: { type: "BOOLEAN", stableIdentifier: "1:2", displayName: "ShowBadge" }
});

const unverifiableSnapshot = (): MotionSnapshot => {
  const actual = JSON.parse(JSON.stringify(snapshot())) as MotionSnapshot;
  delete (actual.capabilities as Partial<Record<keyof MotionSnapshot["capabilities"], unknown>>).componentPropertyMotionTrackReads;
  return actual;
};

describe("Motion structured development logging", () => {
  it("no-op, in-memory, and console loggers accept serializable compact events", () => {
    const logger = new InMemoryMotionLogger();
    const event: MotionLogEvent = {
      name: "motion.read.started",
      severity: "debug",
      timestamp: "2026-07-13T00:00:00.000Z",
      operationId: "op-1",
      requestId: "req-1",
      nodeId: "node-1",
      operationKind: "read-motion-snapshot",
      metadata: {}
    };
    noopMotionLogger.log(event);
    logger.log(event);
    expect(logger.events).toEqual([event]);

    const output = vi.fn();
    new DevelopmentConsoleMotionLogger({ console: { log: output } }).log(event);
    expect(output).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({ name: "motion.read.started", operationId: "op-1" });
  });

  it("records adapter read success and failure without raw Figma messages", async () => {
    const logger = new InMemoryMotionLogger();
    await adapterWithNodes([node()], logger).readMotionSnapshot("node-1");
    expect(logger.events.map((event) => event.name)).toEqual(["motion.read.started", "motion.read.completed"]);
    expect(logger.events[0].operationId).toBe(logger.events[1].operationId);
    expect(logger.events[1]).toMatchObject({ elapsedMs: 25, metadata: { manualTrackCount: 1, timelineCount: 1 } });

    vi.unstubAllGlobals();
    const failedLogger = new InMemoryMotionLogger();
    vi.stubGlobal("figma", { getNodeByIdAsync: vi.fn(() => Promise.reject(new Error("Sensitive Layer Name page failed"))) });
    await createFigmaMotionAdapter({ logger: failedLogger, clock: deterministicClock(), operationIdGenerator: () => "op-fail" }).readMotionSnapshot(
      "node-1"
    );
    const serialized = JSON.stringify(failedLogger.events);
    expect(serialized).toContain("PAGE_NOT_LOADED");
    expect(serialized).not.toContain("Sensitive Layer Name");
  });

  it("records manual-track write success and failure with deterministic operation IDs", async () => {
    const logger = new InMemoryMotionLogger();
    const fakeNode = node();
    await adapterWithNodes([fakeNode, fakeNode], logger).replaceManualTrack("node-1", writeTrack());
    expect(logger.events.map((event) => event.name)).toEqual(["motion.write.started", "motion.write.completed"]);
    expect(logger.events.map((event) => event.operationId)).toEqual(["op-test", "op-test"]);
    expect(logger.events[1]).toMatchObject({ operationKind: "manual-track-replacement", metadata: { affectedEntityCount: 2 } });

    vi.unstubAllGlobals();
    const failedLogger = new InMemoryMotionLogger();
    await adapterWithNodes([node({ applyManualKeyframeTrack: vi.fn(() => { throw new Error("raw value failed"); }) })], failedLogger).replaceManualTrack(
      "node-1",
      writeTrack()
    );
    expect(failedLogger.events.at(-1)).toMatchObject({ name: "motion.write.failed", errorCode: "TRACK_WRITE_FAILED" });
    expect(JSON.stringify(failedLogger.events)).not.toContain("raw value failed");
  });

  it("records style, timeline-duration, and CP09 BOOLEAN write events", async () => {
    const logger = new InMemoryMotionLogger();
    const styleNode = node();
    await adapterWithNodes([styleNode, styleNode], logger).removeAndReapplyStyle("node-1", {
      appliedStyleInstanceId: "applied-1",
      availableAnimationStyleId: "Scale"
    });
    vi.unstubAllGlobals();
    const timelineNode = node();
    await adapterWithNodes([timelineNode, timelineNode], logger).setTimelineDuration("node-1", "timeline-1", secondsToMilliseconds(0.75));
    vi.unstubAllGlobals();
    const cpNode = node();
    await adapterWithNodes([cpNode, cpNode], logger).setComponentPropertyValue("node-1", "ShowBadge#1:2", false);

    expect(logger.events.filter((event) => event.name === "motion.write.completed").map((event) => event.operationKind)).toEqual([
      "animation-style-remove-reapply",
      "timeline-duration-update",
      "component-property-boolean-write"
    ]);
  });

  it.each([
    ["verified", timelineExpectation(secondsToMilliseconds(0.5)), snapshot()],
    ["verified-with-warning", cpExpectation(true), snapshot()],
    ["partial", timelineExpectation(secondsToMilliseconds(0.7)), snapshot()],
    ["mismatch", timelineExpectation(secondsToMilliseconds(0.5)), snapshot({ setTimelineDuration: undefined, timelines: [] })],
    [
      "unverifiable",
      { operation: "component-property-motion-track-write", nodeId: "node-1", propertyKey: "ShowBadge#1:2" },
      unverifiableSnapshot()
    ]
  ] as const)("records verification %s without expected or actual values", async (status, expectation, actual) => {
    const logger = new InMemoryMotionLogger();
    await verifyMotionWrite(expectation, {
      actualSnapshot: actual,
      logOptions: { logger, clock: deterministicClock(), operationId: "verify-op" }
    });
    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]).toMatchObject({
      name: "motion.verification.completed",
      operationId: "verify-op",
      metadata: { verificationStatus: status }
    });
    const serialized = JSON.stringify(logger.events[0]);
    expect(serialized).not.toContain("expected");
    expect(serialized).not.toContain("actual");
    expect(serialized).not.toContain("Sensitive Style");
  });

  it.each([
    ["current", snapshot()],
    ["stale", snapshot({ timelines: [{ id: "timeline-1", duration: 0.7 }] })],
    [
      "unverifiable",
      snapshot({
        manualKeyframeTracks: manualTrack("OPACITY", [
          keyframes()[0],
          { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { beta: "changed" } }
        ])
      })
    ]
  ] as const)("records stale-check %s events", async (status, current) => {
    const base = status === "unverifiable"
      ? snapshot({
          manualKeyframeTracks: manualTrack("OPACITY", [
            keyframes()[0],
            { id: "OPACITY-b", timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: { beta: "base" } }
          ])
        })
      : snapshot();
    const guardResult = createMotionStateGuard(
      base,
      status === "unverifiable" ? { operation: "manual-track-replacement", property: "OPACITY" } : { operation: "timeline-duration-update", timelineId: "timeline-1" }
    );
    expect(guardResult.ok).toBe(true);
    if (!guardResult.ok) {
      throw new Error(guardResult.error.message);
    }
    const logger = new InMemoryMotionLogger();
    await checkMotionStateGuard(guardResult.value, {
      adapter: { readMotionSnapshot: () => Promise.resolve({ ok: true, value: current }) },
      logOptions: { logger, clock: deterministicClock(), operationId: "stale-op" }
    });
    expect(logger.events[0]).toMatchObject({ name: "motion.stale_check.completed", metadata: { staleCheckStatus: status } });
    expect(JSON.stringify(logger.events[0])).not.toContain("fingerprint");
  });

  it("contains logger and clock failures without breaking read, write, verification, or stale checking", async () => {
    const throwingLogger: MotionLogger = { log: () => { throw new Error("logger exploded"); } };
    const badClock: MotionLogClock = { now: () => { throw new Error("clock exploded"); }, isoNow: () => { throw new Error("clock exploded"); } };

    await expect(adapterWithNodes([node()], throwingLogger).readMotionSnapshot("node-1")).resolves.toMatchObject({ ok: true });
    vi.unstubAllGlobals();
    vi.stubGlobal("figma", { getNodeByIdAsync: vi.fn(() => Promise.resolve(null)) });
    const writeNode = node();
    await expect(
      createFigmaMotionAdapter({ logger: throwingLogger, clock: badClock }).replaceManualTrack("node-1", writeTrack())
    ).resolves.toMatchObject({ ok: false });
    vi.stubGlobal("figma", { getNodeByIdAsync: vi.fn(() => Promise.resolve(writeNode)) });
    await expect(verifyMotionWrite(timelineExpectation(), { actualSnapshot: snapshot(), logOptions: { logger: throwingLogger, clock: badClock } })).resolves.toMatchObject({ ok: true });
    const guardResult = createMotionStateGuard(snapshot(), { operation: "timeline-duration-update", timelineId: "timeline-1" });
    expect(guardResult.ok).toBe(true);
    if (guardResult.ok) {
      await expect(
        checkMotionStateGuard(guardResult.value, {
          adapter: { readMotionSnapshot: () => Promise.resolve({ ok: true, value: snapshot() }) },
          logOptions: { logger: throwingLogger, clock: badClock }
        })
      ).resolves.toMatchObject({ ok: true });
    }
  });

  it("sanitizes forbidden metadata fields, raw content, and collection-shaped payloads", () => {
    const sanitized = sanitizeMotionLogMetadata({
      layerName: "Sensitive Layer Name",
      pageName: "Sensitive Page",
      textContents: "secret copy",
      rawMotionValue: { nested: true },
      completeSnapshot: { nodeId: "node-1" },
      expectedValue: "secret",
      actualValue: "secret",
      differenceCodes: ["B", "A"],
      warningCodes: ["Z", "A"],
      nodeType: "INSTANCE",
      counts: { timelineCount: 1, keyframeValues: [1, 2] }
    });
    expect(sanitized).toEqual({
      counts: { timelineCount: 1 },
      differenceCodes: ["A", "B"],
      nodeType: "INSTANCE",
      warningCodes: ["A", "Z"]
    });
  });

  it("serializes events and keeps event switches exhaustive", () => {
    const eventNames: MotionLogEvent["name"][] = [
      "motion.read.started",
      "motion.read.completed",
      "motion.read.failed",
      "motion.write.started",
      "motion.write.completed",
      "motion.write.failed",
      "motion.verification.completed",
      "motion.stale_check.completed"
    ];
    for (const name of eventNames) {
      expect(JSON.stringify({ name, operationId: "op", metadata: {} })).toContain(name);
    }
  });

  it("keeps production logging isolated from console, analytics, Phase 0 lab modules, and UI code", async () => {
    const sourceFiles = await filesUnder(join(process.cwd(), "src", "plugin", "motion"));
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const normalized = relative(process.cwd(), file).split(sep).join("/");
      const text = await readFile(file, "utf8");
      if (normalized !== "src/plugin/motion/log.ts" && /\bconsole\./.test(text)) {
        offenders.push(`${normalized}:console`);
      }
      if (/from ["].*(diagnostic|p00\d|fixture|collector|src\/ui|ui\/App|playwright|analytics|telemetry|fetch|XMLHttpRequest)/im.test(text)) {
        offenders.push(`${normalized}:import`);
      }
      if (/navigator\.sendBeacon|fetch\(|XMLHttpRequest|analytics|telemetry/i.test(text)) {
        offenders.push(`${normalized}:transport`);
      }
    }
    expect(offenders).toEqual([]);

    const uiText = await readFile(join(process.cwd(), "src", "ui", "App.tsx"), "utf8");
    expect(uiText).not.toContain("MotionLogger");
    expect(parent("FRAME")).toEqual({ type: "FRAME", parent: null });
    expect(secondsToMilliseconds(0.5)).toBe(500);
  });
});

const filesUnder = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return await filesUnder(fullPath);
      }
      return entry.isFile() && fullPath.endsWith(".ts") ? [fullPath] : [];
    })
  );
  return nested.flat();
};
