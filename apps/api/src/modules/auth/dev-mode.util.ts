/**
 * Demo/dev mode (`AUTH_DEV_MODE=true`): the `devCode` field on `POST /auth/otp/request`
 * is returned so local dev, the e2e suite, and a seeded demo can complete a login without a
 * real SMS partner. This lets a caller sign in as any phone that exists, so it is only safe
 * against a seeded, in-memory demo dataset — never a real user database.
 *
 * Fail closed on three independent conditions:
 *  - opt-in is explicit (`AUTH_DEV_MODE=true`), so an unset env is safe by default;
 *  - `NODE_ENV=production` disables it regardless of the flag, so a leaked/copied env
 *    file cannot re-open the bypass on a production host; and
 *  - a real `DATABASE_URL` refuses to boot unless `ALLOW_DEV_AUTH_WITH_DATABASE=true`
 *    (CI/postgres test legs only — never a tunneled or shared host).
 */
export function devAuthEnabled(): boolean {
  return process.env.AUTH_DEV_MODE === "true" && process.env.NODE_ENV !== "production";
}

/**
 * AUTH_DEV_MODE + DATABASE_URL is an account-takeover footgun: OTP codes are echoed while
 * the identity graph is real. Refuse that combination unless an explicit test-only override
 * is set (the CI postgres matrix and local Prisma integration tests).
 */
export function assertDevAuthStoreSafe(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const enabled =
    env.AUTH_DEV_MODE === "true" && env.NODE_ENV !== "production";
  if (!enabled) return;
  if (!env.DATABASE_URL) return;
  if (env.ALLOW_DEV_AUTH_WITH_DATABASE === "true") return;
  throw new Error(
    "AUTH_DEV_MODE=true cannot be used with DATABASE_URL (OTP codes would unlock real " +
      "rows). Unset DATABASE_URL for the in-memory demo, or set " +
      "ALLOW_DEV_AUTH_WITH_DATABASE=true only for isolated CI/test databases.",
  );
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
