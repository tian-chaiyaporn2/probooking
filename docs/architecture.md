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
                          │  worker (BullMQ)     │  expiries, reminders,
                          │  Redis-backed queues │  auto-accept, reconciliation
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
  `idempotencyKey` unique constraint. Staff never edit balances (PAY-06).
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

The first end-to-end path is live: **create offer → accept (soft hold) → confirm**.
- API: `apps/api/src/modules/marketplace` — controlled endpoints composing
  `OffersService`, `BookingsService`, `PaymentsService`, behind a `MarketplaceRepository`
  port with two implementations selected at boot by `DATABASE_URL`:
  - `PrismaMarketplaceStore` — real Postgres via `@probook/db`. Ensures the identity
    graph (`ClinicWorkspace` + owner `User`/`Membership`, `ProfessionalProfile` + `User`),
    then persists `Shift`, `Offer`, and — in one transaction on confirm (BKG-02) —
    `Booking` + `PaymentOrder` (Payment Protected) + `FinancialAllocation` + a
    `Collection` `FinancialEvent`. `Booking`'s unique constraints enforce §6.4 and the
    event's idempotency key enforces PAY-04; the controller asserts PAY-07 conservation
    (captured == compensation + fee + tax) before writing.
  - `InMemoryMarketplaceStore` — zero-service fallback for dev/e2e.
- Web: `apps/web/src/app/flow` drives it and renders the checkout (12% fee).
- E2E: `e2e/` (Playwright) boots both servers and asserts the Confirmed booking.

Every rule in the flow (authority OFF-01, soft hold OFF-04, eligibility §6.3, fee
PAY-02) is enforced by `@probook/domain`, not by the controller.

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
