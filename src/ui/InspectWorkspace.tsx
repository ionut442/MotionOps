/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { Badge, EmptyState, SegmentedControl, Select, type SelectOption } from "./components/ui";
import { Icon } from "./components/Icon";

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

const targetMetadataLabel = (target: Pick<InspectorTarget, "nodeType" | "sourceKind">): string =>
  `${nodeTypeLabel(target.nodeType)} · ${sourceKindLabel(target.sourceKind)}`;

const firstTrackDuration = (groups: ReturnType<typeof groupInspectorTarget>): string | null => {
  const timings = groups.manualGroups.flatMap((group) => group.tracks.map(trackTiming));
  if (timings.length === 0) {
    return null;
  }
  const maxDuration = Math.max(...timings.map((timing) => timing.durationMs));
  return formatMilliseconds(maxDuration);
};

const targetSummary = (target: InspectorTarget, groups: ReturnType<typeof groupInspectorTarget> | null) => {
  if (groups === null) {
    return [
      ["Source", sourceKindLabel(target.sourceKind)]
    ] satisfies readonly (readonly [string, string])[];
  }

  const keyframes = groups.manualGroups.reduce(
    (count, group) => count + group.tracks.reduce((trackCount, track) => trackCount + track.keyframes.length, 0),
    0
  );
  const trackDuration = firstTrackDuration(groups);
  const items: (readonly [string, string])[] = [
    ["Source", sourceKindLabel(target.sourceKind)],
    ["Animated properties", String(new Set([
      ...groups.manualGroups.map((group) => group.property),
      ...groups.derivedAnimations.map((animation) => animation.property)
    ]).size)],
    ["Keyframes", String(keyframes)]
  ];
  if (trackDuration !== null) {
    items.push(["Track duration", trackDuration]);
  }
  if (groups.timelines.length > 0) {
    const timelineDuration = formatMilliseconds(groups.timelines[0].durationMs);
    items.push(["Timeline duration", timelineDuration]);
  }
  return items;
};

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

const primaryBadgeForTarget = (target: InspectorTarget): { readonly label: string; readonly tone: "warning" | "neutral" } | null => {
  if (target.warnings.length > 0) {
    return { label: `${String(target.warnings.length)} warning${target.warnings.length === 1 ? "" : "s"}`, tone: "warning" };
  }
  if (target.limitations.length > 0) {
    return { label: target.limitations.length === 1 ? "Partially editable" : `${String(target.limitations.length)} limitations`, tone: "neutral" };
  }
  return null;
};

const modeOptions = (debugEnabled: boolean): readonly SelectOption<InspectorMode>[] =>
  [
    { value: "compact", label: "Compact" },
    { value: "detailed", label: "Detailed" },
    debugEnabled ? { value: "debug", label: "Debug" } : null
  ].filter((option): option is SelectOption<InspectorMode> => option !== null);

export const InspectWorkspace = ({
  activeScope,
  lastMessage,
  sendToPlugin,
  createRequestId
}: InspectWorkspaceProps) => {
  const [state, setState] = useState<InspectState>({ status: "no-scope" });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<InspectorMode>("detailed");
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
      setMode("detailed");
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
    const primaryBadge = primaryBadgeForTarget(target);
    return (
      <button
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
        <span className="inspector-target-primary">
          <span className="inspector-target-name" title={target.name}>{target.name}</span>
          {primaryBadge ? <Badge tone={primaryBadge.tone}>{primaryBadge.label}</Badge> : null}
        </span>
        <span className="inspector-target-meta">
          <span>{targetMetadataLabel(target)}</span>
          {target.visible ? null : <Badge tone="warning">Hidden</Badge>}
          {target.locked ? <Badge tone="warning">Locked</Badge> : null}
          {target.readError ? <Badge tone="critical">Read issue</Badge> : null}
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
  const summary = targetSummary(target, groups);
  const primaryBadge = primaryBadgeForTarget(target);
  return (
    <article className="inspector-detail-card" aria-label={`${target.name} Motion details`}>
      <header className="inspector-detail-header">
        <div className="inspector-detail-heading">
          <h3>{target.name}</h3>
          {primaryBadge ? <Badge tone={primaryBadge.tone}>{primaryBadge.label}</Badge> : null}
          <p>
            {targetMetadataLabel(target)}
          </p>
        </div>
        <button
          className="secondary-action"
          aria-label={`Reveal ${target.name} in Figma`}
          onClick={() => {
            onReveal(target);
          }}
          type="button"
        ><Icon name="eye" size={13} /><span>Reveal</span></button>
      </header>

      <dl className="inspector-summary-grid">
        {summary.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {target.readError ? <div className="scope-state scope-state-error">{target.readError}</div> : null}
      {target.limitations.length > 0 ? (
        <section className="inspector-limitation-banner" aria-labelledby="inspector-limitation-title">
          {target.limitations.map((limitation, index) => (
            <div className="inspector-limitation-item" key={`${limitation.code}:${limitation.path ?? ""}:${limitation.message}`}>
              <h4 id={index === 0 ? "inspector-limitation-title" : undefined}>{limitation.title}</h4>
              <p>{limitation.message}</p>
              {limitation.impact ? <p>{limitation.impact}</p> : null}
            </div>
          ))}
        </section>
      ) : null}
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
            This layer does not expose manual animation tracks or animation style instances.
          </EmptyState>
          {groups !== null && groups.timelines.length > 0 ? <TimelineSummary groups={groups} mode={mode} /> : null}
        </>
      ) : mode === "compact" ? (
        <CompactDetail groups={groups} />
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

const CompactDetail = ({ groups }: { readonly groups: ReturnType<typeof groupInspectorTarget> }) => (
  <section className="inspector-section">
    <h4>Summary</h4>
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
    <h4>Manual tracks</h4>
    {groups.manualGroups.length > 0 ? (
      groups.manualGroups.map((group) => (
        <div className="inspector-subsection" key={group.property}>
          <h5>{humanizePropertyName(group.property)} track</h5>
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
                      <strong>{humanizePropertyName(track.property)} track</strong>
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
                    <td>{formatEasing(keyframe.easing)}</td>
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
