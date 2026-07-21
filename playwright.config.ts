import { defineConfig, devices } from "@playwright/test";

const port = process.env.MOTIONOPS_PLAYWRIGHT_PORT ?? "4173";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/ui",
  outputDir: ".playwright-test-results",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: {
    command: `npm run build:lab && npm exec vite -- --host 127.0.0.1 --port ${port} --strictPort --mode lab`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
