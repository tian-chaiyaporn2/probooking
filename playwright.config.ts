import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Playwright boots BOTH services then drives a real browser:
 *  - API (prebuilt) on :4000  — run `pnpm build:api` first (the `e2e` script does).
 *  - Web (next dev) on :3000.
 * The browser exercises the booking flow against the live API (CORS is enabled).
 */
export default defineConfig({
  testDir: "./e2e/tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    // iPhone viewport via Chromium — WebKit needs OS libs unavailable in CI sandboxes.
    {
      name: "mobile-iphone",
      use: { ...devices["iPhone 12"], browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node apps/api/dist/main.js",
      url: "http://localhost:4000/health",
      env: { API_PORT: "4000" },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @probook/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
