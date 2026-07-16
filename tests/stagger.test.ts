import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { orderScopeNodes } from "../src/domain/scopeOrdering";
import {
  resolveStaggerSchedule,
  shiftTimesByStagger,
  type StaggerOperation
} from "../src/domain/stagger";
import type { ScopeScanNode } from "../src/domain/scopeScan";

beforeAll(() => {
  fc.configureGlobal({ seed: 7007, numRuns: 80 });
});

const item = (id: string, startMs: number, endMs: number) => ({
  id,
  startMs: startMs as never,
  endMs: endMs as never
});

const fixed = (intervalMs: number): StaggerOperation => ({
  kind: "stagger",
  timingMode: "fixed-interval",
  durationPolicy: "preserve",
  anchor: "preserve-first-start",
  intervalMs: intervalMs as never
});

const node = (id: string, traversalIndex: number, x: number, y: number): ScopeScanNode => ({
  id,
  parentId: null,
  name: id,
  type: "RECTANGLE",
  depth: 0,
  childIds: [],
  visible: true,
  locked: false,
  hasChildren: false,
  childrenIncluded: false,
  rootIds: [id],
  traversalIndex,
  geometry: { x, y, width: 10, height: 10, centerX: x + 5, centerY: y + 5 }
});

describe("shared Stagger Builder domain", () => {
  it("preserves ids, values by caller contract, input immutability, deterministic serialization, and fixed intervals", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 400 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 250 }),
        (durations, interval) => {
          const source = durations.map((duration, index) => item(`n-${String(index)}`, index * 500, index * 500 + duration));
          const before = structuredClone(source);
          const first = resolveStaggerSchedule(source, fixed(interval));
          const second = resolveStaggerSchedule(source, fixed(interval));
          expect(source).toEqual(before);
          expect(first).toEqual(second);
          expect(JSON.parse(JSON.stringify(first))).toEqual(first);
          expect(first.ok).toBe(true);
          if (!first.ok) throw new Error(first.error.message);
          expect(first.value.items.map((entry) => entry.id)).toEqual(source.map((entry) => entry.id));
          for (let index = 1; index < first.value.items.length; index += 1) {
            expect(first.value.items[index].startMs - first.value.items[index - 1].startMs).toBe(interval);
          }
          first.value.items.forEach((entry, index) => {
            expect(entry.endMs - entry.startMs).toBe(durations[index]);
          });
        }
      )
    );
  });

  it("supports total duration preserve/scale, overlap, sequential, before-end, and anchors", () => {
    const source = [item("a", 100, 200), item("b", 400, 500), item("c", 800, 900)];
    expect(resolveStaggerSchedule(source, {
      kind: "stagger",
      timingMode: "total-duration",
      durationPolicy: "preserve",
      anchor: "preserve-first-start",
      totalDurationMs: 500 as never
    })).toMatchObject({ ok: true });
    expect(resolveStaggerSchedule(source, {
      kind: "stagger",
      timingMode: "total-duration",
      durationPolicy: "preserve",
      anchor: "preserve-first-start",
      totalDurationMs: 100 as never
    })).toMatchObject({ ok: false, error: { code: "IMPOSSIBLE_PRESERVE_DURATION" } });
    const scaled = resolveStaggerSchedule(source, {
      kind: "stagger",
      timingMode: "total-duration",
      durationPolicy: "scale-to-fit",
      anchor: "preserve-last-end",
      totalDurationMs: 400 as never
    });
    expect(scaled.ok).toBe(true);
    if (!scaled.ok) throw new Error(scaled.error.message);
    expect(Math.max(...scaled.value.items.map((entry) => entry.endMs))).toBe(900);

    const overlap = resolveStaggerSchedule(source, {
      kind: "stagger",
      timingMode: "fixed-overlap",
      durationPolicy: "preserve",
      anchor: "preserve-first-start",
      overlapMs: 25 as never
    });
    expect(overlap.ok && overlap.value.items[1].startMs).toBe(175);

    const sequential = resolveStaggerSchedule(source, {
      kind: "stagger",
      timingMode: "sequential-after-end",
      durationPolicy: "preserve",
      anchor: "preserve-first-start",
      gapMs: 30 as never
    });
    expect(sequential.ok && sequential.value.items[1].startMs).toBe(230);

    const beforeEnd = resolveStaggerSchedule(source, {
      kind: "stagger",
      timingMode: "start-before-previous-end",
      durationPolicy: "preserve",
      anchor: "preserve-first-start",
      overlapMs: 40 as never
    });
    expect(beforeEnd.ok && beforeEnd.value.items[1].startMs).toBe(160);
  });

  it("maps keyframes with integer rounding and no cumulative float drift", () => {
    const schedule = resolveStaggerSchedule([item("a", 0, 300)], {
      kind: "stagger",
      timingMode: "total-duration",
      durationPolicy: "scale-to-fit",
      anchor: "preserve-first-start",
      totalDurationMs: 1000 as never
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) throw new Error(schedule.error.message);
    let times = [0, 99, 300].map((time) => time as never);
    for (let index = 0; index < 20; index += 1) {
      times = [...shiftTimesByStagger(times, schedule.value.items[0])] as never;
    }
    expect(times.every(Number.isInteger)).toBe(true);
  });

  it("reuses Scope ordering for every target-order mode including spatial ties and missing geometry fallback", () => {
    const nodes = [
      node("center", 0, 50, 50),
      node("left", 1, 0, 50),
      node("right", 2, 100, 50),
      { ...node("missing", 3, 200, 200), geometry: undefined }
    ];
    expect(orderScopeNodes(nodes, { mode: "center-outward" }).map((entry) => entry.id)).toEqual(["center", "left", "right", "missing"]);
    expect(orderScopeNodes(nodes, { mode: "edges-inward" }).map((entry) => entry.id)).toEqual(["left", "right", "center", "missing"]);
    expect(orderScopeNodes(nodes, { mode: "custom", customNodeIds: ["right", "left"] }).map((entry) => entry.id)).toEqual(["right", "left", "center", "missing"]);
  });
});
