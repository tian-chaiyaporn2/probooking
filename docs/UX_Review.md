# ProBooking — UX Expert Review

**Reviewer stance:** Independent UX consultant  
**Product stage:** Phase 0 — Concierge Validation  
**Surfaces reviewed:** Landing (`/`), booking demo (`/flow`), Operations (`/ops`), Finance (`/finance`), shared shell & design system  
**Sources:** Live UI code (`apps/web`), design tokens, Thai copy (`lib/strings.ts`), PRD v1.5 journeys & principles  
**Date:** 2026-07-18

> **Implementation note (same PR):** Priority recommendations from §7 are landed in-code —
> Phase 0 honesty (landing/nav), staff depth (Ops confirm + per-row busy + session + Finance drill-down),
> and a Thai `/journey` offer→Payment Protected→payout walkthrough. See the app routes and components below.
>
> **Superseded in part:** After merges, `/clinic` and `/pro` workspaces + RolePicker exist.
> See [`UX_Review_Followup.md`](./UX_Review_Followup.md) for the current-state review and follow-up work.

---

## 1. Executive summary

ProBooking’s current web app is a **strong Phase 0 shell**: a Thai-first “clinical trust” brand, careful accessibility primitives, and clear staff tools for Ops and Finance. It does **not** yet deliver the clinic or professional self-service journeys defined in the PRD.

For Phase 0 that split is intentional (concierge + demo). The UX risk is **trust and expectation**: the landing page sells a marketplace experience that primary users cannot yet walk through screen-by-screen. Staff tools are usable but thin on judgment support. Closing the gap between brand promise and interactive journey should be the priority before Phase 1 marketing.

**Overall readiness**

| Audience | UX readiness | Verdict |
|---|---|---|
| Prospect / clinic / professional | Low | Marketing + demo only; no real booking IA |
| Operations staff | Medium | Verify + hold resolve works; limited case depth |
| Finance staff | Medium | Reconciliation + export works; limited investigation UX |
| Design system / a11y foundation | High | Tokens, Thai type, focus, toasts, empty/loading are solid |

---

## 2. Review method

Evaluated against:

1. **PRD product principles** (§1.4): clear terms/fees/status; verify before commitment; automate happy path / operate exceptions  
2. **Core journeys** (§4.1–4.3): clinic, professional, exception  
3. **Heuristics:** clarity, feedback, error recovery, trust, cognitive load, mobile readiness, accessibility  
4. **Phase fit:** Is the UI honest about Phase 0 vs implying Phase 1 self-service?

---

## 3. What’s working well

### 3.1 Brand & visual direction

- Distinct **clinical-trust** palette (teal primary, soft mint wash) — not generic purple/AI-default.
- Thai-first typography (Anuphan + Sarabun) with correct tracking/line-height rules for Thai.
- Landing hero treats **ProBooking** as the hero signal; mock checkout card communicates Payment Protected, fee split, and verified professional in one glance.
- Light/dark theme, restrained motion, `prefers-reduced-motion` respected.

### 3.2 Design system discipline

- Tokenized CSS layers (`tokens` → `base` → `components` → `pages`).
- Shared primitives: Button, Field, Stat, Badge, DataTable, EmptyState, Skeleton, Toast.
- Semantic tones (`success` / `warning` / `danger`) used consistently on Ops metrics and Finance conservation flags.
- Cards reserved for interactive queues, not decorative chrome.

### 3.3 Accessibility baseline

- Skip link, `lang="th"`, focus rings, 44px touch minimum, safe-area insets.
- Mobile nav drawer: focus trap, Escape, backdrop, `inert` on main, restore focus.
- Form labels, `aria-invalid` / `aria-describedby`, toast live regions.
- Table captions and keyboard-focusable scroll regions.

### 3.4 Staff authentication UX

- Phone → OTP is the right mental model for Thai staff (AUTH-01).
- Role gate before treating a token as Ops/Finance access — good fail-closed UX.
- Auto-advance focus between stages; clear Thai errors for OTP and permission failures.
- Sign-out + session wipe on 401/403 is correct.

### 3.5 Ops / Finance task clarity

- Ops: metrics → pending verification → open cases is a sensible priority stack for Phase 0.
- Empty states communicate “queue clear” (good for trust in a low-volume concierge phase).
- Finance: summary stats + conservation badges + CSV export match the “reconcile and escalate” job.

---

## 4. Findings

Severity: **P0** blocks trust or Phase 0 validation · **P1** hurts daily use · **P2** polish / Phase 1 prep

### F1 — Promise vs product gap on the landing surface · **P0**

**Observation:** The homepage describes a full marketplace (search, compare, invite, book, payout). Primary CTAs lead to a **developer/e2e harness** (`/flow`) and internal staff tools. There is no clinic or professional workspace.

**Why it matters:** Clinics and professionals evaluating Phase 0 will form expectations from the first viewport. A demo that “runs the booking” without role-specific screens can feel like a technical proof, not a product they can use.

**Recommendation:**

- Reframe landing CTAs for Phase 0: “ดูเส้นทางธุรกรรม” / “ติดต่อทีมคอนเซียร์จ” rather than implying self-service booking.
- Add a short **audience switch** (“สำหรับคลินิก / สำหรับบุคลากร / สำหรับทีมภายใน”) that sets honest next steps.
- Keep `/flow` labeled clearly as **demo for developers / validation**, not the user journey.

---

### F2 — Booking journey has no human task model · **P0** (for Phase 1; known Phase 0 gap)

**Observation:** `/flow` is a single-button vertical slice: register → verify → offer → accept → confirm → complete → payout → review. Progress is a log of API steps, mostly English, not a multi-step UI for either party.

**Why it matters:** PRD journeys (§4.1–4.2) require decision moments: review terms, see fee breakdown, accept offer, fund within window, mark completion. Those moments are where trust is won or lost. They are not designed yet.

**Recommendation (Phase 1 IA sketch):**

| Party | Minimum screens |
|---|---|
| Clinic | Onboard → post shift → applicants → send offer → checkout (fee breakdown) → booking status → complete/review |
| Professional | Onboard → availability/shifts → offer detail → accept → Payment Protected confirmation → complete → payout status |
| Shared | Status timeline with plain-language states (Offered → Held → Confirmed → Completed → Paid) |

Until those exist, treat `/flow` as internal validation only.

---

### F3 — Money clarity is strong in the mock, weak in real workflows · **P0**

**Observation:** The hero mockcard excellently shows compensation, 12% fee, and total with Payment Protected. Live surfaces do not yet reproduce that clarity at the moment of commitment (offer accept / confirm). Finance shows conservation, not a user-readable money story.

**Why it matters:** Principle 5: *Show terms, fees, and status clearly.* Money surprises destroy marketplace trust.

**Recommendation:** Make the mockcard layout the **canonical checkout pattern** (`KeyValueTable` already exists). Reuse it on offer accept, confirm, and booking detail. Always show: professional pay · platform fee · tax/withholding if any · total · protection status.

---

### F4 — Ops verify / resolve actions lack judgment support · **P1**

**Observation:** Pending rows show name, kind badge, truncated id, and **Verify**. Cases show kind, subject/state, truncated ref, and **Resolve hold**. No licence number, submitted evidence, address, specialty, risk notes, or confirm dialog.

**Why it matters:** Verification and hold release are high-stakes. One-click actions without review context invite rubber-stamping or hesitation/slowdown.

**Recommendation:**

- Expand row → detail: submitted fields, evidence checklist, “Needs information” path (VER states from PRD).
- Confirm destructive/irreversible actions with a short dialog naming the entity.
- Differentiate case types in the UI (credential hold vs completion review vs cancellation) with required next action, not only a badge.

---

### F5 — Global busy lock on Ops queues · **P1**

**Observation:** A single `busy` flag disables/spins verify and resolve across the page while any action runs.

**Why it matters:** Under a real queue, operators cannot parallelize or continue scanning; feels fragile and blocks throughput.

**Recommendation:** Per-row busy state (or action id). Keep list interactive except the row in flight.

---

### F6 — Session model is memory-only · **P1**

**Observation:** Ops/Finance token lives in React state. Refresh = signed out. No “remember this device,” expiry messaging before wipe, or last-used phone convenience.

**Why it matters:** Internal tools are refreshed often. Repeated OTP friction reduces tool adoption; silent wipe without explanation can feel like a bug.

**Recommendation:** Persist session securely (httpOnly cookie preferred) with clear expiry. On expiry, return to login with “เซสชันหมดอายุ” (copy already exists) rather than an empty auth card with no reason.

---

### F7 — Nav mixes audiences · **P1**

**Observation:** Primary nav exposes หน้าแรก · ปฏิบัติการ · การเงิน · เดโม to everyone. Public visitors see staff and demo destinations; staff see demo next to production tools.

**Why it matters:** Confuses mental model of “who is this product for?” and increases accidental entry into gated or technical surfaces.

**Recommendation:**

- Public nav: brand + how it works + contact / waitlist.
- Staff tools behind role or a separate `/staff` entry.
- Hide `/flow` from production nav or gate it to non-production builds.

---

### F8 — Language split undermines polish · **P1**

**Observation:** UI chrome is Thai; `/flow` step results and some toasts/identifiers remain English (intentional for e2e). Finance export filename is English (`finance-export.csv`).

**Why it matters:** LOC-01 launches in Thai. Mixed language in a “booking demo” CTA from the Thai homepage breaks immersion for non-technical evaluators.

**Recommendation:** Dual mode: Thai labels for human demo; keep English `data-testid` / result keys for e2e. Or separate `/flow` (QA) from a Thai “ตัวอย่างธุรกรรม” walkthrough.

---

### F9 — Empty states are calm but incomplete · **P2**

**Observation:** Empty queues say “คิวว่าง” / “ไม่มีเคส” with an icon only — no next step, no link to refresh guidance, no “what happens when something arrives.”

**Recommendation:** One-line helper: “เมื่อมีคลินิกส่งเอกสาร รายการจะปรากฏที่นี่” + optional refresh. For Finance empty/exception zero, celebrate conservation briefly (already partially done via success tone on stats).

---

### F10 — Finance investigation depth · **P2**

**Observation:** Table shows truncated booking id, undistributed amount, conserved yes/no. No drill-down to payment order legs, timeline, or exception reason. Cap at 25 rows with a “showing X of Y” note.

**Why it matters:** Reconciliation exceptions need a story: what broke, what to do.

**Recommendation:** Row expand or detail drawer with order components (capture / payout / refund). Filter “exceptions only.” Pagination or virtual scroll beyond 25.

---

### F11 — No exception journey for end users · **P2** (Phase 0 known; Phase 1 critical)

**Observation:** PRD §4.3 requires users to open a support case and see decisions. UI only lets Ops resolve credential holds. No user-facing case intake or status.

**Recommendation:** Even in concierge mode, expose a read-only “สถานะเคส” on booking detail once Ops opens a case, so users are not blind.

---

### F12 — Hero visual is product-mock, not full-bleed atmosphere · **P2**

**Observation:** Hero uses a strong mock checkout card on a branded wash — excellent for explaining Payment Protected. It is not a full-bleed environmental hero (clinic/shift context imagery).

**Why it matters:** For a staffing marketplace, place/atmosphere imagery can reinforce “real clinic shifts.” The mock card is the better Phase 0 choice for teaching the money model; revisit imagery when recruiting supply/demand at scale.

**Recommendation:** Keep the checkout as the primary visual for trust education. Optionally add a subtle photographic texture behind the wash later — do not replace the fee breakdown with decorative collage.

---

### F13 — Feedback patterns favor toast over confirmation · **P2**

**Observation:** Success/error via toasts; verify/resolve are immediate. No undo. No inline success on the row before it disappears.

**Recommendation:** Optimistic removal with undo toast (5s) for verify if API allows; otherwise brief confirm + toast. Prefer assertive errors (already done) and keep success polite.

---

### F14 — Design system readiness vs journey coverage · **P2**

**Observation:** Primitives are ahead of screens. Missing patterns needed soon: modal/dialog, stepper, status timeline, profile header, filter bar, calendar/availability blocks, message thread, file upload for credentials.

**Recommendation:** Before Phase 1 feature build, add a short **pattern inventory** for the journeys above so screens compose tokens instead of inventing one-offs.

---

## 5. Journey gap matrix (PRD vs UI)

| Journey step | Clinic | Professional | In UI today |
|---|---|---|---|
| Register / verify | Required | Required | API + Ops verify only |
| Profile build | Required | Required | Not in UI |
| Search / post / availability | Required | Required | Not in UI |
| Apply / invite / offer | Required | Required | Demo harness only |
| Accept + Payment Protected | Required | Required | Demo + landing mock |
| Booking coordination | Required | Required | Not in UI |
| Complete / payout / review | Required | Required | Demo harness only |
| Support case | Both | Both | Ops resolve hold only |
| Staff verify / reconcile | Ops | Finance | Implemented |

---

## 6. Heuristic scorecard (current build)

| Heuristic | Score (1–5) | Note |
|---|---:|---|
| Visibility of system status | 3 | Good on staff dashboards; weak on marketplace states |
| Match to real world (Thai clinic staffing) | 2 | Brand fits; interactive journeys missing |
| User control & freedom | 3 | Sign-out, theme, errors; no undo on irreversible Ops acts |
| Consistency & standards | 4 | Strong token/component consistency |
| Error prevention | 3 | Role checks good; verify lacks confirm/context |
| Recognition over recall | 3 | Badges/stats help; truncated ids hurt |
| Flexibility & efficiency | 2 | Global busy; no filters/shortcuts |
| Aesthetic & minimalist design | 4 | Landing and staff chrome are calm and purposeful |
| Help users recover from errors | 4 | Thai error map, alerts, retry boundary |
| Help & documentation | 2 | No in-product help; PRD is internal |

---

## 7. Prioritized recommendations

### Do now (Phase 0 honesty)

1. **Reposition landing** for concierge validation — honest CTAs, audience framing, demote `/flow`.
2. **Separate nav by audience** — public vs staff vs demo.
3. **Thai-humanize the demo** if it remains a sales/validation tool for clinics.

### Do next (staff tool depth)

4. **Ops review detail + confirm** before verify / resolve.
5. **Per-row busy** and clearer case-type actions.
6. **Durable staff session** with expiry messaging.
7. **Finance exception drill-down** and exceptions filter.

### Do for Phase 1 MVP

8. Build the **clinic and professional happy-path screens** around offer → Payment Protected → complete.
9. Reuse the **checkout fee pattern** everywhere money moves.
10. Add **status timeline**, support case visibility, and credential upload patterns.
11. Expand design system with dialog, stepper, filters, thread, upload.

---

## 8. Closing verdict

ProBooking’s UX foundation — brand, Thai typography, accessibility, and staff dashboards — is **above average for a Phase 0 concierge product**. The critical gap is not visual polish; it is **journey completeness and expectation management**. The product principles (clear terms, verify before bind, operate exceptions) are visible in domain/API design and in the landing mock, but not yet in interactive marketplace UX.

Treat the next UX investment as: **(1)** make Phase 0 messaging ruthlessly honest, **(2)** deepen Ops/Finance so concierge work is safe and fast, **(3)** design the offer-to-payout screens that will become Phase 1’s actual product.

---

## Appendix — Surfaces reviewed

| Path | Role |
|---|---|
| `apps/web/src/app/page.tsx` | Marketing landing |
| `apps/web/src/app/flow/page.tsx` | Booking vertical-slice demo |
| `apps/web/src/app/ops/page.tsx` | Operations dashboard |
| `apps/web/src/app/finance/page.tsx` | Finance reconciliation |
| `apps/web/src/components/*` | Design system primitives |
| `apps/web/src/styles/tokens.css` | Clinical-trust tokens |
| `apps/web/src/lib/strings.ts` | Thai UI copy |
| `docs/PRD_v1.5.md` | Journeys & principles |
