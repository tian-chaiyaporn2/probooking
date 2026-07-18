# ProBooking — Secondary Surfaces UX / UI Review

**Date:** 2026-07-18  
**Scope:** Less-visible screens and shared chrome — easy to miss vs clinic / pro / ops / finance happy paths  
**Surfaces:** `/journey`, `/flow`, `/signin`, `error` / `not-found`, BookingThread, Dialog, StaffLogin, RolePicker, CheckoutSummary, StatusTimeline, ProfilePanel, AppHeader / drawer / theme, landing secondary sections, dark theme, toast / skip-link / focus  
**Method:** Code review of pages, components, and CSS  
**Complements:** [`UX_States_Review.md`](./UX_States_Review.md), [`UX_Review.md`](./UX_Review.md), [`Mobile_Tablet_UI_Review.md`](./Mobile_Tablet_UI_Review.md)

> **Remediation (same PR family):** Findings **R1–R45** addressed in-code where actionable — skip-link/`#main`, error chrome, journey actor sync, audience links, thread labels + soft-warn a11y, `/flow` demoted from nav, RolePicker busy a11y, Dialog `confirmDisabled` + `aria-describedby`, StaffLogin OTP phone echo, StatusTimeline `aria-current`, toast timer cleanup, dark table-scroll fades, dead modal/emoji CSS removed. R10/R31 largely landed earlier via i18n #40.

---

## Verdict

Secondary surfaces are wired and mostly Thai, but several still feel **demo/harness-grade**: broken skip-link targets, a misleading journey perspective toggle, English leaks on RolePicker and ProfilePanel, and landing audience tiles that look clickable but go nowhere. Messaging and error recovery are the weakest visual polish relative to staff dashboards.

| Surface | Maturity | Notes |
|---|---|---|
| `/journey` | Medium | Good timeline + checkout; perspective toggle lies |
| `/flow` | Medium (intentional eng) | Fine as harness; elevated too high in Thai nav/footer |
| `/signin` | Medium | Works; missing `#main`; English ops/finance sublabels |
| `error` / `not-found` | Medium–Low / High | 404 branded; error is sparse and skips shell |
| BookingThread | Medium | Soft-warn works; UUID sender labels; a11y gaps |
| Dialog / StaffLogin | High | Solid patterns; small polish left |
| Landing secondary | Medium | Dead audience tiles; unused CSS leftovers |
| Shell / theme / toast | Medium–High | Drawer strong; skip link holes; dark fades weak |

---

## 1. `/journey` — guided walkthrough

**Files:** `apps/web/src/app/journey/page.tsx`, `styles/pages.css`, `lib/strings.ts` (`th.journey`)

### States present
Initial → busy (primary) → step progression with checkout → done card → reset. Errors = toast only.

### Findings

| ID | Sev | Issue |
|---|---|---|
| **R1** | **P1** | **Perspective toggle is cosmetic and misleading.** User can flip คลินิก/บุคลากร freely, but `runStep` drives the real actor and often overwrites `perspective`. `actingAs(...)` can disagree with the next action. No `aria-pressed`. |
| **R2** | **P2** | Dead UI branches: `stepId === "confirm" && bookingId` and `stepId === "payout" && payout` never render in the active card (ids advance with the step). Booking id is shown awkwardly on `complete` via a side paragraph. |
| **R3** | **P2** | English leak: `th.journey.stepDetail.confirm` ends with “Confirmed”. |
| **R4** | **P2** | Failure leaves timeline on the same step with only a toast — easy to miss; no inline step error. |
| **R5** | **P2** | On mobile, aside timeline stacks above the action card and can push the CTA below the fold. |

---

## 2. `/flow` — e2e smoke harness

**Files:** `apps/web/src/app/flow/page.tsx`, `styles/pages.css`, `lib/strings.ts` (`th.flow`)

### States present
Initial preview → running (progress) → booking result → payout → reviews. Errors = toast; partial log may remain.

### Findings

| ID | Sev | Issue |
|---|---|---|
| **R6** | **P1** | **Product placement risk:** Thai chrome (`th.flow`) + English result body (“Booking Confirmed”, “Complete & pay out”, …). Documented as intentional for e2e — but nav “เดโม” and footer link present it as a user surface. |
| **R7** | **P2** | Bypasses shared `CheckoutSummary` for English `KeyValueTable`. |
| **R8** | **P2** | No explicit failure banner when a run aborts mid-progress; bar can stall mid-fraction. |

*Recommendation:* Keep English for Playwright contracts; demote `/flow` from primary nav or label it clearly as engineer smoke (e.g. “ทดสอบระบบ”).

---

## 3. `/signin` — demo role picker + reset

**Files:** `apps/web/src/app/signin/page.tsx`, `components/RolePicker.tsx`, `lib/demo-accounts.ts`

### States present
Initial → per-card busy / all disabled → navigate or toast. Reset uses `Button busy`.

### Findings

| ID | Sev | Issue |
|---|---|---|
| **R9** | **P1** | **`<main>` has no `id="main"`** — layout skip link (`href="#main"`) does nothing. |
| **R10** | **P1** | English leaks on Thai cards: `Operations —`, `Finance —`, `dual-control` in `demo-accounts.ts` sublabels. |
| **R11** | **P2** | Inline styles instead of `PageHeader`; `AUTH_DEV_MODE` English in footer hint. |
| **R12** | **P2** | Busy feedback is `"…"` only — no spinner / `aria-busy` on the grid. |
| **R13** | **P2** | After reset, toast only — no confirmation that lists will reseed on next sign-in. |

---

## 4. `error.tsx` & `not-found.tsx`

**Files:** `apps/web/src/app/error.tsx`, `app/not-found.tsx`

| Surface | States | Quality |
|---|---|---|
| **not-found** | Static branded 404 + home CTA + AppHeader | Good |
| **error** | Title + retry only | Sparse |

### Findings

| ID | Sev | Issue |
|---|---|---|
| **R14** | **P1** | **`error.tsx` has no `id="main"`** — skip link broken. |
| **R15** | **P1** | Error page has **no AppHeader** (unlike 404) — feels like a different product; only `reset()`, no “กลับหน้าแรก”. |
| **R16** | **P2** | Error uses raw inline styles; 404 uses `.not-found` system. |

---

## 5. `BookingThread` messaging

**Files:** `components/BookingThread.tsx`, `app/globals.css`, `styles/components.css`

### States present
Collapsed → open loading → empty / messages → soft-warn (send disabled) → send busy → contact reveal. Errors = toast.

### Findings

| ID | Sev | Issue |
|---|---|---|
| **R17** | **P1** | **Counterparty label is `senderId.slice(0, 8)`** — truncated UUID, not “คลินิก/บุคลากร”. |
| **R18** | **P1** | Soft-warn textarea has warn class but **no `aria-invalid` / `aria-describedby`** to the warning. |
| **R19** | **P2** | Magic spacing / font sizes; textarea lacks `.input` focus treatment. |
| **R20** | **P2** | No polling while open; contact fetch failures swallowed (silent no-phones). |
| **R21** | **P2** | Collapsed state has no unread badge. |

---

## 6. `Dialog` patterns

**Files:** `components/Dialog.tsx` · call sites: clinic cancel, ops confirm, finance refund

### What’s working
Native `<dialog>`, Escape/backdrop cancel, busy blocks dismiss, labelled title.

### Findings

| ID | Sev | Issue |
|---|---|---|
| **R22** | **P2** | No `aria-describedby` for body content. |
| **R23** | **P2** | Finance refund: confirm stays enabled until submit (field error only after click) — acceptable post-S7, still not preventive disable. |
| **R24** | **P2** | Dead legacy `.modal-backdrop` / `.modal` in `globals.css`. |

---

## 7. `StaffLogin` OTP

**Files:** `components/StaffLogin.tsx`

### What’s working
Phone → OTP stages, role gate, session notice, demo shortcut, Thai errors, disabled until valid.

### Findings

| ID | Sev | Issue |
|---|---|---|
| **R25** | **P2** | Code stage does not echo which phone received the OTP. |
| **R26** | **P2** | Double focus strategy (`autoFocus` + effect) can fight AT. |
| **R27** | **P2** | Resend requires going back to phone stage (copy is honest; UX is a bit long). |

---

## 8. `RolePicker` cards

**Files:** `components/RolePicker.tsx`, `lib/demo-accounts.ts`

| ID | Sev | Issue |
|---|---|---|
| **R10** | **P1** | English ops/finance sublabels (same as §3). |
| **R28** | **P2** | No `aria-busy` on active card; loading is ellipsis. |
| **R29** | **P2** | Five cards; finance proposer vs approver distinction is easy to miss. |
| **R30** | **P2** | Unused `.signin-card__emoji` CSS leftover. |

---

## 9. CheckoutSummary · StatusTimeline · ProfilePanel

| Component | Findings |
|---|---|
| **CheckoutSummary** | **P2:** Flow harness bypasses it. Solid elsewhere. |
| **StatusTimeline** | **P2:** No `aria-current="step"` on current item. Unused `TimelineNote` helper. |
| **ProfilePanel** | **P1 (R31):** `selfDeclared.profession` shown raw (e.g. `physician`) in Thai UI. **P2:** Inline styles; ★ glyph. |

---

## 10. AppHeader · drawer · theme

**Files:** `AppHeader.tsx`, `ThemeToggle.tsx`, `layout.tsx`

| ID | Sev | Issue |
|---|---|---|
| **R32** | **P2** | Session role only re-read when `current` changes — sign-out without remount can leave stale clinic/pro nav. |
| **R33** | **P2** | `/flow` + `/journey` in public nav elevates harnesses. |
| **R34** | **P2** | Theme toggle disabled flash pre-hydrate; `themeColor` meta follows OS, not `data-theme`. |
| **R35** | **P2** | Drawer foot repeats `th.home.phase` — redundant. |

---

## 11. Landing secondary sections

**Files:** `app/page.tsx`, `globals.css`, `pages.css`, `strings.ts`

| ID | Sev | Issue |
|---|---|---|
| **R36** | **P1** | **Audience grid mixes one real link (`/journey`) with three non-interactive `.home-surface` blocks** that look like peers — dead ends. Subtitle implies choosing a next step. |
| **R37** | **P2** | Unused leftovers: `th.home.contactNote`, `ctaPrimary` / `ctaSecondary`, `.contact-note`, `.cta-card`, `.hero__actions`. |
| **R38** | **P2** | Footer hardcodes brand/phase instead of `th.brand` / `th.home.phase`. |
| **R39** | **P2** | How-it-works step embeds English “Payment Protected” in Thai sentence. |

---

## 12. Dark theme

| ID | Sev | Issue |
|---|---|---|
| **R40** | **P2** | `.table-scroll` edge fades use hardcoded light slate rgba — weak in dark. |
| **R41** | **P2** | Primary button hover shadow uses light-theme teal/slate rgba. |
| **R42** | **P2** | Dialog/nav backdrops not theme-aware (acceptable). |

Primary-on-dark text was already patched (explicit `#042f2e`) — no P0 contrast failure proven from tokens alone.

---

## 13. Toast · skip link · focus

| ID | Sev | Issue |
|---|---|---|
| **R9/R14** | **P1** | Skip link broken on `/signin` and `error.tsx`. |
| **R43** | **P2** | Toast errors and successes render in **two stacks** (not chronological). |
| **R44** | **P2** | Toast timers not cleared on unmount. |
| **R45** | **P2** | Thread textarea relies only on generic `:focus-visible`, not `.input:focus`. |

---

## Recommended fix order

| Priority | IDs | Effort |
|---|---|---|
| 1 | R9, R14 — add `id="main"` | Trivial |
| 2 | R15 — error page: header + home link + shared layout class | Small |
| 3 | R10 — Thai RolePicker / demo-account sublabels | Small |
| 4 | R1 — journey perspective: drive from step, or make read-only / `aria-pressed` synced | Small–Medium |
| 5 | R36 — audience tiles: link to `/signin` roles or stop looking interactive | Small |
| 6 | R17, R18 — thread sender labels + soft-warn a11y | Small |
| 7 | R31 — profession label map (Thai) | Small |
| 8 | R6 / R33 — demote or relabel `/flow` in nav/footer | Small |
| 9 | R2–R5, R11–R13, R19–R30, R32–R45 — polish / cleanup | Small each |

---

## Appendix — file index

```
apps/web/src/app/{journey,flow,signin}/page.tsx
apps/web/src/app/{error,not-found,page,layout}.tsx
apps/web/src/components/{BookingThread,Dialog,StaffLogin,RolePicker,
  CheckoutSummary,StatusTimeline,ProfilePanel,AppHeader,ThemeToggle,Toast}.tsx
apps/web/src/lib/{demo-accounts,strings}.ts
apps/web/src/styles/{tokens,base,components,pages}.css
apps/web/src/app/globals.css
```
