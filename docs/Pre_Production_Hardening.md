# Pre-Production Hardening Checklist

Items that are **safe to defer while the app runs as a seeded, single-instance,
`AUTH_DEV_MODE` demo**, but that **must land before real users hit a real
(non-seeded, non-dev-mode) API** — even a soft pilot.

Surfaced by the comprehensive multi-area review (see [Backend API Code Health
Review](./Backend_API_Code_Health_Review.md) and PR #55). None is exploitable in
the current demo: OTP codes are echoed by design, there is one instance, the
store is in-memory, and no real phone numbers or money are involved. They become
live risks the moment a real deployment exists.

**Trigger to do these:** a deployment that (a) turns off `AUTH_DEV_MODE`, (b)
sends real SMS OTPs, (c) runs more than one API replica, or (d) handles real
money — whichever comes first.

---

## 1. OTP brute-force lockout (security — HIGH once live)

**Gap:** OTP verification is only rate-*shaped* (per-IP throttle + 30s per-phone
request interval), not *bounded*. An attacker rotating IPs gets an unbounded
stream of 5-guess windows against a fixed 6-digit code (~600 guesses/hr/phone),
which is a realistic long-horizon takeover of a specific number.
`apps/api/src/modules/auth/otp.service.ts`, `auth.controller.ts`.

**Acceptance:**
- A per-phone failed-verify counter that survives code re-issue (not reset every
  30s window).
- After N cumulative failures (e.g. 10) within a window, the phone is locked for
  a cooldown regardless of source IP.
- Lockout state is shared across replicas (see item 3) — a per-process counter
  is bypassable behind a load balancer.
- Does **not** regress the demo: under `AUTH_DEV_MODE` the echoed-code flow and
  the e2e/BDD suites must still pass.

## 2. JWT_SECRET strength floor (security — LOW, cheap)

**Gap:** `assertSigningSecretConfigured` only rejects a 4-value denylist; a
short/guessable secret (`JWT_SECRET=a`) boots and signs tokens.
`apps/api/src/modules/auth/token.util.ts`.

**Acceptance:**
- When a real secret is required (i.e. not the dev-mode bypass), enforce a
  minimum length/entropy (e.g. ≥ 32 chars) and fail boot otherwise.
- Must not break the demo (dev-mode bypass) or CI (its `JWT_SECRET` is already
  long). Verify the launchd demo's secret still boots.

## 3. Multi-replica revocation & OTP state (architecture — needs infra)

**Gap:** token revocation (`token-revocation.service.ts`) and OTP single-use +
interval (`otp.service.ts`) are **per-process**. Behind >1 replica, a
logged-out/revoked token is still honored by other instances, and a used/spammed
OTP is still verifiable elsewhere. Documented as a Phase-1 limitation pending
`REDIS_URL`.

**Acceptance:**
- Back revocation (`revokedJti`, `notBefore`) and OTP state with a shared store
  (Redis) when `REDIS_URL` is set; keep the in-process path for single-instance
  dev.
- A token revoked on replica A is rejected on replica B; an OTP consumed on A
  cannot be verified on B.
- This is the enabling dependency for item 1's cross-replica lockout.

## 4. `trust proxy` correctness (deployment — LOW)

**Gap:** `main.ts` sets `trust proxy` to `1` unconditionally, so all per-IP rate
limiting is trustworthy only if the deployment always has exactly one XFF-
appending proxy in front. Direct exposure (or a proxy that doesn't append XFF)
lets a client spoof `X-Forwarded-For` and become the throttle key.

**Acceptance:**
- Tie the hop count to the actual deployment (env-driven), or document the
  invariant as a hard deployment requirement with a boot-time note.

---

## Not blockers (demo-fidelity only — do if convenient)

Production uses the Prisma store, so these only affect the in-memory demo's
reporting accuracy (see the store-parity findings):

- `getMetrics` (memory) hardcodes `refunded: 0` / `reconciliationExceptions: 0`
  and derives `paidOut` from `compensation` rather than Payout events.
- `exportFinancials` (memory) never emits Refund events and reports full
  `compensation` for partially-paid bookings.
- List caps: `listActiveBookings` / `searchProfessionals` /
  `listProfessionalOffers` / `listClinicShifts` / `listPendingApprovals` apply a
  Prisma `take` with no in-memory counterpart (bounded vs unbounded).
