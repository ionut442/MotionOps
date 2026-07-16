import { secondsToMilliseconds } from "./time";
import { normalizeEasingWithWarnings } from "./easing";
import { asRecord, getNumber, getString, stableClone } from "./object";
import { classifyMotionCapabilities } from "./capabilities";
import type {
  ComponentPropertyDefinition,
  ComponentPropertyMotionInfo,
  ComponentPropertyState,
  MotionAdapterWarning,
  MotionCapability,
  MotionSourceKind,
  NormalizedDerivedAnimation,
  MotionSnapshot,
  MotionSceneNode,
  NormalizedComponentPropertyInfo,
  NormalizedKeyframe,
  NormalizedManualTrack,
  NormalizedStyleInstance,
  NormalizedTimeline
} from "./types";

export const normalizeMotionSnapshot = (node: MotionSceneNode): MotionSnapshot => {
  const record = asRecord(node) ?? {};
  const capabilities = classifyMotionCapabilities(node);
  const manualTracks = normalizeManualTracks(record.manualKeyframeTracks);
  const timelines = normalizeTimelines(record.timelines, manualTracks);
  const styleInstances = normalizeStyleInstances(record.animationStyles);
  const componentProperties = normalizeComponentProperties(record, manualTracks);
  const derivedAnimations = normalizeDerivedAnimations(record.animations);
  const sourceKind = classifySourceKind(manualTracks.length, styleInstances.length);
  const warnings = [
    ...manualTracks.flatMap((track) => track.warnings),
    ...styleInstances.flatMap((style) => style.warnings),
    ...componentProperties.warnings
  ];

  return {
    nodeId: node.id,
    nodeType: node.type,
    sources: {
      kind: sourceKind,
      hasDerivedAnimations: derivedAnimations.length > 0,
      hasManualTracks: manualTracks.length > 0,
      hasStyleInstances: styleInstances.length > 0,
      hasTimelines: timelines.length > 0
    },
    timelines,
    manualTracks,
    styleInstances,
    componentProperties,
    derivedAnimations,
    capabilities,
    warnings
  };
};

const classifySourceKind = (manualCount: number, styleCount: number): MotionSourceKind => {
  if (manualCount > 0 && styleCount > 0) {
    return "mixed";
  }
  if (manualCount > 0) {
    return "manual";
  }
  if (styleCount > 0) {
    return "style";
  }
  return "none";
};

const normalizeDerivedAnimations = (value: unknown): NormalizedDerivedAnimation[] => {
  const record = asRecord(value);
  const entries = Array.isArray(value) ? value.map((entry, index) => [String(index), entry] as const) : Object.entries(record ?? {});
  return entries
    .map(([property, animation]) => {
      const animationRecord = asRecord(animation);
      const duration = animationRecord ? getNumber(animationRecord, "timelineDuration") : undefined;
      return {
        property,
        valueClassification: classifyValue(animation),
        timelineDurationMs: duration === undefined ? undefined : secondsToMilliseconds(duration),
        diagnostics: animationRecord ? { rawUnsupported: stableClone(animation) } : undefined
      };
    })
    .sort((left, right) => left.property.localeCompare(right.property));
};

const normalizeTimelines = (value: unknown, manualTracks: NormalizedManualTrack[]): NormalizedTimeline[] => {
  const timelines = Array.isArray(value) ? value : Object.values(asRecord(value) ?? {});
  return timelines.flatMap((timeline): NormalizedTimeline[] => {
    const record = asRecord(timeline);
    if (!record) {
      return [];
    }
    const id = getString(record, "id") ?? getString(record, "timelineId");
    const duration = getNumber(record, "duration");
    if (!id || duration === undefined) {
      return [];
    }
    return [
      {
        timelineId: id,
        durationMs: secondsToMilliseconds(duration),
        tracks: manualTracks.map((track) => track.trackId ?? track.property).sort(),
        diagnostics: { rawDurationSeconds: duration }
      }
    ];
  }).sort((left, right) => left.timelineId.localeCompare(right.timelineId));
};

const normalizeManualTracks = (value: unknown): NormalizedManualTrack[] => {
  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right)).flatMap(([property, rawTrack]) => {
    const trackRecords = extractTrackRecords(rawTrack);
    return trackRecords.map((trackRecord) => {
      const warnings: MotionAdapterWarning[] = [];
      const keyframes = normalizeKeyframes(trackRecord.keyframes, property, warnings);
      return {
        trackId: getString(trackRecord, "id"),
        property,
        propertyClassification: classifyProperty(property),
        keyframes,
        write: {
          status: "supported-with-warning",
          reason: "P0-007 permits replacement, but keyframe IDs are observational after edits."
        },
        warnings
      };
    });
  });
};

const extractTrackRecords = (value: unknown): Record<string, unknown>[] => {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.tracks)) {
    return record.tracks.flatMap((track) => {
      const trackRecord = asRecord(track);
      return trackRecord ? [trackRecord] : [];
    });
  }
  return [record];
};

const normalizeKeyframes = (
  value: unknown,
  property: string,
  warnings: MotionAdapterWarning[]
): NormalizedKeyframe[] => {
  if (!Array.isArray(value)) {
    warnings.push({ code: "KEYFRAMES_NOT_ARRAY", message: "Manual track keyframes are not an array.", path: property });
    return [];
  }

  return value
    .flatMap((keyframe, ordinal): NormalizedKeyframe[] => {
      const record = asRecord(keyframe);
      if (!record) {
        return [];
      }
      const seconds = getNumber(record, "time") ?? getNumber(record, "timelinePosition") ?? getNumber(record, "position");
      if (seconds === undefined) {
        warnings.push({ code: "KEYFRAME_TIME_MISSING", message: "Keyframe time is missing.", path: property });
        return [];
      }
      return [
        {
          keyframeId: getString(record, "id"),
          ordinal,
          timeMs: secondsToMilliseconds(seconds),
          value: stableClone(record.value),
          easing: normalizeEasingWithWarnings(record.easing, warnings, `${property}.keyframes.${String(ordinal)}.easing`),
          valueClassification: classifyValue(record.value)
        }
      ];
    })
    .sort((a, b) => a.timeMs - b.timeMs || a.ordinal - b.ordinal);
};

const normalizeStyleInstances = (value: unknown): NormalizedStyleInstance[] => {
  const styles = Array.isArray(value) ? value : Object.values(asRecord(value) ?? {});
  return styles.flatMap((style): NormalizedStyleInstance[] => {
    const record = asRecord(style);
    if (!record) {
      return [];
    }
    const availableAnimationStyleId =
      getString(record, "styleId") ?? getString(record, "animationStyleId") ?? getString(record, "availableAnimationStyleId");
    const appliedStyleInstanceId =
      getString(record, "id") ?? getString(record, "styleInstanceId") ?? getString(record, "appliedStyleInstanceId");
    const warnings: MotionAdapterWarning[] = [];
    if (!availableAnimationStyleId || !appliedStyleInstanceId) {
      warnings.push({
        code: "UNKNOWN_API_SHAPE",
        message: "Animation style instance did not expose both available style and applied instance identities.",
        path: "animationStyles"
      });
    }
    return [
      {
        availableAnimationStyleId,
        appliedStyleInstanceId,
        name: getString(record, "name"),
        warnings
      }
    ];
  }).sort((left, right) =>
    `${left.appliedStyleInstanceId ?? ""}:${left.availableAnimationStyleId ?? ""}`.localeCompare(
      `${right.appliedStyleInstanceId ?? ""}:${right.availableAnimationStyleId ?? ""}`
    )
  );
};

const normalizeComponentProperties = (
  nodeRecord: Record<string, unknown>,
  manualTracks: NormalizedManualTrack[]
): NormalizedComponentPropertyInfo => {
  const definitions = normalizePropertyDefinitions(nodeRecord.componentPropertyDefinitions);
  const currentState = normalizePropertyState(nodeRecord.componentProperties);
  const warnings: MotionAdapterWarning[] = [];
  const motionTracks: ComponentPropertyMotionInfo[] = currentState.map((state) => {
    const exposed = manualTracks.filter((track) => track.property === state.propertyKey).map((track) => track.property);
    if (exposed.length === 0) {
      warnings.push({
        code: "COMPONENT_PROPERTY_MOTION_TRACK_NOT_EXPOSED",
        message: "Property API state is visible, but no writable Motion track was exposed for this property.",
        path: state.propertyKey
      });
    }
    return {
      propertyKey: state.propertyKey,
      exposedTrackProperties: exposed,
      write:
        exposed.length > 0 && state.type === "BOOLEAN"
          ? { status: "supported-with-warning", reason: "P0-012 CP09 found writable BOOLEAN property Motion track; Undo is partial." }
          : { status: "read-only", reason: "Property API state visible without writable Motion track exposure." },
      warnings: []
    };
  });

  const hasBooleanWritableState = currentState.some((state) => state.type === "BOOLEAN") && typeof nodeRecord.setProperties === "function";
  const writeability: MotionCapability =
    hasBooleanWritableState
      ? { status: "supported-with-warning", reason: "P0-012 CP09 supports BOOLEAN setProperties writes with partial undo warning." }
      : currentState.length > 0
        ? { status: "read-only", reason: "Component-property state is readable, but no verified writable BOOLEAN path is exposed." }
      : definitions.length > 0
        ? { status: "read-only", reason: "Definitions are readable, but no instance state is writable here." }
        : { status: "unsupported", reason: "No component property API fields detected." };
  if (writeability.status === "supported-with-warning") {
    warnings.push({
      code: "COMPONENT_PROPERTY_UNDO_PARTIAL",
      message: "CP09 found component-property writes supported, but plugin-triggered Undo invalidated target/sibling reads.",
      path: "componentProperties"
    });
  }

  return {
    definitions,
    currentState,
    motionTracks,
    writeability,
    warnings
  };
};

const normalizePropertyDefinitions = (value: unknown): ComponentPropertyDefinition[] =>
  Object.entries(asRecord(value) ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([propertyKey, definition]) => {
    const record = asRecord(definition) ?? {};
    return {
      propertyKey,
      stableIdentifier: getString(record, "stableIdentifier"),
      displayName: getString(record, "displayName") ?? getString(record, "name"),
      type: getString(record, "type"),
      defaultValue: stableClone(record.defaultValue),
      rawValue: stableClone(definition)
    };
  });

const normalizePropertyState = (value: unknown): ComponentPropertyState[] =>
  Object.entries(asRecord(value) ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([propertyKey, state]) => {
    const record = asRecord(state) ?? {};
    return {
      propertyKey,
      type: getString(record, "type"),
      value: stableClone("value" in record ? record.value : state)
    };
  });

const classifyProperty = (property: string): string => {
  if (property.includes("#")) {
    return "component-property";
  }
  if (property.includes("OPACITY") || property.includes("TRANSLATION") || property.includes("ROTATION") || property.includes("SCALE")) {
    return "transform-or-opacity";
  }
  return "unknown";
};

const classifyValue = (value: unknown): string => {
  const record = asRecord(value);
  const type = record ? getString(record, "type") : undefined;
  if (type) {
    return type;
  }
  return Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
};
