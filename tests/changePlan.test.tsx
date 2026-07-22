import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  executeChangePlan,
  normalizeMotionSnapshot,
  parseCubicBezier,
  planMotionOperation,
  secondsToMilliseconds,
  transformManualTrack,
  type ChangePlan,
  type MotionAdapter,
  type MotionAdapterError,
  type MotionOperation,
  type MotionSnapshot,
  type NormalizedManualTrack
} from "../src/plugin/motion";
import { ChangePreview } from "../src/ui/components/ChangePreview";
import { ContextDrawerShell } from "../src/ui/components/ContextDrawerShell";
import type { MotionSceneNode } from "../src/plugin/motion/types";

type FakeNode = MotionSceneNode & Record<string, unknown>;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  for (const container of containers.splice(0)) {
    container.remove();
  }
  vi.restoreAllMocks();
});

const render = (node: React.ReactNode) => {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(node);
  });
  return { container };
};

const kf = (id: string, seconds: number, value: number, easing: unknown = { type: "LINEAR" }) => ({
  id,
  timelinePosition: seconds,
  value: { type: "FLOAT", value },
  easing
});

const manualTrack = (property = "OPACITY", keyframes: unknown[] = [kf("a", 0, 0), kf("b", 0.5, 1)]) => ({
  [property]: { id: `${property}-track`, keyframes }
});

const node = (overrides: Record<string, unknown> = {}): FakeNode => ({
  id: "node-1",
  name: "Motion Node",
  type: "INSTANCE",
  parent: null,
  manualKeyframeTracks: manualTrack(),
  animationStyles: [{ id: "applied-1", styleId: "Scale", name: "OPACITY" }],
  animations: { OPACITY: { timelineDuration: 0.5 } },
  timelines: [{ id: "timeline-1", duration: 0.5 }],
  applyManualKeyframeTrack: () => undefined,
  removeAnimationStyle: () => undefined,
  applyAnimationStyle: () => undefined,
  setTimelineDuration: () => undefined,
  ...overrides
});

const snapshot = (overrides: Record<string, unknown> = {}): MotionSnapshot => normalizeMotionSnapshot(node(overrides));

const plan = (base: MotionSnapshot, operation: MotionOperation = { kind: "set-duration", durationMs: secondsToMilliseconds(1), anchor: "preserve-start" }) => {
  const result = planMotionOperation({
    baseSnapshot: base,
    operation,
    idGenerator: () => "plan-1",
    nowMs: () => 123
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

describe("Phase 4 change-plan operations", () => {
  it("plans deterministic serializable manual mutations and explicit style skips", () => {
    const base = snapshot();
    const first = plan(base);
    const second = plan(base);

    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.mutations).toHaveLength(1);
    expect(first.mutations[0]).toMatchObject({ source: "manual", property: "OPACITY" });
    expect(first.skipped.map((skip) => skip.code)).toContain("READ_ONLY_STYLE_FIELD");
    expect(first.warnings.map((warning) => warning.code)).toContain("STYLE_FIELD_READ_ONLY");
    expect(base.manualTracks[0].keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, 500]);
  });

  it("keeps mixed-source conflicts explicit without merging sources", () => {
    const mixed = plan(snapshot());
    expect(mixed.skipped.map((skip) => skip.code)).toContain("STYLE_MANUAL_CONFLICT");
    expect(mixed.expected.manualMutations).toBe(1);
    expect(mixed.expected.styleMutations).toBe(0);
  });

  it("represents empty target and empty operation results explicitly", () => {
    const emptyTargets = planMotionOperation({
      baseSnapshot: snapshot({ manualKeyframeTracks: {}, animationStyles: [], timelines: [] }),
      operation: { kind: "empty" },
      idGenerator: () => "plan-empty",
      targetIds: ["missing"]
    });
    expect(emptyTargets.ok).toBe(true);
    if (!emptyTargets.ok) {
      throw new Error(emptyTargets.error.message);
    }
    expect(emptyTargets.value.mutations).toEqual([]);
    expect(emptyTargets.value.skipped.map((skip) => skip.code)).toEqual(expect.arrayContaining(["NO_TARGETS", "EMPTY_OPERATION"]));
  });

  it("transforms duration, preserve-end, duplicate-time keyframes, delay, and timing scale with integer milliseconds", () => {
    const track = snapshot({
      manualKeyframeTracks: manualTrack("OPACITY", [kf("a", 0, 0), kf("dup-a", 0.5, 0.4), kf("dup-b", 0.5, 0.8)])
    }).manualTracks[0];
    expect(times(transform(track, { kind: "set-duration", durationMs: secondsToMilliseconds(1), anchor: "preserve-start" }))).toEqual([0, 1000, 1000]);
    expect(times(transform(track, { kind: "set-duration", durationMs: secondsToMilliseconds(0.25), anchor: "preserve-end" }))).toEqual([250, 500, 500]);
    expect(transformManualTrack(track, { kind: "set-duration", durationMs: secondsToMilliseconds(1), anchor: "preserve-end" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_TIME" }
    });
  });

  it("supports delay add/remove/replace and rejects negative output", () => {
    const track = snapshot().manualTracks[0];
    expect(times(transform(track, { kind: "set-delay", mode: "add", delayMs: secondsToMilliseconds(0.25) }))).toEqual([250, 750]);
    expect(times(transform(track, { kind: "set-delay", mode: "replace", delayMs: secondsToMilliseconds(0.1) }))).toEqual([100, 600]);
    expect(times(transform(track, { kind: "set-delay", mode: "remove" }))).toEqual([0, 500]);
    expect(transformManualTrack(track, { kind: "set-delay", mode: "replace", delayMs: secondsToMilliseconds(0) }).ok).toBe(true);
  });

  it("validates easing replacement, cubic-bezier input, unknown easing, and spring read-only policy", () => {
    const track = snapshot().manualTracks[0];
    const easing = parseCubicBezier("cubic-bezier(0.2, 0, 0.4, 1)");
    expect(easing.ok).toBe(true);
    if (!easing.ok) {
      throw new Error(easing.error.message);
    }
    expect(transform(track, { kind: "replace-easing", easing: easing.value }).keyframes[1].easing).toEqual(easing.value);
    expect(parseCubicBezier("cubic-bezier(1.2, 0, 0.4, 1)")).toMatchObject({ ok: false, error: { code: "INVALID_EASING" } });
    expect(planMotionOperation({ baseSnapshot: snapshot(), operation: { kind: "spring", easing: { kind: "spring", raw: {} } }, idGenerator: () => "p" })).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_OPERATION" }
    });
  });

  it("uses property-style coverage over generated timing cases", () => {
    for (let duration = 100; duration <= 1000; duration += 100) {
      const track = snapshot().manualTracks[0];
      const output = transform(track, { kind: "set-duration", durationMs: duration as ReturnType<typeof secondsToMilliseconds>, anchor: "preserve-start" });
      expect(output.keyframes[0].timeMs).toBe(0);
      expect(output.keyframes[1].timeMs).toBe(duration);
      expect(output.keyframes[1].value).toEqual(track.keyframes[1].value);
    }
  });
});

describe("Phase 4 apply workflow", () => {
  it("applies a valid plan through manual writer, undo begin, and re-read verification", async () => {
    const base = snapshot();
    const changePlan = plan(base);
    const writes: string[] = [];
    let current = base;
    const adapter = adapterFor({
      read: () => current,
      replaceManualTrack: () => {
        writes.push("manual");
        current = { ...base, manualTracks: [(changePlan.mutations[0] as Extract<ChangePlan["mutations"][number], { source: "manual" }>).after] };
        return current;
      }
    });
    const undo = { begin: vi.fn(() => ({ ok: true as const, value: true as const })), rollback: vi.fn(() => ({ ok: true as const, value: true as const })) };

    const result = await executeChangePlan(changePlan, { adapter, undo, requestId: "req-1" });

    expect(result.status).toBe("success");
    expect(writes).toEqual(["manual"]);
    expect(undo.begin).toHaveBeenCalledTimes(1);
    expect(undo.rollback).not.toHaveBeenCalled();
    expect(result.mutationResults[0].verification?.status).toBe("verified");
  });

  it("blocks stale plans and invalid plans before writes", async () => {
    const base = snapshot();
    const changePlan = plan(base);
    let wrote = false;
    const stale = snapshot({ manualKeyframeTracks: manualTrack("OPACITY", [kf("a", 0, 0), kf("b", 0.7, 1)]) });
    const adapter = adapterFor({
      read: () => stale,
      replaceManualTrack: () => {
        wrote = true;
        return stale;
      }
    });

    expect((await executeChangePlan(changePlan, { adapter, requestId: "req-stale" })).status).toBe("stale");
    expect(wrote).toBe(false);
    expect((await executeChangePlan({ nope: true }, { adapter, requestId: "req-invalid" })).status).toBe("validation-failure");
    expect(wrote).toBe(false);
  });

  it("reports writer failure, verification mismatch, rollback, duplicate suppression, and serializable results", async () => {
    const base = snapshot();
    const changePlan = plan(base);
    const seen = new Set<string>();
    const failing = adapterFor({
      read: () => base,
      replaceManualTrack: () => ({ ok: false, error: { code: "WRITE_FAILED", message: "boom", nodeId: "node-1" } })
    });
    const rollback = vi.fn(() => ({ ok: true as const, value: true as const }));
    const failed = await executeChangePlan(changePlan, {
      adapter: failing,
      requestId: "req-fail",
      seenRequestIds: seen,
      undo: { begin: () => ({ ok: true, value: true }), rollback }
    });
    expect(failed.status).toBe("rollback-success");
    expect(failed.errors[0]).toEqual({ code: "WRITE_FAILED", message: "boom", nodeId: "node-1", path: undefined });
    expect(JSON.stringify(failed)).not.toContain("Error:");

    const duplicate = await executeChangePlan(changePlan, { adapter: failing, requestId: "req-fail", seenRequestIds: seen });
    expect(duplicate.status).toBe("validation-failure");
    expect(duplicate.errors[0].code).toBe("DUPLICATE_REQUEST");
  });
});

describe("Phase 4 change preview foundation", () => {
  it("renders completed plan data inside the drawer shell without apply controls", () => {
    const changePlan = plan(snapshot());
    const { container } = render(
      <ContextDrawerShell mode="change-preview" onClose={vi.fn()} open={true} title="Preview">
        <ChangePreview plan={changePlan} />
      </ContextDrawerShell>
    );

    expect(container.textContent).toContain("1 property will change");
    expect(container.textContent).toContain("Property details");
    expect(container.textContent).toContain("Opacity");
    expect(container.textContent).not.toContain("Mutations");
    expect(container.textContent).not.toContain("styleInstances.applied");
    expect(container.textContent).not.toMatch(/\bApply\b|\bReset\b|Edit Timing|Copy\/Paste|Sequencer/);
  });
});

const transform = (track: NormalizedManualTrack, operation: MotionOperation): NormalizedManualTrack => {
  const result = transformManualTrack(track, operation, [{ timelineId: "timeline-1", durationMs: secondsToMilliseconds(1), tracks: [track.property] }]);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value.track;
};

const times = (track: NormalizedManualTrack) => track.keyframes.map((keyframe) => keyframe.timeMs);

const adapterFor = ({
  read,
  replaceManualTrack
}: {
  read: () => MotionSnapshot;
  replaceManualTrack: () => MotionSnapshot | { ok: false; error: MotionAdapterError };
}): Pick<MotionAdapter, "readMotionSnapshot" | "replaceManualTrack" | "removeAndReapplyStyle" | "setTimelineDuration"> => ({
  readMotionSnapshot: () => Promise.resolve({ ok: true, value: read() }),
  replaceManualTrack: () => {
    const result = replaceManualTrack();
    return Promise.resolve("ok" in result ? result : { ok: true, value: result });
  },
  removeAndReapplyStyle: () => Promise.resolve({ ok: false, error: { code: "WRITE_UNSUPPORTED", message: "style unsupported" } }),
  setTimelineDuration: () => Promise.resolve({ ok: false, error: { code: "WRITE_UNSUPPORTED", message: "timeline unsupported" } })
});
