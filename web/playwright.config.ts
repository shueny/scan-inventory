import { defineConfig, devices } from "@playwright/test";

// Browser smoke test of the demo path (PRD 9, T8, brought forward: docs/RUNBOOK.md).
// Runs the production build in static mode on the small committed fixture plant
// (e2e/fixtures/data, built by scripts/build_e2e_fixtures.py), so it needs neither the
// real scan nor the API, and runs the same way locally and in CI.
// Not 4173, the default `vite preview` port the owner may be using for the real data.
const PORT = 4317;
const env = [
  "SCAN_DATA_DIR=e2e/fixtures/data",
  "VITE_DATA_MODE=static",
  "VITE_DATA_BASE_URL=/data",
  "VITE_TILES_BASE_URL=/data/potree/nora",
].join(" ");

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // No retries: a flaky test must fail the gate, not turn green on the second try.
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // WebGL without a GPU (CI): Chromium's software renderer.
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: ["--enable-unsafe-swiftshader"] },
      },
    },
  ],
  webServer: {
    command: `${env} vite build --outDir e2e/.dist && ${env} vite preview --outDir e2e/.dist --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
