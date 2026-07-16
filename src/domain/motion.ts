import type { TimeMs } from "./time";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface MotionSceneNode {
  id: string;
  name?: string;
  type: string;
  parent: { type: string; parent: MotionSceneNode["parent"] } | null;
}

export type CapabilityStatus = "supported" | "supported-with-warning" | "read-only" | "unsupported" | "unknown";

export type MotionSourceKind = "none" | "manual" | "style" | "mixed";

export interface MotionCapability {
  status: CapabilityStatus;
  reason: string;
}

export interface MotionCapabilitySet {
  derivedAnimationReads: MotionCapability;
  manualTrackReads: MotionCapability;
  manualTrackReplacement: MotionCapability;
  styleInstanceReads: MotionCapability;
  styleRemoveReapply: MotionCapability;
  directStyleReapply: MotionCapability;
  timelineReads: MotionCapability;
  timelineDurationWrites: MotionCapability;
  componentPropertyReads: MotionCapability;
  componentPropertyMotionTrackReads: MotionCapability;
  componentPropertyWrites: MotionCapability;
  componentRoots: MotionCapability;
  componentChildren: MotionCapability;
  componentSets: MotionCapability;
  variantComponents: MotionCapability;
  instanceRoots: MotionCapability;
  instanceDescendants: MotionCapability;
  nestedInstances: MotionCapability;
  nestedDescendants: MotionCapability;
}

export type MotionAdapterWarningCode =
  | "UNKNOWN_API_SHAPE"
  | "PARTIAL_READABLE_DATA"
  | "KEYFRAMES_NOT_ARRAY"
  | "KEYFRAME_TIME_MISSING"
  | "KEYFRAME_EASING_MALFORMED"
  | "UNKNOWN_EASING"
  | "UNKNOWN_BETA_FIELD"
  | "COMPONENT_PROPERTY_UNDO_PARTIAL"
  | "COMPONENT_PROPERTY_MOTION_TRACK_NOT_EXPOSED"
  | "DIRECT_STYLE_REAPPLY_UNSAFE"
  | "KEYFRAME_ID_OBSERVATIONAL"
  | "TIMELINE_BELOW_KEYFRAME_POLICY_REQUIRED";

export interface MotionAdapterWarning {
  code: MotionAdapterWarningCode;
  message: string;
  path?: string;
  detail?: string;
}

export type NormalizedEasing =
  | { kind: "linear" }
  | { kind: "preset"; name: string }
  | { kind: "cubic-bezier"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "spring"; mass?: number; stiffness?: number; damping?: number; raw: unknown }
  | { kind: "unknown"; raw: unknown };

export interface NormalizedKeyframe {
  keyframeId?: string;
  ordinal: number;
  timeMs: TimeMs;
  value: unknown;
  easing: NormalizedEasing;
  valueClassification: string;
}

export interface NormalizedManualTrack {
  trackId?: string;
  property: string;
  propertyClassification: string;
  keyframes: NormalizedKeyframe[];
  write: MotionCapability;
  warnings: MotionAdapterWarning[];
}

export interface NormalizedTimeline {
  timelineId: string;
  durationMs: TimeMs;
  tracks: string[];
  diagnostics?: {
    rawDurationSeconds?: number;
  };
}

export interface NormalizedStyleInstance {
  availableAnimationStyleId?: string;
  appliedStyleInstanceId?: string;
  name?: string;
  warnings: MotionAdapterWarning[];
}

export interface NormalizedDerivedAnimation {
  property: string;
  valueClassification: string;
  timelineDurationMs?: TimeMs;
  diagnostics?: {
    rawUnsupported?: unknown;
  };
}

export interface ComponentPropertyDefinition {
  propertyKey: string;
  stableIdentifier?: string;
  displayName?: string;
  type?: string;
  defaultValue?: unknown;
  rawValue?: unknown;
}

export interface ComponentPropertyState {
  propertyKey: string;
  type?: string;
  value: unknown;
}

export interface ComponentPropertyMotionInfo {
  propertyKey: string;
  exposedTrackProperties: string[];
  write: MotionCapability;
  warnings: MotionAdapterWarning[];
}

export interface NormalizedComponentPropertyInfo {
  definitions: ComponentPropertyDefinition[];
  currentState: ComponentPropertyState[];
  motionTracks: ComponentPropertyMotionInfo[];
  writeability: MotionCapability;
  warnings: MotionAdapterWarning[];
}

export interface MotionSourceCollections {
  kind: MotionSourceKind;
  hasDerivedAnimations: boolean;
  hasManualTracks: boolean;
  hasStyleInstances: boolean;
  hasTimelines: boolean;
}

export interface MotionSnapshot {
  nodeId: string;
  nodeType: string;
  sources: MotionSourceCollections;
  timelines: NormalizedTimeline[];
  manualTracks: NormalizedManualTrack[];
  styleInstances: NormalizedStyleInstance[];
  componentProperties: NormalizedComponentPropertyInfo;
  derivedAnimations: NormalizedDerivedAnimation[];
  capabilities: MotionCapabilitySet;
  warnings: MotionAdapterWarning[];
}

export interface ManualTrackWriteModel {
  trackId?: string;
  property: string;
  baseValue?: unknown;
  keyframes: {
    keyframeId?: string;
    timeMs: TimeMs;
    value: unknown;
    easing?: NormalizedEasing;
  }[];
}

export interface EasingSemanticPolicy {
  cubicBezierPrecision: number;
}
