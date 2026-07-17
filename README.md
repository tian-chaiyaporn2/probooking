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
│  ├─ web/       Next.js marketplace + Ops/Finance dashboards (Thai UI, light/dark, responsive)
│  ├─ api/       NestJS — controlled APIs (money, audit, auth/roles, state machines)
│  ├─ worker/    polling sweeps — auto-accept, clinic-review, review-publish, reminders (§7.2)
│  └─ ops/       design note for internal tools (ADM-02); UI implemented in apps/web
├─ packages/
│  ├─ domain/    pure rules: money (satang), roles, states, policies, machines
│  └─ db/        Prisma schema + client + migrations (PostgreSQL)
├─ features/     BDD (.feature) — the 14 acceptance areas from PRD §9.4
├─ e2e/          Playwright end-to-end tests (browser drives the live flow)
└─ docs/         PRD, Rollout Plan, architecture, ADRs, traceability
```

The Phase 0 booking flow (create offer → accept → confirm) lives in
`apps/api/src/modules/marketplace` (API) and `apps/web/src/app/flow` (web), both
composing `@probook/domain`. An **Operations dashboard** (`apps/web/src/app/ops`)
verifies pending clinics/professionals and resolves credential holds via controlled
API actions (ADM-01/02).

Why this shape: PRD §7.2 asks for a responsive web app, a modular backend + relational
DB, background jobs, and low-code internal tools calling controlled APIs — and explicitly
**not** microservices, a search engine, real-time chat, a fraud engine, or a GL platform.
See [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md).

## Prerequisites

- Node ≥ 20.11 (`.nvmrc`), **pnpm** 9
- PostgreSQL 15+ (the Phase-1 worker uses a polling loop — no Redis required) — mock providers in dev

## Getting started

```bash
nvm use
pnpm install
cp .env.example .env            # fill DATABASE_URL, REDIS_URL, provider keys (optional in dev)

pnpm db:generate                # generate Prisma client
pnpm build                      # build shared packages (domain, db) + apps — see ADR 0002
```

Shared packages are consumed as **built artifacts** (not source), so build before
running apps — `pnpm build` (topo order) or `pnpm build:api` (domain → db → api).

### Run

```bash
pnpm build:api                             # domain → db → api
node apps/api/dist/main.js                 # API on :4000  (GET /health)
pnpm --filter @probook/web dev             # web on :3000  (/ and /flow)
pnpm --filter @probook/worker start        # background worker (auto-accept sweep, CMP-03)
```

The **worker** polls Postgres for bookings whose 24h auto-accept deadline has passed
(`autoAcceptAt`) and are still `AwaitingCompletion`, then calls the API's
`accept-completion` to finalize + pay out (CMP-03). It needs `DATABASE_URL` and a
running API. `pnpm --filter @probook/worker sweep:once` runs a single sweep and exits;
`AUTO_ACCEPT_SWEEP_MS` sets the interval.

**Persistence is dual-mode.** With no `DATABASE_URL`, the booking flow uses an
in-memory store, so the API and web boot with **zero services**. Set `DATABASE_URL`
and it switches to **Prisma/Postgres** automatically — the API logs which store it
selected at boot (`Using Prisma/Postgres store` / `Using in-memory store`).

#### Database (optional — enables persistence)

```bash
createdb probook_dev                                            # or CREATE DATABASE via psql
echo 'DATABASE_URL=postgresql://USER@localhost:5432/probook_dev?schema=public' >> .env
pnpm db:migrate                                                 # apply schema (creates tables)
```

With that set, `POST /offers → accept → confirm` persists the real graph — an ensured
`ClinicWorkspace` (+ owner `User`/`Membership`) and `ProfessionalProfile` (+ `User`),
then `Shift`, `Offer`, and — atomically on confirm — `Booking` + `PaymentOrder`
(Payment Protected) + `FinancialAllocation` + a `Collection` `FinancialEvent`. The
`Booking` unique constraints enforce §6.4 (one booking per shift) and the collection
event's idempotency key makes confirm safe to retry (PAY-04). Captured funds are
checked against the allocation on confirm (PAY-07 conservation).

Then `POST /bookings/:id/complete → /accept-completion` records the completion
(`AttendanceEvent`), moves the booking to `ServiceCompleted`, and initiates payout
(CMP-01/02, PAY-09) — a `Payout` `FinancialEvent` and `payoutState=Paid` — re-checking
PAY-07 conservation as the protected funds are released (captured = payout + fee + tax).

### Test

```bash
pnpm --filter @probook/domain test   # domain unit tests (no services needed)
pnpm test:bdd                        # BDD acceptance suite (implemented scenarios)
pnpm -r typecheck                    # typecheck every package

pnpm e2e:install                     # one-time: install Chromium
pnpm e2e                             # Playwright: builds API, boots API + web, drives the flow
```

`pnpm e2e` starts both servers itself (see `playwright.config.ts`) and exercises
create-offer → accept → confirm in a real browser, asserting the Confirmed booking
and the 12% checkout total.

## Deploy & live demo

The frontend deploys to **GitHub Pages** (static export) with **no GitHub Actions** —
`scripts/deploy-web.sh` force-pushes the build to a `gh-pages` branch:

```bash
pnpm run deploy:pages         # build static export → push gh-pages
```

Live: **https://tian-chaiyaporn2.github.io/probooking/** (the landing page is fully
static; the dashboards need a reachable API).

Pages can't host the API/DB/worker. For a semi-private demo against your **local** API,
`scripts/tunnel-deploy.sh` opens an HTTPS tunnel and redeploys the frontend pointed at
it. Full details, caveats, and the CORS lockdown: [`docs/deployment.md`](docs/deployment.md).

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
| Booking flow (API + web) | `apps/api/.../marketplace`, `apps/web/src/app/flow` |
| End-to-end tests | `e2e/`, `playwright.config.ts` |
| Module/build strategy | `docs/adr/0002-module-and-build-strategy.md` |
| Requirement → code map | `docs/requirements-traceability.md` |
