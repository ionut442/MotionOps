import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { MotionSnapshot } from "../domain/motion";
import type { ScopeScanResult } from "../domain/scopeScan";
import {
  alignSelection,
  buildSequencerChangeOperation,
  createSequencerDraft,
  distributeSelection,
  fitSelectionToDuration,
  offsetSelection,
  resizeSelection,
  resetSequencerDraft,
  selectSequencerItems,
  snapTime,
  staggerSelection,
  timeToPixel,
  trimAndPadTimeline,
  updateSequencerViewport,
  type SequencerDraft,
  type SequencerItemDraft
} from "../domain/sequencer";
import type { StaggerAnchor, StaggerDurationPolicy, StaggerTimingMode } from "../domain/stagger";
import type { PluginToUiMessage, UiToPluginMessage } from "../shared/messages";
import { createApplicationStateError } from "./applicationState";
import { useApplicationStateDispatch } from "./applicationStateContext";
import { ChangePreview, type ChangePreviewPlan } from "./components/ChangePreview";
import { ContextDrawerShell } from "./components/ContextDrawerShell";
import { Select } from "./components/ui";

interface SequenceWorkspaceProps {
  readonly activeScope: ScopeScanResult | null;
  readonly lastMessage: PluginToUiMessage | null;
  readonly sendToPlugin: (message: UiToPluginMessage) => void;
  readonly createRequestId: () => string;
  readonly onContextDrawerChange: (drawer: ReactNode | null) => void;
}

type ReadState =
  | { status: "idle" }
  | { status: "loading"; requestId: string }
  | { status: "ready"; snapshots: readonly MotionSnapshot[]; failures: readonly string[] }
  | { status: "error"; message: string };

const integerOrNull = (value: string): number | null =>
  /^\d+$/.test(value.trim()) ? Number(value) : null;

const snapshotFingerprint = (snapshot: MotionSnapshot): string =>
  JSON.stringify({
    nodeId: snapshot.nodeId,
    manualTracks: snapshot.manualTracks,
    styleInstances: snapshot.styleInstances,
    timelines: snapshot.timelines,
    sources: snapshot.sources
  });

export const SequenceWorkspace = ({
  activeScope,
  lastMessage,
  sendToPlugin,
  createRequestId,
  onContextDrawerChange
}: SequenceWorkspaceProps) => {
  const dispatchApplicationEvent = useApplicationStateDispatch();
  const [readState, setReadState] = useState<ReadState>({ status: "idle" });
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [draft, setDraft] = useState<SequencerDraft | null>(null);
  const [deltaMs, setDeltaMs] = useState("50");
  const [snapIntervalMs, setSnapIntervalMs] = useState("50");
  const [fitDurationMs, setFitDurationMs] = useState("1000");
  const [staggerTimingMode, setStaggerTimingMode] = useState<StaggerTimingMode>("fixed-interval");
  const [staggerAmountMs, setStaggerAmountMs] = useState("100");
  const [staggerDurationPolicy, setStaggerDurationPolicy] = useState<StaggerDurationPolicy>("preserve");
  const [staggerAnchor, setStaggerAnchor] = useState<StaggerAnchor>("preserve-first-start");
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [previewPlan, setPreviewPlan] = useState<ChangePreviewPlan | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const activeReadRequestRef = useRef<string | null>(null);
  const activePlanRequestRef = useRef<string | null>(null);
  const activeApplyRequestRef = useRef<string | null>(null);
  const lastScopeKeyRef = useRef("none");

  useEffect(() => {
    const key = activeScope === null ? "none" : activeScope.nodes.map((node) => node.id).join("|");
    if (lastScopeKeyRef.current === key) {
      return;
    }
    lastScopeKeyRef.current = key;
    setDraft(null);
    setPreviewPlan(null);
    onContextDrawerChange(null);
    if (activeScope === null || activeScope.nodes.length === 0) {
      setReadState({ status: "idle" });
      return;
    }
    const requestId = createRequestId();
    activeReadRequestRef.current = requestId;
    setReadState({ status: "loading", requestId });
    sendToPlugin({ type: "MOTION_INSPECT_REQUEST", requestId, nodeIds: activeScope.nodes.map((node) => node.id) });
  }, [activeScope, createRequestId, onContextDrawerChange, sendToPlugin]);

  const rebuildDraft = useCallback((snapshots: readonly MotionSnapshot[]) => {
    const scoped = snapshots.filter((snapshot) => snapshot.nodeId === (selectedNodeId || snapshots[0]?.nodeId));
    const source = scoped.length > 0 ? scoped : snapshots.slice(0, 1);
    const fingerprints = Object.fromEntries(source.map((snapshot) => [snapshot.nodeId, snapshotFingerprint(snapshot)]));
    setDraft(
      createSequencerDraft({
        snapshots: source,
        scopeOrder: activeScope?.nodes.map((node) => ({ nodeId: node.id, label: node.name })),
        baseSnapshotId: JSON.stringify(fingerprints),
        baseFingerprints: fingerprints,
        nowMs: () => Date.now()
      })
    );
  }, [activeScope?.nodes, selectedNodeId]);

  useEffect(() => {
    if (lastMessage === null) {
      return;
    }
    if (lastMessage.type === "MOTION_INSPECT_RESULT" && lastMessage.requestId === activeReadRequestRef.current) {
      activeReadRequestRef.current = null;
      const snapshots = lastMessage.result.snapshots;
      setReadState({
        status: "ready",
        snapshots,
        failures: lastMessage.result.failures.map((failure) => `${failure.nodeId}: ${failure.message}`)
      });
      setSelectedNodeId(snapshots[0]?.nodeId ?? "");
      rebuildDraft(snapshots);
    }
    if (lastMessage.type === "MOTION_PLAN_OPERATION_RESULT" && lastMessage.requestId === activePlanRequestRef.current) {
      activePlanRequestRef.current = null;
      if (lastMessage.result.ok) {
        const plan = lastMessage.result.plan as ChangePreviewPlan;
        setPreviewPlan(plan);
        dispatchApplicationEvent({ type: "DRAFT_CHANGED", draftId: "planId" in plan ? String(plan.planId) : undefined });
      } else {
        setPropertyError(lastMessage.result.error.message);
      }
    }
    if (lastMessage.type === "MOTION_APPLY_CHANGE_PLAN_RESULT" && lastMessage.requestId === activeApplyRequestRef.current) {
      activeApplyRequestRef.current = null;
      const result = lastMessage.result as { status?: string; errors?: { message: string }[] };
      setApplyResult(`${result.status ?? "unknown"}: ${result.errors?.[0]?.message ?? "Apply completed."}`);
      if (result.status === "success" || result.status === "partial-success") {
        dispatchApplicationEvent({ type: "APPLY_SUCCEEDED" });
        setDraft(null);
      } else if (result.status === "stale") {
        dispatchApplicationEvent({ type: "DOCUMENT_STALE", reason: "operation_baseline_changed" });
        setDraft((current) => (current === null ? null : { ...current, stale: true }));
      } else {
        dispatchApplicationEvent({
          type: "APPLY_FAILED",
          error: createApplicationStateError("apply_failed", result.errors?.[0]?.message ?? "Sequencer apply failed.", {
            recoverable: true,
            stage: "apply"
          })
        });
      }
    }
    if (lastMessage.type === "PLUGIN_ERROR") {
      if (lastMessage.requestId === activePlanRequestRef.current || lastMessage.requestId === activeApplyRequestRef.current) {
        setPropertyError(lastMessage.message);
      }
    }
  }, [dispatchApplicationEvent, lastMessage, rebuildDraft]);

  const snapshots = readState.status === "ready" ? readState.snapshots : [];
  const selectedItem = useMemo(() => {
    if (draft === null) {
      return null;
    }
    const selected = new Set(draft.selection.itemIds);
    return draft.rows.flatMap((row) => row.items).find((item) => selected.has(item.id)) ?? null;
  }, [draft]);

  const mutateByDelta = (mutate: (draft: SequencerDraft, delta: number) => SequencerDraft) => {
    if (draft === null) {
      return;
    }
    const value = integerOrNull(deltaMs);
    if (value === null) {
      setPropertyError("Use a non-negative integer millisecond value.");
      return;
    }
    setPropertyError(null);
    setDraft(mutate(draft, value));
  };

  const buildPreview = () => {
    if (draft === null) {
      setPropertyError("Read Scope Motion data before building a sequencer preview.");
      return;
    }
    if (draft.stale) {
      setPropertyError("Draft is stale. Rescan and rebuild before preview or apply.");
      return;
    }
    const operation = buildSequencerChangeOperation(draft);
    if (operation.manualTracks.length === 0 && operation.timelineDurations.length === 0) {
      setPropertyError("No supported local timing changes are present.");
      return;
    }
    const requestId = createRequestId();
    activePlanRequestRef.current = requestId;
    sendToPlugin({
      type: "MOTION_PLAN_OPERATION_REQUEST",
      requestId,
      nodeId: draft.rows[0]?.nodeId ?? selectedNodeId,
      targetIds: operation.manualTracks.map((track) => track.trackId ?? track.property),
      operation
    });
  };

  const applyStaggerToDraft = () => {
    if (draft === null) {
      return;
    }
    const amount = integerOrNull(staggerAmountMs);
    if (amount === null || amount < 0) {
      setPropertyError("Stagger value must be a non-negative integer millisecond value.");
      return;
    }
    setPropertyError(null);
    setDraft(staggerSelection(draft, {
      kind: "stagger",
      timingMode: staggerTimingMode,
      durationPolicy: staggerDurationPolicy,
      anchor: staggerAnchor,
      intervalMs: staggerTimingMode === "fixed-interval" ? amount as never : undefined,
      totalDurationMs: staggerTimingMode === "total-duration" ? amount as never : undefined,
      overlapMs: staggerTimingMode === "fixed-overlap" || staggerTimingMode === "start-before-previous-end" ? amount as never : undefined,
      gapMs: staggerTimingMode === "sequential-after-end" ? amount as never : undefined
    }));
  };

  const dismissPreview = useCallback(() => {
    setPreviewPlan(null);
    setApplyResult(null);
    onContextDrawerChange(null);
    dispatchApplicationEvent({ type: "DRAFT_CLEARED" });
  }, [dispatchApplicationEvent, onContextDrawerChange]);

  const applyPreview = useCallback(() => {
    if (previewPlan === null || activeApplyRequestRef.current !== null) {
      return;
    }
    const requestId = createRequestId();
    activeApplyRequestRef.current = requestId;
    dispatchApplicationEvent({ type: "APPLY_STARTED", operationId: "planId" in previewPlan ? String(previewPlan.planId) : requestId });
    sendToPlugin({ type: "MOTION_APPLY_CHANGE_PLAN_REQUEST", requestId, plan: previewPlan });
  }, [createRequestId, dispatchApplicationEvent, previewPlan, sendToPlugin]);

  useEffect(() => {
    if (previewPlan === null) {
      if (selectedItem !== null) {
        onContextDrawerChange(<SequencerPropertyDrawer item={selectedItem} error={propertyError} />);
      } else {
        onContextDrawerChange(null);
      }
      return;
    }
    onContextDrawerChange(
      <ContextDrawerShell
        description="Review the sequencer preview before writing."
        mode="change-preview"
        onClose={dismissPreview}
        open={true}
        title="Sequencer preview"
        footer={
          <div className="edit-drawer-actions">
            {applyResult === null ? null : <span role="status">{applyResult}</span>}
            <button onClick={dismissPreview} type="button">Dismiss</button>
            <button disabled={previewPlan.mutations.length === 0 || activeApplyRequestRef.current !== null} onClick={applyPreview} type="button">
              Apply
            </button>
          </div>
        }
      >
        <ChangePreview plan={previewPlan} />
      </ContextDrawerShell>
    );
  }, [applyPreview, applyResult, dismissPreview, onContextDrawerChange, previewPlan, propertyError, selectedItem]);

  return (
    <section aria-label="Sequence Motion" className="sequence-workspace">
      <div className="edit-header">
        <div>
          <h2>Sequence</h2>
          <p>{activeScope === null ? "No confirmed Scope is available." : `${String(activeScope.nodes.length)} scoped target(s) available.`}</p>
        </div>
        <button disabled={readState.status !== "ready"} onClick={() => { rebuildDraft(snapshots); }} type="button">Rebuild draft</button>
      </div>

      {readState.status === "idle" ? <div className="scope-state">Confirm a Scope before sequencing Motion.</div> : null}
      {readState.status === "loading" ? <div className="scope-state">Reading normalized Motion data for Sequence.</div> : null}
      {readState.status === "ready" && draft !== null ? (
        <>
          <div className="sequence-toolbar" aria-label="Sequencer controls">
            <label className="scope-field">
              <span>Scoped node</span>
              <Select
                label="Scoped node"
                value={selectedNodeId}
                onChange={(value) => {
                  setSelectedNodeId(value);
                  setTimeout(() => { rebuildDraft(snapshots); }, 0);
                }}
                options={snapshots.map((snapshot) => ({
                  value: snapshot.nodeId,
                  label: activeScope?.nodes.find((node) => node.id === snapshot.nodeId)?.name ?? snapshot.nodeId
                }))}
              />
            </label>
            <label className="scope-field">
              <span>Delta (ms)</span>
              <input inputMode="numeric" value={deltaMs} onChange={(event) => { setDeltaMs(event.currentTarget.value); }} />
            </label>
            <label className="scope-field">
              <span>Snap (ms)</span>
              <input inputMode="numeric" value={snapIntervalMs} onChange={(event) => { setSnapIntervalMs(event.currentTarget.value); }} />
            </label>
            <button onClick={() => { setDraft({ ...draft, snap: { enabled: !draft.snap.enabled, intervalMs: (integerOrNull(snapIntervalMs) ?? 50) as never } }); }} type="button">
              Snap {draft.snap.enabled ? "on" : "off"}
            </button>
            <button onClick={() => { mutateByDelta((current, value) => offsetSelection(current, value as never)); }} type="button">Nudge forward</button>
            <button onClick={() => { mutateByDelta((current, value) => offsetSelection(current, -value as never)); }} type="button">Nudge back</button>
            <button onClick={() => { mutateByDelta((current, value) => resizeSelection(current, "end", value as never)); }} type="button">Resize end</button>
            <button onClick={() => { setDraft(alignSelection(draft, "start", { kind: "earliest" })); }} type="button">Align starts</button>
            <button onClick={() => { setDraft(alignSelection(draft, "end", { kind: "latest" })); }} type="button">Align ends</button>
            <button onClick={() => { setDraft(distributeSelection(draft, "starts")); }} type="button">Distribute</button>
            <label className="scope-field">
              <span>Stagger mode</span>
              <Select
                label="Stagger mode"
                onChange={setStaggerTimingMode}
                options={[
                  { value: "fixed-interval", label: "Fixed interval" },
                  { value: "total-duration", label: "Total duration" },
                  { value: "fixed-overlap", label: "Fixed overlap" },
                  { value: "sequential-after-end", label: "After previous end" },
                  { value: "start-before-previous-end", label: "Before previous end" }
                ]}
                value={staggerTimingMode}
              />
            </label>
            <label className="scope-field">
              <span>{staggerTimingMode === "total-duration" ? "Total" : staggerTimingMode === "sequential-after-end" ? "Gap" : "Amount"} (ms)</span>
              <input inputMode="numeric" value={staggerAmountMs} onChange={(event) => { setStaggerAmountMs(event.currentTarget.value); }} />
            </label>
            <label className="scope-field">
              <span>Policy</span>
              <Select
                label="Policy"
                onChange={setStaggerDurationPolicy}
                options={[
                  { value: "preserve", label: "Preserve durations" },
                  { value: "scale-to-fit", label: "Scale to fit" }
                ]}
                value={staggerDurationPolicy}
              />
            </label>
            <label className="scope-field">
              <span>Anchor</span>
              <Select
                label="Anchor"
                onChange={setStaggerAnchor}
                options={[
                  { value: "preserve-first-start", label: "First start" },
                  { value: "preserve-last-end", label: "Last end" },
                  { value: "extend-timeline", label: "Extend timeline" }
                ]}
                value={staggerAnchor}
              />
            </label>
            <button onClick={applyStaggerToDraft} type="button">Stagger</button>
            <label className="scope-field">
              <span>Fit (ms)</span>
              <input inputMode="numeric" value={fitDurationMs} onChange={(event) => { setFitDurationMs(event.currentTarget.value); }} />
            </label>
            <button onClick={() => { setDraft(fitSelectionToDuration(draft, (integerOrNull(fitDurationMs) ?? 1000) as never, "scale-all")); }} type="button">Fit</button>
            <button onClick={() => { setDraft(trimAndPadTimeline(draft, { trimStart: true, trimEnd: true, paddingEndMs: 100 as never })); }} type="button">Trim/pad</button>
            <button onClick={() => { setDraft(resetSequencerDraft(draft, snapshots.filter((snapshot) => snapshot.nodeId === selectedNodeId))); }} type="button">Reset draft</button>
            <button onClick={buildPreview} type="button">Build preview</button>
          </div>

          {propertyError === null ? null : <p className="edit-field-error">{propertyError}</p>}
          {draft.stale ? <div className="scope-state scope-state-stale">Draft is stale. Rescan and rebuild before Apply.</div> : null}

          <div className="sequence-ruler" aria-label="Sequencer ruler">
            <input
              aria-label="Zoom"
              max="4"
              min="0.02"
              onChange={(event) => { setDraft(updateSequencerViewport(draft, { zoomPxPerMs: Number(event.currentTarget.value) })); }}
              step="0.02"
              type="range"
              value={draft.viewport.zoomPxPerMs}
            />
            <input
              aria-label="Pan"
              max={String(draft.timelineEndMs)}
              min="0"
              onChange={(event) => { setDraft(updateSequencerViewport(draft, { panMs: Number(event.currentTarget.value) as never })); }}
              step="10"
              type="range"
              value={draft.viewport.panMs}
            />
            <span>{String(draft.viewport.visibleStartMs)} ms - {String(draft.viewport.visibleEndMs)} ms</span>
          </div>

          <div className="sequence-grid" style={{ "--timeline-width": `${String(Math.max(760, Math.round(draft.timelineEndMs * draft.viewport.zoomPxPerMs)))}px` } as CSSProperties}>
            {draft.rows.map((row) => (
              <section className="sequence-row" key={row.id} aria-label={row.label}>
                <div className="sequence-row-label" title={row.label}>{row.label}</div>
                <div className="sequence-row-track">
                  {row.items.map((item) => (
                    <button
                      aria-label={`${item.label} ${item.source} ${item.capability}`}
                      className="sequence-bar"
                      data-selected={draft.selection.itemIds.includes(item.id)}
                      data-source={item.source}
                      disabled={false}
                      key={item.id}
                      onClick={(event) => {
                        setDraft(selectSequencerItems(draft, [item.id], event.shiftKey ? "range" : event.metaKey || event.ctrlKey ? "add" : "replace"));
                      }}
                      onDoubleClick={() => {
                        const snapped = snapTime(item.startMs, draft.snap);
                        setDraft(offsetSelection(selectSequencerItems(draft, [item.id]), (snapped - item.startMs) as never));
                      }}
                      style={{
                        left: `${String(Math.max(0, timeToPixel(item.startMs, draft.viewport)))}px`,
                        width: `${String(Math.max(8, timeToPixel(item.endMs, draft.viewport) - timeToPixel(item.startMs, draft.viewport)))}px`
                      }}
                      type="button"
                    >
                      <span>{item.label}</span>
                      {item.keyframes.map((keyframe) => (
                        <i
                          aria-hidden="true"
                          className="sequence-keyframe"
                          key={keyframe.id}
                          style={{ left: `${String(Math.max(0, timeToPixel(keyframe.timeMs, draft.viewport) - timeToPixel(item.startMs, draft.viewport)))}px` }}
                        />
                      ))}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {draft.warnings.length > 0 ? (
            <ul className="sequence-warnings" aria-label="Sequencer warnings">
              {draft.warnings.slice(-4).map((warning, index) => <li key={`${warning.code}-${String(index)}`}>{warning.message}</li>)}
            </ul>
          ) : null}
          {readState.failures.length > 0 ? <div className="scope-state scope-state-stale">{String(readState.failures.length)} scoped read(s) failed.</div> : null}
        </>
      ) : null}
    </section>
  );
};

const SequencerPropertyDrawer = ({ item, error }: { item: SequencerItemDraft; error: string | null }) => (
  <ContextDrawerShell
    description="Selection details are draft-local until preview and Apply."
    mode="context"
    onClose={() => undefined}
    open={true}
    title="Sequencer properties"
  >
    <dl className="sequence-property-list">
      <div><dt>Source</dt><dd>{item.source}</dd></div>
      <div><dt>Capability</dt><dd>{item.capability}</dd></div>
      <div><dt>Start</dt><dd>{String(item.startMs)} ms</dd></div>
      <div><dt>End</dt><dd>{String(item.endMs)} ms</dd></div>
      <div><dt>Duration</dt><dd>{String(item.durationMs)} ms</dd></div>
      <div><dt>Keyframes</dt><dd>{String(item.keyframes.length)}</dd></div>
      <div><dt>Limitations</dt><dd>{item.capabilityReason}</dd></div>
    </dl>
    {error === null ? null : <p className="edit-field-error">{error}</p>}
  </ContextDrawerShell>
);
