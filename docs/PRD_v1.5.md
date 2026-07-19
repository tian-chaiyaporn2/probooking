# ProBooking Medical Talent Marketplace
## Final Product Requirements Document

**Version:** 1.5  
**Status:** Final product definition for design, estimation, BDD, and launch planning  
**Market:** Thailand  
**Initial region:** Bangkok and surrounding provinces  
**Initial professionals:** Dental assistants (ผู้ช่วยทันตแพทย์), widening to nurses (พยาบาล)  
**Target public launch:** Q1 2027, subject to Phase 0 and legal/payment readiness  
**Companion:** ProBooking Rollout Plan v1.1

---

# 1. Product definition

## 1.1 Purpose

ProBooking is a two-sided marketplace for temporary clinic shifts.

- Clinics find, compare, invite, and book verified professionals.
- Professionals find verified clinic work, control availability, accept clear terms, and receive traceable payout.
- ProBooking verifies participants, records agreements, protects payment, and supports exceptions.

This PRD is the source of truth for product behavior and minimum phase scope. The rollout plan owns execution cadence, experiments, and phase advancement.

## 1.2 Customer promise

**Verified. Available. Bookable. Payment Protected.**

A normal booking must be self-service. Human Operations may handle verification and exceptions behind the scenes.

## 1.3 MVP interpretation of pitch claims

| Pitch claim | Launch meaning |
|---|---|
| Verified credentials | Checked against approved official sources; manual review is acceptable. |
| Real-time booking | Current availability, immediate status changes, and timely alerts. No universal Instant Book. |
| Escrow | **Payment Protected** through an approved regulated partner. Use “escrow” only if legally accurate. |
| Insurance layer | Verified evidence of existing professional coverage. ProBooking does not insure every shift. |
| Two-way ratings | Reviews from completed paid ProBooking bookings. |
| Payout within 24 hours | Payout initiated within one business day after accepted completion. |
| 10–15% fee | Default clinic-paid fee: 12% of professional compensation payable. |
| Subscription, promotion, LMS | Later phases only after validated demand. |

## 1.4 Product principles

1. Keep customer value; simplify backstage work.
2. Automate the happy path; operate exceptions.
3. Human judgment may choose an outcome; controlled systems execute it.
4. Verify before binding commitment.
5. Show terms, fees, and status clearly.
6. Collect no patient data in normal use.
7. Add automation only when its payoff exceeds build and admin cost.

## 1.5 Goals

- Faster staffing than Facebook, LINE, job boards, or agencies.
- Trusted clinic and professional profiles.
- Reliable booking, payment, completion, and payout records.
- Repeat clinic demand and professional participation.
- A safe base for later cities, professions, insurance, and subscriptions.

## 1.6 Non-goals through Phase 1

- Patient booking, telemedicine, EMR, clinical notes, or patient billing.
- Permanent recruitment, payroll employment, or emergency dispatch.
- Guaranteed fill or universal Instant Book.
- High-acuity categories without clinical approval.
- Professions beyond dental assistants and nurses.
- Multi-branch enterprise administration.
- Recurring, bulk, or multi-position shifts.
- Native apps, PWA, full calendar, or real-time chat.
- Automated overtime, disputes, or insurance purchase.

---

# 2. Product phases and scope

## 2.1 Phase definitions

**Active clinic:** verified branch that posted, invited, offered, or completed a booking in the last 60 days.  
**Active professional:** verified professional who updated availability, applied, responded, accepted, or completed a booking in the last 60 days.

Counts are management signals, not product gates.

| Phase | Indicative size | Product objective |
|---|---:|---|
| 0 — Concierge Validation | 0–5 clinics; 0–30 professionals | Prove demand and the complete transaction. |
| 1 — Marketable MVP | 5–20 clinics; 30–200 professionals | Public self-service marketplace with assisted exceptions. |
| 2 — Marketplace Hardening | ~20+ clinics; ~200+ professionals; ~100 bookings/month, or equivalent burden | Automate recurring bottlenecks. |
| 3 — Clinic Market Scale | Sustained repeat use and several hundred bookings/month | Multi-city, multi-branch, and validated monetization. |
| 4 — Workforce Expansion | Stable Phase 3 core | Add employer types and professions one segment at a time. |

## 2.2 Phase 0 scope

Phase 0 exposes the intended journey while Operations handles most backstage work.

- Registration and verification submission.
- Basic clinic and professional profiles.
- Shift posting and simple search.
- Applications, invitations, one binding offer.
- Payment Protected checkout and confirmation.
- Booking messages and reminders.
- Completion, payout/refund status, reviews, and support.

Operations may manually verify, match, release payout, refund, reconcile, moderate, and decide exceptions. Manual work must use controlled records and actions.

## 2.3 Phase 1 scope

Phase 1 is the public, marketable product.

- Rich verified clinic and professional profiles.
- Two-sided search with ordinary filters.
- Availability blocks and Open to requests.
- Applications, invitations, and one active offer.
- Durable prefunding and current booking/payment status.
- Plain-text booking thread.
- Email and critical SMS alerts.
- Urgent badge and assisted outreach.
- Insurance-evidence status.
- Completion, payout/refund tracking, and verified reviews.
- Secure Operations, Finance, and Admin tools.

## 2.4 Later phases

**Phase 2:** payout/refund automation, stronger reconciliation, credential rechecks, selected registry integrations, saved searches, repeat-booking shortcuts, ICS export, and better Operations reporting.

**Phase 3:** multi-branch organizations, recurring/multi-position shifts, subscriptions, volume pricing, advanced matching, partner insurance, sponsored visibility, and additional cities.

**Phase 4:** new employer types first with existing professions, then new professions with known clinic buyers. Each segment requires separate legal, clinical, workflow, and economic validation.

## 2.5 Scope rule

A feature advances when it materially improves users, reduces risk, or removes recurring staff cost. It does not advance merely because mature marketplaces have it.

---

# 3. Users and permissions

| Role | Main permissions |
|---|---|
| Clinic owner/admin | Verify one branch; publish shifts; search/invite; send offers; pay; cancel; confirm completion; manage staff. |
| Clinic staff | Draft shifts; search; shortlist; message. Cannot bind terms, move money, cancel confirmed bookings, or confirm completion. |
| Professional | Manage profile, credentials, insurance, availability, applications, offers, bookings, payout details, messages, and reviews. |
| Operations | Verify, support matching, moderate reviews, manage ordinary cases, propose suspension. |
| Finance | Execute payouts/refunds, reconcile, and manage payment exceptions. |
| Administrator | Manage access, high-risk decisions, configuration, and exceptional approvals. |

Rules:

- One Phase 1 workspace represents one physical clinic branch.
- Binding clinic actions record actor, authority, time, and accepted terms.
- Sensitive payout, ownership, and recovery changes require fresh OTP and review.
- Internal users require MFA and least privilege.
- High-value or unusual money actions require a second authorized person.
- Self-booking and unapproved related-party bookings are blocked.

---

# 4. Core journeys

## 4.1 Clinic journey

1. Register and verify a branch.
2. Build the clinic profile.
3. Search professionals or post a shift.
4. Review applications and invitation responses.
5. Send one binding offer with exact terms.
6. Professional accepts; clinic pays within the funding window.
7. Final checks pass; booking becomes Confirmed and Payment Protected.
8. Coordinate through the booking thread and reminders.
9. Confirm completion or open support.
10. View financial outcome and leave a review.

## 4.2 Professional journey

1. Register and verify identity and payout account; licensed professions (nurse) also verify a licence.
2. Build a profile and add availability.
3. Search shifts, apply, or answer invitations.
4. Review and accept exact offer terms.
5. See Payment Protected before the booking is confirmed.
6. Attend, mark completion, and track payout.
7. Leave a review and build marketplace history.

## 4.3 Exception journey

1. User opens a support case.
2. Operations reviews facts and evidence.
3. Finance or Admin executes any controlled money or risk action.
4. Users see the decision and status.
5. The audit trail remains immutable.

---

# 5. Functional requirements

## 5.1 Accounts and onboarding

- **AUTH-01:** Thai mobile OTP is the primary login method.
- **AUTH-02:** Clinics require a verified business email; professionals require email before sensitive documents or recovery messages.
- **AUTH-03:** Agreements and policies are versioned and auditable.
- **AUTH-04:** Unverified users may browse restricted public content but cannot transact.
- **ORG-01:** A clinic submits branch identity, licence, authority, address, billing data, and profile content.
- **PRO-01:** A professional submits identity, experience, payout account, and optional insurance evidence. Credential requirements are profession-dependent: a licensed profession (nurse) also submits licence and specialty evidence; a dental assistant is not a licensed practitioner and submits no licence.

## 5.2 Verification and profiles

- **VER-01:** Approved official sources or documented manual review verify mandatory facts.
- **VER-02:** Verification states: Draft, Submitted, Under Review, Needs Information, Verified, Rejected, Suspended, Expired, Closed.
- **VER-03:** Public profiles separate verified facts from self-declared content and show last-checked dates.
- **VER-04:** Required credentials must remain valid through shift end. Which credentials are required depends on the profession — a licensed profession (nurse) requires a valid licence; a dental assistant does not.
- **VER-05:** Required insurance must remain valid through shift end; status shows Verified, Under Review, Expired, Not Provided, or Unverified.
- **VER-06:** A required credential or insurance failure after confirmation places the booking on Hold for Operations review.
- **VER-07:** Payout account must match the verified professional.

## 5.3 Availability and search

- **AVL-01:** Professionals add one-off Available blocks and may enable Open to requests.
- **AVL-02:** No listed block means not shown as available.
- **AVL-03:** Confirmed bookings and accepted-offer holds block overlapping acceptance.
- **SRC-01:** Clinics filter professionals by profession, specialty, availability, location, language, insurance, completed bookings, and rating.
- **SRC-02:** Professionals filter shifts by schedule, category, location, compensation, urgency, clinic rating, and insurance requirement.
- **SRC-03:** Sorting is simple and deterministic: eligibility, availability, location, reputation evidence, recent activity.
- **SRC-04:** Empty results offer shift posting and matching assistance; no engineered liquidity gate is required.

## 5.4 Shifts, applications, invitations, and offers

- **SHF-01:** A Phase 1 shift has one position, one clinic branch, fixed schedule, scope, and scheduled compensation.
- **SHF-02:** Scope must fit the branch’s verified services and approved categories.
- **SHF-03:** Shifts may be Draft, Published, Paused, Closed, Cancelled, or Archived.
- **SHF-04:** Material terms lock after an application, an Interested invitation response, or an offer. Later changes require withdrawal and recreation.
- **APP-01:** Applications and invitations are non-binding and reserve neither party.
- **OFF-01:** Only a clinic owner/admin may send a binding offer.
- **OFF-02:** One active offer per shift; it snapshots all terms and policies.
- **OFF-03:** Standard offer expiry: up to 12 hours. Urgent offer: up to 2 hours. Funding window after acceptance: 30 minutes. All expire by shift start.
- **OFF-04:** Acceptance creates a temporary conflict hold, not a booking.

## 5.5 Booking, status, messaging, and alerts

- **BKG-01:** Confirmation requires accepted terms, current eligibility, no conflict, no blocking hold, and durable successful prefunding.
- **BKG-02:** Confirmation is atomic; one shift cannot produce two bookings.
- **BKG-03:** Booking stores immutable terms, parties, authority, verification, insurance, fee, tax, and policy snapshots.
- **BKG-04:** Users see the current application, offer, payment, booking, completion, refund, payout, and support status.
- **MSG-01:** Each shift/booking has an access-controlled plain-text thread; no attachments or real-time chat infrastructure.
- **MSG-02:** Contact details appear after confirmation.
- **NOT-01:** Email covers all critical events. SMS covers offers near expiry, payment required, confirmation, cancellation/critical hold, 24-hour and 3-hour reminders, and same-day escalation.
- **URG-01:** Supported shifts within 72 hours may receive an Urgent badge, priority placement, alerts, and assisted outreach. No fill guarantee.

## 5.6 Payment, refund, and payout

- **PAY-01:** An approved regulated partner provides durable prefunding before confirmation.
- **PAY-02:** Checkout separates professional compensation, 12% service fee, applicable tax/withholding, and total.
- **PAY-03:** A Payment Order exists before collection and remains even if no booking is created.
- **PAY-04:** Provider callbacks and money commands are authenticated, idempotent, and linked to provider references.
- **PAY-05:** Each booking has an immutable financial allocation; each collection, refund, payout, reversal, or adjustment is an immutable event.
- **PAY-06:** Staff cannot directly edit financial truth or terminal provider states.
- **PAY-07:** Captured funds must equal protected remainder plus payout, fee, tax/withholding, refunds, disclosed provider costs, and adjustments.
- **PAY-08:** No payout/refund may exceed captured or remaining allocated funds.
- **PAY-09:** Undisputed payout is initiated within one business day after accepted completion.
- **PAY-10:** Refund output separates compensation, platform fee, tax adjustment, and any legally permitted pre-disclosed provider charge.
- **PAY-11:** Finance reconciles provider and platform records each business day.

## 5.7 Completion and cancellation

- **CMP-01:** Professional may mark Arrived and Completed without GPS or QR.
- **CMP-02:** Clinic confirms completion or opens support.
- **CMP-03:** If the professional submits completion, auto-accept occurs once after 24 hours, measured from the later of scheduled end and submission, unless held or disputed.
- **CMP-04:** If the professional does not submit, the clinic may confirm full completion. After 48 hours of inactivity, Operations reviews.
- **CMP-05:** Scheduled compensation is the default payable amount; overtime, partial work, shortened shifts, and disputed attendance require support.
- **CAN-01:** Clinic cancellation at least 24 hours before start: 0% professional compensation.
- **CAN-02:** Clinic cancellation under 24 hours before valid arrival: 50%.
- **CAN-03:** Substantiated clinic unavailability after arrival: default 100%, subject to support.
- **CAN-04:** Professional cancellation or no-show before work: 0%; refundable clinic amounts return.
- **CAN-05:** Force majeure, safety, credential, platform/provider failure, and partial work require support.

## 5.8 Reviews, support, and administration

- **REV-01:** Only completed paid production bookings create review rights.
- **REV-02:** Each party may leave one overall score, optional tags, and short text.
- **REV-03:** Reviews publish when both submit or after seven days.
- **REV-04:** Aggregate rating and rating-based sorting begin after three published reviews.
- **REV-05:** Self, related-party, test, fraudulent, reversed, or cancelled transactions create no public reputation.
- **SUP-01:** One generic case model covers verification, booking, attendance, payment, safety, insurance, and review issues.
- **SUP-02:** Case states: Open, Awaiting User, Under Review, Resolved, Reopened.
- **ADM-01:** Internal tools support search, verification, cases, reviews, holds, money exceptions, reconciliation, and audit.
- **ADM-02:** Low-code tools are allowed; privileged changes must call controlled backend actions.
- **RSK-01:** Basic rules and manual review cover identity mismatch, fake credentials, related parties, payment anomalies, collusion, chargebacks, and off-platform solicitation.

## 5.9 Reporting, language, and accessibility

- **REP-01:** Users see booking and financial history plus applicable receipts or payout statements.
- **REP-02:** Finance can export allocations, events, and provider references.
- **REP-03:** Management can export core marketplace and Operations metrics without a dedicated liquidity dashboard.
- **LOC-01:** Thai is the launch language; English fields may be stored where useful.
- **LOC-02:** THB uses integer satang; times store UTC and display Asia/Bangkok.
- **ACC-01:** Core flows work on common mobile and desktop browsers; critical states are not color-only.

---

# 6. Core rules and lifecycles

## 6.1 Key terms

| Term | Meaning |
|---|---|
| Invitation | Non-binding clinic request for interest. |
| Application | Non-binding professional request for consideration. |
| Offer | Binding clinic proposal, pending acceptance and payment. |
| Soft hold | Temporary schedule block after offer acceptance. |
| Booking | Accepted, eligible, durably prefunded agreement. |
| Payment Protected | Funds captured, safeguarded, or provider-guaranteed through service and normal cancellation/completion. |
| Service completion | Work accepted, auto-accepted, clinic-confirmed, or support-resolved. |
| Financial settlement | Required payout/refund actions completed or formally resolved. |

## 6.2 State ownership

| Record | States |
|---|---|
| Shift | Draft, Published, Paused, Closed, Cancelled, Archived |
| Application | Submitted, Shortlisted, Offer Sent, Booked, Withdrawn, Declined, Not Selected, Expired |
| Invitation | Sent, Viewed, Interested, Declined, Withdrawn, Expired |
| Offer | Pending Response, Awaiting Payment, Converted, Declined, Withdrawn, Expired, Payment Failed |
| Booking | Confirmed, In Progress, Awaiting Completion, Service Completed, Cancelled, Archived |
| Payment Order | Created, Pending, Payment Protected, Failed, Expired, Refunding, Refunded, Exception |
| Payout | Not Eligible, Processing, Paid, Failed, Held, Reversed where lawful |
| Refund | None, Pending, Partially Refunded, Refunded, Failed, Exception |

Holds and support cases are overlays; they do not overwrite history. Customer labels such as “Awaiting Payment” or “Filled” are derived from the owning records.

## 6.3 Eligibility at confirmation

All must be true:

- Active verified clinic and professional.
- Required licence and specialty (for licensed professions) valid through shift end.
- Required insurance valid through shift end.
- Supported clinic service and shift category.
- No suspension, hold, overlap, or expired offer.
- Durable prefunding succeeds.

A late payment after offer expiry never creates a booking; it enters refund or payment-exception handling.

## 6.4 Non-negotiable integrity rules

- One position, at most one confirmed booking.
- No overlapping confirmed bookings or accepted-offer holds.
- Accepted terms and verification snapshots are immutable.
- Financial commands are idempotent and amount-limited.
- No duplicate payout or refund.
- No direct editing of balances or provider outcomes.
- Every privileged change is audited.
- Suspended or expired users cannot enter new bookings.
- No patient-identifiable data is required in normal workflows.

---

# 7. Data, architecture, security, and quality

## 7.1 Core data groups

- **Identity and access:** users, clinic workspaces, memberships, professional profiles.
- **Trust:** identity, credentials, insurance, payout accounts, audit records.
- **Marketplace:** availability, preferences, shifts, applications, invitations, offers, holds, bookings, messages, reviews.
- **Operations:** arrival/completion events, support cases, risk incidents.
- **Finance:** payment orders, allocations, events, payouts, refunds.

Restricted identity, bank, credential, insurance, message, and case data must be access-controlled and retained only as legally required.

## 7.2 Architecture

Phase 1 may use:

- Responsive web application.
- Modular backend and relational database.
- Background jobs for expiries, reminders, auto-accept, and reconciliation.
- Secure document storage.
- Payment, email, SMS, and identity/verification integrations.
- Low-code internal tools calling controlled APIs.

No microservices, dedicated search engine, real-time chat service, fraud engine, or general-ledger platform is required.

## 7.3 Security and privacy

- Thai PDPA-aligned notice, consent/legal basis, access, correction, deletion, and retention processes.
- Encryption in transit and at rest.
- MFA for internal users; fresh OTP for sensitive external changes.
- Least privilege, field masking, audit, rate limiting, secure secrets, and dependency/file scanning.
- Patient data prohibited in profiles, shifts, applications, messages, and reviews.
- A general patient-data classifier is not required; warnings, reporting, and manual removal are sufficient for Phase 1.
- Terms and electronic acceptances must be legally reviewable and versioned.

## 7.4 Quality targets

- Core pages: p95 under 2.5 seconds on normal mobile conditions, excluding provider delays.
- Search: p95 under 2 seconds for Phase 1 scale.
- Payment callbacks and money commands: retry-safe and idempotent.
- Critical actions remain available during partial notification failure.
- Supported browsers: current and previous major Chrome, Safari, and Edge.
- Core flows are keyboard-usable and provide clear Thai labels and errors.

---

# 8. Operations and measurement

## 8.1 Support model

**Hours:** 06:00–22:00 Asia/Bangkok daily. Overnight categories require explicit approval and on-call coverage.

**Targets:**

- Shift within two hours: urgent escalation.
- Same-day booking issue: first response within 30 minutes during support hours.
- Ordinary issue: within four business hours.
- Complete verification: within one business day at pilot volume.

Targets are not guarantees.

## 8.2 Ownership

- **Operations:** verification, matching help, ordinary cases, cancellations, reviews, suspensions.
- **Finance:** daily reconciliation, payouts, refunds, payment exceptions, financial documents.
- **Administrator:** permissions, high-risk cases, configuration, exceptional approvals.

Manual work is acceptable only when status stays clear, actions are controlled and audited, and the transaction can be reconstructed.

## 8.3 Metrics

**North star:** completed verified bookings per week.

**Core:** active clinics/professionals, valid shifts, eligible-response rate, fill rate, time to first response, show rate, repeat use, completion-to-payout time.

**Guardrails:** support minutes per booking, credential failures, cancellation/no-show rate, review reports, payment exceptions, reconciliation differences, privacy/security/safety incidents.

Phase 1 internal targets:

- 70% of valid shifts receive an eligible response within 24 hours.
- 50% reach confirmed booking.
- 95% show rate.
- 90% of undisputed payouts initiated within one business day.
- Reconciliation exceptions below 1%, with no unexplained discrepancy.
- Support contact trending below 15% of completed bookings.
- Operations time trending below 30 minutes per completed booking by booking 100.

## 8.4 Commercial model

Phase 1 committed revenue is the 12% transaction fee. Report GMV, platform revenue, and professional compensation separately.

Forecasts must include payment cost, verification, support, outreach, refunds, reconciliation, compliance, and acquisition. Subscriptions, sponsored visibility, insurance revenue, and LMS revenue enter forecasts only after the product exists and willingness to pay is proven.

---

# 9. Acceptance and BDD handoff

## 9.1 Phase 0 exit

- 30 completed paid bookings.
- 80% of the final ten use the intended product path.
- Ten completed bookings originate from customer search, posting, application, or invitation—rather than Operations selecting both sides.
- Repeat use or clear repeat intent from at least two clinics and ten professionals.
- No unresolved money discrepancy or invalid mandatory licence (where the profession requires one) in a confirmed booking.
- Every completed booking has accepted terms, payment, completion, allocation, and financial-event records.
- Core usability issues resolved; legal, payment, tax, privacy, and claim wording approved.

## 9.2 Phase 1 release gate

- All Phase 1 requirements implemented or explicitly waived by the Product Owner and relevant risk owner.
- Payment Protected behavior validated with the selected provider.
- Verification and Finance runbooks tested.
- Role boundaries, idempotency, financial conservation, and audit tested.
- Critical browser/mobile journeys pass.
- Support, incident, and reconciliation readiness confirmed.

## 9.3 Definition of done

A feature is done when:

- Requirement and acceptance scenarios are approved.
- Happy path and material failure paths pass.
- Permissions, privacy, audit, and analytics are covered.
- Thai copy and responsive layout are reviewed.
- Operations documentation is updated where needed.

## 9.4 BDD coverage

BDD should cover at least:

1. Verification and restricted browsing.
2. Availability, Open to requests, and conflict prevention.
3. Search, empty results, applications, and invitations.
4. Clinic authority and one active offer.
5. Offer expiry, soft hold, payment, and atomic confirmation.
6. Late/duplicate callbacks and financial conservation.
7. Urgent priority without guarantee.
8. Messaging and patient-data rules.
9. Completion, auto-accept, clinic fallback, and Operations queue.
10. Cancellation, no-show, partial work, and support outcomes.
11. Payout/refund idempotency and different-person approval.
12. Reviews, cold-start safeguards, and related-party exclusion.
13. Credential or insurance failure after confirmation.
14. Derived customer status and immutable audit history.

---

# 10. Risks and launch validations

## 10.1 Main risks

| Risk | Mitigation |
|---|---|
| Weak supply or demand | Concierge matching, honest empty states, focused recruitment. |
| Manual Operations overload | Track staff time; automate only recurring bottlenecks. |
| Credential error | Official-source review, expiry checks, holds, audit. |
| Payment or refund error | Regulated partner, idempotency, conservation checks, daily reconciliation. |
| No-show or unsafe shift | Clear policies, reminders, cases, suspension process. |
| Misleading claims | Approved claim list; no guaranteed fill, universal insurance, or unsupported escrow wording. |
| Privacy breach | No patient data by design, restricted storage, least privilege, incident process. |
| Premature expansion | Phase criteria and separate validation for each employer/profession. |

## 10.2 Required before public launch

- Thai legal review: marketplace terms, worker classification, electronic agreements, liability, cancellation, dispute, and marketing claims.
- Payment-partner approval of durable Payment Protected flow, refunds, payouts, chargebacks, and settlement timing.
- Accounting/tax decision: VAT, withholding, invoices, receipts, and professional payout documents.
- Confirmed official sources and manual verification procedure for clinics, professionals (dental assistants and nurses), licences (where applicable), and insurance evidence.
- Approved launch categories and prohibited/high-risk work.
- Data-retention schedule and incident contacts.
- Final service fee, support hours, cancellation policy, and offer timers.

## 10.3 Approved launch claims

Use:

- Verified against approved official sources.
- Real-time matching and booking status.
- Payment Protected through an approved partner.
- Payout initiated within one business day after accepted completion.
- Verified insurance evidence, where provided.
- Urgent matching assistance; fulfilment not guaranteed.

Do not use without separate approval:

- Automatically verified by the professional council.
- Escrow.
- Insured by ProBooking or every shift insured.
- Instant booking or guaranteed replacement.
- Money received within 24 hours.

---

# 11. Executive decisions

1. ProBooking is a temporary clinic-shift marketplace, not patient booking or payroll.
2. Phase 1 covers one-position dental assistant and nurse shifts at one verified clinic branch.
3. Bangkok and surrounding provinces launch first.
4. Verification may be manual; mandatory verification is free.
5. Two-sided search, availability, invitations, reviews, urgent assistance, and Payment Protected remain launch selling points.
6. One active offer exists per shift; acceptance is not confirmation.
7. Confirmation requires durable prefunding and final eligibility checks.
8. The clinic pays a default 12% service fee.
9. ProBooking does not use unsupported escrow or insurance claims.
10. Scheduled compensation is fixed; unusual service outcomes are support-resolved.
11. Operations may decide exceptions; controlled systems execute credential and money changes.
12. The launch product is responsive web with simple internal tools.
13. Phase thresholds guide management, not product access.
14. Later automation and expansion require observed payoff and segment-specific validation.
15. The rollout plan owns phase reviews; this PRD owns product requirements.
