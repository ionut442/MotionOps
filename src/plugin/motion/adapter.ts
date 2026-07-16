import {
  removeAndReapplyStyle,
  replaceManualTrack,
  setComponentPropertyValue,
  setTimelineDuration
} from "./write";
import { readMotionSnapshot } from "./read";
import type { MotionLogOptions } from "./log";
import type { MotionAdapter } from "./types";

export const createFigmaMotionAdapter = (defaultLogOptions: MotionLogOptions = {}): MotionAdapter => ({
  readMotionSnapshot: (nodeId, logOptions) => readMotionSnapshot(nodeId, { ...defaultLogOptions, ...logOptions }),
  replaceManualTrack: (nodeId, track, logOptions) => replaceManualTrack(nodeId, track, { ...defaultLogOptions, ...logOptions }),
  removeAndReapplyStyle: (nodeId, ids, logOptions) => removeAndReapplyStyle(nodeId, ids, { ...defaultLogOptions, ...logOptions }),
  setTimelineDuration: (nodeId, timelineId, durationMs, logOptions) =>
    setTimelineDuration(nodeId, timelineId, durationMs, { ...defaultLogOptions, ...logOptions }),
  setComponentPropertyValue: (nodeId, propertyKey, value, logOptions) =>
    setComponentPropertyValue(nodeId, propertyKey, value, { ...defaultLogOptions, ...logOptions })
});
