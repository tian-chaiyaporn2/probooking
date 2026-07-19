# ProBooking Rollout Plan
## Companion to PRD v1.5

**Version:** 1.1  
**Purpose:** Operating plan for phase reviews, experiments, and investment decisions  
**Market:** Thailand; Bangkok and surrounding provinces first

---

# 1. Document boundary

The PRD defines product behavior and minimum phase scope. This plan defines how the team runs each phase and decides what to build next.

Phase thresholds are management signals, not automated gates or customer-visible statuses.

# 2. Phase framework

**Active clinic:** verified branch with a shift, invitation, offer, or booking in the last 60 days.  
**Active professional:** verified professional with availability, application, invitation response, offer, or booking activity in the last 60 days.

| Phase | Indicative size | Objective |
|---|---:|---|
| 0 — Concierge Validation | 0–5 clinics; 0–30 professionals | Prove demand and the complete transaction. |
| 1 — Marketable MVP | 5–20 clinics; 30–200 professionals | Deliver the public marketplace reliably. |
| 2 — Marketplace Hardening | ~20+ clinics; ~200+ professionals; ~100 bookings/month, or equivalent burden | Automate recurring bottlenecks. |
| 3 — Clinic Market Scale | Several hundred bookings/month and strong repeat use | Scale cities, groups, and validated revenue products. |
| 4 — Workforce Expansion | Stable Phase 3 core | Add employer types and professions one segment at a time. |

Headcount alone never advances a phase.

# 3. Governance

| Decision | Owner | Required input |
|---|---|---|
| Phase advancement | Product Owner | CEO, CTO, CSO, CMO, Operations, Finance |
| Category approval | Clinical Owner | Product, Operations, legal |
| Payment/tax readiness | Finance Owner | Legal, accounting, payment partner |
| Public claims | Commercial Owner | Product and legal |
| Automation investment | Product + Technical Owners | User impact, staff cost, risk, estimate |
| New segment launch | Product Owner | Clinical, legal, Operations, Commercial, Finance |

Review cadence:

- Phase 0: weekly.
- Phase 1: fortnightly product/Operations; monthly phase review.
- Phase 2: monthly automation review.
- Phases 3–4: quarterly portfolio review plus launch-specific weekly reviews.

# 4. Phase 0 — Concierge Validation

## Objective

Prove that clinics and professionals value the workflow and that ProBooking can complete bookings safely.

## Operating approach

Users follow the intended product journey. Operations may manually verify, match, contact, decide exceptions, release money, moderate, and reconcile. All privileged actions remain controlled and auditable.

## Questions to answer

- Which clinic and shift types repeat?
- Which professionals respond and return?
- Which profile and availability fields affect selection?
- Which matching path works: search, posting, invitations, or concierge?
- Does Payment Protected increase conversion?
- Which exceptions create the most user pain or staff time?

## Exit

- 30 completed paid bookings.
- 80% of the final ten use the intended product path.
- Ten completed bookings originate from customer marketplace actions, not full Operations selection.
- Repeat use or clear repeat intent from at least two clinics and ten professionals.
- No unresolved money discrepancy or invalid mandatory licence.
- Core product, legal, payment, tax, privacy, support, and claim readiness approved.

# 5. Phase 1 — Marketable MVP

## Objective

Operate a public, differentiated marketplace while keeping exceptions support-assisted.

## Priorities

1. Keep the normal booking journey self-service.
2. Preserve honest availability and empty states.
3. Recruit supply from observed demand.
4. Protect verification, payment, payout, and refund reliability.
5. Record exception type, time, and outcome.
6. Measure repeat use before adding commercial complexity.

## Health signals

- 70% of valid shifts receive an eligible response within 24 hours.
- 50% reach confirmed booking.
- 95% show rate.
- 90% of undisputed payouts initiated within one business day.
- Reconciliation exceptions below 1%, with no unexplained difference.
- Support contacts trending below 15% of completed bookings.
- Operations time trending below 30 minutes per completed booking by booking 100.

These are internal goals, not guarantees.

# 6. Phase 2 — Marketplace Hardening

Enter Phase 2 when volume or risk makes manual work uneconomic or unreliable. Typical signals:

- ~20+ active clinics or ~200+ active professionals.
- ~100 completed bookings per month.
- An exception affects over 15% of bookings.
- A process uses over 30 staff minutes per affected booking.
- Manual work repeatedly delays service or creates material risk.

Rank each investment by:

> User improvement + risk reduction + recurring staff cost avoided − engineering/maintenance cost − admin cognitive load

Likely work:

- Payout/refund automation.
- Better reconciliation and credential rechecks.
- Selected registry integrations.
- Saved searches, alerts, repeat-booking shortcuts, availability reminders, ICS export.
- Better reliability and Operations reporting.
- Additional permissions only when needed.

# 7. Phase 3 — Clinic Market Scale

Advance when repeat usage, Operations reliability, and unit economics support larger commercial investment.

Likely work:

- Multi-branch organizations and central billing.
- Preferred pools, recurring shifts, and multiple positions.
- Additional cities and categories.
- Subscriptions, volume pricing, advanced matching, and automated campaigns.
- Partner insurance and clearly labelled sponsored visibility.
- Native app or PWA only when behavior data supports it.

Every paid product requires a clear benefit, willingness-to-pay evidence, margin model, trust review, and relevant legal/tax approval.

# 8. Phase 4 — Workforce Expansion

Expand one dimension at a time:

- **4A:** new employer type, same dental assistants/nurses.
- **4B:** new profession, known clinic buyers.

Each segment requires legal and contracting rules, verification, shift templates, supervision, payment/tax treatment, safety process, supply, demand, and economics.

Do not test a new employer type and new profession together first.

# 9. Review packet

Each phase review uses one page or spreadsheet with:

- Active clinics/professionals and completed bookings.
- GMV, revenue, contribution margin, and cash needs.
- Response time, fill rate, show rate, and repeat use.
- Verification backlog and errors.
- Cancellations, no-shows, cases, and review reports.
- Support minutes by exception type.
- Payout/refund timeliness and reconciliation differences.
- Safety, privacy, credential, and financial incidents.
- Top user feedback and top three proposed investments.

No dedicated phase dashboard is required in Phases 0–1.

# 10. Phase decision

For each review, answer:

1. Has the current phase objective been achieved?
2. Which user problem now limits trust or growth?
3. Can Operations still solve it acceptably?
4. Does automation now cost less than continued manual work?
5. Will the change add admin complexity or failure states?
6. Are safety, payment, privacy, and unit economics ready for more volume?
7. What remains explicitly deferred?

Decision: **Advance, Advance with Conditions, Remain, or Roll Back a Capability.**

# 11. Immediate actions

1. Convert Phase 0 and Phase 1 PRD requirements into BDD and estimates.
2. Confirm initial clinic and professional recruitment lists.
3. Approve launch shift categories.
4. Validate payment and communication providers.
5. Finalize verification, Finance, and incident runbooks.
6. Create the weekly Phase 0 review sheet.
7. Rebuild the financial model from transaction-fee-first assumptions.
