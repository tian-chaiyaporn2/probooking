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

## Explicitly out of scope (PRD §7.2)

No microservices, dedicated search engine, real-time chat service, fraud engine, or
general-ledger platform in Phase 1.

## Quality targets (§7.4)

- Core pages p95 < 2.5s on normal mobile; search p95 < 2s at Phase 1 scale.
- Payment callbacks & money commands retry-safe and idempotent.
- Critical actions available during partial notification failure.
