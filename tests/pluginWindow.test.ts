import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isUiToPluginMessage } from "../src/shared/messages";
import {
  createResizePluginWindowRequest,
  DEFAULT_PLUGIN_WINDOW_SIZE,
  isResizePluginWindowRequest,
  MIN_PLUGIN_WINDOW_SIZE,
  normalizePluginWindowSize
} from "../src/shared/pluginWindow";

const collectFiles = (root: string): string[] =>
  readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });

describe("plugin window sizing", () => {
  it("keeps default and minimum size constants valid", () => {
    expect(DEFAULT_PLUGIN_WINDOW_SIZE).toEqual({ width: 1080, height: 760 });
    expect(MIN_PLUGIN_WINDOW_SIZE).toEqual({ width: 760, height: 560 });
    expect(DEFAULT_PLUGIN_WINDOW_SIZE.width).toBeGreaterThanOrEqual(MIN_PLUGIN_WINDOW_SIZE.width);
    expect(DEFAULT_PLUGIN_WINDOW_SIZE.height).toBeGreaterThanOrEqual(MIN_PLUGIN_WINDOW_SIZE.height);
  });

  it("normalizes fractional dimensions deterministically", () => {
    expect(normalizePluginWindowSize({ width: 1040.4, height: 700.6 })).toEqual({
      width: 1040,
      height: 701
    });
  });

  it("rejects non-finite dimensions", () => {
    expect(normalizePluginWindowSize({ width: Number.NaN, height: 700 })).toBeNull();
    expect(normalizePluginWindowSize({ width: 900, height: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("clamps negative and below-minimum dimensions to the minimum", () => {
    expect(normalizePluginWindowSize({ width: -10, height: 1 })).toEqual(MIN_PLUGIN_WINDOW_SIZE);
    expect(normalizePluginWindowSize({ width: 700, height: 500 })).toEqual(MIN_PLUGIN_WINDOW_SIZE);
  });

  it("creates typed resize requests and preserves request IDs", () => {
    const request = createResizePluginWindowRequest("resize-1", { width: 800.7, height: 600.1 });
    expect(request).toEqual({
      type: "RESIZE_PLUGIN_WINDOW",
      requestId: "resize-1",
      payload: { width: 801, height: 600 }
    });
    expect(isResizePluginWindowRequest(request)).toBe(true);
    expect(isUiToPluginMessage(request)).toBe(true);
  });

  it("rejects malformed resize messages and unknown message types", () => {
    expect(isResizePluginWindowRequest({ type: "RESIZE_PLUGIN_WINDOW", requestId: "", payload: { width: 800, height: 600 } })).toBe(false);
    expect(isResizePluginWindowRequest({ type: "RESIZE_PLUGIN_WINDOW", requestId: "resize-1", payload: { width: "800", height: 600 } })).toBe(false);
    expect(isUiToPluginMessage({ type: "UNKNOWN_RESIZE", requestId: "resize-1", payload: { width: 800, height: 600 } })).toBe(false);
  });
});

describe("UI architecture boundary", () => {
  it("keeps UI components away from Figma globals, Motion adapter, tests, and Phase 0 lab imports", () => {
    const uiFiles = collectFiles("src/ui").filter((file) => /\.(css|tsx?)$/.test(file));
    const combinedUi = uiFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combinedUi).not.toMatch(/\bfigma\b/);
    expect(combinedUi).not.toContain("../plugin/motion");
    expect(combinedUi).not.toContain("../shared/labConfig");
    expect(combinedUi).not.toMatch(/p00[6-9]|p01[0-2]|Motion API Lab/);

    const productionFiles = collectFiles("src").filter((file) => /\.(ts|tsx)$/.test(file));
    const combinedProduction = productionFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combinedProduction).not.toMatch(/from\s+["'].*tests/);
  });

  it("keeps reduced-motion and focus-visible foundations in global styles", () => {
    const styles = readFileSync("src/ui/styles.css", "utf8");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("prefers-reduced-motion");
  });
});
