import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  define: {
    __MOTIONOPS_ENABLE_API_LAB__: JSON.stringify(mode === "lab")
  },
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: false
  },
  test: {
    environment: "jsdom",
    exclude: [
      "tests/ui/**",
      "tests/motion-evidence-collector.test.mjs",
      "tests/buildArtifacts.test.mjs",
      "node_modules/**",
      "dist/**"
    ],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["tests/**", "dist/**", "playwright.config.ts"]
    }
  }
}));
