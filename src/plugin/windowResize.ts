import {
  normalizePluginWindowSize,
  type ResizePluginWindowRequest
} from "../shared/pluginWindow";

export interface PluginUiWindow {
  resize(width: number, height: number): void;
}

export type ResizePluginWindowResult =
  | { ok: true; width: number; height: number; requestId: string }
  | { ok: false; error: Error; requestId: string };

export const resizePluginWindow = (
  ui: PluginUiWindow,
  message: ResizePluginWindowRequest
): ResizePluginWindowResult => {
  const normalized = normalizePluginWindowSize(message.payload);

  if (normalized === null) {
    return {
      ok: false,
      error: new Error("Invalid plugin window dimensions."),
      requestId: message.requestId
    };
  }

  try {
    ui.resize(normalized.width, normalized.height);
    return {
      ok: true,
      width: normalized.width,
      height: normalized.height,
      requestId: message.requestId
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error("Unknown plugin window resize failure."),
      requestId: message.requestId
    };
  }
};
