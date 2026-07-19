import "./env.js";

const isLocalish = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required for the worker to call authenticated API endpoints");
  }
  return secret;
}

function resolveApiBaseUrl(): string {
  const configured = process.env.API_BASE_URL;
  if (configured) return configured;
  if (isLocalish && process.env.WORKER_ALLOW_DEFAULT_API === "true") {
    const local = "http://localhost:4000";
    console.warn(`[worker] API_BASE_URL unset; defaulting to ${local} because WORKER_ALLOW_DEFAULT_API=true`);
    return local;
  }
  throw new Error("API_BASE_URL is required for the worker (or set WORKER_ALLOW_DEFAULT_API=true for local/test)");
}

export const workerConfig = {
  jwtSecret: requireJwtSecret(),
  apiBaseUrl: resolveApiBaseUrl(),
};
