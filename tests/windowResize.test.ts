import { describe, expect, it } from "vitest";
import { resizePluginWindow, type PluginUiWindow } from "../src/plugin/windowResize";

describe("plugin process window resizing", () => {
  it("calls resize exactly once with normalized integer dimensions", () => {
    const calls: { width: number; height: number }[] = [];
    const ui: PluginUiWindow = {
      resize: (width, height) => {
        calls.push({ width, height });
      }
    };

    const result = resizePluginWindow(ui, {
      type: "RESIZE_PLUGIN_WINDOW",
      requestId: "resize-1",
      payload: { width: 799.7, height: 559.2 }
    });

    expect(result).toEqual({ ok: true, requestId: "resize-1", width: 800, height: 560 });
    expect(calls).toEqual([{ width: 800, height: 560 }]);
  });

  it("converts resize failures without crashing message handling", () => {
    const ui: PluginUiWindow = {
      resize: () => {
        throw new Error("resize unavailable");
      }
    };

    const result = resizePluginWindow(ui, {
      type: "RESIZE_PLUGIN_WINDOW",
      requestId: "resize-fail",
      payload: { width: 900, height: 700 }
    });

    expect(result.ok).toBe(false);
    expect(result.requestId).toBe("resize-fail");
    if (!result.ok) {
      expect(result.error.message).toBe("resize unavailable");
    }
  });
});
