import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The integration tests hit a real Postgres and share one database, so they must not
    // race each other; they are also slower than a unit test.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
