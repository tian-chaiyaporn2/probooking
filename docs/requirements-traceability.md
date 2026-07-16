# Requirements traceability

Maps PRD v1.5 requirement IDs to where they live in the scaffold. Keep this current as
features land — a requirement is "covered" when it has code **and** a passing BDD scenario.

Legend: ✅ implemented in scaffold · 🟡 stubbed / partial · ⬜ not started (spec only)

| Req | Summary | Code | BDD | Status |
|---|---|---|---|---|
| AUTH-01..04 | OTP login, verified email, restricted browsing | `db: User`; AUTH-04 enforced (unverified clinic can't post) | `01-*` | 🟡 |
| ORG-01 / PRO-01 | Clinic & professional onboarding | `api: POST /clinics, /professionals`, `store: registerClinic/registerProfessional` (User+Workspace+Membership / User+Profile+Credential+PayoutAccount) | `01-*` | ✅ |
| VER-01..07 | Verification states, Ops verify, gating | `domain: advanceVerification (VER-02)`, `api: POST /ops/*/verify` (idempotent), confirm gates on real verification (§6.3), VER-04/07 credential+payout verified | `01-*`, `13-*` | 🟡 (01/02/03/04/07 live) |
| AVL-01..03 | Availability blocks, Open to requests, conflict block | `db: Availability` | `02-*` | ⬜ |
| SRC-01..04 | Search filters, deterministic sort, empty-state assist | — | `03-*` | ⬜ |
| SHF-01..04 | One-position shift, scope fit, states, terms lock | `domain: state-machines/shift`, `db: Shift` | `03-*` | 🟡 |
| APP-01 / OFF-01..04 | Non-binding apps, authority, one active offer, timers, soft hold | `domain: roles, policies, state-machines/offer`, `api: OffersService` | `04-*`, `05-*` | ✅ |
| BKG-01..04 | Atomic confirmation, immutable snapshots, derived status | `domain: eligibility, state-machines/booking`, `api: BookingsService`, `db: Booking` | `05-*`, `14-*` | ✅ |
| MSG-01..02 | Plain-text thread, contact after confirmation | `db: Message` | `08-*` | ⬜ |
| NOT-01 / URG-01 | Email/SMS alerts, reminders, urgent badge | `api: NotificationsService` (mock email/SMS ports, best-effort per §7.4) emits offer_sent/payment_required/confirmed/payout/cancelled; `worker: reminderSweep` (24h/3h, dedup); `db: Notification`; `domain: URGENT_WINDOW` | `07-*` | 🟡 (NOT-01 live; urgent-badge pending) |
| PAY-01..11 | Prefunding, checkout split, immutable events, conservation, idempotency, reconciliation | `domain: money`, `api: PaymentsService`, `db: PaymentOrder/FinancialAllocation/FinancialEvent`, `worker: reconciliation` | `06-*`, `11-*` | ✅ |
| CMP-01..05 | Completion, 24h auto-accept, 48h clinic fallback | `domain: policies (autoAcceptDueAt)`, `api: complete/accept-completion`, `worker: autoAcceptSweep` | `09-*` | 🟡 (01/02/03 live; 04/05 pending) |
| CAN-01..05 | Cancellation compensation & support routing | `domain: cancellationOutcome`, `api: POST /bookings/:id/cancel` (Payout+Refund events, conservation), `store: cancelBooking` | `10-*` | ✅ |
| REV-01..05 | Review rights, pairing/publish, cold-start rating | `domain: aggregateRating (REV-04)`, `api: POST /bookings/:id/reviews` (gated on ServiceCompleted REV-01/05, one-per-party REV-02), publish-on-both + `worker: reviewPublishSweep` (7d REV-03), `GET /professionals/:id/rating` (≥3 REV-04) | `12-*` | 🟡 (01/02/03/04 live; 05 related-party not modeled) |
| SUP-01..02 / ADM / RSK | Generic cases, internal tools, risk | `db: SupportCase/RiskIncident`, `apps/ops` | `14-*` | 🟡 |
| §6.4 | Integrity: one booking/shift, no dup payout, immutable audit | `domain: state-machines`, `db: unique constraints, AuditRecord` | `05-*`, `11-*`, `14-*` | ✅ |
| LOC-01..02 / ACC-01 | Thai, satang, UTC/Bangkok, accessibility | `domain: money`, `web: lang="th"`, `.env TZ` | — | 🟡 |

## Vertical slice (live)

The **create offer → accept → confirm** path runs end to end (API + web + Playwright
e2e), enforcing OFF-01 (authority), OFF-03 (timers), OFF-04 (soft hold), §6.3
(confirmation eligibility), §6.4 (one booking per offer, idempotent confirm), and
PAY-02 (12% checkout). Persistence is **Prisma/Postgres** (`PrismaMarketplaceStore`)
when `DATABASE_URL` is set — an ensured identity graph (`ClinicWorkspace`/`User`/
`Membership`/`ProfessionalProfile`), then `Shift`/`Offer`, and atomically on confirm
`Booking` + `PaymentOrder` + `FinancialAllocation` + a `Collection` `FinancialEvent`
(PAY-01/03/05). Confirm asserts **PAY-07 conservation** and is idempotent via the
event key (**PAY-04**); `Booking` unique constraints enforce **§6.4** in the DB. An
in-memory store is the fallback. **Completion → payout** (CMP-01/02, PAY-09) is also
live: `complete` records an `AttendanceEvent` and moves the booking to
`AwaitingCompletion`; `accept-completion` transitions it to `ServiceCompleted`, sets
`payoutState=Paid`, and writes an idempotent `Payout` event, re-asserting PAY-07.
The **worker** (`apps/worker`) closes the loop for CMP-03: it sweeps for bookings past
their `autoAcceptAt` deadline still in `AwaitingCompletion` and triggers
`accept-completion` automatically (idempotent — skips already-accepted bookings).
Covered by: `packages/domain/test/*`, `features/04`, `features/05`, `e2e/tests/booking-flow.spec.ts`
(the e2e runs against Postgres when `.env` provides `DATABASE_URL`).

## Phase gates (Rollout Plan)

- **Phase 0 exit** (§9.1): 30 completed paid bookings, 80% intended-path, 10 customer-
  originated, repeat intent, clean money & licences, approvals. Track in the weekly sheet.
- **Phase 1 release gate** (§9.2): all Phase 1 reqs implemented or waived, Payment
  Protected validated with provider, runbooks tested, role/idempotency/conservation/audit
  tested, critical journeys pass.
