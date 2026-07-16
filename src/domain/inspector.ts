import type {
  CapabilityStatus,
  MotionAdapterWarning,
  MotionCapability,
  MotionSnapshot,
  MotionSourceKind,
  NormalizedDerivedAnimation,
  NormalizedEasing,
  NormalizedManualTrack,
  NormalizedStyleInstance,
  NormalizedTimeline
} from "./motion";

export type InspectorMode = "compact" | "detailed" | "debug";
export type InspectorWarningLevel = "info" | "warning";

export interface InspectorTarget {
  readonly nodeId: string;
  readonly name: string;
  readonly nodeType: string;
  readonly depth: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly sourceKind: MotionSourceKind;
  readonly snapshot: MotionSnapshot | null;
  readonly readError?: string;
  readonly warnings: readonly InspectorWarning[];
}

export interface InspectorWarning {
  readonly code: string;
  readonly level: InspectorWarningLevel;
  readonly message: string;
  readonly path?: string;
}

export interface InspectorManualTrackGroup {
  readonly property: string;
  readonly tracks: readonly NormalizedManualTrack[];
  readonly timelines: readonly NormalizedTimeline[];
  readonly warnings: readonly InspectorWarning[];
}

export interface InspectorStyleGroup {
  readonly instance: NormalizedStyleInstance;
  readonly derivedAnimations: readonly NormalizedDerivedAnimation[];
  readonly timelines: readonly NormalizedTimeline[];
  readonly warnings: readonly InspectorWarning[];
}

export interface InspectorTargetGroups {
  readonly sourceKind: MotionSourceKind;
  readonly manualGroups: readonly InspectorManualTrackGroup[];
  readonly styleGroups: readonly InspectorStyleGroup[];
  readonly derivedAnimations: readonly NormalizedDerivedAnimation[];
  readonly timelines: readonly NormalizedTimeline[];
  readonly capabilities: readonly [string, MotionCapability][];
}

export interface InspectorFilters {
  readonly search: string;
  readonly sourceKind: "all" | MotionSourceKind;
  readonly property: string;
  readonly warningsOnly: boolean;
  readonly capabilityStatus: "all" | CapabilityStatus;
}

export const createDefaultInspectorFilters = (): InspectorFilters => ({
  search: "",
  sourceKind: "all",
  property: "",
  warningsOnly: false,
  capabilityStatus: "all"
});

export const formatMilliseconds = (value: number | undefined): string => {
  if (value === undefined) {
    return "Not exposed";
  }
  if (!Number.isFinite(value)) {
    return `${String(value)} ms`;
  }
  return `${String(Math.round(value))} ms`;
};

export const formatEasing = (easing: NormalizedEasing | undefined): string => {
  if (!easing) {
    return "Not exposed";
  }
  switch (easing.kind) {
    case "linear":
      return "Linear";
    case "preset":
      return easing.name;
    case "cubic-bezier":
      return `Cubic bezier (${formatNumber(easing.x1)}, ${formatNumber(easing.y1)}, ${formatNumber(easing.x2)}, ${formatNumber(easing.y2)})`;
    case "spring":
      return `Spring${[
        easing.mass === undefined ? null : `mass ${formatNumber(easing.mass)}`,
        easing.stiffness === undefined ? null : `stiffness ${formatNumber(easing.stiffness)}`,
        easing.damping === undefined ? null : `damping ${formatNumber(easing.damping)}`
      ].filter(Boolean).join(", ").replace(/^(.+)$/, " ($1)")}`;
    case "unknown":
      return "Unknown easing shape";
    default:
      return assertNever(easing);
  }
};

export const formatValue = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "Not exposed";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const preview = value.slice(0, 4).map(formatValue).join(", ");
    return `[${preview}${value.length > 4 ? ", ..." : ""}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record)
      .slice(0, 5)
      .map(([key, entryValue]) => `${key}: ${formatValue(entryValue)}`);
    return `{ ${entries.join(", ")}${Object.keys(record).length > 5 ? ", ..." : ""} }`;
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return typeof value;
};

export const sourceKindLabel = (source: MotionSourceKind): string => {
  switch (source) {
    case "none":
      return "No Motion";
    case "manual":
      return "Manual";
    case "style":
      return "Style";
    case "mixed":
      return "Mixed";
    default:
      return assertNever(source);
  }
};

export const capabilityLabel = (status: CapabilityStatus): string => {
  switch (status) {
    case "supported":
      return "Supported";
    case "supported-with-warning":
      return "Supported with warning";
    case "read-only":
      return "Read-only";
    case "unsupported":
      return "Unsupported";
    case "unknown":
      return "Unknown";
    default:
      return assertNever(status);
  }
};

export const groupInspectorTarget = (snapshot: MotionSnapshot): InspectorTargetGroups => {
  const timelines = [...snapshot.timelines].sort((left, right) => left.timelineId.localeCompare(right.timelineId));
  const derivedAnimations = [...snapshot.derivedAnimations].sort((left, right) =>
    left.property.localeCompare(right.property)
  );
  const manualByProperty = new Map<string, NormalizedManualTrack[]>();
  for (const track of snapshot.manualTracks) {
    const tracks = manualByProperty.get(track.property) ?? [];
    tracks.push(track);
    manualByProperty.set(track.property, tracks);
  }

  const manualGroups = [...manualByProperty.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([property, tracks]) => ({
      property,
      tracks: tracks.map((track) => ({
        ...track,
        keyframes: [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.ordinal - right.ordinal)
      })),
      timelines: timelines.filter((timeline) =>
        tracks.some((track) => timeline.tracks.includes(track.trackId ?? track.property))
      ),
      warnings: tracks.flatMap((track) => normalizeAdapterWarnings(track.warnings))
    }));

  const styleGroups = [...snapshot.styleInstances]
    .sort((left, right) =>
      `${left.name ?? ""}:${left.appliedStyleInstanceId ?? ""}`.localeCompare(
        `${right.name ?? ""}:${right.appliedStyleInstanceId ?? ""}`
      )
    )
    .map((instance) => ({
      instance,
      derivedAnimations,
      timelines,
      warnings: normalizeAdapterWarnings(instance.warnings)
    }));

  return {
    sourceKind: snapshot.sources.kind,
    manualGroups,
    styleGroups,
    derivedAnimations,
    timelines,
    capabilities: Object.entries(snapshot.capabilities).sort(([left], [right]) => left.localeCompare(right))
  };
};

export const detectInspectorWarnings = (snapshot: MotionSnapshot): readonly InspectorWarning[] => {
  const warnings: InspectorWarning[] = [...normalizeAdapterWarnings(snapshot.warnings)];

  for (const track of snapshot.manualTracks) {
    if (track.keyframes.length === 0) {
      warnings.push({
        code: "EMPTY_MANUAL_TRACK",
        level: "warning",
        message: `Manual track ${track.property} has no exposed keyframes.`,
        path: track.property
      });
    }
    const seenTimes = new Map<number, number>();
    for (const keyframe of track.keyframes) {
      if (!Number.isFinite(keyframe.timeMs)) {
        warnings.push({
          code: "INVALID_TIME",
          level: "warning",
          message: `Manual track ${track.property} has a non-finite keyframe time.`,
          path: track.property
        });
      }
      if (keyframe.timeMs < 0) {
        warnings.push({
          code: "NEGATIVE_TIME",
          level: "warning",
          message: `Manual track ${track.property} has a negative keyframe time.`,
          path: track.property
        });
      }
      seenTimes.set(keyframe.timeMs, (seenTimes.get(keyframe.timeMs) ?? 0) + 1);
      if (keyframe.easing.kind === "unknown") {
        warnings.push({
          code: "UNKNOWN_EASING_SHAPE",
          level: "warning",
          message: `Manual track ${track.property} has an unknown easing shape.`,
          path: track.property
        });
      }
      if (keyframe.valueClassification === "object" || keyframe.valueClassification === "undefined") {
        warnings.push({
          code: "UNKNOWN_VALUE_SHAPE",
          level: "info",
          message: `Manual track ${track.property} has a value shape that needs read-only inspection.`,
          path: track.property
        });
      }
    }
    for (const [timeMs, count] of seenTimes) {
      if (count > 1) {
        warnings.push({
          code: "DUPLICATE_KEYFRAME_TIME",
          level: "warning",
          message: `Manual track ${track.property} has ${String(count)} keyframes at ${formatMilliseconds(timeMs)}.`,
          path: track.property
        });
      }
    }
  }

  for (const timeline of snapshot.timelines) {
    const latestKeyframe = Math.max(
      ...snapshot.manualTracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.timeMs)),
      0
    );
    if (timeline.durationMs < latestKeyframe) {
      warnings.push({
        code: "TIMELINE_SHORTER_THAN_KEYFRAME",
        level: "warning",
        message: `Timeline ${timeline.timelineId} is shorter than the latest displayed keyframe.`,
        path: timeline.timelineId
      });
    }
  }

  const manualProperties = new Set(snapshot.manualTracks.map((track) => track.property));
  for (const derived of snapshot.derivedAnimations) {
    if (manualProperties.has(derived.property) && snapshot.styleInstances.length > 0) {
      warnings.push({
        code: "MIXED_SOURCE_PROPERTY",
        level: "info",
        message: `Property ${derived.property} appears in manual and style-derived Motion data.`,
        path: derived.property
      });
    }
    if (derived.valueClassification === "object" || derived.valueClassification === "undefined") {
      warnings.push({
        code: "UNKNOWN_DERIVED_SHAPE",
        level: "info",
        message: `Derived animation ${derived.property} contains a non-scalar read-only shape.`,
        path: derived.property
      });
    }
  }

  const capabilities = Object.entries(snapshot.capabilities) as [string, MotionCapability][];
  for (const [capabilityName, capability] of capabilities) {
    if (capability.status === "unknown") {
      warnings.push({
        code: "UNKNOWN_CAPABILITY",
        level: "info",
        message: `${capabilityName} remains unknown.`,
        path: capabilityName
      });
    }
  }

  return warnings.sort((left, right) =>
    `${left.level}:${left.code}:${left.path ?? ""}`.localeCompare(`${right.level}:${right.code}:${right.path ?? ""}`)
  );
};

export const collectInspectorProperties = (targets: readonly InspectorTarget[]): readonly string[] =>
  [
    ...new Set(
      targets.flatMap((target) =>
        target.snapshot === null
          ? []
          : [
              ...target.snapshot.manualTracks.map((track) => track.property),
              ...target.snapshot.derivedAnimations.map((animation) => animation.property)
            ]
      )
    )
  ].sort((left, right) => left.localeCompare(right));

export const filterInspectorTargets = (
  targets: readonly InspectorTarget[],
  filters: InspectorFilters
): readonly InspectorTarget[] => {
  const search = filters.search.trim().toLowerCase();
  return targets.filter((target) => {
    if (search.length > 0 && !target.name.toLowerCase().includes(search)) {
      return false;
    }
    if (filters.sourceKind !== "all" && target.sourceKind !== filters.sourceKind) {
      return false;
    }
    if (filters.warningsOnly && target.warnings.length === 0) {
      return false;
    }
    if (filters.property.length > 0) {
      const snapshot = target.snapshot;
      if (
        snapshot === null ||
        !snapshot.manualTracks.some((track) => track.property === filters.property) &&
          !snapshot.derivedAnimations.some((animation) => animation.property === filters.property)
      ) {
        return false;
      }
    }
    if (filters.capabilityStatus !== "all") {
      const snapshot = target.snapshot;
      if (
        snapshot === null ||
        !(Object.values(snapshot.capabilities) as MotionCapability[]).some(
          (capability) => capability.status === filters.capabilityStatus
        )
      ) {
        return false;
      }
    }
    return true;
  });
};

export const buildInspectorTargets = (
  scopeNodes: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly depth: number;
    readonly visible: boolean;
    readonly locked: boolean;
  }[],
  snapshots: readonly MotionSnapshot[],
  failures: readonly { readonly nodeId: string; readonly message: string }[]
): readonly InspectorTarget[] => {
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.nodeId, snapshot]));
  const failuresById = new Map(failures.map((failure) => [failure.nodeId, failure.message]));

  return scopeNodes.map((node) => {
    const snapshot = snapshotsById.get(node.id) ?? null;
    const readError = failuresById.get(node.id);
    const warnings = snapshot === null
      ? readError
        ? [{ code: "PARTIAL_READ_FAILURE", level: "warning" as const, message: readError, path: node.id }]
        : []
      : detectInspectorWarnings(snapshot);
    return {
      nodeId: node.id,
      name: node.name,
      nodeType: node.type,
      depth: node.depth,
      visible: node.visible,
      locked: node.locked,
      sourceKind: snapshot?.sources.kind ?? "none",
      snapshot,
      readError,
      warnings
    };
  });
};

const normalizeAdapterWarnings = (warnings: readonly MotionAdapterWarning[]): readonly InspectorWarning[] =>
  warnings.map((warning) => ({
    code: warning.code,
    level: "warning",
    message: warning.message,
    path: warning.path
  }));

const formatNumber = (value: number): string => Number.parseFloat(value.toFixed(4)).toString();

const assertNever = (value: never): never => {
  throw new Error(`Unhandled Inspector value: ${JSON.stringify(value)}`);
};
