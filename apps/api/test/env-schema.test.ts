import { describe, it, expect } from "vitest";
import { validateEnv } from "../src/config/env-schema.js";

describe("validateEnv (M10)", () => {
  it("accepts a clean demo/CI-style config", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "test",
        AUTH_DEV_MODE: "true",
        DEV_TOKEN_ROUTE: "true",
        SEED_ON_BOOT: "true",
        API_PORT: "4000",
        THROTTLE_LIMIT: "100000",
        SERVICE_FEE_BPS: "1200",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("accepts an empty environment (all optional)", () => {
    expect(() => validateEnv({} as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("rejects a mistyped boolean flag (silent-disable foot-gun)", () => {
    expect(() => validateEnv({ AUTH_DEV_MODE: "True" } as NodeJS.ProcessEnv)).toThrow(/AUTH_DEV_MODE/);
    expect(() => validateEnv({ DEV_TOKEN_ROUTE: "1" } as NodeJS.ProcessEnv)).toThrow(/DEV_TOKEN_ROUTE/);
  });

  it("rejects a non-numeric numeric var", () => {
    expect(() => validateEnv({ THROTTLE_LIMIT: "lots" } as NodeJS.ProcessEnv)).toThrow(/THROTTLE_LIMIT/);
    expect(() => validateEnv({ API_PORT: "-1" } as NodeJS.ProcessEnv)).toThrow(/API_PORT/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => validateEnv({ NODE_ENV: "prod" } as NodeJS.ProcessEnv)).toThrow(/NODE_ENV/);
  });

  it("collects multiple errors into one message", () => {
    try {
      validateEnv({ AUTH_DEV_MODE: "yes", API_PORT: "x" } as NodeJS.ProcessEnv);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toMatch(/AUTH_DEV_MODE/);
      expect((e as Error).message).toMatch(/API_PORT/);
    }
  });
});
