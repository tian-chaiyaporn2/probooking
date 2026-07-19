# Investor demo — what I need to do myself

**Audience:** Product, design, and eng preparing a live demo  
**Lens:** An invited investor who cannot yet navigate the product the way a customer would  
**Source of truth for behavior:** [`PRD_v1.5.md`](PRD_v1.5.md) §4 (journeys) and §2.2 (Phase 0)  
**Promise to prove:** *Verified. Available. Bookable. Payment Protected.*

This is not a feature backlog. It is the checklist of **hands-on actions** I must be able to take without a scripted “run everything” button. If I cannot find and complete these paths, I do not yet trust that clinics and professionals will.

---

## What is now built (state of the demo)

The gaps this checklist first flagged are addressed — the app is now navigable by hand from every role:

- The **home page leads with a role picker** ("pick a role to start the demo"). Each card shows its mock phone and auto-fills the OTP, so one click signs you in and lands you on that role's workspace. The one-click `/flow` automation is demoted to a dev-team smoke test in the footer.
- **Clinic** (`/clinic`) and **Professional** (`/pro`) are full interactive workspaces: post/curate shifts, send offers, pay, confirm, complete, review — and pick up work, accept offers, arrive/complete, get paid.
- **Operations** (`/ops`) verifies clinics/professionals, reviews insurance, resolves credential holds, and enforces holds/suspensions on live bookings.
- **Finance** (`/finance`) reconciles, exports CSV, and runs a **dual-control refund** (a second finance person must approve).
- A **"reset demo"** control (on `/signin`) restores the seeded dataset for a clean run.

Everything below remains the **standing pass/fail bar** — the customer journeys the demo must keep proving as the product evolves.

> **Running the demo:** the deployed GitHub Pages site is static; it needs a reachable API. The team runs the API locally in **seeded, in-memory demo mode** + a public tunnel (`scripts/tunnel-deploy.sh`, which redeploys Pages at the tunnel URL). Reviewer sign-in is effortless (OTP codes auto-fill), and because the store is in-memory and seeded, it only ever touches fake demo data. The `/auth/dev/token` admin route stays off in demo mode (it needs `DEV_TOKEN_ROUTE=true`, used only by the e2e suite), so the tunnel is safe to share. See the header of `scripts/tunnel-deploy.sh` for the exact start command.

---

## A. First five minutes (orientation)

I want to:

1. Land on a page that states what ProBooking is in one sentence and **who I am** (clinic vs professional vs staff).
2. Choose **Clinic owner**, **Professional**, **Operations**, or **Finance** and land on that role’s workspace — not a generic console.
3. See, without explanation, where the happy path starts for that role.
4. Switch roles cleanly (sign out / switch account) so I can play both sides of one booking.

---

## B. Clinic — staff a temporary shift

As a clinic owner/admin, I want to:

1. Open my branch workspace and see my identity and verification status.
2. Post a shift with schedule, scope, and compensation (and optional urgent).
3. See open shifts, drafts, and filled/closed ones with plain-language status.
4. Browse or receive **eligible** professionals (or applicants) for a shift.
5. Invite interest or review applications without binding either party yet.
6. Send **one** binding offer with exact terms, fee, and expiry I can read.
7. After the professional accepts, **pay** within the funding window and see checkout split: compensation, 12% fee, tax if any, total.
8. See the booking become **Confirmed** and **Payment Protected** — not vague “success.”
9. Open the booking thread / contact path that appears only after confirmation.
10. Confirm completion (or open support) after the shift.
11. See financial outcome (protected → payout/refund path) and leave a review.
12. Cancel under clear rules and see what the clinic and professional each get.

If search is empty, I want an honest empty state plus a next step (post a shift / ask for matching help) — not a dead end.

---

## C. Professional — find work and get paid

As a verified dental assistant/nurse, I want to:

1. Open my workspace and see verification, licence, and payout readiness at a glance.
2. Set availability (or see that without it I am not shown as available).
3. Browse open shifts with filters that matter: when, where, pay, urgency, clinic trust signals.
4. Apply to a shift or respond to an invitation (non-binding).
5. Receive an offer, read the **exact** terms, and accept or decline before any money moves.
6. See **Payment Protected** before treating the booking as real.
7. Mark arrived / completed without QR or GPS theater.
8. Track payout status until money is initiated/paid.
9. Leave a review after a completed paid booking and see that cold-start ratings do not fake reputation.

I want conflict prevention to be visible: I cannot accept overlapping work.

---

## D. Trust gates (prove “Verified”)

Before money or binding commitment, I want to see that:

1. Unverified users can browse only restricted content and **cannot** transact.
2. Operations can verify (or request more info on) a clinic and a professional.
3. Public/profile views separate verified facts from self-declared claims.
4. A credential or insurance problem after confirmation puts the booking on a **Hold** that blocks payout until Ops resolves it.
5. Related-party / self-booking paths are blocked or clearly refused.

---

## E. Money and exceptions (prove “Payment Protected”)

As Finance (and as a customer watching status), I want to:

1. See a payment order and booking allocation that match the checkout I paid.
2. Initiate undisputed payout after accepted completion (or see the status toward “within one business day”).
3. Run a refund with **two different** authorized people when dual control applies.
4. Export or inspect reconciliation artifacts so money is not a black box.
5. Open a support case from a booking problem and see Open → decision → visible outcome for both parties.
6. Confirm staff cannot silently edit financial truth or terminal provider states.

---

## F. Operations — concierge without breaking the product

As Operations in Phase 0, I want to:

1. Find pending clinic/professional verifications and approve, reject, or request information.
2. Help matching when the marketplace is thin — without erasing the customer-owned booking record.
3. Resolve holds, attendance disputes, and credential failures through controlled actions.
4. Leave an audit trail I can show: who did what, when, on which booking.

I should never need a shared spreadsheet to complete a normal Phase 0 booking.

---

## G. Cross-cutting UX I will notice in the room

I want to:

1. Use Thai UI on phone and desktop without broken critical states.
2. Always know **current** status (application, offer, payment, booking, completion, payout/refund, support) in customer language.
3. See times in Asia/Bangkok and money in THB without rounding surprises.
4. Get critical alerts that match the moment (offer expiring, pay now, confirmed, cancel/hold, reminders) — even if SMS is mocked in the demo, the product must show what would fire.
5. Complete the intended path **without** an engineer clicking “Run flow” for me.

---

## Demo pass / fail (investor bar)

| Pass if… | Fail if… |
|---|---|
| I can staff one shift as clinic and complete it as professional by navigating role UIs | Only the scripted `/flow` path works |
| Status and money labels match what I just did | Status is opaque, wrong, or only visible in Ops |
| Empty, expired, declined, and held states are reachable and honest | Demo only shows the green happy path |
| Ops/Finance actions are privileged, controlled, and auditable | Staff “fix” money or verification off-platform |
| I can explain the product to another investor in two minutes using only the UI | Presenter must narrate screens that customers would not find |

---

## Suggested demo script (order of proof)

1. **Sign in as clinic** → post shift → see candidates/applicants → send offer.  
2. **Switch to professional** → apply or accept offer → see Payment Protected after clinic pays.  
3. **Switch back to clinic** → confirm payment/confirmation state → complete → review.  
4. **Ops** → verify a pending party, review submitted insurance, or hold/suspend a live booking.  
5. **Finance** → dual-control refund (propose, then approve as a *second* finance account) or reconciliation export.  
6. Optional: show one failure path (offer expiry, cancel under 24h, credential hold).
7. **Reset demo** (on `/signin`) between runs to restore a clean seeded dataset.

Start from the **home page role picker** (or `/signin`) → `/clinic` | `/pro` | `/ops` | `/finance`. Every role has a ready-made account whose mock phone is shown on the card and whose OTP auto-fills. Treat `/flow` as an eng smoke test, not the investor demo.

---

## Out of scope for this checklist

Permanent hiring, patient booking/EMR, nurses, multi-branch enterprise, native apps, real-time chat, guaranteed fill / Instant Book, subscriptions, LMS — per PRD §1.6. Do not demo them; do not apologize for them in the first pass.
