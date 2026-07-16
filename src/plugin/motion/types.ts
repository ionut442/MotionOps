import type { TimeMs } from "../../domain/time";
import type {
  ManualTrackWriteModel,
  MotionSnapshot,
  Result
} from "../../domain/motion";
import type { MotionAdapterError } from "./errors";
import type { MotionLogOptions } from "./log";

export type {
  CapabilityStatus,
  ComponentPropertyDefinition,
  ComponentPropertyMotionInfo,
  ComponentPropertyState,
  EasingSemanticPolicy,
  ManualTrackWriteModel,
  MotionAdapterWarning,
  MotionAdapterWarningCode,
  MotionCapability,
  MotionCapabilitySet,
  MotionSceneNode,
  MotionSnapshot,
  MotionSourceCollections,
  MotionSourceKind,
  NormalizedComponentPropertyInfo,
  NormalizedDerivedAnimation,
  NormalizedEasing,
  NormalizedKeyframe,
  NormalizedManualTrack,
  NormalizedStyleInstance,
  NormalizedTimeline,
  Result
} from "../../domain/motion";

export interface MotionAdapter {
  readMotionSnapshot(
    nodeId: string,
    logOptions?: MotionLogOptions
  ): Promise<Result<MotionSnapshot, MotionAdapterError>>;
  replaceManualTrack(
    nodeId: string,
    track: ManualTrackWriteModel,
    logOptions?: MotionLogOptions
  ): Promise<Result<MotionSnapshot, MotionAdapterError>>;
  removeAndReapplyStyle(
    nodeId: string,
    ids: { appliedStyleInstanceId: string; availableAnimationStyleId: string },
    logOptions?: MotionLogOptions
  ): Promise<Result<MotionSnapshot, MotionAdapterError>>;
  setTimelineDuration(
    nodeId: string,
    timelineId: string,
    durationMs: TimeMs,
    logOptions?: MotionLogOptions
  ): Promise<Result<MotionSnapshot, MotionAdapterError>>;
  setComponentPropertyValue(
    nodeId: string,
    propertyKey: string,
    value: boolean,
    logOptions?: MotionLogOptions
  ): Promise<Result<MotionSnapshot, MotionAdapterError>>;
}
