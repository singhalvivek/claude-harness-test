import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config. The webServer runs the production server
 * (`pnpm start` -> `next start -p 8001`) and waits for GET /health to
 * return 200 before any spec runs, so a green suite proves the app builds,
 * boots on 8001, and its DB check passes. Requires a prior `pnpm build`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:8001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:8001/health",
    // The phase gate sets PLAYWRIGHT_REUSE_SERVER=0 to FORBID reuse: a stale
    // server on 8001 serves OLD code and would silently green-light a broken
    // build. Interactive local runs still reuse a dev/prod server.
    reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER !== "0",
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
