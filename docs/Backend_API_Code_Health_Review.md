# ProBooking — Backend API Code Health Review

**Reviewer stance:** Independent backend / maintainability review  
**Product stage:** Phase 0 — Concierge Validation  
**Surface reviewed:** `apps/api` (NestJS), with related ports in `packages/domain` and `packages/db`  
**Sources:** API modules, stores, auth, payments, tests; `docs/architecture.md`, PRD §7  
**Date:** 2026-07-18

---

## 1. Executive summary

The API is a **strong Phase 0 controlled surface**: fail-closed auth, derived authority, integer money, domain state machines, and Postgres-backed atomic claims for the hardest booking races. Comments and ADRs show deliberate learning from prior bugs.

The main maintainability risk is structural. Almost all orchestration lives in one **~1,550-line controller** and a **~65-method repository**, with thin Nest modules (`offers` / `bookings` / `payments`) that do not own their HTTP or persistence. Correctness work is concentrated in the Prisma store; the memory store and BDD path can diverge, so green tests do not always prove production behaviour.

**Overall readiness**

| Concern | Readiness | Verdict |
|---|---|---|
| Phase 0 demo / concierge API | High | Booking flow, ops, finance endpoints work with clear invariants |
| Module boundaries vs architecture doc | Low | “Modules per bounded context” is aspirational; marketplace is a monolith |
| Money path correctness under concurrent finance | Medium–Low | Dual-control refunds vs payouts can over-allocate; detection exists, prevention incomplete |
| Auth durability (multi-instance / logout) | Medium | Sound design, process-local state; documented Phase-1 limit |
| Production payment / SMS partners | N/A (Phase 0) | Intentionally mocked; wiring is not production-ready |
| Testability of controller orchestration | Low–Medium | Good unit/int pockets; little direct coverage of the controller |

---

## 2. Review method

Evaluated against:

1. **Architecture promises** (`docs/architecture.md`): pure domain, ports for integrations, modules per bounded context, atomic confirmation, derived authority, idempotent money  
2. **Maintainability:** size, duplication, boundaries, type safety, error consistency, comment vs code drift  
3. **Correctness under concurrency:** TOCTOU, conditional writes, money conservation  
4. **Phase fit:** Distinguish intentional Phase 0 stubs from defects that already hurt quality now  

---

## 3. What’s working well

### 3.1 Security posture at the edge

- Global `AuthGuard` + `ThrottleGuard` with `@Public()` / `@NoThrottle()` opt-out (`app.module.ts`) — fail closed by default.
- Bootstrap refuses weak/missing `JWT_SECRET`, missing field encryption key, and missing `CORS_ORIGINS` outside demo mode (`main.ts`).
- Helmet, explicit 100kb body limits, `trust proxy`, shutdown hooks.
- OTP: crypto-random codes, timing-safe compare, attempt burning, masked logs, per-phone throttle (`otp.service.ts`).
- JWT: HMAC, algorithm check, random JTIs, timing-safe signature compare (`token.util.ts`).

### 3.2 Authority model

- Tokens prove phone possession; party authority is resolved from the identity graph (`resolveIdentity`), not from request-body roles/party IDs.
- `requireClinicAuthority` correctly denies Finance the old “any staff” clinic-capability bypass for binding clinic actions.
- Domain `can(role, capability)` in `@probook/domain` is the single permission matrix.

### 3.3 Money & persistence discipline (Prisma path)

- Integer satang; conservation / allocation helpers in domain + `PaymentsService`.
- Immutable `FinancialEvent` with idempotency keys; append-only DB triggers (per architecture).
- Conditional claims for confirm / payout / cancel / approval execution reduce several classic races.
- Reconciliation query detects orders where payout+refund exceed captured (`marketplace.prisma-store.ts`).

### 3.4 Domain purity

- State machines, cancellation fractions, eligibility, and money math live in `packages/domain` with dedicated unit tests — the right place for hard rules.

### 3.5 Operational honesty in comments

- Many comments document prior bugs and why a write is conditional. That history is valuable for maintainers — though some of it should graduate into tests (see §5).

---

## 4. Findings

Severity reflects **code quality / maintainability impact now**, including correctness debt that will be expensive to unwind later. Phase 0 stubs are called out separately.

### 4.1 Critical — correctness that undermines stated money invariants

#### C1. Payout and finance refund paths do not share a single remaining-funds invariant

`refundAvailable` / `executeApproval` subtract prior **Refund** events from `captured`, but not prior **Payout** events. `accept-completion` conservation assumes `refunds: 0` and pays full compensation.

```858:869:apps/api/src/modules/marketplace/marketplace.prisma-store.ts
  async refundAvailable(bookingId: string): Promise<number> {
    // ...
    return Math.max(0, po.captured - refunded - (pending._sum.amount ?? 0));
  }
```

```1040:1051:apps/api/src/modules/marketplace/marketplace.controller.ts
    this.payments.assertConserved({
      captured: satang(booking.captured),
      protectedRemainder: satang(0),
      payout: satang(booking.compensation),
      // ...
      refunds: satang(0),
```

**Impact:** A dual-control refund before completion, or a refund after payout, can leave ledger totals that violate PAY-08 until reconciliation flags them. Reconciliation detects; it does not prevent.

**Maintainability:** Callers each reinvent “remaining headroom.” Prefer one helper: `remaining = captured − Σ(Payout) − Σ(Refund) − Σ(Pending approval)`, used by payout, cancel, and executeApproval inside the same locked transaction.

#### C2. Concurrent dual-control executions are not serialized on the payment order

`executeApproval` claims the approval row, then reads events and inserts a refund without locking the `PaymentOrder` / serializing aggregate checks across different approval IDs for the same booking.

**Impact:** Two Pending approvals for one booking can both pass the headroom check under READ COMMITTED.

**Maintainability:** Documented intent (“two approvers racing produce one execution”) only covers the same request id — not two proposals against one captured sum.

#### C3. Blanket `isStaff` bypass grants Finance/Ops party powers outside their capability sets

```1459:1487:apps/api/src/modules/marketplace/marketplace.controller.ts
  private isStaff(user?: TokenPayload): boolean {
    return user?.role === "operations" || user?.role === "finance" || user?.role === "administrator";
  }
  // ...
  private async requireProfessional(...) {
    if (this.isStaff(user)) return;
```

`partyInBooking` returns `"staff"` for all three roles, and cancel then lets staff choose the represented actor. Domain roles do **not** give Finance `pro.accept_offer`, messaging, arrival, or cancel-as-party.

**Impact:** Role matrix in `packages/domain/src/roles.ts` is not the real authorization policy for many endpoints — helpers are. That dual source of truth is a maintainability and audit hazard.

#### C4. Arrival is self-attested with immediate full-compensation effect

`recordArrival` has no shift-window or independent evidence gate. Domain cancellation pays 100% once `arrived` is true.

**Impact:** For Phase 0 concierge this may be acceptable with ops oversight; as a platform rule it is fragile. Treat as product+API debt: either constrain when arrival may be recorded, or require ops confirmation for early arrival claims.

---

### 4.2 High — structure, divergence, and production foot-guns

#### H1. Marketplace controller + repository are a god object

| Artifact | Approx. size | Owns |
|---|---:|---|
| `marketplace.controller.ts` | 1,554 lines | HTTP + authz + orchestration for ~all contexts |
| `marketplace.types.ts` repository | ~65 methods | Onboarding → reviews → finance → messages |
| `marketplace.prisma-store.ts` | 1,576 lines | All persistence |
| `marketplace.memory-store.ts` | 1,129 lines | Parallel implementation |

`OffersService` / `BookingsService` / `PaymentsService` are thin domain wrappers (deadline math, one eligibility assert, three money helpers). They do not own controllers or stores.

**Recommendation:** Split by bounded context (onboarding/verification, shifts/offers, bookings/completion, finance, messaging/reviews) with application services above a narrower repository per aggregate. Keep the HTTP layer thin.

#### H2. Memory store is not a faithful stand-in for Prisma

Examples:

- Cancellation overwrites more freely than Prisma’s conditional claim.
- Metrics hard-code refunds/exceptions to zero; finance export synthesizes events.
- Notifications discarded; insurance verification bypasses the domain machine in places.
- Review publish timing differs (worker/Prisma-only).

BDD (`features/support/store.ts`) drives the memory path; Prisma integration tests are narrow and skipped without `DATABASE_URL`.

**Impact:** False confidence — domain rules may pass while production store behaviour diverges.

#### H3. Missing `DATABASE_URL` silently selects ephemeral persistence

```16:28:apps/api/src/modules/marketplace/marketplace.module.ts
    if (process.env.DATABASE_URL) {
      // Prisma...
    }
    // else InMemoryMarketplaceStore
```

A misconfigured non-prod (or worse, prod) host boots “healthy” against disposable state and may auto-seed.

**Recommendation:** Fail closed unless `ALLOW_IN_MEMORY_STORE=true` (or equivalent) is explicit. Same class of defence as `CORS_ORIGINS` / `JWT_SECRET`.

#### H4. Eligibility / overlap checks are outside the confirm transaction (TOCTOU)

Controller reads eligibility and overlap, captures funds, then `confirmBooking` claims offer state — without re-checking credentials, insurance, clinic status, or overlap inside the transaction.

**Impact:** Suspended credentials or overlapping soft holds can race into confirmed bookings. Unique shift booking helps one case; not all.

#### H5. Payment provider is mock-only and results are under-integrated

- `PaymentsModule` always provides `MockPaymentProvider`.
- Capture `providerRef` is discarded; payouts/refunds update the ledger without calling the provider.
- Capture-then-persist is crash-window unsafe for a real provider.

Acceptable for Phase 0 **if** called out as non-production. For maintainability, inject a `PaymentProvider` port (token), persist provider refs, and keep unwind/refund on the same port.

#### H6. Process-local auth controls (logout, OTP, throttle, staff suspend)

Documented Phase-1 limits (`REDIS_URL` reserved). Logout and staff suspension do not survive restart or multi-replica. JWT “strength” check rejects only a few known bad strings.

**Maintainability:** Callers may assume logout is durable. Prefer explicit “session revocation is best-effort until Redis” in API docs / ops runbooks, or persist revocations.

#### H7. Encryption “idempotence” trusts an untrusted prefix

`encryptField` returns input unchanged if it starts with `enc:v1:`. Attacker-controlled message bodies / licence fields can store garbage that later breaks `decryptField` on list.

**Recommendation:** Never treat client input as already encrypted; only skip re-encrypt on trusted DB reads during migration.

---

### 4.3 Medium — consistency, types, and operational quality

| ID | Finding |
|---|---|
| M1 | Error mapping inconsistent: domain/store `Error` often becomes 500; conflict messages don’t always match controller string matching (`"exceeds remaining"` vs `"refundable"`). |
| M2 | `validateBody` generic `T` is unchecked; optional nulls and empty arrays can pass; integers not bounded to PG `Int`. |
| M3 | Domain branded types (`Satang`, states) frequently erased to `number` / `string` at the repository boundary. |
| M4 | Credential cardinality: multiple licence rows; verify updates all, eligibility uses “first”. |
| M5 | Multi-step hold/case/audit sequences are non-atomic; audit often after commit. |
| M6 | Several list endpoints unbounded (messages, availability, finance export, party history). |
| M7 | Phone validation is trim/length only; `blindIndex` hashes raw input — formatting variants create duplicate identities. |
| M8 | Auth before throttle globally — unauthenticated floods of protected routes aren’t IP-throttled the same way. |
| M9 | Health is liveness-only (`ok`); no DB/provider readiness. |
| M10 | Config is scattered `process.env` reads without a schema (zod/envalid). |
| M11 | Comments sometimes overstate atomicity (“eligibility + prefunding in one transaction”) vs actual capture-outside-tx flow. |
| M12 | `sumRefunded` is on the port but unused by payout/refund headroom logic that needed it. |

---

### 4.4 Low

- Redundant `@UseGuards(AuthGuard)` on methods already covered by the global guard.
- Optional `CurrentUser` + `"unknown"` audit actor hides wiring mistakes.
- `maskPhone` assumes a 2-digit country prefix.
- Package “lint” is Prettier-only; tests excluded from `tsconfig`.
- Unused `isProd` in `main.ts`.

---

### 4.5 Phase 0 stubs (expected, not defects — track for Phase 1)

| Stub | Location | Note |
|---|---|---|
| Mock payment provider | `payment.provider.ts` | Always succeeds; no webhooks |
| OTP not delivered via SMS | `otp.service.ts` | Code returned only in `AUTH_DEV_MODE` |
| Notifications log/record only | `notifications.service.ts` | Party IDs named like email/sms channels |
| In-memory dual mode | `marketplace.module.ts` | Valid for zero-service demo |

Do not treat these as “bugs” for Phase 0 demos; do treat missing ports/DI as maintainability work before real partners.

---

## 5. Test & quality-signal gaps

Present coverage (valuable):

- Auth guard, OTP, throttle, token revocation, field crypto unit tests  
- Prisma store integration: confirm atomicity, uniqueness, idempotency (when `DATABASE_URL` set)  
- Domain package unit tests; BDD over memory store; Playwright e2e with demo auth  

Gaps that hurt maintainability:

1. **No controller-level tests** for authorization helpers (`isStaff` / `partyInBooking` / cancel actor derivation).  
2. **No tests that finance refund + completion payout cannot both fully consume `captured`.**  
3. **Memory vs Prisma behavioural parity suite** is absent — the highest-leverage maintainability investment.  
4. Vitest has **no coverage thresholds**; `lint` does not typecheck or run ESLint.  
5. Guard tests stub revocation / staff directory — the durable-state weak points.

---

## 6. Recommended priority order

### P0 — fix before trusting money paths beyond concierge

1. Unify remaining-funds calculation (include payouts + refunds + pending approvals); use it in `executeApproval`, `recordPayout`, and cancellation.  
2. Serialize money mutations per payment order (row lock / advisory lock / single serializable critical section).  
3. Replace blanket `isStaff` with capability- or role-specific helpers aligned to `roles.ts`.  
4. Fail closed on missing `DATABASE_URL` unless an explicit in-memory opt-in flag is set.

### P1 — structural debt (largest maintainability win)

5. Extract application services + split repository by aggregate; shrink `MarketplaceController` to HTTP + DTO validation.  
6. Make memory store either a thin facade over shared in-process use-cases, or delete it from CI confidence paths and run BDD against Prisma.  
7. Inject `PaymentProvider` as a port; persist `providerRef`; keep mock as the only Phase 0 implementation.  
8. Stop trusting client `enc:v1:` prefixes; normalize phones before blind index.

### P2 — hardening

9. Shared env schema; readiness health; persist or document revocation limits.  
10. Typed validation (zod) replacing `validateBody`.  
11. Controller + money-path integration tests; coverage gates on `apps/api`.  
12. Bound list endpoints; tighten arrival policy when product allows.

---

## 7. Suggested target shape (incremental)

Keep Nest modules that match architecture, but move behaviour into them:

```
apps/api/src/modules/
  auth/           # keep — already coherent
  onboarding/     # register + verify (from marketplace)
  shifts/         # post/apply/invite/search
  offers/         # create/accept/decline/expire + OffersService grows real ownership
  bookings/       # confirm/complete/cancel/arrival + BookingsService
  payments/       # capture/payout/refund/approvals + PaymentProvider port
  messaging/      # MSG-*
  reviews/        # REV-*
  reporting/      # metrics, export, reconcile, audit list
```

Each module owns: controller (or nested router), application service, and a **narrow** repository interface. Shared `CallerIdentity` / auth helpers live in auth or a small `authorization` util — one place, tested.

---

## 8. Verdict

For **Phase 0 concierge validation**, the API is thoughtfully engineered and safer than a typical early marketplace prototype: domain purity, fail-closed auth, and Postgres claims for booking races are real strengths.

For **code quality and maintainability toward Phase 1**, the codebase is **not yet modular**. The marketplace monolith, memory/Prisma divergence, and incomplete money headroom sharing are the issues most likely to slow every subsequent feature. Address P0 money/authz foot-guns first, then split bounded contexts so new work does not land in a 1,500-line controller.
)
