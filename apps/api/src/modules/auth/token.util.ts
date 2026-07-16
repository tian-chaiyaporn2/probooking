import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HS256 JWT — dependency-free (Phase 1). The session token carries the
 * subject and platform role; the guard verifies signature + expiry. JWT_SECRET from env.
 */
export interface TokenPayload {
  sub: string;
  role: string;
  exp: number; // unix seconds
}

const secret = (): string => process.env.JWT_SECRET ?? "dev-only";
const b64url = (input: Buffer | string): string => Buffer.from(input).toString("base64url");

export function signToken(payload: Omit<TokenPayload, "exp">, ttlSeconds = 3600): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(sig ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body ?? "", "base64url").toString()) as TokenPayload;
    return payload.exp >= Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}
