import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests write through the real store, which now encrypts sensitive columns.
    // Provide a fixed key so they run without AUTH_DEV_MODE, mirroring a configured host.
    env: {
      FIELD_ENCRYPTION_KEY: "0".repeat(64),
    },
    // The integration tests hit a real Postgres and share one database, so they must not
    // race each other; they are also slower than a unit test.
    fileParallelism: false,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text"],
      // Gate only the pure-logic units that unit tests OWN — config, auth logic, and the
      // marketplace utilities. The controllers and the two stores are exercised end-to-end
      // by the e2e + BDD suites (separate processes vitest can't see), so gating them here
      // would measure the wrong thing. These files don't touch the DB, so the numbers are
      // identical on both CI legs. Thresholds sit just under current (91/81/91/91) as a
      // ratchet: new untested pure logic fails the build.
      include: [
        "src/config/**/*.ts",
        "src/modules/auth/otp.service.ts",
        "src/modules/auth/staff-directory.ts",
        "src/modules/auth/token-revocation.service.ts",
        "src/modules/auth/throttle.guard.ts",
        "src/modules/auth/auth.guard.ts",
        "src/modules/auth/token.util.ts",
        "src/modules/marketplace/money-ledger.util.ts",
        "src/modules/marketplace/http-validation.ts",
        "src/modules/marketplace/list-limits.ts",
        "src/modules/marketplace/field-crypto.ts",
        "src/modules/marketplace/privacy.util.ts",
        "src/modules/marketplace/errors.util.ts",
      ],
      thresholds: {
        statements: 88,
        branches: 76,
        functions: 88,
        lines: 88,
      },
    },
  },
});
