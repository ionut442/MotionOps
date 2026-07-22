import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatMilliseconds, nodeTypeLabel, trackTiming } from "../domain/inspector";
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
import { Icon } from "./components/Icon";
import { propertyLabel, statusLabel } from "./editPresentation";

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
type PreviewMode = EditTab;

interface PreviewSnapshot {
  readonly mode: PreviewMode;
  readonly plan: ChangePreviewPlan;
  readonly fingerprint: string;
  readonly sourceNodeId: string;
  readonly targetContext: readonly string[];
  readonly easingGroups?: readonly EasingGroup[];
  readonly newEasing?: NormalizedEasing;
}

interface EasingGroup {
  readonly id: string;
  readonly name: string;
  readonly raw: string;
  readonly easing: NormalizedEasing;
  readonly properties: readonly string[];
  readonly segmentCount: number;
  readonly mixedPropertyCount: number;
}

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

const previewTitle = (mode: PreviewMode): string => {
  switch (mode) {
    case "timing":
      return "Timing preview";
    case "easing":
      return "Easing preview";
    case "copy-paste":
      return "Paste preview";
    case "stagger":
      return "Stagger preview";
    default:
      return "Preview";
  }
};

const applyLabel = (snapshot: PreviewSnapshot): string => {
  const plan = snapshot.plan;
  if (snapshot.mode === "stagger") {
    return "Apply stagger";
  }
  switch (plan.operation.kind) {
    case "replace-easing":
      return "Apply easing";
    case "paste-motion":
      return "Paste motion";
    case "set-duration":
    case "set-delay":
    case "scale-timing":
      return `Apply ${String(plan.mutations.length)} ${plan.mutations.length === 1 ? "change" : "changes"}`;
    case "empty":
    case "spring":
    case "sequencer-draft":
      return "Apply";
    default:
      return "Apply";
  }
};

const easingPresetCurves: Record<string, NormalizedEasing> = {
  EASE_IN: { kind: "cubic-bezier", x1: 0.42, y1: 0, x2: 1, y2: 1 },
  EASE_OUT: { kind: "cubic-bezier", x1: 0, y1: 0, x2: 0.58, y2: 1 },
  EASE_IN_AND_OUT: { kind: "cubic-bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 }
};

const easingDisplayName = (easing: NormalizedEasing | undefined): string => {
  if (!easing) return "Not exposed";
  if (easing.kind === "preset") {
    switch (easing.name) {
      case "EASE_IN":
        return "Ease in";
      case "EASE_OUT":
        return "Ease out";
      case "EASE_IN_AND_OUT":
        return "Ease in and out";
      default:
        return easing.name.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
    }
  }
  if (easing.kind === "linear") return "Linear";
  if (easing.kind === "cubic-bezier") {
    const preset = closestPresetName(easing);
    return preset ?? "Custom";
  }
  if (easing.kind === "spring") return "Spring";
  return "Unknown";
};

const easingRawValue = (easing: NormalizedEasing | undefined): string => {
  if (!easing) return "Not exposed";
  if (easing.kind === "linear") return "linear";
  if (easing.kind === "preset") return easing.name;
  if (easing.kind === "cubic-bezier") {
    return `cubic-bezier(${formatCurveNumber(easing.x1)}, ${formatCurveNumber(easing.y1)}, ${formatCurveNumber(easing.x2)}, ${formatCurveNumber(easing.y2)})`;
  }
  if (easing.kind === "spring") return "spring";
  return "unknown";
};

const easingForCurve = (easing: NormalizedEasing | undefined): NormalizedEasing => {
  if (!easing || easing.kind === "unknown" || easing.kind === "spring") return { kind: "linear" };
  if (easing.kind === "preset") return easingPresetCurves[easing.name] ?? { kind: "linear" };
  return easing;
};

const easingCurvePath = (easing: NormalizedEasing | undefined, width = 96, height = 48): string => {
  const curve = easingForCurve(easing);
  const left = 4;
  const right = width - 4;
  const bottom = height - 4;
  const top = 4;
  if (curve.kind === "linear") {
    return `M${String(left)} ${String(bottom)} L${String(right)} ${String(top)}`;
  }
  if (curve.kind === "cubic-bezier") {
    return `M${String(left)} ${String(bottom)} C ${String(left + curve.x1 * (right - left))} ${String(bottom - curve.y1 * (bottom - top))}, ${String(left + curve.x2 * (right - left))} ${String(bottom - curve.y2 * (bottom - top))}, ${String(right)} ${String(top)}`;
  }
  return `M${String(left)} ${String(bottom)} L${String(right)} ${String(top)}`;
};

const easingKey = (easing: NormalizedEasing | undefined): string => easingRawValue(easing);

const segmentEasingGroups = (
  snapshot: MotionSnapshot | null,
  selectedTargetIds: ReadonlySet<string> | null = null
): readonly EasingGroup[] => {
  const groups = new Map<string, {
    easing: NormalizedEasing;
    properties: Set<string>;
    segmentCount: number;
    mixedProperties: Set<string>;
  }>();
  const propertyKeys = new Map<string, Set<string>>();
  for (const track of snapshot?.manualTracks ?? []) {
    const trackId = track.trackId ?? track.property;
    if (selectedTargetIds !== null && !selectedTargetIds.has(trackId)) continue;
    const property = propertyLabel(track.property);
    const segmentKeys = new Set<string>();
    for (let index = 1; index < track.keyframes.length; index += 1) {
      const easing = track.keyframes[index]?.easing ?? { kind: "linear" as const };
      const key = easingKey(easing);
      segmentKeys.add(key);
      const group = groups.get(key) ?? {
        easing,
        properties: new Set<string>(),
        segmentCount: 0,
        mixedProperties: new Set<string>()
      };
      group.properties.add(property);
      group.segmentCount += 1;
      groups.set(key, group);
    }
    propertyKeys.set(property, segmentKeys);
  }
  for (const [property, keys] of propertyKeys) {
    if (keys.size <= 1) continue;
    for (const key of keys) {
      groups.get(key)?.mixedProperties.add(property);
    }
  }
  return [...groups.entries()].map(([id, group]) => ({
    id,
    name: easingDisplayName(group.easing),
    raw: easingRawValue(group.easing),
    easing: group.easing,
    properties: [...group.properties],
    segmentCount: group.segmentCount,
    mixedPropertyCount: group.mixedProperties.size
  }));
};

const selectedSegmentCount = (groups: readonly EasingGroup[]): number =>
  groups.reduce((sum, group) => sum + group.segmentCount, 0);

const closestPresetName = (easing: NormalizedEasing): string | null => {
  if (easing.kind !== "cubic-bezier") return null;
  for (const [name, preset] of Object.entries(easingPresetCurves)) {
    if (preset.kind !== "cubic-bezier") continue;
    const distance = Math.abs(easing.x1 - preset.x1) + Math.abs(easing.y1 - preset.y1) + Math.abs(easing.x2 - preset.x2) + Math.abs(easing.y2 - preset.y2);
    if (distance <= 0.08) {
      return easingDisplayName({ kind: "preset", name });
    }
  }
  return null;
};

const formatCurveNumber = (value: number): string => Number.parseFloat(value.toFixed(3)).toString();

const EasingMiniCurve = ({ easing, label, size = "small" }: { readonly easing: NormalizedEasing | undefined; readonly label: string; readonly size?: "small" | "large" }) => (
  <svg className="edit-easing-mini-curve" data-size={size} viewBox="0 0 96 48" role="img" aria-label={label}>
    <line x1="4" y1="44" x2="92" y2="4" />
    <path d={easingCurvePath(easing)} />
  </svg>
);

const MotionSourceSummary = ({
  actionLabel,
  clipboard,
  label,
  selectedSnapshot,
  sourceName
}: {
  readonly actionLabel: string;
  readonly clipboard: MotionClipboard | null;
  readonly label: string;
  readonly selectedSnapshot: MotionSnapshot | null;
  readonly sourceName: string;
}) => {
  const source = clipboard?.sources[0];
  const trackCount = clipboard === null ? selectedSnapshot?.manualTracks.length ?? 0 : source?.manualTracks.length ?? 0;
  const keyframeCount = selectedSnapshot?.manualTracks.reduce((sum, track) => sum + track.keyframes.length, 0) ?? Number(source?.timingSummary.keyframeCount ?? 0);
  const segmentCount = selectedSnapshot?.manualTracks.reduce((sum, track) => sum + Math.max(0, track.keyframes.length - 1), 0) ?? Math.max(0, keyframeCount - trackCount);
  const duration = selectedSnapshot?.manualTracks.reduce((max, track) => Math.max(max, trackTiming(track).durationMs), 0) ?? 0;
  const properties = selectedSnapshot?.manualTracks.map((track) => propertyLabel(track.property)) ?? [];
  return (
    <div className="edit-motion-source-card">
      <div className="edit-motion-source-icon" aria-hidden="true"><Icon name="motion" size={15} /></div>
      <div>
        <strong>{label}</strong>
        <span title={sourceName}>{sourceName}</span>
        <small>{nodeTypeLabel(selectedSnapshot?.nodeType ?? source?.sourceNodeType ?? "NODE")} · {actionLabel}</small>
      </div>
      <p>{String(trackCount)} properties · {String(keyframeCount)} keyframes · {String(segmentCount)} segments · {duration > 0 ? formatMilliseconds(duration) : "duration not exposed"}</p>
      {properties.length > 0 ? (
        <div className="edit-property-chip-list">
          {properties.map((property) => <span key={property}>{property}</span>)}
        </div>
      ) : null}
    </div>
  );
};

const StaggerLiveTimeline = ({ amountMs, durationMs, labels }: { readonly amountMs: string; readonly durationMs: number; readonly labels: readonly string[] }) => {
  const interval = asIntegerMs(amountMs) ?? 0;
  const rows = labels.slice(0, 8).map((label, index) => ({
    label,
    start: index * interval,
    end: index * interval + Math.max(1, durationMs || 450)
  }));
  const total = Math.max(1, ...rows.map((row) => row.end));
  return (
    <div className="edit-live-timeline" aria-label={`Live stagger timeline. Total span ${formatMilliseconds(total)}.`}>
      <div className="edit-live-timeline-axis">
        <span>0 ms</span>
        <span>Total {formatMilliseconds(total)}</span>
      </div>
      {rows.map((row, index) => (
        <div className="edit-live-timeline-row" key={`${row.label}-${String(index)}`}>
          <span title={row.label}>{row.label}</span>
          <i>
            <b style={{
              marginLeft: `${String((row.start / total) * 100)}%`,
              width: `${String(Math.max(4, ((row.end - row.start) / total) * 100))}%`
            }} />
          </i>
        </div>
      ))}
      {labels.length > rows.length ? <small>{String(labels.length - rows.length)} more targets included in final preview.</small> : null}
    </div>
  );
};

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
  const [easingMode, setEasingMode] = useState("");
  const [cubicBezier, setCubicBezier] = useState("cubic-bezier(0.2, 0, 0.4, 1)");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
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
  const pendingPreviewRef = useRef<{ mode: PreviewMode; fingerprint: string; sourceNodeId: string; targetContext: readonly string[]; easingGroups?: readonly EasingGroup[]; newEasing?: NormalizedEasing } | null>(null);
  const lastScopeKeyRef = useRef("none");

  useEffect(() => {
    const key = scopeKey(activeScope);
    if (key === lastScopeKeyRef.current) {
      return;
    }
    lastScopeKeyRef.current = key;
    setPreviewSnapshot(null);
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
        setPreviewSnapshot({
          mode: pendingPreviewRef.current?.mode ?? tab,
          plan,
          fingerprint: pendingPreviewRef.current?.fingerprint ?? "",
          sourceNodeId: pendingPreviewRef.current?.sourceNodeId ?? selectedNodeId,
          targetContext: pendingPreviewRef.current?.targetContext ?? [],
          easingGroups: pendingPreviewRef.current?.easingGroups,
          newEasing: pendingPreviewRef.current?.newEasing
        });
        pendingPreviewRef.current = null;
        setPlanError(null);
        setApplyResult(null);
        dispatchApplicationEvent({ type: "DRAFT_CHANGED", draftId: "planId" in plan ? String(plan.planId) : undefined });
      } else {
        setPreviewSnapshot(null);
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
        setPreviewSnapshot({
          mode: pendingPreviewRef.current?.mode ?? tab,
          plan,
          fingerprint: pendingPreviewRef.current?.fingerprint ?? "",
          sourceNodeId: pendingPreviewRef.current?.sourceNodeId ?? selectedNodeId,
          targetContext: pendingPreviewRef.current?.targetContext ?? [],
          easingGroups: pendingPreviewRef.current?.easingGroups,
          newEasing: pendingPreviewRef.current?.newEasing
        });
        pendingPreviewRef.current = null;
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
        label: propertyLabel(track.property),
        meta: `${String(track.keyframes.length)} keyframes · Manual · ${statusLabel(track.write.status)}`,
        readonly: !isSupported(track.write.status),
        source: "manual" as const
      })),
      ...selectedSnapshot.styleInstances.map((style, index) => ({
        id: style.appliedStyleInstanceId ?? style.availableAnimationStyleId ?? `style-${String(index)}`,
        label: propertyLabel(style.name ?? "Animation style"),
        meta: "Animation style · Read-only",
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

  const currentPreviewFingerprint = (mode: PreviewMode): string => {
    const targetIds = [...selectedTargetIds].sort();
    const base = {
      mode,
      selectedNodeId,
      targetIds,
      scope: scopeKey(activeScope)
    };
    if (mode === "timing") {
      return JSON.stringify({ ...base, timingMode, durationMs, delayMs, scaleNumerator, scaleDenominator });
    }
    if (mode === "easing") {
      return JSON.stringify({ ...base, easingMode, cubicBezier });
    }
    if (mode === "copy-paste") {
      return JSON.stringify({
        ...base,
        clipboardCreatedAtMs: clipboard?.createdAtMs ?? null,
        copyMode,
        pasteMode,
        pasteMappingMode,
        pasteOffsetMs,
        pasteIntervalMs,
        pasteReverse
      });
    }
    return JSON.stringify({
      ...base,
      clipboardCreatedAtMs: clipboard?.createdAtMs ?? null,
      copyMode,
      pasteMode,
      staggerTimingMode,
      staggerAmountMs,
      staggerDurationPolicy,
      staggerAnchor,
      staggerOrderMode,
      orderedNodeIds: staggerOrderedNodes.map((node) => node.id)
    });
  };

  const clearPreview = useCallback((reason?: string) => {
    setPreviewSnapshot(null);
    setApplyResult(null);
    activeApplyRequestRef.current = null;
    onContextDrawerChange(null);
    if (reason) {
      setPlanError(reason);
    }
    dispatchApplicationEvent({ type: "DRAFT_CLEARED" });
  }, [dispatchApplicationEvent, onContextDrawerChange]);

  useEffect(() => {
    if (previewSnapshot === null) return;
    if (previewSnapshot.mode !== tab || previewSnapshot.fingerprint !== currentPreviewFingerprint(previewSnapshot.mode)) {
      clearPreview();
    }
  }, [
    activeScope,
    clearPreview,
    clipboard?.createdAtMs,
    copyMode,
    cubicBezier,
    delayMs,
    durationMs,
    easingMode,
    pasteIntervalMs,
    pasteMappingMode,
    pasteMode,
    pasteOffsetMs,
    pasteReverse,
    previewSnapshot,
    scaleDenominator,
    scaleNumerator,
    selectedNodeId,
    selectedTargetIds,
    staggerAmountMs,
    staggerAnchor,
    staggerDurationPolicy,
    staggerOrderMode,
    staggerOrderedNodes,
    staggerTimingMode,
    tab,
    timingMode
  ]);

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

    if (easingMode === "") {
      setFieldError("Choose a new easing.");
      return null;
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
      setPlanError("Select a scoped layer with readable Motion data before previewing changes.");
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
      setFieldError("Select at least one property.");
      return;
    }
    const requestId = createRequestId();
    activePlanRequestRef.current = requestId;
    pendingPreviewRef.current = {
      mode: tab,
      fingerprint: currentPreviewFingerprint(tab),
      sourceNodeId: selectedSnapshot.nodeId,
      targetContext: targetIds,
      easingGroups: tab === "easing" ? segmentEasingGroups(selectedSnapshot, selectedTargetIds) : undefined,
      newEasing: operation.kind === "replace-easing" ? operation.easing : undefined
    };
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
    pendingPreviewRef.current = {
      mode: "copy-paste",
      fingerprint: currentPreviewFingerprint("copy-paste"),
      sourceNodeId: clipboard.sources[0]?.sourceNodeId ?? "",
      targetContext: activeScope.nodes.map((node) => node.id)
    };
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
    pendingPreviewRef.current = {
      mode: "stagger",
      fingerprint: currentPreviewFingerprint("stagger"),
      sourceNodeId: clipboard.sources[0]?.sourceNodeId ?? "",
      targetContext: staggerOrderedNodes.map((node) => node.id)
    };
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
    if (previewSnapshot === null) {
      return;
    }
    if (previewSnapshot.mode !== tab || previewSnapshot.fingerprint !== currentPreviewFingerprint(previewSnapshot.mode)) {
      clearPreview("This preview is out of date. Generate a new preview before applying.");
      return;
    }
    const previewPlan = previewSnapshot.plan;
    const requestId = createRequestId();
    activeApplyRequestRef.current = requestId;
    dispatchApplicationEvent({ type: "APPLY_STARTED", operationId: "planId" in previewPlan ? String(previewPlan.planId) : requestId });
    sendToPlugin({ type: "MOTION_APPLY_CHANGE_PLAN_REQUEST", requestId, plan: previewPlan });
  }, [clearPreview, createRequestId, dispatchApplicationEvent, previewSnapshot, sendToPlugin, tab]);

  const dismissPreview = useCallback(() => {
    clearPreview();
  }, [clearPreview]);

  useEffect(() => {
    if (previewSnapshot === null) {
      onContextDrawerChange(null);
      return;
    }
    const previewPlan = previewSnapshot.plan;
    onContextDrawerChange(
      <ContextDrawerShell
        description="Review what will happen before writing."
        mode="change-preview"
        onClose={dismissPreview}
        open={true}
        title={previewTitle(previewSnapshot.mode)}
        footer={
          <div className="edit-drawer-actions">
            {applyResult === null ? null : (
              <span className="edit-apply-result" role="status">
                {applyResult.status}: {applyResult.message}
              </span>
            )}
            <button onClick={dismissPreview} type="button">
              Back
            </button>
            <button
              disabled={previewPlan.mutations.length === 0 || activeApplyRequestRef.current !== null}
              onClick={applyPreview}
              type="button"
            >
              {applyLabel(previewSnapshot)}
            </button>
          </div>
        }
      >
        <ChangePreview
          context={{
            mode: previewSnapshot.mode,
            sourceName: nodeLabel(activeScope, previewSnapshot.sourceNodeId),
            destinationNames: previewSnapshot.targetContext.map((id) => nodeLabel(activeScope, id)),
            easingGroups: previewSnapshot.easingGroups,
            newEasing: previewSnapshot.newEasing,
            staggerIntervalMs: asIntegerMs(staggerAmountMs) ?? 0
          }}
          plan={previewPlan}
        />
      </ContextDrawerShell>
    );
  }, [activeScope, applyPreview, applyResult, dismissPreview, onContextDrawerChange, previewSnapshot, staggerAmountMs]);

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

  const editableTargetCount = targetOptions.filter((option) => option.source === "manual" && !option.readonly).length;
  const selectedEditableCount = targetOptions.filter((option) => option.source === "manual" && !option.readonly && selectedTargetIds.has(option.id)).length;
  const previewDisabledReason =
    tab === "easing" && easingMode === ""
      ? "Choose a new easing."
      : selectedEditableCount === 0 && (tab === "timing" || tab === "easing")
        ? "Select at least one property."
        : null;

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
          ><Icon name="timing" size={13} /><span>Timing</span></button>
          <button
            aria-selected={tab === "easing"}
            onClick={() => {
              setTab("easing");
            }}
            role="tab"
            type="button"
          ><Icon name="easing" size={13} /><span>Easing</span></button>
          <button
            aria-selected={tab === "copy-paste"}
            onClick={() => {
              setTab("copy-paste");
            }}
            role="tab"
            type="button"
          ><Icon name="copy" size={13} /><span>Copy/Paste</span></button>
          <button
            aria-selected={tab === "stagger"}
            onClick={() => {
              setTab("stagger");
            }}
            role="tab"
            type="button"
          ><Icon name="stagger" size={13} /><span>Stagger</span></button>
        </div>
      </div>

      {readState.status === "idle" ? <div className="scope-state">Confirm a Scope before editing Motion.</div> : null}
      {readState.status === "loading" ? <div className="scope-state">Reading normalized Motion data for Edit.</div> : null}
      {readState.status === "error" ? <div className="scope-state scope-state-error">{readState.message}</div> : null}

      {readState.status === "ready" ? (
        <>
          <div className="edit-layout">
            <fieldset className="edit-panel">
              <legend>{tab === "copy-paste" ? "Motion source" : tab === "stagger" ? "Reference motion" : "Target"}</legend>
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
                  <div className="scope-state">This layer has no editable animation properties.</div>
                ) : (
                  <>
                    <div className="edit-target-summary">
                      <span>{String(selectedEditableCount)} of {String(editableTargetCount)} properties selected</span>
                      <span>
                        <button
                          disabled={editableTargetCount === 0 || selectedEditableCount === editableTargetCount}
                          onClick={() => {
                            setSelectedTargetIds(new Set(targetOptions.filter((option) => option.source === "manual" && !option.readonly).map((option) => option.id)));
                          }}
                          type="button"
                        >
                          Select all
                        </button>
                        <button
                          disabled={selectedEditableCount === 0}
                          onClick={() => {
                            setSelectedTargetIds(new Set());
                          }}
                          type="button"
                        >
                          Deselect all
                        </button>
                      </span>
                    </div>
                    {targetOptions.map((option) => (
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
                          <strong title={option.label}>{option.label}</strong>
                          <small>{option.meta}</small>
                        </span>
                      </label>
                    ))}
                  </>
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
                  selectedTargetIds={selectedTargetIds}
                  setCubicBezier={setCubicBezier}
                  setEasingMode={setEasingMode}
                />
              ) : tab === "copy-paste" ? (
                <CopyPasteFields
                  activeScope={activeScope}
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
                  selectedSnapshot={selectedSnapshot}
                  sourceName={selectedSnapshot === null ? "No source selected" : nodeLabel(activeScope, selectedSnapshot.nodeId)}
                  setCopyMode={setCopyMode}
                  setPasteIntervalMs={setPasteIntervalMs}
                  setPasteMode={setPasteMode}
                  setPasteOffsetMs={setPasteOffsetMs}
                  setPasteReverse={setPasteReverse}
                  setPasteMappingMode={setPasteMappingMode}
                />
              ) : (
                <StaggerFields
                  activeScope={activeScope}
                  anchor={staggerAnchor}
                  amountMs={staggerAmountMs}
                  clipboard={clipboard}
                  durationPolicy={staggerDurationPolicy}
                  orderedLabels={staggerOrderedNodes.map((node) => node.name)}
                  orderMode={staggerOrderMode}
                  pasteMode={pasteMode}
                  replaceClipboard={replaceClipboard}
                  requestStaggerPreview={requestStaggerPreview}
                  selectedSnapshot={selectedSnapshot}
                  sourceName={selectedSnapshot === null ? "No reference selected" : nodeLabel(activeScope, selectedSnapshot.nodeId)}
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
                <>
                  {previewDisabledReason === null ? null : <p className="edit-field-note">{previewDisabledReason}</p>}
                  <button className="edit-primary-action" disabled={previewDisabledReason !== null} onClick={requestPlan} type="button"><Icon name="eye" size={13} /><span>Preview changes</span></button>
                </>
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
    <p className="edit-mode-intro">Change when the selected properties finish.</p>
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
      <>
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
        <p className="edit-field-note">
          {mode === "duration-start"
            ? "Keep each property's first keyframe in place and move its final keyframe to the selected duration."
            : "Keep each property's final keyframe in place and move its first keyframe to match the selected duration."}
        </p>
      </>
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
  selectedTargetIds,
  setCubicBezier,
  setEasingMode
}: {
  cubicBezier: string;
  easingMode: string;
  selectedSnapshot: MotionSnapshot | null;
  selectedTargetIds: ReadonlySet<string>;
  setCubicBezier: (value: string) => void;
  setEasingMode: (value: string) => void;
}) => {
  const grouped = segmentEasingGroups(selectedSnapshot, selectedTargetIds);
  const segmentCount = selectedSegmentCount(grouped);
  const customParsed = easingMode === "custom" ? cubicBezierFromInput(cubicBezier) : null;
  const replacement: NormalizedEasing | null =
    easingMode === ""
      ? null
      : easingMode === "custom"
        ? customParsed?.ok ? customParsed.easing : null
        : easingMode === "linear"
          ? { kind: "linear" }
          : easingMode === "spring"
            ? null
            : { kind: "preset", name: easingMode };
  return (
    <>
      <p className="edit-mode-intro">Change how quickly the selected properties accelerate and slow down.</p>
      <section className="edit-current-easing" aria-label="Current easing">
        <div className="edit-section-title-row">
          <strong>Current easing</strong>
          <span>
            {grouped.length === 0
              ? "No animated segments exposed"
              : grouped.length === 1
                ? `${grouped[0]?.name ?? "Current"} · ${String(segmentCount)} animated ${segmentCount === 1 ? "segment" : "segments"}`
                : `Mixed · ${String(grouped.length)} current curves across ${String(segmentCount)} animated segments`}
          </span>
        </div>
        {grouped.length > 0 ? (
          <div className="edit-easing-group-list">
            {grouped.map((group) => (
              <div className="edit-easing-group-row" key={group.id} title={group.raw}>
                <EasingMiniCurve easing={group.easing} label={`${group.name} curve`} />
                <div>
                  <strong>{group.name}</strong>
                  <span>{String(group.segmentCount)} {group.segmentCount === 1 ? "segment" : "segments"} · {String(group.properties.length)} {group.properties.length === 1 ? "property" : "properties"}</span>
                  <small>{group.properties.join(", ")}{group.mixedPropertyCount > 0 ? " · mixed within a property" : ""}</small>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <label className="scope-field">
        <span>New easing replaces current segments</span>
        <Select
          label="New easing"
          value={easingMode}
          onChange={setEasingMode}
          options={[
            { value: "", label: "Choose easing...", disabled: true },
            { value: "linear", label: "Linear" },
            { value: "EASE_IN", label: "Ease in" },
            { value: "EASE_OUT", label: "Ease out" },
            { value: "EASE_IN_AND_OUT", label: "Ease in and out" },
            { value: "custom", label: "Custom cubic-bezier" },
            { value: "spring", label: "Spring (read-only)" }
          ]}
        />
      </label>
      {replacement === null ? null : (
        <div className="edit-new-easing-card">
          <EasingMiniCurve easing={replacement} label={`${easingDisplayName(replacement)} replacement curve`} />
          <span>Replacement curve: <strong>{easingDisplayName(replacement)}</strong></span>
        </div>
      )}
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
    </>
  );
};

const CopyPasteFields = ({
  activeScope,
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
  selectedSnapshot,
  sourceName,
  setCopyMode,
  setPasteIntervalMs,
  setPasteMappingMode,
  setPasteMode,
  setPasteOffsetMs,
  setPasteReverse
}: {
  activeScope: ScopeScanResult | null;
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
  selectedSnapshot: MotionSnapshot | null;
  sourceName: string;
  setCopyMode: (value: MotionClipboardCopyMode) => void;
  setPasteIntervalMs: (value: string) => void;
  setPasteMappingMode: (value: "one-to-many" | "scope-order") => void;
  setPasteMode: (value: PasteMode) => void;
  setPasteOffsetMs: (value: string) => void;
  setPasteReverse: (value: boolean) => void;
}) => (
  <div className="edit-copy-paste">
    <p className="edit-mode-intro">Reuse animation from one layer on other layers.</p>
    <section className="edit-copy-paste-section" aria-label="Step 1 Copy a source">
      <h3>1. Copy a source</h3>
      {clipboard === null ? (
        <p className="edit-field-note">No motion copied yet. Choose an animated source layer and copy its selected properties.</p>
      ) : null}
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
      <button className="edit-secondary-action" onClick={replaceClipboard} type="button"><Icon name="copy" size={13} /><span>{clipboard === null ? "Copy selected motion" : "Change source"}</span></button>
      <div className="edit-clipboard-summary" aria-label="Clipboard summary">
        {clipboard === null ? (
          <span>This clipboard exists only during the current plugin session.</span>
        ) : (
          <>
            <strong>{String(clipboard.sources.length)} source layer{clipboard.sources.length === 1 ? "" : "s"}</strong>
            <span>{String(clipboard.sources.reduce((count, source) => count + source.manualTracks.length, 0))} copied properties · {String(clipboard.sources.reduce((count, source) => count + source.styleInstances.length, 0))} style item(s).</span>
          </>
        )}
      </div>
      {clipboardMessage === null ? null : <p className="edit-field-note">{clipboardMessage}</p>}
      <MotionSourceSummary actionLabel={copyMode.replaceAll("-", " ")} clipboard={clipboard} label="SOURCE - multi-track copy reference" selectedSnapshot={selectedSnapshot} sourceName={sourceName} />
    </section>

    <section className="edit-copy-paste-section" aria-label="Step 2 Destinations">
      <h3>2. Choose destinations</h3>
      <p className="edit-field-note">Scope controls destination inclusion. Review exact layer names before preview.</p>
      <div className="edit-clipboard-summary">
        <strong>Confirmed Scope</strong>
        <span>{String(activeScope?.nodes.length ?? 0)} scoped destination layers. {clipboard === null ? "Copy motion before selecting paste options." : "Compatibility will be checked in preview."}</span>
      </div>
      <ul className="edit-destination-list" aria-label="Copy paste destinations">
        {(activeScope?.nodes ?? []).map((node) => (
          <li key={node.id}>
            <Icon name="rectangle-node" size={13} />
            <span title={node.name}>{node.name}</span>
            <small>{clipboard === null ? "Copy source first" : "Pending compatibility"}</small>
          </li>
        ))}
      </ul>
    </section>

    <section className="edit-copy-paste-section" aria-label="Step 3 Paste options" data-disabled={clipboard === null}>
      <h3>3. Paste options</h3>
      <label className="scope-field">
        <span>Paste behavior</span>
        <Select
          label="Paste behavior"
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
        <span>Property mapping</span>
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
      <details className="edit-advanced-options">
        <summary>Advanced timing</summary>
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
            <span>Delay between destinations (ms)</span>
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
            <strong>Reverse destination order</strong>
            <small>Applies the confirmed Scope order backwards.</small>
          </span>
        </label>
      </details>
      {compatibilitySummary === null ? null : <p className="edit-field-note">{compatibilitySummary}</p>}
      {clipboard === null ? <p className="edit-field-note">Copy motion before selecting paste options.</p> : null}
      <button className="edit-primary-action" disabled={clipboard === null} onClick={requestPastePreview} type="button"><Icon name="eye" size={13} /><span>Preview changes</span></button>
    </section>
  </div>
);

const StaggerFields = ({
  activeScope,
  anchor,
  amountMs,
  clipboard,
  durationPolicy,
  orderedLabels,
  orderMode,
  pasteMode,
  replaceClipboard,
  requestStaggerPreview,
  selectedSnapshot,
  sourceName,
  setAnchor,
  setAmountMs,
  setDurationPolicy,
  setOrderMode,
  setPasteMode,
  setTimingMode,
  timingMode
}: {
  activeScope: ScopeScanResult | null;
  anchor: StaggerAnchor;
  amountMs: string;
  clipboard: MotionClipboard | null;
  durationPolicy: StaggerDurationPolicy;
  orderedLabels: readonly string[];
  orderMode: ScopeOrderMode;
  pasteMode: PasteMode;
  replaceClipboard: () => void;
  requestStaggerPreview: () => void;
  selectedSnapshot: MotionSnapshot | null;
  sourceName: string;
  setAnchor: (value: StaggerAnchor) => void;
  setAmountMs: (value: string) => void;
  setDurationPolicy: (value: StaggerDurationPolicy) => void;
  setOrderMode: (value: ScopeOrderMode) => void;
  setPasteMode: (value: PasteMode) => void;
  setTimingMode: (value: StaggerTimingMode) => void;
  timingMode: StaggerTimingMode;
}) => (
  <div className="edit-copy-paste">
    <p className="edit-mode-intro">Apply motion across several layers with a delay between each start.</p>
    <section className="edit-copy-paste-section" aria-label="Step 1 Reference motion">
      <h3>1. Reference motion</h3>
      {clipboard === null ? <p className="edit-field-note">No reference motion selected. Select an animated layer, then use its motion as the stagger source.</p> : null}
      <button className="edit-secondary-action" onClick={replaceClipboard} type="button"><Icon name="copy" size={13} /><span>Use selected motion</span></button>
      <div className="edit-clipboard-summary" aria-label="Reference summary">
        {clipboard === null ? (
          <span>Reference motion will stay in this plugin session until replaced.</span>
        ) : (
          <span>{String(clipboard.sources.length)} source layer{clipboard.sources.length === 1 ? "" : "s"} · {String(clipboard.sources[0]?.manualTracks.length ?? 0)} copied properties.</span>
        )}
      </div>
      <MotionSourceSummary actionLabel="stagger reference" clipboard={clipboard} label="REFERENCE - stagger motion source" selectedSnapshot={selectedSnapshot} sourceName={sourceName} />
    </section>
    <section className="edit-copy-paste-section" aria-label="Step 2 Targets and order">
      <h3>2. Targets and order</h3>
      <p className="edit-field-note">The confirmed Scope provides the stagger targets.</p>
      <label className="scope-field">
        <span>Target order</span>
        <Select
          label="Target order"
          onChange={setOrderMode}
          options={[
            { value: "layer-panel", label: "Layer panel order" },
            { value: "reverse-layer-panel", label: "Reverse layer panel order" },
            { value: "top-to-bottom", label: "Top to bottom" },
            { value: "bottom-to-top", label: "Bottom to top" },
            { value: "left-to-right", label: "Left to right" },
            { value: "right-to-left", label: "Right to left" },
            { value: "center-outward", label: "Center outward" },
            { value: "edges-inward", label: "Edges inward" },
            { value: "custom", label: "Current Scope order" }
          ]}
          value={orderMode}
        />
      </label>
      <ol className="edit-order-list" aria-label="Resolved target order">
        {orderedLabels.length === 0 ? (
          <li>No confirmed Scope targets.</li>
        ) : (
          orderedLabels.map((label) => (
            <li key={label} title={label}>{label}</li>
          ))
        )}
      </ol>
      <p className="edit-field-note">{String(activeScope?.nodes.length ?? 0)} targets resolved by {orderMode.replaceAll("-", " ")}.</p>
    </section>
    <section className="edit-copy-paste-section" aria-label="Step 3 Stagger timing">
      <h3>3. Stagger timing</h3>
      <div className="edit-field-grid">
        <label className="scope-field">
          <span>Timing mode</span>
          <Select
            label="Timing mode"
            onChange={setTimingMode}
            options={[
              { value: "fixed-interval", label: "Delay between starts" },
              { value: "total-duration", label: "Total duration" },
              { value: "fixed-overlap", label: "Fixed overlap" },
              { value: "sequential-after-end", label: "Sequential after end" },
              { value: "start-before-previous-end", label: "Start before previous end" }
            ]}
            value={timingMode}
          />
        </label>
        <label className="scope-field">
          <span>{timingMode === "total-duration" ? "Total duration" : timingMode === "sequential-after-end" ? "Gap" : timingMode === "fixed-interval" ? "Delay between starts" : "Overlap"} (ms)</span>
          <input inputMode="numeric" value={amountMs} onChange={(event) => { setAmountMs(event.currentTarget.value); }} />
        </label>
        <label className="scope-field">
          <span>Duration policy</span>
          <Select
            label="Duration policy"
            onChange={setDurationPolicy}
            options={[
              { value: "preserve", label: "Keep each animation's duration" },
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
              { value: "preserve-first-start", label: "Keep the first target's start time" },
              { value: "preserve-last-end", label: "Preserve last end" },
              { value: "extend-timeline", label: "Extend timeline" }
            ]}
            value={anchor}
          />
        </label>
      </div>
      <StaggerLiveTimeline amountMs={amountMs} durationMs={selectedSnapshot?.manualTracks.reduce((max, track) => Math.max(max, trackTiming(track).durationMs), 0) ?? 450} labels={orderedLabels} />
      <details className="edit-advanced-options">
        <summary>Advanced</summary>
        <label className="scope-field">
          <span>Paste behavior</span>
          <Select
            label="Paste behavior"
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
      </details>
      {clipboard === null ? <p className="edit-field-note">Use selected motion before previewing stagger.</p> : null}
      <button className="edit-primary-action" disabled={clipboard === null} onClick={requestStaggerPreview} type="button"><Icon name="eye" size={13} /><span>Preview changes</span></button>
    </section>
  </div>
);
