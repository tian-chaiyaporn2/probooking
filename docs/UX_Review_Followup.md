# ProBooking — UX Review Follow-up (post-merge)

**Date:** 2026-07-18  
**Scope:** Full app after RolePicker, clinic/pro dashboards, Ops enforcement, Finance refunds, and prior UX tier work.

---

## Verdict

ProBooking is now a **credible Phase 0 investor demo**: RolePicker → real `/clinic` and `/pro` happy paths, plus staff Ops/Finance. The original review’s “no marketplace IA” claim is obsolete.

Money clarity at commitment (CheckoutSummary on clinic confirm / pro accept) and Thai status labels shipped in the prior follow-up. This pass closes the remaining open items that were API-backed and IA-related.

| Audience | Readiness | Notes |
|---|---|---|
| Investor / demo driver | High | RolePicker + clinic/pro walk a real booking |
| Clinic / professional (Phase 1) | Medium–High | Profiles, shift filters, search, booking thread |
| Ops / Finance | High | Confirm dialogs, recon drill-down, dual-control refunds |
| Design system | High | Tokens, Dialog, CheckoutSummary, timeline, icon RolePicker |

---

## What’s working

- Landing leads with RolePicker; journey + audience orientation sits **below** (no competing heroes)
- Clinic: post → offer (named candidates) → confirm → complete/cancel + booking thread
- Pro: profile panel, filtered browse, apply → accept → arrive/complete → review + thread
- Ops/Finance: single canonical `probook.session` (legacy staff keys purged)
- RolePicker uses design-system icons (no emoji)
- `/journey` Thai guided path; `/flow` demoted to smoke/e2e

---

## Findings → follow-ups shipped

| Gap | Action |
|---|---|
| No checkout on clinic confirm / pro accept | `CheckoutSummary` + `buildCheckout` on commitment moments |
| English machine states on party dashboards | Thai `statusLabel` + next-action hints |
| Dual session leak (staff ↔ party) | One `probook.session` store; RolePicker clears before save; Ops/Finance use same key |
| Ops hold/suspend one-click | Confirm dialogs |
| E2e walkthroughs missed `dialog-confirm` | Specs updated |
| Candidate IDs only | Resolve display names via `GET /professionals/:id/profile` |
| Emoji RolePicker | Icon keys → Clinic / Stethoscope / Shield / Wallet |
| Thin Phase 1 surfaces | Profile panel, shift filters, pro search, BookingThread + §7.3 soft-warn |
| Landing IA | RolePicker primary; journey/audience secondary section |

---

## Still open (later phases)

1. Full schedule / availability calendar UI (AVL API exists; UI not built)
2. Invite-from-search → offer in one click from search results
3. httpOnly cookie session via BFF (static export cannot set httpOnly today — documented in `lib/session.ts`)

---

## Session note

Next `output: "export"` + Bearer-only API → client `sessionStorage` is the realistic Phase 0 store. Canonical key: `probook.session` `{ token, phone, role? }`. Compatible with e2e `injectSession`.

---

## Appendix — routes

`/` · `/signin` · `/clinic` · `/pro` · `/ops` · `/finance` · `/journey` · `/flow`
