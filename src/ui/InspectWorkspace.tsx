import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  buildInspectorTargets,
  capabilityLabel,
  collectInspectorProperties,
  createDefaultInspectorFilters,
  filterInspectorTargets,
  formatEasing,
  formatMilliseconds,
  formatValue,
  groupInspectorTarget,
  sourceKindLabel,
  type InspectorFilters,
  type InspectorMode,
  type InspectorTarget
} from "../domain/inspector";
import type { ScopeScanResult } from "../domain/scopeScan";
import type { CapabilityStatus, MotionSourceKind } from "../domain/motion";
import type { PluginToUiMessage, UiToPluginMessage } from "../shared/messages";

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
      setSelectedNodeId((current) => current ?? (targets.length > 0 ? targets[0].nodeId : null));
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

  const revealNode = (target: InspectorTarget) => {
    const requestId = createRequestId();
    sendToPlugin({
      type: "SCOPE_REVEAL_NODE_REQUEST",
      requestId,
      nodeId: target.nodeId
    });
  };

  const renderTargetRow = (target: InspectorTarget) => (
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
      <span className="inspector-target-name">{target.name}</span>
      <span className="inspector-target-meta">{target.nodeType.toLowerCase().replaceAll("_", " ")}</span>
      <span>{sourceKindLabel(target.sourceKind)}</span>
      <span>{target.visible ? "Visible" : "Hidden"}</span>
      <span>{target.locked ? "Locked" : "Unlocked"}</span>
      <span>{target.warnings.length === 0 ? "No warnings" : `${String(target.warnings.length)} warnings`}</span>
    </button>
  );

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
        <fieldset className="inspect-mode-control">
          <legend>Mode</legend>
          {(["compact", "detailed", "debug"] as const).map((option) => (
            <label key={option}>
              <input
                checked={mode === option}
                name="inspect-mode"
                onChange={() => {
                  setMode(option);
                }}
                type="radio"
                value={option}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
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
          <fieldset className="inspect-filter-controls">
            <legend>Inspector filters</legend>
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
              <span>Source</span>
              <select
                onChange={(event) => {
                  updateFilters({ sourceKind: event.currentTarget.value as "all" | MotionSourceKind });
                }}
                value={filters.sourceKind}
              >
                {SOURCE_FILTERS.map((source) => (
                  <option key={source} value={source}>
                    {source === "all" ? "All sources" : sourceKindLabel(source)}
                  </option>
                ))}
              </select>
            </label>
            <label className="scope-field">
              <span>Property</span>
              <select
                onChange={(event) => {
                  updateFilters({ property: event.currentTarget.value });
                }}
                value={filters.property}
              >
                <option value="">All properties</option>
                {properties.map((property) => (
                  <option key={property} value={property}>
                    {property}
                  </option>
                ))}
              </select>
            </label>
            <label className="scope-field">
              <span>Capability</span>
              <select
                onChange={(event) => {
                  updateFilters({ capabilityStatus: event.currentTarget.value as "all" | CapabilityStatus });
                }}
                value={filters.capabilityStatus}
              >
                {CAPABILITY_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {status === "all" ? "All capabilities" : capabilityLabel(status)}
                  </option>
                ))}
              </select>
            </label>
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
              onClick={() => {
                setFilters(createDefaultInspectorFilters());
              }}
              type="button"
            >
              Clear
            </button>
          </fieldset>

          <div className="inspect-layout">
            <div aria-label="Inspector target list" className="inspector-target-list">
              <div className="inspect-count">
                {String(filteredTargets.length)} of {String(targets.length)} targets
              </div>
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
  return (
    <article className="inspector-detail-card" aria-label={`${target.name} Motion details`}>
      <header className="inspector-detail-header">
        <div>
          <h3>{target.name}</h3>
          <p>
            {target.nodeType} · {sourceKindLabel(target.sourceKind)}
          </p>
        </div>
        <button
          aria-label={`Reveal ${target.name} in Figma`}
          onClick={() => {
            onReveal(target);
          }}
          type="button"
        >
          Reveal
        </button>
      </header>

      {target.readError ? <div className="scope-state scope-state-error">{target.readError}</div> : null}
      {target.warnings.length > 0 ? (
        <section className="inspector-section">
          <h4>Warnings</h4>
          <ul>
            {target.warnings.map((warning) => (
              <li key={`${warning.code}:${warning.path ?? ""}:${warning.message}`}>
                <strong>{warning.code}</strong>: {warning.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups === null ? (
        <div className="scope-state">No Motion data was exposed for this target.</div>
      ) : mode === "compact" ? (
        <CompactDetail groups={groups} />
      ) : (
        <>
          <ManualDetail groups={groups} mode={mode} />
          <StyleDetail groups={groups} mode={mode} />
          <TimelineDetail groups={groups} />
          <CapabilityDetail groups={groups} />
          {mode === "debug" ? <DebugDetail target={target} /> : null}
        </>
      )}
    </article>
  );
};

const CompactDetail = ({ groups }: { readonly groups: ReturnType<typeof groupInspectorTarget> }) => (
  <section className="inspector-section">
    <h4>Summary</h4>
    <p>
      {String(groups.manualGroups.length)} manual property groups, {String(groups.styleGroups.length)} style
      instances, {String(groups.derivedAnimations.length)} derived animations, {String(groups.timelines.length)}
      timelines.
    </p>
    <p>
      Main timing:{" "}
      {groups.timelines.length === 0
        ? "No timeline duration exposed"
        : groups.timelines.map((timeline) => formatMilliseconds(timeline.durationMs)).join(", ")}
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
    <h4>Manual Tracks</h4>
    {groups.manualGroups.length === 0 ? (
      <p>No manual tracks exposed.</p>
    ) : (
      groups.manualGroups.map((group) => (
        <div className="inspector-subsection" key={group.property}>
          <h5>{group.property}</h5>
          {group.tracks.map((track, index) => (
            <table className="keyframe-table" key={`${group.property}:${track.trackId ?? String(index)}`}>
              <caption>
                {track.propertyClassification} · {capabilityLabel(track.write.status)}
                {mode === "debug" && track.trackId ? ` · ${track.trackId}` : ""}
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
                    <td>{formatValue(keyframe.value)}</td>
                    <td>{formatEasing(keyframe.easing)}</td>
                    {mode === "debug" ? <td>{keyframe.keyframeId ?? "Not exposed"}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      ))
    )}
  </section>
);

const StyleDetail = ({
  groups,
  mode
}: {
  readonly groups: ReturnType<typeof groupInspectorTarget>;
  readonly mode: InspectorMode;
}) => (
  <section className="inspector-section">
    <h4>Style And Derived Data</h4>
    {groups.styleGroups.length === 0 ? (
      <p>No style instances exposed.</p>
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
          <ul>
            {group.derivedAnimations.map((animation) => (
              <li key={animation.property}>
                {animation.property}: {animation.timelineDurationMs === undefined ? "duration not exposed" : formatMilliseconds(animation.timelineDurationMs)}
              </li>
            ))}
          </ul>
        </div>
      ))
    )}
    {groups.styleGroups.length === 0 && groups.derivedAnimations.length > 0 ? (
      <ul>
        {groups.derivedAnimations.map((animation) => (
          <li key={animation.property}>
            {animation.property}: {animation.timelineDurationMs === undefined ? "duration not exposed" : formatMilliseconds(animation.timelineDurationMs)}
          </li>
        ))}
      </ul>
    ) : null}
  </section>
);

const TimelineDetail = ({ groups }: { readonly groups: ReturnType<typeof groupInspectorTarget> }) => (
  <section className="inspector-section">
    <h4>Timelines</h4>
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

const CapabilityDetail = ({ groups }: { readonly groups: ReturnType<typeof groupInspectorTarget> }) => (
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
