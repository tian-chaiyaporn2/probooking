# Requirements traceability

Maps PRD v1.5 requirement IDs to where they live in the scaffold. Keep this current as
features land — a requirement is "covered" when it has code **and** a passing BDD scenario.

Legend: ✅ implemented in scaffold · 🟡 stubbed / partial · ⬜ not started (spec only)

| Req | Summary | Code | BDD | Status |
|---|---|---|---|---|
| AUTH-01..04 | OTP login, role-restricted internal surfaces | `api: /auth/otp/{request,verify}` (crypto-random code, never returned outside AUTH_DEV_MODE); `/auth/dev/token` exists ONLY under AUTH_DEV_MODE and is force-off in production; `auth: token.util` (dependency-free HS256 JWT, no default secret — the API refuses to boot without a strong JWT_SECRET); `AuthGuard` guards every mutating endpoint, `@Roles` gates internal surfaces, and party-level authority is resolved from the identity graph (`resolveIdentity`), not from request bodies; AUTH-04 enforced ; token revocation live (`POST /auth/logout` kills a token via its `jti`; `POST /auth/sessions/revoke` and `POST /auth/staff/suspend` are admin actions that log a subject out everywhere and drop staff access immediately, re-checked on every request against the live access list) | `01-*`, `e2e` | 🟡 (real SMS provider + admin-managed/persistent access list deferred; STAFF_PHONES is env-driven, mutable at runtime via suspend) |
| ORG-01 / PRO-01 | Clinic & professional onboarding | `api: POST /clinics, /professionals`, `store: registerClinic/registerProfessional` (User+Workspace+Membership / User+Profile+Credential+PayoutAccount) | `01-*` | ✅ |
| VER-01..07 | Verification states, Ops verify, gating, holds, verified profile | `domain: advanceVerification (VER-02)`, `api: /ops/*/verify` + `/suspend-credential`, confirm gates on verification + licence suspension/expiry (VER-04, §6.3); VER-03: `GET /professionals/:id/profile` splits self-declared claims (displayName/profession/specialty) from platform-verified facts (identity, licence state, insurance, rating); VER-06 hold overlay (`Booking.heldAt`) — Operations-triggered `/bookings/:id/hold-credential` blocks payout + auto-accept, opens case, notifies; `/resolve-hold` clears. Automated credential recheck deferred to Phase 2 (§2.4) | `01-*`, `13-*` | 🟡 (01–07 live incl. VER-03 split + VER-04 suspension gate; recheck=P2) |
| AVL-01..03 | Availability blocks, Open to requests, conflict block | `api: POST/GET /professionals/:id/availability` (AVL-01/02); confirm checks `hasScheduleOverlap` → NOT_ELIGIBLE (AVL-03/§6.3) | `02-*` | 🟡 (blocks + confirmed overlap live; soft-hold overlap + Open-to-requests matching still @wip) |
| SRC-01..04 | Search, filters, deterministic sort, empty-state assist | `api: GET /shifts` filtered (category/urgency/comp) + priority-ordered (urgent→soonest, SRC-03) + empty-state hint (SRC-04); `GET /professionals` search (profession/specialty + rating, SRC-01) | `03-*`, `07-*` | 🟡 (profession/category/urgency/comp filters + sort covered; availability/location filters still @wip) |
| SHF-01..04 | One-position shift, scope fit, states, terms lock | `api: POST /shifts` (Published), `domain: state-machines/shift`, `db: Shift`; terms lock on offer (SHF-04) | `03-*` | 🟡 |
| APP-01 / OFF-01..04 | Non-binding apps & invitations, authority, one active offer, timers, soft hold | `api: POST /shifts/:id/{apply,invite,offer}` — applications/invitations reserve neither party (APP-01), offer only to a candidate, one active offer per shift (OFF-02, enforced by the `Offer_one_active_per_shift` partial unique index — a service-layer read cannot hold under concurrency); OFF-01 authority resolved from clinic membership, not `actorRole`; `domain: roles, policies, state-machines/offer` | `03-*`, `04-*`, `05-*`, `e2e` | ✅ |
| BKG-01..04 | Atomic confirmation, immutable snapshots, derived status | `domain: eligibility, state-machines/booking`, `api: BookingsService`, `db: Booking`; BKG-03 `termsSnapshot` now freezes the real agreed terms (it was persisted as `{}`) and the booking carries the offer's snapshot forward | `05-*`, `14-*`, `int` | ✅ (BKG-02 atomicity is now asserted directly: `apps/api/test/prisma-store.int.test.ts` forces a failure on the last write inside the transaction and proves no orphan booking/order/allocation survives and the offer does not convert) |
| MSG-01..02 | Plain-text thread, contact after confirmation | `api: POST/GET /bookings/:id/messages` (plain text, no attachments MSG-01), `GET /bookings/:id/contact` reveals party phones post-confirmation to the two parties only (MSG-02); sender identity is derived from the caller's token, not the body | `08-*`, `e2e` | ✅ (party-level access control enforced: non-parties get 403) |
| NOT-01 / URG-01 | Email/SMS alerts, reminders, urgent badge + priority | `api: NotificationsService` (best-effort §7.4) emits offer/payment/confirmed/payout/cancelled/critical_hold; `worker: reminderSweep` (24h/3h); `db: Notification`. URG-01: `domain: isUrgentEligible` (72h gate), urgent_alert outreach, `GET /shifts` priority-ordered (urgent first, then soonest) | `07-*` | ✅ (fill not guaranteed by design) |
| PAY-01..11 | Prefunding, checkout split, immutable events, conservation, idempotency, reconciliation | `domain: money`, `api: PaymentsService` (`assertConserved` PAY-07 + `assertWithinAllocation` PAY-08 called on every payout/refund path), prefunding established by the API's own capture via `payments/payment.provider` — never a request field; `db: PaymentOrder/FinancialAllocation/FinancialEvent` (unique idempotencyKey) | `06-*`, `11-*`, `e2e` | 🟡 (PAY-01..09/11 live + store conservation/reconcile BDD; PAY-10 refund split still @wip) |
| CMP-01..05 | Completion, 24h auto-accept, 48h clinic fallback | `domain: policies (autoAcceptDueAt)`, `api: complete/accept-completion`, `worker: autoAcceptSweep` | `09-*` | 🟡 (01/02/03 + Ops completion_review case live; clinic-confirm-without-submit + CMP-05 overtime still @wip) |
| CAN-01..05 | Cancellation compensation & support routing | `domain: cancellationOutcome`, `api: POST /bookings/:id/cancel` (Payout+Refund events, conservation) — actor derived from the caller, `hoursBeforeStart` from the scheduled shift, `arrived` from the attendance trail (`POST /bookings/:id/arrive`), none from the body; `store: cancelBooking` (state guard inside the transaction) | `10-*` | ✅ |
| REV-01..05 | Review rights, pairing/publish, cold-start rating | `domain: aggregateRating (REV-04)`, `api: POST /bookings/:id/reviews` (gated on ServiceCompleted REV-01/05, one-per-party REV-02), publish-on-both + `worker: reviewPublishSweep` (7d REV-03), `GET /professionals/:id/rating` (≥3 REV-04) | `12-*` | 🟡 (01/02/03/04 live incl. store cold-start; 05 related-party store exclusion still @wip) |
| SUP-01..02 / ADM / RSK | Generic cases, internal tools, risk, finance | `api: /ops/{cases,pending,metrics,audit}` + `/finance/{reconciliation,export}` (PAY-11, conservation check PAY-08); Ops dashboard (`/ops`) + Finance dashboard (`/finance`) calling controlled actions (ADM-01/02); every privileged Ops action appends an immutable `AuditRecord` (§6.4) | `14-*` | 🟡 (Ops+Finance dashboards + audit trail live; MFA/real RBAC pending) |
| §7.3 | PDPA/security: masking, audit, rate limiting, patient-data prohibition | `api: recordAudit`/`GET /ops/audit` (immutable trail, admin-only, actor masked); `auth: OtpService` per-phone rate limit → 429, plus a **global** fixed-window rate limit per IP+route (`throttle/throttle.guard`, strict bucket on the auth routes) and `helmet` security headers + an explicit 100kb body limit; `privacy.util`: `maskPhone`/`maskActor` field masking + `containsProhibitedPatientData` heuristic rejecting national-ID/HN patterns in messages & reviews; role guard (AUTH). **Encryption at rest** live for the free-form sensitive columns (licence numbers, addresses, message bodies) via AES-256-GCM at the app layer (`field-crypto.ts`) with a boot-required key; `User.phone` is now encrypted too, with a keyed HMAC **blind index** (`phoneHash`) carrying the unique + lookup that random-IV ciphertext cannot. MFA, DSAR/retention automation deferred (infra/P2) | `08-*`, `14-*` | 🟡 (masking/audit/rate-limit/patient-guard live; MFA + PDPA processes = P2/infra) |
| REP-01..03 | Booking/financial history + receipts, Finance export, management metrics | REP-01: `GET /{professionals,clinics}/:id/bookings` (history) + `GET /bookings/:id/receipt` (checkout split + payout statement); REP-02: `GET /finance/export` (finance-guarded CSV of allocations + event ledger + provider refs); REP-03: `GET /ops/metrics` (ops-guarded shift/offer/booking/case counts + money totals) surfaced on the Ops dashboard | `11-*`, `14-*` | 🟡 (endpoints + CSV live; scheduled/emailed reports = P2) |
| §6.4 | Integrity: one booking/shift, no dup payout, different-person approval, immutable audit | `db: unique constraints (Booking.shiftId/offerId, FinancialEvent.idempotencyKey, `Offer_one_active_per_shift` partial unique); state preconditions asserted **inside** the payout/cancel/confirm transactions; **dual control**: `domain: dualControlSatisfied` (executor must be a different *authorized* person) + `db: ApprovalRequest` with a `different_person` CHECK — `POST /finance/refunds` proposes, `/approve` executes as a second finance person; `AuditRecord` written for confirm/payout/cancel/propose/execute + every ops action, and `AuditRecord`/`FinancialEvent`/`AttendanceEvent` are **append-only at the database** (rejecting triggers — UPDATE/DELETE raise) | `05-*`, `11-*`, `14-*`, `e2e` | ✅ (dual control live for payment exceptions; history is immutable by control, not convention) |
| LOC-01..02 / ACC-01 | Thai, satang, UTC/Bangkok, accessibility | `domain: money`, `web: lang="th"`, `.env TZ` | `06-*` (LOC-02 satang/checkout) | 🟡 (LOC-02 money BDD live; Thai UI + ACC-01 e2e/web only) |

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

## BDD coverage (§9.4 + edge/error/success cases)

All 14 §9.4 acceptance areas plus dedicated success/edge/error case suites are
executable — `pnpm test:bdd` → **96 scenarios / 256 steps** green, no `@wip`.
`pnpm test:bdd:all` also runs 7 `@wip` scenarios that stay pending until product
hooks land (soft-hold overlap, open-to-requests matching, location/availability
filters, CMP-04 clinic-confirm-without-submit, CMP-05 overtime/shortened pay,
PAY-10 refund split, REV-05 store exclusion).

The steps exercise **real code**, not inline restatements of the rule:
- Pure rules call the actual domain functions the API uses (conserves, withinAllocation,
  canLeaveReview, cancellationOutcome, checkConfirmationEligibility, isUrgentEligible,
  aggregateRating, advance* machines, containsProhibitedPatientData, effectiveOfferExpiry,
  buildCheckout/satang).
- Stateful/idempotency scenarios drive the **real in-memory MarketplaceRepository** via
  `features/support/store.ts` (register→verify→post→apply→offer→accept→confirm), so
  duplicate confirm/payout/cancel, hold overlays, the VER-03 profile split, schedule
  overlap, search filters/sort, contact reveal, auto-accept deadline stamps, Ops
  completion_review cases, review cold-start via published pairs, party booking history,
  and the audit trail run against production persistence code.

**Known limits of this suite — read before trusting a ✅:**
- It stops at the **store boundary**. The controller — where authority, prefunding and the
  money decisions live — is covered by `e2e/` only. A BDD scenario passing says nothing
  about the endpoint.
- The **in-memory store is a second implementation** of some invariants and does not always
  agree with Postgres (e.g. profile `validUntil` stays null even after `setLicenceValidUntil`;
  VER-04 expiry is exercised via domain eligibility in `20-*`). Requirements marked ✅ on
  BDD alone may behave differently in production.
- Not every scenario is mutation-proof: some assert an identity (`captured - payable +
  payable == captured`) rather than the store's recorded amounts, and so cannot fail. The
  earlier blanket claim that the suite was "proven non-tautological by mutation" was wrong.
  Conservation success paths in `06-*` / `15-*` now read store booking amounts.
- `pnpm e2e` is the only layer that tests the controller, and it is the one that asserts the
  money math, the authz matrix, and OFF-02 against real Postgres in CI.
- `pnpm test:int` (`apps/api/test/`) covers what only Postgres can answer — transaction
  atomicity and the unique constraints. It self-skips without `DATABASE_URL`.

Case suites:
`15` confirmation, `16` completion/payout, `17` cancellation, `18` offer lifecycle,
`19` authorization matrix, `20` onboarding/verification. Files: `features/01`…`20`,
`features/step-definitions/*.steps.ts`, `features/support/store.ts`.

## Phase gates (Rollout Plan)

- **Phase 0 exit** (§9.1): 30 completed paid bookings, 80% intended-path, 10 customer-
  originated, repeat intent, clean money & licences, approvals. Track in the weekly sheet.
- **Phase 1 release gate** (§9.2): all Phase 1 reqs implemented or waived, Payment
  Protected validated with provider, runbooks tested, role/idempotency/conservation/audit
  tested, critical journeys pass.
