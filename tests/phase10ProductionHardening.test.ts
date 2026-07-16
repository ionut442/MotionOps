import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { normalizeMotionSnapshot, planMotionOperation, executeChangePlan, type MotionSceneNode } from "../src/plugin/motion";
import { createCancellationRegistry } from "../src/shared/cancellation";
import { isUiToPluginMessage } from "../src/shared/messages";
import { transitionApplicationState, createApplicationStateError } from "../src/ui/applicationState";
import { orderScopeResult } from "../src/domain/scopeOrdering";
import { createSequencerDraft, offsetSelection, selectSequencerItems } from "../src/domain/sequencer";
import { createDefaultStandards } from "../src/domain/standards";
import { runMotionQa } from "../src/domain/qa";
import { buildHandoffReport } from "../src/domain/handoffReport";
import type { ScopeScanNode, ScopeScanResult } from "../src/domain/scopeScan";
import type { TimeMs } from "../src/domain/time";

type FakeNode = MotionSceneNode & Record<string, unknown>;

const kf = (id: string, seconds: number, value: unknown, easing: unknown = { type: "LINEAR" }) => ({
  id,
  time: seconds,
  value,
  easing
});

const fakeNode = (id: string, overrides: Record<string, unknown> = {}): FakeNode => ({
  id,
  name: id,
  type: "RECTANGLE",
  parent: null,
  manualKeyframeTracks: {
    OPACITY: {
      id: `${id}-opacity`,
      keyframes: [
        kf(`${id}-a`, 0, { type: "FLOAT", value: 0 }),
        kf(`${id}-b`, 0.5, { type: "FLOAT", value: 1 }, { type: "EASE_OUT" })
      ]
    }
  },
  animations: { OPACITY: { timelineDuration: 0.5 } },
  timelines: [{ id: `${id}-timeline`, duration: 0.5 }],
  applyManualKeyframeTrack: () => undefined,
  ...overrides
});

const scopeNode = (id: string, traversalIndex: number): ScopeScanNode => ({
  id,
  parentId: traversalIndex === 0 ? null : "root",
  name: id,
  type: "RECTANGLE",
  depth: traversalIndex === 0 ? 0 : 1,
  childIds: [],
  visible: true,
  locked: false,
  hasChildren: false,
  childrenIncluded: false,
  rootIds: ["root"],
  traversalIndex,
  geometry: { x: traversalIndex * 10, y: traversalIndex * 5, width: 10, height: 10, centerX: traversalIndex * 10 + 5, centerY: traversalIndex * 5 + 5 }
});

const scope = (ids: readonly string[]): ScopeScanResult => ({
  roots: ["root"],
  nodes: ids.map(scopeNode),
  issues: []
});

const ms = (value: number): TimeMs => value as TimeMs;

describe("Phase 10 production hardening", () => {
  it("keeps Scope, Inspect, Sequence, QA, and Handoff on one ordered normalized source of truth", () => {
    const confirmedScope = orderScopeResult(scope(["root", "second", "first"]), {
      mode: "custom",
      customNodeIds: ["first", "second", "root"]
    });
    const snapshots = [
      normalizeMotionSnapshot(fakeNode("first")),
      normalizeMotionSnapshot(fakeNode("second")),
      normalizeMotionSnapshot(fakeNode("root"))
    ];

    expect(confirmedScope.nodes.map((node) => node.id)).toEqual(["first", "second", "root"]);

    const draft = createSequencerDraft({
      snapshots,
      scopeOrder: confirmedScope.nodes.map((node) => ({ nodeId: node.id, label: node.name })),
      baseSnapshotId: "p10-integration",
      baseFingerprints: Object.fromEntries(snapshots.map((snapshot) => [snapshot.nodeId, snapshot.nodeId])),
      nowMs: () => 10,
      id: "p10-integration-draft"
    });
    expect(draft.rows.map((row) => row.nodeId)).toEqual(["first", "second", "root"]);

    const selected = selectSequencerItems(draft, [draft.rows[0].items[0].id]);
    const moved = offsetSelection(selected, 50 as never);
    expect(moved.rows[0].items[0].startMs).toBe(draft.rows[0].items[0].startMs + 50);
    expect(snapshots[0].manualTracks[0].keyframes[0].timeMs).toBe(0);

    const standards = createDefaultStandards(10);
    const qa = runMotionQa({
      snapshots,
      scope: confirmedScope,
      standards,
      exceptions: [{ id: "accepted-motion", scope: "rule", reason: "Reviewed during P10-001." }],
      ignoredIssueIds: [],
      reviewedIssueIds: []
    });
    const report = buildHandoffReport({
      pluginVersion: "0.0.0",
      scope: confirmedScope,
      snapshots,
      standards,
      qaResult: qa,
      exceptions: [{ id: "accepted-motion", scope: "rule", reason: "Reviewed during P10-001." }],
      generatedAtMs: 10
    });

    expect(report.scope.confirmedOrder).toEqual(["first", "second", "root"]);
    expect(report.interaction.standardsName).toBe(standards.name);
    expect(report.qa.available).toBe(true);
    expect(report.exceptions.map((entry) => entry.id)).toContain("accepted-motion");
    expect(report.targets.map((target) => target.sourceKind)).toEqual(["manual", "manual", "manual"]);
  });

  it("covers lifecycle transitions without mixing feature state into the state machine", () => {
    const initialized = transitionApplicationState({ status: "initializing" }, { type: "INITIALIZATION_SUCCEEDED" });
    expect(initialized).toEqual({ ok: true, state: { status: "synced" } });
    if (!initialized.ok) throw new Error("expected init success");

    const draft = transitionApplicationState(initialized.state, { type: "DRAFT_CHANGED", draftId: "edit-preview" });
    expect(draft).toEqual({ ok: true, state: { status: "draft", draftId: "edit-preview" } });
    if (!draft.ok) throw new Error("expected draft");

    const applying = transitionApplicationState(draft.state, { type: "APPLY_STARTED", operationId: "apply-1" });
    expect(applying).toEqual({ ok: true, state: { status: "applying", operationId: "apply-1", startedFrom: "draft" } });
    if (!applying.ok) throw new Error("expected applying");

    const stale = transitionApplicationState(applying.state, { type: "DOCUMENT_STALE", reason: "operation_baseline_changed" });
    expect(stale).toEqual({ ok: true, state: { status: "stale", reason: "operation_baseline_changed", previousStatus: "applying" } });
    if (!stale.ok) throw new Error("expected stale");

    const error = transitionApplicationState(stale.state, {
      type: "SYNC_FAILED",
      error: createApplicationStateError("sync_failed", "Reread failed.", { recoverable: true, stage: "sync" })
    });
    expect(JSON.stringify(error)).not.toContain("activeWorkspace");
    expect(JSON.stringify(error)).not.toContain("previewDrawer");
  });

  it("uses typed cooperative cancellation for replacement and explicit cancel flows", () => {
    const registry = createCancellationRegistry();
    const first = registry.start("motion-inspect", "inspect-1");
    const second = registry.start("motion-inspect", "inspect-2");
    expect(first.isCancelled()).toBe(true);
    expect(second.isCancelled()).toBe(false);
    expect(registry.isCurrent("motion-inspect", "inspect-2")).toBe(true);
    expect(registry.activeRequestIds("motion-inspect")).toEqual(["inspect-2"]);

    expect(
      isUiToPluginMessage({
        type: "MOTION_OPERATION_CANCEL_REQUEST",
        requestId: "inspect-2",
        operation: "motion-inspect"
      })
    ).toBe(true);
    expect(registry.cancel("motion-inspect", "inspect-2")).toBe(true);
    expect(second.isCancelled()).toBe(true);
    expect(registry.activeRequestIds("motion-inspect")).toEqual([]);
  });

  it("keeps unknown beta fields readable, warning-bearing, and non-writable by default", () => {
    const snapshot = normalizeMotionSnapshot(fakeNode("unknown", {
      manualKeyframeTracks: {
        "BETA#PROPERTY": {
          id: "beta-track",
          unknownTrackField: { nested: true },
          keyframes: [
            kf("beta-a", 0, { type: "BETA_VALUE", payload: { secret: "not-raw" } }, { type: "HYPER_EASE", extra: 1 }),
            { id: "beta-b", value: { type: "FLOAT", value: 1 }, futureKeyframeField: true }
          ]
        }
      },
      animations: { UNKNOWN_ANIMATION: { timelineDuration: 1, extraTimelineField: { ok: true } } },
      timelines: [{ id: "timeline", duration: 1, extraTimelineField: "ignored" }],
      componentProperties: { "Variant#1": null },
      componentPropertyDefinitions: { "Variant#1": { type: "VARIANT", unknownDefinitionField: true } }
    }));

    expect(snapshot.manualTracks[0].warnings.map((warning) => warning.code)).toContain("KEYFRAME_TIME_MISSING");
    expect(snapshot.manualTracks[0].keyframes[0].easing).toEqual({ kind: "preset", name: "HYPER_EASE" });
    expect(snapshot.manualTracks[0].write.status).toBe("supported-with-warning");
    expect(snapshot.componentProperties.writeability.status).toBe("read-only");
    expect(JSON.stringify(snapshot)).not.toContain("function");

    const plan = planMotionOperation({
      baseSnapshot: {
        ...snapshot,
        manualTracks: snapshot.manualTracks.map((track) => ({
          ...track,
          write: { status: "unknown", reason: "Unknown beta property remains read-only until live evidence verifies a writer." }
        }))
      },
      operation: { kind: "set-duration", durationMs: ms(800), anchor: "preserve-start" },
      targetIds: ["beta-track"],
      idGenerator: () => "unknown-plan",
      nowMs: () => 10
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.error.message);
    expect(plan.value.mutations).toEqual([]);
    expect(plan.value.skipped.map((skip) => skip.code)).toContain("UNKNOWN_CAPABILITY");
  });

  it("blocks destructive writes for invalid, stale, duplicate, read-only, and unknown-operation plans", async () => {
    const base = normalizeMotionSnapshot(fakeNode("destructive"));
    const plan = planMotionOperation({
      baseSnapshot: base,
      operation: { kind: "set-duration", durationMs: ms(900), anchor: "preserve-start" },
      targetIds: [`${base.nodeId}-opacity`],
      idGenerator: () => "destructive-plan",
      nowMs: () => 10
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.error.message);

    const calls: string[] = [];
    const stale = normalizeMotionSnapshot(fakeNode("destructive", {
      manualKeyframeTracks: {
        OPACITY: {
          id: "destructive-opacity",
          keyframes: [kf("a", 0, 0), kf("b", 1.25, 1)]
        }
      }
    }));
    const staleResult = await executeChangePlan(plan.value, {
      requestId: "apply-stale",
      adapter: {
        readMotionSnapshot: () => Promise.resolve({ ok: true, value: stale }),
        replaceManualTrack: () => {
          calls.push("replace");
          return Promise.resolve({ ok: true, value: stale });
        },
        removeAndReapplyStyle: () => {
          calls.push("style");
          return Promise.resolve({ ok: true, value: stale });
        },
        setTimelineDuration: () => {
          calls.push("timeline");
          return Promise.resolve({ ok: true, value: stale });
        }
      }
    });
    expect(staleResult.status).toBe("stale");
    expect(calls).toEqual([]);

    const seen = new Set<string>();
    const noWriteAdapter = {
      readMotionSnapshot: () => Promise.resolve({ ok: true as const, value: base }),
      replaceManualTrack: () => {
        calls.push("replace");
        return Promise.resolve({ ok: true as const, value: base });
      },
      removeAndReapplyStyle: () => {
        calls.push("style");
        return Promise.resolve({ ok: true as const, value: base });
      },
      setTimelineDuration: () => {
        calls.push("timeline");
        return Promise.resolve({ ok: true as const, value: base });
      }
    };
    const undo = {
      begin: () => ({ ok: true as const, value: true as const }),
      rollback: () => ({ ok: true as const, value: true as const })
    };
    await executeChangePlan(plan.value, { requestId: "dup", seenRequestIds: seen, adapter: noWriteAdapter, undo });
    const duplicate = await executeChangePlan(plan.value, { requestId: "dup", seenRequestIds: seen, adapter: noWriteAdapter });
    expect(duplicate.status).toBe("validation-failure");
    expect(duplicate.errors[0].code).toBe("DUPLICATE_REQUEST");
  });

  it("records report-only performance envelopes for large pure-domain workloads", () => {
    const large = normalizeMotionSnapshot(fakeNode("large", {
      manualKeyframeTracks: {
        OPACITY: {
          id: "large-opacity",
          keyframes: Array.from({ length: 2_000 }, (_, index) =>
            kf(`k${String(index)}`, index / 1000, { type: "FLOAT", value: index % 2 })
          )
        }
      },
      timelines: [{ id: "large-timeline", duration: 2 }]
    }));
    const largeScope = scope(["large"]);
    const standards = createDefaultStandards(10);

    const timings: Record<string, number> = {};
    const timed = <T>(label: string, fn: () => T): T => {
      const start = performance.now();
      const result = fn();
      timings[label] = performance.now() - start;
      return result;
    };

    timed("normalize-2000-keyframes", () => normalizeMotionSnapshot(fakeNode("large-normalize", {
      manualKeyframeTracks: {
        OPACITY: {
          id: "large-normalize-opacity",
          keyframes: Array.from({ length: 2_000 }, (_, index) =>
            kf(`n${String(index)}`, index / 1000, { type: "FLOAT", value: index % 2 })
          )
        }
      }
    })));
    timed("sequencer-draft", () => createSequencerDraft({
      snapshots: [large],
      scopeOrder: largeScope.nodes.map((node) => ({ nodeId: node.id, label: node.name })),
      baseSnapshotId: "large",
      baseFingerprints: { large: "large" },
      nowMs: () => 10,
      id: "large-draft"
    }));
    timed("qa-2000-keyframes", () => runMotionQa({ snapshots: [large], scope: largeScope, standards, exceptions: [], ignoredIssueIds: [], reviewedIssueIds: [] }));
    timed("handoff-report", () => buildHandoffReport({ pluginVersion: "0.0.0", scope: largeScope, snapshots: [large], standards, qaResult: null, exceptions: [] }));

    expect(Object.values(timings).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(timings["normalize-2000-keyframes"]).toBeLessThan(2_000);
    expect(timings["sequencer-draft"]).toBeLessThan(2_000);
    expect(timings["qa-2000-keyframes"]).toBeLessThan(2_000);
    expect(timings["handoff-report"]).toBeLessThan(2_000);
  });
});
