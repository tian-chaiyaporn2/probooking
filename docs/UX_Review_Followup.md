# ProBooking — UX Review Follow-up (post-merge)

**Date:** 2026-07-18  
**Scope:** Full app after RolePicker, clinic/pro dashboards, Ops enforcement, Finance refunds, and prior UX tier work.

---

## Verdict

ProBooking is now a **credible Phase 0 investor demo**: RolePicker → real `/clinic` and `/pro` happy paths, plus staff Ops/Finance. The original review’s “no marketplace IA” claim is obsolete.

The remaining trust gap was **money clarity at commitment** on clinic/pro (landing and `/journey` showed fee breakdown; workspaces did not). That is the focus of this follow-up.

| Audience | Readiness | Notes |
|---|---|---|
| Investor / demo driver | High | RolePicker + clinic/pro walk a real booking |
| Clinic / professional (Phase 1) | Medium | Happy path works; profiles, search, messaging still thin |
| Ops / Finance | High | Confirm dialogs, recon drill-down, dual-control refunds |
| Design system | High | Tokens, Dialog, CheckoutSummary, timeline |

---

## What’s working

- Landing leads with RolePicker (honest Phase 0 demo door) + Payment Protected mockcard
- Clinic: post → offer → confirm → complete/cancel
- Pro: apply → accept → arrive/complete → review
- Ops: verify/resolve/hold/suspend with confirms; pending detail
- Finance: exceptions filter, row legs, dual-control refund UI
- `/journey` Thai guided path; `/flow` demoted to smoke/e2e

---

## Findings → this follow-up

| Gap | Follow-up action |
|---|---|
| No checkout on clinic confirm / pro accept | `CheckoutSummary` + `buildCheckout` on commitment moments |
| English machine states on party dashboards | Thai `statusLabel` + next-action hints |
| Dual session leak (staff ↔ party) | `clearSession` clears both stores; RolePicker wipes before save |
| Ops hold/suspend one-click | Confirm dialogs (aligned with verify/resolve) |
| E2e walkthroughs missed `dialog-confirm` | Specs updated |
| Stale UX_Review.md | This follow-up doc + note on original |

---

## Still open (not in this follow-up)

1. Richer profiles, schedule, invite UI, booking thread (PRD Phase 1)
2. Single canonical session store (httpOnly cookie) instead of dual sessionStorage keys
3. Landing IA product call: RolePicker-only vs also surfacing journey/audience cards in the first viewport
4. Candidate names instead of truncated IDs; emoji RolePicker vs icon system

---

## Appendix — routes

`/` · `/signin` · `/clinic` · `/pro` · `/ops` · `/finance` · `/journey` · `/flow`
