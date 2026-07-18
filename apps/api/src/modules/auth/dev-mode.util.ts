/**
 * Demo/dev mode (`AUTH_DEV_MODE=true`): the `devCode` field on `POST /auth/otp/request`
 * is returned so local dev, the e2e suite, and a seeded demo can complete a login without a
 * real SMS partner. This lets a caller sign in as any phone that exists, so it is only safe
 * against a seeded, in-memory demo dataset — never a real user database.
 *
 * Fail closed on two independent conditions:
 *  - opt-in is explicit (`AUTH_DEV_MODE=true`), so an unset env is safe by default; and
 *  - `NODE_ENV=production` disables it regardless of the flag, so a leaked/copied env
 *    file cannot re-open the bypass on a production host.
 */
export function devAuthEnabled(): boolean {
  return process.env.AUTH_DEV_MODE === "true" && process.env.NODE_ENV !== "production";
}

/**
 * The `/auth/dev/token` route mints an operations/finance/administrator token to ANY
 * unauthenticated caller — a far bigger hole than the OTP `devCode` echo, since it needs no
 * knowledge of a phone at all. It is decoupled from demo mode behind its own explicit flag
 * so a seeded demo (which needs `devCode` for effortless sign-in) can be exposed over a
 * tunnel WITHOUT also handing every visitor an admin token. Used by the e2e suite only.
 */
export function devTokenRouteEnabled(): boolean {
  return devAuthEnabled() && process.env.DEV_TOKEN_ROUTE === "true";
}
