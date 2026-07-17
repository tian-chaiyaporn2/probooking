import { createHmac } from "node:crypto";

/**
 * The worker calls controlled API actions that move money (accept-completion) and open Ops
 * cases (flag-inactive). Those endpoints are authenticated, so the worker needs an identity
 * of its own — the `worker` platform role, distinct from any human role.
 *
 * It signs its own short-lived token with the JWT_SECRET it shares with the API rather than
 * holding a long-lived static bearer: a static secret in the worker's env would be a second
 * credential to leak and rotate, and could not expire.
 *
 * Must match apps/api/src/modules/auth/token.util.ts. Kept as a small local copy because the
 * worker does not depend on the API package; the format is a 3-part HS256 JWT.
 */
const TTL_SECONDS = 300;

const b64url = (input: string): string => Buffer.from(input).toString("base64url");

export function workerToken(): string | null {
  const secret = process.env.JWT_SECRET;
  // No secret configured: send no Authorization header. The API will reject the call with
  // 401 and the sweep logs it — far better than the worker silently believing it is
  // authenticated, or a fallback secret existing at all.
  if (!secret) return null;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: "worker",
      role: "worker",
      exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    }),
  );
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function workerAuthHeaders(): Record<string, string> {
  const token = workerToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
