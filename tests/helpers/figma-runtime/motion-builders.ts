import { secondsToMilliseconds } from "../../../src/plugin/motion";
import type { ManualTrackWriteModel, MotionSceneNode } from "../../../src/plugin/motion";
import type { TimeMs } from "../../../src/plugin/motion/time";

export type RawMotionValue = string | number | boolean | null | Readonly<Record<string, unknown>>;

export interface RawKeyframe {
  id?: string;
  timelinePosition?: number;
  value?: unknown;
  easing?: unknown;
}

export interface RawManualTrack {
  id?: string;
  baseValue?: unknown;
  keyframes?: RawKeyframe[];
}

export interface RawTimeline {
  id: string;
  duration: number;
  tracks?: string[];
}

export interface RawStyleInstance {
  id: string;
  styleId: string;
  name?: string;
}

export interface RawComponentPropertyState {
  type?: string;
  value: unknown;
}

export interface RawComponentPropertyDefinition {
  type?: string;
  defaultValue?: unknown;
  stableIdentifier?: string;
  displayName?: string;
  rawValue?: unknown;
}

export type RawComponentProperties = Record<string, RawComponentPropertyState>;
export type RawComponentPropertyDefinitions = Record<string, RawComponentPropertyDefinition>;

export interface RawMotionNode extends MotionSceneNode {
  visible?: boolean;
  locked?: boolean;
  manualKeyframeTracks?: Record<string, RawManualTrack | { tracks: RawManualTrack[] }>;
  animationStyles?: RawStyleInstance[];
  animations?: Record<string, unknown>;
  timelines?: RawTimeline[];
  componentProperties?: RawComponentProperties;
  componentPropertyDefinitions?: RawComponentPropertyDefinitions;
  [key: string]: unknown;
}

export const parent = (type: string, next: MotionSceneNode["parent"] = null): MotionSceneNode["parent"] => ({ type, parent: next });

export const rawKeyframe = (overrides: Partial<RawKeyframe> = {}): RawKeyframe => ({
  id: "kf-1",
  timelinePosition: 0,
  value: { type: "FLOAT", value: 0 },
  easing: { type: "LINEAR" },
  ...overrides
});

export const linearEasing = (): unknown => ({ type: "LINEAR", easingFunctionCubicBezier: { x1: 0, y1: 0, x2: 1, y2: 1 } });
export const presetEasing = (name = "EASE_OUT"): unknown => ({ type: name });
export const cubicBezierEasing = (): unknown => ({ type: "CUSTOM", easingFunctionCubicBezier: { x1: 0.2, y1: 0, x2: 0.4, y2: 1 } });
export const springEasing = (): unknown => ({ type: "SPRING", stiffness: 10, damping: 2 });
export const unknownEasing = (): unknown => ({ betaCurve: true });

export const rawManualTrack = (property = "OPACITY", overrides: Partial<RawManualTrack> = {}): Record<string, RawManualTrack> => ({
  [property]: {
    id: `${property}-track`,
    baseValue: { type: "FLOAT", value: 0.2 },
    keyframes: [
      rawKeyframe({ id: `${property}-a`, timelinePosition: 0, value: { type: "FLOAT", value: 0.2 }, easing: linearEasing() }),
      rawKeyframe({ id: `${property}-b`, timelinePosition: 0.5, value: { type: "FLOAT", value: 1 }, easing: presetEasing() })
    ],
    ...clone(overrides)
  }
});

export const duplicateTimeTrack = (property = "OPACITY"): Record<string, RawManualTrack> =>
  rawManualTrack(property, {
    keyframes: [
      rawKeyframe({ id: `${property}-a`, timelinePosition: 0, value: { type: "FLOAT", value: 0.2 } }),
      rawKeyframe({ id: `${property}-b`, timelinePosition: 0.5, value: { type: "FLOAT", value: 1 } }),
      rawKeyframe({ id: `${property}-dup`, timelinePosition: 0.5, value: { type: "FLOAT", value: 0.8 }, easing: unknownEasing() })
    ]
  });

export const rawTimeline = (id = "timeline-1", duration = 0.5): RawTimeline => ({ id, duration });
export const rawStyleInstance = (id = "applied-1", styleId = "available-1", name = "Style A"): RawStyleInstance => ({ id, styleId, name });

export const cp09BooleanDefinition = (propertyKey = "ShowBadge#1:2"): RawComponentPropertyDefinitions => ({
  [propertyKey]: { type: "BOOLEAN", defaultValue: true, stableIdentifier: "1:2", displayName: "ShowBadge" }
});

export const cp09BooleanState = (propertyKey = "ShowBadge#1:2", value = true): RawComponentProperties => ({
  [propertyKey]: { type: "BOOLEAN", value }
});

export const rawMotionNode = (overrides: Partial<RawMotionNode> = {}): RawMotionNode => ({
  id: "node-1",
  name: "Motion Node",
  type: "INSTANCE",
  parent: null,
  visible: true,
  locked: false,
  manualKeyframeTracks: rawManualTrack(),
  animationStyles: [rawStyleInstance()],
  animations: { OPACITY: { timelineDuration: 0.5, betaField: { kept: true } } },
  timelines: [rawTimeline()],
  componentProperties: cp09BooleanState(),
  componentPropertyDefinitions: cp09BooleanDefinition(),
  applyManualKeyframeTrack: () => undefined,
  removeAnimationStyle: () => undefined,
  applyAnimationStyle: () => undefined,
  setTimelineDuration: () => undefined,
  setProperties: () => undefined,
  ...clone(overrides)
});

export const noMotionNode = (): RawMotionNode =>
  rawMotionNode({ manualKeyframeTracks: {}, animationStyles: [], animations: {}, timelines: [], componentProperties: {}, componentPropertyDefinitions: {} });

export const manualOpacityNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: rawManualTrack("OPACITY"), animationStyles: [] });
export const translationXTrackNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: rawManualTrack("TRANSLATION_X") });
export const translationYTrackNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: rawManualTrack("TRANSLATION_Y") });
export const rotationTrackNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: rawManualTrack("ROTATION") });
export const scaleTrackNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: { ...rawManualTrack("SCALE_X"), ...rawManualTrack("SCALE_Y") } });
export const sizeTrackNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: { ...rawManualTrack("WIDTH"), ...rawManualTrack("HEIGHT") } });
export const cornerRadiusTrackNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: rawManualTrack("CORNER_RADIUS") });
export const strokeWeightTrackNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: rawManualTrack("STROKE_WEIGHT") });
export const pathTrimTrackNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: rawManualTrack("PATH_TRIM") });
export const multipleManualTracksNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: { ...rawManualTrack("OPACITY"), ...rawManualTrack("TRANSLATION_X") } });
export const multipleKeyframesNode = (): RawMotionNode =>
  rawMotionNode({ manualKeyframeTracks: rawManualTrack("OPACITY", { keyframes: [rawKeyframe({ id: "a" }), rawKeyframe({ id: "b", timelinePosition: 0.5 }), rawKeyframe({ id: "c", timelinePosition: 1 })] }) });
export const duplicateKeyframeTimesNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: duplicateTimeTrack() });
export const differentEasingNode = (): RawMotionNode =>
  rawMotionNode({ manualKeyframeTracks: rawManualTrack("OPACITY", { keyframes: [rawKeyframe({ id: "a", easing: linearEasing() }), rawKeyframe({ id: "b", timelinePosition: 0.5, easing: cubicBezierEasing() })] }) });
export const animationStyleNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: {}, animationStyles: [rawStyleInstance()] });
export const multipleStyleInstancesNode = (): RawMotionNode => rawMotionNode({ animationStyles: [rawStyleInstance("applied-1", "Scale", "Scale"), rawStyleInstance("applied-2", "Fade", "Fade")] });
export const regeneratedStyleInstanceNode = (): RawMotionNode => rawMotionNode({ animationStyles: [rawStyleInstance("applied-new", "Scale", "Scale")] });
export const mixedMotionNode = (): RawMotionNode => rawMotionNode();
export const oneTimelineNode = (): RawMotionNode => rawMotionNode({ timelines: [rawTimeline("timeline-1", 0.5)] });
export const multipleTimelinesNode = (): RawMotionNode => rawMotionNode({ timelines: [rawTimeline("timeline-a", 0.3334), rawTimeline("timeline-b", 1.25)] });
export const fractionalTimingNode = (): RawMotionNode => rawMotionNode({ timelines: [rawTimeline("timeline-1", 0.3334)], manualKeyframeTracks: rawManualTrack("OPACITY", { keyframes: [rawKeyframe({ id: "a", timelinePosition: 0.1234 })] }) });
export const hiddenAnimatedNode = (): RawMotionNode => rawMotionNode({ visible: false });
export const lockedAnimatedNode = (): RawMotionNode => rawMotionNode({ locked: true });
export const componentRootNode = (): RawMotionNode => rawMotionNode({ type: "COMPONENT", parent: null });
export const componentChildNode = (): RawMotionNode => rawMotionNode({ type: "RECTANGLE", parent: parent("COMPONENT") });
export const componentSetNode = (): RawMotionNode => rawMotionNode({ type: "COMPONENT_SET", parent: null });
export const variantComponentNode = (): RawMotionNode => rawMotionNode({ type: "COMPONENT", parent: parent("COMPONENT_SET") });
export const instanceRootNode = (): RawMotionNode => rawMotionNode({ type: "INSTANCE", parent: null });
export const instanceDescendantNode = (): RawMotionNode => rawMotionNode({ type: "RECTANGLE", parent: parent("INSTANCE") });
export const nestedInstanceNode = (): RawMotionNode => rawMotionNode({ type: "INSTANCE", parent: parent("INSTANCE") });
export const nestedDescendantNode = (): RawMotionNode => rawMotionNode({ type: "RECTANGLE", parent: parent("INSTANCE", parent("INSTANCE")) });
export const componentPropertyNode = (): RawMotionNode => rawMotionNode({ componentProperties: cp09BooleanState(), componentPropertyDefinitions: cp09BooleanDefinition() });
export const unsupportedComponentPropertyMotionTrackNode = (): RawMotionNode => rawMotionNode({ componentProperties: { Label: { type: "TEXT", value: "Alpha" } } });
export const missingOptionalFieldsNode = (): RawMotionNode => rawMotionNode({ animationStyles: undefined, timelines: undefined, componentPropertyDefinitions: undefined });
export const unknownBetaFieldNode = (): RawMotionNode => rawMotionNode({ animations: { OPACITY: { timelineDuration: 0.5, beta: { unknown: true } } } });
export const malformedRawShapeNode = (): RawMotionNode => rawMotionNode({ manualKeyframeTracks: { OPACITY: { id: "bad", keyframes: "not-array" as unknown as RawKeyframe[] } } });
export const nodeChangedAfterGuardNode = (): RawMotionNode => rawMotionNode({ timelines: [rawTimeline("timeline-1", 0.7)] });
export const nodeRemovedAfterBaselineNode = (): RawMotionNode => rawMotionNode();
export const capabilityDowngradeNode = (): RawMotionNode => rawMotionNode({ setTimelineDuration: null });

export const manualReplacementScenario = () => {
  const baseline = manualOpacityNode();
  const replacement: ManualTrackWriteModel = {
    property: "OPACITY",
    trackId: "OPACITY-track",
    keyframes: [
      { keyframeId: "OPACITY-a", timeMs: secondsToMilliseconds(0), value: { type: "FLOAT", value: 0.2 } },
      { keyframeId: "OPACITY-b", timeMs: secondsToMilliseconds(0.5), value: { type: "FLOAT", value: 1 } }
    ]
  };
  return { baseline, replacement };
};

export const styleRemoveReapplyScenario = () => ({
  baseline: animationStyleNode(),
  appliedStyleInstanceId: "applied-1",
  availableAnimationStyleId: "available-1"
});

export const timelineUpdateScenario = (durationMs: TimeMs = secondsToMilliseconds(0.75)) => ({
  baseline: oneTimelineNode(),
  timelineId: "timeline-1",
  durationMs,
  expectedRawSeconds: 0.75
});

export const cp09BooleanScenario = () => ({
  baseline: componentPropertyNode(),
  propertyKey: "ShowBadge#1:2",
  requestedValue: false
});

export const staleGuardScenario = () => ({
  baseline: oneTimelineNode(),
  unchanged: oneTimelineNode(),
  changedRelevant: rawMotionNode({ timelines: [rawTimeline("timeline-1", 0.7)] }),
  changedIrrelevant: rawMotionNode({ manualKeyframeTracks: rawManualTrack("TRANSLATION_X") }),
  capabilityDowngrade: capabilityDowngradeNode()
});

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
