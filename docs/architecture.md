# Architecture

Derived from PRD §7 (data, architecture, security, quality). Phase 1 target.

## Shape

A single responsive **web app** talks to a modular **API**; time-driven work runs in a
**worker**; internal staff use **low-code tools** that call the same controlled API.
A pure **domain** package holds all business rules and is depended on by everything.

```
          ┌────────────┐        ┌────────────┐
          │  web (Next)│        │ ops (low-  │
          │ clinics +  │        │ code tools)│
          │ pros       │        └─────┬──────┘
          └─────┬──────┘              │  controlled API calls only (ADM-02, PAY-06)
                │ HTTP                │
                ▼                     ▼
             ┌──────────────────────────────┐
             │        api (NestJS)           │  authority checks, state machines,
             │  modules per bounded context  │  idempotent money commands, audit
             └───────┬───────────────┬───────┘
                     │               │
        ┌────────────▼───┐     ┌─────▼─────────────┐
        │ packages/domain│     │  packages/db      │
        │ pure rules     │     │  Prisma/Postgres  │
        └────────────────┘     └─────▲─────────────┘
                                     │
                          ┌──────────┴──────────┐
                          │  worker (polling)    │  expiries, reminders,
                          │  no Redis required   │  auto-accept, reconciliation
                          └──────────┬───────────┘
                                     │
        integrations (ports): payment partner · SMS · email · verification · doc storage
```

## Key decisions

- **Domain is pure and framework-free.** Money, states, policies, and eligibility are
  plain TypeScript with unit tests that need no services. This keeps the hard rules
  (financial conservation, one-booking-per-shift, offer timers) fast to test and reused
  identically by api and worker.
- **Money commands are idempotent and amount-limited** (PAY-04/08). Every collection,
  refund, payout, reversal, adjustment is an immutable `FinancialEvent` with an
  `idempotencyKey` unique constraint, and the PAY-08 cap (`withinAllocation`) is asserted on
  every payout/refund path. Staff never edit balances (PAY-06): a payment exception is a
  proposal one authorized person raises and a **different** one executes (§6.4), which then
  appends an event through the same conservation checks as any other money movement.
  `FinancialEvent`, `AuditRecord` and `AttendanceEvent` are append-only **at the database**
  (rejecting triggers), so history cannot be rewritten by any code path — a mistaken entry is
  corrected by appending a compensating record.
- **Authority is derived, never declared.** A session token proves possession of a phone
  (OTP); what that phone may do is resolved from the identity graph — professional profile,
  or clinic membership and its role (§3). Endpoints take no `actorRole`/party id from the
  request body, so `can(role, capability)` is not a question the caller answers about itself.
- **Facts that decide money are the platform's.** Whether funds were captured comes from the
  provider port, not a request field; the cancellation actor comes from the caller, the
  timing from the scheduled shift, and arrival from the attendance trail.
- **Confirmation is atomic** (BKG-02): eligibility + prefunding + booking insert run in
  one transaction; a unique constraint on `Booking.shiftId` guarantees one shift → one
  booking even under concurrent acceptance.
- **Customer status is derived** (§6.2): labels like "Awaiting Payment"/"Filled" are
  computed from owning records; holds and cases are overlays that never overwrite base
  state.
- **Integrations are ports** so "Payment Protected" is a mock in dev and a regulated
  partner in prod without touching domain logic.
- **Shared packages are built artifacts, API is ESM built by `tsc`.** `@probook/domain`
  and `@probook/db` compile to `dist` and are consumed via node resolution (no source
  `paths` alias). The API is ESM compiled by `tsc`, which emits the decorator metadata
  Nest DI needs (unlike `tsx`/esbuild). See **ADR 0002**.

## Vertical slice (Phase 0)

The first end-to-end path is live: **register → verify → post open shift → apply /
invite → send one binding offer → accept (soft hold) → confirm → complete → pay out →
review**. A clinic posts an open shift (`POST /shifts`); professionals apply
(`/apply`) or are invited (`/invite`) — both non-binding (APP-01); the clinic sends the
single binding offer to a candidate (`/offer`, OFF-01/02). Clinics and professionals register
(ORG-01/PRO-01) into `Submitted`, Operations verifies them to `Verified` (VER-01/02,
`advanceVerification`), an unverified clinic can't post a shift (AUTH-04), and confirm
gates on both parties being verified (§6.3) — the demo identity fixtures are gone.
- API: `apps/api/src/modules/marketplace` — controlled endpoints composing
  `OffersService`, `BookingsService`, `PaymentsService`, behind a `MarketplaceRepository`
  port with two implementations selected at boot by `DATABASE_URL`:
  - `PrismaMarketplaceStore` — real Postgres via `@probook/db`. Ensures the identity
    graph (`ClinicWorkspace` + owner `User`/`Membership`, `ProfessionalProfile` + `User`),
    then persists `Shift`, `Offer`, and — in one transaction on confirm (BKG-02) —
    `Booking` + `PaymentOrder` (Payment Protected) + `FinancialAllocation` + a
    `Collection` `FinancialEvent`. `Booking`'s unique constraints enforce §6.4 and the
    event's idempotency key enforces PAY-04; the controller asserts PAY-07 conservation
    (captured == compensation + fee + tax) before writing. Completion (`markCompletion`
    → `recordPayout`) then moves the booking to `ServiceCompleted`, sets the allocation
    `payoutState=Paid`, and writes a `Payout` `FinancialEvent` in a transaction —
    re-asserting PAY-07 (captured == payout + fee + tax) as protected funds release.
  - `InMemoryMarketplaceStore` — zero-service fallback for dev/e2e.
- Web: `apps/web/src/app/flow` drives it and renders the checkout (12% fee).
- E2E: `e2e/` (Playwright) boots both servers and asserts the Confirmed booking.

Every rule in the flow (authority OFF-01, soft hold OFF-04, eligibility §6.3, fee
PAY-02) is enforced by `@probook/domain`, not by the controller.

**Credential holds (VER-04/06).** A required licence that lapses after confirmation
must freeze the booking for Operations. Operations suspends the credential
(`/ops/professionals/:id/suspend-credential`) and places a **Hold** on the affected
booking (`/bookings/:id/hold-credential`) — an overlay (`Booking.heldAt`, base state
unchanged, §6.2) — which opens a case and notifies both parties. A held booking can't
be paid out (`accept-completion` 400) and is skipped by the auto-accept sweep, until
Operations clears it (`/resolve-hold`). Hold placement is Operations-driven in Phase 1;
proactively *rechecking* credentials on a schedule is deferred to Phase 2 (§2.4).

**Notifications (NOT-01).** A `NotificationsService` wraps mock email/SMS ports
(§7.2) and records each send to a `Notification` row for audit. The controller emits
on critical events (offer sent, payment required, confirmation, payout, cancellation);
sends are best-effort so a notification failure never fails the action (§7.4). Time-
driven reminders (24h/3h before shift start) are a worker sweep, deduped via the
`Notification` table. In prod the mock ports become the real email/SMS partner without
touching the call sites.

**Reviews (REV-01..05).** After a booking is `ServiceCompleted`, either party may
review the other (`POST /bookings/:id/reviews`), one per party (REV-02). Reviews
publish when both parties submit, or after 7 days via a worker sweep (REV-03). A
professional's aggregate rating (`GET /professionals/:id/rating`) appears only after
three published reviews (REV-04); cancelled/unfinished bookings never reach
`ServiceCompleted`, so they earn no reputation (REV-05).

**Auto-accept (CMP-03).** When a professional submits completion, `markCompletion`
stamps `Booking.autoAcceptAt` = `autoAcceptDueAt(shiftEnd, now)` (24h after the later
of shift end and submission). `apps/worker` polls for bookings past that deadline still
in `AwaitingCompletion` and triggers the API's controlled `accept-completion` — so the
worker schedules, the API owns the money action (no duplicated payout logic). A polling
sweep keeps it Redis-free; it can become a durable repeatable job at scale (e.g. BullMQ)
without changing the job. Time comparisons use UTC on both sides (Prisma reads/writes
UTC), and all timestamp columns are `timestamptz` (`@db.Timestamptz(3)`) so external
writers can't introduce a tz skew. The migration that converted them interprets the
pre-existing naive values `AT TIME ZONE 'UTC'` (Prisma had stored UTC), preserving each
instant — the default `SET DATA TYPE TIMESTAMPTZ` cast would have shifted them by the
server's offset.

**Env-load ordering:** `@probook/db` constructs its `PrismaClient` (reading
`DATABASE_URL`) at import time, and ESM hoists imports — so `apps/api/src/main.ts`
imports `./env.js` (dotenv) *first*, and the Prisma store is loaded via dynamic
`import()` only when `DATABASE_URL` is present.

## Explicitly out of scope (PRD §7.2)

No microservices, dedicated search engine, real-time chat service, fraud engine, or
general-ledger platform in Phase 1.

## Quality targets (§7.4)

- Core pages p95 < 2.5s on normal mobile; search p95 < 2s at Phase 1 scale.
- Payment callbacks & money commands retry-safe and idempotent.
- Critical actions available during partial notification failure.
