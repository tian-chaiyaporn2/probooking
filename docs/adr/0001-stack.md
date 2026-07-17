# ADR 0001 — Technology stack

**Status:** Accepted · **Date:** 2026-07-16

## Context

The PRD (§7.2) requires a responsive web app, a modular backend with a relational
database, background jobs, secure document storage, and low-code internal tools that
call controlled APIs. It explicitly rules out microservices, a search engine, real-time
chat, a fraud engine, and a general-ledger platform for Phase 1. The domain is
financially sensitive: immutable events, idempotent money commands, strict conservation,
and heavy state machines.

## Decision

A **pnpm TypeScript monorepo**:

- **Web:** Next.js (responsive, SSR-capable, Thai-first).
- **API:** NestJS — modules map cleanly to bounded contexts; DI and guards fit
  authority/audit/dual-control needs; exposes the controlled endpoints internal tools call.
- **Domain:** a pure, framework-free package (money/states/policies/machines) shared by
  API and worker, unit-tested without services.
- **DB:** PostgreSQL via Prisma — strong relational integrity, transactions for atomic
  confirmation, easy immutable-event modelling; integer satang for money.
- **Worker:** in-process polling sweeps (expiries, reminders, auto-accept, review
  publish). No Redis required for Phase 0/1; a durable queue (e.g. BullMQ) remains an
  option if a single polling worker outgrows the load.
- **BDD:** cucumber-js over the 14 §9.4 areas.

## Consequences

- End-to-end type sharing (domain types flow into api, web, worker) reduces drift on the
  money/state rules that must never diverge.
- One deployable web + one API + one worker keeps ops simple (no microservices), matching
  the PRD's "modular, not distributed" intent.
- Postgres + Prisma migrations give auditable schema evolution for financial data.
- If search or real-time needs later exceed Postgres/polling, revisit — but not in Phase 1.

## Alternatives considered

- **Next.js full-stack only** — leanest, but the money/audit/internal-tools surface is
  cleaner behind a dedicated API; kept as a fallback if the API proves heavy for Phase 0.
- **Python (Django/DRF)** — excellent admin for Ops/Finance, but loses end-to-end type
  sharing with the web app and the team's JS/TS tooling.
