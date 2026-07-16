import type { TimeMs } from "../../domain/time";
import type { MotionCapability, NormalizedManualTrack, NormalizedStyleInstance } from "./types";

export type VerifiedOperationKind =
  | "manual-track-replacement"
  | "animation-style-remove-reapply"
  | "timeline-duration-update"
  | "component-property-boolean-write"
  | "component-property-motion-track-write";

export interface ExpectedCapabilityCheck {
  capability: string;
  before?: MotionCapability;
}

interface BaseMotionWriteExpectation {
  operation: VerifiedOperationKind;
  nodeId: string;
  capabilityChecks?: ExpectedCapabilityCheck[];
}

export interface ManualTrackReplacementExpectation extends BaseMotionWriteExpectation {
  operation: "manual-track-replacement";
  expectedTrack: NormalizedManualTrack;
  preserveManualTracks?: NormalizedManualTrack[];
}

export interface AnimationStyleRemoveReapplyExpectation extends BaseMotionWriteExpectation {
  operation: "animation-style-remove-reapply";
  expectedStyle: Pick<NormalizedStyleInstance, "availableAnimationStyleId" | "appliedStyleInstanceId" | "name">;
  preserveStyleInstances?: Pick<NormalizedStyleInstance, "availableAnimationStyleId" | "appliedStyleInstanceId" | "name">[];
}

export interface TimelineDurationExpectation extends BaseMotionWriteExpectation {
  operation: "timeline-duration-update";
  timelineId: string;
  expectedDurationMs: TimeMs;
}

export interface ComponentPropertyBooleanExpectation extends BaseMotionWriteExpectation {
  operation: "component-property-boolean-write";
  propertyKey: string;
  expectedValue: boolean;
  expectedDefinition?: {
    type?: string;
    stableIdentifier?: string;
    displayName?: string;
  };
}

export interface ComponentPropertyMotionTrackExpectation extends BaseMotionWriteExpectation {
  operation: "component-property-motion-track-write";
  propertyKey: string;
}

export type MotionWriteExpectation =
  | ManualTrackReplacementExpectation
  | AnimationStyleRemoveReapplyExpectation
  | TimelineDurationExpectation
  | ComponentPropertyBooleanExpectation
  | ComponentPropertyMotionTrackExpectation;

export const assertNeverExpectation = (expectation: never): never => {
  throw new Error(`Unhandled Motion write expectation: ${JSON.stringify(expectation)}`);
};
