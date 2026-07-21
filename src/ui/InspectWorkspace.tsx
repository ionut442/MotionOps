/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  buildInspectorTargets,
  capabilityLabel,
  collectInspectorProperties,
  createDefaultInspectorFilters,
  filterInspectorTargets,
  formatEasing,
  formatMilliseconds,
  formatMotionValue,
  formatValue,
  groupInspectorTarget,
  humanizeCapabilityName,
  humanizePropertyName,
  nodeTypeLabel,
  sourceKindLabel,
  trackTiming,
  type InspectorAnimationState,
  type InspectorFilters,
  type InspectorMode,
  type InspectorTarget
} from "../domain/inspector";
import type { ScopeScanResult } from "../domain/scopeScan";
import type { CapabilityStatus, MotionSourceKind } from "../domain/motion";
import type { PluginToUiMessage, UiToPluginMessage } from "../shared/messages";
import { Badge, EmptyState, SegmentedControl, Select, Tooltip, type SelectOption } from "./components/ui";
import { Icon, type IconName } from "./components/Icon";
import { FigmaNodeIcon, MotionSourceIcon } from "./components/FigmaNodeIcon";

export interface InspectWorkspaceProps {
  readonly activeScope: ScopeScanResult | null;
  readonly lastMessage: PluginToUiMessage | null;
  readonly sendToPlugin: (message: UiToPluginMessage) => void;
  readonly createRequestId: () => string;
}

type InspectState =
  | { readonly status: "no-scope" }
  | { readonly status: "empty-scope" }
  | { readonly status: "loading"; readonly requestId: string; readonly previousTargets: readonly InspectorTarget[] }
  | { readonly status: "ready"; readonly targets: readonly InspectorTarget[] }
  | { readonly status: "error"; readonly message: string; readonly previousTargets: readonly InspectorTarget[] };

const SOURCE_FILTERS: readonly ("all" | MotionSourceKind)[] = ["all", "manual", "style", "mixed", "none"];
const ANIMATION_STATE_FILTERS: readonly InspectorAnimationState[] = ["all", "animated", "no-motion"];
const CAPABILITY_FILTERS: readonly ("all" | CapabilityStatus)[] = [
  "all",
  "supported",
  "supported-with-warning",
  "read-only",
  "unsupported",
  "unknown"
];

const targetKey = (scope: ScopeScanResult | null): string =>
  scope === null ? "none" : scope.nodes.map((node) => node.id).join("|");

const targetsForState = (state: InspectState): readonly InspectorTarget[] =>
  state.status === "ready" ? state.targets : state.status === "loading" || state.status === "error" ? state.previousTargets : [];

const isDeveloperDebugEnabled = (): boolean => {
  let storedDeveloperMode = false;
  try {
    storedDeveloperMode = window.localStorage.getItem("motionops.developerMode") === "true";
  } catch {
    storedDeveloperMode = false;
  }

  return (
    storedDeveloperMode ||
    ((import.meta as unknown as { readonly env?: Record<string, string | undefined> }).env
      ?.VITE_MOTIONOPS_DEVELOPER_MODE === "true")
  );
};

const hasActiveFilters = (filters: InspectorFilters): boolean =>
  filters.search.trim().length > 0 ||
  filters.sourceKind !== "all" ||
  filters.property !== "" ||
  filters.animationState !== "all" ||
  filters.warningsOnly ||
  filters.capabilityStatus !== "all";

const selectPreferredTarget = (
  current: string | null,
  targets: readonly InspectorTarget[]
): string | null => {
  if (current !== null && targets.some((target) => target.nodeId === current)) {
    return current;
  }
  const animatedTarget = targets.find((target) => target.sourceKind !== "none");
  if (animatedTarget !== undefined) {
    return animatedTarget.nodeId;
  }
  return targets.length > 0 ? targets[0].nodeId : null;
};

const formatCount = (count: number, singular: string, plural = `${singular}s`): string =>
  `${String(count)} ${count === 1 ? singular : plural}`;

const longestTrackDurationMs = (groups: ReturnType<typeof groupInspectorTarget>): number | null => {
  const timings = groups.manualGroups.flatMap((group) => group.tracks.map(trackTiming));
  if (timings.length === 0) {
    return null;
  }
  return Math.max(...timings.map((timing) => timing.durationMs));
};

const totalKeyframes = (groups: ReturnType<typeof groupInspectorTarget>): number =>
  groups.manualGroups.reduce(
    (count, group) => count + group.tracks.reduce((trackCount, track) => trackCount + track.keyframes.length, 0),
    0
  );

const animatedPropertyCount = (groups: ReturnType<typeof groupInspectorTarget>): number =>
  new Set([
      ...groups.manualGroups.map((group) => group.property),
      ...groups.derivedAnimations.map((animation) => animation.property)
    ]).size;

const timelineDurationMs = (groups: ReturnType<typeof groupInspectorTarget>): number | null =>
  groups.timelines.length === 0 ? null : Math.max(...groups.timelines.map((timeline) => timeline.durationMs));

const hasUsefulDerivedDetails = (groups: ReturnType<typeof groupInspectorTarget>, mode: InspectorMode): boolean => {
  if (groups.derivedAnimations.length === 0) {
    return false;
  }
  if (mode === "debug") {
    return true;
  }
  const manualProperties = new Set(groups.manualGroups.map((group) => group.property));
  return groups.derivedAnimations.some((animation) => !manualProperties.has(animation.property));
};

const hasUsefulTimelineDetails = (groups: ReturnType<typeof groupInspectorTarget>, mode: InspectorMode): boolean =>
  mode === "debug" || groups.timelines.length > 1;

const capabilityStatusForTarget = (target: InspectorTarget): { readonly label: string; readonly tone: "warning" | "neutral" | "critical" | "success" } => {
  if (target.readError) {
    return { label: "Motion read failed", tone: "critical" };
  }
  if (target.warnings.length > 0) {
    return { label: `${String(target.warnings.length)} warning${target.warnings.length === 1 ? "" : "s"}`, tone: "warning" };
  }
  if (target.limitations.length > 0) {
    return { label: "Partially editable", tone: "warning" };
  }
  if (target.sourceKind === "none") {
    return { label: "No Motion", tone: "neutral" };
  }
  if (target.sourceKind === "style") {
    return { label: "Read-only Motion", tone: "neutral" };
  }
  return { label: "Fully editable", tone: "success" };
};

interface StatusIndicator {
  readonly key: string;
  readonly label: string;
  readonly tone: "warning" | "partial" | "critical" | "neutral";
  readonly icon: "warning" | "partial" | "read-issue" | "hidden" | "locked";
  readonly count?: number;
}

const targetStatusIndicators = (target: InspectorTarget): readonly StatusIndicator[] => [
  ...(target.readError ? [{ key: "read-error", label: "Motion read issue", tone: "critical" as const, icon: "read-issue" as const }] : []),
  ...(!target.visible ? [{ key: "hidden", label: "Hidden layer", tone: "warning" as const, icon: "hidden" as const }] : []),
  ...(target.locked ? [{ key: "locked", label: "Locked layer", tone: "warning" as const, icon: "locked" as const }] : []),
  ...(target.warnings.length > 0
    ? [{
        key: "warnings",
        label: `${String(target.warnings.length)} warning${target.warnings.length === 1 ? "" : "s"}`,
        tone: "warning" as const,
        icon: "warning" as const,
        count: target.warnings.length
      }]
    : []),
  ...(target.limitations.length > 0
    ? [{
        key: "limitations",
        label: "Partially editable",
        tone: "partial" as const,
        icon: "partial" as const
      }]
    : [])
];

const sourceExplanation = (sourceKind: MotionSourceKind): string =>
  sourceKind === "manual"
    ? "Manual Motion tracks are present on this layer."
    : sourceKind === "style"
      ? "This layer uses an animation style."
      : sourceKind === "mixed"
        ? "This layer combines manual Motion and style-derived Motion."
        : "No native Figma Motion was found on this layer.";

const selectedTargetSummary = (target: InspectorTarget, groups: ReturnType<typeof groupInspectorTarget> | null): string => {
  if (target.readError) {
    return "MotionOps could not read Motion data for this layer. Reveal it in Figma and try inspecting again.";
  }
  if (groups === null || target.sourceKind === "none") {
    return "No native Figma Motion was found on this layer.";
  }
  const propertyCount = animatedPropertyCount(groups);
  const tracks = groups.manualGroups.reduce((count, group) => count + group.tracks.length, 0);
  const keyframes = totalKeyframes(groups);
  const duration = longestTrackDurationMs(groups);
  if (target.sourceKind === "style") {
    return "This layer uses an animation style. MotionOps can inspect the style assignment, but editing support is limited.";
  }
  if (target.limitations.length > 0) {
    return `This layer has ${formatCount(tracks, "editable manual track")} and ${formatCount(target.limitations.length, "read-only detail")}. Derived Figma Motion details are available for inspection only.`;
  }
  return `This layer has ${formatCount(propertyCount, "animated property", "animated properties")} across ${formatCount(tracks, "manual track")} and ${formatCount(keyframes, "keyframe")}.${duration === null ? "" : ` The longest track is ${formatMilliseconds(duration)}.`}`;
};

const modeOptions = (debugEnabled: boolean): readonly SelectOption<InspectorMode>[] =>
  [
    { value: "overview", label: "Overview" },
    { value: "details", label: "Details" },
    debugEnabled ? { value: "debug", label: "Debug" } : null
  ].filter((option): option is SelectOption<InspectorMode> => option !== null);

const TruncatedText = ({
  children,
  className,
  tooltip
}: {
  readonly children: string;
  readonly className?: string;
  readonly tooltip?: string;
}) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const update = () => {
      setTruncated(element.scrollWidth > element.clientWidth + 1);
    };
    update();
    const frame = window.requestAnimationFrame(update);
    const timer = window.setTimeout(update, 0);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [children]);

  const text = (
    <span aria-label={children} className={className} ref={ref}>
      {children}
    </span>
  );
  return truncated || children.length > 48 ? <Tooltip content={tooltip ?? children}>{text}</Tooltip> : text;
};

export const InspectWorkspace = ({
  activeScope,
  lastMessage,
  sendToPlugin,
  createRequestId
}: InspectWorkspaceProps) => {
  const [state, setState] = useState<InspectState>({ status: "no-scope" });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<InspectorMode>("overview");
  const [filters, setFilters] = useState<InspectorFilters>(createDefaultInspectorFilters);
  const [revealMessage, setRevealMessage] = useState<string | null>(null);
  const debugEnabled = isDeveloperDebugEnabled();
  const activeRequestIdRef = useRef<string | null>(null);
  const lastScopeKeyRef = useRef<string>("none");

  useEffect(() => {
    const key = targetKey(activeScope);
    if (key === lastScopeKeyRef.current) {
      return;
    }
    lastScopeKeyRef.current = key;

    if (activeScope === null) {
      activeRequestIdRef.current = null;
      setState({ status: "no-scope" });
      setSelectedNodeId(null);
      return;
    }

    if (activeScope.nodes.length === 0) {
      activeRequestIdRef.current = null;
      setState({ status: "empty-scope" });
      setSelectedNodeId(null);
      return;
    }

    const requestId = createRequestId();
    activeRequestIdRef.current = requestId;
    setState((current) => ({ status: "loading", requestId, previousTargets: targetsForState(current) }));
    sendToPlugin({
      type: "MOTION_INSPECT_REQUEST",
      requestId,
      nodeIds: activeScope.nodes.map((node) => node.id)
    });
  }, [activeScope, createRequestId, sendToPlugin]);

  useEffect(() => {
    if (lastMessage === null) {
      return;
    }

    if (lastMessage.type === "MOTION_INSPECT_RESULT" && lastMessage.requestId === activeRequestIdRef.current) {
      activeRequestIdRef.current = null;
      const targets = buildInspectorTargets(
        activeScope === null ? [] : activeScope.nodes,
        lastMessage.result.snapshots,
        lastMessage.result.failures
      );
      setState({ status: "ready", targets });
      setSelectedNodeId((current) => selectPreferredTarget(current, targets));
    }

    if (
      lastMessage.type === "PLUGIN_ERROR" &&
      lastMessage.requestId !== undefined &&
      lastMessage.requestId === activeRequestIdRef.current
    ) {
      activeRequestIdRef.current = null;
      setState((current) => ({
        status: "error",
        message: lastMessage.message,
        previousTargets: targetsForState(current)
      }));
    }

    if (lastMessage.type === "SCOPE_REVEAL_NODE_RESULT") {
      setRevealMessage(lastMessage.result.message);
    }
  }, [activeScope, lastMessage]);

  const targets = targetsForState(state);
  const properties = useMemo(() => collectInspectorProperties(targets), [targets]);
  const filteredTargets = useMemo(() => filterInspectorTargets(targets, filters), [filters, targets]);
  const selectedTarget =
    filteredTargets.find((target) => target.nodeId === selectedNodeId) ??
    (filteredTargets.length > 0 ? filteredTargets[0] : null);
  const selectedTargetId = selectedTarget === null ? null : selectedTarget.nodeId;

  const updateFilters = (next: Partial<InspectorFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
  };

  useEffect(() => {
    if (!debugEnabled && mode === "debug") {
      setMode("details");
    }
  }, [debugEnabled, mode]);

  const revealNode = (target: InspectorTarget) => {
    const requestId = createRequestId();
    sendToPlugin({
      type: "SCOPE_REVEAL_NODE_REQUEST",
      requestId,
      nodeId: target.nodeId
    });
  };

  const renderTargetRow = (target: InspectorTarget) => {
    const priorityIndicators = targetStatusIndicators(target);
    const visibleIndicators = priorityIndicators.slice(0, target.sourceKind === "none" ? 2 : 1);
    const hiddenIndicatorCount = Math.max(0, priorityIndicators.length - visibleIndicators.length);

    return (
      <button
        aria-label={`${target.name}, ${nodeTypeLabel(target.nodeType)}, ${sourceKindLabel(target.sourceKind)}`}
        aria-pressed={selectedTargetId === target.nodeId}
        className="inspector-target-row"
        data-selected={selectedTargetId === target.nodeId}
        key={target.nodeId}
        onClick={() => {
          setSelectedNodeId(target.nodeId);
        }}
        style={{ "--scope-depth": target.depth } as CSSProperties}
        type="button"
      >
        <span className="inspector-target-main">
          <FigmaNodeIcon nodeType={target.nodeType} />
          <TruncatedText className="inspector-target-name">{target.name}</TruncatedText>
        </span>
        <span className="inspector-target-indicators">
          {visibleIndicators.map((indicator) => (
            <Tooltip content={indicator.label} key={indicator.key}>
              <span className="inspector-icon-token" data-tone={indicator.tone}>
                <Icon name={indicator.icon} size={13} />
                {indicator.count ? <span className="inspector-icon-count">{String(indicator.count)}</span> : null}
                <span className="visually-hidden">{indicator.label}</span>
              </span>
            </Tooltip>
          ))}
          {hiddenIndicatorCount > 0 ? (
            <Tooltip content={priorityIndicators.slice(visibleIndicators.length).map((indicator) => indicator.label).join(", ")}>
              <span className="inspector-icon-token" data-tone="neutral">
                +{String(hiddenIndicatorCount)}
              </span>
            </Tooltip>
          ) : null}
          {visibleIndicators.length + (hiddenIndicatorCount > 0 ? 1 : 0) < 2 ? <MotionSourceIcon sourceKind={target.sourceKind} /> : null}
        </span>
      </button>
    );
  };

  return (
    <section aria-label="Animation Inspector" className="inspect-workspace">
      <div className="inspect-header">
        <div>
          <h2>Inspect</h2>
          <p>
            {activeScope === null
              ? "No confirmed Scope is available."
              : `${String(activeScope.nodes.length)} scoped targets available for read-only inspection.`}
          </p>
        </div>
        <SegmentedControl label="Inspect mode" onChange={setMode} options={modeOptions(debugEnabled)} value={mode} />
      </div>

      {state.status === "no-scope" ? (
        <div className="scope-state" data-testid="inspect-no-scope">
          Define or confirm a Scope before opening Inspect.
        </div>
      ) : null}
      {state.status === "empty-scope" ? (
        <div className="scope-state" data-testid="inspect-empty-scope">
          The active Scope has no targets. This is different from a successful read with no Motion.
        </div>
      ) : null}
      {state.status === "loading" ? (
        <div className="scope-state" data-testid="inspect-loading">
          Reading normalized Motion data for scoped targets.
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="scope-state scope-state-error" role="alert">
          {state.message}
        </div>
      ) : null}
      {revealMessage === null ? null : <div className="scope-state">{revealMessage}</div>}

      {targets.length > 0 ? (
        <>
          <div className="inspect-filter-controls" role="toolbar" aria-label="Inspector filters">
            <label className="scope-field">
              <span>Search</span>
              <input
                onChange={(event) => {
                  updateFilters({ search: event.currentTarget.value });
                }}
                placeholder="Layer name"
                type="search"
                value={filters.search}
              />
            </label>
            <label className="scope-field">
              <span>Animation state</span>
              <Select
                label="Animation state"
                onChange={(animationState) => {
                  updateFilters({ animationState });
                }}
                options={ANIMATION_STATE_FILTERS.map((state) => ({
                  value: state,
                  label: state === "all" ? "All" : state === "animated" ? "Animated" : "No Motion"
                }))}
                value={filters.animationState}
              />
            </label>
            <label className="scope-field">
              <span>Source</span>
              <Select
                label="Source"
                onChange={(sourceKind) => {
                  updateFilters({ sourceKind });
                }}
                options={SOURCE_FILTERS.map((source) => ({
                  value: source,
                  label: source === "all" ? "All sources" : sourceKindLabel(source)
                }))}
                value={filters.sourceKind}
              />
            </label>
            <label className="scope-field">
              <span>Property</span>
              <Select
                label="Property"
                onChange={(property) => {
                  updateFilters({ property });
                }}
                options={[
                  { value: "", label: "All properties" },
                  ...properties.map((property) => ({ value: property, label: property }))
                ]}
                value={filters.property}
              />
            </label>
            {debugEnabled ? (
              <label className="scope-field">
                <span>Capability</span>
                <Select
                  label="Capability"
                  onChange={(capabilityStatus) => {
                    updateFilters({ capabilityStatus });
                  }}
                  options={CAPABILITY_FILTERS.map((status) => ({
                    value: status,
                    label: status === "all" ? "All capabilities" : capabilityLabel(status)
                  }))}
                  value={filters.capabilityStatus}
                />
              </label>
            ) : null}
            <label className="scope-check-option">
              <input
                checked={filters.warningsOnly}
                onChange={(event) => {
                  updateFilters({ warningsOnly: event.currentTarget.checked });
                }}
                type="checkbox"
              />
              <span>Warnings only</span>
            </label>
            <button
              className="secondary-action"
              disabled={!hasActiveFilters(filters)}
              onClick={() => {
                setFilters(createDefaultInspectorFilters());
              }}
              type="button"
            ><Icon name="filter" size={13} /><span>Clear</span></button>
            <span className="inspect-filter-count">
              {String(filteredTargets.length)} of {String(targets.length)} targets
            </span>
          </div>

          <div className="inspect-layout">
            <div aria-label="Inspector target list" className="inspector-target-list">
              <div className="inspect-count">Targets</div>
              {filteredTargets.length === 0 ? (
                <div className="scope-state">No inspected targets match the current filters.</div>
              ) : (
                filteredTargets.map(renderTargetRow)
              )}
            </div>
            <div className="inspector-detail" data-mode={mode}>
              {filteredTargets.length === 0 || selectedTarget === null ? (
                <div className="scope-state">Select a target to inspect details.</div>
              ) : (
                <InspectorDetail mode={mode} onReveal={revealNode} target={selectedTarget} />
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
};

const InspectorDetail = ({
  mode,
  onReveal,
  target
}: {
  readonly mode: InspectorMode;
  readonly onReveal: (target: InspectorTarget) => void;
  readonly target: InspectorTarget;
}) => {
  const groups = target.snapshot === null ? null : groupInspectorTarget(target.snapshot);
  const hasMotion =
    groups !== null &&
    (groups.manualGroups.length > 0 || groups.styleGroups.length > 0 || groups.derivedAnimations.length > 0);
  const capabilityStatus = capabilityStatusForTarget(target);
  return (
    <article className="inspector-detail-card" aria-label={`${target.name} Motion details`}>
      <header className="inspector-detail-header">
        <div className="inspector-detail-heading">
          <div className="inspector-detail-title-row">
            <FigmaNodeIcon nodeType={target.nodeType} size={15} />
            <h3><TruncatedText>{target.name}</TruncatedText></h3>
            <Badge tone={capabilityStatus.tone}>{capabilityStatus.label}</Badge>
          </div>
          <div className="inspector-detail-meta">
            <span>{nodeTypeLabel(target.nodeType)}</span>
            <MotionSourceIcon sourceKind={target.sourceKind} />
            <span>{sourceKindLabel(target.sourceKind)}</span>
            {target.visible ? null : (
              <Tooltip content="Hidden layer">
                <span className="inspector-icon-token" data-tone="warning"><Icon name="hidden" size={13} /></span>
              </Tooltip>
            )}
            {target.locked ? (
              <Tooltip content="Locked layer">
                <span className="inspector-icon-token" data-tone="warning"><Icon name="locked" size={13} /></span>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <button
          className="inspector-reveal-action"
          aria-label={`Reveal ${target.name} in Figma`}
          onClick={() => {
            onReveal(target);
          }}
          type="button"
        >
          <Tooltip content="Reveal in Figma"><Icon name="eye" size={13} /></Tooltip>
        </button>
      </header>

      <p className="inspector-plain-summary">{selectedTargetSummary(target, groups)}</p>

      {groups !== null ? <MetricStrip groups={groups} /> : null}

      {target.readError ? <div className="scope-state scope-state-error">{target.readError}</div> : null}
      <CapabilityOverview target={target} />
      {target.warnings.length > 0 ? (
        <section className="inspector-section">
          <h4>Warnings</h4>
          <ul>
            {target.warnings.map((warning) => (
              <li key={`${warning.code}:${warning.path ?? ""}:${warning.message}`}>
                {mode === "debug" ? <strong>{warning.code}: </strong> : null}
                <strong>{warning.title}</strong>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups === null || !hasMotion ? (
        <>
          <EmptyState title="No Motion animation found">
            No native Figma Motion was found on this layer.
          </EmptyState>
          {groups !== null && groups.timelines.length > 0 ? <TimelineSummary groups={groups} mode={mode} /> : null}
        </>
      ) : mode === "overview" ? (
        <OverviewDetail groups={groups} />
      ) : (
        <>
          <ManualDetail groups={groups} mode={mode} />
          <AnimationStyleDetail groups={groups} mode={mode} />
          {hasUsefulDerivedDetails(groups, mode) ? <DerivedAnimationDetail groups={groups} mode={mode} /> : null}
          {hasUsefulTimelineDetails(groups, mode) ? <TimelineSummary groups={groups} mode={mode} /> : null}
          {mode === "debug" ? (
            <>
              <CapabilitySummary groups={groups} />
              <DebugDetail target={target} />
            </>
          ) : null}
        </>
      )}
      {mode === "debug" && target.internalDiagnostics.length > 0 ? (
        <section className="inspector-section">
          <h4>Internal capability diagnostics</h4>
          <ul>
            {target.internalDiagnostics.map((diagnostic) => (
              <li key={`${diagnostic.code}:${diagnostic.path ?? ""}`}>
                <strong>{diagnostic.code}</strong>: {diagnostic.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
};

const MetricCard = ({
  icon,
  label,
  tone,
  tooltip,
  value,
  detail
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly tone: "purple" | "blue" | "green" | "yellow";
  readonly tooltip: string;
  readonly value: string;
  readonly detail?: string;
}) => (
  <div className="inspector-metric-card" data-tone={tone}>
    <Tooltip content={tooltip}>
      <Icon name={icon} size={14} />
    </Tooltip>
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail ? <span>{detail}</span> : null}
    </div>
  </div>
);

const MetricStrip = ({ groups }: { readonly groups: ReturnType<typeof groupInspectorTarget> }) => {
  const tracks = groups.manualGroups.reduce((count, group) => count + group.tracks.length, 0);
  const trackDuration = longestTrackDurationMs(groups);
  const timelineDuration = timelineDurationMs(groups);
  return (
    <dl className="inspector-summary-grid">
      <MetricCard
        icon="sparkles"
        label="Animated properties"
        tone="purple"
        tooltip="Properties with exposed manual tracks or derived Figma Motion details."
        value={String(animatedPropertyCount(groups))}
      />
      <MetricCard
        icon="manual-motion"
        label="Tracks"
        tone="blue"
        tooltip="Manual Motion tracks that MotionOps can inspect on this layer."
        value={String(tracks)}
      />
      <MetricCard
        icon="layers"
        label="Keyframes"
        tone="green"
        tooltip="Exposed manual keyframes across the selected layer."
        value={String(totalKeyframes(groups))}
      />
      <MetricCard
        icon="timing"
        label="Timing"
        tone="yellow"
        tooltip="Track duration is the longest exposed Motion track. Timeline duration is the containing Figma Motion timeline."
        value={trackDuration === null ? "Not exposed" : formatMilliseconds(trackDuration)}
        detail={timelineDuration === null ? undefined : `Timeline: ${formatMilliseconds(timelineDuration)}`}
      />
    </dl>
  );
};

const CapabilityOverview = ({ target }: { readonly target: InspectorTarget }) => {
  const [expanded, setExpanded] = useState(false);
  if (target.readError) {
    return (
      <section className="inspector-capability-summary" data-tone="critical">
        <Icon name="read-issue" size={14} />
        <p>Motion read failed. Reveal the layer in Figma, confirm it still exists, and inspect again.</p>
      </section>
    );
  }
  if (target.limitations.length === 0) {
    return (
      <section className="inspector-capability-summary" data-tone={target.sourceKind === "none" ? "neutral" : "success"}>
        <Icon name={target.sourceKind === "none" ? "motion-off" : "check"} size={14} />
        <p>{sourceExplanation(target.sourceKind)}</p>
      </section>
    );
  }

  const uniqueProperties = [
    ...new Set(target.limitations.map((limitation) => limitation.path ?? limitation.title))
  ];
  const visibleProperties = uniqueProperties.slice(0, expanded ? uniqueProperties.length : 4);
  const moreCount = uniqueProperties.length - visibleProperties.length;
  const hasManualTracks = (target.snapshot?.manualTracks.length ?? 0) > 0;

  return (
    <section className="inspector-capability-summary" data-tone="warning" aria-labelledby="inspector-capability-title">
      <Icon name="partial" size={14} />
      <div>
        <h4 id="inspector-capability-title">{hasManualTracks ? "Manual tracks are editable. Derived details are read-only." : "This Motion can be inspected but not edited by MotionOps."}</h4>
        <p>
          {hasManualTracks
            ? `${formatCount(target.limitations.length, "derived Figma Motion detail")} can be inspected but cannot be changed safely.`
            : `${formatCount(target.limitations.length, "Figma Motion detail")} can be inspected but cannot be changed safely.`}
        </p>
        <button
          className="inspector-inline-action"
          onClick={() => {
            setExpanded((current) => !current);
          }}
          type="button"
        >
          {expanded ? "Hide read-only details" : `View ${String(target.limitations.length)} read-only details`}
        </button>
        {expanded ? (
          <>
            <ul className="inspector-limitation-list">
              {visibleProperties.map((property) => (
                <li key={property}>{humanizePropertyName(property)} - derived details are read-only</li>
              ))}
              {moreCount > 0 ? <li>+{String(moreCount)} more</li> : null}
            </ul>
            <p className="inspector-shared-explanation">
              These values come from derived Figma Motion data. MotionOps can inspect them, but Edit and Sequence will not modify them.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
};

const OverviewDetail = ({ groups }: { readonly groups: ReturnType<typeof groupInspectorTarget> }) => (
  <section className="inspector-section">
    <h4>Editability summary</h4>
    <p>
      {formatCount(groups.manualGroups.length, "manual property group")},{" "}
      {formatCount(groups.styleGroups.length, "animation style")},{" "}
      {formatCount(groups.derivedAnimations.length, "derived animation")}.
    </p>
  </section>
);

const ManualDetail = ({
  groups,
  mode
}: {
  readonly groups: ReturnType<typeof groupInspectorTarget>;
  readonly mode: InspectorMode;
}) => (
  <section className="inspector-section">
    <h4>Animation tracks ({String(groups.manualGroups.reduce((count, group) => count + group.tracks.length, 0))})</h4>
    {groups.manualGroups.length > 0 ? (
      groups.manualGroups.map((group) => (
        <div className="inspector-subsection" key={group.property}>
          <h5>{humanizePropertyName(group.property)}</h5>
          {group.tracks.map((track, index) => (
            <table className="keyframe-table" key={`${group.property}:${track.trackId ?? String(index)}`}>
              <caption>
                {mode === "debug" ? (
                  <>
                {track.propertyClassification} · {capabilityLabel(track.write.status)}
                {mode === "debug" && track.trackId ? ` · ${track.trackId}` : ""}
                  </>
                ) : (
                  <>
                    <span className="manual-track-caption">
                      <strong>{humanizePropertyName(track.property)}</strong>
                      <span>Manual · {formatMilliseconds(trackTiming(track).durationMs)}</span>
                    </span>
                  </>
                )}
              </caption>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Value</th>
                  <th>Easing</th>
                  {mode === "debug" ? <th>ID</th> : null}
                </tr>
              </thead>
              <tbody>
                {track.keyframes.map((keyframe) => (
                  <tr key={`${keyframe.keyframeId ?? "ordinal"}:${String(keyframe.ordinal)}:${String(keyframe.timeMs)}`}>
                    <td>{formatMilliseconds(keyframe.timeMs)}</td>
                    <td>{mode === "debug" ? formatValue(keyframe.value) : formatMotionValue(track.property, keyframe.value)}</td>
                    <td><EasingValue easing={formatEasing(keyframe.easing)} /></td>
                    {mode === "debug" ? <td>{keyframe.keyframeId ?? "Not exposed"}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      ))
    ) : null}
  </section>
);

const EasingValue = ({ easing }: { readonly easing: string }) => {
  const compact =
    easing.startsWith("Cubic bezier")
      ? "Custom"
      : easing === "EASE_IN"
        ? "Ease in"
        : easing === "EASE_OUT"
          ? "Ease out"
          : easing === "EASE_IN_AND_OUT" || easing === "EASE_IN_OUT"
            ? "Ease in/out"
            : easing;
  return compact === easing ? <span>{compact}</span> : <Tooltip content={easing}><span className="inspector-easing-chip">{compact}</span></Tooltip>;
};

const AnimationStyleDetail = ({
  groups,
  mode
}: {
  readonly groups: ReturnType<typeof groupInspectorTarget>;
  readonly mode: InspectorMode;
}) => groups.styleGroups.length === 0 ? null : (
  <section className="inspector-section">
    <h4>Animation styles</h4>
    {groups.styleGroups.length === 0 ? (
      <p>No animation styles.</p>
    ) : (
      groups.styleGroups.map((group, index) => (
        <div className="inspector-subsection" key={group.instance.appliedStyleInstanceId ?? String(index)}>
          <h5>{group.instance.name ?? "Unnamed style instance"}</h5>
          {mode === "debug" ? (
            <p>
              Instance {group.instance.appliedStyleInstanceId ?? "Not exposed"} · Style{" "}
              {group.instance.availableAnimationStyleId ?? "Not exposed"}
            </p>
          ) : null}
        </div>
      ))
    )}
  </section>
);

const DerivedAnimationDetail = ({
  groups,
  mode
}: {
  readonly groups: ReturnType<typeof groupInspectorTarget>;
  readonly mode: InspectorMode;
}) => groups.derivedAnimations.length === 0 ? null : (
  <section className="inspector-section">
    <h4>Derived animation</h4>
    <ul>
      {groups.derivedAnimations.map((animation) => (
        <li key={animation.property}>
          {humanizePropertyName(animation.property)}
          {mode === "debug" && animation.timelineDurationMs !== undefined
            ? ` - raw derived timeline duration ${formatMilliseconds(animation.timelineDurationMs)}`
            : " derived Motion data"}
        </li>
      ))}
    </ul>
  </section>
);

export const TimelineDetail = ({
  groups,
  mode
}: {
  readonly groups: ReturnType<typeof groupInspectorTarget>;
  readonly mode: InspectorMode;
}) => (
  <section className="inspector-section" data-mode={mode}>
    <h4>Timeline</h4>
    {groups.timelines.length === 0 ? (
      <p>No timeline membership exposed.</p>
    ) : (
      <ul>
        {groups.timelines.map((timeline) => (
          <li key={timeline.timelineId}>
            {timeline.timelineId}: {formatMilliseconds(timeline.durationMs)} · {timeline.tracks.join(", ") || "No track IDs exposed"}
          </li>
        ))}
      </ul>
    )}
  </section>
);

const TimelineSummary = ({
  groups,
  mode
}: {
  readonly groups: ReturnType<typeof groupInspectorTarget>;
  readonly mode: InspectorMode;
}) => (
  <section className="inspector-section">
    <h4>Timeline</h4>
    {groups.timelines.length === 0 ? (
      <p>No timeline membership exposed.</p>
    ) : (
      <ul>
        {groups.timelines.map((timeline) => (
          <li key={timeline.timelineId}>
            Timeline duration: {formatMilliseconds(timeline.durationMs)}
            {mode === "debug" ? ` - ${timeline.timelineId} - ${timeline.tracks.join(", ") || "No track IDs exposed"}` : ""}
          </li>
        ))}
      </ul>
    )}
  </section>
);

export const CapabilityDetail = ({ groups }: { readonly groups: ReturnType<typeof groupInspectorTarget> }) => (
  <section className="inspector-section">
    <h4>Capabilities</h4>
    <ul>
      {groups.capabilities.map(([name, capability]) => (
        <li key={name}>
          <strong>{name}</strong>: {capabilityLabel(capability.status)} · {capability.reason}
        </li>
      ))}
    </ul>
  </section>
);

const CapabilitySummary = ({ groups }: { readonly groups: ReturnType<typeof groupInspectorTarget> }) => (
  <section className="inspector-section">
    <h4>Capabilities</h4>
    <ul>
      {groups.capabilities.map(([name, capability]) => (
        <li key={name}>
          <strong>{humanizeCapabilityName(name)}</strong>: {capabilityLabel(capability.status)} - {capability.reason}
        </li>
      ))}
    </ul>
  </section>
);

const DebugDetail = ({ target }: { readonly target: InspectorTarget }) => (
  <section className="inspector-section">
    <h4>Debug</h4>
    <dl className="debug-list">
      <dt>Node ID</dt>
      <dd>{target.nodeId}</dd>
      <dt>Normalized source</dt>
      <dd>{target.sourceKind}</dd>
      <dt>Serialized normalized data</dt>
      <dd>
        <pre>{JSON.stringify(target.snapshot, null, 2)}</pre>
      </dd>
    </dl>
  </section>
);
