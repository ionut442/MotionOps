import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatEasing, formatMilliseconds } from "../domain/inspector";
import type { MotionSnapshot, NormalizedEasing } from "../domain/motion";
import type { ScopeScanResult } from "../domain/scopeScan";
import { orderScopeNodes, type ScopeOrderMode } from "../domain/scopeOrdering";
import type { StaggerAnchor, StaggerDurationPolicy, StaggerTimingMode } from "../domain/stagger";
import type {
  MotionEditOperation,
  MotionClipboard,
  MotionClipboardCopyMode,
  PasteMode,
  PluginToUiMessage,
  UiToPluginMessage
} from "../shared/messages";
import { createApplicationStateError } from "./applicationState";
import { useApplicationStateDispatch } from "./applicationStateContext";
import { ChangePreview, type ChangePreviewPlan } from "./components/ChangePreview";
import { ContextDrawerShell } from "./components/ContextDrawerShell";
import { Select } from "./components/ui";

interface EditWorkspaceProps {
  readonly activeScope: ScopeScanResult | null;
  readonly lastMessage: PluginToUiMessage | null;
  readonly sendToPlugin: (message: UiToPluginMessage) => void;
  readonly createRequestId: () => string;
  readonly onContextDrawerChange: (drawer: ReactNode | null) => void;
}

type EditTab = "timing" | "easing" | "copy-paste" | "stagger";
type TimingMode =
  | "duration-start"
  | "duration-end"
  | "delay-add"
  | "delay-remove"
  | "delay-replace"
  | "scale";

type ReadState =
  | { status: "idle" }
  | { status: "loading"; requestId: string }
  | { status: "ready"; snapshots: readonly MotionSnapshot[]; failures: readonly string[] }
  | { status: "error"; message: string };

type ApplyResult = { status: string; message: string } | null;

const isSupported = (status: string): boolean =>
  status === "supported" || status === "supported-with-warning";

const scopeKey = (scope: ScopeScanResult | null): string =>
  scope === null ? "none" : scope.nodes.map((node) => node.id).join("|");

const asIntegerMs = (value: string): number | null => {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const cubicBezierFromInput = (input: string): { ok: true; easing: NormalizedEasing } | { ok: false; message: string } => {
  const match = /^cubic-bezier\((.*)\)$/i.exec(input.trim());
  if (!match) {
    return { ok: false, message: "Use cubic-bezier(x1, y1, x2, y2)." };
  }
  const values = match[1].split(",").map((part) => Number(part.trim()));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return { ok: false, message: "Cubic-bezier requires four finite numbers." };
  }
  const [x1, y1, x2, y2] = values;
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    return { ok: false, message: "The x control points must be between 0 and 1." };
  }
  if (y1 < -4 || y1 > 4 || y2 < -4 || y2 > 4) {
    return { ok: false, message: "The y control points must stay within -4 and 4." };
  }
  return { ok: true, easing: { kind: "cubic-bezier", x1, y1, x2, y2 } };
};

const nodeLabel = (scope: ScopeScanResult | null, nodeId: string): string =>
  scope?.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;

export const EditWorkspace = ({
  activeScope,
  lastMessage,
  sendToPlugin,
  createRequestId,
  onContextDrawerChange
}: EditWorkspaceProps) => {
  const dispatchApplicationEvent = useApplicationStateDispatch();
  const [readState, setReadState] = useState<ReadState>({ status: "idle" });
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedTargetIds, setSelectedTargetIds] = useState<ReadonlySet<string>>(new Set());
  const [tab, setTab] = useState<EditTab>("timing");
  const [timingMode, setTimingMode] = useState<TimingMode>("duration-start");
  const [durationMs, setDurationMs] = useState("500");
  const [delayMs, setDelayMs] = useState("100");
  const [scaleNumerator, setScaleNumerator] = useState("2");
  const [scaleDenominator, setScaleDenominator] = useState("1");
  const [easingMode, setEasingMode] = useState("linear");
  const [cubicBezier, setCubicBezier] = useState("cubic-bezier(0.2, 0, 0.4, 1)");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [previewPlan, setPreviewPlan] = useState<ChangePreviewPlan | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResult>(null);
  const [copyMode, setCopyMode] = useState<MotionClipboardCopyMode>("complete");
  const [clipboard, setClipboard] = useState<MotionClipboard | null>(null);
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState<PasteMode>("replace");
  const [pasteMappingMode, setPasteMappingMode] = useState<"one-to-many" | "scope-order">("one-to-many");
  const [pasteOffsetMs, setPasteOffsetMs] = useState("0");
  const [pasteIntervalMs, setPasteIntervalMs] = useState("0");
  const [pasteReverse, setPasteReverse] = useState(false);
  const [staggerTimingMode, setStaggerTimingMode] = useState<StaggerTimingMode>("fixed-interval");
  const [staggerAmountMs, setStaggerAmountMs] = useState("100");
  const [staggerDurationPolicy, setStaggerDurationPolicy] = useState<StaggerDurationPolicy>("preserve");
  const [staggerAnchor, setStaggerAnchor] = useState<StaggerAnchor>("preserve-first-start");
  const [staggerOrderMode, setStaggerOrderMode] = useState<ScopeOrderMode>("layer-panel");
  const [compatibilitySummary, setCompatibilitySummary] = useState<string | null>(null);
  const activeReadRequestRef = useRef<string | null>(null);
  const activePlanRequestRef = useRef<string | null>(null);
  const activeApplyRequestRef = useRef<string | null>(null);
  const activeCopyRequestRef = useRef<string | null>(null);
  const activePasteRequestRef = useRef<string | null>(null);
  const lastScopeKeyRef = useRef("none");

  useEffect(() => {
    const key = scopeKey(activeScope);
    if (key === lastScopeKeyRef.current) {
      return;
    }
    lastScopeKeyRef.current = key;
    setPreviewPlan(null);
    setApplyResult(null);
    onContextDrawerChange(null);

    if (activeScope === null || activeScope.nodes.length === 0) {
      activeReadRequestRef.current = null;
      setReadState({ status: "idle" });
      setSelectedNodeId("");
      return;
    }

    const requestId = createRequestId();
    activeReadRequestRef.current = requestId;
    setReadState({ status: "loading", requestId });
    sendToPlugin({
      type: "MOTION_INSPECT_REQUEST",
      requestId,
      nodeIds: activeScope.nodes.map((node) => node.id)
    });
  }, [activeScope, createRequestId, onContextDrawerChange, sendToPlugin]);

  useEffect(() => {
    if (lastMessage === null) {
      return;
    }
    if (lastMessage.type === "MOTION_INSPECT_RESULT" && lastMessage.requestId === activeReadRequestRef.current) {
      activeReadRequestRef.current = null;
      setReadState({
        status: "ready",
        snapshots: lastMessage.result.snapshots,
        failures: lastMessage.result.failures.map((failure) => `${failure.nodeId}: ${failure.message}`)
      });
      const first = lastMessage.result.snapshots[0];
      setSelectedNodeId(lastMessage.result.snapshots.length > 0 ? first.nodeId : "");
    }
    if (lastMessage.type === "MOTION_PLAN_OPERATION_RESULT" && lastMessage.requestId === activePlanRequestRef.current) {
      activePlanRequestRef.current = null;
      if (lastMessage.result.ok) {
        const plan = lastMessage.result.plan as ChangePreviewPlan;
        setPreviewPlan(plan);
        setPlanError(null);
        setApplyResult(null);
        dispatchApplicationEvent({ type: "DRAFT_CHANGED", draftId: "planId" in plan ? String(plan.planId) : undefined });
      } else {
        setPreviewPlan(null);
        setPlanError(lastMessage.result.error.message);
      }
    }
    if (lastMessage.type === "MOTION_APPLY_CHANGE_PLAN_RESULT" && lastMessage.requestId === activeApplyRequestRef.current) {
      activeApplyRequestRef.current = null;
      const result = lastMessage.result as { status?: string; errors?: { message: string }[] };
      const status = result.status ?? "unknown";
      const message = result.errors?.[0]?.message ?? `Apply result: ${status}.`;
      setApplyResult({ status, message });
      if (status === "success" || status === "partial-success") {
        dispatchApplicationEvent({ type: "APPLY_SUCCEEDED" });
      } else if (status === "stale") {
        dispatchApplicationEvent({ type: "DOCUMENT_STALE", reason: "operation_baseline_changed" });
      } else {
        dispatchApplicationEvent({
          type: "APPLY_FAILED",
          error: createApplicationStateError("apply_failed", message, { recoverable: true, stage: "apply" })
        });
      }
    }
    if (lastMessage.type === "MOTION_CLIPBOARD_COPY_RESULT" && lastMessage.requestId === activeCopyRequestRef.current) {
      activeCopyRequestRef.current = null;
      if (lastMessage.result.ok) {
        setClipboard(lastMessage.result.clipboard);
        setClipboardMessage(`Clipboard replaced with ${String(lastMessage.result.clipboard.sources.length)} source(s).`);
        setCompatibilitySummary(null);
      } else {
        setClipboardMessage(lastMessage.result.error.message);
      }
    }
    if (lastMessage.type === "MOTION_PASTE_PLAN_RESULT" && lastMessage.requestId === activePasteRequestRef.current) {
      activePasteRequestRef.current = null;
      if (lastMessage.result.ok) {
        const plan = lastMessage.result.plan as ChangePreviewPlan;
        const summary = (lastMessage.result.compatibility as { summary?: { supported?: number; warnings?: number; partial?: number; readOnly?: number; unsupported?: number } }).summary;
        setPreviewPlan(plan);
        setPlanError(null);
        setApplyResult(null);
        setCompatibilitySummary(summary ? `Supported ${String(summary.supported ?? 0)}, warning ${String(summary.warnings ?? 0)}, partial ${String(summary.partial ?? 0)}, skipped ${String((summary.readOnly ?? 0) + (summary.unsupported ?? 0))}.` : "Compatibility analysis completed.");
        dispatchApplicationEvent({ type: "DRAFT_CHANGED", draftId: "planId" in plan ? String(plan.planId) : undefined });
      } else {
        setPlanError(lastMessage.result.error.message);
      }
    }
    if (lastMessage.type === "PLUGIN_ERROR") {
      if (lastMessage.requestId === activePlanRequestRef.current) {
        activePlanRequestRef.current = null;
        setPlanError(lastMessage.message);
      }
      if (lastMessage.requestId === activeApplyRequestRef.current) {
        activeApplyRequestRef.current = null;
        setApplyResult({ status: "error", message: lastMessage.message });
      }
      if (lastMessage.requestId === activeCopyRequestRef.current || lastMessage.requestId === activePasteRequestRef.current) {
        activeCopyRequestRef.current = null;
        activePasteRequestRef.current = null;
        setPlanError(lastMessage.message);
      }
    }
  }, [dispatchApplicationEvent, lastMessage]);

  const snapshots = readState.status === "ready" ? readState.snapshots : [];
  const selectedSnapshot =
    snapshots.length === 0 ? null : (snapshots.find((snapshot) => snapshot.nodeId === selectedNodeId) ?? snapshots[0]);

  const targetOptions = useMemo(() => {
    if (selectedSnapshot === null) {
      return [];
    }
    return [
      ...selectedSnapshot.manualTracks.map((track) => ({
        id: track.trackId ?? track.property,
        label: `${track.property} manual`,
        meta: `${String(track.keyframes.length)} keyframes, ${track.write.status}`,
        readonly: !isSupported(track.write.status),
        source: "manual" as const
      })),
      ...selectedSnapshot.styleInstances.map((style, index) => ({
        id: style.appliedStyleInstanceId ?? style.availableAnimationStyleId ?? `style-${String(index)}`,
        label: `${style.name ?? "Unnamed style"} style`,
        meta: "read-only until live writer evidence exists",
        readonly: true,
        source: "style" as const
      }))
    ];
  }, [selectedSnapshot]);

  const staggerOrderedNodes = useMemo(() => {
    if (activeScope === null) {
      return [];
    }
    return orderScopeNodes(activeScope.nodes, {
      mode: staggerOrderMode,
      customNodeIds: activeScope.nodes.map((node) => node.id)
    });
  }, [activeScope, staggerOrderMode]);

  useEffect(() => {
    setSelectedTargetIds(new Set(targetOptions.filter((option) => option.source === "manual" && !option.readonly).map((option) => option.id)));
  }, [targetOptions]);

  const buildOperation = (): MotionEditOperation | null => {
    setFieldError(null);
    if (tab === "timing") {
      if (timingMode === "duration-start" || timingMode === "duration-end") {
        const value = asIntegerMs(durationMs);
        if (value === null) {
          setFieldError("Duration must be a non-negative integer number of milliseconds.");
          return null;
        }
        return {
          kind: "set-duration",
          durationMs: value,
          anchor: timingMode === "duration-start" ? "preserve-start" : "preserve-end"
        };
      }
      if (timingMode === "delay-remove") {
        return { kind: "set-delay", mode: "remove" };
      }
      if (timingMode === "delay-add" || timingMode === "delay-replace") {
        const value = asIntegerMs(delayMs);
        if (value === null) {
          setFieldError("Delay must be a non-negative integer number of milliseconds.");
          return null;
        }
        return { kind: "set-delay", mode: timingMode === "delay-add" ? "add" : "replace", delayMs: value };
      }
      const numerator = Number(scaleNumerator);
      const denominator = Number(scaleDenominator);
      if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator <= 0 || denominator <= 0) {
        setFieldError("Timing scale requires positive integer numerator and denominator.");
        return null;
      }
      return { kind: "scale-timing", numerator, denominator, origin: "start" };
    }

    if (easingMode === "custom") {
      const parsed = cubicBezierFromInput(cubicBezier);
      if (!parsed.ok) {
        setFieldError(parsed.message);
        return null;
      }
      return { kind: "replace-easing", easing: parsed.easing };
    }
    if (easingMode === "spring") {
      setFieldError("Spring easing is read-only until live capability evidence verifies a writer path.");
      return null;
    }
    const easing: NormalizedEasing =
      easingMode === "linear" ? { kind: "linear" } : { kind: "preset", name: easingMode };
    return { kind: "replace-easing", easing };
  };

  const requestPlan = () => {
    if (selectedSnapshot === null) {
      setPlanError("Select a scoped target with readable Motion data before building a plan.");
      return;
    }
    const operation = buildOperation();
    if (operation === null) {
      return;
    }
    const targetIds = [
      ...selectedTargetIds,
      ...targetOptions.filter((option) => option.source === "style").map((option) => option.id)
    ];
    if (targetIds.length === 0) {
      setFieldError("Select at least one eligible manual track.");
      return;
    }
    const requestId = createRequestId();
    activePlanRequestRef.current = requestId;
    setPlanError(null);
    sendToPlugin({
      type: "MOTION_PLAN_OPERATION_REQUEST",
      requestId,
      nodeId: selectedSnapshot.nodeId,
      targetIds,
      operation
    });
  };

  const replaceClipboard = () => {
    if (selectedSnapshot === null) {
      setClipboardMessage("Select a readable source before copying.");
      return;
    }
    const selectedTrackIds = copyMode === "selected-tracks" ? [...selectedTargetIds] : [];
    const requestId = createRequestId();
    activeCopyRequestRef.current = requestId;
    setClipboardMessage(null);
    sendToPlugin({
      type: "MOTION_CLIPBOARD_COPY_REQUEST",
      requestId,
      nodeIds: [selectedSnapshot.nodeId],
      mode: copyMode,
      selectedTrackIds
    });
  };

  const requestPastePreview = () => {
    if (clipboard === null) {
      setPlanError("Copy Motion before building a paste preview.");
      return;
    }
    if (activeScope === null || activeScope.nodes.length === 0) {
      setPlanError("Confirm destination Scope before pasting.");
      return;
    }
    const offsetMs = asIntegerMs(pasteOffsetMs);
    const intervalMs = asIntegerMs(pasteIntervalMs);
    if (offsetMs === null || intervalMs === null) {
      setPlanError("Offset and interval must be non-negative integer milliseconds.");
      return;
    }
    const requestId = createRequestId();
    activePasteRequestRef.current = requestId;
    setPlanError(null);
    sendToPlugin({
      type: "MOTION_PASTE_PLAN_REQUEST",
      requestId,
      clipboard,
      destinationNodeIds: activeScope.nodes.map((node) => node.id),
      pasteMode,
      mapping: { mode: pasteMappingMode },
      timing: { offsetMs, intervalMs, reverseOrder: pasteReverse }
    });
  };

  const requestStaggerPreview = () => {
    if (clipboard === null) {
      setPlanError("Copy a reference source before building a stagger preview.");
      return;
    }
    if (activeScope === null || activeScope.nodes.length === 0) {
      setPlanError("Confirm destination Scope before staggering.");
      return;
    }
    const amountMs = asIntegerMs(staggerAmountMs);
    if (amountMs === null) {
      setPlanError("Stagger timing must be a non-negative integer millisecond value.");
      return;
    }
    const requestId = createRequestId();
    activePasteRequestRef.current = requestId;
    setPlanError(null);
    sendToPlugin({
      type: "MOTION_PASTE_PLAN_REQUEST",
      requestId,
      clipboard,
      destinationNodeIds: staggerOrderedNodes.map((node) => node.id),
      pasteMode,
      mapping: { mode: "one-to-many" },
      timing: {
        offsetMs: 0,
        intervalMs: 0,
        stagger: {
          kind: "stagger",
          timingMode: staggerTimingMode,
          durationPolicy: staggerDurationPolicy,
          anchor: staggerAnchor,
          intervalMs: staggerTimingMode === "fixed-interval" ? amountMs as never : undefined,
          totalDurationMs: staggerTimingMode === "total-duration" ? amountMs as never : undefined,
          overlapMs: staggerTimingMode === "fixed-overlap" || staggerTimingMode === "start-before-previous-end" ? amountMs as never : undefined,
          gapMs: staggerTimingMode === "sequential-after-end" ? amountMs as never : undefined
        }
      }
    });
  };

  const applyPreview = useCallback(() => {
    if (previewPlan === null) {
      return;
    }
    const requestId = createRequestId();
    activeApplyRequestRef.current = requestId;
    dispatchApplicationEvent({ type: "APPLY_STARTED", operationId: "planId" in previewPlan ? String(previewPlan.planId) : requestId });
    sendToPlugin({ type: "MOTION_APPLY_CHANGE_PLAN_REQUEST", requestId, plan: previewPlan });
  }, [createRequestId, dispatchApplicationEvent, previewPlan, sendToPlugin]);

  const dismissPreview = useCallback(() => {
    setPreviewPlan(null);
    setApplyResult(null);
    onContextDrawerChange(null);
    dispatchApplicationEvent({ type: "DRAFT_CLEARED" });
  }, [dispatchApplicationEvent, onContextDrawerChange]);

  useEffect(() => {
    if (previewPlan === null) {
      onContextDrawerChange(null);
      return;
    }
    onContextDrawerChange(
      <ContextDrawerShell
        description="Review the generated plan before writing to Figma."
        mode="change-preview"
        onClose={dismissPreview}
        open={true}
        title="Edit preview"
        footer={
          <div className="edit-drawer-actions">
            {applyResult === null ? null : (
              <span className="edit-apply-result" role="status">
                {applyResult.status}: {applyResult.message}
              </span>
            )}
            <button onClick={dismissPreview} type="button">
              Dismiss
            </button>
            <button
              disabled={previewPlan.mutations.length === 0 || activeApplyRequestRef.current !== null}
              onClick={applyPreview}
              type="button"
            >
              Apply
            </button>
          </div>
        }
      >
        <ChangePreview plan={previewPlan} />
      </ContextDrawerShell>
    );
  }, [applyPreview, applyResult, dismissPreview, onContextDrawerChange, previewPlan]);

  const toggleTarget = (targetId: string, selected: boolean) => {
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(targetId);
      } else {
        next.delete(targetId);
      }
      return next;
    });
  };

  return (
    <section aria-label="Edit Motion" className="edit-workspace">
      <div className="edit-header">
        <div>
          <h2>Edit</h2>
          <p>
            {activeScope === null
              ? "No confirmed Scope is available."
              : `${String(activeScope.nodes.length)} scoped targets available for guarded editing.`}
          </p>
        </div>
        <div className="edit-tabs" role="tablist" aria-label="Edit operation type">
          <button
            aria-selected={tab === "timing"}
            onClick={() => {
              setTab("timing");
            }}
            role="tab"
            type="button"
          >
            Timing
          </button>
          <button
            aria-selected={tab === "easing"}
            onClick={() => {
              setTab("easing");
            }}
            role="tab"
            type="button"
          >
            Easing
          </button>
          <button
            aria-selected={tab === "copy-paste"}
            onClick={() => {
              setTab("copy-paste");
            }}
            role="tab"
            type="button"
          >
            Copy/Paste
          </button>
          <button
            aria-selected={tab === "stagger"}
            onClick={() => {
              setTab("stagger");
            }}
            role="tab"
            type="button"
          >
            Stagger
          </button>
        </div>
      </div>

      {readState.status === "idle" ? <div className="scope-state">Confirm a Scope before editing Motion.</div> : null}
      {readState.status === "loading" ? <div className="scope-state">Reading normalized Motion data for Edit.</div> : null}
      {readState.status === "error" ? <div className="scope-state scope-state-error">{readState.message}</div> : null}

      {readState.status === "ready" ? (
        <>
          <div className="edit-layout">
            <fieldset className="edit-panel">
              <legend>Target</legend>
              <label className="scope-field">
                <span>Scoped node</span>
                <Select
                  label="Scoped node"
                  value={selectedSnapshot === null ? "" : selectedSnapshot.nodeId}
                  onChange={(value) => {
                    setSelectedNodeId(value);
                  }}
                  options={snapshots.map((snapshot) => ({
                    value: snapshot.nodeId,
                    label: `${nodeLabel(activeScope, snapshot.nodeId)} (${snapshot.sources.kind})`
                  }))}
                />
              </label>
              <div className="edit-target-list" aria-label="Edit targets">
                {targetOptions.length === 0 ? (
                  <div className="scope-state">No manual or style Motion targets were exposed for this node.</div>
                ) : (
                  targetOptions.map((option) => (
                    <label className="edit-target-option" data-readonly={option.readonly} key={option.id}>
                      <input
                        checked={option.source === "style" || selectedTargetIds.has(option.id)}
                        disabled={option.source === "style" || option.readonly}
                        onChange={(event) => {
                          toggleTarget(option.id, event.currentTarget.checked);
                        }}
                        type="checkbox"
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.meta}</small>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            <fieldset className="edit-panel">
              <legend>{tab === "timing" ? "Timing operation" : tab === "easing" ? "Easing operation" : tab === "copy-paste" ? "Copy/Paste Motion" : "Stagger Motion"}</legend>
              {tab === "timing" ? (
                <TimingFields
                  delayMs={delayMs}
                  durationMs={durationMs}
                  mode={timingMode}
                  scaleDenominator={scaleDenominator}
                  scaleNumerator={scaleNumerator}
                  setDelayMs={setDelayMs}
                  setDurationMs={setDurationMs}
                  setMode={setTimingMode}
                  setScaleDenominator={setScaleDenominator}
                  setScaleNumerator={setScaleNumerator}
                />
              ) : tab === "easing" ? (
                <EasingFields
                  cubicBezier={cubicBezier}
                  easingMode={easingMode}
                  selectedSnapshot={selectedSnapshot}
                  setCubicBezier={setCubicBezier}
                  setEasingMode={setEasingMode}
                />
              ) : tab === "copy-paste" ? (
                <CopyPasteFields
                  clipboard={clipboard}
                  clipboardMessage={clipboardMessage}
                  compatibilitySummary={compatibilitySummary}
                  copyMode={copyMode}
                  pasteIntervalMs={pasteIntervalMs}
                  pasteMode={pasteMode}
                  pasteOffsetMs={pasteOffsetMs}
                  pasteReverse={pasteReverse}
                  pasteMappingMode={pasteMappingMode}
                  replaceClipboard={replaceClipboard}
                  requestPastePreview={requestPastePreview}
                  setCopyMode={setCopyMode}
                  setPasteIntervalMs={setPasteIntervalMs}
                  setPasteMode={setPasteMode}
                  setPasteOffsetMs={setPasteOffsetMs}
                  setPasteReverse={setPasteReverse}
                  setPasteMappingMode={setPasteMappingMode}
                />
              ) : (
                <StaggerFields
                  anchor={staggerAnchor}
                  amountMs={staggerAmountMs}
                  clipboard={clipboard}
                  durationPolicy={staggerDurationPolicy}
                  orderedLabels={staggerOrderedNodes.map((node) => node.name)}
                  orderMode={staggerOrderMode}
                  pasteMode={pasteMode}
                  replaceClipboard={replaceClipboard}
                  requestStaggerPreview={requestStaggerPreview}
                  setAnchor={setStaggerAnchor}
                  setAmountMs={setStaggerAmountMs}
                  setDurationPolicy={setStaggerDurationPolicy}
                  setOrderMode={setStaggerOrderMode}
                  setPasteMode={setPasteMode}
                  setTimingMode={setStaggerTimingMode}
                  timingMode={staggerTimingMode}
                />
              )}
              {fieldError === null ? null : <p className="edit-field-error">{fieldError}</p>}
              {planError === null ? null : <p className="edit-field-error">{planError}</p>}
              {tab === "copy-paste" || tab === "stagger" ? null : (
                <button className="edit-primary-action" onClick={requestPlan} type="button">
                  Build plan
                </button>
              )}
            </fieldset>
          </div>
          {readState.failures.length > 0 ? (
            <div className="scope-state scope-state-stale">
              {String(readState.failures.length)} scoped target read(s) failed.
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
};

const TimingFields = ({
  delayMs,
  durationMs,
  mode,
  scaleDenominator,
  scaleNumerator,
  setDelayMs,
  setDurationMs,
  setMode,
  setScaleDenominator,
  setScaleNumerator
}: {
  delayMs: string;
  durationMs: string;
  mode: TimingMode;
  scaleDenominator: string;
  scaleNumerator: string;
  setDelayMs: (value: string) => void;
  setDurationMs: (value: string) => void;
  setMode: (value: TimingMode) => void;
  setScaleDenominator: (value: string) => void;
  setScaleNumerator: (value: string) => void;
}) => (
  <>
    <label className="scope-field">
      <span>Operation</span>
      <Select
        label="Operation"
        value={mode}
        onChange={setMode}
        options={[
          { value: "duration-start", label: "Exact duration, preserve start" },
          { value: "duration-end", label: "Exact duration, preserve end" },
          { value: "delay-add", label: "Add delay" },
          { value: "delay-remove", label: "Remove delay" },
          { value: "delay-replace", label: "Replace delay" },
          { value: "scale", label: "Overall timing scale" }
        ]}
      />
    </label>
    {mode === "duration-start" || mode === "duration-end" ? (
      <label className="scope-field">
        <span>Duration (ms)</span>
        <input
          inputMode="numeric"
          onChange={(event) => {
            setDurationMs(event.currentTarget.value);
          }}
          value={durationMs}
        />
      </label>
    ) : null}
    {mode === "delay-add" || mode === "delay-replace" ? (
      <label className="scope-field">
        <span>Delay (ms)</span>
        <input
          inputMode="numeric"
          onChange={(event) => {
            setDelayMs(event.currentTarget.value);
          }}
          value={delayMs}
        />
      </label>
    ) : null}
    {mode === "scale" ? (
      <div className="edit-scale-fields">
        <label className="scope-field">
          <span>Scale numerator</span>
          <input
            inputMode="numeric"
            onChange={(event) => {
              setScaleNumerator(event.currentTarget.value);
            }}
            value={scaleNumerator}
          />
        </label>
        <label className="scope-field">
          <span>Scale denominator</span>
          <input
            inputMode="numeric"
            onChange={(event) => {
              setScaleDenominator(event.currentTarget.value);
            }}
            value={scaleDenominator}
          />
        </label>
      </div>
    ) : null}
  </>
);

const EasingFields = ({
  cubicBezier,
  easingMode,
  selectedSnapshot,
  setCubicBezier,
  setEasingMode
}: {
  cubicBezier: string;
  easingMode: string;
  selectedSnapshot: MotionSnapshot | null;
  setCubicBezier: (value: string) => void;
  setEasingMode: (value: string) => void;
}) => {
  const existing = selectedSnapshot?.manualTracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.easing)) ?? [];
  return (
    <>
      <label className="scope-field">
        <span>Easing</span>
        <Select
          label="Easing"
          value={easingMode}
          onChange={setEasingMode}
          options={[
            { value: "linear", label: "Linear" },
            { value: "EASE_IN", label: "Ease in" },
            { value: "EASE_OUT", label: "Ease out" },
            { value: "EASE_IN_AND_OUT", label: "Ease in and out" },
            { value: "custom", label: "Custom cubic-bezier" },
            { value: "spring", label: "Spring (read-only)" }
          ]}
        />
      </label>
      {easingMode === "custom" ? (
        <label className="scope-field">
          <span>Cubic-bezier</span>
          <input
            onChange={(event) => {
              setCubicBezier(event.currentTarget.value);
            }}
            value={cubicBezier}
          />
        </label>
      ) : null}
      <div className="edit-easing-reference">
        <strong>Existing easing</strong>
        <span>{existing.length === 0 ? "No manual easing exposed" : existing.slice(0, 3).map(formatEasing).join(", ")}</span>
      </div>
      <div className="edit-easing-reference">
        <strong>Timing range</strong>
        <span>
          {selectedSnapshot?.manualTracks[0]?.keyframes.length
            ? selectedSnapshot.manualTracks[0].keyframes.map((keyframe) => formatMilliseconds(keyframe.timeMs)).join(", ")
            : "No manual keyframes exposed"}
        </span>
      </div>
    </>
  );
};

const CopyPasteFields = ({
  clipboard,
  clipboardMessage,
  compatibilitySummary,
  copyMode,
  pasteIntervalMs,
  pasteMappingMode,
  pasteMode,
  pasteOffsetMs,
  pasteReverse,
  replaceClipboard,
  requestPastePreview,
  setCopyMode,
  setPasteIntervalMs,
  setPasteMappingMode,
  setPasteMode,
  setPasteOffsetMs,
  setPasteReverse
}: {
  clipboard: MotionClipboard | null;
  clipboardMessage: string | null;
  compatibilitySummary: string | null;
  copyMode: MotionClipboardCopyMode;
  pasteIntervalMs: string;
  pasteMappingMode: "one-to-many" | "scope-order";
  pasteMode: PasteMode;
  pasteOffsetMs: string;
  pasteReverse: boolean;
  replaceClipboard: () => void;
  requestPastePreview: () => void;
  setCopyMode: (value: MotionClipboardCopyMode) => void;
  setPasteIntervalMs: (value: string) => void;
  setPasteMappingMode: (value: "one-to-many" | "scope-order") => void;
  setPasteMode: (value: PasteMode) => void;
  setPasteOffsetMs: (value: string) => void;
  setPasteReverse: (value: boolean) => void;
}) => (
  <div className="edit-copy-paste">
    <section className="edit-copy-paste-section" aria-label="Copy Motion">
      <label className="scope-field">
        <span>Copy mode</span>
        <Select
          label="Copy mode"
          value={copyMode}
          onChange={setCopyMode}
          options={[
            { value: "complete", label: "Complete animation" },
            { value: "timing-only", label: "Timing only" },
            { value: "easing-only", label: "Easing only" },
            { value: "selected-tracks", label: "Selected tracks" }
          ]}
        />
      </label>
      <button className="edit-secondary-action" onClick={replaceClipboard} type="button">
        Replace clipboard
      </button>
      <div className="edit-clipboard-summary" aria-label="Clipboard summary">
        {clipboard === null ? (
          <span>No Motion clipboard in this plugin session.</span>
        ) : (
          <>
            <strong>{clipboard.mode}</strong>
            <span>{String(clipboard.sources.length)} source(s), {String(clipboard.sources.reduce((count, source) => count + source.manualTracks.length, 0))} manual track(s), {String(clipboard.sources.reduce((count, source) => count + source.styleInstances.length, 0))} read-only style item(s).</span>
          </>
        )}
      </div>
      {clipboardMessage === null ? null : <p className="edit-field-note">{clipboardMessage}</p>}
    </section>

    <section className="edit-copy-paste-section" aria-label="Paste Motion">
      <label className="scope-field">
        <span>Paste mode</span>
        <Select
          label="Paste mode"
          value={pasteMode}
          onChange={setPasteMode}
          options={[
            { value: "replace", label: "Replace existing animation" },
            { value: "merge-compatible", label: "Merge compatible tracks" },
            { value: "add-missing-only", label: "Add missing only" },
            { value: "preserve-timing", label: "Paste timing, keep values" },
            { value: "preserve-easing", label: "Paste easing, keep timing and values" }
          ]}
        />
      </label>
      <label className="scope-field">
        <span>Mapping</span>
        <Select
          label="Mapping"
          value={pasteMappingMode}
          onChange={setPasteMappingMode}
          options={[
            { value: "one-to-many", label: "One source to all destinations" },
            { value: "scope-order", label: "Source order to Scope order" }
          ]}
        />
      </label>
      <div className="edit-scale-fields">
        <label className="scope-field">
          <span>Offset (ms)</span>
          <input
            inputMode="numeric"
            value={pasteOffsetMs}
            onChange={(event) => {
              setPasteOffsetMs(event.currentTarget.value);
            }}
          />
        </label>
        <label className="scope-field">
          <span>Interval (ms)</span>
          <input
            inputMode="numeric"
            value={pasteIntervalMs}
            onChange={(event) => {
              setPasteIntervalMs(event.currentTarget.value);
            }}
          />
        </label>
      </div>
      <label className="edit-target-option">
        <input
          checked={pasteReverse}
          onChange={(event) => {
            setPasteReverse(event.currentTarget.checked);
          }}
          type="checkbox"
        />
        <span>
          <strong>Reverse current Scope order</strong>
          <small>Uses the confirmed target order only.</small>
        </span>
      </label>
      {compatibilitySummary === null ? null : <p className="edit-field-note">{compatibilitySummary}</p>}
      <button className="edit-primary-action" disabled={clipboard === null} onClick={requestPastePreview} type="button">
        Build paste preview
      </button>
    </section>
  </div>
);

const StaggerFields = ({
  anchor,
  amountMs,
  clipboard,
  durationPolicy,
  orderedLabels,
  orderMode,
  pasteMode,
  replaceClipboard,
  requestStaggerPreview,
  setAnchor,
  setAmountMs,
  setDurationPolicy,
  setOrderMode,
  setPasteMode,
  setTimingMode,
  timingMode
}: {
  anchor: StaggerAnchor;
  amountMs: string;
  clipboard: MotionClipboard | null;
  durationPolicy: StaggerDurationPolicy;
  orderedLabels: readonly string[];
  orderMode: ScopeOrderMode;
  pasteMode: PasteMode;
  replaceClipboard: () => void;
  requestStaggerPreview: () => void;
  setAnchor: (value: StaggerAnchor) => void;
  setAmountMs: (value: string) => void;
  setDurationPolicy: (value: StaggerDurationPolicy) => void;
  setOrderMode: (value: ScopeOrderMode) => void;
  setPasteMode: (value: PasteMode) => void;
  setTimingMode: (value: StaggerTimingMode) => void;
  timingMode: StaggerTimingMode;
}) => (
  <div className="edit-copy-paste">
    <section className="edit-copy-paste-section" aria-label="Reference Motion">
      <button className="edit-secondary-action" onClick={replaceClipboard} type="button">
        Copy reference source
      </button>
      <div className="edit-clipboard-summary" aria-label="Reference summary">
        {clipboard === null ? (
          <span>No reference source copied.</span>
        ) : (
          <span>{String(clipboard.sources.length)} source(s), {String(clipboard.sources[0]?.manualTracks.length ?? 0)} compatible manual track(s).</span>
        )}
      </div>
    </section>
    <section className="edit-copy-paste-section" aria-label="Stagger configuration">
      <div className="edit-field-grid">
        <label className="scope-field">
          <span>Target order</span>
          <Select
            label="Target order"
            onChange={setOrderMode}
            options={[
              { value: "layer-panel", label: "Layer-panel order" },
              { value: "reverse-layer-panel", label: "Reverse layer-panel" },
              { value: "top-to-bottom", label: "Top to bottom" },
              { value: "bottom-to-top", label: "Bottom to top" },
              { value: "left-to-right", label: "Left to right" },
              { value: "right-to-left", label: "Right to left" },
              { value: "center-outward", label: "Center outward" },
              { value: "edges-inward", label: "Edges inward" },
              { value: "custom", label: "Custom Scope order" }
            ]}
            value={orderMode}
          />
        </label>
        <label className="scope-field">
          <span>Timing mode</span>
          <Select
            label="Timing mode"
            onChange={setTimingMode}
            options={[
              { value: "fixed-interval", label: "Fixed interval" },
              { value: "total-duration", label: "Total duration" },
              { value: "fixed-overlap", label: "Fixed overlap" },
              { value: "sequential-after-end", label: "Sequential after end" },
              { value: "start-before-previous-end", label: "Start before previous end" }
            ]}
            value={timingMode}
          />
        </label>
        <label className="scope-field">
          <span>{timingMode === "total-duration" ? "Total duration" : timingMode === "sequential-after-end" ? "Gap" : timingMode === "fixed-interval" ? "Interval" : "Overlap"} (ms)</span>
          <input inputMode="numeric" value={amountMs} onChange={(event) => { setAmountMs(event.currentTarget.value); }} />
        </label>
        <label className="scope-field">
          <span>Duration policy</span>
          <Select
            label="Duration policy"
            onChange={setDurationPolicy}
            options={[
              { value: "preserve", label: "Preserve each duration" },
              { value: "scale-to-fit", label: "Scale to fit" }
            ]}
            value={durationPolicy}
          />
        </label>
        <label className="scope-field">
          <span>Anchor</span>
          <Select
            label="Anchor"
            onChange={setAnchor}
            options={[
              { value: "preserve-first-start", label: "Preserve first start" },
              { value: "preserve-last-end", label: "Preserve last end" },
              { value: "extend-timeline", label: "Extend timeline" }
            ]}
            value={anchor}
          />
        </label>
        <label className="scope-field">
          <span>Paste mode</span>
          <Select
            label="Paste mode"
            onChange={setPasteMode}
            options={[
              { value: "replace", label: "Replace existing animation" },
              { value: "merge-compatible", label: "Merge compatible tracks" },
              { value: "add-missing-only", label: "Add missing only" },
              { value: "preserve-timing", label: "Paste timing, keep values" },
              { value: "preserve-easing", label: "Paste easing, keep timing and values" }
            ]}
            value={pasteMode}
          />
        </label>
      </div>
      <div className="edit-clipboard-summary" aria-label="Resolved target order">
        <strong>Resolved order</strong>
        <span>{orderedLabels.length === 0 ? "No confirmed Scope targets." : orderedLabels.join(" -> ")}</span>
      </div>
      <button className="edit-primary-action" disabled={clipboard === null} onClick={requestStaggerPreview} type="button">
        Build stagger preview
      </button>
    </section>
  </div>
);
