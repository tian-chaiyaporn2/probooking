import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { devAuthEnabled } from "./dev-mode.util.js";

/**
 * Minimal HS256 JWT — dependency-free (Phase 1). The session token carries the
 * subject and platform role; the guard verifies signature + expiry. JWT_SECRET from env.
 */
export interface TokenPayload {
  sub: string;
  role: string;
  exp: number; // unix seconds
  iat: number; // issued-at (unix seconds) — lets us revoke everything issued before a cutoff
  jti: string; // unique token id — lets a single token be revoked (logout)
}

/**
 * A hardcoded default secret is a published constant: anyone reading the source can mint
 * an administrator token. There is no fallback here, and the check is NOT keyed on
 * `NODE_ENV === "production"` — a staging/demo host with the var simply unset is exactly
 * the case that guard misses.
 *
 * Under the explicit dev opt-in we derive an ephemeral per-process secret instead of a
 * constant, so zero-config local dev still works while nothing guessable is ever signed
 * with. Tokens do not survive an API restart in dev; that is the intended trade.
 */
const WEAK_SECRETS = new Set(["dev-only", "change-me-in-dev-only", "changeme", "secret"]);
let ephemeralSecret: string | null = null;

const secret = (): string => {
  const configured = process.env.JWT_SECRET;
  if (configured && !WEAK_SECRETS.has(configured)) return configured;
  if (devAuthEnabled()) {
    ephemeralSecret ??= randomBytes(32).toString("hex");
    return ephemeralSecret;
  }
  throw new Error(
    "JWT_SECRET must be set to a strong, non-default value (or set AUTH_DEV_MODE=true for local dev)",
  );
};
const b64url = (input: Buffer | string): string => Buffer.from(input).toString("base64url");

/** Boot-time check: surface a missing/weak secret as a refusal to start, not a 500 later. */
export function assertSigningSecretConfigured(): void {
  secret();
}

export function signToken(payload: Omit<TokenPayload, "exp" | "iat" | "jti">, ttlSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const full: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
    jti: randomBytes(16).toString("hex"),
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(full));
  const sig = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  // Reject tokens that claim a different algorithm before verifying the HMAC — otherwise a
  // crafted `alg: none` / RS256 header would still be accepted as long as the signature
  // bytes happened to match an HS256 of the same body (or an empty sig path).
  try {
    const hdr = JSON.parse(Buffer.from(header ?? "", "base64url").toString()) as {
      alg?: string;
      typ?: string;
    };
    if (hdr.alg !== "HS256") return null;
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(sig ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body ?? "", "base64url").toString()) as Partial<TokenPayload>;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      typeof payload.jti !== "string"
    ) {
      return null;
    }
    return payload.exp >= Math.floor(Date.now() / 1000) ? (payload as TokenPayload) : null;
  } catch {
    return null;
  }
}
