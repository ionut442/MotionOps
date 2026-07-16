export interface PluginWindowSize {
  width: number;
  height: number;
}

export const DEFAULT_PLUGIN_WINDOW_SIZE: PluginWindowSize = {
  width: 1080,
  height: 760
};

export const MIN_PLUGIN_WINDOW_SIZE: PluginWindowSize = {
  width: 760,
  height: 560
};

export interface ResizePluginWindowRequest {
  type: "RESIZE_PLUGIN_WINDOW";
  requestId: string;
  payload: PluginWindowSize;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteDimension = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeDimension = (value: number, minimum: number): number =>
  Math.max(minimum, Math.round(value));

export const normalizePluginWindowSize = (
  size: PluginWindowSize
): PluginWindowSize | null => {
  if (!isFiniteDimension(size.width) || !isFiniteDimension(size.height)) {
    return null;
  }

  return {
    width: normalizeDimension(size.width, MIN_PLUGIN_WINDOW_SIZE.width),
    height: normalizeDimension(size.height, MIN_PLUGIN_WINDOW_SIZE.height)
  };
};

export const createResizePluginWindowRequest = (
  requestId: string,
  size: PluginWindowSize
): ResizePluginWindowRequest | null => {
  const normalized = normalizePluginWindowSize(size);

  if (requestId.trim().length === 0 || normalized === null) {
    return null;
  }

  return {
    type: "RESIZE_PLUGIN_WINDOW",
    requestId,
    payload: normalized
  };
};

export const isResizePluginWindowRequest = (
  value: unknown
): value is ResizePluginWindowRequest => {
  if (!isRecord(value) || value.type !== "RESIZE_PLUGIN_WINDOW") {
    return false;
  }

  if (typeof value.requestId !== "string" || value.requestId.trim().length === 0) {
    return false;
  }

  if (!isRecord(value.payload)) {
    return false;
  }

  return normalizePluginWindowSize({
    width: value.payload.width as number,
    height: value.payload.height as number
  }) !== null;
};
