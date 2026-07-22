import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readInlinedUiHtml = (): string => {
  try {
    return readFileSync(resolve("dist", "index.html"), "utf8");
  } catch {
    return "<!doctype html><html><body><p>MotionOps UI has not been built.</p></body></html>";
  }
};

export default defineConfig(({ mode }) => ({
  define: {
    __MOTIONOPS_ENABLE_API_LAB__: JSON.stringify(mode === "lab"),
    __html__: JSON.stringify(readInlinedUiHtml())
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/plugin/main.ts",
      formats: ["iife"],
      name: "MotionOpsPlugin",
      fileName: () => "plugin.js"
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
}));
