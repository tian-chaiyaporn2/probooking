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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node apps/api/dist/main.js",
      url: "http://localhost:4000/health",
      // Pin the API's environment rather than inheriting whatever the developer's .env
      // happens to hold: a stale CORS_ORIGINS silently blocks every browser call, and an
      // unset DATABASE_URL silently swaps the store implementation under the suite.
      env: {
        API_PORT: "4000",
        NODE_ENV: "test",
        AUTH_DEV_MODE: "true",
        CORS_ORIGINS: "http://localhost:3000",
        // Two distinct finance identities: §6.4 dual control needs a real second person,
        // and /auth/dev/token mints only one identity per role (sub = "dev:finance").
        // Exercises the real OTP + access-list login rather than the dev shortcut.
        // Distinct staff phones so tests never collide on the per-phone OTP interval (which
        // stays at its real value): 001/002 finance + 003 admin (dual-control), 004 finance
        // + 009 operations (responsiveness), 005 finance (finance dashboard), 008 operations
        // (ops dashboard).
        STAFF_PHONES:
          "+66900000001:finance,+66900000002:finance,+66900000003:administrator," +
          "+66900000004:finance,+66900000005:finance,+66900000008:operations,+66900000009:operations",
        // The suite drives hundreds of calls from one IP, which is not what the rate limit
        // is defending against. Raised, not disabled: the guard stays wired so a broken
        // throttle config still fails here rather than in production.
        THROTTLE_LIMIT: "100000",
        THROTTLE_AUTH_LIMIT: "100000",
      },
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
