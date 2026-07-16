import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  define: {
    __MOTIONOPS_ENABLE_API_LAB__: JSON.stringify(mode === "lab")
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
