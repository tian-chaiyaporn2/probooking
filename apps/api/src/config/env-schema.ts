/**
 * Boot-time environment validation (M10). A lightweight, dependency-free schema that catches
 * malformed config before the app starts — a mistyped THROTTLE_LIMIT or AUTH_DEV_MODE="True"
 * that would otherwise silently misbehave (or silently disable a security flag).
 *
 * This validates SHAPE (numbers parse, booleans are true/false, enums are known). The
 * strength/consistency checks that matter for security live where they act — JWT_SECRET
 * (token.util), FIELD_ENCRYPTION_KEY (field-crypto), CORS_ORIGINS and store selection
 * (main.ts / marketplace.module). Both run at boot, so nothing reaches a request malformed.
 */

/** Env vars read as booleans — the code treats anything but "true" as false, so a typo like
 * "True"/"1" silently disables a flag. Fail fast instead. */
const BOOLEAN_FLAGS = [
  "AUTH_DEV_MODE",
  "DEV_TOKEN_ROUTE",
  "ALLOW_IN_MEMORY_STORE",
  "ALLOW_DEV_AUTH_WITH_DATABASE",
  "ALLOW_MOCK_PAYMENTS",
  "SEED_ON_BOOT",
] as const;

/** Env vars parsed with Number() somewhere; a non-numeric value becomes NaN and misbehaves. */
const NUMERIC_VARS = [
  "API_PORT",
  "OTP_MIN_INTERVAL_MS",
  "SERVICE_FEE_BPS",
  "THROTTLE_LIMIT",
  "THROTTLE_AUTH_LIMIT",
] as const;

const NODE_ENVS = ["production", "development", "test"];

/** Throws with a consolidated message if any set env var is malformed. No-op when clean. */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const errors: string[] = [];

  for (const key of BOOLEAN_FLAGS) {
    const v = env[key];
    if (v !== undefined && v !== "" && v !== "true" && v !== "false") {
      errors.push(`${key} must be "true" or "false" (got ${JSON.stringify(v)})`);
    }
  }

  for (const key of NUMERIC_VARS) {
    const v = env[key];
    if (v !== undefined && v !== "") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`${key} must be a non-negative number (got ${JSON.stringify(v)})`);
      }
    }
  }

  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== undefined && nodeEnv !== "" && !NODE_ENVS.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of ${NODE_ENVS.join("|")} (got ${JSON.stringify(nodeEnv)})`);
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join("\n  - ")}`);
  }
}
