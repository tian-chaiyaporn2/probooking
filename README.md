# ProBooking

Two-sided marketplace for **temporary clinic shifts** in Thailand. Clinics find,
compare, invite, and book verified professionals; professionals control availability,
accept clear terms, and receive traceable payout.

> **Verified. Available. Bookable. Payment Protected.**

Source of truth: [`docs/PRD_v1.5.md`](docs/PRD_v1.5.md) (product behavior) and
[`docs/Rollout_Plan_v1.1.md`](docs/Rollout_Plan_v1.1.md) (execution cadence & phases).
Current stage: **Phase 0 — Concierge Validation** (Bangkok + surrounding provinces).

## Monorepo layout

```
probook/
├─ apps/
│  ├─ web/       Next.js responsive marketplace (clinics + professionals)
│  ├─ api/       NestJS — controlled APIs (money, audit, state machines)
│  ├─ worker/    BullMQ — expiries, reminders, auto-accept, reconciliation
│  └─ ops/       internal low-code tools (Ops/Finance/Admin) — calls api only
├─ packages/
│  ├─ domain/    pure rules: money (satang), roles, states, policies, machines
│  └─ db/        Prisma schema + client + migrations (PostgreSQL)
├─ features/     BDD (.feature) — the 14 acceptance areas from PRD §9.4
└─ docs/         PRD, Rollout Plan, architecture, ADRs, traceability
```

Why this shape: PRD §7.2 asks for a responsive web app, a modular backend + relational
DB, background jobs, and low-code internal tools calling controlled APIs — and explicitly
**not** microservices, a search engine, real-time chat, a fraud engine, or a GL platform.
See [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md).

## Prerequisites

- Node ≥ 20.11 (`.nvmrc`), **pnpm** 9
- PostgreSQL 15+ and Redis 7+ (for the worker) — or use the mock providers in dev

## Getting started

```bash
nvm use
pnpm install
cp .env.example .env            # fill DATABASE_URL, REDIS_URL, provider keys

pnpm db:generate                # generate Prisma client
pnpm db:migrate                 # create the dev database schema
pnpm --filter @probook/domain test   # run domain unit tests (no services needed)

pnpm dev                        # run web + api + worker together
pnpm test:bdd                   # run the BDD acceptance suite
```

The domain package has **no I/O** and its tests run with zero external services — start
there. `web`, `api`, and `worker` boot without Postgres/Redis (integrations are mocked)
so the scaffold is runnable immediately; wire real services via `.env` as you go.

## Money, time, locale (non-negotiable)

- **Money is integer satang** (1 THB = 100 satang). Never floats. See `packages/domain/src/money.ts`.
- Times stored **UTC**, displayed **Asia/Bangkok** (LOC-02).
- Launch language **Thai** (LOC-01).
- Default clinic-paid service fee **12%** (`SERVICE_FEE_BPS=1200`).

## Where the rules live

| Concept | File |
|---|---|
| Money & 12% fee & conservation (PAY-*) | `packages/domain/src/money.ts` |
| Roles & dual-control (§3) | `packages/domain/src/roles.ts` |
| Record states (§6.2) | `packages/domain/src/states.ts` |
| Offer/cancel/auto-accept timers (§5.4/5.7) | `packages/domain/src/policies.ts` |
| Confirmation eligibility (§6.3) | `packages/domain/src/eligibility.ts` |
| State machines (§6.2) | `packages/domain/src/state-machines/` |
| Data model (§7.1) | `packages/db/prisma/schema.prisma` |
| Acceptance spec (§9.4) | `features/` |
| Requirement → code map | `docs/requirements-traceability.md` |
