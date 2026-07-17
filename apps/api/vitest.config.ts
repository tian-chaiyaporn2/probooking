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
  },
});
