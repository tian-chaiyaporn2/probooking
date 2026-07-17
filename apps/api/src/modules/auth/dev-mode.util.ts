/**
 * Dev-auth escape hatches (the `/auth/dev/token` route and the `devCode` field on
 * `POST /auth/otp/request`) exist so local dev and the e2e suite can obtain a session
 * without a real SMS partner. They are a total authentication bypass and must never be
 * reachable in production.
 *
 * Fail closed on two independent conditions:
 *  - opt-in is explicit (`AUTH_DEV_MODE=true`), so an unset env is safe by default; and
 *  - `NODE_ENV=production` disables them regardless of the flag, so a leaked/copied env
 *    file cannot re-open the bypass on a production host.
 */
export function devAuthEnabled(): boolean {
  return process.env.AUTH_DEV_MODE === "true" && process.env.NODE_ENV !== "production";
}
