import { describe, expect, it, vi } from "vitest";
import {
  executeChangePlan,
  normalizeMotionSnapshot,
  planMotionOperation,
  type ChangePlan,
  type MotionAdapter,
  type MotionAdapterError,
  type MotionOperation,
  type MotionSceneNode,
  type MotionSnapshot
} from "../src/plugin/motion";
import type { TimeMs } from "../src/domain/time";
import { isUiToPluginMessage } from "../src/shared/messages";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const kf = (id: string, seconds: number, value: number, easing: unknown = { type: "LINEAR" }) => ({
  id,
  time: seconds,
  value: { type: "FLOAT", value },
  easing
});

const node = (overrides: Record<string, unknown> = {}): FakeNode => ({
  id: "node-1",
  name: "Motion Node",
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: "opacity-track",
      keyframes: [kf("a", 0, 0), kf("b", 0.5, 1)]
    }
  },
  animations: { OPACITY: { timelineDuration: 0.5 } },
  animationStyles: [{ id: "applied-style", styleId: "available-style", name: "Opacity" }],
  timelines: [{ id: "timeline-1", duration: 0.5 }],
  applyManualKeyframeTrack: vi.fn(),
  removeAnimationStyle: vi.fn(),
  applyAnimationStyle: vi.fn(),
  setTimelineDuration: vi.fn(),
  ...overrides
});

const snapshot = (overrides: Record<string, unknown> = {}) => normalizeMotionSnapshot(node(overrides));
const ms = (value: number): TimeMs => value as TimeMs;
const okSnapshot = (value: MotionSnapshot) => ({ ok: true as const, value });

const planFromRequest = (
  base: MotionSnapshot,
  operation: MotionOperation,
  targetIds: readonly string[] = ["opacity-track", "applied-style"]
): ChangePlan => {
  const request = {
    type: "MOTION_PLAN_OPERATION_REQUEST",
    requestId: `req-${operation.kind}`,
    nodeId: base.nodeId,
    targetIds,
    operation
  };
  expect(isUiToPluginMessage(request)).toBe(true);
  const result = planMotionOperation({
    baseSnapshot: base,
    operation,
    targetIds: [...targetIds],
    idGenerator: () => `plan-${operation.kind}`,
    nowMs: () => 404018
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const adapterFor = ({
  read,
  replaceManualTrack,
  removeAndReapplyStyle,
  setTimelineDuration
}: {
  read: () => MotionSnapshot;
  replaceManualTrack?: (plan: ChangePlan) => MotionSnapshot | { ok: false; error: MotionAdapterError };
  removeAndReapplyStyle?: () => MotionSnapshot | { ok: false; error: MotionAdapterError };
  setTimelineDuration?: () => MotionSnapshot | { ok: false; error: MotionAdapterError };
}): Pick<MotionAdapter, "readMotionSnapshot" | "replaceManualTrack" | "removeAndReapplyStyle" | "setTimelineDuration"> => ({
  readMotionSnapshot: vi.fn(() => Promise.resolve(okSnapshot(read()))),
  replaceManualTrack: vi.fn(() => {
    const result = replaceManualTrack?.(currentPlan);
    return Promise.resolve(result && "ok" in result ? result : okSnapshot(result ?? read()));
  }),
  removeAndReapplyStyle: vi.fn(() => {
    const result = removeAndReapplyStyle?.();
    return Promise.resolve(result && "ok" in result ? result : okSnapshot(result ?? read()));
  }),
  setTimelineDuration: vi.fn(() => {
    const result = setTimelineDuration?.();
    return Promise.resolve(result && "ok" in result ? result : okSnapshot(result ?? read()));
  })
});

let currentPlan: ChangePlan;

const manualAfter = (base: MotionSnapshot, plan: ChangePlan): MotionSnapshot => ({
  ...base,
  manualTracks: [manualMutationAfter(plan)]
});

const manualMutationAfter = (plan: ChangePlan): MotionSnapshot["manualTracks"][number] => {
  const mutation = plan.mutations.find((item) => item.source === "manual");
  if (mutation === undefined) {
    throw new Error("Expected a manual mutation in the test plan.");
  }
  return mutation.after;
};

describe("writer integration through Edit plan/apply boundary", () => {
  it("plans and applies manual duration, preserve-start, preserve-end, delay, scale, and easing operations", async () => {
    for (const operation of [
      { kind: "set-duration", durationMs: ms(900), anchor: "preserve-start" },
      { kind: "set-duration", durationMs: ms(300), anchor: "preserve-end" },
      { kind: "set-delay", mode: "add", delayMs: ms(100) },
      { kind: "scale-timing", numerator: 2, denominator: 1, origin: "start" },
      { kind: "replace-easing", easing: { kind: "cubic-bezier", x1: 0.2, y1: 0, x2: 0.4, y2: 1 } }
    ] as const) {
      const base = snapshot();
      currentPlan = planFromRequest(base, operation);
      let current = base;
      const adapter = adapterFor({
        read: () => current,
        replaceManualTrack: (plan) => {
          current = manualAfter(base, plan);
          return current;
        }
      });
      const undo = { begin: vi.fn(() => ({ ok: true as const, value: true as const })), rollback: vi.fn(() => ({ ok: true as const, value: true as const })) };
      const result = await executeChangePlan(currentPlan, { adapter, undo, requestId: `apply-${operation.kind}` });
      expect(result.status).toBe("success");
      expect(adapter.replaceManualTrack).toHaveBeenCalledTimes(1);
      expect(undo.begin).toHaveBeenCalledTimes(1);
      expect(undo.rollback).not.toHaveBeenCalled();
      expect(result.mutationResults[0].verification?.status).toMatch(/verified/);
    }
  });

  it("keeps mixed and style-only targets explicit without unsupported style writer calls", async () => {
    const base = snapshot();
    currentPlan = planFromRequest(base, { kind: "set-duration", durationMs: ms(750), anchor: "preserve-start" });
    expect(currentPlan.mutations).toHaveLength(1);
    expect(currentPlan.skipped.map((skip) => skip.code)).toContain("READ_ONLY_STYLE_FIELD");

    const styleOnly = planFromRequest(base, { kind: "replace-easing", easing: { kind: "linear" } }, ["applied-style"]);
    expect(styleOnly.mutations).toHaveLength(0);
    expect(styleOnly.skipped.map((skip) => skip.code)).toContain("READ_ONLY_STYLE_FIELD");
    const adapter = adapterFor({ read: () => base });
    const result = await executeChangePlan(styleOnly, { adapter, requestId: "apply-style-only" });
    expect(result.status).toBe("validation-failure");
    expect(adapter.removeAndReapplyStyle).not.toHaveBeenCalled();
    expect(adapter.replaceManualTrack).not.toHaveBeenCalled();
  });

  it("rejects invalid input and stale plans before any writer runs", async () => {
    expect(
      isUiToPluginMessage({
        type: "MOTION_PLAN_OPERATION_REQUEST",
        requestId: "bad",
        nodeId: "node-1",
        targetIds: ["opacity-track"],
        operation: { kind: "set-duration", durationMs: -1, anchor: "preserve-start" }
      })
    ).toBe(false);

    const base = snapshot();
    const stale = snapshot({
      manualKeyframeTracks: {
        OPACITY: {
          id: "opacity-track",
          keyframes: [kf("a", 0, 0), kf("b", 0.7, 1)]
        }
      }
    });
    currentPlan = planFromRequest(base, { kind: "set-delay", mode: "replace", delayMs: ms(100) });
    const adapter = adapterFor({
      read: () => stale,
      replaceManualTrack: () => stale
    });
    const result = await executeChangePlan(currentPlan, { adapter, requestId: "apply-stale" });
    expect(result.status).toBe("stale");
    expect(adapter.replaceManualTrack).not.toHaveBeenCalled();
  });

  it("suppresses duplicate applies, reports writer failures safely, and rolls back verification mismatch", async () => {
    const base = snapshot();
    currentPlan = planFromRequest(base, { kind: "set-duration", durationMs: ms(900), anchor: "preserve-start" });
    const seen = new Set<string>();
    const failing = adapterFor({
      read: () => base,
      replaceManualTrack: () => ({ ok: false, error: { code: "WRITE_FAILED", message: "manual writer exploded", nodeId: "node-1" } })
    });
    const undo = { begin: vi.fn(() => ({ ok: true as const, value: true as const })), rollback: vi.fn(() => ({ ok: true as const, value: true as const })) };
    const failed = await executeChangePlan(currentPlan, { adapter: failing, undo, requestId: "dup", seenRequestIds: seen });
    expect(failed.status).toBe("rollback-success");
    expect(failed.errors[0]).toEqual({ code: "WRITE_FAILED", message: "manual writer exploded", nodeId: "node-1", path: undefined });
    expect(JSON.stringify(failed)).not.toContain("Error");
    expect(undo.rollback).toHaveBeenCalledTimes(1);

    const duplicate = await executeChangePlan(currentPlan, { adapter: failing, requestId: "dup", seenRequestIds: seen });
    expect(duplicate.status).toBe("validation-failure");
    expect(duplicate.errors[0].code).toBe("DUPLICATE_REQUEST");

    const mismatchAdapter = adapterFor({
      read: () => base,
      replaceManualTrack: () => base
    });
    const mismatchUndo = { begin: vi.fn(() => ({ ok: true as const, value: true as const })), rollback: vi.fn(() => ({ ok: true as const, value: true as const })) };
    const mismatch = await executeChangePlan(currentPlan, { adapter: mismatchAdapter, undo: mismatchUndo, requestId: "mismatch" });
    expect(mismatch.status).toBe("rollback-success");
    expect(mismatch.mutationResults[0].status).toBe("verification-mismatch");
    expect(mismatchUndo.rollback).toHaveBeenCalledTimes(1);
  });

  it("keeps the execution engine independent from UI modules", async () => {
    const engineModules = await Promise.all([
      import("../src/plugin/motion/plan"),
      import("../src/plugin/motion/execute"),
      import("../src/plugin/motion/operations")
    ]);
    expect(engineModules.every((module) => !("ChangePreview" in module))).toBe(true);
  });
});
